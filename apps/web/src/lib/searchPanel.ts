import type { Playlist } from "@tdj/core";
import { t as tx } from "@/lib/i18n";

/**
 * Round 22 — where a side from the search panel can go: the tandas of its rhythm (a vals never joins a tango tanda),
 * each with its chairs, and why a tanda is closed (the Booth: playing or played).
 */
export interface Target {
  tanda: number;
  label: string;
  sub: string;
  chairs: Array<{ track: number; title: string; year: number | null }>;
  closed?: string;
}
export function targetsFor(
  p: Playlist | null | undefined,
  rhythm: string,
  opts: { closedBefore?: number } = {},
): Target[] {
  if (!p) return [];
  return p.tandas.flatMap((t, i) =>
    t.rhythm !== rhythm
      ? []
      : [
          {
            tanda: i,
            label: tx("searchPanel.tanda", { p1: i + 1, orchestra: t.orchestra }),
            sub: [t.singer ?? "Instrumental", t.yearRange?.join("–")].filter(Boolean).join(" · "),
            chairs: t.songs.map((s, k) => ({ track: k, title: s.title, year: s.year ?? null })),
            ...(opts.closedBefore !== undefined && i <= opts.closedBefore
              ? { closed: tx("searchPanel.playing_or_played_it_can_no") }
              : {}),
          },
        ],
  );
}

/** the panel's width on wide screens, kept between 300 and 640 px */
export const PANEL_MIN = 300;
export const PANEL_MAX = 640;
export const PANEL_DEFAULT = 380;
export const clampPanel = (w: number) =>
  Number.isFinite(w) ? Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w))) : PANEL_DEFAULT;
