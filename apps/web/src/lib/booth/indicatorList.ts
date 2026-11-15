import { t } from "@/lib/i18n";
/**
 * Round 22 (ROADMAP §1.7, §6): every indicator on a song row can be turned on or off, each with one line saying what
 * it shows. Pure data: the Settings page, the player's Show menu and the app builds read the same list.
 */
export type IndicatorId = "energy" | "bpm" | "key" | "era" | "artwork";

export const INDICATORS: ReadonlyArray<{ id: IndicatorId; label: string; explain: string }> = [
  {
    id: "energy",
    get label() {
      return t("booth.indicatorList.energy");
    },
    get explain() {
      return t("booth.indicatorList.how_lively_each_song_and_tanda");
    },
  },
  {
    id: "bpm",
    get label() {
      return t("booth.indicatorList.bpm");
    },
    get explain() {
      return t("booth.indicatorList.the_tempo_in_beats_per_minute");
    },
  },
  {
    id: "key",
    get label() {
      return t("booth.indicatorList.key");
    },
    get explain() {
      return t("booth.indicatorList.the_musical_key_camelot_and_name");
    },
  },
  {
    id: "era",
    get label() {
      return t("booth.indicatorList.era_badge");
    },
    get explain() {
      return t("booth.indicatorList.where_each_side_sits_in_its");
    },
  },
  {
    id: "artwork",
    get label() {
      return t("booth.indicatorList.artwork");
    },
    get explain() {
      return t("booth.indicatorList.album_covers_on_every_row_a");
    },
  },
];

export type IndicatorPrefs = Record<IndicatorId, boolean>;
export const indicatorDefaults = (): IndicatorPrefs => ({
  energy: true,
  bpm: true,
  key: true,
  era: true,
  artwork: true,
});
