import type { AudioFeatures, ContextFactorOption, ResolvedTrack, Song, UserOverrides } from "@tdj/core";
import type { AcpConnection } from "./ai/acp";
import { type AiProvider, DEFAULT_MODEL, KEY_PROVIDERS, type KeyProvider } from "./ai/models";

export type {
  AgentMemory,
  AudioFeatures,
  ComposeContext,
  ComposeOptions,
  ContextModel,
  Cortina,
  Feedback,
  NightRules,
  OrchestraProfile,
  Playlist,
  ResolvedTrack,
  ScoreCard,
  Song,
  Tanda,
  UserOverrides,
} from "@tdj/core";

/** Composer options as kept in the browser: engine options plus the controls the user pinned against era presets. */
export type AppOptions = Partial<import("@tdj/core").ComposeOptions> & {
  /** controls pinned against era presets */
  pinned?: string[];
  /** keys the DJ touched tonight (explicit); era presets and defaults are not */
  touched?: string[];
};

export type { AcpConnection } from "./ai/acp";
export type { AiProvider, KeyProvider } from "./ai/models";
/** API key providers (BYOK); ACP agents are listed separately (Settings → Models) */
export const AI_PROVIDERS = KEY_PROVIDERS;
/** the model each provider runs when the DJ leaves the field blank (lib/ai/models.ts) */
export const AI_DEFAULT_MODEL = DEFAULT_MODEL;

export type DjApp = "rekordbox" | "traktor" | "serato" | "virtualdj" | "enginedj";
export const DJ_APPS: Array<{ id: DjApp; label: string; format: string; note: string }> = [
  {
    id: "rekordbox",
    label: "Rekordbox",
    format: "Rekordbox XML",
    note: "Preferences → Advanced → Database → Imported Library: pick the XML, then drag the playlist from the rekordbox xml tree into Playlists.",
  },
  {
    id: "traktor",
    label: "Traktor",
    format: "Traktor NML",
    note: "Right-click Playlists in the browser → Import Playlist, choose the .nml. Tracks relink when the folder path matches.",
  },
  {
    id: "serato",
    label: "Serato DJ",
    format: "DJ CSV via Lexicon",
    note: "Serato reads crates, not CSV: import the CSV in Lexicon (File → Import → CSV) and sync to Serato.",
  },
  {
    id: "virtualdj",
    label: "VirtualDJ",
    format: "M3U8",
    note: "Drop the .m3u8 into the VirtualDJ/Playlists folder or File → Import playlist.",
  },
  {
    id: "enginedj",
    label: "Engine DJ",
    format: "M3U8",
    note: "Engine DJ desktop: Playlists → Import from M3U; paths must match your library drive.",
  },
];

export interface UserSettings {
  spotifyClientId: string;
  /** the model every generation uses: an API key provider (its key and model below) or an ACP agent (`acpId`) */
  ai: {
    provider: AiProvider;
    key: string;
    /** blank: the provider's default (lib/ai/models.ts; Anthropic's is the newest Claude model) */
    model: string;
    /** Anthropic only: the workspace an organisation-level key bills (`wrkspc_…`); blank for a key made inside a workspace */
    workspace?: string;
    /** provider "acp": the connection in `acp` that answers */
    acpId?: string;
  };
  /**
   * Round 22: every key the DJ saved, per provider (so switching providers keeps them). BYOK: kept in this browser,
   * sent with the DJ's own requests only, never stored on the server.
   */
  aiKeys?: Partial<Record<KeyProvider, { key: string; model?: string; workspace?: string }>>;
  /** Round 22: ACP agent connections (local or remote agents), usable exactly like a key */
  acp?: AcpConnection[];
  /** Round 22: live suggestions while building a night by hand */
  buildSuggestions?: boolean;
  djApps: Record<DjApp, { folder: string }>;
  /** file naming pattern used for exported paths; tokens: {artist} {title} {orchestra} {singer} {year} {rhythm} {tanda} {n} */
  fileNaming: string;
  theme: "auto" | "light" | "dark";
  region: "buenos-aires" | "europe" | "istanbul" | "asia" | "us";
  reduceGlass: boolean;
  /** the assistant may learn preferences from feedback and apply them under tonight's explicit choices */
  learn: boolean;
  /**
   * Cortina play length in seconds (20–90): where the in-app player and the VLC/Rekordbox exports cut a cortina.
   * `null` follows the composer's cortina length (`cortinaLengthSec`, 45 s by default).
   */
  cortinaStopSec: number | null;
  /**
   * Round 13: run the benchmark's improveNight after every compose (heatmap years, tighter tandas, golden core,
   * bridge cues, the round-12 fixers) and say what changed in the change summary line. A change is kept only when
   * neither the engine score nor the benchmark falls.
   */
  autoImprove: boolean;
  /**
   * Round 22: the data sources that fill missing BPM, key, level, artwork and dates (Settings › Connections). Keyless
   * sources are on unless turned off; a Discogs token stays in this browser and is never stored by the server.
   */
  dataSources?: { enabled?: Partial<Record<string, boolean>>; discogsToken?: string; autoFill?: boolean };
  /** round 22: the era badge on every song (best / good / uneven / outside years); on by default */
  eraBadges?: boolean;
}
export const DEFAULT_NAMING = "{artist} - {title}";
export const DEFAULT_SETTINGS: UserSettings = {
  spotifyClientId: "",
  ai: { provider: "anthropic", key: "", model: "" },
  aiKeys: {},
  acp: [],
  buildSuggestions: true,
  djApps: {
    rekordbox: { folder: "" },
    traktor: { folder: "" },
    serato: { folder: "" },
    virtualdj: { folder: "" },
    enginedj: { folder: "" },
  },
  fileNaming: DEFAULT_NAMING,
  theme: "auto",
  region: "europe",
  reduceGlass: false,
  learn: true,
  cortinaStopSec: null,
  autoImprove: true,
};
export const CORTINA_STOP_RANGE = { min: 20, max: 90, step: 5 } as const;
/** The effective cortina play length: the Playback setting, else the composer's cortina length, clamped to 20–90. */
export function cortinaStopSec(
  settings: Pick<UserSettings, "cortinaStopSec">,
  composerLengthSec?: number | null,
): number {
  const v = settings.cortinaStopSec ?? composerLengthSec ?? 45;
  return Math.round(
    Math.min(CORTINA_STOP_RANGE.max, Math.max(CORTINA_STOP_RANGE.min, Number.isFinite(v) ? v : 45)),
  );
}

/** A per-song patch in the user's database: catalogue fields plus browser-analysed audio and a chosen preview track. */
export type SongPatch = Partial<Song> & {
  hidden?: boolean;
  /** features analysed in this browser from the 30 s preview (core merges `patch.audio` over the shared cache) */
  audio?: AudioFeatures | null;
  /** the streaming/preview track the user picked in "Find on services" */
  resolved?: ResolvedTrack | null;
  /** round 22: the DJ's own key ("Am", "F♯m"), artwork, release date and Deezer track (they win over every source) */
  key?: string;
  artwork?: string;
  release?: string;
  deezerId?: string;
};

/** Guide section ids whose text the user may rewrite; `houseRules` is appended to the AI prompts. */
export type GuideOverrides = Record<string, string> & { houseRules?: string };
export const HOUSE_RULES_MAX = 2000;

/** The user's database: engine overrides plus context-factor edits, guide text and connector URLs (all browser-side). */
export interface AppOverrides extends UserOverrides {
  songs?: Record<string, SongPatch>;
  contextFactors?: Record<string, Record<string, Partial<ContextFactorOption>>>;
  /** edited Guide sections keyed by section id, plus `houseRules` */
  guide?: GuideOverrides;
  /** BYO automation: a webhook URL exports can be POSTed to (never stored server-side by TDJ) */
  connectors?: { webhookUrl?: string };
  /** round 22: the DJ's era-indicator grades over the shipped heatmap (orchestra → mode → year → grade, null clears) */
  heatmap?: import("@tdj/core").CoverageEdits;
  /** round 22: what this DJ's data sources fetched per song (BPM, key, level, artwork, dates), each with its source */
  scraped?: Record<string, import("@tdj/core").ScrapedRecord>;
}

/** One previous generation (History tab): the whole set plus what composed it. */
export interface HistorySnapshot {
  id: string;
  createdAt: string;
  /** auto: "Sat · Golden age · 4 h"; the user may rename it */
  title: string;
  options: Partial<import("@tdj/core").ComposeOptions>;
  playlist: import("@tdj/core").Playlist;
  score: number;
  /** what produced it */
  source: "compose" | "refine" | "swap" | "import" | "room";
  /** the night as played from the Booth (lib/history.ts `NightLog`), set by "End the night" and every hold */
  nightLog?: import("./history").NightLog;
}
export const HISTORY_MAX = 50;

export interface ReferencePlaylist {
  id: string;
  title: string;
  owner?: string;
  kind: "tandas" | "orchestra" | "editorial" | "tempo-ladder" | "library" | "intro" | string;
  orchestraId: string | null;
  tags?: string[];
  url?: string;
}

export interface MetaOrchestra {
  id: string;
  name: string;
  count: number;
  tier: number;
  style?: string;
  energy?: number;
  phase?: string[];
  notBefore?: number;
  singers?: Record<string, [number, number]>;
  /** round 22: first and last recording year in the index */
  years?: [number, number];
  /** round 22: the most-recorded singers with their number of sides */
  topSingers?: Array<[string, number]>;
  instrumentals?: number;
  /** round 22: a cover from its best-known side with artwork */
  artwork?: string;
}
export interface MetaCortina {
  id: string;
  title: string;
  artist: string;
  genre: string;
  culture: string;
  energy: number;
  year?: number;
  lengthSec?: number;
  spotify?: { uri: string; url?: string } | null;
  tags?: string[];
}
export interface Meta {
  meta: { songs: number; orchestras: number; singers: number; builtAt: string };
  cultures: string[];
  genres: string[];
  cortinas: number;
  cortinaList: MetaCortina[];
  orchestras: MetaOrchestra[];
  contextModel: import("@tdj/core").ContextModel | null;
  referencePlaylists: ReferencePlaylist[];
  knowledge: Record<string, number>;
  storage: "browser" | "server";
}
