/**
 * 2026-11 (the owner on the night's mini controller: "UI issue for the jump guide" — "Tap again to jump to 0:30" sat at
 * the bar's far right over Pause / Next / Mute, far from its marker): where the bubble goes, in px from the bar's left.
 * Centred over the marker, kept inside the bar, and — when the buttons sit above the bar's right part — ending before
 * them (8 px clear); `tip` is the pointer's x inside the bubble (on the marker, 10 px from either end at most).
 */
export function placeSeekBubble(
  bar: { left: number; right: number; top: number },
  width: number,
  frac: number,
  buttons?: { left: number; right: number; bottom: number } | null,
): { left: number; tip: number } {
  const w = bar.right - bar.left;
  const mark = Math.max(0, Math.min(1, frac)) * w;
  // the buttons over the bar (their foot near its top): the bubble stops 8 px before them
  const over =
    buttons && buttons.bottom > bar.top - 40 && buttons.left < bar.right && buttons.right > bar.left;
  const maxRight = over ? Math.min(w, buttons.left - bar.left - 8) : w;
  const left = Math.max(0, Math.min(mark - width / 2, maxRight - width));
  const tip = Math.max(10, Math.min(width - 10, mark - left));
  return { left, tip };
}
