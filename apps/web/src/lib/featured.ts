"use client";
import type { Playlist } from "./types";

/** Built-in nights the app ships under /featured/<id>.json: a full Playlist as the engine returns it. */
export const FEATURED = [
  {
    id: "golden-double-peak",
    title: "Featured night",
    sub: "4 h golden era, double peak, Turkish cortinas",
  },
] as const;
export type FeaturedId = (typeof FEATURED)[number]["id"];

const cache = new Map<string, Promise<Playlist>>();

/**
 * Fetches a featured night once per session. The shipped file is either a full Playlist or the engine's compact
 * night (seed + options + the tandas as the spec prints them): the compact form is replayed through /api/compose
 * with its seed and explicit options, which reproduces the same night with every field the cards need.
 */
export function loadFeatured(id: FeaturedId): Promise<Playlist> {
  let p = cache.get(id);
  if (!p) {
    // revalidate every time (a 304 when nothing changed): "force-cache" kept a browser on the first copy it saw, so
    // a corrected night (a cortina's artist, new Spotify ids) never reached it and its export dropped that cortina
    p = fetch(`/featured/${id}.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`featured night ${id}: ${r.status}`))))
      .then(async (j: Playlist & { seed?: number }) => {
        if (!j || !Array.isArray(j.tandas) || !j.tandas.length || !j.options)
          throw new Error("not a playlist");
        if (Array.isArray(j.tandas[0]?.songs) && j.id) return j;
        const { explicit: _e, ...opts } = j.options;
        const seed = j.seed ?? j.options.seed;
        const r = await fetch("/api/compose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...opts, seed, explicit: Object.keys(opts).filter((k) => k !== "context") }),
        });
        const full = (await r.json()) as Playlist & { error?: string };
        if (!r.ok || full.error) throw new Error(full.error ?? "compose failed");
        return full;
      });
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

export function featuredMeta(id: string) {
  return FEATURED.find((f) => f.id === id) ?? null;
}
