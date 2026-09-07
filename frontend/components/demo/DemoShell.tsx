"use client";

import Link from "next/link";
import Logo from "@/components/shared/Logo";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { LandingSignInButton } from "@/components/landing/LandingSignInButton";

export function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="lp lp--obsidian relative min-h-screen">
      <LandingBackdrop />
      <header className="lp-nav relative z-50 border-b border-[var(--color-steel-border)]">
        <div className="lp-shell flex h-16 items-center justify-between gap-3">
          <Link href="/" className="shrink-0">
            <Logo iconSize={20} />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="lp-btn-ghost">
              Home
            </Link>
            <LandingSignInButton
              variant="ghost"
              className="lp-btn-primary"
              signInOptions={{ returnTo: "/command-center" }}
            >
              Contact sales
            </LandingSignInButton>
          </div>
        </div>
      </header>
      <main id="main-content" className="relative z-10 px-5 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
