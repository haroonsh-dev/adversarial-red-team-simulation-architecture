"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { CampaignListItem } from "@/lib/hooks/useCampaigns";
import type { SixAgentName } from "@/lib/commandCenterOps";
import {
  DEFAULT_DETECTION_SERIES,
  DEFAULT_KPIS,
  LIVE_ROUNDS,
  LIVE_ROUND_MS,
  getSecurityEventForRound,
  logWindow,
  nextRoundIndex,
  type AsiBar,
  type AttackTimelineStep,
  type DetectionHistoryPoint,
  type PromptSpan,
} from "./prototype/liveRounds";
import { CommandCenterDetectionChart } from "./CommandCenterDetectionChart";
import { CommandCenterPromptAnalysis } from "./CommandCenterPromptAnalysis";
import { CommandCenterOpsSplit } from "./CommandCenterOpsSplit";
import { CommandCenterCampaignContext } from "./context/CommandCenterCampaignContext";
import { CommandCenterSecurityPosture } from "./posture/CommandCenterSecurityPosture";
import { CommandCenterInteractionMap } from "./interaction/CommandCenterInteractionMap";
import { CommandCenterAttackTimeline } from "./timeline/CommandCenterAttackTimeline";
import {
  CommandCenterInspectorDrawer,
  type InspectorSelection,
} from "./inspector/CommandCenterInspectorDrawer";
import {
  CommandCenterConfirmationModal,
  type OperatorActionType,
} from "./controls/CommandCenterConfirmationModal";
import { AlertOctagon, Ban } from "lucide-react";
import { CommandCenterOperatorToolbar } from "./controls/CommandCenterOperatorToolbar";
import { CommandCenterAsiModal } from "./taxonomy/CommandCenterAsiModal";
import { CommandCenterVerdictsDeck } from "./verdicts/CommandCenterVerdictsDeck";

export function CommandCenterFloor({
  events,
  campaigns,
  apiOnline,
  wsConnected,
}: {
  events: Array<Record<string, unknown>>;
  campaigns: CampaignListItem[];
  apiOnline: boolean;
  wsConnected: boolean;
}) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Inspector & Modal dialog states
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection | null>(null);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmActionType, setConfirmActionType] = useState<OperatorActionType>(null);
  const [confirmTargetName, setConfirmTargetName] = useState<string>("Target Agent");

  const [asiModalOpen, setAsiModalOpen] = useState(false);
  const [lastOperatorAction, setLastOperatorAction] = useState<string | null>(null);

  // Automatic round progression ("the whole page moves together each round")
  useEffect(() => {
    if (isPaused) return;
    const id = window.setInterval(() => {
      setRoundIdx((prev) => nextRoundIndex(prev, LIVE_ROUNDS.length));
    }, LIVE_ROUND_MS);
    return () => window.clearInterval(id);
  }, [isPaused]);

  // Operator Action Handlers
  const handleRequestOperatorAction = useCallback(
    (actionType: OperatorActionType, targetName?: string) => {
      setConfirmActionType(actionType);
      setConfirmTargetName(targetName || "Target Agent");
      setConfirmModalOpen(true);
    },
    []
  );

  const handleConfirmAction = useCallback(
    (actionType: string, targetName: string) => {
      if (actionType === "KILL_SESSION") {
        setIsPaused(true);
        setLastOperatorAction(`Session terminated by operator. Live channels severed.`);
      } else if (actionType === "QUARANTINE_AGENT") {
        setLastOperatorAction(`${targetName} quarantined. Tool permissions revoked.`);
      } else if (actionType === "BLOCK_TOOL") {
        setLastOperatorAction(`Tool "${targetName}" blocked across active agents.`);
      } else if (actionType === "DEPLOY_MITIGATION") {
        setLastOperatorAction(`Mitigation patch deployed to runtime enforcement layer.`);
      }
    },
    []
  );

  // Keyboard shortcuts (Capability 12: Space to pause/resume, ArrowRight to step, Escape to close drawer/modal)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Escape") {
        if (confirmModalOpen) {
          setConfirmModalOpen(false);
          e.preventDefault();
        } else if (asiModalOpen) {
          setAsiModalOpen(false);
          e.preventDefault();
        } else if (inspectorOpen) {
          setInspectorOpen(false);
          e.preventDefault();
        }
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setRoundIdx((prev) => nextRoundIndex(prev, LIVE_ROUNDS.length));
      } else if ((e.key === "K" || e.key === "k") && e.shiftKey) {
        e.preventDefault();
        handleRequestOperatorAction("KILL_SESSION");
      } else if ((e.key === "Q" || e.key === "q") && e.shiftKey) {
        e.preventDefault();
        handleRequestOperatorAction("QUARANTINE_AGENT", "Target Agent");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmModalOpen, asiModalOpen, inspectorOpen, handleRequestOperatorAction]);

  const currentRound = LIVE_ROUNDS[roundIdx] ?? LIVE_ROUNDS[0]!;
  const logLines = useMemo(() => logWindow(LIVE_ROUNDS, roundIdx, 5), [roundIdx]);
  const circuitBreakerOpen = useMemo(
    () => events.some((event) => {
      const categories = event.categories;
      return Array.isArray(categories) && categories.some((category) => String(category).startsWith("ASI08"));
    }),
    [events]
  );

  // Derived or default KPIs matching screenshots
  const kpiData = useMemo(() => {
    if (currentRound.kpis) return currentRound.kpis;
    const liveAlerts = events.filter((e) => {
      const risk = Number(e.risk_score ?? 0);
      return risk >= 50 || /QUARANTINE|BREACH|BLOCK|KILL|DENY/i.test(String(e.verdict ?? ""));
    }).length;

    return {
      trustChain: DEFAULT_KPIS.trustChain,
      detectionRate: DEFAULT_KPIS.detectionRate,
      disagreementRate: DEFAULT_KPIS.disagreementRate,
      openAlerts: liveAlerts > 0 ? liveAlerts : DEFAULT_KPIS.openAlerts,
    };
  }, [currentRound, events]);

  // Chart series: static baseline + adaptive curve with points matching screenshot
  const chartSeries: DetectionHistoryPoint[] = useMemo(() => {
    return DEFAULT_DETECTION_SERIES;
  }, []);

  // Inspector opener helpers
  const inspectAgent = useCallback((agent: SixAgentName) => {
    const sec = getSecurityEventForRound(currentRound, roundIdx);
    const state = currentRound.agents[agent] ?? "idle";
    const isUnderAttack = state === "active" || state === "responding";

    setInspectorSelection({
      kind: "agent",
      title: `${agent === "Red Team" ? "Red Team" : agent} Telemetry`,
      threatCode: sec.threatCode,
      severity: isUnderAttack ? "critical" : state === "contained" ? "warning" : "info",
      sourceAgent: agent,
      targetAgent: currentRound.to,
      evidence: currentRound.prompt,
      detectionSignal: sec.detectionSignal,
      action: state === "contained" ? "CONTAINED" : isUnderAttack ? "PROBING" : "NOMINAL",
      confidence: sec.confidence,
      round: currentRound.round,
      timestamp: sec.timestamp,
      eventId: sec.eventId,
      traceId: sec.traceId,
      fields: [
        { label: "Agent Status", value: state },
        { label: "Hop Latency", value: `${currentRound.latencies?.[agent] ?? 27}ms` },
        {
          label: "Role",
          value:
            agent === "Red Team"
              ? "Adversarial Generator"
              : agent === "Target"
                ? "Evaluated Stack"
                : agent === "Defender"
                  ? "Containment Policy"
                  : agent === "Judge"
                    ? "Breach Scorer"
                    : "Pipeline Hop",
        },
      ],
    });
    setInspectorOpen(true);
  }, [currentRound, roundIdx]);

  const inspectThreat = useCallback((bar: AsiBar) => {
    const sec = getSecurityEventForRound(currentRound, roundIdx);
    const isAlert = bar.tone === "alert" || bar.pct >= 75;

    setInspectorSelection({
      kind: "threat",
      title: `${bar.code} · ${bar.label.toUpperCase()}`,
      threatCode: bar.code,
      severity: isAlert ? "critical" : "warning",
      sourceAgent: currentRound.from,
      targetAgent: currentRound.to,
      evidence: currentRound.prompt,
      detectionSignal: sec.detectionSignal,
      action: sec.verdict,
      confidence: bar.pct,
      round: currentRound.round,
      timestamp: sec.timestamp,
      eventId: sec.eventId,
      traceId: sec.traceId,
      fields: [
        { label: "Severity Score", value: `${bar.pct}%` },
        { label: "Threat Tag", value: bar.code },
        { label: "Trigger State", value: bar.tone },
      ],
    });
    setInspectorOpen(true);
  }, [currentRound, roundIdx]);

  const inspectHighlight = useCallback((span: PromptSpan) => {
    const sec = getSecurityEventForRound(currentRound, roundIdx);
    const isInject = span.tone === "inject";

    setInspectorSelection({
      kind: "highlight",
      title: `Payload Token: "${span.text}"`,
      threatCode: isInject ? "ASI01" : "ASI02",
      severity: isInject ? "critical" : "warning",
      sourceAgent: currentRound.from,
      targetAgent: currentRound.to,
      evidence: currentRound.prompt,
      detectionSignal: isInject
        ? "Direct Prompt Injection Pattern (Jailbreak Signature)"
        : "Tool Schema Parameter Inspection",
      action: sec.verdict,
      confidence: sec.confidence,
      round: currentRound.round,
      timestamp: sec.timestamp,
      eventId: sec.eventId,
      traceId: sec.traceId,
    });
    setInspectorOpen(true);
  }, [currentRound, roundIdx]);

  const inspectStatusBadge = useCallback(() => {
    const sec = getSecurityEventForRound(currentRound, roundIdx);
    setInspectorSelection({
      kind: "threat",
      title: currentRound.statusBadge ?? `Round ${currentRound.round} Telemetry Status`,
      threatCode: currentRound.bars[0]?.code ?? "HMAC",
      severity: currentRound.badgeTone === "error" ? "critical" : "info",
      sourceAgent: currentRound.from,
      targetAgent: currentRound.to,
      evidence: currentRound.prompt,
      detectionSignal: sec.detectionSignal,
      action: sec.verdict,
      confidence: sec.confidence,
      round: currentRound.round,
      timestamp: sec.timestamp,
      eventId: sec.eventId,
      traceId: sec.traceId,
    });
    setInspectorOpen(true);
  }, [currentRound, roundIdx]);

  const inspectLogLine = useCallback((line: string) => {
    const sec = getSecurityEventForRound(currentRound, roundIdx);
    setInspectorSelection({
      kind: "log",
      title: "Mission Log Event",
      evidence: line,
      round: currentRound.round,
      timestamp: sec.timestamp,
      eventId: sec.eventId,
      traceId: sec.traceId,
      action: "AUDITED",
      detectionSignal: "Event Stream Ingest",
      severity: line.includes("FAIL") || line.includes("breach") ? "critical" : "info",
    });
    setInspectorOpen(true);
  }, [currentRound, roundIdx]);

  const inspectTimelineStep = useCallback((step: AttackTimelineStep) => {
    setInspectorSelection({
      kind: "step",
      title: `${step.label} · ${step.whatHappened}`,
      threatCode: step.threatCode,
      severity:
        step.status === "blocked" || step.status === "breach"
          ? "critical"
          : step.status === "suspicious"
            ? "warning"
            : "info",
      sourceAgent: step.agentFrom,
      targetAgent: step.agentTo,
      evidence: currentRound.prompt,
      detectionSignal: step.whatDetectedIt,
      action: step.actionTaken,
      round: step.round,
      timestamp: step.when,
      eventId: step.eventId,
      traceId: step.traceId,
    });
    setInspectorOpen(true);
  }, [currentRound]);

  const inspectAsiCode = useCallback((code: string) => {
    setInspectorSelection({
      kind: "asi",
      title: `OWASP ${code} Classification`,
      threatCode: code,
      severity:
        code === "ASI01" || code === "ASI02" || code === "ASI06"
          ? "critical"
          : "warning",
      detectionSignal: "OWASP Agentic Security Matrix",
      action: "CLASSIFIED",
      round: currentRound.round,
      timestamp: new Date().toISOString(),
      eventId: `asi_${code.toLowerCase()}`,
      traceId: `trace_asi_${code.toLowerCase()}`,
    });
    setInspectorOpen(true);
  }, [currentRound]);


  return (
    <main
      id="main-content"
      className="min-h-screen w-full bg-background text-foreground flex flex-col items-center select-none transition-colors"
    >
      {/* Sticky Tactical HUD Container (P1 & P3) */}
      <header className="sticky top-0 z-30 w-full bg-background/95 backdrop-blur-md border-b border-border/80 shadow-xs">
        <div className="w-full max-w-[1520px] mx-auto px-4 sm:px-6 py-3 space-y-3">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">Command Center</h1>
          {circuitBreakerOpen ? (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
              Circuit breaker open — cascading failures contained.
            </p>
          ) : null}
          {/* Top Operational Identity + Global Emergency Containment Rail (P4) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CommandCenterCampaignContext
              campaignName={campaigns[0]?.name || "ARTSA-REDTEAM-042"}
              sessionId="RUN-00182"
              targetName="Enterprise Agent Stack"
              roundNumber={currentRound.round}
              apiOnline={apiOnline}
              wsConnected={wsConnected}
              isPaused={isPaused}
              className="border-b-0 pb-0 flex-1 min-w-[280px]"
            />

            {/* Global Emergency Containment Rail */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRequestOperatorAction("QUARANTINE_AGENT", "Target Agent")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/60 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 transition-colors shadow-xs cursor-pointer"
                title="Quarantine Target Agent (Shift + Q)"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>QUARANTINE</span>
                <kbd className="hidden sm:inline rounded bg-rose-500/20 px-1 py-0.2 text-[9px] font-mono">⇧Q</kbd>
              </button>

              <button
                type="button"
                onClick={() => handleRequestOperatorAction("KILL_SESSION")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-600/80 bg-red-600/20 hover:bg-red-600/30 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-red-500 dark:text-red-400 transition-colors shadow-xs cursor-pointer"
                title="Emergency Kill Session (Shift + K)"
              >
                <AlertOctagon className="h-3.5 w-3.5" />
                <span>KILL SESSION</span>
                <kbd className="hidden sm:inline rounded bg-red-600/20 px-1 py-0.2 text-[9px] font-mono">⇧K</kbd>
              </button>
            </div>
          </div>

          {/* Unified Threat Posture & Readiness HUD (P2 & P3) */}
          <section aria-label="Security Posture and Executive Defense HUD">
            <CommandCenterSecurityPosture
              round={currentRound}
              kpiData={kpiData}
              onOpenAsiTaxonomy={() => setAsiModalOpen(true)}
            />
          </section>
        </div>
      </header>

      {/* Main Two-Column Tactical Cockpit Layout */}
      <div className="w-full max-w-[1520px] px-4 sm:px-6 py-6 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left / Primary Threat Theater (~60% width -> lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Capability 3: Tactical Agent Interaction Map with Security Zones (P5) */}
            <section aria-label="Agent Interaction Visualization">
              <CommandCenterInteractionMap
                round={currentRound}
                onSelectAgent={inspectAgent}
                onSelectEdge={(from, to) => {
                  const sec = getSecurityEventForRound(currentRound, roundIdx);
                  setInspectorSelection({
                    kind: "threat",
                    title: `Agent Transmission: ${from} → ${to}`,
                    sourceAgent: from,
                    targetAgent: to,
                    evidence: currentRound.prompt,
                    detectionSignal: sec.detectionSignal,
                    action: sec.verdict,
                    confidence: sec.confidence,
                    round: currentRound.round,
                    timestamp: sec.timestamp,
                    eventId: sec.eventId,
                    traceId: sec.traceId,
                  });
                  setInspectorOpen(true);
                }}
              />
            </section>

            {/* Live Prompt Analysis Card with in-situ containment trigger (P4) */}
            <section aria-label="Live Prompt Analysis">
              <CommandCenterPromptAnalysis
                round={currentRound}
                onSelectThreat={inspectThreat}
                onSelectHighlight={inspectHighlight}
                onSelectBadge={inspectStatusBadge}
                onQuarantineTarget={(target) => handleRequestOperatorAction("QUARANTINE_AGENT", target)}
              />
            </section>

            {/* Capability 4: Attack and Containment Timeline with Synchronization (P7) */}
            <section aria-label="Attack and Event Timeline">
              <CommandCenterAttackTimeline
                currentRoundIdx={roundIdx}
                onSelectStep={(step, idx) => {
                  setRoundIdx(idx);
                  inspectTimelineStep(step);
                }}
              />
            </section>
          </div>

          {/* Right / Secondary Intelligence & Telemetry Rail (~40% width -> lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Permanent Detection Rate Chart with Synchronized ReferenceLine (P7) */}
            <section aria-label="Detection Rate Over Time">
              <CommandCenterDetectionChart
                series={chartSeries}
                activeRound={currentRound.round}
                onSelectRound={(idx) => setRoundIdx(Math.max(0, Math.min(LIVE_ROUNDS.length - 1, idx)))}
              />
            </section>

            {/* Operational Deck (Agent Monitors & Mission Log) */}
            <section aria-label="Agent Monitors and Mission Log">
              <CommandCenterOpsSplit
                round={currentRound}
                logLines={logLines}
                onSelectAgent={inspectAgent}
                onSelectLogLine={inspectLogLine}
              />
            </section>

            {/* Capability: Evaluation & Runtime Arbitration Stream (Balances Right Telemetry Rail) */}
            <section aria-label="Evaluation and Runtime Verdicts">
              <CommandCenterVerdictsDeck
                round={currentRound}
                roundIdx={roundIdx}
                onSelectVerdict={(verdict) => {
                  const sec = getSecurityEventForRound(currentRound, roundIdx);
                  setInspectorSelection({
                    kind: "agent",
                    title: `${verdict.agent} Arbitration Verdict · ${verdict.tone.toUpperCase()}`,
                    threatCode: sec.threatCode,
                    severity: verdict.tone === "warn" ? "critical" : verdict.tone === "ok" ? "info" : "warning",
                    sourceAgent: currentRound.from,
                    targetAgent: verdict.agent,
                    evidence: currentRound.prompt,
                    detectionSignal: sec.detectionSignal,
                    action: verdict.detail,
                    confidence: sec.confidence,
                    round: currentRound.round,
                    timestamp: sec.timestamp,
                    eventId: sec.eventId,
                    traceId: sec.traceId,
                    fields: [
                      { label: "Arbitration Agent", value: verdict.agent },
                      { label: "Verdict State", value: verdict.tone },
                      { label: "Policy Action", value: verdict.detail },
                    ],
                  });
                  setInspectorOpen(true);
                }}
              />
            </section>

            {/* Secondary Operator Interventions Deck */}
            <section aria-label="Operator Interventions">
              <CommandCenterOperatorToolbar
                onRequestAction={handleRequestOperatorAction}
                onReplayCurrentRound={() => {
                  setRoundIdx(0);
                  setLastOperatorAction("Simulation reset to round 1 for replay.");
                }}
                lastOperatorAction={lastOperatorAction}
              />
            </section>
          </div>
        </div>

        {/* Bottom subtle playback toolbar */}
        <footer className="mt-8 flex items-center justify-between border-t border-border pt-4 text-[11px] font-mono text-muted-foreground">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                apiOnline && wsConnected ? "bg-emerald-400" : "bg-sky-400"
              }`}
            />
            <span>
              {apiOnline && wsConnected ? "TELEMETRY CONNECTED" : "LIVE SIMULATION RUNNING"}
            </span>
            <span className="text-slate-600">·</span>
            <span>ROUND {currentRound.round} ({roundIdx + 1}/{LIVE_ROUNDS.length})</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="hover:text-white transition-colors cursor-pointer"
              title={isPaused ? "Resume simulation" : "Pause simulation"}
            >
              {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
            </button>
            <button
              type="button"
              onClick={() => setRoundIdx((prev) => nextRoundIndex(prev, LIVE_ROUNDS.length))}
              className="hover:text-white transition-colors cursor-pointer"
              title="Advance to next round immediately"
            >
              NEXT ROUND →
            </button>
          </div>
        </footer>
      </div>

      {/* Capability 5: Threat Inspector Drawer (Section 14) */}
      <CommandCenterInspectorDrawer
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        selection={inspectorSelection}
        onQuarantineAgent={(agent) => {
          setInspectorOpen(false);
          handleRequestOperatorAction("QUARANTINE_AGENT", agent);
        }}
        onBlockTool={(tool) => {
          setInspectorOpen(false);
          handleRequestOperatorAction("BLOCK_TOOL", tool);
        }}
        onReplayRound={(r) => {
          setInspectorOpen(false);
          setRoundIdx(Math.max(0, Math.min(LIVE_ROUNDS.length - 1, r - 1)));
          setLastOperatorAction(`Replaying Round ${r} in isolation.`);
        }}
      />

      {/* Capability 10: Confirmation Modal for Destructive Interventions (Section 18) */}
      <CommandCenterConfirmationModal
        isOpen={confirmModalOpen}
        actionType={confirmActionType}
        targetName={confirmTargetName}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmAction}
      />

      {/* Capability 6: OWASP ASI01–ASI10 Taxonomy Classification Modal (Section 8) */}
      <CommandCenterAsiModal
        isOpen={asiModalOpen}
        onClose={() => setAsiModalOpen(false)}
        onSelectAsi={inspectAsiCode}
      />
    </main>
  );
}
