import { normTitle, type SongSearchHit } from "@tdj/core";
import {
  type MergeContext,
  mergeVersions,
  type ServiceAnswer,
  type ServiceTrack,
  type SourceId,
  type Version,
  workKey,
} from "./smartSearch";
import type { Song } from "./types";

/**
 * 2026-11 (the owner: "'Only this version is in the catalogue' for most songs … it is not complete"): a side's other
 * versions are every recording of its work — every orchestra, every voice, every year — from the catalogue (the work's
 * whole list, GET /api/dna?kind=work) and from the DJ's connected services (POST /api/services/search: their Spotify),
 * de-duplicated with the smart search's rules (lib/smartSearch.ts `mergeVersions`), each with its sources. "Only this
 * version" is said only when every source was searched and none found another.
 */

export interface OtherVersions {
  /** the side first, then the catalogue's versions and the services', oldest first within each */
  versions: Array<Version & { current: boolean }>;
  /** recordings of the work in the catalogue (the side included) */
  catalogue: number;
  /** recordings only a service has (not in the catalogue) */
  serviceOnly: number;
  /** catalogue rows a service also has */
  serviceMatched: number;
  /** each service and how it answered */
  services: Array<Pick<ServiceAnswer, "id" | "state">>;
  /** every source was searched and nothing but the side was found */
  onlyThis: boolean;
  /** a source that could not be searched (not connected, busy, error) */
  unsearched: Array<ServiceAnswer["id"]>;
}

/** the title of a service's track without its edition tail ("Malena - Remastered 2004", "Malena (1942)") */
export const serviceWorkKey = (title: string) =>
  workKey(title.replace(/\s+[-–—]\s+.*$/, "").replace(/\s*\[.*?\]\s*/g, " "));

/** a service's track is a recording of this work */
export const sameWork = (t: Pick<ServiceTrack, "title">, key: string) => serviceWorkKey(t.title) === key;

/** the query sent to the services for a side's work: the title and the orchestra's leader */
export function serviceQuery(me: Pick<Song, "title" | "orchestra">): string {
  return me.title.replace(/\(.*?\)/g, "").trim();
}

export function otherVersions(
  me: Song,
  catalogue: readonly Song[],
  services: readonly ServiceAnswer[],
  ctx: MergeContext,
  o: { extraSources?: (s: Song) => SourceId[]; servicesSearched?: boolean } = {},
): OtherVersions {
  const key = normTitle(me.title);
  const rows = [me, ...catalogue.filter((s) => s.id !== me.id && normTitle(s.title) === key)];
  const hits = rows.map((song) => ({ song }) as unknown as SongSearchHit);
  const work = services.map((a) => ({ ...a, tracks: a.tracks.filter((t) => sameWork(t, key)) }));
  const merged = mergeVersions(
    hits,
    work,
    { ...ctx, rhythmOf: () => me.rhythm },
    { extraSources: o.extraSources },
  );
  const isCat = (v: Version) => v.sources.includes("catalogue");
  const byYear = (a: Version, b: Version) =>
    (a.song.year ?? 9999) - (b.song.year ?? 9999) || a.song.orchestra.localeCompare(b.song.orchestra);
  const mine = merged.find((v) => v.song.id === me.id)!;
  const rest = merged.filter((v) => v !== mine);
  const versions = [
    { ...mine, current: true },
    ...rest
      .filter(isCat)
      .sort(byYear)
      .map((v) => ({ ...v, current: false })),
    ...rest
      .filter((v) => !isCat(v))
      .sort(byYear)
      .map((v) => ({ ...v, current: false })),
  ];
  const unsearched = services.filter((a) => a.state !== "ok" && a.state !== "off").map((a) => a.id);
  const searched = o.servicesSearched !== false && !unsearched.length;
  return {
    versions,
    catalogue: rows.length,
    serviceOnly: versions.filter((v) => !isCat(v)).length,
    serviceMatched: versions.filter((v) => isCat(v) && v.external).length,
    services: services.map((a) => ({ id: a.id, state: a.state })),
    onlyThis: searched && versions.length === 1,
    unsearched,
  };
}
