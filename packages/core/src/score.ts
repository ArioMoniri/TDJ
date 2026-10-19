import { familyOf } from "./cortinas";
import { normTitle } from "./energy";
import type { Playlist, ScoreCard, ScoreFactor } from "./types";

/**
 * Benchmark scorer, calibrated against the DJ review so a generator-pleasing set does not auto-grade as a headline DJ:
 * unknown data (BPM, transfer tier) scores low, orchestra spacing uses an 8-tanda window, últimas must be vocal tango,
 * cortina families are checked, and the variety target is ~4.5 orchestras per hour.
 */
export function scorePlaylist(p: Pick<Playlist, "tandas" | "closing" | "options" | "stats">): ScoreCard {
  const t = p.tandas;
  const n = t.length || 1;
  const f: ScoreFactor[] = [];
  if (!t.length)
    return { total: 0, factors: [], verdict: "Empty set (no tandas could be built for these options)" };
  const add = (key: string, label: string, weight: number, score: number, detail: string) =>
    f.push({ key, label, weight, score: Math.max(0, Math.min(1, score)), detail });

  let bad = 0;
  for (const x of t) {
    const o = new Set(x.songs.map((s) => s.orchestraId));
    const r = new Set(x.songs.map((s) => s.rhythm));
    const v = new Set(x.songs.map((s) => s.vocal));
    if (o.size > 1 || r.size > 1 || (v.size > 1 && !p.options.mixVocalInstrumental)) bad++;
  }
  add(
    "integrity",
    "Tanda integrity (one orchestra, one rhythm, vocal/instr not mixed)",
    12,
    1 - (bad * 3) / 12,
    `${bad} violating tandas`,
  );
  let ms = 0;
  for (const x of t) {
    const s = new Set(x.songs.filter((y) => y.vocal).map((y) => y.singerId));
    if (s.size > 1) ms++;
  }
  add(
    "singer",
    "Singer consistency (≤1 singer per tanda)",
    6,
    1 - (ms * 2) / 6,
    `${ms} tandas with several singers`,
  );
  let over = 0,
    big = 0;
  for (const x of t) {
    if (!x.yearRange) continue;
    const span = x.yearRange[1] - x.yearRange[0];
    if (span > 10) big++;
    else if (span > (x.songs.length >= 4 ? 4 : 6)) over++;
  }
  add(
    "era",
    "Era tightness inside tanda (≤4–6 years)",
    8,
    1 - (over * 2 + big * 4) / 8,
    `${over} loose, ${big} very loose`,
  );
  let odd = 0;
  for (const x of t) {
    const s = x.songs.length;
    if (x.rhythm === "tango" ? s !== 4 : x.rhythm === "vals" ? s < 3 || s > 4 : s !== 3) odd++;
  }
  add("sizes", "Tanda sizes (tango 4, vals 3–4, milonga 3)", 5, 1 - (odd * 2) / 5, `${odd} non-standard`);
  let dev = 0;
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1]!.rhythm,
      b = t[i]!.rhythm;
    if (a !== "tango" && b !== "tango") dev++;
  }
  for (let i = 0; i < t.length; i++)
    if (t[i]!.rhythm === "milonga")
      for (let j = i + 1; j < Math.min(t.length, i + 4); j++) if (t[j]!.rhythm === "milonga") dev++;
  if (t[0] && t[0].rhythm !== "tango") dev++;
  add("cycle", "Rhythm cycle (V/M never adjacent, spaced)", 8, 1 - (dev * 2) / 8, `${dev} deviations`);
  let sp = 0;
  for (let i = 0; i < t.length; i++)
    for (let j = i + 1; j < Math.min(t.length, i + 8); j++) if (t[i]!.orchestraId === t[j]!.orchestraId) sp++;
  add("spacing", "Orchestra spacing (no repeat within 8 tandas)", 8, 1 - (sp * 2) / 8, `${sp} close repeats`);
  const distinct = new Set(t.map((x) => x.orchestraId)).size;
  const want = Math.max(6, Math.round(p.options.hours * 4.5));
  add(
    "variety",
    "Orchestra variety per hour",
    6,
    distinct / want,
    `${distinct} orchestras for ${p.options.hours} h (target ≥${want})`,
  );
  const titles = new Map<string, number>();
  for (const x of t)
    for (const s of x.songs) titles.set(normTitle(s.title), (titles.get(normTitle(s.title)) ?? 0) + 1);
  const rep = [...titles.values()].filter((c) => c > 1).length;
  add("titles", "No title repeats", 3, 1 - rep / 3, `${rep} repeated titles`);
  let bpmOver = 0,
    bpmKnown = 0;
  for (const x of t) {
    const b = x.songs.map((s) => s.bpm ?? s.audio?.bpm).filter((v): v is number => !!v);
    if (b.length === x.songs.length) {
      bpmKnown++;
      const r = (Math.max(...b) - Math.min(...b)) / Math.min(...b);
      if (r > 0.1) bpmOver += 2;
      else if (r > 0.06) bpmOver++;
    }
  }
  add(
    "tempo",
    "Tempo coherence inside tanda (BPM drift ≤6%)",
    5,
    bpmKnown ? 1 - bpmOver / 5 : 0.35,
    bpmKnown ? `${bpmKnown} tandas with BPM data` : "no BPM data (unscored → 35%)",
  );
  const coh = t.map((x) => x.cohesion).filter((v): v is number => v !== undefined);
  add(
    "cohesion",
    "Analysed-audio cohesion inside tandas (tempo, key, loudness)",
    4,
    coh.length ? Math.min(1, coh.reduce((a, b) => a + b, 0) / coh.length / 85) : 0.5,
    coh.length
      ? `${coh.length} tandas analysed, mean ${Math.round(coh.reduce((a, b) => a + b, 0) / coh.length)}`
      : "no audio features (unscored → 50%)",
  );
  const rmse = Math.sqrt(t.reduce((a, x) => a + (x.energy - x.targetEnergy) ** 2, 0) / n);
  let early = 0;
  t.forEach((x, i) => {
    if (i / n < 0.5 && x.orchestraId === "osvaldo-pugliese") early++;
  });
  const famous =
    t.flatMap((x) => x.songs).filter((s) => (s.fame ?? 0) > 0).length /
    Math.max(
      1,
      t.reduce((a, x) => a + x.songs.length, 0),
    );
  add(
    "arc",
    "Energy arc fit (gradual rise/fall, Pugliese after midpoint)",
    10,
    Math.max(0, 1 - rmse / 22) - early * 0.25,
    `RMSE ${rmse.toFixed(1)}; ${early} early Pugliese`,
  );
  add(
    "fame",
    "Floor-known recordings (reference corpus)",
    6,
    p.tandas.some((x) => x.songs.some((s) => s.fame !== undefined)) ? 0.3 + famous * 0.7 : 0.3,
    `${Math.round(famous * 100)}% of tracks appear in reference sets`,
  );
  let cbad = 0;
  const fams = new Map<string, number>();
  t.forEach((x, i) => {
    const last = i === t.length - 1;
    if (p.options.cortinaStyle !== "none" && !last && !x.cortina) cbad++;
    if (x.cortina) {
      const l = x.cortina.lengthSec ?? 45;
      if (l > 60 || l < 25) cbad++;
      fams.set(familyOf(x.cortina), (fams.get(familyOf(x.cortina)) ?? 0) + 1);
    }
  });
  const famCount = fams.size;
  if (famCount > 3) cbad += famCount - 3;
  add(
    "cortina",
    "Cortina discipline (present, 25–60 s, one family)",
    5,
    1 - cbad / 6,
    `${cbad} issues · ${famCount} families`,
  );
  const all = t.flatMap((x) => x.songs);
  const sel = all.filter((s) => s.selection).length;
  const sp2 = all.filter((s) => s.spotify).length;
  add(
    "source",
    "Source/transfer quality (curator selection, resolvable streams)",
    8,
    0.25 + 0.4 * (sel / Math.max(1, all.length)) + 0.35 * (sp2 / Math.max(1, all.length)),
    `${sel}/${all.length} curator-selected, ${sp2} resolvable on Spotify`,
  );
  const lastT = t[t.length - 1];
  const ultOk = lastT
    ? (lastT.rhythm === "tango" ? 1 : 0) * (lastT.vocal ? 1 : 0.5) * (lastT.energy >= 60 ? 1 : 0.6)
    : 0;
  add(
    "ending",
    "Ending (vocal tango última ≥60 + La Cumparsita)",
    4,
    ultOk * 0.6 + (p.closing ? 0.4 : p.options.closeWithCumparsita ? 0 : 0.4),
    p.closing
      ? `última ${lastT?.orchestra ?? "?"}, closes with ${p.closing.orchestra} ${p.closing.year ?? ""}`
      : "no Cumparsita",
  );
  const diff = Math.abs(p.stats.durationSec - p.options.hours * 3600) / 60;
  add(
    "duration",
    "Duration fit (±4 min of target)",
    3,
    diff <= 4 ? 1 : Math.max(0, 1 - (diff - 4) / 20),
    `${diff.toFixed(1)} min off target`,
  );

  const W = f.reduce((a, x) => a + x.weight, 0);
  const total = Math.round((f.reduce((a, x) => a + x.weight * x.score, 0) / W) * 100);
  const verdict =
    total >= 85
      ? "Headline marathon DJ"
      : total >= 70
        ? "Solid regular milonga DJ"
        : total >= 55
          ? "Enthusiastic amateur"
          : "Spotify radio";
  return { total, factors: f, verdict };
}
