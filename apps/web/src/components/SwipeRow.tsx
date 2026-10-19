"use client";
import type { LucideIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { I, type IconName } from "./Icons";

export interface SwipeAction {
  kind: "lock" | "swap" | "destructive";
  label: string;
  /** a Lucide component, or a sprite glyph name for the rows a set repeats 100+ times */
  icon: LucideIcon | IconName;
  onClick: () => void;
  disabled?: boolean;
}

const W = 74;
/** pointer travel before the gesture commits to an axis */
const SLOP = 6;
/** resistance past the open/closed ends */
const ELASTIC = 0.08;
/** a full swipe past this fires the first action */
const FULL_SWIPE = 180;
/** only one row open at a time */
let openRow: (() => void) | null = null;

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  /** the panel's translate when the finger landed */
  from: number;
  axis: "x" | "y" | null;
}

/**
 * UISwipeActionsConfiguration on touch devices: drag left to reveal coloured full-height actions;
 * a full swipe past 180 px fires the first action. On hover devices it renders the children only.
 *
 * Plain pointer events, no motion `drag`: a set mounts 110 of these on a phone, and every motion drag element
 * measures its layout and the page scroll when it mounts, which was most of the compose-time long task.
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
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const x = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const mine = useRef<() => void>(() => {});
  const max = W * actions.length;

  const moveTo = (to: number, animated: boolean) => {
    const el = panel.current;
    x.current = to;
    if (!el) return;
    el.style.transition = animated && !reduced ? "transform var(--dur-m) var(--ease-settle)" : "none";
    el.style.transform = to ? `translateX(${to}px)` : "";
  };
  mine.current = () => {
    setOpen(false);
    moveTo(0, true);
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
    moveTo(to, true);
    const willOpen = to !== 0;
    setOpen(willOpen);
    if (willOpen) {
      if (openRow && openRow !== mine.current) openRow();
      openRow = mine.current;
      haptic(10);
    } else if (openRow === mine.current) openRow = null;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: x.current, axis: null };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.axis === "y") {
        // a vertical pan: the page scrolls, the row stays
        gesture.current = null;
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    let next = g.from + dx;
    if (next > 0) next *= ELASTIC;
    else if (next < -max) next = -max + (next + max) * ELASTIC;
    moveTo(next, false);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.axis !== "x") return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const travelled = g.from + (e.clientX - g.x0);
    const first = actions[0];
    if (travelled < -FULL_SWIPE && first && !first.disabled) {
      haptic(10);
      snap(0);
      first.onClick();
      return;
    }
    snap(travelled < -40 ? -max : 0);
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
            {typeof a.icon === "string" ? (
              <I name={a.icon} size={20} strokeWidth={2} />
            ) : (
              <a.icon size={20} strokeWidth={2} aria-hidden />
            )}
            {a.label}
          </button>
        ))}
      </div>
      <div
        ref={panel}
        className="relative bg-[rgb(var(--bg-cell))]"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {children}
      </div>
    </div>
  );
}
