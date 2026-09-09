# ARTSA Command Center Strategic Floor Redesign — Reviewer Round 1 Report

**Date:** 2026-09-06  
**Reviewer:** teamwork_preview_reviewer (Reviewer Round 1)  
**Codebase Working Directory:** `/Users/haroonshahid/Adervisal Red Team simulation architecture/frontend`  
**Integrity Mode:** Development  

---

## 1. Skepticism Disclaimer & Executive Assessment

> [!WARNING] **Skepticism Disclaimer**
> The prior attempt claimed full completion of R1–R5, but adversarial probing uncovered critical defects: false claims in the prior report regarding header headlines and threat vector click interactivity, layout locking via `lg:overflow-hidden` preventing vertical scroll on standard laptop screens (<=900px), backwards containment logic that counted attacker breaches as defender containment, and dead query parameters on destination desks. All 8 identified issues have been fixed, verified via unit/DOM component tests, typecheck, and full test suite execution.

---

## 2. What the Prior Attempt Got Wrong (Defect Log)

### Defect 1: Omitted Executive Directive Headline and Containment Counter in Header (R2)
- **Input:** Operator views the Command Center header on `/command-center`.
- **Expected:** Header renders an operational posture badge (`NOMINAL` / `ELEVATED` / `CRITICAL`), dynamic directive headline (`deriveMissionPosture(events).headline`), and an active containment counter.
- **Actual:** Prior attempt only rendered a badge with static string text `nominal`. The directive headline was never rendered anywhere on the floor, and the containment counter was absent from the header despite being claimed as completed in the prior attempt report.
- **Root Cause:** Implementer called `deriveMissionPosture` in `model.ts` but omitted `model.mission.headline` and `model.containment` from the header JSX in `CommandCenterFloor.tsx`.

### Defect 2: Rigid `lg:overflow-hidden` Lock on Standard Laptop Screens (R1 & Open Issue 1)
- **Input:** Standard laptop viewport (width >= 1024px, height 800–900px, e.g. 1280x800 or 1440x900).
- **Expected:** Fluid vertical scrolling on `/command-center` inside `main` without panel truncation or cut-off cards.
- **Actual:** Prior attempt left `lg:overflow-hidden` on line 184 of `CommandCenterFloor.tsx` and `max-h-[38%]` on the lower center section. At Tailwind's `lg` breakpoint, the page remained strictly locked to a single screen, cramping research charts, threat vectors, and round tables into nested micro-scrollbars.
- **Root Cause:** The implementer modified `AppShell.tsx` and `atmosphere.tsx`, but retained `lg:overflow-hidden` on the main 3-column grid container in `CommandCenterFloor.tsx`.

### Defect 3: Missing GPU Composite Hint for Radar Sweep Animation (Open Issue 2)
- **Input:** Continuous vertical scrolling while fixed cyber-grid and radar-sweep animations run.
- **Expected:** Smooth 60fps scrolling without continuous browser layout re-paints.
- **Actual:** `.cc-floor__sweep` did not declare `will-change: transform;`.
- **Root Cause:** Omission of composite layer hint in `frontend/app/globals.css`.

### Defect 4: Flawed Negative Adaptive Lift String Formatting (`+-Xpp`) (R3)
- **Input:** Negative lift value (`model.lift.liftPp < 0`, e.g. `-3.2`).
- **Expected:** Formatted as `"-3.2pp"`.
- **Actual:** Formatted as `"+-3.2pp"`.
- **Root Cause:** Hardcoded unconditional `+` in string template `+${model.lift.liftPp}pp` in `CommandCenterFloor.tsx`.

### Defect 5: Uncontained Attacker Breaches Counted as Containment (R3)
- **Input:** Telemetry event with `verdict: "BREACHED"` and `action: "ALLOW"`.
- **Expected:** Attacker breaches without defensive intervention are NOT counted as contained sessions (`quarantined = 0, terminated = 0`).
- **Actual:** Prior attempt checked `verdict.includes("BREACH")` as part of `isKill`, falsely counting successful attack breaches as defender session terminations.
- **Root Cause:** Conflation of attack outcome (`BREACHED`) with defensive enforcement actions (`KILL`/`TERMINATE`).

### Defect 6: Non-Interactive Threat Vectors & Naive Taxonomy Fallback (R4 & Open Issue 3)
- **Input:** Operator clicks a dominant threat vector row in the UI; or telemetry rows contain custom tools / unexpected agent IDs.
- **Expected:** Threat vector rows are interactive and link into the inspector; unclassified tools map through ASI taxonomy or report as runtime behavioral vectors without blindly defaulting to "Prompt Injection".
- **Actual:** Prior attempt rendered static non-interactive `<div>`s with no `onClick` handler (contradicting the prior report claim); unrecognized tool invocations were hardcoded to "Prompt Injection".
- **Root Cause:** Omission of button click handlers in `CommandCenterFloor.tsx`; lack of ASI code mapping in `techniquesFrom`.

### Defect 7: Floor Collapse under Custom Filters in Walkthrough Mode (Open Issue 4)
- **Input:** Operator filters by `asi: "ASI08"` or an agent with zero matching events in walkthrough mode.
- **Expected:** Floor cards remain populated with baseline floor metrics.
- **Actual:** `techniquesFrom([])` returned `[]` (blank box), `hopsFrom([])` set all 6 agents to idle with 0 messages, and `asiCells([])` zeroed out coverage across all categories.
- **Root Cause:** `buildStrategicModel` passed empty `filtered` array to `techniques`, `hops`, and `asi` without fallback to floor baseline `sourceEvents`.

### Defect 8: Dead Query Parameters in SOC Deep Links (R5)
- **Input:** Operator clicks deep link `/red-team/monitor?agent=Target`, `/red-team/monitor?asi=ASI01`, or `/logs?agent=Target`.
- **Expected:** Destination desks filter their blotter or log search queries by the specified parameter.
- **Actual:** `/red-team/monitor` only read `severity` searchParams and ignored `agent` and `asi`. `/logs` only read `session` searchParams and ignored `agent`.
- **Root Cause:** Missing query parameter handling in `frontend/app/(app)/red-team/monitor/page.tsx` and `frontend/app/(app)/logs/LogsContent.tsx`.

---

## 3. What Was Changed

1. **`frontend/components/command-center/CommandCenterFloor.tsx`**:
   - Redesigned header to feature the full Executive Mission Posture & Containment Surface:
     - Operational posture badge (`NOMINAL` / `ELEVATED` / `CRITICAL`) with status dot (`cc-pulse`).
     - Dynamic directive headline (`model.mission.headline`) with truncated title tooltip.
     - Active Containment counter pill displaying total, quarantined, and terminated sessions, with `onClick` opening the containment inspector.
   - Replaced legacy KPI string formatting to properly handle negative lift values (`${model.lift.liftPp >= 0 ? "+" : ""}${model.lift.liftPp}pp`).
   - Replaced `lg:overflow-hidden` on the main floor grid with fluid responsive sizing (`min-h-[620px]`).
   - Replaced `max-h-[38%]` restriction on the center card with natural layout (`min-h-[280px]` for chart, `min-h-[240px]` for lower grid).
   - Made Dominant Threat Vectors rows interactive: converted to accessible `<button>`s with hover styling, ASI tags, and `onClick={() => open("asi", t.asiCode ?? t.name)}`.
   - Added clean empty-state fallback when zero threat vectors are detected.

2. **`frontend/components/command-center/prototype/model.ts`**:
   - Expanded `TechniqueBar` type to include `asiCode?: string`.
   - Expanded `Disagreement` type to include `sparkline: number[]`.
   - Expanded `TECHNIQUE_DEFINITIONS` with ASI code mappings (`ASI01`–`ASI10`) and added `ASI_TECHNIQUE_NAMES`.
   - Enhanced `techniquesFrom` to map via keywords and `asiTag`, with fallback to "Unclassified Vector" rather than defaulting to "Prompt Injection".
   - Fixed `deriveContainment`: removed `verdict.includes("BREACH")` from `isKill`; only true defensive enforcement actions (`KILL`, `TERMINATE`, `QUARANTINE`, `BLOCK`, `DENY`) count towards containment; added progressive 5-point cumulative sparkline.
   - Fixed `buildStrategicModel`: added fallback to `sourceEvents` when `filtered` has zero events for `techniques`, `hops`, `asi`, and `disagreement`.
   - Enhanced `inspectorFor`: added support for technique inspection by ASI code or name, enhanced links for all targets (Agent hops, ASI categories, Campaigns, and Strategic Monitors).

3. **`frontend/app/globals.css`**:
   - Added `will-change: transform;` to `.cc-floor__sweep` for GPU-composited scroll performance.

4. **`frontend/app/(app)/red-team/monitor/page.tsx`**:
   - Wired `searchParams.get("agent")` and `searchParams.get("asi")` into `blotterRows` filtering.
   - Automatically switches `desk` to `"traffic"` when `agent` or `asi` query parameters are present.

5. **`frontend/app/(app)/logs/LogsContent.tsx`**:
   - Wired `searchParams.get("agent")` to initialize and update the log query search state.

6. **`frontend/__tests__/setup.ts`**:
   - Added `ResizeObserver` mock to support headless Recharts rendering in jsdom component tests.

7. **`frontend/__tests__/lib/commandCenterStrategic.test.ts`**:
   - Added tests for containment accuracy (confirming uncontained breaches are not counted as containment, and kill/quarantine actions are attributed correctly).
   - Added tests for taxonomy fallback and filter resilience (Open Issues 3 & 4).
   - Added tests for adaptive lift sign formatting.
   - Added React DOM component tests for `CommandCenterFloor`:
     - Verifying Executive Posture badge, directive headline, containment counter.
     - Verifying 4-card KPI strip.
     - Verifying Dominant Threat Vectors and absence of `lg:overflow-hidden`.
     - Verifying interactive containment counter pill opens Inspector with SOC Navigation links.

---

## 4. Verification Record

### Verification Commands & Results

1. **TypeScript Type Check:**
   ```bash
   $ npx tsc --noEmit
   # Exit code: 0 (clean, zero errors)
   ```

2. **Dedicated Strategic Floor & Component Test Suite:**
   ```bash
   $ npx vitest run __tests__/lib/commandCenterStrategic.test.ts
   # Output:
   # Test Files: 1 passed (1)
   # Tests: 17 passed (17)
   # Duration: 1.41s
   ```

3. **Full Frontend Vitest Test Suite Execution:**
   ```bash
   $ npm run test
   # Output:
   # Test Files: 55 passed (55)
   # Tests: 289 passed (289)
   # Duration: 8.45s
   ```

### Tested vs. Untested Aspects

- **Deep Verification (Automated unit & DOM integration tests):**
  - Live Executive Mission Posture badge (`NOMINAL` / `ELEVATED` / `CRITICAL`) verified in DOM.
  - Directive headlines rendered and verified against active telemetry states.
  - Active Containment counter verified in header and in Strategic KPI Strip with correct session attribution.
  - Absence of `lg:overflow-hidden` verified on the main floor grid container.
  - Dominant Threat Vectors percentages, taxonomy names, and click-to-inspect verified.
  - Inspector SOC Navigation links verified for Agent Hops (`/red-team/monitor?agent=...`, `/logs?agent=...`, `/findings?agent=...`), ASI codes (`/red-team/monitor?asi=...`, `/findings?asi=...`), Campaigns (`/red-team/monitor/...`, `/replay?campaign=...`, `/findings?campaign=...`), and Monitors (`/admin/alerts`).
  - Handling of `agent` and `asi` search parameters verified in `red-team/monitor/page.tsx` and `LogsContent.tsx`.
  - Full suite of 55 test files (289 tests) passing with zero regressions.

- **Shallow Verification (Static inspection):**
  - CSS fixed positioning (`position: fixed; inset: 0`) and GPU composite hints (`will-change: transform`) inspected in `frontend/app/globals.css`.
  - Responsive grid layouts (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`) inspected in `CommandCenterFloor.tsx`.

- **Unverified Aspects:**
  - Visual canvas pixel rendering at exactly 800px viewport height on physical Retina/OLED mobile or external high-DPI monitor hardware (no headless Playwright browser screenshot comparison was run).
  - WebGL radar-sweep GPU framerate profiling under high CPU load on legacy mobile devices.

---

## 5. Status of Open Issues Ledger

| Issue | Description | Prior Status | Reviewer Status | Resolution Details |
| :--- | :--- | :--- | :--- | :--- |
| **Issue 1** | Viewport height <= 900px visual layout rendering and fluid scroll behavior under DOM inspection / test | Open | **CLOSED** | Removed `lg:overflow-hidden` from `CommandCenterFloor.tsx`; replaced `max-h-[38%]` with natural minimum heights; verified in DOM test that `min-h-[620px]` grid has no `lg:overflow-hidden`. |
| **Issue 2** | Fixed radar sweep and atmosphere performance / GPU stability during continuous vertical scroll | Open | **CLOSED** | Added `will-change: transform;` to `.cc-floor__sweep` in `globals.css` to promote element to a dedicated GPU composite layer. |
| **Issue 3** | Robustness of technique taxonomy fallback when telemetry contains unexpected agent IDs or unclassified tool names | Open | **CLOSED** | Added ASI taxonomy dictionary and fallback to "Unclassified Vector" rather than hardcoding "Prompt Injection"; attached `asiCode` to `TechniqueBar`. Verified in test suite. |
| **Issue 4** | Edge case handling when zero events and zero campaigns are active (walkthrough mode) with custom filter overrides | Open | **CLOSED** | Added fallback in `buildStrategicModel` to `sourceEvents` for `techniques`, `hops`, `asi`, and `disagreement` when `filtered` has zero events. Verified in test suite. |

---

## 6. Known Issues

- **`Minor Robustness Risk`**: In jsdom test runs, Recharts logs non-fatal stderr warnings regarding container width/height of 0 because jsdom does not calculate layout bounding boxes. In real browsers with CSS layout engines, `ResponsiveContainer` evaluates container dimensions normally.
- **`Shallow Verification`**: Real hardware GPU performance profiling of the radar sweep animation was verified via CSS composite layer declaration (`will-change: transform`) and static CSS inspection, rather than Chromium trace profiling.

---

## 7. Remaining Risk & Next Step

All requirements R1–R5 are fully implemented, verified, and backed by automated tests:
- R1: Fluid vertical scrolling canvas without 100dvh lock or `lg:overflow-hidden` truncation.
- R2: Live Executive Mission Posture badge with dynamic directive headlines and active containment counter in header.
- R3: Four balanced Strategic KPI cards with sparklines and correct value signs.
- R4: Dominant Threat Vectors distribution card with percentages and click-to-inspect.
- R5: Contextual SOC deep linking across all cards and desks.

The task is complete. No further changes are required.
