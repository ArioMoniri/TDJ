import type { Catalog } from "./catalog";
import { isDanceableSong, normTitle } from "./energy";
import { heatOfSides, isPeakSlot, strictOrder } from "./order";
import { nightFamilies } from "./repair";
import { DA_SPLIT_STEP, orderCtxOf, streamable } from "./strict";
import { retimeTanda } from "./swap";
import { type FamilyOpts, isTandaEligible } from "./tanda";
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
      // (the panel's fame floor holds on every step: known sides, at most one of fame 0)
      if (mf < 2.5 || sides.filter((s) => (s.fame ?? 0) === 0).length > 1) continue;
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
      // (the night keeps its length within one side's worth: the length fit has already run)
      if (Math.abs(nt.durationSec - t.durationSec) > 150) continue;
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
        if (Math.abs(nt.durationSec - t.durationSec) > 150) continue;
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

/**
 * Round 21c (R16-3, the panel's preSummit): the chair before the last summit carries the floor into it — mean fame
 * ≥ 3.5 and energy ≥ target − 8. When it does not, a family of its rhythm that does (not yet played in that rhythm,
 * outside the orchestra gap, every side streaming, in the night's years, the night's length kept) takes the chair,
 * when the strict panel as a whole is no worse.
 */
export function mendPreSummit(
  tandas0: Tanda[],
  o: ComposeOptions,
  cat: Catalog,
  judge: (ts: Tanda[]) => {
    blockers: number;
    penalty: number;
    violations: Array<{ rule: string; severity?: string; tanda?: number }>;
  },
): VmMend {
  const tandas = tandas0.slice();
  const r0 = judge(tandas);
  const v = r0.violations.find((x) => x.rule === "preSummit");
  if (!v || typeof v.tanda !== "number") return { tandas, fallbacks: [] };
  const i = v.tanda;
  const t = tandas[i];
  if (!t || t.pinned || t.locked || t.peak) return { tandas, fallbacks: [] };
  const gap = Math.max(1, o.orchestraRepeatGap ?? 6);
  const yr: [number, number] = o.yearRange ?? [1935, 1945];
  const played = new Set(tandas.filter((x, k) => k !== i && x.rhythm === t.rhythm).map((x) => x.orchestraId));
  const used = new Set(tandas.flatMap((x, k) => (k === i ? [] : x.songs.map((s) => normTitle(s.title)))));
  let best: { t: Tanda; v: number } | null = null;
  for (const f of nightFamilies(cat, o, t.rhythm as DanceRhythm)) {
    if (played.has(f.orchestraId)) continue;
    if (tandas.some((x, k) => k !== i && x.orchestraId === f.orchestraId && Math.abs(k - i) < gap)) continue;
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
          s.year <= yr[1]
        );
      })
      .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0) || (b.energy ?? 50) - (a.energy ?? 50))
      .slice(0, t.songs.length);
    if (sides.length < t.songs.length) continue;
    const mf = sides.reduce((a, s) => a + (s.fame ?? 0), 0) / sides.length;
    const me = sides.reduce((a, s) => a + (s.energy ?? 50), 0) / sides.length;
    if (mf < 3.5 || me < t.targetEnergy - 8) continue;
    const nt = retimeTanda(
      {
        ...t,
        orchestraId: f.orchestraId,
        orchestra: f.orchestra,
        singer: f.singer,
        vocal: f.vocal,
        era: sides[0]!.era,
        style: cat.profile(f.orchestraId)?.style,
      },
      strictOrder(sides, false),
    );
    if (Math.abs(nt.durationSec - t.durationSec) > 150) continue;
    const ts = tandas.map((x, k) => (k === i ? nt : x));
    const r1 = judge(ts);
    const p1 = noCue(r1);
    if (r1.blockers > r0.blockers || p1 >= noCue(r0) - 1e-9) continue;
    if (!best || p1 < best.v) best = { t: nt, v: p1 };
  }
  if (!best) return { tandas, fallbacks: [] };
  const old = tandas[i]!;
  tandas[i] = best.t;
  return {
    tandas,
    fallbacks: [
      `preSummit: tanda ${i + 1} ${old.orchestra}${old.singer ? ` / ${old.singer}` : ""} → ${best.t.orchestra}${best.t.singer ? ` / ${best.t.singer}` : ""} (carries the floor into the last summit)`,
    ],
  };
}

/**
 * Round 21c — two panel items a tango chair can mend by changing family:
 *   - the orchestra gap a vals / milonga chair broke because its pool was thin (the builder found no other family
 *     for it): the tango tanda of that orchestra inside the gap changes family;
 *   - the last four tandas before the última under the panel's fame floor (lastFour): one of their tango tandas
 *     changes to a better-known family.
 * The new family keeps the chair's mode (vocal or instrumental) and every gap, plays inside the night's years with
 * streaming sides of known fame, and is taken only when the strict panel as a whole comes out better for it. Never
 * the first, the última, a planned summit, the Pugliese chair or the DJ's.
 */
const WHY = {
  gap: " (its orchestra's vals / milonga sat inside the orchestra gap)",
  lastFour: " (the last four tandas were under the fame floor)",
  energyStep: " (an energy cliff at its boundary)",
} as const;

export function mendTangoChairs(
  tandas0: Tanda[],
  o: ComposeOptions,
  cat: Catalog,
  judge: (ts: Tanda[]) => {
    blockers: number;
    penalty: number;
    violations: Array<{ rule: string; severity?: string; tanda?: number }>;
  },
): VmMend {
  let tandas = tandas0.slice();
  const fallbacks: string[] = [];
  const gap = Math.max(1, o.orchestraRepeatGap ?? 6);
  const yr: [number, number] = o.yearRange ?? [1935, 1945];
  const fixed = (t: Tanda) => !!(t.pinned || t.locked || t.birthday);
  const fame = (t: Tanda) => t.songs.reduce((a, s) => a + (s.fame ?? 0), 0) / Math.max(1, t.songs.length);
  const ultima = tandas.at(-1);
  for (let round = 0; round < 3; round++) {
    const r0 = judge(tandas);
    const chairs = new Map<number, "gap" | "lastFour" | "energyStep">();
    // the tango chairs inside the gap of a vals / milonga tanda of their orchestra
    tandas.forEach((t, i) => {
      if (t.rhythm === "tango") return;
      tandas.forEach((x, k) => {
        if (k !== i && x.rhythm === "tango" && x.orchestraId === t.orchestraId && Math.abs(k - i) < gap)
          chairs.set(k, "gap");
      });
    });
    // the two tango chairs either side of an energy cliff the reorders could not cut
    for (const v of r0.violations)
      if (v.rule === "energyStep" && typeof v.tanda === "number")
        // (never the D'Arienzo chairs: the early D'Arienzo and the summits are the plan's own lifts)
        for (const k of [v.tanda, v.tanda - 1])
          if (tandas[k]?.rhythm === "tango" && tandas[k]!.orchestraId !== "juan-d-arienzo" && !chairs.has(k))
            chairs.set(k, "energyStep");
    if (r0.violations.some((v) => v.rule === "lastFour")) {
      const last = tandas.length - 1;
      for (let k = Math.max(0, last - 4); k < last; k++)
        if (tandas[k]!.rhythm === "tango" && !chairs.has(k)) chairs.set(k, "lastFour");
    }
    if (!chairs.size) break;
    let best: { ts: Tanda[]; v: number; label: string } | null = null;
    for (const [i, why] of chairs) {
      const t = tandas[i]!;
      if (i === 0 || i === tandas.length - 1 || t.peak || fixed(t) || t.orchestraId === "osvaldo-pugliese")
        continue;
      const tg = (id: string) =>
        tandas.filter((x, k) => k !== i && x.rhythm === "tango" && x.orchestraId === id);
      const used = new Set(tandas.flatMap((x, k) => (k === i ? [] : x.songs.map((s) => normTitle(s.title)))));
      for (const f of nightFamilies(cat, o, "tango")) {
        // (a cliff may change the chair's mode: the panel judges what that does to the hours' instrumentals)
        if ((why !== "energyStep" && f.vocal !== t.vocal) || f.orchestraId === t.orchestraId) continue;
        if (tg(f.orchestraId).length >= 2) continue;
        // (never a dramatic orchestra — the context's beginners rule, the Pugliese chair — and never the última's
        // orchestra and mode: the última repeats nothing the night played)
        if (f.orchestraId === "osvaldo-pugliese" || cat.profile(f.orchestraId)?.style === "dramatic")
          continue;
        if (ultima && f.orchestraId === ultima.orchestraId && f.vocal === ultima.vocal) continue;
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
              isDanceableSong(s, cat.blacklist) &&
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
            singer: f.singer,
            vocal: f.vocal,
            era: sides[0]!.era,
            style: cat.profile(f.orchestraId)?.style,
          },
          strictOrder(sides, false),
        );
        if (Math.abs(nt.durationSec - t.durationSec) > 150) continue;
        if (why === "lastFour" && fame(nt) <= fame(t)) continue;
        // (a cliff is not mended with a lesser-known family: the chair keeps its fame within half a step)
        if (why === "energyStep" && fame(nt) < fame(t) - 0.5) continue;
        const ts = tandas.map((x, k) => (k === i ? nt : x));
        const r1 = judge(ts);
        // (the cues are re-picked after the mend, as for the instrumental hours)
        const p1 = noCue(r1),
          p0 = noCue(r0);
        if (r1.blockers > r0.blockers || p1 >= p0 - 1e-9) continue;
        if (!best || p1 < best.v)
          best = {
            ts,
            v: p1,
            label: `${why}: tanda ${i + 1}: ${t.orchestra}${t.singer ? ` / ${t.singer}` : ""} → ${f.orchestra}${f.singer ? ` / ${f.singer}` : ""}${WHY[why]}`,
          };
      }
    }
    if (!best) break;
    tandas = best.ts;
    fallbacks.push(best.label);
  }
  return { tandas, fallbacks };
}

/**
 * Round 21c — the twelve golden nights share their bench (the big four every night, the golden-core bands), so one
 * tango chair per night may bring an orchestra the night does not play yet: a chair whose orchestra plays only that
 * tanda (never the first, the última, a summit, the big four, the DJ's) takes a family of the same mode from an
 * orchestra not playing tonight, chosen by the night's seed among those the strict panel judges no worse — so the
 * nights differ by orchestra, not only by family (round 4 B11).
 */
export function mendBenchVariety(
  tandas0: Tanda[],
  o: ComposeOptions,
  cat: Catalog,
  judge: (ts: Tanda[]) => { blockers: number; penalty: number },
): VmMend {
  const tandas = tandas0.slice();
  const fallbacks: string[] = [];
  const yr: [number, number] = o.yearRange ?? [1935, 1945];
  const BIG = ["carlos-di-sarli", "juan-d-arienzo", "anibal-troilo", "osvaldo-pugliese"];
  const fixed = (t: Tanda) => !!(t.pinned || t.locked || t.birthday);
  const playing = new Set(tandas.map((t) => t.orchestraId));
  const fame = (xs: Song[]) => xs.reduce((a, s) => a + (s.fame ?? 0), 0) / Math.max(1, xs.length);
  const before = judge(tandas);
  const hash = (k: string) => {
    let h = ((o.seed ?? 0) * 2654435761) >>> 0;
    for (let c = 0; c < k.length; c++) h = Math.imul(h ^ k.charCodeAt(c), 16777619) >>> 0;
    return h;
  };
  const ok: Array<{ ts: Tanda[]; key: number; label: string }> = [];
  tandas.forEach((t, i) => {
    if (t.rhythm !== "tango" || i === 0 || i === tandas.length - 1 || t.peak || fixed(t)) return;
    if (BIG.includes(t.orchestraId) || tandas.filter((x) => x.orchestraId === t.orchestraId).length > 1)
      return;
    const used = new Set(tandas.flatMap((x, k) => (k === i ? [] : x.songs.map((s) => normTitle(s.title)))));
    for (const f of nightFamilies(cat, o, "tango")) {
      if (f.vocal !== t.vocal || playing.has(f.orchestraId)) continue;
      if (cat.profile(f.orchestraId)?.style === "dramatic") continue;
      const seen = new Set<string>();
      const sides = f.songs
        .filter((s) => {
          const k = normTitle(s.title);
          if (seen.has(k) || used.has(k)) return false;
          seen.add(k);
          return (
            streams(s) &&
            isTandaEligible(s, !!o.rules?.allowUndated) &&
            isDanceableSong(s, cat.blacklist) &&
            !!s.year &&
            s.year >= yr[0] &&
            s.year <= yr[1] &&
            (s.fame ?? 0) >= 2
          );
        })
        .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))
        .slice(0, t.songs.length);
      if (sides.length < t.songs.length || fame(sides) < Math.min(3, fame(t.songs))) continue;
      const nt = retimeTanda(
        {
          ...t,
          orchestraId: f.orchestraId,
          orchestra: f.orchestra,
          singer: f.singer,
          vocal: f.vocal,
          era: sides[0]!.era,
          style: cat.profile(f.orchestraId)?.style,
        },
        strictOrder(sides, false),
      );
      if (Math.abs(nt.durationSec - t.durationSec) > 150) continue;
      const ts = tandas.map((x, k) => (k === i ? nt : x));
      const r = judge(ts);
      if (r.blockers > before.blockers || r.penalty > before.penalty + 1e-9) continue;
      ok.push({
        ts,
        key: hash(`${i}|${f.orchestraId}|${f.singer ?? ""}`),
        label: `bench: tanda ${i + 1}: ${t.orchestra}${t.singer ? ` / ${t.singer}` : ""} → ${f.orchestra}${f.singer ? ` / ${f.singer}` : ""} (an orchestra the night did not play)`,
      });
    }
  });
  if (!ok.length) return { tandas, fallbacks };
  const pick = ok.sort((a, b) => a.key - b.key)[0]!;
  fallbacks.push(pick.label);
  return { tandas: pick.ts, fallbacks };
}

/**
 * Round 8 (one family never twice) — the early D'Arienzo instrumental and the D'Arienzo instrumental summit never
 * share a family (orchestra, singer, overlapping years, rhythm). The builder draws the early chair before the summit,
 * so the two can overlap (an early 1936–37 set and the 1935–38 Hotel Victoria summit). The two chairs then part their
 * years: one keeps its sides and the other moves outside them, or both split at a year (the early chair before it and
 * the summit after, or the other way round). The early chair stays inside 1935–39 (the round-4 window) and never takes
 * the summit's hooks (round 10 R10.5); the summit stays inside the darienzoPeak window (1937–40, from 1935 with a
 * fame-5 side) with two sides of fame ≥ 4. Neither chair crosses a line-up break or recording gap (round 13 R3), and
 * each has at most one side nobody streams. Of the splits that add no blocker and no −20/+20 sawtooth, the one the
 * strict panel judges best (its penalty) is taken. The rebuilt early chair carries `familySplit`, so the step into
 * it may reach DA_SPLIT_STEP (22) behind a cortina (the owner's allowance: the last summit keeps its fame-5 sides). The round-8 rule is a hard one, so the
 * night parts the two chairs even when every split costs the panel a should-fix item.
 */
const DA_SUMMIT_HOOKS = ["hotel victoria", "el flete", "el internado"].map(normTitle);
const DA_EARLY_WINDOW: [number, number] = [1935, 1939];
const DA_SUMMIT_WINDOW: [number, number] = [1935, 1940];

export function mendDarienzoFamily(
  tandas0: Tanda[],
  o: ComposeOptions,
  cat: Catalog,
  judge: (ts: Tanda[]) => { blockers: number; penalty: number; violations?: Array<{ rule: string }> },
  /** the family's period starts (compose.ts familyBreaks): a chair never crosses one (round 13 cohesion R3) */
  breaks?: FamilyOpts["breaks"],
): VmMend {
  const tandas = tandas0.slice();
  const fallbacks: string[] = [];
  const DA = "juan-d-arienzo";
  const bps = breaks?.(DA, null, false) ?? [];
  const monthOf = (s: Song) => {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(s.date ?? "");
    return m ? Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 6) : (s.year ?? 0) * 12 + 6;
  };
  const oneFamily = (xs: Song[]) => {
    const ms = xs.map(monthOf);
    const lo = Math.min(...ms),
      hi = Math.max(...ms);
    return !bps.some((b) => lo < b && b <= hi);
  };
  const yr: [number, number] = o.yearRange ?? [1935, 1945];
  const fixed = (t: Tanda) => !!(t.pinned || t.locked || t.birthday);
  const instr = (t: Tanda) => t.orchestraId === DA && t.rhythm === "tango" && !t.vocal;
  const overlap = (a: Tanda, b: Tanda) =>
    !!a.yearRange && !!b.yearRange && a.yearRange[0] <= b.yearRange[1] && b.yearRange[0] <= a.yearRange[1];
  const i = tandas.findIndex((t) => instr(t) && !t.peak);
  const j = tandas.findIndex((t) => instr(t) && !!t.peak);
  if (i < 0 || j < 0 || fixed(tandas[i]!) || fixed(tandas[j]!) || !overlap(tandas[i]!, tandas[j]!))
    return { tandas, fallbacks };
  const early = tandas[i]!,
    summit = tandas[j]!;
  const used = new Set(
    tandas.flatMap((t, k) => (k === i || k === j ? [] : t.songs.map((s) => normTitle(s.title)))),
  );
  const before = judge(tandas);
  const fameOf = (s: Song) => s.fame ?? 0;
  const meanE = (xs: Song[]) => xs.reduce((a, s) => a + (s.energy ?? 50), 0) / Math.max(1, xs.length);
  const pool = (() => {
    const seen = new Set<string>();
    return cat.songs
      .filter(
        (s) =>
          s.orchestraId === DA &&
          s.rhythm === "tango" &&
          !s.vocal &&
          !!s.year &&
          s.year >= yr[0] &&
          s.year <= yr[1] &&
          streamable(s) &&
          !s.streamSuspect &&
          isTandaEligible(s, !!o.rules?.allowUndated) &&
          isDanceableSong(s, cat.blacklist) &&
          !used.has(normTitle(s.title)),
      )
      .sort(
        (a, b) =>
          Number(streams(b)) - Number(streams(a)) || fameOf(b) - fameOf(a) || a.id.localeCompare(b.id),
      )
      .filter((s) => {
        const k = normTitle(s.title);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  })();
  // (a side nobody streams at all: one per chair at most, never two in the night's two chairs)
  const offPool = (lo: number, hi: number) =>
    cat.songs.filter(
      (s) =>
        s.orchestraId === DA &&
        s.rhythm === "tango" &&
        !s.vocal &&
        !!s.year &&
        s.year >= Math.max(lo, yr[0]) &&
        s.year <= Math.min(hi, yr[1]) &&
        !streamable(s) &&
        (s.fame ?? 0) >= 4 &&
        isTandaEligible(s, !!o.rules?.allowUndated) &&
        isDanceableSong(s, cat.blacklist) &&
        !used.has(normTitle(s.title)),
    );
  /** a chair's best side sets from the years [lo, hi]: known, streaming, near the chair's energy */
  const setsFor = (
    t: Tanda,
    lo: number,
    hi: number,
    avoid: Set<string>,
    keep: (xs: Song[]) => boolean,
  ): Song[][] => {
    const n = t.songs.length;
    const free = (s: Song) => !!s.year && s.year >= lo && s.year <= hi && !avoid.has(normTitle(s.title));
    const xs = pool.filter(free).slice(0, 14);
    const extra = offPool(lo, hi).filter(free).slice(0, 2);
    const all = [...xs, ...extra];
    const out: Song[][] = [];
    const pick = (from: number, cur: Song[]) => {
      if (cur.length === n) {
        if (oneFamily(cur) && keep(cur)) out.push(cur);
        return;
      }
      for (let k = from; k < all.length; k++) {
        const s = all[k]!;
        if (!streamable(s) && cur.some((x) => !streamable(x))) continue;
        pick(k + 1, [...cur, s]);
      }
    };
    pick(0, []);
    // (the early chair aims at most DA_SPLIT_STEP above the tanda before it, the step the panel allows it)
    const prevE = t === early && i > 0 ? tandas[i - 1]!.energy : undefined;
    const e0 = prevE === undefined ? t.energy : Math.min(t.energy, prevE + DA_SPLIT_STEP);
    const worth = (ss: Song[]) =>
      ss.reduce((a, s) => a + fameOf(s), 0) -
      2 * Math.abs(meanE(ss) - e0) -
      ss.filter((s) => !streams(s)).length * 1.5;
    return out.sort((a, b) => worth(b) - worth(a)).slice(0, 16);
  };
  // (ordered for its slot: the summit's order, the step in from the previous tanda's last side)
  const rebuild = (t: Tanda, sides: Song[]) => {
    const off = sides.find((s) => !streamable(s));
    const k = tandas.indexOf(t);
    const nt = retimeTanda(
      {
        ...t,
        era: sides[0]!.era,
        note: off ? `${off.title} has no checked stream: play it from your files (or swap it)` : undefined,
      },
      strictOrder(sides, isPeakSlot(t), orderCtxOf(tandas, k)),
    );
    // (the heat label follows the sides: "fantastic" needs a mean side fame of 3)
    const heat = heatOfSides(nt.songs);
    if (heat) nt.heat = heat;
    else delete nt.heat;
    // (the early chair the split rebuilt: the step into it may reach DA_SPLIT_STEP behind a cortina, strict.ts)
    // (2026-11: only within DA_SPLIT_STEP of the tanda before it — beyond, the step is the composer's own and the panel
    // judges it as any other)
    if (t === early && (k < 1 || nt.energy - tandas[k - 1]!.energy <= DA_SPLIT_STEP))
      nt.familySplit = "darienzo";
    return nt;
  };
  const titlesOf = (xs: Song[]) => new Set(xs.map((s) => normTitle(s.title)));
  const earlyOk = (xs: Song[]) =>
    !xs.some((s) => DA_SUMMIT_HOOKS.includes(normTitle(s.title))) &&
    xs.reduce((a, s) => a + fameOf(s), 0) / xs.length >= 2.5 - 1e-9;
  // (from 1935 only with a fame-5 side and a mean fame of 3.75, as the panel's darienzoPeak asks)
  const summitOk = (xs: Song[]) => {
    if (xs.filter((s) => fameOf(s) >= 4).length < 2) return false;
    const lo = Math.min(...xs.map((s) => s.year!));
    const mf = xs.reduce((a, s) => a + fameOf(s), 0) / xs.length;
    return lo >= 1937 || (xs.some((s) => fameOf(s) >= 5) && mf >= 3.75 - 1e-9);
  };
  const pairs: Array<{ e: Tanda; s: Tanda }> = [];
  const span = (t: Tanda) => t.yearRange!;
  const [E0, E1] = DA_EARLY_WINDOW,
    [S0, S1] = DA_SUMMIT_WINDOW;
  // one chair keeps its sides, the other moves outside its years
  for (const [lo, hi] of [
    [E0, span(summit)[0] - 1],
    [span(summit)[1] + 1, E1],
  ] as const)
    for (const xs of setsFor(early, lo, hi, titlesOf(summit.songs), earlyOk))
      pairs.push({ e: rebuild(early, xs), s: summit });
  for (const [lo, hi] of [
    [S0, span(early)[0] - 1],
    [span(early)[1] + 1, S1],
  ] as const)
    for (const xs of setsFor(summit, lo, hi, titlesOf(early.songs), summitOk))
      pairs.push({ e: early, s: rebuild(summit, xs) });
  // or both split at a year
  for (let y = E0; y < S1; y++)
    for (const earlyFirst of [true, false]) {
      const [elo, ehi] = earlyFirst ? [E0, y] : [y + 1, E1];
      const [slo, shi] = earlyFirst ? [y + 1, S1] : [S0, y];
      if (elo > ehi || slo > shi) continue;
      const es = setsFor(early, elo, ehi, new Set(), earlyOk);
      if (!es.length) continue;
      for (const exs of es)
        for (const sxs of setsFor(summit, slo, shi, titlesOf(exs), summitOk).slice(0, 6))
          pairs.push({ e: rebuild(early, exs), s: rebuild(summit, sxs) });
    }
  // (never a −20/+20 sawtooth: two consecutive opposite tanda-energy steps both above 18, round 8 R4)
  const saws = (ts: Tanda[]) => {
    let n = 0;
    for (let k = 1; k < ts.length - 1; k++) {
      const x = ts[k]!.energy - ts[k - 1]!.energy,
        y = ts[k + 1]!.energy - ts[k]!.energy;
      if (x * y < 0 && Math.abs(x) > 18 && Math.abs(y) > 18) n++;
    }
    return n;
  };
  const saw0 = saws(tandas);
  let best: { ts: Tanda[]; p: number; label: string } | null = null;
  for (const c of pairs) {
    if (overlap(c.e, c.s)) continue;
    if (
      Math.abs(c.e.durationSec - early.durationSec) > 150 ||
      Math.abs(c.s.durationSec - summit.durationSec) > 150
    )
      continue;
    const trial = tandas.map((x, k) => (k === i ? c.e : k === j ? c.s : x));
    if (saws(trial) > saw0) continue;
    // (a rebuilt early chair never steps further above the tanda before it than the composer's own chair did)
    if (
      c.e !== early &&
      i > 0 &&
      c.e.energy - trial[i - 1]!.energy > Math.max(DA_SPLIT_STEP, early.energy - trial[i - 1]!.energy)
    )
      continue;
    const after = judge(trial);
    if (after.blockers > before.blockers) continue;
    const cost = after.penalty;
    if (best && cost >= best.p - 1e-9) continue;
    best = {
      ts: trial,
      p: cost,
      label: `darienzo: the early chair (tanda ${i + 1}) plays ${span(c.e).join("–")} and the summit (tanda ${j + 1}) ${span(c.s).join("–")}, never one family`,
    };
  }
  if (!best) return { tandas, fallbacks };
  fallbacks.push(best.label);
  return { tandas: best.ts, fallbacks };
}
