/**
 * The theme <html> carries (components/ThemeSync.tsx). Every page: the app's own (Settings → Appearance: Auto, Light,
 * Dark). 2026-11 (the owner: "the Booth tab is always in dark mode"): the Booth follows it too — Auto resolved to
 * light or dark there, since the Booth's contrast rules are written per theme (booth.css) — and is always dark only
 * when the DJ turned on "Always dark in the Booth" (off by default).
 */
export function htmlTheme(
  theme: "auto" | "light" | "dark",
  o: { booth: boolean; boothDark: boolean; systemDark: boolean },
): "auto" | "light" | "dark" {
  if (!o.booth) return theme;
  if (o.boothDark) return "dark";
  return theme === "auto" ? (o.systemDark ? "dark" : "light") : theme;
}
