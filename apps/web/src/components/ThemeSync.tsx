"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

/**
 * Owns the <html> theme / reduce-transparency classes; the pre-hydration script in layout.tsx covers first paint.
 * A user change adds `.theming` for one --dur-s so colour tokens cross-fade (motion-system.md §3.5); first paint never animates.
 */
export function ThemeSync() {
  const theme = useStore((s) => s.settings.theme);
  const reduceGlass = useStore((s) => s.settings.reduceGlass);
  const hydrated = useRef(false);
  useEffect(() => {
    const el = document.documentElement;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (hydrated.current && !reduced) {
      el.classList.add("theming");
      timer = setTimeout(() => el.classList.remove("theming"), 250);
    }
    hydrated.current = true;
    if (theme === "auto") delete el.dataset.theme;
    else el.dataset.theme = theme;
    el.classList.toggle("dark", theme === "dark");
    el.classList.toggle("reduce-glass", reduceGlass);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [theme, reduceGlass]);
  return null;
}
