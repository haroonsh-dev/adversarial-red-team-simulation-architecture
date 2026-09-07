/**
 * Command Center mission graph — derive nodes/edges from topology API,
 * live telemetry, or the control-plane pipeline fallback.
 */

export type CommandNodeKind = "session" | "agent" | "tool" | "control";
export type CommandNodeSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "SAFE";
export type CommandEdgeStatus = "COMPROMISED" | "QUARANTINED" | "SAFE" | "ACTIVE";

export interface CommandGraphNode {
  id: string;
  label: string;
  kind: CommandNodeKind;
  severity: CommandNodeSeverity;
  riskScore: number;
  status: string;
  eventCount: number;
  sessionId?: string;
  x: number;
  y: number;
}

export interface CommandGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  status: CommandEdgeStatus;
  count: number;
}

export interface CommandGraphModel {
  nodes: CommandGraphNode[];
  edges: CommandGraphEdge[];
  /** Live sources only — never synthetic demo nodes. */
  source: "topology" | "telemetry" | "idle";
  compromisedCount: number;
  activeCount: number;
  maxRisk: number;
  totalEvents: number;
}

export interface TopologyApiPayload {
  nodes?: Array<{
    id: string;
    label: string;
    type?: string;
    risk_score?: number;
    status?: string;
  }>;
  edges?: Array<{
    source: string;
    target: string;
    type?: string;
  }>;
}

type LiveEventLike = Record<string, unknown>;

const VIEW_W = 1400;
const VIEW_H = 680;
/** Soft cap so the map stays readable under Watch-pulse noise. */
const MAX_GRAPH_NODES = 36;
const MIN_NODE_GAP = 76;

function scoreToSeverity(score: number, status?: string): CommandNodeSeverity {
  const s = (status ?? "").toUpperCase();
  if (s.includes("BREACH") || s.includes("COMPROMISE") || s === "KILL") return "CRITICAL";
  if (s.includes("QUARANTINE") || s === "ESCALATED") return "HIGH";
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 20) return "LOW";
  return "SAFE";
}

function edgeStatusFromRisk(score: number, verdict?: string): CommandEdgeStatus {
  const v = (verdict ?? "").toUpperCase();
  if (v.includes("BREACH") || score >= 80) return "COMPROMISED";
  if (v.includes("QUARANTINE") || v === "SUSPICIOUS" || score >= 50) return "QUARANTINED";
  if (score > 0) return "ACTIVE";
  return "SAFE";
}

/** Deterministic grid layout — stable across renders. */
export function layoutNodes(
  count: number,
  width = VIEW_W,
  height = VIEW_H
): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  if (count === 1) return [{ x: width / 2, y: height / 2 }];

  const cx = width / 2;
  const cy = height / 2;
  const cols = Math.min(5, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const gapX = Math.min(180, (width - 120) / Math.max(cols, 1));
  const gapY = Math.min(140, (height - 100) / Math.max(rows, 1));
  const originX = cx - ((cols - 1) * gapX) / 2;
  const originY = cy - ((rows - 1) * gapY) / 2;

  return Array.from({ length: count }, (_, i) => ({
    x: originX + (i % cols) * gapX,
    y: originY + Math.floor(i / cols) * gapY,
  }));
}

/**
 * Ops swimlane layout: sessions (top row) → agents (left grid) → tools (right grid).
 * Never piles many nodes into a few pixels — that made the map look “broken”.
 */
export function layoutByKind(
  nodes: Array<Omit<CommandGraphNode, "x" | "y">>,
  width = VIEW_W,
  height = VIEW_H
): CommandGraphNode[] {
  const sessions = nodes.filter((n) => n.kind === "session");
  const agents = nodes.filter((n) => n.kind === "agent" || n.kind === "control");
  const tools = nodes.filter((n) => n.kind === "tool");
  const other = nodes.filter(
    (n) => n.kind !== "session" && n.kind !== "agent" && n.kind !== "control" && n.kind !== "tool"
  );

  const kindCount =
    Number(sessions.length > 0) + Number(agents.length > 0) + Number(tools.length > 0);
  if (kindCount <= 1 && other.length === 0) {
    return applyLayout(nodes);
  }

  const padX = 100;
  const topY = 110;
  const midTop = 180;
  const midBot = height - 64;

  return [
    ...placeInRegion(sessions, {
      x0: padX,
      x1: width - padX,
      y0: topY - 22,
      y1: topY + 22,
      preferRow: true,
    }),
    ...placeInRegion(agents.length ? agents : other, {
      x0: padX,
      x1: width * 0.44,
      y0: midTop,
      y1: midBot,
    }),
    ...placeInRegion(tools, {
      x0: width * 0.56,
      x1: width - padX,
      y0: midTop,
      y1: midBot,
    }),
    ...(agents.length
      ? placeInRegion(other, {
          x0: width * 0.42,
          x1: width * 0.58,
          y0: midTop,
          y1: midBot,
        })
      : []),
  ];
}

/** Grid (or single row) inside a bounding box with a minimum gap. */
function placeInRegion(
  list: Array<Omit<CommandGraphNode, "x" | "y">>,
  box: { x0: number; x1: number; y0: number; y1: number; preferRow?: boolean }
): CommandGraphNode[] {
  if (!list.length) return [];
  const sorted = [...list].sort(
    (a, b) => b.riskScore - a.riskScore || b.eventCount - a.eventCount
  );
  const maxInLane = box.preferRow ? 10 : 14;
  const visible = sorted.slice(0, maxInLane);

  const bw = Math.max(40, box.x1 - box.x0);
  const bh = Math.max(40, box.y1 - box.y0);

  let cols: number;
  let rows: number;
  if (box.preferRow || visible.length <= 4) {
    cols = visible.length;
    rows = 1;
  } else {
    cols = Math.min(4, Math.ceil(Math.sqrt(visible.length)));
    rows = Math.ceil(visible.length / cols);
  }

  const gapX = Math.max(MIN_NODE_GAP, bw / Math.max(cols, 1));
  const gapY = Math.max(MIN_NODE_GAP, bh / Math.max(rows, 1));
  const usedW = (cols - 1) * gapX;
  const usedH = (rows - 1) * gapY;
  const originX = (box.x0 + box.x1) / 2 - usedW / 2;
  const originY = (box.y0 + box.y1) / 2 - usedH / 2;

  return visible.map((n, i) => ({
    ...n,
    x: originX + (i % cols) * gapX,
    y: originY + Math.floor(i / cols) * gapY,
  }));
}

/**
 * Keep the hottest / most-connected nodes so Watch-pulse topology stays readable.
 */
export function pruneGraphNodes(
  nodes: Array<Omit<CommandGraphNode, "x" | "y">>,
  edges: CommandGraphEdge[],
  limit = MAX_GRAPH_NODES
): { nodes: Array<Omit<CommandGraphNode, "x" | "y">>; edges: CommandGraphEdge[] } {
  if (nodes.length <= limit) return { nodes, edges };

  const rank = (n: Omit<CommandGraphNode, "x" | "y">) =>
    n.riskScore * 10 + n.eventCount + (n.severity === "CRITICAL" ? 40 : n.severity === "HIGH" ? 20 : 0);

  const sorted = [...nodes].sort((a, b) => rank(b) - rank(a));
  const keep = new Set(sorted.slice(0, limit).map((n) => n.id));

  // Pull in 1-hop neighbors of kept hot nodes so edges don't orphan.
  for (const e of edges) {
    if (keep.has(e.source) && nodes.some((n) => n.id === e.target)) keep.add(e.target);
    if (keep.has(e.target) && nodes.some((n) => n.id === e.source)) keep.add(e.source);
  }
  // Re-cap after neighbor expansion
  if (keep.size > limit + 12) {
    const trimmed = sorted.filter((n) => keep.has(n.id)).slice(0, limit);
    keep.clear();
    for (const n of trimmed) keep.add(n.id);
  }

  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

function applyLayout<T extends { id: string }>(
  items: T[]
): Array<T & { x: number; y: number }> {
  const positions = layoutNodes(items.length);
  return items.map((item, i) => ({ ...item, ...positions[i]! }));
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function kindFromTopologyType(type?: string, id?: string): CommandNodeKind {
  const t = (type ?? "").toLowerCase();
  if (t === "tool" || id?.startsWith("tool-")) return "tool";
  if (t === "session") return "session";
  if (t === "control") return "control";
  return "agent";
}

function mergeNodeMeta(
  existing: Omit<CommandGraphNode, "x" | "y">,
  incoming: Omit<CommandGraphNode, "x" | "y">
): Omit<CommandGraphNode, "x" | "y"> {
  const risk = Math.max(existing.riskScore, incoming.riskScore);
  const status =
    scoreToSeverity(incoming.riskScore, incoming.status) === "CRITICAL" ||
    scoreToSeverity(incoming.riskScore, incoming.status) === "HIGH"
      ? incoming.status
      : existing.riskScore >= incoming.riskScore
        ? existing.status
        : incoming.status;
  return {
    ...existing,
    label: existing.label || incoming.label,
    riskScore: risk,
    status,
    severity: scoreToSeverity(risk, status),
    eventCount: Math.max(existing.eventCount, incoming.eventCount),
    sessionId: existing.sessionId ?? incoming.sessionId,
  };
}

/** Infer a missing node referenced by an edge (backend may omit agent stubs). */
function stubNodeFromEdgeRef(id: string): Omit<CommandGraphNode, "x" | "y"> {
  const kind = kindFromTopologyType(undefined, id);
  let label = id;
  if (id.startsWith("agent-")) label = id.slice("agent-".length);
  else if (id.startsWith("tool-")) {
    const rest = id.slice("tool-".length);
    const parts = rest.split("-");
    label = parts.length > 1 ? parts.slice(1).join("-") : rest;
  } else if (kind === "session") label = shortId(id);
  return {
    id,
    label,
    kind,
    severity: "SAFE",
    riskScore: 0,
    status: "ACTIVE",
    eventCount: 1,
    sessionId: kind === "session" ? id : undefined,
  };
}

export function buildGraphFromTopology(payload: TopologyApiPayload): CommandGraphModel | null {
  const rawNodes = payload.nodes ?? [];
  if (!rawNodes.length) return null;

  const byId = new Map<string, Omit<CommandGraphNode, "x" | "y">>();

  for (const n of rawNodes) {
    const id = String(n.id);
    const risk = Number(n.risk_score ?? 0);
    const kind = kindFromTopologyType(n.type, id);
    const label =
      kind === "session"
        ? `${String(n.label || "session")} · ${shortId(id)}`
        : String(n.label || id);
    const next: Omit<CommandGraphNode, "x" | "y"> = {
      id,
      label,
      kind,
      severity: scoreToSeverity(risk, n.status),
      riskScore: risk,
      status: String(n.status ?? "ACTIVE"),
      eventCount: 1,
      sessionId: kind === "session" ? id : undefined,
    };
    const prev = byId.get(id);
    byId.set(id, prev ? mergeNodeMeta(prev, next) : next);
  }

  const edgeAcc = new Map<string, CommandGraphEdge>();
  for (const e of payload.edges ?? []) {
    const source = String(e.source);
    const target = String(e.target);
    if (!byId.has(source)) byId.set(source, stubNodeFromEdgeRef(source));
    if (!byId.has(target)) byId.set(target, stubNodeFromEdgeRef(target));
    const key = `${source}→${target}`;
    const label = String(e.type ?? "call").replace(/_/g, " ");
    const prev = edgeAcc.get(key);
    if (prev) {
      prev.count += 1;
      continue;
    }
    edgeAcc.set(key, {
      id: `topo-${edgeAcc.size}`,
      source,
      target,
      label,
      status: "ACTIVE",
      count: 1,
    });
  }

  // Propagate session/agent risk onto linked tools so breach paths light up.
  for (const edge of edgeAcc.values()) {
    const src = byId.get(edge.source);
    const tgt = byId.get(edge.target);
    if (!src || !tgt) continue;
    if (tgt.kind === "tool" && src.riskScore > tgt.riskScore) {
      byId.set(tgt.id, {
        ...tgt,
        riskScore: src.riskScore,
        status: src.status,
        severity: scoreToSeverity(src.riskScore, src.status),
      });
    }
    if (src.kind === "session" && tgt.kind === "agent" && src.riskScore > tgt.riskScore) {
      byId.set(tgt.id, {
        ...tgt,
        riskScore: src.riskScore,
        status: src.status,
        severity: scoreToSeverity(src.riskScore, src.status),
      });
    }
  }

  const pruned = pruneGraphNodes([...byId.values()], [...edgeAcc.values()]);
  const positioned = layoutByKind(pruned.nodes);
  const edges = pruned.edges;
  const placed = new Map(positioned.map((n) => [n.id, n]));
  for (const edge of edges) {
    const src = placed.get(edge.source);
    const tgt = placed.get(edge.target);
    const maxRisk = Math.max(src?.riskScore ?? 0, tgt?.riskScore ?? 0);
    edge.status = edgeStatusFromRisk(maxRisk, src?.status ?? tgt?.status);
  }

  return finalize(positioned, edges, "topology");
}

export function buildGraphFromTelemetry(events: LiveEventLike[]): CommandGraphModel | null {
  if (!events.length) return null;

  const agentMap = new Map<
    string,
    { risk: number; count: number; status: string; sessionId?: string }
  >();
  const toolMap = new Map<string, { risk: number; count: number; status: string }>();
  const linkMap = new Map<string, { count: number; risk: number; verdict: string; label: string }>();

  for (const evt of events) {
    const agentId = String(evt.agent_id ?? "").trim() || "unknown-agent";
    const toolName = String(evt.tool_name ?? "").trim();
    const risk = Number(evt.risk_score ?? 0);
    const verdict = String(evt.verdict ?? evt.action ?? "");
    const sessionId = evt.session_id != null ? String(evt.session_id) : undefined;

    const prev = agentMap.get(agentId) ?? { risk: 0, count: 0, status: "ACTIVE", sessionId };
    agentMap.set(agentId, {
      risk: Math.max(prev.risk, risk),
      count: prev.count + 1,
      status: risk >= prev.risk ? verdict || prev.status : prev.status,
      sessionId: sessionId ?? prev.sessionId,
    });

    if (toolName && toolName !== "session") {
      const tPrev = toolMap.get(toolName) ?? { risk: 0, count: 0, status: "ACTIVE" };
      toolMap.set(toolName, {
        risk: Math.max(tPrev.risk, risk),
        count: tPrev.count + 1,
        status: risk >= tPrev.risk ? verdict || tPrev.status : tPrev.status,
      });
      const linkKey = `${agentId}→${toolName}`;
      const lPrev = linkMap.get(linkKey) ?? { count: 0, risk: 0, verdict: "", label: toolName };
      linkMap.set(linkKey, {
        count: lPrev.count + 1,
        risk: Math.max(lPrev.risk, risk),
        verdict: risk >= lPrev.risk ? verdict : lPrev.verdict,
        label: toolName,
      });
    }
  }

  const rawNodes: Omit<CommandGraphNode, "x" | "y">[] = [];
  for (const [id, meta] of agentMap) {
    rawNodes.push({
      id: `agent-${id}`,
      label: id,
      kind: "agent",
      severity: scoreToSeverity(meta.risk, meta.status),
      riskScore: meta.risk,
      status: meta.status || "ACTIVE",
      eventCount: meta.count,
      sessionId: meta.sessionId,
    });
  }
  for (const [name, meta] of toolMap) {
    rawNodes.push({
      id: `tool-${name}`,
      label: name,
      kind: "tool",
      severity: scoreToSeverity(meta.risk, meta.status),
      riskScore: meta.risk,
      status: meta.status || "ACTIVE",
      eventCount: meta.count,
    });
  }

  const draftEdges: CommandGraphEdge[] = [];
  let i = 0;
  for (const [key, meta] of linkMap) {
    const [agentId, toolName] = key.split("→");
    draftEdges.push({
      id: `tel-e${i++}`,
      source: `agent-${agentId}`,
      target: `tool-${toolName}`,
      label: meta.label,
      status: edgeStatusFromRisk(meta.risk, meta.verdict),
      count: meta.count,
    });
  }

  const pruned = pruneGraphNodes(rawNodes, draftEdges);
  const positioned = layoutByKind(pruned.nodes);
  return finalize(positioned, pruned.edges, "telemetry");
}

/** Empty live graph — waiting for topology API or ingest telemetry. */
export function emptyCommandGraph(): CommandGraphModel {
  return finalize([], [], "idle");
}

function finalize(
  nodes: CommandGraphNode[],
  edges: CommandGraphEdge[],
  source: CommandGraphModel["source"]
): CommandGraphModel {
  const compromisedCount = nodes.filter(
    (n) => n.severity === "CRITICAL" || n.severity === "HIGH"
  ).length;
  const activeCount = nodes.filter((n) => n.kind !== "control" || n.riskScore > 0).length;
  const maxRisk = nodes.reduce((m, n) => Math.max(m, n.riskScore), 0);
  const totalEvents = nodes.reduce((s, n) => s + n.eventCount, 0);
  return { nodes, edges, source, compromisedCount, activeCount, maxRisk, totalEvents };
}

/** Fold live telemetry counts/risk into a topology graph without inventing nodes. */
export function enrichTopologyWithTelemetry(
  topology: CommandGraphModel,
  events: LiveEventLike[]
): CommandGraphModel {
  if (!events.length) return topology;

  const byId = new Map(topology.nodes.map((n) => [n.id, { ...n }]));
  const edgeByKey = new Map(
    topology.edges.map((e) => [`${e.source}→${e.target}`, { ...e }])
  );

  for (const evt of events) {
    const agentId = String(evt.agent_id ?? "").trim();
    const toolName = String(evt.tool_name ?? "").trim();
    const risk = Number(evt.risk_score ?? 0);
    const verdict = String(evt.verdict ?? evt.action ?? "");
    const sessionId = evt.session_id != null ? String(evt.session_id) : undefined;

    const bump = (id: string | undefined) => {
      if (!id) return;
      const node = byId.get(id);
      if (!node) return;
      const nextRisk = Math.max(node.riskScore, risk);
      byId.set(id, {
        ...node,
        riskScore: nextRisk,
        eventCount: node.eventCount + 1,
        status: risk >= node.riskScore ? verdict || node.status : node.status,
        severity: scoreToSeverity(nextRisk, risk >= node.riskScore ? verdict : node.status),
        sessionId: node.sessionId ?? sessionId,
      });
    };

    if (sessionId) bump(sessionId);
    if (agentId) bump(`agent-${agentId}`);
    if (agentId && toolName) {
      bump(`tool-${agentId}-${toolName}`);
      bump(`tool-${toolName}`);
      const key = `agent-${agentId}→tool-${agentId}-${toolName}`;
      const alt = `agent-${agentId}→tool-${toolName}`;
      const edge = edgeByKey.get(key) ?? edgeByKey.get(alt);
      if (edge) {
        edge.count += 1;
        edge.status = edgeStatusFromRisk(Math.max(edge.count > 0 ? risk : 0, risk), verdict);
        edgeByKey.set(`${edge.source}→${edge.target}`, edge);
      }
    }
  }

  return finalize([...byId.values()], [...edgeByKey.values()], "topology");
}

export function deriveCommandGraph(input: {
  topology: TopologyApiPayload | null;
  events: LiveEventLike[];
}): CommandGraphModel {
  const fromTopo = input.topology ? buildGraphFromTopology(input.topology) : null;
  if (fromTopo) {
    return enrichTopologyWithTelemetry(fromTopo, input.events);
  }
  const fromTel = buildGraphFromTelemetry(input.events);
  if (fromTel) return fromTel;
  return emptyCommandGraph();
}

export const COMMAND_GRAPH_VIEW = { width: VIEW_W, height: VIEW_H } as const;

export function severityStroke(severity: CommandNodeSeverity): string {
  switch (severity) {
    case "CRITICAL":
      return "hsl(var(--severity-critical))";
    case "HIGH":
      return "hsl(var(--severity-high))";
    case "MEDIUM":
      return "hsl(var(--severity-medium))";
    case "LOW":
      return "hsl(var(--severity-low))";
    default:
      return "hsl(var(--border))";
  }
}

export function edgeStroke(status: CommandEdgeStatus): string {
  switch (status) {
    case "COMPROMISED":
      return "hsl(var(--severity-critical))";
    case "QUARANTINED":
      return "hsl(var(--severity-high))";
    case "ACTIVE":
      return "hsl(var(--primary))";
    default:
      return "hsl(var(--border))";
  }
}
