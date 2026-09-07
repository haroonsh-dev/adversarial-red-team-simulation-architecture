"use client";

import { motion } from "framer-motion";
import { GitBranch, Scan, ShieldCheck, Timer } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";

const PILLARS = [
  {
    icon: Scan,
    title: "Find every agent",
    body: "Inventory first-party, third-party, and shadow agents — including MCP servers nobody sanctioned — so security sees the fleet IT did not provision.",
  },
  {
    icon: GitBranch,
    title: "Monitor every action",
    body: "Capture tool-call executions, retrievals, and agent-to-agent handoffs at runtime. See what agents actually do, not what they are configured to do.",
  },
  {
    icon: ShieldCheck,
    title: "Score the whole chain",
    body: "Correlate identity, privilege, and behavior across the DAG. A single manipulated agent cannot steer the others into an unsafe outcome unnoticed.",
  },
  {
    icon: Timer,
    title: "Close the red-team loop",
    body: "Run the six-agent chain and show adaptive detection climbing against a static baseline. Runtime KILL / QUARANTINE is the designed next control, not a shipped gate.",
  },
] as const;

export function LandingSolution() {
  return (
    <section id="solution" className="lp-section scroll-mt-24">
      <div className="lp-shell">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
          className="max-w-3xl"
        >
          <p className="lp-eyebrow">The solution</p>
          <h2 className="lp-heading mt-5">
            One control plane. Every agent. Every action. Contained at runtime.
          </h2>
          <p className="lp-body mt-5">
            Configurations drift and connector-by-connector audits cannot keep pace with agents that
            act in seconds. ARTSA sits inline with your multi-agent runtime so security teams see —
            and stop — what agents actually do the moment they do it.
          </p>
        </motion.div>

        <motion.div
          className="mt-12 grid gap-4 sm:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <motion.article
                key={p.title}
                variants={fadeUp}
                transition={{ ease: easeOut }}
                className="lp-card p-6 sm:p-8"
              >
                <Icon className="h-5 w-5 text-[var(--color-pistachio)]" strokeWidth={1.75} aria-hidden />
                <h3 className="lp-heading-sm mt-5">{p.title}</h3>
                <p className="lp-body-sm mt-3">{p.body}</p>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
