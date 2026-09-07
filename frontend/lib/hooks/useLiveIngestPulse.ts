"use client";

import { useCallback, useEffect, useRef } from "react";
import { fetchFromBackend } from "@/lib/api";
import { ingestResponseToTelemetry } from "@/lib/ingestTelemetry";

const TOOLS = [
  { tool: "list_orders", args: { limit: 5 } },
  { tool: "read_file", args: { path: "/etc/passwd" } },
  { tool: "query_database", args: { sql: "SELECT 1" } },
  { tool: "http_request", args: { url: "https://example.internal/health" } },
  { tool: "send_email", args: { to: "ops@example.com" } },
  { tool: "chat.search", args: { q: "customer policy" } },
] as const;

/**
 * Continuous real ingest against POST /api/v1/ingest so the Command Center
 * bus visibly moves. Not synthetic UI events — each tick hits the API.
 */
export function useLiveIngestPulse(opts: {
  enabled: boolean;
  apiOnline: boolean;
  intervalMs?: number;
  onEvent: (row: Record<string, unknown>) => void;
  onTick?: (ok: boolean) => void;
}) {
  const { enabled, apiOnline, intervalMs = 2800, onEvent, onTick } = opts;
  const idx = useRef(0);
  const onEventRef = useRef(onEvent);
  const onTickRef = useRef(onTick);
  onEventRef.current = onEvent;
  onTickRef.current = onTick;

  const fire = useCallback(async () => {
    const pick = TOOLS[idx.current % TOOLS.length]!;
    idx.current += 1;
    const sessionId = crypto.randomUUID();
    const request = {
      session_id: sessionId,
      agent_id: `watch-agent-${(idx.current % 3) + 1}`,
      tool_name: pick.tool,
      arguments: pick.args,
    };
    const data = await fetchFromBackend<{
      session_id?: string;
      agent_id?: string;
      tool_name?: string;
      risk_score?: { overall_score?: number };
      verdict?: { verdict?: string; recommended_action?: string };
    }>("/api/v1/ingest", {
      method: "POST",
      body: JSON.stringify(request),
      silent: true,
    });
    if (data) {
      onEventRef.current(ingestResponseToTelemetry(request, data));
      onTickRef.current?.(true);
      return true;
    }
    onTickRef.current?.(false);
    return false;
  }, []);

  useEffect(() => {
    if (!enabled || !apiOnline) return;
    let cancelled = false;
    let timer: number | undefined;

    const loop = async () => {
      if (cancelled) return;
      await fire();
      if (cancelled) return;
      timer = window.setTimeout(loop, intervalMs + Math.random() * 600);
    };
    void loop();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, apiOnline, intervalMs, fire]);

  return { fireOnce: fire };
}
