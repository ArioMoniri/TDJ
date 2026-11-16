import type { ApiDeps } from "./deps";
import { bad, bodyJson, jsonNoStore } from "./http";

/**
 * POST /api/lyrics { provider, key, title, artist, durationSec? } — the opt-in lyrics sources with the DJ's own key
 * (Settings → Connections → Lyrics). Their APIs do not answer a browser (no CORS), so this passes one search
 * through: the key comes with the request and is used for that call only — never stored, never logged.
 * - musixmatch: the official API's matcher (its free tier gives part of the text, which says so); its copyright
 *   line and tracking pixel come back with the words, as its terms ask;
 * - genius: the official search API, which gives songs and their page URLs only (credits and a link — the words
 *   are never fetched from its pages).
 */
type Body = { provider?: unknown; key?: unknown; title?: unknown; artist?: unknown; durationSec?: unknown };
const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const PARTIAL = /\*{3,}.*not for commercial use.*\*{3,}/i;

export async function lyricsSource(req: Request, d: ApiDeps): Promise<Response> {
  const denied = await d.guard(req);
  if (denied) return denied;
  const b = await bodyJson<Body>(req);
  if (!b || typeof b !== "object") return bad("Body must be an object");
  const provider = str(b.provider, 20);
  const key = str(b.key, 200);
  const title = str(b.title);
  const artist = str(b.artist);
  if (!key) return bad("key required");
  if (!title) return bad("title required");
  try {
    if (provider === "musixmatch") {
      const q = new URLSearchParams({ q_track: title, q_artist: artist, apikey: key, format: "json" });
      const r = await d.fetch(`https://api.musixmatch.com/ws/1.1/matcher.lyrics.get?${q}`, {
        headers: { accept: "application/json" },
      });
      const j = (await r.json().catch(() => null)) as {
        message?: {
          header?: { status_code?: number };
          body?: {
            lyrics?: {
              lyrics_id?: number;
              lyrics_body?: string;
              lyrics_copyright?: string;
              pixel_tracking_url?: string;
              explicit?: number;
            };
          };
        };
      } | null;
      const status = j?.message?.header?.status_code ?? r.status;
      if (status === 401 || status === 402 || status === 403) return jsonNoStore({ state: "key" });
      if (status === 404) return jsonNoStore({ state: "none" });
      const l = j?.message?.body?.lyrics;
      if (status !== 200 || !l?.lyrics_body?.trim()) return jsonNoStore({ state: "none" });
      const partial = PARTIAL.test(l.lyrics_body);
      return jsonNoStore({
        state: "ok",
        lyrics: {
          id: l.lyrics_id ?? 0,
          text: l.lyrics_body.replace(PARTIAL, "").trim(),
          partial,
          copyright: l.lyrics_copyright ?? "",
          pixel: l.pixel_tracking_url ?? "",
        },
      });
    }
    if (provider === "genius") {
      const r = await d.fetch(
        `https://api.genius.com/search?${new URLSearchParams({ q: `${title} ${artist}` })}`,
        {
          headers: { accept: "application/json", authorization: `Bearer ${key}` },
        },
      );
      if (r.status === 401 || r.status === 403) return jsonNoStore({ state: "key" });
      if (!r.ok) return jsonNoStore({ state: "error" });
      const j = (await r.json().catch(() => null)) as {
        response?: {
          hits?: Array<{
            result?: { id?: number; title?: string; url?: string; primary_artist?: { name?: string } };
          }>;
        };
      } | null;
      const hits = (j?.response?.hits ?? [])
        .map((h) => h.result)
        .filter((x): x is NonNullable<typeof x> => !!x?.url && /^https:\/\/genius\.com\//.test(x.url))
        .slice(0, 5)
        .map((x) => ({
          id: x.id ?? 0,
          title: x.title ?? "",
          artist: x.primary_artist?.name ?? "",
          url: x.url!,
        }));
      return jsonNoStore({ state: "ok", hits });
    }
    return bad("unknown provider");
  } catch {
    return jsonNoStore({ state: "error" });
  }
}
