import type { Catalog } from "./catalog";
import { isDanceableSong, normTitle } from "./energy";
import { strictOrder } from "./order";
import { nightFamilies } from "./repair";
import { retimeTanda } from "./swap";
import { isTandaEligible } from "./tanda";
import type { ComposeOptions, DanceRhythm, Song, Tanda } from "./types";

/**
 * Round 21c — a night never plays one orchestra's vals (or milonga) twice, and never breaks the orchestra gap for it.
 * When the builder could only repeat an orchestra on a vals / milonga chair (the round-21 stream audit narrowed the
 * families with three streaming 1935–45 sides), the chair takes, in this order:
 *   1. a family not yet played in that rhythm, inside the night's years, with every side streaming;
 *   2. the same, with the chair's window widened to 1932–1950;
 *   3. a family with one side that has no checked stream (the tanda's note asks the DJ for that file);
 *   4. only then the chair moves one place (it trades with a neighbouring tango chair) so a family fits the gap.
 * Each step is recorded in `stats.settingFallbacks` ("vals: …", "milonga: …").
 */
export const VM_WIDE: [number, number] = [1932, 1950];

const streams = (s: Song) => !!s.spotify?.uri && !s.streamSuspect;

export interface VmMend {
  tandas: Tanda[];
  fallbacks: string[];
}

export function mendVmRepeats(tandas0: Tanda[], o: ComposeOptions, cat: Catalog): VmMend {
  const tandas = tandas0.slice();
  const fallbacks: string[] = [];
  const gap = Math.max(1, o.orchestraRepeatGap ?? 6);
  const fixed = (t: Tanda) => !!(t.pinned || t.locked || t.birthday);
  const repeatAt = () =>
    tandas.findIndex(
      (t, i) =>
        t.rhythm !== "tango" &&
        !fixed(t) &&
        tandas.some((x, j) => j < i && x.rhythm === t.rhythm && x.orchestraId === t.orchestraId),
    );
  const titlesBut = (i: number) =>
    new Set(tandas.flatMap((t, k) => (k === i ? [] : t.songs.map((s) => normTitle(s.title)))));
  const gapOk = (orch: string, i: number) =>
    !tandas.some((t, k) => k !== i && t.orchestraId === orch && Math.abs(k - i) < gap);
  const yr0: [number, number] = o.yearRange ?? [1935, 1945];

  /** the best family for chair `i` at one step of the ladder */
  const pick = (i: number, step: 1 | 2 | 3): Tanda | null => {
    const t = tandas[i]!;
    const rhythm = t.rhythm as DanceRhythm;
    const win: [number, number] =
      step === 1 ? yr0 : [Math.min(yr0[0], VM_WIDE[0]), Math.max(yr0[1], VM_WIDE[1])];
    const played = new Set(tandas.filter((x, k) => k !== i && x.rhythm === rhythm).map((x) => x.orchestraId));
    const used = titlesBut(i);
    const need = t.songs.length;
    let best: { t: Tanda; v: number } | null = null;
    for (const f of nightFamilies(cat, { ...o, yearRange: win }, rhythm)) {
      if (played.has(f.orchestraId) || !gapOk(f.orchestraId, i)) continue;
      const seen = new Set<string>();
      const ok = f.songs
        .filter((s) => {
          const k = normTitle(s.title);
          if (seen.has(k) || used.has(k)) return false;
          seen.add(k);
          return (
            s.rhythm === rhythm &&
            isTandaEligible(s, !!o.rules?.allowUndated) &&
            isDanceableSong(s, cat.blacklist) &&
            !!s.year &&
            s.year >= win[0] &&
            s.year <= win[1]
          );
        })
        .sort((a, b) => Number(streams(b)) - Number(streams(a)) || (b.fame ?? 0) - (a.fame ?? 0));
      const st = ok.filter(streams);
      let sides: Song[];
      if (st.length >= need) sides = st.slice(0, need);
      else if (step === 3 && st.length === need - 1 && ok.length >= need)
        sides = [...st, ok.find((s) => !streams(s))!];
      else continue;
      const mf = sides.reduce((a, s) => a + (s.fame ?? 0), 0) / sides.length;
      const me = sides.reduce((a, s) => a + (s.energy ?? 50), 0) / sides.length;
      const v = mf - Math.abs(me - t.targetEnergy) / 10;
      if (best && v <= best.v) continue;
      const missing = sides.find((s) => !streams(s));
      const nt = retimeTanda(
        {
          ...t,
          orchestraId: f.orchestraId,
          orchestra: f.orchestra,
          singer: f.singer,
          vocal: f.vocal,
          era: sides[0]!.era,
          style: cat.profile(f.orchestraId)?.style,
          ...(missing
            ? { note: `${missing.title} has no checked stream: play it from your files (or swap it)` }
            : {}),
        },
        strictOrder(sides, false),
      );
      best = { t: nt, v };
    }
    return best?.t ?? null;
  };
  const tryChair = (i: number): { t: Tanda; step: 1 | 2 | 3 } | null => {
    for (const step of [1, 2, 3] as const) {
      const t = pick(i, step);
      if (t) return { t, step };
    }
    return null;
  };
  const label = (t: Tanda) => `${t.orchestra}${t.singer ? ` / ${t.singer}` : ""}`;
  const why = (step: number) =>
    step === 1
      ? "a family not yet played"
      : step === 2
        ? `the window widened to ${VM_WIDE[0]}–${VM_WIDE[1]}`
        : "one side without a checked stream (the DJ's file)";

  for (let guard = 0; guard < tandas.length; guard++) {
    const i = repeatAt();
    if (i < 0) break;
    const old = tandas[i]!;
    const r = tryChair(i);
    if (r) {
      tandas[i] = r.t;
      fallbacks.push(
        `${old.rhythm}: tanda ${i + 1} ${label(old)} would repeat its orchestra; ${label(r.t)} plays (${why(r.step)})`,
      );
      continue;
    }
    // 4. the chair trades places with a neighbouring tango chair, then the ladder again
    let moved = false;
    for (const n of [i + 1, i - 1]) {
      const b = tandas[n];
      if (!b || n === 0 || n === tandas.length - 1 || b.rhythm !== "tango" || fixed(b) || b.peak) continue;
      const put = (x: Tanda, at: Tanda): Tanda => ({
        ...x,
        index: at.index,
        targetEnergy: at.targetEnergy,
        phase: at.phase,
        cortina: at.cortina,
      });
      const A = tandas[i]!;
      tandas[i] = put(b, A);
      tandas[n] = put(A, b);
      const r2 = tryChair(n);
      if (r2) {
        tandas[n] = r2.t;
        fallbacks.push(
          `${old.rhythm}: tanda ${i + 1} ${label(old)} would repeat its orchestra; the chair moved to ${n + 1} and ${label(r2.t)} plays (${why(r2.step)})`,
        );
        moved = true;
        break;
      }
      tandas[n] = b;
      tandas[i] = A;
    }
    if (!moved) {
      fallbacks.push(
        `${old.rhythm}: tanda ${i + 1} ${label(old)} repeats its orchestra (no family fits the chair)`,
      );
      break;
    }
  }
  tandas.forEach((t, k) => {
    t.index = k;
  });
  return { tandas, fallbacks };
}

/**
 * Round 21c — every clock hour holds an instrumental tango tanda (the panel's instrHour, as `hourBuckets` reads the
 * hours). When the repair leaves an hour without one, a vocal tango tanda of that hour (never the first, the última, a
 * planned summit, the Pugliese chair or the DJ's) is replaced by an instrumental family that is not playing tonight and
 * keeps the orchestra gap — taken only when the strict panel as a whole is no worse for it.
 */
const noCue = (r: { penalty: number; violations: Array<{ rule: string; severity?: string }> }) =>
  r.penalty - r.violations.filter((v) => v.rule.startsWith("cue") && v.severity !== "blocker").length;

export function mendInstrHours(
  tandas0: Tanda[],
  o: ComposeOptions,
  cat: Catalog,
  judge: (ts: Tanda[]) => {
    blockers: number;
    penalty: number;
    violations: Array<{ rule: string; severity?: string; tanda?: number }>;
  },
  buckets: (ts: Tanda[]) => number[][],
): VmMend {
  let tandas = tandas0.slice();
  const fallbacks: string[] = [];
  const gap = Math.max(1, o.orchestraRepeatGap ?? 6);
  const yr: [number, number] = o.yearRange ?? [1935, 1945];
  for (let round = 0; round < 3; round++) {
    const r0 = judge(tandas);
    const items = r0.violations.filter((v) => v.rule === "instrHour") as Array<{
      rule: string;
      tanda?: number;
    }>;
    if (!items.length) break;
    // the chairs that can mend it: the vocal tangos of an hour without an instrumental one, and those of a run of four
    const bad = new Set<number>();
    for (const b of buckets(tandas))
      if (!b.some((i) => tandas[i]!.rhythm === "tango" && !tandas[i]!.vocal)) for (const i of b) bad.add(i);
    for (const v of items)
      if (typeof v.tanda === "number" && v.tanda >= 0) {
        const run = tandas
          .map((x, k) => ({ x, k }))
          .filter((y) => y.k <= v.tanda! && y.x.rhythm === "tango")
          .slice(-4);
        for (const y of run) bad.add(y.k);
      }
    if (!bad.size) break;
    let best: { ts: Tanda[]; v: number; label: string } | null = null;
    for (const i of bad) {
      const t = tandas[i]!;
      if (
        t.rhythm !== "tango" ||
        !t.vocal ||
        i === 0 ||
        i === tandas.length - 1 ||
        t.peak ||
        t.pinned ||
        t.locked
      )
        continue;
      if (t.orchestraId === "osvaldo-pugliese") continue;
      // (an orchestra may add its instrumental mode to one vocal tango tanda tonight — round 14 S5 — never a third)
      const tg = (id: string) =>
        tandas.filter((x, k) => k !== i && x.rhythm === "tango" && x.orchestraId === id);
      const blocked = (id: string) =>
        tg(id).length >= 2 || tg(id).some((x) => !x.vocal) || id === "juan-d-arienzo";
      const used = new Set(tandas.flatMap((x, k) => (k === i ? [] : x.songs.map((s) => normTitle(s.title)))));
      for (const f of nightFamilies(cat, o, "tango")) {
        if (f.vocal || blocked(f.orchestraId)) continue;
        if (tandas.some((x, k) => k !== i && x.orchestraId === f.orchestraId && Math.abs(k - i) < gap))
          continue;
        const seen = new Set<string>();
        const sides = f.songs
          .filter((s) => {
            const k = normTitle(s.title);
            if (seen.has(k) || used.has(k)) return false;
            seen.add(k);
            return (
              streams(s) &&
              isTandaEligible(s, !!o.rules?.allowUndated) &&
              !!s.year &&
              s.year >= yr[0] &&
              s.year <= yr[1] &&
              (s.fame ?? 0) >= 2
            );
          })
          .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))
          .slice(0, t.songs.length);
        if (sides.length < t.songs.length) continue;
        const nt = retimeTanda(
          {
            ...t,
            orchestraId: f.orchestraId,
            orchestra: f.orchestra,
            singer: null,
            vocal: false,
            era: sides[0]!.era,
            style: cat.profile(f.orchestraId)?.style,
          },
          strictOrder(sides, false),
        );
        const ts = tandas.map((x, k) => (k === i ? nt : x));
        const r1 = judge(ts);
        // (the cues are re-picked after the mend: a cue item the new tanda brings is the re-pick's, not the mend's)
        const p1 = noCue(r1),
          p0 = noCue(r0);
        if (r1.blockers > r0.blockers || p1 >= p0 - 1e-9) continue;
        if (!best || p1 < best.v)
          best = {
            ts,
            v: p1,
            label: `tanda ${i + 1}: ${t.orchestra}${t.singer ? ` / ${t.singer}` : ""} → ${f.orchestra} instr.`,
          };
      }
    }
    if (!best) break;
    tandas = best.ts;
    fallbacks.push(`instrHour: ${best.label} (the hour had no instrumental tango tanda)`);
  }
  return { tandas, fallbacks };
}
