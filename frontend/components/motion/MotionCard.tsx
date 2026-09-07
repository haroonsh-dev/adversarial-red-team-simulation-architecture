"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cardHover, easeOut } from "@/lib/motionPresets";
import { cn } from "@/lib/utils";

interface MotionCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children?: ReactNode;
  /** Hover lift — off by default (app chrome stays still; landing uses LandingMotionCard). */
  hover?: boolean;
  /** Enter fade — off by default for denser, calmer product UI. */
  reveal?: boolean;
}

/**
 * App card wrapper. Defaults to a static surface (no hover/enter motion).
 * Landing marketing cards use `LandingMotionCard` instead.
 */
export function MotionCard({
  children,
  className,
  hover = false,
  reveal = false,
  ...props
}: MotionCardProps) {
  const animated = hover || reveal;

  if (!animated) {
    const {
      initial: _i,
      animate: _a,
      exit: _e,
      variants: _v,
      whileHover: _h,
      transition: _t,
      ...divProps
    } = props;
    return (
      <div className={cn(className)} {...(divProps as HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial={reveal ? { opacity: 0, y: 8 } : false}
      animate={reveal ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.38, ease: easeOut }}
      whileHover={hover ? "hover" : undefined}
      variants={hover ? cardHover : undefined}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
