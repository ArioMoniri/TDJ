import BENCH from "../../../data/knowledge/benchmark.json";
import { attachBooth } from "./booth";
import { type ComposeDeps, computeStats, swapTanda } from "./compose";
import { cortinaTempo, familyOf } from "./cortinas";
import { isDanceableSong, normTitle } from "./energy";
import { DEFAULT_HEATMAP, goldenClassOf, isColour, isGoldenNight, staticProfile } from "./knowledge";
import { bestEdit, recue } from "./repair";
import { eraGrade, hardFailures, scorePlaylist } from "./score";
import { mustHavesOf, type StrictResult, strictChecks, strictSummary } from "./strict";
import { isTandaEligible, songRhythm } from "./tanda";
import { isBridge, nightTransitions } from "./transitions";
import type { Cortina, Playlist, Song, Tanda } from "./types";

/**
 * Round 12 — benchmark any composed night against the published DJ sets (docs/reviews/benchmark-reference-sets.md
 * "Common patterns", ranges in data/knowledge/benchmark.json), then improve it in place. See
 * docs/specs/round12-benchmark.md. Pure and deterministic: the same night always gives the same checks and changes.
 */

export type BenchStatus = "ok" | "near" | "off";
/** a fixer improveNight can run */
export type FixKey =
  | "instrumental"
  | "stream-suspect"
  | "cue-fit"
  | "roles"
  | "tighten"
  | "heatmap"
  | "bridge"
  | "core"
  | "energy"
  | "strict";
export interface BenchCheck {
  key: string;
  label: string;
  /** our value, in words ("3.1 per 4 h") */
  value: string;
  /** the reference range, in words ("3–4 on golden-only nights") */
  range: string;
  status: BenchStatus;
  weight: number;
  source: string;
  /** the fixer that can address it */
  fix?: FixKey;
  /** informational only (weight 0): never a failure */
  info?: boolean;
}
export interface BenchResult {
  /** 0..100: weighted share of checks in range (near counts half) */
  total: number;
  checks: BenchCheck[];
  /** scored checks in range (status ok) */
  inRange: number;
  /** scored checks (informational ones left out) */
  scored: number;
  /** round 14: every strict-panel rule, pass / fail with its violations and its source review */
  strict?: StrictResult;
}

type Night = Pick<Playlist, "tandas" | "closing" | "options"> & Partial<Pick<Playlist, "opening">>;

const K = BENCH.checks;
const DEFAULT_SIDE_SEC = 170;
const songSec = (s: Song) => s.durationSec ?? DEFAULT_SIDE_SEC;
const songsSec = (t: Pick<Tanda, "songs">) => t.songs.reduce((a, s) => a + songSec(s), 0);
const cortinaSec = (t: Tanda, fallback: number) => (t.cortina ? (t.cortina.lengthSec ?? fallback) : 0);
const pct = (x: number) => `${Math.round(x * 100)} %`;
const fmt = (x: number) => (Math.round(x * 10) / 10).toString();
const isPugliese = (t: Pick<Tanda, "orchestraId">) => t.orchestraId === "osvaldo-pugliese";
const goldenish = (n: Night) =>
  n.options.eras.some((e) => e === "golden" || e === "golden-extended" || e === "all");

/** the night's real length in hours: opening, every side, every cortina, the closing (not the tanda count) */
export function nightHours(n: Night): number {
  const fb = n.options.cortinaLengthSec ?? 45;
  const sec =
    (n.opening ? songSec(n.opening) : 0) +
    n.tandas.reduce((a, t) => a + songsSec(t) + cortinaSec(t, fb), 0) +
    (n.closing ? songSec(n.closing) : 0);
  return sec / 3600;
}

export interface HourShare {
  /** 0-based clock hour */
  hour: number;
  /** tanda indexes whose midpoint falls in this hour */
  tandas: number[];
  instrumental: number;
  share: number;
}
/**
 * Instrumental share per clock hour (Victor Tran: ≥ 1/3 of each hour's tandas). A tanda belongs to the hour its
 * midpoint falls in, on the real clock (sides + cortinas); a last hour with fewer than 3 tandas joins the one before.
 */
export function hourlyInstrumental(n: Night): HourShare[] {
  const fb = n.options.cortinaLengthSec ?? 45;
  let at = n.opening ? songSec(n.opening) : 0;
  const buckets: HourShare[] = [];
  n.tandas.forEach((t, i) => {
    const len = songsSec(t);
    const hour = Math.floor((at + len / 2) / 3600);
    at += len + cortinaSec(t, fb);
    let b = buckets.find((x) => x.hour === hour);
    if (!b) {
      b = { hour, tandas: [], instrumental: 0, share: 0 };
      buckets.push(b);
    }
    b.tandas.push(i);
    if (!t.vocal) b.instrumental++;
  });
  const last = buckets.at(-1);
  if (buckets.length > 1 && last && last.tandas.length < 3) {
    const prev = buckets[buckets.length - 2]!;
    prev.tandas.push(...last.tandas);
    prev.instrumental += last.instrumental;
    buckets.pop();
  }
  for (const b of buckets) b.share = b.tandas.length ? b.instrumental / b.tandas.length : 0;
  return buckets;
}

/** violations of "no orchestra or singer in more than one of any 3 consecutive tandas" */
function spacing3(n: Night): string[] {
  const out: string[] = [];
  const t = n.tandas;
  const w = K.spacing3.window;
  for (let i = 0; i < t.length; i++)
    for (let j = i + 1; j < Math.min(t.length, i + w); j++) {
      if (t[i]!.orchestraId === t[j]!.orchestraId) out.push(`${t[i]!.orchestra} at ${i + 1} and ${j + 1}`);
      const si = t[i]!.vocal ? normTitle(t[i]!.singer ?? "") : "";
      const sj = t[j]!.vocal ? normTitle(t[j]!.singer ?? "") : "";
      if (si && si === sj && t[i]!.orchestraId !== t[j]!.orchestraId)
        out.push(`${t[i]!.singer} at ${i + 1} and ${j + 1}`);
    }
  return out;
}

const RANGE_STR = (lo: number, hi: number, unit = "") => `${fmt(lo)}–${fmt(hi)}${unit}`;
const band = (v: number, lo: number, hi: number, near: number): BenchStatus =>
  v >= lo - 1e-9 && v <= hi + 1e-9 ? "ok" : v >= lo - near && v <= hi + near ? "near" : "off";

/** Benchmark a night against the published DJ sets. Pure and deterministic. */
export function benchmarkNight(p: Night): BenchResult {
  const t = p.tandas;
  const n = t.length;
  const o = p.options;
  const checks: BenchCheck[] = [];
  const add = (c: BenchCheck) => checks.push(c);
  const hours = Math.max(0.25, nightHours(p));
  const per4h = (x: number) => (x * 4) / hours;
  const golden = goldenish(p);
  const goldenOnly = o.eras.length > 0 && o.eras.every((e) => e === "golden");

  // 1. D'Arienzo tandas per 4 h (all rhythms)
  {
    const c = K.darienzo;
    const count = t.filter((x) => x.orchestraId === "juan-d-arienzo").length;
    const v = Math.round(per4h(count) * 10) / 10;
    const [lo, hi] = goldenOnly ? c.goldenOnly : c.all;
    add({
      key: "darienzo",
      label: c.label,
      value: `${count} (${fmt(v)} per 4 h)`,
      range: goldenOnly
        ? `${RANGE_STR(lo!, hi!)} on golden-only nights`
        : `${RANGE_STR(lo!, hi!)} across all sets`,
      status: band(v, lo!, hi!, c.near),
      weight: c.weight,
      source: c.source,
    });
  }
  // 2. distinct orchestras, scaled by hours
  {
    const c = K.orchestras;
    const distinct = new Set(t.map((x) => x.orchestraId)).size;
    const lo = Math.round((c.per4h[0]! * hours) / 4);
    const hi = Math.round((c.per4h[1]! * hours) / 4);
    add({
      key: "orchestras",
      label: c.label,
      value: `${distinct} in ${fmt(hours)} h`,
      range: `${lo}–${hi} for ${fmt(hours)} h (median ${c.median} per ~4 h)`,
      status: band(distinct, lo, hi, c.near),
      weight: c.weight,
      source: c.source,
    });
  }
  // 3. vals and milonga share of the dance tandas
  for (const r of ["vals", "milonga"] as const) {
    const c = K[r];
    const share = n ? t.filter((x) => x.rhythm === r).length / n : 0;
    add({
      key: r,
      label: c.label,
      value: pct(share),
      range: `${pct(c.range[0]!)}–${pct(c.range[1]!)} (median ${pct(c.median)})`,
      status: band(share, c.range[0]!, c.range[1]!, c.near),
      weight: c.weight,
      source: c.source,
    });
  }
  // 4. Pugliese: at most once per 4 h, in the second half (position = i / tandas, 1-based, as the reference counts)
  {
    const c = K.pugliese;
    const pug = t.map((x, i) => ({ x, i })).filter(({ x }) => isPugliese(x));
    const cap = Math.max(1, Math.round((c.maxPer4h * hours) / 4));
    const positions = pug.map(({ i }) => (i + 1) / Math.max(1, n));
    const minPos = positions.length ? Math.min(...positions) : 1;
    const status: BenchStatus =
      pug.length > cap || minPos < c.nearPosition ? "off" : minPos < c.minPosition ? "near" : "ok";
    add({
      key: "pugliese",
      label: c.label,
      value: pug.length
        ? `${pug.length} at ${positions.map((x) => x.toFixed(2)).join(", ")}`
        : "none (as in 4 of 11 sets)",
      range: `≤ ${cap}, at ≥ ${c.minPosition} of the night (median ${c.medianPosition})`,
      status,
      weight: c.weight,
      source: c.source,
    });
  }
  // 5. La Cumparsita closes
  {
    const c = K.cumparsita;
    const closes =
      p.closing?.title && /cumparsita/i.test(p.closing.title)
        ? true
        : !!t.at(-1)?.songs.at(-1)?.title && /cumparsita/i.test(t.at(-1)!.songs.at(-1)!.title);
    add({
      key: "cumparsita",
      label: c.label,
      value: closes
        ? `yes${p.closing ? ` (${p.closing.orchestra} ${p.closing.year ?? ""})`.trimEnd() : ""}`
        : "no",
      range: `closes ${pct(c.share)} of the sets`,
      status: closes ? "ok" : o.closeWithCumparsita ? "off" : "near",
      weight: c.weight,
      source: c.source,
    });
  }
  // 6. core canon present (golden nights; informational otherwise)
  {
    const c = K.canon;
    const have = new Set(t.map((x) => x.orchestraId));
    const missing = c.orchestras.map((id, i) => (have.has(id) ? null : c.names[i])).filter(Boolean);
    const present = c.orchestras.length - missing.length;
    add({
      key: "canon",
      label: c.label,
      value: missing.length ? `${present}/4 (no ${missing.join(", ")})` : "4/4",
      range: c.names.join(", "),
      status: !golden || missing.length === 0 ? "ok" : missing.length === 1 ? "near" : "off",
      weight: golden ? c.weight : 0,
      source: c.source,
      ...(golden ? {} : { info: true }),
    });
  }
  // 7. golden-era coverage
  {
    const c = K.golden;
    const [y0, y1] = c.years as [number, number];
    const inside = t.filter((x) => x.yearRange && x.yearRange[0] >= y0 && x.yearRange[1] <= y1).length;
    const share = n ? inside / n : 0;
    add({
      key: "golden",
      label: c.label,
      value: pct(share),
      range: `≥ ${pct(c.minShare)} of tandas`,
      status: !golden ? "ok" : share >= c.minShare ? "ok" : share >= c.nearShare ? "near" : "off",
      weight: golden ? c.weight : 0,
      source: c.source,
      ...(golden ? {} : { info: true }),
    });
  }
  // 8. round 14 (DJ review S6): an instrumental tango tanda every hour, no more than 3 vocal tango tandas in a row;
  // Victor Tran's one-third share is shown as information
  {
    const c = K.instrumental;
    const hs = hourlyInstrumental(p);
    const noInstr = hs.filter((h) => !h.tandas.some((i) => t[i]!.rhythm === "tango" && !t[i]!.vocal));
    let run = 0,
      maxRun = 0;
    for (const x of t)
      if (x.rhythm === "tango") {
        run = x.vocal ? run + 1 : 0;
        maxRun = Math.max(maxRun, run);
      }
    const bad = noInstr.length + Math.max(0, maxRun - c.maxVocalRun);
    add({
      key: "instrumental",
      label: c.label,
      value: `${noInstr.length ? `${noInstr.map((h) => `h${h.hour + 1}`).join(", ")} without one` : "every hour has one"} · longest vocal run ${maxRun} · share ${hs.map((h) => `h${h.hour + 1} ${pct(h.share)}`).join(" · ")}`,
      range: `≥ 1 instrumental tango tanda each hour, ≤ ${c.maxVocalRun} vocal tango tandas in a row (≥ 1/3 instrumental shown as information)`,
      status: bad === 0 ? "ok" : bad === 1 ? "near" : "off",
      weight: c.weight,
      source: c.source,
      fix: "instrumental",
    });
  }
  // 9. no orchestra or singer twice in any 3 consecutive tandas
  {
    const c = K.spacing3;
    const v = spacing3(p);
    add({
      key: "spacing3",
      label: c.label,
      value: v.length ? `${v.length}: ${v.slice(0, 2).join("; ")}` : "none",
      range: "none",
      status: v.length === 0 ? "ok" : v.length === 1 ? "near" : "off",
      weight: c.weight,
      source: c.source,
    });
  }
  // 10. the TTVTTM cycle
  {
    const c = K.cycle;
    const pat = c.pattern;
    const letter = (r: string) => (r === "vals" ? "V" : r === "milonga" ? "M" : "T");
    let dev = 0;
    t.forEach((x, i) => {
      if (letter(x.rhythm) !== pat[i % pat.length]) dev++;
    });
    add({
      key: "cycle",
      label: c.label,
      value: dev ? `${dev} tandas off the cycle` : "followed",
      range: pat,
      status: dev === 0 ? "ok" : dev <= 2 ? "near" : "off",
      weight: c.weight,
      source: c.source,
    });
  }
  // 11. vals and milonga tandas of 3
  {
    const c = K.sizes;
    const vm = t.filter((x) => x.rhythm !== "tango");
    const odd = vm.filter((x) => x.songs.length !== c.size).length;
    add({
      key: "sizes",
      label: c.label,
      value: odd ? `${odd} of ${vm.length} not 3` : `${vm.length} of ${vm.length}`,
      range: `${c.size} songs`,
      status: odd === 0 ? "ok" : odd <= 2 ? "near" : "off",
      weight: c.weight,
      source: c.source,
    });
  }
  // 12. cortina length
  {
    const c = K.cortinaLength;
    // round 15 (dancer N4, DJ N6): the DJ's own setting ± 5 s, never over 50 s unless the setting asks for more (the
    // corpus band 30–90 s let 60 s cues on a 45 s night read "ok")
    const set = o.cortinaLengthSec ?? 45;
    const lo = set - 5;
    const hi = Math.min(set + 5, Math.max(50, set));
    const lens = t.filter((x) => x.cortina).map((x) => x.cortina!.lengthSec ?? o.cortinaLengthSec);
    const out = lens.filter((l) => l < lo || l > hi).length;
    const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    const none = o.cortinaStyle === "none" || !lens.length;
    add({
      key: "cortinaLength",
      label: c.label,
      value: none
        ? "no cortinas"
        : `${Math.min(...lens)}–${Math.max(...lens)} s (mean ${Math.round(mean)} s)`,
      range: `${lo}–${hi} s`,
      status: none || out === 0 ? "ok" : mean >= lo && mean <= hi ? "near" : "off",
      weight: none ? 0 : c.weight,
      source: c.source,
      ...(none ? { info: true } : {}),
    });
  }
  // 13. cortina culture: informational (a Turkish night is the DJ's choice)
  {
    const c = K.cortinaCulture;
    const cues = t.filter((x) => x.cortina).map((x) => x.cortina!);
    const turkish = cues.filter((x) => x.culture === "turkish").length;
    const share = cues.length ? turkish / cues.length : 0;
    add({
      key: "cortinaCulture",
      label: c.label,
      value: cues.length ? (turkish ? `${pct(share)} Turkish` : "international") : "no cortinas",
      range: "international, Turkish as accents",
      status: "ok",
      weight: 0,
      source: `${c.source}. ${c.note}`,
      info: true,
    });
  }

  // --- round 13 (docs/specs/round13-engine.md) ---------------------------------------------------------------
  const dance = t.filter((x) => x.songs.some((s) => !/cumparsita/i.test(s.title)));
  // 14. tanda year spread (cohesion review §4.2)
  {
    const c = K.yearSpread;
    const spreads = dance
      .map((x) =>
        x.songs.filter((s) => s.year && !s.yearApprox && !/cumparsita/i.test(s.title)).map((s) => s.year!),
      )
      .filter((ys) => ys.length >= 2)
      .map((ys) => Math.max(...ys) - Math.min(...ys))
      .sort((a, b) => a - b);
    const med = spreads.length
      ? spreads.length % 2
        ? spreads[(spreads.length - 1) / 2]!
        : (spreads[spreads.length / 2 - 1]! + spreads[spreads.length / 2]!) / 2
      : 0;
    const le2 = spreads.length ? spreads.filter((x) => x <= 2).length / spreads.length : 1;
    const max = spreads.length ? spreads[spreads.length - 1]! : 0;
    const breaks = dance.filter((x) => eraGrade(x)?.crosses).length;
    add({
      key: "yearSpread",
      label: c.label,
      value: `median ${fmt(med)} y · ${pct(le2)} ≤ 2 y · max ${max} y${breaks ? ` · ${breaks} crossing a break` : ""}`,
      range: `median ≤ ${c.okMedian} y, ≥ ${pct(c.okShareLe2)} ≤ 2 y, none > ${c.max} y`,
      status:
        med <= c.okMedian && le2 >= c.okShareLe2 - 1e-9 && max <= c.max
          ? "ok"
          : med <= c.nearMedian && le2 >= c.nearShareLe2 - 1e-9
            ? "near"
            : "off",
      weight: c.weight,
      source: c.source,
      fix: "tighten",
    });
  }
  // 15. golden core share (golden-age review §5)
  {
    const c = K.goldenCore;
    const applies = isGoldenNight(o);
    const colour = dance.filter((x) => isColour(staticProfile(x.orchestraId)));
    const core = dance.filter((x) => {
      const p = staticProfile(x.orchestraId);
      if (isColour(p)) return false;
      const ys = x.songs
        .filter((s) => s.year && !s.yearApprox && !/cumparsita/i.test(s.title))
        .map((s) => s.year!);
      return goldenClassOf(p, ys) === "core";
    }).length;
    const share = dance.length ? core / dance.length : 1;
    const maxColour = Math.max(1, Math.round((c.maxColourPer4h * hours) / 4));
    const hot = colour.filter((x) => x.peak || x.phase === "peak" || x.targetEnergy >= c.peakEnergy).length;
    const sides = dance.flatMap((x) => x.songs).filter((s) => s.year && !/cumparsita/i.test(s.title));
    const sideCore = sides.length
      ? sides.filter((s) => s.year! >= c.sideCoreYears[0]! && s.year! <= c.sideCoreYears[1]!).length /
        sides.length
      : 0;
    let status: BenchStatus =
      share >= c.minShare - 1e-9 ? "ok" : share >= c.nearShare - 1e-9 ? "near" : "off";
    if (colour.length > maxColour) status = status === "ok" ? "near" : "off";
    // round 14 (DJ B2): a colour orchestra at a peak is off, not near
    if (hot > c.colourPeakMax) status = "off";
    add({
      key: "goldenCore",
      label: c.label,
      value: `${pct(share)} of tandas core · ${colour.length} colour${hot ? ` (${hot} at a peak)` : ""} · sides 1938–44 ${pct(sideCore)}`,
      range: `≥ ${pct(c.minShare)} core, ≤ ${maxColour} colour tandas, none at a peak`,
      status: applies ? status : "ok",
      weight: applies ? c.weight : 0,
      source: c.source,
      fix: "core",
      ...(applies ? {} : { info: true }),
    });
  }
  // 16. transitions (transitions review §4)
  {
    const c = K.transitions;
    const tr = nightTransitions(t);
    const per4h = (x: number) => (x * hours) / 4;
    const h16 = tr.hard.H1 + tr.hard.H6;
    const ok =
      tr.mean >= c.meanRange[0]! &&
      tr.mean <= c.meanRange[1]! &&
      tr.jarring <= Math.round(per4h(c.maxJarringPer4h)) &&
      tr.min >= c.minPair &&
      h16 === 0;
    // near: the review's own partial credit (§4) reaches nearCredit, with no H1 / H6 hit
    const allowed = Math.round(per4h(c.maxJarringPer4h));
    const credit =
      Math.max(0, Math.min(1, (tr.mean - 80) / 8)) * Math.max(0, 1 - 0.2 * Math.max(0, tr.jarring - allowed));
    const near = credit >= c.nearCredit && h16 === 0;
    const hits = Object.entries(tr.hard)
      .filter(([, v]) => v)
      .map(([k, v]) => `${v}×${k}`)
      .join(" ");
    add({
      key: "transitions",
      label: c.label,
      value: `mean ${tr.mean} · min ${tr.min} · ${tr.jarring} jarring${hits ? ` · ${hits}` : ""}`,
      range: `mean ${c.meanRange[0]}–${c.meanRange[1]}, ≤ ${Math.round(per4h(c.maxJarringPer4h))} jarring, min ≥ ${c.minPair}, no H1/H6`,
      status: tr.pairs.length ? (ok ? "ok" : near ? "near" : "off") : "ok",
      weight: c.weight,
      source: c.source,
      fix: "bridge",
    });
  }
  // 17. heatmap best years: sides from the user's grade ≥ 3 years
  {
    const c = K.heatmapBest;
    const sides = dance.flatMap((x) => x.songs).filter((s) => !/cumparsita/i.test(s.title));
    const grades = sides
      .map(
        (s) =>
          s.heat ?? DEFAULT_HEATMAP.grade(s.orchestraId, s.vocal, s.year && !s.yearApprox ? s.year : null),
      )
      .filter((g): g is NonNullable<typeof g> => g !== undefined);
    const share = grades.length ? grades.filter((g) => g >= 3).length / grades.length : 1;
    const low = grades.filter((g) => g <= 1).length;
    const applies = sides.length > 0 && grades.length / sides.length >= c.minGraded;
    add({
      key: "heatmapBest",
      label: c.label,
      value: `${pct(share)} of ${grades.length} graded sides${low ? ` · ${low} from grade 0–1 years` : ""}`,
      range: `≥ ${pct(c.minShare)} from grade 3–4 years (near from ${pct(c.nearShare)})`,
      status: !applies
        ? "ok"
        : share >= c.minShare - 1e-9
          ? "ok"
          : share >= c.nearShare - 1e-9
            ? "near"
            : "off",
      weight: applies ? c.weight : 0,
      source: c.source,
      fix: "heatmap",
      ...(applies ? {} : { info: true }),
    });
  }

  // 18. round 14 — the strict panel (docs/specs/round14-engine.md)
  const strict = strictChecks(p);
  {
    const c = K.strictPanel;
    const applies = strict.rules.some((r) => r.applies && r.key !== "gap" && !r.key.startsWith("cue"));
    add({
      key: "strictPanel",
      label: c.label,
      value: strictSummary(strict),
      range: "no blocker, no should-fix item (near: no blocker, ≤ 3 should-fix)",
      status: strict.blockers
        ? "off"
        : strict.shouldFix > c.nearShouldFix
          ? "off"
          : strict.shouldFix
            ? "near"
            : "ok",
      weight: applies ? c.weight : 0,
      source: c.source,
      fix: "strict",
      ...(applies ? {} : { info: true }),
    });
  }
  const scored = checks.filter((c) => !c.info && c.weight > 0);
  const W = scored.reduce((a, c) => a + c.weight, 0) || 1;
  const total = Math.round(
    (scored.reduce((a, c) => a + c.weight * (c.status === "ok" ? 1 : c.status === "near" ? 0.5 : 0), 0) / W) *
      100,
  );
  return {
    total,
    checks,
    inRange: scored.filter((c) => c.status === "ok").length,
    scored: scored.length,
    strict,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// improveNight: iterative fixers, a change is kept only if nothing gets worse

export interface Change {
  kind: FixKey;
  /** 0-based tanda index the change is about */
  tanda: number;
  /** plain-language log line */
  text: string;
}
export interface ImproveSnapshot {
  /** engine score (scorePlaylist total) */
  score: number;
  /** benchmark total (0..100) */
  bench: number;
  inRange: number;
  scored: number;
}
export interface ImproveResult {
  playlist: Playlist;
  changes: Change[];
  before: ImproveSnapshot;
  after: ImproveSnapshot;
}
export interface ImproveOptions {
  /** rounds of all fixers (default 8) */
  maxRounds?: number;
  /** which fixers run, in order (default all) */
  fixers?: FixKey[];
}
interface Candidate {
  kind: FixKey;
  tanda: number;
  playlist: Playlist;
  text: (p: Playlist) => string;
}

const snapshot = (p: Playlist): ImproveSnapshot => {
  const b = benchmarkNight(p);
  return { score: p.score.total, bench: b.total, inRange: b.inRange, scored: b.scored };
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clean = (s: Song) => !s.streamSuspect && !s.reissue && !s.yearApprox && !s.transcription;
const tandaName = (t: Tanda) =>
  `${t.orchestra}${t.vocal && t.singer ? ` / ${t.singer}` : t.vocal ? "" : " instrumental"}`;
const yearsStr = (songs: Song[]) => {
  const ys = songs.map((s) => s.year ?? 0).filter(Boolean);
  const a = Math.min(...ys),
    b = Math.max(...ys);
  return a === b ? `${a}` : `${a}–${String(b).slice(-2)}`;
};

/** a tanda with its derived fields recomputed from its sides (energy mean, curve, years, duration) */
function refreshTanda(t: Tanda, old: Tanda): Tanda {
  const ys = t.songs.map((s) => s.year).filter((y): y is number => !!y);
  const es = t.songs.map((s) => s.energy).filter((e): e is number => typeof e === "number");
  return {
    ...t,
    yearRange: ys.length ? [Math.min(...ys), Math.max(...ys)] : null,
    energy: es.length ? Math.round(mean(es)) : t.energy,
    energyCurve: t.songs.map((s) => s.energy ?? t.energy),
    // keep the night's own convention (some saved nights carry the cortina inside): shift by the sides' change only
    durationSec: old.durationSec - songsSec(old) + songsSec(t),
  };
}

/** Improve a night against the benchmark and the engine score. Pure; `p` is not touched. */
export function improveNight(p: Playlist, deps: ComposeDeps, opts: ImproveOptions = {}): ImproveResult {
  const cat = deps.catalog;
  const original: Playlist = structuredClone(p);
  const maxRounds = opts.maxRounds ?? 8;
  const fixers =
    opts.fixers ??
    ([
      "strict",
      "stream-suspect",
      "heatmap",
      "tighten",
      "core",
      "roles",
      "instrumental",
      "cue-fit",
      "bridge",
    ] as FixKey[]);
  const baseStats = computeStats(original.tandas, original.closing, original.options);
  const durOffset = original.stats.durationSec - baseStats.durationSec;
  const startFailures = new Set(hardFailures(original));
  const byId = new Map(cat.songs.map((s) => [s.id, s]));
  const fresh = (s: Song) => byId.get(s.id) ?? s;

  const finalize = (q: Playlist): Playlist => {
    const stats = { ...q.stats, ...computeStats(q.tandas, q.closing, q.options) };
    stats.durationSec += durOffset;
    const out = { ...q, stats };
    out.score = scorePlaylist(out);
    return out;
  };
  const withTanda = (q: Playlist, i: number, t: Tanda): Playlist => {
    const tandas = q.tandas.slice();
    tandas[i] = refreshTanda(t, q.tandas[i]!);
    return finalize({ ...q, tandas });
  };
  const usedTitles = (q: Playlist, except?: number) => {
    const out = new Set<string>();
    q.tandas.forEach((t, i) => {
      if (i !== except) for (const s of t.songs) out.add(normTitle(s.title));
    });
    if (q.closing) out.add(normTitle(q.closing.title));
    if (q.opening) out.add(normTitle(q.opening.title));
    return out;
  };
  const danceable = (s: Song) =>
    isDanceableSong(s, cat.blacklist) && !cat.nonDance(s.orchestraId, s.title, s.year) && isTandaEligible(s);

  /** order the sides: a corpus closer last when present, openers never last, the highest-fame side third */
  const orderSides = (songs: Song[]): Song[] => {
    const rest = songs.slice();
    const take = (pred: (s: Song) => boolean, by: (a: Song, b: Song) => number) => {
      const c = rest.filter(pred).sort(by);
      if (!c.length) return null;
      rest.splice(rest.indexOf(c[0]!), 1);
      return c[0]!;
    };
    const byFame = (a: Song, b: Song) => (b.fame ?? 0) - (a.fame ?? 0) || (a.year ?? 0) - (b.year ?? 0);
    const last =
      take((s) => s.role === "closer", byFame) ??
      take(
        (s) => s.role !== "opener",
        (a, b) => -byFame(a, b),
      ) ??
      take(
        () => true,
        (a, b) => -byFame(a, b),
      )!;
    if (!rest.length) return [last];
    const third = rest.length >= 3 ? take(() => true, byFame) : null;
    // openers lead, then the rest by year
    rest.sort(
      (a, b) =>
        (a.role === "opener" ? 0 : 1) - (b.role === "opener" ? 0 : 1) ||
        (a.year ?? 0) - (b.year ?? 0) ||
        a.id.localeCompare(b.id),
    );
    const head = rest.slice();
    if (third) head.splice(2, 0, third);
    return [...head, last];
  };

  // --- fixers -------------------------------------------------------------------------------------------------
  const vocalBand = (q: Playlist): [number, number] | undefined =>
    q.options.rules?.vocalShare ??
    (q.options.eras.includes("golden") || q.options.eras.includes("golden-extended")
      ? [0.55, 0.75]
      : undefined);

  const instrumentalFix = (q: Playlist): Candidate[] => {
    // round 14 (DJ S6): an hour without an instrumental tango tanda, or a hour holding a fourth vocal tango in a row
    const hs = hourlyInstrumental(q);
    let run = 0;
    const longRun = new Set<number>();
    q.tandas.forEach((t, i) => {
      if (t.rhythm !== "tango") return;
      run = t.vocal ? run + 1 : 0;
      if (run > K.instrumental.maxVocalRun) longRun.add(i);
    });
    const low = hs.filter(
      (h) =>
        !h.tandas.some((i) => q.tandas[i]!.rhythm === "tango" && !q.tandas[i]!.vocal) ||
        h.tandas.some((i) => longRun.has(i)),
    );
    if (!low.length) return [];
    const yrQ = q.options.yearRange;
    const tango = q.tandas.filter((t) => t.rhythm === "tango");
    const vocalNow = tango.filter((t) => t.vocal).length;
    const b = vocalBand(q);
    // the night's vocal floor (golden 55 % of the tango tandas) is a DJ rule: never converted below it
    if (b && tango.length && (vocalNow - 1) / tango.length < b[0] - 1e-9) return [];
    const maxBefore = q.options.rules?.maxInstrumentalBeforeVocal;
    const out: Candidate[] = [];
    for (const h of low)
      for (const i of h.tandas) {
        const t = q.tandas[i]!;
        if (t.rhythm !== "tango" || !t.vocal || t.locked || t.birthday || i === q.tandas.length - 1) continue;
        if (!t.yearRange) continue;
        if (maxBefore !== undefined) {
          const firstVocal = q.tandas.findIndex((x, j) => j !== i && x.rhythm === "tango" && x.vocal);
          const before = q.tandas.filter(
            (x, j) => x.rhythm === "tango" && (j === i || !x.vocal) && (firstVocal < 0 || j < firstVocal),
          ).length;
          if (before > maxBefore) continue;
        }
        const used = usedTitles(q, i);
        const [y0, y1] = t.yearRange;
        const seen = new Map<string, Song>();
        for (const s of cat.byOrchestra.get(t.orchestraId) ?? []) {
          if (songRhythm(s) !== "tango" || s.vocal || s.singer || !clean(s) || typeof s.energy !== "number")
            continue;
          if (!s.year || s.year < y0 - 2 || s.year > y1 + 2 || !danceable(s)) continue;
          // round 14 (DJ B1, B4): never outside the night's year range
          if (yrQ && (s.year < yrQ[0] || s.year > yrQ[1])) continue;
          const k = normTitle(s.title);
          if (used.has(k)) continue;
          const prev = seen.get(k);
          if (!prev || (s.fame ?? 0) > (prev.fame ?? 0)) seen.set(k, s);
        }
        const pool = [...seen.values()];
        const size = t.songs.length;
        const spread = Math.max(2, Math.min(q.options.maxYearSpread || 4, 4));
        let best: { songs: Song[]; q: number } | null = null;
        for (let w = y0 - 2; w <= Math.max(y0 - 2, y1 + 2 - spread); w++) {
          const inWin = pool
            .filter((s) => s.year! >= w && s.year! <= w + spread)
            .sort(
              (a, b2) =>
                (b2.fame ?? 0) - (a.fame ?? 0) ||
                Math.abs(a.energy! - t.targetEnergy) - Math.abs(b2.energy! - t.targetEnergy) ||
                a.id.localeCompare(b2.id),
            );
          if (inWin.length < size) continue;
          const pick = inWin.slice(0, size);
          if (pick.filter((s) => (s.fame ?? 0) >= 2).length < Math.max(1, size - 1)) continue;
          const quality =
            pick.reduce((a, s) => a + (s.fame ?? 0), 0) * 10 -
            Math.abs(mean(pick.map((s) => s.energy!)) - t.targetEnergy);
          if (!best || quality > best.q) best = { songs: pick, q: quality };
        }
        if (!best) continue;
        const songs = orderSides(best.songs);
        const nt: Tanda = {
          ...t,
          songs,
          singer: null,
          vocal: false,
          reason: `${t.orchestra} instrumental (benchmark: an instrumental tango tanda every hour, round-14 DJ review S6)`,
        };
        const cand = withTanda(q, i, nt);
        out.push({
          kind: "instrumental",
          tanda: i,
          playlist: cand,
          text: (after) => {
            const hh = hourlyInstrumental(after).find((x) => x.tandas.includes(i));
            return `Tanda ${i + 1}: ${tandaName(t)} → ${t.orchestra} instrumental ${yearsStr(songs)} so hour ${(hh?.hour ?? h.hour) + 1} has an instrumental tango tanda (${pct(hh?.share ?? 0)} instrumental)`;
          },
        });
      }
    // best replacements first: most floor-known sides
    return out.sort(
      (a, b) =>
        b.playlist.tandas[b.tanda]!.songs.reduce((x, s) => x + (s.fame ?? 0), 0) -
          a.playlist.tandas[a.tanda]!.songs.reduce((x, s) => x + (s.fame ?? 0), 0) || a.tanda - b.tanda,
    );
  };

  const streamFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    q.tandas.forEach((t, i) => {
      if (t.locked || !t.yearRange) return;
      t.songs.forEach((s, k) => {
        if (!fresh(s).streamSuspect) return;
        if (/cumparsita/i.test(s.title)) return;
        const used = usedTitles(q);
        const [y0, y1] = t.yearRange!;
        const e = mean(t.songs.map((x) => x.energy ?? t.energy));
        const singer = normTitle(s.singer ?? "");
        const alt = (cat.byOrchestra.get(t.orchestraId) ?? [])
          .filter(
            (c) =>
              songRhythm(c) === t.rhythm &&
              c.vocal === s.vocal &&
              normTitle(c.singer ?? "") === singer &&
              !!c.year &&
              c.year >= y0 - 1 &&
              c.year <= y1 + 1 &&
              clean(c) &&
              typeof c.energy === "number" &&
              !used.has(normTitle(c.title)) &&
              danceable(c),
          )
          .sort(
            (a, b) =>
              (b.fame ?? 0) - (a.fame ?? 0) ||
              Math.abs(a.energy! - e) - Math.abs(b.energy! - e) ||
              a.id.localeCompare(b.id),
          )[0];
        if (!alt) return;
        const songs = t.songs.slice();
        songs[k] = alt;
        out.push({
          kind: "stream-suspect",
          tanda: i,
          playlist: withTanda(q, i, { ...t, songs }),
          text: () =>
            `Tanda ${i + 1}: ${s.title} ${s.year ?? ""} streams as a later re-recording → ${alt.title} ${alt.year} (same ${t.orchestra}${t.vocal && t.singer ? ` / ${t.singer}` : ""} family)`,
        });
      });
    });
    return out;
  };

  const rolesFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    q.tandas.forEach((t, i) => {
      if (t.locked || t.songs.length < 2) return;
      const songs = t.songs.slice();
      const isCumparsitaLast = /cumparsita/i.test(songs.at(-1)!.title);
      const lastIdx = isCumparsitaLast ? songs.length - 2 : songs.length - 1;
      if (lastIdx < 1) return;
      const notes: string[] = [];
      if (songs[lastIdx]!.role === "opener") {
        let j = -1;
        for (let k = lastIdx - 1; k >= 0; k--)
          if (songs[k]!.role === "closer") {
            j = k;
            break;
          }
        if (j < 0)
          for (let k = lastIdx - 1; k >= 0; k--)
            if (songs[k]!.role !== "opener") {
              j = k;
              break;
            }
        if (j >= 0) {
          notes.push(`the opener ${songs[lastIdx]!.title} no longer closes`);
          [songs[j], songs[lastIdx]] = [songs[lastIdx]!, songs[j]!];
        }
      }
      if (songs[0]!.role === "closer") {
        let j = songs.findIndex((s, k) => k > 0 && k < lastIdx && s.role === "opener");
        if (j < 0) j = songs.findIndex((s, k) => k > 0 && k < lastIdx && s.role !== "closer");
        if (j > 0) {
          notes.push(`the closer ${songs[0]!.title} no longer opens`);
          [songs[0], songs[j]] = [songs[j]!, songs[0]!];
        }
      }
      if (!notes.length) return;
      out.push({
        kind: "roles",
        tanda: i,
        playlist: withTanda(q, i, { ...t, songs }),
        text: () => `Tanda ${i + 1}: ${tandaName(t)} reordered so ${notes.join(" and ")}`,
      });
    });
    return out;
  };

  /** what the cue into tanda i+1 must be (round 10/11 rules): unmet conditions count */
  const cueMiss = (q: Playlist, gap: number, c: Cortina): number => {
    const next = q.tandas[gap + 1];
    const prev = q.tandas[gap]!;
    if (!next) return 0;
    const tempo = cortinaTempo(c);
    let miss = 0;
    if (next.rhythm !== "tango" && tempo === "slow") miss++;
    if (next.energy >= 75 && (tempo === "slow" || c.energy < 60)) miss++;
    if (isPugliese(next) && (c.energy > 70 || tempo === "up")) miss++;
    if (isPugliese(prev) && (c.energy < 70 || tempo !== "up")) miss++;
    return miss;
  };
  const cueFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    const gaps = q.tandas.map((_t, i) => i).filter((i) => i < q.tandas.length - 1 && q.tandas[i]!.cortina);
    const families = new Set(gaps.map((i) => familyOf(q.tandas[i]!.cortina!)));
    const usedIds = new Set(gaps.map((i) => q.tandas[i]!.cortina!.id));
    const put = (t: Tanda, c: Cortina): Tanda => ({
      ...t,
      cortina: { ...c, lengthSec: t.cortina?.lengthSec ?? c.lengthSec },
    });
    for (const i of gaps) {
      const ci = q.tandas[i]!.cortina!;
      const miss = cueMiss(q, i, ci);
      if (!miss) continue;
      const next = q.tandas[i + 1]!;
      // a swap with another gap first: the cue that fits here, and ours must not hurt there
      let best: { j: number; d: number; delta: number } | null = null;
      for (const j of gaps) {
        if (j === i) continue;
        const cj = q.tandas[j]!.cortina!;
        if (cueMiss(q, i, cj) > 0) continue;
        const delta = cueMiss(q, j, ci) - cueMiss(q, j, cj) - miss;
        if (delta >= 0) continue;
        const d =
          Math.abs(cj.energy - next.energy) + Math.abs(ci.energy - (q.tandas[j + 1]?.energy ?? ci.energy));
        if (!best || delta < best.delta || (delta === best.delta && d < best.d)) best = { j, d, delta };
      }
      if (best) {
        const j = best.j;
        const cj = q.tandas[j]!.cortina!;
        const tandas = q.tandas.slice();
        tandas[i] = put(q.tandas[i]!, cj);
        tandas[j] = put(q.tandas[j]!, ci);
        out.push({
          kind: "cue-fit",
          tanda: i + 1,
          playlist: finalize({ ...q, tandas }),
          text: () =>
            `Cue into tanda ${i + 2} (${next.rhythm}, ${tandaName(next)}, e${next.energy}): ${ci.title} (${cortinaTempo(ci)} e${ci.energy}) swapped with ${cj.title} (${cortinaTempo(cj)} e${cj.energy}) from the cue into tanda ${j + 2}`,
        });
        continue;
      }
      // else a new cue from the families the night already uses (never a new family)
      const alt = (deps.cortinas ?? [])
        .filter((c) => families.has(familyOf(c)) && !usedIds.has(c.id) && cueMiss(q, i, c) === 0)
        .sort(
          (a, b) =>
            Math.abs(a.energy - next.energy) - Math.abs(b.energy - next.energy) || a.id.localeCompare(b.id),
        )[0];
      if (!alt) continue;
      const tandas = q.tandas.slice();
      tandas[i] = put(q.tandas[i]!, alt);
      out.push({
        kind: "cue-fit",
        tanda: i + 1,
        playlist: finalize({ ...q, tandas }),
        text: () =>
          `Cue into tanda ${i + 2} (${next.rhythm}, ${tandaName(next)}, e${next.energy}): ${ci.title} (${cortinaTempo(ci)} e${ci.energy}) → new cue ${alt.title} (${cortinaTempo(alt)} e${alt.energy}, same family)`,
      });
    }
    return out;
  };

  // --- round 13 fixers ------------------------------------------------------------------------------------------
  const isCump = (s: Song) => /cumparsita/i.test(s.title);
  const heatOf = (s: Song) =>
    fresh(s).heat ?? DEFAULT_HEATMAP.grade(s.orchestraId, s.vocal, s.year && !s.yearApprox ? s.year : null);
  /** the sides a tanda's family offers (same orchestra, rhythm, mode and singer; clean, danceable, dated, unused) */
  const familySides = (q: Playlist, i: number) => {
    const t = q.tandas[i]!;
    const used = usedTitles(q, i);
    const singer = normTitle(t.songs.find((x) => x.vocal)?.singer ?? t.singer ?? "");
    const seen = new Map<string, Song>();
    for (const c of cat.byOrchestra.get(t.orchestraId) ?? []) {
      if (
        songRhythm(c) !== t.rhythm ||
        c.vocal !== t.vocal ||
        normTitle(c.singer ?? "") !== (t.vocal ? singer : "")
      )
        continue;
      if (!c.year || !clean(c) || typeof c.energy !== "number" || !danceable(c) || isCump(c)) continue;
      const k = normTitle(c.title);
      if (used.has(k)) continue;
      const g = heatOf(c);
      if (g !== undefined && g <= 1 && (c.fame ?? 0) < 2) continue;
      const prev = seen.get(k);
      if (!prev || (c.fame ?? 0) > (prev.fame ?? 0)) seen.set(k, c);
    }
    return [...seen.values()];
  };
  /** cohesion R2: a loose tanda takes its family's sides from one year window (span ≤ 1), keeping what it can */
  const tightenFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    q.tandas.forEach((t, i) => {
      if (t.locked || t.birthday || t.songs.some(isCump) || t.songs.length < 2) return;
      const g = eraGrade(t);
      if (!g || (!g.over && !g.crosses)) return;
      const pool = familySides(q, i);
      const curIds = new Set(t.songs.map((s) => s.id));
      const all = [...t.songs.map(fresh), ...pool.filter((s) => !curIds.has(s.id))];
      const years = [...new Set(all.map((s) => s.year!))];
      const years0 = t.songs.map((s) => s.year ?? 0).filter(Boolean);
      const [ty0, ty1] = [Math.min(...years0), Math.max(...years0)];
      let best: { songs: Song[]; q: number } | null = null;
      for (const y of years) {
        // the window stays on the tanda's own years (it tightens, it does not move the tanda to another period)
        if (y < ty0 - 1 || y > ty1) continue;
        const inWin = (s: Song) => !!s.year && s.year >= y && s.year <= y + 1;
        const keep = t.songs.filter(inWin);
        const fill = pool
          .filter((s) => inWin(s) && !curIds.has(s.id))
          .sort(
            (a, b) =>
              (b.fame ?? 0) - (a.fame ?? 0) ||
              Math.abs(a.energy! - t.energy) - Math.abs(b.energy! - t.energy) ||
              a.id.localeCompare(b.id),
          );
        const need = t.songs.length - keep.length;
        if (fill.length < need) continue;
        const songs = [...keep, ...fill.slice(0, need)];
        if (new Set(songs.map((s) => normTitle(s.title))).size < songs.length) continue;
        const fameNew = songs.reduce((a, s) => a + (s.fame ?? 0), 0);
        const fameOld = t.songs.reduce((a, s) => a + (s.fame ?? 0), 0);
        if (fameNew < fameOld - 3) continue;
        const quality =
          keep.length * 20 + fameNew * 5 - Math.abs(mean(songs.map((s) => s.energy ?? t.energy)) - t.energy);
        if (!best || quality > best.q) best = { songs, q: quality };
      }
      if (!best) return;
      const songs = orderSides(best.songs);
      const gone = t.songs.filter((s) => !songs.includes(s));
      out.push({
        kind: "tighten",
        tanda: i,
        playlist: withTanda(q, i, { ...t, songs }),
        text: () =>
          `Tanda ${i + 1}: ${tandaName(t)} ${yearsStr(t.songs)} → ${yearsStr(songs)} (${gone.map((s) => `${s.title} ${s.year}`).join(", ")} out; one recording period, round-13 year spread)`,
      });
    });
    return out;
  };
  /** the user's heatmap: a side from a grade 0 year, or a grade 1 year that is not a known single, gives way */
  const heatFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    q.tandas.forEach((t, i) => {
      if (t.locked || !t.yearRange) return;
      t.songs.forEach((s, k) => {
        if (isCump(s)) return;
        const g = heatOf(s);
        if (g === undefined || g >= 2 || (g === 1 && (s.fame ?? 0) >= 2)) return;
        const others = t.songs
          .filter((_, j) => j !== k)
          .map((x) => x.year ?? 0)
          .filter(Boolean);
        const lo = Math.min(...others, s.year ?? 9999);
        const hi = Math.max(...others, s.year ?? 0);
        const alt = familySides(q, i)
          .filter(
            (c) =>
              (heatOf(c) ?? 3) >= 3 && c.year! >= Math.max(lo, hi - 2) && c.year! <= Math.min(hi, lo + 2) + 1,
          )
          .sort(
            (a, b) =>
              (b.fame ?? 0) - (a.fame ?? 0) ||
              Math.abs(a.energy! - (s.energy ?? t.energy)) - Math.abs(b.energy! - (s.energy ?? t.energy)) ||
              a.id.localeCompare(b.id),
          )[0];
        if (!alt) return;
        const songs = t.songs.slice();
        songs[k] = alt;
        out.push({
          kind: "heatmap",
          tanda: i,
          playlist: withTanda(q, i, { ...t, songs }),
          text: () =>
            `Tanda ${i + 1}: ${s.title} ${s.year ?? ""} (heatmap: ${g === 0 ? "avoid" : "single tracks only"}) → ${alt.title} ${alt.year} (heatmap: ${(heatOf(alt) ?? 3) >= 4 ? "fantastic" : "good"} year)`,
        });
      });
    });
    return out;
  };
  /** transitions H4: a tango → tango step of more than 6 years goes through a bridge cue (medium or slow, in between) */
  const bridgeFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    const gaps = q.tandas.map((_t, i) => i).filter((i) => i < q.tandas.length - 1 && q.tandas[i]!.cortina);
    const my = (t: Tanda) => {
      const ys = t.songs.filter((s) => s.year && !isCump(s)).map((s) => s.year!);
      return ys.length ? mean(ys) : null;
    };
    const needsBridge = (i: number) => {
      const a = q.tandas[i]!,
        b = q.tandas[i + 1];
      if (!b || a.rhythm !== "tango" || b.rhythm !== "tango") return false;
      const ya = my(a),
        yb = my(b);
      return ya !== null && yb !== null && Math.abs(ya - yb) > 6;
    };
    const put = (t: Tanda, c: Cortina): Tanda => ({
      ...t,
      cortina: { ...c, lengthSec: t.cortina?.lengthSec ?? c.lengthSec },
    });
    const families = new Set(gaps.map((i) => familyOf(q.tandas[i]!.cortina!)));
    const usedIds = new Set(gaps.map((i) => q.tandas[i]!.cortina!.id));
    for (const i of gaps) {
      if (!needsBridge(i)) continue;
      const a = q.tandas[i]!,
        b = q.tandas[i + 1]!;
      const ci = a.cortina!;
      if (isBridge(ci, a, b)) continue;
      const swap = gaps.find((j) => {
        if (j === i) return false;
        const cj = q.tandas[j]!.cortina!;
        if (!isBridge(cj, a, b) || cueMiss(q, i, cj) > 0) return false;
        if (cueMiss(q, j, ci) > cueMiss(q, j, cj)) return false;
        return !needsBridge(j) || isBridge(ci, q.tandas[j]!, q.tandas[j + 1]!);
      });
      if (swap !== undefined) {
        const cj = q.tandas[swap]!.cortina!;
        const tandas = q.tandas.slice();
        tandas[i] = put(q.tandas[i]!, cj);
        tandas[swap] = put(q.tandas[swap]!, ci);
        out.push({
          kind: "bridge",
          tanda: i + 1,
          playlist: finalize({ ...q, tandas }),
          text: () =>
            `Cue into tanda ${i + 2}: ${ci.title} swapped with ${cj.title} (${cortinaTempo(cj)} e${cj.energy}), a bridge for the ${Math.round(Math.abs((my(a) ?? 0) - (my(b) ?? 0)))}-year step from ${tandaName(a)} to ${tandaName(b)}`,
        });
        continue;
      }
      const alt = (deps.cortinas ?? [])
        .filter(
          (c) =>
            families.has(familyOf(c)) && !usedIds.has(c.id) && isBridge(c, a, b) && cueMiss(q, i, c) === 0,
        )
        .sort(
          (x, y) =>
            Math.abs(x.energy - (b.energy - 8)) - Math.abs(y.energy - (b.energy - 8)) ||
            x.id.localeCompare(y.id),
        )[0];
      if (!alt) continue;
      const tandas = q.tandas.slice();
      tandas[i] = put(q.tandas[i]!, alt);
      out.push({
        kind: "bridge",
        tanda: i + 1,
        playlist: finalize({ ...q, tandas }),
        text: () =>
          `Cue into tanda ${i + 2}: ${ci.title} → ${alt.title} (${cortinaTempo(alt)} e${alt.energy}, same family), a bridge for the era step from ${tandaName(a)} to ${tandaName(b)}`,
      });
    }
    return out;
  };

  /**
   * golden-age review R2 / §5: a colour tanda at a peak or over the cap, or a tanda outside its family's core, gives its
   * chair to a core family of another orchestra (the composer's own builder, same slot, caps and gaps)
   */
  const coreFix = (q: Playlist): Candidate[] => {
    if (!isGoldenNight(q.options)) return [];
    const out: Candidate[] = [];
    const hoursQ = Math.max(0.25, nightHours(q));
    const capC = Math.max(1, Math.round((K.goldenCore.maxColourPer4h * hoursQ) / 4));
    const colourIdx = q.tandas
      .map((t, i) => (isColour(staticProfile(t.orchestraId)) ? i : -1))
      .filter((i) => i >= 0);
    const isCoreCand = (c: { orchestraId: string; songs: Song[] }) => {
      const p = cat.profile(c.orchestraId);
      if (!p?.goldenBands || isColour(p)) return false;
      const core = c.songs.filter(
        (s) => s.year && s.year >= p.goldenBands!.core[0] && s.year <= p.goldenBands!.core[1],
      );
      return core.length >= 3;
    };
    q.tandas.forEach((t, i) => {
      if (t.locked || t.birthday || i === q.tandas.length - 1 || t.songs.some(isCump)) return;
      const p = staticProfile(t.orchestraId);
      const hot = t.peak || t.phase === "peak" || t.targetEnergy >= K.goldenCore.peakEnergy;
      const colourBad = isColour(p) && (hot || colourIdx.length > capC);
      const ys = t.songs.filter((s) => s.year).map((s) => s.year!);
      const nonCore = !isColour(p) && goldenClassOf(p, ys) !== "core";
      // transitions: a tanda that both boundaries find jarring (a 1954 vals between two 1940s tangos) gives way too
      const prs = nightTransitions(q.tandas).pairs;
      const jarIn = prs[i - 1]?.grade === "jarring";
      const jarOut = prs[i]?.grade === "jarring";
      if (!colourBad && !nonCore && !(jarIn && jarOut)) return;
      // the night's caps hold: an orchestra at most twice (D'Arienzo three times), one tango tanda per orchestra
      // under 5 h (round 11), never the same orchestra and rhythm twice
      const capOk = (id: string, rhythm: string) => {
        const others = q.tandas.filter((x, j) => j !== i && x.orchestraId === id);
        if (others.length >= (id === "juan-d-arienzo" ? 3 : 2)) return false;
        return !others.some((x) => x.rhythm === rhythm && (q.options.hours < 5 || id !== "juan-d-arienzo"));
      };
      for (const seed of [11, 23, 37]) {
        const np = swapTanda(
          q,
          i,
          deps,
          seed + i,
          (c) =>
            capOk(c.orchestraId, t.rhythm) &&
            (isCoreCand({ orchestraId: c.orchestraId, songs: c.songs }) ||
              // for a doubly jarring tanda any family of the golden years will do (colour and other eras excepted)
              (jarIn &&
                jarOut &&
                !isColour(cat.profile(c.orchestraId)) &&
                goldenClassOf(
                  cat.profile(c.orchestraId),
                  c.songs.map((x) => x.year ?? 0),
                ) === "core")),
        );
        const nt = np.tandas[i];
        if (np === q || !nt || nt.orchestraId === t.orchestraId) continue;
        out.push({
          kind: "core",
          tanda: i,
          playlist: finalize({ ...np, stats: { ...q.stats, ...np.stats } }),
          text: () =>
            `Tanda ${i + 1}: ${tandaName(t)} ${yearsStr(t.songs)} (${colourBad ? "a colour tanda at a peak or over the cap" : nonCore ? "outside the family's golden core" : "a jarring step on both sides"}) → ${tandaName(nt)} ${yearsStr(nt.songs)}`,
        });
        break;
      }
    });
    return out;
  };

  /**
   * transitions H3: an unplanned energy jump (|Δe| > 25, or ≥ 15 and 18 off the plan) is softened inside the families:
   * one or two sides of either tanda give way to sides of the same family and years that bring it toward the plan
   */
  const energyFix = (q: Playlist): Candidate[] => {
    const out: Candidate[] = [];
    const tr = nightTransitions(q.tandas);
    for (const pr of tr.pairs) {
      // an H3 jump, or a jarring boundary whose loss is mostly the energy step
      const energyLoss = pr.why
        .filter((w) => w.startsWith("energy"))
        .map((w) => Number(/−(\d+)$/.exec(w)?.[1] ?? 0));
      if (!pr.hard.includes("H3") && !(pr.grade === "jarring" && (energyLoss[0] ?? 0) >= 12)) continue;
      const ia = pr.from,
        ib = pr.from + 1;
      const a = q.tandas[ia]!,
        b = q.tandas[ib]!;
      const dt = b.targetEnergy - a.targetEnergy;
      for (const [i, want] of [
        [ib, a.energy + dt],
        [ia, b.energy - dt],
      ] as Array<[number, number]>) {
        const t = q.tandas[i]!;
        if (t.locked || t.birthday || t.songs.some(isCump) || !t.yearRange) continue;
        const [y0, y1] = t.yearRange;
        const pool = familySides(q, i).filter((s) => s.year! >= y0 && s.year! <= y1);
        if (!pool.length) continue;
        let songs = t.songs.slice();
        const meanE = (xs: Song[]) => mean(xs.map((s) => s.energy ?? t.energy));
        for (let k = 0; k < 2; k++) {
          let best: { songs: Song[]; d: number } | null = null;
          songs.forEach((cur, j) => {
            for (const alt of pool) {
              if (songs.some((x) => normTitle(x.title) === normTitle(alt.title))) continue;
              if ((alt.fame ?? 0) < (cur.fame ?? 0) - 1) continue;
              const next = songs.slice();
              next[j] = alt;
              const d = Math.abs(meanE(next) - want);
              if (!best || d < best.d - 1e-9) best = { songs: next, d };
            }
          });
          if (!best || (best as { d: number }).d >= Math.abs(meanE(songs) - want) - 1) break;
          songs = (best as { songs: Song[] }).songs;
        }
        if (songs === t.songs || songs.every((s, j) => s === t.songs[j])) continue;
        const ordered = orderSides(songs);
        out.push({
          kind: "energy",
          tanda: i,
          playlist: withTanda(q, i, { ...t, songs: ordered }),
          text: (after) =>
            `Tanda ${i + 1}: ${tandaName(t)} e${t.energy} → e${after.tandas[i]!.energy} (same family and years) so the step from tanda ${ia + 1} to ${ib + 1} follows the plan (transitions H3)`,
        });
      }
    }
    return out;
  };

  /** round 14 — the strict panel's own edits (repair.ts), the best one per step */
  const strictFix = (q: Playlist): Candidate[] => {
    const r0 = strictChecks(q);
    if (!r0.violations.length) return [];
    // round 19: a cue without its Spotify record on a Spotify night is re-picked on its own too (the panel's best edit
    // may be another one that this step then declines)
    const cueFix: Candidate[] = [];
    if (r0.violations.some((v) => v.rule === "cueSpotify")) {
      const rc = recue(q.tandas, deps, q.options);
      if (rc) {
        const cp = finalize({ ...q, tandas: rc });
        const rr = strictChecks(cp);
        if (rr.blockers <= r0.blockers && rr.penalty < r0.penalty)
          cueFix.push({
            kind: "strict",
            tanda: 0,
            playlist: cp,
            text: () =>
              `Cortinas re-picked: every cue with a checked Spotify record (strict panel: ${strictSummary(r0)} → ${strictSummary(rr)})`,
          });
      }
    }
    const r = bestEdit(q, r0, deps, { keepScore: true, bench: (x) => benchmarkNight(x).total });
    if (!r) return cueFix;
    const np = finalize({ ...q, tandas: r.edit.playlist.tandas, closing: r.edit.playlist.closing });
    // (an Auto-improve step never lowers the night's hourly instrumental share)
    const share = (x: Playlist) => mean(hourlyInstrumental(x).map((h) => h.share));
    if (share(np) < share(q) - 1e-9) return cueFix;
    return [
      {
        kind: "strict",
        tanda: Math.max(0, Math.min(q.tandas.length - 1, r.edit.tanda)),
        playlist: np,
        text: () => `${r.edit.text} (strict panel: ${strictSummary(r0)} → ${strictSummary(r.res)})`,
      },
      ...cueFix,
    ];
  };

  const FIX: Record<FixKey, (q: Playlist) => Candidate[]> = {
    strict: strictFix,
    energy: energyFix,
    core: coreFix,
    instrumental: instrumentalFix,
    "stream-suspect": streamFix,
    "cue-fit": cueFix,
    roles: rolesFix,
    tighten: tightenFix,
    heatmap: heatFix,
    bridge: bridgeFix,
  };

  // --- the loop -----------------------------------------------------------------------------------------------
  let cur = original;
  // the stored total is the bar (a saved night may carry its own); nothing kept may fall below it
  let curScore = original.score.total;
  let curBench = benchmarkNight(cur).total;
  const before = snapshot(cur);
  const changes: Change[] = [];
  // round 13: a change never adds a transition hard-rule hit (H1, H4, H5, H6) or a jarring boundary
  const trOf = (q: Playlist) => {
    const r = nightTransitions(q.tandas);
    return { hard: r.hard.H1 + r.hard.H4 + r.hard.H5 + r.hard.H6, jarring: r.jarring };
  };
  let curTr = trOf(cur);
  // round 14 (DJ B4, fixer parity): every candidate passes the composer's rule set — the strict panel never gets
  // worse (no new blocker, no higher penalty, no rule newly broken), no must-have family is lost
  let curStrict = strictChecks(cur);
  const ruleCounts = (r: StrictResult) => {
    const m = new Map<string, number>();
    for (const v of r.violations) m.set(v.rule, (m.get(v.rule) ?? 0) + 1);
    return m;
  };
  const accept = (c: Playlist) => {
    if (c.score.total < curScore) return false;
    if (benchmarkNight(c).total < curBench) return false;
    const tr = trOf(c);
    if (tr.hard > curTr.hard || tr.jarring > curTr.jarring) return false;
    const sr = strictChecks(c);
    if (sr.blockers > curStrict.blockers || sr.penalty > curStrict.penalty) return false;
    const before = ruleCounts(curStrict);
    for (const [k, v] of ruleCounts(sr)) if (v > (before.get(k) ?? 0)) return false;
    const have = mustHavesOf(cur.tandas);
    const now = mustHavesOf(c.tandas);
    for (const f of have) if (!now.has(f)) return false;
    return hardFailures(c).every((h) => startFailures.has(h));
  };
  let touched = false;
  for (let round = 0; round < maxRounds; round++) {
    let moved = false;
    for (const key of fixers) {
      const rejected = new Set<string>();
      for (let step = 0; step < 40; step++) {
        const cands = FIX[key](cur).filter((c) => !rejected.has(`${c.tanda}|${c.text(c.playlist)}`));
        const ok = cands.find((c) => {
          const good = accept(c.playlist);
          if (!good) rejected.add(`${c.tanda}|${c.text(c.playlist)}`);
          return good;
        });
        if (!ok) break;
        changes.push({ kind: ok.kind, tanda: ok.tanda, text: ok.text(ok.playlist) });
        cur = ok.playlist;
        curScore = cur.score.total;
        curBench = benchmarkNight(cur).total;
        curTr = trOf(cur);
        curStrict = strictChecks(cur);
        moved = touched = true;
      }
    }
    if (!moved) break;
  }
  const playlist = touched && cur.booth ? attachBooth(cur) : touched ? cur : original;
  return { playlist, changes, before, after: snapshot(playlist) };
}
