import {
  applyGuideFix,
  changeNightEnd,
  editGuide,
  type GuideFix,
  insertSong,
  insertSongOptions,
  insertTanda,
  insertTandaOptions,
  type Playlist,
  removeSong,
  removeTanda,
  type Song,
  type SpotOption,
} from "@tdj/core";
import { forWire, swapWire } from "@/lib/server/wire";
import type { AppOverrides } from "@/lib/types";
import type { ApiDeps } from "./deps";
import { stableSeed } from "./engine";
import { bad, bodyJson, json } from "./http";
import { externalSide } from "./tandaSet";

/**
 * POST /api/spot — 2026-11 (the owner: "songs and tandas insertable or removable in each tanda and before / after
 * tandas, by AI and manually; the AI guides"). One route for a spot in the night (core insert.ts / nightEnd.ts):
 *
 * - `songOptions` { playlist, tandaIndex, at, ids? } → { suggestions, judged } (sides for that place, each with a why)
 * - `tandaOptions` { playlist, at, rhythm? } → { options: [{ playlist, why }] } (whole tandas for a new chair)
 * - `insertSong` { playlist, tandaIndex, at, side } · `removeSong` { playlist, tandaIndex, trackIndex }
 * - `insertTanda` { playlist, at, sides } · `removeTanda` { playlist, tandaIndex }
 * - `guide` { before, after } → { lines } · `fix` { playlist, fix } → the night with a guide line's fix
 * - `end` { playlist, from, targetSec } → the Booth's "Change the end…" (the night, the new end, what changed)
 *
 * An edit comes back re-timed and re-scored with `changed`, or `reason` (409); the browser's rule check (gateEdit)
 * judges it before it applies, and the guide (`guide`) says what it did to the night.
 */
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : Number.NaN);
const side = (x: unknown): string | Song | null =>
  typeof x === "string" ? x.slice(0, 160) : externalSide(x);
const spotWire = (x: SpotOption) => ({ ...swapWire(x), why: x.why });
const edit = (before: Playlist, r: { playlist: Playlist; reason?: string }) => {
  const changed = r.playlist !== before;
  return json(
    { ...forWire(r.playlist), changed, ...(r.reason ? { reason: r.reason } : {}) },
    { status: changed || !r.reason ? 200 : 409 },
  );
};
const FIXES = new Set([
  "removeTanda",
  "moveTanda",
  "retune",
  "swapTanda",
  "cortina",
  "noCortina",
  "opening",
  "closing",
]);

export async function spot(req: Request, d: ApiDeps): Promise<Response> {
  const b = await bodyJson<Record<string, unknown>>(req);
  const action = typeof b?.action === "string" ? b.action : "";
  const playlist = (b?.playlist ?? b?.after) as Playlist | undefined;
  if (!playlist?.tandas || !playlist.options) return bad("playlist required");
  const deps = d.catalogFor(playlist.options?.overrides as AppOverrides);
  switch (action) {
    case "songOptions": {
      const ids = Array.isArray(b!.ids)
        ? b!.ids.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 120))
        : undefined;
      const r = insertSongOptions(playlist, int(b!.tandaIndex), int(b!.at), deps, { ids, limit: 10 });
      return json({ suggestions: r.suggestions.map(spotWire), judged: r.judged.map(spotWire) });
    }
    case "tandaOptions": {
      const rhythm = ["tango", "vals", "milonga"].includes(String(b!.rhythm))
        ? (b!.rhythm as "tango")
        : undefined;
      const r = insertTandaOptions(playlist, int(b!.at), deps, {
        n: 4,
        rhythm,
        seed: stableSeed(playlist, int(b!.at), b!.seed),
      });
      return json({ options: r.map((o) => ({ playlist: forWire(o.playlist), why: o.why })) });
    }
    case "insertSong": {
      const s = side(b!.side);
      if (!s) return bad("side required (a catalogue id or a service recording)");
      return edit(playlist, insertSong(playlist, int(b!.tandaIndex), int(b!.at), s, deps));
    }
    case "removeSong":
      return edit(playlist, removeSong(playlist, int(b!.tandaIndex), int(b!.trackIndex), deps));
    case "insertTanda": {
      if (!Array.isArray(b!.sides)) return bad("sides required");
      const sides: Array<string | Song> = [];
      for (const x of b!.sides.slice(0, 8)) {
        const s = side(x);
        if (!s) return bad("each side is a catalogue id or a service recording (id ext:…, title)");
        sides.push(s);
      }
      return edit(playlist, insertTanda(playlist, int(b!.at), { sides }, deps));
    }
    case "removeTanda":
      return edit(playlist, removeTanda(playlist, int(b!.tandaIndex), deps));
    case "guide": {
      const before = b!.before as Playlist | undefined;
      if (!before?.tandas) return bad("before required");
      return json({ lines: editGuide(before, playlist, deps) });
    }
    case "fix": {
      const fix = b!.fix as GuideFix | undefined;
      if (!fix || !FIXES.has(String(fix.kind))) return bad("fix required");
      return edit(playlist, applyGuideFix(playlist, fix, deps));
    }
    case "end": {
      const targetSec = Number(b!.targetSec);
      if (!Number.isFinite(targetSec)) return bad("targetSec required");
      const r = changeNightEnd(playlist, deps, { from: Math.max(0, int(b!.from) || 0), targetSec });
      return json({ ...r, playlist: forWire(r.playlist), changed: r.playlist !== playlist });
    }
    default:
      return bad("unknown action");
  }
}
