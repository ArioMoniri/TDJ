import type { Song } from "./types";

/**
 * Round 15: the catalogue the strict panel reads for its family rules (bestWindow, streamNight: "the family's best
 * free window", "no streamable alternative"). Dependency-free; the last `Catalog` constructed registers its sides
 * per orchestra here. A night judged with no catalogue loaded (a browser view) reads those two rules as n/a.
 */
export const ACTIVE_CATALOG: { byOrchestra: Map<string, Song[]> | null } = { byOrchestra: null };
export function setActiveCatalog(byOrchestra: Map<string, Song[]> | null): void {
  ACTIVE_CATALOG.byOrchestra = byOrchestra;
}
