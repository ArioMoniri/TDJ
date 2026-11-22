import type { Playlist, Song, Tanda } from "./types";

/**
 * 2026-11 (the owner: "have the night we created as the example night in the app, but it should not have texts like
 * 'your tanda kept as it is'"). The featured night (public/featured/golden-double-peak.json) IS the owner's night:
 * their tandas pinned as they made them, their closing version, their notes ("the DJ's Di Sarli tanda (…)"). Shown to
 * everyone as the app's example night it reads as a neutral example:
 *
 * - every pinned tanda stays pinned (the rules leave it as it is and the strict panel accepts its exceptions FOR THIS
 *   NIGHT ONLY — the owner's rule: their featured-night choices are never rules), but its reason is the example's
 *   own mark (`EXAMPLE_PIN`): the card says "Hand-picked", never "Your tanda · kept as is";
 * - the owner's notes on tandas, and the catalogue notes about "the DJ's featured-night tanda" on its sides, go;
 * - the composer's reason for a pinned tanda ("The DJ's tanda, kept as is") becomes a neutral one.
 *
 * Nothing about the music changes: the same sides, order, cortinas, Cumparsitas and booth plan. Pure (vitest).
 */
export const EXAMPLE_PIN = "example-night";
export const EXAMPLE_REASON = "hand-picked for the example night";

/** words that speak of the night's maker (the owner) rather than of the music */
const OWNER =
  /\bthe DJ\b|\bDJ's\b|\byour\b|\bkept as is\b|\bkept\b|\bmy\b|\bTDJ's pick\b|\bfeatured-night\b/i;
export const speaksOfOwner = (s: string | null | undefined) => !!s && OWNER.test(s);

const cleanSong = <S extends Song | null | undefined>(s: S): S => {
  if (!s || !speaksOfOwner(s.notes)) return s;
  return { ...s, notes: null };
};

const cleanTanda = (t: Tanda): Tanda => {
  const { note, ...rest } = t;
  const out: Tanda = {
    ...rest,
    ...(note && !speaksOfOwner(note) ? { note } : {}),
    songs: t.songs.map(cleanSong),
    cortina: t.cortina,
  };
  if (t.pinned) {
    out.pinned = { ...t.pinned, reason: EXAMPLE_PIN };
    if (speaksOfOwner(t.reason) || !t.reason) out.reason = EXAMPLE_REASON;
  } else if (speaksOfOwner(t.reason)) out.reason = EXAMPLE_REASON;
  return out;
};

/** the featured night as every user sees it (see above) */
export function asExampleNight(p: Playlist): Playlist {
  return {
    ...p,
    tandas: p.tandas.map(cleanTanda),
    opening: cleanSong(p.opening),
    closing: cleanSong(p.closing),
    ...(p.closingPinned ? { closingPinned: { ...p.closingPinned, reason: EXAMPLE_PIN } } : {}),
  };
}

/** a pinned tanda of the example night (the card's "Hand-picked", not the DJ's own "Your tanda") */
export const isExamplePin = (t: Pick<Tanda, "pinned">) => t.pinned?.reason === EXAMPLE_PIN;

/** the night still carries words about its maker (an older copy kept in this browser or in History) */
export function needsExample(p: Playlist): boolean {
  return (
    p.tandas.some(
      (t) =>
        speaksOfOwner(t.note) ||
        (t.pinned && t.pinned.reason !== EXAMPLE_PIN) ||
        speaksOfOwner(t.reason) ||
        t.songs.some((s) => speaksOfOwner(s.notes)),
    ) ||
    speaksOfOwner(p.closing?.notes) ||
    speaksOfOwner(p.opening?.notes) ||
    (!!p.closingPinned && p.closingPinned.reason !== EXAMPLE_PIN)
  );
}
