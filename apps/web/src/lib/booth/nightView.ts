import { t } from "@/lib/i18n";
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
  if (Math.abs(sec) < 1) return t("booth.nightView.on_plan");
  return `${durationLabel(Math.abs(sec))} ${sec < 0 ? t("booth.nightView.ahead_of") : "behind"} plan`;
}

/** A cortina's part of its song in words (was "in 0:00 · stop at 0:45"). */
export function cortinaSpan(inSec: number, stopSec: number): string {
  if (inSec <= 0) return t("booth.nightView.plays_its_first", { p1: durationLabel(stopSec) });
  return t("booth.nightView.plays_to_of_the_song", { p1: durationLabel(inSec), p2: durationLabel(stopSec) });
}

/** The night bar's big number: in a rehearsal it counts 30 s clips, so it says so. */
export function ttcCaption(o: { rehearsal: boolean; started: boolean }): { label: string; explain: string } {
  return o.rehearsal
    ? {
        label: t("booth.nightView.rehearsal_to_la_cumparsita"),
        explain: t("booth.nightView.how_long_the_rehearsal_takes_to"),
      }
    : {
        label: t("booth.nightView.time_to_la_cumparsita"),
        explain: t("booth.nightView.how_long_until_la_cumparsita_the"),
      };
}

const listWords = (xs: string[]) =>
  xs.length <= 1
    ? (xs[0] ?? "")
    : t("booth.nightView.and", { p1: xs.slice(0, -1).join(", "), p2: xs[xs.length - 1] });

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
  if (added.length)
    return t("booth.nightView.skipping_tonight_the_night_ends_on", { p1: listWords(added.map(name)) });
  if (removed.length)
    return t(removed.length === 1 ? "booth.nightView.plays_again_one" : "booth.nightView.plays_again_many", {
      names: cap(listWords(removed.map(name))),
    });
  return t("booth.nightView.the_last_4_tandas_are_already");
}

/** The set list's swap buttons, counted inside the tanda (a cortina is not a song). */
export const swapLabel = (tanda: number, song: number) =>
  t("booth.nightView.swap_tanda_song", { tanda, song });
export const cortinaSwapLabel = (tanda: number) =>
  t("booth.nightView.cortina_after_tanda_fades_and_stop", { tanda });
