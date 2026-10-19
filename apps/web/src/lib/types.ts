import type { ContextFactorOption, UserOverrides } from "@tdj/core";

export type {
  AgentMemory,
  ComposeContext,
  ComposeOptions,
  ContextModel,
  Cortina,
  Feedback,
  NightRules,
  OrchestraProfile,
  Playlist,
  ScoreCard,
  Song,
  Tanda,
  UserOverrides,
} from "@tdj/core";

/** Composer options as kept in the browser: engine options plus the controls the user pinned against era presets. */
export type AppOptions = Partial<import("@tdj/core").ComposeOptions> & { pinned?: string[] };

export type AiProvider = "anthropic" | "openai" | "gemini" | "openrouter";
export const AI_PROVIDERS: Array<[AiProvider, string]> = [
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["gemini", "Gemini"],
  ["openrouter", "OpenRouter"],
];
export const AI_DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.2",
  gemini: "gemini-3-pro",
  openrouter: "openrouter/auto",
};

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
  ai: { provider: AiProvider; key: string; model: string };
  djApps: Record<DjApp, { folder: string }>;
  /** file naming pattern used for exported paths; tokens: {artist} {title} {orchestra} {singer} {year} {rhythm} {tanda} {n} */
  fileNaming: string;
  theme: "auto" | "light" | "dark";
  region: "buenos-aires" | "europe" | "istanbul" | "asia" | "us";
  reduceGlass: boolean;
  /** the assistant may learn preferences from feedback and apply them under tonight's explicit choices */
  learn: boolean;
}
export const DEFAULT_NAMING = "{artist} - {title}";
export const DEFAULT_SETTINGS: UserSettings = {
  spotifyClientId: "",
  ai: { provider: "anthropic", key: "", model: AI_DEFAULT_MODEL.anthropic },
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
};

/** The user's database: engine overrides plus context-factor edits (kept outside core's UserOverrides). */
export interface AppOverrides extends UserOverrides {
  contextFactors?: Record<string, Record<string, Partial<ContextFactorOption>>>;
}

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
