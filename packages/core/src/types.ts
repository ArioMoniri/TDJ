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
  spotify?: { uri: string; url?: string; durationMs?: number; album?: string; popularity?: number } | null;
  /** 0..100; computed */
  energy?: number;
  bpm?: number;
  /** 0..5 from the reference corpus (how often it appears in reference sets) */
  fame?: number;
  /** corpus role inside a tanda (reference sets): opener / closer / anytime / cumparsita */
  role?: "opener" | "closer" | "anytime" | "cumparsita";
  /** year ends in 0 without a dated session: decade placeholder */
  yearApprox?: boolean;
  rhythmOriginal?: string;
  note?: string | null;
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
  }>;
  followWith?: string[];
  shareOfNightMax?: number;
  warmupOnly?: { vocal?: boolean; years?: [number, number] };
  difficulty?: number;
  cumparsitaVersions?: number[];
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
  tags?: string[];
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
  /** beginner floors: families above this profile difficulty are avoided */
  maxDifficulty?: number;
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
  /** at most one Pugliese tanda per night (false allows two in long marathons) */
  puglieseOnce?: boolean;
  /** allow one "colour" tanda (foxtrot, Pirincho milongas, Hugo Díaz) */
  colourTanda?: boolean;
  /** allow mixed-orchestra milonga/vals tandas */
  mixedMilongaVals?: boolean;
  /** cortina after the last tanda before the Cumparsita */
  cortinaBeforeCumparsita?: boolean;
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
  /** partial song edits keyed by song id (year, singer, rhythm, energy, bpm, spotify uri, hide) */
  songs?: Record<string, Partial<Song> & { hidden?: boolean }>;
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
