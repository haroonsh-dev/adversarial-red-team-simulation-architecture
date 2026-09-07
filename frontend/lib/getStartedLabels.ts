import type { CaseCategory } from "@/lib/getStarted";

/** Plain-English UI strings for the readiness page — readable by non-engineers. */

export const READINESS_UI = {
  pageTitle: "Ready for production?",
  pageDescription:
    "Three steps: test the guard, send one real event, confirm in the activity log.",
  practiceAttackNote:
    "The scary example text below is a practice attack (like a fire drill). It is not real traffic and nobody should run it on live systems — we use it only to test the guard.",
  gateTitle: "Go-live checklist",
  gateSubtitle: "Test the guard → send one real event → confirm in the activity log",
  signedOff: "Ready to go live",
  notSignedOff: "Still completing checklist",
  testsPassing: "Tests passing",
  exportReport: "Download JSON",
  exportReportMarkdown: "Export Markdown",
  exportReportPdf: "Export PDF",
  step1Title: "Run security tests",
  step1Hint: "Practice attacks and safe requests — see if the guard reacts correctly.",
  step2Title: "Send agent activity to ARTSA",
  step2Hint: "One real event through the same path production will use.",
  step3Title: "Confirm in activity log",
  step3Hint: "Open the log and verify the event was recorded.",
  runAllTests: "Run all security tests",
  runOneTest: "Run this test",
  runningTests: "Running security checks…",
  emptyTitle: "Run the security test pack",
  emptyDescription:
    "Eight practice scenarios check trick attacks, data theft attempts, and normal requests. You will see how dangerous each looked and what ARTSA recommends doing.",
  testPayloadLabel: "Practice example (not real traffic)",
  guardDecision: "Guard decision",
  whatWeDid: "What ARTSA did",
  dangerLevel: "How dangerous it looked",
  confidence: "How sure ARTSA is",
  alertsTriggered: "Warning signs found",
  responseTime: "Response time",
  whatHappened: "What happened",
  engineerDetails: "Technical details (for engineers)",
  falsePositive: "Safe request flagged wrongly — too strict",
  detectionGap: "Attack wasn't caught — needs tuning",
  pass: "Passed",
  review: "Needs review",
  suiteResults: "Test pack results",
  sendTestEvent: "Send test event",
  viewInLog: "View in activity log",
  activityLogTitle: "Activity log",
  activityLogDescription:
    "Every agent tool call ARTSA screens — what happened, how dangerous it looked, and what we did.",
  sessionFocus: "Focused on this session",
  viewReplay: "Open session replay",
  showAllSessions: "Show all sessions",
  noEventsForSession: "No events yet for this session. Send agent activity or run a test from Get Started.",
  manualWiring: "For engineers: wire agents with API",
  apiKeyHelp: "Set up your access key",
  backendOffline: "ARTSA isn't reachable right now. Check that your deployment is running.",
  attacksCaught: "Attacks caught",
  safeAllowed: "Safe allowed",
  needsTuning: "Needs tuning",
  liveActivity: "Live activity",
  liveActivityHint: "Events as they arrive — your test event should appear here.",
  fixInSandbox: "Try in sandbox",
  tunePolicies: "Tune rules",
  autoRunning: "Running security tests automatically…",
} as const;

/** Command Center — integration visibility */
export const COMMAND_CENTER_UI = {
  pageDescription:
    "See live risk, what ARTSA decided, and click anything to inspect.",
  integrationActivity: "App activity",
  integrationActivityHint:
    "Results when your agents send actions to ARTSA — not alerts going out to Slack.",
  latestResponse: "Latest response from your app",
  waitingForTraffic: "No app activity yet",
  waitingHint:
    "Connect your agents in Settings, or send a test from Get Started. Each action shows how ARTSA responded.",
  guardConnected: "ARTSA is online",
  guardOffline: "ARTSA is offline",
  liveFeed: "Live feed connected",
  liveFeedPolling: "Live feed — backup refresh",
  eventsScreened: "Events checked",
  activeSessions: "Active sessions",
  viewFullLog: "Full activity log",
  connectIntegration: "Connect your app",
  manageIntegrations: "Manage connections",
  outboundConnected: "Outgoing alerts connected",
  waitingForIngest: "Send agent activity to see results here",
  outboundVsIngestNote:
    "Slack and similar tools send alerts out when something is risky. This panel shows what happened when activity came in from your agents.",
  sendTestEvent: "Send a test",
  liveFeedNoEvents: "Connected · waiting for activity",
  liveFeedActive: "Live · receiving events",
  ingestEndpointTitle: "Where your app sends activity",
  ingestEndpointHint:
    "Your agents send each action here. Your admin sets the access key in connection settings.",
  ingestKeyMissing: "ARTSA access key is not set on the server — requests may be rejected",
  ingestKeyOk: "Server access key is set",
  testIngestNow: "Send a test from this page",
  testIngestOk: "Test worked — check Latest response above",
  testIngestFailed: "Test failed — check the access key and server logs",
  inboundTitle: "Incoming — activity from your agents",
  inboundDetail: "When agents send actions to ARTSA, they show up here and in the activity log.",
  outboundTitle: "Outgoing — alerts to your systems",
  outboundDetail: "Slack and similar tools send alerts out. They do not bring traffic in.",
  sendSampleAlert: "Send a sample to your URL",
  ragGuide: "Document search guide",
  getStarted: "Run the setup check",
  agent: "Agent",
  toolCall: "Action",
  session: "Session",
  recentResponses: "Recent responses",
  sampleAlertDispatched: "Sample alert sent to your URL (outgoing only)",
  noLiveTelemetryYet: "No live activity yet",
  noLiveTelemetryHint:
    "Connect agents or send a test — results appear here as they arrive.",
} as const;

/** Command Center — what data you are looking at */
export const DATA_SOURCE_UI = {
  title: {
    offline: "ARTSA is offline",
    no_traffic: "No agent activity yet",
    live_ingest: "Live — activity from your app",
    session_history: "Saved sessions — not live",
    test_stream: "Demo stream — not your application",
    test_only: "Test events only — not your application",
    mixed: "Mixed — tests plus real activity",
  },
  detail: {
    offline: "Nothing is being checked until ARTSA is running.",
    no_traffic:
      "Connecting an AI key or alert channel does not import your app. Your agents must send each action to ARTSA.",
    live_ingest: "These events are from your connected agents. Scores and decisions are real.",
    session_history: "Showing saved sessions while waiting for new live activity.",
    test_stream:
      "The demo stream sends sample actions through the real engine. Turn it off to see only your app.",
    test_only:
      "These rows are from in-product tests. Real app traffic uses your own agent names, not the demo agents.",
    mixed: "Some events are tests. Search the log for your real agent name to isolate live traffic.",
  },
  llmOrOutboundNote:
    "Your connected AI key or alert channel is for attack tests or outgoing alerts — it does not pull your app’s traffic onto this screen.",
  wireIngestLink: "Connect your app →",
  llmProviderWizardNote:
    "Used for attack tests — ARTSA calls your model. It does not read or analyze your application’s live traffic.",
  alertWizardNote:
    "Sends alerts to your URL when risks are found. Does not import traffic into Command Center.",
} as const;

export const INTEGRATION_UI = {
  sendSampleToUrl: "Send a sample to your URL",
  sampleSent: "Sample sent to your URL",
  testProvider: "Test AI provider",
  inboundTab: "Incoming (agent activity)",
  outboundTab: "Outgoing (alerts)",
} as const;

export const INTEGRATION_HEALTH_UI = {
  title: "Connection health",
  subtitle: "Agent activity powers Command Center. Outgoing channels only send alerts to your systems.",
  apiOnline: "ARTSA is connected",
  apiOffline: "ARTSA is offline",
  trafficSeen: "Agent activity received — Command Center is live",
  noTrafficYet: "No agent activity yet — send a test from Get Started",
  wsLive: "Live feed connected",
  wsPolling: "Backup refresh — events still appear after you send activity",
  outboundOptional: "No outgoing channels — optional for team alerts",
  outboundReminder:
    "Testing outgoing alerts sends a sample to your URL. It does not fill Command Center.",
} as const;

export const INGEST_UI = {
  copyCurl: "Copy send command",
  copied: "Copied",
  wireTitle: "Connect production",
  wireHint: "Send agent actions through ARTSA. They appear in Command Center and the activity log.",
} as const;

export const CONNECTION_UI = {
  backendOfflineTitle: "Can't connect to ARTSA",
  backendOfflineHint:
    "Live screening, activity logs, and setup tests need the ARTSA API. Check your deployment or ask your platform admin.",
  whenOfflinePrimary: "Connection settings",
  whenOfflineSecondary: "Setup guide",
  offlineNav: "API offline",
  pollingNav: "Polling backup",
} as const;

/** Reuse for inline errors when fetch fails because API is down */
export const API_UNAVAILABLE = {
  short: "ARTSA is unavailable",
  hint: "Check that ARTSA is running, then refresh this page.",
  scan: "Scan couldn’t run — ARTSA is unavailable.",
  sandbox: "Check couldn’t run — ARTSA is unavailable.",
  rag: "Document scan couldn’t run — ARTSA is unavailable.",
} as const;

export const SANDBOX_UI = {
  liveMonitoringTitle: "Sandbox ≠ live Command Center",
  liveMonitoringHint:
    "Tests here run in isolation. Connect production agents through Get Started to see live activity on the dashboard.",
  sendTestEvent: "Send a test event",
} as const;

export const COACHMARK_UI = {
  title: "No agent traffic yet",
  description:
    "Your guard is online. Send one test event from Get Started — the same path production agents use.",
  autoIngestOk: "Test event sent — watch the latest response above",
  autoIngestFailed: "Could not send the test event — check connection settings",
} as const;

/** Empty states — plain English, no API paths */
export const EMPTY_STATE_UI = {
  allClearTitle: "All clear",
  allClearDescription:
    "No risky sessions right now. Connect agents or run an attack test to generate activity.",
  noRiskTrendTitle: "No trends yet",
  noRiskTrendDescription:
    "Risk charts fill in as live events and completed tests arrive.",
  noActivityTitle: "No activity yet",
  noActivityDescription: "When agents send actions, checked events appear here.",
  noTopologyTitle: "No agent map yet",
  noTopologyDescription:
    "The map builds from live sessions. Connect agents or send a test.",
  noAnalyticsTitle: "No analytics yet",
  noAnalyticsDescription:
    "Charts need live events or completed attack tests. Nothing to show yet.",
  openSetup: "Open setup guide",
  runWargame: "Run an attack test",
  viewCommandCenter: "Command Center",
} as const;

export const FILTER_LABELS: Record<CaseCategory | "all", string> = {
  all: "All tests",
  attack: "Attack cases",
  safe: "Safe requests",
  edge: "Edge cases",
};

export function guardDecisionLabel(verdict: string): string {
  const map: Record<string, string> = {
    SAFE: "Looks safe",
    SUSPICIOUS: "Suspicious",
    BREACHED: "Serious threat",
    ESCALATED: "Needs human review",
  };
  return map[verdict] ?? verdict;
}

export function guardActionLabel(action: string): string {
  const map: Record<string, string> = {
    NONE: "Allow — no action",
    ALERT: "Alert your team",
    THROTTLE: "Slow the agent down",
    KILL: "Stop the session",
    QUARANTINE: "Lock for review",
  };
  return map[action] ?? action;
}

export function failureLabelPlain(expectBenign: boolean | undefined): string {
  return expectBenign ? READINESS_UI.falsePositive : READINESS_UI.detectionGap;
}
