import { normTitle } from "./energy";
import type { ComposeOptions, DanceRhythm, Era, Rng, Slot, Song, Tanda } from "./index";

export interface TandaCandidate {
  orchestraId: string;
  orchestra: string;
  singer: string | null;
  vocal: boolean;
  songs: Song[];
}

/** Group a pool of songs into coherent "families": same orchestra + same singer (or instrumental) + tight year window. */
export function families(pool: Song[], maxYearSpread: number, mixVocal: boolean): TandaCandidate[] {
  const groups = new Map<string, Song[]>();
  for (const s of pool) {
    const k = mixVocal ? s.orchestraId : `${s.orchestraId}|${s.singerId ?? "instr"}`;
    const arr = groups.get(k) ?? [];
    arr.push(s);
    groups.set(k, arr);
  }
  const out: TandaCandidate[] = [];
  for (const songs of groups.values()) {
    const first = songs[0]!;
    // split by year windows so a tanda stays within maxYearSpread
    const sorted = songs.slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    let bucket: Song[] = [];
    for (const s of sorted) {
      const y0 = bucket[0]?.year ?? s.year ?? 0;
      if (bucket.length && s.year && y0 && s.year - y0 > maxYearSpread) {
        out.push({
          orchestraId: first.orchestraId,
          orchestra: first.orchestra,
          singer: mixVocal ? null : first.singer,
          vocal: mixVocal ? bucket.some((b) => b.vocal) : first.vocal,
          songs: bucket,
        });
        bucket = [];
      }
      bucket.push(s);
    }
    if (bucket.length)
      out.push({
        orchestraId: first.orchestraId,
        orchestra: first.orchestra,
        singer: mixVocal ? null : first.singer,
        vocal: mixVocal ? bucket.some((b) => b.vocal) : first.vocal,
        songs: bucket,
      });
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
      return s; // slow → strongest last
    case "hammock": {
      // announce with a known strong track, dip in the middle, close with the strongest (Buenos Aires default)
      if (n === 3) return [s[1]!, s[0]!, s[2]!];
      return [s[n - 2]!, s[0]!, s[1]!, s[n - 1]!, ...s.slice(2, n - 2)];
    }
    case "peak-middle": {
      // slow, strong, strongest, medium
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
      // rise-settle: start calm, climb, strongest third, settle slightly on the last (the "4 musics" curve)
      if (n === 3) return s;
      const out = [s[0]!, s[1]!, s[n - 1]!, ...s.slice(2, n - 1)];
      return out;
    }
  }
}

export interface BuildContext {
  recentOrchestras: string[]; // most recent first
  recentSingers: string[];
  usedTitles: Set<string>;
  usedSongIds: Set<string>;
}

export function buildTanda(
  slot: Slot,
  cands: TandaCandidate[],
  o: ComposeOptions,
  rng: Rng,
  ctx: BuildContext,
  _profileEnergy: (id: string) => number,
  profilePhase: (id: string) => string[] | undefined,
  tier: (id: string) => number,
  notBefore: (id: string) => number = () => 0,
): Tanda | null {
  const need = slot.size;
  const viable = cands.filter((c) => {
    if (slot.position < notBefore(c.orchestraId)) return false;
    const avail = c.songs.filter(
      (s) => !ctx.usedSongIds.has(s.id) && (!o.avoidTitleRepeats || !ctx.usedTitles.has(normTitle(s.title))),
    );
    return new Set(avail.map((s) => normTitle(s.title))).size >= need;
  });
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
  if (!pool.length) pool = viable.filter((c) => ctx.recentOrchestras[0] !== c.orchestraId);
  if (!pool.length) pool = viable;

  const weight = (c: TandaCandidate) => {
    const e = c.songs.reduce((a, s) => a + (s.energy ?? 50), 0) / c.songs.length;
    const d = Math.abs(e - slot.targetEnergy);
    let w = Math.max(0.02, 1 - d / 30) ** 2;
    const ph = profilePhase(c.orchestraId);
    if (ph && (ph.includes(slot.phase) || ph.includes("any"))) w *= 1.6;
    else if (ph) w *= 0.45;
    const t = tier(c.orchestraId);
    w *= t === 1 ? 1.5 : t === 2 ? 1 : 0.35;
    w *= Math.min(2, 0.6 + c.songs.length / 10); // deeper catalogues are safer
    if (c.songs.some((s) => s.selection)) w *= 1.25;
    const times = ctx.recentOrchestras.filter((x) => x === c.orchestraId).length;
    w /= 1 + 2.5 * times; // spread the night across orchestras
    if (t === 1 && times === 0) w *= 1.8; // every core orchestra should get its first appearance
    return w;
  };
  const chosen = rng.weighted(pool, weight);
  if (!chosen) return null;
  const avail = chosen.songs.filter(
    (s) => !ctx.usedSongIds.has(s.id) && (!o.avoidTitleRepeats || !ctx.usedTitles.has(normTitle(s.title))),
  );
  // pick `need` songs near the target energy, prefer curator selection and tight years
  const sortedByFit = rng
    .shuffle(avail)
    .sort(
      (a, b) =>
        Math.abs((a.energy ?? 50) - slot.targetEnergy) -
        Math.abs((b.energy ?? 50) - slot.targetEnergy) +
        ((b.selection ? 1 : 0) - (a.selection ? 1 : 0)) * 3,
    );
  const seenTitles = new Set<string>();
  const dedup = sortedByFit.filter((s) => {
    const k = normTitle(s.title);
    if (seenTitles.has(k)) return false;
    seenTitles.add(k);
    return true;
  });
  if (dedup.length < need) return null;
  const picked = dedup.slice(0, Math.min(dedup.length, need + 3));
  const songs = shapeTanda(rng.shuffle(picked).slice(0, need), o.tandaShape);
  const years = songs.map((s) => s.year).filter((y): y is number => !!y);
  const curve = songs.map((s) => s.energy ?? 50);
  const energy = Math.round(curve.reduce((a, b) => a + b, 0) / curve.length);
  const durationSec = songs.reduce(
    (a, s) => a + (s.durationSec ?? (slot.rhythm === "tango" ? 170 : slot.rhythm === "vals" ? 160 : 150)),
    0,
  );
  const eraCount = new Map<Era, number>();
  for (const s of songs) eraCount.set(s.era, (eraCount.get(s.era) ?? 0) + 1);
  const era = [...eraCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
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
  };
}
