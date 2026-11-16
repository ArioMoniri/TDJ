import { type Catalog, popularityScore, type Song } from "@tdj/core";
import { songWire } from "@/lib/songWire";
import { hash53 } from "./catalog";
import type { ApiDeps } from "./deps";
import { bad, json } from "./http";

/**
 * GET /api/search/snapshot — the catalogue as the browser's search worker needs it (2026-11, "the search is so
 * slow"): every side as POST /api/search answers it (songWire) plus the fields the index reads that the wire drops
 * (alternative titles), each side's dancer popularity as the server's index scores it, and the orchestras' aliases. The
 * worker (lib/search.worker.ts) builds core `buildSongIndex` from it once, so a keystroke is answered in the browser
 * with exactly the server's ranking, facets and corrections, without a request.
 *
 *  - no `part`: the manifest `{ v, parts, count }` (revalidated: `v` changes when the index does);
 *  - `?v=…&part=k`: one part `{ v, part, songs, pop, aliases? }` (immutable for that `v`; part 0 carries the aliases).
 *    Parts keep each answer well under a function's response limit.
 */

export const SNAPSHOT_PART = 4000;

export interface SnapshotManifest {
  v: string;
  parts: number;
  count: number;
}
export interface SnapshotPart {
  v: string;
  part: number;
  songs: Song[];
  /** per side: the dancer popularity the server's index uses (null: none, the corpus fame decides) */
  pop: Array<number | null>;
  /** orchestra id → its aliases (the profiles'), on part 0 */
  aliases?: Record<string, string[]>;
}

const memo = new WeakMap<Catalog, { manifest: SnapshotManifest; parts: SnapshotPart[] }>();

/** the snapshot of a catalogue (built once per catalogue) */
export function snapshotOf(catalog: Catalog, meta?: Record<string, unknown>) {
  const hit = memo.get(catalog);
  if (hit) return hit;
  const songs = catalog.songs;
  const v = hash53(
    `${String(meta?.builtAt ?? "")}|${songs.length}|${songs[0]?.id ?? ""}|${songs.at(-1)?.id ?? ""}`,
  );
  const aliases: Record<string, string[]> = {};
  for (const [id, p] of catalog.profiles) if (p.aliases?.length) aliases[id] = [...p.aliases];
  const parts: SnapshotPart[] = [];
  for (let at = 0, k = 0; at < songs.length; at += SNAPSHOT_PART, k++) {
    const slice = songs.slice(at, at + SNAPSHOT_PART);
    parts.push({
      v,
      part: k,
      songs: slice.map((s) => ({
        ...songWire(s),
        ...(s.altTitles?.length ? { altTitles: s.altTitles } : {}),
      })),
      pop: slice.map((s) => popularityScore(s.id) ?? null),
      ...(k === 0 ? { aliases } : {}),
    });
  }
  const out = { manifest: { v, parts: parts.length, count: songs.length }, parts };
  memo.set(catalog, out);
  return out;
}

export async function searchSnapshot(req: Request, d: ApiDeps): Promise<Response> {
  const u = new URL(req.url);
  const base = d.catalog();
  const snap = snapshotOf(base.catalog, base.meta);
  const part = u.searchParams.get("part");
  if (part === null)
    return json(snap.manifest, { headers: { "cache-control": "public, max-age=0, must-revalidate" } });
  const k = Number(part);
  const p = Number.isInteger(k) ? snap.parts[k] : undefined;
  if (!p) return bad("No such part", 404);
  // another version than the one asked (a deploy between the manifest and the part): never cached
  const same = u.searchParams.get("v") === snap.manifest.v;
  return json(p, {
    headers: { "cache-control": same ? "public, max-age=31536000, immutable" : "no-store" },
  });
}
