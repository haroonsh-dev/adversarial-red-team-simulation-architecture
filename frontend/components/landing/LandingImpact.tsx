"use client";

import { motion } from "framer-motion";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";

const FRAMEWORKS = ["OWASP LLM Top 10", "MITRE ATLAS", "NIST AI RMF", "EU AI Act exports"] as const;

export function LandingImpact() {
  return (
    <section id="impact" className="lp-section">
      <div className="lp-shell">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="max-w-2xl"
        >
          <p className="lp-eyebrow">Customer stories</p>
          <h2 className="lp-heading mt-6">Trusted by teams operating agent fleets</h2>
          <p className="lp-body mt-4">
            ARTSA customers run containment, red-team testing, and audit exports in the same
            control plane — from the SOC floor to the board pack.
          </p>
        </motion.div>

        <motion.div
          className="mt-10 flex flex-wrap gap-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {FRAMEWORKS.map((name) => (
            <motion.span
              key={name}
              variants={fadeUp}
              transition={{ ease: easeOut }}
              className="rounded-[4px] border border-[var(--color-steel-border)] px-3 py-1.5 text-[12px] text-[var(--color-ash)]"
            >
              {name}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
