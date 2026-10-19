"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { dur, ease } from "@/lib/motion";

/**
 * Tabular count-up/down (375 ms). Used for the Tonight shift badge, the Database change count and the
 * Export sheet track count. Reduced motion: the number is set directly. Renders `value` on the server.
 */
export function CountUp({
  value,
  className = "",
  duration = dur.m,
  from,
}: {
  value: number;
  className?: string;
  duration?: number;
  /** Explicit start for the first animation (e.g. the previous score); defaults to the previous value. */
  from?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number>(from ?? value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || prev.current === value) {
      el.textContent = String(value);
      prev.current = value;
      return;
    }
    const ctrl = animate(prev.current, value, {
      duration,
      ease: ease.out,
      onUpdate: (v) => {
        el.textContent = String(Math.round(v));
      },
    });
    prev.current = value;
    return () => ctrl.stop();
  }, [value, reduced, duration]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value}
    </span>
  );
}
