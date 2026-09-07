import type { CampaignListItem } from "@/lib/hooks/useCampaigns";
import { parseTopFindings } from "@/lib/campaignTranscript";
import { riskScoreFromSummary } from "@/lib/assessmentResults";

export type AttackFamily =
  | "Prompt Injection"
  | "Tool Abuse"
  | "Data Exfiltration"
  | "Goal Manipulation"
  | "Memory Attacks"
  | "Privilege Escalation";

const FAMILY_KEYWORDS: Record<AttackFamily, string[]> = {
  "Prompt Injection": ["injection", "prompt", "jailbreak", "override"],
  "Tool Abuse": ["tool", "shell", "abuse", "unauthorized"],
  "Data Exfiltration": ["exfil", "leak", "pii", "sensitive", "export"],
  "Goal Manipulation": ["goal", "hijack", "drift", "objective"],
  "Memory Attacks": ["memory", "poison", "context"],
  "Privilege Escalation": ["privilege", "escalat", "admin", "rbac"],
};

export function classifyFindingFamily(text: string): AttackFamily {
  const lower = text.toLowerCase();
  for (const [family, keys] of Object.entries(FAMILY_KEYWORDS) as [AttackFamily, string[]][]) {
    if (keys.some((k) => lower.includes(k))) return family;
  }
  return "Prompt Injection";
}

export function deriveRedTeamOverview(campaigns: CampaignListItem[]) {
  const completed = campaigns.filter((c) => String(c.status).toUpperCase() === "COMPLETED");
  const running = campaigns.filter((c) => {
    const s = String(c.status).toUpperCase();
    return s === "RUNNING" || s === "PENDING";
  });

  let attacks = 0;
  let successes = 0;
  let blocked = 0;
  let critical = 0;
  const familyHits: Record<AttackFamily, { tested: number; success: number }> = {
    "Prompt Injection": { tested: 0, success: 0 },
    "Tool Abuse": { tested: 0, success: 0 },
    "Data Exfiltration": { tested: 0, success: 0 },
    "Goal Manipulation": { tested: 0, success: 0 },
    "Memory Attacks": { tested: 0, success: 0 },
    "Privilege Escalation": { tested: 0, success: 0 },
  };

  const recent: Array<{
    id: string;
    title: string;
    outcome: "success" | "blocked" | "late";
    when: string;
    href: string;
  }> = [];

  for (const c of campaigns) {
    attacks += Number(c.rounds_completed || 0);
    const findings = parseTopFindings(c.summary ?? null);
    for (const f of findings) {
      const family = classifyFindingFamily(`${f.attackName} ${f.category}`);
      familyHits[family].tested += 1;
      const sev = String(f.severity || "").toLowerCase();
      const isHit =
        !f.blocked &&
        (f.attackSuccessScore >= 0.5 ||
          sev.includes("critical") ||
          sev.includes("high") ||
          String(f.verdict || "").toUpperCase().includes("SUCCESS") ||
          String(f.verdict || "").toUpperCase().includes("BREACH"));
      if (isHit) {
        successes += 1;
        familyHits[family].success += 1;
        if (sev.includes("critical")) critical += 1;
      } else {
        blocked += 1;
      }
      recent.push({
        id: `${c.id}-${f.roundNumber}`,
        title: f.attackName || family,
        outcome: isHit ? "success" : "blocked",
        when: c.name,
        href: `/red-team/monitor/${c.id}`,
      });
    }

    const risk = riskScoreFromSummary(c.summary ?? null);
    if (risk != null && risk >= 80) critical += 1;
  }

  const evaluated = successes + blocked;
  const detectPct = evaluated > 0 ? Math.round((blocked / evaluated) * 1000) / 10 : null;

  const coverage = (Object.keys(familyHits) as AttackFamily[]).map((family) => {
    const { tested, success } = familyHits[family];
    const pct = tested > 0 ? Math.round(((tested - success) / tested) * 100) : 0;
    return { family, tested, success, pct };
  });

  const untested = coverage.filter((c) => c.tested === 0).map((c) => c.family);

  const coverageChart = coverage.map((c) => ({
    family: shortFamily(c.family),
    full: c.family,
    tested: c.tested,
    breached: c.success,
    blocked: Math.max(0, c.tested - c.success),
    defendPct: c.pct,
  }));

  const outcomeChart = [
    { name: "Blocked", value: blocked, fill: "hsl(var(--severity-low))" },
    { name: "Breached", value: successes, fill: "hsl(var(--severity-critical))" },
  ].filter((d) => d.value > 0);

  const statusMix = [
    { name: "Running", value: running.length, fill: CHART_PRIMARY_SOFT },
    { name: "Completed", value: completed.length, fill: "hsl(var(--severity-low))" },
    {
      name: "Failed",
      value: campaigns.filter((c) => {
        const s = String(c.status).toUpperCase();
        return s === "FAILED" || s === "ERROR" || s === "CANCELLED";
      }).length,
      fill: "hsl(var(--severity-critical))",
    },
  ].filter((d) => d.value > 0);

  const campaignRisk = campaigns
    .map((c) => {
      const status = String(c.status).toUpperCase();
      let risk = riskScoreFromSummary(c.summary ?? null);
      if (risk == null) {
        const completed = Number(c.rounds_completed || 0);
        const total = Math.max(1, Number(c.total_rounds || 1));
        // Progress-only estimate when summary has no score — do not invent a flat floor.
        risk = completed > 0 ? Math.round((completed / total) * 55) : 0;
        if (status === "FAILED" || status === "ERROR") {
          risk = completed > 0 ? Math.max(risk, 15) : 0;
        }
      }
      return {
        id: c.id,
        name: truncateLabel(c.name, 36),
        fullName: c.name || c.id.slice(0, 8),
        risk: Math.min(100, Math.round(risk)),
        rounds: Number(c.rounds_completed || 0),
        total: Number(c.total_rounds || 0),
        status,
        provider: String(c.provider || ""),
        model: String(c.model || ""),
        error: c.error ? String(c.error).slice(0, 120) : null,
      };
    })
    .sort((a, b) => {
      // Analyst order: running first, then highest risk, then failed, then name
      const rank = (s: string) =>
        s === "RUNNING" || s === "PENDING" ? 0 : s === "FAILED" || s === "ERROR" ? 1 : 2;
      const d = rank(a.status) - rank(b.status);
      if (d !== 0) return d;
      if (b.risk !== a.risk) return b.risk - a.risk;
      return a.fullName.localeCompare(b.fullName);
    });

  const posture =
    detectPct == null
      ? ("unknown" as const)
      : detectPct >= 80
        ? ("strong" as const)
        : detectPct >= 50
          ? ("mixed" as const)
          : ("weak" as const);

  return {
    attacks,
    successes,
    blocked,
    critical,
    detectPct,
    runningCount: running.length,
    completedCount: completed.length,
    coverage,
    untested,
    recent: recent.slice(0, 8),
    campaigns,
    coverageChart,
    outcomeChart,
    statusMix,
    campaignRisk,
    posture,
    hasFindingData: evaluated > 0,
  };
}

function shortFamily(family: AttackFamily): string {
  const map: Record<AttackFamily, string> = {
    "Prompt Injection": "Injection",
    "Tool Abuse": "Tools",
    "Data Exfiltration": "Exfil",
    "Goal Manipulation": "Goal",
    "Memory Attacks": "Memory",
    "Privilege Escalation": "PrivEsc",
  };
  return map[family] ?? family;
}

function truncateLabel(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/** Soft blue for running campaigns — matches chart primary without importing chartTheme cycle. */
const CHART_PRIMARY_SOFT = "#67b3ef";
