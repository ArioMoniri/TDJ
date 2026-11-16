import { t } from "@/lib/i18n";
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
    get label() {
      return t("booth.mix.milonga_floor");
    },
    get explain() {
      return t("booth.mix.each_song_plays_to_its_last");
    },
    values: { gapSec: 2.5, songFadeOutSec: 0, crossfadeSec: 3 },
  },
  {
    id: "tight",
    get label() {
      return t("booth.mix.tight");
    },
    get explain() {
      return t("booth.mix.almost_no_silence_between_songs_no");
    },
    values: { gapSec: 0.5, songFadeOutSec: 0, crossfadeSec: 2 },
  },
  {
    id: "smooth",
    get label() {
      return t("booth.mix.smooth");
    },
    get explain() {
      return t("booth.mix.a_gentle_fade_at_the_end");
    },
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
  get gapSec() {
    return t("booth.mix.silence_between_two_items_songs_cortinas");
  },
  get songFadeOutSec() {
    return t("booth.mix.fade_at_the_end_of_every");
  },
  get crossfadeSec() {
    return t("booth.mix.how_long_the_crossfade_button_blends");
  },
  get fadeNowSec() {
    return t("booth.mix.how_long_the_fade_button_takes");
  },
  get pauseFadeSec() {
    return t("booth.mix.pause_and_resume_ease_the_sound");
  },
  get stopFadeSec() {
    return t("booth.mix.fade_out_and_stop_how_long");
  },
  get cortinaStop() {
    return t("booth.mix.how_long_each_cortina_plays_before");
  },
  get cortinaFadeInSec() {
    return t("booth.mix.cortinas_start_softly_over_this_time");
  },
  get cortinaFadeOutSec() {
    return t("booth.mix.cortinas_fade_out_over_this_time");
  },
  get cortinaLevelDb() {
    return t("booth.mix.how_much_quieter_cortinas_play_than");
  },
  get loudnessTargetLUFS() {
    return t("booth.mix.the_level_every_song_is_evened");
  },
} as const;
