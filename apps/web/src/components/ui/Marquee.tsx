"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** px per second of the scroll (Apple Music's now-playing title moves about this slowly) */
const SPEED = 28;
/** the pause at each end, ms */
const HOLD = 2000;

/**
 * 2026-11 (the owner: "name won't slide to show all"): one line of text that, when it does not fit, slides once to
 * its end and back — a 2 s pause, the scroll, a 2 s pause, back, again — like Apple Music's now-playing title. Text
 * that fits stays still. With Reduce Motion it never moves: it ends in an ellipsis, and the whole text is the
 * element's hover tag (`title`) and stays in the accessibility tree as it is. `data-overflow` says which (the e2e).
 */
export function Marquee({
  children,
  text,
  className = "",
  testId,
}: {
  children: ReactNode;
  /** the whole text, for the hover tag */
  text: string;
  className?: string;
  testId?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  // how far the text runs past the box, measured again on any resize of either
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const measure = () => setOver(Math.max(0, Math.ceil(i.scrollWidth - b.clientWidth)));
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(b);
    ro?.observe(i);
    return () => ro?.disconnect();
  }, [text]);
  const moving = over > 2 && !reduced;
  useEffect(() => {
    const i = inner.current;
    if (!i || !moving || typeof i.animate !== "function") return;
    const scroll = (over / SPEED) * 1000;
    const total = HOLD + scroll + HOLD + scroll;
    const a = i.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: HOLD / total },
        { transform: `translateX(${-over}px)`, offset: (HOLD + scroll) / total },
        { transform: `translateX(${-over}px)`, offset: (HOLD + scroll + HOLD) / total },
        { transform: "translateX(0)", offset: 1 },
      ],
      { duration: total, iterations: Number.POSITIVE_INFINITY, easing: "linear" },
    );
    return () => a.cancel();
  }, [moving, over]);
  return (
    <span
      ref={box}
      className={`marquee ${className}`}
      title={over > 2 ? text : undefined}
      data-overflow={over > 2 ? "1" : "0"}
      data-moving={moving ? "1" : "0"}
      data-testid={testId}
    >
      <span ref={inner} className="marquee-inner">
        {children}
      </span>
    </span>
  );
}
