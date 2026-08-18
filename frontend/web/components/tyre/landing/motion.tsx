"use client";

/**
 * Shared scroll/animation primitives for the landing experience.
 * Built on framer-motion so every section shares the same easing + feel:
 *   - <Reveal>      fade + slide-up when scrolled into view
 *   - <Stagger>/<StaggerItem>  staggered children
 *   - <Marquee>     infinite horizontal ticker (CSS-driven, pauses on hover)
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: reduce ? 0.3 : 0.7, ease: EASE, delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

export function Stagger({
  children,
  className,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-80px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/**
 * Infinite marquee. Renders the children twice and translates -50% so the loop is
 * seamless. `reverse` flips direction; pauses on hover via the CSS utility.
 */
export function Marquee({
  children,
  reverse = false,
  slow = false,
  className,
}: {
  children: ReactNode;
  reverse?: boolean;
  slow?: boolean;
  className?: string;
}) {
  return (
    <div className={`group relative flex overflow-hidden ${className ?? ""}`}>
      <div
        className={`flex shrink-0 items-center ${slow ? "tyre-marquee-slow" : "tyre-marquee"}`}
        style={reverse ? { animationDirection: "reverse" } : undefined}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
