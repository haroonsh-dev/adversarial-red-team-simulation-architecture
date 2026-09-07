"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";

const FAQ = [
  {
    q: "What is AI agent containment?",
    a: "AI agent containment is runtime enforcement over autonomous agents — their identities, privileges, tool calls, MCP interactions, and cross-agent handoffs. ARTSA's designed action enum is ALLOW, QUARANTINE, or KILL. In-session blocking and the ASI08 circuit breaker are not built yet; the live product is the six-agent red-team loop and the adaptive-vs-static detection curve.",
  },
  {
    q: "How is containment different from observability?",
    a: "Observability tells you the trace, the latency, and the model output. Containment tells you whether the agent stayed inside policy, whether its behavior matched its declared identity, and whether the rest of the chain should be allowed to continue. ARTSA is a security control plane, not an APM.",
  },
  {
    q: "Why isn't audit log review enough?",
    a: "Audit logs arrive too late to stop misuse, are siloed across every AI platform you run, and do not reconstruct what happened inside the tools agents connect into. Those interactions only exist at runtime — which is where ARTSA scores and contains them.",
  },
  {
    q: "Do I need to rewrite my agents?",
    a: "No. Use curl, the Python/TypeScript SDK, or provider configs. Your agents keep their stack — ARTSA observes at the gateway and enforces at ingest.",
  },
  {
    q: "Will runtime screening slow down employees or developers?",
    a: "We target sub-50ms p99 from ingest to verdict. There is no SDK to install in the agent loop for the core path. Coding and support agents keep operating at full speed while security gains a live chain score.",
  },
  {
    q: "Can ARTSA enforce policy, not just monitor?",
    a: "Verdicts are designed as explicit actions — ALLOW, QUARANTINE, or KILL — never an auto-destructive side effect. Campaign findings already promote into versioned playbooks. Real-time tool-call interception is the next control, not a shipped runtime gate.",
  },
  {
    q: "Do I need to sign up to try ARTSA?",
    a: "No. The live demo runs in your browser — guard scans, red-team grid, findings, and replay — with no account. Contact sales for SSO/SAML, VPC deploy, and compliance packs.",
  },
] as const;

export function LandingFAQ() {
  return (
    <section id="faq" className="lp-section scroll-mt-24">
      <div className="lp-shell max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
        >
          <p className="lp-eyebrow">FAQ</p>
          <h2 className="lp-heading mt-6">Frequently asked questions</h2>
        </motion.div>
        <motion.div
          className="mt-10 space-y-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {FAQ.map((item) => (
            <motion.details
              key={item.q}
              variants={fadeUp}
              transition={{ ease: easeOut }}
              className="group rounded-2xl border border-[var(--color-steel-border)] bg-[var(--color-card-carbon)] open:border-white/20"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[16px] font-medium text-[var(--color-snow)] marker:content-none hover:text-[var(--color-pistachio)]">
                {item.q}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-[var(--color-ash)] transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="border-t border-[var(--color-steel-border)] px-5 pb-4 pt-3 text-[15px] leading-relaxed text-[var(--color-ash)]">
                {item.a}
              </p>
            </motion.details>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
