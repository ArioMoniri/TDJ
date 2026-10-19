"use client";
import type { LucideIcon } from "lucide-react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { SPRING } from "@/lib/motion";

export interface SwipeAction {
  kind: "lock" | "swap" | "destructive";
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

const W = 74;
/** only one row open at a time */
let openRow: (() => void) | null = null;

/**
 * UISwipeActionsConfiguration on touch devices: drag left to reveal coloured full-height actions;
 * a full swipe past 180 px fires the first action. On hover devices it renders the children only.
 */
export function SwipeRow({
  actions,
  children,
  className = "",
  leading,
}: {
  actions: SwipeAction[];
  children: ReactNode;
  className?: string;
  leading?: "art" | "num";
}) {
  const touch = useMediaQuery("(hover: none)");
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const [open, setOpen] = useState(false);
  const mine = useRef<() => void>(() => {});
  const max = W * actions.length;
  mine.current = () => {
    setOpen(false);
    controls.start({ x: 0, transition: reduced ? { duration: 0 } : SPRING.gentle });
  };
  useEffect(
    () => () => {
      if (openRow === mine.current) openRow = null;
    },
    [],
  );
  if (!touch || actions.length === 0)
    return (
      <div className={className} data-leading={leading}>
        {children}
      </div>
    );
  const snap = (to: number) => {
    controls.start({ x: to, transition: reduced ? { duration: 0 } : SPRING.gentle });
    const willOpen = to !== 0;
    setOpen(willOpen);
    if (willOpen) {
      if (openRow && openRow !== mine.current) openRow();
      openRow = mine.current;
      haptic(10);
    } else if (openRow === mine.current) openRow = null;
  };
  return (
    <div className={`swipe-row ${className}`} data-leading={leading} data-open={open || undefined}>
      <div className="swipe-actions" aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="swipe-action"
            data-kind={a.kind}
            disabled={a.disabled}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              snap(0);
              a.onClick();
            }}
          >
            <a.icon size={20} strokeWidth={2} aria-hidden />
            {a.label}
          </button>
        ))}
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -max, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        animate={controls}
        onDragEnd={(_, info) => {
          const x = info.offset.x + (open ? -max : 0);
          const first = actions[0];
          if (x < -180 && first && !first.disabled) {
            haptic(10);
            snap(0);
            first.onClick();
            return;
          }
          snap(x < -40 ? -max : 0);
        }}
        className="relative bg-[rgb(var(--bg-cell))]"
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
