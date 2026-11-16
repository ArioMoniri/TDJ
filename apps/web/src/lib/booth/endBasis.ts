import type { Tanda } from "@/lib/types";

/**
 * QA 2026-11 ("Change the end" in Rehearsal mixed 30 s clip time with real lengths: "+10 min" moved the real night by
 * 10 min while the clock on screen runs on clips, and the preview's end added a real-length difference to a clip
 * clock). The sheet works in the clock the DJ sees: in Rehearsal every song and cortina counts at most its clip
 * (30 s) plus the gap; on the real night at its own length. The engine (core nightEnd.ts) plans in real seconds, so
 * a wish on the rehearsal clock is turned into real seconds by the ratio of what is still to play, and its answer is
 * measured back on the rehearsal clock.
 */
export interface Basis {
  /** the clip cap (Rehearsal), null on the real night */
  clipSec: number | null;
  /** the gap after every item */
  gapSec: number;
}

/** a cortina's planned length when the set gives none (the Booth's default stop) */
const CORTINA_SEC = 45;

/** seconds a tanda takes on the clock of `b` (its songs, its cortina, a gap after each); 0 when skipped tonight */
export function tandaSec(t: Pick<Tanda, "songs" | "cortina" | "bypass">, b: Basis): number {
  if (t.bypass) return 0;
  const cap = (s: number) => (b.clipSec ? Math.min(b.clipSec, s) : s);
  let sec = 0;
  for (const s of t.songs) sec += cap(s.durationSec ?? 0) + b.gapSec;
  if (t.cortina) sec += cap(t.cortina.lengthSec ?? CORTINA_SEC) + b.gapSec;
  return sec;
}

export const tandasSec = (ts: ReadonlyArray<Pick<Tanda, "songs" | "cortina" | "bypass">>, b: Basis) =>
  ts.reduce((a, t) => a + tandaSec(t, b), 0);

/**
 * A change of the end wished on the shown clock (`wishSec`, + later / − earlier), in the engine's real seconds: the
 * same share of what is still to play (`rest`, the tandas that may change). On the real night it is the wish itself.
 */
export function realDelta(
  wishSec: number,
  rest: ReadonlyArray<Pick<Tanda, "songs" | "cortina" | "bypass">>,
  b: Basis,
) {
  if (!b.clipSec) return wishSec;
  const shown = tandasSec(rest, b);
  const real = tandasSec(rest, { clipSec: null, gapSec: b.gapSec });
  return shown > 0 ? wishSec * (real / shown) : wishSec;
}

/** how far the shown end moves from the night before to the night after (seconds on the shown clock) */
export const shownDelta = (
  before: ReadonlyArray<Pick<Tanda, "songs" | "cortina" | "bypass">>,
  after: ReadonlyArray<Pick<Tanda, "songs" | "cortina" | "bypass">>,
  b: Basis,
) => tandasSec(after, b) - tandasSec(before, b);
