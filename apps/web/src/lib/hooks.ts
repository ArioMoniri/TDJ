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

/** The compose narrative/count-up tests can slow the composer down with `?slow=1` on localhost only. */
export function testSlowdownMs(): number {
  if (typeof window === "undefined") return 0;
  const h = window.location.hostname;
  if (h !== "localhost" && h !== "127.0.0.1") return 0;
  return new URLSearchParams(window.location.search).get("slow") === "1" ? 1500 : 0;
}
