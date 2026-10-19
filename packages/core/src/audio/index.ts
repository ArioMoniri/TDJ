export * from "./dsp";
export * from "./compat";
export interface ResolvedTrack {
  provider: "deezer" | "spotify" | "itunes" | "musicbrainz";
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number | null;
  durationMs?: number;
  previewUrl?: string | null;
  url?: string;
  artwork?: string;
  matchedAt: string;
  confidence: number; // 0..1 title/artist match
}
