import { cn } from "@/lib/utils";

interface LiveIndicatorProps {
  connected: boolean;
  label?: string;
  className?: string;
}

export function LiveIndicator({ connected, label, className }: LiveIndicatorProps) {
  return (
    <span
      className={cn(
        "status-pill inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        connected ? "status-pill--live" : "status-pill--offline",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-70" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            connected ? "bg-primary" : "bg-muted-foreground/80"
          )}
        />
      </span>
      {label ?? (connected ? "Live feed connected" : "Offline — polling fallback")}
    </span>
  );
}
