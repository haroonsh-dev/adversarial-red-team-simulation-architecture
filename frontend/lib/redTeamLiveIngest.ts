/** Map Command Center ingest telemetry → Red Team Live Monitor shapes. */

import {
  detectionRateFromEvents,
  idleAgents,
  type LiveAgentName,
  type LiveAgentState,
  type LiveMonitorEvent,
  type LiveOutcome,
} from "@/lib/liveMonitorEvents";

const LIVE_FEED_ID = "live-ingest";

function verdictToOutcome(verdict: string, risk: number): LiveOutcome {
  const v = verdict.toUpperCase();
  if (v.includes("BREACH") || v === "KILL" || risk >= 80) return "fail";
  if (v.includes("SAFE") || v === "NONE" || risk < 40) return "pass";
  return "flag";
}

function actorFromTelemetry(evt: Record<string, unknown>): string {
  const tool = String(evt.tool_name ?? "").toLowerCase();
  if (tool === "user_prompt" || tool.includes("prompt")) return "red_team";
  if (tool === "model_output") return "target";
  if (tool.includes("exec") || tool.includes("shell") || tool.includes("command")) return "target";
  return String(evt.agent_id ?? "agent");
}

/** Convert live telemetry rows into Live Monitor stream events (newest first input OK). */
export function telemetryToLiveMonitorEvents(
  events: Array<Record<string, unknown>>
): LiveMonitorEvent[] {
  // Oldest → newest for seq; UI stream usually shows newest first via reverse display
  const chronological = [...events].reverse();
  return chronological.map((evt, i) => {
    const risk = Number(evt.risk_score ?? 0);
    const verdict = String(evt.verdict ?? evt.action ?? "");
    const tool = String(evt.tool_name ?? "tool");
    const agent = String(evt.agent_id ?? "agent");
    const outcome = verdictToOutcome(verdict, risk);
    const ts = String(evt.timestamp ?? evt.triggered_at ?? new Date().toISOString());
    return {
      type: "campaign_live",
      campaign_id: LIVE_FEED_ID,
      seq: i + 1,
      ts,
      kind: "verdict" as const,
      outcome,
      actor: actorFromTelemetry(evt),
      round: i + 1,
      attack_type: tool,
      summary: `${agent} · ${tool} · ${verdict || "SCAN"} · R${Math.round(risk)}`,
      campaign_status: "LIVE",
    };
  });
}

/** Newest-first view for the event list. */
export function liveIngestStreamNewestFirst(
  events: Array<Record<string, unknown>>
): LiveMonitorEvent[] {
  return telemetryToLiveMonitorEvents(events).reverse();
}

export function agentsFromTelemetry(
  events: Array<Record<string, unknown>>
): Record<LiveAgentName, LiveAgentState> {
  const agents = idleAgents();
  if (!events.length) return agents;

  const latest = events[0]!;
  const risk = Number(latest.risk_score ?? 0);
  const verdict = String(latest.verdict ?? "").toUpperCase();
  const hot = risk >= 60 || verdict.includes("BREACH");

  agents.red_team = "done";
  agents.target = "done";
  agents.judge = "done";
  agents.defender = hot ? "running" : "done";
  agents.research = "idle";
  agents.curator = "idle";
  return agents;
}

export function ingestDetectionStats(events: Array<Record<string, unknown>>) {
  const mapped = telemetryToLiveMonitorEvents(events);
  const base = detectionRateFromEvents(mapped);
  // For ingest: "pass" = contained/safe; invert naming for ops clarity as detect%
  const fails = mapped.filter((e) => e.outcome === "fail").length;
  const judged = mapped.filter((e) => e.outcome).length;
  const detectPct = judged > 0 ? Math.round((fails / judged) * 1000) / 10 : null;
  const riskSpark = events
    .slice(0, 24)
    .map((e) => Number(e.risk_score ?? 0))
    .reverse();
  return {
    ...base,
    detectPct,
    fails,
    riskSpark,
    total: events.length,
  };
}

export function severityBuckets(events: Array<Record<string, unknown>>) {
  const buckets = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const e of events) {
    const sev = String(e.severity ?? "").toUpperCase();
    const risk = Number(e.risk_score ?? 0);
    if (sev === "CRITICAL" || risk >= 80) buckets.CRITICAL += 1;
    else if (sev === "HIGH" || risk >= 60) buckets.HIGH += 1;
    else if (sev === "MEDIUM" || risk >= 40) buckets.MEDIUM += 1;
    else buckets.LOW += 1;
  }
  return buckets;
}

export type LiveAiActivityModel = {
  riskSeries: Array<{ i: number; label: string; risk: number; critical: number }>;
  tools: Array<{ tool: string; count: number; maxRisk: number }>;
  agents: Array<{ agent: string; count: number; maxRisk: number }>;
  detectors: Array<{ name: string; hits: number }>;
  pipeline: Array<{
    id: string;
    label: string;
    detail: string;
    active: boolean;
    hot: boolean;
  }>;
  latest: Record<string, unknown> | null;
};

/** Full AI activity model for live visualization panels. */
export function buildLiveAiActivity(
  events: Array<Record<string, unknown>>
): LiveAiActivityModel {
  const chronological = [...events].reverse();
  const riskSeries = chronological.slice(-32).map((e, i) => {
    const risk = Number(e.risk_score ?? 0);
    return {
      i: i + 1,
      label: String(i + 1),
      risk,
      critical: risk >= 80 ? risk : 0,
    };
  });

  const toolMap = new Map<string, { count: number; maxRisk: number }>();
  const agentMap = new Map<string, { count: number; maxRisk: number }>();
  const detectorMap = new Map<string, number>();

  for (const e of events) {
    const tool = String(e.tool_name ?? "unknown");
    const agent = String(e.agent_id ?? "unknown");
    const risk = Number(e.risk_score ?? 0);
    const t = toolMap.get(tool) ?? { count: 0, maxRisk: 0 };
    toolMap.set(tool, { count: t.count + 1, maxRisk: Math.max(t.maxRisk, risk) });
    const a = agentMap.get(agent) ?? { count: 0, maxRisk: 0 };
    agentMap.set(agent, { count: a.count + 1, maxRisk: Math.max(a.maxRisk, risk) });

    const dets = e.detectors;
    if (Array.isArray(dets)) {
      for (const d of dets) {
        const name = String(d).replace(/Detector$/i, "");
        detectorMap.set(name, (detectorMap.get(name) ?? 0) + 1);
      }
    }
    const sec = e.security_events;
    if (Array.isArray(sec)) {
      for (const s of sec) {
        if (s && typeof s === "object" && "detector" in s) {
          const name = String((s as { detector: unknown }).detector).replace(/Detector$/i, "");
          detectorMap.set(name, (detectorMap.get(name) ?? 0) + 1);
        }
      }
    }
  }

  const tools = [...toolMap.entries()]
    .map(([tool, meta]) => ({ tool, ...meta }))
    .sort((a, b) => b.count - a.count || b.maxRisk - a.maxRisk)
    .slice(0, 8);
  const agents = [...agentMap.entries()]
    .map(([agent, meta]) => ({ agent, ...meta }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const detectors = [...detectorMap.entries()]
    .map(([name, hits]) => ({ name, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8);

  const latest = events[0] ?? null;
  const risk = Number(latest?.risk_score ?? 0);
  const verdict = String(latest?.verdict ?? "—");
  const tool = String(latest?.tool_name ?? "—");
  const agent = String(latest?.agent_id ?? "—");
  const action = String(latest?.action ?? latest?.recommended_action ?? "NONE");
  const hot = risk >= 60 || verdict.toUpperCase().includes("BREACH");
  const dets = Array.isArray(latest?.detectors)
    ? (latest!.detectors as unknown[]).map(String).slice(0, 3).join(", ")
    : "—";

  const pipeline = [
    {
      id: "prompt",
      label: "AI input",
      detail: tool,
      active: Boolean(latest),
      hot: false,
    },
    {
      id: "agent",
      label: "Agent",
      detail: agent,
      active: Boolean(latest),
      hot: false,
    },
    {
      id: "detect",
      label: "Detectors",
      detail: dets || "scanning",
      active: Boolean(latest),
      hot,
    },
    {
      id: "verdict",
      label: "Verdict",
      detail: `${verdict} · R${Math.round(risk)}`,
      active: Boolean(latest),
      hot,
    },
    {
      id: "action",
      label: "Action",
      detail: action,
      active: Boolean(latest),
      hot: action.toUpperCase() === "KILL" || action.toUpperCase() === "QUARANTINE",
    },
  ];

  return { riskSeries, tools, agents, detectors, pipeline, latest };
}

export { LIVE_FEED_ID };

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type LiveResearchAnalytics = {
  n: number;
  meanRisk: number | null;
  medianRisk: number | null;
  p95Risk: number | null;
  maxRisk: number;
  breachRate: number | null;
  flagRate: number | null;
  containRate: number | null;
  criticalShare: number | null;
  eventsPerMin: number | null;
  riskDelta: number | null;
  topToolShare: number | null;
  topTool: string | null;
  topDetector: string | null;
  histogram: Array<{ bin: string; count: number; fill: string }>;
  rollingRisk: Array<{ i: number; label: string; risk: number; rolling: number }>;
  toolExposure: Array<{
    tool: string;
    count: number;
    share: number;
    meanRisk: number;
    maxRisk: number;
  }>;
  agentExposure: Array<{
    agent: string;
    count: number;
    share: number;
    meanRisk: number;
    maxRisk: number;
  }>;
  detectorShare: Array<{ name: string; hits: number; share: number }>;
  outcomeMix: Array<{ name: string; value: number; fill: string }>;
  /** Newest-first rows for the live blotter (real ingest fields only). */
  eventRows: LiveMonitorEventRow[];
  sessionCount: number;
  latestAgeSec: number | null;
  finding: string;
  posture: "calm" | "elevated" | "critical" | "empty";
};

export type LiveMonitorEventRow = {
  id: string;
  ts: string;
  ageSec: number | null;
  agent: string;
  tool: string;
  session: string;
  verdict: string;
  action: string;
  risk: number;
  severity: string;
  detectors: string[];
  outcome: LiveOutcome;
  mitre: string;
  asi: string;
};

function inferTaxonomy(blob: string): { mitre: string; asi: string } {
  const t = blob.toLowerCase();
  if (t.includes("jailbreak") || t.includes("jbk")) return { mitre: "AML.T0054", asi: "ASI10" };
  if (t.includes("exfil") || t.includes("data_extract") || t.includes("dex")) {
    return { mitre: "AML.T0057", asi: "ASI06" };
  }
  if (t.includes("goal") || t.includes("plugin") || t.includes("tpa")) {
    return { mitre: "AML.T0053", asi: "ASI02" };
  }
  if (t.includes("prompt") || t.includes("injection") || t.includes("dpi")) {
    return { mitre: "AML.T0051", asi: "ASI01" };
  }
  return { mitre: "—", asi: "—" };
}

/** MITRE ATLAS + ASI tags from ingest fields, with detector fallback. */
export function eventTaxonomy(
  e: Record<string, unknown>,
  detectors: string[] = []
): { mitre: string; asi: string } {
  const mitreRaw = String(
    e.mitre_atlas ?? e.mitre ?? e.atlas ?? e.mitre_atlas_mapping ?? ""
  ).trim();
  const asiRaw = String(e.asi_code ?? e.asi ?? "").trim();
  const inferred = inferTaxonomy(
    `${e.category ?? ""} ${e.tool_name ?? ""} ${detectors.join(" ")}`
  );
  const mitre = mitreRaw
    ? (mitreRaw.match(/AML\.[A-Z]\d+/i)?.[0] ?? mitreRaw)
    : inferred.mitre;
  const asi = asiRaw || inferred.asi;
  return { mitre: mitre || "—", asi: asi || "—" };
}

function eventAgeSec(ts: string, now = Date.now()): number | null {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}

export type LiveMonitorWindow = "all" | "15m" | "1h" | "session";

/** Filter ingest events by analysis window before deriving Monitor analytics. */
export function filterEventsByWindow(
  events: Array<Record<string, unknown>>,
  window: LiveMonitorWindow,
  now = Date.now()
): Array<Record<string, unknown>> {
  if (window === "all" || events.length === 0) return events;

  if (window === "session") {
    const latest = events[0];
    const session = String(latest?.session_id ?? latest?.sessionId ?? "");
    if (!session || session === "—") return events.slice(0, 1);
    return events.filter((e) => String(e.session_id ?? e.sessionId ?? "") === session);
  }

  const maxAgeSec = window === "15m" ? 15 * 60 : 60 * 60;
  return events.filter((e) => {
    const ts = String(e.timestamp ?? e.triggered_at ?? "");
    const age = eventAgeSec(ts, now);
    return age != null && age <= maxAgeSec;
  });
}

export function buildLiveMonitorEventRows(
  events: Array<Record<string, unknown>>,
  limit = 80
): LiveMonitorEventRow[] {
  const now = Date.now();
  return events.slice(0, limit).map((e, i) => {
    const risk = Number(e.risk_score ?? 0);
    const verdict = String(e.verdict ?? e.action ?? "");
    const ts = String(e.timestamp ?? e.triggered_at ?? "");
    const dets = Array.isArray(e.detectors)
      ? (e.detectors as unknown[]).map((d) => String(d).replace(/Detector$/i, ""))
      : [];
    return {
      id: String(e.event_id ?? e.id ?? `${ts}-${i}`),
      ts,
      ageSec: eventAgeSec(ts, now),
      agent: String(e.agent_id ?? "—"),
      tool: String(e.tool_name ?? "—"),
      session: String(e.session_id ?? "—"),
      verdict: verdict || "—",
      action: String(e.recommended_action ?? e.action ?? "—"),
      risk: Math.round(risk),
      severity: String(e.severity ?? "").toUpperCase() || (risk >= 80 ? "CRITICAL" : risk >= 60 ? "HIGH" : risk >= 40 ? "MEDIUM" : "LOW"),
      detectors: dets.slice(0, 6),
      outcome: verdictToOutcome(verdict, risk),
      ...eventTaxonomy(e, dets),
    };
  });
}

/** Research / DS desk: rates, distribution, concentration, narrative finding. */
export function deriveLiveResearchAnalytics(
  events: Array<Record<string, unknown>>
): LiveResearchAnalytics {
  const n = events.length;
  if (!n) {
    return {
      n: 0,
      meanRisk: null,
      medianRisk: null,
      p95Risk: null,
      maxRisk: 0,
      breachRate: null,
      flagRate: null,
      containRate: null,
      criticalShare: null,
      eventsPerMin: null,
      riskDelta: null,
      topToolShare: null,
      topTool: null,
      topDetector: null,
      histogram: [],
      rollingRisk: [],
      toolExposure: [],
      agentExposure: [],
      detectorShare: [],
      outcomeMix: [],
      eventRows: [],
      sessionCount: 0,
      latestAgeSec: null,
      finding: "No live activity yet.",
      posture: "empty",
    };
  }

  const chronological = [...events].reverse();
  const risks = chronological.map((e) => Number(e.risk_score ?? 0));
  const sorted = [...risks].sort((a, b) => a - b);
  const meanRisk = mean(risks);
  const medianRisk = percentile(sorted, 50);
  const p95Risk = percentile(sorted, 95);
  const maxRisk = Math.max(...risks);

  const mapped = telemetryToLiveMonitorEvents(events);
  const breaches = mapped.filter((e) => e.outcome === "fail").length;
  const flags = mapped.filter((e) => e.outcome === "flag").length;
  const contains = mapped.filter((e) => e.outcome === "pass").length;
  const judged = breaches + flags + contains;
  const breachRate = judged > 0 ? round1((breaches / judged) * 100) : null;
  const flagRate = judged > 0 ? round1((flags / judged) * 100) : null;
  const containRate = judged > 0 ? round1((contains / judged) * 100) : null;

  const sev = severityBuckets(events);
  const criticalShare = round1((sev.CRITICAL / n) * 100);

  let eventsPerMin: number | null = null;
  const t0 = Date.parse(String(chronological[0]?.timestamp ?? chronological[0]?.triggered_at ?? ""));
  const t1 = Date.parse(
    String(chronological[chronological.length - 1]?.timestamp ?? chronological[chronological.length - 1]?.triggered_at ?? "")
  );
  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
    eventsPerMin = round1(n / ((t1 - t0) / 60000));
  }

  const half = Math.floor(risks.length / 2);
  const early = mean(risks.slice(0, Math.max(1, half)));
  const late = mean(risks.slice(half));
  const riskDelta =
    early != null && late != null ? round1(late - early) : null;

  const bins = [
    { bin: "0–20", lo: 0, hi: 20, fill: "#6b7280" },
    { bin: "20–40", lo: 20, hi: 40, fill: "hsl(var(--severity-low))" },
    { bin: "40–60", lo: 40, hi: 60, fill: "hsl(var(--severity-medium))" },
    { bin: "60–80", lo: 60, hi: 80, fill: "hsl(var(--severity-high))" },
    { bin: "80–100", lo: 80, hi: 101, fill: "hsl(var(--severity-critical))" },
  ];
  const histogram = bins.map((b) => ({
    bin: b.bin,
    count: risks.filter((r) => r >= b.lo && r < b.hi).length,
    fill: b.fill,
  }));

  const window = chronological.slice(-40);
  let rollSum = 0;
  const rollingRisk = window.map((e, i) => {
    const risk = Number(e.risk_score ?? 0);
    rollSum += risk;
    return {
      i: i + 1,
      label: String(i + 1),
      risk,
      rolling: round1(rollSum / (i + 1)),
    };
  });

  const toolMap = new Map<string, { count: number; sum: number; maxRisk: number }>();
  const agentMap = new Map<string, { count: number; sum: number; maxRisk: number }>();
  const detectorMap = new Map<string, number>();
  const sessions = new Set<string>();
  for (const e of events) {
    const tool = String(e.tool_name ?? "unknown");
    const agent = String(e.agent_id ?? "unknown");
    const risk = Number(e.risk_score ?? 0);
    const sid = String(e.session_id ?? "");
    if (sid) sessions.add(sid);
    const t = toolMap.get(tool) ?? { count: 0, sum: 0, maxRisk: 0 };
    toolMap.set(tool, {
      count: t.count + 1,
      sum: t.sum + risk,
      maxRisk: Math.max(t.maxRisk, risk),
    });
    const a = agentMap.get(agent) ?? { count: 0, sum: 0, maxRisk: 0 };
    agentMap.set(agent, {
      count: a.count + 1,
      sum: a.sum + risk,
      maxRisk: Math.max(a.maxRisk, risk),
    });
    const dets = e.detectors;
    if (Array.isArray(dets)) {
      for (const d of dets) {
        const name = String(d).replace(/Detector$/i, "");
        detectorMap.set(name, (detectorMap.get(name) ?? 0) + 1);
      }
    }
  }

  const toolExposure = [...toolMap.entries()]
    .map(([tool, m]) => ({
      tool,
      count: m.count,
      share: round1((m.count / n) * 100),
      meanRisk: round1(m.sum / m.count),
      maxRisk: Math.round(m.maxRisk),
    }))
    .sort((a, b) => b.count - a.count || b.maxRisk - a.maxRisk)
    .slice(0, 10);

  const agentExposure = [...agentMap.entries()]
    .map(([agent, m]) => ({
      agent,
      count: m.count,
      share: round1((m.count / n) * 100),
      meanRisk: round1(m.sum / m.count),
      maxRisk: Math.round(m.maxRisk),
    }))
    .sort((a, b) => b.count - a.count || b.maxRisk - a.maxRisk)
    .slice(0, 10);

  const detHits = [...detectorMap.values()].reduce((a, b) => a + b, 0) || 1;
  const detectorShare = [...detectorMap.entries()]
    .map(([name, hits]) => ({ name, hits, share: round1((hits / detHits) * 100) }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 8);

  const topTool = toolExposure[0] ?? null;
  const topToolShare = topTool?.share ?? null;
  const topDetector = detectorShare[0]?.name ?? null;

  const outcomeMix = [
    { name: "Breach", value: breaches, fill: "hsl(var(--severity-critical))" },
    { name: "Flag", value: flags, fill: "hsl(var(--severity-medium))" },
    { name: "Contain", value: contains, fill: "hsl(var(--severity-low))" },
  ].filter((d) => d.value > 0);

  let posture: LiveResearchAnalytics["posture"] = "calm";
  if (sev.CRITICAL > 0 || maxRisk >= 80 || (breachRate ?? 0) >= 25) posture = "critical";
  else if (maxRisk >= 60 || (breachRate ?? 0) >= 10 || (criticalShare ?? 0) >= 10) posture = "elevated";

  const parts: string[] = [];
  parts.push(`n=${n}`);
  if (meanRisk != null) parts.push(`μ risk ${round1(meanRisk)}`);
  if (p95Risk != null) parts.push(`p95 ${Math.round(p95Risk)}`);
  if (breachRate != null) parts.push(`breach ${breachRate}%`);
  if (topTool) parts.push(`${topTool.tool} dominates ${topTool.share}% of volume`);
  if (riskDelta != null && Math.abs(riskDelta) >= 5) {
    parts.push(riskDelta > 0 ? `risk rising +${riskDelta}` : `risk easing ${riskDelta}`);
  }
  if (topDetector) parts.push(`top detector ${topDetector}`);
  if (sessions.size) parts.push(`${sessions.size} session${sessions.size === 1 ? "" : "s"}`);

  let finding: string;
  if (posture === "critical") {
    finding = `Critical window: ${parts.join(" · ")}. Open a live campaign theater or run another probe to pressure-test containment.`;
  } else if (posture === "elevated") {
    finding = `Elevated posture: ${parts.join(" · ")}. Drift is material — watch the risk path and which tools stand out.`;
  } else {
    finding = `Stable sample: ${parts.join(" · ")}. Keep watching; launch a campaign when you want multi-round pressure.`;
  }

  const latestTs = String(events[0]?.timestamp ?? events[0]?.triggered_at ?? "");

  return {
    n,
    meanRisk: meanRisk != null ? round1(meanRisk) : null,
    medianRisk: medianRisk != null ? round1(medianRisk) : null,
    p95Risk: p95Risk != null ? round1(p95Risk) : null,
    maxRisk: Math.round(maxRisk),
    breachRate,
    flagRate,
    containRate,
    criticalShare,
    eventsPerMin,
    riskDelta,
    topToolShare,
    topTool: topTool?.tool ?? null,
    topDetector,
    histogram,
    rollingRisk,
    toolExposure,
    agentExposure,
    detectorShare,
    outcomeMix,
    eventRows: buildLiveMonitorEventRows(events, 100),
    sessionCount: sessions.size,
    latestAgeSec: eventAgeSec(latestTs),
    finding,
    posture,
  };
}
