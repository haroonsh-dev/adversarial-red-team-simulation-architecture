import { describe, expect, it } from "vitest";
import { mergeTelemetryEvents, telemetryFingerprint } from "@/lib/ingestTelemetry";

describe("mergeTelemetryEvents", () => {
  it("collapses client ingest row with WS echo that shares session/tool/time", () => {
    const session = "sess-abc";
    const ts = "2026-08-29T11:42:22.100Z";
    const client = {
      event_id: `ingest-${session}-999`,
      session_id: session,
      agent_id: "watch-agent-1",
      tool_name: "read_file",
      risk_score: 91,
      verdict: "BREACHED",
      triggered_at: ts,
      source: "ingest",
    };
    const server = {
      event_id: "server-uuid-1",
      session_id: session,
      agent_id: "watch-agent-1",
      tool_name: "read_file",
      risk_score: 91,
      verdict: "BREACHED",
      triggered_at: "2026-08-29T11:42:22.400Z",
    };

    const merged = mergeTelemetryEvents([client], [server]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.event_id).toBe("server-uuid-1");
  });

  it("keeps distinct tool calls in the same second", () => {
    const ts = "2026-08-29T11:42:22.000Z";
    const a = {
      event_id: "a",
      session_id: "s1",
      agent_id: "watch-agent-1",
      tool_name: "list_orders",
      risk_score: 0,
      verdict: "SAFE",
      triggered_at: ts,
    };
    const b = {
      event_id: "b",
      session_id: "s2",
      agent_id: "watch-agent-2",
      tool_name: "send_email",
      risk_score: 0,
      verdict: "SAFE",
      triggered_at: ts,
    };
    expect(mergeTelemetryEvents([a], [b])).toHaveLength(2);
  });

  it("uses the same fingerprint for near-identical timestamps", () => {
    const base = {
      session_id: "s",
      agent_id: "a",
      tool_name: "http_request",
      risk_score: 45,
      verdict: "SAFE",
    };
    expect(
      telemetryFingerprint({ ...base, triggered_at: "2026-08-29T11:42:22.000Z" })
    ).toBe(
      telemetryFingerprint({ ...base, triggered_at: "2026-08-29T11:42:22.900Z" })
    );
  });
});
