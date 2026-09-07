/** Obsidian-style agent inventory + chain derivation from live screening events. */

import { eventTimestamp } from "@/lib/commandCenterLive";
import { verdictStatus, type VerdictStatus } from "@/lib/commandCenterUi";

type EventRow = Record<string, unknown>;

export interface AgentSummary {
  id: string;
  events: number;
  tools: number;
  sessions: number;
  maxRisk: number;
  avgRisk: number;
  threats: number;
  lastSeen: number;
  status: VerdictStatus;
  topTool: string | null;
}

export interface ChainStep {
  id: string;
  toolName: string;
  agentId: string;
  risk: number;
  verdict: string;
  status: VerdictStatus;
  at: number;
}

const THREAT_RE = /BLOCK|QUARANTINE|BREACH|KILL|DENY/i;

function isThreatRow(e: EventRow): boolean {
  const risk = Number(e.risk_score ?? 0);
  return risk >= 50 || THREAT_RE.test(String(e.verdict ?? ""));
}

/** Roll live events up into a per-agent inventory (Obsidian "find every agent"). */
export function buildAgentInventory(events: EventRow[]): AgentSummary[] {
  const map = new Map<
    string,
    {
      events: number;
      riskSum: number;
      maxRisk: number;
      threats: number;
      lastSeen: number;
      tools: Map<string, number>;
      sessions: Set<string>;
    }
  >();

  for (const e of events) {
    const id = String(e.agent_id ?? "unknown");
    const risk = Number(e.risk_score ?? 0);
    const tool = String(e.tool_name ?? e.event_type ?? "—");
    const session = String(e.session_id ?? "");
    const ts = eventTimestamp(e);

    const cur =
      map.get(id) ??
      {
        events: 0,
        riskSum: 0,
        maxRisk: 0,
        threats: 0,
        lastSeen: 0,
        tools: new Map<string, number>(),
        sessions: new Set<string>(),
      };

    cur.events += 1;
    cur.riskSum += risk;
    cur.maxRisk = Math.max(cur.maxRisk, risk);
    if (isThreatRow(e)) cur.threats += 1;
    cur.lastSeen = Math.max(cur.lastSeen, ts);
    if (tool) cur.tools.set(tool, (cur.tools.get(tool) ?? 0) + 1);
    if (session) cur.sessions.add(session);

    map.set(id, cur);
  }

  return [...map.entries()]
    .map(([id, v]) => {
      const avgRisk = v.events > 0 ? Math.round(v.riskSum / v.events) : 0;
      const topTool =
        [...v.tools.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        id,
        events: v.events,
        tools: v.tools.size,
        sessions: v.sessions.size,
        maxRisk: Math.round(v.maxRisk),
        avgRisk,
        threats: v.threats,
        lastSeen: v.lastSeen,
        status: verdictStatus("", v.maxRisk),
        topTool,
      };
    })
    .sort((a, b) => b.maxRisk - a.maxRisk || b.events - a.events);
}

/** Ordered chain of steps for a session (Obsidian "action chaining" view). */
export function buildSessionChain(events: EventRow[], sessionId: string): ChainStep[] {
  if (!sessionId) return [];
  return events
    .filter((e) => String(e.session_id ?? "") === sessionId)
    .map((e, i) => {
      const risk = Number(e.risk_score ?? 0);
      return {
        id:
          String(e.event_id ?? "") ||
          String(e.id ?? "") ||
          `${sessionId}-${i}`,
        toolName: String(e.tool_name ?? e.event_type ?? "request"),
        agentId: String(e.agent_id ?? "agent"),
        risk: Math.round(risk),
        verdict: String(e.verdict ?? ""),
        status: verdictStatus(String(e.verdict ?? ""), risk),
        at: eventTimestamp(e),
      };
    })
    .sort((a, b) => a.at - b.at);
}

/**
 * Chain-level verdict: even when each step looks safe, escalation across the
 * chain can still be unsafe. Combines peak risk with escalation pressure.
 */
export function scoreChain(steps: ChainStep[]): {
  score: number;
  status: VerdictStatus;
  peak: number;
  escalated: boolean;
} {
  if (!steps.length) return { score: 0, status: "ok", peak: 0, escalated: false };
  const peak = Math.max(...steps.map((s) => s.risk));
  const avg = steps.reduce((n, s) => n + s.risk, 0) / steps.length;
  const escalated = steps.length > 1 && steps[steps.length - 1]!.risk > steps[0]!.risk + 15;
  // Weighted: peak dominates, sustained elevation and escalation add pressure.
  const score = Math.min(
    100,
    Math.round(peak * 0.7 + avg * 0.2 + (escalated ? 15 : 0))
  );
  return { score, status: verdictStatus("", score), peak, escalated };
}
