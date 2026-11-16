import type { Catalog } from "./catalog";
import { normTitle } from "./energy";
import { staticProfile } from "./knowledge";
import { isTandaEligible } from "./tanda";
import type { ComposeOptions, NightRules, Song, Tanda } from "./types";

/**
 * Round 21 — where La Cumparsita plays, and the opening version (docs/specs/round21-engine.md §1).
 *
 * `rules.cumparsita`: "open" | "close" | "both" (the default) | "none". Unset, the legacy keys decide:
 * `openWithCumparsita` (unset = open, the round-21 default) and `closeWithCumparsita`.
 *
 * The opening version matches the first tanda: by its orchestra, from the year nearest the tanda's years (within 4:
 * the same era), instrumental unless the orchestra only recorded it sung (then its singer's when there is one). The
 * ladder when that cannot be: the same orchestra within OPENING_YEAR_WINDOW years → an orchestra of the same style
 * from the year nearest the tanda (inside the night's years) — each step recorded in stats.settingFallbacks
 * ("opening: …").
 */
export function cumparsitaPlacement(
  o: Pick<ComposeOptions, "closeWithCumparsita"> & { rules?: NightRules },
): { open: boolean; close: boolean } {
  const r = o.rules ?? {};
  if (r.cumparsita)
    return {
      open: r.cumparsita === "open" || r.cumparsita === "both",
      close: r.cumparsita === "close" || r.cumparsita === "both",
    };
  return { open: r.openWithCumparsita ?? true, close: o.closeWithCumparsita !== false };
}

export const isCumparsita = (s: Pick<Song, "title"> | null | undefined) =>
  !!s && normTitle(s.title) === "la cumparsita";
const streamable = (s: Pick<Song, "spotify" | "resolved">) => !!(s.spotify || s.resolved);
const profileStyle = (id: string) => staticProfile(id)?.style ?? "balanced";

/** the distance of a year from a tanda's years */
const yearDist = (y: number, yr: [number, number]) => Math.max(0, yr[0] - y, y - yr[1]);
/** the opening's own version within this many years of the first tanda is the same era: no note */
export const OPENING_SAME_ERA = 4;
/**
 * 2026-11 — the year window of the opening (and the harmony closer): the first tanda's orchestra opens with its own
 * La Cumparsita when one lies within this many years of the tanda's years (D'Agostino 1952 for a 1941 tanda, 11
 * years: noted); past it, another orchestra's version from the night's years opens, and the note says the orchestra
 * has none near its years (Caló's 1964 and 1966 versions for a 1942 tanda, 22 years). One window for every orchestra,
 * whatever the era of the version (it used to be "any golden-era year", so 11 years passed and 9 could fail).
 */
export const OPENING_YEAR_WINDOW = 12;
/** the documented La Cumparsita years of an orchestra: profile `cumparsitaVersions` ∪ corpus `role:"cumparsita"` */
function documented(cat: Catalog, orchestraId: string): Set<number> {
  const ys = new Set<number>(cat.profile(orchestraId)?.cumparsitaVersions ?? []);
  for (const f of cat.corpus.famousRecordings ?? [])
    if (f.role === "cumparsita" && f.orchestraId === orchestraId && f.year) ys.add(f.year);
  return ys;
}

export function openingCumparsita(
  cat: Catalog,
  o: Pick<ComposeOptions, "yearRange">,
  first: Pick<Tanda, "orchestraId" | "orchestra" | "yearRange" | "singer" | "vocal" | "songs">,
  closing: Song | null,
): { song: Song | null; fallback?: string } {
  const ys = first.songs.map((s) => s.year).filter((y): y is number => !!y);
  const yr: [number, number] =
    first.yearRange ?? (ys.length ? [Math.min(...ys), Math.max(...ys)] : [1940, 1940]);
  const all = cat.songs.filter(
    (s) =>
      isCumparsita(s) &&
      s.rhythm === "tango" &&
      isTandaEligible(s) &&
      !!s.year &&
      s.id !== closing?.id &&
      !(closing && s.orchestraId === closing.orchestraId && s.year === closing.year),
  );
  const yrN = o.yearRange;
  const inNight = (s: Song) => !yrN || (s.year! >= yrN[0] && s.year! <= yrN[1]);
  const rank = (a: Song, b: Song) =>
    yearDist(a.year!, yr) - yearDist(b.year!, yr) ||
    Number(streamable(b)) - Number(streamable(a)) ||
    Number(!!b.spotify) - Number(!!a.spotify) ||
    (b.fame ?? 0) - (a.fame ?? 0) ||
    a.id.localeCompare(b.id);
  // instrumental unless the orchestra only has a sung one; then its singer's first
  const voice = (xs: Song[]) => {
    const instr = xs.filter((s) => !s.vocal);
    if (instr.length) return instr;
    const own = xs.filter((s) => first.singer && normTitle(s.singer ?? "") === normTitle(first.singer));
    return own.length ? own : xs;
  };
  const mine = all.filter((s) => s.orchestraId === first.orchestraId && !s.streamSuspect);
  const near = voice(mine.filter((s) => yearDist(s.year!, yr) <= OPENING_SAME_ERA)).sort(rank);
  if (near[0]) return { song: near[0] };
  const yrs = `${yr[0]}${yr[1] !== yr[0] ? `–${yr[1]}` : ""}`;
  const inWindow = voice(mine.filter((s) => yearDist(s.year!, yr) <= OPENING_YEAR_WINDOW)).sort(rank);
  if (inWindow[0])
    return {
      song: inWindow[0],
      fallback: `opening: no ${first.orchestra} La Cumparsita near ${yrs}; its ${inWindow[0].year}${inWindow[0].singer ? ` version (${inWindow[0].singer})` : ""} opens`,
    };
  const style = profileStyle(first.orchestraId);
  // (another orchestra's version: one of the documented closing versions when there is one)
  const doc = all.filter((s) => documented(cat, s.orchestraId).has(s.year!));
  const pool = doc.some((s) => !s.vocal && !s.streamSuspect && inNight(s)) ? doc : all;
  const same = pool
    .filter((s) => !s.vocal && !s.streamSuspect && inNight(s) && profileStyle(s.orchestraId) === style)
    .sort(rank);
  const pick =
    same[0] ?? pool.filter((s) => !s.vocal && !s.streamSuspect && inNight(s)).sort(rank)[0] ?? null;
  // (the orchestra's own versions outside the window, nearest first: the note names the nearest)
  const own = [...mine].sort(rank)[0];
  return {
    song: pick,
    fallback: pick
      ? `opening: ${first.orchestra} has no La Cumparsita near its years (±${OPENING_YEAR_WINDOW})${own ? ` — its nearest is ${own.year}` : ""}; ${pick.orchestra} ${pick.year} (${style === profileStyle(pick.orchestraId) ? `the same ${style} style` : "the nearest year"}) opens`
      : `opening: no La Cumparsita to open with`,
  };
}

/**
 * Round 21 — the harmony setting for the closing (`rules.cumparsitaHarmony`): the closing La Cumparsita by the
 * última's orchestra near its years (its singer's when it only recorded it sung), by the same ladder as the opening,
 * each step recorded ("closer: …"). Off (the default) the classic rule stands: another orchestra than the última's.
 */
export function closingFor(
  cat: Catalog,
  o: Pick<ComposeOptions, "yearRange" | "rules">,
  last: Pick<Tanda, "orchestraId" | "orchestra" | "yearRange" | "singer" | "vocal" | "songs">,
  opening: Song | null = null,
): { song: Song | null; fallback?: string } {
  const r = openingCumparsita(cat, o, last, opening);
  return {
    song: r.song,
    ...(r.fallback
      ? {
          fallback: r.fallback
            .replace(/^opening: /, "closer: ")
            .replace(/ opens$/, " closes")
            .replace("to open with", "to close with"),
        }
      : {}),
  };
}
