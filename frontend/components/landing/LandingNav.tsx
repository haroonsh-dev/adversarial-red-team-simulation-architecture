"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Logo from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { demoHref } from "@/lib/demoRoutes";
import { LandingSignInButton } from "./LandingSignInButton";
import { LandingContactSalesButton } from "./LandingContactSalesButton";

const NAV = [
  { href: "#challenge", label: "Challenge" },
  { href: "#solution", label: "Solution" },
  { href: "#platforms", label: "Product" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "lp-nav sticky top-0 z-50 border-b transition-colors duration-200",
        scrolled ? "border-[var(--color-steel-border)]" : "border-transparent"
      )}
    >
      <div className="lp-shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0" aria-label="ARTSA home">
          <Logo iconSize={20} />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="lp-nav__link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href={demoHref("guard")} className="lp-btn-ghost hover:bg-transparent">
            Live demo
          </Link>
          <LandingSignInButton variant="ghost" size="sm" className="lp-btn-ghost hover:bg-transparent">
            Sign in
          </LandingSignInButton>
          <LandingContactSalesButton variant="ghost" size="sm" className="lp-btn-primary">
            Contact sales
          </LandingContactSalesButton>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center text-[var(--color-snow)] lg:hidden"
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div
          id="lp-mobile-menu"
          className="border-t border-[var(--color-steel-border)] bg-[var(--color-page-ink)] px-5 py-4 lg:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="lp-nav__link py-2"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--color-steel-border)] pt-4">
            <Link
              href={demoHref("guard")}
              className="lp-btn-secondary w-full"
              onClick={() => setOpen(false)}
            >
              Live demo
            </Link>
            <LandingContactSalesButton
              variant="ghost"
              className="lp-btn-primary w-full"
              onClick={() => setOpen(false)}
            >
              Contact sales
            </LandingContactSalesButton>
          </div>
        </div>
      ) : null}
    </header>
  );
}
