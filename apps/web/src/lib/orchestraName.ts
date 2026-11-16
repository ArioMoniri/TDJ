import { singerDisplay } from "@tdj/core";
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
 * Known musicians get their full names; "(guitars)" follows only when every one of them is a known guitarist.
 * Any other name (an orchestra, "Francini-Pontier") reads as it is.
 */
const MUSICIANS: Record<string, { name: string; guitar?: true }> = {
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
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const cap = (w: string) => (w ? w[0]!.toLocaleUpperCase("es") + w.slice(1) : w);
/** one credited name in letters: "J.m.aguilar" → "J. M. Aguilar", "L.uribe Bueno" → "L. Uribe Bueno" */
function oneName(raw: string): string {
  return raw
    .trim()
    .replace(/\.(?=\S)/g, ". ")
    .split(/\s+/)
    .map((w) => (/^\p{Ll}/u.test(w) && !/^(de|del|di|la|y)$/.test(w) ? cap(w) : w))
    .join(" ");
}

export function isCredit(name: string | null | undefined): boolean {
  const s = (name ?? "").trim();
  return s.includes("-") && GLUED.test(s) && s.split("-").every((p) => p.trim().length > 0);
}

/** the credit as names (display only); any other name unchanged */
export function creditName(name: string): string {
  if (!isCredit(name)) return name;
  const parts = name.split("-").map((p) => p.trim());
  const known = parts.map((p) => MUSICIANS[fold(p)]);
  const names = parts.map((p, i) => known[i]?.name ?? oneName(p));
  const guitars = known.every((k) => k?.guitar);
  return guitars ? t("orchestra.guitars_credit", { names: names.join(", ") }) : names.join(", ");
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
