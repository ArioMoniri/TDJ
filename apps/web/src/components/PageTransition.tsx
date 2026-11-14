"use client";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@/lib/motion";

/**
 * Pages are siblings: one fade-and-settle on arrival, never a directional slide, never two.
 *
 * Round 23: this used to be `AnimatePresence mode="wait"` keyed by the path. In the App Router `children` is the
 * layout router, which renders the *current* segment from context, so the leaving copy already showed the new page:
 * the new page faded out, then mounted again and faded in (the "jump" after every tab tap), and the scroll-to-top
 * ran only after the exit. Now the keyed wrapper only enters; Next resets the scroll on navigation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const r = useReducedMotion();
  return (
    <motion.div
      key={path}
      data-testid="page-transition"
      initial={r ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: r ? t.press : t.enter }}
    >
      {children}
    </motion.div>
  );
}
