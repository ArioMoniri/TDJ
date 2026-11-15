import type { Cortina, Song } from "@tdj/core";
import { surnameOf } from "./songInfo";

/**
 * Round 22 (ROADMAP §12): album art on every row. The catalogue's Deezer cover (`resolved.artwork`) first, then a
 * cached cover found for the side's Spotify recording; without either, a placeholder per orchestra (its initials on
 * a hue of its own), so a set list of the same orchestra reads as one block.
 */
type Entity = Song | Cortina | null | undefined;

const IMAGE = /^https:\/\/[^\s"'<>]+$/;
const ok = (u: unknown): u is string => typeof u === "string" && IMAGE.test(u);

/** The cover URL for a side or cortina, or null. `cache` maps an id to a cover found earlier (Spotify). */
export function artworkFor(e: Entity, cache?: Record<string, string>): string | null {
  if (!e) return null;
  const r = (e as { resolved?: { artwork?: string } | null }).resolved;
  if (ok(r?.artwork)) return r.artwork;
  const c = cache?.[e.id];
  return ok(c) ? c : null;
}

/** A stable placeholder per orchestra: initials of its surname and a hue (0–359). */
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

/* ---------- the cover cache (browser): Spotify covers looked up once per recording, kept on this device ---------- */

const KEY = "tdj-artwork-v1";
let mem: Record<string, string> | null = null;
const inflight = new Map<string, Promise<string | null>>();

export function artworkCache(): Record<string, string> {
  if (mem) return mem;
  mem = {};
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) mem = JSON.parse(raw) as Record<string, string>;
  } catch {}
  return mem;
}
function remember(id: string, url: string) {
  const c = artworkCache();
  c[id] = url;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}

/** Spotify's public oEmbed gives a recording's cover without a login. */
export type CoverLookup = (spotifyUrl: string) => Promise<string | null>;
export const spotifyOEmbed: CoverLookup = async (url) => {
  const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { thumbnail_url?: string } | null;
  return ok(j?.thumbnail_url) ? j.thumbnail_url : null;
};

/** The cover for a side, looking it up (once) from its Spotify recording when the catalogue has none. */
export function loadArtwork(e: Entity, lookup: CoverLookup = spotifyOEmbed): Promise<string | null> {
  const hit = artworkFor(e, artworkCache());
  if (hit || !e) return Promise.resolve(hit);
  const url = (e as { spotify?: { url?: string } | null }).spotify?.url;
  if (!url || !/^https:\/\/open\.spotify\.com\/track\//.test(url)) return Promise.resolve(null);
  let p = inflight.get(e.id);
  if (!p) {
    p = lookup(url)
      .then((u) => {
        if (u) remember(e.id, u);
        return u;
      })
      .catch(() => null);
    inflight.set(e.id, p);
  }
  return p;
}
