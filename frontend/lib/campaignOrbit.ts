import { riskScoreFromSummary } from "@/lib/assessmentResults";
import type { CampaignListItem } from "@/lib/hooks/useCampaigns";

export type OrbitMode = "live" | "history";

export type OrbitBucket = "running" | "completed" | "failed" | "other";

export type OrbitNode = {
  id: string;
  name: string;
  status: string;
  provider: string;
  model: string;
  /** Display risk 0–100; null when unknown (no invented scores). */
  risk: number | null;
  riskKnown: boolean;
  band: "low" | "med" | "high" | "critical" | "unknown";
  live: boolean;
  failed: boolean;
  done: boolean;
  lab: boolean;
  progress: number;
  rounds: string;
  angle: number;
  radiusPct: number;
  size: number;
  href: string;
};

export function orbitBucket(status: string): OrbitBucket {
  const s = status.toUpperCase();
  if (s === "RUNNING" || s === "PENDING") return "running";
  if (s === "COMPLETED") return "completed";
  if (s === "FAILED" || s === "ERROR" || s === "CANCELLED") return "failed";
  return "other";
}

function riskBand(risk: number | null): OrbitNode["band"] {
  if (risk == null) return "unknown";
  if (risk >= 80) return "critical";
  if (risk >= 60) return "high";
  if (risk >= 40) return "med";
  return "low";
}

/**
 * Live field = every running run + a few recent finished ones.
 * History = broader cohort (still capped so failed Lab noise doesn't fill the disc).
 */
export function selectOrbitCampaigns(
  campaigns: CampaignListItem[],
  mode: OrbitMode
): CampaignListItem[] {
  const running = campaigns.filter((c) => orbitBucket(c.status) === "running");
  const completed = campaigns.filter((c) => orbitBucket(c.status) === "completed");
  const failed = campaigns.filter((c) => orbitBucket(c.status) === "failed");
  const other = campaigns.filter((c) => orbitBucket(c.status) === "other");

  if (mode === "live") {
    // Prefer live; keep a thin history ring so the field isn't empty when idle.
    const recent = [...completed, ...failed].slice(0, running.length > 0 ? 6 : 8);
    return [...running, ...recent].slice(0, 16);
  }

  return [...running, ...completed.slice(0, 8), ...failed.slice(0, 8), ...other.slice(0, 2)].slice(
    0,
    18
  );
}

/**
 * Live nodes: radius tracks round progress (moves as API updates).
 * Finished: real summary risk only — no fake 55/72 placeholders.
 */
export function nodeRadiusAndRisk(
  c: CampaignListItem,
  b: OrbitBucket
): { risk: number | null; radiusPct: number; size: number; progress: number } {
  const scored = riskScoreFromSummary(c.summary ?? null);
  const total = Math.max(1, Number(c.total_rounds || 1));
  const done = Number(c.rounds_completed || 0);
  const progress = Math.min(1, done / total);

  if (b === "running") {
    // Outer ring as rounds complete — this is what “works live”.
    const radiusPct = 30 + progress * 18;
    const size = 12 + progress * 10;
    return { risk: scored, radiusPct, size, progress };
  }

  if (scored != null) {
    const radiusPct = 28 + (Math.min(100, scored) / 100) * 20;
    const size = 10 + progress * 6;
    return { risk: scored, radiusPct, size, progress };
  }

  // Unknown score: park near inner ring (don't invent risk).
  return { risk: null, radiusPct: 30, size: 9, progress };
}

/** Polar encoding: angle = status sector, radius = live progress or scored risk. */
export function buildOrbit(campaigns: CampaignListItem[]): OrbitNode[] {
  const groups: Record<OrbitBucket, CampaignListItem[]> = {
    running: [],
    completed: [],
    failed: [],
    other: [],
  };
  for (const c of campaigns) {
    groups[orbitBucket(c.status)].push(c);
  }

  const sectors: Array<{ key: OrbitBucket; start: number; end: number }> = [
    { key: "running", start: -Math.PI * 0.85, end: -Math.PI * 0.15 },
    { key: "completed", start: Math.PI * 0.15, end: Math.PI * 0.85 },
    { key: "failed", start: Math.PI * 0.95, end: Math.PI * 1.65 },
    { key: "other", start: -Math.PI * 0.1, end: Math.PI * 0.1 },
  ];

  const nodes: OrbitNode[] = [];
  for (const sec of sectors) {
    const list = groups[sec.key];
    list.forEach((c, i) => {
      const b = orbitBucket(c.status);
      const { risk, radiusPct, size, progress } = nodeRadiusAndRisk(c, b);
      const t = list.length === 1 ? 0.5 : i / (list.length - 1);
      const angle = sec.start + (sec.end - sec.start) * t;
      const done = Number(c.rounds_completed || 0);
      nodes.push({
        id: c.id,
        name: c.name,
        status: c.status,
        provider: c.provider,
        model: c.model,
        risk: risk != null ? Math.round(risk) : null,
        riskKnown: risk != null,
        band: riskBand(risk),
        live: b === "running",
        failed: b === "failed",
        done: b === "completed",
        lab: String(c.name || "").startsWith("Lab ·"),
        progress,
        rounds: `${done}/${c.total_rounds}`,
        angle,
        radiusPct,
        size,
        href: `/red-team/monitor/${c.id}${b === "running" ? "?follow=1" : ""}`,
      });
    });
  }
  return nodes;
}

export function orbitStats(nodes: OrbitNode[], nAll: number, mode: OrbitMode) {
  const scored = nodes.map((n) => n.risk).filter((r): r is number => r != null);
  const mean = scored.length
    ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
    : null;
  const byBand = {
    low: nodes.filter((n) => n.band === "low").length,
    med: nodes.filter((n) => n.band === "med").length,
    high: nodes.filter((n) => n.band === "high").length,
    critical: nodes.filter((n) => n.band === "critical").length,
    unknown: nodes.filter((n) => n.band === "unknown").length,
  };
  const live = nodes.filter((n) => n.live).length;
  const failed = nodes.filter((n) => n.failed).length;
  const lab = nodes.filter((n) => n.lab).length;
  const max = scored.length ? Math.max(...scored) : 0;
  const liveProgress =
    live > 0
      ? Math.round(
          (nodes.filter((n) => n.live).reduce((a, n) => a + n.progress, 0) / live) * 100
        )
      : 0;

  let finding: string;
  if (live > 0) {
    finding = `${live} live run${live === 1 ? "" : "s"} — dots move out as rounds complete (API poll). Open Watch live.`;
  } else if (mode === "live") {
    finding =
      "Field idle — no RUNNING campaigns. Start Attack Lab or Quick scan; live dots appear here within ~5s.";
  } else if (failed / Math.max(1, nodes.length) >= 0.5) {
    finding = `History view: failure-heavy cohort (${failed}/${nodes.length}). Switch to Live field when a run starts.`;
  } else {
    finding = `History cohort · scored μ ${mean ?? "—"} · n=${nAll}. Outer = hotter risk.`;
  }

  return { mean, byBand, live, failed, lab, max, liveProgress, finding };
}
