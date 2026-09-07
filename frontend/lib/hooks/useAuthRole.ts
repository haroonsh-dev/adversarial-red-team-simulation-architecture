"use client";

import { useEffect, useRef, useState } from "react";
import { fetchFromBackend } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { isOidcEnabled } from "@/lib/oidc";

/** Mirror of backend src/core/rbac.role_capabilities — grants the sidebar's
 * capability-gated items when we can't reach /config/me. */
function capabilitiesForRole(role: string): AuthCapabilities {
  if (role === "admin") {
    return {
      can_ingest: true,
      can_run_campaigns: true,
      can_run_benchmark: true,
      can_run_ablation: true,
      can_manage_policies: true,
      can_manage_providers: true,
      can_manage_integrations: true,
      can_manage_targets: true,
      read_only: false,
    };
  }
  return {
    can_ingest: true,
    can_run_campaigns: role === "redteam" || role === "analyst",
    can_run_benchmark: role === "redteam",
    can_run_ablation: role === "redteam",
    can_manage_policies: false,
    can_manage_providers: false,
    can_manage_integrations: false,
    // Registering and probing a target is a red-team operation.
    can_manage_targets: role === "redteam",
    read_only: role === "readonly",
  };
}

export interface AuthCapabilities {
  can_ingest: boolean;
  can_run_campaigns: boolean;
  can_run_benchmark: boolean;
  can_run_ablation: boolean;
  can_manage_policies: boolean;
  can_manage_providers: boolean;
  can_manage_integrations: boolean;
  can_manage_targets: boolean;
  read_only: boolean;
}

export interface AuthIdentity {
  authenticated: boolean;
  role: string;
  capabilities: AuthCapabilities;
  auth_required: boolean;
  auth_method?: string;
  oidc_enabled?: boolean;
  /** True when a client session exists but the backend rejected credentials. */
  session_invalid?: boolean;
  /** Local-account profile (email / role / display_name / avatar) from password auth. */
  user?: {
    email?: string | null;
    role?: string | null;
    display_name?: string | null;
    avatar?: string | null;
  } | null;
}

const NO_CAPABILITIES: AuthCapabilities = {
  can_ingest: false,
  can_run_campaigns: false,
  can_run_benchmark: false,
  can_run_ablation: false,
  can_manage_policies: false,
  can_manage_providers: false,
  can_manage_integrations: false,
  can_manage_targets: false,
  read_only: false,
};

// Least-privilege default: never flash admin UI before /config/me resolves.
// The real identity (role + capabilities) replaces this once loaded.
const DEFAULT_IDENTITY: AuthIdentity = {
  authenticated: false,
  role: "unauthenticated",
  capabilities: NO_CAPABILITIES,
  auth_required: false,
  oidc_enabled: false,
};

export function useAuthRole() {
  const [identity, setIdentity] = useState<AuthIdentity>(DEFAULT_IDENTITY);
  const [loading, setLoading] = useState(true);
  const bearerToken = useAuthStore((s) => s.bearerToken);
  const apiKey = useAuthStore((s) => s.apiKey);
  const storedUser = useAuthStore((s) => s.user);

  // Best-effort identity from the locally-stored session (role lives on the
  // session) so the sidebar/nav renders admin sections even when /config/me
  // has no backend to answer (offline preview, demo login).
  const sessionRole = storedUser?.role || (apiKey ? "admin" : "") || "";
  const hasLocalSession = Boolean(bearerToken || apiKey || storedUser?.role);
  const fallbackIdentity: AuthIdentity | null = hasLocalSession
    ? {
        authenticated: true,
        role: sessionRole || "admin",
        capabilities: capabilitiesForRole(sessionRole || "admin"),
        auth_required: false,
        oidc_enabled: isOidcEnabled(),
        user: storedUser ?? null,
      }
    : null;

  // Keep refresh stable across renders so the effect below doesn't re-run on
  // every render (and eslint stays happy without listing it as a dep).
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () =>
    fetchFromBackend<AuthIdentity>("/api/v1/config/me", { silent: true })
      .then((res) => {
        if (!res) {
          if (fallbackIdentity) setIdentity(fallbackIdentity);
          return;
        }

        const backendRole =
          typeof res.role === "string" && res.role.length > 0 ? res.role : null;
        const localRole = storedUser?.role || fallbackIdentity?.role || null;

        // Expired JWT still in sessionStorage: /config/me is public and returns
        // role=null while protected routes 401. Drop the bearer once and re-resolve
        // so the BFF can authenticate with ARTSA_API_KEY.
        if (
          bearerToken &&
          !apiKey &&
          res.authenticated === false &&
          !backendRole &&
          localRole
        ) {
          useAuthStore.getState().clearBearerKeepUser();
          return fetchFromBackend<AuthIdentity>("/api/v1/config/me", { silent: true }).then(
            (retry) => {
              if (!retry) {
                setIdentity({
                  ...res,
                  authenticated: false,
                  role: localRole,
                  capabilities: capabilitiesForRole(localRole),
                  session_invalid: true,
                  user: res.user ?? storedUser ?? null,
                });
                return;
              }
              const retryRole =
                typeof retry.role === "string" && retry.role.length > 0
                  ? retry.role
                  : localRole;
              setIdentity({
                ...retry,
                role: retryRole,
                capabilities:
                  retry.capabilities && typeof retry.capabilities.can_ingest === "boolean"
                    ? retry.capabilities
                    : capabilitiesForRole(retryRole),
                authenticated: retry.authenticated ?? Boolean(retryRole),
                session_invalid: false,
                user: retry.user ?? storedUser ?? null,
              });
            }
          );
        }

        const sessionInvalid =
          Boolean(bearerToken || apiKey) &&
          res.authenticated === false &&
          !backendRole &&
          Boolean(localRole);

        if (sessionInvalid && localRole) {
          setIdentity({
            ...res,
            authenticated: false,
            role: localRole,
            capabilities: capabilitiesForRole(localRole),
            session_invalid: true,
            user: res.user ?? storedUser ?? null,
          });
          return;
        }

        const effectiveRole = backendRole || localRole || "unauthenticated";
        const capabilities =
          res.capabilities && typeof res.capabilities.can_ingest === "boolean"
            ? res.capabilities
            : capabilitiesForRole(effectiveRole);

        setIdentity({
          ...res,
          role: effectiveRole,
          capabilities,
          authenticated: res.authenticated ?? Boolean(backendRole),
          session_invalid: false,
          user: res.user ?? storedUser ?? null,
        });
      })
      // /config/me failed (backend offline / demo token) — fall back to the
      // local session identity instead of leaving the nav least-privileged.
      .catch(() => {
        if (fallbackIdentity) setIdentity(fallbackIdentity);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    refreshRef.current();
  }, [bearerToken, apiKey, storedUser?.role, hasLocalSession]);

  const refresh = () => refreshRef.current();

  return { identity, loading, capabilities: identity.capabilities, refresh };
}
