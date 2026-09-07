"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DetectSubNav } from "@/components/red-team/DetectSubNav";
import { redTeamNav } from "@/lib/redTeamNav";

function resolveSection(pathname: string): { section: string; title: string; subtitle: string } {
  if (pathname.startsWith("/red-team/surface")) {
    return {
      section: "Assess",
      title: "Attack Surface",
      subtitle: "What you have tested, and what is still exposed.",
    };
  }
  if (pathname.startsWith("/red-team/campaigns")) {
    return {
      section: "Red Team",
      title: "Campaigns",
      subtitle: "Start a test, then watch it finish or fail.",
    };
  }
  if (pathname.startsWith("/red-team/lab")) {
    return {
      section: "Red Team",
      title: "Attack Lab",
      subtitle: "Check a message now, or start a full lab run.",
    };
  }
  if (pathname.startsWith("/red-team/library")) {
    return {
      section: "Red Team",
      title: "Attack Library",
      subtitle: "Templates you can run in Attack Lab.",
    };
  }
  if (pathname === "/red-team/monitor/live" || pathname.startsWith("/red-team/monitor/live/")) {
    return {
      section: "Detect",
      title: "Detections",
      subtitle: "Live events ARTSA flagged or blocked.",
    };
  }
  if (pathname === "/red-team/monitor" || pathname === "/red-team/monitor/") {
    return {
      section: "Detect",
      title: "Detections",
      subtitle: "Live events ARTSA flagged or blocked.",
    };
  }
  if (pathname.startsWith("/red-team/monitor/")) {
    return {
      section: "Detect",
      title: "Detections",
      subtitle: "One campaign run — from Detections in the sidebar.",
    };
  }
  if (pathname.startsWith("/red-team/matrix")) {
    return {
      section: "Detect",
      title: "Outcomes",
      subtitle: "Detected, stopped, or leaked — by attack.",
    };
  }
  if (pathname.startsWith("/red-team/graph")) {
    return {
      section: "Investigate",
      title: "Attack Graph",
      subtitle: "How an attack moved across stages.",
    };
  }
  if (pathname.startsWith("/red-team/evidence")) {
    return {
      section: "Investigate",
      title: "Run detail",
      subtitle: "Requests, responses, and the trail of one campaign.",
    };
  }
  if (pathname.startsWith("/red-team/findings")) {
    return {
      section: "Investigate",
      title: "Findings",
      subtitle: "Problems found from tests and live activity.",
    };
  }
  if (pathname === "/red-team" || pathname === "/red-team/") {
    return {
      section: "Red Team",
      title: "Red Team",
      subtitle: "Check a message, run a campaign, then review detections.",
    };
  }
  return {
    section: "Red Team",
    title: "Red Team",
    subtitle: "Check, launch campaigns, and contain.",
  };
}

const PREFETCH = [
  "/red-team/lab",
  "/red-team/campaigns",
  "/red-team/library",
  "/red-team/monitor",
  "/red-team/matrix",
  "/red-team/graph",
  "/red-team/surface",
];

/** Dedicated Red Team chrome — header only; nav in main sidebar. */
export function RedTeamShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const section = resolveSection(pathname);

  useEffect(() => {
    for (const href of PREFETCH) {
      router.prefetch(href);
    }
    for (const group of redTeamNav) {
      for (const item of group.items) {
        router.prefetch(item.href);
      }
    }
  }, [router]);

  return (
    <div className="red-team-workspace -mx-1 min-h-[calc(100vh-7rem)]">
      <header className="mb-4 max-w-3xl pb-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {section.section}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
          {section.title}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{section.subtitle}</p>
      </header>

      {section.section === "Detect" ? <DetectSubNav /> : null}

      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Kept for theater pages; header no longer renders chrome badges. */
export function publishRedTeamChrome(
  state: import("@/lib/redTeamNav").LiveChromeState
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("artsa:redteam-chrome", { detail: { state } }));
}
