"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Crosshair, LayoutDashboard, Rewind } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { LandingMotionCard } from "./LandingMotionCard";
import { LandingSectionHeader } from "./LandingSectionHeader";

const PRODUCTS = [
  {
    href: "/command-center",
    icon: LayoutDashboard,
    title: "Command Center",
    description: "Live telemetry, severity matrix, observatory — one ops surface.",
    accent: "from-primary/20 to-transparent",
    mock: ["Sessions", "Threats", "Observatory"],
  },
  {
    href: "/campaigns",
    icon: Crosshair,
    title: "Red Team Console",
    description: "Campaign scans, coverage grids, judge verdicts, findings promotion.",
    accent: "from-status-warning/15 to-transparent",
    mock: ["Start scan", "Coverage", "Verdict"],
  },
  {
    href: "/replay",
    icon: Rewind,
    title: "Session Autopsy",
    description: "Film timeline, layer scores, forensics — replay every escape attempt.",
    accent: "from-status-success/15 to-transparent",
    mock: ["Timeline", "Layers", "Forensics"],
  },
] as const;

export function LandingProductStrip() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <LandingSectionHeader
          badge="Product surfaces"
          title="Three theaters, one containment platform"
          description="Jump straight into the workspace that matches your workflow — each module shares the same severity language and audit trail."
        />

        <motion.div
          className="grid gap-4 lg:grid-cols-3"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
        >
          {PRODUCTS.map((product, i) => (
            <motion.div key={product.title} variants={fadeUp} transition={{ ease: easeOut }}>
              <Link href={product.href} className="block h-full">
                <LandingMotionCard
                  index={i}
                  className="landing-product-card flex h-full flex-col p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-muted/30 text-primary">
                      <product.icon className="h-5 w-5" aria-hidden />
                    </div>
                    <ArrowUpRight
                      className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                      aria-hidden
                    />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{product.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {product.description}
                  </p>
                  <div
                    className={`landing-product-card__mock mt-5 rounded-lg border border-border/60 bg-gradient-to-br ${product.accent} p-3`}
                  >
                    <div className="flex flex-wrap gap-2">
                      {product.mock.map((chip, j) => (
                        <motion.span
                          key={chip}
                          className="rounded-md border border-border/70 bg-background/50 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                          initial={{ opacity: 0, y: 6 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.15 + j * 0.06, ease: easeOut }}
                        >
                          {chip}
                        </motion.span>
                      ))}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {[72, 48, 64].map((w, j) => (
                        <motion.div
                          key={j}
                          className="h-1.5 rounded-full bg-foreground/10"
                          style={{ width: `${w}%` }}
                          initial={{ scaleX: 0, originX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.2 + j * 0.08, duration: 0.5, ease: easeOut }}
                        />
                      ))}
                    </div>
                  </div>
                </LandingMotionCard>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
