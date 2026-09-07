"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Radio,
  Shield,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerApiHub } from "@/components/get-started/CustomerApiHub";
import {
  CLIENT_ONBOARDING_UI,
  buildClientNodeSnippet,
  buildClientPythonSnippet,
} from "@/lib/clientOnboarding";
import { cn } from "@/lib/utils";

type QuickSnippet = "python" | "nodejs";

export function ClientOnboardingHub() {
  const [snippetTab, setSnippetTab] = useState<QuickSnippet>("python");
  const [copied, setCopied] = useState(false);

  const quickCode =
    snippetTab === "python" ? buildClientPythonSnippet() : buildClientNodeSnippet();

  const copyQuick = async () => {
    try {
      await navigator.clipboard.writeText(quickCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-500/[0.08] via-card to-card">
        <div className="border-b border-border/60 px-5 py-4 sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400">
            {CLIENT_ONBOARDING_UI.heroBadge}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {CLIENT_ONBOARDING_UI.pageTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {CLIENT_ONBOARDING_UI.pageDescription}
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          <div className="border-b border-border/60 p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CLIENT_ONBOARDING_UI.notRequiredTitle}
            </p>
            <ul className="mt-3 space-y-2">
              {CLIENT_ONBOARDING_UI.notRequired.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              {CLIENT_ONBOARDING_UI.youProvideTitle}
            </p>
            <ul className="mt-3 space-y-2">
              {CLIENT_ONBOARDING_UI.youProvide.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
          {CLIENT_ONBOARDING_UI.lakeraCompare}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">{CLIENT_ONBOARDING_UI.flowTitle}</h3>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CLIENT_ONBOARDING_UI.steps.map((step, i) => (
            <li
              key={step.id}
              className="rounded-xl border border-border bg-card/50 p-4"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-[11px] font-bold text-indigo-400 ring-1 ring-indigo-500/25">
                {i + 1}
              </span>
              <p className="mt-2 text-sm font-medium text-foreground">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-muted/15 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400" />
            <p className="text-sm font-medium">Starter code (a few lines)</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {(
              [
                ["python", "Python"],
                ["nodejs", "Node.js"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSnippetTab(id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  snippetTab === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => void copyQuick()}>
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background p-4 font-mono text-[11px] leading-relaxed text-foreground/80">
          {quickCode}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">{CLIENT_ONBOARDING_UI.operatorNote}</p>
      </section>

      <section className="space-y-4">
        <CustomerApiHub clientMode />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5" />
          {CLIENT_ONBOARDING_UI.testTitle}
        </span>
        <span>
          Red Team / LLM provider setup →{" "}
          <Link href="/settings/integrations" className="font-medium text-foreground underline underline-offset-2">
            Settings (operators only)
          </Link>
        </span>
      </section>
    </div>
  );
}
