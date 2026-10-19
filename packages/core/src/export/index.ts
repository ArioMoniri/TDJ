import type { Cortina, Playlist, Song } from "../types";

export interface FlatTrack {
  n: number;
  kind: "track" | "cortina" | "closing";
  tanda: number;
  title: string;
  artist: string;
  album?: string;
  year?: number | null;
  rhythm: string;
  durationSec: number;
  energy?: number;
  spotifyUri?: string;
  singer?: string | null;
  orchestra?: string;
}

export interface ExportOpts {
  includeCortinas?: boolean;
}
const safe = (s: string) =>
  s
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const GENRE: Record<string, string> = {
  tango: "Tango",
  vals: "Vals",
  milonga: "Milonga",
  cortina: "Cortina",
};

export function flatten(p: Playlist, eo: ExportOpts = {}): FlatTrack[] {
  const inc = eo.includeCortinas ?? true;
  const out: FlatTrack[] = [];
  let n = 1;
  const push = (f: Omit<FlatTrack, "n">) => out.push({ n: n++, ...f });
  if (p.opening)
    push({
      kind: "closing",
      tanda: 0,
      title: p.opening.title,
      artist: p.opening.orchestra,
      rhythm: "tango",
      durationSec: p.opening.durationSec ?? 180,
      energy: p.opening.energy,
      spotifyUri: p.opening.spotify?.uri,
      orchestra: p.opening.orchestra,
      singer: p.opening.singer,
      year: p.opening.year,
    });
  p.tandas.forEach((t, ti) => {
    for (const s of t.songs)
      push({
        kind: "track",
        tanda: ti + 1,
        title: s.title,
        artist: s.singer ? `${s.orchestra} / ${s.singer}` : s.orchestra,
        album: s.album ?? undefined,
        year: s.year,
        rhythm: s.rhythm,
        durationSec: s.durationSec ?? 170,
        energy: s.energy,
        spotifyUri: s.spotify?.uri,
        singer: s.singer,
        orchestra: s.orchestra,
      });
    if (inc && t.cortina)
      push({
        kind: "cortina",
        tanda: ti + 1,
        title: t.cortina.title,
        artist: t.cortina.artist,
        rhythm: "cortina",
        durationSec: t.cortina.lengthSec ?? 45,
        energy: t.cortina.energy,
        spotifyUri: t.cortina.spotify?.uri,
        year: t.cortina.year,
      });
  });
  if (p.closing)
    push({
      kind: "closing",
      tanda: p.tandas.length + 1,
      title: p.closing.title,
      artist: p.closing.orchestra,
      rhythm: "tango",
      durationSec: p.closing.durationSec ?? 180,
      energy: p.closing.energy,
      spotifyUri: p.closing.spotify?.uri,
      orchestra: p.closing.orchestra,
      singer: p.closing.singer,
      year: p.closing.year,
    });
  return out;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const csvq = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export function toM3U8(p: Playlist, eo: ExportOpts = {}): string {
  const lines = ["#EXTM3U", `#PLAYLIST:${p.name}`];
  for (const t of flatten(p, eo)) {
    lines.push(
      `#EXTINF:${t.durationSec},${t.artist} - ${t.title}${t.kind === "cortina" ? " [CORTINA]" : ""}`,
    );
    lines.push(t.spotifyUri ? t.spotifyUri : `${safe(t.artist)} - ${safe(t.title)}.mp3`);
  }
  return `${lines.join("\n")}\n`;
}

export function toCSV(p: Playlist, eo: ExportOpts = {}): string {
  const head = [
    "#",
    "kind",
    "tanda",
    "title",
    "orchestra/artist",
    "singer",
    "year",
    "rhythm",
    "duration_sec",
    "energy",
    "spotify_uri",
    "album",
  ];
  const rows = flatten(p, eo).map((t) =>
    [
      t.n,
      t.kind,
      t.tanda,
      t.title,
      t.artist,
      t.singer ?? "",
      t.year ?? "",
      t.rhythm,
      t.durationSec,
      t.energy ?? "",
      t.spotifyUri ?? "",
      t.album ?? "",
    ]
      .map(csvq)
      .join(","),
  );
  return `${[head.map(csvq).join(","), ...rows].join("\n")}\n`;
}

export function toJSON(p: Playlist): string {
  return JSON.stringify(p, null, 2);
}

/** Rekordbox XML (DJ_PLAYLISTS v1.0.0) — importable via File > Import Collection in XML. */
export function toRekordboxXML(p: Playlist, eo: ExportOpts = {}): string {
  const tracks = flatten(p, eo);
  const coll = tracks
    .map(
      (t) =>
        `    <TRACK TrackID="${t.n}" Name="${esc(t.title)}" Artist="${esc(t.artist)}" Album="${esc(t.album ?? (t.kind === "cortina" ? "Cortinas" : "TDJ"))}" Genre="${esc(GENRE[t.kind === "cortina" ? "cortina" : t.rhythm] ?? "Tango")}" Year="${t.year ?? ""}" TotalTime="${t.durationSec}" Comments="${esc(t.kind === "cortina" ? `Cortina before tanda ${t.tanda + 1}` : `Tanda ${t.tanda}`)}" Location="file://localhost/TDJ/${esc(encodeURIComponent(`${safe(t.artist)} - ${safe(t.title)}.mp3`))}" Kind="MP3 File" ${t.spotifyUri ? `Mix="${esc(t.spotifyUri)}"` : ""}/>`,
    )
    .join("\n");
  const nodes = p.tandas
    .map(
      (t, i) =>
        `      <NODE Name="${esc(`${String(i + 1).padStart(2, "0")} ${t.rhythm.toUpperCase()} · ${t.orchestra}${t.singer ? ` / ${t.singer}` : " (instr)"}`)}" Type="1" KeyType="0" Entries="${t.songs.length + (t.cortina ? 1 : 0)}">\n${tracks
          .filter((x) => x.tanda === i + 1)
          .map((x) => `        <TRACK Key="${x.n}"/>`)
          .join("\n")}\n      </NODE>`,
    )
    .join("\n");
  const all = tracks.map((x) => `        <TRACK Key="${x.n}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="TDJ" Version="0.1.0" Company="TDJ"/>
  <COLLECTION Entries="${tracks.length}">
${coll}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${esc(p.name)}" Type="0" Count="${p.tandas.length + 1}">
      <NODE Name="Full set (in order)" Type="1" KeyType="0" Entries="${tracks.length}">
${all}
      </NODE>
${nodes}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;
}

/** Traktor NML (Native Instruments) playlist with collection entries. */
export function toTraktorNML(p: Playlist, eo: ExportOpts = {}): string {
  const tracks = flatten(p, eo);
  const loc = (t: FlatTrack) =>
    `<LOCATION DIR="/:TDJ/:" FILE="${esc(`${t.artist} - ${t.title}.mp3`)}" VOLUME="" VOLUMEID=""></LOCATION>`;
  const coll = tracks
    .map(
      (t) =>
        `    <ENTRY TITLE="${esc(t.title)}" ARTIST="${esc(t.artist)}">${loc(t)}<ALBUM TITLE="${esc(t.album ?? "TDJ")}"></ALBUM><INFO PLAYTIME="${t.durationSec}" GENRE="${esc(GENRE[t.kind === "cortina" ? "cortina" : t.rhythm] ?? "Tango")}" COMMENT="${esc(`Tanda ${t.tanda}`)}" RELEASE_DATE="${t.year ? `${t.year}/1/1` : ""}"></INFO></ENTRY>`,
    )
    .join("\n");
  const pl = tracks
    .map(
      (t) =>
        `        <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:TDJ/:${esc(`${safe(t.artist)} - ${safe(t.title)}.mp3`)}"></PRIMARYKEY></ENTRY>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="19">
  <HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>
  <COLLECTION ENTRIES="${tracks.length}">
${coll}
  </COLLECTION>
  <PLAYLISTS>
    <NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1">
      <NODE TYPE="PLAYLIST" NAME="${esc(p.name)}"><PLAYLIST ENTRIES="${tracks.length}" TYPE="LIST" UUID="${p.id}">
${pl}
      </PLAYLIST></NODE>
    </SUBNODES></NODE>
  </PLAYLISTS>
</NML>
`;
}

/** XSPF — open standard understood by VLC, Mixxx, Clementine. */
export function toXSPF(p: Playlist, eo: ExportOpts = {}): string {
  const tracks = flatten(p, eo)
    .map(
      (t) =>
        `    <track><title>${esc(t.title)}</title><creator>${esc(t.artist)}</creator><album>${esc(t.album ?? "")}</album><duration>${t.durationSec * 1000}</duration><annotation>${esc(t.kind === "cortina" ? "cortina" : `tanda ${t.tanda}`)}</annotation>${t.spotifyUri ? `<location>${esc(t.spotifyUri)}</location>` : ""}</track>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<playlist version="1" xmlns="http://xspf.org/ns/0/">\n  <title>${esc(p.name)}</title>\n  <creator>TDJ</creator>\n  <trackList>\n${tracks}\n  </trackList>\n</playlist>\n`;
}

/** Generic DJ CSV (Lexicon, Rekord Buddy, Serato via Lexicon import). Serato .crate binaries need local file paths — see roadmap. */
export function toSeratoCSV(p: Playlist, eo: ExportOpts = {}): string {
  const rows = flatten(p, eo).map((t) =>
    [
      t.title,
      t.artist,
      t.album ?? "",
      t.year ?? "",
      t.kind === "cortina" ? "Cortina" : `Tango ${t.rhythm}`,
      `Tanda ${t.tanda}`,
    ]
      .map(csvq)
      .join(","),
  );
  return `${["name", "artist", "album", "year", "genre", "comment"].map(csvq).join(",")}\n${rows.join("\n")}\n`;
}

/** Spotify: ordered list of URIs (already resolved) + search queries for unresolved tracks. */
export function toSpotifyPlan(
  p: Playlist,
  eo: ExportOpts = {},
): {
  uris: string[];
  unresolved: { query: string; track: FlatTrack }[];
} {
  const uris: string[] = [];
  const unresolved: { query: string; track: FlatTrack }[] = [];
  for (const t of flatten(p, eo)) {
    if (t.spotifyUri) uris.push(t.spotifyUri);
    else
      unresolved.push({
        query: `${t.title} ${t.orchestra ?? t.artist}${t.singer ? ` ${t.singer}` : ""}`,
        track: t,
      });
  }
  return { uris, unresolved };
}

/** Human set list (printable). */
export function toSetList(p: Playlist, _eo: ExportOpts = {}): string {
  const L: string[] = [
    `${p.name} — ${(p.stats.durationSec / 3600).toFixed(2)} h · ${p.tandas.length} tandas · score ${p.score.total}/100 (${p.score.verdict})`,
    "",
  ];
  p.tandas.forEach((t, i) => {
    L.push(
      `${String(i + 1).padStart(2, "0")}. [${t.rhythm.toUpperCase()}] ${t.orchestra}${t.singer ? ` / ${t.singer}` : " (instrumental)"} ${t.yearRange ? `${t.yearRange[0]}–${t.yearRange[1]}` : ""}  energy ${t.energy} (target ${t.targetEnergy}) · ${t.phase}`,
    );
    t.songs.forEach((s, j) => L.push(`     ${j + 1}. ${s.title} (${s.year ?? "?"}) · e${s.energy}`));
    if (t.cortina)
      L.push(
        `     ♪ cortina: ${t.cortina.artist} – ${t.cortina.title} (${t.cortina.genre}, e${t.cortina.energy})`,
      );
  });
  if (p.closing) L.push("", `★ La Cumparsita — ${p.closing.orchestra} (${p.closing.year ?? "?"})`);
  return `${L.join("\n")}\n`;
}

export const EXPORTERS = {
  m3u8: toM3U8,
  csv: toCSV,
  json: toJSON,
  rekordbox: toRekordboxXML,
  traktor: toTraktorNML,
  xspf: toXSPF,
  serato: toSeratoCSV,
  setlist: toSetList,
} as const;
export type ExportFormat = "m3u8" | "csv" | "json" | "rekordbox" | "traktor" | "xspf" | "serato" | "setlist";
export const EXPORT_META: Record<ExportFormat, { label: string; ext: string; mime: string }> = {
  m3u8: { label: "M3U8 playlist", ext: "m3u8", mime: "audio/mpegurl" },
  csv: { label: "CSV", ext: "csv", mime: "text/csv" },
  json: { label: "JSON (raw)", ext: "json", mime: "application/json" },
  rekordbox: { label: "Rekordbox XML", ext: "xml", mime: "application/xml" },
  traktor: { label: "Traktor NML", ext: "nml", mime: "application/xml" },
  xspf: { label: "XSPF (VLC/Mixxx)", ext: "xspf", mime: "application/xspf+xml" },
  serato: { label: "DJ CSV (Lexicon / Serato)", ext: "csv", mime: "text/csv" },
  setlist: { label: "Set list (text)", ext: "txt", mime: "text/plain" },
};
export type { Cortina, Song };
