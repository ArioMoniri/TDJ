export type { ComposeOptions, Cortina, Playlist, ScoreCard, Song, Tanda } from "@tdj/core";
export interface UserSettings {
  spotifyClientId: string;
  anthropicApiKey: string;
  anthropicModel: string;
  theme: "auto" | "light" | "dark";
  region: "buenos-aires" | "europe" | "istanbul" | "asia" | "us";
  reduceGlass: boolean;
}
export const DEFAULT_SETTINGS: UserSettings = {
  spotifyClientId: "",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-5-5",
  theme: "auto",
  region: "europe",
  reduceGlass: false,
};
