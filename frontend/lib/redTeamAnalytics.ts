/**
 * Red Team ops analytics — live campaign transcript → charts (no demo series).
 */

import type { TranscriptTurn } from "@/lib/campaignTranscript";
import type { ScanMetrics } from "@/lib/redTeamScanMetrics";

export interface RoundTrendPoint {
  round: number;
  label: string;
  attack: number;
  defense: number;
  bypass: number;
  finding: boolean;
}

export interface VerdictSlice {
  key: string;
  label: string;
  value: number;
  fill: string;
}

const VERDICT_FILL: Record<string, string> = {
  SUCCESS: "hsl(var(--severity-critical))",
  PARTIAL: "hsl(var(--severity-high))",
  BLOCKED: "#4ade80",
  FAIL: "#4ade80",
  ERROR: "#f59e0b",
  SAFE: "#454545",
};

export function buildRoundTrend(turns: TranscriptTurn[]): RoundTrendPoint[] {
  return [...turns]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((t) => ({
      round: t.roundNumber,
      label: `R${t.roundNumber}`,
      attack: Number(t.attackSuccessScore) || 0,
      defense: Number(t.defenseQualityScore) || 0,
      bypass: Number(t.bypassDepth) || 0,
      finding:
        t.verdict.toUpperCase().includes("SUCCESS") ||
        t.verdict.toUpperCase().includes("PARTIAL") ||
        t.attackSuccessScore >= 5,
    }));
}

export function buildVerdictSlices(metrics: ScanMetrics): VerdictSlice[] {
  return Object.entries(metrics.verdicts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      key,
      label: key,
      value,
      fill: VERDICT_FILL[key.toUpperCase()] ?? "#67b3ef",
    }))
    .sort((a, b) => b.value - a.value);
}
