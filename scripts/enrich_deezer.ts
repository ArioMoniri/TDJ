/**
 * Round 21 — BPM and loudness (gain) for every side with a Deezer id, from Deezer's public track endpoint
 * (GET https://api.deezer.com/track/{id}: `bpm`, 0 when Deezer has none; `gain`, the track's replay gain in dB; the
 * album's `release_date`). Stored in data/cache/deezer/tracks.json (committed), keyed by song id, each record with its
 * source and fetchedAt (packages/core/src/enrich.ts): a re-run refetches records older than --maxAge days (default
 * 30) or all with --refresh, and a value Deezer changed replaces the stored one (changedAt + previous kept).
 * A DJ correction lives in the user's database and always wins at load; it is never written here.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/enrich_deezer.ts [--limit=2000] [--refresh] [--maxAge=30]
 * Keyless, paced (≥ 300 ms between requests, a 429 or a quota error waits and retries).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ResolvedTrack } from "../packages/core/src/audio/index";
import {
  type DeezerCache,
  type DeezerTrackRecord,
  enrichDue,
  mergeEnrichment,
} from "../packages/core/src/enrich";
import type { Playlist } from "../packages/core/src/types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/cache/deezer/tracks.json`;
mkdirSync(`${ROOT}data/cache/deezer`, { recursive: true });
const cache: DeezerCache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const resolved = JSON.parse(readFileSync(`${ROOT}data/cache/resolve/tracks.json`, "utf8")) as Record<
  string,
  ResolvedTrack | null
>;
// the song → Deezer id pairs: the committed resolve cache, and the featured nights' own `resolved` ids
const want = new Map<string, string>();
for (const [k, v] of Object.entries(resolved))
  if (v?.provider === "deezer" && v.id) want.set(k, String(v.id));
const fdir = `${ROOT}apps/web/public/featured/`;
for (const f of readdirSync(fdir).filter((x) => x.endsWith(".json"))) {
  const p = JSON.parse(readFileSync(fdir + f, "utf8")) as Playlist;
  for (const s of [...p.tandas.flatMap((t) => t.songs), p.closing, p.opening])
    if (s?.resolved?.provider === "deezer" && s.resolved.id && !want.has(s.id))
      want.set(s.id, String(s.resolved.id));
}
const refresh = args.refresh === "true";
const maxAge = Number(args.maxAge ?? 30);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "TDJ/0.1 (tango DJ composer)";

// biome-ignore lint/suspicious/noExplicitAny: Deezer's JSON, read field by field
async function track(id: string): Promise<any | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://api.deezer.com/track/${id}`, { headers: { "user-agent": UA } });
    if (r.status === 429) {
      await sleep(Number(r.headers.get("retry-after") ?? 5) * 1000);
      continue;
    }
    if (!r.ok) return null;
    const j = await r.json();
    await sleep(300);
    // (Deezer answers a quota error with 200 and { error: { code: 4 } })
    if (j?.error?.code === 4) {
      await sleep(5000);
      continue;
    }
    return j?.error ? null : j;
  }
  return null;
}

async function main() {
  const todo = [...want.entries()]
    .filter(([k, id]) => refresh || cache[k]?.id !== id || enrichDue(cache[k], maxAge))
    .slice(0, Number(args.limit ?? 5000));
  let n = 0,
    changed = 0,
    gone = 0;
  for (const [k, id] of todo) {
    const j = await track(id);
    if (!j) {
      // (a removed Deezer track: the record says so instead of keeping the old numbers)
      gone++;
      cache[k] = mergeEnrichment<DeezerTrackRecord>(
        cache[k],
        { id, bpm: null, gain: null, missing: true },
        "deezer",
      );
      continue;
    }
    const rec = mergeEnrichment<DeezerTrackRecord>(
      cache[k],
      {
        id,
        bpm: typeof j.bpm === "number" && j.bpm > 0 ? j.bpm : null,
        gain: typeof j.gain === "number" && j.gain !== 0 ? j.gain : null, // (0 = Deezer has no reading)
        release: j.release_date ?? j.album?.release_date ?? null,
        album: j.album?.title ?? null,
      },
      "deezer",
    );
    if (rec.changedAt === rec.fetchedAt) changed++;
    cache[k] = rec;
    if (++n % 100 === 0) {
      writeFileSync(OUT, JSON.stringify(cache, null, 0));
      console.log(`${n}/${todo.length}`);
    }
  }
  writeFileSync(OUT, JSON.stringify(cache, null, 0));
  const vals = Object.values(cache);
  console.log(
    `deezer: ${todo.length} fetched (${changed} changed, ${gone} not found); cache ${vals.length} · bpm ${vals.filter((v) => v?.bpm).length} · gain ${vals.filter((v) => typeof v?.gain === "number").length}`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
