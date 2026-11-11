import { ACTIVE_CATALOG } from "./active";
import { patternString } from "./arc";
import { cortinaTempo, cueMetaOk } from "./cortinas";
import { normTitle } from "./energy";
import { goldenClassOf, isColour, isGoldenNight, staticProfile } from "./knowledge";
import { cliffOf, isPeakSlot, meanFameOf, type OrderCtx, orderVerdictOf } from "./order";
import { NEVER_OPEN, OPENERS } from "./rules";
import { isTandaEligible, songRhythm } from "./tanda";
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
const D15 = "docs/reviews/round15-dancer.md";
const J15 = "docs/reviews/round15-dj.md";
const G15 = "docs/reviews/round15-discography.md";
const D16 = "docs/reviews/round16-dancer.md";
const J16 = "docs/reviews/round16-dj.md";
const D17 = "docs/reviews/round17-dancer.md";
const J17 = "docs/reviews/round17-dj.md";

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
    label:
      "The last side is among the tanda's best (fame ≥ max − 1), never an opener-role side (unless it cuts a release cliff into the next tanda to ≤ 16, or the tanda opens on its corpus closer to cut one from the previous tanda)",
    severity: "should-fix",
    source: `${D} R14-17; ${J17} §2`,
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
      "Tango-only sequence: no three rhythmic tandas in a row when ≥ 2 are hard-drive (R+) or the run reaches the build, a peak or a target ≥ 74; two R+ tangos never adjacent; two R+ instrumentals ≥ 2 tandas apart",
    severity: "should-fix",
    source: `${J} S1; ${J16} §6 (retuned), R16-6`,
  },
  {
    key: "darienzoPeak",
    label:
      "D'Arienzo at a planned peak: Echagüe 1938–39 or instrumental 1937–40 (1935–40 with a fame-5 side and mean fame ≥ 3.75), never Mauré",
    severity: "should-fix",
    source: `${J} S2; ${D} R14-7; ${J17} §2 (retuned)`,
  },
  {
    key: "rotation",
    label:
      "An orchestra's tango tandas never share sub-period and mode (once a night: ≥ 12 apart, no shared title, one a summit); three D'Arienzo tandas include a vocal one",
    severity: "should-fix",
    source: `${J} S3; ${J17} §2 (retuned)`,
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
      "The tanda before the última: energy ≥ última − 12, not the last hour's lowest (a lyrical tango of mean fame ≥ 4.5 behind a cue into the última that is not slow may), every side streams",
    severity: "should-fix",
    source: `${J} S7; ${D} R14-9; ${J17} §2, ${D17} §2 (retuned)`,
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
  // round 15 (docs/specs/round15-engine.md)
  {
    key: "cycle",
    label:
      "Classic cycle: every tanda before the última is TTVTTM[i mod 6], the última a tango, never three tangos in a row, valses = milongas ± 1, the first vals within 40 minutes",
    severity: "blocker",
    source: `${D15} N1 (R15-1); ${J15} N1`,
  },
  {
    key: "vocalSide",
    label: "A singer's tanda holds only that singer's sides; an instrumental tanda no sung side",
    severity: "blocker",
    source: `${G15} §5 R6b (Recuerdo, Trago amargo)`,
  },
  {
    key: "afterSummit",
    label:
      "The tanda after the last summit: energy ≥ summit − 18, not a lyrical (L) tango, and the cortina between them not slow",
    severity: "should-fix",
    source: `${D15} N2 (R15-2); ${J15} N3`,
  },
  {
    key: "energyStep",
    label:
      "Adjacent tandas differ by at most 16 points of energy (20 for a planned lift into a summit or release; 22 for a lift into a vals or milonga behind an up-tempo cue, the vals ≤ its target + 6; a release from a vals or milonga into a lyrical tango up to 10 more when the boundary sides step ≤ 16 behind a slow cue)",
    severity: "should-fix",
    source: `${D15} N8 (R15-8); ${J15} N11; ${J16} §6, ${J17} §2 (retuned)`,
  },
  {
    key: "hotCold",
    label:
      "A hard-drive tanda over its target straight into one under its target while the plan rises: the boundary sides within 15",
    severity: "should-fix",
    source: `${J15} N2`,
  },
  {
    key: "firstVals",
    label: "The warm-up vals: energy ≤ max(its target + 10, 72), its last side ≤ max(78, target + 15)",
    severity: "should-fix",
    source: `${J15} N8; ${J16} §6 (retuned), R16-5`,
  },
  {
    key: "lastSummit",
    label: "The last summit holds a fame-5 side and a mean fame ≥ 3.75",
    severity: "should-fix",
    source: `${D15} N5 (R15-5)`,
  },
  {
    key: "ultima",
    label:
      "The última: a golden-core family, every side fame ≥ 3, mean ≥ 4 and within 0.75 of the night's best vocal tango tanda",
    severity: "should-fix",
    source: `${D15} N7 (R15-7); ${J15} N4`,
  },
  {
    key: "bestWindow",
    label: "A tanda's mean fame is within 0.75 of its family's best window still free tonight",
    severity: "should-fix",
    source: `${D15} N6 (R15-6); ${J15} N8 (D'Agostino 1941)`,
  },
  {
    key: "instrCharacter",
    label:
      "Two adjacent instrumental tango tandas differ in character (rhythmic vs lyrical, balanced, dramatic)",
    severity: "should-fix",
    source: `${J15} N5`,
  },
  {
    key: "stream3",
    label: "A 3-side tanda: every side streams and none has fame 0",
    severity: "should-fix",
    source: `${D15} N3 (R15-3); ${J15} N7`,
  },
  {
    key: "streamNight",
    label:
      "At most one unstreamable side a night, only when its family has no streamable alternative, the tanda is core with heat ≥ 3 and its other sides' mean fame ≥ 4",
    severity: "should-fix",
    source: `${J15} N7; ${D15} N3; ${J16} R16-2; ${D16} A1`,
  },
  {
    key: "suspectStream",
    label:
      "No side with a suspect stream (wrong date, short transfer, another singer's credit) opens, peaks or closes",
    severity: "should-fix",
    source: `${D15} N9 (R15-9); ${G15} §5 R4b–R4d`,
  },
  {
    key: "cueLength",
    label: "Every cortina within the setting ± 5 s and never over 50 s (unless the setting asks for more)",
    severity: "should-fix",
    source: `${D15} N4 (R15-4); ${J15} N6`,
  },
  {
    key: "cuePopPeak",
    label: "No dance-pop cortina straight before a planned summit or the última",
    severity: "should-fix",
    source: `${J15} N9; ${J16} R16-9`,
  },
  {
    key: "cuePopHour",
    label:
      "Up-tempo dance-pop cortinas: at most one an hour, never before a peak slot, a target ≥ 80 or the última (rock and medium-tempo pop are exempt)",
    severity: "should-fix",
    source: `${J15} N9 (round-14 S9 leftover); ${J16} §6 (retuned), R16-9; ${D16} §4`,
  },
  {
    key: "cueMeta",
    label:
      "Every cortina has a year and plays its original record (no duet, live, remix or re-recording album)",
    severity: "should-fix",
    source: `${G15} §1 cortinas, §5 R12b`,
  },
];
/** round 15 (the user's night-shape settings): the opener, the última and the closer follow the settings */
STRICT_RULES.push(
  {
    key: "nightShape",
    label:
      "Who opens and who closes follows the settings: the opener orchestra or rule, the última orchestra or rule, the closer (La Cumparsita, Felicia or none), the opening Cumparsita; a setting the year range cannot meet falls back visibly",
    severity: "blocker",
    source: `${D15} (settings round: "starts the night with which and ends with who, dynamic to settings")`,
  },
  {
    key: "sideOrder",
    label:
      "Inside a tanda: an inviting opener (fame ≥ 3; the slowest side may open), the best-loved side first, third or last, a dip only on a side less loved than both neighbours, no fade (last side ≥ mean − 8, within 1 of the top fame), a summit or the última ends on its strongest side, no back-and-forth across the years",
    severity: "should-fix",
    source: `${D15} (song-order round); ${D} R14-5, R14-17; ${D16} §4 (retuned), A4, A5; ${J16} §6, R16-8`,
  },
);
/** round 16 (docs/specs/round16-engine.md): the new real rules of the third panel */
STRICT_RULES.push(
  {
    key: "openerCanon",
    label:
      "Under the canon opener rule the opener is a non-colour core family with mean fame ≥ 4 and energy ≤ max(its target + 8, 62) (unless the DJ named the opener orchestra)",
    severity: "should-fix",
    source: `${J16} R16-1; ${D16} §3`,
  },
  {
    key: "heatFloor",
    label: "A first-tier, non-colour tanda on a golden night has heatmap minimum ≥ 3",
    severity: "should-fix",
    source: `${D16} A1; ${J16} R16-2`,
  },
  {
    key: "preSummit",
    label: "The slot before the last summit: mean fame ≥ 3.5 and energy ≥ its target − 8",
    severity: "should-fix",
    source: `${J16} R16-3; ${D16} §1 (seed 12 M17)`,
  },
  {
    key: "openCliff",
    label:
      "No side-level cliff: a tanda whose first side is > 15 below the previous tanda's last side opens on its fame-≥ 3 side nearest that side",
    severity: "should-fix",
    source: `${J16} R16-4; ${D16} §4 (Láurenz / Casas)`,
  },
  {
    key: "coolVals",
    label: "A vals after the last summit is not hotter than the summit",
    severity: "should-fix",
    source: `${J16} R16-7`,
  },
  {
    key: "orchestraCount",
    label: "A golden night carries at least 12 orchestras per 4 h",
    severity: "should-fix",
    source: `${J16} R16-11; ${D16} T3`,
  },
  {
    key: "closerVary",
    label:
      "With closer auto, the closing Cumparsita is not the última's orchestra when an in-range, streamable version of fame ≥ 2 by another orchestra exists",
    severity: "should-fix",
    source: `${J16} R16-10`,
  },
);
/** the rule keys the round-15 panel added (round15.test.ts tests them; round14.test.ts the older ones) */
export const R15_RULES = STRICT_RULES.filter((r) => r.source.includes("round15-")).map((r) => r.key);
const DEF = new Map(STRICT_RULES.map((r) => [r.key, r]));

type Night = Pick<Playlist, "tandas" | "closing" | "options"> & Partial<Pick<Playlist, "opening" | "stats">>;

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
      // (round 17, DJ §2: a corpus opener may close when it cuts a release cliff into the next tanda — the other
      // sides would step more than 16 down to its first side, this one ≤ 16)
      const nf = i < t.length - 1 ? dance(t[i + 1]!)[0]?.energy : undefined;
      const cut =
        nf !== undefined &&
        nf !== null &&
        (lastS.energy ?? 50) - nf <= 16 &&
        ss.some((s) => s !== lastS && (s.energy ?? 50) - nf > 16);
      // (and when the tanda opens on its corpus closer to cut a release cliff from the previous tanda, the roles are
      // displaced: its corpus opener may close — Caló / Berón opening on Qué Te Importa e61 after Lejos de Ti e77)
      const pl = i > 0 ? dance(t[i - 1]!).at(-1)?.energy : undefined;
      const displaced =
        pl !== undefined &&
        pl !== null &&
        first.role === "closer" &&
        pl - (first.energy ?? 50) <= 16 &&
        ss.some((s) => s !== first && pl - (s.energy ?? 50) > 16);
      if (fameOf(lastS) < max - 1 || (lastS.role === "opener" && ss.length > 1 && !cut && !displaced))
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
    // (round 16, DJ §6: a soft-rhythmic warm-up triple with one D'Arienzo is normal; the run is a fault when two of
    // its three are hard-drive, or it reaches the build, a peak or a target of 74)
    for (let k = 2; k < tango.length; k++) {
      const run = [0, 1, 2].map((d) => tango[k - d]!.x);
      if (!run.every(isRhythmic)) continue;
      const rp = run.filter((x) => cls(x) === "R+").length;
      const hot = run.some((x) => x.targetEnergy >= 74 || x.phase === "build" || x.phase === "peak");
      if (rp >= 2 || hot)
        add(
          "rhythmicRun",
          tango[k]!.i,
          `three rhythmic tango tandas in a row ending at ${tango[k]!.i + 1} (${rp >= 2 ? `${rp} hard-drive` : "in the build or at a peak, target ≥ 74"})`,
        );
    }
    // (R16-6: two hard-drive tangos are never adjacent in the night)
    for (let i = 1; i < t.length; i++)
      if (
        t[i]!.rhythm === "tango" &&
        t[i - 1]!.rhythm === "tango" &&
        cls(t[i]!) === "R+" &&
        cls(t[i - 1]!) === "R+"
      )
        add(
          "rhythmicRun",
          i,
          `two hard-drive (R+) tangos back to back: ${name(t[i - 1]!)} and ${name(t[i]!)}`,
        );
    const rpI = tango.map((r, k) => ({ ...r, k })).filter(({ x }) => cls(x) === "R+" && !x.vocal);
    for (let k = 1; k < rpI.length; k++)
      if (rpI[k]!.k - rpI[k - 1]!.k < 3)
        add("rhythmicRun", rpI[k]!.i, `R+ instrumentals at ${rpI[k - 1]!.i + 1} and ${rpI[k]!.i + 1}`);
    t.forEach((x, i) => {
      if (!x.peak || x.orchestraId !== "juan-d-arienzo" || x.rhythm !== "tango") return;
      const ys = yearsOf(x);
      const lo = Math.min(...ys),
        hi = Math.max(...ys);
      // (round 17, DJ §2: an instrumental summit may reach back to 1935 — Hotel Victoria — when it holds a fame-5
      // side and a mean fame ≥ 3.75; the 1937–40 window stands without them)
      const hook = dance(x).some((s) => fameOf(s) >= 5) && meanFame(x) >= 3.75 - 1e-9;
      const ok = x.vocal
        ? surname(x.singer) === "echague" && lo >= 1938 && hi <= 1939
        : (lo >= 1937 || (lo >= 1935 && hook)) && hi <= 1940;
      if (!ok)
        add(
          "darienzoPeak",
          i,
          `D'Arienzo ${x.vocal ? `/ ${x.singer}` : "instrumental"} ${lo}–${hi} at a planned peak`,
        );
    });
    const byOrch = new Map<string, number[]>();
    let rotationPass = false;
    tango.forEach(({ x, i }) => byOrch.set(x.orchestraId, [...(byOrch.get(x.orchestraId) ?? []), i]));
    for (const [id, is] of byOrch) {
      if (is.length < 2) continue;
      const keys = new Map<string, number>();
      for (const i of is) {
        const x = t[i]!;
        const k = `${periodOf(x)}|${x.vocal ? surname(x.singer) : "instr"}`;
        if (!keys.has(k)) {
          keys.set(k, i);
          continue;
        }
        const j = keys.get(k)!;
        // (round 17, DJ §2: once a night, two such tandas ≥ 12 apart that share no title and one of which is a
        // planned summit — the warm-up hook and the last summit — are the orchestra's two faces, not a repeat)
        const titles = new Set(dance(t[j]!).map((s) => normTitle(s.title)));
        const apart =
          !rotationPass &&
          i - j >= 12 &&
          !dance(x).some((s) => titles.has(normTitle(s.title))) &&
          (!!x.peak || !!t[j]!.peak);
        if (apart) rotationPass = true;
        else add("rotation", i, `${name(x)} shares sub-period and mode with tanda ${j + 1}`);
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
      const un = dance(w).filter((s) => !streamable(s)).length;
      // (round 17, DJ §2 and dancer §2: the classic "last romantic tanda" — a lyrical tango of mean fame ≥ 4.5 whose
      // sides all stream, the cue into the última not slow so the última still lifts — may sit low before the última)
      const romantic =
        w.rhythm === "tango" &&
        cls(w) === "L" &&
        meanFame(w) >= 4.5 - 1e-9 &&
        !un &&
        !!w.cortina &&
        cortinaTempo(w.cortina) !== "slow";
      if (w.energy < ult.energy - 12 && !romantic) why.push(`e${w.energy} for última e${ult.energy}`);
      const lh = t.map((x, i) => ({ x, i })).filter(({ i }) => hours[i] === lastHour && i < last);
      if (
        !romantic &&
        lh.length >= 2 &&
        w.energy <= Math.min(...lh.map((r) => r.x.energy)) &&
        lh.some((r) => r.x.energy > w.energy)
      )
        why.push("the lowest tanda of the last hour");
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

  round15(n, { add, not, golden, hours, lastHour, nightH, name, cues });
  shapeChecks(n, add);
  t.forEach((x, i) => {
    const why = orderVerdict(x, { summit: !!x.peak, ultima: i === t.length - 1 && t.length >= 6 });
    if (why.length) add("sideOrder", i, `${name(x)}: ${why.join(", ")}`);
    const prevLast = i > 0 ? dance(t[i - 1]!).at(-1)?.energy : undefined;
    const cliff = cliffOf(x.songs, prevLast ?? null);
    if (cliff) add("openCliff", i, `${name(x)} ${cliff}`);
  });
  round16(n, { add, not, golden, name });

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
  // (round 15: a song-order item weighs a quarter in the penalty — the order is mended by reordering, never by
  // trading a tanda-level rule for it)
  const order = violations.filter((v) => v.rule === "sideOrder").length;
  return { rules, violations, blockers, shouldFix, penalty: blockers * 10 + shouldFix - 0.75 * order };
}

/** a one-line summary: "0 blockers · 2 should-fix (canon, wedge)" */
export function strictSummary(r: StrictResult): string {
  const keys = [...new Set(r.violations.map((v) => v.rule))];
  return `${r.blockers} blockers · ${r.shouldFix} should-fix${keys.length ? ` (${keys.join(", ")})` : ""}`;
}

// --- round 15 --------------------------------------------------------------------------------------------------
const POP_TAGS = ["mood:pop", "mood:club", "mood:teen-pop", "danceable-risk", "danceable-risk-us"];
const POP_GENRES = ["pop", "kpop", "funk", "afrobeats", "balkan-pop", "ye-ye"];
/** a dance-pop cortina: the floor keeps dancing to it (Araba, Kuzu Kuzu) */
export const isDancePop = (c: Cortina) =>
  POP_TAGS.some((k) => c.tags?.includes(k)) || POP_GENRES.includes(c.genre);
/** round 16 (DJ R16-9): an up-tempo dance-pop cortina — (mood:pop or mood:club, or a pop genre) and tempo:up */
export const isUpDancePop = (c: Cortina) => isDancePop(c) && cortinaTempo(c) === "up";
/** a pop or rock cortina (DJ S9: at most one an hour) */
export const isPopRock = (c: Cortina) => isDancePop(c) || !!c.tags?.includes("mood:rock");
/** the classic cycle's patterns */
export const isClassicCycle = (o: Pick<Playlist["options"], "pattern" | "customPattern">) =>
  (o.pattern === "classic" || o.pattern === "TTVTTM" || o.pattern === "TTVTTM-strict") &&
  patternString(o as Playlist["options"]) === "TTVTTM";
/** a legal tanda count for the classic cycle: the última (a tango) never makes a third tango in a row */
export const cycleCountOk = (n: number) => n < 3 || ![2, 5].includes((n - 1) % 6);
/** the start of each tanda in seconds (the opening Cumparsita first) */
export function tandaStarts(n: Night): number[] {
  const fb = n.options.cortinaLengthSec ?? 45;
  let at = n.opening ? (n.opening.durationSec ?? 170) : 0;
  return n.tandas.map((t) => {
    const s = at;
    at +=
      t.songs.reduce((a, x) => a + (x.durationSec ?? 170), 0) + (t.cortina ? (t.cortina.lengthSec ?? fb) : 0);
    return s;
  });
}
const coarse = (t: Tanda) => (isRhythmic(t) ? "R" : cls(t));

/** the family of a tanda in the active catalogue: the sides the panel judges the tanda's window against */
function familySides(t: Tanda, yr: [number, number] | undefined): Song[] {
  const all = ACTIVE_CATALOG.byOrchestra?.get(t.orchestraId) ?? [];
  const sur0 = surname(t.singer);
  const p = staticProfile(t.orchestraId);
  return all.filter(
    (s) =>
      s.vocal === t.vocal &&
      (!t.vocal || surname(s.singer) === sur0) &&
      songRhythm(s) === t.rhythm &&
      !isCump(s) &&
      isTandaEligible(s) &&
      !s.streamSuspect &&
      !s.reissue &&
      // (a golden night streams every side its family can: an unstreamable side is no window)
      streamable(s) &&
      s.heat !== 0 &&
      !!s.year &&
      (!yr || (s.year >= yr[0] && s.year <= yr[1])) &&
      (!p?.goldenBands || goldenClassOf(p, [s.year]) !== "other"),
  );
}
/** the best mean fame a window of `need` sides within `spread` years reaches, from titles free tonight */
export function bestFreeWindow(
  sides: Song[],
  need: number,
  spread: number,
  free: (s: Song) => boolean,
): number | null {
  const byTitle = new Map<string, Song>();
  for (const s of sides) {
    if (!free(s)) continue;
    const k = normTitle(s.title);
    const prev = byTitle.get(k);
    if (!prev || fameOf(s) > fameOf(prev)) byTitle.set(k, s);
  }
  const xs = [...byTitle.values()];
  let best: number | null = null;
  for (const y of new Set(xs.map((s) => s.year!))) {
    const w = xs
      .filter((s) => s.year! >= y && s.year! <= y + spread)
      .map(fameOf)
      .sort((a, b) => b - a)
      .slice(0, need);
    if (w.length < need) continue;
    const m = w.reduce((a, b) => a + b, 0) / need;
    if (best === null || m > best) best = m;
  }
  return best;
}

function round15(
  n: Night,
  h: {
    add: (key: string, tanda: number, detail: string) => void;
    not: (key: string) => void;
    golden: boolean;
    hours: number[];
    lastHour: number;
    nightH: number;
    name: (x: Tanda) => string;
    cues: Array<{ c: Cortina; i: number }>;
  },
) {
  const { add, not, golden, hours, nightH, name } = h;
  const t = n.tandas;
  const o = n.options;
  const last = t.length - 1;
  // R15-1 — the classic cycle (a blocker on any night that asks for it)
  if (!isClassicCycle(o) || t.length < 3) not("cycle");
  else {
    const pat = "TTVTTM";
    const ch = (x: Tanda) => (x.rhythm === "vals" ? "V" : x.rhythm === "milonga" ? "M" : "T");
    t.forEach((x, i) => {
      if (i < last && ch(x) !== pat[i % 6])
        add("cycle", i, `tanda ${i + 1} is a ${x.rhythm} on a ${pat[i % 6]} slot of the cycle`);
    });
    if (t[last]!.rhythm !== "tango") add("cycle", last, `the última is a ${t[last]!.rhythm}`);
    let run = 0;
    t.forEach((x, i) => {
      run = x.rhythm === "tango" ? run + 1 : 0;
      if (run === 3) add("cycle", i, `three tango tandas in a row ending at ${i + 1}`);
    });
    const v = t.filter((x) => x.rhythm === "vals").length;
    const m = t.filter((x) => x.rhythm === "milonga").length;
    if (Math.abs(v - m) > 1) add("cycle", -1, `${v} vals and ${m} milonga tandas`);
    const fv = t.findIndex((x) => x.rhythm === "vals");
    const st = tandaStarts(n);
    if (fv < 0) add("cycle", -1, "no vals tanda");
    else if (st[fv]! > 40 * 60)
      add("cycle", fv, `the first vals starts at ${Math.round(st[fv]! / 60)} min (≤ 40)`);
  }
  // R6b — a singer's tanda holds only that singer's sides
  if (o.mixVocalInstrumental) not("vocalSide");
  else
    t.forEach((x, i) => {
      for (const s of dance(x))
        if (!!s.vocal !== !!x.vocal || (x.vocal && surname(s.singer) !== surname(x.singer)))
          add(
            "vocalSide",
            i,
            `${s.title} (${s.vocal ? (s.singer ?? "vocal") : "instrumental"}) in ${name(x)}`,
          );
    });
  const goldenOnly = [
    "afterSummit",
    "energyStep",
    "hotCold",
    "firstVals",
    "lastSummit",
    "ultima",
    "bestWindow",
    "instrCharacter",
    "stream3",
    "streamNight",
    "suspectStream",
  ];
  if (!golden) for (const k of goldenOnly) not(k);
  else {
    const summits = t.map((x, i) => (x.peak ? i : -1)).filter((i) => i >= 0);
    const s = summits.at(-1);
    if (s === undefined || s >= last) not("afterSummit");
    else {
      const a = t[s]!,
        b = t[s + 1]!;
      const why: string[] = [];
      if (b.energy < a.energy - 18) why.push(`e${a.energy} → e${b.energy}`);
      if (b.rhythm === "tango" && cls(b) === "L") why.push("a lyrical tango");
      if (a.cortina && cortinaTempo(a.cortina) === "slow") why.push(`slow cue ${a.cortina.title}`);
      if (why.length) add("afterSummit", s + 1, `${name(b)} after the summit: ${why.join(", ")}`);
    }
    for (let i = 1; i < t.length; i++) {
      const d = t[i]!.energy - t[i - 1]!.energy;
      // a planned lift or release (the plan itself moves 8 or more the same way: into a summit, the early
      // D'Arienzo, out of a peak) may take 20
      const dt = t[i]!.targetEnergy - t[i - 1]!.targetEnergy;
      const planned = t[i]!.peak || (Math.abs(dt) >= 8 && Math.sign(dt) === Math.sign(d));
      // round 16 (DJ §6): a tango → vals or milonga lift behind an up-tempo cue, the vals ≤ its target + 6, may take 22
      const cue = t[i - 1]!.cortina;
      const lift =
        d > 0 &&
        t[i - 1]!.rhythm === "tango" &&
        t[i]!.rhythm !== "tango" &&
        !!cue &&
        cortinaTempo(cue) === "up" &&
        t[i]!.energy <= t[i]!.targetEnergy + 6;
      const lim = lift ? 22 : planned ? 20 : 16;
      // round 17 (DJ §2, dancer §2): a release from a vals or milonga into a lyrical tango whose boundary sides step
      // ≤ 16 behind a slow cue is a release, not a cliff (Biagi / Ibáñez ending on Lejos de Ti e77 → Caló / Berón opening on Qué Te Importa e61)
      const la = dance(t[i - 1]!).at(-1),
        fb = dance(t[i]!)[0];
      const cut =
        d < 0 &&
        Math.abs(d) <= lim + 10 &&
        !!la &&
        !!fb &&
        (la.energy ?? 50) - (fb.energy ?? 50) <= 16 &&
        !t[i - 1]!.peak &&
        t[i - 1]!.rhythm !== "tango" &&
        t[i]!.rhythm === "tango" &&
        cls(t[i]!) === "L" &&
        !!cue &&
        cortinaTempo(cue) === "slow";
      if (Math.abs(d) > lim && !cut)
        add("energyStep", i, `${name(t[i - 1]!)} e${t[i - 1]!.energy} → ${name(t[i]!)} e${t[i]!.energy}`);
    }
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1]!,
        b = t[i]!;
      if (!(a.rhythm === "tango" && cls(a) === "R+" && a.energy - a.targetEnergy > 8)) continue;
      if (!(b.energy - b.targetEnergy < -10 && b.targetEnergy >= a.targetEnergy)) continue;
      const la = dance(a).at(-1),
        fb = dance(b)[0];
      if (la && fb && Math.abs((la.energy ?? 50) - (fb.energy ?? 50)) > 15)
        add(
          "hotCold",
          i,
          `${name(a)} ends on ${la.title} e${la.energy} into ${name(b)} opening on ${fb.title} e${fb.energy}`,
        );
    }
    const fv = t.findIndex((x) => x.rhythm === "vals");
    if (fv < 0) not("firstVals");
    else {
      const v = t[fv]!;
      const lastS = dance(v).at(-1);
      // (round 16, DJ §6: the arc plans the first vals below any warm-up-worthy vals of the corpus — max(target + 10, 72))
      if (
        v.energy > Math.max(v.targetEnergy + 10, 72) ||
        (lastS && (lastS.energy ?? 50) > Math.max(78, v.targetEnergy + 15))
      )
        add(
          "firstVals",
          fv,
          `${name(v)} e${v.energy} (last side e${lastS?.energy ?? "?"}) for target ${v.targetEnergy}`,
        );
    }
    if (s === undefined) not("lastSummit");
    else {
      const ss = dance(t[s]!);
      const five = ss.filter((x) => fameOf(x) >= 5).length;
      const mf = meanFame(t[s]!);
      if (!five || mf < 3.75 - 1e-9)
        add("lastSummit", s, `${name(t[s]!)}: ${five} fame-5 sides, mean fame ${mf.toFixed(2)}`);
    }
    if (t.length < 6 || nightH < 3) not("ultima");
    else {
      const u = t[last]!;
      const ss = dance(u);
      const mf = meanFame(u);
      const best = Math.max(
        0,
        ...t.filter((x, i) => i !== last && x.rhythm === "tango" && x.vocal).map(meanFame),
      );
      const why: string[] = [];
      if (u.golden !== undefined && u.golden !== "core") why.push(`golden ${u.golden}`);
      if (ss.some((x) => fameOf(x) < 3)) why.push(`a side of fame ${Math.min(...ss.map(fameOf))}`);
      if (mf < 4 - 1e-9) why.push(`mean fame ${mf.toFixed(2)} < 4`);
      if (mf < best - 0.75 - 1e-9)
        why.push(`${mf.toFixed(2)} vs the night's best vocal tango ${best.toFixed(2)}`);
      if (why.length) add("ultima", last, `${name(u)}: ${why.join(", ")}`);
    }
    // the family's best free window (needs the catalogue)
    if (!ACTIVE_CATALOG.byOrchestra) not("bestWindow");
    else {
      const spread = Math.min(2, o.maxYearSpread ?? 4);
      // (the early D'Arienzo instrumental is a seeded draw by design, round 8: its window is not judged)
      const earlyDA = t.findIndex((x) => x.orchestraId === "juan-d-arienzo" && x.rhythm === "tango");
      t.forEach((x, i) => {
        const ss = dance(x);
        if (!ss.length) return;
        if (i === earlyDA && !x.vocal && !x.peak && i / Math.max(1, last) < 0.35) return;
        const others = new Set(t.flatMap((y, j) => (j === i ? [] : y.songs.map((q) => normTitle(q.title)))));
        if (n.closing) others.add(normTitle(n.closing.title));
        // a D'Arienzo summit is judged inside its own years (DJ S2); years another tanda of the family plays are taken
        const yr: [number, number] | undefined =
          x.peak && x.orchestraId === "juan-d-arienzo" && x.rhythm === "tango"
            ? x.vocal
              ? [1938, 1939]
              : [1937, 1940]
            : o.yearRange;
        const taken = t
          .filter(
            (y, j) =>
              j !== i &&
              y.orchestraId === x.orchestraId &&
              y.rhythm === x.rhythm &&
              y.vocal === x.vocal &&
              surname(y.singer) === surname(x.singer) &&
              y.yearRange,
          )
          .map((y) => y.yearRange!);
        const free = (q: Song) =>
          !others.has(normTitle(q.title)) && !taken.some((r) => q.year! >= r[0] && q.year! <= r[1]);
        const best = bestFreeWindow(familySides(x, yr), ss.length, spread, free);
        const mf = meanFame(x);
        if (best !== null && mf < best - 0.75 - 1e-9)
          add(
            "bestWindow",
            i,
            `${name(x)} mean fame ${mf.toFixed(2)}, its best free window ${best.toFixed(2)}`,
          );
      });
    }
    // adjacent instrumental tangos (tango-only sequence) differ in character
    const tg = t.map((x, i) => ({ x, i })).filter(({ x }) => x.rhythm === "tango");
    for (let k = 1; k < tg.length; k++) {
      const a = tg[k - 1]!,
        b = tg[k]!;
      if (a.x.vocal || b.x.vocal) continue;
      if (coarse(a.x) === coarse(b.x))
        add(
          "instrCharacter",
          b.i,
          `${name(a.x)} and ${name(b.x)}: two ${coarse(a.x)} instrumentals in a row`,
        );
    }
    t.forEach((x, i) => {
      const ss = dance(x);
      if (!ss.length || ss.length > 3) return;
      const bad = ss.filter((q) => !streamable(q) || fameOf(q) === 0);
      if (bad.length)
        add(
          "stream3",
          i,
          `${name(x)}: ${bad.map((q) => `${q.title}${streamable(q) ? "" : " (no stream)"}${fameOf(q) ? "" : " (fame 0)"}`).join(", ")}`,
        );
    });
    const un = t.flatMap((x, i) => dance(x).map((q) => ({ q, i, x }))).filter(({ q }) => !streamable(q));
    un.forEach(({ q, i, x }, k) => {
      if (k >= 1) {
        add("streamNight", i, `${q.title}: a second unstreamable side tonight`);
        return;
      }
      // round 16 (dancer A1, DJ R16-2): the night's one exception is a core tanda of heat ≥ 3 whose other sides
      // average fame ≥ 4 — never an edge or uneven family let in because it had no other side
      const rest = dance(x).filter((z) => z !== q);
      const restFame = rest.length ? rest.reduce((a, z) => a + fameOf(z), 0) / rest.length : 0;
      if ((x.golden !== undefined && x.golden !== "core") || (x.heat?.min ?? 4) < 3 || restFame < 4 - 1e-9) {
        add(
          "streamNight",
          i,
          `${q.title} has no stream in ${name(x)} (${x.golden ?? "?"}, heat ${x.heat?.min ?? "?"}, other sides' fame ${restFame.toFixed(2)})`,
        );
        return;
      }
      if (!ACTIVE_CATALOG.byOrchestra || !x.yearRange) return;
      const used = new Set(t.flatMap((y) => y.songs.map((z) => normTitle(z.title))));
      const alt = familySides(x, o.yearRange).find(
        (z) =>
          streamable(z) &&
          fameOf(z) > 0 &&
          !used.has(normTitle(z.title)) &&
          z.year! >= x.yearRange![0] - 1 &&
          z.year! <= x.yearRange![1] + 1,
      );
      if (alt) add("streamNight", i, `${q.title} has no stream; ${alt.title} (${alt.year}) does`);
    });
    t.forEach((x, i) => {
      if (i !== 0 && i !== last && !x.peak) return;
      for (const q of dance(x))
        if (q.streamSuspect) add("suspectStream", i, `${q.title} (${name(x)}): the stream is suspect`);
    });
  }
  // cortinas
  const all = t.map((x, i) => ({ c: x.cortina, i })).filter((r): r is { c: Cortina; i: number } => !!r.c);
  if (!all.length || o.cortinaStyle === "none") {
    for (const k of ["cueLength", "cuePopPeak", "cuePopHour", "cueMeta"]) not(k);
    return;
  }
  const set = o.cortinaLengthSec ?? 45;
  const hi = Math.min(set + 5, Math.max(50, set));
  for (const { c, i } of all) {
    const l = c.lengthSec ?? set;
    if (l < set - 5 || l > hi) add("cueLength", i, `${c.title} ${l} s (setting ${set} s)`);
    if (!cueMetaOk(c))
      add("cueMeta", i, `${c.title} (${c.artist}): ${c.year ? "re-recorded audio" : "no year"}`);
  }
  const perHour = new Map<number, number>();
  for (const { c, i } of h.cues) {
    const nx = t[i + 1]!;
    const toPeak = nx.peak || i + 1 === last;
    if (isDancePop(c) && toPeak)
      add("cuePopPeak", i, `${c.title} (${c.artist}) before ${nx.peak ? "the summit" : "the última"}`);
    // round 16 (DJ §6, R16-9): only up-tempo dance-pop counts — Turkish rock and medium-tempo pop clear a floor fine
    if (isUpDancePop(c)) {
      const hr = hours[i] ?? 0;
      const k = (perHour.get(hr) ?? 0) + 1;
      perHour.set(hr, k);
      if (k > 1) add("cuePopHour", i, `${c.title}: up-tempo dance-pop cue ${k} in hour ${hr + 1}`);
      else if (!toPeak && (nx.phase === "peak" || nx.targetEnergy >= 80))
        add(
          "cuePopHour",
          i,
          `${c.title} (dance-pop) before ${name(nx)} (a peak slot, target ${nx.targetEnergy})`,
        );
    }
  }
}

// --- round 15: the night's shape and the order inside a tanda ------------------------------------------------
const styleOf = (id: string) => staticProfile(id)?.style ?? "balanced";
const fellBack = (n: Night, k: string) => !!n.stats?.settingFallbacks?.some((f) => f.startsWith(`${k}:`));
const isCumpTitle = (s: Song | null | undefined) => !!s && normTitle(s.title) === "la cumparsita";
/** what the settings ask of the opener, the última and the closer, and what the night holds */
export function shapeProblems(n: Night): Array<{ tanda: number; detail: string }> {
  const out: Array<{ tanda: number; detail: string }> = [];
  const t = n.tandas;
  if (!t.length) return out;
  const r = n.options.rules ?? {};
  const first = t[0]!,
    ult = t[t.length - 1]!;
  if (first.locked !== true) {
    if (r.openerOrchestra && !fellBack(n, "opener") && first.orchestraId !== r.openerOrchestra)
      out.push({ tanda: 0, detail: `opened by ${first.orchestra}, the setting names ${r.openerOrchestra}` });
    else if (!r.openerOrchestra && r.openerRule && r.openerRule !== "any" && first.rhythm === "tango") {
      const st = styleOf(first.orchestraId);
      const ok =
        r.openerRule === "canon"
          ? !!OPENERS[first.orchestraId] && !NEVER_OPEN.has(first.orchestraId)
          : r.openerRule === "lyrical"
            ? st === "lyrical" || st === "guardia"
            : st === "rhythmic";
      if (!ok)
        out.push({
          tanda: 0,
          detail: `opened by ${first.orchestra} (${st}), the opener rule is ${r.openerRule}`,
        });
    }
  }
  if (t.length > 1 && ult.locked !== true) {
    const singerOk =
      r.ultimaSinger === undefined ||
      (r.ultimaSinger === null
        ? !ult.vocal
        : ult.vocal && normTitle(ult.singer ?? "") === normTitle(r.ultimaSinger));
    if (r.ultimaOrchestra && !fellBack(n, "ultima") && (ult.orchestraId !== r.ultimaOrchestra || !singerOk))
      out.push({
        tanda: t.length - 1,
        detail: `the última is ${ult.orchestra}${ult.singer ? ` / ${ult.singer}` : ""}, the setting names ${r.ultimaOrchestra}${r.ultimaSinger ? ` / ${r.ultimaSinger}` : r.ultimaSinger === null ? " instrumental" : ""}`,
      });
    else if (!r.ultimaOrchestra && r.ultimaRule === "pugliese" && ult.orchestraId !== "osvaldo-pugliese")
      out.push({ tanda: t.length - 1, detail: `the última is ${ult.orchestra}, the rule asks for Pugliese` });
    else if (
      !r.ultimaOrchestra &&
      r.ultimaRule === "d-arienzo-rhythmic" &&
      !(ult.orchestraId === "juan-d-arienzo" && !ult.vocal)
    )
      out.push({
        tanda: t.length - 1,
        detail: `the última is ${ult.orchestra}, the rule asks for D'Arienzo instrumental`,
      });
    if (ult.rhythm !== "tango") out.push({ tanda: t.length - 1, detail: `the última is a ${ult.rhythm}` });
  }
  const want =
    !n.options.closeWithCumparsita || r.closer === "none"
      ? "none"
      : r.closer === "felicia" && !fellBack(n, "closer")
        ? "felicia"
        : "cumparsita";
  const cl = n.closing ?? null;
  if (want === "none" && cl)
    out.push({ tanda: t.length, detail: `closes on ${cl.title}, the setting is no closer` });
  if (want === "felicia" && normTitle(cl?.title ?? "") !== "felicia")
    out.push({ tanda: t.length, detail: `closes on ${cl?.title ?? "nothing"}, the setting is Felicia` });
  if (want === "cumparsita" && !isCumpTitle(cl))
    out.push({
      tanda: t.length,
      detail: `closes on ${cl?.title ?? "nothing"}, the setting is La Cumparsita`,
    });
  if (r.openWithCumparsita && n.opening !== undefined && !isCumpTitle(n.opening))
    out.push({ tanda: -1, detail: "the setting opens with La Cumparsita, the night does not" });
  return out;
}
function shapeChecks(n: Night, add: (key: string, tanda: number, detail: string) => void) {
  for (const p of shapeProblems(n)) add("nightShape", p.tanda, p.detail);
}
/** "Night shape" — who opened, who closed, and the settings that asked for it */
export function nightShapeLine(n: Night): string {
  const r = n.options.rules ?? {};
  const t = n.tandas;
  const nm = (x?: Tanda) =>
    x ? `${x.orchestra}${x.vocal && x.singer ? ` / ${x.singer}` : x.vocal ? "" : " instrumental"}` : "–";
  const fb = n.stats?.settingFallbacks?.length ? ` · fell back: ${n.stats.settingFallbacks.join("; ")}` : "";
  const cl = n.closing ? `${n.closing.title} (${n.closing.orchestra} ${n.closing.year ?? ""})` : "none";
  return `Night shape: opened by ${n.opening ? `${n.opening.title} then ` : ""}${nm(t[0])} (${r.openerOrchestra ? `setting: ${r.openerOrchestra}` : `rule: ${r.openerRule ?? "any"}`}), última ${nm(t.at(-1))} (${r.ultimaOrchestra ? `setting: ${r.ultimaOrchestra}${r.ultimaSinger === null ? " instrumental" : r.ultimaSinger ? ` / ${r.ultimaSinger}` : ""}` : `rule: ${r.ultimaRule ?? "emotional-vocal"}`}), closer ${cl} (setting: ${!n.options.closeWithCumparsita ? "none" : (r.closer ?? "auto")})${fb}`;
}
/** the song-order verdict of one tanda: what the order breaks (empty: the order is right) */
export const orderVerdict = (x: Pick<Tanda, "songs">, ctx: OrderCtx = {}): string[] =>
  orderVerdictOf(x.songs, ctx);
/** the order context of tanda i in a night: the previous tanda's last side, a summit, the última */
export const orderCtxOf = (tandas: Tanda[], i: number): OrderCtx => ({
  prevLast: i > 0 ? (dance(tandas[i - 1]!).at(-1)?.energy ?? null) : null,
  summit: !!tandas[i]?.peak,
  ultima: i === tandas.length - 1 && tandas.length >= 6,
});

// --- round 16 (docs/specs/round16-engine.md): the third panel's new rules ----------------------------------------
function round16(
  n: Night,
  h: {
    add: (key: string, tanda: number, detail: string) => void;
    not: (key: string) => void;
    golden: boolean;
    name: (x: Tanda) => string;
  },
) {
  const { add, not, golden, name } = h;
  const t = n.tandas;
  const o = n.options;
  const r = o.rules ?? {};
  const last = t.length - 1;
  const keys = ["openerCanon", "heatFloor", "preSummit", "coolVals", "orchestraCount", "closerVary"];
  if (!golden || !t.length) {
    for (const k of keys) not(k);
    return;
  }
  // R16-1 — the canon opener (a setting: only under openerRule "canon", never when the DJ named the opener)
  const first = t[0]!;
  if (r.openerRule !== "canon" || r.openerOrchestra || first.locked || first.rhythm !== "tango")
    not("openerCanon");
  else {
    const p = staticProfile(first.orchestraId);
    const why: string[] = [];
    if (isColour(p)) why.push("a colour orchestra");
    if (first.golden !== undefined && first.golden !== "core") why.push(`golden ${first.golden}`);
    const mf = meanFame(first);
    if (mf < 4 - 1e-9) why.push(`mean fame ${mf.toFixed(2)} < 4`);
    // (settings-aware: the default golden arc plans the opener at 44, under every canon opener of the corpus — the
    // ceiling is max(target + 8, 62), as the DJ's e54 + 8 for the featured arc)
    if (first.energy > Math.max(first.targetEnergy + 8, 62))
      why.push(`e${first.energy} for target ${first.targetEnergy}`);
    if (why.length) add("openerCanon", 0, `${name(first)} opens under the canon rule: ${why.join(", ")}`);
  }
  // A1 — a first-tier, non-colour tanda's heatmap
  t.forEach((x, i) => {
    const p = staticProfile(x.orchestraId);
    if ((p?.tier ?? 3) !== 1 || isColour(p) || x.heat?.min === undefined) return;
    if (x.heat.min < 3) add("heatFloor", i, `${name(x)}: heatmap ${x.heat.min} (${x.heat.label})`);
  });
  // R16-3 — the slot before the last summit, R16-7 — the cool-down vals
  const s = t
    .map((x, i) => (x.peak ? i : -1))
    .filter((i) => i >= 0)
    .at(-1);
  if (s === undefined || s < 1) {
    not("preSummit");
    not("coolVals");
  } else {
    const b = t[s - 1]!;
    const mf = meanFame(b);
    if (mf < 3.5 - 1e-9 || b.energy < b.targetEnergy - 8)
      add(
        "preSummit",
        s - 1,
        `${name(b)} before the last summit: mean fame ${mf.toFixed(2)}, e${b.energy} for target ${b.targetEnergy}`,
      );
    for (let i = s + 1; i < t.length; i++)
      if (t[i]!.rhythm === "vals" && t[i]!.energy > t[s]!.energy)
        add("coolVals", i, `${name(t[i]!)} vals e${t[i]!.energy} after the last summit at e${t[s]!.energy}`);
  }
  // R16-11 — orchestras per 4 h
  if (o.hours < 3) not("orchestraCount");
  else {
    const need = Math.round((12 * o.hours) / 4);
    const have = new Set(t.map((x) => x.orchestraId)).size;
    if (have < need) add("orchestraCount", -1, `${have} orchestras for ${o.hours} h (≥ ${need})`);
  }
  // R16-10 — the closer is not the última's orchestra when another in-range, streamable version exists
  const cl = n.closing;
  if (
    !cl ||
    !o.closeWithCumparsita ||
    (r.closer ?? "auto") !== "auto" ||
    t.length < 2 ||
    !ACTIVE_CATALOG.byOrchestra
  )
    not("closerVary");
  else if (cl.orchestraId === t[last]!.orchestraId) {
    const yr = o.yearRange;
    let alt: Song | undefined;
    for (const [oid, xs] of ACTIVE_CATALOG.byOrchestra) {
      if (oid === cl.orchestraId) continue;
      alt = xs.find(
        (x) =>
          normTitle(x.title) === "la cumparsita" &&
          x.rhythm === "tango" &&
          !x.vocal &&
          isTandaEligible(x) &&
          !x.streamSuspect &&
          streamable(x) &&
          (x.fame ?? 0) >= 2 &&
          (!yr || (!!x.year && x.year >= yr[0] && x.year <= yr[1])),
      );
      if (alt) break;
    }
    if (alt)
      add(
        "closerVary",
        t.length,
        `${cl.orchestra} closes after a ${t[last]!.orchestra} última; ${alt.orchestra} ${alt.year} streams`,
      );
  }
}
