import { type ImportEntry, type ImportItem, importPlaylist, type Song } from "@tdj/core";
import { IMPORT_MAX_ITEMS } from "@/lib/playlistSources";
import type { AppOverrides } from "@/lib/types";
import type { ApiDeps } from "./deps";
import { bad, bodyJson, json } from "./http";

/**
 * POST /api/import/match { items, overrides? } — "Import a playlist" (2026-11): the source's rows (a Spotify or
 * YouTube playlist, a file, a pasted list, read in the browser or by /api/google/youtube/import) matched to the
 * catalogue with the DJ's own database edits, and split into tandas and cortinas (core playlistImport.ts). The answer
 * is the review the DJ edits; the night itself is built in the browser (`buildImportedNight`).
 */
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max).trim() : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** one row of the request, only the fields an item has (everything else dropped) */
export function cleanItem(v: unknown): ImportItem | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const title = str(o.title);
  if (!title) return null;
  const artists = Array.isArray(o.artists)
    ? o.artists
        .slice(0, 6)
        .map((a) => str(a, 120))
        .filter((a): a is string => !!a)
    : [];
  const it: ImportItem = { title, artists };
  const s = (k: keyof ImportItem, max = 200) => {
    const x = str(o[k], max);
    if (x) (it as unknown as Record<string, unknown>)[k] = x;
  };
  s("album");
  s("genre", 60);
  s("file", 300);
  s("url", 300);
  s("tdjId", 160);
  const uri = str(o.spotifyUri, 40);
  if (uri && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) it.spotifyUri = uri;
  const yt = str(o.youtubeId, 64);
  if (yt && /^[A-Za-z0-9_-]{1,64}$/.test(yt)) it.youtubeId = yt;
  const isrc = str(o.isrc, 12);
  if (isrc && /^[A-Z0-9]{12}$/i.test(isrc)) it.isrc = isrc.toUpperCase();
  const d = num(o.durationSec);
  if (d) it.durationSec = Math.min(Math.round(d), 3600);
  const y = num(o.year);
  if (y && y > 1880 && y < 2100) it.year = Math.round(y);
  if (o.yearIsRelease === true) it.yearIsRelease = true;
  if (o.cortina === true) it.cortina = true;
  if (o.breakBefore === true) it.breakBefore = true;
  const tn = typeof o.tanda === "number" && Number.isInteger(o.tanda) && o.tanda >= 0 ? o.tanda : undefined;
  if (tn !== undefined) it.tanda = Math.min(tn, 200);
  if (o.closing === "opening" || o.closing === "closing") it.closing = o.closing;
  if (Array.isArray(o.variants))
    it.variants = o.variants
      .slice(0, 4)
      .map((x) => {
        const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        const t = str(r.title);
        const a = Array.isArray(r.artists)
          ? r.artists.map((z) => str(z, 120)).filter((z): z is string => !!z)
          : [];
        return t ? { title: t, artists: a.slice(0, 6) } : null;
      })
      .filter((x): x is { title: string; artists: string[] } => !!x);
  return it;
}

/** a side as the review needs it (no audio vectors) */
const lean = (s: Song | undefined) =>
  s?.audio?.chroma?.length ? ({ ...s, audio: { ...s.audio, chroma: [] } } as Song) : s;

export async function importMatch(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<{ items?: unknown; overrides?: AppOverrides }>(req);
  if (!body || !Array.isArray(body.items)) return bad("items required");
  if (body.items.length > IMPORT_MAX_ITEMS) return bad(`at most ${IMPORT_MAX_ITEMS} items`);
  const items = body.items.map(cleanItem).filter((x): x is ImportItem => !!x);
  if (!items.length) return bad("no item has a title");
  const { catalog, cortinas } = d.catalogFor(body.overrides ?? null);
  const entries: ImportEntry[] = importPlaylist(
    { format: "text", name: "", items },
    { songs: catalog.songs, cortinas, index: catalog.searchIndex() },
  );
  return json({ entries: entries.map((e) => ({ ...e, ...(e.song ? { song: lean(e.song) } : {}) })) });
}
