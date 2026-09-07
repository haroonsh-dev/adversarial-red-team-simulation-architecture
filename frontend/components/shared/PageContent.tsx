"use client";

import { cn } from "@/lib/utils";

/** Page body wrapper — no route-change slide/fade (calm product chrome). */
export function PageContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
