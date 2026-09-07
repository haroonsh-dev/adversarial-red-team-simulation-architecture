/** Shared Recharts styling — follows `data-theme` CSS tokens. */

import type { CSSProperties } from "react";

/** Axis labels — readable on both canvases. */
export const CHART_AXIS_TICK = {
  fontSize: 10,
  fill: "hsl(var(--muted-foreground))",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const CHART_GRID = {
  stroke: "hsl(var(--border))",
  strokeDasharray: "3 6",
  vertical: false,
} as const;

/**
 * Tooltip panel — elevated surface so hover is readable on charts.
 * Pair with CHART_TOOLTIP_ITEM_STYLE / LABEL_STYLE (Recharts defaults item text to black).
 */
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
  boxShadow: "0 10px 28px hsl(var(--canvas-depth))",
  padding: "8px 10px",
};

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "hsl(var(--foreground))",
  fontWeight: 600,
  marginBottom: 4,
};

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

/** Props spread onto every Recharts `<Tooltip />` for readable hover. */
export const CHART_TOOLTIP_PROPS = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_TOOLTIP_LABEL_STYLE,
  itemStyle: CHART_TOOLTIP_ITEM_STYLE,
  wrapperStyle: { outline: "none", zIndex: 40 } as CSSProperties,
  cursor: { fill: "hsl(var(--foreground) / 0.04)" },
} as const;

export const CHART_PRIMARY = "#67b3ef";
export const CHART_MUTED = "hsl(var(--muted-foreground))";
export const CHART_CRITICAL = "hsl(var(--severity-critical))";
export const CHART_HIGH = "hsl(var(--severity-high))";

/** Resolve a theme HSL token for canvas / inline paints (canvas ignores `hsl(var(--*))`). */
export function themeHsl(token: `--${string}`, fallback = "hsl(0 0% 3%)"): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return raw ? `hsl(${raw})` : fallback;
}
