/**
 * TypeScript Interfaces Matching ALL Backend Python Pydantic Models.
 */

export interface ToolCallEvent {
  id: string;
  session_id: string;
  agent_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  timestamp: string;
  trace_id: string;
  response?: Record<string, unknown> | null;
  latency_ms?: number | null;
}

export interface SecurityEvent {
  id: string;
  session_id: string;
  agent_id: string;
  event_type: 
    | "PROMPT_INJECTION"
    | "JAILBREAK"
    | "CREDENTIAL_THEFT"
    | "REVERSE_SHELL"
    | "EGRESS_TUNNEL"
    | "PRIVILEGE_ESCALATION"
    | "GOAL_DRIFT"
    | "SANDBOX_ESCAPE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  risk_score: number; // 0-100
  description: string;
  evidence: Record<string, unknown>;
  timestamp: string;
  detector: string;
}

export interface Session {
  id: string;
  agent_id: string;
  tenant_id: string;
  status: "ACTIVE" | "CLOSED" | "BREACHED" | "QUARANTINED";
  started_at: string;
  ended_at?: string | null;
  tool_call_count: number;
  max_risk_score: number;
  containment_breaches: number;
  circuit_breaker_open?: boolean;
}

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  status: "HEALTHY" | "AT_RISK" | "BREACHED" | "QUARANTINED";
  last_seen: string;
  total_sessions: number;
  total_breaches: number;
}

export interface AgentBaseline {
  agent_id: string;
  tool_frequency: Record<string, number>;
  common_file_paths: string[];
  avg_session_duration: number;
  updated_at: string;
}

export interface RiskScore {
  session_id: string;
  timestamp: string;
  overall_score: number; // 0-100
  rule_based_score: number; // 0-100
  statistical_score: number; // 0-100
  semantic_score: number; // 0-100
  goal_drift_score: number; // 0-100
  bypass_depth: number; // 0-5
  flags: string[];
}

export interface ContainmentVerdict {
  session_id: string;
  verdict: "SAFE" | "SUSPICIOUS" | "BREACHED" | "ESCALATED";
  confidence: number;
  reasoning: string;
  recommended_action: "NONE" | "ALERT" | "THROTTLE" | "KILL" | "QUARANTINE";
}

export interface Alert {
  id: string;
  session_id: string;
  agent_id: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  channel: "WEBHOOK" | "SLACK" | "PAGERDUTY" | "EMAIL";
  triggered_at: string;
  delivered: boolean;
  status?: "NEW" | "ACKNOWLEDGED" | "RESOLVED";
}

export interface AlertRule {
  id: string;
  tenant_id: string;
  risk_threshold: number;
  channel: "WEBHOOK" | "SLACK" | "PAGERDUTY" | "EMAIL";
  target_url: string;
  enabled: boolean;
}

export interface AgenticRisk {
  id: string;
  rank: number;
  name: string;
  description: string;
  attack_categories: string[];
  defense_layers: string[];
  detectors: string[];
  mitigations: string[];
  live_events: number;
  blocked_events: number;
  breached_events: number;
  max_risk_score: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface RiskFrameworkResponse {
  framework: AgenticRisk[];
  total_events: number;
  generated_at: string | null;
}

// ─── Custom outbound integrations (config-driven connectors) ───────────────

export type EventType = "alert" | "tool_call" | "proxy_call" | "session_action";
export type AuthType = "none" | "bearer" | "basic" | "api_key";

export interface CustomIntegration {
  id: string;
  name: string;
  description: string | null;
  method: "POST" | "PUT" | "PATCH";
  target_url: string;
  auth_type: AuthType;
  headers: Record<string, string>;
  payload_template: string | null;
  event_types: EventType[];
  risk_threshold: number;
  enabled: boolean;
  retries: number;
  timeout: number;
  secrets_masked: Record<string, string>;
  has_secrets: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface IntegrationAuthTypeInfo {
  type: AuthType;
  secrets: string[];
  header: string | null;
}

export interface CustomIntegrationSchema {
  event_types: EventType[];
  methods: string[];
  auth_types: IntegrationAuthTypeInfo[];
  template_fields: Record<EventType, string[]>;
  placeholder_syntax: { field: string; secret: string };
}
