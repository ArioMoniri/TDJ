/**
 * Round 15 — the Spotify cache audit (export matching): every cached id in data/cache/spotify/tracks.json is judged
 * against its index row with the match rules (packages/core/src/matchRules.ts) and R4a. Exits 1 on a bad id; `--fix`
 * sets those entries to null (the matcher searches them again under the same rules at export).
 *   pnpm --filter @tdj/core exec tsx ../../scripts/audit_spotify.ts [--fix]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { matchProblem } from "../packages/core/src/matchRules";
import { auditSpotifyCache } from "../packages/core/src/streams";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, "utf8"));
const songs = read("data/index/songs.json");
const resolved = read("data/cache/resolve/tracks.json");
const spPath = "data/cache/spotify/tracks.json";
const spotify = read(spPath);
const a = auditSpotifyCache(songs, spotify, resolved, matchProblem);
console.log(`Spotify cache audit: ${a.checked} cached ids checked, ${a.rejected.length} rejected`);
for (const r of a.rejected) console.log(`  ${r.row} ${r.uri}: ${r.why}`);
if (a.rejected.length && process.argv.includes("--fix")) {
  for (const r of a.rejected) spotify[r.row] = null;
  writeFileSync(`${ROOT}${spPath}`, JSON.stringify(spotify));
  console.log(`fixed: ${a.rejected.length} entries cleared`);
} else if (a.rejected.length) process.exit(1);
