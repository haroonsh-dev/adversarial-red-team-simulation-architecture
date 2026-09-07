"use client";

/** Soft sky + pistachio glow on obsidian — no grid wireframe. */
export function LandingBackdrop() {
  return (
    <div className="lp-backdrop pointer-events-none fixed inset-0 z-0" aria-hidden>
      <div className="lp-backdrop__base" />
      <div className="lp-backdrop__grid" />
      <div className="lp-backdrop__vignette" />
    </div>
  );
}
