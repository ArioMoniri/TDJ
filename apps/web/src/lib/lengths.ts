/**
 * 2026-11 (the owner: "… and also the total and each song's length in the tanda") — the lengths every song row,
 * tanda header and night header prints. A side plays from the DJ's cue in to the stop at (`booth.songCues`), else
 * its whole recording; a cortina plays its cortina length from its start (core `cortinaSpan`). An unknown length
 * prints "–:–" and stays out of the total, which then carries "≈". Pure, for the vitest.
 */

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

/** a side's played length with the night's cues */
export const lengthOf = (s: { id: string; durationSec?: number | null }, cues?: Record<string, Cue> | null) =>
  sidePlaySec(s.durationSec, cues?.[s.id]);

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
export function tandaTotal(
  songs: Array<{ id: string; durationSec?: number | null }>,
  cues?: Record<string, Cue> | null,
): Total {
  return totalOf(songs.map((s) => sidePlaySec(s.durationSec, cues?.[s.id])));
}

/** "≈ 11:48" / "11:48" */
export const totalText = (t: Total) => `${t.approx ? "≈ " : ""}${fmtLen(t.sec)}`;

/**
 * The night's total: the opening, every tanda as it plays, each cortina for its played length (`cortinaSec`, null
 * when not known) and the closing.
 */
export function nightTotal(
  p: {
    opening?: { id: string; durationSec?: number | null } | null;
    closing?: { id: string; durationSec?: number | null } | null;
    tandas: Array<{
      songs: Array<{ id: string; durationSec?: number | null }>;
      cortina?: { id: string } | null;
    }>;
  },
  cues: Record<string, Cue> | null | undefined,
  cortinaSec: (c: { id: string }) => number | null,
): Total {
  const parts: Array<number | null> = [];
  if (p.opening) parts.push(sidePlaySec(p.opening.durationSec, cues?.[p.opening.id]));
  for (const t of p.tandas) {
    for (const s of t.songs) parts.push(sidePlaySec(s.durationSec, cues?.[s.id]));
    if (t.cortina) parts.push(cortinaSec(t.cortina));
  }
  if (p.closing) parts.push(sidePlaySec(p.closing.durationSec, cues?.[p.closing.id]));
  return totalOf(parts);
}
