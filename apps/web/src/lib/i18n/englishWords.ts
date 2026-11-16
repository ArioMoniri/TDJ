/**
 * 2026-11 (QA: English words on Turkish screens) — English UI words a Turkish screen must never show, whole words
 * and case as written. Proper names (orchestras, singers, titles) and the kept terms (BPM, DJ, Spotify, tanda…) are
 * not in it. Read by the dictionary vitest (i18n.test.ts), the engine-words vitest (engineText.test.ts) and the
 * rendered-screens e2e (e2e/tr-text.spec.ts).
 */
export const ENGLISH_UI_WORDS_LIST = [
  "Instrumental",
  "instrumental",
  "Choose",
  "steady",
  "lively",
  "single",
  "Follows",
  "follows",
  "energy",
  "Fine",
  "Mixed",
  "Audible",
  "audible",
  "Headline",
  "headline",
  "seamless",
  "jarring",
  "loudness",
  "brightness",
  "Booth",
  "Library",
  "minor",
  "major",
  "Up next",
  "Next tanda",
  "not played",
  "you often",
  "stays in",
] as const;

export const ENGLISH_UI_WORDS = new RegExp(
  `(?<![\\p{L}'’])(${ENGLISH_UI_WORDS_LIST.join("|")})(?![\\p{L}])`,
  "u",
);
