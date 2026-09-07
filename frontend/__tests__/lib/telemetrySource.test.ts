import {
  deriveTelemetryFeedMode,
  isBuiltInTestEvent,
  telemetryEventKind,
} from "@/lib/telemetrySource";

describe("telemetrySource", () => {
  it("flags built-in test agents", () => {
    expect(isBuiltInTestEvent({ agent_id: "watch-agent-2" })).toBe(true);
    expect(isBuiltInTestEvent({ agent_id: "triage-agent" })).toBe(true);
    expect(isBuiltInTestEvent({ agent_id: "my-production-bot" })).toBe(false);
  });

  it("derives test stream mode when stream is on", () => {
    expect(
      deriveTelemetryFeedMode({
        apiOnline: true,
        streamEnabled: true,
        usingHydrated: false,
        events: [{ agent_id: "watch-agent-1" }],
      })
    ).toBe("test_stream");
  });

  it("derives live ingest for real agents", () => {
    expect(
      deriveTelemetryFeedMode({
        apiOnline: true,
        streamEnabled: false,
        usingHydrated: false,
        events: [{ agent_id: "customer-agent-7", event_id: "e1" }],
      })
    ).toBe("live_ingest");
  });

  it("classifies event kinds", () => {
    expect(telemetryEventKind({ agent_id: "watch-agent-1" })).toBe("test");
    expect(telemetryEventKind({ agent_id: "prod", event_id: "x" })).toBe("live");
  });
});
