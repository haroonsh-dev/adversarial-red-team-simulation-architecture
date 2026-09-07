/** Client onboarding copy — one ARTSA key, no extra AI-provider setup. */

import { ingestApiBaseUrl } from "@/lib/ingestSnippet";

export const CLIENT_ONBOARDING_UI = {
  pageTitle: "Connect your application",
  pageDescription:
    "One ARTSA key is all your app needs. Check every agent action in real time — keep your own AI keys on your side.",
  heroBadge: "For your app",
  notRequiredTitle: "You do not need",
  notRequired: [
    "Your OpenAI or other AI keys stored in ARTSA",
    "A webhook to pull traffic in",
    "Attack-test setup just to start protecting",
  ],
  youProvideTitle: "What you do",
  youProvide: [
    "One ARTSA key per app or customer",
    "Ask ARTSA before each agent action runs",
    "Stop the action if ARTSA says to block or hold it",
  ],
  flowTitle: "How it works",
  steps: [
    {
      id: "key",
      title: "Create a key",
      detail: "Make a key for each app or environment. Copy it once and store it safely.",
    },
    {
      id: "wire",
      title: "Ask before each action",
      detail: "Your app checks with ARTSA before the agent runs a tool. This is meant to finish in under 50ms.",
    },
    {
      id: "enforce",
      title: "Follow the decision",
      detail: "If ARTSA says stop or hold for review, do not run the action. Otherwise continue.",
    },
    {
      id: "observe",
      title: "Watch it live",
      detail: "Every checked action shows up in Command Center — risk score and what we found.",
    },
  ],
  lakeraCompareTitle: "Your AI keys stay with you",
  lakeraCompare:
    "You send the action to ARTSA to check. Your customer’s OpenAI or other AI key never leaves their app.",
  operatorNote:
    "AI provider keys in Settings are only for your team’s attack tests — not required to protect a customer app.",
  testTitle: "Try it now",
  testHint: "Send a sample below, then open Command Center to see it live.",
  commandCenterCta: "Open Command Center",
} as const;

export function buildClientPythonSnippet(apiKey = "YOUR_ARTSA_API_KEY"): string {
  const base = ingestApiBaseUrl();
  return `from artsa import ArtsaClient

client = ArtsaClient(
    api_url="${base}",
    api_key="${apiKey}",
    fail_closed=True,
)

# Call BEFORE running the tool in your app
result = client.guard_tool_call(
    session_id="user-session-101",
    agent_id="support-bot",
    tool_name="read_file",
    arguments={"path": "/data/report.pdf"},
)

# result["verdict"]["recommended_action"] → NONE | ALERT | QUARANTINE | KILL
# Only run the tool if not blocked`;
}

export function buildClientNodeSnippet(apiKey = "YOUR_ARTSA_API_KEY"): string {
  const base = ingestApiBaseUrl();
  return `import { ArtsaClient } from "artsa-guard";

const client = new ArtsaClient({
  apiUrl: "${base}",
  apiKey: "${apiKey}",
  failClosed: true,
});

const result = await client.guardToolCall({
  sessionId: "user-session-101",
  agentId: "support-bot",
  toolName: "read_file",
  arguments: { path: "/data/report.pdf" },
});

// Block tool if action is KILL or QUARANTINE`;
}
