"use client";

import Link from "next/link";
import Logo from "@/components/shared/Logo";
import { demoHref } from "@/lib/demoRoutes";
import { LandingSignInLink } from "./LandingSignInLink";
import { LandingContactSalesButton } from "./LandingContactSalesButton";

const COLS = [
  {
    title: "Product",
    links: [
      { href: demoHref("guard"), label: "ARTSA Guard" },
      { href: demoHref("redteam"), label: "Red Team Console" },
      { href: demoHref("command"), label: "Command Center" },
      { href: demoHref("findings"), label: "Findings" },
      { href: demoHref("replay"), label: "Session Autopsy" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/#use-cases", label: "Support agents" },
      { href: "/#use-cases", label: "Multi-agent" },
      { href: "/guides/rag-astra", label: "RAG pipelines" },
      { href: "/risks", label: "Risk framework" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/get-started", label: "Documentation" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
      { href: "/demo", label: "Live demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#contact", label: "Contact sales" },
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Sign up" },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-steel-border)] bg-[var(--color-page-ink)] py-16">
      <div className="lp-shell">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Logo iconSize={20} />
            <p className="lp-body-sm mt-4 max-w-xs">
              Real-time AI agent containment and escape detection for enterprise security teams.
            </p>
            <LandingContactSalesButton variant="ghost" className="lp-btn-secondary mt-6">
              Contact sales
            </LandingContactSalesButton>
            <div className="mt-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-pistachio)]">
              <span className="text-[28px] leading-none text-[var(--color-obsidian)]" aria-hidden>
                ◈
              </span>
            </div>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <p className="lp-footer-col__title">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="lp-footer-col__link">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-[var(--color-steel-border)] pt-8 text-[12px] text-[var(--color-fog)] sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} ARTSA</p>
          <LandingSignInLink className="text-[var(--color-fog)] hover:text-[var(--color-snow)]">
            Sign in
          </LandingSignInLink>
        </div>
      </div>
    </footer>
  );
}
