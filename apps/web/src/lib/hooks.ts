"use client";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

/* ---- useMediaQuery: one MediaQueryList per query string, shared by every subscriber ---- */
interface MqEntry {
  mq: MediaQueryList;
  listeners: Set<() => void>;
}
const MQ = new Map<string, MqEntry>();
function entryFor(query: string): MqEntry {
  let e = MQ.get(query);
  if (!e) {
    const mq = window.matchMedia(query);
    const listeners = new Set<() => void>();
    mq.addEventListener("change", () => {
      for (const l of listeners) l();
    });
    e = { mq, listeners };
    MQ.set(query, e);
  }
  return e;
}

/**
 * `window.matchMedia` as state. Returns `fallback` on the server and during hydration.
 * The 88 track rows and 22 cards of a set each ask for the same two queries, so one listener per query
 * serves them all instead of one `matchMedia` + listener per component.
 */
export function useMediaQuery(query: string, fallback = false) {
  return useSyncExternalStore(
    (cb) => {
      const e = entryFor(query);
      e.listeners.add(cb);
      return () => e.listeners.delete(cb);
    },
    () => entryFor(query).mq.matches,
    () => fallback,
  );
}

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Progressive collapse for a toolbar whose pieces must never overlap: the smallest level in `0..max` at which
 * `ref`'s content fits its box (`scrollWidth ≤ clientWidth`; every child must be `flex-shrink: 0` so overflow
 * goes one way). Starts over from 0 when the box resizes (ResizeObserver) or `key` changes, and climbs one level
 * per synchronous layout-effect render before paint, so no overflowing frame is shown. Re-measures only then:
 * a scroll frame never enters it.
 */
export function useFitLevel(ref: React.RefObject<HTMLElement | null>, max: number, key: unknown = null) {
  const [level, setLevel] = useState(0);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setSize(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  // `key` and `size` are the reset triggers, not values the effect reads
  useIso(() => setLevel(0), [key, size]);
  useIso(() => {
    const el = ref.current;
    if (!el || level >= max) return;
    if (el.scrollWidth > el.clientWidth + 1) setLevel(level + 1);
  });
  return level;
}

/** True while at least `threshold` of the element is on screen (used to gate looping Lottie playback). */
export function useInViewport<T extends Element>(ref: React.RefObject<T | null>, threshold = 0.4) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return inView;
}

/**
 * iOS 26 tab-bar minimise: true after scrolling down more than 24 px past 80 px, false on any upward scroll of 8 px.
 * Always false under reduced motion and when `enabled` is false.
 */
export function useScrollDirection(enabled = true) {
  const [minimised, setMinimised] = useState(false);
  useEffect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMinimised(false);
      return;
    }
    let last = window.scrollY;
    let anchor = last;
    let raf = 0;
    let min = false;
    /**
     * The last direction the user asked for (wheel, finger, keys). An upward scrollY change without an upward
     * gesture is layout, not intent: cards below the fold (`content-visibility: auto`) take their real height as
     * they come up and scroll anchoring pulls scrollY back, which must not bring the bars back mid-fling.
     */
    let intent: "up" | "down" | null = null;
    let touchY = 0;
    // state changes only on a flip, and the page height (a forced layout while cards are being revealed) is read
    // only when a flip to minimised is otherwise due: a scroll frame must not re-enter React or layout
    const flip = (v: boolean) => {
      if (min === v) return;
      min = v;
      setMinimised(v);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (y > last) {
          if (!min && y > 80 && y - anchor > 24) {
            const maxY = document.documentElement.scrollHeight - window.innerHeight;
            if (y < maxY - 4) flip(true);
          }
          if (y - anchor > 24) anchor = y;
        } else if ((last - y > 8 && intent === "up") || y < 40) {
          flip(false);
          anchor = y;
        }
        last = y;
      });
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY) intent = e.deltaY < 0 ? "up" : "down";
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? touchY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const cy = e.touches[0]?.clientY ?? touchY;
      if (Math.abs(cy - touchY) > 2) intent = cy > touchY ? "up" : "down";
      touchY = cy;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") intent = "up";
      else if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "End" || e.key === " ")
        intent = "down";
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);
  return minimised;
}

/** Runs `fn` when the main thread is idle (at the latest after `timeout` ms); returns a cancel function. */
export function whenIdle(fn: () => void, timeout = 120): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
}

/** The compose narrative/count-up tests can slow the composer down with `?slow=1` on localhost only. */
export function testSlowdownMs(): number {
  if (typeof window === "undefined") return 0;
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") return 0;
  return new URLSearchParams(window.location.search).get("slow") === "1" ? 1500 : 0;
}
