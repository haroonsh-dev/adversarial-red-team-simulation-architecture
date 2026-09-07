"use client";

import { TriangleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  title?: string;
  description?: string;
  /** Optional reset handler (passed by Next.js error boundaries). */
  onReset?: () => void;
}

/**
 * Shared friendly error state — used by the route-level error boundary so a
 * render/loader failure shows a recovery screen instead of a blank page.
 */
export function ErrorPage({
  title = "Something went wrong",
  description = "An unexpected error occurred while rendering this page. Your data is safe — try reloading, or head back to the dashboard.",
  onReset,
}: ErrorPageProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
        <TriangleAlert className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <div className="mt-2 flex items-center gap-2">
        {onReset && (
          <Button onClick={onReset} className="gap-2">
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
        )}
        <Button variant="outline" onClick={() => (window.location.href = "/command-center")}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
