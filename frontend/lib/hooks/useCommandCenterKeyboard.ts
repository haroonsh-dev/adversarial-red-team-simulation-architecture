"use client";

import { useEffect } from "react";

export function useCommandCenterKeyboard(opts: {
  enabled: boolean;
  onNext: () => void;
  onPrev: () => void;
  onFocusSearch: () => void;
  onClearSearch: () => void;
  onToggleFullscreen: () => void;
  onOpenDetail?: () => void;
  onProbe?: () => void;
}) {
  const {
    enabled,
    onNext,
    onPrev,
    onFocusSearch,
    onClearSearch,
    onToggleFullscreen,
    onOpenDetail,
    onProbe,
  } = opts;

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if (e.key === "Escape") {
        if (typing) {
          onClearSearch();
          return;
        }
      }

      if (typing) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        onPrev();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        onFocusSearch();
        return;
      }
      if (e.key === "f") {
        e.preventDefault();
        onToggleFullscreen();
        return;
      }
      if (e.key === "Enter" && onOpenDetail) {
        e.preventDefault();
        onOpenDetail();
        return;
      }
      if (e.key === "p" && onProbe && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onProbe();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onNext, onPrev, onFocusSearch, onClearSearch, onToggleFullscreen, onOpenDetail, onProbe]);
}
