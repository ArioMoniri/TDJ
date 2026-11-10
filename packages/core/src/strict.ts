import { cortinaTempo } from "./cortinas";
import { normTitle } from "./energy";
import { isColour, isGoldenNight, staticProfile } from "./knowledge";
import { isPeakSlot, meanFameOf } from "./order";
import { songRhythm } from "./tanda";
import { styleClass } from "./transitions";
import type { Cortina, Playlist, Song, Tanda } from "./types";

/**
 * Round 14 — the strict panel (docs/specs/round14-engine.md). Every flaw the round-14 panel found in the three best
 * round-13 nights (docs/reviews/round14-dancer.md, round14-dj.md, round14-discography.md) is a deterministic check
 * here. `strictChecks` runs on any night (compose, improveNight, `pnpm quality`, the benchmark sheet); the composer
 * and every improveNight fixer use it as their acceptance rule, so no generation step can add a violation.
 *
 * Severity: "blocker" — a strict dancer sits down or the DJ would not play the night; "should-fix" — the floor or a
 * top DJ notices. Each rule names the review items it comes from.
 */
export type StrictSeverity = "blocker" | "should-fix";
export interface StrictRuleDef {
  key: string;
  label: string;
  severity: StrictSeverity;
  source: string;
}
export interface StrictViolation {
  rule: string;
  severity: StrictSeverity;
  /** 0-based tanda index (-1 = the night as a whole, the tanda count = the closing Cumparsita) */
  tanda: number;
  detail: string;
}
export interface StrictRuleResult extends StrictRuleDef {
  /** false when the rule does not apply to this night (no year range, not a golden night, no cortinas …) */
  applies: boolean;
  pass: boolean;
  violations: StrictViolation[];
}
export interface StrictResult {
  rules: StrictRuleResult[];
  violations: StrictViolation[];
  blockers: number;
  shouldFix: number;
  /** blockers × 10 + should-fix: the number the composer and the fixers drive down */
  penalty: number;
}

const D = "docs/reviews/round14-dancer.md";
const J = "docs/reviews/round14-dj.md";
const G = "docs/reviews/round14-discography.md";

export const STRICT_RULES: StrictRuleDef[] = [
  // B — hard filters
  {
    key: "range",
    label: "Every side inside the night's year range",
    severity: "blocker",
    source: `${D} R14-3; ${J} B1; ${G} §3 R11`,
  },
  {
    key: "dated",
    label: "Every dance side dated (no placeholder year, no range-dated or undated compilation row)",
    severity: "blocker",
    source: `${D} R14-4; ${G} §3 R9`,
  },
  {
    key: "rhythm",
    label: "Every side is the tanda's rhythm (no canción or ranchera in a vals tanda)",
    severity: "blocker",
    source: `${G} §1.1 La zandunga, §3 R10`,
  },
  // C — fame and danceability
  {
    key: "fame0",
    label: "At most one side nobody knows (fame 0) per tanda",
    severity: "blocker",
    source: `${D} R14-2a; ${J} S8`,
  },
  {
    key: "fameMean",
    label: "Mean side fame ≥ 2.5 per tanda (≥ 3 in the last hour and at peak slots)",
    severity: "blocker",
    source: `${D} R14-2b`,
  },
  {
    key: "heatLabel",
    label: 'The "fantastic" heat label needs a mean side fame ≥ 3',
    severity: "should-fix",
    source: `${D} R14-2c`,
  },
  {
    key: "opener",
    label: "The first side of a tanda has fame ≥ 3 (≥ 4 at peak slots)",
    severity: "should-fix",
    source: `${D} R14-5`,
  },
  {
    key: "lastSide",
    label: "The last side is among the tanda's best (fame ≥ max − 1), never an opener-role side",
    severity: "should-fix",
    source: `${D} R14-17`,
  },
  {
    key: "peakHits",
    label:
      "A planned peak: ≥ 2 sides of fame ≥ 4 (one of them last), a rhythmic orchestra, no lyrical singer",
    severity: "should-fix",
    source: `${D} R14-7`,
  },
  {
    key: "lastFour",
    label: "The four tandas before the última: mean fame ≥ 3.5, none under 2.5",
    severity: "should-fix",
    source: `${D} R14-8`,
  },
  {
    key: "closer",
    label: "The closing Cumparsita streams, has fame ≥ 2 and a year in range",
    severity: "blocker",
    source: `${D} R14-1`,
  },
  {
    key: "stream",
    label: "At most one unstreamable side per tanda; none in the opener, a planned peak or the última",
    severity: "should-fix",
    source: `${D} R14-11`,
  },
  {
    key: "suspectCredit",
    label: "No suspect-credit side (fame 0 under a title another orchestra made famous that year)",
    severity: "should-fix",
    source: `${D} R14-4b, R14-13`,
  },
  // D — structure
  {
    key: "colourPeak",
    label: "No colour orchestra at a peak slot (phase peak or target ≥ 78)",
    severity: "blocker",
    source: `${J} B2; ${D} R14-6a`,
  },
  {
    key: "colourBudget",
    label: "No colour tanda on the profile: at most 2 colour tandas per 4 h, at least 4 slots apart",
    severity: "should-fix",
    source: `${J} S11`,
  },
  {
    key: "hotSlot",
    label: "A slot with target ≥ 78: a first-tier orchestra, tanda energy ≥ target − 8",
    severity: "should-fix",
    source: `${D} R14-6; ${J} S12`,
  },
  {
    key: "dramaticAfterSummit",
    label: "A dramatic tanda never directly after a hard-drive (R+) summit or a ≤ 1940 R+ tanda",
    severity: "blocker",
    source: `${J} B3; ${D} R14-16`,
  },
  {
    key: "pugliesePlace",
    label: "Double peak: Pugliese 2–4 slots before the last summit",
    severity: "should-fix",
    source: `${J} B3 (the D, (M|V|B), …, R+ summit pattern)`,
  },
  {
    key: "rhythmicRun",
    label:
      "Tango-only sequence: no three rhythmic (R/R+) tandas in a row; two R+ instrumentals ≥ 2 tandas apart",
    severity: "should-fix",
    source: `${J} S1`,
  },
  {
    key: "darienzoPeak",
    label: "D'Arienzo at a planned peak: Echagüe 1938–39 or instrumental 1937–40, never Mauré",
    severity: "should-fix",
    source: `${J} S2; ${D} R14-7`,
  },
  {
    key: "rotation",
    label:
      "An orchestra's tango tandas never share sub-period and mode; three D'Arienzo tandas include a vocal one",
    severity: "should-fix",
    source: `${J} S3`,
  },
  {
    key: "singerOnce",
    label: "One tango tanda per singer (a second appearance only as vals or milonga, never three)",
    severity: "should-fix",
    source: `${J} S4`,
  },
  {
    key: "canon",
    label: "A golden 4 h night carries ≥ 8 of the 9 must-have families",
    severity: "should-fix",
    source: `${J} S5 / §2.11`,
  },
  {
    key: "instrHour",
    label: "Every hour has an instrumental tango tanda; never more than 3 vocal tango tandas in a row",
    severity: "should-fix",
    source: `${J} S6`,
  },
  {
    key: "vocalBand",
    label: "The night's vocal tango share stays inside its band (golden 55–75 %)",
    severity: "should-fix",
    source: `${J} S6 (the vocal tango share stays inside rules.vocalShare); round-9 engine rule`,
  },
  {
    key: "wedge",
    label:
      "The tanda before the última: energy ≥ última − 12, not the last hour's lowest, every side streams",
    severity: "should-fix",
    source: `${J} S7; ${D} R14-9`,
  },
  {
    key: "valley",
    label: "After the first hour, never three tandas in a row under energy 65",
    severity: "should-fix",
    source: `${D} R14-10a`,
  },
  {
    key: "peakRun",
    label: "The arc plan: at most 3 consecutive peak slots (phase peak or target ≥ 80)",
    severity: "should-fix",
    source: `${J} S12`,
  },
  {
    key: "gap",
    label: "Orchestra repeat gap and singer repeat gap held",
    severity: "should-fix",
    source: "engine rule (orchestraRepeatGap / singerRepeatGap); kept by every round-14 repair",
  },
  // F — cortinas
  {
    key: "cueRisk",
    label: "No danceable-risk cortina (Şımarık)",
    severity: "should-fix",
    source: `${J} S9`,
  },
  {
    key: "cueArtist",
    label: "A cortina artist at most twice a night and never within 3 cues of itself",
    severity: "should-fix",
    source: `${D} R14-14; ${J} S9`,
  },
  {
    key: "cueSlowPeak",
    label: "No slow cortina before a peak slot (target ≥ 78)",
    severity: "should-fix",
    source: `${D} R14-15; ${J} S10`,
  },
  {
    key: "cueDramatic",
    label: "The cortina before a dramatic tanda (Pugliese) is slow or moody",
    severity: "should-fix",
    source: `${J} S10`,
  },
  {
    key: "cueVals",
    label: "The cortina before a vals is no hotter than the vals + 4",
    severity: "should-fix",
    source: `${J} S10`,
  },
  {
    key: "cuePlace",
    label:
      "Cortina placement: no slow cue into a vals, a milonga or a tanda over e70; into e75+ up or medium and ≥ e60; after Pugliese an up cue ≥ e70, into him ≤ e70 and not up; never the same cue twice in a row",
    severity: "should-fix",
    source: `engine rules of rounds 10–11 (docs/specs/round10-engine.md, round11-engine.md), kept by every round-14 repair; ${J} S10`,
  },
  {
    key: "cueAudio",
    label: "Every cortina has audio (resolved or streamable)",
    severity: "should-fix",
    source: `${G} §1.5, §3 R12`,
  },
];
const DEF = new Map(STRICT_RULES.map((r) => [r.key, r]));

type Night = Pick<Playlist, "tandas" | "closing" | "options"> & Partial<Pick<Playlist, "opening">>;

/** a side the floor can stream tonight (a Spotify match or a resolved preview/stream) */
export const streamable = (s: Pick<Song, "spotify" | "resolved">) => !!(s.spotify || s.resolved);
const isCump = (s: Song) => /cumparsita/i.test(s.title);
const dance = (t: Tanda) => t.songs.filter((s) => !isCump(s));
const fameOf = (s: Song) => s.fame ?? 0;
export const meanFame = (t: Pick<Tanda, "songs">) => meanFameOf(t.songs);
export { isPeakSlot };

/** the singers the dancer counts as lyrical, never a peak (dancer R14-7b) */
const LYRICAL_SINGERS = ["maure", "iriarte", "beron"];
const surname = (s: string | null | undefined) =>
  normTitle(s ?? "")
    .split(" ")
    .pop() ?? "";

/** the nine must-have families of a golden Istanbul night (DJ review §2.11, S5) */
export const MUST_HAVE: Array<{
  id: string;
  label: string;
  orchestraId: string;
  singers?: string[];
  instrumental?: boolean;
  tangoOnly?: boolean;
}> = [
  {
    id: "darienzo-echague",
    label: "D'Arienzo / Echagüe",
    orchestraId: "juan-d-arienzo",
    singers: ["echague"],
  },
  {
    id: "disarli-rufino",
    label: "Di Sarli / Rufino (tango)",
    orchestraId: "carlos-di-sarli",
    singers: ["rufino"],
    tangoOnly: true,
  },
  {
    id: "troilo-fiorentino",
    label: "Troilo / Fiorentino (tango)",
    orchestraId: "anibal-troilo",
    singers: ["fiorentino"],
    tangoOnly: true,
  },
  { id: "pugliese", label: "Pugliese (tango)", orchestraId: "osvaldo-pugliese", tangoOnly: true },
  { id: "biagi", label: "Biagi", orchestraId: "rodolfo-biagi" },
  {
    id: "tanturi",
    label: "Tanturi / Castillo or Campos (tango)",
    orchestraId: "ricardo-tanturi",
    singers: ["castillo", "campos"],
    tangoOnly: true,
  },
  { id: "calo", label: "Caló / Berón or Iriarte", orchestraId: "miguel-calo", singers: ["beron", "iriarte"] },
  { id: "dagostino", label: "D'Agostino / Vargas", orchestraId: "angel-d-agostino", singers: ["vargas"] },
  {
    id: "laurenz",
    label: "Láurenz / Casas or Podestá",
    orchestraId: "pedro-laurenz",
    singers: ["casas", "podesta"],
  },
];
export const MUST_HAVE_MIN = 8;
export function mustHaveOf(t: Pick<Tanda, "orchestraId" | "singer" | "vocal" | "rhythm">): string | null {
  for (const f of MUST_HAVE) {
    if (f.orchestraId !== t.orchestraId) continue;
    if (f.tangoOnly && t.rhythm !== "tango") continue;
    if (f.singers && !(t.vocal && f.singers.includes(surname(t.singer)))) continue;
    return f.id;
  }
  return null;
}
export const mustHavesOf = (tandas: Tanda[]) =>
  new Set(tandas.map(mustHaveOf).filter((x): x is string => !!x));

/** the clock hour (0-based) each tanda's midpoint falls in */
export function tandaHours(n: Night): number[] {
  const fb = n.options.cortinaLengthSec ?? 45;
  let at = n.opening ? (n.opening.durationSec ?? 170) : 0;
  return n.tandas.map((t) => {
    const len = t.songs.reduce((a, s) => a + (s.durationSec ?? 170), 0);
    const h = Math.floor((at + len / 2) / 3600);
    at += len + (t.cortina ? (t.cortina.lengthSec ?? fb) : 0);
    return h;
  });
}
/** the hour buckets the way the benchmark reads them: a last hour of fewer than 3 tandas joins the one before */
export function hourBuckets(n: Night): number[][] {
  const hs = tandaHours(n);
  const out: number[][] = [];
  hs.forEach((h, i) => {
    if (!out[h]) out[h] = [];
    out[h]!.push(i);
  });
  const buckets = out.filter((b) => b?.length);
  const last = buckets.at(-1);
  if (buckets.length > 1 && last && last.length < 3) {
    buckets[buckets.length - 2]!.push(...last);
    buckets.pop();
  }
  return buckets;
}

const yearsOf = (t: Tanda) =>
  dance(t)
    .map((s) => s.year)
    .filter((y): y is number => !!y);
const meanYear = (t: Tanda) => {
  const ys = yearsOf(t);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
};
const monthOf = (s: Song) => {
  const m = /^(\d{4})-(\d{2})/.exec(s.date ?? "");
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : (s.year ?? 0) * 12 + 6;
};
/** the curated line-up period a set of sides falls in (D'Arienzo instrumentals: before 1938-07, to 1940-06, after) */
export function lineupPeriod(orchestraId: string, vocal: boolean, songs: Song[]): number {
  return periodOf({ orchestraId, vocal, songs } as Tanda);
}
function periodOf(t: Pick<Tanda, "orchestraId" | "vocal" | "songs">): number {
  const p = staticProfile(t.orchestraId);
  const ms = t.songs.filter((s) => !isCump(s)).map(monthOf);
  const m = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
  let k = 0;
  for (const b of p?.lineupBreaks ?? []) {
    if (b.vocal !== undefined && b.vocal !== t.vocal) continue;
    const x = /^(\d{4})-(\d{2})/.exec(b.at);
    if (x && m >= Number(x[1]) * 12 + Number(x[2]) - 1) k++;
  }
  return k;
}
const cls = (t: Tanda) => styleClass(t);
const isRhythmic = (t: Tanda) => cls(t) === "R" || cls(t) === "R+";
/** the cortina's audio: a resolved stream or preview, or a Spotify id; "no-audio" marks a cue that resolved to nothing */
export const cueHasAudio = (c: Cortina) =>
  !c.tags?.includes("no-audio") && (c.resolved !== null || !!c.spotify);
const MOODY = ["melancholic", "nostalgic", "ballad", "lament", "classic"];
export const cueMoody = (c: Cortina) =>
  cortinaTempo(c) === "slow" || MOODY.some((m) => c.tags?.includes(`mood:${m}`));

/** Run every strict-panel rule on a night. Pure and deterministic. */
export function strictChecks(n: Night): StrictResult {
  const t = n.tandas;
  const o = n.options;
  const golden = isGoldenNight(o);
  const yr = o.yearRange;
  const out = new Map<string, { applies: boolean; v: StrictViolation[] }>();
  for (const r of STRICT_RULES) out.set(r.key, { applies: true, v: [] });
  const not = (key: string) => {
    out.get(key)!.applies = false;
  };
  const add = (key: string, tanda: number, detail: string) =>
    out.get(key)!.v.push({ rule: key, severity: DEF.get(key)!.severity, tanda, detail });
  const name = (x: Tanda) =>
    `${x.orchestra}${x.vocal && x.singer ? ` / ${x.singer}` : x.vocal ? "" : " instr."}`;
  const last = t.length - 1;
  const hours = tandaHours(n);
  const lastHour = Math.max(0, ...hours);
  const nightH = n.tandas.length ? lastHour + 1 : 0;

  // B — hard filters
  if (!yr) not("range");
  t.forEach((x, i) => {
    for (const s of dance(x)) {
      if (yr && (!s.year || s.year < yr[0] || s.year > yr[1]))
        add("range", i, `${s.title} (${s.year ?? "undated"}) outside ${yr[0]}–${yr[1]}`);
      if (!s.year || s.yearApprox || s.dateRange || s.undatedCompilation)
        add("dated", i, `${s.title} is not a dated studio side`);
      if (songRhythm(s) !== x.rhythm) add("rhythm", i, `${s.title} is a ${s.rhythm}, not a ${x.rhythm}`);
    }
  });

  // C — fame (golden nights: the reference corpus is the golden canon)
  const fameRules = [
    "fame0",
    "fameMean",
    "heatLabel",
    "opener",
    "lastSide",
    "peakHits",
    "lastFour",
    "stream",
    "suspectCredit",
  ];
  if (!golden) for (const k of fameRules) not(k);
  else {
    t.forEach((x, i) => {
      const ss = dance(x);
      if (!ss.length) return;
      const zero = ss.filter((s) => fameOf(s) === 0).length;
      if (zero > 1) add("fame0", i, `${name(x)}: ${zero} sides of fame 0`);
      const mf = meanFame(x);
      const hot = isPeakSlot(x) || (hours[i] === lastHour && nightH >= 3);
      const need = hot ? 3 : 2.5;
      if (mf < need - 1e-9) add("fameMean", i, `${name(x)}: mean fame ${mf.toFixed(2)} < ${need}`);
      if (x.heat?.label === "fantastic" && mf < 3 - 1e-9)
        add("heatLabel", i, `${name(x)} labelled fantastic at mean fame ${mf.toFixed(2)}`);
      const first = ss[0]!;
      const fNeed = isPeakSlot(x) ? 4 : 3;
      if (fameOf(first) < fNeed)
        add("opener", i, `${name(x)} opens on ${first.title} (fame ${fameOf(first)})`);
      const lastS = ss[ss.length - 1]!;
      const max = Math.max(...ss.map(fameOf));
      if (fameOf(lastS) < max - 1 || (lastS.role === "opener" && ss.length > 1))
        add("lastSide", i, `${name(x)} ends on ${lastS.title} (fame ${fameOf(lastS)}, max ${max})`);
      if (x.peak) {
        const hits = ss.filter((s) => fameOf(s) >= 4).length;
        const lyrical = x.vocal && LYRICAL_SINGERS.includes(surname(x.singer));
        if (hits < 2 || fameOf(lastS) < 4 || !isRhythmic(x) || lyrical)
          add(
            "peakHits",
            i,
            `${name(x)} at a planned peak: ${hits} sides of fame ≥ 4${fameOf(lastS) < 4 ? ", last side not a hit" : ""}${!isRhythmic(x) ? `, style ${cls(x)}` : ""}${lyrical ? ", a lyrical singer" : ""}`,
          );
      }
      const un = ss.filter((s) => !streamable(s)).length;
      const zeroOk = i !== 0 && i !== last && !x.peak;
      if (un > (zeroOk ? 1 : 0)) add("stream", i, `${name(x)}: ${un} sides with no stream`);
      for (const s of ss)
        if (s.suspectCredit && (i === 0 || isPeakSlot(x) || s === first))
          add("suspectCredit", i, `${s.title} (${s.orchestra}) carries a suspect credit`);
    });
    if (t.length >= 6 && nightH >= 3) {
      const four = t.slice(Math.max(0, last - 4), last);
      const ms = four.map(meanFame);
      const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
      if (avg < 3.5 - 1e-9 || ms.some((m) => m < 2.5 - 1e-9))
        add(
          "lastFour",
          -1,
          `tandas ${last - 3}–${last}: mean fame ${avg.toFixed(2)}, lowest ${Math.min(...ms).toFixed(2)}`,
        );
    } else not("lastFour");
  }
  // the closer
  const cl = n.closing;
  if (!cl || !golden) not("closer");
  else {
    const why: string[] = [];
    if (!streamable(cl)) why.push("no stream");
    if (fameOf(cl) < 2) why.push(`fame ${fameOf(cl)}`);
    if (yr && (!cl.year || cl.year < yr[0] || cl.year > yr[1])) why.push(`${cl.year} outside the range`);
    if (why.length) add("closer", t.length, `${cl.orchestra} ${cl.year ?? ""}: ${why.join(", ")}`);
  }

  // D — structure (golden nights)
  const structure = [
    "colourPeak",
    "colourBudget",
    "hotSlot",
    "dramaticAfterSummit",
    "pugliesePlace",
    "rhythmicRun",
    "darienzoPeak",
    "rotation",
    "singerOnce",
    "canon",
    "instrHour",
    "vocalBand",
    "wedge",
    "valley",
    "peakRun",
  ];
  if (!golden) for (const k of structure) not(k);
  else {
    const colour = t.map((x, i) => (isColour(staticProfile(x.orchestraId)) ? i : -1)).filter((i) => i >= 0);
    for (const i of colour)
      if (isPeakSlot(t[i]!))
        add("colourPeak", i, `${name(t[i]!)} (colour) at a peak slot, target ${t[i]!.targetEnergy}`);
    if (o.rules?.colourTanda === false) {
      const cap = Math.max(1, Math.round((2 * Math.max(1, nightH)) / 4));
      if (colour.length > cap) add("colourBudget", -1, `${colour.length} colour tandas (≤ ${cap})`);
      for (let k = 1; k < colour.length; k++)
        if (colour[k]! - colour[k - 1]! < 4)
          add("colourBudget", colour[k]!, `colour tandas at ${colour[k - 1]! + 1} and ${colour[k]! + 1}`);
    } else not("colourBudget");
    t.forEach((x, i) => {
      if (x.targetEnergy < 78 || i === last) return;
      const p = staticProfile(x.orchestraId);
      if ((p?.tier ?? 3) > 1 || isColour(p))
        add(
          "hotSlot",
          i,
          `${name(x)} (tier ${p?.tier ?? "?"}${isColour(p) ? ", colour" : ""}) at target ${x.targetEnergy}`,
        );
      if (x.energy < x.targetEnergy - 8)
        add("hotSlot", i, `${name(x)} e${x.energy} for target ${x.targetEnergy}`);
    });
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1]!,
        b = t[i]!;
      if (cls(b) !== "D" || cls(a) !== "R+") continue;
      const my = meanYear(a);
      if (a.peak || (my !== null && my <= 1940))
        add("dramaticAfterSummit", i, `${name(a)} (R+${a.peak ? ", summit" : ""}) straight into ${name(b)}`);
    }
    const summits = t.map((x, i) => (x.peak ? i : -1)).filter((i) => i >= 0);
    const pug = t
      .map((x, i) => (x.orchestraId === "osvaldo-pugliese" && x.rhythm === "tango" ? i : -1))
      .filter((i) => i >= 0);
    if (o.arcShape === "double" && summits.length >= 2 && pug.length) {
      const s = summits[summits.length - 1]!;
      for (const p of pug)
        if (p !== last && !(s - p >= 2 && s - p <= 4))
          add("pugliesePlace", p, `Pugliese at ${p + 1}, the last summit at ${s + 1}`);
    } else not("pugliesePlace");
    const tango = t.map((x, i) => ({ x, i })).filter(({ x }) => x.rhythm === "tango");
    for (let k = 2; k < tango.length; k++)
      if ([0, 1, 2].every((d) => isRhythmic(tango[k - d]!.x)))
        add("rhythmicRun", tango[k]!.i, `three rhythmic tango tandas in a row ending at ${tango[k]!.i + 1}`);
    const rpI = tango.map((r, k) => ({ ...r, k })).filter(({ x }) => cls(x) === "R+" && !x.vocal);
    for (let k = 1; k < rpI.length; k++)
      if (rpI[k]!.k - rpI[k - 1]!.k < 3)
        add("rhythmicRun", rpI[k]!.i, `R+ instrumentals at ${rpI[k - 1]!.i + 1} and ${rpI[k]!.i + 1}`);
    t.forEach((x, i) => {
      if (!x.peak || x.orchestraId !== "juan-d-arienzo" || x.rhythm !== "tango") return;
      const ys = yearsOf(x);
      const lo = Math.min(...ys),
        hi = Math.max(...ys);
      const ok = x.vocal
        ? surname(x.singer) === "echague" && lo >= 1938 && hi <= 1939
        : lo >= 1937 && hi <= 1940;
      if (!ok)
        add(
          "darienzoPeak",
          i,
          `D'Arienzo ${x.vocal ? `/ ${x.singer}` : "instrumental"} ${lo}–${hi} at a planned peak`,
        );
    });
    const byOrch = new Map<string, number[]>();
    tango.forEach(({ x, i }) => byOrch.set(x.orchestraId, [...(byOrch.get(x.orchestraId) ?? []), i]));
    for (const [id, is] of byOrch) {
      if (is.length < 2) continue;
      const keys = new Map<string, number>();
      for (const i of is) {
        const x = t[i]!;
        const k = `${periodOf(x)}|${x.vocal ? surname(x.singer) : "instr"}`;
        if (keys.has(k))
          add("rotation", i, `${name(x)} shares sub-period and mode with tanda ${keys.get(k)! + 1}`);
        else keys.set(k, i);
      }
      if (id === "juan-d-arienzo" && is.length >= 3 && !is.some((i) => t[i]!.vocal))
        add("rotation", is[2]!, `${is.length} D'Arienzo tango tandas, none vocal`);
    }
    const singers = new Map<string, number[]>();
    t.forEach((x, i) => {
      if (!x.vocal || !x.singer) return;
      const k = surname(x.singer);
      singers.set(k, [...(singers.get(k) ?? []), i]);
    });
    for (const [, is] of singers) {
      const tg = is.filter((i) => t[i]!.rhythm === "tango");
      if (tg.length > 1)
        add(
          "singerOnce",
          tg[1]!,
          `${t[tg[1]!]!.singer} sings tango tandas ${tg.map((i) => i + 1).join(", ")}`,
        );
      else if (is.length > 2) add("singerOnce", is[2]!, `${t[is[2]!]!.singer} sings ${is.length} tandas`);
    }
    // (an explicit "more instrumental" bias is the DJ's call: the mostly vocal canon yields to it)
    if ((nightH >= 4 || (n.tandas.length >= 20 && nightH >= 3)) && (o.vocalBias ?? 0) > -0.2) {
      const have = mustHavesOf(t);
      if (have.size < MUST_HAVE_MIN)
        add(
          "canon",
          -1,
          `${have.size}/9 must-have families (missing ${MUST_HAVE.filter((f) => !have.has(f.id))
            .map((f) => f.label)
            .join(", ")})`,
        );
    } else not("canon");
    {
      const tg = t.filter((x) => x.rhythm === "tango");
      const band = o.rules?.vocalShare ?? [0.55, 0.75];
      const v = tg.length ? tg.filter((x) => x.vocal).length / tg.length : 0;
      // (an explicit vocal bias — "more vocal", "more instrumental" — is the DJ's own call)
      if (tg.length >= 6 && Math.abs(o.vocalBias ?? 0) < 0.2 && (v < band[0] - 1e-9 || v > band[1] + 1e-9))
        add(
          "vocalBand",
          -1,
          `vocal tango share ${Math.round(v * 100)} % outside ${Math.round(band[0] * 100)}–${Math.round(band[1] * 100)} %`,
        );
    }
    // (and an explicit "more vocal" bias outranks the hourly instrumental rule)
    if ((o.vocalBias ?? 0) >= 0.2) not("instrHour");
    else
      for (const b of hourBuckets(n))
        if (!b.some((i) => t[i]!.rhythm === "tango" && !t[i]!.vocal))
          add(
            "instrHour",
            b[0]!,
            `hour of tandas ${b[0]! + 1}–${b[b.length - 1]! + 1} has no instrumental tango tanda`,
          );
    let run = 0;
    if ((o.vocalBias ?? 0) < 0.2)
      for (const { x, i } of tango) {
        run = x.vocal ? run + 1 : 0;
        if (run === 4) add("instrHour", i, `four vocal tango tandas in a row ending at ${i + 1}`);
      }
    if (t.length >= 4 && nightH >= 3) {
      const ult = t[last]!;
      const wi = last - 1;
      const w = t[wi]!;
      const why: string[] = [];
      if (w.energy < ult.energy - 12) why.push(`e${w.energy} for última e${ult.energy}`);
      const lh = t.map((x, i) => ({ x, i })).filter(({ i }) => hours[i] === lastHour && i < last);
      if (
        lh.length >= 2 &&
        w.energy <= Math.min(...lh.map((r) => r.x.energy)) &&
        lh.some((r) => r.x.energy > w.energy)
      )
        why.push("the lowest tanda of the last hour");
      const un = dance(w).filter((s) => !streamable(s)).length;
      if (un) why.push(`${un} sides with no stream`);
      if (why.length) add("wedge", wi, `${name(w)} before the última: ${why.join(", ")}`);
    } else not("wedge");
    let low = 0;
    t.forEach((x, i) => {
      if (hours[i] === 0 || i === last) {
        low = 0;
        return;
      }
      low = x.energy < 65 ? low + 1 : 0;
      if (low === 3) add("valley", i, `three tandas under e65 ending at ${i + 1}`);
    });
    let pr = 0;
    t.forEach((x, i) => {
      pr = x.phase === "peak" || x.targetEnergy >= 80 ? pr + 1 : 0;
      if (pr === 4) add("peakRun", i, `four peak slots in a row ending at ${i + 1}`);
    });
  }
  // repeat gaps
  {
    const g = o.orchestraRepeatGap ?? 6;
    const sg = o.singerRepeatGap ?? 4;
    t.forEach((x, i) => {
      for (let j = Math.max(0, i - g + 1); j < i; j++)
        if (t[j]!.orchestraId === x.orchestraId) add("gap", i, `${x.orchestra} at ${j + 1} and ${i + 1}`);
      if (x.vocal && x.singer)
        for (let j = Math.max(0, i - sg); j < i; j++)
          if (
            t[j]!.vocal &&
            surname(t[j]!.singer) === surname(x.singer) &&
            t[j]!.orchestraId !== x.orchestraId
          )
            add("gap", i, `${x.singer} at ${j + 1} and ${i + 1}`);
    });
  }
  // F — cortinas (the cue after tanda i leads into tanda i + 1)
  const cues = t
    .map((x, i) => ({ c: x.cortina, i }))
    .filter((r): r is { c: Cortina; i: number } => !!r.c && r.i < last);
  if (!cues.length)
    for (const k of ["cueRisk", "cueArtist", "cueSlowPeak", "cueDramatic", "cueVals", "cuePlace", "cueAudio"])
      not(k);
  else {
    const seen = new Map<string, number[]>();
    cues.forEach(({ c, i }, k) => {
      const nx = t[i + 1]!;
      if (c.tags?.includes("danceable-risk"))
        add("cueRisk", i, `${c.title} (${c.artist}) invites the floor to stay`);
      const a = normTitle(c.artist);
      const prev = seen.get(a) ?? [];
      if (prev.length >= 2) add("cueArtist", i, `${c.artist} a third time (cue ${i + 1})`);
      else if (prev.length && k - prev[prev.length - 1]! < 4)
        add("cueArtist", i, `${c.artist} on cues ${cues[prev[prev.length - 1]!]!.i + 1} and ${i + 1}`);
      seen.set(a, [...prev, k]);
      if (nx.targetEnergy >= 78 && cortinaTempo(c) === "slow")
        add("cueSlowPeak", i, `slow ${c.title} before ${name(nx)} (target ${nx.targetEnergy})`);
      if (cls(nx) === "D" && nx.rhythm === "tango" && !cueMoody(c))
        add("cueDramatic", i, `${c.title} (${cortinaTempo(c)}) before ${name(nx)}`);
      if (nx.rhythm === "vals" && c.energy > nx.energy + 4)
        add("cueVals", i, `${c.title} e${c.energy} before a vals at e${nx.energy}`);
      if (!cueHasAudio(c)) add("cueAudio", i, `${c.title} (${c.artist}) has no audio`);
      const pv = t[i]!;
      const tempo = cortinaTempo(c);
      const dN = cls(nx) === "D" && nx.rhythm === "tango";
      const dP = cls(pv) === "D" && pv.rhythm === "tango";
      const why = [
        nx.rhythm !== "tango" && tempo === "slow" ? `slow into a ${nx.rhythm}` : "",
        tempo === "slow" && nx.energy > 70 ? `slow into e${nx.energy}` : "",
        nx.energy >= 75 && (tempo === "slow" || c.energy < 60)
          ? `e${c.energy} ${tempo} into e${nx.energy}`
          : "",
        dN && (c.energy > 70 || tempo === "up") ? "too hot before Pugliese" : "",
        dP && !dN && (c.energy < 70 || tempo !== "up") ? "no lift after Pugliese" : "",
        k > 0 && cues[k - 1]!.c.id === c.id ? "the same cue twice in a row" : "",
      ].filter(Boolean);
      if (why.length) add("cuePlace", i, `${c.title}: ${why.join(", ")}`);
    });
  }

  const rules: StrictRuleResult[] = STRICT_RULES.map((r) => {
    const x = out.get(r.key)!;
    return {
      ...r,
      applies: x.applies,
      pass: !x.applies || x.v.length === 0,
      violations: x.applies ? x.v : [],
    };
  });
  const violations = rules.flatMap((r) => r.violations);
  const blockers = violations.filter((v) => v.severity === "blocker").length;
  const shouldFix = violations.length - blockers;
  return { rules, violations, blockers, shouldFix, penalty: blockers * 10 + shouldFix };
}

/** a one-line summary: "0 blockers · 2 should-fix (canon, wedge)" */
export function strictSummary(r: StrictResult): string {
  const keys = [...new Set(r.violations.map((v) => v.rule))];
  return `${r.blockers} blockers · ${r.shouldFix} should-fix${keys.length ? ` (${keys.join(", ")})` : ""}`;
}
