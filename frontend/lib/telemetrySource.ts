/** Classify telemetry rows and feed-level data source for Command Center UX. */

export type TelemetryEventKind = "live" | "test" | "unknown";

const TEST_AGENT_RE = /^(triage-agent|watch-agent-\d+)$/;

export function isBuiltInTestEvent(event: Record<string, unknown>): boolean {
  const agent = String(event.agent_id ?? "");
  if (TEST_AGENT_RE.test(agent)) return true;
  const source = String(event.source ?? "");
  return source === "test_stream" || source === "test_probe";
}

export function telemetryEventKind(event: Record<string, unknown>): TelemetryEventKind {
  if (isBuiltInTestEvent(event)) return "test";
  const source = String(event.source ?? "");
  if (source === "ingest" || source === "websocket" || source === "rest") return "live";
  if (event.event_id || event.session_id) return "live";
  return "unknown";
}

export type TelemetryFeedMode =
  | "offline"
  | "no_traffic"
  | "live_ingest"
  | "session_history"
  | "test_stream"
  | "test_only"
  | "mixed";

export function deriveTelemetryFeedMode(opts: {
  apiOnline: boolean;
  streamEnabled: boolean;
  usingHydrated: boolean;
  events: Array<Record<string, unknown>>;
}): TelemetryFeedMode {
  const { apiOnline, streamEnabled, usingHydrated, events } = opts;
  if (!apiOnline) return "offline";
  if (events.length === 0) return "no_traffic";
  if (usingHydrated) return "session_history";

  const testCount = events.filter(isBuiltInTestEvent).length;
  const liveCount = events.length - testCount;

  if (streamEnabled && testCount > 0 && liveCount === 0) return "test_stream";
  if (testCount > 0 && liveCount === 0) return "test_only";
  if (testCount > 0 && liveCount > 0) return "mixed";
  return "live_ingest";
}
