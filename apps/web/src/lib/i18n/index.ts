/**
 * Wave 3 — the app's words in the DJ's language. English is the source text and the default; Turkish is the first
 * translation (docs/i18n-glossary.md). No library: flat keys (`en.ts`, `tr.ts`), `{placeholders}`, plurals through
 * Intl.PluralRules and dates, times and numbers through Intl in the chosen locale.
 *
 * The locale lives in one module variable that the LocaleRoot (components/LocaleRoot.tsx) sets from the Settings
 * choice (`settings.language`: Auto follows the browser or the system); a change re-renders the whole tree, so a
 * plain `t()` call works in components, in handlers and in the lib modules alike. `useT()` (./useT.ts) is the hook
 * form. No React here: server routes import the dictionaries too.
 */
import { en, type MsgKey } from "./en";
import { tr } from "./tr";

export type { MsgKey } from "./en";
export type Locale = "en" | "tr";
/** the Settings choice: Auto follows the browser (or the system, in the apps) */
export type LangSetting = "auto" | Locale;
export const LOCALES: readonly Locale[] = ["en", "tr"];
/** the names in the language switch, each in its own language */
export const LOCALE_NAME: Record<Locale, string> = { en: "English", tr: "Türkçe" };

const DICTS: Record<Locale, Partial<Record<MsgKey, string>>> = { en, tr };
/** the BCP 47 tag Intl formats with; English keeps the browser's own region (as before) */
const INTL: Record<Locale, string | undefined> = { en: undefined, tr: "tr-TR" };

let current: Locale = "en";
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;
export function setLocale(l: Locale) {
  if (l === current) return;
  current = l;
  for (const f of listeners) f();
}
export function onLocale(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Auto: the first browser / system language T-DJ speaks, else English */
export function resolveLocale(setting: LangSetting | undefined | null, languages: readonly string[]): Locale {
  if (setting === "en" || setting === "tr") return setting;
  for (const tag of languages) {
    const base = tag.toLowerCase().split(/[-_]/)[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return "en";
}

/** the browser's (or the app's web view's, which is the system's) languages */
export function systemLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  return [...(navigator.languages ?? []), navigator.language].filter(Boolean);
}

const warned = new Set<string>();
function lookup(key: string): string {
  const v = DICTS[current][key as MsgKey];
  if (v !== undefined) return v;
  const e = en[key as MsgKey];
  if (current !== "en" && process.env.NODE_ENV !== "production" && !warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] no ${current} text for "${key}"`);
  }
  return e ?? key;
}

function fill(s: string, vars?: Record<string, unknown>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m));
}

/** the text of `key` in the current locale, with its {placeholders} filled */
export function t(key: MsgKey, vars?: Record<string, unknown>): string {
  return fill(lookup(key), vars);
}

/** the text of `key` in a given locale, whatever the app's current one (a cover drawn in the language asked for) */
export function tIn(locale: Locale, key: MsgKey, vars?: Record<string, unknown>): string {
  return fill(DICTS[locale]?.[key] ?? en[key] ?? key, vars);
}

let reverse: Map<string, MsgKey> | null = null;
/**
 * Words that arrive in English from data (the research model's labels, the core's notes): the dictionary's text for
 * that English, else the words as they came.
 */
export function tSource(english: string, vars?: Record<string, unknown>): string {
  if (current === "en") return fill(english, vars);
  if (!reverse) {
    reverse = new Map();
    for (const [k, v] of Object.entries(en)) if (!reverse.has(v)) reverse.set(v, k as MsgKey);
  }
  const k = reverse.get(english);
  return k ? t(k, vars) : fill(english, vars);
}

/** plural forms live under `<base>.one` / `<base>.other` (Intl.PluralRules categories); {count} is the number */
export type PluralBase = MsgKey extends infer K ? (K extends `${infer B}.other` ? B : never) : never;
export function plural(base: PluralBase, count: number, vars?: Record<string, unknown>): string {
  const cat = new Intl.PluralRules(INTL[current] ?? "en").select(count);
  const key = `${base}.${cat}`;
  const has = DICTS[current][key as MsgKey] !== undefined || en[key as MsgKey] !== undefined;
  return t((has ? key : `${base}.other`) as MsgKey, { count: fmtNumber(count), ...vars });
}

/** the Intl tag for the current locale (undefined: the browser's own, for English) */
export const intlTag = () => INTL[current];

export const fmtNumber = (n: number, o?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(INTL[current] ?? (current === "en" ? "en-US" : undefined), o).format(n);
export const fmtDate = (d: Date | string | number, o?: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleDateString(INTL[current], o);
export const fmtTime = (d: Date | string | number, o?: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleTimeString(INTL[current], o);
/** "A, B and C" / "A, B ve C" */
export const fmtList = (xs: string[], type: "conjunction" | "disjunction" = "conjunction") =>
  xs.length <= 1
    ? (xs[0] ?? "")
    : new Intl.ListFormat(INTL[current] ?? "en-GB", { style: "long", type }).format(xs);

/** uppercase for labels in the locale's rules ("milonga" → "MİLONGA" in Turkish) */
export const upper = (s: string) => s.toLocaleUpperCase(current === "tr" ? "tr" : "en");
export const lower = (s: string) => s.toLocaleLowerCase(current === "tr" ? "tr" : "en");
/** the first letter in capitals, the locale's way */
export const capFirst = (s: string) => (s ? upper(s[0]!) + s.slice(1) : s);

/**
 * A module-level list or table of words (a picker's choices, a tab list): built in the current locale on first read
 * and kept per locale, so a module constant never freezes the language it was loaded in.
 */
export function lazy<T extends object>(make: () => T): T {
  const cache = new Map<Locale, T>();
  const real = (): T => {
    let v = cache.get(current);
    if (!v) {
      v = make();
      cache.set(current, v);
    }
    return v;
  };
  const target = (Array.isArray(real()) ? [] : {}) as T;
  return new Proxy(target, {
    get(_, k) {
      const v = real();
      const r = Reflect.get(v, k);
      return typeof r === "function" && k !== "constructor" ? r.bind(v) : r;
    },
    has: (_, k) => Reflect.has(real(), k),
    ownKeys: () => Reflect.ownKeys(real()),
    getOwnPropertyDescriptor(_, k) {
      const d = Reflect.getOwnPropertyDescriptor(real(), k);
      if (d && k !== "length") d.configurable = true;
      return d;
    },
    set: () => false,
  });
}
