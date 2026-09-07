"use client";

import { useEffect } from "react";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type OperatorActionType =
  | "KILL_SESSION"
  | "QUARANTINE_AGENT"
  | "BLOCK_TOOL"
  | "DEPLOY_MITIGATION"
  | null;

export function CommandCenterConfirmationModal({
  isOpen,
  actionType,
  targetName = "Target Agent",
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  actionType: OperatorActionType;
  targetName?: string;
  onClose: () => void;
  onConfirm: (actionType: string, targetName: string) => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !actionType) return null;

  let title = "CONFIRM OPERATOR ACTION";
  let description = "Are you sure you want to proceed?";
  let confirmLabel = "CONFIRM ACTION";
  let isDestructive = true;

  switch (actionType) {
    case "KILL_SESSION":
      title = `KILL SESSION ${targetName}?`;
      description =
        "This will immediately terminate the active multi-agent simulation run, drop all in-flight websocket telemetry channels, and revoke runtime worker tokens.";
      confirmLabel = "CONFIRM KILL SESSION";
      break;
    case "QUARANTINE_AGENT":
      title = `QUARANTINE ${targetName.toUpperCase()}?`;
      description =
        "This will sever downstream agent-to-agent communication hops, invalidate cryptographic HMAC handoff tokens, and drop pending tool calls.";
      confirmLabel = `CONFIRM QUARANTINE`;
      break;
    case "BLOCK_TOOL":
      title = `BLOCK TOOL "${targetName}"?`;
      description =
        "This will revoke schema execution rights for the selected tool across all agents in this session and trigger immediate defender policy recompilation.";
      confirmLabel = "CONFIRM BLOCK TOOL";
      break;
    case "DEPLOY_MITIGATION":
      title = `DEPLOY DEFENSIVE MITIGATION?`;
      description =
        "This will push compiled OWASP ASI containment patches to the live runtime policy enforcement layer.";
      confirmLabel = "DEPLOY PATCH";
      isDestructive = false;
      break;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-xs p-4"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "rounded-lg p-2.5",
                isDestructive
                  ? "bg-rose-500/10 text-rose-500 border border-rose-500/30"
                  : "bg-sky-500/10 text-sky-400 border border-sky-500/30"
              )}
            >
              {isDestructive ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
            </div>
            <div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                CRITICAL OPERATIONAL INTERVENTION
              </span>
              <h3
                id="confirm-action-title"
                className="font-sans text-[17px] font-semibold text-foreground tracking-tight"
              >
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cancel and close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <p className="mt-4 font-mono text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>

        {/* Realistic status banner (Section 18 & 30) */}
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-[10px] text-amber-600 dark:text-amber-400">
          <span className="font-semibold uppercase block mb-0.5">
            UI-READY · BACKEND INTEGRATION REQUIRED
          </span>
          Confirming will record this intervention in the local audit stream and stage containment headers. Server-side daemon dispatch is awaiting backend endpoint wiring.
        </div>

        {/* Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 font-mono text-[11px]">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            CANCEL
          </button>

          <button
            type="button"
            onClick={() => {
              onConfirm(actionType, targetName);
              onClose();
            }}
            className={cn(
              "rounded px-4 py-2 font-semibold uppercase tracking-wider transition-colors cursor-pointer text-white",
              isDestructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-sky-600 hover:bg-sky-500"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
