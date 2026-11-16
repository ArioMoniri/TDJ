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

/**
 * 2026-11: the long press of a song row (the song menu): a vibration where there is one, and on iPhone and iPad
 * (Safari, the app's web view: no Vibration API) the system's tick of a switch control, toggled off screen.
 */
export const pressHaptic = () => {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
      return;
    }
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    label.setAttribute("aria-hidden", "true");
    label.append(input);
    document.body.append(label);
    label.click();
    label.remove();
  } catch {
    /* unsupported */
  }
};
