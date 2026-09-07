/** End-to-end readiness flow — single source of truth for Get Started + Command Center. */

export type ReadinessPhase = "validate" | "ingest" | "confirm" | "complete";

export interface ReadinessFlowInput {
  apiOnline: boolean;
  wsConnected: boolean;
  suitePass: number;
  suiteTotal: number;
  casesRun: number;
  ingestDone: boolean;
  /** Ingest event visible in live feed or metrics total > 0 after ingest */
  trafficConfirmed: boolean;
}

export interface ReadinessFlowState {
  phase: ReadinessPhase;
  score: number;
  suiteComplete: boolean;
  ingestDone: boolean;
  trafficConfirmed: boolean;
  productionReady: boolean;
  blockers: string[];
  nextAction: { label: string; href: string; phase: ReadinessPhase };
}

export const READINESS_PHASE_META: Record<
  ReadinessPhase,
  { step: number; title: string; description: string }
> = {
  validate: {
    step: 1,
    title: "Run security tests",
    description: "Eight practice attacks and safe requests",
  },
  ingest: {
    step: 2,
    title: "Send test event",
    description: "One real ingest on the production path",
  },
  confirm: {
    step: 3,
    title: "Confirm in log",
    description: "Verify the event in live activity",
  },
  complete: {
    step: 3,
    title: "Ready for production",
    description: "Guard tested, ingest wired, activity confirmed",
  },
};

const STORAGE_KEY = "artsa-readiness-milestones";

export interface ReadinessMilestones {
  suiteCompletedAt?: string;
  ingestCompletedAt?: string;
  confirmedAt?: string;
}

export function loadReadinessMilestones(): ReadinessMilestones {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReadinessMilestones) : {};
  } catch {
    return {};
  }
}

export function saveReadinessMilestone(key: keyof ReadinessMilestones): void {
  if (typeof window === "undefined") return;
  try {
    const prev = loadReadinessMilestones();
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...prev, [key]: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

/** Suite passes when ≥ n−1 cases pass and every case has been run once. */
export function isSuiteComplete(
  suitePass: number,
  suiteTotal: number,
  casesRun: number
): boolean {
  if (suiteTotal === 0) return false;
  return casesRun >= suiteTotal && suitePass >= Math.max(1, suiteTotal - 1);
}

export function readinessScoreFromFlow(input: ReadinessFlowInput): number {
  let n = 0;
  if (input.apiOnline) n += 15;
  if (isSuiteComplete(input.suitePass, input.suiteTotal, input.casesRun)) n += 40;
  else if (input.casesRun > 0) n += Math.min(20, Math.round((input.suitePass / input.suiteTotal) * 20));
  if (input.ingestDone) n += 25;
  if (input.trafficConfirmed) n += 20;
  else if (input.wsConnected) n += 5;
  return Math.min(100, n);
}

export function computeReadinessFlow(input: ReadinessFlowInput): ReadinessFlowState {
  const suiteComplete = isSuiteComplete(input.suitePass, input.suiteTotal, input.casesRun);
  const score = readinessScoreFromFlow(input);
  const blockers: string[] = [];

  if (!input.apiOnline) blockers.push("Connect the ARTSA API before continuing setup");
  if (!suiteComplete) blockers.push("Finish the security test pack");
  if (suiteComplete && !input.ingestDone) blockers.push("Send one test ingest event");
  if (input.ingestDone && !input.trafficConfirmed) blockers.push("Confirm the event in the activity log");

  let phase: ReadinessPhase = "validate";
  if (suiteComplete && input.ingestDone && input.trafficConfirmed) {
    phase = "complete";
  } else if (suiteComplete && input.ingestDone) {
    phase = "confirm";
  } else if (suiteComplete) {
    phase = "ingest";
  }

  const productionReady = phase === "complete" && score >= 80;

  const nextAction =
    phase === "validate"
      ? { label: "Try an attack", href: "/campaigns", phase: "validate" as const }
      : phase === "ingest"
        ? { label: "Send a test", href: "/command-center", phase: "ingest" as const }
        : phase === "confirm"
          ? { label: "Open activity log", href: "/logs", phase: "confirm" as const }
          : { label: "Open Command Center", href: "/command-center", phase: "complete" as const };

  return {
    phase,
    score,
    suiteComplete,
    ingestDone: input.ingestDone,
    trafficConfirmed: input.trafficConfirmed,
    productionReady,
    blockers,
    nextAction,
  };
}

export function computeReadinessFromMilestones(input: {
  apiOnline: boolean;
  wsConnected: boolean;
  hasTraffic: boolean;
}): ReadinessFlowState {
  const milestones = loadReadinessMilestones();
  const suiteComplete = Boolean(milestones.suiteCompletedAt);
  return computeReadinessFlow({
    apiOnline: input.apiOnline,
    wsConnected: input.wsConnected,
    suitePass: suiteComplete ? 8 : 0,
    suiteTotal: 8,
    casesRun: suiteComplete ? 8 : 0,
    ingestDone: Boolean(milestones.ingestCompletedAt) || input.hasTraffic,
    trafficConfirmed: input.hasTraffic || Boolean(milestones.confirmedAt),
  });
}

export function phaseIndex(phase: ReadinessPhase): number {
  if (phase === "complete") return 3;
  return READINESS_PHASE_META[phase].step - 1;
}
