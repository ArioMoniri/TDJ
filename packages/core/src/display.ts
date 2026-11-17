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

/**
 * 2026-11 (the owner: "J.ricardo-G.barbieri-J.m.aguilar" in the Library) — the musicians behind a raw accompanists'
 * credit: initials glued to a lower-case surname, joined by hyphens. Known musicians get their full names (`guitar`:
 * a guitarist, so the web reads the credit "… (guitars)"); any other part reads as letters ("E.baffa" → "E. Baffa").
 * The search indexes these names as the side's aliases (buildSongIndex), so "Guillermo Barbieri" finds the side.
 */
export const CREDIT_MUSICIANS: Readonly<Record<string, { name: string; guitar?: true }>> = {
  // Carlos Gardel's guitarists
  "j.ricardo": { name: "José Ricardo", guitar: true },
  "g.barbieri": { name: "Guillermo Barbieri", guitar: true },
  "j.m.aguilar": { name: "José María Aguilar", guitar: true },
  riverol: { name: "Domingo Riverol", guitar: true },
  pettorossi: { name: "Horacio Pettorossi", guitar: true },
  vivas: { name: "Julio Vivas", guitar: true },
  // duos and their partners
  "r.grela": { name: "Roberto Grela", guitar: true },
  "u.de lio": { name: "Ubaldo De Lío", guitar: true },
  "a.troilo": { name: "Aníbal Troilo" },
  "a.piazzolla": { name: "Astor Piazzolla" },
  "h.salgan": { name: "Horacio Salgán" },
  "e.m.francini": { name: "Enrique Mario Francini" },
  "h.stamponi": { name: "Héctor Stamponi" },
  "p.maffia": { name: "Pedro Maffia" },
  "p.laurenz": { name: "Pedro Láurenz" },
  "l.federico": { name: "Leopoldo Federico" },
  "o.fresedo": { name: "Osvaldo Fresedo" },
  "r.tanturi": { name: "Ricardo Tanturi" },
};
/** a credit: two or more hyphen-joined names, one of them at least "X.surname" (an initial glued to it) */
const GLUED = /(^|[\s.])\p{Lu}\.\p{Ll}/u;
const foldName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const capWord = (w: string) => (w ? w[0]!.toLocaleUpperCase("es") + w.slice(1) : w);

export function isCreditName(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  return s.includes("-") && GLUED.test(s) && s.split("-").every((p) => p.trim().length > 0);
}

/** one credited name in letters: "J.m.aguilar" → "J. M. Aguilar", "L.uribe Bueno" → "L. Uribe Bueno" */
export function creditPartName(raw: string): string {
  return raw
    .trim()
    .replace(/\.(?=\S)/g, ". ")
    .split(/\s+/)
    .map((w) => (/^\p{Ll}/u.test(w) && !/^(de|del|di|la|y)$/.test(w) ? capWord(w) : w))
    .join(" ");
}

/** the people of a raw credit, each by name ([] for any name that is not such a credit) */
export function creditPeople(raw: string | null | undefined): string[] {
  if (!raw || !isCreditName(raw)) return [];
  return raw.split("-").map((p) => CREDIT_MUSICIANS[foldName(p)]?.name ?? creditPartName(p));
}

/** every musician of the credit is a known guitarist */
export const creditAllGuitars = (raw: string): boolean =>
  isCreditName(raw) && raw.split("-").every((p) => !!CREDIT_MUSICIANS[foldName(p)]?.guitar);
