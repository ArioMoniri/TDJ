import { isCumparsita } from "./cumparsita";
import { approveEdit, checkEdit, type RuleViolation } from "./editCheck";
import { normTitle } from "./energy";
import { emptyLearned, learnFromEdit } from "./learn";
import { matchProblem, namedRhythm, namesLeader } from "./matchRules";
import { type NightFile, nightHash } from "./night";
import { buildSongIndex, type SongIndex, searchSongs } from "./search";
import { renight, retimeTanda } from "./swap";
import { editDistance, typoBudget } from "./textIndex";
import type {
  ComposeOptions,
  Cortina,
  DanceRhythm,
  Era,
  LearnedPreferences,
  NightException,
  Phase,
  Playlist,
  Song,
  Tanda,
} from "./types";

/**
 * 2026-11 — "Import a playlist": a Spotify or YouTube playlist, a DJ app's file (M3U / M3U8, XSPF, Rekordbox XML,
 * Traktor NML, a DJ CSV, a TuneMyMusic / Soundiiz / Exportify CSV, T-DJ's own CSV) or a pasted list becomes a night
 * the DJ can open in Compose, play in the Booth or share in a room.
 *
 * 1. `parsePlaylistFile` / `parseTextList` read the source into `ImportItem`s (title, artists, album, length, year and
 *    whatever the file says about cortinas and tandas). T-DJ's exporters write every hint these read back.
 * 2. `matchImport` finds each item in the catalogue with the export match rules (matchRules.ts `matchProblem`, the
 *    catalogue side as the row and the item as the candidate: another orchestra, another singer, a tribute orchestra
 *    or album, a remake series, another rhythm are refused), accent- and typo-tolerant, with a confidence; a cortina
 *    is found among the cortinas; the rest stays as the service's or the file's own recording (`ext:<service>:<id>`)
 *    so it still plays and exports.
 * 3. `detectStructure` splits the list into tandas and cortinas: the file's own marks first, then non-tango or short
 *    items and a title repeated between groups; with no cortina at all, runs of one orchestra and rhythm. A first or
 *    last La Cumparsita is the opening or the closing.
 * 4. The DJ fixes the splits (`splitBefore`, `mergeWithNext`, `setRole`) and `buildImportedNight` makes the night:
 *    every tanda pinned as the DJ's, what a tanda breaks reported as information (editCheck.ts) and accepted as a
 *    one-night exception of this night only (`approveEdit`); nothing is learned unless the DJ asks
 *    (`learnFromImport`).
 */

export type ImportFormat =
  | "m3u"
  | "xspf"
  | "rekordbox"
  | "traktor"
  | "csv-tdj"
  | "csv-dj"
  | "csv-transfer"
  | "text"
  | "tdjnight"
  | "folder"
  | "spotify"
  | "youtube";

export interface ImportItem {
  title: string;
  /** the credited artists, main first ("Carlos Di Sarli", "Roberto Rufino") */
  artists: string[];
  album?: string;
  durationSec?: number;
  year?: number;
  /** the year is the album's release (a service's), not the recording's */
  yearIsRelease?: boolean;
  genre?: string;
  spotifyUri?: string;
  isrc?: string;
  youtubeId?: string;
  /** a local file name or path */
  file?: string;
  url?: string;
  /** the source marks it as a cortina */
  cortina?: boolean;
  /** the source groups it into this tanda (1-based; 0 = before the first) */
  tanda?: number;
  /** the source marks it as the opening / closing La Cumparsita */
  closing?: "opening" | "closing";
  /** the catalogue id a T-DJ export wrote beside the row (M3U `#TDJ:id=`, XSPF `<identifier>tdj:…`) */
  tdjId?: string;
  /** other readings of a label ("A - B - C" split elsewhere, or title and artist the other way round) */
  variants?: Array<Pick<ImportItem, "title" | "artists">>;
  /** a pasted list's blank line or "Tanda" heading before it */
  breakBefore?: boolean;
}

export interface ParsedPlaylist {
  format: ImportFormat;
  name: string;
  items: ImportItem[];
  /** a T-DJ night file: imported whole (night.ts importNight), not item by item */
  night?: NightFile;
}

export class PlaylistFormatError extends Error {}

/* ---------- small readers ---------- */

const XML_ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : (XML_ENT[e.toLowerCase()] ?? m),
  );
const attrs = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g))
    out[m[1]!.toUpperCase()] = unxml(m[3] ?? m[4] ?? "");
  return out;
};
const child = (block: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? unxml(m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim() : "";
};
const num = (x: unknown) => {
  const n = typeof x === "number" ? x : Number(String(x ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
/** "3:05", "185", "185000" (ms), "PT3M5S" → seconds */
export function parseDuration(x: unknown, msHint = false): number | undefined {
  const s = String(x ?? "").trim();
  if (!s) return undefined;
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(s);
  if (iso) return Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0) || undefined;
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (clock)
    return clock[3]
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
  const n = num(s);
  if (!n) return undefined;
  return Math.round(msHint || n > 10_000 ? n / 1000 : n);
}
const yearOf = (x: unknown) => {
  const m = /\b(1[89]\d\d|20\d\d)\b/.exec(String(x ?? ""));
  return m ? Number(m[1]) : undefined;
};
const SPOTIFY_TRACK =
  /spotify:track:([A-Za-z0-9]{22})|open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/;
const spotifyUriOf = (s: string | undefined) => {
  const m = SPOTIFY_TRACK.exec(s ?? "");
  return m ? `spotify:track:${m[1] ?? m[2]}` : undefined;
};
const RHYTHM_GENRE = /\b(tango|vals|valse|waltz|milonga|cortina)\b/i;

/** "Carlos Di Sarli / Roberto Rufino", "Di Sarli feat. Rufino", "A, B" → the artists, main first */
export function splitArtists(s: string): string[] {
  return s
    .split(/\s+\/\s+|\s*;\s*|\s+(?:feat\.?|ft\.?|featuring|with|con|y su orquesta,?)\s+|\s*,\s+|\s+&\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** "Artist - Title", "Title – Artist": the two halves of the first dash that separates words */
function dashSplit(s: string): [string, string] | null {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(s.trim());
  return m ? [m[1]!.trim(), m[2]!.trim()] : null;
}
/** every way a label with several dashes splits ("Donato / Lita Morales - H. Lagos - Carnaval de mi barrio") */
function dashVariants(s: string, swap: boolean): Array<Pick<ImportItem, "title" | "artists">> {
  const t = s.trim();
  const out: Array<Pick<ImportItem, "title" | "artists">> = [];
  for (const m of t.matchAll(/\s+[-–—]\s+/g)) {
    const a = t.slice(0, m.index).trim();
    const b = t.slice(m.index! + m[0].length).trim();
    if (!a || !b) continue;
    out.push({ title: b, artists: splitArtists(a) });
    if (swap) out.push({ title: a, artists: splitArtists(b) });
  }
  return out;
}
/** "Artist - Title" (or either way round when `swap`): the first split, the others as variants the matcher tries */
function labelItem(label: string, swap: boolean, artistFirst = true): ImportItem {
  const v = dashVariants(label, swap);
  if (!v.length) return { title: label.trim(), artists: [] };
  // (a pasted line reads "Title – Orchestra" first; a file label "Artist - Title")
  const first = artistFirst || !swap ? v[0]! : (v[1] ?? v[0]!);
  const rest = v.filter((x) => x !== first);
  return { ...first, ...(rest.length ? { variants: rest } : {}) };
}
const stripExt = (f: string) =>
  f.replace(/^.*[/\\]/, "").replace(/\.(mp3|m4a|aac|flac|wav|aiff?|ogg|opus|alac|wma)$/i, "");

/** an audio file's name ("Carlos Di Sarli - Bahía Blanca.mp3", "03 Bahía Blanca.flac") as an item */
export function itemFromFileName(path: string): ImportItem {
  const base = stripExt(decodeURIComponentSafe(path)).replace(/^\d{1,3}[\s._-]+/, "");
  return { ...labelItem(base, true), file: path };
}
function decodeURIComponentSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** CSV with quotes, any of , ; or tab as the separator (the first line decides) */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/* ---------- formats ---------- */

function parseM3U(text: string, fileName: string): ParsedPlaylist {
  const items: ImportItem[] = [];
  let name = "";
  let inf: { dur?: number; label: string } | null = null;
  let tdjId: string | undefined;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#PLAYLIST:/i.test(line)) name = line.slice(10).trim();
    else if (/^#EXTINF:/i.test(line)) {
      const m = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/i.exec(line);
      inf = m ? { dur: num(m[1]), label: m[2]!.trim() } : { label: line.slice(8) };
      tdjId = undefined;
    } else if (/^#TDJ:id=/.test(line)) tdjId = line.slice(8).trim().slice(0, 160);
    else if (line.startsWith("#")) continue;
    else {
      const cortinaMark = /\s*\[CORTINA\]\s*$/i;
      let it: ImportItem;
      if (inf?.label) {
        const label = inf.label.replace(cortinaMark, "");
        it = labelItem(label, false);
        if (cortinaMark.test(inf.label)) it.cortina = true;
        if (inf.dur) it.durationSec = Math.round(inf.dur);
      } else it = itemFromFileName(line);
      const uri = spotifyUriOf(line);
      if (uri) it.spotifyUri = uri;
      else if (/^https?:/i.test(line)) it.url = line;
      else it.file = line;
      if (tdjId) it.tdjId = tdjId;
      items.push(it);
      inf = null;
      tdjId = undefined;
    }
  }
  return { format: "m3u", name: name || baseName(fileName), items };
}

function parseXSPF(text: string, fileName: string): ParsedPlaylist {
  const head = text.split(/<trackList/i)[0] ?? "";
  const items: ImportItem[] = [];
  for (const m of text.matchAll(/<track>([\s\S]*?)<\/track>/gi)) {
    const b = m[1]!;
    const loc = child(b, "location");
    const ann = child(b, "annotation");
    const creator = child(b, "creator");
    const it: ImportItem = {
      title: child(b, "title") || stripExt(loc),
      artists: splitArtists(creator),
    };
    const album = child(b, "album");
    if (album) it.album = album;
    const dur = parseDuration(child(b, "duration"), true);
    if (dur) it.durationSec = dur;
    const uri = spotifyUriOf(loc);
    if (uri) it.spotifyUri = uri;
    else if (loc) it.file = loc;
    if (/cortina/i.test(ann)) it.cortina = true;
    const tm = /tanda\s+(\d+)/i.exec(ann);
    if (tm) it.tanda = Number(tm[1]);
    const ident = /^tdj:(.{1,160})$/.exec(child(b, "identifier"));
    if (ident) it.tdjId = ident[1];
    items.push(it);
  }
  return { format: "xspf", name: child(head, "title") || baseName(fileName), items };
}

function parseRekordbox(text: string, fileName: string): ParsedPlaylist {
  const byId = new Map<string, ImportItem>();
  const coll = /<COLLECTION[\s\S]*?<\/COLLECTION>/i.exec(text)?.[0] ?? "";
  for (const m of coll.matchAll(/<TRACK\s([^>]*?)\/?>/gi)) {
    const a = attrs(m[1]!);
    if (!a.TRACKID) continue;
    const it: ImportItem = {
      title: a.NAME || stripExt(a.LOCATION ?? ""),
      artists: splitArtists(a.ARTIST ?? ""),
    };
    if (a.ALBUM && a.ALBUM !== "TDJ" && a.ALBUM !== "Cortinas") it.album = a.ALBUM;
    const dur = parseDuration(a.TOTALTIME);
    if (dur) it.durationSec = dur;
    const y = yearOf(a.YEAR);
    if (y) it.year = y;
    if (a.GENRE) it.genre = a.GENRE;
    if (/cortina/i.test(a.GENRE ?? "") || /cortina/i.test(a.ALBUM ?? "")) it.cortina = true;
    const uri = spotifyUriOf(a.MIX) ?? spotifyUriOf(a.LOCATION);
    if (uri) it.spotifyUri = uri;
    else if (a.LOCATION) it.file = decodeURIComponentSafe(a.LOCATION.replace(/^file:\/\/localhost/, ""));
    const tm = /Tanda (\d+)/.exec(a.COMMENTS ?? "");
    if (tm) it.tanda = Number(tm[1]);
    byId.set(a.TRACKID, it);
  }
  // the playlist order: T-DJ's "Full set (in order)" node, else the first playlist with entries, else the collection
  const lists = [...text.matchAll(/<NODE\s([^>]*?Type="1"[^>]*)>([\s\S]*?)<\/NODE>/gi)].map((m) => ({
    name: attrs(m[1]!).NAME ?? "",
    keys: [...m[2]!.matchAll(/<TRACK\s[^>]*Key="([^"]+)"/gi)].map((k) => k[1]!),
  }));
  const pick = lists.find((l) => /full set/i.test(l.name)) ?? lists.find((l) => l.keys.length);
  const items = pick
    ? pick.keys.map((k) => byId.get(k)).filter((x): x is ImportItem => !!x)
    : [...byId.values()];
  // T-DJ's tanda folders ("03 TANGO · Carlos Di Sarli / Roberto Rufino") group the tracks too
  lists.forEach((l) => {
    const n = /^(\d{1,3}) /.exec(l.name);
    if (!n || l === pick) return;
    for (const k of l.keys) {
      const it = byId.get(k);
      if (it && it.tanda === undefined && !it.cortina) it.tanda = Number(n[1]);
    }
  });
  const root = /<NODE\s[^>]*Type="0"[^>]*Name="([^"]+)"/i.exec(text.replace(/Name="ROOT"/, ""));
  const name = (root ? unxml(root[1]!) : "") || (pick && !/full set/i.test(pick.name) ? pick.name : "");
  return { format: "rekordbox", name: name || baseName(fileName), items };
}

function parseTraktor(text: string, fileName: string): ParsedPlaylist {
  const coll = /<COLLECTION[\s\S]*?<\/COLLECTION>/i.exec(text)?.[0] ?? "";
  const byKey = new Map<string, ImportItem>();
  const order: ImportItem[] = [];
  for (const m of coll.matchAll(/<ENTRY\s([^>]*)>([\s\S]*?)<\/ENTRY>/gi)) {
    const a = attrs(m[1]!);
    const body = m[2]!;
    const loc = attrs(/<LOCATION\s([^>]*)>/i.exec(body)?.[1] ?? "");
    const info = attrs(/<INFO\s([^>]*)>/i.exec(body)?.[1] ?? "");
    const album = attrs(/<ALBUM\s([^>]*)>/i.exec(body)?.[1] ?? "").TITLE;
    const it: ImportItem = {
      title: a.TITLE || stripExt(loc.FILE ?? ""),
      artists: splitArtists(a.ARTIST ?? ""),
    };
    if (album && album !== "TDJ") it.album = album;
    const dur = parseDuration(info.PLAYTIME);
    if (dur) it.durationSec = dur;
    const y = yearOf(info.RELEASE_DATE);
    if (y) it.year = y;
    if (info.GENRE) it.genre = info.GENRE;
    if (/cortina/i.test(info.GENRE ?? "")) it.cortina = true;
    const tm = /Tanda (\d+)/.exec(info.COMMENT ?? "");
    if (tm) it.tanda = Number(tm[1]);
    if (loc.FILE) it.file = `${loc.DIR ?? ""}${loc.FILE}`;
    byKey.set(`${loc.DIR ?? ""}${loc.FILE ?? ""}`, it);
    order.push(it);
  }
  const pl = /<PLAYLIST\s[^>]*>([\s\S]*?)<\/PLAYLIST>/i.exec(text)?.[1] ?? "";
  const keys = [...pl.matchAll(/<PRIMARYKEY\s([^>]*)>/gi)].map((m) => attrs(m[1]!).KEY ?? "");
  const items = keys.length
    ? keys
        .map((k) => {
          for (const [ck, it] of byKey) if (ck && k.endsWith(ck)) return it;
          return undefined;
        })
        .filter((x): x is ImportItem => !!x)
        // a key listed twice (the same cortina file twice) is two plays
        .map((x) => ({ ...x }))
    : order;
  const nm = /<NODE\s[^>]*TYPE="PLAYLIST"[^>]*NAME="([^"]*)"/i.exec(text);
  return { format: "traktor", name: (nm ? unxml(nm[1]!) : "") || baseName(fileName), items };
}

const H = (h: string) =>
  h
    .toLowerCase()
    .replace(/^﻿/, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();
const COLS: Record<string, string[]> = {
  title: ["title", "name", "track name", "track", "song", "song name", "track title"],
  artist: ["artist", "artist name", "artist name s", "artists", "orchestra/artist", "creator", "performer"],
  singer: ["singer", "vocalist"],
  album: ["album", "album name", "album title"],
  year: ["year", "release date", "album release date", "date"],
  duration: ["duration", "duration sec", "duration ms", "duration_ms", "length", "time", "track duration ms"],
  genre: ["genre", "genres", "rhythm"],
  kind: ["kind", "type"],
  tanda: ["tanda"],
  uri: [
    "spotify uri",
    "spotify_uri",
    "track uri",
    "uri",
    "spotify id",
    "spotify - id",
    "spotify track id",
    "url",
    "track url",
  ],
  isrc: ["isrc"],
};

function parseCsvPlaylist(text: string, fileName: string): ParsedPlaylist {
  const rows = parseCsv(text);
  if (!rows.length) throw new PlaylistFormatError("The file is empty.");
  const head = rows[0]!.map(H);
  const col = (k: string) => {
    for (const alias of COLS[k]!) {
      const i = head.indexOf(H(alias));
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = Object.fromEntries(Object.keys(COLS).map((k) => [k, col(k)])) as Record<
    | "title"
    | "artist"
    | "singer"
    | "album"
    | "year"
    | "duration"
    | "genre"
    | "kind"
    | "tanda"
    | "uri"
    | "isrc",
    number
  >;
  const tdj = c.kind >= 0 && c.tanda >= 0 && head.includes("orchestra/artist");
  const dj = !tdj && head.includes("comment") && head[0] === "name";
  const format: ImportFormat = tdj ? "csv-tdj" : dj ? "csv-dj" : "csv-transfer";
  const hasHeader = c.title >= 0 || c.artist >= 0;
  if (!hasHeader) {
    // no header: "title, artist" rows (a hand-made list)
    c.title = 0;
    c.artist = rows[0]!.length > 1 ? 1 : -1;
  }
  const items: ImportItem[] = [];
  let playlistName = "";
  const pnCol = head.indexOf("playlist name");
  const msCol = head.findIndex((h) => / ms$/.test(h) || h === "duration_ms");
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const get = (k: keyof typeof c) => (c[k] >= 0 ? (r[c[k]] ?? "").trim() : "");
    const kind = get("kind").toLowerCase();
    if (kind === "break") continue;
    const title = get("title");
    if (!title) continue;
    let artists = splitArtists(get("artist"));
    const singer = get("singer");
    if (tdj && singer && artists.length === 1) artists = [artists[0]!, singer];
    else if (singer && !artists.some((a) => normTitle(a) === normTitle(singer))) artists.push(singer);
    const it: ImportItem = { title, artists };
    const album = get("album");
    if (album) it.album = album;
    const dur = parseDuration(get("duration"), msCol >= 0 && msCol === c.duration);
    if (dur) it.durationSec = dur;
    const y = yearOf(get("year"));
    if (y) {
      it.year = y;
      if (!tdj && !dj && /date/.test(head[c.year] ?? "")) it.yearIsRelease = true;
    }
    const genre = get("genre");
    if (genre) it.genre = genre;
    if (kind === "cortina" || /cortina/i.test(genre)) it.cortina = true;
    if (tdj) {
      const tn = num(get("tanda"));
      if (kind === "closing") it.closing = tn ? "closing" : "opening";
      else if (tn !== undefined) it.tanda = tn;
    } else if (dj) {
      const tm = /Tanda (\d+)/.exec(r[head.indexOf("comment")] ?? "");
      if (tm) it.tanda = Number(tm[1]);
    }
    const uriCell = get("uri");
    const uri =
      spotifyUriOf(uriCell) ?? (/^[A-Za-z0-9]{22}$/.test(uriCell) ? `spotify:track:${uriCell}` : undefined);
    if (uri) it.spotifyUri = uri;
    const isrc = get("isrc");
    if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(isrc)) it.isrc = isrc.toUpperCase();
    if (!playlistName && pnCol >= 0) playlistName = (r[pnCol] ?? "").trim();
    items.push(it);
  }
  return { format, name: playlistName || baseName(fileName), items };
}

const baseName = (f: string) =>
  f
    .replace(/^.*[/\\]/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim();

/**
 * A pasted list: one recording per line, "Title – Orchestra", "Orchestra - Title", "Title, Orchestra / Singer
 * (1941)", numbered or bulleted; a blank line or a "Tanda 3" heading starts a tanda, a "Cortina" line is a cortina.
 */
export function parseTextList(text: string, name = ""): ParsedPlaylist {
  const items: ImportItem[] = [];
  let brk = false;
  for (const raw of text.split(/\r?\n/)) {
    let line = raw
      .replace(/^\s*(?:[-*•·]|\d{1,3}[.)]|\d{1,3}\s+[-–—])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) {
      brk = items.length > 0;
      continue;
    }
    if (/^(tanda\s*\d*|t\d{1,2})\s*[:.]?\s*(tango|vals|milonga)?s?\s*$/i.test(line)) {
      brk = items.length > 0;
      continue;
    }
    const cortina = /^(cortina|\[cortina\])\b\s*[:\-–—]?\s*/i.exec(line);
    if (cortina) line = line.slice(cortina[0].length).trim();
    let year: number | undefined;
    let dur: number | undefined;
    line = line
      .replace(/\s*[([]\s*(1[89]\d\d|20\d\d)\s*[)\]]\s*/, (_, y: string) => {
        year = Number(y);
        return " ";
      })
      .replace(/\s+(\d{1,2}:\d{2})\s*$/, (_, d: string) => {
        dur = parseDuration(d);
        return "";
      })
      .trim();
    const comma = dashSplit(line) ? null : /^(.+?),\s+(.+)$/.exec(line);
    const it: ImportItem = comma
      ? {
          title: comma[1]!.trim(),
          artists: splitArtists(comma[2]!),
          variants: [{ title: comma[2]!.trim(), artists: splitArtists(comma[1]!) }],
        }
      : dashSplit(line)
        ? labelItem(line, true, false)
        : { title: line || "Cortina", artists: [] };
    if (year) it.year = year;
    if (dur) it.durationSec = dur;
    if (cortina) it.cortina = true;
    if (brk) it.breakBefore = true;
    brk = false;
    items.push(it);
  }
  return { format: "text", name: name || "Pasted list", items };
}

/** Reads a playlist file by its content (the extension only breaks ties). Throws `PlaylistFormatError`. */
export function parsePlaylistFile(text: string, fileName = ""): ParsedPlaylist {
  const t = text.replace(/^﻿/, "").trim();
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  if (!t) throw new PlaylistFormatError("The file is empty.");
  if (t.startsWith("{") || t.startsWith("[")) {
    let j: unknown;
    try {
      j = JSON.parse(t);
    } catch {
      throw new PlaylistFormatError("This JSON file could not be read.");
    }
    const o = j as Record<string, unknown>;
    if (o && o.format === "tdjnight")
      return { format: "tdjnight", name: String(o.name ?? ""), items: [], night: o as unknown as NightFile };
    if (o && Array.isArray(o.tandas)) return fromPlaylistJson(o as unknown as Playlist);
    throw new PlaylistFormatError("This JSON file is not a T-DJ night.");
  }
  if (/^#EXTM3U/i.test(t) || ext === "m3u" || ext === "m3u8") return parseM3U(t, fileName);
  if (/<playlist[\s>][\s\S]*xspf\.org/i.test(t) || ext === "xspf") return parseXSPF(t, fileName);
  if (/<DJ_PLAYLISTS/i.test(t)) return parseRekordbox(t, fileName);
  if (/<NML[\s>]/i.test(t) || ext === "nml") return parseTraktor(t, fileName);
  if (t.startsWith("<")) throw new PlaylistFormatError("This XML file is not a playlist T-DJ reads.");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  if (ext === "csv" || ext === "tsv" || /^"?(#|title|name|track( name)?|song|artist)"?\s*[,;\t]/i.test(first))
    return parseCsvPlaylist(t, fileName);
  return parseTextList(t, baseName(fileName));
}

/** T-DJ's raw JSON export (a whole Playlist): its own structure, side by side */
function fromPlaylistJson(p: Playlist): ParsedPlaylist {
  const items: ImportItem[] = [];
  const side = (s: Song, extra: Partial<ImportItem>): ImportItem => ({
    title: s.title,
    artists: [s.orchestra, ...(s.singer ? [s.singer] : [])],
    ...(s.year ? { year: s.year } : {}),
    ...(s.durationSec ? { durationSec: Math.round(s.durationSec) } : {}),
    ...(s.spotify?.uri ? { spotifyUri: s.spotify.uri } : {}),
    ...extra,
  });
  if (p.opening) items.push(side(p.opening, { closing: "opening" }));
  p.tandas.forEach((t, i) => {
    for (const s of t.songs) items.push(side(s, { tanda: i + 1 }));
    if (t.cortina)
      items.push({
        title: t.cortina.title,
        artists: [t.cortina.artist],
        cortina: true,
        ...(t.cortina.spotify?.uri ? { spotifyUri: t.cortina.spotify.uri } : {}),
      });
  });
  if (p.closing) items.push(side(p.closing, { closing: "closing" }));
  return { format: "csv-tdj", name: p.name, items };
}

/* ---------- matching ---------- */

export type MatchLevel = "sure" | "likely" | "guess" | "none";
export interface ImportMatch {
  /** the catalogue side, or the cortina */
  kind: "song" | "cortina";
  id: string;
  /** 0..1 */
  confidence: number;
  level: MatchLevel;
  /** how it was found */
  by: "id" | "stream" | "rules" | "lenient" | "title" | "cortina";
  /** the item's words read with a correction ("Di Sarly" → "Carlos Di Sarli") */
  corrected?: boolean;
}

export interface ImportMatchDeps {
  songs: readonly Song[];
  cortinas?: readonly Cortina[];
  /** the catalogue's search index (Catalog.searchIndex()); built once per songs array otherwise */
  index?: SongIndex;
}

export const levelOf = (c: number): MatchLevel =>
  c >= 0.85 ? "sure" : c >= 0.6 ? "likely" : c > 0 ? "guess" : "none";

interface Lookup {
  cortinasOf: readonly Cortina[] | null;
  byId: Map<string, Song>;
  cortinaById: Map<string, Cortina>;
  byUri: Map<string, Song[]>;
  byTitle: Map<string, Song[]>;
  cortinaByUri: Map<string, Cortina>;
  cortinaByTitle: Map<string, Cortina[]>;
  index: SongIndex;
  /** every orchestra name the catalogue knows */
  orchestras: Array<{ id: string; name: string; surname: string }>;
}
const lookups = new WeakMap<object, Lookup>();
const NOISE_WORDS = new Set([
  "orquesta",
  "tipica",
  "su",
  "y",
  "de",
  "la",
  "el",
  "los",
  "orchestra",
  "sexteto",
  "cuarteto",
  "quinteto",
  "trio",
  "con",
  "del",
]);
const coreWords = (name: string) =>
  normTitle(name.replace(/'/g, ""))
    .split(" ")
    .filter((w) => w && !NOISE_WORDS.has(w));

function lookupOf(d: ImportMatchDeps): Lookup {
  const hit = lookups.get(d.songs);
  if (hit && hit.cortinasOf === (d.cortinas ?? null)) return hit;
  const byUri = new Map<string, Song[]>();
  const byId = new Map<string, Song>();
  const byTitle = new Map<string, Song[]>();
  const orch = new Map<string, { id: string; name: string; surname: string }>();
  for (const s of d.songs) {
    byId.set(s.id, s);
    for (const a of s.altIds ?? []) if (!byId.has(a)) byId.set(a, s);
    if (s.spotify?.uri) byUri.set(s.spotify.uri, [...(byUri.get(s.spotify.uri) ?? []), s]);
    for (const t of [s.title, ...(s.altTitles ?? [])]) {
      const k = normTitle(t);
      if (!k) continue;
      const l = byTitle.get(k);
      if (l) l.includes(s) || l.push(s);
      else byTitle.set(k, [s]);
    }
    if (!orch.has(s.orchestraId))
      orch.set(s.orchestraId, {
        id: s.orchestraId,
        name: s.orchestra,
        surname: coreWords(s.orchestra).at(-1) ?? "",
      });
  }
  const cortinaByUri = new Map<string, Cortina>();
  const cortinaByTitle = new Map<string, Cortina[]>();
  for (const c of d.cortinas ?? []) {
    if (c.spotify?.uri) cortinaByUri.set(c.spotify.uri, c);
    const k = normTitle(c.title);
    cortinaByTitle.set(k, [...(cortinaByTitle.get(k) ?? []), c]);
  }
  const out: Lookup = {
    cortinasOf: d.cortinas ?? null,
    byId,
    cortinaById: new Map((d.cortinas ?? []).map((c) => [c.id, c])),
    byUri,
    byTitle,
    cortinaByUri,
    cortinaByTitle,
    index: d.index ?? buildSongIndex(d.songs as Song[]),
    orchestras: [...orch.values()],
  };
  lookups.set(d.songs, out);
  return out;
}

const near = (a: string, b: string) => {
  if (a === b) return 0;
  const budget = Math.min(typoBudget(a), typoBudget(b)) + (a.length >= 12 ? 1 : 0);
  return editDistance(a, b, budget) <= budget ? 1 : 2;
};

/** the artist line names this orchestra, exactly (matchRules' namesLeader) or with a typo in the leader's surname */
function artistNames(orchestra: string, artist: string): 0 | 1 | 2 {
  // a contemporary orchestra named after a leader ("La Juan D'Arienzo") is never read as the leader
  if (/^la\s/i.test(artist.trim()) && !/^la\s/i.test(orchestra.trim())) return 2;
  if (namesLeader(orchestra, artist)) return 0;
  const ow = coreWords(orchestra);
  const surname = ow.at(-1);
  if (!surname || surname.length < 4) return 2;
  const aw = coreWords(artist);
  const joined = aw.join("");
  // "Darienzo" for "D'Arienzo", "Disarli" for "Di Sarli"
  if (ow.length >= 2 && (joined === ow.slice(-2).join("") || joined === ow.join(""))) return 1;
  for (let i = 0; i < aw.length; i++) {
    const w = aw[i]!;
    const two = i + 1 < aw.length ? w + aw[i + 1] : "";
    // the surname spelt right but the rules say it is not the leader (a tribute "La Juan D'Arienzo", Rafael Canaro):
    // never corrected into the leader
    if (w === surname || two === ow.slice(-2).join("")) return 2;
    if (near(w, surname) <= 1 || (two && near(two, ow.slice(-2).join("")) <= 1)) return 1;
  }
  return 2;
}

/** how well the item's words describe `s` (a tie-break among rows that share a stream id) */
function closeness(s: Song, it: ImportItem): number {
  let c = 0;
  if (normTitle(s.title) === normTitle(it.title)) c += 4;
  if (it.year && s.year === it.year) c += 2;
  if (s.singer && it.artists.some((a) => normTitle(a) === normTitle(s.singer!))) c += 2;
  if (!s.singer && it.artists.length === 1) c += 1;
  if (it.durationSec && s.durationSec) c -= Math.min(2, Math.abs(it.durationSec - s.durationSec) / 5);
  return c;
}

/** the item, read as a recording of `s`: problems, closeness and whether the words needed a correction */
function judge(s: Song, it: ImportItem): { conf: number; by: ImportMatch["by"]; corrected: boolean } | null {
  const titleExact = [s.title, ...(s.altTitles ?? [])].some((t) => normTitle(t) === normTitle(it.title));
  let corrected = !titleExact;
  // the artists as the rules read them: a misspelt leader in the catalogue's spelling
  let artists = it.artists;
  let namesOrch = false;
  if (artists.length) {
    artists = artists.map((a) => {
      const n = artistNames(s.orchestra, a);
      if (n < 2) namesOrch = true;
      if (n === 1) corrected = true;
      return n === 1 ? s.orchestra : a;
    });
  }
  const name = titleExact ? it.title : s.title;
  const cand = {
    name,
    artists: artists.length ? artists : [s.orchestra],
    album: it.album,
    ...(it.durationSec ? { durationMs: it.durationSec * 1000 } : {}),
    ...(it.year && it.yearIsRelease ? { release: String(it.year) } : {}),
  };
  if (artists.length && !namesOrch && !(it.album && namesLeader(s.orchestra, it.album))) return null;
  // a recording year the item states (a DJ file, a pasted "(1953)") is the evidence the later-take rule asks for
  const dated = !!it.year && !it.yearIsRelease && it.year === s.year;
  const row = dated ? { ...s, laterTakes: undefined, vocalTwins: undefined } : s;
  const strict = artists.length ? matchProblem(row, cand) : "no artist";
  let conf: number;
  let by: ImportMatch["by"];
  if (strict === null) {
    conf = 0.92;
    by = "rules";
  } else {
    // a list that credits only the orchestra (a pasted list, a file tag): the hard refusals stay, the evidence rules
    // a streaming credit has to pass (the singer named, a later take ruled out) are relaxed
    const lenient = matchProblem(
      { ...s, laterTakes: undefined, vocalTwins: undefined },
      // (and the length: the DJ's own file may be another master or a trimmed copy; it weighs in the score below)
      { ...cand, mainArtistOnly: true, release: undefined, durationMs: undefined },
    );
    if (lenient !== null && artists.length) return null;
    if (lenient !== null) {
      // no artist at all: only the title and what the rules can still tell
      if (/another title|a remake|tribute|rhythm|not a /.test(lenient)) return null;
      conf = 0.45;
      by = "title";
    } else {
      conf = 0.74;
      by = "lenient";
    }
  }
  // closeness: the year, the length, the singer
  const singerNamed =
    !!s.singer &&
    artists.slice(1).some((a) => normTitle(a).includes(normTitle(s.singer!).split(" ").at(-1) ?? "~"));
  if (it.year && s.year && !it.yearIsRelease)
    conf += it.year === s.year ? 0.06 : Math.abs(it.year - s.year) <= 1 ? 0.02 : -0.3;
  if (it.durationSec && s.durationSec && !s.durationEstimated)
    conf +=
      Math.abs(it.durationSec - s.durationSec) <= 3
        ? 0.04
        : Math.abs(it.durationSec - s.durationSec) > 12
          ? -0.06
          : 0;
  if (singerNamed) conf += 0.03;
  else if (s.singer && artists.length > 1) conf -= 0.04;
  if (!s.singer && artists.length > 1 && !artists.slice(1).some((a) => artistNames(s.orchestra, a) < 2))
    conf -= 0.05;
  if (corrected) conf -= 0.08;
  return { conf: Math.max(0.05, Math.min(0.99, conf)), by, corrected };
}

function candidatesFor(L: Lookup, title: string): Song[] {
  const k = normTitle(title);
  const exact = L.byTitle.get(k) ?? [];
  if (exact.length || !k) return exact;
  // a misspelt title: the search's typo-tolerant words, then the whole title within a typo or two
  const hits = searchSongs(L.index, `title:${k.split(" ").join(" title:")} `, { limit: 40 }).items.map(
    (h) => h.song,
  );
  return hits.filter((s) =>
    [s.title, ...(s.altTitles ?? [])].some((t) => {
      const a = normTitle(t);
      const budget = Math.max(1, Math.min(3, Math.floor(a.length / 5)));
      return editDistance(a, k, budget) <= budget;
    }),
  );
}

function matchCortina(L: Lookup, it: ImportItem): Cortina | null {
  if (it.spotifyUri && L.cortinaByUri.has(it.spotifyUri)) return L.cortinaByUri.get(it.spotifyUri)!;
  const pool = L.cortinaByTitle.get(normTitle(it.title)) ?? [];
  if (!pool.length) return null;
  const a = normTitle(it.artists.join(" "));
  return (
    pool.find((c) => {
      const ca = normTitle(c.artist);
      return !!a && (a === ca || a.includes(ca) || ca.includes(a));
    }) ?? (!a && pool.length === 1 ? pool[0]! : null)
  );
}

export interface MatchedItem {
  item: ImportItem;
  match: ImportMatch | null;
  /** the catalogue side, or the item as a recording of its own (`ext:…`) */
  song?: Song;
  cortina?: Cortina;
  /** other catalogue sides that would also fit (an ambiguous line), best first */
  alternatives?: string[];
}

/** one item against the catalogue (see the module comment) */
export function matchItem(it: ImportItem, deps: ImportMatchDeps): MatchedItem {
  const L = lookupOf(deps);
  if (it.tdjId) {
    // a T-DJ export's own row: the same catalogue side (or cortina) by id
    const c = it.cortina ? L.cortinaById.get(it.tdjId) : undefined;
    if (c)
      return {
        item: it,
        match: { kind: "cortina", id: c.id, confidence: 1, level: "sure", by: "id" },
        cortina: c,
      };
    const s = L.byId.get(it.tdjId);
    if (s)
      return { item: it, match: { kind: "song", id: s.id, confidence: 1, level: "sure", by: "id" }, song: s };
  }
  if (it.spotifyUri) {
    const pool = L.byUri.get(it.spotifyUri) ?? [];
    // (one stream id on two catalogue rows — a reissue credited to two dates: the row the item describes)
    const s =
      pool.length > 1
        ? [...pool].sort(
            (a, b) =>
              closeness(b, it) - closeness(a, it) ||
              (b.fame ?? 0) - (a.fame ?? 0) ||
              (a.year ?? 9999) - (b.year ?? 9999),
          )[0]
        : pool[0];
    if (s)
      return {
        item: it,
        match: { kind: "song", id: s.id, confidence: 1, level: "sure", by: "stream" },
        song: s,
      };
  }
  const c = matchCortina(L, it);
  if (c)
    return {
      item: it,
      match: { kind: "cortina", id: c.id, confidence: 0.95, level: "sure", by: "cortina" },
      cortina: c,
    };
  const tries: ImportItem[] = [it, ...(it.variants ?? []).map((v) => ({ ...it, ...v }))];
  let best: { s: Song; conf: number; by: ImportMatch["by"]; corrected: boolean; alt: Song[] } | null = null;
  for (const x of tries) {
    const judged = candidatesFor(L, x.title)
      .map((s) => ({ s, j: judge(s, x) }))
      .filter((r): r is { s: Song; j: NonNullable<ReturnType<typeof judge>> } => !!r.j)
      .sort((a, b) => b.j.conf - a.j.conf || (b.s.fame ?? 0) - (a.s.fame ?? 0));
    const top = judged[0];
    if (!top) continue;
    // an ambiguous line (two takes as close): the most known one, said with less confidence
    const ties = judged.filter((r) => r.j.conf >= top.j.conf - 0.005 && r.s.id !== top.s.id);
    // another take of the work by the same orchestra that the item cannot rule out (no recording year): never sure
    const rival =
      !(x.year && !x.yearIsRelease) &&
      judged.some((r) => r.s.id !== top.s.id && r.s.orchestraId === top.s.orchestraId);
    const conf = ties.length ? top.j.conf - 0.12 : rival ? Math.min(top.j.conf, 0.8) : top.j.conf;
    if (!best || conf > best.conf)
      best = {
        s: top.s,
        conf,
        by: top.j.by,
        corrected: top.j.corrected,
        alt: judged.slice(1, 4).map((r) => r.s),
      };
  }
  if (best) {
    const m: ImportMatch = {
      kind: "song",
      id: best.s.id,
      confidence: Math.round(best.conf * 100) / 100,
      level: levelOf(best.conf),
      by: best.by,
      ...(best.corrected ? { corrected: true } : {}),
    };
    return {
      item: it,
      match: m,
      song: best.s,
      ...(best.alt.length ? { alternatives: best.alt.map((s) => s.id) } : {}),
    };
  }
  return { item: it, match: null, song: externalSong(it, L) };
}

/** every item in order */
export function matchImport(items: readonly ImportItem[], deps: ImportMatchDeps): MatchedItem[] {
  return items.map((it) => matchItem(it, deps));
}

const RHYTHM_OF_GENRE = (g: string | undefined, title: string): DanceRhythm | null => {
  const named = namedRhythm(title);
  if (named === "vals" || named === "milonga" || named === "tango") return named;
  const m = RHYTHM_GENRE.exec(g ?? "")?.[1]?.toLowerCase();
  return m === "vals" || m === "valse" || m === "waltz"
    ? "vals"
    : m === "milonga"
      ? "milonga"
      : m === "tango"
        ? "tango"
        : null;
};

/** the item as a recording of its own: the service's id kept (`ext:spotify:<id>`), so it plays and exports */
export function externalSong(it: ImportItem, L?: Pick<Lookup, "orchestras">): Song {
  const known = L?.orchestras.find((o) => it.artists.some((a) => artistNames(o.name, a) === 0));
  const sid = it.spotifyUri?.slice(14);
  const id = sid
    ? `ext:spotify:${sid}`
    : it.youtubeId
      ? `ext:youtube:${it.youtubeId}`
      : `ext:${it.file ? "file" : "import"}:${nightHash(`${normTitle(it.title)}|${normTitle(it.artists.join(" "))}|${it.file ?? ""}`)}`;
  const orchestra = known?.name ?? it.artists[0] ?? "";
  const singer = it.artists.find((a) => !known || artistNames(known.name, a) !== 0) ?? null;
  return {
    id,
    title: it.title,
    rhythm: RHYTHM_OF_GENRE(it.genre, it.title) ?? "tango",
    orchestra,
    orchestraId: known?.id ?? `ext-${normTitle(orchestra).replace(/ /g, "-") || "unknown"}`,
    singer: singer && singer !== orchestra ? singer : null,
    singerId: null,
    vocal: !!singer && singer !== orchestra,
    year: it.year ?? null,
    ...(it.yearIsRelease ? { yearApprox: true } : {}),
    era: "unknown" as Era,
    album: it.album ?? null,
    source: sid ? "spotify" : it.youtubeId ? "youtube" : it.file ? "file" : "import",
    notes: "Imported: not in this catalogue",
    durationSec: it.durationSec ?? 170,
    ...(it.durationSec ? {} : { durationEstimated: true }),
    spotify: it.spotifyUri ? { uri: it.spotifyUri, url: `https://open.spotify.com/track/${sid}` } : null,
  } as Song;
}

/** an unmatched cortina as a cortina of its own (its service id kept) */
export function externalCortina(it: ImportItem): Cortina {
  const sid = it.spotifyUri?.slice(14);
  return {
    id: sid
      ? `ext:spotify:${sid}`
      : `ext:cortina:${nightHash(`${normTitle(it.title)}|${normTitle(it.artists.join(" "))}`)}`,
    title: it.title,
    artist: it.artists.join(", "),
    genre: it.genre && !/cortina/i.test(it.genre) ? it.genre : "",
    culture: "global",
    energy: 50,
    ...(it.durationSec ? { lengthSec: Math.min(it.durationSec, 90) } : {}),
    spotify: it.spotifyUri ? { uri: it.spotifyUri, url: `https://open.spotify.com/track/${sid}` } : null,
  };
}

/* ---------- structure ---------- */

export type EntryRole = "side" | "cortina" | "opening" | "closing" | "skip";
export interface ImportEntry extends MatchedItem {
  role: EntryRole;
  /** a side that starts a new tanda although no cortina comes before it */
  split?: boolean;
  /** why it is a cortina (the file said so, a known cortina, short, not a tango, repeated) */
  why?: "marked" | "known" | "short" | "not-tango" | "repeated";
}

/** a cortina's longest plausible length; a dance side is rarely under this */
export const CORTINA_MAX_SEC = 90;
const TANDA_MAX: Record<string, number> = { tango: 5, vals: 4, milonga: 4 };

const rhythmOfEntry = (e: MatchedItem) => e.song?.rhythm ?? "tango";
const familyOf = (e: MatchedItem) => `${e.song?.orchestraId ?? ""}|${rhythmOfEntry(e)}`;

/**
 * Tandas and cortinas from the matched list. A cortina: what the source marks, a known cortina, an unmatched item
 * under CORTINA_MAX_SEC, an unmatched item whose artist is no orchestra the catalogue knows (not a tango), a title
 * repeated between groups. With no cortina at all (a list of tangos only), a tanda is a run of one orchestra and one
 * rhythm (long runs split evenly). The source's own tanda marks split too. A first / last La Cumparsita is the
 * opening / closing.
 */
export function detectStructure(items: readonly MatchedItem[], deps?: ImportMatchDeps): ImportEntry[] {
  const L = deps ? lookupOf(deps) : null;
  const knowsOrchestra = (it: ImportItem) =>
    !!L?.orchestras.some((o) => it.artists.some((a) => artistNames(o.name, a) < 2));
  const titleCount = new Map<string, number>();
  for (const x of items)
    if (!x.match || x.match.kind === "cortina")
      titleCount.set(normTitle(x.item.title), (titleCount.get(normTitle(x.item.title)) ?? 0) + 1);
  const entries: ImportEntry[] = items.map((x) => {
    const it = x.item;
    if (it.closing && x.match?.kind !== "cortina") return { ...x, role: it.closing };
    if (it.cortina)
      return {
        ...x,
        role: "cortina",
        why: "marked",
        ...(x.cortina || x.match?.kind === "cortina" ? {} : { cortina: externalCortina(it) }),
      };
    if (x.match?.kind === "cortina") return { ...x, role: "cortina", why: "known" };
    if (x.match) return { ...x, role: "side" };
    const rhythm = RHYTHM_OF_GENRE(it.genre, it.title);
    const why: ImportEntry["why"] | null =
      it.durationSec && it.durationSec < CORTINA_MAX_SEC
        ? "short"
        : (titleCount.get(normTitle(it.title)) ?? 0) >= 2 && !rhythm
          ? "repeated"
          : !rhythm && L && !knowsOrchestra(it)
            ? "not-tango"
            : null;
    return why ? { ...x, role: "cortina", why, cortina: externalCortina(it) } : { ...x, role: "side" };
  });
  // the opening / closing La Cumparsita
  const sides = entries.map((e, i) => [e, i] as const).filter(([e]) => e.role === "side");
  const first = sides[0];
  const last = sides.at(-1);
  if (
    !entries.some((e) => e.role === "opening") &&
    first &&
    isCumparsita(first[0].song ?? first[0].item) &&
    sides.length > 1
  )
    entries[first[1]] = { ...first[0], role: "opening" };
  if (
    !entries.some((e) => e.role === "closing") &&
    last &&
    last !== first &&
    isCumparsita(last[0].song ?? last[0].item)
  )
    entries[last[1]] = { ...last[0], role: "closing" };
  // the source's tanda marks and the pasted list's blank lines
  let prevTanda: number | undefined;
  entries.forEach((e, i) => {
    if (e.role !== "side") return;
    const t = e.item.tanda;
    if ((t !== undefined && prevTanda !== undefined && t !== prevTanda) || e.item.breakBefore) {
      const prev = entries
        .slice(0, i)
        .reverse()
        .find((x) => x.role !== "skip");
      if (prev?.role === "side") entries[i] = { ...e, split: true };
    }
    if (t !== undefined) prevTanda = t;
  });
  const hinted = entries.some((e) => e.item.tanda !== undefined || e.item.breakBefore);
  const hasCortina = entries.some((e) => e.role === "cortina");
  // runs of one family where nothing else marks the tandas (or a group too long to be one tanda)
  for (const g of groupsOf(entries)) {
    const tooLong = g.length > (TANDA_MAX[rhythmOfEntry(entries[g[0]!]!)] ?? 5) + 1;
    if (hinted && !tooLong) continue;
    if (hasCortina && !tooLong) continue;
    let runStart = 0;
    const cut = (from: number, to: number) => {
      // a run longer than a tanda: even pieces of at most the rhythm's usual size
      const n = to - from;
      const size = rhythmOfEntry(entries[g[from]!]!) === "tango" ? 4 : 3;
      const parts = Math.ceil(n / (n <= (TANDA_MAX[rhythmOfEntry(entries[g[from]!]!)] ?? 5) ? n : size));
      for (let p = 1; p < parts; p++) {
        const at = g[from + Math.round((p * n) / parts)]!;
        entries[at] = { ...entries[at]!, split: true };
      }
    };
    for (let k = 1; k <= g.length; k++) {
      if (k === g.length || familyOf(entries[g[k]!]!) !== familyOf(entries[g[k - 1]!]!)) {
        if (k < g.length) entries[g[k]!] = { ...entries[g[k]!]!, split: true };
        cut(runStart, k);
        runStart = k;
      }
    }
  }
  return entries;
}

/** the tandas as lists of entry positions (sides only, in order) */
export function groupsOf(entries: readonly ImportEntry[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  entries.forEach((e, i) => {
    if (e.role === "cortina") {
      if (cur.length) out.push(cur);
      cur = [];
    } else if (e.role === "side") {
      if (e.split && cur.length) {
        out.push(cur);
        cur = [];
      }
      cur.push(i);
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** the DJ's fixes: a new tanda from this side on */
export function splitBefore(entries: readonly ImportEntry[], i: number): ImportEntry[] {
  return entries.map((e, k) => (k === i && e.role === "side" ? { ...e, split: true } : e));
}
/** the DJ's fixes: tanda g and the next one as one tanda (the cortina between them left out) */
export function mergeWithNext(entries: readonly ImportEntry[], g: number): ImportEntry[] {
  const groups = groupsOf(entries);
  const a = groups[g];
  const b = groups[g + 1];
  if (!a || !b) return [...entries];
  return entries.map((e, k) => {
    if (k === b[0]) return { ...e, split: false };
    if (k > a.at(-1)! && k < b[0]! && e.role === "cortina") return { ...e, role: "skip" as const };
    return e;
  });
}
/** the DJ's fixes: an entry as a side, a cortina, the opening / closing, or left out */
export function setRole(entries: readonly ImportEntry[], i: number, role: EntryRole): ImportEntry[] {
  return entries.map((e, k) => {
    if (k !== i) {
      // one opening and one closing
      if ((role === "opening" || role === "closing") && e.role === role)
        return { ...e, role: "side" as const };
      return e;
    }
    const out: ImportEntry = { ...e, role, split: false };
    if (role === "cortina" && !out.cortina) out.cortina = externalCortina(e.item);
    if (role === "side" && !out.song) out.song = externalSong(e.item);
    return out;
  });
}

/* ---------- the night ---------- */

/** where the night came from, kept with it (History, and the playlist sync that writes back to it) */
export interface ImportSource {
  service: "spotify" | "youtube" | "file" | "text";
  format?: ImportFormat;
  /** the service's playlist id (sync writes back to it) */
  playlistId?: string;
  url?: string;
  /** the file or playlist name as it came */
  name?: string;
  at: string;
  /** keep the night linked to the playlist (the sync feature may write back) */
  linked?: boolean;
}

export interface ImportWarning {
  /** 0-based tanda; -1: the night */
  tanda: number;
  rule: string;
  /** the editCheck message (an i18n key with params), or an import note */
  message: { key: string; params: Record<string, string | number> };
  text: string;
}

export interface ImportedNight {
  playlist: Playlist & { imported?: ImportSource };
  /** what the DJ's tandas break: information, accepted for this night only */
  warnings: ImportWarning[];
  /** the one-night exceptions the night's tandas carry (the DJ's memory may record them) */
  exceptions: NightException[];
  counts: {
    items: number;
    sides: number;
    matched: number;
    sure: number;
    likely: number;
    guess: number;
    external: number;
    cortinas: number;
    tandas: number;
  };
}

const most = <T>(xs: T[]): T | undefined => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const phaseAt = (i: number, n: number): Phase => {
  const f = n <= 1 ? 0 : i / (n - 1);
  return f < 0.15 ? "warmup" : f < 0.45 ? "build" : f < 0.7 ? "peak" : f < 0.92 ? "cooldown" : "close";
};

/** The DJ's reviewed list as a night: see the module comment. */
export function buildImportedNight(
  entries: readonly ImportEntry[],
  o: { name: string; options: ComposeOptions; source: ImportSource; id?: string },
): ImportedNight {
  const groups = groupsOf(entries);
  const cortinaAfter = (g: number[]): Cortina | null => {
    const last = g.at(-1)!;
    for (let k = last + 1; k < entries.length; k++) {
      const e = entries[k]!;
      if (e.role === "side") return null;
      if (e.role === "cortina") return e.cortina ?? externalCortina(e.item);
    }
    return null;
  };
  const songOf = (e: ImportEntry) => e.song ?? externalSong(e.item);
  const at = o.source.at;
  const tandas: Tanda[] = groups.map((g, i) => {
    const songs = g.map((k) => songOf(entries[k]!));
    const rhythm = (most(songs.map((s) => s.rhythm)) ?? "tango") as DanceRhythm;
    const orchestraId = most(songs.map((s) => s.orchestraId))!;
    const lead = songs.find((s) => s.orchestraId === orchestraId)!;
    const singer = most(songs.map((s) => s.singer ?? "")) || null;
    const base: Tanda = {
      index: i,
      rhythm: (["tango", "vals", "milonga"].includes(rhythm) ? rhythm : "tango") as DanceRhythm,
      orchestra: lead.orchestra,
      orchestraId,
      singer,
      vocal: songs.filter((s) => s.vocal).length * 2 > songs.length,
      yearRange: null,
      era: (most(songs.map((s) => s.era).filter((e) => e !== "unknown")) ?? "unknown") as Era,
      songs: [],
      energy: 0,
      energyCurve: [],
      targetEnergy: 50,
      phase: phaseAt(i, groups.length),
      durationSec: 0,
      cortina: cortinaAfter(g),
      locked: true,
      pinned: { by: "dj", reason: "Imported", at },
      djOrder: true,
    };
    const t = retimeTanda(base, songs);
    return { ...t, targetEnergy: t.energy };
  });
  const opening = entries.find((e) => e.role === "opening");
  const closing = entries.find((e) => e.role === "closing");
  const id =
    o.id ??
    `import-${nightHash(JSON.stringify([o.source.playlistId ?? o.source.name ?? "", entries.map((e) => `${e.role}:${e.song?.id ?? e.cortina?.id ?? e.item.title}`)]))}`;
  const shell: Playlist = {
    id,
    name: o.name,
    createdAt: at,
    options: { ...o.options, name: o.name },
    tandas,
    closing: closing ? songOf(closing) : null,
    opening: opening ? songOf(opening) : null,
    stats: {} as Playlist["stats"],
    score: { total: 0, verdict: "", factors: [] },
  };
  let playlist = renight(shell, tandas) as ImportedNight["playlist"];
  // what the tandas break, against an empty night: the tanda rules only (the night's flow is the DJ's)
  const check = checkEdit({ tandas: [], options: shell.options }, playlist, { scope: "tandas" });
  const hard = check.violations.filter((v) => v.severity === "hard");
  const approved = approveEdit(playlist, hard, "Imported night", at);
  playlist = { ...approved.playlist, imported: o.source };
  const warnings: ImportWarning[] = check.violations.map((v: RuleViolation) => ({
    tanda: v.tanda,
    rule: v.rule,
    message: v.message,
    text: v.text,
  }));
  groups.forEach((g, i) => {
    const ext = g.filter((k) => !entries[k]!.match).length;
    if (ext)
      warnings.push({
        tanda: i,
        rule: "external",
        message: { key: "import.warn_external", params: { count: ext } },
        text: `${ext} not in the catalogue: they play from their own source`,
      });
    const rhythm = tandas[i]!.rhythm;
    const usual = rhythm === "tango" ? [3, 4, 5] : [3, 4];
    if (!usual.includes(g.length))
      warnings.push({
        tanda: i,
        rule: "size",
        message: { key: "import.warn_size", params: { count: g.length } },
        text: `${g.length} songs in one tanda`,
      });
  });
  warnings.sort((a, b) => a.tanda - b.tanda);
  const matched = entries.filter((e) => e.role !== "skip" && e.match?.kind === "song");
  const sideEntries = entries.filter(
    (e) => e.role === "side" || e.role === "opening" || e.role === "closing",
  );
  return {
    playlist,
    warnings,
    exceptions: approved.exceptions,
    counts: {
      items: entries.length,
      sides: sideEntries.length,
      matched: matched.length,
      sure: matched.filter((e) => e.match!.level === "sure").length,
      likely: matched.filter((e) => e.match!.level === "likely").length,
      guess: matched.filter((e) => e.match!.level === "guess").length,
      external: sideEntries.filter((e) => !e.match).length,
      cortinas: entries.filter((e) => e.role === "cortina").length,
      tandas: tandas.length,
    },
  };
}

/**
 * A night that arrives whole (a `.tdjnight` resolved by night.ts importNight) as review entries: its tandas, cortinas
 * and Cumparsitas as they are, each side "sure" when the catalogue holds it and an outside recording when not.
 */
export function entriesOfNight(p: Pick<Playlist, "tandas" | "opening" | "closing">): ImportEntry[] {
  const side = (s: Song, role: EntryRole, split = false): ImportEntry => {
    const external = s.source === "import" || s.id.startsWith("ext:");
    return {
      item: {
        title: s.title,
        artists: [s.orchestra, ...(s.singer ? [s.singer] : [])],
        ...(s.year ? { year: s.year } : {}),
        ...(s.durationSec ? { durationSec: Math.round(s.durationSec) } : {}),
        ...(s.spotify?.uri ? { spotifyUri: s.spotify.uri } : {}),
      },
      match: external ? null : { kind: "song", id: s.id, confidence: 1, level: "sure", by: "id" },
      song: s,
      role,
      ...(split ? { split: true } : {}),
    };
  };
  const out: ImportEntry[] = [];
  if (p.opening) out.push(side(p.opening, "opening"));
  p.tandas.forEach((t, i) => {
    const prevCortina = i > 0 && !!p.tandas[i - 1]!.cortina;
    t.songs.forEach((s, k) => out.push(side(s, "side", k === 0 && i > 0 && !prevCortina)));
    if (t.cortina)
      out.push({
        item: { title: t.cortina.title, artists: [t.cortina.artist], cortina: true },
        match: { kind: "cortina", id: t.cortina.id, confidence: 1, level: "sure", by: "id" },
        cortina: t.cortina,
        role: "cortina",
        why: "marked",
      });
  });
  if (p.closing) out.push(side(p.closing, "closing"));
  return out;
}

/** a whole import in one call: the source's items → matched → structured (the review starts from this) */
export function importPlaylist(parsed: ParsedPlaylist, deps: ImportMatchDeps): ImportEntry[] {
  return detectStructure(matchImport(parsed.items, deps), deps);
}

/**
 * "Learn from this night" (the DJ's explicit choice, never automatic): the night's catalogue sides and families as a
 * hand edit of an empty night (learn.ts learnFromEdit, inside LEARN_LIMITS); a tanda that breaks a rule stays a
 * one-night exception and never becomes a template; a recording not in the catalogue teaches nothing.
 */
export function learnFromImport(
  learned: LearnedPreferences | undefined,
  p: Pick<Playlist, "id" | "tandas" | "opening" | "closing">,
  at = new Date().toISOString(),
): LearnedPreferences {
  const own = (s: Song | null | undefined) => (s && !s.id.startsWith("ext:") ? s : null);
  const tandas = p.tandas
    .map((t) => ({ ...t, songs: t.songs.filter((s) => own(s)) }))
    .filter((t) => t.songs.length);
  return learnFromEdit(
    learned ?? emptyLearned(),
    { tandas: [], opening: null, closing: null },
    { id: p.id, tandas, opening: own(p.opening), closing: own(p.closing) },
    at,
    "Learned from an imported night",
  );
}
