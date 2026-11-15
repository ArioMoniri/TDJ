/**
 * `pnpm spotify:check <playlistId|link> [night.json|.tdjnight]`: reads a Spotify playlist with your own token
 * (SPOTIFY_TOKEN, e.g. copied from the Listen tab's session) page by page, with your market, and compares it row by
 * row with a saved night (default: the featured night). Writes nothing. Exit code 1 when anything differs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkView } from "../src/lib/exportCheckView";
import { orderedRows, playlistIdFrom, spotifyPlanFor } from "../src/lib/spotifyPlan";
import { spotifyCall } from "../src/lib/spotifyWeb";
import { writeVerified } from "../src/lib/spotifyWrite";

async function main() {
  const [arg, file] = process.argv.slice(2);
  const token = process.env.SPOTIFY_TOKEN;
  const id = arg ? playlistIdFrom(arg) : null;
  if (!id || !token) {
    console.error("usage: SPOTIFY_TOKEN=… pnpm spotify:check <playlistId|link> [night.json]");
    process.exit(2);
  }
  const path = file ?? join(__dirname, "../public/featured/golden-double-peak.json");
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const night = raw.playlist ?? raw;
  const plan = spotifyPlanFor(night, null, { includeCortinas: process.env.NO_CORTINAS !== "1" });
  const rows = orderedRows(plan, new Map());
  if (rows.length < plan.rows.length)
    console.warn(
      `${plan.rows.length - rows.length} rows of the night have no Spotify id yet (not compared).`,
    );
  const c = await writeVerified(
    spotifyCall(token),
    id,
    rows.map((r) => r.uri),
    { mode: "check", market: "from_token" },
  );
  const v = checkView(
    "Spotify",
    c,
    rows,
    c.rows.map((x) => ({ title: x.name, artist: x.artist })),
  );
  console.log(v.summary);
  for (const l of v.lines) console.log(`  ${l}`);
  if (process.env.VERBOSE === "1")
    for (const r of v.rows)
      console.log(`${String(r.pos).padStart(4)}  ${r.mark.padEnd(11)} ${r.title} — ${r.artist}  ${r.slot}`);
  else
    for (const r of v.rows.filter((x) => x.mark !== "ok"))
      console.log(`${String(r.pos).padStart(4)}  ${r.mark.padEnd(11)} ${r.title} — ${r.artist}  ${r.slot}`);
  process.exit(v.ok && !c.unavailable.length ? 0 : 1);
}
void main();
