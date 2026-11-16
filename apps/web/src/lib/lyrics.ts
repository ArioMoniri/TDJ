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
  match?: { id: number; artist: string; title: string; album?: string | null; durationSec?: number | null };
  fetchedAt: string;
}

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

/** a web search for the lyrics when LRCLIB has none ("Malena" letra Lucio Demare) */
export const lyricsSearchUrl = (s: Pick<Song, "title" | "orchestra">) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(`"${s.title}" letra tango ${s.orchestra}`)}`;

/* ---------- the per-side cache on this device ---------- */

const KEY = "tdj-lyrics-v1";
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

const inflight = new Map<string, Promise<Lyrics>>();
/** the side's lyrics: this device's copy, else LRCLIB (both searches, the best record), cached either way */
export function loadLyrics(
  s: Pick<Song, "id" | "title" | "orchestra" | "singer" | "durationSec">,
  f: typeof fetch = (u, i) => fetch(u, i),
): Promise<Lyrics> {
  const hit = cachedLyrics(s.id);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(s.id);
  if (running) return running;
  const p = (async () => {
    const all: LrclibRecord[] = [];
    let answered = false;
    for (const u of lrclibQueries(s)) {
      try {
        const r = await f(u, { headers: { accept: "application/json" } });
        if (!r.ok) continue;
        answered = true;
        const j = (await r.json()) as LrclibRecord[];
        if (Array.isArray(j)) all.push(...j);
        const best = pickRecord(all, s);
        if (best?.syncedLyrics) break;
      } catch {}
    }
    if (!answered) throw new Error("lrclib");
    const l = lyricsOf(pickRecord(all, s));
    cacheLyrics(s.id, l);
    return l;
  })().finally(() => inflight.delete(s.id));
  inflight.set(s.id, p);
  return p;
}
