"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { easeOut } from "@/lib/motionPresets";
import { demoHref, type DemoTab } from "@/lib/demoRoutes";
import { LandingProductScreenshot, type ProductScreenId } from "./LandingProductScreenshots";
import { cn } from "@/lib/utils";

interface Platform {
  index: string;
  name: string;
  tagline: string;
  description: string;
  demoTab: DemoTab;
  screen: ProductScreenId;
  beta?: boolean;
}

const PLATFORMS: Platform[] = [
  {
    index: "01",
    name: "ARTSA Guard",
    tagline: "Contain at runtime",
    description:
      "The inline containment engine for tool-call ingest — layered inspectors score every action in under 50ms and enforce QUARANTINE before damage spreads.",
    demoTab: "guard",
    screen: "command",
  },
  {
    index: "02",
    name: "Red Team Console",
    tagline: "Attack simulation",
    description:
      "Adversarial campaigns with coverage grids, LLM judge verdicts, and bypass mapping — test your agents the way attackers will.",
    demoTab: "redteam",
    screen: "redteam",
  },
  {
    index: "03",
    name: "Command Center",
    tagline: "Observe & respond",
    description:
      "Live telemetry, threat matrix, and containment SLOs — the SOC surface for human+AI teams operating agent fleets at scale.",
    demoTab: "command",
    screen: "command",
  },
  {
    index: "04",
    name: "Findings Registry",
    tagline: "Govern & audit",
    description:
      "Severity-ranked hits with chain-of-custody, OWASP LLM mapping, and one-click promotion into versioned playbooks.",
    demoTab: "findings",
    screen: "findings",
  },
  {
    index: "05",
    name: "Session Autopsy",
    tagline: "Investigate escapes",
    description:
      "Film timeline, layer scores, and forensics replay for every containment event — full context for escalation and postmortems.",
    demoTab: "replay",
    screen: "replay",
    beta: true,
  },
];

function PlatformRow({ platform, i }: { platform: Platform; i: number }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const [hovered, setHovered] = useState(false);

  return (
    <motion.article
      ref={ref}
      className="lp-platform-row group py-10 sm:py-14"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: i * 0.05, duration: 0.5, ease: easeOut }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="lp-mono text-[12px] tracking-[0.85px] text-[var(--color-fog)]">
            {platform.index}
          </p>
          <h3 className="lp-heading-sm mt-3 flex flex-wrap items-baseline gap-2">
            {platform.name}
            {platform.beta ? <span className="lp-beta">BETA</span> : null}
          </h3>
          <p className="mt-2 text-[14px] font-medium text-[var(--color-pistachio)]">
            {platform.tagline}
          </p>
          <p className="lp-body mt-5 max-w-md">{platform.description}</p>
          <Link
            href={demoHref(platform.demoTab)}
            className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium tracking-[-0.17px] text-[var(--color-snow)] transition-colors hover:text-[var(--color-ash)]"
          >
            Open in demo
            <ArrowRight
              className={cn("h-4 w-4 transition-transform", hovered && "translate-x-1")}
              aria-hidden
            />
          </Link>
        </div>

        <div className="lg:col-span-7">
          <div className="lp-product-preview">
            <LandingProductScreenshot
              screen={platform.screen}
              className="min-h-[14rem] rounded-[8px] border-0 sm:min-h-[17rem]"
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function LandingPlatforms() {
  return (
    <section id="platforms" className="lp-section">
      <div className="lp-shell">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
        >
          <p className="lp-eyebrow">Product</p>
          <h2 className="lp-heading mt-6 max-w-3xl">
            Monitor every agent, action, and chain to stop misuse
          </h2>
          <p className="lp-body mt-4 max-w-2xl">
            Guard, Red Team, Command Center, Findings, and Session Autopsy share one runtime —
            so a campaign hit becomes a containment rule without leaving the control plane.
          </p>
        </motion.div>

        <div className="mt-10">
          {PLATFORMS.map((p, i) => (
            <PlatformRow key={p.name} platform={p} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
