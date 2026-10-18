import { planSlots } from "./arc";
import type { Catalog } from "./catalog";
import { cortinaPool, pickCortina } from "./cortinas";
import { normTitle } from "./energy";
import { makeRng } from "./rng";
import { scorePlaylist } from "./score";
import { buildTanda, families, type BuildContext } from "./tanda";
import type { ComposeOptions, Cortina, DanceRhythm, Playlist, PlaylistStats, Song, Tanda } from "./types";

export const DEFAULT_OPTIONS: ComposeOptions = {
  hours: 4, eras: ["golden"], pattern: "classic", tangoTandaSize: 4, valsTandaSize: 3, milongaTandaSize: 3, tandaShape: "rise-settle",
  arc: "classic-two-peaks", cortinaStyle: "matched", cortinaCultures: ["global"], cortinaTrend: "mixed", cortinaLengthSec: 45,
  closeWithCumparsita: true, orchestraRepeatGap: 6, singerRepeatGap: 4, avoidTitleRepeats: true, maxYearSpread: 4, mixVocalInstrumental: false,
  floorMood: "balanced", locale: "en",
};

export interface ComposeDeps { catalog: Catalog; cortinas?: Cortina[] }

export function compose(partial: Partial<ComposeOptions>, deps: ComposeDeps): Playlist {
  const o: ComposeOptions = { ...DEFAULT_OPTIONS, ...partial };
  const seed = o.seed ?? Math.floor(Math.random() * 1e9); o.seed = seed;
  const rng = makeRng(seed);
  const slots = planSlots(o);
  const byRhythm: Record<DanceRhythm, ReturnType<typeof families>> = { tango: [], vals: [], milonga: [] };
  for (const r of ["tango", "vals", "milonga"] as DanceRhythm[]) {
    const pool = deps.catalog.filter({ eras: o.eras, rhythms: [r], includeOrchestras: o.includeOrchestras, excludeOrchestras: [...(o.excludeOrchestras ?? []), "guitarras-solo-singer", "orquesta-unspecified"], onlySelection: o.onlySelection, requireSpotify: o.requireSpotify, minTier: o.eras.includes("all") ? 3 : 2 })
      .filter((s) => normTitle(s.title) !== "la cumparsita" || !o.closeWithCumparsita);
    byRhythm[r] = families(pool, o.maxYearSpread, o.mixVocalInstrumental);
  }
  const ctx: BuildContext = { recentOrchestras: [], recentSingers: [], usedTitles: new Set(), usedSongIds: new Set() };
  const tandas: Tanda[] = [];
  const pe = (id: string) => deps.catalog.profile(id)?.energy ?? 50;
  const pp = (id: string) => deps.catalog.profile(id)?.phase;
  const tier = (id: string) => deps.catalog.profile(id)?.tier ?? 3;
  const nb = (id: string) => deps.catalog.profile(id)?.notBefore ?? 0;
  for (const slot of slots) {
    let tanda = buildTanda(slot, byRhythm[slot.rhythm], o, rng, ctx, pe, pp, tier, nb);
    if (!tanda && slot.rhythm !== "tango") tanda = buildTanda({ ...slot, rhythm: "tango", size: o.tangoTandaSize }, byRhythm.tango, o, rng, ctx, pe, pp, tier, nb);
    if (!tanda) continue;
    tandas.push(tanda);
    ctx.recentOrchestras.unshift(tanda.orchestraId); if (tanda.singer) ctx.recentSingers.unshift(tanda.singer);
    for (const s of tanda.songs) { ctx.usedSongIds.add(s.id); ctx.usedTitles.add(normTitle(s.title)); }
  }
  // cortinas: matched to the NEXT tanda's energy
  const pool = cortinaPool(deps.cortinas);
  const used = new Set<string>();
  const constant = o.cortinaStyle === "constant" ? pickCortina(pool, tandas[1]?.energy ?? 60, { ...o, cortinaStyle: "matched" }, rng, used) : null;
  tandas.forEach((t, i) => {
    const next = tandas[i + 1]; if (!next) { t.cortina = null; return; }
    t.cortina = pickCortina(pool, next.energy, o, rng, used, constant);
    if (t.cortina) { used.add(t.cortina.id); t.cortina = { ...t.cortina, lengthSec: o.cortinaLengthSec }; }
  });
  // La Cumparsita
  let closing: Song | null = null;
  if (o.closeWithCumparsita) {
    const cands = deps.catalog.songs.filter((s) => normTitle(s.title) === "la cumparsita" && s.rhythm === "tango" && (o.eras.includes("all") || s.era.startsWith("golden") || s.era === "post-golden"));
    const pref = ["juan-d-arienzo", "osvaldo-pugliese", "carlos-di-sarli", "anibal-troilo", "francisco-canaro"];
    const lastOrch = tandas[tandas.length - 1]?.orchestraId;
    closing = cands.sort((a, b) => (pref.indexOf(a.orchestraId) === -1 ? 9 : pref.indexOf(a.orchestraId)) - (pref.indexOf(b.orchestraId) === -1 ? 9 : pref.indexOf(b.orchestraId)) || (b.selection ? 1 : 0) - (a.selection ? 1 : 0)).find((s) => s.orchestraId !== lastOrch) ?? cands[0] ?? null;
  }
  const stats = computeStats(tandas, closing, o);
  const id = `tdj-${seed.toString(36)}`;
  const name = o.name ?? `${o.hours}h ${o.eras.join("+")} milonga`;
  const playlist: Playlist = { id, name, createdAt: new Date().toISOString(), options: o, tandas, closing, stats, score: { total: 0, factors: [], verdict: "" } };
  playlist.score = scorePlaylist(playlist);
  return playlist;
}

export function computeStats(tandas: Tanda[], closing: Song | null, o: ComposeOptions): PlaylistStats {
  const byRhythm: Record<DanceRhythm, number> = { tango: 0, vals: 0, milonga: 0 };
  const orchestras: Record<string, number> = {};
  let dur = 0, tracks = 0, vocal = 0;
  for (const t of tandas) { byRhythm[t.rhythm]++; orchestras[t.orchestra] = (orchestras[t.orchestra] ?? 0) + 1; dur += t.durationSec + (t.cortina ? (t.cortina.lengthSec ?? o.cortinaLengthSec) : 0); tracks += t.songs.length; if (t.vocal) vocal++; }
  if (closing) { dur += closing.durationSec ?? 180; tracks++; }
  const energyArc = tandas.map((t) => t.energy); const targetArc = tandas.map((t) => t.targetEnergy);
  const rmse = Math.sqrt(tandas.reduce((a, t) => a + (t.energy - t.targetEnergy) ** 2, 0) / Math.max(1, tandas.length));
  return { tandas: tandas.length, tracks, durationSec: dur, byRhythm, orchestras, vocalRatio: tandas.length ? vocal / tandas.length : 0, energyArc, targetArc, arcFit: Math.max(0, 1 - rmse / 30) };
}

/** Re-roll one tanda (keeps everything else), used by the UI's "swap tanda". */
export function swapTanda(p: Playlist, index: number, deps: ComposeDeps, seed = Date.now()): Playlist {
  const o = p.options; const rng = makeRng(seed);
  const t = p.tandas[index]; if (!t) return p;
  const pool = deps.catalog.filter({ eras: o.eras, rhythms: [t.rhythm], includeOrchestras: o.includeOrchestras, excludeOrchestras: o.excludeOrchestras, onlySelection: o.onlySelection, requireSpotify: o.requireSpotify, minTier: 2 });
  const ctx: BuildContext = { recentOrchestras: p.tandas.filter((_, i) => i !== index).slice(Math.max(0, index - 6), index + 6).map((x) => x.orchestraId), recentSingers: [], usedTitles: new Set(p.tandas.flatMap((x, i) => (i === index ? [] : x.songs.map((s) => normTitle(s.title))))), usedSongIds: new Set(p.tandas.flatMap((x, i) => (i === index ? [] : x.songs.map((s) => s.id)))) };
  const slot = { index, rhythm: t.rhythm, size: t.songs.length, targetEnergy: t.targetEnergy, phase: t.phase, position: index / Math.max(1, p.tandas.length - 1) };
  const nt = buildTanda(slot, families(pool, o.maxYearSpread, o.mixVocalInstrumental).filter((c) => c.orchestraId !== t.orchestraId), o, rng, ctx, (id) => deps.catalog.profile(id)?.energy ?? 50, (id) => deps.catalog.profile(id)?.phase, (id) => deps.catalog.profile(id)?.tier ?? 3);
  if (!nt) return p;
  nt.cortina = t.cortina;
  const tandas = p.tandas.map((x, i) => (i === index ? nt : x));
  const np = { ...p, tandas, stats: computeStats(tandas, p.closing, o) };
  np.score = scorePlaylist(np);
  return np;
}
