import type { BoothSettings } from "./engine";

/**
 * Round 22 (ROADMAP §1): Spotify "Mix"-style transitions for the booth. A preset sets the three numbers that make a
 * transition — the silence between items, a fade at the end of each song, and the crossfade length the "Crossfade"
 * button uses — and every row in the Mix sheet keeps its own value and its one-line explanation.
 */
export type MixKey = "gapSec" | "songFadeOutSec" | "crossfadeSec";
export type MixPresetId = "milonga" | "smooth" | "tight" | "custom";

export const MIX_PRESETS: ReadonlyArray<{
  id: Exclude<MixPresetId, "custom">;
  label: string;
  explain: string;
  values: Pick<BoothSettings, MixKey>;
}> = [
  {
    id: "milonga",
    label: "Milonga floor",
    explain: "Each song plays to its last note, then a short silence: what dancers expect at a milonga.",
    values: { gapSec: 2.5, songFadeOutSec: 0, crossfadeSec: 3 },
  },
  {
    id: "tight",
    label: "Tight",
    explain: "Almost no silence between songs, no fades: the next song follows at once.",
    values: { gapSec: 0.5, songFadeOutSec: 0, crossfadeSec: 2 },
  },
  {
    id: "smooth",
    label: "Smooth",
    explain:
      "A gentle fade at the end of each song and a short gap, like Spotify's automix (practicas, background).",
    values: { gapSec: 1, songFadeOutSec: 3, crossfadeSec: 5 },
  },
];

/** The preset the settings match, else "custom". */
export function presetOf(s: Pick<BoothSettings, MixKey>): MixPresetId {
  const hit = MIX_PRESETS.find(
    (p) =>
      p.values.gapSec === s.gapSec &&
      p.values.songFadeOutSec === s.songFadeOutSec &&
      p.values.crossfadeSec === s.crossfadeSec,
  );
  return hit?.id ?? "custom";
}

/** One line per Mix setting: what it does, in the DJ's words. */
export const MIX_EXPLAIN = {
  gapSec: "Silence between two items (songs, cortinas). 2–3 s lets the floor reset.",
  songFadeOutSec: "Fade at the end of every song. 0 = play to the last note (dancers prefer it).",
  crossfadeSec: "How long the Crossfade button blends the playing song into the next.",
  fadeNowSec: "How long the Fade button takes to bring the playing song down.",
  pauseFadeSec: "Pause and Resume ease the sound out and in over this time.",
  stopFadeSec: "Fade out and stop: how long the music takes to reach silence.",
  cortinaStop: "How long each cortina plays before it fades away.",
  cortinaFadeInSec: "Cortinas start softly over this time.",
  cortinaFadeOutSec: "Cortinas fade out over this time, ending at their stop second.",
  cortinaLevelDb: "How much quieter cortinas play than the tandas.",
  loudnessTargetLUFS: "The level every song is evened out to, so the room never jumps.",
  trimLeadingSilence: "Cut the silence at the start of each file (never more than 3 s).",
} as const;
