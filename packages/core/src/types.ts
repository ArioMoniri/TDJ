export type Rhythm = "tango" | "vals" | "milonga" | "cancion" | "foxtrot" | "pasodoble" | "ranchera" | "zamba" | "polca" | "estilo" | "corrido" | "tonada" | "shimmy" | "candombe" | "marcha" | "other" | "unknown";
export type DanceRhythm = "tango" | "vals" | "milonga";
export type Era = "guardia-vieja" | "guardia-nueva" | "golden-early" | "golden-peak" | "golden-late" | "post-golden" | "nuevo" | "contemporary" | "unknown";
export type EraPreset = "golden" | "golden-extended" | "guardia-vieja" | "post-golden" | "nuevo" | "contemporary" | "all";

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
  durationSec: number;
  cortina: Cortina | null;
  locked?: boolean;
  note?: string;
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
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  options: ComposeOptions;
  tandas: Tanda[];
  closing: Song | null; // La Cumparsita
  stats: PlaylistStats;
  score: ScoreCard;
}

export interface ScoreFactor { key: string; label: string; weight: number; score: number; detail: string }
export interface ScoreCard { total: number; factors: ScoreFactor[]; verdict: string }

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
  cortinaStyle: "matched" | "constant" | "none";
  cortinaCultures: string[]; // ["global"] or ["turkish","greek"...]
  cortinaGenres?: string[];
  cortinaTrend?: "trend" | "classic" | "mixed";
  cortinaLengthSec: number;
  closeWithCumparsita: boolean;
  /** minimum tandas between repeats of the same orchestra */
  orchestraRepeatGap: number;
  singerRepeatGap: number;
  avoidTitleRepeats: boolean;
  maxYearSpread: number; // within a tanda
  mixVocalInstrumental: boolean; // false = strict
  includeOrchestras?: string[];
  excludeOrchestras?: string[];
  onlySelection?: boolean;
  requireSpotify?: boolean;
  seed?: number;
  floorMood?: "traditional" | "balanced" | "energetic" | "romantic";
  avgTrackSec?: number;
  locale?: string;
}
