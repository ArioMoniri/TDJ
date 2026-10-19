/** Android-only vibration with a visual twin everywhere (motion-composer.md §3.4). Silent under reduced motion. */
export const haptic = (pattern: number | number[]) => {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
};
