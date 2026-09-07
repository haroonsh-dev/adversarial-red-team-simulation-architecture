import {
  LayoutDashboard,
  Network,
  FileText,
  Users,
  Shield,
  ShieldAlert,
  Crosshair,
  Settings2,
  BarChart3,
  GitBranch,
  FileSearch,
  ScrollText,
  FlaskConical,
  Radio,
  Waypoints,
  Bot,
  Plug,
  KeyRound,
  Cpu,
  Target,
  History,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  capability?: keyof import("@/lib/hooks/useAuthRole").AuthCapabilities;
  /** Nested items — parent href remains the default landing route. */
  children?: NavItem[];
  /** When true, only exact pathname match counts as active (no prefix). */
  exact?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export function isNavHrefActive(pathname: string, href: string, exact?: boolean): boolean {
  const pathOnly = href.split("?")[0] ?? href;
  if (pathname === pathOnly) return true;
  if (exact) return false;

  if (
    pathOnly === "/command-center" ||
    pathOnly === "/get-started" ||
    pathOnly === "/settings" ||
    pathOnly === "/red-team" ||
    pathOnly === "/campaigns" ||
    pathOnly === "/red-team/monitor"
  ) {
    if (pathOnly === "/red-team/monitor") {
      return (
        pathname.startsWith("/red-team/monitor/") &&
        !pathname.startsWith("/red-team/monitor/live")
      );
    }
    return false;
  }
  return pathname.startsWith(`${pathOnly}/`);
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (isNavHrefActive(pathname, item.href, item.exact)) return true;
  return item.children?.some((child) => isNavHrefActive(pathname, child.href, child.exact)) ?? false;
}

/** Leaf nav entries for command palette, smoke tests, etc. */
export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children?.length ? item.children : [item]));
}

export function filterNavItemsByCapability(
  items: NavItem[],
  capabilities: import("@/lib/hooks/useAuthRole").AuthCapabilities
): NavItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filterNavItemsByCapability(item.children, capabilities);
        if (children.length === 0) return null;
        return { ...item, children };
      }
      if (item.capability && !capabilities[item.capability]) return null;
      return item;
    })
    .filter((item): item is NavItem => item != null);
}

export const navSections: NavSection[] = [
  {
    label: "",
    items: [
      {
        name: "Command Center",
        href: "/command-center",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: "Discover",
    items: [
      { name: "Targets", href: "/targets", icon: Target, exact: true },
      { name: "AI Assets", href: "/pipeline", icon: GitBranch },
      { name: "Agents", href: "/mission-graph", icon: Bot },
      { name: "Connections", href: "/command-center/topology", icon: Network },
    ],
  },
  {
    label: "Assess",
    items: [
      { name: "Risk", href: "/risks", icon: ShieldAlert },
      { name: "Attack Surface", href: "/red-team/surface", icon: Target },
      {
        name: "Policies",
        href: "/admin/policies",
        icon: Shield,
        capability: "can_manage_policies",
      },
    ],
  },
  {
    label: "Red Team",
    items: [
      {
        name: "Attack Lab",
        href: "/red-team/lab",
        icon: Crosshair,
        capability: "can_run_campaigns",
      },
      {
        name: "Campaigns",
        href: "/red-team/campaigns",
        icon: FlaskConical,
        capability: "can_run_campaigns",
      },
      {
        name: "Attack Library",
        href: "/red-team/library",
        icon: FileSearch,
        capability: "can_run_campaigns",
      },
    ],
  },
  {
    label: "Detect",
    items: [
      {
        name: "Detections",
        href: "/red-team/monitor",
        icon: Radio,
        capability: "can_run_campaigns",
      },
      { name: "Activity", href: "/logs", icon: ScrollText },
      {
        name: "Outcomes",
        href: "/red-team/matrix",
        icon: BarChart3,
        capability: "can_run_campaigns",
      },
    ],
  },
  {
    label: "Investigate",
    items: [
      { name: "Findings", href: "/findings", icon: FileSearch },
      {
        name: "Attack Graph",
        href: "/red-team/graph",
        icon: Waypoints,
        capability: "can_run_campaigns",
      },
      { name: "Sessions", href: "/replay", icon: History },
    ],
  },
  {
    label: "Report",
    items: [{ name: "Reports", href: "/reports", icon: FileText }],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      {
        name: "Integrations",
        href: "/settings/integrations",
        icon: Plug,
        capability: "can_manage_integrations",
      },
      {
        name: "AI Providers",
        href: "/admin/providers",
        icon: Cpu,
        capability: "can_manage_providers",
      },
      { name: "API Keys", href: "/get-started", icon: KeyRound, exact: true },
      { name: "Team & Access", href: "/settings/team", icon: Users },
      { name: "Settings", href: "/settings", icon: Settings2, exact: true },
    ],
  },
];
