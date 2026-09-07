"use client";

import { cn } from "@/lib/utils";
import type { TranscriptTurn } from "@/lib/campaignTranscript";
import type { RoundAxes } from "@/lib/liveMonitorSecurity";

function toneFromResult(result: string | undefined): "ok" | "warn" | "bad" | "idle" {
  if (!result) return "idle";
  if (result === "pass") return "ok";
  if (result === "risk") return "warn";
  return "bad";
}

const TONE = {
  ok: {
    fill: "bg-[hsl(var(--severity-low))]",
    soft: "bg-[hsl(var(--severity-low-subtle))] border-[hsl(var(--severity-low-border))]",
    text: "text-[hsl(var(--severity-low))]",
    ring: "stroke-[hsl(var(--severity-low))]",
  },
  warn: {
    fill: "bg-[hsl(var(--severity-medium))]",
    soft: "bg-[hsl(var(--severity-medium-subtle))] border-[hsl(var(--severity-medium-border))]",
    text: "text-[hsl(var(--severity-medium))]",
    ring: "stroke-[hsl(var(--severity-medium))]",
  },
  bad: {
    fill: "bg-[hsl(var(--severity-critical))]",
    soft: "bg-[hsl(var(--severity-critical-subtle))] border-[hsl(var(--severity-critical-border))]",
    text: "text-[hsl(var(--severity-critical))]",
    ring: "stroke-[hsl(var(--severity-critical))]",
  },
  idle: {
    fill: "bg-muted-foreground/30",
    soft: "bg-muted/30 border-border",
    text: "text-muted-foreground",
    ring: "stroke-muted-foreground/40",
  },
} as const;

/** Horizontal pulse rail — each block is one real round. */
export function RoundPulseRail({
  turns,
  selected,
  onSelect,
  flashRound,
}: {
  turns: TranscriptTurn[];
  selected: number | null;
  onSelect: (n: number) => void;
  flashRound?: number | null;
}) {
  if (turns.length === 0) {
    return (
      <div className="flex h-14 items-center justify-center rounded-md border border-dashed border-border text-[12px] text-muted-foreground">
        Waiting for live rounds…
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Attack timeline</span>
        <span className="font-mono tabular-nums">{turns.length} rounds</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {turns.map((t) => {
          const hot = t.attackSuccessScore >= 0.7 && !t.blocked;
          const ok = t.blocked || t.attackSuccessScore < 0.45;
          const tone = hot ? "bad" : ok ? "ok" : "warn";
          const active = t.roundNumber === selected;
          const flash = t.roundNumber === flashRound;
          return (
            <button
              key={t.roundNumber}
              type="button"
              onClick={() => onSelect(t.roundNumber)}
              title={`R${t.roundNumber} · ${t.attackName} · ${t.verdict}`}
              className={cn(
                "relative flex h-12 min-w-[2.75rem] flex-1 flex-col items-center justify-end rounded-md border px-1 pb-1.5 pt-2 transition-transform",
                TONE[tone].soft,
                active && "scale-[1.03] ring-2 ring-foreground/40",
                flash && "animate-pulse"
              )}
              aria-pressed={active}
            >
              <span
                className={cn(
                  "absolute top-1.5 h-2 w-2 rounded-full",
                  TONE[tone].fill,
                  active && "h-2.5 w-2.5"
                )}
              />
              <span className="font-mono text-[10px] tabular-nums text-foreground">
                R{t.roundNumber}
              </span>
              <span
                className={cn("mt-0.5 h-1 w-full max-w-[2rem] rounded-full", TONE[tone].fill)}
                style={{ opacity: 0.35 + t.attackSuccessScore * 0.65 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Three large security signal lamps from real round axes. */
export function SecuritySignalBoard({
  axes,
  empty,
}: {
  axes: RoundAxes | null;
  empty?: string;
}) {
  if (!axes) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-[12px] text-muted-foreground">
        {empty || "Security signals wait for a live round"}
      </div>
    );
  }

  const lamps: Array<{
    label: string;
    value: string;
    tone: "ok" | "warn" | "bad";
    question: string;
  }> = [
    {
      label: "Detection",
      value: axes.detection,
      tone:
        axes.detection === "detected" ? "ok" : axes.detection === "late" ? "warn" : "bad",
      question: "Saw the attack?",
    },
    {
      label: "Prevention",
      value: axes.prevention,
      tone:
        axes.prevention === "prevented"
          ? "ok"
          : axes.prevention === "partial"
            ? "warn"
            : "bad",
      question: "Stopped it?",
    },
    {
      label: "Data leak",
      value: axes.leak,
      tone: axes.leak === "none" ? "ok" : axes.leak === "attempted" ? "warn" : "bad",
      question: "Data left?",
    },
  ];

  return (
    <div className="grid h-full grid-cols-3 gap-2 rounded-md border border-border p-3">
      {lamps.map((lamp) => (
        <div
          key={lamp.label}
          className={cn(
            "flex flex-col items-center justify-center rounded-md border px-2 py-4 text-center",
            TONE[lamp.tone].soft
          )}
        >
          <span
            className={cn(
              "relative mb-3 flex h-10 w-10 items-center justify-center rounded-full",
              TONE[lamp.tone].fill,
              (lamp.tone === "bad" || lamp.tone === "warn") && "animate-pulse"
            )}
            aria-hidden
          >
            <span className="absolute inset-0 rounded-full bg-current opacity-20 blur-md" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lamp.label}
          </p>
          <p className={cn("mt-1 text-[13px] font-semibold capitalize", TONE[lamp.tone].text)}>
            {lamp.value}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">{lamp.question}</p>
        </div>
      ))}
    </div>
  );
}

/** Dual radial: attack pressure vs defense hold — real scores. */
export function AttackDefenseGauge({
  attack,
  defense,
  blocked,
}: {
  attack: number;
  defense: number;
  blocked: boolean;
}) {
  const a = Math.max(0, Math.min(1, attack));
  const d = Math.max(0, Math.min(1, defense));
  const size = 148;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const attackOffset = c * (1 - a);
  const defenseOffset = c * (1 - d);

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-md border border-border p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Attack vs security
      </p>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-[hsl(var(--severity-critical))]"
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={attackOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r - stroke - 4}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke - 2}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r - stroke - 4}
            fill="none"
            className="stroke-[hsl(var(--severity-low))]"
            strokeWidth={stroke - 2}
            strokeDasharray={2 * Math.PI * (r - stroke - 4)}
            strokeDashoffset={2 * Math.PI * (r - stroke - 4) * (1 - d)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-2xl font-semibold tabular-nums">
            {Math.round(a * 100)}
            <span className="text-sm text-muted-foreground">%</span>
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">attack</p>
          <p className="mt-1 font-mono text-[11px] text-[hsl(var(--severity-low))]">
            def {Math.round(d * 100)}%{blocked ? " · hold" : ""}
          </p>
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--severity-critical))]" /> Attack
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--severity-low))]" /> Defense
        </span>
      </div>
    </div>
  );
}

/** Visual exchange: red-team payload → security boundary → agent response. */
export function AttackExchangeViz({
  turn,
  axes,
}: {
  turn: TranscriptTurn;
  axes: RoundAxes;
}) {
  const resultTone = toneFromResult(axes.result);
  const stages = [
    {
      id: "attack",
      label: "Red team",
      sub: turn.attackName || "Probe",
      snippet: (turn.attackPrompt || "—").slice(0, 140),
      tone: "bad" as const,
    },
    {
      id: "guard",
      label: "Security",
      sub: turn.blocked
        ? `Blocked${turn.blockedBy ? ` · ${turn.blockedBy}` : ""}`
        : axes.detection === "detected"
          ? "Detected"
          : axes.detection,
      snippet: turn.verdict || axes.result,
      tone: turn.blocked || axes.prevention === "prevented" ? ("ok" as const) : ("warn" as const),
    },
    {
      id: "agent",
      label: "Agent",
      sub: turn.targetError ? "Error" : "Response",
      snippet: (
        turn.targetResponse ||
        turn.errorDetail ||
        "—"
      ).slice(0, 140),
      tone: resultTone === "idle" ? ("idle" as const) : resultTone,
    },
  ];

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Live exchange
        </p>
        <span
          className={cn(
            "rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            TONE[resultTone].soft,
            TONE[resultTone].text
          )}
        >
          {axes.result}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {stages.map((stage, i) => (
          <div key={stage.id} className="contents">
            <div
              className={cn(
                "flex min-h-[120px] flex-col rounded-md border p-3",
                TONE[stage.tone].soft
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", TONE[stage.tone].fill)} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {stage.label}
                  </p>
                  <p className="text-[12px] font-medium text-foreground">{stage.sub}</p>
                </div>
              </div>
              <p className="mt-auto line-clamp-4 font-mono text-[11px] leading-relaxed text-foreground/85">
                {stage.snippet}
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-background/40">
                <div
                  className={cn("h-full rounded-full", TONE[stage.tone].fill)}
                  style={{
                    width:
                      stage.id === "attack"
                        ? `${Math.round(turn.attackSuccessScore * 100)}%`
                        : stage.id === "guard"
                          ? `${Math.round(turn.defenseQualityScore * 100)}%`
                          : axes.dataSafe
                            ? "100%"
                            : "35%",
                  }}
                />
              </div>
            </div>
            {i < stages.length - 1 ? (
              <div className="hidden items-center justify-center md:flex" aria-hidden>
                <span className="text-lg text-muted-foreground">→</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact campaign progress ring + status. */
export function CampaignProgressViz({
  completed,
  total,
  running,
}: {
  completed: number;
  total: number;
  running: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const size = 56;
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={28} cy={28} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
        <circle
          cx={28}
          cy={28}
          r={r}
          fill="none"
          className={running ? "stroke-[#67b3ef]" : "stroke-foreground/60"}
          strokeWidth={5}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div>
        <p className="font-mono text-lg font-semibold tabular-nums leading-none">
          {completed}
          <span className="text-sm text-muted-foreground">/{total || "—"}</span>
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {running ? "Executing" : "Complete"}
        </p>
      </div>
    </div>
  );
}
