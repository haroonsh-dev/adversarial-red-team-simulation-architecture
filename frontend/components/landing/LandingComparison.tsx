"use client";

import { motion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import { easeOut, staggerContainer, fadeUp } from "@/lib/motionPresets";
import { cn } from "@/lib/utils";

type CellValue = "full" | "partial" | "none";

interface ComparisonRow {
  feature: string;
  artsa: CellValue;
  peer: CellValue;
  hiddenlayer: CellValue;
  note?: string;
}

const ROWS: ComparisonRow[] = [
  {
    feature: "Sub-50ms runtime containment",
    artsa: "partial",
    peer: "partial",
    hiddenlayer: "partial",
    note: "LLM proxy, ingest gate, and MCP stdio wrapper live; MCP HTTP/SSE remains unbuilt",
  },
  {
    feature: "Red-team campaign console",
    artsa: "full",
    peer: "full",
    hiddenlayer: "partial",
  },
  {
    feature: "Multi-agent topology & pipeline DAG",
    artsa: "full",
    peer: "partial",
    hiddenlayer: "partial",
  },
  {
    feature: "Findings → versioned playbooks",
    artsa: "full",
    peer: "partial",
    hiddenlayer: "partial",
  },
  {
    feature: "Session autopsy / film replay",
    artsa: "full",
    peer: "none",
    hiddenlayer: "partial",
  },
  {
    feature: "OWASP LLM + MITRE ATLAS mapping",
    artsa: "full",
    peer: "full",
    hiddenlayer: "full",
  },
  {
    feature: "Unified command center",
    artsa: "full",
    peer: "partial",
    hiddenlayer: "partial",
  },
  {
    feature: "Readiness & audit exports",
    artsa: "full",
    peer: "partial",
    hiddenlayer: "full",
  },
];

const VENDORS = ["ARTSA", "Peer Guard", "HiddenLayer"] as const;

function CellIcon({ value }: { value: CellValue }) {
  if (value === "full") {
    return (
      <span className="inline-flex items-center justify-center gap-1 text-[var(--color-pistachio)]">
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden text-[12px] sm:inline">Full</span>
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="inline-flex items-center justify-center gap-1 text-[var(--color-ash)]">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden text-[12px] sm:inline">Partial</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center gap-1 text-[var(--color-fog)]">
      <Minus className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden text-[12px] sm:inline">—</span>
    </span>
  );
}

export function LandingComparison() {
  return (
    <section id="compare" className="lp-section border-t border-[var(--color-steel-border)]">
      <div className="lp-shell">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: easeOut }}
        >
          <p className="lp-eyebrow">Compare</p>
          <h2 className="lp-heading mt-6">ARTSA vs. point solutions</h2>
          <p className="lp-body mt-4">
            Runtime containment, red-team testing, and governance in one lifecycle — not separate
            Guard and testing tools.
          </p>
        </motion.div>

        <motion.div
          className="lp-card mt-10 overflow-hidden"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ ease: easeOut }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--color-steel-border)] bg-[var(--color-deep-coal)]">
                  <th className="px-4 py-3.5 font-medium text-[var(--color-ash)] sm:px-6">
                    Capability
                  </th>
                  {VENDORS.map((v) => (
                    <th
                      key={v}
                      className={cn(
                        "px-3 py-3.5 text-center font-medium sm:px-4",
                        v === "ARTSA"
                          ? "text-[var(--color-pistachio)]"
                          : "text-[var(--color-snow)]"
                      )}
                    >
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                {ROWS.map((row) => (
                  <motion.tr
                    key={row.feature}
                    variants={fadeUp}
                    transition={{ ease: easeOut }}
                    className="border-b border-[var(--color-steel-border)]"
                  >
                    <td className="px-4 py-3.5 sm:px-6">
                      <span className="font-medium text-[var(--color-snow)]">{row.feature}</span>
                      {row.note ? (
                        <p className="mt-0.5 text-[12px] text-[var(--color-fog)]">{row.note}</p>
                      ) : null}
                    </td>
                    <td className="bg-[var(--color-deep-coal)]/60 px-3 py-3.5 text-center sm:px-4">
                      <CellIcon value={row.artsa} />
                    </td>
                    <td className="px-3 py-3.5 text-center sm:px-4">
                      <CellIcon value={row.peer} />
                    </td>
                    <td className="px-3 py-3.5 text-center sm:px-4">
                      <CellIcon value={row.hiddenlayer} />
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        </motion.div>

        <p className="mt-4 text-center text-[12px] text-[var(--color-fog)]">
          Comparison reflects publicly marketed capabilities. Evaluate against your architecture.
        </p>
      </div>
    </section>
  );
}
