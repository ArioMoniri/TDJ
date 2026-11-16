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
 * de-duplicated with the smart search's rules (lib/smartSearch.ts `mergeVersions`: the same orchestra and voice, the
 * length within ±3 s), each with its sources and its cover. "This recording" is matched by id, else by Spotify uri,
 * else by orchestra + voice + recording year (never by the title alone), and listed first. "Only this version" is
 * said only when every source was searched and none found another.
 */

/** where a version's year comes from when it is not the recording's: a service dates the album */
export type YearNote = "reissue" | "album";

export interface VersionRow extends Version {
  /** "This recording": the side the details are about */
  current: boolean;
  /** the cover a row shows before the resolver's: a service's album image, a YouTube thumbnail (null: the catalogue's) */
  cover: string | null;
  /** the year is an album's (≈, muted): "reissue" for a golden-age recording on a later album */
  yearNote: YearNote | null;
}

export interface OtherVersions {
  /** "This recording" first, then the catalogue's versions and the services', oldest first within each */
  versions: VersionRow[];
  /** recordings of the work in the catalogue (the side included when it is a catalogue side) */
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

/** a YouTube video's thumbnail (320 × 180; a square tile crops its middle) */
export const youtubeThumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

const fold = (x: string | null | undefined) => (x ? normTitle(x) : "");

/**
 * How a version is "This recording" (the side the details are about), strongest first: the same id, the same Spotify
 * recording, or the same orchestra, voice and recording year (a service's album year never counts). Never the title
 * alone: every version of the work shares it. null: another recording.
 */
export function thisRecording(
  me: Pick<Song, "id" | "orchestra" | "orchestraId" | "singer" | "year" | "spotify">,
  v: Pick<Version, "song" | "external" | "sources">,
): "id" | "uri" | "people" | null {
  if (v.song.id === me.id) return "id";
  const uri = me.spotify?.uri;
  if (uri && (v.song.spotify?.uri === uri || v.external?.uri === uri)) return "uri";
  if (!v.sources.includes("catalogue") || !me.year || !v.song.year || me.year !== v.song.year) return null;
  const sameOrchestra =
    v.song.orchestraId === me.orchestraId ||
    (fold(v.song.orchestra) !== "" && fold(v.song.orchestra) === fold(me.orchestra));
  return sameOrchestra && fold(v.song.singer) === fold(me.singer) ? "people" : null;
}

/** the cover a version shows first: a service's album image, else a YouTube thumbnail; a catalogue row resolves its own */
export function versionCover(
  v: Pick<Version, "song" | "sources" | "external">,
  youtube: Readonly<Record<string, string>> = {},
): string | null {
  if (v.sources.includes("catalogue")) return null;
  const ext = v.external;
  if (ext?.image) return ext.image;
  if (ext?.service === "youtube") return youtubeThumb(ext.id);
  const yt = youtube[v.song.id];
  return yt ? youtubeThumb(yt) : null;
}

/**
 * A service-only version's year is its album's: a golden-age recording (an orchestra the catalogue knows, or an album
 * twenty years past the work's last catalogue recording) is a reissue ("≈ 2004 · album year (reissue)"); another
 * artist's is just an album year. A catalogue row's year is the recording's (no note).
 */
export function yearNoteOf(
  v: Pick<Version, "song" | "sources">,
  lastCatalogueYear: number | null,
): YearNote | null {
  if (v.sources.includes("catalogue") || !v.song.year) return null;
  const known = !!v.song.orchestraId && !v.song.orchestraId.startsWith("ext-");
  const late = lastCatalogueYear !== null && v.song.year - lastCatalogueYear >= 20;
  return known || late ? "reissue" : "album";
}

const isExt = (s: Pick<Song, "id">) => s.id.startsWith("ext:");

export function otherVersions(
  me: Song,
  catalogue: readonly Song[],
  services: readonly ServiceAnswer[],
  ctx: MergeContext,
  o: {
    extraSources?: (s: Song) => SourceId[];
    servicesSearched?: boolean;
    /** the DJ's YouTube matches (catalogue id → video id): a thumbnail for a row without a cover */
    youtube?: Readonly<Record<string, string>>;
  } = {},
): OtherVersions {
  const ext = isExt(me);
  const key = ext ? serviceWorkKey(me.title) : normTitle(me.title);
  const cat = catalogue.filter((s) => !isExt(s) && normTitle(s.title) === key);
  // the side is a catalogue row of its own unless it is a service's recording, or the list has it already (by id,
  // uri, or orchestra + voice + year)
  const listed = cat.some((s) => thisRecording(me, { song: s, sources: ["catalogue"] }) !== null);
  const rows = ext || listed ? cat : [me, ...cat];
  const hits = rows.map((song) => ({ song }) as unknown as SongSearchHit);
  const work = services.map((a) => ({ ...a, tracks: a.tracks.filter((t) => sameWork(t, key)) }));
  const merged = mergeVersions(
    hits,
    work,
    { ...ctx, rhythmOf: () => me.rhythm },
    { extraSources: o.extraSources },
  );
  // "This recording": by id, else by uri, else by orchestra + voice + year; a side no source has joins the list
  const how = merged.map((v) => thisRecording(me, v));
  let at = how.indexOf("id");
  if (at < 0) at = how.indexOf("uri");
  if (at < 0) at = how.indexOf("people");
  if (at < 0) {
    const source = (me as { source?: string }).source === "youtube" ? "youtube" : "spotify";
    merged.unshift({ key: me.id, song: me, sources: ext ? [source] : ["catalogue"], rhythmKnown: true });
    at = 0;
  }
  const isCat = (v: Version) => v.sources.includes("catalogue");
  const byYear = (a: Version, b: Version) =>
    (a.song.year ?? 9999) - (b.song.year ?? 9999) || a.song.orchestra.localeCompare(b.song.orchestra);
  const mine = merged[at]!;
  const rest = merged.filter((v) => v !== mine);
  const years = merged
    .filter(isCat)
    .map((v) => v.song.year ?? 0)
    .filter((y) => y > 0);
  const lastYear = years.length ? Math.max(...years) : null;
  const row = (v: Version, current: boolean): VersionRow => ({
    ...v,
    current,
    cover: versionCover(v, o.youtube),
    yearNote: yearNoteOf(v, lastYear),
  });
  const versions = [
    row(mine, true),
    ...rest
      .filter(isCat)
      .sort(byYear)
      .map((v) => row(v, false)),
    ...rest
      .filter((v) => !isCat(v))
      .sort(byYear)
      .map((v) => row(v, false)),
  ];
  const unsearched = services.filter((a) => a.state !== "ok" && a.state !== "off").map((a) => a.id);
  const searched = o.servicesSearched !== false && !unsearched.length;
  return {
    versions,
    catalogue: versions.filter(isCat).length,
    serviceOnly: versions.filter((v) => !isCat(v)).length,
    serviceMatched: versions.filter((v) => isCat(v) && v.external).length,
    services: services.map((a) => ({ id: a.id, state: a.state })),
    onlyThis: searched && versions.length === 1,
    unsearched,
  };
}
