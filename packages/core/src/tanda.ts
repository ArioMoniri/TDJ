import { normTitle } from "./energy";
import type { ComposeOptions, DanceRhythm, Era, Rng, Slot, Song, Tanda } from "./index";

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
  const s = songs.slice().sort((a, b) => (a.energy ?? 50) - (b.energy ?? 50)); // ascending
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
  const viable = cands.filter(
    (c) =>
      slot.position >= sc.notBefore(c.orchestraId) &&
      new Set(availOf(c).map((s) => normTitle(s.title))).size >= need,
  );
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
    const times = ctx.recentOrchestras.filter((x) => x === c.orchestraId).length;
    w /= 1 + 1.8 * times;
    if (t === 1 && times === 0) w *= 1.8;
    return w;
  };
  const chosen = rng.weighted(pool, weight);
  if (!chosen) return null;
  const avail = availOf(chosen);
  // stochastic pick: score by fit + fame + curator flag, then sample `need` from the top window so seeds differ
  const target = slot.targetEnergy + (rng.next() - 0.5) * 6;
  const scored = avail
    .map((s) => ({
      s,
      w:
        Math.max(0.05, 1 - Math.abs((s.energy ?? 50) - target) / 30) *
        (1 + (s.fame ?? 0) * 0.5) *
        (s.selection ? 1.3 : 1) *
        (0.7 + rng.next() * 0.6),
    }))
    .sort((a, b) => b.w - a.w);
  const seen = new Set<string>();
  const picked: Song[] = [];
  for (const { s } of scored) {
    const k = normTitle(s.title);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(s);
    if (picked.length === need) break;
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
  };
}
