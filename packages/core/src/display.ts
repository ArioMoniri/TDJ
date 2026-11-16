import SINGERS from "../../../data/knowledge/singer_display.json";
import { normTitle } from "./energy";

/**
 * QA fix 2026-11 — names as people read them, wherever a name is printed (the data keeps the discography's spelling):
 * a duet "C. Dante - J. Martel" reads "Carlos Dante & Julio Martel", "Lita Morales - H. Lagos" reads "Lita Morales &
 * Horacio Lagos" (data/knowledge/singer_display.json, scripts/build_singer_display.ts), a stored normalised key
 * ("alberto podesta") reads "Alberto Podestá", a credit "J.ricardo-G.barbieri" reads "J. Ricardo & G. Barbieri".
 */
const DUETS = (SINGERS as { duets: Record<string, string> }).duets;
const KEYS = (SINGERS as { keys: Record<string, string> }).keys;

const titleCase = (s: string) =>
  s.replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase());

/** a singer (or a duet) as printed: "C. Dante - J. Martel" → "Carlos Dante & Julio Martel"; null stays null */
export function singerDisplay<T extends string | null | undefined>(raw: T): T | string {
  if (!raw) return raw;
  const hit = DUETS[raw];
  if (hit) return hit;
  // a duet the table does not hold: its voices joined the same way
  if (/\s+-\s+/.test(raw)) {
    const parts = raw.split(/\s+-\s+/).map((p) => p.trim());
    return parts.length > 2 ? `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}` : parts.join(" & ");
  }
  return raw;
}

/** a stored singer key ("alberto podesta", "lita morales h lagos") as printed ("Alberto Podestá", "Lita Morales & Horacio Lagos") */
export function singerOfKey(key: string): string {
  if (!key) return key;
  return KEYS[key] ?? KEYS[normTitle(key)] ?? titleCase(key);
}

/**
 * An orchestra or credit as printed: "J.ricardo-G.barbieri" → "J. Ricardo & G. Barbieri"; a name with no such
 * spelling stays as it is (the UI words "Orquesta (unspecified)" itself).
 */
export function creditDisplay(raw: string): string {
  if (!raw) return raw;
  const glued = /^\p{Lu}\.\s?\p{L}+(?:-\p{Lu}\.\s?\p{L}+)+$/u;
  if (glued.test(raw))
    return raw
      .split("-")
      .map((p) =>
        p.replace(/^(\p{Lu})\.\s?(\p{L})/u, (_m, i: string, c: string) => `${i}. ${c.toUpperCase()}`),
      )
      .join(" & ");
  return /\s+-\s+/.test(raw) ? (singerDisplay(raw) as string) : raw;
}
