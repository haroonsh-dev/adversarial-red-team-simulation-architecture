"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  iconOnly?: boolean;
  wordmarkOnly?: boolean;
  className?: string;
  iconSize?: number;
}

/** ARTSA mark — hex node with adaptive lift vs flat baseline. */
export function LogoIcon({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        d="M18 3.2 L31.4 11 V25 L18 32.8 L4.6 25 V11 Z"
        fill="#070707"
        stroke="#67b3ef"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M10 23.2 H26"
        stroke="#565656"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M10 21.4 L14.2 20.2 L18.4 16.1 L22.6 12.8 L26 11.4"
        stroke="#67b3ef"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="11.4" r="1.55" fill="#67b3ef" />
    </svg>
  );
}

export function LogoWordmark({
  className,
  size = 26,
}: {
  className?: string;
  size?: number;
}) {
  const fontSize = Math.round(size * 0.74);

  return (
    <div className={cn("inline-flex items-center gap-2 select-none", className)}>
      <span
        style={{ fontSize: `${fontSize}px` }}
        className="font-semibold tracking-[-0.04em] text-foreground"
      >
        ARTSA
      </span>
      <span className="rounded-sm border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-sky-300">
        EDS
      </span>
    </div>
  );
}

export default function Logo({
  iconOnly = false,
  wordmarkOnly = false,
  className,
  iconSize = 26,
}: LogoProps) {
  if (iconOnly) {
    return <LogoIcon size={iconSize} className={className} />;
  }

  if (wordmarkOnly) {
    return <LogoWordmark size={iconSize} className={className} />;
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoIcon size={iconSize} />
      <LogoWordmark size={iconSize} />
    </div>
  );
}
