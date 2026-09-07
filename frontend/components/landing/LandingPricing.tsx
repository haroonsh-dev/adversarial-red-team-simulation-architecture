"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { demoHref } from "@/lib/demoRoutes";
import { LandingSignInButton } from "./LandingSignInButton";
import { LandingContactSalesButton } from "./LandingContactSalesButton";

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    note: "For development",
    features: ["10k events/mo", "Command center", "Smoke-test scans", "Community support"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Team",
    price: "$499",
    note: "per month",
    features: ["Unlimited ingest", "Full red-team console", "Findings & playbooks", "Session autopsy"],
    cta: "Start trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    note: "annual",
    features: ["SSO / SAML", "Sub-50ms SLO", "VPC deploy", "Compliance export packs"],
    cta: "Contact sales",
    highlight: false,
    contact: true,
  },
] as const;

export function LandingPricing() {
  return (
    <section id="pricing" className="lp-section border-t border-[var(--color-steel-border)]">
      <div className="lp-shell">
        <motion.div
          className="max-w-2xl"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
        >
          <p className="lp-eyebrow">Pricing</p>
          <h2 className="lp-heading mt-6">Start free. Scale when you ship agents.</h2>
          <p className="lp-body mt-4">
            Try the live demo with no account — upgrade when you need production ingest and SSO.
          </p>
        </motion.div>

        <motion.div
          className="mt-10 grid gap-4 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {PLANS.map((plan) => (
            <motion.div
              key={plan.name}
              variants={fadeUp}
              transition={{ ease: easeOut }}
              className={`lp-card flex flex-col p-6 ${
                plan.highlight ? "border-[var(--color-pistachio)]" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[16px] font-medium tracking-[-0.19px] text-[var(--color-snow)]">
                  {plan.name}
                </h3>
                {plan.highlight ? <span className="lp-beta">Popular</span> : null}
              </div>
              <p className="mt-4">
                <span className="text-[40px] font-semibold leading-[1.2] tracking-[-0.84px] text-[var(--color-snow)]">
                  {plan.price}
                </span>
                <span className="ml-2 text-[14px] text-[var(--color-ash)]">{plan.note}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[14px] text-[var(--color-ash)]">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pistachio)]"
                      aria-hidden
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {"contact" in plan && plan.contact ? (
                  <LandingContactSalesButton variant="ghost" className="lp-btn-secondary w-full">
                    Contact sales
                  </LandingContactSalesButton>
                ) : plan.name === "Starter" ? (
                  <Link href={demoHref("guard")} className="lp-btn-secondary w-full">
                    Try live demo
                  </Link>
                ) : (
                  <LandingSignInButton
                    variant="ghost"
                    className="lp-btn-primary w-full"
                    signInOptions={{ returnTo: "/command-center", mode: "register" }}
                  >
                    {plan.cta}
                  </LandingSignInButton>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
