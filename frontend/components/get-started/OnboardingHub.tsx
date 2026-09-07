"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Play,
  Send,
  ScrollText,
  Download,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Clock,
  ListChecks,
  Shield,
  Activity,
  FileCode,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { VerdictSummaryCard } from "@/components/shared/VerdictSummaryCard";
import { LiveTelemetryStream } from "@/components/shared/LiveTelemetryStream";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { LayerScoresPanel, SecurityEventsTable } from "@/components/get-started/ScanDiagnostics";
import { ReadinessPhaseStrip } from "@/components/get-started/ReadinessPhaseStrip";
import { StatCard } from "@/components/shared/StatCard";
import type { ValidationCase, CaseRunDetail, IngestSmokeResult } from "@/lib/getStarted";
import { sandboxHrefForCase } from "@/lib/sandboxPresets";
import type { ReadinessFlowState } from "@/lib/readinessFlow";
import { severityFromScore } from "@/lib/severity";
import type { VerdictSummary } from "@/lib/verdict";
import {
  READINESS_UI,
  CONNECTION_UI,
  guardDecisionLabel,
  guardActionLabel,
  failureLabelPlain,
} from "@/lib/getStartedLabels";
import { cn } from "@/lib/utils";
import { buildIngestCurlSnippet } from "@/lib/ingestSnippet";

const INGEST_SNIPPET = buildIngestCurlSnippet();

function sandboxHref(c: ValidationCase): string {
  return sandboxHrefForCase(c);
}

export function OnboardingHub(props: {
  flow: ReadinessFlowState;
  apiOnline: boolean;
  wsConnected: boolean;
  suitePass: number;
  suiteTotal: number;
  caseDetails: Record<string, CaseRunDetail>;
  cases: ValidationCase[];
  activeCaseId: string;
  onSelectCase: (id: string) => void;
  batchRunning: boolean;
  suiteProgress: { current: number; total: number; label: string } | null;
  scanError: string | null;
  autoRunning: boolean;
  result: CaseRunDetail["result"] | null;
  summary: VerdictSummary | null;
  firedDetector: string | null;
  latencyMs: number | null;
  activeCase: ValidationCase;
  ingestLoading: boolean;
  ingestResult: IngestSmokeResult | null;
  ingestError: string | null;
  liveEvents: Array<Record<string, unknown>>;
  liveLoading?: boolean;
  onRunAll: () => void;
  onIngest: () => void;
  onExport: () => void;
  onExportMarkdown?: () => void;
  onExportPdf?: () => void;
  exportLoading?: boolean;
  canExport: boolean;
}) {
  const {
    flow,
    apiOnline,
    wsConnected,
    suitePass,
    suiteTotal,
    caseDetails,
    cases,
    activeCaseId,
    onSelectCase,
    batchRunning,
    suiteProgress,
    scanError,
    autoRunning,
    result,
    summary,
    firedDetector,
    latencyMs,
    activeCase,
    ingestLoading,
    ingestResult,
    ingestError,
    liveEvents,
    liveLoading,
    onRunAll,
    onIngest,
    onExport,
    onExportMarkdown,
    onExportPdf,
    exportLoading,
    canExport,
  } = props;

  const [engineerOpen, setEngineerOpen] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);

  const testsDone = flow.suiteComplete;
  const testsStarted = Object.keys(caseDetails).length > 0;
  const busy = batchRunning || autoRunning;
  const productionReady = flow.productionReady;
  const readinessPct = flow.score;
  const logsHref = ingestResult
    ? `/logs?session=${encodeURIComponent(ingestResult.sessionId)}`
    : "/logs";

  const attackCases = cases.filter((c) => c.category !== "safe");
  const safeCases = cases.filter((c) => c.category === "safe");

  const attacksCaught = attackCases.filter((c) => caseDetails[c.id]?.passed).length;
  const safeAllowed = safeCases.filter((c) => caseDetails[c.id]?.passed).length;
  const needsTuning = Object.values(caseDetails).filter((d) => !d.passed).length;

  const avgLatency =
    testsStarted
      ? Object.values(caseDetails).reduce((s, d) => s + d.latencyMs, 0) / Object.keys(caseDetails).length
      : 0;

  const missing = flow.blockers;

  const streamEvents = useMemo(() => {
    const base = liveEvents;
    if (!ingestResult) return base;
    const synth = {
      tool_name: "read_file",
      risk_score: ingestResult.risk,
      verdict: ingestResult.verdict,
      session_id: ingestResult.sessionId,
      triggered_at: ingestResult.at,
      event_id: `ingest-${ingestResult.sessionId}`,
    };
    const rest = base.filter(
      (e) => String(e.session_id ?? "") !== ingestResult.sessionId
    );
    return [synth, ...rest];
  }, [liveEvents, ingestResult]);

  const severity = result ? severityFromScore(result.risk_score) : null;
  const activeDetail = caseDetails[activeCaseId];
  const passed = activeDetail?.passed ?? null;

  return (
    <div className="space-y-6">
      <ReadinessPhaseStrip
        phase={flow.phase}
        suiteComplete={flow.suiteComplete}
        ingestDone={flow.ingestDone}
        trafficConfirmed={flow.trafficConfirmed}
        loading={busy}
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Readiness score</h2>
            <p className="mt-1 text-sm text-muted-foreground">{READINESS_UI.gateSubtitle}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{readinessPct}%</span>
              <Badge variant={productionReady ? "success" : "secondary"} className="text-[10px]">
                {productionReady ? READINESS_UI.signedOff : READINESS_UI.notSignedOff}
              </Badge>
            </div>
            <Progress value={readinessPct} className="mt-3 h-2 max-w-sm" />
            {missing.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Still needed: {missing.join(" · ")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <StatCard
              variant="compact"
              label={READINESS_UI.attacksCaught}
              value={`${attacksCaught}/${attackCases.length}`}
            />
            <StatCard
              variant="compact"
              label={READINESS_UI.safeAllowed}
              value={`${safeAllowed}/${safeCases.length}`}
            />
            <StatCard
              variant="compact"
              label={READINESS_UI.needsTuning}
              value={`${needsTuning}/${suiteTotal}`}
              className={needsTuning > 0 ? "border-foreground/15" : undefined}
            />
          </div>
        </div>
        {canExport && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onExport} disabled={exportLoading}>
              <Download className="h-3.5 w-3.5" />
              {READINESS_UI.exportReport}
            </Button>
            {onExportMarkdown && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={onExportMarkdown}
                disabled={exportLoading}
              >
                <Download className="h-3.5 w-3.5" />
                {READINESS_UI.exportReportMarkdown}
              </Button>
            )}
            {onExportPdf && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={onExportPdf} disabled={exportLoading}>
                <Download className="h-3.5 w-3.5" />
                {READINESS_UI.exportReportPdf}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Section 1 — Security tests */}
      <section
        id="phase-validate"
        className="scroll-mt-6 rounded-xl border border-border bg-card shadow-card overflow-hidden"
      >
        <div className="border-b border-border bg-muted/15 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold">{READINESS_UI.step1Title}</h2>
          <p className="text-sm text-muted-foreground">{READINESS_UI.step1Hint}</p>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          {!apiOnline && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{CONNECTION_UI.backendOfflineTitle}</p>
              <p className="mt-1">{CONNECTION_UI.backendOfflineHint}</p>
            </div>
          )}

          {autoRunning && !testsStarted && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/10 px-4 py-3 text-sm">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {READINESS_UI.autoRunning}
            </div>
          )}

          {busy && (
            <div className="rounded-xl border border-border p-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-3 font-medium">{READINESS_UI.runningTests}</p>
              {suiteProgress && (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {suiteProgress.current}/{suiteProgress.total} — {suiteProgress.label}
                  </p>
                  <Progress
                    value={(suiteProgress.current / suiteProgress.total) * 100}
                    className="mt-4 h-2 max-w-md mx-auto"
                  />
                </>
              )}
            </div>
          )}

          {scanError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {scanError}
            </p>
          )}

          {!busy && !testsStarted && !autoRunning && (
            <div className="rounded-xl border border-border bg-muted/10 p-6">
              <h3 className="text-lg font-semibold">Fire drill for your AI guard</h3>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Eight practice attacks and safe requests — see if ARTSA catches the bad ones and stays calm on the good ones.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: ListChecks, label: "8 scenarios", sub: "Attacks + safe" },
                  { icon: Clock, label: "~20 seconds", sub: "Full pack" },
                  { icon: Shield, label: "Local only", sub: "No external AI" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                    <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-sm font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                  </div>
                ))}
              </div>
              <Button size="lg" className="mt-5 gap-2" onClick={onRunAll} disabled={!apiOnline}>
                <Play className="h-4 w-4" />
                {READINESS_UI.runAllTests}
              </Button>
            </div>
          )}

          {testsStarted && !busy && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Passed", value: String(suitePass) },
                  { label: READINESS_UI.needsTuning, value: String(needsTuning) },
                  { label: "Avg speed", value: `${avgLatency.toFixed(0)} ms` },
                  { label: "Total", value: `${Object.keys(caseDetails).length}/${suiteTotal}` },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-border bg-muted/15 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{m.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <ul className="max-h-[340px] space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {cases.map((c) => {
                    const d = caseDetails[c.id];
                    const selected = activeCaseId === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onSelectCase(c.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                            selected ? "bg-muted" : "hover:bg-muted/50"
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              d?.passed ? "bg-foreground" : d ? "bg-muted-foreground" : "bg-border"
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                          {d && (
                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {d.risk.toFixed(0)}
                            </span>
                          )}
                        </button>
                        {d && !d.passed && (
                          <div className="flex flex-wrap gap-1 px-3 pb-2">
                            <Button asChild size="sm" variant="ghost" className="h-7 text-[10px]">
                              <Link href={sandboxHref(c)}>{READINESS_UI.fixInSandbox}</Link>
                            </Button>
                            <Button asChild size="sm" variant="ghost" className="h-7 text-[10px]">
                              <Link href="/admin/policies">{READINESS_UI.tunePolicies}</Link>
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {result && summary && severity && activeDetail ? (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-4">
                    <div className="flex flex-wrap gap-2">
                      <SeverityBadge severity={severity} />
                      <Badge variant={passed ? "success" : "warning"} className="text-[10px]">
                        {passed ? READINESS_UI.pass : failureLabelPlain(activeCase.expectBenign)}
                      </Badge>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs font-medium text-muted-foreground">{activeCase.label}</p>
                      <p className="mt-2 text-sm leading-relaxed">{summary.whatHappened}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{summary.whatWeDid}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { label: READINESS_UI.dangerLevel, value: `${result.risk_score.toFixed(0)}/100` },
                        { label: READINESS_UI.guardDecision, value: guardDecisionLabel(result.verdict) },
                        { label: READINESS_UI.whatWeDid, value: guardActionLabel(result.recommended_action) },
                        {
                          label: READINESS_UI.responseTime,
                          value: latencyMs != null ? `${latencyMs.toFixed(0)} ms` : "—",
                        },
                      ].map((m) => (
                        <div key={m.label} className="rounded-md border border-border bg-card px-2 py-2">
                          <dt className="text-[10px] text-muted-foreground">{m.label}</dt>
                          <dd className="font-medium">{m.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <VerdictSummaryCard summary={summary} detector={firedDetector} />
                    <button
                      type="button"
                      onClick={() => setEngineerOpen((o) => !o)}
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      {engineerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {READINESS_UI.engineerDetails}
                    </button>
                    {engineerOpen && (
                      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
                        <p className="text-muted-foreground">{activeCase.user_input}</p>
                        {result.layer_scores && <LayerScoresPanel scores={result.layer_scores} />}
                        {result.security_events?.length ? (
                          <SecurityEventsTable events={result.security_events} />
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                    Select a test to see details
                  </div>
                )}
              </div>

              <Button size="sm" variant="outline" onClick={onRunAll} disabled={!apiOnline}>
                Rerun all tests
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Section 2 — Wire ingest */}
      <section
        id="phase-ingest"
        className={cn(
          "scroll-mt-6 rounded-xl border border-border bg-card shadow-card overflow-hidden",
          !testsDone && "opacity-60"
        )}
      >
        <div className="border-b border-border bg-muted/15 px-4 py-3 sm:px-6">
          <h2 className="text-base font-semibold">{READINESS_UI.step2Title}</h2>
          <p className="text-sm text-muted-foreground">
            {!testsDone ? "Complete step 1 first — then send one real ingest event." : READINESS_UI.step2Hint}
          </p>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="rounded-xl border border-border p-5">
            <p className="text-sm text-muted-foreground">
              One practice event: an agent tries to read a sensitive file. Same path as production traffic.
            </p>
            <Button
              size="lg"
              className="mt-4 gap-2"
              onClick={onIngest}
              disabled={ingestLoading || !apiOnline || !testsDone}
            >
              {ingestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {READINESS_UI.sendTestEvent}
            </Button>
            {ingestError && (
              <p className="mt-3 text-sm text-destructive">
                {ingestError}
                <Link href="/admin/system" className="underline"> {READINESS_UI.apiKeyHelp}</Link>
              </p>
            )}
          </div>
          {ingestResult && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: READINESS_UI.responseTime, value: `${ingestResult.latencyMs.toFixed(0)} ms` },
                { label: READINESS_UI.dangerLevel, value: `${ingestResult.risk.toFixed(0)}/100` },
                { label: READINESS_UI.guardDecision, value: guardDecisionLabel(ingestResult.verdict) },
                { label: READINESS_UI.whatWeDid, value: guardActionLabel(ingestResult.action) },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-border bg-muted/15 p-3">
                  <dt className="text-[10px] text-muted-foreground">{m.label}</dt>
                  <dd className="mt-1 font-medium">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            onClick={() => setCurlOpen((o) => !o)}
            className="text-xs text-muted-foreground underline"
          >
            {READINESS_UI.manualWiring}
          </button>
          {curlOpen && (
            <pre className="rounded-lg border border-border bg-muted/20 p-3 font-mono text-[10px]">
              {INGEST_SNIPPET}
            </pre>
          )}
        </div>
      </section>

      {/* Section 3 — Live log + next steps */}
      <section
        id="phase-confirm"
        className={cn(
          "scroll-mt-6 rounded-xl border border-border bg-card shadow-card overflow-hidden",
          !ingestResult && "opacity-60"
        )}
      >
        <div className="border-b border-border bg-muted/15 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{READINESS_UI.step3Title}</h2>
            <p className="text-sm text-muted-foreground">{READINESS_UI.liveActivityHint}</p>
          </div>
          <LiveIndicator connected={wsConnected} label={wsConnected ? "Live" : "Polling"} />
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              {READINESS_UI.liveActivity}
            </p>
            <LiveTelemetryStream
              events={streamEvents}
              loading={liveLoading}
              height="h-48"
              interactive
              emptyAction={
                ingestResult ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={logsHref}>{READINESS_UI.viewInLog}</Link>
                  </Button>
                ) : undefined
              }
            />
          </div>

          {ingestResult ? (
            <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-foreground" />
              <h3 className="mt-3 text-lg font-semibold">You&apos;re set up</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Test event recorded — same stream you&apos;ll watch in production.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild size="lg" className="gap-2">
                  <Link href={logsHref}>
                    <ScrollText className="h-4 w-4" />
                    {READINESS_UI.viewInLog}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2">
                  <Link href={`/replay?session=${encodeURIComponent(ingestResult.sessionId)}`}>
                    <FileCode className="h-4 w-4" />
                    {READINESS_UI.viewReplay}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2">
                  <Link href="/command-center">
                    <LayoutDashboard className="h-4 w-4" />
                    Command Center
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Send a test event in step 2 — it will appear in the stream above.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            <Link href="/sandbox" className="font-medium hover:underline">Sandbox</Link>
            {" · "}
            <Link href="/admin/policies" className="font-medium hover:underline">Security rules</Link>
            {" · "}
            <Link href="/campaigns" className="font-medium hover:underline">Wargame</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
