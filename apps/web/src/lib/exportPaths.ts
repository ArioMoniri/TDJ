import { type ExportFormat, flatten, type Playlist } from "@tdj/core";

const safe = (s: string) =>
  s
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const escXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const DEFAULT_NAMING = "{artist} - {title}";

/** Render a file name from a naming pattern; tokens come from the flattened track. */
export function fileName(pattern: string, t: ReturnType<typeof flatten>[number]): string {
  const vals: Record<string, string> = {
    artist: t.artist,
    title: t.title,
    orchestra: t.orchestra ?? t.artist,
    singer: t.singer ?? "",
    year: t.year ? String(t.year) : "",
    rhythm: t.rhythm,
    tanda: String(t.tanda).padStart(2, "0"),
    n: String(t.n).padStart(3, "0"),
  };
  const name = (pattern || DEFAULT_NAMING)
    .replace(/\{(\w+)\}/g, (_, k: string) => vals[k] ?? "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `${safe(name) || safe(`${t.artist} - ${t.title}`)}.mp3`;
}

/** Folder → the three path spellings the exporters use. */
function folderForms(folder: string) {
  const f = folder.trim().replace(/[\\/]+$/, "");
  if (!f) return null;
  const win = /^[A-Za-z]:/.test(f);
  const segments = f.replace(/\\/g, "/").split("/").filter(Boolean);
  const volume = win ? segments[0]! : "Macintosh HD";
  const rest = win ? segments.slice(1) : segments;
  return {
    // rekordbox: file://localhost/Users/me/Music/Tango/
    rekordbox: `file://localhost/${win ? `${segments[0]}/` : ""}${rest.map((s) => encodeURIComponent(s)).join("/")}/`,
    // traktor: DIR="/:Users/:me/:Music/:Tango/:" and KEY="Macintosh HD/:Users/:…/:"
    traktorDir: `/:${rest.map(escXml).join("/:")}/:`,
    traktorKey: `${escXml(volume)}/:${rest.map(escXml).join("/:")}/:`,
    // m3u8: plain OS path
    plain: `${f.replace(/\\/g, "/")}/`,
  };
}

/** Post-process an exporter's text: real music-folder paths instead of the TDJ/ placeholder, and the user's naming pattern. */
export function applyPaths(
  body: string,
  format: ExportFormat,
  playlist: Playlist,
  opts: { folder?: string; naming?: string; includeCortinas?: boolean },
): string {
  const naming = (opts.naming ?? "").trim();
  const rename = naming && naming !== DEFAULT_NAMING;
  let out = body;
  if (rename) {
    for (const t of flatten(playlist, { includeCortinas: opts.includeCortinas ?? true })) {
      const oldSafe = `${safe(t.artist)} - ${safe(t.title)}.mp3`;
      const next = fileName(naming, t);
      if (format === "rekordbox")
        out = out.split(escXml(encodeURIComponent(oldSafe))).join(escXml(encodeURIComponent(next)));
      else if (format === "traktor")
        out = out
          .split(`FILE="${escXml(`${t.artist} - ${t.title}.mp3`)}"`)
          .join(`FILE="${escXml(next)}"`)
          .split(`/:${escXml(oldSafe)}"`)
          .join(`/:${escXml(next)}"`);
      else if (format === "m3u8") out = out.split(`\n${oldSafe}\n`).join(`\n${next}\n`);
    }
  }
  const ff = folderForms(opts.folder ?? "");
  if (ff) {
    if (format === "rekordbox") out = out.split("file://localhost/TDJ/").join(ff.rekordbox);
    else if (format === "traktor")
      out = out
        .split('DIR="/:TDJ/:"')
        .join(`DIR="${ff.traktorDir}"`)
        .split("Macintosh HD/:TDJ/:")
        .join(ff.traktorKey);
    else if (format === "m3u8")
      out = out
        .split("\n")
        .map((l) => (l && !l.startsWith("#") && !l.startsWith("spotify:") ? `${ff.plain}${l}` : l))
        .join("\n");
  }
  return out;
}

/** Strip cortinas when the DJ unticks "Include cortinas": exporters that ignore the option still honour it this way. */
export function withoutCortinas(p: Playlist): Playlist {
  return { ...p, tandas: p.tandas.map((t) => ({ ...t, cortina: null })) };
}

export const FORMAT_RE = /^(m3u8|csv|json|rekordbox|traktor|xspf|serato|setlist)$/;
