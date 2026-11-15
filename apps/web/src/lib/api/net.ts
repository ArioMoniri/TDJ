import { normTitle, type ResolvedTrack } from "@tdj/core";
import { linkExpiry } from "@/lib/server/previewLink";
import type { ApiDeps } from "./deps";
import { bodyJson, json, redirect } from "./http";

/**
 * The keyless lookups: Deezer previews and search, MusicBrainz recordings. On the server they go out through Node's
 * fetch; in the apps through the native HTTP client (api.deezer.com sends no CORS headers), never through a TDJ
 * server.
 */

const UA = "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)";
const surname = (o: string) =>
  normTitle(o)
    .split(" ")
    .filter((w) => w.length > 2)
    .pop() ?? "";

export interface ResolveCandidate extends ResolvedTrack {
  year?: number | null;
}
export interface ResolveResponse {
  candidates: ResolveCandidate[];
  suggestions: { year?: number; singer?: string; durationSec?: number };
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

/** Mirrors scripts/resolve_catalog.ts: exact title 0.6, prefix 0.4, first word 0.15; orchestra surname 0.35 (album 0.2); singer 0.1. Clamped to 1. */
function score(
  want: { title: string; orchestra: string; singer?: string | null },
  t: { title: string; artist: string; album?: string },
): number {
  const wt = normTitle(want.title);
  const sur = surname(want.orchestra.replace(/\(.*?\)/g, ""));
  const tt = normTitle(t.title);
  const ta = normTitle(t.artist);
  let c = 0;
  if (tt === wt) c += 0.6;
  else if (tt.startsWith(wt) || wt.startsWith(tt)) c += 0.4;
  else if (wt && tt.includes(wt.split(" ")[0]!)) c += 0.15;
  if (sur && ta.includes(sur)) c += 0.35;
  else if (sur && t.album && normTitle(t.album).includes(sur)) c += 0.2;
  if (want.singer && ta.includes(surname(want.singer))) c += 0.1;
  return Math.min(1, Math.round(c * 100) / 100);
}

async function deezer(d: ApiDeps, q: string, signal: AbortSignal): Promise<DeezerTrack[]> {
  const r = await d.fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`, {
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
let mbNext = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function mbSlot(signal?: AbortSignal): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, mbNext);
  mbNext = at + MB_INTERVAL_MS;
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
    `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
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

/**
 * POST { id | title, orchestra, singer?, year? } → up to 5 scored candidates (Deezer previews + MusicBrainz
 * recordings) and suggestions. The year suggestion comes from MusicBrainz only (the earliest release of the best
 * recording; streaming album dates are reissues) and only when it is near the catalogue year.
 * Never fails loudly: an upstream error returns 200 with empty candidates and an `error` string.
 */
export async function resolve(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object") return json({ error: "Invalid JSON" }, { status: 400 });
  let title = typeof body.title === "string" ? body.title.trim() : "";
  let orchestra = typeof body.orchestra === "string" ? body.orchestra.trim() : "";
  let singer = typeof body.singer === "string" ? body.singer.trim() : "";
  let catalogueYear = typeof body.year === "number" && Number.isFinite(body.year) ? body.year : null;
  if (typeof body.id === "string") {
    const s = d.catalog().catalog.songs.find((x) => x.id === body.id);
    if (s) {
      title ||= s.title;
      orchestra ||= s.orchestra;
      singer ||= s.singer ?? "";
      catalogueYear ??= s.year ?? null;
    }
  }
  if (!title || !orchestra) return json({ error: "title and orchestra required" }, { status: 400 });
  const want = { title, orchestra, singer: singer || null };
  const plainOrchestra = orchestra.replace(/\(.*?\)/g, "").trim();
  const q = `${title} ${plainOrchestra}`.trim();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  const out: ResolveResponse = { candidates: [], suggestions: {} };
  const errors: string[] = [];
  try {
    const [dz, mb] = await Promise.allSettled([
      deezer(d, q, ac.signal),
      musicbrainz(d, mbQuery(title, plainOrchestra), ac.signal),
    ]);
    const now = new Date().toISOString();
    if (dz.status === "fulfilled") {
      for (const t of dz.value) {
        const c = score(want, { title: t.title, artist: t.artist.name, album: t.album.title });
        out.candidates.push({
          provider: "deezer",
          id: String(t.id),
          title: t.title,
          artist: t.artist.name,
          album: t.album.title,
          durationMs: t.duration * 1000,
          previewUrl: t.preview || null,
          url: t.link,
          artwork: t.album.cover_medium,
          matchedAt: now,
          confidence: c,
        });
      }
    } else errors.push(dz.reason instanceof Error ? dz.reason.message : "Deezer failed");
    if (mb.status === "fulfilled") {
      const recs = mb.value
        .map((r) => {
          const artist = (r["artist-credit"] ?? []).map((a) => a.name ?? a.artist?.name ?? "").join(" ");
          return {
            provider: "musicbrainz" as const,
            id: r.id,
            title: r.title,
            artist,
            year: recordingYear(r),
            durationMs: r.length,
            previewUrl: null,
            url: `https://musicbrainz.org/recording/${r.id}`,
            matchedAt: now,
            confidence: score(want, { title: r.title, artist }),
          };
        })
        .sort((a, b) => b.confidence - a.confidence);
      out.candidates.push(...recs);
      const best = recs.find((r) => r.confidence >= 0.6);
      const year = suggestYear(best?.year ?? null, catalogueYear);
      if (year) out.suggestions.year = year;
      const dur = recs.find((r) => r.confidence >= 0.6 && r.durationMs && r.durationMs > 90_000);
      if (dur?.durationMs) out.suggestions.durationSec = Math.round(dur.durationMs / 1000);
      // a singer named in the artist credit ("Juan D'Arienzo feat. Alberto Echagüe") that the catalogue lacks
      const credit = best?.artist ?? "";
      const m = /(?:feat\.?|con|canta|with)\s+([^,;()]+)/i.exec(credit);
      if (m && !want.singer) out.suggestions.singer = m[1]!.trim();
    } else errors.push(mb.reason instanceof Error ? mb.reason.message : "MusicBrainz failed");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "lookup failed");
  } finally {
    clearTimeout(timer);
  }
  out.candidates = out.candidates
    .sort((a, b) => b.confidence - a.confidence || (a.provider === "deezer" ? -1 : 1))
    .slice(0, 5);
  if (errors.length) out.error = errors.join("; ");
  return json(out);
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
