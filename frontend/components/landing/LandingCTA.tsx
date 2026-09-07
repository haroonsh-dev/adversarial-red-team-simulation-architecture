"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { easeOut } from "@/lib/motionPresets";
import { demoHref } from "@/lib/demoRoutes";
import { LandingSignInButton } from "./LandingSignInButton";
import { LandingContactSalesButton } from "./LandingContactSalesButton";

export function LandingCTA() {
  return (
    <section className="lp-section lp-section--sky">
      <div className="lp-shell">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: easeOut }}
          className="max-w-3xl"
        >
          <p className="lp-eyebrow !text-[#285cdd]">Secure your AI agents</p>
          <h2 className="lp-heading mt-5">Contain your AI agents</h2>
          <p className="lp-body mt-5">
            Discover how ARTSA governs and contains agents at runtime without slowing the teams
            shipping them. Same control plane for Guard, Red Team, and Command Center.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={demoHref("guard")} className="lp-btn-primary">
              Try live demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <LandingContactSalesButton variant="ghost" className="lp-btn-secondary">
              Contact sales
            </LandingContactSalesButton>
            <LandingSignInButton
              variant="ghost"
              className="lp-btn-ghost !text-[#070707] hover:!text-[#285cdd]"
              signInOptions={{ returnTo: "/command-center", mode: "register" }}
            >
              Get started
            </LandingSignInButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
