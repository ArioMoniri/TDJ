"use client";
import { useEffect, useState } from "react";

/** `window.matchMedia` as state. Returns `fallback` on the server and before hydration. */
export function useMediaQuery(query: string, fallback = false) {
  const [on, setOn] = useState(fallback);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return on;
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
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        if (y > last) {
          if (y > 80 && y - anchor > 24 && y < maxY - 4) setMinimised(true);
          if (y - anchor > 24) anchor = y;
        } else if (last - y > 8 || y < 40) {
          setMinimised(false);
          anchor = y;
        }
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);
  return minimised;
}

/** The compose narrative/count-up tests can slow the composer down with `?slow=1` on localhost only. */
export function testSlowdownMs(): number {
  if (typeof window === "undefined") return 0;
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") return 0;
  return new URLSearchParams(window.location.search).get("slow") === "1" ? 1500 : 0;
}
