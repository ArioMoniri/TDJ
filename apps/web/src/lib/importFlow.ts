"use client";
import {
  buildImportedNight,
  type ComposeOptions,
  DEFAULT_OPTIONS,
  entriesOfNight,
  type ImportEntry,
  type ImportedNight,
  type ImportItem,
  type ImportResult,
  type ImportSource,
  itemFromFileName,
  learnFromImport,
  type ParsedPlaylist,
  parsePlaylistFile,
  recordExceptions,
} from "@tdj/core";
import { makeSnapshot } from "@/lib/history";
import { t } from "@/lib/i18n";
import {
  type ApiCall,
  type PlaylistSummary,
  type ReadPlaylist,
  spotifyMyPlaylists,
  spotifyPlaylistId,
  spotifyReadPlaylist,
  youtubePlaylistId,
} from "./playlistSources";
import { fullOptions, overridesForRequest, useStore } from "./store";
import { loadMatches, saveMatches } from "./youtubeMatches";

/**
 * "Import a playlist" in the browser (2026-11): read the source (Spotify with the signed-in client's own token, YouTube
 * through the server's Google session, files and pasted lists here), match it on the server or the device
 * (/api/import/match), let the DJ review it (app/import), then keep it: History (source "import", with its link), the
 * current night, the one-night exceptions of its tandas, and — only when the DJ asks — what it teaches.
 */

export class ImportError extends Error {
  code: string;
  login?: string;
  constructor(code: string, message: string, login?: string) {
    super(message);
    this.code = code;
    if (login) this.login = login;
  }
}

/* ---------- Spotify (the DJ's own token: hosted session or bring-your-own) ---------- */

async function spotifyToken(): Promise<string | null> {
  const cur = useStore.getState().spotifyToken;
  if (cur && cur.expires > Date.now() + 30_000) return cur.access;
  try {
    const r = await fetch("/api/spotify/access", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { access?: string; expires?: number };
    if (!j.access) return null;
    useStore.getState().setSpotifyToken({ access: j.access, expires: j.expires ?? Date.now() + 3_000_000 });
    return j.access;
  } catch {
    return null;
  }
}

const SPOTIFY_API = "https://api.spotify.com/v1";
function spotifyCall(token: string): ApiCall {
  return async <T>(path: string) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`${SPOTIFY_API}${path}`, { headers: { authorization: `Bearer ${token}` } });
      if (r.status === 429 && attempt < 2) {
        const wait = Math.min(10, Number(r.headers.get("retry-after")) || 2);
        await new Promise((res) => setTimeout(res, wait * 1000));
        continue;
      }
      if (!r.ok) {
        const e = new ImportError(
          r.status === 401 ? "signed_out" : r.status === 404 ? "not_found" : "spotify",
          r.status === 404
            ? t("import.err_spotify_404")
            : r.status === 401
              ? t("import.err_spotify_signed_out")
              : t("import.err_service", { status: r.status }),
        );
        (e as ImportError & { status: number }).status = r.status;
        throw e;
      }
      return (await r.json()) as T;
    }
  };
}

export async function spotifySignedIn(): Promise<boolean> {
  return !!(await spotifyToken());
}
export async function spotifyPlaylists(): Promise<PlaylistSummary[]> {
  const tok = await spotifyToken();
  if (!tok) throw new ImportError("signed_out", t("import.err_spotify_signed_out"));
  return spotifyMyPlaylists(spotifyCall(tok));
}
export async function readSpotify(link: string): Promise<ReadPlaylist> {
  const id = spotifyPlaylistId(link);
  if (!id) throw new ImportError("not_a_playlist", t("import.err_not_spotify_link"));
  const tok = await spotifyToken();
  if (!tok) throw new ImportError("signed_out", t("import.err_spotify_signed_out"));
  return spotifyReadPlaylist(spotifyCall(tok), id);
}

/* ---------- YouTube (the server's Google session) ---------- */

async function ytAnswer<T>(r: Response): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; login?: string };
  if (r.ok) return j;
  if (r.status === 401 || r.status === 404 || j.error === "needs_scope")
    throw new ImportError("signed_out", t("import.err_youtube_signed_out"), j.login);
  if (j.error === "not_a_playlist") throw new ImportError("not_a_playlist", t("import.err_not_youtube_link"));
  throw new ImportError("youtube", t("import.err_service", { status: r.status }));
}
export async function youtubePlaylists(): Promise<PlaylistSummary[]> {
  return (
    await ytAnswer<{ playlists: PlaylistSummary[] }>(
      await fetch("/api/google/youtube/import", { cache: "no-store" }),
    )
  ).playlists;
}
export async function readYoutube(link: string): Promise<ReadPlaylist> {
  if (!youtubePlaylistId(link)) throw new ImportError("not_a_playlist", t("import.err_not_youtube_link"));
  return ytAnswer<ReadPlaylist>(
    await fetch("/api/google/youtube/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link }),
    }),
  );
}

/* ---------- files and folders ---------- */

const AUDIO = /\.(mp3|m4a|aac|flac|wav|aiff?|ogg|opus|alac|wma)$/i;
const LIST = /\.(m3u8?|xspf|xml|nml|csv|tsv|txt|json|tdjnight)$/i;
export const FILE_ACCEPT = ".m3u,.m3u8,.xspf,.xml,.nml,.csv,.tsv,.txt,.json,.tdjnight,audio/*";

/**
 * Files the DJ picked or dropped (a folder too): playlist files are read in order of their names; a folder of audio
 * files only becomes one list of its file names ("Orchestra - Title.mp3"), in path order.
 */
export async function readFiles(files: File[]): Promise<ParsedPlaylist> {
  const path = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const lists = files.filter((f) => LIST.test(f.name)).sort((a, b) => path(a).localeCompare(path(b)));
  if (lists.length) {
    const parsed: ParsedPlaylist[] = [];
    for (const f of lists) {
      if (f.size > 5_000_000) throw new ImportError("too_large", t("import.err_too_large", { name: f.name }));
      try {
        parsed.push(parsePlaylistFile(await f.text(), f.name));
      } catch (e) {
        if (lists.length === 1) throw new ImportError("format", (e as Error).message);
      }
    }
    if (!parsed.length) throw new ImportError("format", t("import.err_no_playlist_in_files"));
    const night = parsed.find((p) => p.night);
    if (night) return night;
    return {
      format: parsed[0]!.format,
      name: parsed.length === 1 ? parsed[0]!.name : (path(lists[0]!).split("/")[0] ?? parsed[0]!.name),
      items: parsed.flatMap((p, i) =>
        p.items.map((it, k) => (k === 0 && i > 0 ? { ...it, breakBefore: true } : it)),
      ),
    };
  }
  const audio = files.filter((f) => AUDIO.test(f.name)).sort((a, b) => path(a).localeCompare(path(b)));
  if (!audio.length) throw new ImportError("format", t("import.err_no_playlist_in_files"));
  return {
    format: "folder",
    name: path(audio[0]!).includes("/") ? path(audio[0]!).split("/")[0]! : t("import.local_files"),
    items: audio.map((f) => itemFromFileName(path(f))),
  };
}

/* ---------- matching ---------- */

/** the rows matched on the server (or the device) with the DJ's own database */
export async function matchItems(items: ImportItem[]): Promise<ImportEntry[]> {
  const overrides = overridesForRequest(useStore.getState().overrides);
  const r = await fetch("/api/import/match", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items, ...(overrides ? { overrides } : {}) }),
  });
  const j = (await r.json().catch(() => ({}))) as { entries?: ImportEntry[]; error?: string };
  if (!r.ok || !j.entries) throw new ImportError("match", j.error || t("import.err_match"));
  return j.entries;
}

/** a `.tdjnight` arrives whole: resolved as /night does, then reviewed like any import */
export async function resolveNight(parsed: ParsedPlaylist): Promise<ImportEntry[]> {
  const r = await fetch("/api/night/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ night: parsed.night }),
  });
  const j = (await r.json().catch(() => ({}))) as ImportResult & { error?: string };
  if (!r.ok || !j.playlist) throw new ImportError("format", j.error || t("import.err_match"));
  return entriesOfNight(j.playlist);
}

/** the night the review shows, built in the browser from the DJ's edits */
export function nightOf(entries: ImportEntry[], name: string, source: ImportSource): ImportedNight {
  const opts = { ...DEFAULT_OPTIONS, ...fullOptions(useStore.getState().options) } as ComposeOptions;
  return buildImportedNight(entries, {
    name: name.trim() || t("import.imported_night"),
    options: opts,
    source,
  });
}

/* ---------- keeping it ---------- */

/**
 * The night into History (an imported night, its source link kept), the current night, and the DJ's memory: the
 * one-night exceptions of its tandas (never a template or a compose signal). A YouTube import's videos are
 * remembered for the Booth's YouTube player. Nothing is learned here (`learnFromNight` is the DJ's choice).
 */
export function keepImported(
  n: ImportedNight,
  entries: ImportEntry[],
  /**
   * 2026-11 ("Import a night"): false keeps it in History only — the Booth loads it itself (mid-night it asks first),
   * History just lists it — and leaves the current night and the Compose settings as they are
   */
  o: { current?: boolean } = {},
): string {
  const st = useStore.getState();
  const p = n.playlist;
  const snap = makeSnapshot(p, p.options, "import");
  st.addSnapshot(snap);
  if (o.current !== false) {
    st.setPlaylist(p);
    st.replaceOptions({ ...p.options });
  }
  if (n.exceptions.length)
    st.updateMemory((m) => ({ ...m, learned: recordExceptions(m.learned, n.exceptions) }));
  const videos: Record<string, string> = {};
  for (const e of entries)
    if (e.item.youtubeId && e.song && e.role !== "skip") videos[e.song.id] = e.item.youtubeId;
  if (Object.keys(videos).length) saveMatches({ ...loadMatches(), ...videos });
  return snap.id;
}

/** "Learn from this night": off when the DJ switched learning off in Settings */
export function learnFromNight(n: ImportedNight): boolean {
  const st = useStore.getState();
  if (!st.settings.learn) return false;
  st.updateMemory((m) => ({ ...m, learned: learnFromImport(m.learned, n.playlist) }));
  return true;
}
