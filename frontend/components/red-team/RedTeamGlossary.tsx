"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TERMS = [
  {
    term: "Check",
    def: "Score one attack message now — without starting a full campaign.",
    href: "/red-team/lab",
  },
  {
    term: "Run",
    def: "Launch a campaign against your target and watch rounds live.",
    href: "/red-team/campaigns/new",
  },
  {
    term: "Activity",
    def: "Live agent traffic — risk, tools, and verdicts as they happen.",
    href: "/red-team/monitor",
  },
  {
    term: "Outcomes",
    def: "Aggregated results across campaigns — detect rates and gaps.",
    href: "/red-team/matrix",
  },
] as const;

/** Glossary behind a ? control — not inline on the page. */
export function RedTeamGlossaryHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Glossary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Glossary"
          className="absolute right-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-card p-3 shadow-lg"
        >
          <p className="text-[11px] font-medium text-muted-foreground">Glossary</p>
          <dl className="mt-2 grid gap-2">
            {TERMS.map((t) => (
              <div key={t.term}>
                <dt>
                  <Link
                    href={t.href}
                    className="text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {t.term}
                  </Link>
                </dt>
                <dd className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/** Shared vocabulary so Lab / Monitor / Campaigns use the same words. */
export function RedTeamGlossary({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card/60 px-3 py-2.5 sm:px-4",
        className
      )}
    >
      <p className="text-[11px] font-medium text-muted-foreground">Glossary</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {TERMS.map((t) => (
          <div key={t.term} className="min-w-0">
            <dt>
              <Link
                href={t.href}
                className="text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
              >
                {t.term}
              </Link>
            </dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t.def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Three-step story strip for Lab / Campaigns. */
export function RedTeamSimpleSteps({
  steps,
  className,
}: {
  steps: Array<{ n: number; title: string; body: string }>;
  className?: string;
}) {
  return (
    <ol className={cn("grid gap-2 sm:grid-cols-3", className)}>
      {steps.map((s) => (
        <li
          key={s.n}
          className="rounded-md border border-border bg-card/70 px-3 py-2.5"
        >
          <p className="text-[11px] font-medium text-muted-foreground">Step {s.n}</p>
          <p className="mt-0.5 text-[13px] font-medium text-foreground">{s.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Friendly names for attack types (kept for plain technique pickers). */
export const FRIENDLY_TECHNIQUE: Record<string, { label: string; why: string }> = {
  "Prompt Injection": {
    label: "Prompt Injection",
    why: "Can someone make your AI ignore its rules?",
  },
  "Tool Abuse": {
    label: "Tool Abuse",
    why: "Can someone force your AI to use tools it shouldn’t?",
  },
  Exfiltration: {
    label: "Exfiltration",
    why: "Can someone pull secrets or customer info out?",
  },
  "Goal Drift": {
    label: "Goal Drift",
    why: "Can someone push your AI off its real job?",
  },
  "Memory Attack": {
    label: "Memory Attack",
    why: "Can someone plant bad info that sticks?",
  },
  Privilege: {
    label: "Privilege",
    why: "Can someone get powers they should not have?",
  },
  "Context Attack": {
    label: "Context Attack",
    why: "Can someone hide attacks inside other content?",
  },
};

export const FRIENDLY_STRATEGY: Record<string, string> = {
  Direct: "Direct",
  Obfuscated: "Obfuscated",
  "Multi-hop": "Multi-hop",
  "Social engineering": "Social engineering",
};

export function friendlyStatus(status: string): string {
  const s = status.toUpperCase();
  if (s === "RUNNING" || s === "PENDING") return "Running";
  if (s === "COMPLETED") return "Done";
  if (s === "FAILED" || s === "ERROR" || s === "CANCELLED") return "Failed";
  return status;
}
