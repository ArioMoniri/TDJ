import { buildSongIndex, type Song, type SongIndex } from "@tdj/core";
import type { SnapshotManifest, SnapshotPart } from "./api/searchSnapshot";

/**
 * 2026-11 — the browser's copy of the server's search index, from GET /api/search/snapshot (lib/api/searchSnapshot.ts):
 * the same sides, the same dancer popularity and the same orchestra aliases into the same `buildSongIndex`, so core
 * `searchSongs` answers here exactly as POST /api/search does (lib/searchSnapshot.test.ts holds them equal).
 */
export function indexFromSnapshot(parts: readonly SnapshotPart[]): SongIndex {
  const ordered = [...parts].sort((a, b) => a.part - b.part);
  const songs: Song[] = [];
  const pop = new Map<string, number>();
  let aliases: Record<string, string[]> = {};
  for (const p of ordered) {
    if (p.aliases) aliases = p.aliases;
    p.songs.forEach((s, i) => {
      songs.push(s);
      const x = p.pop[i];
      if (typeof x === "number") pop.set(s.id, x);
    });
  }
  return buildSongIndex(songs, { aliases: (id) => aliases[id], popularity: (s) => pop.get(s.id) });
}

/** fetch the manifest and every part (in parallel); a part of another version (a deploy meanwhile) starts over once */
export async function loadSnapshot(
  f: typeof fetch = (...a) => fetch(...a),
  base = "",
): Promise<{ v: string; parts: SnapshotPart[] }> {
  for (let attempt = 0; ; attempt++) {
    const m = (await (await f(`${base}/api/search/snapshot`)).json()) as SnapshotManifest;
    if (!m?.v || !(m.parts > 0)) throw new Error("no snapshot");
    const parts = await Promise.all(
      Array.from({ length: m.parts }, async (_, k) => {
        const r = await f(`${base}/api/search/snapshot?v=${encodeURIComponent(m.v)}&part=${k}`);
        if (!r.ok) throw new Error(`snapshot part ${k}: ${r.status}`);
        return (await r.json()) as SnapshotPart;
      }),
    );
    if (parts.every((p) => p.v === m.v)) return { v: m.v, parts };
    if (attempt >= 1) throw new Error("snapshot changed while loading");
  }
}
