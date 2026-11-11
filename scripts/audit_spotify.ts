/**
 * Round 15 — the Spotify cache audit (export matching): every cached id in data/cache/spotify/tracks.json is judged
 * against its index row with the match rules (packages/core/src/matchRules.ts) and R4a. Exits 1 on a bad id; `--fix`
 * sets those entries to null (the matcher searches them again under the same rules at export).
 * Round 16 (M1): the rules are judged as `judgeStreams` judges them — a Deezer length is the reference only when the
 * Deezer match itself passes; the index's later takes and voices count.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/audit_spotify.ts [--fix]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { auditStreamMatches } from "../packages/core/src/matchRules";
import { auditSpotifyCache, knownSingers } from "../packages/core/src/streams";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, "utf8"));
const songs = read("data/index/songs.json");
const resolved = read("data/cache/resolve/tracks.json");
const spPath = "data/cache/spotify/tracks.json";
const spotify = read(spPath);
const shared = auditSpotifyCache(songs, spotify, resolved, () => null);
const m = auditStreamMatches(songs, spotify, resolved, knownSingers(songs));
const rejected = [
  ...shared.rejected,
  ...m.spotify
    .filter((x) => !shared.rejected.some((r) => r.row === x.row))
    .map((x) => ({ row: x.row, uri: x.id, why: x.why })),
];
console.log(`Spotify cache audit: ${shared.checked} cached ids checked, ${rejected.length} rejected`);
for (const r of rejected) console.log(`  ${r.row} ${r.uri}: ${r.why}`);
if (rejected.length && process.argv.includes("--fix")) {
  for (const r of rejected) spotify[r.row] = null;
  writeFileSync(`${ROOT}${spPath}`, JSON.stringify(spotify));
  console.log(`fixed: ${rejected.length} entries cleared`);
} else if (rejected.length) process.exit(1);
