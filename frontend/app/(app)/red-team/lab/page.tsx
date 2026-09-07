"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LandingMotionCard } from "@/components/landing/LandingMotionCard";
import { AttackLabLiveConsole } from "@/components/red-team/AttackLabLiveConsole";
import {
  FRIENDLY_STRATEGY,
  FRIENDLY_TECHNIQUE,
  RedTeamGlossary,
  RedTeamSimpleSteps,
} from "@/components/red-team/RedTeamGlossary";
import { Button } from "@/components/ui/button";
import { useProviders } from "@/lib/hooks/useProviders";
import { riskScoreFromSummary } from "@/lib/assessmentResults";
import {
  LAB_CRITERIA,
  LAB_PRESETS,
  LAB_STRATEGIES,
  LAB_TECHNIQUES,
  buildLabBriefExport,
  deriveLabAttackPath,
  deriveLabAttackerProfile,
  deriveLabCatalogCoverage,
  deriveLabExperiment,
  deriveLabHistory,
  deriveLabKillChain,
  deriveLabOutcomeMix,
  deriveLabQuadrant,
  deriveLabRiskComposition,
  deriveLabStrategyCompare,
  getTechnique,
  strategyRiskBoost,
  suggestNextLabTarget,
  type LabPreset,
  type LabStrategy,
  type LabTechniqueId,
} from "@/lib/attackLab";
import {
  launchLabCampaign,
  probeRisk,
  runLabProbe,
  type LabProbeOutcome,
} from "@/lib/labActions";
import {
  campaignMatchesTechnique,
  deriveExperimentLog,
  recordLabExperiment,
} from "@/lib/labExperimentLog";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { toast } from "@/lib/stores/toast";
import { cn } from "@/lib/utils";

const AttackLabAdversary = dynamic(
  () =>
    import("@/components/red-team/AttackLabAdversary").then((m) => m.AttackLabAdversary),
  { ssr: false, loading: () => null }
);
const AttackLabAnalysis = dynamic(
  () =>
    import("@/components/red-team/AttackLabAnalysis").then((m) => m.AttackLabAnalysis),
  { ssr: false, loading: () => null }
);
const SituationAutoPanel = dynamic(
  () =>
    import("@/components/sandbox/SituationAutoPanel").then((m) => m.SituationAutoPanel),
  { ssr: false, loading: () => null }
);

function AttackLabInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { campaigns } = useCampaigns();
  const { providers } = useProviders();
  const hasProvider = providers.some((p) => p.configured !== false) || providers.length > 0;

  const initialTechnique = useMemo(() => {
    const q = searchParams.get("technique");
    if (q && LAB_TECHNIQUES.some((t) => t.id === q)) return q as LabTechniqueId;
    return "Prompt Injection" as LabTechniqueId;
  }, [searchParams]);

  const [technique, setTechnique] = useState<LabTechniqueId>(initialTechnique);
  const [strategy, setStrategy] = useState<LabStrategy>("Direct");
  const [intensity, setIntensity] = useState(60);
  const [iterations, setIterations] = useState(12);
  const [mutation, setMutation] = useState(true);
  const [multiTurn, setMultiTurn] = useState(true);
  const [input, setInput] = useState(() => getTechnique(initialTechnique).templates.Direct);
  const [criteria, setCriteria] = useState<string[]>([
    "Unauthorized tool call",
    "Sensitive information returned",
    "System instruction exposed",
    "Policy bypass",
  ]);
  const [launching, setLaunching] = useState(false);
  const [probing, setProbing] = useState(false);
  const [lastProbe, setLastProbe] = useState<LabProbeOutcome | null>(null);
  const [syncedFromTemplate, setSyncedFromTemplate] = useState(true);
  const [simSeed, setSimSeed] = useState<string | undefined>(undefined);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setTechnique(initialTechnique);
    const tmpl = getTechnique(initialTechnique).templates[strategy];
    setInput(tmpl);
    setSyncedFromTemplate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only hydrate from URL technique
  }, [initialTechnique]);

  const experiment = useMemo(
    () =>
      deriveLabExperiment({
        technique,
        strategy,
        intensity,
        iterations,
        mutation,
        multiTurn,
        criteria,
      }),
    [technique, strategy, intensity, iterations, mutation, multiTurn, criteria]
  );

  const history = useMemo(
    () => deriveLabHistory(campaigns, technique, riskScoreFromSummary),
    [campaigns, technique]
  );

  const recentForTechnique = useMemo(
    () =>
      campaigns
        .filter((c) => campaignMatchesTechnique({ id: c.id, name: c.name }, technique))
        .slice(0, 5),
    [campaigns, technique]
  );

  const experimentLog = useMemo(
    () => deriveExperimentLog(campaigns, riskScoreFromSummary).slice(0, 12),
    [campaigns]
  );

  const composition = useMemo(
    () =>
      deriveLabRiskComposition({
        technique,
        strategy,
        intensity,
        mutation,
        multiTurn,
      }),
    [technique, strategy, intensity, mutation, multiTurn]
  );

  const strategyRows = useMemo(
    () =>
      deriveLabStrategyCompare({
        technique,
        intensity,
        iterations,
        mutation,
        multiTurn,
        criteria,
      }),
    [technique, intensity, iterations, mutation, multiTurn, criteria]
  );

  const coverage = useMemo(
    () => deriveLabCatalogCoverage(campaigns, riskScoreFromSummary),
    [campaigns]
  );

  const nextTarget = useMemo(
    () => suggestNextLabTarget(coverage, technique),
    [coverage, technique]
  );

  const attackerProfile = useMemo(
    () =>
      deriveLabAttackerProfile({
        technique,
        strategy,
        mutation,
        multiTurn,
        intensity,
      }),
    [technique, strategy, mutation, multiTurn, intensity]
  );

  const killChain = useMemo(
    () =>
      deriveLabKillChain({
        technique,
        strategy,
        intensity,
        mutation,
        multiTurn,
      }),
    [technique, strategy, intensity, mutation, multiTurn]
  );

  const attackPath = useMemo(
    () =>
      deriveLabAttackPath({
        technique,
        strategy,
        estimatedRisk: experiment.estimatedRisk,
        detectors: experiment.detectors,
      }),
    [technique, strategy, experiment.estimatedRisk, experiment.detectors]
  );

  const outcomeMix = useMemo(
    () =>
      deriveLabOutcomeMix({
        estimatedRisk: experiment.estimatedRisk,
        estimatedDetectPct: experiment.estimatedDetectPct,
        iterations: experiment.iterations,
      }),
    [experiment.estimatedRisk, experiment.estimatedDetectPct, experiment.iterations]
  );

  const quadrant = useMemo(
    () =>
      deriveLabQuadrant({
        technique,
        intensity,
        iterations,
        mutation,
        multiTurn,
        criteria,
        activeStrategy: strategy,
      }),
    [technique, intensity, iterations, mutation, multiTurn, criteria, strategy]
  );

  const applyTemplate = (nextTechnique: LabTechniqueId, nextStrategy: LabStrategy) => {
    setTechnique(nextTechnique);
    setStrategy(nextStrategy);
    setInput(getTechnique(nextTechnique).templates[nextStrategy]);
    setSyncedFromTemplate(true);
  };

  const pickStrategy = (s: LabStrategy) => {
    if (syncedFromTemplate) applyTemplate(technique, s);
    else setStrategy(s);
  };

  const applyPreset = (preset: LabPreset) => {
    setIntensity(preset.intensity);
    setIterations(preset.iterations);
    setMutation(preset.mutation);
    setMultiTurn(preset.multiTurn);
    applyTemplate(technique, preset.strategy);
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(buildLabBriefExport(experiment));
      toast("Brief copied", {
        description: "Experiment JSON ready for notes / tickets.",
        variant: "success",
      });
    } catch {
      toast("Copy failed", { description: "Clipboard unavailable.", variant: "error" });
    }
  };

  const toggleCriterion = (c: string) => {
    setCriteria((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const executeProbe = async (
    message: string,
    persist: boolean,
    reason: string
  ) => {
    setProbing(true);
    const outcome = await runLabProbe(message, { persist, reason });
    setLastProbe(outcome);
    setProbing(false);
    setSimSeed(message);
    if (!outcome.ok) {
      toast("Probe failed", { description: outcome.error ?? "Unknown error", variant: "error" });
      return;
    }
    const v = outcome.result?.verdict?.verdict ?? "scored";
    const risk = outcome.result?.risk_score?.overall_score;
    toast("Probe complete", {
      description: `${reason} · ${v}${risk != null ? ` · risk ${Math.round(Number(risk))}` : ""} · ${outcome.latencyMs}ms`,
      variant: "success",
    });
    document.getElementById("lab-live")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const runProbe = (persist: boolean) => {
    void executeProbe(input, persist, persist ? "probe & persist" : "dry probe");
  };

  const probeStrategy = (s: LabStrategy) => {
    const tmpl = getTechnique(technique).templates[s];
    applyTemplate(technique, s);
    void executeProbe(tmpl, true, `strategy · ${s}`);
  };

  const probeTechnique = (id: LabTechniqueId) => {
    const tmpl = getTechnique(id).templates[strategy];
    applyTemplate(id, strategy);
    void executeProbe(tmpl, true, `technique · ${id}`);
  };

  const probeStage = (_stageId: string, label: string) => {
    void executeProbe(input, true, `kill-chain · ${label}`);
  };

  const runCampaign = async () => {
    if (!input.trim()) {
      toast("Message required", {
        description: "Enter an attack message before starting a run.",
        variant: "error",
      });
      return;
    }
    if (criteria.length === 0) {
      toast("Pick success criteria", {
        description: "At least one criterion defines what counts as a hit.",
        variant: "error",
      });
      return;
    }
    if (!hasProvider) {
      toast("Target provider required", {
        description: "Add a model provider so the run hits a real target.",
        variant: "error",
      });
      return;
    }

    setLaunching(true);
    const res = await launchLabCampaign({
      name: `Lab · ${technique} · ${strategy}`,
      maxRounds: experiment.iterations,
      categories: experiment.categories,
      intensity: experiment.intensityBand,
      mutationsEnabled: mutation,
      maxMutations: experiment.mutationBudget,
    });
    setLaunching(false);
    if (!res.ok || !res.campaignId) {
      toast("Couldn’t start run", {
        description:
          res.error ||
          "Add a target provider under Settings → Integrations, then try again.",
        variant: "error",
      });
      return;
    }
    recordLabExperiment({
      campaignId: res.campaignId,
      technique,
      strategy,
      intensity,
      iterations: experiment.iterations,
      mutation,
      categories: experiment.categories,
      startedAt: new Date().toISOString(),
    });
    toast("Lab run started", {
      description: res.message || "Opening Live run (same area as Monitor in the sidebar)…",
      variant: "success",
    });
    router.push(`/red-team/monitor/${res.campaignId}?follow=1`);
  };

  const liveRisk = probeRisk(lastProbe?.result ?? null);
  const liveVerdict = lastProbe?.result?.verdict?.verdict ?? null;

  const postureTone =
    experiment.posture === "aggressive"
      ? {
          border: "border-[hsl(var(--severity-critical-border))]",
          bg: "bg-[hsl(var(--severity-critical-subtle))]",
          bar: "bg-[hsl(var(--severity-critical))]",
          text: "text-[hsl(var(--severity-critical))]",
        }
      : experiment.posture === "standard"
        ? {
            border: "border-[hsl(var(--severity-medium-border))]",
            bg: "bg-[hsl(var(--severity-medium-subtle))]",
            bar: "bg-[hsl(var(--severity-medium))]",
            text: "text-[hsl(var(--severity-medium))]",
          }
        : {
            border: "border-[hsl(var(--severity-low-border))]",
            bg: "bg-[hsl(var(--severity-low-subtle))]",
            bar: "bg-[hsl(var(--severity-low))]",
            text: "text-[hsl(var(--severity-low))]",
          };

  return (
    <div className="space-y-8">
      {!hasProvider ? (
        <div className="rounded-md border border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium-subtle))] px-4 py-3 text-[13px]">
          <p className="font-medium text-foreground">Target provider required</p>
          <p className="mt-1 text-muted-foreground">
            Checks can still score a message. Starting a full lab run needs a registered model
            provider.
          </p>
          <Button size="sm" className="mt-2" asChild>
            <Link href="/admin/providers">Add provider</Link>
          </Button>
        </div>
      ) : null}

      <RedTeamSimpleSteps
        steps={[
          {
            n: 1,
            title: "Pick a technique",
            body: "Choose what kind of attack to try against your AI.",
          },
          {
            n: 2,
            title: "Check",
            body: "Score this message now and see the live verdict.",
          },
          {
            n: 3,
            title: "Start run",
            body: "Launch a full lab experiment, then watch it under Detections.",
          },
        ]}
      />

      {/* First viewport: Attack Lab check / start run */}
      <LandingMotionCard instant
        index={0}
        glow={false}
        className="overflow-hidden border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[18px] font-medium tracking-tight text-foreground">
              Check a message or start a run
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
              Pick a technique, review the payload, then check once — or start a full lab run.
            </p>
          </div>
          {liveRisk != null ? (
            <div className="flex shrink-0 items-baseline gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div>
                <p className="text-[10px] text-muted-foreground">Live risk</p>
                <p
                  className={cn(
                    "text-[18px] font-semibold tabular-nums",
                    liveRisk >= 80 && "text-[hsl(var(--severity-critical))]"
                  )}
                >
                  R{liveRisk}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Verdict</p>
                <p className="text-[13px] font-medium text-foreground">{liveVerdict ?? "—"}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-[12px]">
            <span className="text-muted-foreground">Technique</span>
            <select
              id="lab-technique"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px]"
              value={technique}
              onChange={(e) => applyTemplate(e.target.value as LabTechniqueId, strategy)}
            >
              {LAB_TECHNIQUES.map((t) => (
                <option key={t.id} value={t.id}>
                  {FRIENDLY_TECHNIQUE[t.id]?.label ?? t.id}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-muted-foreground">
              {FRIENDLY_TECHNIQUE[technique]?.why ?? getTechnique(technique).blurb}
            </span>
          </label>
          <label className="space-y-1 text-[12px]">
            <span className="text-muted-foreground">Strategy</span>
            <select
              id="lab-strategy"
              className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[13px]"
              value={strategy}
              onChange={(e) => {
                const s = e.target.value as LabStrategy;
                if (syncedFromTemplate) applyTemplate(technique, s);
                else setStrategy(s);
              }}
            >
              {LAB_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {FRIENDLY_STRATEGY[s] ?? s}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-muted-foreground">
              Planning estimate only — live score appears after a check.
            </span>
          </label>
        </div>

        <label className="mt-4 block space-y-1 text-[12px]">
          <span className="text-muted-foreground">Attack payload</span>
          <textarea
            rows={5}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSyncedFromTemplate(false);
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Enter attack scenario…"
            aria-label="Attack payload"
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">You can edit this before checking.</p>
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => applyTemplate(technique, strategy)}
          >
            Reset to template
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={probing || launching || !input.trim()}
            onClick={() => runProbe(true)}
          >
            {probing ? "Checking…" : "Check"}
          </Button>
          <Button
            variant="outline"
            disabled={launching || probing || !hasProvider || !input.trim()}
            onClick={() => void runCampaign()}
          >
            {launching ? "Starting…" : hasProvider ? "Start run" : "Add provider first"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/red-team/campaigns/new">Campaign builder</Link>
          </Button>
        </div>
      </LandingMotionCard>

      <div id="lab-live">
        <AttackLabLiveConsole
          probing={probing}
          launching={launching}
          last={lastProbe}
          onProbe={runProbe}
          onLaunch={() => void runCampaign()}
          payloadChars={input.trim().length}
          showActions={false}
          hasProvider={hasProvider}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          Need more controls? Open analyst detail below.
        </p>
        <Button size="sm" variant="outline" onClick={() => setShowDetail((v) => !v)}>
          {showDetail ? "Hide detail" : "Show more detail"}
        </Button>
      </div>

      {showDetail ? (
        <>
      <RedTeamGlossary />

      {/* Planning estimate — below the action fold */}
      <LandingMotionCard instant
        index={1}
        glow={false}
        className={cn("overflow-hidden border p-4 sm:p-5", postureTone.border, postureTone.bg)}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          <div className={cn("hidden w-1 shrink-0 rounded-full lg:block", postureTone.bar)} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Experiment finding
              </p>
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                  postureTone.border,
                  "bg-card/60",
                  postureTone.text
                )}
              >
                {experiment.posture}
              </span>
              <span className="rounded-sm border border-border bg-card/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Pre-run estimate
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {experiment.owasp} · {experiment.atlas}
              </span>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-foreground">{experiment.finding}</p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {experiment.sampleSizeNote} Estimates below are planning numbers — not live scores until
              you run a check.
            </p>
          </div>

          <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[320px] lg:grid-cols-2">
            {liveRisk != null ? (
              <>
                <Kpi
                  label="Live risk"
                  value={`R${liveRisk}`}
                  hot={liveRisk >= 80}
                  sub={liveVerdict ?? "from last check"}
                />
                <Kpi
                  label="Live verdict"
                  value={liveVerdict ?? "—"}
                  sub={lastProbe?.latencyMs != null ? `${lastProbe.latencyMs} ms` : undefined}
                />
              </>
            ) : null}
            <Kpi
              label="Est. risk"
              value={`R${experiment.estimatedRisk}`}
              hot={experiment.estimatedRisk >= 80}
              sub="planning only"
            />
            <Kpi label="Est. detect" value={`${experiment.estimatedDetectPct}%`} sub="planning only" />
            {!liveRisk ? (
              <>
                <Kpi
                  label="Prior runs"
                  value={history.runs ? String(history.runs) : "—"}
                  sub={
                    history.runs
                      ? `${history.completed} ok · ${history.failed} fail`
                      : "no lab history"
                  }
                />
                <Kpi
                  label="Mean risk"
                  value={history.meanRisk != null ? `R${history.meanRisk}` : "—"}
                  sub={history.maxRisk ? `max R${history.maxRisk}` : undefined}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Meter
            label="Estimated risk"
            pct={experiment.estimatedRisk}
            tone={
              experiment.estimatedRisk >= 80
                ? "critical"
                : experiment.estimatedRisk >= 60
                  ? "medium"
                  : "low"
            }
          />
          <Meter label="Estimated detect" pct={experiment.estimatedDetectPct} tone="info" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Pipeline
          </span>
          {experiment.pipeline.map((step, i) => (
            <span key={`${step}-${i}`} className="inline-flex items-center gap-1.5">
              {i > 0 ? (
                <span className="text-muted-foreground/50" aria-hidden>
                  →
                </span>
              ) : null}
              <span className="rounded-sm border border-border bg-card/80 px-2 py-0.5 font-mono text-[10px] text-foreground">
                {step}
              </span>
            </span>
          ))}
        </div>
      </LandingMotionCard>

      {/* Research presets */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Research presets
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {LAB_PRESETS.map((p, i) => (
            <LandingMotionCard instant
              key={p.id}
              index={i}
              glow={false}
              className={cn(
                "border p-0",
                p.id === "stress"
                  ? "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical-subtle))]"
                  : p.id === "standard"
                    ? "border-[hsl(var(--severity-info-border))] bg-[hsl(var(--severity-info-subtle))]"
                    : "border-border bg-card"
              )}
            >
              <button
                type="button"
                onClick={() => applyPreset(p)}
                className="w-full px-3 py-2.5 text-left"
              >
                <p className="text-[13px] font-medium text-foreground">{p.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{p.blurb}</p>
                <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                  n={p.iterations} · I{p.intensity} · {p.strategy}
                </p>
              </button>
            </LandingMotionCard>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-7 min-w-0">
          {/* Technique catalog */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Technique catalog
              </h3>
              <span className="font-mono text-[10px] text-muted-foreground">
                OWASP · ATLAS mapped
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {LAB_TECHNIQUES.map((t, idx) => {
                const active = technique === t.id;
                const band =
                  t.baseRisk >= 78 ? "critical" : t.baseRisk >= 70 ? "high" : "medium";
                return (
                  <LandingMotionCard instant
                    key={t.id}
                    index={idx + 1}
                    glow={false}
                    className={cn(
                      "border p-0",
                      active
                        ? band === "critical"
                          ? "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical-subtle))]"
                          : band === "high"
                            ? "border-[hsl(var(--severity-high-border))] bg-[hsl(var(--severity-high-subtle))]"
                            : "border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium-subtle))]"
                        : "border-border bg-card hover:border-foreground/15"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(t.id, strategy)}
                      className="w-full px-3 py-2.5 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[13px] font-medium",
                            active ? "text-foreground" : "text-foreground/90"
                          )}
                        >
                          {t.id}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          R{t.baseRisk}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        {t.blurb}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-foreground/70">
                        Attacker: {t.attackerObjective}
                      </p>
                      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/80">
                        {t.owasp} · {t.atlas} · {t.entryVector}
                      </p>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          probeTechnique(t.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            probeTechnique(t.id);
                          }
                        }}
                        className="mt-2 inline-block font-mono text-[10px] text-primary underline-offset-2 hover:underline"
                      >
                        {probing ? "…" : "Check"}
                      </span>
                    </button>
                  </LandingMotionCard>
                );
              })}
            </div>
          </section>

          {/* Strategy chips + knobs */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Experiment design
            </h3>

            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">Strategy</p>
              <div className="flex flex-wrap gap-2">
                {LAB_STRATEGIES.map((s) => {
                  const active = strategy === s;
                  const boost = strategyRiskBoost(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        if (syncedFromTemplate) applyTemplate(technique, s);
                        else setStrategy(s);
                      }}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-primary/40 bg-[hsl(var(--severity-info-subtle))] text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                      )}
                    >
                      <span className="block text-[12px] font-medium">{s}</span>
                      <span className="font-mono text-[9px] opacity-70">
                        {boost > 0 ? `+${boost} risk` : "baseline"}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          probeStrategy(s);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            probeStrategy(s);
                          }
                        }}
                        className="mt-1 block font-mono text-[9px] text-primary underline-offset-2 hover:underline"
                      >
                        {probing ? "…" : "Probe"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-[12px]">
                <span className="text-muted-foreground">Iterations (n)</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[13px]"
                  value={iterations}
                  onChange={(e) => setIterations(Number(e.target.value) || 1)}
                />
              </label>
              <div className="flex flex-wrap items-end gap-4 pb-1 text-[13px]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mutation}
                    onChange={(e) => setMutation(e.target.checked)}
                  />
                  Mutations
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={multiTurn}
                    onChange={(e) => setMultiTurn(e.target.checked)}
                  />
                  Multi-turn
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[12px] text-muted-foreground">
                <span>Intensity</span>
                <span className="font-mono text-foreground">
                  {intensity} · {experiment.intensityBand}
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="w-full"
                aria-label="Attack intensity"
              />
              <p className="text-[11px] text-muted-foreground">
                Mutation budget {experiment.mutationBudget} · expected detect{" "}
                {experiment.estimatedDetectPct}%
              </p>
            </div>
          </section>

          {/* Payload edited in the first-viewport card; design knobs below */}
          <section className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3">
            <p className="text-[12px] text-muted-foreground">
              Attack message is edited at the top of this page. Use Check or Start run there —
              design knobs here only change the experiment plan.
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {input.length} chars · {technique} · {strategy}
            </p>
          </section>

          {/* Success criteria */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Success criteria
            </h3>
            <p className="text-[12px] text-muted-foreground">
              What counts as a hit — maps to judge / analyst review.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {LAB_CRITERIA.map((c) => (
                <label
                  key={c}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-2 text-[12px]",
                    criteria.includes(c)
                      ? "border-primary/30 bg-[hsl(var(--severity-info-subtle))]"
                      : "border-border bg-card"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={criteria.includes(c)}
                    onChange={() => toggleCriterion(c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          </section>
        </div>

        {/* Brief rail */}
        <aside className="space-y-4 xl:sticky xl:top-3 xl:self-start">
          <div className={cn("rounded-md border px-3.5 py-3.5", postureTone.border, postureTone.bg)}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Experiment brief
            </p>
            <p className="mt-2 text-[13px] leading-snug text-foreground">
              {attackerProfile.objective}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Via {attackerProfile.entryVector} · {attackerProfile.stealth} ·{" "}
              {attackerProfile.sophistication}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Stat k="Est. risk" v={`R${experiment.estimatedRisk}`} hot={experiment.estimatedRisk >= 80} />
              <Stat k="Est. detect" v={`${experiment.estimatedDetectPct}%`} />
              <Stat k="Categories" v={experiment.categories.join(" · ") || "—"} />
              <Stat k="Mutations" v={String(experiment.mutationBudget)} />
              <Stat k="n" v={String(experiment.iterations)} />
              <Stat k="Band" v={experiment.intensityBand} />
            </dl>
          </div>

          {experiment.controlGaps.length > 0 ? (
            <div className="rounded-md border border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium-subtle))] px-3.5 py-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Control gaps to watch
              </p>
              <ul className="mt-2 space-y-1.5">
                {experiment.controlGaps.map((g) => (
                  <li key={g} className="text-[11px] leading-snug text-foreground">
                    · {g}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-card px-3.5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Expected detectors
            </p>
            <ul className="mt-2 space-y-1">
              {experiment.detectors.map((d) => (
                <li key={d} className="font-mono text-[11px] text-foreground">
                  {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-border bg-card px-3.5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Technique history
            </p>
            {history.runs === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">
                No prior runs for this technique yet.
              </p>
            ) : (
              <dl className="mt-2 grid grid-cols-2 gap-2">
                <Stat k="Runs" v={String(history.runs)} />
                <Stat k="Live" v={String(history.running)} />
                <Stat k="Completed" v={String(history.completed)} />
                <Stat k="Failed" v={String(history.failed)} hot={history.failed > 0} />
              </dl>
            )}
            {recentForTechnique.length > 0 ? (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {recentForTechnique.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/red-team/monitor/${c.id}`}
                      title="Open Live run for this campaign"
                      className="flex items-center justify-between gap-2 py-2 text-[12px] hover:text-foreground"
                    >
                      <span className="truncate text-muted-foreground">
                        {c.name.replace(/^Lab · /, "")}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        Live run · {c.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-card px-3.5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Experiment log
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Structured Lab runs — not only campaign name prefixes.
            </p>
            {experimentLog.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">No Lab experiments recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {experimentLog.map((row) => (
                  <li key={row.campaignId}>
                    <Link
                      href={row.href}
                      className="flex flex-col gap-0.5 py-2 hover:text-foreground"
                    >
                      <span className="truncate text-[12px] font-medium text-foreground">
                        {row.technique} · {row.strategy}
                      </span>
                      <span className="flex justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                        <span>
                          {row.status}
                          {row.risk != null ? ` · R${row.risk}` : ""}
                          {row.source === "registry" ? " · logged" : ""}
                        </span>
                        <span>
                          {row.roundsDone}/{row.roundsTotal}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={probing || !input.trim()}
              onClick={() => runProbe(true)}
            >
              {probing ? "Checking…" : "Check"}
            </Button>
            <Button onClick={() => void runCampaign()} disabled={launching || probing || !hasProvider}>
              {launching ? "Starting…" : hasProvider ? "Start run" : "Add provider first"}
            </Button>
            <Button variant="outline" onClick={() => void copyBrief()}>
              Copy brief
            </Button>
            <Button variant="outline" asChild>
              <Link href="/red-team/campaigns/new">Campaign builder</Link>
            </Button>
          </div>
        </aside>
      </div>

      <AttackLabAdversary
        profile={attackerProfile}
        path={attackPath}
        stages={killChain}
        outcome={outcomeMix}
        quadrant={quadrant}
        onPickStrategy={pickStrategy}
        onProbeStrategy={probeStrategy}
        onProbeStage={probeStage}
        probing={probing}
      />

      <AttackLabAnalysis
        composition={composition}
        estimatedRisk={experiment.estimatedRisk}
        strategyRows={strategyRows}
        activeStrategy={strategy}
        onPickStrategy={pickStrategy}
        onProbeStrategy={probeStrategy}
        coverage={coverage}
        activeTechnique={technique}
        onPickTechnique={(id) => applyTemplate(id, strategy)}
        onProbeTechnique={probeTechnique}
        nextTarget={nextTarget}
        riskSpark={history.riskSpark}
        meanRisk={history.meanRisk}
        maxRisk={history.maxRisk}
        probing={probing}
      />

      <section id="simulate" className="space-y-3 border-t border-border pt-6">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Alternate check panel
          </h3>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Optional second editor — same Check path as the message at the top.
          </p>
        </div>
        <SituationAutoPanel initialMessage={simSeed ?? input} />
      </section>
        </>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  hot,
}: {
  label: string;
  value: string;
  sub?: string;
  hot?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card/80 px-2.5 py-2 shadow-sm">
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[15px] tabular-nums",
          hot ? "text-[hsl(var(--severity-critical))]" : "text-foreground"
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Meter({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number;
  tone: "critical" | "medium" | "low" | "info";
}) {
  const fill =
    tone === "critical"
      ? "bg-[hsl(var(--severity-critical))]"
      : tone === "medium"
        ? "bg-[hsl(var(--severity-medium))]"
        : tone === "low"
          ? "bg-[hsl(var(--severity-low))]"
          : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate font-mono text-[13px] tabular-nums",
          hot ? "text-[hsl(var(--severity-critical))]" : "text-foreground"
        )}
      >
        {v}
      </dd>
    </div>
  );
}

export default function AttackLabPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] animate-pulse rounded-md bg-muted/20" />}>
      <AttackLabInner />
    </Suspense>
  );
}
