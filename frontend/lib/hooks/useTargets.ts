"use client";

import { useCallback, useEffect, useState } from "react";
import { buildHeaders, fetchFromBackend } from "@/lib/api";
import { toast } from "@/lib/stores/toast";
import type { Target, TargetDraft } from "@/lib/targets";

export function useTargets() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchFromBackend<Target[]>("/api/v1/targets", { silent: true });
    if (data) setTargets(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTarget = useCallback(
    async (draft: TargetDraft): Promise<Target | null> => {
      const created = await fetchFromBackend<Target>("/api/v1/targets", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      if (created) {
        setTargets((prev) => [created, ...prev]);
        toast("Target registered", { description: created.name });
      }
      return created;
    },
    []
  );

  const updateTarget = useCallback(
    async (id: string, patch: Partial<TargetDraft>): Promise<Target | null> => {
      setBusyId(id);
      const updated = await fetchFromBackend<Target>(
        `/api/v1/targets/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(patch) }
      );
      setBusyId(null);
      if (updated) {
        setTargets((prev) => prev.map((t) => (t.id === id ? updated : t)));
      }
      return updated;
    },
    []
  );

  const deleteTarget = useCallback(async (id: string): Promise<boolean> => {
    setBusyId(id);
    // 204 No Content: fetchFromBackend can't parse a body, so call through the
    // proxy directly and treat a 2xx as success.
    const res = await fetch(`/api/backend/api/v1/targets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: buildHeaders(),
    }).catch(() => null);
    setBusyId(null);
    if (res?.ok) {
      setTargets((prev) => prev.filter((t) => t.id !== id));
      return true;
    }
    toast("Could not remove target", { variant: "error" });
    return false;
  }, []);

  /** Probe the target and store the surface it reports. */
  const discover = useCallback(async (id: string): Promise<Target | null> => {
    setBusyId(id);
    const updated = await fetchFromBackend<Target>(
      `/api/v1/targets/${encodeURIComponent(id)}/discover`,
      { method: "POST", timeoutMs: 120_000 }
    );
    setBusyId(null);
    if (updated) {
      setTargets((prev) => prev.map((t) => (t.id === id ? updated : t)));
      if (updated.surface?.reachable) {
        toast("Discovery complete", {
          description: `${updated.surface.surface.length} attack-surface categories opened.`,
        });
      } else {
        toast("Target unreachable", {
          description: updated.surface?.unreachable_reason ?? "No response from the target.",
          variant: "error",
        });
      }
    }
    return updated;
  }, []);

  return {
    targets,
    loading,
    busyId,
    refresh,
    createTarget,
    updateTarget,
    deleteTarget,
    discover,
  };
}
