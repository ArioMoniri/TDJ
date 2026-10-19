"use client";
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { ease } from "@/lib/motion";

/**
 * The headline score: counts from `from` (0 on a fresh set, the previous total on a recompose) to `value`
 * over 800 ms after a 120 ms beat. The count is aria-hidden next to a visually hidden static label so screen
 * readers never hear intermediate values. Reduced motion renders the final value. Remount (key) for a fresh set.
 */
export function ScoreCounter({ value, from = 0 }: { value: number; from?: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const start = useRef(from);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = String(value);
      start.current = value;
      return;
    }
    const c = animate(start.current, value, {
      duration: 0.8,
      delay: 0.12,
      ease: ease.out,
      onUpdate: (v) => {
        el.textContent = String(Math.round(v));
      },
    });
    start.current = value;
    return () => c.stop();
  }, [value, reduced]);
  return (
    <span className="tabular-nums" data-testid="score">
      <span className="sr-only">{value} of 100</span>
      <span ref={ref} aria-hidden>
        {value}
      </span>
    </span>
  );
}
