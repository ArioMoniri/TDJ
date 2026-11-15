import { type AgentMemory, learnFromPraise, type Playlist, praiseFromNight, praiseOf } from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * 2026-11 — "Praise this tanda ★" (the Booth's Controls → Floor group and the set list's tanda header): the DJ's
 * feedback that a tanda of any night was great, kept in the DJ's memory (`learned.praise`, the same entry the featured
 * night's store holds: packages/core/src/praise.ts) with an optional short note. Compose and the suggestions count it
 * as one "Floor full ♥" for the tanda's songs in its part of the night, nothing more; it rides with `learned`, so the
 * learning switch (and, like a tap, the dancer-favourites switch) decides whether it counts. The same tanda praised
 * again takes it back. Pure functions of the memory, so vitest checks them without a browser.
 */

/** tanda `tanda` (1-based, the plan's) of a night is praised in the DJ's memory */
export const isPraised = (m: AgentMemory | null | undefined, p: Playlist | null | undefined, tanda: number) =>
  !!p && tanda >= 1 && !!praiseOf(m?.learned, p.id, tanda - 1);

/** praise tanda `tanda` (1-based) of a night, or take the praise back when it is already there */
export function praiseTanda(
  m: AgentMemory,
  p: Playlist,
  tanda: number,
  note?: string,
  at: Date = new Date(),
): AgentMemory {
  if (tanda < 1 || !p.tandas[tanda - 1]) return m;
  const had = praiseOf(m.learned, p.id, tanda - 1);
  const entry =
    had ??
    praiseFromNight(p, tanda - 1, t("praise.reason_booth"), {
      at: at.toISOString(),
      source: "dj",
      ...(note?.trim() ? { note: note.trim() } : {}),
    });
  return { ...m, learned: learnFromPraise(m.learned, entry), updatedAt: at.toISOString() };
}
