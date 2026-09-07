"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const DETECT_TABS = [
  { name: "Detections", href: "/red-team/monitor" },
  { name: "Activity", href: "/logs" },
  { name: "Outcomes", href: "/red-team/matrix" },
  { name: "Agents", href: "/mission-graph" },
  { name: "Connections", href: "/command-center/topology" },
  { name: "Sessions", href: "/replay" },
] as const;

function tabActive(pathname: string, href: string): boolean {
  if (href === "/red-team/monitor") return pathname.startsWith("/red-team/monitor");
  if (href === "/logs") return pathname === "/logs" || pathname.startsWith("/logs/");
  if (href === "/red-team/matrix") return pathname.startsWith("/red-team/matrix");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Segmented Detect workspace tabs — same chrome as the window filter. */
export function DetectSubNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Detect" className="mb-4">
      <div className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border border-border/80 bg-muted/40 p-1">
        {DETECT_TABS.map((tab) => {
          const active = tabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
