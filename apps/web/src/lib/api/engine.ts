import {
  adaptNext,
  applyFeedback,
  BUILTIN_CORTINAS,
  benchmarkNight,
  checkEdit,
  cleanFavouriteTable,
  compose as composeNight,
  cortinaPool,
  type EditSuggestion,
  ERA_PRESETS,
  EXPORT_META,
  EXPORTERS,
  type ExportFormat,
  type Feedback,
  favouriteTable,
  improveNight,
  type NightException,
  nightExceptionKeys,
  normalizeFavourites,
  type Playlist,
  replaceSide,
  type SwapOption,
  suggestFixes,
  swapOptions as swapOptionsFor,
  swapTanda,
  swapTandaOptions,
  swapTrack as swapTrackIn,
  type Tanda,
} from "@tdj/core";
import { applyPaths, fixGenres, withoutCortinas } from "@/lib/exportPaths";
import { FEEDBACK_VALUES } from "@/lib/feedback";
import { forWire, swapWire } from "@/lib/server/wire";
import type { AppOverrides } from "@/lib/types";
import type { ApiDeps } from "./deps";
import { bad, bodyJson, json } from "./http";

/**
 * The composer's routes as plain functions of (Request, runtime): compose, improve, benchmark, the swaps, the
 * index's metadata and search, feedback and the file exports. The server's route handlers call them with the
 * server's runtime (lib/server/deps.ts); the apps call them in a Web Worker with the bundled index.
 */

const objectOrUndefined = <T>(v: unknown): T | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as T) : undefined;

export async function compose(req: Request, d: ApiDeps): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Body must be an object");
  const hoursRaw = body.hours === undefined ? 4 : Number(body.hours);
  if (!Number.isFinite(hoursRaw)) return bad("hours must be a number between 0.5 and 12");
  const hours = Math.min(12, Math.max(0.5, hoursRaw));
  if (body.eras !== undefined && !Array.isArray(body.eras)) return bad("eras must be an array");
  for (const [k, ok] of [
    ["tangoTandaSize", [3, 4, 5]],
    ["valsTandaSize", [3, 4]],
    ["milongaTandaSize", [3, 4]],
  ] as const) {
    const v = body[k];
    if (v !== undefined && !(ok as readonly number[]).includes(Number(v)))
      return bad(`${k} must be one of ${ok.join(", ")}`);
  }
  const { locked: lockedRaw, overrides: ovRaw, autoImprove, favourites: favRaw, ...rest } = body;
  // 2026-11: the DJ's dancer favourites — the decayed table the web sends (numbers only), or the tracker itself
  // (the apps and scripts), decayed here
  const favourites = favouritesOf(favRaw) ?? undefined;
  const locked = Array.isArray(lockedRaw)
    ? (lockedRaw as Tanda[]).filter((t) => t && typeof t.index === "number" && Array.isArray(t.songs))
    : [];
  const overrides = objectOrUndefined<AppOverrides>(ovRaw);
  try {
    const { catalog, cortinas, contextModel } = d.catalogFor(overrides);
    const { contextFactors: _cf, ...coreOverrides } = overrides ?? {};
    const p = composeNight(
      {
        ...rest,
        hours,
        overrides: overrides ? coreOverrides : undefined,
        ...(favourites ? { favourites } : {}),
      },
      { catalog, cortinas, contextModel },
      { locked },
    );
    // round 13: "Auto-improve against published sets" (Settings, on by default) runs improveNight on the new set;
    // the client reads `autoImproved` for the change summary line and keeps the improved night
    if (autoImprove === true) {
      const r = improveNight(p, { catalog, cortinas, contextModel });
      return json({
        ...forWire(r.playlist),
        autoImproved: { changes: r.changes, before: r.before, after: r.after },
      });
    }
    return json(forWire(p));
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not compose this set");
  }
}

/**
 * Improve a night against the benchmark and the engine score (packages/core/src/benchmark.ts → improveNight): a
 * change is kept only when neither number falls and no hard failure appears. Same catalogue (and user overrides) as
 * /api/compose. Returns `{ playlist, changes, before, after }`; the client decides whether to keep it.
 */
export async function improve(req: Request, d: ApiDeps): Promise<Response> {
  const cross = await d.guard(req);
  if (cross) return cross;
  const body = await bodyJson<Record<string, unknown>>(req);
  const playlist = body?.playlist as Playlist | undefined;
  if (!playlist || !Array.isArray(playlist.tandas) || !playlist.options || !playlist.score)
    return bad("playlist required");
  const overrides = objectOrUndefined<AppOverrides>(body?.overrides ?? playlist.options.overrides);
  try {
    const { catalog, cortinas, contextModel } = d.catalogFor(overrides);
    const r = improveNight(playlist, { catalog, cortinas, contextModel });
    return json({ ...r, playlist: forWire(r.playlist) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not improve this set");
  }
}

/** The night against the published DJ sets (docs/specs/round12-benchmark.md): `{ total, checks, inRange, scored }`. */
export async function benchmark(req: Request, d: ApiDeps): Promise<Response> {
  const cross = await d.guard(req);
  if (cross) return cross;
  const body = await bodyJson<Record<string, unknown>>(req);
  const playlist = (body?.playlist ?? body) as Playlist | null;
  if (!playlist || !Array.isArray(playlist.tandas) || !playlist.options) return bad("playlist required");
  try {
    // the tandas the DJ approved as they are for this night only (the featured night's exceptions) are accepted
    const approved = nightExceptionKeys(d.catalog().catalog.learned, playlist.id);
    return json(benchmarkNight(playlist, { approved }));
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not benchmark this set");
  }
}

interface SwapBody {
  playlist?: Playlist;
  index?: unknown;
  tandaIndex?: unknown;
  trackIndex?: unknown;
  query?: unknown;
  songId?: unknown;
  force?: unknown;
  pin?: unknown;
  seed?: unknown;
  /** 2026-11: the DJ's dancer favourites now (null: switched off; absent: the night's own) */
  favourites?: unknown;
  /** 2026-11: the smart search's catalogue results, judged for this chair (`judged`) */
  ids?: unknown;
}

/** the request's dancer favourites: a table (or a tracker, decayed now), null (none), or undefined (the night's own) */
const favouritesOf = (x: unknown) => {
  if (x === null) return null;
  if (x && typeof x === "object" && Array.isArray((x as { taps?: unknown }).taps)) {
    const f = normalizeFavourites(x);
    return f ? favouriteTable(f) : undefined;
  }
  return cleanFavouriteTable(x);
};

/**
 * Swap one tanda. Body: { playlist, index, options? }. Wave 2: with `options: true` the answer is up to three
 * nights, each with another family in the slot, ranked by distance to the slot's planned energy (nearest first), for
 * the DJ to choose from; without it, the single swap as before.
 */
export async function swap(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<SwapBody & { options?: unknown }>(req);
  if (!body?.playlist?.tandas) return bad("playlist required");
  const { playlist, index } = body;
  const { catalog, cortinas, contextModel } = d.catalogFor(playlist.options?.overrides as AppOverrides);
  const deps = { catalog, cortinas, contextModel };
  if (body.options === true)
    // (QA fix 2026-11: the same night and slot give the same choices every time — a seeded tie-break, not the clock;
    // a caller asking for others passes its own seed)
    return json({
      options: swapTandaOptions(
        playlist,
        Number(index),
        deps,
        stableSeed(playlist, Number(index), body.seed),
      ).map(forWire),
    });
  return json(forWire(swapTanda(playlist, Number(index), deps)));
}

/**
 * 2026-11 — live adaptation (core adapt.ts): after a tanda's floor reaction in the Booth. Body: { playlist, after (0-based
 * tanda the floor reacted to), reaction ("full" | "ok" | "emptied" | null), hearts? (the room's hearts on its songs),
 * frozen? (0-based tandas that cannot change: played, playing), favourites?, learned? }. The answer is
 * { suggestion: null } or one suggestion with the night it would make (on the wire); nothing is applied here.
 */
export async function adapt(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<{
    playlist?: Playlist;
    after?: unknown;
    reaction?: unknown;
    hearts?: unknown;
    frozen?: unknown;
    favourites?: unknown;
    learned?: unknown;
    seed?: unknown;
  }>(req);
  if (!body?.playlist?.tandas) return bad("playlist required");
  const after = Number(body.after);
  if (!Number.isInteger(after) || after < 0 || after >= body.playlist.tandas.length)
    return bad("after out of range");
  const reaction =
    body.reaction === "full" || body.reaction === "ok" || body.reaction === "emptied" ? body.reaction : null;
  const hearts = Number.isFinite(Number(body.hearts)) ? Number(body.hearts) : undefined;
  const frozen = Array.isArray(body.frozen) ? body.frozen.map(Number).filter(Number.isInteger) : [];
  const { catalog, cortinas, contextModel } = d.catalogFor(body.playlist.options?.overrides as AppOverrides);
  const favourites = favouritesOf(body.favourites) ?? undefined;
  const learned = objectOrUndefined<Playlist["options"]["learned"]>(body.learned);
  const s = adaptNext(
    body.playlist,
    after,
    { reaction, ...(hearts !== undefined ? { hearts } : {}) },
    { catalog, cortinas, contextModel },
    {
      frozen,
      ...(favourites ? { favourites } : {}),
      ...(learned ? { learned } : {}),
      seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : 1,
    },
  );
  return json({ suggestion: s ? { ...s, playlist: forWire(s.playlist) } : null });
}

/**
 * Round 21 — the Swap sheet's lists for one chair: `suggestions` (the sides that keep the tanda valid, best fit first)
 * and, with `query`, `results` (the catalogue by title, orchestra or singer; each excluded side with its reason).
 */
export async function swapOptions(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<SwapBody>(req);
  if (!body?.playlist?.tandas) return bad("playlist required");
  const { playlist, tandaIndex, trackIndex, query } = body;
  const deps = d.catalogFor(playlist.options?.overrides as AppOverrides);
  const ti = Number(tandaIndex),
    si = Number(trackIndex);
  const r = swapOptionsFor(playlist, ti, si, deps, {
    query: typeof query === "string" ? query.slice(0, 80) : undefined,
    favourites: favouritesOf(body.favourites),
    ids: Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 120))
      : undefined,
  });
  // a side excluded only by a tanda rule (another singer, an instrumental, the years, a title already tonight) may
  // still be chosen: the rule check asks the DJ first (core editCheck, the tanda rules only: cheap per row)
  const asks = (x: SwapOption) => {
    const t = playlist.tandas[ti];
    if (x.ok || !t?.songs[si]) return false;
    const after = {
      ...playlist,
      tandas: playlist.tandas.map((y, i) =>
        i === ti ? { ...y, songs: y.songs.map((s, k) => (k === si ? x.song : s)) } : y,
      ),
    };
    return checkEdit(playlist, after, { scope: "tandas" }).violations.some((v) => v.severity === "hard");
  };
  const wire = (x: SwapOption) => ({ ...swapWire(x), ...(asks(x) ? { asks: true } : {}) });
  return json({
    suggestions: r.suggestions.map(swapWire),
    results: r.results.map(wire),
    ...(r.judged.length ? { judged: r.judged.map(wire) } : {}),
  });
}

/**
 * Swap one side. Round 21: with `songId` the DJ's choice from the Swap sheet takes the chair — a side that keeps the
 * tanda valid, or (with `force`) any side, and then the tanda is pinned as the DJ's; without it the engine draws a
 * valid side. The night comes back re-timed and re-scored; `reason` says why a side was refused.
 */
export async function swapTrack(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<SwapBody>(req);
  if (!body?.playlist?.tandas) return bad("playlist required");
  const { playlist, tandaIndex, trackIndex, songId, force, pin } = body;
  const deps = d.catalogFor(playlist.options?.overrides as AppOverrides);
  if (typeof songId === "string") {
    const r = replaceSide(playlist, Number(tandaIndex), Number(trackIndex), songId, deps, {
      force: !!force,
      pin: !!pin,
    });
    const changed = r.playlist !== playlist;
    return json(
      { ...forWire(r.playlist), changed, ...(r.reason ? { reason: r.reason } : {}) },
      { status: changed || !r.reason ? 200 : 409 },
    );
  }
  const np = swapTrackIn(playlist, Number(tandaIndex), Number(trackIndex), deps);
  return json({ ...forWire(np), changed: np !== playlist });
}

/**
 * The rule check before an edit (core editCheck.ts). Body: { before, after, exceptions? } — the night before and after
 * the DJ's edit, and the night's approved one-night exceptions. Answer: { violations } (each with its facts from the
 * catalogue) and { suggestions } (up to three nights that keep the hard rules — or, with none broken, the soft ones —
 * each one passing the check for its rule).
 */
export async function checkEditRoute(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<{
    before?: Playlist;
    after?: Playlist;
    exceptions?: NightException[];
    scope?: unknown;
    favourites?: unknown;
  }>(req);
  const before = body?.before,
    after = body?.after;
  if (!before?.tandas || !after?.tandas || !after.options) return bad("before and after required");
  const exceptions = Array.isArray(body?.exceptions) ? body.exceptions : [];
  // (a hand-built draft: the tanda rules only)
  const scope = body?.scope === "tandas" ? ("tandas" as const) : ("all" as const);
  try {
    const deps = d.catalogFor(after.options?.overrides as AppOverrides);
    const { violations } = checkEdit(before, after, { catalog: deps.catalog, exceptions, scope });
    const hard = violations.filter((v) => v.severity === "hard");
    const asked = hard.length ? hard : violations;
    const suggestions: EditSuggestion[] = [];
    for (const v of asked) {
      if (suggestions.length >= 3) break;
      let found: EditSuggestion[] = [];
      try {
        found = suggestFixes(before, after, v, deps, 3 - suggestions.length, {
          scope,
          favourites: favouritesOf(body?.favourites),
        });
      } catch {}
      for (const s of found) if (!suggestions.some((x) => x.text === s.text)) suggestions.push(s);
    }
    return json({
      violations,
      suggestions: suggestions.slice(0, 3).map((s) => ({ ...s, playlist: forWire(s.playlist) })),
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not check this edit");
  }
}

export async function meta(_req: Request, d: ApiDeps): Promise<Response> {
  const { catalog, cortinas, meta, contextModel, corpus, trackEnergy, referencePlaylists } = d.catalog();
  const pool = cortinaPool(cortinas);
  const cultures = [...new Set(pool.map((c) => c.culture))].sort();
  const genres = [...new Set(pool.map((c) => c.genre))].sort();
  const orchestras = [...catalog.byOrchestra.entries()]
    .map(([id, songs]) => {
      const p = catalog.profile(id);
      // round 22 (Orchestras tab): the years it recorded, its most-recorded singers and a cover from its best-known side
      const years = songs.map((s) => s.year).filter((y): y is number => !!y && y > 1900);
      const counts = new Map<string, number>();
      for (const s of songs) if (s.singer) counts.set(s.singer, (counts.get(s.singer) ?? 0) + 1);
      const cover = songs.filter((s) => s.resolved?.artwork).sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))[0]
        ?.resolved?.artwork;
      return {
        id,
        name: songs[0]!.orchestra,
        count: songs.length,
        tier: p?.tier ?? 3,
        style: p?.style,
        energy: p?.energy,
        phase: p?.phase,
        notBefore: p?.notBefore,
        singers: p?.singers,
        // 2026-11: the other names the search knows it by ("OTV", "Pichuco")
        ...(p?.aliases?.length ? { aliases: p.aliases } : {}),
        years: years.length ? [Math.min(...years), Math.max(...years)] : undefined,
        topSingers: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
        instrumentals: songs.filter((s) => !s.singer).length,
        artwork: cover,
      };
    })
    .filter((o) => o.count >= 12)
    .sort((a, b) => a.tier - b.tier || b.count - a.count);
  return json(
    {
      meta,
      cultures,
      genres,
      cortinas: pool.length,
      cortinaList: pool,
      builtinCortinas: BUILTIN_CORTINAS.length,
      eras: ERA_PRESETS,
      orchestras,
      contextModel: contextModel
        ? {
            version: contextModel.version,
            baseline: contextModel.baseline,
            factors: contextModel.factors.map((f) => ({
              id: f.id,
              label: f.label,
              options: f.options.map((o) => ({
                id: o.id,
                label: o.label,
                energyShift: o.energyShift,
                tempoShift: o.tempoShift,
                vocalRatioShift: o.vocalRatioShift,
                valsShare: o.valsShare,
                milongaShare: o.milongaShare,
                cortinaGenres: o.cortinaGenres,
                tandaSizeShift: o.tandaSizeShift,
                evidence: o.evidence,
                notes: o.notes,
                arcShift: o.arcShift,
                preferStyles: o.preferStyles,
                avoidStyles: o.avoidStyles,
              })),
            })),
          }
        : null,
      referencePlaylists,
      featuredLearned: catalog.learned ?? null,
      knowledge: {
        profiles: catalog.profiles.size,
        cortinas: pool.length,
        contextFactors: contextModel?.factors.length ?? 0,
        referencePlaylists: referencePlaylists.length,
        trackEnergy: Object.keys(trackEnergy).length,
        famousRecordings: corpus.famousRecordings?.length ?? 0,
        canonicalTandas: corpus.canonicalTandas?.length ?? 0,
      },
      storage: d.storage(),
    },
    // the index is built at deploy time: let the browser and the CDN keep it for a while
    { headers: { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

export async function search(req: Request, d: ApiDeps): Promise<Response> {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json(q.trim().length < 2 ? [] : d.catalog().catalog.search(q, 40));
}

export async function feedback(req: Request, _d: ApiDeps): Promise<Response> {
  const body = await bodyJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object") return bad("Invalid JSON");
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const fb = (Array.isArray(body.feedback) ? body.feedback : []).filter((f: unknown) =>
    (FEEDBACK_VALUES as string[]).includes(f as string),
  ) as Feedback[];
  return json({ options: applyFeedback(options, fb), feedback: fb });
}

const csvq = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

/** Show / performance breaks appear as a row in the set list and the CSV (the file formats carry tracks only). */
function withBreaks(text: string, f: ExportFormat, p: Playlist): string {
  const breaks = p.breaks ?? [];
  if (!breaks.length) return text;
  if (f === "setlist") {
    const lines = text.split("\n");
    for (const b of [...breaks].sort((a, c) => c.afterTanda - a.afterTanda)) {
      const next = lines.findIndex((l) => l.startsWith(`${String(b.afterTanda + 2).padStart(2, "0")}. [`));
      const line = `     ── ${b.label} · ${b.minutes} min ──`;
      if (next >= 0) lines.splice(next, 0, line);
      else {
        const star = lines.findIndex((l) => l.startsWith("★"));
        lines.splice(star >= 0 ? star : lines.length, 0, line);
      }
    }
    return lines.join("\n");
  }
  if (f === "csv") {
    // rows are "#","kind","tanda",…; a break row goes after the last row of tanda `afterTanda + 1` (1-based)
    const lines = text.split("\n");
    const tandaOf = (l: string) => Number(l.match(/^"\d+","(?:track|cortina)","(\d+)"/)?.[1] ?? Number.NaN);
    const out: string[] = [];
    lines.forEach((l, i) => {
      out.push(l);
      const t = tandaOf(l);
      if (Number.isNaN(t)) return;
      const next = tandaOf(lines[i + 1] ?? "");
      if (next === t) return;
      for (const b of breaks)
        if (b.afterTanda + 1 === t)
          out.push(
            ["", "break", t, b.label, "", "", "", "break", b.minutes * 60, "", "", ""].map(csvq).join(","),
          );
    });
    return out.join("\n");
  }
  return text;
}

export async function exportFile(req: Request, _d: ApiDeps): Promise<Response> {
  const body = await bodyJson<Record<string, unknown>>(req);
  const playlist = body?.playlist as Playlist | undefined;
  if (!playlist?.tandas) return bad("playlist required");
  const { format, includeCortinas = true, folder, naming, cortinaStopSec } = body as Record<string, unknown>;
  if (typeof format !== "string" || !Object.hasOwn(EXPORTERS, format)) return bad("unknown format");
  const f = format as ExportFormat;
  const pl = includeCortinas ? playlist : withoutCortinas(playlist);
  const text = withBreaks(
    applyPaths(
      fixGenres(
        EXPORTERS[f](pl, {
          includeCortinas: !!includeCortinas,
          ...(typeof cortinaStopSec === "number" ? { cortinaStopSec } : {}),
        }),
        f,
      ),
      f,
      pl,
      {
        folder: typeof folder === "string" ? folder : "",
        naming: typeof naming === "string" ? naming : "",
        includeCortinas: !!includeCortinas,
      },
    ),
    f,
    pl,
  );
  const m = EXPORT_META[f];
  return new Response(text, {
    headers: {
      "content-type": `${m.mime}; charset=utf-8`,
      "content-disposition": `attachment; filename="${(playlist.name ?? "tdj").replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}"`,
    },
  });
}

/** the swap / insert choices' seed: the caller's, else the night's own seed and the slot (never the clock) */
export function stableSeed(p: Playlist, slot: number, given?: unknown): number {
  const g = Number(given);
  if (Number.isFinite(g) && g > 0) return g;
  return ((((p.options?.seed ?? 1) >>> 0) * 31 + (slot + 1) * 7919) >>> 0) % 1e9;
}
