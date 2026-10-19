/**
 * Best-match scoring for a catalogue recording against Spotify search candidates. Pure and isomorphic: the server
 * route (/api/spotify/match) scores with it, vitest checks it. `items[0]` of a search is not the answer for tango:
 * a modern orchestra's cover of "Ciego" outranks Canaro's 1935 recording in popularity, and D'Arienzo recorded
 * "La cumparsita" twice (1928, 1951); the duration and the album year tell them apart.
 */
export interface MatchItem {
  id: string;
  title: string;
  orchestra: string;
  singer?: string | null;
  year?: number | null;
  durationSec?: number | null;
  isrc?: string | null;
}
export interface Candidate {
  uri: string;
  name: string;
  artists: string[];
  album: string;
  /** album release year when Spotify gives one */
  albumYear?: number | null;
  durationMs: number;
  url?: string;
}
export interface Match {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  year: number | null;
  durationMs: number;
  url?: string;
  /** 0..1 */
  score: number;
}

/** Below this a candidate is "not found" rather than a wrong song. */
export const MATCH_THRESHOLD = 0.6;

/** Lower case, no accents, no punctuation, single spaces. */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
/** A title as sung: without "(Remastered 2004)", "- Live", "feat." tails. */
export function cleanTitle(s: string): string {
  return norm(
    s
      .replace(/\((?:[^)]*)\)|\[(?:[^\]]*)\]/g, " ")
      .replace(/\s[-–]\s.*$/, " ")
      .replace(/\bfeat\.?.*$/i, " "),
  );
}
const ORCHESTRA_NOISE =
  /\b(orquesta|orchestra|tipica|típica|y su|his|and|the|los|las|el|la|sexteto|cuarteto|trio|quinteto)\b/gi;
/** The orchestra's surname: "Juan D'Arienzo" → "darienzo", "Orquesta Típica Víctor" → "victor", "Carlos Di Sarli" → "sarli". */
export function orchestraSurname(orchestra: string): string {
  const words = norm(orchestra).replace(ORCHESTRA_NOISE, " ").split(" ").filter(Boolean);
  return words[words.length - 1] ?? norm(orchestra);
}
/** The name part used in the search filter: the surname when it is distinctive, else the whole name. */
export function orchestraQuery(orchestra: string): string {
  const base = orchestra
    .replace(/\(.*?\)/g, " ")
    .replace(ORCHESTRA_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = base.split(" ");
  const last = parts[parts.length - 1] ?? base;
  // "Di Sarli", "De Angelis", "De Caro": keep the particle so Spotify's artist filter still matches
  const prev = parts[parts.length - 2];
  const withParticle = prev && /^(di|de|del|da|van|von)$/i.test(prev) ? `${prev} ${last}` : last;
  return withParticle.length >= 4 ? withParticle : base || orchestra;
}

/** Jaro-Winkler similarity in 0..1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = true;
      bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length) && a[i] === b[i]; i++) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}
/** Share of the shorter title's words found in the other one. */
function tokenOverlap(a: string, b: string): number {
  const A = a.split(" ").filter(Boolean);
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.length || !B.size) return 0;
  const hit = A.filter((w) => B.has(w)).length;
  return hit / Math.max(A.length, B.size);
}
export function titleSimilarity(a: string, b: string): number {
  const x = cleanTitle(a);
  const y = cleanTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return Math.max(jaroWinkler(x, y), tokenOverlap(x, y));
}

const TIEBREAK = /\b(live|en vivo|remaster(ed)?|karaoke|instrumental version|cover)\b/i;

/**
 * Score a candidate in 0..1. Title similarity carries half; the orchestra's surname among the artists most of the
 * rest; the singer, a near album year and a matching duration add; a cover (no artist mentions the orchestra) is
 * pushed under the threshold; "live" / "remaster" only break ties.
 */
export function scoreCandidate(item: MatchItem, c: Candidate): number {
  let s = 50 * titleSimilarity(item.title, c.name);
  const surname = orchestraSurname(item.orchestra);
  const artists = norm(c.artists.join(" "));
  const inArtists = surname.length >= 3 && artists.includes(surname);
  const inAlbum = surname.length >= 3 && norm(c.album).includes(surname);
  if (inArtists) s += 30;
  else if (inAlbum) s += 10;
  else s -= 40;
  if (item.singer) {
    const singer = norm(item.singer)
      .split(" ")
      .filter((w) => w.length >= 3);
    const hay = `${artists} ${norm(c.name)}`;
    if (singer.length && singer.every((w) => hay.includes(w))) s += 8;
  }
  if (item.year && c.albumYear) {
    if (Math.abs(c.albumYear - item.year) <= 3) s += 5;
  }
  if (item.durationSec && c.durationMs) {
    const diff = Math.abs(c.durationMs / 1000 - item.durationSec);
    if (diff <= 15) s += 10;
    else if (diff > 45) s -= 5;
  }
  if (TIEBREAK.test(c.name) || TIEBREAK.test(c.album)) s -= 3;
  return Math.max(0, Math.min(1, s / 100));
}

/** The best candidate when it clears the threshold, else null ("not found" beats a wrong song). */
export function bestMatch(item: MatchItem, cands: Candidate[], threshold = MATCH_THRESHOLD): Match | null {
  let best: { c: Candidate; s: number } | null = null;
  for (const c of cands) {
    const s = scoreCandidate(item, c);
    if (!best || s > best.s) best = { c, s };
  }
  if (!best || best.s < threshold) return null;
  return {
    id: item.id,
    uri: best.c.uri,
    name: best.c.name,
    artist: best.c.artists.join(", "),
    album: best.c.album,
    year: best.c.albumYear ?? null,
    durationMs: best.c.durationMs,
    url: best.c.url,
    score: Math.round(best.s * 100) / 100,
  };
}

/** The two queries sent to Spotify: field filters first, a plain text query as the fallback. */
export function searchQueries(item: MatchItem): { filtered: string; plain: string } {
  const title = item.title.replace(/"/g, "");
  const artist = orchestraQuery(item.orchestra).replace(/"/g, "");
  return {
    filtered: `track:"${title}" artist:"${artist}"`,
    plain: `${item.title} ${item.orchestra}${item.singer ? ` ${item.singer}` : ""}`,
  };
}
