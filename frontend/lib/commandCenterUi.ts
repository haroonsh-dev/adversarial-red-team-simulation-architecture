/** Command Center design system — Lakera-clean + Splunk triage density. */

export const MC = {
  bg: "hsl(var(--background))",
  surface: "hsl(var(--card))",
  elevated: "hsl(var(--muted))",
  hover: "hsl(var(--accent))",
  border: "hsl(var(--border))",
  borderSubtle: "hsl(var(--border) / 0.7)",
  text: "hsl(var(--foreground))",
  textSecondary: "hsl(var(--muted-foreground))",
  textDim: "hsl(var(--muted-foreground))",
  accent: "#67b3ef",
  accentMuted: "hsl(var(--primary) / 0.12)",
  accentBorder: "hsl(var(--primary) / 0.35)",
  ok: "#22c55e",
  okBg: "rgba(34, 197, 94, 0.1)",
  okBorder: "rgba(34, 197, 94, 0.25)",
  warn: "#ff9d03",
  warnBg: "rgba(255, 157, 3, 0.1)",
  warnBorder: "rgba(255, 157, 3, 0.28)",
  block: "#ef4444",
  blockBg: "rgba(239, 68, 68, 0.1)",
  blockBorder: "rgba(239, 68, 68, 0.28)",
  live: "#67b3ef",
  radius: "16px",
  rowH: "40px",
} as const;

export const CC = {
  header: "text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
  sub: "text-[12px] text-muted-foreground",
  zoneTitle: "text-[13px] font-semibold text-foreground",
} as const;

export type MobileWorkbenchTab = "queue" | "graph" | "panel";
export type LakeraMobileTab = "log" | "detail";
export type VerdictStatus = "ok" | "warn" | "block";

export function verdictStatus(verdict: string, risk = 0): VerdictStatus {
  const v = verdict.toUpperCase();
  if (/BLOCK|QUARANTINE|BREACH|KILL|DENY/.test(v) || risk >= 80) return "block";
  if (/WARN|SUSPICIOUS|ELEVATED|FLAG/.test(v) || risk >= 50) return "warn";
  return "ok";
}

export function riskTone(score: number): "critical" | "high" | "medium" | "low" | "none" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score > 0) return "low";
  return "none";
}

export const RISK_STYLES = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  none: "text-muted-foreground bg-muted/50 border-border",
} as const;

export const VERDICT_STYLES: Record<
  VerdictStatus,
  { pill: string; dot: string; label: string }
> = {
  ok: {
    pill: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/25",
    dot: "bg-emerald-500",
    label: "Clear",
  },
  warn: {
    pill: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/25",
    dot: "bg-amber-500",
    label: "Flagged",
  },
  block: {
    pill: "bg-red-500/10 text-red-400 ring-1 ring-red-500/25",
    dot: "bg-red-500",
    label: "Blocked",
  },
};

export function severityBarWidth(count: number, total: number): string {
  if (total <= 0 || count <= 0) return "0%";
  return `${Math.max(2, (count / total) * 100)}%`;
}
