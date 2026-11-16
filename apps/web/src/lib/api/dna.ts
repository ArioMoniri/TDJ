import { normTitle, orchestraDna, type Song, singerDna, songDna } from "@tdj/core";
import type { ApiDeps } from "./deps";
import { bad, json } from "./http";

/**
 * GET /api/dna?kind=song|work|orchestra|singer&id=… — the Song DNA pages (2026-11) and the song details' "Other
 * versions": a side's work, every recording of it, the orchestra's and singer's year around it, related works and the
 * tanda family (`song`); every recording of the side's work as full sides, to play or swap (`work`); an orchestra's or
 * a singer's page. Shared with the macOS and iPadOS apps, which answer it on the device from the bundled index.
 */
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const slim = (s: Song): Song => (s.audio?.chroma?.length ? { ...s, audio: { ...s.audio, chroma: [] } } : s);

/** the full sides behind a page's rows (to play, add or swap them), by id */
function sidesOf(songs: readonly Song[], ids: Set<string>): Record<string, Song> {
  const out: Record<string, Song> = {};
  for (const s of songs) if (ids.has(s.id)) out[s.id] = slim(s);
  return out;
}

export async function dna(req: Request, d: ApiDeps): Promise<Response> {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "song";
  const id = u.searchParams.get("id") ?? "";
  if (!ID.test(id)) return bad("id is required");
  const { catalog } = d.catalog();
  const songs = catalog.songs;
  const cache = { headers: { "cache-control": "public, max-age=300" } };
  if (kind === "song") {
    const r = songDna(songs, id, { corpus: catalog.corpus });
    if (!r) return bad("No such song", 404);
    const ids = new Set(
      [r.song, ...r.recordings, ...r.orchestraAround, ...r.singerAround, ...r.family.sides].map((x) => x.id),
    );
    return json({ ...r, sides: sidesOf(songs, ids) }, cache);
  }
  if (kind === "work") {
    const me = songs.find((s) => s.id === id || s.altIds?.includes(id));
    if (!me) return bad("No such song", 404);
    const key = normTitle(me.title);
    const all = songs
      .filter((s) => normTitle(s.title) === key)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.id.localeCompare(b.id))
      .map(slim);
    return json({ id: me.id, key, songs: all }, cache);
  }
  if (kind === "sides") {
    // an orchestra's sides with one singer (by id or name), or its instrumentals (`instrumental=1`), oldest first
    const singer = u.searchParams.get("singer")?.trim() ?? "";
    const inst = u.searchParams.get("instrumental") === "1";
    const one = normTitle(singer);
    const all = songs
      .filter(
        (s) =>
          s.orchestraId === id &&
          (inst ? !s.vocal : !singer || s.singerId === singer || normTitle(s.singer ?? "") === one),
      )
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || (a.date ?? "").localeCompare(b.date ?? ""))
      .map(slim);
    return json({ id, singer: singer || null, instrumental: inst, songs: all }, cache);
  }
  if (kind === "orchestra") {
    const r = orchestraDna(songs, id);
    return r
      ? json({ ...r, sides: sidesOf(songs, new Set(r.highlights.map((x) => x.id))) }, cache)
      : bad("No such orchestra", 404);
  }
  if (kind === "singer") {
    const r = singerDna(songs, id);
    return r
      ? json({ ...r, sides: sidesOf(songs, new Set(r.highlights.map((x) => x.id))) }, cache)
      : bad("No such singer", 404);
  }
  return bad("kind must be song, work, orchestra or singer");
}
