"use client";

import { motion } from "framer-motion";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";

const PAINS = [
  {
    title: "Agents chain faster than security can watch",
    body: "Tool calls, MCP servers, and multi-agent handoffs create paths to data that IAM and audit logs were never built to reconstruct.",
  },
  {
    title: "Configuration is not runtime",
    body: "Static policy tells you what an agent is permitted to do. It does not tell you what it called, what it retrieved, or which other agent it steered — in the last sixty seconds.",
  },
  {
    title: "Siloed logs cannot stop a live chain",
    body: "Most monitoring tools were built for humans clicking in browsers, not autonomous agents executing tool calls in milliseconds. Retroactive review cannot contain an escape in-session.",
  },
  {
    title: "Native platform guards lock you in",
    body: "Per-vendor copilots, judges, and scanners do not share a chain score. Shadow agents and cross-platform activity stay invisible to every tool you already own.",
  },
] as const;

const STATS = [
  { value: "<50ms", label: "target ingest-to-verdict budget — runtime blocking not built" },
  { value: "10×", label: "more blast radius when agents inherit human OAuth" },
  { value: "100%", label: "of screened tool calls mapped to the agent chain" },
] as const;

export function LandingChallenge() {
  return (
    <section id="challenge" className="lp-section lp-section--cloud scroll-mt-24">
      <div className="lp-shell">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="max-w-3xl"
        >
          <p className="lp-eyebrow !text-[#285cdd]">The challenge</p>
          <h2 className="lp-heading mt-5">
            You can&apos;t contain what you can&apos;t see — and you can&apos;t see agents from
            configuration alone.
          </h2>
          <p className="lp-body mt-5">
            AI agents deploy faster than any team can track. They chain tasks across tools, inherit
            privileges built for humans, and act in environments security teams have no live view
            into. ARTSA watches the chain at runtime — not the ticket, not the config file.
          </p>
        </motion.div>

        <motion.ul
          className="mt-12 grid gap-4 sm:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {PAINS.map((item) => (
            <motion.li key={item.title} variants={fadeUp} transition={{ ease: easeOut }} className="lp-card p-6">
              <h3 className="text-[18px] font-medium leading-snug text-[var(--color-obsidian)]">
                {item.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-charcoal)]">{item.body}</p>
            </motion.li>
          ))}
        </motion.ul>

        <motion.div
          className="mt-12 grid gap-4 sm:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {STATS.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              transition={{ ease: easeOut }}
              className="lp-stat-card"
            >
              <p className="lp-stat-card__value">{s.value}</p>
              <p className="lp-stat-card__label !text-[var(--color-charcoal)]">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
