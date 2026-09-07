"use client";

import Link from "next/link";
import { landingSignInHref } from "@/lib/authSession";
import { Loader2, ShieldX, KeyRound } from "lucide-react";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";

/**
 * Restricts /admin/* and /settings/* to the admin role. Non-admin users see a
 * clear access panel; stale sessions prompt re-sign-in instead of a blank role.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { identity, loading } = useAuthRole();
  const storedUser = useAuthStore((s) => s.user);
  const displayRole = identity.role || storedUser?.role || "unknown";
  const displayEmail = identity.user?.email || storedUser?.email;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (identity.session_invalid) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground ring-1 ring-border">
          <KeyRound className="h-7 w-7" aria-hidden />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold">Session expired</h2>
          <p className="text-sm text-muted-foreground">
            {displayEmail ? (
              <>
                Signed in locally as <span className="font-mono text-foreground">{displayEmail}</span>
                {displayRole ? (
                  <>
                    {" "}
                    (<span className="font-mono">{displayRole}</span>)
                  </>
                ) : null}
                , but the API no longer accepts this session token.
              </>
            ) : (
              <>Your browser still has a login cookie, but the API rejected the session token.</>
            )}{" "}
            Sign in again to restore admin access and live data.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href={landingSignInHref({ returnTo: "/settings/integrations" })}>Sign in again</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/command-center">Command Center</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (identity.role !== "admin") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
          <ShieldX className="h-7 w-7" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Admin access required</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            You are signed in as{" "}
            <span className="font-mono text-foreground">{displayRole}</span>. The admin console
            is restricted to the admin role.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/command-center">Back to Command Center</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
