/**
 * Target registry types and surface helpers.
 *
 * Mirrors `backend/src/core/models/targets.py` — one source of truth for the
 * shape, kept in sync by hand as with the rest of `lib/types.ts`.
 */

export type TargetKind =
  | "llm"
  | "chatbot"
  | "rag"
  | "agent"
  | "multi_agent"
  | "mcp_agent"
  | "api_app"
  | "workflow";

export const TARGET_KINDS: ReadonlyArray<{ id: TargetKind; label: string }> = [
  { id: "llm", label: "LLM" },
  { id: "chatbot", label: "Chatbot" },
  { id: "rag", label: "RAG application" },
  { id: "agent", label: "AI agent" },
  { id: "multi_agent", label: "Multi-agent system" },
  { id: "mcp_agent", label: "MCP-connected agent" },
  { id: "api_app", label: "API application" },
  { id: "workflow", label: "Enterprise workflow" },
];

export type CapabilityId =
  | "tools"
  | "memory"
  | "rag"
  | "mcp"
  | "external_api"
  | "system_prompt_disclosure"
  | "input_guardrail"
  | "output_guardrail";

export const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  tools: "Tools",
  memory: "Memory",
  rag: "Retrieval",
  mcp: "MCP / plugins",
  external_api: "Network access",
  system_prompt_disclosure: "Prompt disclosure",
  input_guardrail: "Input guardrail",
  output_guardrail: "Output guardrail",
};

export interface TargetCapability {
  id: CapabilityId;
  present: boolean;
  confidence: number;
  evidence: string;
}

export interface TargetSurfaceItem {
  taxonomy_id: string;
  title: string;
  rationale: string;
  from_capabilities: string[];
}

export interface TargetSurface {
  reachable: boolean;
  unreachable_reason: string | null;
  probes_run: number;
  reported_model: string | null;
  capabilities: TargetCapability[];
  surface: TargetSurfaceItem[];
  trust_boundaries: string[];
  discovered_at: string | null;
}

export interface Target {
  id: string;
  tenant_id: string;
  name: string;
  kind: TargetKind;
  version: string;
  description: string | null;
  provider: string;
  model: string;
  base_url: string | null;
  system_prompt: string | null;
  authorized: boolean;
  tags: string[];
  config: Record<string, unknown>;
  surface: TargetSurface | null;
  discovered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TargetDraft {
  name: string;
  kind: TargetKind;
  version: string;
  description?: string | null;
  provider: string;
  model: string;
  base_url?: string | null;
  system_prompt?: string | null;
  authorized: boolean;
}

export function kindLabel(kind: string): string {
  return TARGET_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/** Where a target sits in the discovery lifecycle. Drives the status chip. */
export type DiscoveryState = "unauthorized" | "undiscovered" | "unreachable" | "mapped";

export function discoveryState(target: Target): DiscoveryState {
  if (!target.authorized) return "unauthorized";
  if (!target.surface) return "undiscovered";
  if (!target.surface.reachable) return "unreachable";
  return "mapped";
}

export const DISCOVERY_STATE_COPY: Record<DiscoveryState, { label: string; hint: string }> = {
  unauthorized: {
    label: "Not authorized",
    hint: "Authorize this target before ARTSA sends it any traffic.",
  },
  undiscovered: {
    label: "Not mapped",
    hint: "Run discovery to find its capabilities and attack surface.",
  },
  unreachable: {
    label: "Unreachable",
    hint: "Discovery could not reach the target, so its surface is unknown.",
  },
  mapped: { label: "Mapped", hint: "Attack surface derived from discovery evidence." },
};

/** Capabilities discovery confirmed are present, in display order. */
export function presentCapabilities(surface: TargetSurface | null): TargetCapability[] {
  if (!surface) return [];
  const order = Object.keys(CAPABILITY_LABELS) as CapabilityId[];
  return surface.capabilities
    .filter((c) => c.present)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/**
 * Coverage of the 12-category taxonomy for one target.
 *
 * `open` counts categories the target's own capabilities exposed. An
 * unmapped target reports zero rather than a guess.
 */
export function surfaceCoverage(surface: TargetSurface | null): {
  open: number;
  total: number;
} {
  return { open: surface?.reachable ? surface.surface.length : 0, total: 12 };
}
