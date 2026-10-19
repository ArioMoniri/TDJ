"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { t } from "@/lib/motion";

/** App-wide defaults: settle tween, reduced motion follows the OS. */
export function Motion({ children }: { children: ReactNode }) {
  return (
    <MotionConfig transition={t.fade} reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
