import { describe, it, expect } from "vitest";
import { buildRoundTrend, buildVerdictSlices } from "@/lib/redTeamAnalytics";
import type { TranscriptTurn } from "@/lib/campaignTranscript";

const turn = (partial: Partial<TranscriptTurn>): TranscriptTurn => ({
  roundNumber: 1,
  attackPrompt: "x",
  attackName: "a",
  category: "DPI",
  asiCode: null,
  asiLabel: null,
  templateId: null,
  objective: null,
  mutationsApplied: [],
  targetResponse: "y",
  blocked: false,
  blockedBy: null,
  targetError: false,
  errorDetail: null,
  verdict: "BLOCKED",
  attackSuccessScore: 2,
  defenseQualityScore: 8,
  bypassDepth: 1,
  reasoning: "",
  severity: "LOW",
    timestamp: null,
    durationMs: 0,
    latencyMs: 0,
    informationLeakageScore: 0,
    mitreAtlas: null,
    owaspLlm: null,
    guardrailTrace: [],
  ...partial,
});

describe("redTeamAnalytics", () => {
  it("builds round trend from transcript", () => {
    const trend = buildRoundTrend([
      turn({ roundNumber: 2, attackSuccessScore: 7, defenseQualityScore: 3 }),
      turn({ roundNumber: 1, attackSuccessScore: 2, defenseQualityScore: 9 }),
    ]);
    expect(trend[0]?.round).toBe(1);
    expect(trend[1]?.attack).toBe(7);
  });

  it("builds verdict slices", () => {
    const slices = buildVerdictSlices({
      findingsCount: 1,
      roundsCompleted: 3,
      avgAttackSuccess: "4.0",
      avgDefenseQuality: "6.0",
      avgBypassDepth: "1.0",
      blockedCount: 2,
      successCount: 1,
      errorCount: 0,
      riskBand: "medium",
      verdicts: { BLOCKED: 2, SUCCESS: 1 },
    });
    expect(slices).toHaveLength(2);
    expect(slices[0]?.value).toBeGreaterThanOrEqual(slices[1]?.value ?? 0);
  });
});
