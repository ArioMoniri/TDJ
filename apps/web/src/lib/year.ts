/**
 * The year as the app prints it (wave 2): a known year, or nothing — never "?". Shared by the booth, Compose and
 * the database's versions list.
 */
export function yearText(y: number | null | undefined): string | null {
  return typeof y === "number" && Number.isFinite(y) && y > 0 ? String(Math.round(y)) : null;
}

/** A tanda's years: "1941–1944", or "1941" when they are one year (never "1941–1941"). */
export function yearSpan(r: readonly [number, number] | null | undefined): string | null {
  if (!r) return null;
  const a = yearText(r[0]);
  const b = yearText(r[1]);
  if (!a || !b) return a ?? b;
  return a === b ? a : `${a}–${b}`;
}

/** "Orchestra · Singer · 1941" from the known parts; empty, null and unknown parts are left out. */
export function metaLine(...parts: Array<string | number | null | undefined | false>): string {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== false && p !== "")
    .map(String)
    .join(" · ");
}
