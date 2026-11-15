/**
 * Round 22 (ROADMAP §1.7, §6): every indicator on a song row can be turned on or off, each with one line saying what
 * it shows. Pure data: the Settings page, the player's Show menu and the app builds read the same list.
 */
export type IndicatorId = "energy" | "bpm" | "key" | "era" | "artwork";

export const INDICATORS: ReadonlyArray<{ id: IndicatorId; label: string; explain: string }> = [
  {
    id: "energy",
    label: "Energy",
    explain: "How lively each song and tanda is (0–100), and the night's energy chart.",
  },
  { id: "bpm", label: "BPM", explain: "The tempo in beats per minute, where it was measured." },
  { id: "key", label: "Key", explain: "The musical key (Camelot and name), from the analysed preview." },
  {
    id: "era",
    label: "Era badge",
    explain: "Where each side sits in its orchestra's best years, from your heatmap.",
  },
  {
    id: "artwork",
    label: "Artwork",
    explain: "Album covers on every row; a coloured tile per orchestra without one.",
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
