/**
 * The shipped artwork cache (data/cache/artwork.json): song or cortina id → a Spotify cover url, for every side that
 * has a Spotify recording (the Spotify caches, the featured night, data/knowledge/added_songs.json and cortinas.json).
 * Covers come from Spotify's public oEmbed (no login, no key), about 4 requests a second. Idempotent: an id already
 * in the file keeps its cover unless --refresh; a recording without a cover is simply left out (tried again next run).
 *   pnpm artwork:build [--refresh] [--limit N]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BUILTIN_CORTINAS } from "../packages/core/src/cortinas";
import { loadCatalog } from "../packages/core/src/load";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/cache/artwork.json`;
const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const limit = Number(args[args.indexOf("--limit") + 1]) || Number.POSITIVE_INFINITY;
const PACE_MS = 250;

type Sp = { uri?: string; url?: string } | null | undefined;
const read = <T>(rel: string, d: T): T =>
  existsSync(ROOT + rel) ? (JSON.parse(readFileSync(ROOT + rel, "utf8")) as T) : d;
const trackOf = (s: Sp): string | null =>
  s?.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1] ??
  s?.url?.match(/^https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/)?.[1] ??
  null;

/** id → Spotify track id, from every place a side's recording is kept */
const want = new Map<string, string>();
const add = (id: unknown, sp: Sp) => {
  const t = trackOf(sp);
  if (typeof id === "string" && id && t && !want.has(id)) want.set(id, t);
};
for (const [id, sp] of Object.entries(read<Record<string, Sp>>("data/cache/spotify/tracks.json", {})))
  add(id, sp);
for (const [id, sp] of Object.entries(read<Record<string, Sp>>("data/cache/spotify/cortinas.json", {})))
  add(id, sp);
type Side = { id?: string; spotify?: Sp };
const night = read<{
  tandas?: Array<{ songs?: Side[]; cortina?: Side | null }>;
  opening?: Side;
  closing?: Side;
}>("apps/web/public/featured/golden-double-peak.json", {});
for (const t of night.tandas ?? []) {
  for (const s of t.songs ?? []) add(s.id, s.spotify);
  if (t.cortina) add(t.cortina.id, t.cortina.spotify);
}
for (const s of [night.opening, night.closing]) if (s) add(s.id, s.spotify);
for (const s of read<{ songs?: Side[] }>("data/knowledge/added_songs.json", {}).songs ?? [])
  add(s.id, s.spotify);
for (const c of [...read<Side[]>("data/knowledge/cortinas.json", []), ...BUILTIN_CORTINAS])
  add(c.id, c.spotify);
// the catalogue as the engine builds it (the caches merged into the songs and cortinas)
const { catalog, cortinas } = loadCatalog(ROOT);
for (const s of catalog.songs) add(s.id, s.spotify);
for (const c of cortinas) add(c.id, c.spotify);

const IMAGE = /^https:\/\/[^\s"'<>]+$/;
async function oembed(track: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${track}`)}`,
      { signal: AbortSignal.timeout(10_000) },
    ).catch(() => null);
    if (r?.ok) {
      const j = (await r.json().catch(() => null)) as { thumbnail_url?: unknown } | null;
      return typeof j?.thumbnail_url === "string" && IMAGE.test(j.thumbnail_url) ? j.thumbnail_url : null;
    }
    if (r && r.status !== 429 && r.status < 500) return null;
    await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
  }
  return null;
}

const prev = read<Record<string, string>>("data/cache/artwork.json", {});
const out: Record<string, string> = {};
for (const [id, url] of Object.entries(prev)) if (want.has(id) && IMAGE.test(url)) out[id] = url;
// one request per recording: ids that share a recording share its cover
const byTrack = new Map<string, string>();
for (const [id, t] of want) if (out[id] && !refresh) byTrack.set(t, out[id]);
async function main() {
  let asked = 0;
  let missed = 0;
  for (const [id, t] of want) {
    if (out[id] && !refresh) continue;
    let url = byTrack.get(t);
    if (url === undefined) {
      if (asked >= limit) continue;
      asked++;
      const t0 = Date.now();
      url = (await oembed(t)) ?? "";
      byTrack.set(t, url);
      const wait = PACE_MS - (Date.now() - t0);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      if (asked % 50 === 0) console.log(`… ${asked} asked`);
    }
    if (url) out[id] = url;
    else missed++;
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `artwork: ${Object.keys(sorted).length} covers for ${want.size} sides with a Spotify recording (${asked} looked up, ${missed} without a cover)`,
  );
}
void main();
