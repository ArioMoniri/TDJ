/**
 * Enrich the catalogue index with Spotify track URIs + durations and cache them in data/cache/spotify/tracks.json (committed).
 * Uses Client Credentials (no user) — set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET. Respects the 2026 Dev-Mode search limit (≤10) and 429 retry-after.
 *   pnpm index:enrich -- --limit=500 --orchestra=juan-d-arienzo --eras=golden
 *   pnpm index:enrich -- --ids=/abs/path/night.json,/abs/path/other.json   (just these nights' sides; a JSON list of ids works too)
 *   pnpm index:enrich -- --years=1935-1945 --refresh                        (also re-search rows cached as null)
 *   pnpm index:enrich -- --cortinas                                          (cortina records → data/cache/spotify/cortinas.json)
 * Round 16 (docs/reviews/round16-discography.md M1–M8): a candidate is cached only when the export match rules accept
 * it (packages/core/src/matchRules.ts: the title, the leader by whole name, the voice, the album's years, remake
 * series, positive evidence beside a later take the index knows); among the accepted ones the one with the most
 * evidence wins (a dated title, an album whose years hold the side, the singer named, the judged Deezer length).
 * A row with no accepted candidate is cached as null ("no correct Spotify recording found"). Cortinas pass the
 * cortina rules (title, artist by whole name, the original record).
 * Re-run any time: already-cached ids are skipped (unless --refresh), so the index grows incrementally and stays in the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BUILTIN_CORTINAS } from "../packages/core/src/cortinas";
import { normTitle } from "../packages/core/src/energy";
import {
  bareTitle,
  cortinaMatchProblem,
  judgeStreams,
  type MatchCandidate,
  type MatchRow,
  matchProblem,
  namesLeader,
  takesIndex,
} from "../packages/core/src/matchRules";
import { ERA_PRESETS } from "../packages/core/src/profiles";
import { albumSpan, knownSingers, titleDate } from "../packages/core/src/streams";
import type { Cortina, Song } from "../packages/core/src/types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}data/cache/spotify/tracks.json`;
const CUE_CACHE = `${ROOT}data/cache/spotify/cortinas.json`;
mkdirSync(`${ROOT}data/cache/spotify`, { recursive: true });
type Entry = {
  uri: string;
  url: string;
  durationMs: number;
  album: string;
  popularity: number;
  matched: string;
} | null;
const cache: Record<string, Entry> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const cueCache: Record<string, Entry> = existsSync(CUE_CACHE)
  ? JSON.parse(readFileSync(CUE_CACHE, "utf8"))
  : {};
const songs = JSON.parse(readFileSync(`${ROOT}data/index/songs.json`, "utf8")) as Song[];
const resolved = JSON.parse(readFileSync(`${ROOT}data/cache/resolve/tracks.json`, "utf8")) as Record<
  string,
  { id?: string; title?: string; artist?: string; album?: string; durationMs?: number } | null
>;
const id = process.env.SPOTIFY_CLIENT_ID,
  secret = process.env.SPOTIFY_CLIENT_SECRET;
if (!id || !secret) {
  console.error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET required");
  process.exit(1);
}
const takes = takesIndex(songs);
const singers = knownSingers(songs);

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
type Item = {
  uri: string;
  name: string;
  duration_ms: number;
  album: { name: string; release_date?: string };
  popularity: number;
  artists: { name: string }[];
  external_urls: { spotify: string };
};
let tok = "";
let tokAt = 0;
async function search(q: string): Promise<Item[]> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!tok || Date.now() - tokAt > 50 * 60 * 1000) {
      tok = await token();
      tokAt = Date.now();
    }
    const r = await fetch(
      `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", limit: "10" })}`,
      { headers: { authorization: `Bearer ${tok}` } },
    );
    if (r.status === 429) {
      const w = Number(r.headers.get("retry-after") ?? 5);
      console.log(`429 → wait ${w}s`);
      await new Promise((res) => setTimeout(res, Math.min(w, 120) * 1000));
      continue;
    }
    if (r.status === 401) {
      tok = "";
      continue;
    }
    if (!r.ok) {
      console.error(`${r.status} for a search`);
      return [];
    }
    const j = await r.json();
    await new Promise((res) => setTimeout(res, 110));
    return j.tracks?.items ?? [];
  }
  return [];
}
const asCand = (t: Item): MatchCandidate => ({
  name: t.name,
  artists: t.artists.map((a) => a.name),
  album: t.album.name,
  durationMs: t.duration_ms,
});
const entryOf = (t: Item): NonNullable<Entry> => ({
  uri: t.uri,
  url: t.external_urls.spotify,
  durationMs: t.duration_ms,
  album: t.album.name,
  popularity: t.popularity,
  matched: `${t.artists.map((a) => a.name).join(", ")} – ${t.name}`,
});
const bare = (x: string) =>
  x
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const surnameQ = (orchestra: string) => {
  const parts = bare(orchestra).split(" ");
  const last = parts.at(-1) ?? "";
  const prev = parts.at(-2);
  return prev && /^(di|de|del|d')$/i.test(prev) ? `${prev} ${last}` : last;
};

/** the evidence an accepted candidate carries (more wins): a dated title, the album's years, the voice, the length */
function evidence(row: MatchRow, c: MatchCandidate, ref: number | null, pop: number): number {
  let v = 0;
  if (titleDate(c.name) !== null) v += 6;
  const sp = albumSpan(c.album);
  if (sp && row.year && sp[0] <= row.year && sp[1] >= row.year) v += 4 - Math.min(3, (sp[1] - sp[0]) / 4);
  if (
    row.singer &&
    ` ${c.artists.join(" ").toLowerCase()} `.includes(bare(row.singer).split(" ").at(-1)!.toLowerCase())
  )
    v += 2;
  if (ref && c.durationMs) v += Math.max(0, 3 - Math.abs(c.durationMs / 1000 - ref) / 3);
  if (/remaster|restaur/i.test(`${c.name} ${c.album}`)) v -= 0.5;
  return v + pop / 200;
}

async function enrichSongs() {
  const eras = new Set(
    (args.eras ? String(args.eras).split(",") : ["golden"]).flatMap((p) => ERA_PRESETS[p]?.eras ?? []),
  );
  const refresh = args.refresh === "true";
  const judgedBad = (s: Song) => {
    const v = cache[s.id];
    if (v === undefined) return true;
    if (v === null) return refresh;
    const row = { ...s, ...(takes.get(s.id) ?? {}) };
    return !!judgeStreams(row, v, resolved[s.id], { singers }).spotify;
  };
  let pool = songs.filter((s) => ["tango", "vals", "milonga"].includes(s.rhythm) && eras.has(s.era));
  if (args.years) {
    const [a, b] = String(args.years).split("-").map(Number);
    pool = pool.filter((s) => !!s.year && s.year >= a! && s.year <= b!);
  }
  if (args.orchestra) pool = pool.filter((s) => s.orchestraId === args.orchestra);
  if (args.ids) {
    // --ids=<file.json>[,<file.json>…]: only these song ids (a list, or nights whose tandas carry songs or tracks)
    const want = new Set<string>();
    for (const f of String(args.ids).split(",")) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      const list: string[] = Array.isArray(j)
        ? j
        : [
            ...(j.tandas ?? []).flatMap((t: { songs?: { id: string }[]; tracks?: { id: string }[] }) =>
              (t.songs ?? t.tracks ?? []).map((x) => x.id),
            ),
            ...(j.closing?.id ? [j.closing.id] : []),
            ...(j.opening?.id ? [j.opening.id] : []),
          ];
      for (const x of list) want.add(x);
    }
    pool = songs.filter((s) => want.has(s.id) || s.altIds?.some((a) => want.has(a)));
  }
  pool = pool.filter(judgedBad).slice(0, Number(args.limit ?? 300));
  let hits = 0;
  const none: string[] = [];
  for (const s of pool) {
    const row: MatchRow = { ...s, ...(takes.get(s.id) ?? {}) };
    const dz = resolved[s.id];
    const dzOk = dz && !judgeStreams(row, null, dz, { singers }).deezer;
    const ref =
      dzOk && dz?.durationMs && !/restaur/i.test(`${dz.title} ${dz.album}`) ? dz.durationMs / 1000 : null;
    const qs = [
      `track:"${bare(s.title)}" artist:"${surnameQ(s.orchestra)}"`,
      `${bare(s.title)} ${bare(s.orchestra)}${s.singer ? ` ${bare(s.singer)}` : ""}`,
      ...(s.year ? [`${bare(s.title)} ${surnameQ(s.orchestra)} ${s.year}`] : []),
    ];
    const seen = new Map<string, Item>();
    let best: { t: Item; v: number } | null = null;
    for (const q of qs) {
      for (const t of await search(q)) {
        if (seen.has(t.uri)) continue;
        seen.set(t.uri, t);
        const c = asCand(t);
        if (matchProblem(row, c, ref, { singers })) continue;
        const v = evidence(row, c, ref, t.popularity);
        if (!best || v > best.v) best = { t, v };
      }
      // a dated or album-dated accepted match ends the search early
      if (best && best.v >= 4) break;
    }
    cache[s.id] = best ? entryOf(best.t) : null;
    if (best) hits++;
    else none.push(`${s.id} ${s.title} (${s.orchestra}${s.singer ? ` / ${s.singer}` : ""} ${s.year ?? ""})`);
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 0));
  console.log(
    `cached ${pool.length} lookups (${hits} accepted by the match rules); total cache ${Object.keys(cache).length}`,
  );
  if (none.length) console.log(`no correct Spotify recording found:\n  ${none.join("\n  ")}`);
}

async function enrichCortinas() {
  const known = JSON.parse(readFileSync(`${ROOT}data/knowledge/cortinas.json`, "utf8")) as Cortina[];
  const all = new Map<string, Cortina>([...BUILTIN_CORTINAS, ...known].map((c) => [c.id, c]));
  let pool = [...all.values()].filter((c) => !c.tags?.includes("no-audio"));
  if (args.ids) {
    const want = new Set<string>();
    for (const f of String(args.ids).split(",")) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      for (const t of j.tandas ?? []) if (t.cortina?.id) want.add(t.cortina.id);
    }
    pool = pool.filter((c) => want.has(c.id));
  }
  if (args.culture) pool = pool.filter((c) => c.culture === args.culture);
  pool = pool.filter((c) => args.refresh === "true" || !(c.id in cueCache));
  let hits = 0;
  const none: string[] = [];
  for (const c of pool) {
    const qs = [`track:"${c.title}" artist:"${c.artist}"`, `${c.title} ${c.artist}`];
    let best: { t: Item; v: number } | null = null;
    for (const q of qs) {
      for (const t of await search(q)) {
        if (cortinaMatchProblem(c, asCand(t))) continue;
        // the original record: the earliest release, then popularity
        const y = Number((t.album.release_date ?? "9999").slice(0, 4));
        const v =
          (c.year && y >= c.year - 1 && y <= c.year + 1 ? 5 : 0) -
          Math.max(0, y - (c.year ?? y)) / 10 +
          t.popularity / 100;
        if (!best || v > best.v) best = { t, v };
      }
      if (best) break;
    }
    cueCache[c.id] = best ? entryOf(best.t) : null;
    if (best) hits++;
    else none.push(`${c.id} ${c.title} — ${c.artist}`);
  }
  writeFileSync(CUE_CACHE, JSON.stringify(cueCache, null, 0));
  console.log(`cortinas: ${pool.length} lookups, ${hits} accepted; total ${Object.keys(cueCache).length}`);
  if (none.length) console.log(`no correct Spotify record found:\n  ${none.join("\n  ")}`);
}

// --- --crawl: the orchestras' and cortina artists' discographies instead of the search endpoint ---------------------
// (round 16: the Dev-Mode search endpoint can be rate-limited for hours — a 429 with retry-after ≈ 6 h; the track,
// artist-album and album-track endpoints still answer. The artists are found from the tracks already cached, their
// albums and tracks are listed, and every row is matched locally under the same rules.)
type CTrack = {
  uri: string;
  url: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  release: string;
};
// biome-ignore lint/suspicious/noExplicitAny: the Spotify Web API JSON, read field by field
async function get(url: string): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!tok || Date.now() - tokAt > 50 * 60 * 1000) {
      tok = await token();
      tokAt = Date.now();
    }
    const r = await fetch(url, { headers: { authorization: `Bearer ${tok}` } });
    if (r.status === 429) {
      const w = Number(r.headers.get("retry-after") ?? 5);
      if (w > 120) throw new Error(`rate-limited for ${w} s`);
      await new Promise((res) => setTimeout(res, w * 1000));
      continue;
    }
    if (r.status === 401) {
      tok = "";
      continue;
    }
    if (!r.ok) return null;
    await new Promise((res) => setTimeout(res, 60));
    return r.json();
  }
  return null;
}
async function crawl(
  dir: string,
  seedUris: string[],
  wantArtist: (name: string) => boolean,
): Promise<CTrack[]> {
  mkdirSync(dir, { recursive: true });
  const artistsF = `${dir}/artists.json`;
  const artists: Record<string, string> = existsSync(artistsF)
    ? JSON.parse(readFileSync(artistsF, "utf8"))
    : {};
  const seenT = new Set<string>(
    existsSync(`${dir}/seen.json`) ? JSON.parse(readFileSync(`${dir}/seen.json`, "utf8")) : [],
  );
  for (const u of seedUris) {
    if (seenT.has(u)) continue;
    try {
      const t = await get(`https://api.spotify.com/v1/tracks/${u.split(":").pop()}`);
      for (const a of t?.artists ?? []) artists[a.id] = a.name;
      seenT.add(u);
    } catch {
      break;
    }
  }
  writeFileSync(artistsF, JSON.stringify(artists));
  writeFileSync(`${dir}/seen.json`, JSON.stringify([...seenT]));
  const out: CTrack[] = [];
  let limited = false;
  for (const [aid, aname] of Object.entries(artists)) {
    if (!wantArtist(aname)) continue;
    const f = `${dir}/artist-${aid}.json`;
    if (existsSync(f)) {
      out.push(...JSON.parse(readFileSync(f, "utf8")));
      continue;
    }
    // (rate-limited: the artists crawled so far are matched; the rest wait for the next run)
    if (limited) continue;
    try {
      const albums: Array<{ id: string; name: string; release_date: string }> = [];
      for (let off = 0; off < 1000; off += 10) {
        const j = await get(
          `https://api.spotify.com/v1/artists/${aid}/albums?include_groups=album,single,compilation&limit=10&offset=${off}`,
        );
        albums.push(...(j?.items ?? []));
        if (!j?.next) break;
      }
      const mine: CTrack[] = [];
      for (const al of albums)
        for (let off = 0; off < 500; off += 50) {
          const j = await get(`https://api.spotify.com/v1/albums/${al.id}/tracks?limit=50&offset=${off}`);
          for (const t of j?.items ?? [])
            mine.push({
              uri: t.uri,
              url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
              name: t.name,
              artists: (t.artists ?? []).map((a: { name: string }) => a.name),
              album: al.name,
              durationMs: t.duration_ms,
              release: al.release_date,
            });
          if (!j?.next) break;
        }
      writeFileSync(f, JSON.stringify(mine));
      console.log(`crawled ${aname}: ${albums.length} albums, ${mine.length} tracks`);
      out.push(...mine);
    } catch (e) {
      console.log(`stopped crawling at ${aname}: ${(e as Error).message}`);
      limited = true;
    }
  }
  return out;
}
async function enrichByCrawl() {
  const dir = String(args.crawl);
  const want = new Set<string>();
  for (const f of String(args.ids ?? "")
    .split(",")
    .filter(Boolean)) {
    const j = JSON.parse(readFileSync(f, "utf8"));
    const list: string[] = Array.isArray(j)
      ? j
      : [
          ...(j.tandas ?? []).flatMap((t: { songs?: { id: string }[] }) => (t.songs ?? []).map((x) => x.id)),
          ...(j.closing?.id ? [j.closing.id] : []),
        ];
    for (const x of list) want.add(x);
  }
  const refresh = args.refresh === "true";
  const pool = songs.filter((s) => {
    if (!(want.has(s.id) || s.altIds?.some((a) => want.has(a)))) return false;
    const v = cache[s.id];
    if (v === undefined || (v === null && refresh)) return true;
    if (v === null) return false;
    return !!judgeStreams({ ...s, ...(takes.get(s.id) ?? {}) }, v, resolved[s.id], { singers }).spotify;
  });
  const orchestras = [...new Set(pool.map((s) => s.orchestra))];
  const seeds = [
    ...Object.values(cache)
      .filter((v): v is NonNullable<Entry> => !!v?.uri)
      .map((v) => v.uri),
    ...String(args.seedUris ?? "")
      .split(",")
      .filter(Boolean),
  ];
  const tracks = await crawl(dir, seeds, (name) => orchestras.some((o) => namesLeader(o, name)));
  const byTitle = new Map<string, CTrack[]>();
  for (const t of tracks) {
    const k = bareTitle(t.name);
    byTitle.set(k, [...(byTitle.get(k) ?? []), t]);
  }
  let hits = 0;
  const none: string[] = [];
  for (const s of pool) {
    const row: MatchRow = { ...s, ...(takes.get(s.id) ?? {}) };
    const dz = resolved[s.id];
    const dzOk = dz && !judgeStreams(row, null, dz, { singers }).deezer;
    const ref =
      dzOk && dz?.durationMs && !/restaur/i.test(`${dz.title} ${dz.album}`) ? dz.durationMs / 1000 : null;
    const keys = [s.title, ...(s.altTitles ?? [])].map((x) => normTitle(x));
    let best: { t: CTrack; v: number } | null = null;
    const seen = new Set<string>();
    for (const [k, ts] of byTitle) {
      if (!keys.some((x) => k === x || k.includes(x))) continue;
      for (const t of ts) {
        if (seen.has(t.uri)) continue;
        seen.add(t.uri);
        const c = { name: t.name, artists: t.artists, album: t.album, durationMs: t.durationMs };
        if (matchProblem(row, c, ref, { singers })) continue;
        const v = evidence(row, c, ref, 0);
        if (!best || v > best.v) best = { t, v };
      }
    }
    cache[s.id] = best
      ? {
          uri: best.t.uri,
          url: best.t.url,
          durationMs: best.t.durationMs,
          album: best.t.album,
          popularity: 0,
          matched: `${best.t.artists.join(", ")} – ${best.t.name}`,
        }
      : (cache[s.id] ?? null);
    if (best) hits++;
    else none.push(`${s.id} ${s.title} (${s.orchestra}${s.singer ? ` / ${s.singer}` : ""} ${s.year ?? ""})`);
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 0));
  console.log(
    `crawl: ${pool.length} rows, ${hits} accepted by the match rules; total cache ${Object.keys(cache).length}`,
  );
  if (none.length) console.log(`no correct Spotify recording found:\n  ${none.join("\n  ")}`);
}

async function enrichCortinasByCrawl() {
  const known = JSON.parse(readFileSync(`${ROOT}data/knowledge/cortinas.json`, "utf8")) as Cortina[];
  const all = [
    ...new Map<string, Cortina>([...BUILTIN_CORTINAS, ...known].map((c) => [c.id, c])).values(),
  ].filter((c) => !c.tags?.includes("no-audio"));
  const seedFile = args.seedUris && existsSync(String(args.seedUris)) ? String(args.seedUris) : null;
  const seeds: string[] = seedFile
    ? Object.values(JSON.parse(readFileSync(seedFile, "utf8")) as Record<string, string>)
    : [];
  for (const v of Object.values(cueCache)) if (v?.uri) seeds.push(v.uri);
  const main = (a: string) => normTitle(a.split(/\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i)[0] ?? a);
  const artists = new Set(all.map((c) => main(c.artist)));
  const tracks = await crawl(String(args.crawl), seeds, (name) => artists.has(normTitle(name)));
  let hits = 0;
  const none: string[] = [];
  for (const c of all) {
    if (!(args.refresh === "true") && cueCache[c.id]) continue;
    let best: { t: CTrack; v: number } | null = null;
    for (const t of tracks) {
      if (
        cortinaMatchProblem(c, { name: t.name, artists: t.artists, album: t.album, durationMs: t.durationMs })
      )
        continue;
      const y = Number((t.release ?? "9999").slice(0, 4));
      const v = (c.year && y >= c.year - 1 && y <= c.year + 1 ? 5 : 0) - Math.max(0, y - (c.year ?? y)) / 10;
      if (!best || v > best.v) best = { t, v };
    }
    if (best) {
      cueCache[c.id] = {
        uri: best.t.uri,
        url: best.t.url,
        durationMs: best.t.durationMs,
        album: best.t.album,
        popularity: 0,
        matched: `${best.t.artists.join(", ")} – ${best.t.name}`,
      };
      hits++;
    } else if (
      artists.has(main(c.artist)) &&
      tracks.some((t) => t.artists.some((a) => normTitle(a) === main(c.artist)))
    )
      none.push(`${c.id} ${c.title} — ${c.artist}`);
  }
  writeFileSync(CUE_CACHE, JSON.stringify(cueCache, null, 0));
  console.log(`cortinas by crawl: ${hits} accepted; total ${Object.keys(cueCache).length}`);
  if (none.length) console.log(`crawled artist, no correct record found:\n  ${none.join("\n  ")}`);
}

(args.crawl && args.cortinas === "true"
  ? enrichCortinasByCrawl()
  : args.crawl
    ? enrichByCrawl()
    : args.cortinas === "true"
      ? enrichCortinas()
      : enrichSongs()
).catch((e) => {
  console.error(e);
  process.exit(1);
});
