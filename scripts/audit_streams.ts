/**
 * Round 15 — the stream audit as a build step (docs/reviews/round15-discography.md §5, R4a–R4d). Run after
 * `python3 scripts/build_index.py` by `pnpm index:build`:
 *   pnpm --filter @tdj/core exec tsx ../../scripts/audit_streams.ts [--fix]
 * Fails (exit 1) when one stream id is bound to rows of different dates, orchestras or singers (R4a), or a stream
 * title's recording date is more than 31 days from its row (R4b). `--fix` keeps every shared id on the row whose
 * date, album years or credit fit, and sets the other rows' cache entries to null (never searched again).
 * R4c (Spotify vs Deezer length) and R4d (a credit naming another singer) are reported; the catalogue applies them.
 * Round 16 (docs/reviews/round16-discography.md M1, M7): every cached Deezer id is judged by the same match rules as
 * Spotify (whole-name leader, title equality, voices, album years, remake series, positive evidence beside a later
 * take), and every cortina record by the cortina rules; a rejection fails the run, `--fix` clears it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { auditCortinaCaches } from "../packages/core/src/load";
import { auditStreamMatches } from "../packages/core/src/matchRules";
import { auditStreams, fixSharedStreams, knownSingers } from "../packages/core/src/streams";

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
// M1: the Deezer cache judged by the same rules as Spotify
let m = auditStreamMatches(songs, spotify, resolved, knownSingers(songs));
if (process.argv.includes("--fix") && m.deezer.length) {
  for (const x of m.deezer) resolved[x.row] = null;
  writeFileSync(`${ROOT}${resolvedPath}`, JSON.stringify(resolved));
  console.log(`M1 fix: ${m.deezer.length} Deezer entries cleared`);
  m = auditStreamMatches(songs, spotify, resolved, knownSingers(songs));
}
console.log(`Deezer match audit (M1): ${m.checked.deezer} checked, ${m.deezer.length} rejected`);
for (const x of m.deezer.slice(0, 30)) console.log(`  M1 ${x.row} deezer:${x.id}: ${x.why}`);
// M7: cortina records
const cuePath = "data/cache/resolve/cortinas.json";
const cueSpPath = "data/cache/spotify/cortinas.json";
let cr = auditCortinaCaches(ROOT);
if (process.argv.includes("--fix") && cr.length) {
  const rz = read(cuePath);
  let sp: Record<string, unknown> = {};
  try {
    sp = read(cueSpPath);
  } catch {}
  for (const x of cr) {
    if (x.why.startsWith("deezer:")) rz[x.id] = null;
    else sp[x.id] = null;
  }
  writeFileSync(`${ROOT}${cuePath}`, JSON.stringify(rz));
  if (Object.keys(sp).length) writeFileSync(`${ROOT}${cueSpPath}`, JSON.stringify(sp));
  console.log(`M7 fix: ${cr.length} cortina records cleared`);
  cr = auditCortinaCaches(ROOT);
}
console.log(`cortina record audit (M7): ${cr.length} rejected`);
for (const x of cr) console.log(`  M7 ${x.id}: ${x.why}`);
if (a.shared.length || a.dateMismatch.length || m.deezer.length || cr.length) {
  console.error("stream audit failed: run with --fix, or correct the caches by hand");
  process.exit(1);
}
