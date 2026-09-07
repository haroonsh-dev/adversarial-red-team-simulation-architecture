/** AI Guardrails — full public feature catalog mapped to ARTSA. */

export interface GuardFeatureRow {
  id: string;
  name: string;
  description: string;
  artsa: string;
  href: string;
}

export interface GuardFeatureCategory {
  id: string;
  name: string;
  summary: string;
  features: GuardFeatureRow[];
}

export const GUARD_FEATURE_CATEGORIES: GuardFeatureCategory[] = [
  {
    id: "platform",
    name: "Platform & API",
    summary: "Single guard endpoint, projects, modes, latency, and rollout tooling.",
    features: [
      {
        id: "guard-api",
        name: "POST /v2/guard",
        description: "One API call screens user input, RAG/reference docs, assistant output, tool_calls, and tool responses.",
        artsa: "Sandbox evaluate + POST /api/v1/ingest",
        href: "/sandbox",
      },
      {
        id: "projects",
        name: "Projects per app / environment",
        description: "Unique project_id per integration — separate policy, sensitivity, and threat analytics.",
        artsa: "Per-tenant org policies + API keys",
        href: "/admin/policies",
      },
      {
        id: "detect-enforce",
        name: "Detect vs Enforce mode",
        description: "Detect logs threats without blocking; Enforce returns flagged:true for policy actions.",
        artsa: "Verdict actions: NONE → KILL / QUARANTINE",
        href: "/admin/policies",
      },
      {
        id: "breakdown",
        name: "Detector breakdown & confidence",
        description: "Optional per-guardrail detected flag and confidence in the API response.",
        artsa: "Layer scores + fired_detectors on each verdict",
        href: "/sandbox",
      },
      {
        id: "metadata",
        name: "Request metadata",
        description: "Attach user ID, session ID, IP for investigations and SIEM correlation.",
        artsa: "Ingest session_id, agent_id, metadata fields",
        href: "/get-started",
      },
      {
        id: "masking-payload",
        name: "Masking payload",
        description: "Return match locations for PII/profanity/regex so apps can redact before LLM or user.",
        artsa: "Highlights + recommended_action on scan results",
        href: "/sandbox",
      },
      {
        id: "streaming",
        name: "Streamed LLM output screening",
        description: "End-of-stream or incremental (sentence/token) screening with delay-buffer or pull-back.",
        artsa: "Ingest each assistant chunk or final output",
        href: "/logs",
      },
      {
        id: "latency",
        name: "Latency cap & parallelization",
        description: "Smart chunking, parallel detectors, global PoPs — sub-50ms target at scale.",
        artsa: "Containment SLO + dashboard latency metrics",
        href: "/command-center",
      },
      {
        id: "guard-results",
        name: "Guard /results (historical)",
        description: "Analyze past traffic for detection rates before rollout — not for runtime decisions.",
        artsa: "Replay + analytics + readiness export",
        href: "/analytics",
      },
      {
        id: "adaptive-calibration",
        name: "Adaptive calibration",
        description: "Learns app-specific traffic patterns to cut false positives (Fall ’25).",
        artsa: "Policy tuning + semantic threshold in org YAML",
        href: "/admin/policies",
      },
      {
        id: "dashboard-siem",
        name: "Dashboard, logs & SIEM export",
        description: "Central visibility, detection analytics, export to your SOC stack.",
        artsa: "Command Center, Logs, outbound connectors",
        href: "/command-center",
      },
      {
        id: "red-team",
        name: "AI red teaming & benchmarks",
        description: "Adversarial datasets, Gandalf-style testing, continuous threat updates.",
        artsa: "Wargame + Attack Library",
        href: "/campaigns",
      },
      {
        id: "external-guard-adapter",
        name: "Optional external guard API passthrough",
        description: "Call external guard API when LAKERA_API_KEY is configured.",
        artsa: "ExternalGuardAdapter in detector stack",
        href: "/admin/system",
      },
    ],
  },
  {
    id: "prompt-defense",
    name: "Prompt Defense",
    summary: "Direct & indirect prompt attacks, jailbreaks, poisoned RAG/tool content — 100+ languages.",
    features: [
      {
        id: "prompt-injection",
        name: "Prompt injection",
        description: "Instructions that override system or user intent (ignore previous, leak prompt, etc.).",
        artsa: "Rule + semantic detectors, sandbox presets",
        href: "/sandbox",
      },
      {
        id: "jailbreak",
        name: "Jailbreak detection",
        description: "Bypass safety training — DAN, token smuggling, obfuscated jailbreak strings.",
        artsa: "Attack Library jailbreak templates",
        href: "/library",
      },
      {
        id: "indirect-injection",
        name: "Indirect / RAG injection",
        description: "Poisoned documents, web pages, or chunks embedded in retrieved context.",
        artsa: "RAG Scanner (offline) + ingest at retrieval",
        href: "/rag-scanner",
      },
      {
        id: "tool-poison",
        name: "Poisoned tool / MCP content",
        description: "Malicious instructions in tool responses or tool descriptions when agents register tools.",
        artsa: "Ingest tool role messages + tool metadata",
        href: "/get-started",
      },
      {
        id: "multilingual-attacks",
        name: "100+ language attack coverage",
        description: "Major European, Asian, Indian, Arabic, Slavic, and African scripts.",
        artsa: "Semantic detector (extend via custom rules)",
        href: "/admin/policies",
      },
      {
        id: "batch-rag",
        name: "Offline knowledge-base screening",
        description: "Screen static corpora when documents are added — not on every user query.",
        artsa: "RAG Scanner bulk chunk audit",
        href: "/rag-scanner",
      },
    ],
  },
  {
    id: "content-moderation",
    name: "Content Moderation",
    summary: "Seven managed moderation detectors plus custom NL/regex guardrails.",
    features: [
      {
        id: "mod-crime",
        name: "Crime & illicit activity",
        description: "Fraud, terrorism planning, cybercrime, trafficking, violent crimes, etc.",
        artsa: "Custom org rules + semantic flags",
        href: "/admin/policies",
      },
      {
        id: "mod-hate",
        name: "Hate & harassment",
        description: "Harassment and hate toward protected groups; slurs and incitement.",
        artsa: "Content policy rules in org YAML",
        href: "/admin/policies",
      },
      {
        id: "mod-profanity",
        name: "Profanity",
        description: "Obscene language including leet-speak and intentional obfuscation.",
        artsa: "Keyword / regex rule detectors",
        href: "/sandbox",
      },
      {
        id: "mod-sexual",
        name: "Sexual content",
        description: "Explicit, commercial sexual services, sexual wellness/education material.",
        artsa: "Custom moderation rules",
        href: "/admin/policies",
      },
      {
        id: "mod-violence",
        name: "Violence descriptions",
        description: "Injury, death, graphic violence, accidents, war reporting.",
        artsa: "Semantic + template-based detection",
        href: "/sandbox",
      },
      {
        id: "mod-weapons",
        name: "Weapons & weapon usage",
        description: "Firearms, explosives, blades, and personal weapons mentions.",
        artsa: "Attack templates + rule detectors",
        href: "/library",
      },
      {
        id: "mod-self-harm",
        name: "Self-harm & suicide",
        description: "Self-destructive behavior, suicide methods, encouragement.",
        artsa: "Policy rules + severity mapping",
        href: "/admin/policies",
      },
      {
        id: "mod-custom",
        name: "Custom moderation guardrails",
        description: "Natural-language or regex policies for org-specific unwanted content.",
        artsa: "Org policies + suggested rules from sandbox",
        href: "/sandbox",
      },
    ],
  },
  {
    id: "data-leakage",
    name: "Data Leakage Prevention",
    summary: "Managed PII entities, system-prompt leakage, custom patterns — input, output, and tools.",
    features: [
      {
        id: "pii-name",
        name: "Full names",
        description: "Multi-cultural full names; resilient to typos; not single given names.",
        artsa: "Semantic + regex canary patterns",
        href: "/sandbox",
      },
      {
        id: "pii-address",
        name: "US mailing addresses",
        description: "Street + city/state/ZIP combinations with abbreviation support.",
        artsa: "Custom rule patterns in policies",
        href: "/admin/policies",
      },
      {
        id: "pii-phone",
        name: "US phone numbers",
        description: "Standard US formats with optional country code.",
        artsa: "Regex rule detectors",
        href: "/admin/policies",
      },
      {
        id: "pii-email",
        name: "Email addresses",
        description: "Standard formats including [AT]/[DOT] obfuscation variants.",
        artsa: "Rule + semantic leakage detection",
        href: "/sandbox",
      },
      {
        id: "pii-ip",
        name: "Public IP addresses",
        description: "IPv4/IPv6 public addresses; excludes reserved/DNS well-known.",
        artsa: "Custom regex in org policies",
        href: "/admin/policies",
      },
      {
        id: "pii-cc",
        name: "Credit card numbers",
        description: "Major card formats validated with Luhn algorithm.",
        artsa: "Canary tokens + pattern rules",
        href: "/sandbox",
      },
      {
        id: "pii-iban",
        name: "IBANs",
        description: "International bank account numbers in standard formats.",
        artsa: "Custom DLP regex rules",
        href: "/admin/policies",
      },
      {
        id: "pii-ssn",
        name: "US Social Security numbers",
        description: "Valid SSN formats with dash/space separators.",
        artsa: "Secret exfiltration templates",
        href: "/library",
      },
      {
        id: "system-prompt-leak",
        name: "System prompt extraction",
        description: "Custom guardrails to block system/developer prompt leakage in outputs.",
        artsa: "Prompt leak attack presets",
        href: "/sandbox",
      },
      {
        id: "custom-dlp",
        name: "Custom DLP (NL / regex)",
        description: "Trigger words, document types, or entity patterns unique to your org.",
        artsa: "Org YAML rules + sandbox policy suggestions",
        href: "/admin/policies",
      },
      {
        id: "tool-dlp",
        name: "Tool argument & response DLP",
        description: "Sensitive data in tool_calls args or untrusted tool message bodies.",
        artsa: "Ingest each tool call/result",
        href: "/get-started",
      },
    ],
  },
  {
    id: "malicious-links",
    name: "Malicious Links",
    summary: "Unknown-domain URL detection — especially dangerous in RAG/indirect injection.",
    features: [
      {
        id: "unknown-links",
        name: "Unknown links detector",
        description: "Flags URLs outside top ~1M popular domains (phishing/typosquat risk).",
        artsa: "URL pattern rules + semantic indirect injection",
        href: "/sandbox",
      },
      {
        id: "allowed-domains",
        name: "Allowed domain list",
        description: "Trust app-specific domains that are not globally popular.",
        artsa: "Org policy allowlists",
        href: "/admin/policies",
      },
      {
        id: "rag-link-injection",
        name: "RAG output link screening",
        description: "Block LLM from surfacing attacker-controlled links from poisoned context.",
        artsa: "RAG Scanner + output ingest screening",
        href: "/rag-scanner",
      },
    ],
  },
  {
    id: "agent-behavior",
    name: "Agent Behavior Defense",
    summary: "Off-task tool calls and runtime tool allow/deny enforcement.",
    features: [
      {
        id: "off-task",
        name: "Off-Task Action detector",
        description: "Flags tool calls inconsistent with user intent that are also dangerous (exfil, privilege, destroy).",
        artsa: "Tool policy + risk scoring on ingest",
        href: "/risks",
      },
      {
        id: "tool-allow",
        name: "Tool Allow List",
        description: "Only listed tools may be invoked; all others flagged deterministically.",
        artsa: "Agent tool policies in org YAML",
        href: "/admin/policies",
      },
      {
        id: "tool-deny",
        name: "Tool Deny List",
        description: "Block specific high-risk tools while leaving others unrestricted.",
        artsa: "Deny rules on tool names/actions",
        href: "/admin/policies",
      },
      {
        id: "screen-tool-calls",
        name: "Screen assistant tool_calls",
        description: "Treat tool_calls on assistant messages as agent actions, not just text.",
        artsa: "Ingest event_type tool_call",
        href: "/get-started",
      },
      {
        id: "screen-tool-msgs",
        name: "Screen tool role messages",
        description: "Untrusted tool responses run through prompt + DLP guardrails.",
        artsa: "Ingest tool result payloads",
        href: "/logs",
      },
    ],
  },
  {
    id: "policy-ops",
    name: "Policy & Operations",
    summary: "Sensitivity levels, custom guardrails, rollout playbooks, compliance.",
    features: [
      {
        id: "sensitivity-l1-l4",
        name: "L1–L4 flagging sensitivity",
        description: "OWASP-style paranoia levels — lenient (L1) through paranoid (L4, default).",
        artsa: "Risk thresholds 50/80 + severity tiers",
        href: "/admin/policies",
      },
      {
        id: "policy-simulator",
        name: "Policy Impact Simulator",
        description: "Compare flag rates across sensitivity levels on historical traffic.",
        artsa: "Readiness suite + analytics",
        href: "/get-started",
      },
      {
        id: "policy-catalog",
        name: "Recommended policy catalog",
        description: "Pre-built policies from Check Point security experts.",
        artsa: "Default org policy templates",
        href: "/admin/policies",
      },
      {
        id: "default-policy",
        name: "Default policy (fallback)",
        description: "All managed guardrails at L4 when no project_id — high false-positive risk.",
        artsa: "Strict default detectors until policies configured",
        href: "/admin/system",
      },
      {
        id: "custom-guardrails",
        name: "Custom guardrails (NL + regex)",
        description: "Bespoke security or content policies beyond managed detectors.",
        artsa: "Custom YAML rules + sandbox suggestions",
        href: "/admin/policies",
      },
      {
        id: "allow-deny-overrides",
        name: "Content Allow / Deny lists",
        description: "Temporary overrides for false positives/negatives while models improve.",
        artsa: "Rule exceptions in org policies",
        href: "/admin/policies",
      },
      {
        id: "managed-updates",
        name: "Daily managed guardrail updates",
        description: "Check Point updates ML/rule detectors against new attacks.",
        artsa: "Detector stack updates via backend releases",
        href: "/admin/system",
      },
      {
        id: "calibration",
        name: "Expert calibration & fine-tuning",
        description: "Collaborative tuning on customer traffic; <0.5% FPR at scale target.",
        artsa: "Readiness export + policy iteration",
        href: "/get-started",
      },
      {
        id: "owasp",
        name: "OWASP LLM Top 10 alignment",
        description: "Mapped controls and audit-friendly reporting.",
        artsa: "Reports + Get Started OWASP/MITRE mapping",
        href: "/reports",
      },
    ],
  },
];

/** Flat list for counts and simple consumers. */
export const LAKERA_GUARD_FEATURES = GUARD_FEATURE_CATEGORIES.flatMap((category) =>
  category.features.map((feature) => ({
    category: category.name,
    peer: feature.name,
    description: feature.description,
    artsa: feature.artsa,
    href: feature.href,
  }))
);

export const LAKERA_FEATURE_COUNT = LAKERA_GUARD_FEATURES.length;
