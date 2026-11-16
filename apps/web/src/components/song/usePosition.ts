"use client";
import { useEffect, useRef, useState } from "react";
import type { PositionFn } from "./MarksGroup";

/**
 * The side's second while it plays, read from the Booth's own clock on every animation frame (no timer of its own,
 * so it never drifts: a seek or a pause shows at once). `onFrame` runs every frame (the lane moves there); the
 * returned state changes only every `stepSec` (the lyrics' line, the clock text).
 */
export function usePosition(
  position: PositionFn | undefined,
  o: { onFrame?: (p: { sec: number; playing: boolean } | null) => void; stepSec?: number } = {},
) {
  const [p, setP] = useState<{ sec: number; playing: boolean } | null>(null);
  const frame = useRef(o.onFrame);
  frame.current = o.onFrame;
  const step = o.stepSec ?? 0.1;
  useEffect(() => {
    if (!position) {
      setP(null);
      frame.current?.(null);
      return;
    }
    let raf = 0;
    let last: { sec: number; playing: boolean } | null = null;
    const tick = () => {
      const now = position();
      frame.current?.(now);
      if (
        (now === null) !== (last === null) ||
        (now && last && (Math.abs(now.sec - last.sec) >= step || now.playing !== last.playing))
      ) {
        last = now;
        setP(now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [position, step]);
  return p;
}
