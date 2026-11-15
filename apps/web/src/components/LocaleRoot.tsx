"use client";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { type Locale, type MsgKey, resolveLocale, setLocale, systemLanguages, t } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** the page part of the tab title per route (the route layouts' English metadata titles) */
const TITLE: Record<string, MsgKey> = {
  "/": "navItems.compose",
  "/booth": "navItems.booth",
  "/build": "navItems.build_by_hand",
  "/library": "navItems.library",
  "/database": "navItems.database",
  "/history": "navItems.history",
  "/rooms": "roomsNav.rooms",
  "/guide": "navItems.guide",
  "/settings": "navItems.settings",
  "/night": "night.open_a_night",
};

/**
 * Wave 3 — the app's language. The server and the first client render speak English (so hydration matches); before
 * the first paint after hydration the Settings choice (Auto: the browser's or the system's languages) is applied and
 * the tree renders again in it: every `t()` reads the new locale. The pre-paint script in layout.tsx hides the page
 * (`html.i18n-pending`) until then when the night will be in Turkish, so English never flashes.
 */
export function LocaleRoot({ children }: { children: ReactNode }) {
  const setting = useStore((s) => s.settings.language);
  const [loc, setLoc] = useState<Locale>("en");
  useIso(() => {
    const next = resolveLocale(setting, systemLanguages());
    setLocale(next);
    setLoc(next);
    const el = document.documentElement;
    el.lang = next;
    el.classList.remove("i18n-pending");
  }, [setting]);
  // Auto: a system language change (the apps' web view, a browser setting) follows without a reload
  useEffect(() => {
    if (setting && setting !== "auto") return;
    const on = () => {
      const next = resolveLocale(setting, systemLanguages());
      setLocale(next);
      setLoc(next);
      document.documentElement.lang = next;
    };
    window.addEventListener("languagechange", on);
    return () => window.removeEventListener("languagechange", on);
  }, [setting]);
  const path = usePathname();
  useEffect(() => {
    if (loc === "en") return;
    const key = TITLE[`/${(path ?? "/").split("/")[1] ?? ""}`];
    if (!key) return;
    const want = `${t(key)} · T-DJ`;
    const apply = () => {
      if (document.title !== want) document.title = want;
    };
    apply();
    // Next writes the route's (English) metadata title after a client navigation
    const head = document.querySelector("head");
    const mo = new MutationObserver(apply);
    if (head) mo.observe(head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [loc, path]);
  return <Fragment key={loc}>{children}</Fragment>;
}
