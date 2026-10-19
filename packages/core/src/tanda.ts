import { tandaCohesion } from "./audio/compat";
import { normTitle } from "./energy";
import type { ComposeOptions, DanceRhythm, Era, Rng, Slot, Song, Tanda } from "./index";
import {
  CORPUS_CAPS,
  DEFAULT_CAP,
  MILONGA_BANK,
  NEVER_OPEN,
  OPENERS,
  PLACEMENT_MEDIAN,
  VALS_BANK,
} from "./rules";

export interface TandaCandidate {
  orchestraId: string;
  orchestra: string;
  singer: string | null;
  vocal: boolean;
  songs: Song[];
  singerShare: number;
}

/** Group songs into coherent families: same orchestra + same singer (or instrumental) + tight year window. */
export function families(pool: Song[], maxYearSpread: number, mixVocal: boolean): TandaCandidate[] {
  const groups = new Map<string, Song[]>();
  const perOrch = new Map<string, number>();
  for (const s of pool) {
    const k = mixVocal ? s.orchestraId : `${s.orchestraId}|${s.singerId ?? "instr"}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
    perOrch.set(s.orchestraId, (perOrch.get(s.orchestraId) ?? 0) + 1);
  }
  const out: TandaCandidate[] = [];
  for (const songs of groups.values()) {
    const first = songs[0]!;
    const share = songs.length / Math.max(1, perOrch.get(first.orchestraId) ?? 1);
    const sorted = songs.slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    let bucket: Song[] = [];
    const flush = () => {
      if (bucket.length)
        out.push({
          orchestraId: first.orchestraId,
          orchestra: first.orchestra,
          singer: mixVocal ? null : first.singer,
          vocal: mixVocal ? bucket.some((b) => b.vocal) : first.vocal,
          songs: bucket,
          singerShare: share,
        });
      bucket = [];
    };
    for (const s of sorted) {
      const y0 = bucket[0]?.year ?? s.year ?? 0;
      if (bucket.length && s.year && y0 && s.year - y0 > maxYearSpread) flush();
      bucket.push(s);
    }
    flush();
  }
  return out;
}

/** Order the chosen songs inside the tanda according to the requested shape. */
export function shapeTanda(songs: Song[], shape: ComposeOptions["tandaShape"]): Song[] {
  const s = songs
    .slice()
    .sort(
      (a, b) =>
        (a.energy ?? 50) - (b.energy ?? 50) ||
        (a.audio?.bpm ?? a.bpm ?? 0) - (b.audio?.bpm ?? b.bpm ?? 0) ||
        (a.year ?? 0) - (b.year ?? 0),
    ); // ascending
  const n = s.length;
  if (n <= 2 || shape === "flat") return s;
  switch (shape) {
    case "rise":
      return s;
    case "hammock": {
      if (n === 3) return [s[1]!, s[0]!, s[2]!];
      return [s[n - 2]!, s[0]!, s[1]!, s[n - 1]!, ...s.slice(2, n - 2)];
    }
    case "peak-middle": {
      const out = [s[0]!];
      const rest = s.slice(1);
      const top = rest.pop()!;
      const second = rest.pop();
      if (second) out.push(second);
      out.push(top);
      out.push(...rest.reverse());
      return out;
    }
    default: {
      if (n === 3) return s;
      return [s[0]!, s[1]!, s[n - 1]!, ...s.slice(2, n - 1)];
    } // rise-settle
  }
}

export interface BuildContext {
  recentOrchestras: string[];
  recentSingers: string[];
  usedTitles: Set<string>;
  usedSongIds: Set<string>;
  guardiaCount?: number;
}
export interface CanonicalTanda {
  rhythm: string;
  orchestraId: string;
  singer?: string | null;
  years?: [number, number];
  titles?: string[];
  phase?: string;
  popularity?: number;
}
export interface Scoring {
  energy: (id: string) => number;
  phase: (id: string) => string[] | undefined;
  tier: (id: string) => number;
  notBefore: (id: string) => number;
  style: (id: string) => string | undefined;
  preferStyles?: string[];
  avoidStyles?: string[];
  isDanceable: (s: Song) => boolean;
  canonical?: CanonicalTanda[];
  guardiaOnly?: boolean;
  /** extra per-orchestra limits from profiles */
  maxPerNight?: (id: string) => number | undefined;
  notAfter?: (id: string) => number | undefined;
  neverClose?: (id: string) => boolean;
  nonDance?: (id: string, title: string) => boolean;
}

const PHASE_STYLE: Record<string, Record<string, number>> = {
  warmup: {
    lyrical: 1.5,
    guardia: 1.3,
    balanced: 1.1,
    rhythmic: 0.7,
    dramatic: 0.3,
    nuevo: 0.4,
    contemporary: 0.5,
  },
  build: {
    lyrical: 1.1,
    guardia: 1.0,
    balanced: 1.2,
    rhythmic: 1.2,
    dramatic: 0.6,
    nuevo: 0.6,
    contemporary: 0.8,
  },
  peak: {
    lyrical: 0.6,
    guardia: 0.6,
    balanced: 1.0,
    rhythmic: 1.7,
    dramatic: 1.3,
    nuevo: 0.7,
    contemporary: 1.0,
  },
  cooldown: {
    lyrical: 1.5,
    guardia: 0.9,
    balanced: 1.1,
    rhythmic: 0.7,
    dramatic: 1.0,
    nuevo: 0.7,
    contemporary: 0.6,
  },
  close: {
    lyrical: 1.0,
    guardia: 0.8,
    balanced: 1.2,
    rhythmic: 1.4,
    dramatic: 0.9,
    nuevo: 0.4,
    contemporary: 0.5,
  },
};

export function buildTanda(
  slot: Slot,
  cands: TandaCandidate[],
  o: ComposeOptions,
  rng: Rng,
  ctx: BuildContext,
  sc: Scoring,
): Tanda | null {
  const need = slot.size;
  const availOf = (c: TandaCandidate) =>
    c.songs.filter(
      (s) =>
        sc.isDanceable(s) &&
        !ctx.usedSongIds.has(s.id) &&
        (!o.avoidTitleRepeats || !ctx.usedTitles.has(normTitle(s.title))),
    );
  const count = (id: string) => ctx.recentOrchestras.filter((x) => x === id).length;
  const cap = (id: string) => {
    const base = sc.maxPerNight?.(id) ?? CORPUS_CAPS[id] ?? DEFAULT_CAP;
    return base + (o.hours > 8 ? 2 : o.hours > 5 ? 1 : 0);
  };
  const isGuardia = (c: TandaCandidate) =>
    c.songs.every((s) => s.era === "guardia-vieja" || s.era === "guardia-nueva");
  const isLast = slot.phase === "close";
  const viableAll = cands.filter((c) => {
    if (slot.position < sc.notBefore(c.orchestraId)) return false;
    const na = sc.notAfter?.(c.orchestraId);
    if (na !== undefined && slot.position > na && !isLast) return false;
    if (isLast && sc.neverClose?.(c.orchestraId)) return false;
    if (count(c.orchestraId) >= cap(c.orchestraId)) return false;
    if (slot.index === 0 && NEVER_OPEN.has(c.orchestraId)) return false;
    if (!sc.guardiaOnly && isGuardia(c) && ((ctx.guardiaCount ?? 0) >= 1 || slot.position > 0.4))
      return false; // ≤1 Guardia Vieja tanda, first 40 %
    return (
      new Set(
        availOf(c)
          .filter((s) => !sc.nonDance?.(c.orchestraId, s.title))
          .map((s) => normTitle(s.title)),
      ).size >= need
    );
  });
  // hard phase filter: an orchestra programmed for other phases only enters when nothing else fits
  const phaseOk = (c: TandaCandidate) => {
    const ph = sc.phase(c.orchestraId);
    return (
      !ph ||
      ph.includes(slot.phase) ||
      ph.includes("any") ||
      (slot.phase === "close" && ph.includes("cooldown"))
    );
  };
  const viable = viableAll.filter(phaseOk).length >= 3 ? viableAll.filter(phaseOk) : viableAll;
  if (!viable.length) return null;
  const gapOk = (c: TandaCandidate) => {
    const io = ctx.recentOrchestras.indexOf(c.orchestraId);
    if (io !== -1 && io < o.orchestraRepeatGap) return false;
    if (c.singer) {
      const is = ctx.recentSingers.indexOf(c.singer);
      if (is !== -1 && is < o.singerRepeatGap) return false;
    }
    return true;
  };
  let pool = viable.filter(gapOk);
  if (!pool.length)
    pool = viable.filter(
      (c) => ctx.recentOrchestras[0] !== c.orchestraId && (!c.singer || ctx.recentSingers[0] !== c.singer),
    );
  if (!pool.length) return null; // never the same orchestra twice in a row; the caller falls back to a tango tanda

  const weight = (c: TandaCandidate) => {
    const av = availOf(c);
    const e = av.reduce((a, s) => a + (s.energy ?? 50), 0) / av.length;
    const d = Math.abs(e - slot.targetEnergy);
    let w = Math.max(0.02, 1 - d / 28) ** 3;
    const ph = sc.phase(c.orchestraId);
    if (ph && (ph.includes(slot.phase) || ph.includes("any"))) w *= 1.5;
    else if (ph) w *= 0.5;
    const st = sc.style(c.orchestraId) ?? "balanced";
    w *= PHASE_STYLE[slot.phase]?.[st] ?? 1;
    if (sc.preferStyles?.includes(st)) w *= 1.4;
    if (sc.avoidStyles?.includes(st)) w *= 0.3;
    const t = sc.tier(c.orchestraId);
    w *= t === 1 ? 2.2 : t === 2 ? 0.7 : 0.12;
    w *= Math.min(2, 0.6 + av.length / 10);
    // canonical singers (a large share of the orchestra's vocal catalogue) beat one-off collaborations
    if (c.singer) w *= c.singerShare >= 0.12 ? 1.3 : c.singerShare >= 0.05 ? 1 : 0.35;
    const fame = av.reduce((a, s) => a + (s.fame ?? 0), 0) / av.length;
    w *= 1 + fame * 0.25;
    if (av.some((s) => s.selection)) w *= 1.2;
    const times = count(c.orchestraId);
    w /= 1 + 1.8 * times;
    if (t === 1 && times === 0) w *= 1.8;
    // corpus placement: orchestras cluster around a typical position of the night
    const med = PLACEMENT_MEDIAN[c.orchestraId];
    if (med !== undefined) w *= 0.55 + Math.exp(-(((slot.position - med) / 0.35) ** 2)) * 0.9;
    if (slot.index === 0) w *= OPENERS[c.orchestraId] ?? 0.5;
    if (slot.phase === "warmup" && c.orchestraId !== "carlos-di-sarli") {
      const ys = av.map((s) => s.year ?? 0).filter(Boolean);
      const my = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 1942;
      w *= my <= 1943 ? 1.5 : my >= 1950 ? 0.55 : 1;
    } // reference openers are 1935–43 material
    if (slot.rhythm === "vals") w *= 0.5 + (VALS_BANK[c.orchestraId] ?? 0) / 6;
    if (slot.rhythm === "milonga") w *= 0.5 + (MILONGA_BANK[c.orchestraId] ?? 0) / 6;
    if (c.orchestraId === "juan-d-arienzo" && times === 0) {
      const y = av.map((s) => s.year ?? 0);
      const early = !c.vocal && y.length && Math.min(...y) >= 1935 && Math.max(...y) <= 1939;
      if (slot.position < 0.35) w *= early ? 3 : 1.2;
      else if (slot.position > 0.5) w *= 2; // the first D'Arienzo comes early and instrumental; and D'Arienzo always appears
    }
    const canon = sc.canonical?.find(
      (k) =>
        k.rhythm === slot.rhythm &&
        k.orchestraId === c.orchestraId &&
        (k.singer ?? null) === (c.singer ?? null) &&
        (!k.years ||
          !av[0]?.year ||
          av.some((s) => s.year && s.year >= k.years![0] - 1 && s.year <= k.years![1] + 1)),
    );
    if (canon) w *= 1.4 + (canon.popularity ?? 3) * 0.15 * (canon.phase === slot.phase ? 1.5 : 1);
    // variety across nights: a family that played in the last sets steps back (never excluded, a floor has favourites)
    if (o.recent?.tandaKeys?.includes(`${c.orchestraId}|${c.singer ?? ""}|${slot.rhythm}`)) w *= 0.4;
    return w;
  };
  // sample among the best few, not the whole long tail (a 0.3 % candidate at the peak is a tell)
  // flattened (w^0.7) so the runner-up families get a real chance and two nights with the same options differ
  const ranked = pool
    .map((c) => ({ c, w: weight(c) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 8)
    .map((r) => ({ c: r.c, w: r.w ** 0.7 }));
  const chosen = rng.weighted(ranked, (r) => r.w)?.c;
  if (!chosen) return null;
  const avail = availOf(chosen).filter((s) => !sc.nonDance?.(chosen.orchestraId, s.title));
  // stochastic pick: score by fit + fame + curator flag, then sample `need` from the top window so seeds differ
  const target = slot.targetEnergy + (rng.next() - 0.5) * 6;
  const canonTitles = new Set(
    (sc.canonical ?? [])
      .filter((k) => k.orchestraId === chosen.orchestraId && k.rhythm === slot.rhythm)
      .flatMap((k) => (k.titles ?? []).map(normTitle)),
  );
  const recentTitles = new Set(o.recent?.titles ?? []);
  const scored = avail
    .map((s) => ({
      s,
      w:
        Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - target) / 30) *
        (1 + (s.fame ?? 0) * 0.5) *
        (canonTitles.has(normTitle(s.title)) ? 2 : 1) *
        (s.selection ? 1.3 : 1) *
        (recentTitles.has(normTitle(s.title)) ? 0.55 : 1) *
        (0.6 + rng.next() * 0.8),
    }))
    .sort((a, b) => b.w - a.w);
  const seen = new Set<string>();
  const picked: Song[] = [];
  // greedy: first pick by weight, then prefer tracks whose analysed tempo/key/loudness sit with the tanda so far
  const rest = scored.slice(0, Math.max(need * 6, 24));
  while (picked.length < need && rest.length) {
    const anchor = picked.filter((x) => x.audio);
    let bi = 0;
    if (anchor.length) {
      let bw = -1;
      rest.forEach((r, i) => {
        const c = r.s.audio
          ? tandaCohesion(
              [...anchor, r.s].map((x) => x.audio),
              slot.rhythm,
            ).score
          : 50;
        const w = r.w * (0.6 + 0.4 * (c / 100));
        if (w > bw) {
          bw = w;
          bi = i;
        }
      });
    }
    const [{ s: cand }] = rest.splice(bi, 1) as [{ s: Song; w: number }];
    const k = normTitle(cand.title);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(cand);
  }
  if (picked.length < need) return null;
  const songs = shapeTanda(picked, o.tandaShape);
  const years = songs.map((s) => s.year).filter((y): y is number => !!y);
  const curve = songs.map((s) => s.energy ?? 50);
  const energy = Math.round(curve.reduce((a, b) => a + b, 0) / curve.length);
  const durationSec = o.avgTrackSec
    ? songs.length * o.avgTrackSec
    : songs.reduce((a, s) => a + (s.durationSec ?? 170), 0);
  const eraCount = new Map<Era, number>();
  for (const s of songs) eraCount.set(s.era, (eraCount.get(s.era) ?? 0) + 1);
  const era = [...eraCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const st = sc.style(chosen.orchestraId);
  const reason = `${slot.phase}: ${st ?? "balanced"} ${chosen.orchestra}${chosen.singer ? ` with ${chosen.singer}` : " instrumental"}${years.length ? ` ${Math.min(...years)}–${Math.max(...years)}` : ""}, energy ${energy} for target ${slot.targetEnergy}`;
  return {
    index: slot.index,
    rhythm: slot.rhythm as DanceRhythm,
    orchestra: chosen.orchestra,
    orchestraId: chosen.orchestraId,
    singer: chosen.singer,
    vocal: chosen.vocal,
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null,
    era,
    songs,
    energy,
    energyCurve: curve,
    targetEnergy: slot.targetEnergy,
    phase: slot.phase,
    durationSec,
    cortina: null,
    reason,
    cohesion: songs.some((x) => x.audio)
      ? tandaCohesion(
          songs.map((x) => x.audio),
          slot.rhythm,
        ).score
      : undefined,
  };
}
