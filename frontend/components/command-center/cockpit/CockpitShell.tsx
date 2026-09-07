"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CockpitShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "cockpit-shell relative flex min-h-[100dvh] w-full flex-1 flex-col overflow-x-hidden font-sans selection:bg-[#00D2FF]/20 selection:text-[#00D2FF]",
        className
      )}
    >
      {children}
    </div>
  );
}
