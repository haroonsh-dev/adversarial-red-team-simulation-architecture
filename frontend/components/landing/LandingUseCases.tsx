"use client";

import { motion } from "framer-motion";
import { Bot, Building2, Layers, ShieldAlert } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";

const CASES = [
  {
    icon: Bot,
    title: "Customer support agents",
    body: "Block tool abuse and data exfil while keeping benign lookups under 50ms.",
  },
  {
    icon: Layers,
    title: "Multi-agent pipelines",
    body: "Score handoffs across research → executor → writer with topology forensics.",
  },
  {
    icon: Building2,
    title: "Enterprise RAG",
    body: "Contain context injection and privilege escalation before retrieval lands.",
  },
  {
    icon: ShieldAlert,
    title: "Red-team & compliance",
    body: "Campaign grids, OWASP mapping, and readiness exports for auditors.",
  },
] as const;

export function LandingUseCases() {
  return (
    <section id="use-cases" className="lp-section lp-section--cloud scroll-mt-24">
      <div className="lp-shell">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
        >
          <p className="lp-eyebrow !text-[#285cdd]">Use cases</p>
          <h2 className="lp-heading mt-6 max-w-2xl">
            Targeted runtime control for the agents you already ship
          </h2>
        </motion.div>

        <motion.div
          className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {CASES.map((c) => {
            const Icon = c.icon;
            return (
              <motion.article
                key={c.title}
                variants={fadeUp}
                transition={{ ease: easeOut }}
                className="lp-card p-6"
              >
                <Icon
                  className="h-4 w-4 text-[#285cdd]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <h3 className="mt-4 text-[18px] font-medium tracking-tight text-[var(--color-obsidian)]">
                  {c.title}
                </h3>
                <p className="lp-body-sm mt-2">{c.body}</p>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
