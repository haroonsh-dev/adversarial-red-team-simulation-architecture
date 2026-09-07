"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Shield } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { LandingSectionHeader } from "./LandingSectionHeader";

const OUTCOMES = [
  {
    quote:
      "One severity language from live ingest through red-team verdicts — no more reconciling three dashboards after every incident.",
    role: "Security engineering lead",
  },
  {
    quote:
      "Campaign findings promote straight into versioned playbooks. Auditors get chain-of-custody without us stitching exports by hand.",
    role: "GRC & compliance",
  },
  {
    quote:
      "The adaptive-vs-static detection curve is the argument we can actually show — not a promised in-session KILL we have not built.",
    role: "SOC operations",
  },
] as const;

const RESOURCES = [
  {
    icon: FileText,
    title: "Get started hub",
    description: "Wire ingest, run your first scan, and open the command center.",
    href: "/get-started",
  },
  {
    icon: Shield,
    title: "Agentic risk framework",
    description: "OWASP-aligned taxonomy for agent goal hijack, rogue agents, and tool abuse.",
    href: "/risks",
  },
  {
    icon: FileText,
    title: "RAG + Astra guard guide",
    description: "Integrate retrieval pipelines with containment policies.",
    href: "/guides/rag-astra",
  },
] as const;

export function LandingResources() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingSectionHeader
          badge="Research & resources"
          title="Intelligence for teams shaping agent security"
          description="Prompt Security and HiddenLayer lead with threat reports and guides — ARTSA ships practitioner docs where your team already works."
          align="center"
          className="mx-auto max-w-3xl"
        />

        <motion.div
          className="mt-12 grid gap-4 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {OUTCOMES.map((o) => (
            <motion.blockquote
              key={o.role}
              variants={fadeUp}
              transition={{ ease: easeOut }}
              className="rounded-2xl border border-border/50 bg-muted/10 p-5"
            >
              <p className="text-sm leading-relaxed text-foreground/90">&ldquo;{o.quote}&rdquo;</p>
              <footer className="mt-4 text-xs text-muted-foreground">— {o.role}</footer>
            </motion.blockquote>
          ))}
        </motion.div>

        <motion.div
          className="mt-10 grid gap-3 sm:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {RESOURCES.map((r) => (
            <motion.div key={r.title} variants={fadeUp} transition={{ ease: easeOut }}>
              <Link
                href={r.href}
                className="group flex h-full flex-col rounded-xl border border-border/50 p-5 transition-colors hover:border-border/80 hover:bg-card/30"
              >
                <r.icon className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-3 font-medium">{r.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                <span className="mt-3 flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
                  Read <ArrowRight className="h-3 w-3" aria-hidden />
                </span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
