import { creditAllGuitars, creditPeople, isCreditName, singerDisplay } from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * 2026-11 (the owner: "covers for the solo-singer-with-guitars sides"): the catalogue files a singer's own sides with
 * guitars under "Guitarras (solo singer)" — a label, not an orchestra. Wherever a side or tanda names its orchestra it
 * reads "Héctor Mauré with guitars" instead (display only: the data, the searches and the match rules keep the label;
 * lib/findMatch.ts isPseudoOrchestra reads it the same way). Every other orchestra reads as it is.
 */
const GUITARS = /^guitarras?\s*\(solo singer\)$/i;
export const isGuitarsLabel = (s: { orchestra?: string | null; orchestraId?: string | null }) =>
  s.orchestraId === "guitarras-solo-singer" || GUITARS.test((s.orchestra ?? "").trim());

export function orchestraName(s: {
  orchestra: string;
  orchestraId?: string | null;
  singer?: string | null;
}): string {
  if (!isGuitarsLabel(s)) return creditName(s.orchestra);
  const who = s.singer ? (singerDisplay(s.singer) as string) : "";
  return who ? t("orchestra.with_guitars", { singer: who }) : t("orchestra.singer_with_guitars");
}

/**
 * 2026-11 (the owner: "J.ricardo-G.barbieri-J.m.aguilar / Carlos Gardel" on the Library's rows) — the catalogue files
 * some sides under their accompanists' raw credit: initials glued to a lower-case surname, joined by hyphens. They
 * read as names, display only (the data, the search and the match rules keep the credit; a search for "barbieri"
 * still finds and marks them — `creditSpans` carries the marks over):
 *   "J.ricardo-G.barbieri-J.m.aguilar" → "José Ricardo, Guillermo Barbieri, José María Aguilar (guitars)"
 *   "A.troilo-R.grela" → "Aníbal Troilo, Roberto Grela"; "E.baffa-O.berlinghieri" → "E. Baffa, O. Berlinghieri".
 * Known musicians get their full names; "(guitars)" follows only when every one of them is a known guitarist (the
 * table and the reading live in core display.ts, which the search also indexes: "Guillermo Barbieri" finds the side).
 * Any other name (an orchestra, "Francini-Pontier") reads as it is.
 */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export const isCredit = (name: string | null | undefined): boolean => isCreditName(name);

/** the credit as names (display only); any other name unchanged */
export function creditName(name: string): string {
  const names = creditPeople(name);
  if (!names.length) return name;
  return creditAllGuitars(name)
    ? t("orchestra.guitars_credit", { names: names.join(", ") })
    : names.join(", ");
}

/**
 * What a search box says for an orchestra (QA 2026-11: a tap on "José Ricardo, Guillermo Barbieri (guitars)" in the
 * Library's list filled the field with "J.ricardo-G.barbieri"): a credit's people by name, which find the same sides;
 * any other name as it is.
 */
export function orchestraQuery(name: string): string {
  const names = creditPeople(name);
  return names.length ? names.join(" ") : name;
}

/**
 * The search's marks on the raw credit, carried over to the name `creditName` shows: each marked piece ("barbi")
 * is found again, accents and case aside, in the shown text ("Guillermo Barbieri"). A piece not found is dropped.
 */
export function creditSpans(
  raw: string,
  shown: string,
  spans: ReadonlyArray<[number, number]> | undefined,
): Array<[number, number]> | undefined {
  if (!spans?.length || raw === shown) return spans as Array<[number, number]> | undefined;
  // per character, so offsets in the folded text are offsets in the shown one
  const folded = [...shown].map((c) => fold(c) || c).join("");
  if (folded.length !== shown.length) return undefined;
  const out: Array<[number, number]> = [];
  let from = 0;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    // a marked credit token ("G.barbieri") is marked by its surname: the initials became a full first name
    const parts = fold(raw.slice(a, b))
      .split(/[.\-\s]+/)
      .filter(Boolean);
    const words = parts.some((w) => w.length > 1) ? parts.filter((w) => w.length > 1) : parts;
    for (const w of words) {
      let at = folded.indexOf(w, from);
      if (at < 0) at = folded.indexOf(w);
      if (at < 0) continue;
      out.push([at, at + w.length]);
      from = at + w.length;
    }
  }
  return out;
}
