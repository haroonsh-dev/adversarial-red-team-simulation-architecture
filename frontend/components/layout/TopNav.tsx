"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Command, Building2, ChevronDown, Check, LogOut, Moon, Sun, UserCircle2 } from "lucide-react";
import { LogoIcon } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { AlertsInbox } from "@/components/layout/AlertsInbox";
import MobileNav from "@/components/layout/MobileNav";
import { useAlerts } from "@/lib/hooks/useAlerts";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { formatTopNavConnectionLabel } from "@/lib/connectionStatus";
import { fetchFromBackend } from "@/lib/api";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { useAuthStore } from "@/lib/stores/auth";
import { useTenantStore } from "@/lib/stores/tenant";
import { useTheme } from "@/lib/context/ThemeProvider";
import { useDashboardMetrics } from "@/lib/context/DashboardMetricsProvider";
import { severityBuckets } from "@/lib/redTeamLiveIngest";
import { isOidcEnabled } from "@/lib/oidc";
import { avatarIsEmoji, resolveAvatarSrc } from "@/lib/profile";
import { landingSignInHref } from "@/lib/authSession";
import { cn } from "@/lib/utils";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "info" | "warning" | "success"> = {
  admin: "secondary",
  analyst: "secondary",
  redteam: "secondary",
  readonly: "secondary",
};

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [inboxOpen, setInboxOpen] = useState(false);
  const { alerts, loading, criticalCount } = useAlerts();
  const { liveEvents } = useDashboardMetrics();
  const { apiOnline, wsConnected, apiGatewayStatus } = useConnection();
  const { identity, loading: authLoading } = useAuthRole();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const hasBearer = useAuthStore((s) => Boolean(s.bearerToken));
  const apiKey = useAuthStore((s) => s.apiKey);
  const storedUser = useAuthStore((s) => s.user);
  const { theme, toggleTheme } = useTheme();
  const onDetections = pathname.startsWith("/red-team/monitor");
  const alertBadge = onDetections ? severityBuckets(liveEvents).CRITICAL : criticalCount;

  // Profile menu
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Tenant selector — selection lives in the tenant store so every API call
  // (X-Tenant-ID header) is scoped to the chosen org (WS-3.1).
  const [tenants, setTenants] = useState<{ id: string; name: string; slug: string; plan: string }[]>([]);
  const tenantId = useTenantStore((s) => s.tenantId);
  const setTenantId = useTenantStore((s) => s.setTenant);
  const [tenantOpen, setTenantOpen] = useState(false);
  const tenantRef = useRef<HTMLDivElement>(null);

  // Close any open dropdown when clicking outside it.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    fetchFromBackend<{ tenants?: { id: string; name: string; slug: string; plan: string }[]; current?: string }>(
      "/api/v1/settings/tenants",
      { silent: true }
    ).then((d) => {
      if (d?.tenants) setTenants(d.tenants);
      if (d?.current) setTenantId(d.current);
    });
  }, [setTenantId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tenantRef.current && !tenantRef.current.contains(e.target as Node)) {
        setTenantOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentTenantName = tenants.find((t) => t.id === tenantId)?.name ?? "Default Org";

  const statusLabel = formatTopNavConnectionLabel(apiOnline, wsConnected, apiGatewayStatus);

  // Profile: prefer the locally-stored session profile (survives reload), fall
  // back to whatever /config/me resolved (covers OIDC / fresh-load edge cases).
  const profileUser = storedUser ?? identity.user ?? null;
  const profileEmail = profileUser?.email ?? null;
  const profileDisplayName = profileUser?.display_name ?? null;
  const profileRole = profileUser?.role ?? identity.role ?? null;
  const profileAvatar = profileUser?.avatar ?? null;
  const profileInitials = (profileDisplayName || profileEmail || profileRole || "AR").slice(0, 2).toUpperCase();

  const showProfile = !authLoading && (hasBearer || Boolean(apiKey) || identity.authenticated);
  // Only surface the SSO "Sign in" button when the user is actually signed out —
  // otherwise an API-key or OIDC-authenticated user sees a misleading duplicate login.
  const showOidcLogin = isOidcEnabled() && !hasBearer && !showProfile;

  return (
    <>
      <header className="shell-topbar sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <MobileNav />
          <span className="font-semibold tracking-tight">ARTSA</span>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          {apiOnline ? (
            <LiveIndicator connected={wsConnected} label={statusLabel} className="hidden sm:inline-flex" />
          ) : (
            <Link href="/get-started" className="hidden sm:inline-flex">
              <LiveIndicator connected={false} label={statusLabel} className="cursor-pointer hover:opacity-90" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("artsa:open-command-palette"))}
            className="hidden items-center gap-2 rounded border border-border bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary md:inline-flex"
            aria-label="Open command palette"
          >
            <span>Search</span>
            <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
              <Command className="h-3 w-3" aria-hidden />
              K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {showOidcLogin && (
            <Button asChild variant="outline" size="sm" className="hidden text-xs sm:inline-flex">
              <Link href={landingSignInHref()}>Sign in</Link>
            </Button>
          )}
          {showProfile && (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-1.5 rounded-full border border-border p-0.5 pr-1.5 transition-colors hover:bg-muted/60"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                {avatarIsEmoji(profileAvatar) ? (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm leading-none"
                    aria-hidden
                  >
                    {profileAvatar}
                  </span>
                ) : resolveAvatarSrc(profileAvatar) ? (
                  <span className="h-7 w-7 overflow-hidden rounded-full ring-1 ring-border" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveAvatarSrc(profileAvatar) ?? undefined}
                      alt={profileDisplayName ?? "Avatar"}
                      className="h-full w-full object-cover"
                    />
                  </span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    {profileInitials}
                  </span>
                )}
                <ChevronDown
                  className={cn("h-3 w-3 text-muted-foreground transition-transform", profileOpen && "rotate-180")}
                />
              </button>
              {profileOpen && (
                <div className="dropdown-surface absolute right-0 top-full z-50 mt-2 w-64 py-1">
                  <div className="border-b border-border px-3 py-2.5">
                    {profileDisplayName && (
                      <p className="truncate text-sm font-medium">{profileDisplayName}</p>
                    )}
                    {profileEmail ? (
                      <p className="truncate text-xs text-muted-foreground">{profileEmail}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Signed in</p>
                    )}
                    {profileRole && (
                      <Badge
                        variant={ROLE_VARIANT[profileRole] ?? "secondary"}
                        className="mt-1.5 gap-1 font-mono text-[10px] uppercase"
                      >
                        {profileRole}
                      </Badge>
                    )}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                  >
                    <UserCircle2 className="h-4 w-4" aria-hidden />
                    Profile
                  </Link>
                  <button
                    onClick={() => {
                      clearAuth();
                      router.push("/");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted/60"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to parchment theme" : "Switch to ops dark theme"}
            title={theme === "dark" ? "Parchment (warm light)" : "Ops dark"}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" aria-hidden />
            ) : (
              <Moon className="h-4 w-4" aria-hidden />
            )}
          </button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 font-mono text-xs"
            aria-label={onDetections ? "Filter critical detections" : "View alerts"}
            aria-expanded={onDetections ? undefined : inboxOpen}
            onClick={() => {
              if (onDetections) {
                router.push("/red-team/monitor?severity=CRITICAL#live-activity");
                return;
              }
              setInboxOpen(true);
            }}
          >
            <Bell className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="hidden sm:inline">Alerts</span>
            {alertBadge > 0 && (
              <Badge variant="critical" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                {alertBadge}
              </Badge>
            )}
          </Button>
          <div className="hidden items-center gap-2 border-l border-border pl-3 text-xs text-muted-foreground md:flex" ref={tenantRef}>
            <LogoIcon size={14} className="text-foreground" aria-hidden />
            <div className="relative">
              <button
                onClick={() => setTenantOpen(!tenantOpen)}
                className="flex items-center gap-1 font-mono text-xs hover:text-foreground transition-colors"
                aria-haspopup="menu"
                aria-expanded={tenantOpen}
              >
                {currentTenantName}
                <ChevronDown className={cn("h-3 w-3 transition-transform", tenantOpen && "rotate-180")} />
              </button>
              {tenantOpen && tenants.length > 0 && (
                <div className="dropdown-surface absolute right-0 top-full z-50 mt-2 w-56 py-1">
                  {tenants.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTenantId(t.id);
                        setTenantOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/60",
                        t.id === tenantId && "bg-muted text-foreground"
                      )}
                    >
                      <Building2 className="h-4 w-4 shrink-0" />
                      <div className="text-left min-w-0">
                        <p className="font-medium truncate">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{t.plan}</p>
                      </div>
                      {t.id === tenantId && <Check className="h-4 w-4 ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AlertsInbox
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
        alerts={alerts}
        loading={loading}
      />
    </>
  );
}
