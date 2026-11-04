/**
 * Resolve cortinas (data/knowledge/cortinas.json + the built-in library) to Deezer previews, keyless, cached in
 * data/cache/resolve/cortinas.json (committed, keyed by cortina id). Idempotent; re-run to grow the cache.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/resolve_cortinas.ts [--force]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ResolvedTrack } from "../packages/core/src/audio/index";
import { BUILTIN_CORTINAS } from "../packages/core/src/cortinas";
import { normTitle } from "../packages/core/src/energy";
import type { Cortina } from "../packages/core/src/types";

const force = process.argv.includes("--force");
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/cache/resolve/cortinas.json`;
mkdirSync(`${ROOT}data/cache/resolve`, { recursive: true });
const cache: Record<string, ResolvedTrack | null> = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : {};
const extra = JSON.parse(readFileSync(`${ROOT}data/knowledge/cortinas.json`, "utf8")) as Cortina[];
const UA = "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => normTitle(s);

async function deezer(c: Cortina): Promise<ResolvedTrack | null> {
  const r = await fetch(
    `https://api.deezer.com/search?q=${encodeURIComponent(`${c.artist} ${c.title}`)}&limit=8`,
    {
      headers: { "user-agent": UA },
    },
  );
  if (r.status === 429) {
    await sleep(5000);
    return deezer(c);
  }
  if (!r.ok) return null;
  const j = (await r.json()) as {
    data?: Array<{
      id: number;
      title: string;
      duration: number;
      preview: string;
      link: string;
      artist: { name: string };
      album: { title: string; cover_medium: string };
    }>;
  };
  const want = norm(c.title),
    artist = norm(c.artist);
  let best: { t: NonNullable<typeof j.data>[number]; s: number } | null = null;
  for (const t of j.data ?? []) {
    const tt = norm(t.title),
      ta = norm(t.artist.name);
    let s = 0;
    if (tt === want) s += 0.6;
    else if (tt.startsWith(want) || want.startsWith(tt)) s += 0.4;
    if (ta === artist) s += 0.4;
    else if (ta.includes(artist.split(" ").pop()!) || artist.includes(ta)) s += 0.3;
    if (!best || s > best.s) best = { t, s };
  }
  if (!best || best.s < 0.7) return null;
  const t = best.t;
  return {
    provider: "deezer",
    id: String(t.id),
    title: t.title,
    artist: t.artist.name,
    album: t.album.title,
    durationMs: t.duration * 1000,
    previewUrl: t.preview,
    url: t.link,
    artwork: t.album.cover_medium,
    matchedAt: new Date().toISOString(),
    confidence: Math.round(best.s * 100) / 100,
  };
}

async function main() {
  const all = new Map<string, Cortina>();
  for (const c of BUILTIN_CORTINAS) all.set(c.id, c);
  for (const c of extra) all.set(c.id, c);
  let hits = 0,
    n = 0;
  for (const c of all.values()) {
    if (!force && c.id in cache) continue;
    try {
      const r = await deezer(c);
      cache[c.id] = r;
      if (r) hits++;
      else console.log(`no match: ${c.artist} – ${c.title}`);
    } catch (e) {
      console.error(c.title, (e as Error).message);
    }
    n++;
    await sleep(150);
  }
  writeFileSync(OUT, JSON.stringify(cache));
  console.log(`done: ${n} lookups, ${hits} hits, cache ${Object.keys(cache).length}`);
}
main();
