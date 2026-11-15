"use client";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { t } from "@/lib/motion";

/**
 * Pages are siblings: one fade on arrival, never a directional slide, never two.
 *
 * Round 23: this used to be `AnimatePresence mode="wait"` keyed by the path. In the App Router `children` is the
 * layout router, which renders the *current* segment from context, so the leaving copy already showed the new page:
 * the new page faded out, then mounted again and faded in (the "jump" after every tab tap), and the scroll-to-top
 * ran only after the exit. Now the keyed wrapper only enters; Next resets the scroll on navigation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const r = useReducedMotion();
  // Opacity only: a transform on this wrapper would carry the page's fixed bars (the phone's primary bar) with it.
  // The first page of a visit appears without an entrance (as AnimatePresence initial={false} did).
  const navigated = useRef(false);
  useEffect(() => {
    navigated.current = true;
  }, []);
  return (
    <motion.div
      key={path}
      data-testid="page-transition"
      initial={navigated.current ? { opacity: 0 } : false}
      animate={{ opacity: 1, transition: r ? t.press : t.enter }}
    >
      {children}
    </motion.div>
  );
}
