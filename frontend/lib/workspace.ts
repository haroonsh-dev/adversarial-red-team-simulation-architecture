import {
  LayoutDashboard,
  BarChart3,
  ScrollText,
  Network,
  Swords,
  Crosshair,
  GitBranch,
  BookOpen,
  FileCode,
  ShieldAlert,
  FileText,
  Shield,
  Settings2,
  Users,
  KeyRound,
  Bot,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface WorkspaceLink {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface WorkspaceContext {
  related: WorkspaceLink[];
  next?: WorkspaceLink;
  hint: string;
}

const L = {
  keys: { name: "API Keys", href: "/get-started", icon: KeyRound },
  dash: { name: "Command Center", href: "/command-center", icon: LayoutDashboard },
  assets: { name: "AI Assets", href: "/pipeline", icon: GitBranch },
  agents: { name: "Agents", href: "/mission-graph", icon: Bot },
  targets: { name: "Targets", href: "/targets", icon: Target },
  detections: { name: "Detections", href: "/red-team/monitor", icon: BarChart3 },
  activity: { name: "Activity", href: "/logs", icon: ScrollText },
  connections: { name: "Connections", href: "/command-center/topology", icon: Network },
  campaigns: { name: "Campaigns", href: "/red-team/campaigns", icon: Swords },
  lab: { name: "Attack Lab", href: "/red-team/lab", icon: Crosshair },
  policies: { name: "Policies", href: "/admin/policies", icon: Shield },
  library: { name: "Attack Library", href: "/red-team/library", icon: BookOpen },
  sessions: { name: "Sessions", href: "/replay", icon: FileCode },
  risk: { name: "Risk", href: "/risks", icon: ShieldAlert },
  reports: { name: "Reports", href: "/reports", icon: FileText },
  settings: { name: "Settings", href: "/settings", icon: Settings2 },
  providers: { name: "AI Providers", href: "/admin/providers", icon: Users },
  findings: { name: "Findings", href: "/findings", icon: FileText },
  outcomes: { name: "Outcomes", href: "/red-team/matrix", icon: BarChart3 },
  graph: { name: "Attack Graph", href: "/red-team/graph", icon: Network },
  surface: { name: "Attack Surface", href: "/red-team/surface", icon: ShieldAlert },
} as const;

const HINT = "⌘K jump anywhere";

function match(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/command-center" && pathname.startsWith(`${href}/`));
}

/** Next-step rail — labels match the sidebar. */
export function workspaceFor(pathname: string): WorkspaceContext {
  if (match(pathname, "/get-started")) {
    return {
      related: [L.dash, L.activity, L.lab],
      next: L.dash,
      hint: "Create a key, then watch Command Center",
    };
  }
  if (match(pathname, "/targets")) {
    return { related: [L.surface, L.campaigns, L.lab], next: L.surface, hint: "Map the target, then test it" };
  }
  if (match(pathname, "/pipeline")) {
    return { related: [L.targets, L.agents, L.connections], next: L.agents, hint: HINT };
  }
  if (match(pathname, "/mission-graph")) {
    return { related: [L.assets, L.connections, L.dash], next: L.connections, hint: HINT };
  }
  if (match(pathname, "/command-center/topology")) {
    return { related: [L.agents, L.activity, L.sessions], next: L.activity, hint: HINT };
  }
  if (match(pathname, "/command-center")) {
    return { related: [L.activity, L.detections, L.lab], next: L.lab, hint: HINT };
  }
  if (match(pathname, "/risks")) {
    return { related: [L.surface, L.policies, L.findings], next: L.surface, hint: HINT };
  }
  if (match(pathname, "/red-team/surface")) {
    return { related: [L.risk, L.lab, L.library], next: L.lab, hint: HINT };
  }
  if (match(pathname, "/admin/policies")) {
    return { related: [L.risk, L.lab, L.providers], next: L.lab, hint: HINT };
  }
  if (match(pathname, "/red-team/lab")) {
    return { related: [L.library, L.campaigns, L.detections], next: L.campaigns, hint: HINT };
  }
  if (match(pathname, "/library") || match(pathname, "/red-team/library")) {
    return { related: [L.lab, L.campaigns, L.surface], next: L.lab, hint: "Pick a template, then open Attack Lab" };
  }
  if (match(pathname, "/red-team") || match(pathname, "/campaigns")) {
    return { related: [L.library, L.lab, L.reports], next: L.library, hint: HINT };
  }
  if (match(pathname, "/red-team/monitor")) {
    return { related: [L.activity, L.outcomes, L.findings], next: L.activity, hint: HINT };
  }
  if (match(pathname, "/logs")) {
    return { related: [L.dash, L.sessions, L.findings], next: L.sessions, hint: "Filter severity · click a row for Sessions" };
  }
  if (match(pathname, "/red-team/matrix")) {
    return { related: [L.detections, L.findings, L.reports], next: L.findings, hint: HINT };
  }
  if (match(pathname, "/findings")) {
    return { related: [L.graph, L.sessions, L.reports], next: L.graph, hint: HINT };
  }
  if (match(pathname, "/red-team/graph")) {
    return { related: [L.findings, L.sessions, L.lab], next: L.sessions, hint: HINT };
  }
  if (match(pathname, "/replay")) {
    return { related: [L.activity, L.findings, L.reports], next: L.activity, hint: HINT };
  }
  if (match(pathname, "/reports")) {
    return { related: [L.campaigns, L.outcomes, L.dash], next: L.campaigns, hint: HINT };
  }
  if (match(pathname, "/admin/providers")) {
    return { related: [L.keys, L.lab, L.campaigns], next: L.lab, hint: HINT };
  }
  if (pathname.startsWith("/settings")) {
    return { related: [L.providers, L.keys, L.dash], next: L.providers, hint: HINT };
  }
  return { related: [L.dash, L.lab, L.activity], next: L.dash, hint: HINT };
}
