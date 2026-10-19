"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { reduced, rise } from "@/lib/motion";

/** Pages are siblings: fade-and-settle, never a directional slide. Mode "wait" so two pages never overlap. */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const r = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo({ top: 0 })}>
      <motion.div key={path} variants={r ? reduced.rise : rise} initial="hidden" animate="show" exit="exit" custom={0}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
