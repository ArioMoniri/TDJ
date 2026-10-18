/**
 * Enrich the catalogue index with Spotify track URIs + durations and cache them in data/cache/spotify/tracks.json (committed).
 * Uses Client Credentials (no user) — set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET. Respects the 2026 Dev-Mode search limit (≤10) and 429 retry-after.
 *   pnpm index:enrich -- --limit=500 --orchestra=juan-d-arienzo --eras=golden
 * Re-run any time: already-cached ids are skipped, so the index grows incrementally and stays in the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normTitle } from "../packages/core/src/energy";
import { ERA_PRESETS } from "../packages/core/src/profiles";
import type { Song } from "../packages/core/src/types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}data/cache/spotify/tracks.json`;
mkdirSync(`${ROOT}data/cache/spotify`, { recursive: true });
const cache: Record<
  string,
  { uri: string; url: string; durationMs: number; album: string; popularity: number; matched: string } | null
> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const songs = JSON.parse(readFileSync(`${ROOT}data/index/songs.json`, "utf8")) as Song[];
const id = process.env.SPOTIFY_CLIENT_ID,
  secret = process.env.SPOTIFY_CLIENT_SECRET;
if (!id || !secret) {
  console.error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET required");
  process.exit(1);
}

async function token() {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token as string;
}
async function main() {
  const tok = await token();
  const eras = new Set(
    (args.eras ? String(args.eras).split(",") : ["golden"]).flatMap((p) => ERA_PRESETS[p]?.eras ?? []),
  );
  let pool = songs.filter(
    (s) => ["tango", "vals", "milonga"].includes(s.rhythm) && eras.has(s.era) && !(s.id in cache),
  );
  if (args.orchestra) pool = pool.filter((s) => s.orchestraId === args.orchestra);
  pool = pool.slice(0, Number(args.limit ?? 300));
  let hits = 0;
  for (const s of pool) {
    const q = `${s.title} ${s.orchestra.replace(/\(.*?\)/g, "")}${s.singer ? ` ${s.singer}` : ""}`;
    const r = await fetch(
      `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", limit: "5" })}`,
      { headers: { authorization: `Bearer ${tok}` } },
    );
    if (r.status === 429) {
      const w = Number(r.headers.get("retry-after") ?? 5);
      console.log(`429 → wait ${w}s`);
      await new Promise((res) => setTimeout(res, w * 1000));
      continue;
    }
    if (!r.ok) {
      console.error(`${r.status} for ${q}`);
      continue;
    }
    const j = await r.json();
    const items: Array<{
      uri: string;
      name: string;
      duration_ms: number;
      album: { name: string };
      popularity: number;
      artists: { name: string }[];
      external_urls: { spotify: string };
    }> = j.tracks?.items ?? [];
    const best =
      items.find(
        (t) =>
          normTitle(t.name).includes(normTitle(s.title).slice(0, 12)) &&
          t.artists.some((a) => normTitle(a.name).includes(normTitle(s.orchestra).split(" ").pop() ?? "")),
      ) ?? items[0];
    cache[s.id] = best
      ? {
          uri: best.uri,
          url: best.external_urls.spotify,
          durationMs: best.duration_ms,
          album: best.album.name,
          popularity: best.popularity,
          matched: `${best.artists.map((a) => a.name).join(", ")} – ${best.name}`,
        }
      : null;
    if (best) hits++;
    await new Promise((res) => setTimeout(res, 120));
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 0));
  console.log(`cached ${pool.length} lookups (${hits} hits); total cache ${Object.keys(cache).length}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
