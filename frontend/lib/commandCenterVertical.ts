/** ARTSA vertical story — AI agent containment vs generic SOC. */

export const VERTICAL_COMPARE = {
  generic: [
    { label: "Network & endpoint alerts", sub: "IPs, hosts, users" },
    { label: "SIEM correlation rules", sub: "Batch, minutes latency" },
    { label: "Ticket-based triage", sub: "Analyst queue only" },
  ],
  artsa: [
    { label: "Agent tool-call screening", sub: "Every LLM action ingested" },
    { label: "Session-scoped blast radius", sub: "Session → agent → tool graph" },
    { label: "Sub-50ms containment pipeline", sub: "Ingest → score → verdict → action" },
  ],
} as const;

export type MeshNodeId =
  | "prompt"
  | "agent"
  | "tool"
  | "ingest"
  | "detectors"
  | "verdict"
  | "action";

export interface MeshNode {
  id: MeshNodeId;
  label: string;
  sub: string;
  x: number;
  y: number;
  accent?: "indigo" | "emerald" | "amber" | "red";
}

export interface MeshEdge {
  from: MeshNodeId;
  to: MeshNodeId;
  label?: string;
}

/** Static layout for the “why our vertical” mesh diagram. */
export const CONTAINMENT_MESH: { nodes: MeshNode[]; edges: MeshEdge[] } = {
  nodes: [
    { id: "prompt", label: "User / prompt", sub: "Context boundary", x: 120, y: 200, accent: "indigo" },
    { id: "agent", label: "AI agent", sub: "Orchestrator", x: 320, y: 200, accent: "indigo" },
    { id: "tool", label: "Tool call", sub: "SQL · API · file", x: 520, y: 200, accent: "amber" },
    { id: "ingest", label: "Ingest", sub: "/api/v1/ingest", x: 720, y: 120, accent: "emerald" },
    { id: "detectors", label: "Detectors", sub: "Rule · semantic · injection", x: 920, y: 200, accent: "emerald" },
    { id: "verdict", label: "Verdict", sub: "Risk score + policy", x: 1120, y: 200, accent: "amber" },
    { id: "action", label: "Action", sub: "Allow · quarantine · kill", x: 1280, y: 200, accent: "red" },
  ],
  edges: [
    { from: "prompt", to: "agent", label: "delegates" },
    { from: "agent", to: "tool", label: "invokes" },
    { from: "tool", to: "ingest", label: "screened" },
    { from: "ingest", to: "detectors" },
    { from: "detectors", to: "verdict" },
    { from: "verdict", to: "action", label: "enforce" },
  ],
};

export const MESH_VIEWBOX = { width: 1400, height: 400 };
