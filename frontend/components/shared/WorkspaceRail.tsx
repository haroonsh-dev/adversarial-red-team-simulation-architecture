"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { workspaceFor } from "@/lib/workspace";

/** Contextual next-step — single line, not a second nav. */
export function WorkspaceRail() {
  const pathname = usePathname();
  const ctx = workspaceFor(pathname);
  const NextIcon = ctx.next?.icon;

  if (!ctx.next || !NextIcon) return null;

  return (
    <div className="workspace-rail">
      <Link href={ctx.next.href} className="workspace-rail-link group">
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            What to do next
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 font-medium text-foreground">
            {ctx.next.name}
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </span>
        <span className="hidden max-w-xs text-right text-[11px] text-muted-foreground sm:block">
          {ctx.hint}
        </span>
      </Link>
    </div>
  );
}
