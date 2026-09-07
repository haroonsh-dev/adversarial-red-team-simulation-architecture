"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { consumePkceVerifier, exchangeCodeForToken } from "@/lib/oidc";
import { useAuthStore } from "@/lib/stores/auth";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setMessage(`Sign-in failed: ${error}`);
      return;
    }

    if (!code) {
      setMessage("Missing authorization code.");
      return;
    }

    const verifier = consumePkceVerifier();
    if (!verifier) {
      setMessage("Session expired — please try signing in again.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;

    exchangeCodeForToken(code, redirectUri, verifier)
      .then((tokens) => {
        setSession(tokens);
        const returnTo = sessionStorage.getItem("artsa_return_to") || "/command-center";
        sessionStorage.removeItem("artsa_return_to");
        router.replace(returnTo.startsWith("/") ? returnTo : "/command-center");
      })
      .catch((err: Error) => {
        setMessage(err.message || "Token exchange failed");
      });
  }, [searchParams, setSession, router]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
