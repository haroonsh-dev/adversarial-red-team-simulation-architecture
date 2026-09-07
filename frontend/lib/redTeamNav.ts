/** Prefetch targets for Red Team routes that live in the main sidebar. */

export type RedTeamNavGroup = {
  label: string;
  items: { name: string; href: string; exact?: boolean }[];
};

export const redTeamNav: RedTeamNavGroup[] = [
  {
    label: "Red Team",
    items: [
      { name: "Attack Lab", href: "/red-team/lab" },
      { name: "Campaigns", href: "/red-team/campaigns" },
      { name: "Attack Library", href: "/red-team/library" },
    ],
  },
  {
    label: "Detect",
    items: [
      { name: "Detections", href: "/red-team/monitor" },
      { name: "Outcomes", href: "/red-team/matrix" },
    ],
  },
];

export function isRedTeamHrefActive(pathname: string, href: string, exact?: boolean): boolean {
  const pathOnly = href.split("?")[0] ?? href;

  if (pathOnly === "/red-team/monitor") {
    if (pathname.startsWith("/red-team/monitor/live")) return true;
    return (
      pathname === "/red-team/monitor" ||
      pathname === "/red-team/monitor/" ||
      pathname.startsWith("/red-team/monitor/")
    );
  }

  if (exact || pathOnly === "/red-team") return pathname === pathOnly;
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

export type LiveChromeState =
  | "connecting"
  | "live"
  | "paused"
  | "stalled"
  | "ended"
  | "error"
  | "idle";
