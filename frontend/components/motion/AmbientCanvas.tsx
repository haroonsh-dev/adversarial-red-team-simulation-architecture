"use client";

import { cn } from "@/lib/utils";

interface AmbientCanvasProps {
  variant?: "app" | "auth";
  className?: string;
}

/**
 * Soft sky + pistachio glow on obsidian — no grid wireframe.
 */
export function AmbientCanvas({ variant = "app", className }: AmbientCanvasProps) {
  return (
    <div
      className={cn(
        "ambient-canvas pointer-events-none fixed inset-0 z-0 overflow-hidden",
        className
      )}
      aria-hidden
    >
      <div className="ambient-canvas__base" />
      <div className="ambient-canvas__grid" />
      <div className="ambient-canvas__vignette" />
      {variant === "auth" ? <div className="ambient-canvas__grain" /> : null}
    </div>
  );
}
