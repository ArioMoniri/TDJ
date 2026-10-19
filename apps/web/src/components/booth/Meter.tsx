"use client";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useBooth } from "@/lib/booth/store";

/**
 * Level meter (round7-booth.md §4): a horizontal bar −60…0 dBFS with marks at −18 (room target region), −6 and −1
 * (the peak cap), a peak-hold tick, red above −1 dBFS. Drawn on a canvas sized to the card; informative only, it
 * never drives gain. Reduced motion: 10 fps, no easing.
 */
const MIN = -60;
const pos = (db: number, w: number) => ((Math.max(MIN, Math.min(0, db)) - MIN) / -MIN) * w;

export function Meter({ className = "" }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    let shown = -100;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < (reduced ? 100 : 33)) return;
      last = now;
      const { rms, peak } = useBooth.getState().meter;
      shown = reduced ? rms : shown + (rms - shown) * 0.5;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      const g = el.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cs = getComputedStyle(el);
      const track = cs.getPropertyValue("--fill-4") || "rgba(255,255,255,.08)";
      const ok = cs.getPropertyValue("--system-green") || "#34c759";
      const warn = cs.getPropertyValue("--system-gold") || "#e8b85a";
      const red = cs.getPropertyValue("--destructive") || "#ff6b6b";
      const label = cs.getPropertyValue("--label-3") || "rgba(255,255,255,.3)";
      g.fillStyle = track;
      g.fillRect(0, 0, w, h);
      const x = pos(shown, w);
      g.fillStyle = ok;
      g.fillRect(0, 0, Math.min(x, pos(-6, w)), h);
      if (x > pos(-6, w)) {
        g.fillStyle = warn;
        g.fillRect(pos(-6, w), 0, Math.min(x, pos(-1, w)) - pos(-6, w), h);
      }
      if (x > pos(-1, w)) {
        g.fillStyle = red;
        g.fillRect(pos(-1, w), 0, x - pos(-1, w), h);
      }
      g.fillStyle = label;
      for (const m of [-18, -6, -1]) g.fillRect(Math.round(pos(m, w)) - 0.5, 0, 1, h);
      if (peak > MIN) {
        g.fillStyle = peak > -1 ? red : "currentColor";
        g.fillRect(Math.round(pos(peak, w)) - 1, 0, 2, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return (
    <canvas
      ref={canvas}
      className={`block h-2 w-full rounded-full text-[var(--label)] ${className}`}
      role="img"
      aria-label="Output level"
      data-testid="booth-meter"
    />
  );
}
