import type { Playlist, ScoreCard, ScoreFactor, Tanda } from "./types";
import { normTitle } from "./energy";

/**
 * Benchmark scorer: "how close is this to the best milonga sets in the world".
 * Metadata-computable part of the rubric (C1–C14) rescaled to 100. Human-ear criteria are reported as "unscored".
 */
export function scorePlaylist(p: Pick<Playlist, "tandas" | "closing" | "options" | "stats">): ScoreCard {
  const t = p.tandas; const n = t.length || 1;
  const f: ScoreFactor[] = [];
  const add = (key: string, label: string, weight: number, score: number, detail: string) => f.push({ key, label, weight, score: Math.max(0, Math.min(1, score)), detail });

  // C1 tanda integrity
  let bad = 0; for (const x of t) { const o = new Set(x.songs.map((s) => s.orchestraId)); const r = new Set(x.songs.map((s) => s.rhythm)); const v = new Set(x.songs.map((s) => s.vocal)); if (o.size > 1 || r.size > 1 || (v.size > 1 && !p.options.mixVocalInstrumental)) bad++; }
  add("integrity", "Tanda integrity (one orchestra, one rhythm, vocal/instr not mixed)", 12, 1 - (bad * 3) / 12, `${bad} violating tandas`);
  // C2 singer consistency
  let ms = 0; for (const x of t) { const s = new Set(x.songs.filter((y) => y.vocal).map((y) => y.singerId)); if (s.size > 1) ms++; }
  add("singer", "Singer consistency (≤1 singer per tanda)", 6, 1 - (ms * 2) / 6, `${ms} tandas with several singers`);
  // C3 era tightness
  let over = 0, big = 0; for (const x of t) { if (!x.yearRange) continue; const span = x.yearRange[1] - x.yearRange[0]; if (span > 10) big++; else if (span > (x.songs.length >= 4 ? 4 : 6)) over++; }
  add("era", "Era tightness inside tanda (≤4–6 years)", 8, 1 - (over * 2 + big * 4) / 8, `${over} loose, ${big} very loose`);
  // C4 sizes
  let odd = 0; for (const x of t) { const s = x.songs.length; if (x.rhythm === "tango" ? s !== 4 : x.rhythm === "vals" ? s < 3 || s > 4 : s !== 3) odd++; }
  add("sizes", "Tanda sizes (tango 4, vals 3–4, milonga 3)", 5, 1 - (odd * 2) / 5, `${odd} non-standard`);
  // C5 rhythm cycle
  let dev = 0; for (let i = 1; i < t.length; i++) { const a = t[i - 1]!.rhythm, b = t[i]!.rhythm; if (a !== "tango" && b !== "tango") dev++; }
  for (let i = 0; i < t.length; i++) if (t[i]!.rhythm === "milonga") for (let j = i + 1; j < Math.min(t.length, i + 4); j++) if (t[j]!.rhythm === "milonga") dev++;
  if (t[0] && t[0].rhythm !== "tango") dev++;
  add("cycle", "Rhythm cycle (V/M never adjacent, spaced)", 8, 1 - (dev * 2) / 8, `${dev} deviations`);
  // C6 spacing
  let sp = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < Math.min(t.length, i + 6); j++) if (t[i]!.orchestraId === t[j]!.orchestraId) sp++;
  add("spacing", "Orchestra spacing (no repeat within 6 tandas)", 8, 1 - (sp * 2) / 8, `${sp} close repeats`);
  // C7 variety
  const distinct = new Set(t.map((x) => x.orchestraId)).size; const want = Math.max(5, Math.round(p.options.hours * 3.5));
  add("variety", "Orchestra variety per hour", 6, distinct / want, `${distinct} orchestras for ${p.options.hours} h (target ≥${want})`);
  // C8 title repeats
  const titles = new Map<string, number>(); for (const x of t) for (const s of x.songs) titles.set(normTitle(s.title), (titles.get(normTitle(s.title)) ?? 0) + 1);
  const rep = [...titles.values()].filter((c) => c > 1).length;
  add("titles", "No title repeats", 3, 1 - rep / 3, `${rep} repeated titles`);
  // C9 tempo coherence (only when bpm known)
  let bpmOver = 0, bpmKnown = 0; for (const x of t) { const b = x.songs.map((s) => s.bpm).filter((v): v is number => !!v); if (b.length === x.songs.length) { bpmKnown++; const r = (Math.max(...b) - Math.min(...b)) / Math.min(...b); if (r > 0.1) bpmOver += 2; else if (r > 0.06) bpmOver++; } }
  add("tempo", "Tempo coherence inside tanda (BPM drift ≤6%)", 5, bpmKnown ? 1 - bpmOver / 5 : 0.7, bpmKnown ? `${bpmKnown} tandas with BPM data` : "no BPM data — estimated");
  // C10 energy arc fit
  const rmse = Math.sqrt(t.reduce((a, x) => a + (x.energy - x.targetEnergy) ** 2, 0) / n);
  let early = 0; t.forEach((x, i) => { if (i / n < 0.5 && (x.orchestraId === "osvaldo-pugliese")) early++; });
  add("arc", "Energy arc fit (gradual rise/fall, Pugliese after midpoint)", 10, Math.max(0, 1 - rmse / 25) - early * 0.2, `RMSE ${rmse.toFixed(1)}; ${early} early Pugliese tandas`);
  // C11 cortina discipline
  let cbad = 0; t.forEach((x, i) => { const last = i === t.length - 1; if (p.options.cortinaStyle !== "none" && !last && !x.cortina) cbad++; if (x.cortina && (x.cortina.lengthSec ?? 45) > 90) cbad++; });
  add("cortina", "Cortina discipline (present, 25–60 s, matched)", 5, 1 - cbad / 5, `${cbad} issues`);
  // C12 source quality — proxy: curator selection + Spotify match availability
  const all = t.flatMap((x) => x.songs); const sel = all.filter((s) => s.selection).length; const sp2 = all.filter((s) => s.spotify).length;
  add("source", "Source/transfer quality (proxy: curator selection, resolvable streams)", 8, 0.5 + 0.3 * (sel / Math.max(1, all.length)) + 0.2 * (sp2 / Math.max(1, all.length)), `${sel}/${all.length} curator-selected, ${sp2} resolvable on Spotify`);
  // C13 ending
  const lastT = t[t.length - 1]; const endOk = (lastT ? (lastT.vocal ? 1 : 0.6) * (lastT.energy >= 60 ? 1 : 0.7) : 0) * 0.5 + (p.closing ? 0.5 : p.options.closeWithCumparsita ? 0 : 0.5);
  add("ending", "Ending (strong última tanda + La Cumparsita)", 4, endOk, p.closing ? `closes with ${p.closing.orchestra}` : "no Cumparsita");
  // C14 duration fit
  const diff = Math.abs(p.stats.durationSec - p.options.hours * 3600) / 60;
  add("duration", "Duration fit (±4 min of target)", 3, diff <= 4 ? 1 : Math.max(0, 1 - (diff - 4) / 20), `${diff.toFixed(1)} min off target`);

  const W = f.reduce((a, x) => a + x.weight, 0);
  const total = Math.round((f.reduce((a, x) => a + x.weight * x.score, 0) / W) * 100);
  const verdict = total >= 85 ? "Headline marathon DJ" : total >= 70 ? "Solid regular milonga DJ" : total >= 55 ? "Enthusiastic amateur" : "Spotify radio";
  return { total, factors: f, verdict };
}
