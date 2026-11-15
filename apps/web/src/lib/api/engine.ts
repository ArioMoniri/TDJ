import {
  applyFeedback,
  BUILTIN_CORTINAS,
  benchmarkNight,
  compose as composeNight,
  cortinaPool,
  ERA_PRESETS,
  EXPORT_META,
  EXPORTERS,
  type ExportFormat,
  type Feedback,
  improveNight,
  type Playlist,
  replaceSide,
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
  const { locked: lockedRaw, overrides: ovRaw, autoImprove, ...rest } = body;
  const locked = Array.isArray(lockedRaw)
    ? (lockedRaw as Tanda[]).filter((t) => t && typeof t.index === "number" && Array.isArray(t.songs))
    : [];
  const overrides = objectOrUndefined<AppOverrides>(ovRaw);
  try {
    const { catalog, cortinas, contextModel } = d.catalogFor(overrides);
    const { contextFactors: _cf, ...coreOverrides } = overrides ?? {};
    const p = composeNight(
      { ...rest, hours, overrides: overrides ? coreOverrides : undefined },
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
    return json(benchmarkNight(playlist));
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
}

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
    return json({ options: swapTandaOptions(playlist, Number(index), deps, Date.now() % 1e9).map(forWire) });
  return json(forWire(swapTanda(playlist, Number(index), deps)));
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
  const r = swapOptionsFor(playlist, Number(tandaIndex), Number(trackIndex), deps, {
    query: typeof query === "string" ? query.slice(0, 80) : undefined,
  });
  return json({ suggestions: r.suggestions.map(swapWire), results: r.results.map(swapWire) });
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
