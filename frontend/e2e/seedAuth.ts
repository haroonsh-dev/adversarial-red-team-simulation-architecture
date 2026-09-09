import type { Page } from "@playwright/test";

// With ARTSA_REQUIRE_AUTH=true the UI requires a role API key. Seed the
// frontend auth store (sessionStorage "artsa-auth") with the admin key so
// e2e runs as an authenticated admin. Provide it via ARTSA_API_KEY.
export function seedAuthScript(): string {
  // E2E runs are deliberately self-contained. A caller may override this
  // with ARTSA_API_KEY, but browser tests must never depend on a production
  // credential being present in the environment.
  const key = process.env.ARTSA_API_KEY || "e2e-test-key";
  // Skip seeding on landing sign-in so anonymous auth UI tests can run.
  return `if (location.pathname !== "/login" && !location.search.includes("signin=1")) { sessionStorage.setItem("artsa-auth", JSON.stringify({ state: { bearerToken: null, refreshToken: null, expiresAt: null, apiKey: "${key}" }, version: 0 })); }`;
}

// Identity the app would receive from GET /api/v1/config/me. With no backend
// in the CI frontend job, we mock it so role + capabilities resolve and the
// sidebar / auth guards render the admin nav (e.g. Wargame).
const ADMIN_IDENTITY = {
  authenticated: true,
  role: "admin",
  capabilities: {
    can_ingest: true,
    can_run_campaigns: true,
    can_run_benchmark: true,
    can_run_ablation: true,
    can_manage_policies: true,
    can_manage_providers: true,
    can_manage_integrations: true,
    can_manage_targets: true,
    read_only: false,
  },
  auth_required: false,
  oidc_enabled: false,
  user: {
    email: "ci@artsa.local",
    role: "admin",
    display_name: "CI Admin",
    avatar: null,
  },
};

export async function seedAuth(page: Page): Promise<void> {
  const script = seedAuthScript();
  await page.addInitScript(script);

  const json = (body: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  const session = {
    id: "e2e-session-001",
    agent_id: "e2e-agent",
    tenant_id: "e2e-tenant",
    status: "ACTIVE",
    started_at: "2026-01-01T00:00:00Z",
    ended_at: null,
    tool_call_count: 1,
    max_risk_score: 42,
    containment_breaches: 0,
  };
  const timeline = [{
    event: {
      id: "e2e-event-001",
      session_id: session.id,
      agent_id: session.agent_id,
      tool_name: "search_documents",
      arguments: { query: "e2e fixture" },
      response: { content: "safe fixture" },
      timestamp: "2026-01-01T00:00:01Z",
      trace_id: "e2e-trace-001",
      latency_ms: 12,
    },
    evaluation: { verdict: "SAFE", risk_score: 4, severity: "LOW" },
  }];
  const campaigns = { campaigns: [{
    id: "e2e-campaign-001",
    name: "E2E baseline",
    status: "COMPLETED",
    provider: "fixture",
    model: "fixture-model",
    rounds_completed: 1,
    total_rounds: 1,
    summary: { risk_score: 12 },
    error: null,
  }] };
  const risks = {
    framework: [
      { id: "goal-hijack", rank: 1, name: "Agent Goal Hijack", description: "Fixture risk", attack_categories: ["IPI"], defense_layers: ["input"], detectors: [], mitigations: ["Review inputs"], live_events: 0, blocked_events: 0, breached_events: 0, max_risk_score: 0, severity: "HIGH" },
      { id: "rogue-agents", rank: 2, name: "Rogue Agents", description: "Fixture risk", attack_categories: ["DEX"], defense_layers: ["runtime"], detectors: [], mitigations: ["Constrain tools"], live_events: 0, blocked_events: 0, breached_events: 0, max_risk_score: 0, severity: "HIGH" },
    ],
    total_events: 0,
    generated_at: null,
  };

  // Keep every protected-page fetch deterministic and local to the browser.
  await page.route("**/api/v1/config/me**", (route) => route.fulfill(json(ADMIN_IDENTITY)));
  await page.route("**/config/me**", (route) => route.fulfill(json(ADMIN_IDENTITY)));
  await page.route("**/api/v1/campaigns**", (route) => route.fulfill(json(campaigns)));
  await page.route("**/api/v1/policies/versions**", (route) => route.fulfill(json({ current_version: 1, versions: [] })));
  await page.route("**/api/v1/policies**", (route) => route.fulfill(json({ rules: [], playbook_version: 1 })));
  await page.route("**/api/v1/metrics/dashboard**", (route) => route.fulfill(json({ severity_counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }, defense_layers: {}, defense_score: 100, risk_trend: [], avg_risk_score: 0, max_risk_score: 0, active_sessions: 1, event_rate: 0, total_events: 0 })));
  await page.route("**/api/v1/telemetry/recent**", (route) => route.fulfill(json({ events: [] })));
  await page.route("**/api/v1/health**", (route) => route.fulfill(json({ status: "ok" })));
  await page.route("**/api/v1/risks**", (route) => route.fulfill(json(risks)));
  await page.route("**/api/v1/attack-library**", (route) => route.fulfill(json({ categories: [], templates: [], total_templates: 0 })));
  await page.route("**/api/v1/sessions?limit=50**", (route) => route.fulfill(json([session])));
  await page.route("**/api/v1/sessions/e2e-session-001/timeline**", (route) => route.fulfill(json(timeline)));
  await page.route("**/api/v1/approvals**", (route) => route.fulfill(json([])));
}
