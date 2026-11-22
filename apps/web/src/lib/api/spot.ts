import {
  applyGuideFix,
  applyNightSettings,
  applyReviewFix,
  applySafeFixes,
  CLOSING_FORMATS,
  type ComposeOptions,
  changeNightEnd,
  editGuide,
  type GuideFix,
  insertSong,
  insertSongOptions,
  insertTanda,
  insertTandaOptions,
  mendNightCortinas,
  type NightSettingsPatch,
  type Playlist,
  REVIEW_SETTING_KEYS,
  type ReviewFix,
  removeSong,
  removeTanda,
  reorderTandas,
  reviewNight,
  type Song,
  type SpotOption,
  withNightRules,
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
 * - `mend` { playlist, cumparsitas? } → the night's cortinas set right after any edit (rooms, lib/roomCortinas.ts)
 * - `settings` { playlist, patch } → a room's Night settings applied, the cortinas re-mended (RoomNightSettings)
 * - `review` { playlist, settings?, level?, fixedBefore? } → { findings, reorder, counts } ("Import a night": core
 *   review.ts, the night read against the DJ's Compose settings) · `reviewFix` { playlist, fix, settings? } → the night
 *   with a finding's fix · `safeFixes` { playlist, settings?, fixedBefore? } → every safe fix at once (`applied`) ·
 *   `reorder` { playlist, order } → the tandas in a new order (the review's diff, a drag of the tanda list)
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

const REVIEW_FIXES = new Set(["side", "removeSide", "order", "guide"]);
/** the DJ's Compose settings a review follows (only the night and tanda rules; anything else is dropped) */
export function reviewSettings(x: unknown): Partial<ComposeOptions> | undefined {
  if (!x || typeof x !== "object") return undefined;
  const v = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of REVIEW_SETTING_KEYS) if (v[k] !== undefined && v[k] !== null) out[k] = v[k];
  return Object.keys(out).length ? (out as Partial<ComposeOptions>) : undefined;
}
/** a review fix as the route takes it (its shape checked; the engine refuses what does not fit the night) */
export function reviewFixOf(x: unknown): ReviewFix | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Record<string, unknown>;
  if (!REVIEW_FIXES.has(String(f.kind))) return null;
  if (f.kind === "guide") {
    const g = f.fix as GuideFix | undefined;
    return g && FIXES.has(String(g.kind)) ? { kind: "guide", fix: g } : null;
  }
  if (f.kind === "order")
    return Array.isArray(f.order) && f.order.length <= 400
      ? { kind: "order", order: f.order.map(int) }
      : null;
  if (f.kind === "side")
    return typeof f.songId === "string"
      ? { kind: "side", tanda: int(f.tanda), side: int(f.side), songId: f.songId.slice(0, 160) }
      : null;
  return { kind: "removeSide", tanda: int(f.tanda), side: int(f.side) };
}

const PATTERNS = ["classic", "TTVTTM", "TTVTTM-strict", "TVTM", "TMTV", "tango-only"];
const strs = (x: unknown) =>
  Array.isArray(x)
    ? x.filter((v): v is string => typeof v === "string" && /^[\w:-]{1,40}$/.test(v)).slice(0, 12)
    : undefined;
/** the room's Night settings as the route takes them (unknown keys and values dropped) */
export function settingsPatch(x: unknown): NightSettingsPatch | null {
  if (!x || typeof x !== "object") return null;
  const v = x as Record<string, unknown>;
  const out: NightSettingsPatch = {};
  const cultures = strs(v.cortinaCultures);
  if (cultures?.length) out.cortinaCultures = cultures;
  const genres = strs(v.cortinaGenres);
  if (genres) out.cortinaGenres = genres;
  if (typeof v.cortinaLengthSec === "number" && Number.isFinite(v.cortinaLengthSec))
    out.cortinaLengthSec = v.cortinaLengthSec;
  if (typeof v.cortinaFadeOutSec === "number" && Number.isFinite(v.cortinaFadeOutSec))
    out.cortinaFadeOutSec = v.cortinaFadeOutSec;
  if (v.cortinaChoice === "auto" || v.cortinaChoice === "pick") out.cortinaChoice = v.cortinaChoice;
  if (typeof v.pattern === "string" && PATTERNS.includes(v.pattern))
    out.pattern = v.pattern as NightSettingsPatch["pattern"];
  if (typeof v.lastFourTango === "boolean") out.lastFourTango = v.lastFourTango;
  if (typeof v.closingFormat === "string" && (CLOSING_FORMATS as readonly string[]).includes(v.closingFormat))
    out.closingFormat = v.closingFormat as NightSettingsPatch["closingFormat"];
  if (typeof v.opening === "boolean") out.opening = v.opening;
  return Object.keys(out).length ? out : null;
}

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
    // 2026-11 (rooms): the night's cortinas mended after any edit (and its Cumparsitas when it grew from empty), and
    // the room's Night settings (core insert.ts mendNightCortinas / applyNightSettings)
    case "mend": {
      const r = mendNightCortinas(playlist, deps, { cumparsitas: b!.cumparsitas === true });
      return json({ ...forWire(r), changed: r !== playlist });
    }
    case "settings": {
      const patch = settingsPatch(b!.patch);
      if (!patch) return bad("patch required");
      const r = applyNightSettings(playlist, patch, deps);
      return json({ ...forWire(r), changed: true });
    }
    // 2026-11: "Import a night" — the review of a night against the DJ's Compose settings, and its fixes. A fix is
    // worked out on the night read with those settings (a cortina, a La Cumparsita by the DJ's rules) and comes back
    // with the night's own options: the review never changes the night's settings.
    case "review": {
      const settings = reviewSettings(b!.settings);
      const level = b!.level === "booth" ? "booth" : "compose";
      const fixedBefore = Math.max(0, int(b!.fixedBefore) || 0);
      return json(reviewNight(playlist, deps, { settings, level, fixedBefore }));
    }
    case "reviewFix": {
      const fix = reviewFixOf(b!.fix);
      if (!fix) return bad("fix required");
      const ruled = withNightRules(playlist, reviewSettings(b!.settings));
      const r = applyReviewFix(ruled, fix, deps);
      return edit(
        playlist,
        r.playlist === ruled
          ? { playlist, reason: r.reason }
          : { playlist: { ...r.playlist, options: playlist.options } },
      );
    }
    case "safeFixes": {
      const settings = reviewSettings(b!.settings);
      const fixedBefore = Math.max(0, int(b!.fixedBefore) || 0);
      const ruled = withNightRules(playlist, settings);
      const r = applySafeFixes(ruled, deps, { settings, fixedBefore });
      const after = r.applied ? { ...r.playlist, options: playlist.options } : playlist;
      return json({ ...forWire(after), changed: r.applied > 0, applied: r.applied });
    }
    case "reorder": {
      if (!Array.isArray(b!.order)) return bad("order required");
      return edit(playlist, reorderTandas(playlist, b!.order.slice(0, 400).map(int), deps));
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
