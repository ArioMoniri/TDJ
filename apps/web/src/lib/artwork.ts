import { type Cortina, type DjSongData, type ScrapedRecord, type Song, songData } from "@tdj/core";
import { surnameOf } from "./booth/songInfo";
import type { SongPatch } from "./types";

/**
 * Round 22 — artwork on every song (compose, the database, the search panel): the DJ's own image, else what their
 * sources fetched (Deezer, the Cover Art Archive, Discogs, Spotify), else the shipped Deezer match's cover; with none,
 * a placeholder per orchestra (its colour and initials), the same everywhere.
 */
export function djDataOf(p: SongPatch | undefined | null): DjSongData | null {
  if (!p) return null;
  return {
    ...(typeof p.bpm === "number" ? { bpm: p.bpm } : {}),
    ...(typeof p.gainDb === "number" ? { gainDb: p.gainDb } : {}),
    ...(p.key ? { key: p.key } : {}),
    ...(p.artwork ? { artwork: p.artwork } : {}),
    ...(p.release ? { release: p.release } : {}),
    ...(p.deezerId ? { deezerId: p.deezerId } : {}),
    ...(p.spotify !== undefined ? { spotify: p.spotify ? { uri: p.spotify.uri } : null } : {}),
    ...(p.vocalStyle ? { vocalStyle: p.vocalStyle } : {}),
  };
}

export function artworkFor(
  s: Song,
  scraped?: ScrapedRecord | null,
  patch?: SongPatch | null,
): string | undefined {
  return songData(s, scraped, djDataOf(patch)).artwork?.value as string | undefined;
}

const SKIP = new Set([
  "orquesta",
  "tipica",
  "típica",
  "y",
  "su",
  "de",
  "del",
  "la",
  "los",
  "las",
  "el",
  "sexteto",
  "cuarteto",
  "trio",
  "trío",
]);
/* ---------- the placeholder: the orchestra's hue and initials, readable on every hue (WCAG AA against white) ---------- */

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};
const lum = ([r, g, b]: [number, number, number]) => {
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
/** the contrast of white text on an hsl colour (WCAG 2) */
export const whiteContrast = (h: number, s: number, l: number) => 1.05 / (lum(hslToRgb(h, s, l)) + 0.05);
const AA = 4.6;
const lightCache = new Map<number, number>();
/** the two stops of a placeholder's gradient on `hue`: as light as white initials stay AA-readable (≥ 4.5 : 1) */
export function placeholderStops(hue: number): { from: string; to: string; l: number } {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  let l = lightCache.get(h);
  if (l === undefined) {
    l = 46;
    while (l > 20 && whiteContrast(h, 55, l) < AA) l--;
    lightCache.set(h, l);
  }
  return { from: `hsl(${h} 55% ${l}%)`, to: `hsl(${(h + 28) % 360} 60% ${Math.max(14, l - 14)}%)`, l };
}

/** a stable colour pair and initials per orchestra: "Carlos Di Sarli" → CS on its own hue */
export function orchestraPlaceholder(
  id: string,
  name: string,
): { initials: string; from: string; to: string } {
  const words = name
    .replace(/\(.*?\)/g, "")
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}']/gu, ""))
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words[words.length - 1]!.replace(/^[dD]'/, "")[0] ?? "") : "";
  let h = 0;
  for (const ch of id || name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const { from, to } = placeholderStops(h % 360);
  return { initials: `${first}${last}`.toUpperCase(), from, to };
}

/** A stable placeholder per orchestra for the Booth: initials of its surname and a hue (0–359). */
export function placeholderFor(orchestra: string): { initials: string; hue: number } {
  const sur = surnameOf(orchestra || "?");
  const parts = sur.split(/[\s']+/).filter(Boolean);
  const initials =
    parts.length > 1
      ? parts
          .map((w) => w[0]!.toUpperCase())
          .join("")
          .slice(0, 2)
      : (parts[0]?.[0] ?? "?").toUpperCase();
  let h = 2166136261;
  for (const ch of orchestra) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return { initials, hue: (h >>> 0) % 360 };
}

/* ---------- one resolver for every <Artwork> ---------- */

/**
 * Where a cover comes from, in order: (a) the DJ's own or their sources' cover (`src`), (b) the shipped Deezer match
 * (`resolved.artwork`), (c) the shipped Spotify cover (data/cache/artwork.json, through GET /api/artwork), (d) a live
 * lookup (GET /api/artwork?uri=…, kept on this device), (e) the orchestra's placeholder. Each image that fails to
 * load falls to the next; none is ever shown broken.
 */
export type Entity =
  | Pick<Song, "id">
  | (Pick<Cortina, "id"> & { resolved?: { artwork?: string; provider?: string; id?: string } | null })
  | Song
  | Cortina
  | null
  | undefined;
export type ArtSource = "dj" | "deezer" | "spotify" | "live";
export interface ArtCandidate {
  url: string;
  from: ArtSource;
}

const IMAGE = /^https:\/\/[^\s"'<>]+$/;
const ok = (u: unknown): u is string => typeof u === "string" && IMAGE.test(u);
type Loose = {
  id?: string;
  resolved?: { artwork?: string; provider?: string; id?: string } | null;
  spotify?: { uri?: string; url?: string } | null;
};
const loose = (e: Entity) => (e ?? {}) as Loose;

/** every cover there is for a side, best first, without repeats */
export function artworkSources(o: {
  src?: string | null;
  entity?: Entity;
  shipped?: Readonly<Record<string, string>> | null;
  device?: Readonly<Record<string, string>> | null;
}): ArtCandidate[] {
  const e = loose(o.entity);
  const out: ArtCandidate[] = [];
  const push = (url: unknown, from: ArtSource) => {
    if (ok(url) && !out.some((c) => c.url === url)) out.push({ url, from });
  };
  push(o.src, "dj");
  push(e.resolved?.artwork, "deezer");
  if (e.id) {
    push(o.shipped?.[e.id], "spotify");
    push(o.device?.[e.id], "live");
  }
  return out;
}

/** the cover to show: the first candidate whose image has not failed, or null for the placeholder */
export function pickCover(list: readonly ArtCandidate[], failed: ReadonlySet<string>): ArtCandidate | null {
  return list.find((c) => !failed.has(c.url)) ?? null;
}

/** The cover URL for a side or cortina, or null. `cache` maps an id to a cover found earlier (Spotify). */
export function coverFor(e: Entity, cache?: Record<string, string>): string | null {
  return artworkSources({ entity: e, shipped: cache })[0]?.url ?? null;
}

/* ---------- (c) the shipped cache: fetched once per session from GET /api/artwork ---------- */

let shipped: Record<string, string> | null = null;
let shippedP: Promise<Record<string, string>> | null = null;
let shippedRetryAt = 0;
const shippedSubs = new Set<() => void>();

export const shippedCovers = (): Record<string, string> | null => shipped;
export function subscribeShipped(cb: () => void): () => void {
  shippedSubs.add(cb);
  return () => shippedSubs.delete(cb);
}
/** loads the shipped id → cover map once; an unreachable server leaves it empty (and is asked again on next use) */
export function loadShippedCovers(f: typeof fetch = (...a) => fetch(...a)): Promise<Record<string, string>> {
  if (shippedP) return shippedP;
  if (shipped && Date.now() < shippedRetryAt) return Promise.resolve(shipped);
  const p = f("/api/artwork")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { covers?: Record<string, unknown> }) => {
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(j?.covers ?? {})) if (ok(v)) m[k] = v;
      return m;
    })
    .catch(() => {
      shippedP = null;
      shippedRetryAt = Date.now() + 30_000;
      return shipped ?? ({} as Record<string, string>);
    })
    .then((m) => {
      shipped = m;
      for (const cb of shippedSubs) cb();
      return m;
    });
  shippedP = p;
  return p;
}

/* ---------- (d) the device cache: covers looked up live, once per recording, kept on this device ---------- */

const KEY = "tdj-artwork-v1";
const DEVICE_MAX = 4000;
let mem: Record<string, string> | null = null;

export function artworkCache(): Record<string, string> {
  if (mem) return mem;
  mem = {};
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j ?? {})) if (ok(v)) mem[k] = v;
    }
  } catch {}
  return mem;
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(artworkCache()));
  } catch {}
}
export function rememberCover(id: string, url: string) {
  const c = artworkCache();
  delete c[id];
  c[id] = url;
  const keys = Object.keys(c);
  for (let i = 0; i < keys.length - DEVICE_MAX; i++) delete c[keys[i]!];
  persist();
}
/** a remembered cover that no longer loads is dropped, so the next visit looks again */
export function forgetCover(id: string, url: string) {
  const c = artworkCache();
  if (c[id] !== url) return;
  delete c[id];
  persist();
}

/** at most `max` tasks at once; the rest wait their turn (the live lookups: only for rows on screen, ~6 at a time) */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const go = queue.shift();
    if (go) go();
  };
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          active++;
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        });
        next();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}
export const LIVE_CONCURRENCY = 6;
const limiter = createLimiter(LIVE_CONCURRENCY);

/**
 * what the route needs to look a side up: its Spotify recording and/or its Deezer match; else (2026-11) the side
 * itself for a search climbed like "Find on services" — the singer first for a solo singer's side with guitars, the
 * leader's surname, the aliases, the folded title (lib/findMatch.ts queryLadder, on the route); null when it has
 * nothing to look up by
 */
export function liveQuery(
  e: Entity,
): { key: string; qs: string; spotifyUrl?: string; search?: boolean } | null {
  const x = loose(e);
  const track =
    x.spotify?.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1] ??
    x.spotify?.url?.match(/^https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/)?.[1];
  const dz =
    x.resolved?.provider === "deezer" && /^\d{1,15}$/.test(x.resolved.id ?? "") ? x.resolved.id : undefined;
  if (!track && !dz) return searchQuery(e);
  const p = new URLSearchParams();
  if (track) p.set("uri", `spotify:track:${track}`);
  if (dz) p.set("deezer", dz);
  return {
    key: `${track ?? ""}|${dz ?? ""}`,
    qs: p.toString(),
    ...(track ? { spotifyUrl: `https://open.spotify.com/track/${track}` } : {}),
  };
}

type Side = {
  id?: string;
  title?: string;
  orchestra?: string;
  singer?: string | null;
  vocal?: boolean;
  year?: number | null;
  durationSec?: number | null;
  altTitles?: string[];
  /** a cortina is never searched for (its artist is no orchestra) */
  artist?: string;
};
/** a side with no recording to ask about: the search's parameters (the catalogue id lets the route use its record) */
export function searchQuery(e: Entity): { key: string; qs: string; search: true } | null {
  const s = (e ?? {}) as Side;
  if (!s.id || !s.title || !s.orchestra || s.artist !== undefined) return null;
  const p = new URLSearchParams({ search: "1", id: s.id, title: s.title, orchestra: s.orchestra });
  if (s.singer) p.set("singer", s.singer);
  if (typeof s.vocal === "boolean") p.set("vocal", s.vocal ? "1" : "0");
  if (s.year) p.set("year", String(s.year));
  if (s.durationSec) p.set("dur", String(Math.round(s.durationSec)));
  for (const a of (s.altTitles ?? []).slice(0, 3)) p.append("alt", a);
  return { key: `s:${s.id}`, qs: p.toString(), search: true };
}

/** Spotify's public oEmbed straight from the page (CORS-open): the fallback when the route cannot be reached */
export type CoverLookup = (spotifyUrl: string) => Promise<string | null>;
export const spotifyOEmbed: CoverLookup = async (url) => {
  const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { thumbnail_url?: string } | null;
  return ok(j?.thumbnail_url) ? j.thumbnail_url : null;
};

/** the route's answer: a cover, or none (`final`: the provider has none; else try again on a later visit) */
export async function fetchLiveCover(
  q: { qs: string; spotifyUrl?: string },
  f: typeof fetch = (...a) => fetch(...a),
  direct: CoverLookup = spotifyOEmbed,
): Promise<{ url: string | null; final: boolean }> {
  const r = await f(`/api/artwork?${q.qs}`).catch(() => null);
  if (r?.ok) {
    const j = (await r.json().catch(() => null)) as { url?: unknown; retry?: boolean } | null;
    if (ok(j?.url)) return { url: j.url, final: true };
    if (j && !j.retry) return { url: null, final: true };
  }
  // no route (an older linked server, a static host) or its upstream unreachable: ask Spotify from the page
  const u = q.spotifyUrl ? await direct(q.spotifyUrl).catch(() => null) : null;
  return { url: u, final: false };
}

const inflight = new Map<string, Promise<string | null>>();
const none = new Set<string>();

/** (d) the live cover for a side (once per recording and session; at most LIVE_CONCURRENCY at a time) */
export function lookupCover(
  e: Entity,
  o: { fetch?: typeof fetch; direct?: CoverLookup; limit?: ReturnType<typeof createLimiter> } = {},
): Promise<string | null> {
  const id = loose(e).id;
  const q = liveQuery(e);
  if (!id || !q) return Promise.resolve(null);
  const hit = artworkCache()[id];
  if (hit) return Promise.resolve(hit);
  if (none.has(q.key)) return Promise.resolve(null);
  let p = inflight.get(q.key);
  if (!p) {
    p = (o.limit ?? limiter)
      .run(() => fetchLiveCover(q, o.fetch, o.direct))
      .then(({ url, final }) => {
        if (url) rememberCover(id, url);
        // (a search that could not be answered is not asked again this session: no page-side fallback exists)
        else if (final || q.search) none.add(q.key);
        return url;
      })
      .catch(() => null)
      .finally(() => inflight.delete(q.key));
    inflight.set(q.key, p);
  }
  return p.then((u) => {
    if (u && !artworkCache()[id]) rememberCover(id, u);
    return u;
  });
}

/** the Booth's older name for the live lookup */
export const loadArtwork = (e: Entity) => lookupCover(e);

/** tests: forget the session's state */
export function resetArtworkState() {
  shipped = null;
  shippedP = null;
  shippedRetryAt = 0;
  mem = null;
  inflight.clear();
  none.clear();
}
