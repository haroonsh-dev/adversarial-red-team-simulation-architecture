"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { InspectorTarget } from "./model";

export function Inspector({
  target,
  onClose,
}: {
  target: InspectorTarget;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Inspector</p>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close inspector"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        <p className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{target.kind}</p>
        <h2 className="mt-1 text-[13px] font-medium text-foreground">{target.title}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{target.subtitle}</p>
        <dl className="mt-3 space-y-1.5">
          {target.fields.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3">
              <dt className="font-mono text-[10px] uppercase text-muted-foreground">{f.label}</dt>
              <dd className="font-mono text-[12px] tabular-nums text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            SOC Navigation
          </p>
          {target.links && target.links.length > 0 ? (
            target.links.map((lnk) => (
              <Link
                key={lnk.href}
                href={lnk.href}
                className="flex items-center justify-between rounded border border-border/80 bg-background/60 px-2.5 py-1.5 font-mono text-[11px] text-primary transition-colors hover:border-primary/50 hover:bg-muted/60"
              >
                <span>{lnk.label}</span>
                <span className="text-muted-foreground">↗</span>
              </Link>
            ))
          ) : (
            <div className="flex flex-col gap-1.5">
              <Link
                href={target.detectionsHref}
                className="font-mono text-[11px] text-primary hover:underline"
              >
                Open detections →
              </Link>
              {target.findingsHref ? (
                <Link href={target.findingsHref} className="font-mono text-[11px] text-primary hover:underline">
                  Open findings →
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
