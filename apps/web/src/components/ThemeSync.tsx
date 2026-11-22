"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { htmlTheme } from "@/lib/boothTheme";
import { useStore } from "@/lib/store";

/**
 * Owns the <html> theme / reduce-transparency classes; the pre-hydration script in layout.tsx covers first paint.
 * A user change adds `.theming` for one --dur-s so colour tokens cross-fade (motion-system.md §3.5); first paint never animates.
 *
 * 2026-11 (the owner: "the Booth tab is always in dark mode"): the Booth follows the app's appearance like every page.
 * There Auto is resolved to light or dark (the Booth's contrast rules are written per theme, booth.css), and
 * "Always dark in the Booth" (Settings → Booth, off unless the DJ turns it on) keeps it dark.
 */
export function ThemeSync() {
  const theme = useStore((s) => s.settings.theme);
  const reduceGlass = useStore((s) => s.settings.reduceGlass);
  const boothDark = useStore((s) => s.settings.boothDark === true);
  const booth = usePathname()?.startsWith("/booth") ?? false;
  const [systemDark, setSystemDark] = useState(false);
  const hydrated = useRef(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (hydrated.current && !reduced) {
      el.classList.add("theming");
      timer = setTimeout(() => el.classList.remove("theming"), 250);
    }
    hydrated.current = true;
    const want = htmlTheme(theme, { booth, boothDark, systemDark });
    if (want === "auto") delete el.dataset.theme;
    else el.dataset.theme = want;
    el.classList.toggle("dark", want === "dark");
    el.classList.toggle("reduce-glass", reduceGlass);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [theme, reduceGlass, booth, boothDark, systemDark]);
  return null;
}
