/**
 * Round 18 — the featured night's rehearsal clips against its checked Spotify recordings (docs/specs/round18-booth.md).
 *   pnpm --filter @tdj/web exec tsx ../../scripts/audit_featured_clips.ts [--fix]
 * For every side and cortina of apps/web/public/featured/*.json: the Spotify length, the Deezer `resolved` length and
 * the booth's clip verdict (`rehearsalClip`: a Spotify preview of the checked recording, else the Deezer clip only
 * when it is the same recording — within 6 s and accepted by the shared match rules — else none, with the reason).
 * `--fix`: writes `spotify.previewUrl` from data/cache/spotify/previews.json (Spotify's own 30 s previews of the
 * checked track ids, collected from the Spotify connector; never searched or matched here) and clears a `resolved`
 * Deezer entry that is another transfer or take of the side, so no player rehearses a different recording.
 * The night's tandas, order, songs and Spotify ids are never changed. Exit 1 when a side would rehearse a clip that
 * is not its Spotify recording.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { rehearsalClip, SAME_RECORDING_TOL_SEC, SPOTIFY_PREVIEW } from "../apps/web/src/lib/booth/clips";
import type { Cortina, Playlist, Song } from "../packages/core/src/types";

const ROOT = new URL("..", import.meta.url).pathname;
const fix = process.argv.includes("--fix");
const previews = JSON.parse(readFileSync(`${ROOT}data/cache/spotify/previews.json`, "utf8")) as Record<
  string,
  string
>;
const dir = `${ROOT}apps/web/public/featured/`;
let bad = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const p = JSON.parse(readFileSync(dir + f, "utf8")) as Playlist;
  const items: Array<Song | Cortina> = [];
  if (p.opening) items.push(p.opening);
  for (const t of p.tandas) {
    items.push(...t.songs);
    if (t.cortina) items.push(t.cortina);
  }
  if (p.closing) items.push(p.closing);
  const n = { spotify: 0, deezer: 0, none: 0, cleared: 0, previews: 0, diff: 0 };
  for (const e of items) {
    const sp = e.spotify as (Song["spotify"] & { previewUrl?: string }) | null | undefined;
    if (fix && sp?.uri && previews[sp.uri] && SPOTIFY_PREVIEW.test(previews[sp.uri]!)) {
      if (sp.previewUrl !== previews[sp.uri]) n.previews++;
      sp.previewUrl = previews[sp.uri];
    }
    const spSec = sp?.durationMs ? sp.durationMs / 1000 : null;
    const dzSec = e.resolved?.durationMs ? e.resolved.durationMs / 1000 : null;
    // the Deezer entry judged on its own (with no Spotify preview in the way)
    const dz = rehearsalClip({ ...e, spotify: sp ? { ...sp, previewUrl: null } : sp } as Song | Cortina);
    const deezerIsOther = !!e.resolved && !!sp && dz.clip === null;
    if (deezerIsOther) n.diff++;
    if (fix && deezerIsOther) {
      e.resolved = null;
      n.cleared++;
    }
    const v = rehearsalClip(e);
    if (v.clip) n[v.clip.from]++;
    else n.none++;
    // a Deezer clip that is used must be within the tolerance of the Spotify recording
    if (v.clip?.from === "deezer" && spSec && dzSec && Math.abs(dzSec - spSec) > SAME_RECORDING_TOL_SEC)
      bad++;
    const mark = v.clip ? v.clip.from : `none: ${v.why}`;
    console.log(
      `${e.title.padEnd(34)} spotify ${spSec?.toFixed(1) ?? "—"} s · deezer ${dzSec?.toFixed(0) ?? "—"} s · ${mark}${deezerIsOther ? (fix ? " · Deezer cleared" : ` · Deezer is not the Spotify recording (${dz.why})`) : ""}`,
    );
  }
  console.log(
    `${f}: ${items.length} items · clips: ${n.spotify} Spotify previews, ${n.deezer} Deezer (same recording) · ${n.none} without a clip · ${n.diff} Deezer entries not the Spotify recording${fix ? ` (${n.cleared} cleared, ${n.previews} Spotify previews written)` : ""}`,
  );
  // the shipped files are compact JSON (one line, no trailing newline): keep the format
  if (fix) writeFileSync(dir + f, JSON.stringify(p));
}
if (bad) {
  console.error(`${bad} items would rehearse a clip that is not their Spotify recording`);
  process.exit(1);
}
