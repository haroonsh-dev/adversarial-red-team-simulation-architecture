# Original User Request

## 2026-09-06T07:50:46Z

This is a single self-contained fix; keep it small and focused.

Refactor and redesign the ARTSA Command Center (/command-center) into a professional, fluid-scrolling SOC Strategic Floor that eliminates visual cramping, introduces a live Executive Mission Posture bar with active containment tracking, surfaces dominant attack techniques, and preserves strategic alignment with ADR-005.

Working directory: /Users/haroonshahid/Adervisal Red Team simulation architecture/frontend
Integrity mode: development

## Requirements

### R1. Responsive Fluid-Scrolling Floor Architecture
Replace the rigid 100dvh overflow-hidden lock in AppShell.tsx and atmosphere.tsx (FloorShell) with a responsive, fluid-scrolling canvas. Ensure standard laptop viewports (800–900px height) and widescreen displays allow natural vertical scrolling without panel truncation, while keeping background cyber-grid and radar-sweep styling intact.

### R2. Executive Mission Posture & Containment Surface
Wire deriveMissionPosture(events) in the Command Center header into an operational posture badge (NOMINAL / ELEVATED / CRITICAL) with dynamic directive headlines. Add an Active Containment counter indicating quarantined and terminated agent sessions.

### R3. Four-Card Strategic KPI Strip
Expand the top KPI metrics into four balanced, responsive cards with sparklines:
1. Adaptive Lift (+X pp ARTSA vs 62% static baseline)
2. Active Containment (X sessions quarantined / terminated)
3. Hop Latency & SLO (X ms vs 50ms budget with SLO burn)
4. Judge ≠ Defender Disagreement (X% divergence & Defender misses)

### R4. Threat Vectors & Dominant Techniques Distribution
Render the calculated model.techniques as an active threat vector distribution card (e.g. Tool Exfiltration, Prompt Injection, Privilege Pivot) directly under the thesis chart.

### R5. Contextual SOC Deep-Linking in Inspector
Enhance Inspector.tsx and model.ts (inspectorFor) to provide deep-linked URLs with pre-filtered query parameters:
- Agent Hop: /red-team/monitor?agent=${agent} and /logs?agent=${agent}
- ASI Category: /red-team/monitor?asi=${code}
- Campaign: /red-team/monitor/${campaignId} and /replay?campaign=${campaignId}
- Strategic Monitors: /admin/alerts

## Acceptance Criteria

### Layout & Responsiveness
- [ ] /command-center page scrolls vertically on standard viewports (laptop height <= 900px) with no cut-off cards.
- [ ] Ambient canvas, cyber grid, and sweep animations remain visually stable during scroll.

### Operational Features
- [ ] Header renders Mission Posture pill with live state (NOMINAL, ELEVATED, or CRITICAL).
- [ ] Active Containment KPI card displays real session containment status.
- [ ] Dominant Threat Vectors component renders attack technique percentages from model.techniques.
- [ ] Inspector links pass contextual query parameters to /red-team/monitor and other desks.

### Build & Verification
- [ ] npx tsc --noEmit completes with zero errors in frontend/.
- [ ] Vitest test suite passes with zero regressions (npm run test).
