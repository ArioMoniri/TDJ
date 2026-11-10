/**
 * Round 15 — the stream audit as a build step (docs/reviews/round15-discography.md §5, R4a–R4d). Run after
 * `python3 scripts/build_index.py` by `pnpm index:build`:
 *   pnpm --filter @tdj/core exec tsx ../../scripts/audit_streams.ts [--fix]
 * Fails (exit 1) when one stream id is bound to rows of different dates, orchestras or singers (R4a), or a stream
 * title's recording date is more than 31 days from its row (R4b). `--fix` keeps every shared id on the row whose
 * date, album years or credit fit, and sets the other rows' cache entries to null (never searched again).
 * R4c (Spotify vs Deezer length) and R4d (a credit naming another singer) are reported; the catalogue applies them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { auditStreams, fixSharedStreams } from "../packages/core/src/streams";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, "utf8"));
const songs = read("data/index/songs.json");
const resolvedPath = "data/cache/resolve/tracks.json";
const spotifyPath = "data/cache/spotify/tracks.json";
let resolved = read(resolvedPath);
let spotify = read(spotifyPath);
let a = auditStreams(songs, resolved, spotify);
if (process.argv.includes("--fix") && (a.shared.length || a.dateMismatch.length)) {
  const f = fixSharedStreams(a, resolved, spotify, songs);
  resolved = f.resolved;
  spotify = f.spotify;
  writeFileSync(`${ROOT}${resolvedPath}`, JSON.stringify(resolved));
  writeFileSync(`${ROOT}${spotifyPath}`, JSON.stringify(spotify));
  console.log(`R4a/R4b fix: ${f.cleared.length} cache entries cleared`);
  a = auditStreams(songs, resolved, spotify);
}
console.log(
  `stream audit: R4a shared ${a.shared.length} · R4b date ${a.dateMismatch.length} · R4c length ${a.lengthMismatch.length} (Deezer length used) · R4d credit ${a.creditMismatch.length} (flagged suspect)`,
);
for (const x of a.shared.slice(0, 20))
  console.log(`  R4a ${x.streamId}: ${x.rows.join(", ")} (keep ${x.keep ?? "none"})`);
for (const x of a.dateMismatch.slice(0, 20)) console.log(`  R4b ${x.row} ${x.title} ${x.date}: ${x.stream}`);
if (a.shared.length || a.dateMismatch.length) {
  console.error("stream audit failed: run with --fix, or correct the caches by hand");
  process.exit(1);
}
