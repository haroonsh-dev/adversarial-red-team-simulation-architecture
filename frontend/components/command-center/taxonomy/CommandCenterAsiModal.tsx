"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASI_CATEGORIES } from "@/lib/asiCategories";

const ASI_DETAILS: Record<
  string,
  {
    status: "ACTIVE" | "MONITORING" | "ARMED" | "STANDBY";
    description: string;
    runtimeMitigation: string;
    eventsDetected: number;
  }
> = {
  ASI01: {
    status: "ACTIVE",
    description: "Direct and indirect prompt injections manipulating agent goal directives.",
    runtimeMitigation: "Strict instruction isolation and neural safety classifier validation.",
    eventsDetected: 3,
  },
  ASI02: {
    status: "ACTIVE",
    description: "Unauthorized tool parameter tampering, parameter injection, and elevated scope invocation.",
    runtimeMitigation: "Dynamic permission bounding and tool schema sanitization.",
    eventsDetected: 5,
  },
  ASI03: {
    status: "ACTIVE",
    description: "Agent identity impersonation and credential theft across inter-agent handoffs.",
    runtimeMitigation: "HMAC cryptographic signing and ephemeral worker authorization tokens.",
    eventsDetected: 2,
  },
  ASI04: {
    status: "ACTIVE",
    description: "Compromised third-party packages, tainted memory plugins, or malicious tool schemas.",
    runtimeMitigation: "Cryptographic supply-chain validation and isolated sandbox containers.",
    eventsDetected: 2,
  },
  ASI05: {
    status: "ACTIVE",
    description: "Arbitrary code execution or system shell escape through unsandboxed tool evaluation.",
    runtimeMitigation: "gVisor/Wasm isolated sandboxing and filesystem mutation locks.",
    eventsDetected: 1,
  },
  ASI06: {
    status: "ACTIVE",
    description: "Poisoning persistent memory stores, scratchpads, or retrieved context vectors.",
    runtimeMitigation: "Context vector integrity checks and semantic anomaly scoring.",
    eventsDetected: 3,
  },
  ASI07: {
    status: "MONITORING",
    description: "Eavesdropping, spoofing, or replaying inter-agent telemetry payloads.",
    runtimeMitigation: "Mutual TLS and per-hop HMAC validation (Target drops unverified handoffs).",
    eventsDetected: 1,
  },
  ASI08: {
    status: "ARMED",
    description: "Runaway loops, resource exhaustion, and cascading downstream failure storms.",
    runtimeMitigation: "Automated circuit breaker and max hop recursion limits.",
    eventsDetected: 0,
  },
  ASI09: {
    status: "STANDBY",
    description: "Social engineering of human operators or deceptive authorization prompt framing.",
    runtimeMitigation: "Out-of-band operator confirmation modals for destructive commands.",
    eventsDetected: 0,
  },
  ASI10: {
    status: "STANDBY",
    description: "Autonomous agents evading monitoring frameworks or creating unauthorized child agents.",
    runtimeMitigation: "Process tree supervision and global heartbeat health telemetry.",
    eventsDetected: 0,
  },
};

export function CommandCenterAsiModal({
  isOpen,
  onClose,
  onSelectAsi,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsi: (code: string) => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="OWASP Agentic Security Top 10 Taxonomy"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-xs p-4"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border pb-4">
          <div>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-sky-400">
              OWASP AGENTIC SECURITY TOP 10 (ASI01–ASI10)
            </span>
            <h2 className="font-sans text-[18px] font-semibold text-foreground">
              Taxonomy Classification & Runtime Defense Map
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close taxonomy modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Categories Grid */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 [scrollbar-width:thin]">
          {ASI_CATEGORIES.map((cat) => {
            const meta = ASI_DETAILS[cat.code] ?? {
              status: "STANDBY",
              description: cat.label,
              runtimeMitigation: "Standard runtime monitoring",
              eventsDetected: 0,
            };

            const isActive = meta.status === "ACTIVE";
            const isArmed = meta.status === "ARMED";

            return (
              <div
                key={cat.code}
                className={cn(
                  "flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border p-3 font-mono text-[11px] transition-colors",
                  isActive
                    ? "border-amber-500/30 bg-amber-500/5"
                    : isArmed
                      ? "border-rose-500/30 bg-rose-500/5"
                      : "border-border/60 bg-muted/20"
                )}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-foreground">
                      {cat.code}
                    </span>
                    <span className="text-border">·</span>
                    <span className="font-semibold text-foreground">
                      {cat.label}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase border",
                        isActive
                          ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                          : isArmed
                            ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
                            : "border-border text-muted-foreground bg-muted/40"
                      )}
                    >
                      {meta.status}
                    </span>
                  </div>

                  <p className="font-sans text-[12px] text-muted-foreground leading-snug">
                    {meta.description}
                  </p>

                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    <span className="text-foreground/80 font-medium">Defense: </span>
                    {meta.runtimeMitigation}
                  </p>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    Incidents:{" "}
                    <span className="font-bold text-foreground">
                      {meta.eventsDetected}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectAsi(cat.code);
                      onClose();
                    }}
                    className="rounded border border-border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    INSPECT →
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="shrink-0 border-t border-border pt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>Categories with no current simulation incidents are displayed honestly as STANDBY.</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
