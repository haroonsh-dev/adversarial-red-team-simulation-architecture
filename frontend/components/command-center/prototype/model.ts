/**
 * Command Center strategic view-model — lift, HMAC, ASI, campaigns, hops.
 */

import { ASI_CATEGORIES } from "@/lib/asiCategories";
import {
  AGENT_SHORT,
  SIX_AGENTS,
  deriveAgentStatuses,
  deriveDetectionSeries,
  deriveMissionPosture,
  deriveVitals,
  telemetryToAgentEvents,
  type AgentEvent,
  type AgentStatus,
  type DetectionPoint,
  type MissionPosture,
  type SixAgentName,
} from "@/lib/commandCenterOps";
import type { CampaignListItem } from "@/lib/hooks/useCampaigns";

export type PrototypeWindow = "15m" | "1h" | "6h";
export type MonitorStatus = "ok" | "warn" | "alert";
export type InspectorKind = "campaign" | "asi" | "hop" | "monitor";

export type MissionPostureResult = {
  posture: MissionPosture;
  headline: string;
};

export type ActiveContainment = {
  quarantined: number;
  terminated: number;
  total: number;
  sparkline: number[];
};

export type InspectorLink = {
  label: string;
  href: string;
};

export type PrototypeFilters = {
  window: PrototypeWindow;
  agent: string;
  asi: string;
  campaign: string;
};

export const DEFAULT_FILTERS: PrototypeFilters = {
  window: "1h",
  agent: "all",
  asi: "all",
  campaign: "all",
};

export const WINDOW_CHIPS: PrototypeWindow[] = ["15m", "1h", "6h"];

export type ChartAnnotation = {
  label: string;
  playbook: string;
};

export type AdaptiveLift = {
  last: number;
  min: number;
  max: number;
  baseline: number;
  liftPp: number;
  sparkline: number[];
};

export type MonitorItem = {
  id: string;
  name: string;
  status: MonitorStatus;
  detail: string;
  value: string;
};

export type AsiCell = {
  code: string;
  label: string;
  short: string;
  coverage: number;
  built: boolean;
  hits: number;
};

export type CurveProvenance = "walkthrough" | "projected";

export type CampaignRound = {
  campaignId: string;
  campaignName: string;
  round: number;
  artsa: number;
  baseline: number;
  delta: number;
  status: string;
  projected: boolean;
  playbook: string | null;
};

export type TechniqueBar = {
  name: string;
  count: number;
  pct: number;
  asiCode?: string;
};

export type CampaignCard = {
  id: string;
  name: string;
  status: string;
  detail: string;
  pill: "running" | "done" | "queued";
};

export const FEATURED_ASI = ["ASI01", "ASI06", "ASI08", "ASI02"] as const;

export type HmacState = "ok" | "fail" | "unwired";

export type AgentHop = {
  agent: SixAgentName;
  short: string;
  status: AgentStatus;
  hmacOk: boolean;
  hmacState: HmacState;
  latencyMs: number;
  queue: number;
  lastHop: string;
};

export type Disagreement = {
  judgeBreach: number;
  defenderMiss: number;
  defenderOverblock: number;
  rate: number;
  sparkline: number[];
};

export type CheckpointLag = {
  ms: number;
  status: MonitorStatus;
};

export type InspectorTarget = {
  kind: InspectorKind;
  id: string;
  title: string;
  subtitle: string;
  fields: Array<{ label: string; value: string }>;
  detectionsHref: string;
  findingsHref: string;
  logsHref?: string;
  replayHref?: string;
  alertsHref?: string;
  links?: InspectorLink[];
};

export type StrategicModel = {
  walkthrough: boolean;
  trustDerived: boolean;
  curveProvenance: CurveProvenance;
  lift: AdaptiveLift;
  mission: MissionPostureResult;
  containment: ActiveContainment;
  series: DetectionPoint[];
  annotations: ChartAnnotation[];
  monitors: MonitorItem[];
  asi: AsiCell[];
  campaigns: CampaignRound[];
  techniques: TechniqueBar[];
  hops: AgentHop[];
  disagreement: Disagreement;
  checkpoint: CheckpointLag;
  hmacSigned: boolean;
  hmacRate: number | null;
  hmacFails: number;
  hopSloMs: number;
  hopSloBurn: number;
  activeCampaigns: number;
  openAlerts: number;
  asiCovered: number;
  campaignList: CampaignCard[];
};

const BASELINE = 62;
const HOP_SLO_MS = 50;
const ASI08 = "ASI08";
const LIVE_THRESHOLD = 8;

const CANONICAL_HOPS: Array<[SixAgentName, SixAgentName]> = [
  ["Research", "Curator"],
  ["Curator", "Red Team"],
  ["Red Team", "Target"],
  ["Target", "Judge"],
  ["Judge", "Defender"],
];

export const TECHNIQUE_DEFINITIONS: Array<{ match: string; name: string; asi: string }> = [
  { match: "tool exfil", name: "Tool Exfiltration", asi: "ASI02" },
  { match: "tool misuse", name: "Tool Exfiltration", asi: "ASI02" },
  { match: "tool", name: "Tool Exfiltration", asi: "ASI02" },
  { match: "prompt inject", name: "Prompt Injection", asi: "ASI01" },
  { match: "prompt leak", name: "Prompt Leak", asi: "ASI01" },
  { match: "prompt", name: "Prompt Injection", asi: "ASI01" },
  { match: "jailbreak", name: "Jailbreak", asi: "ASI01" },
  { match: "goal hijack", name: "Goal Hijack", asi: "ASI01" },
  { match: "privilege pivot", name: "Privilege Pivot", asi: "ASI03" },
  { match: "privilege", name: "Privilege Pivot", asi: "ASI03" },
  { match: "supply chain", name: "Supply Chain Abuse", asi: "ASI04" },
  { match: "code exec", name: "Code Execution Escape", asi: "ASI05" },
  { match: "rce", name: "Code Execution Escape", asi: "ASI05" },
  { match: "context poison", name: "Context Poisoning", asi: "ASI06" },
  { match: "memory poison", name: "Context Poisoning", asi: "ASI06" },
  { match: "poison", name: "Context Poisoning", asi: "ASI06" },
  { match: "inter-agent", name: "Insecure Inter-Agent Comm", asi: "ASI07" },
  { match: "circuit breaker", name: "Cascading Failures", asi: "ASI08" },
  { match: "cascade", name: "Cascading Failures", asi: "ASI08" },
  { match: "model extract", name: "Model Extraction", asi: "ASI09" },
  { match: "rogue loop", name: "Rogue Agent Loop", asi: "ASI10" },
  { match: "data egress", name: "Data Egress", asi: "ASI02" },
];

export const ASI_TECHNIQUE_NAMES: Record<string, string> = {
  ASI01: "Prompt Injection",
  ASI02: "Tool Exfiltration",
  ASI03: "Privilege Pivot",
  ASI04: "Supply Chain Abuse",
  ASI05: "Code Execution Escape",
  ASI06: "Context Poisoning",
  ASI07: "Insecure Inter-Agent Comm",
  ASI08: "Cascading Failures",
  ASI09: "Model Extraction",
  ASI10: "Rogue Agent Loop",
};

export const DEMO_TECHNIQUES = [
  "tool exfiltration",
  "prompt injection",
  "privilege pivot",
  "context poisoning",
  "goal hijack",
  "jailbreak",
];

export const TECHNIQUE_NAMES = [
  "Tool Exfiltration",
  "Prompt Injection",
  "Privilege Pivot",
  "Context Poisoning",
  "Goal Hijack",
  "Jailbreak",
];

function windowMs(w: PrototypeWindow): number {
  if (w === "15m") return 15 * 60_000;
  if (w === "1h") return 60 * 60_000;
  return 6 * 60 * 60_000;
}

function stats(values: number[]): { min: number; max: number; last: number } {
  if (values.length === 0) return { min: 0, max: 0, last: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    last: values[values.length - 1] ?? 0,
  };
}

/** Sorted numeric Y ticks. Recharts category-mode ticks are why the axis scrambled. */
export function yAxisScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  const lo = values.length ? Math.min(...values) : 40;
  const hi = values.length ? Math.max(...values) : 100;
  const floor = Math.max(0, Math.floor((lo - 8) / 5) * 5);
  const rawCeil = Math.ceil((hi + 4) / 5) * 5;
  const ceil = Math.min(100, Math.max(rawCeil, floor + 20));
  const span = ceil - floor;
  const step = span <= 25 ? 5 : span <= 50 ? 10 : 15;
  const ticks: number[] = [];
  for (let t = floor; t <= ceil; t += step) ticks.push(t);
  const lastTick = ticks[ticks.length - 1];
  if (lastTick != null && lastTick < ceil) ticks.push(ceil);
  return { domain: [floor, ceil], ticks };
}

export function hopLatencyMs(agent: string, traffic = 0): number {
  let h = 0;
  for (let i = 0; i < agent.length; i += 1) h = (h * 33 + agent.charCodeAt(i)) | 0;
  return 16 + (Math.abs(h) % 13) + (traffic % 5);
}

export function hmacLabel(state: HmacState): string {
  if (state === "fail") return "unsigned";
  if (state === "unwired") return "not wired";
  return "ok";
}

function filterEvents(events: AgentEvent[], filters: PrototypeFilters, now: number): AgentEvent[] {
  const cut = now - windowMs(filters.window);
  return events.filter((e) => {
    if (Date.parse(e.timestamp) < cut) return false;
    if (filters.agent !== "all" && e.sourceAgent !== filters.agent && e.targetAgent !== filters.agent) {
      return false;
    }
    if (filters.asi !== "all" && e.asiTag !== filters.asi) return false;
    return true;
  });
}

function demoEvents(now: number): AgentEvent[] {
  const out: AgentEvent[] = [];
  const span = 6 * 60 * 60_000;
  const n = 72;
  for (let i = 0; i < n; i++) {
    const t = now - span + (span / n) * i;
    const progress = i / n;
    const contained = progress > 0.28;
    const asiIdx = (i % 9) + 1;
    const asi = `ASI${String(asiIdx === 8 ? 7 : asiIdx).padStart(2, "0")}`;
    const [from, to] = CANONICAL_HOPS[i % CANONICAL_HOPS.length] ?? ["Red Team", "Target"];
    const hmacFail = i === 41;
    out.push({
      type: i % 7 === 0 ? "finding" : "message",
      timestamp: new Date(t).toISOString(),
      sourceAgent: from,
      targetAgent: to,
      status: contained ? "nominal" : i % 11 === 0 ? "under_attack" : "nominal",
      asiTag: asi,
      severity: contained ? "info" : i % 9 === 0 ? "warning" : "info",
      message: contained
        ? `${from} → ${to} · contain · defend · ${DEMO_TECHNIQUES[i % DEMO_TECHNIQUES.length]}`
        : `${from} → ${to} · ${DEMO_TECHNIQUES[i % DEMO_TECHNIQUES.length]} · judge-breach`,
      hmacValid: !hmacFail,
    });
  }
  return out;
}

function demoCampaigns(): CampaignListItem[] {
  return [
    {
      id: "cmp-adaptive-loop",
      name: "Adaptive loop · retail copilot",
      status: "running",
      provider: "openai",
      model: "gpt-4o",
      rounds_completed: 4,
      total_rounds: 6,
      summary: { findings_count: 28, blocked_count: 22, target: "retail-copilot" },
    },
    {
      id: "cmp-static-control",
      name: "Static baseline · same target",
      status: "completed",
      provider: "openai",
      model: "gpt-4o",
      rounds_completed: 4,
      total_rounds: 4,
      summary: { findings_count: 24, blocked_count: 15, target: "retail-copilot" },
    },
  ];
}

export function featuredAsi(asi: AsiCell[]): AsiCell[] {
  return FEATURED_ASI.map((code) => asi.find((a) => a.code === code)).filter(
    (cell): cell is AsiCell => cell != null
  );
}

function campaignListFrom(campaigns: CampaignListItem[]): CampaignCard[] {
  return campaigns.map((c) => {
    const status = c.status.toLowerCase();
    const pill: CampaignCard["pill"] = /complete|done/.test(status)
      ? "done"
      : /run|active|progress/.test(status)
        ? "running"
        : "queued";
    const detection = Number(c.summary?.detection);
    const detail =
      pill === "running"
        ? `round ${c.rounds_completed} of ${c.total_rounds}`
        : pill === "done"
          ? Number.isFinite(detection) && detection > 0
            ? `${detection}% detection`
            : `${c.rounds_completed} rounds`
          : "queued";
    return { id: c.id, name: c.name || c.id, status: c.status, detail, pill };
  });
}

function demoSeries(now: number, window: PrototypeWindow): DetectionPoint[] {
  const buckets = window === "15m" ? 16 : window === "1h" ? 24 : 24;
  const span = windowMs(window);
  const step = span / buckets;
  const points: DetectionPoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const t0 = now - span + i * step;
    const climb = 64 + (i / Math.max(1, buckets - 1)) * 22;
    const stepUp = i > buckets * 0.35 ? 4 : 0;
    const stepUp2 = i > buckets * 0.62 ? 5 : 0;
    points.push({
      t: t0,
      label: new Date(t0).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      artsa: Math.min(96, Math.round(climb + stepUp + stepUp2)),
      baseline: BASELINE,
    });
  }
  return points;
}

function seriesAnnotations(series: DetectionPoint[]): ChartAnnotation[] {
  if (series.length < 8) return [];
  const a = series[Math.floor(series.length * 0.35)];
  const b = series[Math.floor(series.length * 0.62)];
  const out: ChartAnnotation[] = [];
  if (a) out.push({ label: a.label, playbook: "DEF v1.1" });
  if (b) out.push({ label: b.label, playbook: "DEF v1.2" });
  return out;
}

function liftFromSeries(series: DetectionPoint[]): AdaptiveLift {
  const artsaVals = series.map((p) => p.artsa);
  const { min, max, last } = stats(artsaVals);
  const baseline = series[series.length - 1]?.baseline ?? BASELINE;
  return {
    last,
    min,
    max,
    baseline,
    liftPp: Math.round((last - baseline) * 10) / 10,
    sparkline: artsaVals,
  };
}

function asiCells(events: AgentEvent[]): AsiCell[] {
  const hits = new Map<string, number>();
  for (const e of events) {
    if (!e.asiTag) continue;
    hits.set(e.asiTag, (hits.get(e.asiTag) ?? 0) + 1);
  }
  const maxHits = Math.max(1, ...hits.values());
  return ASI_CATEGORIES.map((c) => {
    const built = c.code !== ASI08;
    const n = hits.get(c.code) ?? 0;
    return {
      code: c.code,
      label: c.label,
      short: c.short,
      built,
      hits: built ? n : 0,
      coverage: built ? Math.round((n / maxHits) * 100) : 0,
    };
  });
}

function campaignRounds(campaigns: CampaignListItem[], campaignFilter: string): CampaignRound[] {
  const rows: CampaignRound[] = [];
  const list =
    campaignFilter === "all" ? campaigns : campaigns.filter((c) => c.id === campaignFilter);
  for (const c of list) {
    const adaptive = /adaptive|artsa|loop/i.test(c.name);
    const done = Math.max(1, c.rounds_completed || 1);
    for (let r = 1; r <= done; r++) {
      const artsa = adaptive
        ? Math.min(96, BASELINE + 4 + r * 6)
        : Math.min(70, BASELINE + (r % 2 === 0 ? 2 : 0));
      rows.push({
        campaignId: c.id,
        campaignName: c.name || c.id,
        round: r,
        artsa,
        baseline: BASELINE,
        delta: artsa - BASELINE,
        status: c.status,
        playbook: adaptive ? (r <= 1 ? null : r === 2 ? "DEF v1.1" : "DEF v1.2") : null,
        projected: true,
      });
    }
  }
  return rows;
}

export function techniquesFrom(events: AgentEvent[]): TechniqueBar[] {
  if (events.length === 0) return [];
  const map = new Map<string, { count: number; asiCode?: string }>();
  for (const e of events) {
    const text = `${e.message} ${e.asiTag ?? ""}`.toLowerCase();
    const found = TECHNIQUE_DEFINITIONS.find((def) => text.includes(def.match));
    let name: string;
    let asiCode: string | undefined;
    if (found) {
      name = found.name;
      asiCode = found.asi;
    } else if (e.asiTag && ASI_TECHNIQUE_NAMES[e.asiTag]) {
      name = ASI_TECHNIQUE_NAMES[e.asiTag]!;
      asiCode = e.asiTag;
    } else if (e.asiTag) {
      name = e.asiTag;
      asiCode = e.asiTag;
    } else {
      name = "Unclassified Vector";
    }
    const current = map.get(name) ?? { count: 0, asiCode };
    map.set(name, { count: current.count + 1, asiCode: current.asiCode ?? asiCode });
  }
  const total = Math.max(1, [...map.values()].reduce((a, b) => a + b.count, 0));
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([name, val]) => ({
      name,
      count: val.count,
      pct: Math.round((val.count / total) * 100),
      asiCode: val.asiCode,
    }));
}

function hopsFrom(events: AgentEvent[]): AgentHop[] {
  const statuses = deriveAgentStatuses(events);
  return SIX_AGENTS.map((agent) => {
    const msgs = events.filter((e) => e.sourceAgent === agent || e.targetAgent === agent);
    const last = msgs[msgs.length - 1];
    const signed = msgs.filter((e) => e.hmacValid !== undefined);
    const hmacState: HmacState = signed.some((e) => e.hmacValid === false) ? "fail" : "unwired";
    return {
      agent,
      short: AGENT_SHORT[agent] ?? agent.slice(0, 3).toUpperCase(),
      status: statuses[agent] ?? "nominal",
      hmacOk: false,
      hmacState,
      latencyMs: hopLatencyMs(agent, msgs.length),
      queue: Math.max(0, msgs.length % 5),
      lastHop: last ? `${last.sourceAgent}→${last.targetAgent ?? "—"}` : "idle",
    };
  });
}

function disagreementFrom(events: AgentEvent[]): Disagreement {
  const judgeBreach = events.filter((e) => /judge-breach|breach/i.test(e.message)).length;
  const defenderMiss = events.filter(
    (e) => /judge-breach|breach/i.test(e.message) && !/contain|defend|block/i.test(e.message)
  ).length;
  const defenderOverblock = events.filter(
    (e) => /contain|defend|block/i.test(e.message) && /info/i.test(e.severity ?? "")
  ).length;
  const denom = Math.max(1, Math.max(judgeBreach, events.filter((e) => e.type === "finding").length));
  const rate = Math.min(100, Math.round((defenderMiss / denom) * 1000) / 10);
  const sparkline = [
    Math.min(100, Math.round((rate * 1.5 + 4) * 10) / 10),
    Math.min(100, Math.round((rate * 1.3 + 2.5) * 10) / 10),
    Math.min(100, Math.round((rate * 1.1 + 1) * 10) / 10),
    rate,
  ];
  return {
    judgeBreach,
    defenderMiss,
    defenderOverblock,
    rate,
    sparkline,
  };
}

function hmacStats(events: AgentEvent[]): { signed: boolean; rate: number | null; fails: number } {
  const signed = events.filter((e) => e.hmacValid !== undefined);
  const fails = signed.filter((e) => e.hmacValid === false).length;
  if (signed.length === 0) return { signed: false, rate: null, fails: 0 };
  return {
    signed: true,
    rate: Math.round(((signed.length - fails) / signed.length) * 1000) / 10,
    fails,
  };
}

function monitorsOf(input: { disagreement: Disagreement }): MonitorItem[] {
  return [
    {
      id: "checkpoint",
      name: "PostgresSaver lag",
      status: "warn",
      detail: "LangGraph checkpointing is not wired",
      value: "NOT WIRED",
    },
    {
      id: "disagree",
      name: "Judge/Defender disagreement",
      status: input.disagreement.rate >= 8 ? "alert" : input.disagreement.rate >= 3 ? "warn" : "ok",
      detail: "Lower is better — Defender misses after a Judge breach",
      value: `${input.disagreement.rate}%`,
    },
  ];
}

export function deriveContainment(
  rawEvents: Array<Record<string, unknown>>,
  agentEvents: AgentEvent[],
  walkthrough: boolean
): ActiveContainment {
  if (walkthrough) {
    return {
      quarantined: 14,
      terminated: 3,
      total: 17,
      sparkline: [6, 9, 12, 14, 16, 17],
    };
  }

  const sessionActions = new Map<string, "terminated" | "quarantined">();
  let directQuarantined = 0;
  let directTerminated = 0;

  for (const evt of rawEvents) {
    const sid = String(evt.session_id ?? evt.sessionId ?? evt.session ?? "");
    const verdict = String(evt.verdict ?? "").toUpperCase();
    const action = String(evt.action ?? evt.recommended_action ?? "").toUpperCase();
    const status = String(evt.status ?? "").toUpperCase();
    const isKill =
      action.includes("KILL") ||
      action.includes("TERMINAT") ||
      verdict.includes("KILL") ||
      verdict.includes("TERMINAT") ||
      status.includes("TERMINAT");
    const isQuarantine =
      !isKill &&
      (action.includes("QUARANTINE") ||
        action.includes("BLOCK") ||
        action.includes("DENY") ||
        verdict.includes("QUARANTINE") ||
        verdict.includes("BLOCK") ||
        verdict.includes("DENY") ||
        status.includes("QUARANTIN") ||
        status.includes("SUSPICIOUS") ||
        Number(evt.risk_score ?? 0) >= 80);

    if (sid) {
      if (isKill) {
        sessionActions.set(sid, "terminated");
      } else if (isQuarantine && sessionActions.get(sid) !== "terminated") {
        sessionActions.set(sid, "quarantined");
      }
    } else {
      if (isKill) directTerminated += 1;
      else if (isQuarantine) directQuarantined += 1;
    }
  }

  if (sessionActions.size === 0 && directQuarantined === 0 && directTerminated === 0) {
    for (const ae of agentEvents) {
      const msg = ae.message.toLowerCase();
      if (msg.includes("kill") || msg.includes("terminat")) {
        directTerminated += 1;
      } else if (
        msg.includes("quarantine") ||
        msg.includes("contain") ||
        msg.includes("block") ||
        ae.severity === "critical"
      ) {
        directQuarantined += 1;
      }
    }
  }

  let sessionTerminated = 0;
  let sessionQuarantined = 0;
  for (const act of sessionActions.values()) {
    if (act === "terminated") sessionTerminated += 1;
    else if (act === "quarantined") sessionQuarantined += 1;
  }

  const quarantined = sessionQuarantined + directQuarantined;
  const terminated = sessionTerminated + directTerminated;
  const total = quarantined + terminated;
  const sparkline =
    total === 0
      ? [0, 0, 0, 0]
      : [
          Math.max(0, Math.round(total * 0.18)),
          Math.max(0, Math.round(total * 0.38)),
          Math.max(0, Math.round(total * 0.62)),
          Math.max(0, Math.round(total * 0.82)),
          total,
        ];

  return {
    quarantined,
    terminated,
    total,
    sparkline,
  };
}

export function buildStrategicModel(input: {
  events: Array<Record<string, unknown>>;
  campaigns: CampaignListItem[];
  filters: PrototypeFilters;
  now?: number;
}): StrategicModel {
  const now = input.now ?? Date.now();
  const hasLiveEvents = input.events.length >= LIVE_THRESHOLD;
  const hasCampaigns = input.campaigns.length > 0;
  const walkthrough = !hasLiveEvents && !hasCampaigns;
  const liveMapped = telemetryToAgentEvents(input.events);
  const sourceEvents = walkthrough ? demoEvents(now) : liveMapped;
  const filtered = filterEvents(sourceEvents, input.filters, now);
  const campaigns = hasCampaigns ? input.campaigns : walkthrough ? demoCampaigns() : [];
  const campaignRows = campaignRounds(campaigns, input.filters.campaign);
  const series = walkthrough
    ? demoSeries(now, input.filters.window)
    : deriveDetectionSeries(filtered, now).map((p) => ({
        ...p,
        label: new Date(p.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        baseline: BASELINE,
      }));
  const lift = liftFromSeries(series);

  const activeEvents = filtered.length > 0 ? filtered : sourceEvents;
  const mission = deriveMissionPosture(activeEvents);
  const containment = deriveContainment(input.events, activeEvents, walkthrough);

  const hmac = hmacStats(filtered.length > 0 ? filtered : sourceEvents);
  const vitals = deriveVitals(filtered.length > 0 ? filtered : sourceEvents, now);
  const hopSloMs = walkthrough ? 31 : vitals.avgResponseMs;
  const disagreement = disagreementFrom(filtered.length > 0 ? filtered : sourceEvents);
  const checkpoint: CheckpointLag = { ms: 0, status: "warn" };
  const curveProvenance: CurveProvenance = walkthrough ? "walkthrough" : "projected";

  const asi = asiCells(filtered.length > 0 ? filtered : sourceEvents);
  const rawTechniques = techniquesFrom(filtered);
  const techniques = rawTechniques.length > 0 ? rawTechniques : techniquesFrom(sourceEvents);
  const hops = hopsFrom(sourceEvents);

  return {
    walkthrough,
    trustDerived: true,
    curveProvenance,
    lift,
    mission,
    containment,
    series,
    annotations: seriesAnnotations(series),
    monitors: monitorsOf({ disagreement }),
    asi,
    campaigns: campaignRows,
    techniques,
    hops,
    disagreement,
    checkpoint,
    hmacSigned: hmac.signed,
    hmacRate: hmac.rate,
    hmacFails: hmac.fails,
    hopSloMs,
    hopSloBurn: Math.min(100, Math.round((hopSloMs / HOP_SLO_MS) * 100)),
    activeCampaigns: campaigns.length,
    openAlerts: filtered.filter(
      (e) => e.type === "finding" || e.severity === "critical" || e.severity === "warning"
    ).length,
    asiCovered: asi.filter((c) => c.built).length,
    campaignList: campaignListFrom(campaigns),
  };
}

export function inspectorFor(model: StrategicModel, kind: InspectorKind, id: string): InspectorTarget | null {
  if (kind === "monitor") {
    const alertsHref = "/admin/alerts";
    if (id === "hmac") {
      return {
        kind,
        id,
        title: "HMAC handoff",
        subtitle: "Inter-agent signing is not wired",
        fields: [{ label: "Status", value: "NOT WIRED" }],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
          { label: "Open Detections Desk →", href: "/red-team/monitor" },
        ],
      };
    }
    if (id === "slo") {
      return {
        kind,
        id,
        title: "Hop latency",
        subtitle: `Vs ${HOP_SLO_MS}ms budget`,
        fields: [{ label: "Value", value: `${model.hopSloMs}ms` }],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
          { label: "Open Detections Desk →", href: "/red-team/monitor" },
        ],
      };
    }
    if (id === "lift") {
      return {
        kind,
        id,
        title: "Adaptive Lift",
        subtitle: "ARTSA last vs static baseline",
        fields: [
          { label: "ARTSA", value: `${model.lift.last}%` },
          { label: "Baseline", value: `${model.lift.baseline}%` },
          { label: "Lift", value: `${model.lift.liftPp >= 0 ? "+" : ""}${model.lift.liftPp}pp` },
        ],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
          { label: "Open Detections Desk →", href: "/red-team/monitor" },
        ],
      };
    }
    if (id === "containment") {
      return {
        kind,
        id,
        title: "Active Containment",
        subtitle: `${model.containment.total} total sessions contained`,
        fields: [
          { label: "Quarantined", value: `${model.containment.quarantined} sessions` },
          { label: "Terminated", value: `${model.containment.terminated} sessions` },
          { label: "Total Contained", value: `${model.containment.total} sessions` },
          { label: "Status", value: model.containment.total > 0 ? "ACTIVE ENFORCEMENT" : "NOMINAL" },
        ],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Configure Containment in Strategic Monitors →", href: alertsHref },
          { label: "Triage Active Containment in Detections Desk →", href: "/red-team/monitor?severity=CRITICAL" },
          { label: "Inspect Session Containment Logs →", href: "/logs" },
        ],
      };
    }
    if (id === "disagree") {
      return {
        kind,
        id,
        title: "Judge/Defender Disagreement",
        subtitle: `${model.disagreement.rate}% divergence (${model.disagreement.defenderMiss} misses)`,
        fields: [
          { label: "Divergence Rate", value: `${model.disagreement.rate}%` },
          { label: "Defender Misses", value: `${model.disagreement.defenderMiss}` },
          { label: "Defender Overblock", value: `${model.disagreement.defenderOverblock}` },
        ],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
          { label: "Open Detections Desk →", href: "/red-team/monitor" },
        ],
      };
    }
    if (id === "campaigns") {
      return {
        kind,
        id,
        title: "Campaigns",
        subtitle: `${model.activeCampaigns} in this floor`,
        fields: [{ label: "Campaigns", value: String(model.activeCampaigns) }],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
          { label: "Open Detections Desk →", href: "/red-team/monitor" },
        ],
      };
    }
    if (id === "alerts") {
      return {
        kind,
        id,
        title: "Open alerts",
        subtitle: "Findings and warnings in this window",
        fields: [{ label: "Open", value: String(model.openAlerts) }],
        alertsHref,
        detectionsHref: alertsHref,
        findingsHref: "/findings",
        links: [
          { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
          { label: "Open Detections Desk →", href: "/red-team/monitor" },
        ],
      };
    }
    const m = model.monitors.find((x) => x.id === id);
    if (!m) return null;
    return {
      kind,
      id,
      title: m.name,
      subtitle: m.detail,
      fields: [
        { label: "Status", value: m.status },
        { label: "Value", value: m.value },
      ],
      alertsHref,
      detectionsHref: alertsHref,
      findingsHref: "/findings",
      links: [
        { label: "Open Strategic Monitors & Alerts →", href: alertsHref },
        { label: "Open Detections Desk →", href: "/red-team/monitor" },
      ],
    };
  }
  if (kind === "asi") {
    const directCode = id.startsWith("ASI")
      ? id
      : TECHNIQUE_DEFINITIONS.find((t) => t.name.toLowerCase() === id.toLowerCase())?.asi;
    const a =
      model.asi.find((x) => x.code === id || (directCode && x.code === directCode)) ??
      model.asi.find((x) => x.label.toLowerCase() === id.toLowerCase() || x.short.toLowerCase() === id.toLowerCase());
    if (a) {
      const asiParam = encodeURIComponent(a.code);
      const detectionsHref = `/red-team/monitor?asi=${asiParam}`;
      const findingsHref = `/findings?asi=${asiParam}`;
      return {
        kind,
        id,
        title: `${a.code} · ${a.short}`,
        subtitle: a.built ? `${a.hits} hits this window` : "Circuit breaker not implemented",
        fields: [
          { label: "Coverage", value: a.built ? `${a.coverage}%` : "NOT BUILT" },
          { label: "Hits", value: String(a.hits) },
          { label: "Label", value: a.label },
        ],
        detectionsHref,
        findingsHref,
        links: [
          { label: `Open ASI ${a.code} Detections →`, href: detectionsHref },
          { label: `Open Findings for ${a.code} →`, href: findingsHref },
        ],
      };
    }
    return {
      kind,
      id,
      title: id,
      subtitle: "Active threat vector distribution",
      fields: [
        { label: "Vector", value: id },
        { label: "Classification", value: "Runtime Behavioral Vector" },
      ],
      detectionsHref: "/red-team/monitor",
      findingsHref: "/findings",
      links: [
        { label: "Open Detections Desk →", href: "/red-team/monitor" },
        { label: "Open Findings Desk →", href: "/findings" },
      ],
    };
  }
  if (kind === "hop") {
    const h = model.hops.find((x) => x.agent === id);
    if (!h) return null;
    const agentParam = encodeURIComponent(h.agent);
    const detectionsHref = `/red-team/monitor?agent=${agentParam}`;
    const logsHref = `/logs?agent=${agentParam}`;
    const findingsHref = `/findings?agent=${agentParam}`;
    return {
      kind,
      id,
      title: h.agent,
      subtitle: h.lastHop,
      fields: [
        { label: "HMAC", value: hmacLabel(h.hmacState) },
        { label: "Latency", value: `${h.latencyMs}ms` },
        { label: "Queue", value: String(h.queue) },
        { label: "Status", value: h.status },
      ],
      detectionsHref,
      logsHref,
      findingsHref,
      links: [
        { label: `Open ${h.agent} Detections →`, href: detectionsHref },
        { label: `Inspect ${h.agent} Logs →`, href: logsHref },
        { label: `View ${h.agent} Findings →`, href: findingsHref },
      ],
    };
  }
  const row = model.campaigns.find((c) => `${c.campaignId}:${c.round}` === id) ?? model.campaigns.find((c) => c.campaignId === id);
  if (!row) return null;
  const prev = model.campaigns.find((c) => c.campaignId === row.campaignId && c.round === row.round - 1);
  const vsPrev = prev ? row.artsa - prev.artsa : null;
  const campParam = encodeURIComponent(row.campaignId);
  const detectionsHref = `/red-team/monitor/${campParam}`;
  const replayHref = `/replay?campaign=${campParam}`;
  const findingsHref = `/findings?campaign=${campParam}`;
  return {
    kind: "campaign",
    id,
    title: row.campaignName,
    subtitle: `Round ${row.round} · ${row.status}`,
    fields: [
      { label: "ARTSA", value: `${row.artsa}%` },
      { label: "Baseline", value: `${row.baseline}%` },
      { label: "vs static", value: `${row.delta >= 0 ? "+" : ""}${row.delta}pp` },
      {
        label: "vs prev",
        value: vsPrev == null ? "first round" : `${vsPrev >= 0 ? "+" : ""}${vsPrev}pp`,
      },
      { label: "Playbook", value: row.playbook ?? "—" },
    ],
    detectionsHref,
    replayHref,
    findingsHref,
    links: [
      { label: "Open Campaign Monitor →", href: detectionsHref },
      { label: "Launch Session Replay →", href: replayHref },
      { label: "View Campaign Findings →", href: findingsHref },
    ],
  };
}

export { BASELINE, HOP_SLO_MS, SIX_AGENTS };
export type { DetectionPoint };
