"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { t } from "@/lib/motion";
import { useSaving } from "@/lib/power";

/** App-wide defaults: settle tween, reduced motion follows the OS (and Battery saver: no transform animations). */
export function Motion({ children }: { children: ReactNode }) {
  const saving = useSaving();
  return (
    <MotionConfig transition={t.fade} reducedMotion={saving ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}
