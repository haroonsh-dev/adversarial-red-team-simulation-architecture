/** Live telemetry helpers for Command Center — real timestamps only. */

export function eventTimestamp(e: Record<string, unknown>): number {
  const raw = String(e.timestamp ?? e.triggered_at ?? e.ts ?? "");
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Compact relative age for triage cards — e.g. "12s", "4m", "2h". */
export function formatEventAge(e: Record<string, unknown>, now = Date.now()): string {
  const t = eventTimestamp(e);
  if (!t) return "—";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

/** Events per minute from recent window (default 5 min). */
export function computeRecentEventRate(
  events: Array<Record<string, unknown>>,
  windowMs = 5 * 60_000,
  now = Date.now()
): number {
  const cut = now - windowMs;
  const recent = events.filter((e) => {
    const t = eventTimestamp(e);
    return t > 0 && t >= cut;
  });
  if (recent.length === 0) return 0;
  const mins = windowMs / 60_000;
  return Math.round((recent.length / mins) * 10) / 10;
}

export function sessionEvents(
  events: Array<Record<string, unknown>>,
  sessionId: string,
  limit = 12
): Array<Record<string, unknown>> {
  if (!sessionId) return [];
  return events
    .filter((e) => String(e.session_id ?? "") === sessionId)
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .slice(0, limit);
}

export type DetectorScores = {
  rule?: number;
  semantic?: number;
  injection?: number;
  layers?: Record<string, number>;
};

export function extractDetectorScores(raw: Record<string, unknown>): DetectorScores {
  const out: DetectorScores = {};
  const rule = raw.rule_based_score ?? raw.rule_score;
  const semantic = raw.semantic_score;
  const injection = raw.injection_score;
  if (typeof rule === "number") out.rule = rule;
  if (typeof semantic === "number") out.semantic = semantic;
  if (typeof injection === "number") out.injection = injection;
  const layers = raw.layer_scores;
  if (layers && typeof layers === "object" && !Array.isArray(layers)) {
    out.layers = layers as Record<string, number>;
  }
  return out;
}
