/**
 * Round 22 (ROADMAP §1): with Spotify Premium connected the night plays full tracks by default. A rehearsal is a
 * choice for one session (or `?rehearsal=1`), not a setting that sticks: a saved "preview" from an earlier
 * rehearsal no longer keeps a Premium DJ on 30 s clips.
 */
export type SourceMode = "file" | "spotify" | "preview";

export function resolveSourceMode(o: {
  saved: SourceMode | undefined;
  rehearsalParam: boolean;
  spotifyOk: boolean;
}): SourceMode {
  if (o.rehearsalParam) return "preview";
  if (o.saved === "preview") return o.spotifyOk ? "file" : "preview";
  return o.saved ?? "file";
}
