"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { easeOut } from "@/lib/motionPresets";
import { demoHref } from "@/lib/demoRoutes";
import { LandingContactSalesButton } from "./LandingContactSalesButton";
import { LandingHeroPreview } from "./LandingHeroPreview";

export function LandingHero() {
  return (
    <section className="lp-hero relative pt-10 sm:pt-16">
      <div className="lp-shell">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: easeOut }}
          >
            <p className="lp-eyebrow">Runtime visibility for every agent</p>
            <h1 className="lp-display mt-5">See what AI agents actually do at runtime</h1>
            <p className="lp-body mt-6 max-w-xl">
              ARTSA monitors every agent, every tool call, and every MCP interaction at runtime —
              scoring the whole multi-agent chain, not isolated actions, and enforcing KILL or
              QUARANTINE before unsafe outcomes land.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={demoHref("guard")} className="lp-btn-primary">
                Try live demo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <LandingContactSalesButton variant="ghost" className="lp-btn-secondary">
                Contact sales
              </LandingContactSalesButton>
            </div>
            <p className="lp-body-sm mt-3">No account required · opens Guard in your browser</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease: easeOut }}
            className="lp-product-preview"
          >
            <LandingHeroPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
