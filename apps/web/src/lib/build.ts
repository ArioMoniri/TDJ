import type { Song } from "@tdj/core";

/**
 * Round 22 — the hand-built night's draft (Compose → Build by hand): the tandas the DJ picked, as slim songs. Pure
 * functions, so the page, the tests and the apps share them; the page keeps the draft in this browser.
 */
export type DraftSong = Pick<
  Song,
  | "id"
  | "title"
  | "orchestra"
  | "orchestraId"
  | "singer"
  | "singerId"
  | "vocal"
  | "year"
  | "rhythm"
  | "energy"
  | "fame"
> & { spotify?: { uri: string } | null };
export type Draft = DraftSong[][];

export function slimSong(s: Song | DraftSong): DraftSong {
  return {
    id: s.id,
    title: s.title,
    orchestra: s.orchestra,
    orchestraId: s.orchestraId,
    singer: s.singer,
    singerId: s.singerId,
    vocal: s.vocal,
    year: s.year,
    rhythm: s.rhythm,
    energy: s.energy !== undefined ? Math.round(s.energy) : undefined,
    fame: s.fame,
    spotify: s.spotify?.uri ? { uri: s.spotify.uri } : null,
  };
}

export const tandaSize = (rhythm: string, o: { tango?: number; vals?: number; milonga?: number } = {}) =>
  rhythm === "tango" ? (o.tango ?? 4) : rhythm === "vals" ? (o.vals ?? 3) : (o.milonga ?? 3);

/** the open tanda (the last one, while it has room) */
export function openTanda(d: Draft, sizes?: Parameters<typeof tandaSize>[1]): DraftSong[] | null {
  const t = d.at(-1);
  return t?.length && t.length < tandaSize(t[0]!.rhythm, sizes) ? t : null;
}

/** add one side: into the open tanda when it is the same orchestra and rhythm, else as a new tanda */
export function addSong(d: Draft, s: DraftSong, sizes?: Parameters<typeof tandaSize>[1]): Draft {
  if (d.some((t) => t.some((x) => x.id === s.id))) return d;
  const open = openTanda(d, sizes);
  if (open && open[0]!.orchestraId === s.orchestraId && open[0]!.rhythm === s.rhythm)
    return [...d.slice(0, -1), [...open, s]];
  return [...d, [s]];
}
/** add a whole tanda (a suggestion) after the last complete one; an open tanda is replaced by it */
export function addTanda(d: Draft, songs: DraftSong[], sizes?: Parameters<typeof tandaSize>[1]): Draft {
  const base = openTanda(d, sizes) ? d.slice(0, -1) : d;
  const fresh = songs.filter((s) => !base.some((t) => t.some((x) => x.id === s.id)));
  if (!fresh.length) return d;
  return [...base, fresh];
}
export function removeSong(d: Draft, ti: number, si: number): Draft {
  return d.map((t, i) => (i === ti ? t.filter((_, k) => k !== si) : t)).filter((t) => t.length);
}
export function removeTanda(d: Draft, ti: number): Draft {
  return d.filter((_, i) => i !== ti);
}
export function moveTanda(d: Draft, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= d.length || to >= d.length) return d;
  const out = d.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x!);
  return out;
}
export const draftIds = (d: Draft) => d.map((t) => t.map((s) => s.id));
export const draftMinutes = (d: Draft) =>
  Math.round(d.reduce((a, t) => a + t.length * (t[0]?.rhythm === "tango" ? 2.8 : 2.5) + 0.75, 0));

export function isDraft(x: unknown): x is Draft {
  return (
    Array.isArray(x) &&
    x.every((t) => Array.isArray(t) && t.every((s) => s && typeof s === "object" && typeof s.id === "string"))
  );
}
