"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "artsa:cc-triage-split";
const DEFAULT = 52;
const MIN = 28;
const MAX = 72;

export function useTriageSplit() {
  const [splitPct, setSplitPct] = useState(DEFAULT);
  const dragging = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) setSplitPct(Math.min(MAX, Math.max(MIN, n)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((pct: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, pct));
    setSplitPct(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        if (!dragging.current) return;
        const container = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
        if (!container) return;
        const pct = ((ev.clientX - container.left) / container.width) * 100;
        persist(pct);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persist]
  );

  return { splitPct, onPointerDown };
}
