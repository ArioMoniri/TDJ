import type { ResolvedTrack } from "@tdj/core";
import {
  FIND_STRONG,
  type FindService,
  type FindSide,
  type FoundRec,
  queryLadder,
  rankFound,
  type Why,
} from "@/lib/findMatch";
import { linkExpiry } from "@/lib/server/previewLink";
import { searchTracks } from "@/lib/spotifyWeb";
import type { ApiDeps } from "./deps";
import { bodyJson, json, redirect } from "./http";

/**
 * The keyless lookups: Deezer previews and search, MusicBrainz recordings — and (2026-11) the DJ's own Spotify for
 * "Find on services". On the server they go out through Node's fetch; in the apps through the native HTTP client
 * (api.deezer.com sends no CORS headers), never through a TDJ server.
 */

const UA = "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)";

export interface ResolveCandidate extends ResolvedTrack {
  year?: number | null;
  /** Spotify: the track the DJ's account plays (binding it lets the side play in full with Premium) */
  uri?: string;
  /** why it matches (title, leader, singer, length, year) or what leaves it unsure: the sheet shows them */
  why?: Why[];
}
/** each service's answer: searched (`ok`, with how many queries), not offered here, not connected, rate limited */
export interface ResolveService {
  id: FindService;
  state: "ok" | "off" | "signed-out" | "busy" | "error";
  queries: number;
}
export interface ResolveResponse {
  candidates: ResolveCandidate[];
  suggestions: { year?: number; singer?: string; durationSec?: number };
  services?: ResolveService[];
  /** candidates the core match rules refused (tribute albums, covers, another singer or title) */
  refused?: number;
  error?: string;
}

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  link: string;
  artist: { name: string };
  album: { title: string; cover_medium: string };
}
interface MbRecording {
  id: string;
  title: string;
  length?: number;
  "first-release-date"?: string;
  "artist-credit"?: Array<{ name: string; artist?: { name: string } }>;
  releases?: Array<{ date?: string }>;
}

async function deezer(d: ApiDeps, q: string, signal: AbortSignal): Promise<DeezerTrack[]> {
  const r = await d.fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`, {
    headers: { "user-agent": UA },
    signal,
  });
  if (!r.ok) throw new Error(`Deezer ${r.status}`);
  const j = (await r.json()) as { data?: DeezerTrack[] };
  return j.data ?? [];
}

/* ---------- MusicBrainz: one request per second per instance, Lucene-safe queries ---------- */

/** MusicBrainz allows 1 request/second per source address; the queue spaces every call from this instance. */
export const MB_INTERVAL_MS = 1100;
let mbInterval = MB_INTERVAL_MS;
/** tests only: space MusicBrainz calls by `ms` instead (a mocked MusicBrainz has no rate limit) */
export const setMbIntervalForTests = (ms: number) => {
  mbInterval = ms;
};
let mbNext = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function mbSlot(signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, mbNext);
  mbNext = at + mbInterval;
  if (at > now) await sleep(at - now);
  if (signal?.aborted) throw new Error("MusicBrainz lookup timed out");
}
/** A phrase inside a quoted Lucene term: only the quote and the backslash need escaping there. */
export const luceneEsc = (s: string) => s.replace(/["\\]/g, "\\$&");
export const mbQuery = (title: string, orchestra: string) =>
  `recording:"${luceneEsc(title)}" AND artist:"${luceneEsc(orchestra)}"`;

async function musicbrainz(d: ApiDeps, q: string, signal: AbortSignal): Promise<MbRecording[]> {
  await mbSlot(signal);
  const r = await d.fetch(
    `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    { headers: { "user-agent": UA, accept: "application/json" }, signal },
  );
  if (!r.ok) throw new Error(`MusicBrainz ${r.status}`);
  const j = (await r.json()) as { recordings?: MbRecording[] };
  return j.recordings ?? [];
}

const yearOf = (date?: string) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);
/** The earliest dated release of a recording, else its `first-release-date`; reissues come later, originals first. */
export function recordingYear(r: Pick<MbRecording, "first-release-date" | "releases">): number | null {
  const years = (r.releases ?? []).map((x) => yearOf(x.date)).filter((y): y is number => y !== null);
  const first = yearOf(r["first-release-date"]);
  if (first !== null) years.push(first);
  return years.length ? Math.min(...years) : null;
}
/**
 * A year worth suggesting: plausible, and within 5 years of the catalogue's own when it has one. A CD reissue
 * date (2008 for a 1935 Canaro) is never offered as "the year".
 */
export const YEAR_TOLERANCE = 5;
export const suggestYear = (year: number | null, catalogueYear: number | null): number | null => {
  if (year === null || year < 1900 || year > 2030) return null;
  if (catalogueYear !== null && Math.abs(year - catalogueYear) > YEAR_TOLERANCE) return null;
  return year === catalogueYear ? null : year;
};

/** one service's ladder: query after query until the side's own recording is in hand (or the ladder ends) */
async function climb<T extends FoundRec & { key: string }>(
  svc: FindService,
  side: FindSide,
  ask: (q: string) => Promise<T[]>,
  signal: AbortSignal,
): Promise<{ items: Array<T & { score: number; why: Why[] }>; queries: number; refused: number }> {
  const seen = new Map<string, T>();
  let queries = 0;
  for (const rung of queryLadder(svc, side)) {
    if (signal.aborted) break;
    queries++;
    for (const it of await ask(rung.q)) if (!seen.has(it.key)) seen.set(it.key, it);
    const top = rankFound(side, [...seen.values()]).ranked[0];
    if (top && top.score >= FIND_STRONG) break;
  }
  const r = rankFound(side, [...seen.values()]);
  return {
    items: r.ranked.map((x) => ({ ...x.item, score: x.score, why: x.why })),
    queries,
    refused: r.refused,
  };
}
/** how many candidates each service shows */
const PER_SERVICE = 3;
const failed = (e: unknown, who: string) => (e instanceof Error && e.message ? e.message : `${who} failed`);

/**
 * POST { id | title, orchestra, singer?, year?, vocal?, durationSec? } → the candidates of every connected service:
 * Deezer (a 30 s preview and the cover), MusicBrainz (the recording's year), Spotify through the DJ's own session
 * (the track a Premium account plays in full). Each service climbs its query ladder (lib/findMatch.ts); its
 * candidates are judged by the core match rules and scored with their reasons; up to three per service, best first.
 * The year suggestion comes from MusicBrainz only (the earliest release of the best recording; streaming album
 * dates are reissues) and only when it is near the catalogue year. Never fails loudly: an upstream error returns 200
 * with that service's state and an `error` string.
 */
export async function resolve(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object") return json({ error: "Invalid JSON" }, { status: 400 });
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const num = (k: string) =>
    typeof body[k] === "number" && Number.isFinite(body[k]) ? (body[k] as number) : null;
  let side: FindSide = {
    title: str("title"),
    orchestra: str("orchestra"),
    singer: str("singer") || null,
    year: num("year"),
    durationSec: num("durationSec"),
    ...(typeof body.vocal === "boolean" ? { vocal: body.vocal } : {}),
  };
  if (typeof body.id === "string") {
    const id = body.id;
    const cat = d.catalog().catalog;
    const s = cat.songs.find((x) => x.id === id || x.altIds?.includes(id));
    if (s)
      side = {
        title: side.title || s.title,
        orchestra: side.orchestra || s.orchestra,
        singer: side.singer ?? s.singer ?? null,
        vocal: side.vocal ?? s.vocal,
        year: side.year ?? s.year ?? null,
        yearApprox: s.yearApprox,
        date: s.date ?? null,
        durationSec: side.durationSec ?? s.durationSec ?? null,
        durationEstimated: side.durationSec ? false : s.durationEstimated,
        altTitles: s.altTitles,
        rhythm: s.rhythm,
        orchestraAliases: cat.profiles?.get?.(s.orchestraId)?.aliases,
        laterTakes: s.laterTakes,
        vocalTwins: s.vocalTwins,
      };
  }
  if (!side.title || !side.orchestra) return json({ error: "title and orchestra required" }, { status: 400 });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  const services: ResolveService[] = [];
  let refused = 0;
  const out: ResolveResponse = { candidates: [], suggestions: {}, services };
  const errors: string[] = [];
  const now = new Date().toISOString();
  let setCookie: string | undefined;
  const dz = climb(
    "deezer",
    side,
    async (q) =>
      (await deezer(d, q, ac.signal)).map((t) => ({
        key: String(t.id),
        t,
        title: t.title,
        artists: [t.artist.name],
        album: t.album.title,
        durationMs: t.duration * 1000,
        mainArtistOnly: true,
      })),
    ac.signal,
  );
  const mb = climb(
    "musicbrainz",
    side,
    async (q) =>
      (await musicbrainz(d, q, ac.signal)).map((r) => ({
        key: r.id,
        r,
        title: r.title,
        artists: (r["artist-credit"] ?? []).map((a) => a.name ?? a.artist?.name ?? "").filter(Boolean),
        durationMs: r.length ?? null,
        year: recordingYear(r),
      })),
    ac.signal,
  );
  const sp = (async () => {
    if (!(await d.spotify.enabled().catch(() => false))) return "off" as const;
    const s = await d.spotify.session(req).catch(() => null);
    if (!s) return "signed-out" as const;
    setCookie = s.setCookie;
    return climb(
      "spotify",
      side,
      async (q) =>
        (await searchTracks(s.access, q, 10)).map((t) => ({
          key: t.uri,
          t,
          title: t.title,
          artists: t.artists,
          album: t.album,
          durationMs: t.durationSec ? t.durationSec * 1000 : null,
          release: t.year ? String(t.year) : null,
        })),
      ac.signal,
    );
  })();
  const [dzR, mbR, spR] = await Promise.allSettled([dz, mb, sp]);
  clearTimeout(timer);
  const cands: ResolveCandidate[] = [];
  if (dzR.status === "fulfilled") {
    services.push({ id: "deezer", state: "ok", queries: dzR.value.queries });
    refused += dzR.value.refused;
    for (const x of dzR.value.items.slice(0, PER_SERVICE))
      cands.push({
        provider: "deezer",
        id: String(x.t.id),
        title: x.t.title,
        artist: x.t.artist.name,
        album: x.t.album.title,
        durationMs: x.t.duration * 1000,
        previewUrl: x.t.preview || null,
        url: x.t.link,
        artwork: x.t.album.cover_medium,
        matchedAt: now,
        confidence: x.score,
        why: x.why,
      });
  } else {
    services.push({ id: "deezer", state: "error", queries: 0 });
    errors.push(failed(dzR.reason, "Deezer"));
  }
  if (mbR.status === "fulfilled") {
    services.push({ id: "musicbrainz", state: "ok", queries: mbR.value.queries });
    refused += mbR.value.refused;
    const recs = mbR.value.items.map((x) => ({
      provider: "musicbrainz" as const,
      id: x.r.id,
      title: x.r.title,
      artist: x.artists.join(", "),
      year: x.year ?? null,
      durationMs: x.r.length,
      previewUrl: null,
      url: `https://musicbrainz.org/recording/${x.r.id}`,
      matchedAt: now,
      confidence: x.score,
      why: x.why,
    }));
    cands.push(...recs.slice(0, PER_SERVICE));
    const best = recs.find((r) => r.confidence >= 0.6);
    const year = suggestYear(best?.year ?? null, side.year ?? null);
    if (year) out.suggestions.year = year;
    const dur = recs.find((r) => r.confidence >= 0.6 && r.durationMs && r.durationMs > 90_000);
    if (dur?.durationMs) out.suggestions.durationSec = Math.round(dur.durationMs / 1000);
    // a singer named in the artist credit ("Juan D'Arienzo feat. Alberto Echagüe") that the catalogue lacks
    const m = /(?:feat\.?|con|canta|with)\s+([^,;()]+)/i.exec(best?.artist ?? "");
    if (m && !side.singer) out.suggestions.singer = m[1]!.trim();
  } else {
    services.push({ id: "musicbrainz", state: "error", queries: 0 });
    errors.push(failed(mbR.reason, "MusicBrainz"));
  }
  if (spR.status === "fulfilled") {
    const v = spR.value;
    if (typeof v === "string") services.push({ id: "spotify", state: v, queries: 0 });
    else {
      services.push({ id: "spotify", state: "ok", queries: v.queries });
      refused += v.refused;
      for (const x of v.items.slice(0, PER_SERVICE))
        cands.push({
          provider: "spotify",
          id: x.t.id,
          uri: x.t.uri,
          title: x.t.title,
          artist: x.t.artists.join(", "),
          album: x.t.album,
          durationMs: x.durationMs ?? undefined,
          previewUrl: x.t.previewUrl ?? null,
          url: x.t.url,
          matchedAt: now,
          confidence: x.score,
          why: x.why,
        });
    }
  } else {
    const busy = (spR.reason as { status?: number } | null)?.status === 429;
    services.push({ id: "spotify", state: busy ? "busy" : "error", queries: 0 });
    errors.push(failed(spR.reason, "Spotify"));
  }
  const order: Record<string, number> = { spotify: 0, deezer: 1, musicbrainz: 2 };
  out.candidates = cands.sort(
    (a, b) => b.confidence - a.confidence || (order[a.provider] ?? 3) - (order[b.provider] ?? 3),
  );
  out.refused = refused;
  if (errors.length) out.error = errors.join("; ");
  const res = json(out);
  if (setCookie) res.headers.append("set-cookie", setCookie);
  return res;
}

/** GET: keyless connector status for Settings (Deezer and MusicBrainz reachability). */
export async function resolveStatus(_req: Request, d: ApiDeps): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  const ping = async (url: string, slot = false) => {
    try {
      if (slot) await mbSlot(ac.signal);
      const r = await d.fetch(url, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: ac.signal,
      });
      return r.ok;
    } catch {
      return false;
    }
  };
  const [deezerOk, mbOk] = await Promise.all([
    ping("https://api.deezer.com/infos"),
    ping("https://musicbrainz.org/ws/2/recording/?query=cumparsita&fmt=json&limit=1", true),
  ]);
  clearTimeout(timer);
  return json({ deezer: deezerOk, musicbrainz: mbOk }, { headers: { "cache-control": "no-store" } });
}

/**
 * Fresh 30 s preview for a resolved track. Deezer preview links are signed and expire within minutes, so the cached
 * `previewUrl` in data/cache/resolve is only a hint: at play time we ask Deezer for the current link (keyless,
 * `GET /track/{id}`), cache it per instance until a minute before the link's own expiry (`hdnea=exp=<unix s>`;
 * Deezer signs them for ~15 min, so a 6 h cache handed out dead links → 403), and either redirect the <audio>
 * element to it or hand it to the analyser as JSON (`?json=1`; Deezer previews allow cross-origin fetches).
 * `&fresh=1` skips the cache (the client's one retry after a 403).
 */
const previewCache = new Map<string, { url: string; until: number }>();

async function freshPreview(d: ApiDeps, provider: string, id: string, force = false): Promise<string | null> {
  const key = `${provider}:${id}`;
  const hit = previewCache.get(key);
  if (!force && hit && Date.now() < hit.until) return hit.url;
  if (provider !== "deezer" || !/^\d+$/.test(id)) return null;
  const r = await d
    .fetch(`https://api.deezer.com/track/${id}`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    })
    .catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { preview?: string };
  if (!j.preview) return null;
  previewCache.set(key, { url: j.preview, until: linkExpiry(j.preview) });
  return j.preview;
}

/** for tests: forget the signed links this instance handed out */
export const clearPreviewCache = () => previewCache.clear();

export async function preview(req: Request, d: ApiDeps): Promise<Response> {
  const u = new URL(req.url);
  const provider = u.searchParams.get("provider") ?? "deezer";
  const id = u.searchParams.get("id") ?? "";
  const url = await freshPreview(d, provider, id, u.searchParams.get("fresh") === "1");
  if (!url) return json({ error: "No preview available for this track." }, { status: 404 });
  if (u.searchParams.get("json"))
    return json({ url }, { headers: { "cache-control": "private, max-age=60" } });
  return redirect(url, 302, { "cache-control": "private, max-age=60" });
}
