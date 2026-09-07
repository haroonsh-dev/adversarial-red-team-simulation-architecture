import {
  activityVolumeRiskSeries,
  agentActivityLanes,
  detectorAverages,
  eventVolumeSeries,
  recentActivityStream,
  severityBreakdown,
  topTools,
  topAgentsByRisk,
  uniqueSessionCount,
  verdictBreakdown,
} from "@/lib/commandCenterAnalytics";

const now = Date.now();

describe("commandCenterAnalytics", () => {
  const events = [
    {
      event_id: "1",
      session_id: "s1",
      agent_id: "a1",
      tool_name: "execute_sql",
      risk_score: 85,
      verdict: "QUARANTINE",
      timestamp: new Date(now - 60_000).toISOString(),
      rule_based_score: 80,
      semantic_score: 70,
      injection_score: 90,
    },
    {
      event_id: "2",
      session_id: "s1",
      agent_id: "a1",
      tool_name: "read_file",
      risk_score: 20,
      verdict: "ALLOW",
      timestamp: new Date(now - 30_000).toISOString(),
      rule_based_score: 10,
      semantic_score: 15,
      injection_score: 5,
    },
    {
      event_id: "3",
      session_id: "s2",
      agent_id: "a2",
      tool_name: "execute_sql",
      risk_score: 65,
      verdict: "WARN",
      timestamp: new Date(now - 10_000).toISOString(),
      rule_based_score: 50,
      semantic_score: 60,
    },
  ];

  it("breaks down verdicts", () => {
    const v = verdictBreakdown(events);
    expect(v.find((d) => d.name === "Blocked")?.value).toBe(1);
    expect(v.find((d) => d.name === "Clear")?.value).toBe(1);
    expect(v.find((d) => d.name === "Flagged")?.value).toBe(1);
  });

  it("breaks down severity", () => {
    const s = severityBreakdown(events);
    expect(s.find((d) => d.name === "Critical")?.value).toBe(1);
    expect(s.find((d) => d.name === "High")?.value).toBe(1);
    expect(s.find((d) => d.name === "Low")?.value).toBe(1);
  });

  it("ranks top tools", () => {
    const t = topTools(events);
    expect(t[0]?.name).toBe("execute_sql");
    expect(t[0]?.count).toBe(2);
  });

  it("builds event volume buckets", () => {
    const vol = eventVolumeSeries(events, 6, 5 * 60_000);
    expect(vol.reduce((n, b) => n + b.count, 0)).toBe(3);
  });

  it("averages detector scores", () => {
    const d = detectorAverages(events);
    const policy = d.find((x) => x.name === "Policy");
    expect(policy?.score).toBeGreaterThan(0);
  });

  it("counts unique sessions", () => {
    expect(uniqueSessionCount(events)).toBe(2);
  });

  it("ranks agents by average risk", () => {
    const agents = topAgentsByRisk(events);
    expect(agents[0]?.id).toBe("a2");
    expect(agents[0]?.avgRisk).toBe(65);
    expect(agents[1]?.id).toBe("a1");
  });

  it("builds volume+risk activity series", () => {
    const series = activityVolumeRiskSeries(events, 6, 5 * 60_000);
    const total = series.reduce((n, b) => n + b.count, 0);
    expect(total).toBe(3);
    expect(series.some((b) => b.avgRisk > 0)).toBe(true);
  });

  it("builds agent activity lanes", () => {
    const lanes = agentActivityLanes(events, 6, 5 * 60_000, 3);
    expect(lanes.length).toBeGreaterThan(0);
    expect(lanes[0]?.total).toBeGreaterThan(0);
  });

  it("streams recent activity newest first", () => {
    const stream = recentActivityStream(events, 2);
    expect(stream).toHaveLength(2);
    expect(stream[0]?.tool).toBe("execute_sql");
  });
});
