"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Owns the <html> theme / reduce-transparency classes; the pre-hydration script in layout.tsx covers first paint. */
export function ThemeSync() {
  const theme = useStore((s) => s.settings.theme);
  const reduceGlass = useStore((s) => s.settings.reduceGlass);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") delete el.dataset.theme;
    else el.dataset.theme = theme;
    el.classList.toggle("dark", theme === "dark");
    el.classList.toggle("reduce-glass", reduceGlass);
  }, [theme, reduceGlass]);
  return null;
}
