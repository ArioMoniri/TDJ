/**
 * Resolve catalogue recordings to streamable previews + metadata using keyless public APIs (Deezer search; MusicBrainz for
 * dates when asked). Cached in data/cache/resolve/tracks.json (committed). Idempotent; re-run to grow the cache.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/resolve_catalog.ts --limit=800 --scope=corpus|golden|all --mb=0|1
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ResolvedTrack } from "../packages/core/src/audio/index";
import { normTitle } from "../packages/core/src/energy";
import type { Song } from "../packages/core/src/types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/cache/resolve/tracks.json`;
mkdirSync(`${ROOT}data/cache/resolve`, { recursive: true });
const cache: Record<string, ResolvedTrack | null> = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : {};
const songs = JSON.parse(readFileSync(`${ROOT}data/index/songs.json`, "utf8")) as Song[];
const corpus = JSON.parse(readFileSync(`${ROOT}data/knowledge/reference_sets.json`, "utf8")) as {
  famousRecordings: Array<{ title: string; orchestraId: string }>;
};
const UA = "TDJ/0.1 (https://github.com/ArioMoniri/TDJ)";
const norm = (s: string) => normTitle(s);
const surname = (o: string) =>
  norm(o)
    .split(" ")
    .filter((w) => w.length > 2)
    .pop() ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deezer(s: Song): Promise<ResolvedTrack | null> {
  const q = `${s.title} ${s.orchestra.replace(/\(.*?\)/g, "")}`;
  const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`, {
    headers: { "user-agent": UA },
  });
  if (r.status === 429) {
    await sleep(5000);
    return deezer(s);
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
  const want = norm(s.title),
    sur = surname(s.orchestra);
  let best: { t: NonNullable<typeof j.data>[number]; c: number } | null = null;
  for (const t of j.data ?? []) {
    const tt = norm(t.title),
      ta = norm(t.artist.name);
    let c = 0;
    if (tt === want) c += 0.6;
    else if (tt.startsWith(want) || want.startsWith(tt)) c += 0.4;
    else if (tt.includes(want.split(" ")[0]!)) c += 0.15;
    if (sur && ta.includes(sur)) c += 0.35;
    else if (sur && norm(t.album.title).includes(sur)) c += 0.2;
    if (s.singer && ta.includes(surname(s.singer))) c += 0.1;
    if (!best || c > best.c) best = { t, c };
  }
  if (!best || best.c < 0.6) return null;
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
    confidence: Math.round(best.c * 100) / 100,
  };
}

async function main() {
  const scope = String(args.scope ?? "corpus");
  let pool = songs.filter((s) => ["tango", "vals", "milonga"].includes(s.rhythm) && !(s.id in cache));
  if (scope === "corpus") {
    const keys = new Set(corpus.famousRecordings.map((f) => `${norm(f.title)}|${f.orchestraId}`));
    pool = pool.filter((s) => keys.has(`${norm(s.title)}|${s.orchestraId}`));
  } else if (scope === "golden") pool = pool.filter((s) => s.era.startsWith("golden"));
  pool = pool.slice(0, Number(args.limit ?? 500));
  let hits = 0,
    n = 0;
  for (const s of pool) {
    try {
      const r = await deezer(s);
      cache[s.id] = r;
      if (r) hits++;
    } catch (e) {
      console.error(s.title, (e as Error).message);
    }
    n++;
    if (n % 50 === 0) {
      writeFileSync(OUT, JSON.stringify(cache));
      console.log(`${n}/${pool.length} resolved, ${hits} hits`);
    }
    await sleep(120);
  }
  writeFileSync(OUT, JSON.stringify(cache));
  console.log(`done: ${n} lookups, ${hits} hits, cache ${Object.keys(cache).length}`);
}
main();
