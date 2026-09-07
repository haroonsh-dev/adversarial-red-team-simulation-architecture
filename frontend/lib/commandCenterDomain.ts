/**
 * Command Center domain models + adapters.
 * UI never reads raw API shapes directly for posture / feed / ops.
 */

import type { CampaignListItem } from "@/lib/hooks/useCampaigns";
import type { ServerFinding } from "@/lib/hooks/useFindings";
import type { DashboardMetrics } from "@/lib/hooks/useDashboardMetrics";
import type { CommandGraphModel } from "@/lib/commandGraph";

export type PostureStatus =
  | "operational"
  | "monitoring"
  | "elevated"
  | "under_attack"
  | "incident"
  | "containment"
  | "degraded"
  | "offline"
  | "unknown";

export type TelemetryHealth = "connected" | "degraded" | "offline";

export type CcEventType =
  | "session"
  | "agent"
  | "tool_call"
  | "retrieval"
  | "policy"
  | "detection"
  | "block"
  | "containment"
  | "red_team"
  | "data_access";

export type CcSeverity = "info" | "low" | "medium" | "high" | "critical";

export type CcResult =
  | "allowed"
  | "blocked"
  | "detected"
  | "failed"
  | "started"
  | "completed"
  | "unknown";

export type SecurityPosture = {
  status: PostureStatus;
  label: string;
  agents: number;
  activeSessions: number;
  connectedTools: number;
  activeOperations: number;
  openFindings: number;
  criticalFindings: number;
  telemetryStatus: TelemetryHealth;
  lastEventAt?: string;
  /** Compact severity strip — secondary, not hero cards */
  severityStrip: { critical: number; high: number; medium: number; low: number };
  dataReliable: boolean;
};

export type ActiveOperation = {
  id: string;
  name: string;
  target: string;
  status: string;
  progressPct: number;
  findings: number;
  blocked: number;
  roundsCompleted: number;
  totalRounds: number;
  href: string;
};

export type AttentionItem = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  subject: string;
  when: string;
  href: string;
};

export type NormalizedEvent = {
  id: string;
  timestamp: string;
  type: CcEventType;
  severity: CcSeverity;
  sessionId?: string;
  agentId?: string;
  toolId?: string;
  action?: string;
  target?: string;
  result: CcResult;
  raw: Record<string, unknown>;
};

export type AttackPathStep = {
  id: string;
  label: string;
  kind: string;
};

export function deriveSecurityPosture(input: {
  apiOnline: boolean;
  wsConnected: boolean;
  metrics: DashboardMetrics | null;
  metricsLoading: boolean;
  metricsFailed?: boolean;
  graph: CommandGraphModel;
  findings: ServerFinding[];
  campaigns: CampaignListItem[];
  lastEventAt?: string;
}): SecurityPosture {
  const { apiOnline, wsConnected, metrics, metricsLoading, metricsFailed, graph, findings, campaigns } =
    input;

  if (!apiOnline) {
    return {
      status: "offline",
      label: "OFFLINE",
      agents: 0,
      activeSessions: 0,
      connectedTools: 0,
      activeOperations: 0,
      openFindings: 0,
      criticalFindings: 0,
      telemetryStatus: "offline",
      lastEventAt: input.lastEventAt,
      severityStrip: { critical: 0, high: 0, medium: 0, low: 0 },
      dataReliable: false,
    };
  }

  if (metricsFailed) {
    return {
      status: "unknown",
      label: "UNKNOWN — METRICS UNAVAILABLE",
      agents: graph.nodes.filter((n) => n.kind === "agent").length,
      activeSessions: 0,
      connectedTools: graph.nodes.filter((n) => n.kind === "tool").length,
      activeOperations: 0,
      openFindings: findings.length,
      criticalFindings: findings.filter((f) => f.severity === "CRITICAL").length,
      telemetryStatus: wsConnected ? "degraded" : "offline",
      lastEventAt: input.lastEventAt,
      severityStrip: { critical: 0, high: 0, medium: 0, low: 0 },
      dataReliable: false,
    };
  }

  const counts = metrics?.severity_counts ?? {};
  const critical = Number(counts.CRITICAL ?? 0);
  const high = Number(counts.HIGH ?? 0);
  const medium = Number(counts.MEDIUM ?? 0);
  const low = Number(counts.LOW ?? 0);
  const openFindings = findings.filter((f) => {
    const s = (f.status ?? "").toLowerCase();
    return !s.includes("closed") && !s.includes("resolved");
  }).length;
  const criticalFindings =
    findings.filter((f) => f.severity === "CRITICAL").length || critical;

  const activeOps = campaigns.filter((c) =>
    /run|active|progress|pending/i.test(c.status)
  ).length;

  const agents = Math.max(
    graph.nodes.filter((n) => n.kind === "agent").length,
    graph.activeCount > 0 ? 1 : 0
  );
  const tools = graph.nodes.filter((n) => n.kind === "tool").length;
  const sessions = metrics?.active_sessions ?? 0;

  const quarantineEdges = graph.edges.filter((e) => e.status === "QUARANTINED").length;
  const compromised = graph.compromisedCount;

  let status: PostureStatus = "operational";
  let label = "OPERATIONAL";

  if (criticalFindings > 0 || critical > 0) {
    status = "incident";
    label = "INCIDENT";
  } else if (quarantineEdges > 0 || /QUARANTINE/i.test(JSON.stringify(graph.nodes.map((n) => n.status)))) {
    status = "containment";
    label = "CONTAINMENT ACTIVE";
  } else if (compromised > 0 || high >= 2) {
    status = "under_attack";
    label = "UNDER ATTACK";
  } else if (high > 0 || medium >= 3 || activeOps > 0) {
    status = "elevated";
    label = "ELEVATED";
  } else if (graph.source !== "idle" || (metrics?.total_events ?? 0) > 0) {
    status = "monitoring";
    label = "MONITORING";
  } else if (!metricsLoading) {
    status = "operational";
    label = "OPERATIONAL";
  }

  const telemetryStatus: TelemetryHealth = wsConnected
    ? "connected"
    : apiOnline
      ? "degraded"
      : "offline";

  return {
    status,
    label,
    agents,
    activeSessions: sessions,
    connectedTools: tools,
    activeOperations: activeOps,
    openFindings: openFindings || critical + high + medium,
    criticalFindings,
    telemetryStatus,
    lastEventAt: input.lastEventAt,
    severityStrip: { critical, high, medium, low },
    dataReliable: true,
  };
}

export function deriveActiveOperations(campaigns: CampaignListItem[]): ActiveOperation[] {
  return campaigns
    .filter((c) => /run|active|progress|pending|paused/i.test(c.status))
    .map((c) => {
      const summary = c.summary ?? {};
      const findings = Number(summary.findings_count ?? summary.findings ?? 0);
      const blocked = Number(summary.blocked_count ?? summary.blocked ?? 0);
      const total = Math.max(1, c.total_rounds || 1);
      const done = c.rounds_completed || 0;
      return {
        id: c.id,
        name: c.name || c.id,
        target: String(summary.target ?? c.model ?? "agent"),
        status: c.status,
        progressPct: Math.min(100, Math.round((done / total) * 100)),
        findings,
        blocked,
        roundsCompleted: done,
        totalRounds: total,
        href: `/red-team/monitor/${encodeURIComponent(c.id)}`,
      };
    });
}

export function deriveAttentionItems(
  findings: ServerFinding[],
  events: NormalizedEvent[],
  limit = 6
): AttentionItem[] {
  const fromFindings: AttentionItem[] = findings
    .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH" || f.severity === "MEDIUM")
    .slice(0, limit)
    .map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title || f.category || "Finding",
      subject: f.source_ref || f.source || "—",
      when: f.timestamp ? relativeWhen(f.timestamp) : "—",
      href: `/findings`,
    }));

  if (fromFindings.length > 0) return fromFindings.slice(0, limit);

  return events
    .filter((e) => e.severity === "critical" || e.severity === "high" || e.result === "blocked")
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      severity: (e.severity === "critical"
        ? "CRITICAL"
        : e.severity === "high"
          ? "HIGH"
          : e.severity === "medium"
            ? "MEDIUM"
            : "LOW") as AttentionItem["severity"],
      title: `${e.type.replace("_", " ")} · ${e.result}`,
      subject: e.agentId || e.sessionId || e.toolId || "bus",
      when: relativeWhen(e.timestamp),
      href: e.sessionId ? `/replay?session=${encodeURIComponent(e.sessionId)}` : "/logs",
    }));
}

export function normalizeTelemetryEvent(
  raw: Record<string, unknown>,
  index = 0
): NormalizedEvent {
  const tool = String(raw.tool_name ?? raw.event_type ?? "");
  const verdict = String(raw.verdict ?? "").toUpperCase();
  const action = String(raw.action ?? raw.recommended_action ?? "").toUpperCase();
  const risk = Number(raw.risk_score ?? 0);
  const ts = String(raw.triggered_at ?? raw.timestamp ?? raw.ts ?? new Date().toISOString());
  const id =
    String(raw.event_id ?? raw.id ?? "") ||
    `${ts}-${tool}-${index}`;

  let type: CcEventType = "tool_call";
  if (/session/i.test(tool) || raw.type === "session") type = "session";
  else if (/retriev|rag|embed|search/i.test(tool)) type = "retrieval";
  else if (/policy|guard|align/i.test(tool) || /POLICY/.test(verdict)) type = "policy";
  else if (/red.?team|campaign|attack/i.test(tool)) type = "red_team";
  else if (/contain|quarantine|kill/i.test(action) || raw.type === "session_action") type = "containment";
  else if (/data|file|db|sql/i.test(tool)) type = "data_access";
  else if (risk >= 50 || /BREACH|SUSPICIOUS|DETECT/.test(verdict)) type = "detection";
  else if (/BLOCK|DENY|KILL|QUARANTINE/.test(action) || /BLOCK/.test(verdict)) type = "block";

  let severity: CcSeverity = "info";
  if (risk >= 80 || /BREACH|KILL/.test(verdict)) severity = "critical";
  else if (risk >= 60) severity = "high";
  else if (risk >= 40) severity = "medium";
  else if (risk > 0) severity = "low";

  let result: CcResult = "unknown";
  if (/ALLOW|PASS|SAFE|NOMINAL/.test(verdict) || action === "ALLOW") result = "allowed";
  else if (/BLOCK|DENY|QUARANTINE|KILL/.test(action) || /BLOCK|QUARANTINE/.test(verdict))
    result = "blocked";
  else if (/BREACH|DETECT|SUSPICIOUS/.test(verdict)) result = "detected";
  else if (/FAIL|ERROR/.test(verdict)) result = "failed";
  else if (/START/.test(verdict)) result = "started";
  else if (/COMPLETE|END/.test(verdict)) result = "completed";
  else if (risk < 40) result = "allowed";

  return {
    id,
    timestamp: ts,
    type,
    severity,
    sessionId: raw.session_id ? String(raw.session_id) : undefined,
    agentId: raw.agent_id ? String(raw.agent_id) : undefined,
    toolId: tool || undefined,
    action: action || undefined,
    target: raw.target ? String(raw.target) : tool || undefined,
    result,
    raw,
  };
}

export function deriveAttackPath(graph: CommandGraphModel, finding?: ServerFinding | null): AttackPathStep[] {
  if (finding?.custody_chain?.length) {
    return finding.custody_chain.map((c, i) => ({
      id: `${c.agent}-${i}`,
      label: c.label || c.agent,
      kind: c.action || "hop",
    }));
  }
  const hot = [...graph.nodes].sort((a, b) => b.riskScore - a.riskScore).slice(0, 4);
  if (hot.length === 0) return [];
  return hot.map((n) => ({ id: n.id, label: n.label, kind: n.kind }));
}

function relativeWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function postureTone(status: PostureStatus): string {
  if (status === "incident" || status === "under_attack") return "text-red-400 border-red-500/40";
  if (status === "containment" || status === "elevated") return "text-amber-400 border-amber-500/40";
  if (status === "offline" || status === "unknown" || status === "degraded")
    return "text-zinc-400 border-zinc-600";
  if (status === "monitoring" || status === "operational") return "text-emerald-400 border-emerald-500/35";
  return "text-foreground/80 border-zinc-600";
}
