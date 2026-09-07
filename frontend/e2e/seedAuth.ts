import type { Page } from "@playwright/test";

// With ARTSA_REQUIRE_AUTH=true the UI requires a role API key. Seed the
// frontend auth store (sessionStorage "artsa-auth") with the admin key so
// e2e runs as an authenticated admin. Provide it via ARTSA_API_KEY.
export function seedAuthScript(): string {
  const key = process.env.ARTSA_API_KEY || "";
  if (!key) {
    // No key supplied: do not seed — pages will show the login redirect.
    return "";
  }
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
  if (script) {
    await page.addInitScript(script);
    // Mock the identity endpoint so authenticated pages render without a backend.
    await page.route("**/config/me**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ADMIN_IDENTITY),
      })
    );
  }
}
