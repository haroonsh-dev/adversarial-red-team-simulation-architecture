/** Map ingest API responses to telemetry rows (matches WebSocket `telemetry_bus` shape). */

export interface IngestRequestPayload {
  session_id: string;
  agent_id: string;
  tool_name: string;
  arguments?: Record<string, unknown>;
}

export interface IngestApiPayload {
  session_id?: string;
  agent_id?: string;
  tool_name?: string;
  risk_score?: { overall_score?: number };
  verdict?: { verdict?: string; recommended_action?: string; confidence?: number };
}

export function ingestResponseToTelemetry(
  request: IngestRequestPayload,
  response: IngestApiPayload
): Record<string, unknown> {
  const risk = response.risk_score?.overall_score ?? 0;
  const verdict = response.verdict?.verdict ?? "";
  const action = response.verdict?.recommended_action ?? "";
    return {
      type: "tool_call",
      event_id: `ingest-${request.session_id}-${Date.now()}`,
      session_id: response.session_id ?? request.session_id,
      agent_id: response.agent_id ?? request.agent_id,
      tool_name: response.tool_name ?? request.tool_name,
      risk_score: risk,
      verdict,
      action,
      recommended_action: action,
      triggered_at: new Date().toISOString(),
      source: "ingest",
    };
}

/** Content fingerprint — collapses client ingest rows + WS/REST copies with different event_ids. */
export function telemetryFingerprint(evt: Record<string, unknown>): string {
  const session = String(evt.session_id ?? "");
  const tool = String(evt.tool_name ?? "");
  const agent = String(evt.agent_id ?? "");
  const risk = Math.round(Number(evt.risk_score ?? 0));
  const verdict = String(evt.verdict ?? "").toUpperCase();
  const rawTs = String(evt.triggered_at ?? evt.timestamp ?? "");
  const t = Date.parse(rawTs);
  // 3s bucket absorbs clock skew between local append and WS/REST echo
  const bucket = Number.isFinite(t) ? Math.floor(t / 3000) : rawTs;
  return `${session}|${tool}|${agent}|${bucket}|${risk}|${verdict}`;
}

function isServerEventId(id: string): boolean {
  return Boolean(id) && !id.startsWith("ingest-");
}

function preferEvent(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  const aId = String(a.event_id ?? "");
  const bId = String(b.event_id ?? "");
  if (isServerEventId(aId) && !isServerEventId(bId)) return a;
  if (isServerEventId(bId) && !isServerEventId(aId)) return b;
  return a;
}

export function mergeTelemetryEvents(
  existing: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
  limit = 50
): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();

  // Prefer newest first for live Logs / Command Center.
  for (const evt of [...incoming, ...existing]) {
    const key = telemetryFingerprint(evt);
    const prev = byKey.get(key);
    byKey.set(key, prev ? preferEvent(prev, evt) : evt);
  }

  const merged = Array.from(byKey.values());
  merged.sort((a, b) => {
    const ta = Date.parse(String(a.triggered_at ?? a.timestamp ?? "")) || 0;
    const tb = Date.parse(String(b.triggered_at ?? b.timestamp ?? "")) || 0;
    return tb - ta;
  });

  return merged.slice(0, limit);
}
