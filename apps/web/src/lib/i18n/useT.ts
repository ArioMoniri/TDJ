"use client";
import { useSyncExternalStore } from "react";
import { getLocale, type Locale, onLocale, t } from "./index";

/** the current locale, re-rendering its component when it changes (the Settings language or Auto's system language) */
export function useLocale(): Locale {
  return useSyncExternalStore(onLocale, getLocale, () => "en");
}
/** the hook form of `t()`: the component re-renders in the new language on its own */
export function useT(): typeof t {
  useLocale();
  return t;
}
