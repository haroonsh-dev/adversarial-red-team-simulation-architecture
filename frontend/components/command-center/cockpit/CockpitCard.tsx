"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Double-Bezel (Doppelrand) Architecture:
 * Outer Shell: Machined hardware bezel with 1px border.
 * Inner Core: Concentric radiused content cavity with subtle inset highlight.
 */
export function CockpitCard({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div
      className={cn(
        "cockpit-card flex min-h-0 flex-col overflow-hidden transition-colors duration-150",
        className
      )}
    >
      <div
        className={cn(
          "cockpit-card-inner flex min-h-0 flex-1 flex-col overflow-hidden",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
