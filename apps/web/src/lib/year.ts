/**
 * The year as the app prints it (wave 2): a known year, or nothing — never "?". Shared by the booth, Compose and
 * the database's versions list.
 */
export function yearText(y: number | null | undefined): string | null {
  return typeof y === "number" && Number.isFinite(y) && y > 0 ? String(Math.round(y)) : null;
}

/** "Orchestra · Singer · 1941" from the known parts; empty, null and unknown parts are left out. */
export function metaLine(...parts: Array<string | number | null | undefined | false>): string {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== false && p !== "")
    .map(String)
    .join(" · ");
}
