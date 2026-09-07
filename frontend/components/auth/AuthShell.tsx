"use client";

import Link from "next/link";
import Logo from "@/components/shared/Logo";
import { authLoginHref, authSignupHref } from "@/lib/authSession";
import { cn } from "@/lib/utils";

const POINTS = [
  { title: "Contain at runtime", body: "Score every tool call under 50ms before it executes." },
  { title: "Prove control", body: "Findings, custody trails, and readiness exports for auditors." },
  { title: "Test like attackers", body: "Red-team campaigns with coverage grids and judge verdicts." },
] as const;

export function AuthShell({
  children,
  mode,
  title,
  subtitle,
  returnTo,
}: {
  children: React.ReactNode;
  mode: "signin" | "signup";
  title: string;
  subtitle: string;
  returnTo?: string;
}) {
  const signInHref = authLoginHref({ returnTo });
  const signUpHref = authSignupHref({ returnTo });

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Subtle grid on whole page */}
      <div
        className="pointer-events-none absolute inset-0 opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 30% 40%, black, transparent)",
        }}
        aria-hidden
      />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Brand column */}
        <aside className="relative hidden flex-col border-r border-border bg-background/90 p-10 lg:flex xl:p-14">
          <Link href="/" className="inline-flex w-fit" aria-label="ARTSA home">
            <Logo iconSize={22} />
          </Link>

          <div className="my-auto max-w-lg py-16">
            <p className="font-mono text-[12px] uppercase tracking-[0.85px] text-[#67b3ef]">
              Agent security platform
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.12] tracking-[-1.2px] text-foreground">
              Secure every agent action before it lands.
            </h1>
            <div className="mt-12 space-y-6">
              {POINTS.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#67b3ef]" aria-hidden />
                  <div>
                    <p className="text-[15px] font-medium tracking-[-0.19px] text-foreground">{p.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini product chrome */}
            <div
              className="mt-14 overflow-hidden rounded-[8px] border border-border"
              style={{ backgroundColor: "hsl(var(--card))" }}
            >
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                <span className="ml-2 font-mono text-[11px] tracking-[0.85px] text-muted-foreground">
                  runtime guard · live
                </span>
              </div>
              <div className="space-y-2 p-4 font-mono text-[11px]">
                <p className="text-muted-foreground">tool_call · query_database</p>
                <p className="text-[#67b3ef]">QUARANTINE · 4.2ms · risk 94</p>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} ARTSA
          </p>
        </aside>

        {/* Form column */}
        <main className="flex flex-col bg-muted px-5 py-8 sm:px-8 lg:bg-background lg:px-12 xl:px-16">
          <div className="mb-8 flex items-center justify-between lg:mb-0 lg:justify-end">
            <Link href="/" className="lg:hidden" aria-label="ARTSA home">
              <Logo iconSize={20} />
            </Link>
            <div className="flex items-center gap-1 rounded-[8px] border border-border bg-card p-1">
              <Link
                href={signInHref}
                className={cn(
                  "rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.17px] transition-colors",
                  mode === "signin"
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign in
              </Link>
              <Link
                href={signUpHref}
                className={cn(
                  "rounded-[6px] px-3.5 py-1.5 text-[13px] font-medium tracking-[-0.17px] transition-colors",
                  mode === "signup"
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign up
              </Link>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-6 lg:py-10">
            <div
              className="rounded-[8px] border border-border p-6 sm:p-8"
              style={{ backgroundColor: "hsl(var(--card))" }}
            >
              <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.6px] text-foreground sm:text-[32px]">
                {title}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed tracking-[-0.17px] text-muted-foreground">
                {subtitle}
              </p>
              <div className="mt-7">{children}</div>
            </div>

            <p className="mt-6 text-center text-[13px] text-muted-foreground">
              <Link href="/" className="hover:text-muted-foreground">
                ← Back to home
              </Link>
              <span className="mx-2 text-muted-foreground">·</span>
              <Link href="/#contact" className="hover:text-muted-foreground">
                Contact sales
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export const authFieldClass =
  "w-full rounded-[8px] border border-border bg-background px-3 py-2.5 text-[14px] tracking-[-0.17px] text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary";

export const authLabelClass =
  "mb-1.5 block text-[13px] font-medium tracking-[-0.17px] text-muted-foreground";
