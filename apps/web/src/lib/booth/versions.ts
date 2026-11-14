import { normTitle, type Song } from "@tdj/core";

/**
 * Round 22: every take of a song — the same title by the same orchestra (any singer, any year) — so the DJ can
 * hear and play another version from the catalogue. Pure: the page hands in the candidates (a catalogue search),
 * the app builds can hand in their own.
 */
export interface Version {
  song: Song;
  /** the side in the set */
  current: boolean;
}

export function versionsOf(me: Song, candidates: ReadonlyArray<Song>): Version[] {
  const t = normTitle(me.title);
  const seen = new Set<string>();
  const out: Version[] = [];
  for (const s of [me, ...candidates]) {
    if (seen.has(s.id) || s.orchestraId !== me.orchestraId || normTitle(s.title) !== t) continue;
    seen.add(s.id);
    out.push({ song: s, current: s.id === me.id });
  }
  return out.sort(
    (a, b) => (a.song.year ?? 9999) - (b.song.year ?? 9999) || a.song.id.localeCompare(b.song.id),
  );
}

export type SongSearch = (q: string) => Promise<Song[]>;
/** The catalogue search the web app serves (`/api/search`). */
export const catalogueSearch: SongSearch = async (q) => {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("The catalogue did not answer");
  return (await r.json()) as Song[];
};

/** The versions of a side from the catalogue (title + the orchestra's surname narrow the search). */
export async function loadVersions(me: Song, search: SongSearch = catalogueSearch): Promise<Version[]> {
  const sur =
    me.orchestra
      .replace(/\(.*?\)/g, "")
      .trim()
      .split(/\s+/)
      .slice(-1)[0] ?? "";
  const q = `${me.title} ${sur}`.trim();
  return versionsOf(me, await search(q));
}
