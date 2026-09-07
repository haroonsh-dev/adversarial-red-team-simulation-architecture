"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crosshair,
  FileSearch,
  Loader2,
  Play,
  Rewind,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Activity,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SANDBOX_PRESETS } from "@/lib/sandboxPresets";
import {
  DEMO_FINDINGS,
  DEMO_REDTEAM_CELLS,
  DEMO_REPLAY_LAYERS,
  demoPresetScan,
  runDemoScan,
  type DemoScanResult,
} from "@/lib/demoPlayground";
import { DEMO_TAB_LABELS, type DemoTab } from "@/lib/demoRoutes";
import { cn } from "@/lib/utils";
import { LandingProductScreenshot } from "@/components/landing/LandingProductScreenshots";
import { LandingSignInButton } from "@/components/landing/LandingSignInButton";

const TAB_ICONS: Record<DemoTab, typeof Shield> = {
  guard: Shield,
  redteam: Crosshair,
  findings: FileSearch,
  replay: Rewind,
  command: Activity,
  pipeline: GitBranch,
};

function isDemoTab(v: string | null): v is DemoTab {
  return v !== null && v in DEMO_TAB_LABELS;
}

export function DemoPlayground() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: DemoTab = isDemoTab(tabParam) ? tabParam : "guard";

  const setTab = useCallback(
    (tab: DemoTab) => {
      router.replace(`/demo?tab=${tab}`, { scroll: false });
    },
    [router]
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="text-center">
        <p className="meta-badge text-xs font-medium uppercase tracking-[0.14em] text-primary">
          Live product demo
        </p>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight sm:text-4xl">
          Try ARTSA — no account needed
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          playground: run guard scans, explore red-team coverage, triage findings, and
          scrub session replays — all in your browser.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as DemoTab)} className="mt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/30 p-1">
            {(Object.keys(DEMO_TAB_LABELS) as DemoTab[]).map((tab) => {
              const Icon = TAB_ICONS[tab];
              return (
                <TabsTrigger key={tab} value={tab} className="gap-1.5 rounded-md text-xs sm:text-sm">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {DEMO_TAB_LABELS[tab]}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <LandingSignInButton size="sm" className="shrink-0 rounded-full" signInOptions={{ returnTo: "/command-center" }}>
            Upgrade to full workspace
          </LandingSignInButton>
        </div>

        <TabsContent value="guard" className="mt-6">
          <GuardPlayground />
        </TabsContent>
        <TabsContent value="redteam" className="mt-6">
          <RedTeamDemo />
        </TabsContent>
        <TabsContent value="findings" className="mt-6">
          <FindingsDemo />
        </TabsContent>
        <TabsContent value="replay" className="mt-6">
          <ReplayDemo />
        </TabsContent>
        <TabsContent value="command" className="mt-6">
          <ScreenPreviewDemo screen="command" title="Command Center" description="Live KPIs, threat matrix, and telemetry stream — available in your workspace after signup." />
        </TabsContent>
        <TabsContent value="pipeline" className="mt-6">
          <ScreenPreviewDemo screen="pipeline" title="Agent Pipeline DAG" description="Multi-agent topology with integrity signals and lateral call tracing." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GuardPlayground() {
  const [presetId, setPresetId] = useState(SANDBOX_PRESETS[0].id);
  const [userInput, setUserInput] = useState(SANDBOX_PRESETS[0].user);
  const [systemPrompt, setSystemPrompt] = useState(SANDBOX_PRESETS[0].system);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<DemoScanResult | null>(() => demoPresetScan(SANDBOX_PRESETS[0].id));

  const selectPreset = (id: string) => {
    const preset = SANDBOX_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setUserInput(preset.user);
    setSystemPrompt(preset.system);
    setScanning(true);
    setTimeout(() => {
      setResult(demoPresetScan(id));
      setScanning(false);
    }, 550);
  };

  const runScan = () => {
    setScanning(true);
    setTimeout(() => {
      setResult(runDemoScan(userInput, systemPrompt));
      setScanning(false);
    }, 550);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-border/50 bg-card/25 p-4 sm:p-5">
        <p className="text-sm font-medium">Attack presets</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SANDBOX_PRESETS.slice(0, 6).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPreset(p.id)}
              className={cn(
                "rounded-xl border p-3 text-left text-xs transition-all",
                presetId === p.id
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/50 hover:border-border/80 hover:bg-muted/20"
              )}
            >
              <p.icon className="mb-1.5 h-4 w-4 text-primary" aria-hidden />
              <p className="font-medium">{p.label}</p>
              <p className="mt-0.5 text-muted-foreground">{p.description}</p>
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium">
          System prompt
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block text-sm font-medium">
          User message / tool payload
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            rows={4}
            className="mt-1.5 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-xs"
          />
        </label>
        <Button onClick={runScan} disabled={scanning} className="w-full gap-2 rounded-full sm:w-auto">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run guard scan
        </Button>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/80 p-4 sm:p-5">
        <p className="text-sm font-medium">Scan results</p>
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div
              key={result.riskScore + result.verdict}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-4"
            >
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Risk score</p>
                  <p
                    className={cn(
                      "font-mono text-4xl font-bold",
                      result.riskScore >= 72
                        ? "text-severity-critical"
                        : result.riskScore >= 45
                          ? "text-primary"
                          : "text-muted-foreground"
                    )}
                  >
                    {result.riskScore}
                    <span className="text-lg text-muted-foreground">/100</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{result.latencyMs}ms</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
                      result.recommendedAction === "ALLOW"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-400"
                    )}
                  >
                    {result.recommendedAction === "ALLOW" ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    {result.recommendedAction}
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{result.reasoning}</p>

              {result.flags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {result.flags.map((f) => (
                    <span key={f} className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] text-rose-300">
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Defense layers</p>
                {result.layers.map((layer) => (
                  <div key={layer.name} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className={layer.fired ? "text-rose-300" : "text-muted-foreground"}>{layer.name}</span>
                      <span className="font-mono">{layer.score}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                      <div
                        className={cn("h-full rounded-full", layer.fired ? "bg-rose-500/70" : "bg-emerald-500/50")}
                        style={{ width: `${layer.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="border-t border-border/40 pt-3 font-mono text-[11px] text-muted-foreground">{result.log}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RedTeamDemo() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(78);

  const runScan = () => {
    setRunning(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 12;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(interval);
        setRunning(false);
      }
    }, 280);
  };

  const passed = DEMO_REDTEAM_CELLS.filter((c) => c.passed).length;
  const coverage = Math.round((passed / DEMO_REDTEAM_CELLS.length) * 100);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/25 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Red team coverage grid</p>
          <p className="text-sm text-muted-foreground">Simulated adversarial scan across attack categories.</p>
        </div>
        <Button onClick={runScan} disabled={running} className="gap-2 rounded-full">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run demo scan
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-6 gap-1.5 sm:grid-cols-9">
        {DEMO_REDTEAM_CELLS.map((cell) => (
          <div
            key={cell.id}
            className={cn(
              "aspect-square rounded-md transition-colors",
              cell.passed ? "bg-emerald-500/40" : "bg-rose-500/55",
              running && "animate-pulse"
            )}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Coverage" value={`${running ? progress : coverage}%`} />
        <Stat label="Bypasses" value="3" accent="text-rose-400" />
        <Stat label="Judge verdict" value="FAIL" accent="text-primary" />
      </div>
    </div>
  );
}

function FindingsDemo() {
  const [selected, setSelected] = useState(DEMO_FINDINGS[0].id);
  const active = DEMO_FINDINGS.find((f) => f.id === selected) ?? DEMO_FINDINGS[0];

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-2">
        {DEMO_FINDINGS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelected(f.id)}
            className={cn(
              "w-full rounded-xl border p-3 text-left text-sm transition-colors",
              selected === f.id ? "border-primary/40 bg-primary/10" : "border-border/50 hover:bg-muted/20"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">{f.id}</span>
              <span className="rounded bg-rose-500/15 px-1 font-mono text-[9px] text-rose-400">{f.severity}</span>
            </div>
            <p className="mt-1 font-medium">{f.title}</p>
          </button>
        ))}
      </div>
      <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card/80 p-5">
        <p className="font-mono text-xs text-muted-foreground">Chain of custody</p>
        <h3 className="mt-2 text-lg font-medium">{active.title}</h3>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-border/30 pb-2">
            <dt className="text-muted-foreground">Source</dt>
            <dd>{active.source}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border/30 pb-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{active.status}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">OWASP LLM</dt>
            <dd className="font-mono text-xs">LLM01 · Prompt injection</dd>
          </div>
        </dl>
        <Button className="mt-6 rounded-full" disabled>
          Promote to playbook (demo)
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Sign up to promote findings into versioned playbooks.</p>
      </div>
    </div>
  );
}

function ReplayDemo() {
  const [frame, setFrame] = useState(3);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/25 p-4 sm:p-6">
      <p className="font-medium">Session autopsy — film timeline</p>
      <p className="text-sm text-muted-foreground">Scrub through containment layers as they fired during the attack.</p>

      <div className="mt-6 flex gap-1">
        {DEMO_REPLAY_LAYERS.map((layer, i) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => setFrame(i)}
            className={cn(
              "flex-1 rounded-lg border py-3 text-center font-mono text-[10px] transition-colors sm:text-xs",
              i <= frame
                ? layer.ok
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/20 text-rose-300"
                : "border-border/40 bg-muted/10 text-muted-foreground"
            )}
          >
            {layer.id}
          </button>
        ))}
      </div>

      <input
        type="range"
        min={0}
        max={DEMO_REPLAY_LAYERS.length - 1}
        value={frame}
        onChange={(e) => setFrame(Number(e.target.value))}
        className="mt-4 w-full accent-primary"
        aria-label="Replay timeline position"
      />

      <div className="mt-4 rounded-xl border border-border/40 bg-muted/60 p-4">
        <p className="font-mono text-xs text-muted-foreground">
          Frame {frame + 1} · {DEMO_REPLAY_LAYERS[frame].label}
        </p>
        <p className="mt-2 font-mono text-2xl font-bold text-rose-400">{DEMO_REPLAY_LAYERS[frame].score}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {DEMO_REPLAY_LAYERS[frame].ok
            ? "Layer passed — no policy violation detected."
            : "Layer fired — contributing to QUARANTINE verdict at 4.2ms."}
        </p>
      </div>
    </div>
  );
}

function ScreenPreviewDemo({
  screen,
  title,
  description,
}: {
  screen: "command" | "pipeline";
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/25">
      <div className="border-b border-border/40 p-4 sm:p-5">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <LandingProductScreenshot screen={screen} className="h-auto min-h-[14rem] rounded-none border-0" />
      <div className="border-t border-border/40 p-4 text-center">
        <LandingSignInButton className="rounded-full" signInOptions={{ returnTo: "/command-center" }}>
          Open full {title.toLowerCase()}
        </LandingSignInButton>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-semibold", accent)}>{value}</p>
    </div>
  );
}
