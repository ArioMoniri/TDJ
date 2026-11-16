import { normTitle } from "@tdj/core";
import type { Song } from "./types";

/**
 * 2026-11 — the tanda the DJ builds in the Swap sheet (components/TandaSwapSheet.tsx): its sides in order, moved,
 * added and removed, and the tanda rules checked live as it changes (one orchestra, one rhythm, one voice, close years,
 * no title twice, its length). The rules here are the sheet's quick read of core's tanda rules; Apply runs the full
 * rule check (lib/ruleCheck.ts `gateEdit`, the RuleConfirmSheet when a rule breaks).
 */
export type DraftSide = Pick<
  Song,
  "id" | "title" | "orchestra" | "orchestraId" | "singer" | "vocal" | "year" | "rhythm"
> &
  Partial<Song>;

export interface DraftCheck {
  key: "orchestra" | "rhythm" | "voice" | "years" | "repeat" | "size";
  ok: boolean;
  /** the words for the line (an i18n key and its values; the sheet translates) */
  msg: string;
  values?: Record<string, string | number>;
}

/** the year spread a tanda may reach (core tanda rules: 4 for tangos, a vals or milonga tanda as tight) */
export const YEAR_SPREAD = 4;

/** move the side at `from` to `to` (both clamped); the same array when nothing moves */
export function moveSide<T>(xs: readonly T[], from: number, to: number): T[] {
  const t = Math.max(0, Math.min(xs.length - 1, to));
  if (from === t || from < 0 || from >= xs.length) return xs as T[];
  const out = xs.slice();
  const [x] = out.splice(from, 1);
  out.splice(t, 0, x!);
  return out;
}
export const removeSide = <T>(xs: readonly T[], i: number): T[] => xs.filter((_, k) => k !== i);
/** add a side at the end (a side already there is not added twice) */
export function addSide<T extends { id: string }>(xs: readonly T[], s: T, max = 8): T[] {
  if (xs.some((x) => x.id === s.id) || xs.length >= max) return xs as T[];
  return [...xs, s];
}

/** the live rule lines for a tanda of `size` sides of `rhythm` (each kept rule says so, each broken one why) */
export function checkDraft(sides: readonly DraftSide[], o: { rhythm: string; size: number }): DraftCheck[] {
  if (!sides.length) return [{ key: "size", ok: false, msg: "tandaSwap.rule_empty" }];
  const orch = [...new Set(sides.map((s) => s.orchestra))];
  const rhythms = [...new Set(sides.map((s) => s.rhythm))];
  const vocal = sides.filter((s) => s.vocal);
  const singers = [...new Set(vocal.map((s) => s.singer ?? ""))];
  const mixedVoice = vocal.length > 0 && vocal.length < sides.length;
  const years = sides.map((s) => s.year).filter((y): y is number => !!y);
  const spread = years.length ? Math.max(...years) - Math.min(...years) : 0;
  const titles = sides.map((s) => normTitle(s.title));
  const repeat = titles.find((t, i) => titles.indexOf(t) !== i);
  const out: DraftCheck[] = [
    orch.length === 1
      ? { key: "orchestra", ok: true, msg: "tandaSwap.rule_one_orchestra", values: { orchestra: orch[0]! } }
      : { key: "orchestra", ok: false, msg: "tandaSwap.rule_orchestras", values: { list: orch.join(", ") } },
    rhythms.length === 1 && rhythms[0] === o.rhythm
      ? { key: "rhythm", ok: true, msg: "tandaSwap.rule_one_rhythm", values: { rhythm: o.rhythm } }
      : {
          key: "rhythm",
          ok: false,
          msg: "tandaSwap.rule_rhythms",
          values: { list: rhythms.join(", "), rhythm: o.rhythm },
        },
    mixedVoice
      ? { key: "voice", ok: false, msg: "tandaSwap.rule_mixed_voice" }
      : singers.length > 1
        ? { key: "voice", ok: false, msg: "tandaSwap.rule_singers", values: { list: singers.join(", ") } }
        : vocal.length
          ? {
              key: "voice",
              ok: true,
              msg: "tandaSwap.rule_one_singer",
              values: { singer: singers[0] || "?" },
            }
          : { key: "voice", ok: true, msg: "tandaSwap.rule_instrumental" },
    spread <= YEAR_SPREAD
      ? {
          key: "years",
          ok: true,
          msg: "tandaSwap.rule_years",
          values: { range: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "?" },
        }
      : { key: "years", ok: false, msg: "tandaSwap.rule_years_far", values: { spread, max: YEAR_SPREAD } },
  ];
  if (repeat) {
    const s = sides[titles.indexOf(repeat)]!;
    out.push({ key: "repeat", ok: false, msg: "tandaSwap.rule_repeat", values: { title: s.title } });
  }
  if (sides.length !== o.size)
    out.push({
      key: "size",
      ok: false,
      msg: "tandaSwap.rule_size",
      values: { n: sides.length, size: o.size },
    });
  return out;
}

/** every line of the check holds */
export const draftOk = (c: readonly DraftCheck[]) => c.every((x) => x.ok);
