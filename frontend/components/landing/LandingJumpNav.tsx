"use client";

const JUMP = [
  { href: "#challenge", label: "Challenge" },
  { href: "#solution", label: "Solution" },
  { href: "#platforms", label: "Product" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingJumpNav() {
  return (
    <nav
      className="sticky top-16 z-40 border-y border-white/10 bg-[#070707]/90 py-3 backdrop-blur-md"
      aria-label="On this page"
    >
      <div className="lp-shell">
        <div className="lp-jump">
          <span className="lp-jump__label">On this page</span>
          {JUMP.map((item) => (
            <a key={item.href} href={item.href} className="lp-jump__link">
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
