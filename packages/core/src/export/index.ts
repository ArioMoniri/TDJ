import {
  type BoothPlan,
  type BoothPlanItem,
  boothClock,
  boothInputs,
  planBooth,
  planMatches,
} from "../booth";
import type { Cortina, Playlist, Song } from "../types";

export interface FlatTrack {
  n: number;
  kind: "track" | "cortina" | "closing" | "break";
  /** catalogue id (song or cortina) so a streaming match can be stored back against it */
  id?: string;
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
  /** cortinas: the second the player should stop at (the DJ's "cortina play length") */
  stopSec?: number;
  /** index into `Playlist.booth.items` (the plan the row's timing comes from) */
  planIndex: number;
  /** planned offset from the night's start (booth plan) */
  startSec: number;
  /** silence after this row (booth plan) */
  gapAfterSec: number;
  /** cortina cue-in or intro trim (booth plan) */
  trimInSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** gain prior in dB (booth plan) */
  gainDb?: number;
  peakCapped?: boolean;
}

export interface ExportOpts {
  includeCortinas?: boolean;
  /** show breaks as rows (off for players; the booth plan always has them) */
  includeBreaks?: boolean;
  /**
   * Cortina play length in seconds (20–90): where M3U8/XSPF tell VLC to stop and where the Rekordbox hot cue sits.
   * Defaults to each cortina's own `lengthSec` (the compose option `cortinaLengthSec`, 45 s).
   */
  cortinaStopSec?: number;
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

/** The plan an export follows: the set's own when it is current and the stop option agrees, else one re-timed from its inputs. */
export function planFor(p: Playlist, eo: ExportOpts = {}): BoothPlan {
  const own = p.booth;
  if (planMatches(p, own) && (eo.cortinaStopSec === undefined || eo.cortinaStopSec === own.cortinaStopSec))
    return own;
  const inputs = boothInputs(own);
  if (eo.cortinaStopSec !== undefined) inputs.cortinaStopSec = eo.cortinaStopSec;
  return planBooth(p, inputs);
}

const songRow = (
  s: Song,
  kind: "track" | "closing",
  tanda: number,
): Omit<FlatTrack, "n" | "planIndex" | "startSec" | "gapAfterSec"> => ({
  kind,
  id: s.id,
  tanda,
  title: s.title,
  artist: kind === "track" && s.singer ? `${s.orchestra} / ${s.singer}` : s.orchestra,
  album: kind === "track" ? (s.album ?? undefined) : undefined,
  year: s.year,
  rhythm: kind === "track" ? s.rhythm : "tango",
  durationSec: s.durationSec ?? (kind === "track" ? 170 : 180),
  energy: s.energy,
  spotifyUri: s.spotify?.uri,
  singer: s.singer,
  orchestra: s.orchestra,
});
const cortinaRow = (
  c: Cortina,
  tanda: number,
): Omit<FlatTrack, "n" | "planIndex" | "startSec" | "gapAfterSec"> => ({
  kind: "cortina",
  id: c.id,
  tanda,
  title: c.title,
  artist: c.artist,
  rhythm: "cortina",
  durationSec: c.lengthSec ?? 45,
  energy: c.energy,
  spotifyUri: c.spotify?.uri,
  year: c.year,
});

/** The set as rows, in play order, each carrying its booth-plan timing. */
export function flatten(p: Playlist, eo: ExportOpts = {}): FlatTrack[] {
  const inc = eo.includeCortinas ?? true;
  const incB = eo.includeBreaks ?? false;
  const plan = planFor(p, eo);
  const out: FlatTrack[] = [];
  let n = 1;
  plan.items.forEach((it: BoothPlanItem, planIndex) => {
    if (it.kind === "cortina" && !inc) return;
    if (it.kind === "break" && !incB) return;
    let row: Omit<FlatTrack, "n" | "planIndex" | "startSec" | "gapAfterSec"> | undefined;
    if (it.kind === "closing") {
      const s = it.tanda === 0 ? p.opening : p.closing;
      if (s) row = songRow(s, "closing", it.tanda);
    } else if (it.kind === "track") {
      const s = p.tandas[it.tanda - 1]?.songs.find((x) => x.id === it.id);
      if (s) row = songRow(s, "track", it.tanda);
    } else if (it.kind === "cortina") {
      const c = p.tandas[it.tanda - 1]?.cortina;
      if (c) row = cortinaRow(c, it.tanda);
    } else {
      const b = p.breaks?.find((x) => x.afterTanda === it.tanda - 1);
      row = {
        kind: "break",
        tanda: it.tanda,
        title: b?.label || "Break",
        artist: `${b?.minutes ?? it.lengthSec / 60} min`,
        rhythm: "break",
        durationSec: it.lengthSec,
      };
    }
    if (!row) return;
    out.push({
      n: n++,
      ...row,
      planIndex,
      startSec: it.startSec,
      gapAfterSec: it.gapAfterSec,
      ...(it.trimInSec !== undefined ? { trimInSec: it.trimInSec } : {}),
      ...(it.stopSec !== undefined ? { stopSec: it.stopSec } : {}),
      ...(it.fadeInSec !== undefined ? { fadeInSec: it.fadeInSec } : {}),
      ...(it.fadeOutSec !== undefined ? { fadeOutSec: it.fadeOutSec } : {}),
      ...(it.gainDb !== undefined ? { gainDb: it.gainDb } : {}),
      ...(it.peakCapped ? { peakCapped: true } : {}),
    });
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
const fmtDb = (db: number) => `${db < 0 ? "−" : db > 0 ? "+" : ""}${Math.abs(db)} dB`;
/** `Tanda 3 · gap 2.5 s · gain −1.3 dB` for the comment fields DJ apps show */
const timingComment = (t: FlatTrack) =>
  `${t.kind === "cortina" ? `Cortina before tanda ${t.tanda + 1}` : `Tanda ${t.tanda}`} · gap ${t.gapAfterSec} s${
    t.gainDb !== undefined ? ` · gain ${fmtDb(t.gainDb)}` : ""
  }${t.kind === "cortina" && t.fadeOutSec ? ` · fade ${t.fadeOutSec} s` : ""}`;
const TIMING_COLS = ["start_sec", "stop_sec", "gap_sec", "fade_out_sec", "gain_db"];
const timingCells = (t: FlatTrack) => [
  t.startSec,
  t.stopSec ?? "",
  t.gapAfterSec,
  t.fadeOutSec ?? "",
  t.gainDb ?? "",
];

export function toM3U8(p: Playlist, eo: ExportOpts = {}): string {
  const lines = ["#EXTM3U", `#PLAYLIST:${p.name}`];
  for (const t of flatten(p, eo)) {
    lines.push(
      `#EXTINF:${t.durationSec},${t.artist} - ${t.title}${t.kind === "cortina" ? " [CORTINA]" : ""}`,
    );
    // ignored by players, read back by TDJ
    lines.push(
      `#TDJ:gap=${t.gapAfterSec}${t.gainDb !== undefined ? ` gain=${t.gainDb}` : ""}${
        t.kind === "cortina" && t.fadeOutSec ? ` fade=${t.fadeOutSec}` : ""
      }`,
    );
    // VLC starts at the cue-in / intro trim and stops a cortina at the DJ's play length (other players ignore both)
    if (t.trimInSec) lines.push(`#EXTVLCOPT:start-time=${t.trimInSec}`);
    if (t.kind === "cortina" && t.stopSec) lines.push(`#EXTVLCOPT:stop-time=${t.stopSec}`);
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
    ...TIMING_COLS,
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
      ...timingCells(t),
    ]
      .map(csvq)
      .join(","),
  );
  return `${[head.map(csvq).join(","), ...rows].join("\n")}\n`;
}

/** The raw set; always with its booth plan so the night's timing travels with the file. */
export function toJSON(p: Playlist): string {
  const plan = planFor(p);
  return JSON.stringify(p.booth === plan ? p : { ...p, booth: plan }, null, 2);
}

/** Rekordbox XML (DJ_PLAYLISTS v1.0.0) — importable via File > Import Collection in XML. */
export function toRekordboxXML(p: Playlist, eo: ExportOpts = {}): string {
  const tracks = flatten(p, eo);
  const marks = (t: FlatTrack) => {
    if (t.kind !== "cortina" || !t.stopSec) return "/>";
    const m = [
      `      <POSITION_MARK Name="Cortina out (${t.stopSec} s)" Type="0" Start="${t.stopSec.toFixed(3)}" Num="0"/>`,
    ];
    if (t.fadeOutSec)
      m.push(
        `      <POSITION_MARK Name="Cortina fade (${t.fadeOutSec} s)" Type="0" Start="${(t.stopSec - t.fadeOutSec).toFixed(3)}" Num="1"/>`,
      );
    return `>\n${m.join("\n")}\n    </TRACK>`;
  };
  const coll = tracks
    .map(
      (t) =>
        `    <TRACK TrackID="${t.n}" Name="${esc(t.title)}" Artist="${esc(t.artist)}" Album="${esc(t.album ?? (t.kind === "cortina" ? "Cortinas" : "TDJ"))}" Genre="${esc(GENRE[t.kind === "cortina" ? "cortina" : t.rhythm] ?? "Tango")}" Year="${t.year ?? ""}" TotalTime="${t.durationSec}" Comments="${esc(timingComment(t))}" Location="file://localhost/TDJ/${esc(encodeURIComponent(`${safe(t.artist)} - ${safe(t.title)}.mp3`))}" Kind="MP3 File" ${t.spotifyUri ? `Mix="${esc(t.spotifyUri)}"` : ""}${marks(t)}`,
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

/** Traktor NML (Native Instruments) playlist with collection entries. Traktor has no gap field; cortinas get cue points. */
export function toTraktorNML(p: Playlist, eo: ExportOpts = {}): string {
  const tracks = flatten(p, eo);
  const loc = (t: FlatTrack) =>
    `<LOCATION DIR="/:TDJ/:" FILE="${esc(`${t.artist} - ${t.title}.mp3`)}" VOLUME="" VOLUMEID=""></LOCATION>`;
  const cue = (name: string, sec: number, hot: number) =>
    `<CUE_V2 NAME="${name}" DISPL_ORDER="0" TYPE="0" START="${(sec * 1000).toFixed(3)}" LEN="0" REPEATS="-1" HOTCUE="${hot}"></CUE_V2>`;
  const cues = (t: FlatTrack) =>
    t.kind === "cortina" && t.stopSec
      ? `${cue("Cortina out", t.stopSec, 0)}${t.fadeOutSec ? cue("Fade", t.stopSec - t.fadeOutSec, 1) : ""}`
      : "";
  const coll = tracks
    .map(
      (t) =>
        `    <ENTRY TITLE="${esc(t.title)}" ARTIST="${esc(t.artist)}">${loc(t)}<ALBUM TITLE="${esc(t.album ?? "TDJ")}"></ALBUM><INFO PLAYTIME="${t.durationSec}" GENRE="${esc(GENRE[t.kind === "cortina" ? "cortina" : t.rhythm] ?? "Tango")}" COMMENT="${esc(timingComment(t))}" RELEASE_DATE="${t.year ? `${t.year}/1/1` : ""}"></INFO>${cues(t)}</ENTRY>`,
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
        `    <track><title>${esc(t.title)}</title><creator>${esc(t.artist)}</creator><album>${esc(t.album ?? "")}</album><duration>${(t.kind === "cortina" && t.stopSec ? t.stopSec : t.durationSec) * 1000}</duration><annotation>${esc(t.kind === "cortina" ? "cortina" : `tanda ${t.tanda}`)}</annotation>${t.spotifyUri ? `<location>${esc(t.spotifyUri)}</location>` : ""}${
          t.kind === "cortina" && t.stopSec
            ? `<extension application="http://www.videolan.org/vlc/playlist/0">${t.trimInSec ? `<vlc:option>start-time=${t.trimInSec}</vlc:option>` : ""}<vlc:option>stop-time=${t.stopSec}</vlc:option></extension>`
            : ""
        }</track>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<playlist version="1" xmlns="http://xspf.org/ns/0/" xmlns:vlc="http://www.videolan.org/vlc/playlist/ns/0/">\n  <title>${esc(p.name)}</title>\n  <creator>TDJ</creator>\n  <trackList>\n${tracks}\n  </trackList>\n</playlist>\n`;
}

/** Generic DJ CSV (Lexicon, Rekord Buddy, Serato via Lexicon import). Serato .crate binaries need local file paths — see roadmap. */
export function toSeratoCSV(p: Playlist, eo: ExportOpts = {}): string {
  const rows = flatten(p, eo).map((t) =>
    [
      t.title,
      t.artist,
      t.album ?? "",
      t.year ?? "",
      t.kind === "cortina" ? "Cortina" : t.rhythm.charAt(0).toUpperCase() + t.rhythm.slice(1),
      timingComment(t),
      ...timingCells(t),
    ]
      .map(csvq)
      .join(","),
  );
  return `${["name", "artist", "album", "year", "genre", "comment", ...TIMING_COLS].map(csvq).join(",")}\n${rows.join("\n")}\n`;
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

/** Human set list (printable), each tanda prefixed with its planned clock (`T+1:07`, or `23:42` with a start time). */
export function toSetList(p: Playlist, eo: ExportOpts = {}): string {
  const plan = planFor(p, eo);
  const clockOf = (tanda: number) => {
    const m = plan.markers.find((x) => x.kind === "tanda" && x.tanda === tanda);
    return m ? boothClock(plan, m.atSec) : "";
  };
  const L: string[] = [
    `${p.name} — ${(p.stats.durationSec / 3600).toFixed(2)} h · ${p.tandas.length} tandas · score ${p.score.total}/100 (${p.score.verdict})`,
    `clock ${boothClock(plan, 0)} → ${boothClock(plan, plan.wallClockSec)} · gap ${plan.settings.gapSec} s`,
    "",
  ];
  if (p.opening)
    L.push(
      `${boothClock(plan, 0)}  ★ Opening La Cumparsita — ${p.opening.orchestra} (${p.opening.year ?? "?"})`,
      "",
    );
  p.tandas.forEach((t, i) => {
    L.push(
      `${clockOf(i + 1)}  ${String(i + 1).padStart(2, "0")}. [${t.rhythm.toUpperCase()}] ${t.orchestra}${t.singer ? ` / ${t.singer}` : " (instrumental)"} ${t.yearRange ? `${t.yearRange[0]}–${t.yearRange[1]}` : ""}  energy ${t.energy} (target ${t.targetEnergy}) · ${t.phase}`,
    );
    t.songs.forEach((s, j) => L.push(`     ${j + 1}. ${s.title} (${s.year ?? "?"}) · e${s.energy}`));
    if (t.cortina)
      L.push(
        `     ♪ cortina: ${t.cortina.artist} – ${t.cortina.title} (${t.cortina.genre}, e${t.cortina.energy})`,
      );
    const br = plan.markers.find((m) => m.kind === "break" && m.tanda === i + 1);
    if (br) L.push("", `${boothClock(plan, br.atSec)}  ■ ${br.label}`, "");
  });
  if (p.closing)
    L.push(
      "",
      `${plan.cumparsitaAtSec !== undefined ? boothClock(plan, plan.cumparsitaAtSec) : ""}  ★ La Cumparsita — ${p.closing.orchestra} (${p.closing.year ?? "?"})`,
    );
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
