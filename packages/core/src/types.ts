export type Rhythm =
  | "tango"
  | "vals"
  | "milonga"
  | "cancion"
  | "foxtrot"
  | "pasodoble"
  | "ranchera"
  | "zamba"
  | "polca"
  | "estilo"
  | "corrido"
  | "tonada"
  | "shimmy"
  | "candombe"
  | "marcha"
  | "other"
  | "unknown";
export type DanceRhythm = "tango" | "vals" | "milonga";
export type Era =
  | "guardia-vieja"
  | "guardia-nueva"
  | "golden-early"
  | "golden-peak"
  | "golden-late"
  | "post-golden"
  | "nuevo"
  | "contemporary"
  | "unknown";
export type EraPreset =
  | "golden"
  | "golden-extended"
  | "guardia-vieja"
  | "post-golden"
  | "nuevo"
  | "contemporary"
  | "all";

export interface Song {
  id: string;
  title: string;
  rhythm: Rhythm;
  rhythmCode?: string;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  singerId: string | null;
  vocal: boolean;
  year: number | null;
  date?: string | null;
  era: Era;
  album?: string | null;
  notes?: string | null;
  selection?: boolean;
  source?: string;
  /** seconds; filled from Spotify cache or default estimate */
  durationSec?: number;
  /** cached streaming identifiers */
  spotify?: {
    uri: string;
    url?: string;
    durationMs?: number;
    album?: string;
    popularity?: number;
    /** "Artist – Title" of the match (round 15: re-validated before an export uses it) */
    matched?: string;
  } | null;
  /** 0..100; computed */
  energy?: number;
  bpm?: number;
  /** 0..5 from the reference corpus (how often it appears in reference sets) */
  fame?: number;
  /** corpus role inside a tanda (reference sets): opener / closer / anytime / cumparsita */
  role?: "opener" | "closer" | "anytime" | "cumparsita";
  /** year ends in 0 without a dated session, or a "1940/70" range: decade placeholder */
  yearApprox?: boolean;
  /** radio / live / acetate transcription or an "inéditos" compilation (index build): never inside a tanda by default */
  transcription?: boolean;
  /** ids of duplicate rows merged into this one at index build (user edits keyed by them still apply) */
  altIds?: string[];
  /** a collection-reissue copy (Altaya, Magenta, "coleccionistas" sets): never inside a tanda while the family has others (round 10) */
  reissue?: boolean;
  /** round 10: a pre-1946 side whose resolved stream is over 3:20 or 115 % of its family's median: a later re-recording */
  streamSuspect?: boolean;
  rhythmOriginal?: string;
  note?: string | null;
  /** round 13: the "1933/48" range of a compilation row whose year was cleared at index build */
  dateRange?: [number, number];
  /** round 13: the user's heatmap grade for this orchestra, mode and year (0 avoid … 4 fantastic; data/index/coverage.json) */
  heat?: import("./knowledge").HeatGrade;
  /** round 14: alternative titles moved out of the display title at index build (dedications, glosses, lyric variants) */
  altTitles?: string[];
  /** round 14: no recording date and an album that names neither the orchestra nor the singer (a mixed compilation) */
  undatedCompilation?: boolean;
  /** round 14: fame 0 under a title another orchestra made famous the same year (dancer R14-4b, R14-13) */
  suspectCredit?: boolean;
  /** round 14: the length is estimateDuration() (no measured stream): shown as "≈", never judged against a length band */
  durationEstimated?: boolean;
  /** analysed audio features (data/cache/audio/features.json or user database) */
  audio?: import("./audio/dsp").AudioFeatures | null;
  /** resolved streaming/preview track (data/cache/resolve/tracks.json) */
  resolved?: import("./audio/index").ResolvedTrack | null;
}

export interface OrchestraProfile {
  id: string;
  name: string;
  aliases?: string[];
  style: "rhythmic" | "lyrical" | "dramatic" | "guardia" | "nuevo" | "contemporary" | "balanced";
  /** 0..100 baseline intensity */
  energy: number;
  /** per-rhythm bpm hints */
  bpm?: Partial<Record<DanceRhythm, [number, number]>>;
  /** preferred phase of the night */
  phase?: Array<"warmup" | "build" | "peak" | "cooldown" | "any">;
  /** never program this orchestra before this fraction of the night (0..1) */
  notBefore?: number;
  /** energy adjustment per sub-era, e.g. { "golden-late": +8 } */
  eraShift?: Partial<Record<Era, number>>;
  vocalShift?: number;
  instrumentalShift?: number;
  singers?: Record<string, [number, number]>;
  notes?: string;
  tier?: 1 | 2 | 3; // 1 = core golden-age orchestra for any milonga, 2 = secondary, 3 = rarely for dancing
  /** curated knowledge (data/knowledge/orchestra_profiles.json); see docs/MUSICALITY.md "Profile fields" */
  maxPerNight?: number | Record<string, number>;
  notAfter?: number;
  neverClose?: boolean;
  nonDanceTitles?: string[];
  nonDanceSingers?: string[];
  singerDanceable?: Record<string, boolean>;
  singerShift?: Record<string, number>;
  bestYears?: [number, number];
  subPeriods?: Array<{
    years: [number, number];
    phase?: string[];
    difficulty?: number;
    danceable?: string;
    note?: string;
    /** the orchestra's best sub-period: ×1.5 in the phases it names (round 10) */
    preferred?: boolean;
  }>;
  followWith?: string[];
  shareOfNightMax?: number;
  warmupOnly?: { vocal?: boolean; years?: [number, number] };
  difficulty?: number;
  cumparsitaVersions?: number[];
  /** "do not place at the main peak" (Rodríguez, Donato): never fills a planned peak slot (round 9) */
  avoidMainPeak?: boolean;
  /** "use as a tango-only orchestra" (Demare): its vals and milonga families step back ×0.15 (round 9) */
  tangoOnly?: boolean;
  /** singer → stints [[from, to], …]: a tanda never crosses from one stint into another (round 13, cohesion R3a) */
  singerStints?: Record<string, Array<[number, number]>>;
  /** round 13: per-family best / ok year bands (best-years review §2), read with familyBand() */
  bands?: import("./knowledge").FamilyBands;
  /** round 13: the reviewer's families rated above the user's heatmap; ignored unless ComposeOptions.bandOverrides */
  bandOverrides?: import("./knowledge").FamilyBands;
  /** round 13: golden-night core / edge bands and the colour flag (golden-age review §2) */
  goldenBands?: import("./knowledge").GoldenBands;
  /** round 13: "hard" = a hard-driving rhythmic orchestra (R+ in the transitions model: D'Arienzo, Biagi, Tanturi) */
  drive?: "hard";
  /** round 13: curated line-up breaks a tanda never crosses (D'Arienzo instrumentals 1938-07, 1940-06) */
  lineupBreaks?: import("./knowledge").LineupBreak[];
}

export interface Cortina {
  id: string;
  title: string;
  artist: string;
  genre: string;
  culture: string; // e.g. "global", "turkish", "greek", "persian", "balkan", "brazilian", "latin", "italian", "french", "kpop", "afrobeats"
  language?: string;
  energy: number; // 0..100
  year?: number;
  trend?: boolean;
  startSec?: number; // suggested cue-in
  lengthSec?: number;
  spotify?: { uri: string; url?: string } | null;
  /** "intro-only", "once-a-night", "late-night", "danceable-risk", "theme:<family>", "tempo:up|medium|slow", "mood:<word>" */
  tags?: string[];
  /** resolved streaming/preview track (data/cache/resolve/cortinas.json) */
  resolved?: import("./audio/index").ResolvedTrack | null;
}

export type Phase = "warmup" | "build" | "peak" | "cooldown" | "close";

export interface Slot {
  index: number;
  rhythm: DanceRhythm;
  size: number;
  targetEnergy: number;
  phase: Phase;
  /** fraction of the night 0..1 */
  position: number;
  /** a planned summit of the arc (round 9): peak-phase orchestras only, energy ≥ target − 4 */
  peak?: boolean;
}

export interface Tanda {
  index: number;
  rhythm: DanceRhythm;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  vocal: boolean;
  yearRange: [number, number] | null;
  era: Era;
  songs: Song[];
  energy: number; // mean
  energyCurve: number[]; // per song
  targetEnergy: number;
  phase: Phase;
  /** orchestra style (profile) at build time, so the scorer can check context compliance without the catalogue */
  style?: OrchestraProfile["style"];
  durationSec: number;
  cortina: Cortina | null;
  /** 0..100 mean analysed-audio compatibility between consecutive tracks (undefined when no features) */
  cohesion?: number;
  locked?: boolean;
  note?: string;
  /** why the engine chose it (shown in the UI) */
  reason?: string;
  /** reserved for the birthday vals (rules.birthdayValsAt) */
  birthday?: boolean;
  /** built for a planned peak slot (round 9) */
  peak?: boolean;
  /** round 13: the user's heatmap over the sides: the lowest and the mean grade (sides with a grade) */
  heat?: { min: number; mean: number; label: string };
  /** round 13: the family's best / ok / outside band over the sides (the weakest side's) */
  band?: import("./knowledge").FamilyBand;
  /** round 13: golden-night class of the sides (core, edge, other) */
  golden?: import("./knowledge").GoldenClass;
  /** round 13 (cohesion R3): the tanda crosses a singer stint, a ≥ 18-month recording gap or a line-up break */
  crossesBreak?: boolean;
  /** round 13 (cohesion §4.1): the smallest year spread any tanda of this family could reach tonight */
  spreadFloor?: number;
  /** round 13 (cohesion R7): a vals pool too small for the 2-year cap (cap + 1 inside one stint) */
  poolSmall?: boolean;
}

export interface PlaylistStats {
  tandas: number;
  tracks: number;
  durationSec: number;
  byRhythm: Record<DanceRhythm, number>;
  orchestras: Record<string, number>;
  vocalRatio: number;
  energyArc: number[];
  targetArc: number[];
  arcFit: number; // 0..1
  /** mean applied cortina length (s) */
  cortinaSec?: number;
  /** real clock of the night with gaps and planned cortina stops (from the booth plan); durationSec stays the sum of recordings */
  wallClockSec?: number;
  /** total planned silence between items (s) */
  gapsSec?: number;
  /** the requested cortina pool could not carry the night (fewer than 8 distinct cues): what was used instead */
  cortinaFallback?: string;
  /** round 15: a night-shape setting (opener, última, closer) the year range could not satisfy, and what played
   * instead ("opener: …", "ultima: …", "closer: …") — the panel reads it, the UI shows it */
  settingFallbacks?: string[];
  /** RMSE of delivered vs target energy over the tandas (round 9) */
  arcRmse?: number;
  /** vocal share of the tango tandas (round 9: 0.55–0.75 in a golden night) */
  vocalTangoShare?: number;
  /** round 13: share of the sides from heatmap grade ≥ 3 years (good / fantastic) */
  heatBestShare?: number;
  /** the planned peak slots and what they delivered (round 9) */
  peaks?: Array<{ index: number; energy: number; target: number; orchestra: string }>;
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  options: ComposeOptions;
  tandas: Tanda[];
  closing: Song | null; // La Cumparsita
  /** optional La Cumparsita played before the first tanda (rules.openWithCumparsita) */
  opening?: Song | null;
  /** show / performance breaks inserted after a tanda index */
  breaks?: Array<{ afterTanda: number; minutes: number; label: string }>;
  stats: PlaylistStats;
  score: ScoreCard;
  /** the night's timing plan (gaps, cortina stops and fades, gain priors) shared by the booth and the exports */
  booth?: import("./booth").BoothPlan;
}

export interface ScoreFactor {
  key: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}
export interface ScoreCard {
  total: number;
  factors: ScoreFactor[];
  verdict: string;
  /** hard failures that capped the total at 60 (undated tanda, duration off, wrong rhythm, cap broken, bootleg última) */
  reasons?: string[];
}

export interface ComposeOptions {
  hours: number;
  name?: string;
  eras: EraPreset[];
  /** "classic" = TTVTTM, "vals-heavy" = TVTM, "milonga-heavy" = TMTV, "tango-only" */
  pattern: "classic" | "TTVTTM" | "TTVTTM-strict" | "TVTM" | "TMTV" | "tango-only" | "custom";
  customPattern?: string; // e.g. "TTVTTM"
  tangoTandaSize: 3 | 4 | 5;
  valsTandaSize: 3 | 4;
  milongaTandaSize: 3 | 4;
  /** energy shape inside a tanda */
  tandaShape: "rise" | "rise-settle" | "hammock" | "flat" | "peak-middle";
  /** night arc model */
  arc: "classic-two-peaks" | "single-peak" | "marathon-plateau" | "gentle";
  /**
   * explicit arc shape over the model: "single" = one peak, "double" = two peaks with a real dip between and the
   * última still highest (nights ≥ 3 h; shorter nights fall back to single). Unset = the arc model's own shape.
   */
  arcShape?: "single" | "double";
  /** restrict the pool to recording years (inclusive), inside the era preset: e.g. [1935, 1945] */
  yearRange?: [number, number];
  cortinaStyle: "family" | "matched" | "constant" | "none";
  cortinaCultures: string[]; // ["global"] or ["turkish","greek"...]
  cortinaGenres?: string[];
  cortinaTrend?: "trend" | "classic" | "mixed";
  cortinaLengthSec: number;
  closeWithCumparsita: boolean;
  /** night rules that DJs toggle per event (all optional; era presets set sensible defaults) */
  rules?: NightRules;
  /** minimum tandas between repeats of the same orchestra */
  orchestraRepeatGap: number;
  singerRepeatGap: number;
  avoidTitleRepeats: boolean;
  /** what recent sets (agent memory) already played: families and titles are down-weighted so nights differ */
  recent?: { tandaKeys?: string[]; titles?: string[] };
  maxYearSpread: number; // within a tanda
  mixVocalInstrumental: boolean; // false = strict
  includeOrchestras?: string[];
  excludeOrchestras?: string[];
  onlySelection?: boolean;
  requireSpotify?: boolean;
  seed?: number;
  floorMood?: "traditional" | "balanced" | "energetic" | "romantic";
  avgTrackSec?: number;
  /** measured mean track length per rhythm for the active pool (set by compose) */
  trackSecByRhythm?: Partial<Record<DanceRhythm, number>>;
  locale?: string;
  /** situational context (season, weather, event type…) → factor shifts from data/knowledge/context_factors.json */
  context?: ComposeContext;
  /** per-user database overrides (rules, profiles, songs, cortinas) merged at compose time */
  overrides?: UserOverrides;
  /**
   * keys the DJ set explicitly tonight (the web sends only touched/pinned keys plus this list);
   * context shifts never touch an explicit key. Absent = every key present in the request is explicit.
   */
  explicit?: string[];
  /** what the context model changed and what it left alone because the key was explicit (set by compose) */
  contextApplied?: { applied: string[]; skipped: string[] };
  /** −1..1: vocal families up (+) or down (−); fed by context vocalRatioShift and the vocal/instrumental feedback */
  vocalBias?: number;
  /** context tempo shift (bpm-ish): slower orchestras win when negative */
  tempoShift?: number;
  /** orchestras an era preset prefers (weight ×3) without excluding the rest */
  preferOrchestras?: string[];
  /** families (orchestra + singer, optional years) a night should carry (weight ×3 while unused); golden: the 1935–45 canon */
  preferFamilies?: PreferredFamily[];
  /** beginner floors: families above this profile difficulty are avoided */
  maxDifficulty?: number;
  /** round 13: also apply the reviewer's band overrides (families rated above the user's heatmap; off by default) */
  bandOverrides?: boolean;
}

/** Event-level rules a DJ chooses per night. */
export interface NightRules {
  /** play La Cumparsita as the very first track too (some Buenos Aires and festival openings) */
  openWithCumparsita?: boolean;
  /** 1 = single closing Cumparsita (Europe); 2 = Buenos Aires style: Cumparsita closes the última tanda AND a final standalone version */
  cumparsitaCount?: 1 | 2;
  /** a vals tanda is reserved for a birthday vals; position as fraction of the night (e.g. 0.6) */
  birthdayValsAt?: number | null;
  /** a show / performance break: insert a cortina-free gap at this fraction; the engine re-ramps energy after it */
  showBreakAt?: number | null;
  showBreakMinutes?: number;
  /** última tanda rule */
  ultimaRule?: "emotional-vocal" | "d-arienzo-rhythmic" | "pugliese" | "any";
  /** first tanda rule */
  openerRule?: "canon" | "lyrical" | "rhythmic" | "any";
  /** round 15: the orchestra that opens the night (an orchestra id; unset = auto, the opener rule decides) */
  openerOrchestra?: string;
  /** round 15: the última's orchestra (unset = auto, the última rule decides) and its singer (null = instrumental,
   * unset = any of its families) */
  ultimaOrchestra?: string;
  ultimaSinger?: string | null;
  /** round 15: the closing side after the última — auto (La Cumparsita, in range when it can), in-range (La
   * Cumparsita from the night's years only), felicia (Felicia instead), none */
  closer?: "auto" | "in-range" | "felicia" | "none";
  /** round 15: how many tandas the warm-up lasts (the arc plans them gentle); unset = the arc's own */
  warmupTandas?: number;
  /** round 15: the cool-down before the última — "lift" (the arc's own end lift) or "gentle" (6 points softer) */
  cooldown?: "lift" | "gentle";
  /** at most one Pugliese tanda per night (false allows two in long marathons) */
  puglieseOnce?: boolean;
  /** allow one "colour" tanda (foxtrot, Pirincho milongas, Hugo Díaz) */
  colourTanda?: boolean;
  /** allow mixed-orchestra milonga/vals tandas */
  mixedMilongaVals?: boolean;
  /** cortina after the last tanda before the Cumparsita */
  cortinaBeforeCumparsita?: boolean;
  /** let undated / placeholder-year / transcription rows into tandas (off: they never build one) */
  allowUndated?: boolean;
  /** at most this many instrumental tango tandas before the first vocal one (golden nights: 2; the early D'Arienzo counts) */
  maxInstrumentalBeforeVocal?: number;
  /** vocal share band for the tango tandas of the night (golden: [0.55, 0.75]); the composer steers inside it */
  vocalShare?: [number, number];
}

/** a family a night should carry: orchestra + singer (null = instrumental) within a year window */
export interface PreferredFamily {
  id: string;
  orchestraId: string;
  singer: string | null;
  years?: [number, number];
}

/** What the AI DJ and the engine remember for a user between sessions (stored in the user's database). */
export interface AgentMemory {
  /** free-form notes the DJ or the assistant wrote ("this room likes Donato milongas") */
  notes: Array<{ at: string; text: string; source: "dj" | "assistant" }>;
  /** feedback given on sets, kept so the next composition starts from it */
  feedbackHistory: Array<{ at: string; playlistId: string; feedback: string[]; instruction?: string }>;
  /** compact log of sets composed: id, name, hours, era, score, context */
  sets: Array<{
    at: string;
    id: string;
    name: string;
    hours: number;
    eras: string[];
    score: number;
    context?: ComposeContext;
    liked?: boolean;
    /** family keys "orchestraId|singer|rhythm" and normalised titles played, for variety across nights */
    tandas?: string[];
    titles?: string[];
  }>;
  /** learned preferences the assistant may apply by default */
  preferences: Partial<
    Pick<
      ComposeOptions,
      | "eras"
      | "pattern"
      | "customPattern"
      | "tandaShape"
      | "arc"
      | "cortinaStyle"
      | "cortinaCultures"
      | "cortinaTrend"
      | "cortinaLengthSec"
      | "floorMood"
      | "excludeOrchestras"
      | "includeOrchestras"
      | "orchestraRepeatGap"
    >
  > & { rules?: NightRules; context?: ComposeContext };
  updatedAt?: string;
}

export interface ComposeContext {
  season?: "winter" | "spring" | "summer" | "autumn";
  weather?: "clear" | "rain" | "heat" | "humid" | "cold" | "storm" | "snow";
  roomTemp?: "cold" | "comfortable" | "warm" | "hot";
  timeOfDay?: "afternoon" | "evening" | "night" | "late-night" | "sunrise";
  event?: "milonga" | "marathon" | "encuentro" | "festival" | "practica" | "wedding" | "show";
  crowdLevel?: "beginner" | "mixed" | "advanced" | "milonguero";
  crowdSize?: "small" | "medium" | "large";
  region?: "buenos-aires" | "europe" | "istanbul" | "asia" | "us";
  holiday?: "none" | "christmas" | "new-year" | "valentines" | "carnival";
  mood?: "romantic" | "energetic" | "nostalgic" | "playful" | "dramatic" | "elegant";
  dayOfWeek?: "weekday" | "thursday" | "friday" | "saturday" | "sunday";
  ageMix?: "young" | "mixed" | "senior";
  roleRatio?: "balanced" | "leaderSurplus" | "followerSurplus";
  origin?: "locals" | "mixed" | "tourists";
  floorType?: "sprungWood" | "laminate" | "tile" | "sticky" | "outdoor";
  roomSize?: "small" | "medium" | "largeHall";
  acoustics?: "dry" | "moderate" | "reverberant";
  daylight?: "shortDays" | "longDays" | "equatorial" | "temperate" | "startsInDaylight";
}

export interface ContextFactorOption {
  id: string;
  label: string;
  energyShift?: number;
  tempoShift?: number;
  vocalRatioShift?: number;
  valsShare?: number;
  milongaShare?: number;
  cortinaGenres?: string[];
  tandaSizeShift?: number;
  notes?: string;
  evidence?: "strong" | "moderate" | "weak" | "lore";
  arcShift?: Partial<Record<Phase, number>>;
  preferStyles?: string[];
  avoidStyles?: string[];
}
export interface ContextFactor {
  id: string;
  label: string;
  options: ContextFactorOption[];
}
export interface ContextModel {
  factors: ContextFactor[];
  rhythmFeatures?: Record<string, unknown>;
  eraTable?: Record<string, unknown>;
  baseline?: { valsShare?: number; milongaShare?: number; vocalRatio?: number };
  version?: string | number;
}

/** What a user can change in their own deployed database (merged over the repo-hosted index). */
export interface UserOverrides {
  /**
   * partial song edits keyed by song id (year, singer, rhythm, energy, bpm, spotify uri, hide).
   * `hidden: true` hides every copy of that orchestra + title (the Database's duplicates included);
   * `hiddenScope: "copy"` hides that one row only.
   */
  songs?: Record<string, Partial<Song> & { hidden?: boolean; hiddenScope?: "title" | "copy" }>;
  /** recordings hidden by orchestra + title, keyed `${orchestraId}|${normTitle(title)}` (see hideKey()) */
  hiddenTitles?: string[];
  /** orchestra profile edits keyed by orchestraId */
  profiles?: Record<string, Partial<OrchestraProfile>>;
  /** extra or replaced cortinas keyed by id */
  cortinas?: Record<string, Cortina | null>;
  /** engine rule knobs */
  rules?: Partial<
    Pick<
      ComposeOptions,
      | "orchestraRepeatGap"
      | "singerRepeatGap"
      | "maxYearSpread"
      | "tangoTandaSize"
      | "valsTandaSize"
      | "milongaTandaSize"
      | "cortinaLengthSec"
      | "mixVocalInstrumental"
    >
  > & { trackEnergy?: Record<string, number>; notBefore?: Record<string, number> };
  /** extra songs added by the user (e.g. own recordings) */
  addedSongs?: Song[];
  updatedAt?: string;
}
