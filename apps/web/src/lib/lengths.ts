/**
 * 2026-11 (the owner: "… and also the total and each song's length in the tanda") — the lengths every song row,
 * tanda header and night header prints. A side plays from the DJ's cue in to the stop at (`booth.songCues`), else
 * its whole recording; a cortina plays its cortina length from its start (core `cortinaSpan`). An unknown length
 * prints "–:–" and stays out of the total, which then carries "≈". Pure, for the vitest.
 *
 * 2026-11 (Compose said 4:35:12 and tanda 1 = 11:37, the Booth 4:42:04 and 11:41): one length per side everywhere —
 * its checked Spotify recording's `durationMs` when it has one (what the Booth plays and plans), else the index
 * length (`sideSec`). Compose, the Booth plan, the mini player and History all read it; the Booth's gaps are
 * printed apart ("4:35 music + 0:58 gaps").
 */
import { type CortinaEdit, cortinaSpan, type Playlist, type Song } from "@tdj/core";
import { spotifyLengthSec } from "./booth/clips";
import { CORTINA_STOP_RANGE } from "./types";

export const UNKNOWN_LEN = "–:–";

/** m:ss (h:mm:ss past an hour); null / non-finite → "–:–" */
export function fmtLen(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return UNKNOWN_LEN;
  const n = Math.round(sec);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = String(n % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export interface Cue {
  inSec?: number;
  outSec?: number;
}

/** the seconds a side plays: its cue window, else its recording; null when its length is unknown */
export function sidePlaySec(durationSec: number | null | undefined, cue?: Cue | null): number | null {
  const dur = typeof durationSec === "number" && durationSec > 0 ? durationSec : null;
  const from = cue?.inSec && cue.inSec > 0 ? cue.inSec : 0;
  const to =
    typeof cue?.outSec === "number" && cue.outSec > 0 ? (dur ? Math.min(cue.outSec, dur) : cue.outSec) : dur;
  if (to == null) return null;
  const sec = to - from;
  return sec > 0 ? sec : null;
}

/** a side as the lengths read it: its index length and, when checked, its Spotify recording */
export type Side = { id: string; durationSec?: number | null; spotify?: Song["spotify"] | null };
/** the side's recording length: its checked Spotify recording's (what the Booth plays), else the index length */
export function sideSec(s: Side): number | null {
  const sp = spotifyLengthSec(s as Song);
  if (sp !== null) return sp;
  return typeof s.durationSec === "number" && s.durationSec > 0 ? s.durationSec : null;
}

/** a side's played length with the night's cues */
export const lengthOf = (s: Side, cues?: Record<string, Cue> | null) => sidePlaySec(sideSec(s), cues?.[s.id]);

export interface Total {
  sec: number;
  /** some lengths were unknown and left out: the total is a lower bound ("≈") */
  approx: boolean;
  count: number;
}

/** sum the known lengths; any unknown marks the total approximate */
export function totalOf(lengths: Array<number | null>): Total {
  let sec = 0;
  let approx = false;
  for (const l of lengths) {
    if (l == null) approx = true;
    else sec += l;
  }
  return { sec, approx, count: lengths.length };
}

/** a tanda's songs as they play tonight */
export function tandaTotal(songs: Side[], cues?: Record<string, Cue> | null): Total {
  return totalOf(songs.map((s) => lengthOf(s, cues)));
}

/**
 * A cortina's played seconds: from its start (its chorus, or the DJ's own) for the DJ's cortina length when set, else
 * its own composed length — the Booth plan's `cortinaSpan` with the same inputs.
 */
export function cortinaPlaySec(
  c: NonNullable<Playlist["tandas"][number]["cortina"]>,
  o: {
    cortinaStopSec?: number | null;
    cortinaHookStart?: boolean;
    edits?: Record<string, CortinaEdit> | null;
  } = {},
): number {
  const sp = cortinaSpan(c, {
    cortinaStopSec: boothCortinaStop(o),
    cortinaEdits: o.edits ?? undefined,
    cortinaHookStart: o.cortinaHookStart === false ? false : undefined,
  });
  return sp.stopSec - sp.trimIn;
}

/** The night's music as it plays (Compose, the Booth, History): sides, cues, cortinas; breaks and gaps apart. */
export function nightLength(
  p: Playlist,
  settings: { cortinaStopSec?: number | null; cortinaHookStart?: boolean } = {},
): Total {
  const edits = p.booth?.cortinaEdits;
  return nightTotal(p, p.booth?.songCues, (c) => {
    const cort = p.tandas.find((x) => x.cortina?.id === c.id)?.cortina;
    return cort ? cortinaPlaySec(cort, { ...settings, edits }) : null;
  });
}

/**
 * The cortina length the Booth plan takes from the DJ's settings: their own length when set (rounded, in range),
 * else none — each cortina then plays its composed length from its start (what `cortinaPlaySec` prints).
 */
export function boothCortinaStop(settings: { cortinaStopSec?: number | null }): number | undefined {
  const v = settings.cortinaStopSec;
  if (v == null || !Number.isFinite(v)) return undefined;
  return Math.round(Math.min(CORTINA_STOP_RANGE.max, Math.max(CORTINA_STOP_RANGE.min, v)));
}

/** the seconds of music in a Booth plan (songs and cortinas as they play; breaks and gaps apart) */
export function musicSec(items: ReadonlyArray<{ kind: string; lengthSec: number }>): number {
  return Math.round(items.reduce((a, it) => a + (it.kind === "break" ? 0 : it.lengthSec), 0) * 1000) / 1000;
}

/** `nightLength`'s seconds for a header ("4 h 35 min"); a stored night without its songs keeps its stats */
export function nightMusicSec(
  p: Playlist,
  settings: { cortinaStopSec?: number | null; cortinaHookStart?: boolean } = {},
): number | null {
  const stored = p.stats?.durationSec || null;
  if (!p.tandas.every((t) => Array.isArray(t?.songs))) return stored;
  const sec = nightLength(p, settings).sec;
  return sec > 0 ? sec : stored;
}

/** "≈ 11:48" / "11:48" */
export const totalText = (t: Total) => `${t.approx ? "≈ " : ""}${fmtLen(t.sec)}`;

/**
 * The night's total: the opening, every tanda as it plays, each cortina for its played length (`cortinaSec`, null
 * when not known) and the closing.
 */
export function nightTotal(
  p: {
    opening?: Side | null;
    closing?: Side | null;
    tandas: Array<{
      songs: Side[];
      cortina?: { id: string } | null;
    }>;
  },
  cues: Record<string, Cue> | null | undefined,
  cortinaSec: (c: { id: string }) => number | null,
): Total {
  const parts: Array<number | null> = [];
  if (p.opening) parts.push(lengthOf(p.opening, cues));
  for (const t of p.tandas) {
    for (const s of t.songs) parts.push(lengthOf(s, cues));
    if (t.cortina) parts.push(cortinaSec(t.cortina));
  }
  if (p.closing) parts.push(lengthOf(p.closing, cues));
  return totalOf(parts);
}
