"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Crosshair,
  FileSearch,
  Radar,
  Shield,
} from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { demoHref } from "@/lib/demoRoutes";
import { LandingSectionHeader } from "./LandingSectionHeader";

/** HiddenLayer-style lifecycle: discover → protect → test → govern */
const LIFECYCLE = [
  {
    step: "01",
    icon: Radar,
    title: "Discover & observe",
    body: "Continuous observatory, live telemetry, and agent topology — know what's running and what it can reach.",
    href: demoHref("command"),
    tag: "Observatory",
  },
  {
    step: "02",
    icon: Shield,
    title: "Contain at runtime",
    body: "Ingest scoring and layered verdicts today. Explicit KILL / QUARANTINE is the designed action enum — in-session blocking is not built yet.",
    href: demoHref("guard"),
    tag: "Runtime",
  },
  {
    step: "03",
    icon: Crosshair,
    title: "Attack simulation",
    body: "Red Team Console with scans, coverage grids, LLM judge verdicts, and direct + indirect attack templates.",
    href: demoHref("redteam"),
    tag: "Red team",
  },
  {
    step: "04",
    icon: FileSearch,
    title: "Harden & audit",
    body: "Promote findings to versioned playbooks, chain-of-custody trails, and readiness exports for auditors.",
    href: demoHref("findings"),
    tag: "Governance",
  },
] as const;

export function LandingLifecycle() {
  return (
    <section id="lifecycle" className="border-y border-border/40 px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingSectionHeader
          badge="Full lifecycle"
          title="One platform across the AI security lifecycle"
          description="Discovery, runtime protection, adversarial testing, and audit — the same pillars peer platforms sell separately, unified in ARTSA."
          align="center"
          className="mx-auto max-w-3xl"
        />

        <motion.div
          className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
        >
          {LIFECYCLE.map((item) => (
            <motion.div key={item.title} variants={fadeUp} transition={{ ease: easeOut }}>
              <Link
                href={item.href}
                className="landing-lifecycle-card group flex h-full flex-col rounded-2xl border border-border/50 bg-card/25 p-5 transition-all duration-300 hover:border-border/80 hover:bg-card/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-primary">{item.step}</span>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {item.tag}
                  </span>
                </div>
                <item.icon className="mt-4 h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-3 text-base font-medium">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                <span className="mt-4 text-xs text-muted-foreground group-hover:text-primary">
                  Try in demo →
                </span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
