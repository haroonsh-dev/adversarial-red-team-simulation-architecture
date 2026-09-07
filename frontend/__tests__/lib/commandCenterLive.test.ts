import { describe, expect, it } from "vitest";
import {
  computeRecentEventRate,
  eventTimestamp,
  sessionEvents,
  extractDetectorScores,
} from "@/lib/commandCenterLive";

describe("commandCenterLive", () => {
  it("computes event rate from recent timestamps", () => {
    const now = Date.now();
    const events = [
      { timestamp: new Date(now - 30_000).toISOString(), risk_score: 10 },
      { timestamp: new Date(now - 60_000).toISOString(), risk_score: 20 },
      { timestamp: new Date(now - 120_000).toISOString(), risk_score: 30 },
    ];
    const rate = computeRecentEventRate(events, 5 * 60_000, now);
    expect(rate).toBeGreaterThan(0);
  });

  it("filters session chain events", () => {
    const events = [
      { session_id: "s1", tool_name: "a", risk_score: 10 },
      { session_id: "s2", tool_name: "b", risk_score: 20 },
      { session_id: "s1", tool_name: "c", risk_score: 90 },
    ];
    expect(sessionEvents(events, "s1")).toHaveLength(2);
  });

  it("extracts detector scores from raw event", () => {
    const scores = extractDetectorScores({
      rule_based_score: 42,
      semantic_score: 71,
      injection_score: 88,
    });
    expect(scores.rule).toBe(42);
    expect(scores.semantic).toBe(71);
    expect(scores.injection).toBe(88);
  });

  it("parses event timestamps", () => {
    expect(eventTimestamp({ triggered_at: "2026-01-01T12:00:00.000Z" })).toBeGreaterThan(0);
    expect(eventTimestamp({})).toBe(0);
  });
});
