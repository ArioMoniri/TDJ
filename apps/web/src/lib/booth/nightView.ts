import { durationLabel } from "./plan";

/**
 * Wave 2 — what the booth's cards say, as pure functions: Up next (past a tanda skipped tonight and its cortina),
 * the drift, a cortina's span and the night's time in plain words, the Last-4 toast and the swap labels.
 */

type Item = { kind: string; tanda: number };

/**
 * Up next from the playhead. `passed`: the items the night leaves out (skipped tonight, cued past, the tanda the DJ
 * skips and its cortina) — never shown as next. `missing`: the items with nothing to play them from — passed over,
 * but shown (and said) when nothing else is left.
 */
export function upNext(
  items: ReadonlyArray<Item>,
  planIndex: number,
  o: { passed: ReadonlySet<number>; missing: ReadonlySet<number> },
): { next: number | null; noSource: boolean; nextTanda: number; nextTandaCortina: number } {
  let next: number | null = null;
  for (let i = planIndex + 1; i < items.length; i++)
    if (!o.passed.has(i) && !o.missing.has(i)) {
      next = i;
      break;
    }
  let noSource = false;
  if (next === null)
    for (let i = planIndex + 1; i < items.length; i++)
      if (!o.passed.has(i)) {
        next = i;
        noSource = o.missing.has(i);
        break;
      }
  const cur = items[planIndex];
  const curTanda = cur?.tanda ?? 0;
  const nextTanda = items.findIndex(
    (x, i) => i > planIndex && x.kind === "track" && x.tanda > curTanda && !o.passed.has(i),
  );
  const nt = nextTanda >= 0 ? items[nextTanda]! : null;
  const nextTandaCortina = nt
    ? items.findIndex((x, i) => x.kind === "cortina" && x.tanda === nt.tanda && !o.passed.has(i))
    : -1;
  return { next, noSource, nextTanda, nextTandaCortina };
}

/** "3:39 ahead of plan" / "1:15 behind plan" / "on plan" (was "−3:39 early"). */
export function driftWords(sec: number): string {
  if (Math.abs(sec) < 1) return "on plan";
  return `${durationLabel(Math.abs(sec))} ${sec < 0 ? "ahead of" : "behind"} plan`;
}

/** A cortina's part of its song in words (was "in 0:00 · stop at 0:45"). */
export function cortinaSpan(inSec: number, stopSec: number): string {
  if (inSec <= 0) return `plays its first ${durationLabel(stopSec)}`;
  return `plays ${durationLabel(inSec)} to ${durationLabel(stopSec)} of the song`;
}

/** The night bar's big number: in a rehearsal it counts 30 s clips, so it says so. */
export function ttcCaption(o: { rehearsal: boolean; started: boolean }): { label: string; explain: string } {
  return o.rehearsal
    ? {
        label: "Rehearsal to La Cumparsita",
        explain:
          "How long the rehearsal takes to reach La Cumparsita: every song plays a 30 s clip. The full night, every song in full, is under it.",
      }
    : { label: "Time to La Cumparsita", explain: "How long until La Cumparsita, the last song of the night" };
}

const listWords = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** The toast after "Last 4 tandas tango only": which tandas it skips, or which play again (0-based sets). */
export function lastFourChange(
  before: ReadonlySet<number>,
  after: ReadonlySet<number>,
  tandas: ReadonlyArray<{ rhythm: string }>,
): string {
  const name = (i: number) => `tanda ${i + 1} (${tandas[i]?.rhythm ?? "tanda"})`;
  const added = [...after].filter((i) => !before.has(i)).sort((a, b) => a - b);
  const removed = [...before].filter((i) => !after.has(i)).sort((a, b) => a - b);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (added.length) return `Skipping ${listWords(added.map(name))} tonight: the night ends on tangos`;
  if (removed.length)
    return `${cap(listWords(removed.map(name)))} ${removed.length === 1 ? "plays" : "play"} again tonight`;
  return "The last 4 tandas are already tangos: nothing changes";
}

/** The set list's swap buttons, counted inside the tanda (a cortina is not a song). */
export const swapLabel = (tanda: number, song: number) => `Swap tanda ${tanda}, song ${song}`;
export const cortinaSwapLabel = (tanda: number) => `Cortina after tanda ${tanda}: fades and stop`;
