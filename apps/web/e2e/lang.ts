/**
 * Wave 3 — the e2e suite in either language. `TDJ_LOCALE=tr` runs a spec with a Turkish browser (playwright.config
 * sets `locale: "tr-TR"`, and the app's Auto language follows it); `W("English text")` is that text on screen in the
 * run's language, looked up through the dictionaries, so one spec reads the same in English and Turkish.
 */
import { en } from "../src/lib/i18n/en";
import { tr } from "../src/lib/i18n/tr";

export const LOCALE: "en" | "tr" = process.env.TDJ_LOCALE === "tr" ? "tr" : "en";

const byEnglish = new Map<string, string>();
for (const [k, v] of Object.entries(en)) if (!byEnglish.has(v)) byEnglish.set(v, k);

/** the screen text for an English source text (unchanged in an English run, or when it has no key) */
export function W(english: string, locale: "en" | "tr" = LOCALE): string {
  if (locale === "en") return english;
  const k = byEnglish.get(english) as keyof typeof tr | undefined;
  return (k && tr[k]) || english;
}
/** the same as a RegExp (escaped), for `name: /…/` matchers */
export function WR(english: string, flags = ""): RegExp {
  return new RegExp(W(english).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
}

/**
 * The English UI sentences a Turkish screen must not show: every dictionary value longer than three words whose
 * Turkish differs (placeholders split a value into its literal runs; each run of four words or more counts).
 */
export function englishSentences(): string[] {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(en)) {
    if (tr[k as keyof typeof tr] === v) continue;
    for (const run of v.split(/\{\w+\}/)) {
      const s = run.trim().replace(/^[·,.;:–—\s]+|[·,.;:–—\s]+$/g, "");
      if (s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length > 3) out.add(s);
    }
  }
  return [...out];
}
