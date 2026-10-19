import { resolveContext } from "./context";
import { familyOf } from "./cortinas";
import { normTitle } from "./energy";
import { CUMPARSITA_CLOSING_YEARS, ULTIMA_CLOSERS } from "./rules";
import type { Playlist, ScoreCard, ScoreFactor, Song } from "./types";

/**
 * Benchmark scorer. Round 4 rebuilt it around what the DJ panel measured by ear (docs/reviews/round4-generation.md
 * §1.16): D'Arienzo timing and count, última strength and closer pool, Cumparsita year, placeholder years, corpus
 * role order, energy steps, cortina discipline/energy/era fit, context compliance, obscure-singer share. Factors
 * that cannot be measured for a set (no BPM data, no source data, no context) carry weight 0 so the total is
 * neither inflated nor deflated by missing data. `cohesion` (analysed audio) is unchanged.
 */
export function scorePlaylist(p: Pick<Playlist, "tandas" | "closing" | "options" | "stats">): ScoreCard {
  const t = p.tandas;
  const n = t.length || 1;
  const o = p.options;
  const f: ScoreFactor[] = [];
  if (!t.length)
    return { total: 0, factors: [], verdict: "Empty set (no tandas could be built for these options)" };
  const add = (key: string, label: string, weight: number, score: number, detail: string) =>
    f.push({ key, label, weight, score: Math.max(0, Math.min(1, score)), detail });
  const posOf = (i: number) => i / Math.max(1, t.length - 1);

  // --- hygiene (one orchestra / rhythm / singer per tanda, sizes, cycle, titles)
  let bad = 0;
  for (const x of t) {
    const orch = new Set(x.songs.map((s) => s.orchestraId));
    const r = new Set(x.songs.map((s) => s.rhythm));
    const v = new Set(x.songs.map((s) => s.vocal));
    if (orch.size > 1 || r.size > 1 || (v.size > 1 && !o.mixVocalInstrumental)) bad++;
  }
  add(
    "integrity",
    "Tanda integrity (one orchestra, one rhythm, vocal/instr not mixed)",
    10,
    1 - (bad * 3) / 10,
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
    5,
    1 - (ms * 2) / 5,
    `${ms} tandas with several singers`,
  );
  let over = 0,
    big = 0;
  for (const x of t) {
    if (!x.yearRange) continue;
    const span = x.yearRange[1] - x.yearRange[0];
    if (span > 10) big++;
    else if (span > Math.max(o.maxYearSpread, x.songs.length >= 4 ? 4 : 6)) over++;
  }
  add(
    "era",
    "Era tightness inside tanda (≤4–6 years)",
    6,
    1 - (over * 2 + big * 4) / 6,
    `${over} loose, ${big} very loose`,
  );
  // the requested sizes are the standard (a práctica's 3-track tangos are not a defect); the two-Cumparsita última is exempt
  const want = (r: string) =>
    r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;
  let odd = 0;
  t.forEach((x, i) => {
    const extra = i === t.length - 1 && o.rules?.cumparsitaCount === 2 ? 1 : 0;
    if (x.songs.length !== want(x.rhythm) && x.songs.length !== want(x.rhythm) + extra) odd++;
  });
  add(
    "sizes",
    `Tanda sizes (tango ${o.tangoTandaSize}, vals ${o.valsTandaSize}, milonga ${o.milongaTandaSize})`,
    4,
    1 - (odd * 2) / 4,
    `${odd} non-standard`,
  );
  let dev = 0;
  for (let i = 1; i < t.length; i++) if (t[i - 1]!.rhythm !== "tango" && t[i]!.rhythm !== "tango") dev++;
  for (let i = 0; i < t.length; i++)
    if (t[i]!.rhythm === "milonga")
      for (let j = i + 1; j < Math.min(t.length, i + 4); j++) if (t[j]!.rhythm === "milonga") dev++;
  if (t[0] && t[0].rhythm !== "tango") dev++;
  add("cycle", "Rhythm cycle (V/M never adjacent, spaced)", 6, 1 - (dev * 2) / 6, `${dev} deviations`);
  const gap = Math.max(1, o.orchestraRepeatGap || 6);
  let sp = 0;
  for (let i = 0; i < t.length; i++)
    for (let j = i + 1; j < Math.min(t.length, i + gap); j++)
      if (t[i]!.orchestraId === t[j]!.orchestraId) sp++;
  add(
    "spacing",
    `Orchestra spacing (no repeat within ${gap} tandas)`,
    6,
    1 - (sp * 2) / 6,
    `${sp} repeats within ${gap}`,
  );
  const distinct = new Set(t.map((x) => x.orchestraId)).size;
  const wantDistinct = Math.max(6, Math.round(o.hours * 3.75)); // corpus: ~15 orchestras per 4 h
  add(
    "variety",
    "Orchestra variety per hour",
    5,
    distinct / wantDistinct,
    `${distinct} orchestras for ${o.hours} h (target ≥${wantDistinct})`,
  );
  const titles = new Map<string, number>();
  for (const x of t)
    for (const s of x.songs) titles.set(normTitle(s.title), (titles.get(normTitle(s.title)) ?? 0) + 1);
  const rep = [...titles.values()].filter((c) => c > 1).length;
  add("titles", "No title repeats", 2, 1 - rep / 2, `${rep} repeated titles`);

  // --- measured audio (unscored → weight 0; cohesion unchanged)
  // BPM: explicit metadata, or analysed audio with a clear pulse, folded into the rhythm's octave (beat trackers halve/double)
  const RANGE: Record<string, [number, number]> = { tango: [96, 150], vals: [150, 215], milonga: [88, 135] };
  const bpmOf = (s: Song, rhythm: string): number | null => {
    let b = s.bpm ?? s.audio?.bpm ?? null;
    if (!b) return null;
    const [lo, hi] = RANGE[rhythm] ?? [60, 240];
    for (let i = 0; i < 3 && b < lo; i++) b *= 2;
    for (let i = 0; i < 3 && b >= hi; i++) b /= 2;
    return b >= lo && b < hi ? b : null; // still outside the rhythm's range after folding: a tracker failure, not a tempo
  };
  // graded per tanda: ≤6 % drift is full marks, 16 % is zero
  let bpmScore = 0,
    bpmKnown = 0;
  for (const x of t) {
    const b = x.songs.map((s) => bpmOf(s, x.rhythm)).filter((v): v is number => !!v);
    if (b.length === x.songs.length) {
      bpmKnown++;
      const r = (Math.max(...b) - Math.min(...b)) / Math.min(...b);
      bpmScore += Math.max(0, Math.min(1, 1 - (r - 0.06) / 0.1));
    }
  }
  add(
    "tempo",
    "Tempo coherence inside tanda (BPM drift ≤6%)",
    bpmKnown ? 4 : 0,
    bpmKnown ? bpmScore / bpmKnown : 0.35,
    bpmKnown ? `${bpmKnown} tandas with BPM data` : "no BPM data (unscored, excluded)",
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

  // --- arc, fame
  const rmse = Math.sqrt(t.reduce((a, x) => a + (x.energy - x.targetEnergy) ** 2, 0) / n);
  let early = 0;
  t.forEach((x, i) => {
    if (posOf(i) < 0.5 && x.orchestraId === "osvaldo-pugliese") early++;
  });
  add(
    "arc",
    "Energy arc fit (gradual rise/fall, Pugliese after midpoint)",
    8,
    Math.max(0, 1 - rmse / 22) - early * 0.25,
    `RMSE ${rmse.toFixed(1)}; ${early} early Pugliese`,
  );
  const allSongs = t.flatMap((x) => x.songs);
  const famous = allSongs.filter((s) => (s.fame ?? 0) > 0).length / Math.max(1, allSongs.length);
  add(
    "fame",
    "Floor-known recordings (reference corpus)",
    5,
    allSongs.some((s) => s.fame !== undefined) ? 0.3 + famous * 0.7 : 0.3,
    `${Math.round(famous * 100)}% of tracks appear in reference sets`,
  );

  // --- round-4 measurements
  const da = t
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.orchestraId === "juan-d-arienzo" && x.rhythm === "tango");
  const first = da[0];
  const per4h = (da.length * 4) / Math.max(1, o.hours);
  const firstInstr =
    !!first &&
    !first.x.vocal &&
    !!first.x.yearRange &&
    first.x.yearRange[0] >= 1935 &&
    first.x.yearRange[1] <= 1939;
  const daScore = !first
    ? 0
    : (posOf(first.i) <= 0.35 ? 0.4 : posOf(first.i) <= 0.5 ? 0.2 : 0) +
      (firstInstr ? 0.3 : 0.1) +
      (per4h >= 1.8 && per4h <= 3.5 ? 0.3 : per4h > 0 ? 0.15 : 0);
  const eraOk = o.eras.some((e) => e === "golden" || e === "golden-extended" || e === "all");
  add(
    "darienzo",
    "D'Arienzo: first tango tanda ≤35 % and instrumental 1935–39, 2–3 per 4 h",
    eraOk ? 6 : 0,
    daScore,
    first
      ? `first at ${Math.round(posOf(first.i) * 100)} % (${firstInstr ? "instr. 1935–39" : (first.x.singer ?? "instr.")} ${first.x.yearRange?.join("–") ?? ""}), ${da.length} tango tandas`
      : "no D'Arienzo tango tanda",
  );
  const lastT = t[t.length - 1]!;
  const ultEnergy =
    lastT.energy >= lastT.targetEnergy - 4 ? 1 : lastT.energy >= lastT.targetEnergy - 10 ? 0.5 : 0.2;
  const ultPool = ULTIMA_CLOSERS.has(lastT.orchestraId) ? 1 : 0.4;
  add(
    "ultima",
    "Última: energy ≥ target−4, orchestra from the corpus closer pool",
    5,
    0.6 * ultEnergy + 0.4 * ultPool,
    `${lastT.orchestra}${lastT.singer ? `/${lastT.singer}` : " instr."} e${lastT.energy} for target ${lastT.targetEnergy}`,
  );
  if (o.closeWithCumparsita) {
    const c = p.closing;
    const years = c ? (CUMPARSITA_CLOSING_YEARS[c.orchestraId] ?? []) : [];
    const ok = !!c && !c.yearApprox && (years.length ? years.includes(c.year ?? 0) : !c.vocal);
    add(
      "cumparsita",
      "La Cumparsita is a closing version (corpus year, no placeholder)",
      3,
      c ? (ok ? 1 : 0.3) : 0,
      c ? `${c.orchestra} ${c.year ?? "undated"}${ok ? "" : " — not a closing version"}` : "no Cumparsita",
    );
  } else add("cumparsita", "La Cumparsita (not requested)", 0, 1, "closeWithCumparsita off");
  const approxTandas = t.filter((x) => x.songs.every((s) => s.yearApprox)).length;
  const approxTracks = allSongs.filter((s) => s.yearApprox).length / Math.max(1, allSongs.length);
  add(
    "placeholders",
    "Placeholder years (yearApprox rows) kept out of the night",
    3,
    1 - approxTandas * 0.5 - approxTracks,
    `${approxTandas} undated tandas, ${Math.round(approxTracks * 100)}% undated tracks`,
  );
  let roleT = 0,
    roleOk = 0;
  for (const x of t) {
    const hasRole = x.songs.some((s) => s.role === "opener" || s.role === "closer");
    if (!hasRole) continue;
    roleT++;
    const openerLast = x.songs.at(-1)!.role === "opener" && x.songs.some((s) => s.role !== "opener");
    const closerFirst = x.songs[0]!.role === "closer" && x.songs.some((s) => s.role !== "closer");
    if (!openerLast && !closerFirst) roleOk++;
  }
  add(
    "roles",
    "Corpus roles honoured (openers open, closers close)",
    roleT ? 4 : 0,
    roleT ? roleOk / roleT : 1,
    `${roleOk}/${roleT} tandas with corpus roles in order`,
  );
  // a jolt is a step the arc did not plan: |Δenergy − Δtarget| > 14 (the planned first D'Arienzo peak is not a jolt)
  let jolts = 0,
    maxStep = 0;
  for (let i = 1; i < t.length; i++) {
    const step = t[i]!.energy - t[i - 1]!.energy;
    const planned = t[i]!.targetEnergy - t[i - 1]!.targetEnergy;
    maxStep = Math.max(maxStep, Math.abs(step));
    if (Math.abs(step - planned) > 14) jolts++;
  }
  add(
    "steps",
    "Energy steps between tandas ≤14 beyond the planned arc",
    4,
    1 - jolts / Math.max(4, Math.round(n / 4)),
    `max step ${maxStep}, ${jolts} unplanned steps >14`,
  );
  // cortinas: present, length within ±5 s of the setting, one family (two for long nights), energy ≤20 off the next tanda, era fit
  let cbad = 0,
    cEnergy = 0,
    cEra = 0,
    cN = 0;
  const fams = new Map<string, number>();
  const guardia = o.eras.every((e) => e === "guardia-vieja");
  t.forEach((x, i) => {
    const lastOne = i === t.length - 1;
    if (o.cortinaStyle !== "none" && !lastOne && !x.cortina) cbad++;
    if (x.cortina) {
      cN++;
      const l = x.cortina.lengthSec ?? o.cortinaLengthSec;
      if (Math.abs(l - o.cortinaLengthSec) > 8) cbad++;
      fams.set(familyOf(x.cortina), (fams.get(familyOf(x.cortina)) ?? 0) + 1);
      const next = t[i + 1];
      if (next && Math.abs(x.cortina.energy - next.energy) > 20) cEnergy++;
      if (guardia && (x.cortina.year ?? 9999) > 1935) cEra++;
      if (!guardia && o.cortinaTrend !== "trend" && (x.cortina.year ?? 0) >= 2015) cEra++;
    }
  });
  const allowedFams = o.cortinaStyle === "matched" ? 99 : t.length > 12 ? 2 : 1;
  const famPenalty = Math.max(0, fams.size - allowedFams) * 0.25;
  const cScore =
    o.cortinaStyle === "none"
      ? 1
      : 1 - cbad / 6 - famPenalty - (cN ? (0.5 * cEnergy) / cN + (0.5 * cEra) / cN : 0);
  add(
    "cortina",
    "Cortina discipline (present, length as set ±8 s, one family, energy ≤20 off the next tanda, era fit)",
    6,
    cScore,
    `${cbad} issues · ${fams.size} families · ${cEnergy} energy mismatches · ${cEra} era mismatches`,
  );
  const sel = allSongs.filter((s) => s.selection).length;
  const sp2 = allSongs.filter((s) => s.spotify).length;
  const sourceKnown = sel > 0 || sp2 > 0;
  add(
    "source",
    "Source/transfer quality (curator selection, resolvable streams)",
    sourceKnown ? 5 : 0,
    0.25 + 0.4 * (sel / Math.max(1, allSongs.length)) + 0.35 * (sp2 / Math.max(1, allSongs.length)),
    sourceKnown
      ? `${sel}/${allSongs.length} curator-selected, ${sp2} resolvable on Spotify`
      : "no source data (unscored, excluded)",
  );
  // context compliance: milongas under heat, styles for beginners, vocal lean after midnight
  const ctx = o.context;
  const applied = ctx ? resolveContext(ctx) : null;
  if (ctx && applied?.applied.length) {
    let checks = 0,
      ok = 0;
    const heat = ctx.weather === "heat" || ctx.roomTemp === "hot";
    if (heat) {
      checks++;
      if (p.stats.byRhythm.milonga <= Math.ceil(t.length / 7)) ok++;
    }
    if (applied.avoidStyles.length) {
      checks++;
      if (!t.some((x) => x.style && applied.avoidStyles.includes(x.style))) ok++;
    }
    if (applied.preferStyles.length) {
      checks++;
      const share = t.filter((x) => x.style && applied.preferStyles.includes(x.style)).length / t.length;
      if (share >= 0.4) ok++;
    }
    if (applied.vocalRatioShift > 0) {
      checks++;
      if (p.stats.vocalRatio >= 0.6) ok++;
    }
    add(
      "context",
      "Context compliance (milongas under heat, styles for the floor, vocal lean)",
      checks ? 3 : 0,
      checks ? ok / checks : 1,
      `${ok}/${checks} checks`,
    );
  } else add("context", "Context compliance (no context set)", 0, 1, "no context");
  const obscure = t.filter(
    (x, i) => posOf(i) >= 0.2 && x.vocal && x.songs.every((s) => (s.fame ?? 0) === 0),
  ).length;
  add(
    "obscure",
    "Obscure vocal families kept out of prime slots (fame 0 after 20 %)",
    4,
    1 - obscure / Math.max(3, Math.round(n / 5)),
    `${obscure} fame-0 vocal tandas after 20 %`,
  );
  const ultOk =
    (lastT.rhythm === "tango" ? 1 : 0) *
    (lastT.vocal || ULTIMA_CLOSERS.has(lastT.orchestraId) ? 1 : 0.6) *
    (lastT.energy >= 60 ? 1 : 0.6);
  add(
    "ending",
    "Ending (tango última ≥60 + La Cumparsita)",
    3,
    ultOk * 0.6 + (p.closing ? 0.4 : o.closeWithCumparsita ? 0 : 0.4),
    p.closing
      ? `última ${lastT.orchestra}, closes with ${p.closing.orchestra} ${p.closing.year ?? ""}`
      : "no Cumparsita",
  );
  const diff = Math.abs(p.stats.durationSec - o.hours * 3600) / 60;
  add(
    "duration",
    "Duration fit (±4 min of target)",
    3,
    diff <= 4 ? 1 : Math.max(0, 1 - (diff - 4) / 20),
    `${diff.toFixed(1)} min off target`,
  );

  const W = f.reduce((a, x) => a + x.weight, 0) || 1;
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
