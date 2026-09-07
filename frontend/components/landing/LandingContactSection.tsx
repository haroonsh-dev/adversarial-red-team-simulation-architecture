"use client";

import { motion } from "framer-motion";
import { Calendar, Shield, Headphones } from "lucide-react";
import { easeOut } from "@/lib/motionPresets";
import { ContactSalesForm } from "./LandingContactSales";
import { authLoginHref } from "@/lib/authSession";

const PERKS = [
  {
    icon: Calendar,
    title: "Tailored demo",
    body: "Walk through containment on your agent stack — ingest, quarantine, and audit export.",
  },
  {
    icon: Shield,
    title: "Security review",
    body: "Architecture, data residency, and SSO/VPC options with our solutions engineers.",
  },
  {
    icon: Headphones,
    title: "Dedicated onboarding",
    body: "Enterprise plans include implementation support and readiness playbooks.",
  },
] as const;

export function LandingContactSection() {
  return (
    <section
      id="contact"
      className="lp-section scroll-mt-24 border-t border-[var(--color-steel-border)]"
    >
      <div className="lp-shell">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, ease: easeOut }}
          >
            <p className="lp-eyebrow">Contact sales</p>
            <h2 className="lp-heading mt-6">Talk to an ARTSA specialist</h2>
            <p className="lp-body mt-4 max-w-md">
              Whether you are evaluating runtime guardrails or rolling out multi-agent pipelines,
              we will map containment to your stack in one call.
            </p>
            <ul className="mt-10 space-y-6">
              {PERKS.map((p) => {
                const Icon = p.icon;
                return (
                  <li key={p.title} className="flex gap-4">
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-pistachio)]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <div>
                      <p className="text-[14px] font-medium tracking-[-0.17px] text-[var(--color-snow)]">
                        {p.title}
                      </p>
                      <p className="lp-body-sm mt-1">{p.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>

          <motion.div
            className="rounded-2xl border border-white/10 p-6 sm:p-8"
            style={{ backgroundColor: "#131313" }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08, duration: 0.5, ease: easeOut }}
          >
            <ContactSalesForm
              idPrefix="section-contact"
              onLoginHref={authLoginHref({ returnTo: "/command-center" })}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
