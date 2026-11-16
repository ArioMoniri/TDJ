import { normTitle } from "@tdj/core";
import type { Song } from "./types";

/**
 * 2026-11 — a side's lyrics, from LRCLIB (lrclib.net: an open, keyless lyrics database whose API is meant for apps;
 * plain and time-synced LRC lyrics, searched by title, artist and length). The browser asks LRCLIB directly (it
 * answers with CORS `*`), never a site that forbids it, and keeps each answer on this device (per side, so a night
 * does not ask twice). No lyrics are ever bundled with T-DJ. Pure parsing and matching here; the component fetches.
 */

export const LRCLIB = "https://lrclib.net";
export const LRCLIB_SITE = "https://lrclib.net/";

export interface LyricLine {
  /** seconds into the recording */
  at: number;
  text: string;
}
export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}
export interface Lyrics {
  state: "synced" | "plain" | "instrumental" | "none";
  lines?: LyricLine[];
  plain?: string;
  /** what LRCLIB matched (shown with the credit) */
  match?: {
    id: number;
    artist: string;
    title: string;
    album?: string | null;
    durationSec?: number | null;
    /** "side": this recording (its orchestra or singer named); "work": another recording of the same work */
    kind?: "side" | "work";
  };
  /** where they came from (LRCLIB by default; the DJ's pick from another source, or their own paste) */
  source?: LyricsSource;
  /** the provider's own credit / copyright line (Musixmatch asks for it with the text) */
  copyright?: string;
  /** the tracking pixel a provider's terms require with the text (Musixmatch) */
  pixel?: string;
  /** the provider gave only part of the text (Musixmatch's free tier) */
  partial?: boolean;
  fetchedAt: string;
}
export type LyricsSource = "lrclib" | "musixmatch" | "paste";

/** "[01:02.50] Text" lines → timed lines (several stamps on one line each count; metadata tags dropped) */
export function parseLrc(text: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) {
      const at = Number(m[1]) * 60 + Number(m[2]!.replace(":", "."));
      if (Number.isFinite(at)) out.push({ at: Math.round(at * 100) / 100, text: words });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** the line sounding at `sec` (the last one started), −1 before the first */
export function lineAt(lines: readonly LyricLine[], sec: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.at <= sec) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** the first sung line's time: where the singer comes in, as the synced lyrics have it */
export const firstSungSec = (lines: readonly LyricLine[] | undefined) =>
  lines?.find((l) => l.text.trim().length > 0)?.at ?? null;

const fold = (s: string) => normTitle(s ?? "");
/** "Carlos Di Sarli" → "di sarli", the words LRCLIB's artist line is matched on */
function surnameWords(name: string): string[] {
  const w = fold(name).split(" ").filter(Boolean);
  if (w.length < 2) return w;
  const prev = w[w.length - 2]!;
  return ["di", "de", "del", "d"].includes(prev) ? w.slice(-2) : w.slice(-1);
}

/** how well a record fits the side: the title, then the orchestra or singer in its artist line, then the length */
export function scoreRecord(
  r: LrclibRecord,
  s: Pick<Song, "title" | "orchestra" | "singer" | "durationSec">,
) {
  const t = fold(r.trackName.replace(/\s+-\s+.*$/, ""));
  if (t !== fold(s.title)) return -1;
  const artist = ` ${fold(r.artistName)} `;
  const named = (n: string | null | undefined) =>
    !!n && surnameWords(n).every((w) => artist.includes(` ${w} `) || artist.includes(w));
  let score = 0;
  if (named(s.orchestra)) score += 3;
  if (named(s.singer)) score += 2;
  if (score === 0) return -1;
  const d = r.duration && s.durationSec ? Math.abs(r.duration - s.durationSec) : null;
  if (d !== null) score += d <= 3 ? 3 : d <= 10 ? 1 : d > 40 ? -2 : 0;
  if (r.syncedLyrics) score += 2;
  else if (r.plainLyrics) score += 1;
  return score;
}

/**
 * A work's title as LRCLIB may spell it: accents, case and punctuation folded, a " - Remastered" tail and a
 * (Remastered / versión / live) gloss dropped.
 */
export function titleKey(title: string): string {
  return fold(
    title
      .replace(/\s+-\s+.*$/, "")
      .replace(/\s*[([][^)\]]*(remaster|versi[oó]n|version|live|en vivo|mono|stereo)[^)\]]*[)\]]/gi, ""),
  );
}

/** the side's titles to look for: its own, then its catalogue alternatives (dedications, glosses, lyric variants) */
export const titlesOf = (s: Pick<Song, "title"> & { altTitles?: string[] }) => [
  ...new Set([s.title, ...(s.altTitles ?? [])].filter((x) => x?.trim())),
];

/**
 * A record of the same WORK sung by anyone (tango lyrics rarely change between recordings): its title (or an
 * alternative title) matches and it has words. Synced only when its length is this side's (±3 s: else the stamps are
 * another recording's); its words still serve, plain.
 */
export function pickWork(
  rs: readonly LrclibRecord[],
  s: Pick<Song, "title" | "durationSec"> & { altTitles?: string[] },
): { record: LrclibRecord; synced: boolean } | null {
  const keys = new Set(titlesOf(s).map(titleKey));
  let best: { record: LrclibRecord; synced: boolean; score: number } | null = null;
  for (const r of rs) {
    if (r.instrumental || !keys.has(titleKey(r.trackName))) continue;
    if (!r.plainLyrics?.trim() && !r.syncedLyrics?.trim()) continue;
    const d = r.duration && s.durationSec ? Math.abs(r.duration - s.durationSec) : null;
    const synced = !!r.syncedLyrics && d !== null && d <= 3;
    const score =
      (synced ? 10 : 0) + (r.plainLyrics?.trim() ? 2 : 0) + (r.syncedLyrics ? 1 : 0) - (d ?? 30) / 100;
    if (!best || score > best.score) best = { record: r, synced, score };
  }
  return best ? { record: best.record, synced: best.synced } : null;
}

/** the words of a synced text without its stamps */
export const lrcPlain = (lrc: string) =>
  parseLrc(lrc)
    .map((l) => l.text)
    .join("\n")
    .trim();

/** another recording's words for this side: plain unless its stamps fit this side's length */
export function workLyricsOf(w: { record: LrclibRecord; synced: boolean } | null, at = new Date()): Lyrics {
  if (!w) return { state: "none", fetchedAt: at.toISOString() };
  const r = w.record;
  const base = lyricsOf(r, at);
  const match = base.match ? { ...base.match, kind: "work" as const } : undefined;
  if (w.synced && base.state === "synced") return { ...base, match };
  const plain = r.plainLyrics?.trim() || (r.syncedLyrics ? lrcPlain(r.syncedLyrics) : "");
  return plain ? { state: "plain", plain, match, fetchedAt: at.toISOString() } : base;
}

/** the best record for the side among LRCLIB's answers, or null */
export function pickRecord(
  rs: readonly LrclibRecord[],
  s: Pick<Song, "title" | "orchestra" | "singer" | "durationSec">,
): LrclibRecord | null {
  let best: LrclibRecord | null = null;
  let bs = 0;
  for (const r of rs) {
    const v = scoreRecord(r, s);
    if (v > bs) {
      bs = v;
      best = r;
    }
  }
  return best;
}

export function lyricsOf(r: LrclibRecord | null, at = new Date()): Lyrics {
  const fetchedAt = at.toISOString();
  if (!r) return { state: "none", fetchedAt };
  const match = {
    id: r.id,
    artist: r.artistName,
    title: r.trackName,
    album: r.albumName ?? null,
    durationSec: r.duration ?? null,
  };
  const lines = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
  if (lines.length) return { state: "synced", lines, plain: r.plainLyrics ?? undefined, match, fetchedAt };
  if (r.plainLyrics?.trim()) return { state: "plain", plain: r.plainLyrics, match, fetchedAt };
  if (r.instrumental) return { state: "instrumental", match, fetchedAt };
  return { state: "none", fetchedAt };
}

/** the LRCLIB searches for a side, best first: title + orchestra, then title + singer */
export function lrclibQueries(s: Pick<Song, "title" | "orchestra" | "singer">): string[] {
  const q = (artist: string) =>
    `${LRCLIB}/api/search?${new URLSearchParams({ track_name: s.title, artist_name: artist })}`;
  const out = [q(surnameWords(s.orchestra).join(" ") || s.orchestra)];
  if (s.singer) out.push(q(s.singer));
  return out;
}

/**
 * The whole ladder, best first: LRCLIB's exact get (title, orchestra, length), the two side searches, a free-text
 * search of title and singer, then the title alone (any recording of the work) and each alternative title.
 */
export function lrclibLadder(
  s: Pick<Song, "title" | "orchestra" | "singer" | "durationSec"> & { altTitles?: string[] },
): Array<{ url: string; kind: "get" | "side" | "work" }> {
  const out: Array<{ url: string; kind: "get" | "side" | "work" }> = [];
  if (s.durationSec)
    out.push({
      kind: "get",
      url: `${LRCLIB}/api/get?${new URLSearchParams({
        track_name: s.title,
        artist_name: s.orchestra,
        duration: String(Math.round(s.durationSec)),
      })}`,
    });
  for (const url of lrclibQueries(s)) out.push({ kind: "side", url });
  if (s.singer)
    out.push({
      kind: "side",
      url: `${LRCLIB}/api/search?${new URLSearchParams({ q: `${s.title} ${s.singer}` })}`,
    });
  for (const title of titlesOf(s))
    out.push({ kind: "work", url: `${LRCLIB}/api/search?${new URLSearchParams({ track_name: title })}` });
  return out;
}

/** a web search for the lyrics when LRCLIB has none ("Malena" letra Lucio Demare) */
export const lyricsSearchUrl = (s: Pick<Song, "title" | "orchestra">) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(`"${s.title}" letra tango ${s.orchestra}`)}`;

/* ---------- the per-side cache on this device ---------- */

const KEY = "tdj-lyrics-v2";
const MAX = 120;
/** an empty answer is asked again after a week (LRCLIB grows) */
const NONE_TTL_MS = 7 * 24 * 3600 * 1000;

type Cache = Record<string, Lyrics>;
function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}
export function cachedLyrics(id: string, now = Date.now()): Lyrics | null {
  const c = readCache()[id];
  if (!c) return null;
  if (c.state === "none" && now - Date.parse(c.fetchedAt) > NONE_TTL_MS) return null;
  return c;
}
export function cacheLyrics(id: string, l: Lyrics): void {
  try {
    const c = readCache();
    c[id] = l;
    const keys = Object.keys(c);
    if (keys.length > MAX)
      for (const k of keys
        .sort((a, b) => Date.parse(c[a]!.fetchedAt) - Date.parse(c[b]!.fetchedAt))
        .slice(0, keys.length - MAX))
        delete c[k];
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

/* ---------- the DJ's own choice for a side: a pick from a source, or a paste (kept, never expires) ---------- */

const OWN = "tdj-lyrics-own-v1";
function readOwn(): Cache {
  try {
    return JSON.parse(localStorage.getItem(OWN) ?? "{}") as Cache;
  } catch {
    return {};
  }
}
export function ownLyrics(id: string): Lyrics | null {
  return readOwn()[id] ?? null;
}
const ownListeners = new Set<(id: string) => void>();
/** a view hears when the DJ attaches or forgets lyrics for a side */
export function onOwnLyrics(f: (id: string) => void): () => void {
  ownListeners.add(f);
  return () => void ownListeners.delete(f);
}
/** keep the DJ's lyrics for a side (null forgets them: LRCLIB again) */
export function setOwnLyrics(id: string, l: Lyrics | null): void {
  try {
    const c = readOwn();
    if (l) c[id] = l;
    else delete c[id];
    localStorage.setItem(OWN, JSON.stringify(c));
  } catch {}
  for (const f of ownListeners) f(id);
}

/** pasted text → lyrics: LRC stamps make them synced, else plain */
export function pastedLyrics(text: string, at = new Date()): Lyrics {
  const fetchedAt = at.toISOString();
  const lines = parseLrc(text);
  if (lines.length >= 2) return { state: "synced", lines, plain: lrcPlain(text), source: "paste", fetchedAt };
  const plain = text.trim();
  return plain
    ? { state: "plain", plain, source: "paste", fetchedAt }
    : { state: "none", source: "paste", fetchedAt };
}

export type LadderSong = Pick<Song, "id" | "title" | "orchestra" | "singer" | "durationSec"> & {
  altTitles?: string[];
};

/** every LRCLIB answer of the ladder for a side, stopping once this recording's synced lyrics are in */
export async function lrclibRecords(s: LadderSong, f: typeof fetch = (u, i) => fetch(u, i)) {
  const all: LrclibRecord[] = [];
  let answered = false;
  for (const q of lrclibLadder(s)) {
    try {
      const r = await f(q.url, { headers: { accept: "application/json" } });
      if (r.status === 404) {
        answered = true;
        continue;
      }
      if (!r.ok) continue;
      answered = true;
      const j = (await r.json()) as LrclibRecord[] | LrclibRecord;
      if (Array.isArray(j)) all.push(...j);
      else if (j && typeof j === "object" && "trackName" in j) all.push(j);
      if (pickRecord(all, s)?.syncedLyrics) break;
    } catch {}
  }
  return { all, answered };
}

/** the side's lyrics from LRCLIB's answers: this recording's synced, else the work's synced (same length), else any words */
export function bestLyrics(all: readonly LrclibRecord[], s: LadderSong, at = new Date()): Lyrics {
  const side = pickRecord(all, s);
  const sideL = side ? lyricsOf(side, at) : null;
  const asSide = (l: Lyrics): Lyrics => (l.match ? { ...l, match: { ...l.match, kind: "side" } } : l);
  if (sideL?.state === "synced") return asSide(sideL);
  const work = pickWork(all, s);
  if (work?.synced) return workLyricsOf(work, at);
  if (sideL && sideL.state !== "none") return asSide(sideL);
  return work ? workLyricsOf(work, at) : { state: "none", fetchedAt: at.toISOString() };
}

const inflight = new Map<string, Promise<Lyrics>>();
/** the side's lyrics: the DJ's own, this device's copy, else LRCLIB (the whole ladder), cached either way */
export function loadLyrics(s: LadderSong, f: typeof fetch = (u, i) => fetch(u, i)): Promise<Lyrics> {
  const own = ownLyrics(s.id);
  if (own) return Promise.resolve(own);
  const hit = cachedLyrics(s.id);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(s.id);
  if (running) return running;
  const p = (async () => {
    const { all, answered } = await lrclibRecords(s, f);
    if (!answered) throw new Error("lrclib");
    const l = bestLyrics(all, s);
    cacheLyrics(s.id, l);
    return l;
  })().finally(() => inflight.delete(s.id));
  inflight.set(s.id, p);
  return p;
}
