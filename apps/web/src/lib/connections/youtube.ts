import { KEYCHAIN_KEY } from "@/lib/app/target";
import type { ByoState, Invoke } from "./byo";

/**
 * 2026-11 — "Find a video" (the Now playing view) without a Google sign-in. Three ways, tried in this order:
 *   1. `own`: the DJ's own YouTube Data API key, from this browser straight to Google (the apps: from the native
 *      side, the key read from the Keychain, src-tauri/src/byo.rs). The key never reaches a TDJ server.
 *   2. `server`: the deployment's `YOUTUBE_API_KEY` (GET /api/youtube/search), when the owner set one.
 *   3. `google`: the DJ's Google sign-in with the YouTube permission (POST /api/google/youtube `{ search }`).
 * A search costs 100 of the key's 10,000 daily units, whichever way it goes.
 */
export const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";

export interface FoundVideo {
  videoId: string;
  title: string;
  channel: string;
  thumb: string | null;
}
export type VideoSearch =
  | { ok: true; videos: FoundVideo[]; via: YoutubeWay }
  | { ok: false; error: "connect" | "quota" | "key" | "error" };
export type YoutubeWay = "own" | "server" | "google";

/** The search request of a key: five embeddable videos. */
export function youtubeSearchUrl(q: string, key: string): string {
  const u = new URL(YOUTUBE_SEARCH_API);
  u.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "5",
    videoEmbeddable: "true",
    q: q.slice(0, 200),
    key,
  }).toString();
  return u.toString();
}

/** YouTube's search answer → the videos (ids checked), the same shape the server route answers with. */
export function parseYoutubeSearch(j: unknown): FoundVideo[] {
  const items = (j as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: FoundVideo[] = [];
  for (const x of items as Array<{
    id?: { videoId?: unknown };
    snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } };
  }>) {
    const id = x?.id?.videoId;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
    out.push({
      videoId: id,
      title: x.snippet?.title ?? "",
      channel: x.snippet?.channelTitle ?? "",
      thumb: x.snippet?.thumbnails?.medium?.url ?? null,
    });
  }
  return out;
}

/** Google's error answer for a key: the daily quota, or a key that is wrong / restricted elsewhere. */
export function keyError(status: number, body: string): "quota" | "key" | "error" {
  if (/quotaExceeded|dailyLimitExceeded|rateLimitExceeded/i.test(body)) return "quota";
  if (status === 400 || status === 403) return "key";
  return "error";
}

export interface SearchDeps {
  app: boolean;
  byo: ByoState;
  fetch: typeof fetch;
  invoke?: Invoke;
}

/** The ways to try, in order, for what this device and deployment have. */
export function youtubeWays(o: { app: boolean; ownKey: boolean; linkedServer?: boolean }): YoutubeWay[] {
  const ways: YoutubeWay[] = [];
  if (o.ownKey) ways.push("own");
  // the standalone apps have no server: /api/* is answered on the device, which has neither of the others
  if (!o.app || o.linkedServer) ways.push("server", "google");
  return ways;
}

async function searchOwn(q: string, d: SearchDeps): Promise<VideoSearch> {
  const key = d.byo.youtubeKey ?? "";
  if (d.app || key === KEYCHAIN_KEY) {
    if (!d.invoke) return { ok: false, error: "error" };
    try {
      const r = (await d.invoke("byo_youtube_search", { q: q.slice(0, 200) })) as {
        status: number;
        body: string;
      };
      if (r.status !== 200) return { ok: false, error: keyError(r.status, r.body) };
      return { ok: true, via: "own", videos: parseYoutubeSearch(JSON.parse(r.body)) };
    } catch {
      return { ok: false, error: "error" };
    }
  }
  try {
    // straight to Google: no cookie, no referrer to a TDJ server, nothing else in the request
    const r = await d.fetch(youtubeSearchUrl(q, key), { credentials: "omit", referrerPolicy: "no-referrer" });
    const body = await r.text();
    if (!r.ok) return { ok: false, error: keyError(r.status, body) };
    return { ok: true, via: "own", videos: parseYoutubeSearch(JSON.parse(body)) };
  } catch {
    return { ok: false, error: "error" };
  }
}

async function searchServer(q: string, d: SearchDeps): Promise<VideoSearch | null> {
  try {
    const r = await d.fetch(`/api/youtube/search?${new URLSearchParams({ q: q.slice(0, 200) })}`);
    // 404: the deployment has no key of its own (or is an older one without the route) → the next way
    if (r.status === 404) return null;
    const j = (await r.json().catch(() => ({}))) as { videos?: FoundVideo[]; error?: string };
    if (r.status === 429) return { ok: false, error: "quota" };
    if (!r.ok) return { ok: false, error: "error" };
    return { ok: true, via: "server", videos: j.videos ?? [] };
  } catch {
    return null;
  }
}

async function searchGoogle(q: string, d: SearchDeps): Promise<VideoSearch> {
  try {
    const r = await d.fetch("/api/google/youtube", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search: q }),
    });
    if (r.status === 401 || r.status === 403 || r.status === 404) return { ok: false, error: "connect" };
    if (r.status === 429) return { ok: false, error: "quota" };
    if (!r.ok) return { ok: false, error: "error" };
    const j = (await r.json()) as { videos?: FoundVideo[] };
    return { ok: true, via: "google", videos: j.videos ?? [] };
  } catch {
    return { ok: false, error: "error" };
  }
}

/**
 * Five candidate videos for `q`, the first way that answers. Your own key's failure (quota, a wrong key) is said
 * as it is and not hidden behind another way: the DJ chose that key.
 */
export async function findVideos(q: string, d: SearchDeps & { linkedServer?: boolean }): Promise<VideoSearch> {
  const ways = youtubeWays({ app: d.app, ownKey: !!d.byo.youtubeKey, linkedServer: d.linkedServer });
  if (!ways.length) return { ok: false, error: "connect" };
  for (const w of ways) {
    if (w === "own") return searchOwn(q, d);
    if (w === "server") {
      const r = await searchServer(q, d);
      if (r) return r;
      continue;
    }
    return searchGoogle(q, d);
  }
  return { ok: false, error: "connect" };
}
