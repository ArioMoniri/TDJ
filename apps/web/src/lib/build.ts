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
  | "durationSec"
> & {
  spotify?: { uri: string } | null;
  /** 2026-11: the cached preview (tap to play in the builder) */
  resolved?: Pick<NonNullable<Song["resolved"]>, "provider" | "id" | "previewUrl"> | null;
};
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
    durationSec: s.durationSec,
    spotify: s.spotify?.uri ? { uri: s.spotify.uri } : null,
    resolved: s.resolved?.previewUrl
      ? { provider: s.resolved.provider, id: s.resolved.id, previewUrl: s.resolved.previewUrl }
      : null,
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
/**
 * 2026-11 (the guided builder): add sides to tanda `ti` (the selected one), skipping sides already in the night;
 * `ti` past the end (or no tandas) starts a new tanda with them
 */
export function addSongsTo(d: Draft, ti: number, songs: DraftSong[]): Draft {
  const used = new Set(d.flat().map((s) => s.id));
  const fresh = songs.filter((s, i) => !used.has(s.id) && songs.findIndex((x) => x.id === s.id) === i);
  if (!fresh.length) return d;
  if (ti < 0 || ti >= d.length) return [...d, fresh];
  return d.map((t, i) => (i === ti ? [...t, ...fresh] : t));
}
/** a new tanda with these sides (at the end, or at `at`) */
export function newTanda(d: Draft, songs: DraftSong[], at = d.length): Draft {
  const used = new Set(d.flat().map((s) => s.id));
  const fresh = songs.filter((s) => !used.has(s.id));
  if (!fresh.length) return d;
  const out = d.slice();
  out.splice(Math.max(0, Math.min(at, d.length)), 0, fresh);
  return out;
}
/** move side `from` of tanda `ti` to place `to` */
export function moveSong(d: Draft, ti: number, from: number, to: number): Draft {
  const t = d[ti];
  if (!t || from === to || from < 0 || to < 0 || from >= t.length || to >= t.length) return d;
  const songs = t.slice();
  const [x] = songs.splice(from, 1);
  songs.splice(to, 0, x!);
  return d.map((y, i) => (i === ti ? songs : y));
}
/** a per-tanda list (the cortina after each tanda) kept in step with a tanda move / removal */
export function moveAligned<T>(list: T[], from: number, to: number): T[] {
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x as T);
  return out;
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

/** 2026-11: sides into tanda `ti` at place `at` (the "Add song before / after" of a side); skips sides already in */
export function addSongsAt(d: Draft, ti: number, at: number, songs: DraftSong[]): Draft {
  const t = d[ti];
  if (!t) return addSongsTo(d, ti, songs);
  const used = new Set(d.flat().map((s) => s.id));
  const fresh = songs.filter((s, i) => !used.has(s.id) && songs.findIndex((x) => x.id === s.id) === i);
  if (!fresh.length) return d;
  const out = t.slice();
  out.splice(Math.max(0, Math.min(at, out.length)), 0, ...fresh);
  return d.map((x, i) => (i === ti ? out : x));
}

export interface DraftFit {
  /** the version's orchestra against the tanda's (none: the tanda is empty) */
  orchestra: "same" | "differs" | "none";
  /** the voice: the same singer, another singer, instrumental beside sung sides, or nothing to compare */
  singer: "same" | "differs" | "voice" | "none";
  /** the singers compared (the version's, the tanda's) */
  singers: [string, string] | null;
  rhythm: "same" | "differs" | "none";
  /** the tanda's years with the version in */
  years: [number, number] | null;
  /** the tanda's length with the version in (seconds) */
  totalSec: number;
  /** already in the tanda */
  inTanda: boolean;
}
/**
 * 2026-11 (the owner: "search songs and add them, with the orchestra, singer, timing and the versions as a guide while
 * searching"): what a version would do to the tanda it would join — information, never a gate.
 */
export function draftFit(t: readonly DraftSong[], v: DraftSong): DraftFit {
  const first = t[0];
  const sung = t.filter((s) => s.vocal && s.singer);
  const singer: DraftFit["singer"] = !t.length
    ? "none"
    : v.vocal && sung.length
      ? sung.every((s) => s.singer === v.singer)
        ? "same"
        : "differs"
      : !!v.vocal !== sung.length > 0
        ? "voice"
        : "same";
  const ys = [...t, v].map((s) => s.year ?? 0).filter(Boolean);
  return {
    orchestra: !first ? "none" : first.orchestraId === v.orchestraId ? "same" : "differs",
    singer,
    singers: singer === "differs" ? [v.singer ?? "", sung[0]?.singer ?? ""] : null,
    rhythm: !first ? "none" : first.rhythm === v.rhythm ? "same" : "differs",
    years: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
    totalSec: [...t, v].reduce((a, s) => a + (s.durationSec ?? 170), 0),
    inTanda: t.some((s) => s.id === v.id),
  };
}

export function isDraft(x: unknown): x is Draft {
  return (
    Array.isArray(x) &&
    x.every((t) => Array.isArray(t) && t.every((s) => s && typeof s === "object" && typeof s.id === "string"))
  );
}
