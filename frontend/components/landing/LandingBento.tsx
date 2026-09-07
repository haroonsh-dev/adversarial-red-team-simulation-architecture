"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  Crosshair,
  FileSearch,
  Layers,
  Network,
  Rewind,
} from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { demoHref } from "@/lib/demoRoutes";
import { LandingSectionHeader } from "./LandingSectionHeader";

const BENTO = [
  {
    icon: Activity,
    title: "Command Center",
    description:
      "Six-agent health, HMAC/trust story, and the adaptive-vs-static detection-rate-over-time curve. Runtime KILL / QUARANTINE is not a shipped gate.",
    className: "landing-bento__cell--hero md:col-span-2 md:row-span-2",
    href: demoHref("command"),
  },
  {
    icon: Crosshair,
    title: "Red Team Console",
    description: "Adversarial scans, coverage grids, judge verdicts.",
    className: "md:col-span-1",
    href: demoHref("redteam"),
  },
  {
    icon: Layers,
    title: "Layered detection",
    description: "Semantic, policy, and behavioral layers → one severity verdict.",
    className: "md:col-span-1",
    href: demoHref("guard"),
  },
  {
    icon: Network,
    title: "Agent topology",
    description: "Map pipelines and lateral tool calls.",
    className: "md:col-span-1",
    href: demoHref("pipeline"),
  },
  {
    icon: Rewind,
    title: "Session autopsy",
    description:
      "Film timeline, layer scores, and forensics — replay every escape attempt with full context.",
    className: "landing-bento__cell--wide md:col-span-2",
    href: demoHref("replay"),
  },
  {
    icon: FileSearch,
    title: "Findings & playbooks",
    description: "Promote campaign hits into versioned playbooks with exportable readiness reports.",
    className: "md:col-span-1",
    href: demoHref("findings"),
  },
] as const;

export function LandingBento() {
  return (
    <section id="capabilities" className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <LandingSectionHeader
          id="platform"
          badge="Platform"
          title="Everything security teams need in one surface"
          description="Defense, offense, and audit — without switching tools or losing the thread."
          align="center"
          className="mx-auto max-w-2xl"
        />

        <motion.div
          className="landing-bento mt-12 grid gap-3 md:grid-cols-3 md:auto-rows-[minmax(140px,auto)]"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {BENTO.map((cell, i) => (
            <motion.div key={cell.title} variants={fadeUp} transition={{ ease: easeOut }}>
              <Link
                href={cell.href}
                className={`landing-bento__cell group block h-full ${cell.className}`}
              >
                <div className="flex h-full flex-col p-5 sm:p-6">
                  <cell.icon
                    className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110"
                    aria-hidden
                  />
                  <h3 className="mt-4 text-base font-medium tracking-tight sm:text-lg">
                    {cell.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {cell.description}
                  </p>
                  <span className="landing-bento__arrow mt-auto pt-4 text-xs text-muted-foreground transition-colors group-hover:text-primary">
                    Try in demo →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
