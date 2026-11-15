import { type ExportFormat, flatten, type Playlist, parseNightFile } from "@tdj/core";
import { type VerifyResult, verify } from "./exportVerify";

/**
 * A file export proves itself: the text that was generated is parsed back the way the DJ app would read it and
 * compared with the night's running order (lib/exportVerify.ts) — the same rows, in the same order, the cortinas
 * in or out as chosen, duplicates kept, every row with a title and an artist, the Turkish letters intact, and a
 * path on every row when a music folder is set.
 */
export interface FileRow {
  title: string;
  artist: string;
  /** where the DJ app looks for the file (a path, a file:// URL or a spotify: URI) */
  location?: string;
  kind?: string;
  /** what the row is compared by when it is not the title alone (M3U8: the "Artist - Title" line) */
  key?: string;
}
/** the export formats, the TuneMyMusic / Soundiiz CSV and the shared `.tdjnight` file */
export type FileTarget = ExportFormat | "transfer" | "tdjnight";
export interface FileCheck extends VerifyResult {
  format: FileTarget;
  /** rows without a title or an artist (1-based positions) */
  blank: number[];
  /** the text does not survive a UTF-8 round trip (a replacement character, a lone surrogate) */
  badEncoding: boolean;
  /** rows whose location is not in the DJ's music folder (only checked when one is set) */
  noPath: number[];
  /** the file could not be read back at all */
  unreadable?: string;
  /** everything checked: count, order, names, encoding, paths */
  allOk: boolean;
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unxml(m[1]!) : undefined;
};

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}
const csvRows = (text: string, cols: { title: string; artist: string; location?: string; kind?: string }) => {
  const [head, ...rows] = parseCsv(text);
  const ix = (n?: string) => (n ? (head ?? []).indexOf(n) : -1);
  const [ti, ai, li, ki] = [ix(cols.title), ix(cols.artist), ix(cols.location), ix(cols.kind)];
  if (ti < 0 || ai < 0) throw new Error("no title or artist column");
  return rows
    .map((r) => ({
      title: r[ti] ?? "",
      artist: r[ai] ?? "",
      ...(li >= 0 && r[li] ? { location: r[li] } : {}),
      ...(ki >= 0 ? { kind: r[ki] } : {}),
    }))
    .filter((r) => r.kind !== "break");
};

/** Reads an export back as a DJ app would: its rows in playing order. Throws when the file cannot be read. */
export function parseExport(format: FileTarget, text: string, includeCortinas = true): FileRow[] {
  switch (format) {
    case "m3u8": {
      const out: FileRow[] = [];
      let cur: FileRow | null = null;
      for (const l of text.split(/\r?\n/)) {
        const inf = /^#EXTINF:[^,]*,(.*)$/.exec(l);
        if (inf) {
          // "Artist - Title": a player shows it as one line (an artist may hold " - " itself: "Dante - Martel")
          const text = inf[1]!.replace(/ \[CORTINA\]$/, "");
          const k = text.indexOf(" - ");
          cur = {
            key: text,
            title: k >= 0 ? text.slice(k + 3) : text,
            artist: k >= 0 ? text.slice(0, k) : "",
          };
          if (/ \[CORTINA\]$/.test(inf[1]!)) cur.kind = "cortina";
        } else if (l && !l.startsWith("#") && cur) {
          out.push({ ...cur, location: l });
          cur = null;
        }
      }
      return out;
    }
    case "csv":
      return csvRows(text, { title: "title", artist: "orchestra/artist", location: "file", kind: "kind" });
    case "serato":
      return csvRows(text, { title: "name", artist: "artist", location: "location" });
    case "transfer":
      return csvRows(text, { title: "title", artist: "artist" });
    case "tdjnight": {
      const n = parseNightFile(text);
      const side = (s: { title: string; orchestra: string }) => ({ title: s.title, artist: s.orchestra });
      return [
        ...(n.opening ? [side(n.opening)] : []),
        ...n.tandas.flatMap((t) => [
          ...t.sides.map(side),
          ...(t.cortina ? [{ title: t.cortina.title, artist: t.cortina.artist, kind: "cortina" }] : []),
        ]),
        ...(n.closing ? [side(n.closing)] : []),
      ];
    }
    case "json": {
      const p = JSON.parse(text) as Playlist;
      return flatten(p, { includeCortinas }).map((t) => ({ title: t.title, artist: t.artist, kind: t.kind }));
    }
    case "rekordbox": {
      const coll = new Map<string, FileRow>();
      const body = /<COLLECTION[^>]*>([\s\S]*?)<\/COLLECTION>/.exec(text)?.[1];
      if (body === undefined) throw new Error("no COLLECTION");
      for (const m of body.matchAll(/<TRACK\s[^>]*?TrackID="[^"]*"[^>]*>/g)) {
        const tag = m[0];
        const loc = attr(tag, "Location");
        coll.set(attr(tag, "TrackID")!, {
          title: attr(tag, "Name") ?? "",
          artist: attr(tag, "Artist") ?? "",
          ...(loc ? { location: decodeURIComponent(loc) } : {}),
        });
      }
      const full = /<NODE Name="Full set \(in order\)"[^>]*>([\s\S]*?)<\/NODE>/.exec(text)?.[1] ?? "";
      return [...full.matchAll(/<TRACK Key="([^"]*)"\/>/g)].map(
        (m) => coll.get(m[1]!) ?? { title: "", artist: "" },
      );
    }
    case "traktor": {
      const byFile = new Map<string, FileRow>();
      const coll = /<COLLECTION[^>]*>([\s\S]*?)<\/COLLECTION>/.exec(text)?.[1];
      if (coll === undefined) throw new Error("no COLLECTION");
      for (const m of coll.matchAll(/<ENTRY\s[^>]*>[\s\S]*?<\/ENTRY>/g)) {
        const head = /<ENTRY\s[^>]*>/.exec(m[0])![0];
        const loc = /<LOCATION\s[^>]*>/.exec(m[0])?.[0] ?? "";
        const file = attr(loc, "FILE") ?? "";
        byFile.set(file, {
          title: attr(head, "TITLE") ?? "",
          artist: attr(head, "ARTIST") ?? "",
          location: `${(attr(loc, "DIR") ?? "").replace(/\/:/g, "/")}${file}`,
        });
      }
      return [...text.matchAll(/<PRIMARYKEY TYPE="TRACK" KEY="([^"]*)"/g)].map((m) => {
        const key = unxml(m[1]!);
        return byFile.get(key.slice(key.lastIndexOf("/:") + 2)) ?? { title: "", artist: "" };
      });
    }
    case "xspf":
      return [...text.matchAll(/<track>([\s\S]*?)<\/track>/g)].map((m) => {
        const tag = (n: string) => {
          const v = new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(m[1]!)?.[1];
          return v === undefined ? undefined : unxml(v);
        };
        const loc = tag("location");
        return {
          title: tag("title") ?? "",
          artist: tag("creator") ?? "",
          ...(loc ? { location: loc.startsWith("file://") ? decodeURI(loc) : loc } : {}),
          ...(tag("annotation") === "cortina" ? { kind: "cortina" } : {}),
        };
      });
    case "setlist": {
      const out: FileRow[] = [];
      for (const l of text.split("\n")) {
        const song = /^\s+\d+\. (.+) \((?:\d{4}|\?)\) · e\d+$/.exec(l);
        const cue = /^\s+♪ cortina: (.+?) – (.+) \([^()]*, e\d+\)$/.exec(l);
        const star = /★ (?:Opening )?La Cumparsita — (.+) \(/.exec(l);
        if (song) out.push({ title: song[1]!, artist: "·" });
        else if (cue) out.push({ title: cue[2]!, artist: cue[1]!, kind: "cortina" });
        else if (star) out.push({ title: "La Cumparsita", artist: star[1]! });
      }
      return out;
    }
  }
}

/** Survives a UTF-8 round trip: no lone surrogate, no replacement character. */
export function utf8Ok(text: string): boolean {
  if (text.includes("�")) return false;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(text)) === text;
  } catch {
    return false;
  }
}

/** The formats whose rows carry a file location the DJ's music folder applies to. */
const PATHS: Partial<Record<FileTarget, true>> = {
  m3u8: true,
  rekordbox: true,
  traktor: true,
  xspf: true,
  csv: true,
  serato: true,
};

/**
 * Parses `text` back and checks it against the night (`playlist` as exported: cortinas already removed when the
 * DJ left them out). Rows are compared by title in order; artists are checked for presence (formats spell them
 * differently: "Orchestra / Singer", the orchestra alone).
 */
export function verifyFile(
  format: FileTarget,
  text: string,
  playlist: Playlist,
  o: { includeCortinas?: boolean; folder?: string } = {},
): FileCheck {
  // (a .tdjnight always carries the cortinas: it is the night itself, not a playlist made from it)
  const includeCortinas = format === "tdjnight" ? true : (o.includeCortinas ?? true);
  const want = flatten(playlist, { includeCortinas }).filter((t) => t.kind !== "break");
  const expected = want.map((t) => ({
    key: format === "m3u8" ? `${t.artist} - ${t.title}` : t.title,
    label: `${t.title} (${t.artist})`,
    tanda: t.tanda,
    kind: t.kind,
  }));
  let rows: FileRow[] = [];
  let unreadable: string | undefined;
  try {
    rows = parseExport(format, text, includeCortinas);
  } catch (e) {
    unreadable = (e as Error).message;
  }
  const r = verify(
    expected,
    rows.map((x) => x.key ?? x.title),
  );
  const blank = rows.flatMap((x, i) => (!x.title.trim() || !x.artist.trim() ? [i + 1] : []));
  const folder = (o.folder ?? "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const inFolder = (loc?: string) => {
    if (!loc) return false;
    if (loc.startsWith("spotify:")) return true;
    const plain = loc.replace(/^file:\/\/(localhost)?\/?/, "/").replace(/\\/g, "/");
    const bare = folder.replace(/^\/+/, "");
    return plain.replace(/^\/+/, "").startsWith(bare);
  };
  const noPath = folder && PATHS[format] ? rows.flatMap((x, i) => (inFolder(x.location) ? [] : [i + 1])) : [];
  const badEncoding = !utf8Ok(text);
  return {
    ...r,
    format,
    blank,
    badEncoding,
    noPath,
    ...(unreadable ? { unreadable } : {}),
    allOk: r.ok && !blank.length && !badEncoding && !noPath.length && !unreadable,
  };
}
