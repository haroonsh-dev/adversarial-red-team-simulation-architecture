"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Building2, Briefcase, Lock, Mail, User } from "lucide-react";
import { AuthShell, authFieldClass, authLabelClass } from "@/components/auth/AuthShell";
import {
  type AuthResponse,
  type AuthStatus,
  postAuth,
  authLoginHref,
} from "@/lib/authSession";
import { unwrapEnvelope } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";

function SignupFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  const returnTo = searchParams.get("returnTo") || "";
  const dest = returnTo.startsWith("/") ? returnTo : "/command-center";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/backend/api/v1/auth/status")
      .then((res) => res.json())
      .then((raw) => {
        if (cancelled) return;
        const status = unwrapEnvelope(raw) as AuthStatus;
        const open = Boolean(status?.registration_open);
        setRegistrationOpen(open);
        if (!open) {
          router.replace(authLoginHref({ returnTo: dest !== "/command-center" ? dest : undefined }));
        }
      })
      .catch(() => {
        if (!cancelled) setRegistrationOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router, dest]);

  const finishWithSession = (session: AuthResponse) => {
    setSession({ access_token: session.access_token, expires_in: session.expires_in }, session.user);
    router.replace(dest);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your first and last name.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your work email.");
      return;
    }
    if (!company.trim()) {
      setError("Enter your company name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    const displayName = `${firstName.trim()} ${lastName.trim()}`;
    try {
      const session = await postAuth("/api/v1/auth/register", {
        email: email.trim(),
        password,
        display_name: displayName,
      });
      finishWithSession(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign up.";
      if (message.toLowerCase().includes("registration is closed")) {
        setError("Registration is closed. Sign in with an existing admin account.");
      } else if (message.toLowerCase().includes("already exists")) {
        setError("That email already has an account. Sign in instead.");
      } else {
        setError(message);
      }
      setLoading(false);
    }
  };

  if (registrationOpen === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  return (
    <AuthShell
      mode="signup"
      title="Sign up"
      subtitle="Create your ARTSA workspace. The first account becomes administrator."
      returnTo={dest !== "/command-center" ? dest : undefined}
    >
      <form onSubmit={(e) => void handleRegister(e)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="signup-first" className={authLabelClass}>
              First name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                id="signup-first"
                className={`${authFieldClass} pl-10`}
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setError(null);
                }}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="signup-last" className={authLabelClass}>
              Last name
            </label>
            <input
              id="signup-last"
              className={authFieldClass}
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setError(null);
              }}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="signup-email" className={authLabelClass}>
            Work email
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              id="signup-email"
              type="email"
              className={`${authFieldClass} pl-10`}
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="signup-company" className={authLabelClass}>
              Company
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                id="signup-company"
                className={`${authFieldClass} pl-10`}
                autoComplete="organization"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setError(null);
                }}
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="signup-title" className={authLabelClass}>
              Job title
            </label>
            <div className="relative">
              <Briefcase className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                id="signup-title"
                className={`${authFieldClass} pl-10`}
                autoComplete="organization-title"
                placeholder="Optional"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="signup-password" className={authLabelClass}>
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              id="signup-password"
              type="password"
              className={`${authFieldClass} pl-10`}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              required
              minLength={8}
            />
          </div>
        </div>

        <div>
          <label htmlFor="signup-confirm" className={authLabelClass}>
            Confirm password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              id="signup-confirm"
              type="password"
              className={`${authFieldClass} pl-10`}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              required
            />
          </div>
        </div>

        {error ? (
          <p
            className="rounded-[8px] border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-button text-[14px] font-semibold tracking-[0.04em] text-button-foreground transition-colors hover:bg-button-hover disabled:opacity-50"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {loading ? "Signing up…" : "Sign up"}
        </button>

        <p className="text-center text-[12px] text-muted-foreground">
          By signing up you agree to use ARTSA for authorized security testing only.
        </p>
      </form>

      <p className="mt-6 text-center text-[14px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={authLoginHref({ returnTo: dest !== "/command-center" ? dest : undefined })}
          className="font-medium text-foreground hover:text-[#67b3ef]"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignupClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <SignupFormInner />
    </Suspense>
  );
}
