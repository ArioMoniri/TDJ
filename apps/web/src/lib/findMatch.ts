import { type MatchRow, matchProblem, namesLeader, normTitle, sameWork } from "@tdj/core";

/**
 * 2026-11 — "Find on services" (the owner: "can't find for most of them"). Pure and isomorphic: the resolve handler
 * (lib/api/net.ts, on the server and on the device) builds its queries and judges its candidates with it, vitest pins
 * it (findMatch.test.ts) and the hit-rate bench (lib/api/findBench.test.ts) measures it.
 *
 * The old lookup sent one query, `title + orchestra label`: a side the catalogue files under "Guitarras (solo singer)"
 * searched Deezer for the word "Guitarras" and found nothing. Now each service gets a ladder of queries — title +
 * singer, title + the leader's surname, title + orchestra + singer, the title alone (MusicBrainz: bounded by the length
 * ± 15 s or a year window), the index's alias titles — with accents, quotes and glosses folded away, and every
 * candidate is judged by the core match rules (packages/core/src/matchRules.ts: another title, a tribute album or
 * orchestra, another ensemble, singer or orchestra are refused) and scored with the reasons the sheet shows.
 */

export type FindService = "deezer" | "spotify" | "musicbrainz";
export interface FindSide {
  title: string;
  orchestra: string;
  singer?: string | null;
  vocal?: boolean;
  year?: number | null;
  yearApprox?: boolean;
  date?: string | null;
  durationSec?: number | null;
  durationEstimated?: boolean;
  altTitles?: string[];
  rhythm?: string | null;
  /** the orchestra's other names (data/knowledge/orchestra_profiles.json `aliases`) */
  orchestraAliases?: string[];
  laterTakes?: MatchRow["laterTakes"];
  vocalTwins?: number[];
}
/** a recording a service answered, as the scorer reads it */
export interface FoundRec {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number | null;
  /** the recording's own year (MusicBrainz' first release), never a reissue's album date */
  year?: number | null;
  /** the album's release date as the provider dates it */
  release?: string | null;
  /** the provider credits the main artist only (Deezer): the singer cannot be read from the credit */
  mainArtistOnly?: boolean;
}
/** why a candidate matches (or is unsure), for the sheet: keys of resolveSheet.why_* */
export type Why =
  | { k: "title" }
  | { k: "alias"; v: string }
  | { k: "leader"; v: string }
  | { k: "singer"; v: string }
  | { k: "length"; v: string }
  | { k: "year"; v: string }
  | { k: "unsure"; v: string };
export interface Scored {
  /** 0..1 */
  score: number;
  why: Why[];
  /** a core match rule proves it is another recording */
  refused?: string;
}

/* ---------------- query text ---------------- */

/** accents, quotes, brackets and punctuation out; the words (and a name's apostrophe, D'Arienzo) kept */
export function fold(s: string): string {
  return s
    .replace(/ı/g, "i")
    .replace(/[øØ]/g, "o")
    .replace(/[łŁ]/g, "l")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u2018`´]/g, "'")
    .replace(/[^A-Za-z0-9' ]+/g, " ")
    .replace(/(^|\s)'+|'+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** a catalogue label that names no orchestra: the side is the singer's own (with guitars, a pianist, unknown band) */
const PSEUDO = /solo singer|unspecified|^guitarras?\b|^g\.\s?barbieri|^piano\s*\(|^conjunto\s*\(/i;
const NOISE = new Set([
  "orq",
  "orquesta",
  "orchestra",
  "orch",
  "tipica",
  "tipico",
  "typical",
  "y",
  "su",
  "his",
  "and",
  "the",
  "sexteto",
  "cuarteto",
  "quinteto",
  "trio",
  "conjunto",
  "o",
  "t",
]);
const leaderWords = (o: string) =>
  fold(o.replace(/\(.*?\)/g, " ").replace(/\(.*$/, " "))
    .split(" ")
    .filter((w) => w && !NOISE.has(w.toLowerCase()));
export function isPseudoOrchestra(o: string): boolean {
  return PSEUDO.test(o.trim()) || !leaderWords(o).length;
}
/** the leader's name without the catalogue's tags ("Pedro Láurenz(5to.)" → "Pedro Laurenz"); null: no orchestra */
export function leaderFull(o: string): string | null {
  if (isPseudoOrchestra(o)) return null;
  return leaderWords(o).join(" ") || null;
}
/** the leader's surname with its particle ("Di Sarli", "D'Arienzo"), the whole name when the surname is short */
export function leaderQuery(o: string): string | null {
  if (isPseudoOrchestra(o)) return null;
  const w = leaderWords(o);
  const last = w[w.length - 1];
  if (!last) return null;
  const prev = w[w.length - 2];
  const s = prev && /^(di|de|del|da|van|von|d)$/i.test(prev) ? `${prev} ${last}` : last;
  return s.replace(/'/g, "").length >= 4 ? s : w.join(" ");
}
/** the title without its gloss, with it, the gloss itself, then the index's alias titles (folded, distinct) */
export function titleForms(side: Pick<FindSide, "title" | "altTitles">): string[] {
  const main = fold(side.title.replace(/\(.*?\)/g, " "));
  const full = fold(side.title);
  const glosses = [...side.title.matchAll(/\(([^)]*)\)/g)].map((m) => fold(m[1] ?? ""));
  const out: string[] = [];
  for (const f of [main, full, ...glosses, ...(side.altTitles ?? []).map(fold)])
    if (f.replace(/'/g, "").length >= 2 && !out.some((x) => x.toLowerCase() === f.toLowerCase())) out.push(f);
  return out;
}
const singerOf = (side: FindSide) => (side.vocal !== false && side.singer ? fold(side.singer) : null);

/* ---------------- the ladder ---------------- */

export type RungWhy = "title_singer" | "title_leader" | "title_orchestra_singer" | "title" | "alias";
export interface Rung {
  q: string;
  why: RungWhy;
}
/** how many queries each service may take for one side (MusicBrainz allows one request a second) */
export const LADDER_CAP: Record<FindService, number> = { deezer: 6, spotify: 5, musicbrainz: 3 };
const esc = (s: string) => s.replace(/["\\]/g, "\\$&");

/** the queries to try, in order, for one service */
export function queryLadder(svc: FindService, side: FindSide): Rung[] {
  const forms = titleForms(side);
  const main = forms[0] ?? fold(side.title);
  const singer = singerOf(side);
  const lq = leaderQuery(side.orchestra);
  const lf = leaderFull(side.orchestra);
  const pair = (title: string, artist: string | null): string => {
    if (svc === "spotify") return artist ? `track:"${title}" artist:"${artist}"` : title;
    if (svc === "musicbrainz")
      return artist ? `recording:"${esc(title)}" AND artist:"${esc(artist)}"` : `recording:"${esc(title)}"`;
    return artist ? `${title} ${artist}` : title;
  };
  const alone = (title: string) => {
    if (svc !== "musicbrainz") return pair(title, null);
    const len = !side.durationEstimated && side.durationSec ? Math.round(side.durationSec) * 1000 : null;
    if (len) return `${pair(title, null)} AND dur:[${len - 15_000} TO ${len + 15_000}]`;
    if (side.year) return `${pair(title, null)} AND firstreleasedate:[${side.year - 3} TO ${side.year + 3}]`;
    return pair(title, null);
  };
  const rungs: Rung[] = [];
  const add = (q: string, why: RungWhy) => {
    if (!rungs.some((r) => r.q === q)) rungs.push({ q, why });
  };
  if (singer) add(pair(main, singer), "title_singer");
  if (lq) add(pair(main, lq), "title_leader");
  if (lf && singer && svc !== "musicbrainz") add(`${main} ${lf} ${singer}`, "title_orchestra_singer");
  add(alone(main), "title");
  for (const f of forms.slice(1, 3)) add(lq || singer ? pair(f, lq ?? singer) : alone(f), "alias");
  return rungs.slice(0, LADDER_CAP[svc]);
}

/* ---------------- scoring ---------------- */

/** the rules that prove another recording (the rest only make a candidate unsure) */
const HARD =
  /^(another title|a (tango|vals|milonga), not|another ensemble|a tribute|the credit names neither|a solo recording|another orchestra|a sung credit|another singer|a remake series|a recording date)/;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const words = (s: string) => new Set(normTitle(s).split(" ").filter(Boolean));

export function scoreFound(side: FindSide, f: FoundRec): Scored {
  const row: MatchRow = {
    title: side.title,
    orchestra: side.orchestra,
    singer: side.singer ?? null,
    vocal: side.vocal,
    year: side.year ?? null,
    date: side.date ?? null,
    durationSec: side.durationSec ?? null,
    durationEstimated: side.durationEstimated,
    altTitles: side.altTitles,
    rhythm: side.rhythm ?? null,
    laterTakes: side.laterTakes,
    vocalTwins: side.vocalTwins,
  };
  const cand = {
    name: f.title,
    artists: f.artists,
    album: f.album ?? undefined,
    durationMs: f.durationMs ?? undefined,
    mainArtistOnly: f.mainArtistOnly,
    release: f.release ?? undefined,
  };
  // the orchestra by any of its names: the first name under which nothing proves another recording
  // (a guitarists' credit the core rules do not know as one — "G.barbieri-J.m.aguilar" for Gardel — is judged as
  // the singer's own side, like "Guitarras (solo singer)")
  const pseudo = isPseudoOrchestra(side.orchestra);
  const names = pseudo ? ["Guitarras (solo singer)"] : [side.orchestra, ...(side.orchestraAliases ?? [])];
  let problem: string | null = null;
  for (const [i, o] of names.entries()) {
    const p = matchProblem({ ...row, orchestra: o }, cand);
    if (!p) {
      problem = null;
      break;
    }
    if (i === 0) problem = p;
  }
  if (problem && HARD.test(problem)) return { score: 0, why: [], refused: problem };
  const why: Why[] = [];
  let s = 0;
  if (sameWork({ ...row, altTitles: [] }, f.title)) {
    s += 0.4;
    why.push({ k: "title" });
  } else if (sameWork(row, f.title)) {
    s += 0.35;
    why.push({ k: "alias", v: f.title });
  }
  const credit = words(`${f.artists.join(" ")} ${f.title} ${f.album ?? ""}`);
  const singerSur = side.singer ? [...words(side.singer)].filter((w) => w.length > 2).pop() : undefined;
  const singerNamed = !!singerSur && credit.has(singerSur);
  if (pseudo) {
    if (singerNamed) {
      s += 0.35;
      why.push({ k: "singer", v: side.singer! });
    }
  } else {
    const by =
      f.artists.find((a) => names.some((o) => namesLeader(o, a))) ??
      (f.album && names.some((o) => namesLeader(o, f.album!)) ? f.album : undefined);
    if (by) {
      s += 0.3;
      why.push({ k: "leader", v: by });
    }
    if (singerNamed && side.vocal !== false) {
      s += 0.1;
      why.push({ k: "singer", v: side.singer! });
    }
  }
  if (side.durationSec && !side.durationEstimated && f.durationMs) {
    const d = Math.abs(f.durationMs / 1000 - side.durationSec);
    if (d <= 15) {
      s += 0.15;
      why.push({ k: "length", v: mmss(f.durationMs / 1000) });
    } else if (d > 45) s -= 0.15;
  }
  if (side.year) {
    const albumYears = [...(f.album ?? "").matchAll(/\b(19[0-9]\d)\b/g)].map((m) => Number(m[1]));
    const rel = f.release ? Number(f.release.slice(0, 4)) : null;
    if (f.year) {
      const d = Math.abs(f.year - side.year);
      if (d <= 2) {
        s += 0.15;
        why.push({ k: "year", v: String(f.year) });
      } else if (d > 5) s -= 0.1;
    } else if (albumYears.some((y) => Math.abs(y - side.year!) <= 3)) {
      s += 0.1;
      why.push({ k: "year", v: String(albumYears.find((y) => Math.abs(y - side.year!) <= 3)) });
    } else if (rel && rel < 1960 && Math.abs(rel - side.year) <= 3) {
      s += 0.1;
      why.push({ k: "year", v: String(rel) });
    }
  }
  if (problem) {
    s -= 0.1;
    why.push({ k: "unsure", v: problem });
  }
  return { score: Math.max(0, Math.min(1, Math.round(s * 100) / 100)), why };
}

/** below this a candidate is not shown (another work's or a stranger's recording) */
export const FIND_MIN = 0.35;
/** at or above this a service's ladder stops: the side's own recording is in hand */
export const FIND_STRONG = 0.85;

/** the candidates in score order, refused ones (and the ones under FIND_MIN) out and counted */
export function rankFound<T extends FoundRec>(
  side: FindSide,
  items: T[],
): { ranked: Array<{ item: T } & Scored>; refused: number } {
  let refused = 0;
  const ranked: Array<{ item: T } & Scored> = [];
  for (const item of items) {
    const sc = scoreFound(side, item);
    if (sc.refused || sc.score < FIND_MIN) {
      refused++;
      continue;
    }
    ranked.push({ item, ...sc });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { ranked, refused };
}
