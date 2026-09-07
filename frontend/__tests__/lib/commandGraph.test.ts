import {
  buildGraphFromTelemetry,
  buildGraphFromTopology,
  deriveCommandGraph,
  emptyCommandGraph,
  layoutByKind,
  layoutNodes,
  type CommandGraphNode,
} from "@/lib/commandGraph";

describe("commandGraph", () => {
  it("layouts nodes deterministically", () => {
    const a = layoutNodes(4);
    const b = layoutNodes(4);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
  });

  it("swimlanes agents left and tools right", () => {
    const laid = layoutByKind([
      {
        id: "a1",
        label: "scout",
        kind: "agent",
        severity: "SAFE",
        riskScore: 0,
        status: "ACTIVE",
        eventCount: 1,
      },
      {
        id: "t1",
        label: "query",
        kind: "tool",
        severity: "SAFE",
        riskScore: 0,
        status: "ACTIVE",
        eventCount: 1,
      },
      {
        id: "s1",
        label: "sess",
        kind: "session",
        severity: "SAFE",
        riskScore: 0,
        status: "ACTIVE",
        eventCount: 1,
      },
    ]);
    const agent = laid.find((n) => n.kind === "agent")!;
    const tool = laid.find((n) => n.kind === "tool")!;
    const session = laid.find((n) => n.kind === "session")!;
    expect(agent.x).toBeLessThan(tool.x);
    expect(session.y).toBeLessThan(agent.y);
  });

  it("does not pile many sessions into the same pixel", () => {
    type RawNode = Omit<CommandGraphNode, "x" | "y">;
    const sessionNodes: RawNode[] = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      label: `sess-${i}`,
      kind: "session" as const,
      severity: "SAFE" as const,
      riskScore: i,
      status: "ACTIVE",
      eventCount: 1,
    }));
    const otherNodes: RawNode[] = [
      {
        id: "a1",
        label: "agent",
        kind: "agent" as const,
        severity: "HIGH" as const,
        riskScore: 70,
        status: "ACTIVE",
        eventCount: 3,
      },
      {
        id: "t1",
        label: "tool",
        kind: "tool" as const,
        severity: "SAFE" as const,
        riskScore: 0,
        status: "ACTIVE",
        eventCount: 1,
      },
    ];
    const many: RawNode[] = sessionNodes.concat(otherNodes);
    const laid = layoutByKind(many);
    const sessions = laid.filter((n) => n.kind === "session");
    expect(sessions.length).toBeGreaterThan(1);
    const xs = new Set(sessions.map((s) => Math.round(s.x)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it("builds graph from topology payload", () => {
    const graph = buildGraphFromTopology({
      nodes: [
        { id: "s1", label: "agent-a", type: "session", risk_score: 90, status: "BREACHED" },
        { id: "agent-a", label: "agent-a", type: "agent", risk_score: 90, status: "ACTIVE" },
        { id: "tool-x", label: "read_file", type: "tool", risk_score: 0 },
      ],
      edges: [
        { source: "s1", target: "agent-a", type: "session_link" },
        { source: "agent-a", target: "tool-x", type: "tool_call" },
      ],
    });
    expect(graph).not.toBeNull();
    expect(graph!.source).toBe("topology");
    expect(graph!.nodes).toHaveLength(3);
    expect(graph!.edges).toHaveLength(2);
    expect(graph!.compromisedCount).toBeGreaterThan(0);
    expect(graph!.maxRisk).toBe(90);
    expect(graph!.totalEvents).toBe(3);
  });

  it("builds graph from telemetry events", () => {
    const graph = buildGraphFromTelemetry([
      {
        agent_id: "scout",
        tool_name: "query_db",
        risk_score: 72,
        verdict: "SUSPICIOUS",
        session_id: "sess-1",
      },
      {
        agent_id: "scout",
        tool_name: "query_db",
        risk_score: 40,
        verdict: "SAFE",
        session_id: "sess-1",
      },
      {
        agent_id: "writer",
        tool_name: "write_file",
        risk_score: 10,
        verdict: "SAFE",
        session_id: "sess-2",
      },
    ]);
    expect(graph).not.toBeNull();
    expect(graph!.source).toBe("telemetry");
    expect(graph!.nodes.some((n) => n.label === "scout")).toBe(true);
    expect(graph!.edges.some((e) => e.label === "query_db" && e.count === 2)).toBe(true);
  });

  it("stays idle when empty — no demo nodes", () => {
    const graph = deriveCommandGraph({ topology: null, events: [] });
    expect(graph.source).toBe("idle");
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(emptyCommandGraph().source).toBe("idle");
  });

  it("synthesizes missing agent nodes and dedupes topology", () => {
    const graph = buildGraphFromTopology({
      nodes: [
        { id: "sess-1", label: "harness", type: "session", risk_score: 95, status: "BREACHED" },
        { id: "tool-harness-user_prompt", label: "user_prompt", type: "tool", risk_score: 0 },
        { id: "tool-harness-user_prompt", label: "user_prompt", type: "tool", risk_score: 0 },
      ],
      edges: [
        { source: "sess-1", target: "agent-harness", type: "session_link" },
        { source: "agent-harness", target: "tool-harness-user_prompt", type: "tool_call" },
        { source: "agent-harness", target: "tool-harness-user_prompt", type: "tool_call" },
      ],
    });
    expect(graph).not.toBeNull();
    expect(graph!.nodes.some((n) => n.id === "agent-harness")).toBe(true);
    expect(graph!.nodes.filter((n) => n.id === "tool-harness-user_prompt")).toHaveLength(1);
    expect(graph!.edges).toHaveLength(2);
    const tool = graph!.nodes.find((n) => n.id === "tool-harness-user_prompt");
    expect(tool?.riskScore).toBe(95);
    expect(tool?.severity).toBe("CRITICAL");
  });

  it("enriches topology with telemetry event counts", () => {
    const graph = deriveCommandGraph({
      topology: {
        nodes: [
          { id: "agent-harness", label: "harness", type: "agent", risk_score: 10, status: "ACTIVE" },
          { id: "tool-harness-user_prompt", label: "user_prompt", type: "tool", risk_score: 0 },
        ],
        edges: [
          { source: "agent-harness", target: "tool-harness-user_prompt", type: "tool_call" },
        ],
      },
      events: [
        {
          agent_id: "harness",
          tool_name: "user_prompt",
          risk_score: 95,
          verdict: "BREACHED",
          session_id: "s1",
        },
      ],
    });
    expect(graph.source).toBe("topology");
    const agent = graph.nodes.find((n) => n.id === "agent-harness");
    expect(agent?.riskScore).toBe(95);
    expect(agent?.eventCount).toBeGreaterThan(1);
  });

  it("prefers topology over telemetry", () => {
    const graph = deriveCommandGraph({
      topology: {
        nodes: [{ id: "a1", label: "live", type: "agent", risk_score: 5 }],
        edges: [],
      },
      events: [{ agent_id: "ignored", tool_name: "x", risk_score: 99 }],
    });
    expect(graph.source).toBe("topology");
    expect(graph.nodes[0]?.label).toBe("live");
  });
});
