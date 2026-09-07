"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cardHover, easeOut } from "@/lib/motionPresets";
import { cn } from "@/lib/utils";

interface LandingMotionCardProps {
  children?: ReactNode;
  className?: string;
  index?: number;
  glow?: boolean;
  /** Skip reveal animation — use on app surfaces that must feel instant. */
  instant?: boolean;
}

/** Landing card — reveal on scroll, lift on hover, optional amber edge glow. */
export function LandingMotionCard({
  children,
  className,
  index = 0,
  glow = true,
  instant = false,
}: LandingMotionCardProps) {
  if (instant) {
    return (
      <div
        className={cn(
          "landing-motion-card surface-panel group relative overflow-hidden",
          glow && "landing-motion-card--glow",
          className
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        "landing-motion-card surface-panel group relative overflow-hidden",
        glow && "landing-motion-card--glow",
        className
      )}
      initial={{ opacity: 0, y: 22, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-48px" }}
      transition={{ delay: index * 0.07, duration: 0.52, ease: easeOut }}
      whileHover="hover"
      variants={cardHover}
    >
      <div className="landing-motion-card__shine pointer-events-none" aria-hidden />
      <div className="landing-motion-card__border pointer-events-none" aria-hidden />
      {children}
    </motion.div>
  );
}
