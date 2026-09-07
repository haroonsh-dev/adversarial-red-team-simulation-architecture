"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Crosshair,
  FileSearch,
  Layers,
  Network,
  ShieldCheck,
} from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { LandingMotionCard } from "./LandingMotionCard";
import { LandingSectionHeader } from "./LandingSectionHeader";

const FEATURES = [
  {
    icon: Activity,
    title: "Adaptive detection curve",
    description:
      "Compare continuously updating defense against a static baseline. In-session KILL / QUARANTINE is the designed next control, not a shipped gate.",
    tag: "Research",
  },
  {
    icon: Crosshair,
    title: "Red Team Console",
    description:
      "Run adversarial campaigns against your agents with scan metrics, coverage grids, and judge verdicts.",
    tag: "Adversarial",
  },
  {
    icon: Layers,
    title: "Layered detection",
    description:
      "Semantic, policy, and behavioral layers combine into a single severity verdict with full replay forensics.",
    tag: "Multi-layer",
  },
  {
    icon: Network,
    title: "Agent topology",
    description:
      "Map multi-agent pipelines, spot lateral tool calls, and visualize escape paths across your stack.",
    tag: "Topology",
  },
  {
    icon: FileSearch,
    title: "Findings & playbooks",
    description:
      "Promote campaign findings into versioned playbooks with chain-of-custody and exportable readiness reports.",
    tag: "Governance",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise controls",
    description:
      "Tenant isolation, API-key auth, org policy YAML, and audit trails aligned to OWASP LLM and MITRE ATLAS.",
    tag: "Enterprise",
  },
] as const;

export function LandingFeatures() {
  return (
    <section id="capabilities" className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <LandingSectionHeader
          id="platform"
          badge="Platform"
          title="One surface for defense, offense, and audit"
          description="From continuous observatory monitoring to scheduled red-team wargames — security teams get a single command center instead of scattered dashboards."
        />

        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
        >
          {FEATURES.map((feature, i) => (
            <motion.div key={feature.title} variants={fadeUp} transition={{ ease: easeOut }}>
              <LandingMotionCard index={i} className="landing-feature-card h-full p-5">
                <div className="flex items-start justify-between gap-2">
                  <motion.div
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary"
                    whileHover={{ scale: 1.08, rotate: 3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  >
                    <feature.icon className="h-4 w-4" aria-hidden />
                  </motion.div>
                  <span className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {feature.tag}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
                <motion.div
                  className="landing-feature-card__line mt-4 h-px w-full bg-border/60"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.12 + i * 0.04, duration: 0.55, ease: easeOut }}
                  style={{ transformOrigin: "left" }}
                />
              </LandingMotionCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
