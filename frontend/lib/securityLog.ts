/**
 * Enterprise security activity log helpers — normalize containment fields,
 * filter predicates, and SIEM-friendly export (JSON / CSV / NDJSON).
 */

import type { TelemetryEvent } from "@/components/shared/LiveTelemetryStream";
import { severityFromScore, type SeverityLabel } from "@/lib/severity";
import { safeTimestamp } from "@/lib/dates";

export type ContainmentAction =
  | "KILL"
  | "QUARANTINE"
  | "ALLOW"
  | "FLAG"
  | "ESCALATE"
  | "UNKNOWN";

export type ActionFilter = "all" | ContainmentAction;

export interface SecurityLogRow {
  id: string;
  timestamp: string;
  sessionId: string;
  agentId: string;
  tool: string;
  riskScore: number;
  severity: SeverityLabel;
  verdict: string;
  action: ContainmentAction;
  actionRaw: string;
  raw: TelemetryEvent;
}

function eventId(evt: TelemetryEvent, index: number): string {
  return (
    String(evt.event_id ?? "").trim() ||
    String(evt.id ?? "").trim() ||
    `evt-${safeTimestamp(String(evt.triggered_at ?? evt.ts ?? ""))}-${index}`
  );
}

export function normalizeContainmentAction(raw: string, verdict = ""): ContainmentAction {
  const s = `${raw} ${verdict}`.toUpperCase();
  if (s.includes("KILL") || s.includes("BREACH") || s.includes("TERMINATE")) return "KILL";
  if (s.includes("QUARANTINE") || s.includes("BLOCK") || s.includes("DENY")) return "QUARANTINE";
  if (s.includes("ESCALATE") || s.includes("ALERT")) return "ESCALATE";
  if (s.includes("FLAG") || s.includes("SUSPICIOUS") || s.includes("WARN")) return "FLAG";
  if (s.includes("ALLOW") || s.includes("SAFE") || s.includes("PASS") || s.includes("PERMIT"))
    return "ALLOW";
  return "UNKNOWN";
}

export function toSecurityLogRows(events: TelemetryEvent[]): SecurityLogRow[] {
  return events.map((evt, i) => {
    const riskScore = Number(evt.risk_score ?? 0);
    const actionRaw = String(evt.action ?? evt.recommended_action ?? "");
    const verdict = String(evt.verdict ?? "");
    return {
      id: eventId(evt, i),
      timestamp: String(evt.triggered_at ?? evt.ts ?? ""),
      sessionId: String(evt.session_id ?? ""),
      agentId: String(evt.agent_id ?? ""),
      tool: String(evt.tool_name ?? evt.event_type ?? "event"),
      riskScore: Number.isFinite(riskScore) ? riskScore : 0,
      severity: severityFromScore(Number.isFinite(riskScore) ? riskScore : 0),
      verdict,
      action: normalizeContainmentAction(actionRaw, verdict),
      actionRaw,
      raw: evt,
    };
  });
}

export function filterSecurityRows(
  rows: SecurityLogRow[],
  opts: {
    query: string;
    severity: "all" | SeverityLabel;
    action: ActionFilter;
  }
): SecurityLogRow[] {
  const q = opts.query.toLowerCase().trim();
  return rows
    .filter((row) => {
      if (opts.severity !== "all" && row.severity !== opts.severity) return false;
      if (opts.action !== "all" && row.action !== opts.action) return false;
      if (!q) return true;
      const hay = [
        row.tool,
        row.verdict,
        row.sessionId,
        row.agentId,
        row.id,
        row.action,
        row.actionRaw,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => safeTimestamp(b.timestamp) - safeTimestamp(a.timestamp));
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Flat record safe for SIEM / ticketing — no raw argument blobs. */
export function toSiemRecord(row: SecurityLogRow): Record<string, string | number> {
  return {
    event_id: row.id,
    timestamp: row.timestamp,
    session_id: row.sessionId,
    agent_id: row.agentId,
    tool: row.tool,
    risk_score: Math.round(row.riskScore * 10) / 10,
    severity: row.severity,
    verdict: row.verdict,
    containment_action: row.action,
    product: "ARTSA",
    log_type: "ai_agent_containment",
  };
}

export function exportSecurityLog(
  rows: SecurityLogRow[],
  format: "json" | "csv" | "ndjson"
): { filename: string; mime: string; body: string } {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const records = rows.map(toSiemRecord);

  if (format === "csv") {
    const headers = [
      "event_id",
      "timestamp",
      "session_id",
      "agent_id",
      "tool",
      "risk_score",
      "severity",
      "verdict",
      "containment_action",
      "product",
      "log_type",
    ];
    const lines = [
      headers.join(","),
      ...records.map((r) =>
        headers.map((h) => csvEscape(String(r[h] ?? ""))).join(",")
      ),
    ];
    return {
      filename: `artsa-security-log-${stamp}.csv`,
      mime: "text/csv;charset=utf-8",
      body: lines.join("\n"),
    };
  }

  if (format === "ndjson") {
    return {
      filename: `artsa-security-log-${stamp}.ndjson`,
      mime: "application/x-ndjson;charset=utf-8",
      body: records.map((r) => JSON.stringify(r)).join("\n"),
    };
  }

  return {
    filename: `artsa-security-log-${stamp}.json`,
    mime: "application/json;charset=utf-8",
    body: JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        product: "ARTSA",
        count: records.length,
        events: records,
      },
      null,
      2
    ),
  };
}

export function downloadSecurityExport(
  rows: SecurityLogRow[],
  format: "json" | "csv" | "ndjson"
): void {
  const { filename, mime, body } = exportSecurityLog(rows, format);
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function actionToneClass(action: ContainmentAction): string {
  switch (action) {
    case "KILL":
      return "text-[hsl(var(--severity-critical))]";
    case "QUARANTINE":
      return "text-[hsl(var(--severity-high))]";
    case "ESCALATE":
    case "FLAG":
      return "text-[hsl(var(--severity-medium))]";
    case "ALLOW":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}
