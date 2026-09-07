"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Lock, LogIn, Mail, UserPlus, X } from "lucide-react";
import { LogoIcon } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { easeOut } from "@/lib/motionPresets";
import {
  type AuthResponse,
  type AuthStatus,
  postAuth,
  RETURN_TO_KEY,
} from "@/lib/authSession";
import { unwrapEnvelope } from "@/lib/api";
import { isOidcEnabled, startOidcLogin } from "@/lib/oidc";
import { useAuthStore } from "@/lib/stores/auth";

interface LandingSignInPanelProps {
  open: boolean;
  onClose: () => void;
  initialMode?: "login" | "register";
  returnTo?: string;
  onContactSales?: () => void;
}

export function LandingSignInPanel({
  open,
  onClose,
  initialMode = "login",
  returnTo = "",
  onContactSales,
}: LandingSignInPanelProps) {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const dest = returnTo.startsWith("/") ? returnTo : "/command-center";

  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/backend/api/v1/auth/status")
      .then((res) => res.json())
      .then((raw) => {
        if (cancelled) return;
        const status = unwrapEnvelope(raw) as AuthStatus;
        const regOpen = Boolean(status?.registration_open);
        setRegistrationOpen(regOpen);
        if (regOpen && initialMode === "register") setMode("register");
        else if (!regOpen) setMode("login");
      })
      .catch(() => {
        if (!cancelled) setRegistrationOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialMode]);

  const finishWithSession = (session: AuthResponse) => {
    setSession({ access_token: session.access_token, expires_in: session.expires_in }, session.user);
    router.replace(dest);
  };

  const handlePasswordLogin = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await postAuth("/api/v1/auth/login", { email: email.trim(), password });
      finishWithSession(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid email or password.";
      setError(
        message === "Invalid email or password" ? "Incorrect email or password." : message
      );
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await postAuth("/api/v1/auth/register", {
        email: email.trim(),
        password,
        display_name: displayName.trim(),
      });
      finishWithSession(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      if (message.toLowerCase().includes("registration is closed")) {
        setRegistrationOpen(false);
        setMode("login");
        setError("An admin account already exists. Sign in with that email and password.");
      } else if (message.toLowerCase().includes("already exists")) {
        setMode("login");
        setError("That email already has an account. Sign in instead.");
      } else {
        setError(message);
      }
      setLoading(false);
    }
  };

  const handleSsoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      sessionStorage.setItem(RETURN_TO_KEY, dest);
      const redirectUri = `${window.location.origin}/auth/callback`;
      await startOidcLogin(redirectUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start SSO login");
      setLoading(false);
    }
  };

  const isRegister = mode === "register" && registrationOpen !== false;

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="landing-signin-overlay fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: easeOut }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/85 backdrop-blur-md"
            aria-label="Close sign in"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-signin-title"
            className="landing-signin-panel relative z-10 w-full max-w-md"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.35, ease: easeOut }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 h-8 w-8"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>

            <div className="flex flex-col items-center px-6 pb-6 pt-8 sm:px-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#313131] bg-[#141414]">
                <LogoIcon size={28} aria-hidden />
              </div>
              <h2
                id="landing-signin-title"
                className="text-xl font-semibold tracking-[-0.5px] text-white"
              >
                {isRegister ? "Create the admin account" : "Sign in to ARTSA"}
              </h2>
              <p className="mt-2 text-center text-sm text-[#a7a7a7]">
                {isRegister
                  ? "The first account becomes administrator and unlocks admin features."
                  : "Sign in with your admin email and password."}
              </p>

              <div className="mt-6 w-full space-y-3">
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="email"
                    placeholder="admin@artsa.ai"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (isRegister) handleRegister();
                      else handlePasswordLogin();
                    }}
                    className="pl-9"
                    aria-label="Email"
                  />
                </div>
                {isRegister && (
                  <Input
                    type="text"
                    placeholder="Display name (optional)"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    aria-label="Display name"
                  />
                )}
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (isRegister) handleRegister();
                      else handlePasswordLogin();
                    }}
                    className="pl-9"
                    aria-label="Password"
                  />
                </div>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={isRegister ? handleRegister : handlePasswordLogin}
                  disabled={loading}
                  className="lp-btn-primary w-full gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : isRegister ? (
                    <UserPlus className="h-4 w-4" aria-hidden />
                  ) : (
                    <LogIn className="h-4 w-4" aria-hidden />
                  )}
                  {isRegister ? "Create admin account" : "Sign in"}
                </Button>
                {registrationOpen !== false ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode(isRegister ? "login" : "register");
                      setError(null);
                    }}
                    className="w-full text-center text-sm text-foreground hover:underline"
                  >
                    {isRegister
                      ? "Already have an account? Sign in"
                      : "First time? Create the admin account"}
                  </button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Registration is closed. Sign in as the existing admin.
                  </p>
                )}
              </div>

              {isOidcEnabled() && (
                <div className="mt-5 w-full">
                  <p className="mb-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
                    or continue with
                  </p>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full gap-2"
                    onClick={handleSsoLogin}
                    disabled={loading}
                  >
                    <LogIn className="h-4 w-4" aria-hidden />
                    Organization SSO
                  </Button>
                </div>
              )}

              <div className="mt-5 w-full">
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  Sign in requires a running ARTSA API. Public product tour:{" "}
                  <Link href="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">
                    /demo
                  </Link>
                </p>
              </div>

              {error ? <p className="mt-4 text-sm text-severity-critical">{error}</p> : null}

              {onContactSales ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Need a demo instead?{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      onClose();
                      onContactSales();
                    }}
                  >
                    Contact sales
                  </button>
                </p>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
