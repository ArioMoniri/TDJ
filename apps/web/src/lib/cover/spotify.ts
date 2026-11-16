import { getLocale, t } from "@/lib/i18n";
import { blobBase64, coverJpeg } from "./raster";

/**
 * Wave 4 — the night's cover on its Spotify playlist, after the write succeeded. Spotify takes a base64 JPEG of at
 * most 256 KB at PUT /v1/playlists/{id}/images, with the `ugc-image-upload` scope. The upload never blocks or fails
 * the export: it runs after the result is on screen, every error ends in a quiet "failed", and a token without the
 * scope ends in one line asking to reconnect.
 */
export const COVER_SCOPE = "ugc-image-upload";
export type CoverUpload = "added" | "no-scope" | "skipped" | "failed";

const API = "https://api.spotify.com/v1";

/** PUT the JPEG (base64, no prefix). 401 / 403 is a token without the image scope. */
export async function putPlaylistCover(
  access: string,
  playlistId: string,
  jpegBase64: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CoverUpload> {
  if (!/^[A-Za-z0-9]+$/.test(playlistId)) return "failed";
  try {
    const r = await fetchImpl(`${API}/playlists/${playlistId}/images`, {
      method: "PUT",
      headers: { authorization: `Bearer ${access}`, "content-type": "image/jpeg" },
      body: jpegBase64,
    });
    if (!r.ok) return r.status === 401 || r.status === 403 ? "no-scope" : "failed";
    // 2026-11: read back — the playlist now shows an image (an empty list is a cover that did not land)
    const g = await fetchImpl(`${API}/playlists/${playlistId}/images`, {
      headers: { authorization: `Bearer ${access}` },
    }).catch(() => null);
    if (g?.ok) {
      const imgs = (await g.json().catch(() => null)) as unknown[] | null;
      if (Array.isArray(imgs) && imgs.length === 0) return "failed";
    }
    return "added";
  } catch {
    return "failed";
  }
}

export interface CoverUploadInput {
  /** the night (a Playlist) the playlist was made from */
  playlist: unknown;
  playlistId: string;
  /** Settings → Export → "Add a cover to exported playlists" (on unless turned off) */
  enabled: boolean;
  /** the hosted login (or the apps' device session): the JPEG goes through /api/spotify/cover */
  hosted: boolean;
  /** the BYO token (the hosted one stays with the session) */
  access?: string | null;
  /** the scopes granted, when known: without the image scope nothing is sent */
  scopes?: readonly string[] | string | null;
  /** test seams */
  fetchImpl?: typeof fetch;
  makeJpeg?: (playlist: unknown) => Promise<string | null>;
}

const hasScope = (s: CoverUploadInput["scopes"]) =>
  s == null ? null : (Array.isArray(s) ? s : String(s).split(/[\s,]+/)).includes(COVER_SCOPE);

/** the cover as base64 JPEG under Spotify's cap, in the app's language and light theme (Spotify shows it on white) */
async function browserJpeg(playlist: unknown): Promise<string | null> {
  // (the outlines load with the first cover, not with the Export sheet)
  const { nightCoverSvg } = await import("./index");
  // the same image History and Share show: the cover family of the entry that holds this night
  const { withCoverSeed } = await import("./entrySeed");
  const night = playlist && typeof playlist === "object" ? withCoverSeed(playlist) : playlist;
  const svg = nightCoverSvg(night, { size: 640, theme: "light", locale: getLocale() });
  const fit = await coverJpeg(svg, 640, 640);
  return fit ? blobBase64(fit.blob) : null;
}

/** Upload the cover; resolves (never rejects) with what happened. */
export async function uploadSpotifyCover(i: CoverUploadInput): Promise<CoverUpload> {
  try {
    if (!i.enabled) return "skipped";
    if (hasScope(i.scopes) === false) return "no-scope";
    const f = i.fetchImpl ?? fetch;
    if (!i.hosted && !i.access) return "failed";
    const jpeg = await (i.makeJpeg ?? browserJpeg)(i.playlist);
    if (!jpeg) return "failed";
    if (i.hosted) {
      // the hosted session's token stays on the server (and the apps' in the Keychain): the browser-made JPEG goes
      // through /api/spotify/cover (lib/api/spotifyCover.ts), which PUTs it with the session
      const r = await f("/api/spotify/cover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: i.playlistId, jpeg }),
      });
      const j = (await r.json().catch(() => null)) as { added?: boolean; reason?: string } | null;
      return j?.added ? "added" : j?.reason === "scope" ? "no-scope" : "failed";
    }
    return await putPlaylistCover(i.access!, i.playlistId, jpeg, f);
  } catch {
    return "failed";
  }
}

/**
 * The export's one hook: fire and forget after a successful write. `note` gets one line for the result log: the
 * reconnect hint without the scope, a short confirmation when the cover landed, nothing otherwise.
 */
export function coverAfterExport(i: CoverUploadInput, note: (line: string) => void): void {
  void uploadSpotifyCover(i).then((r) => {
    if (r === "no-scope") note(t("cover.reconnect"));
    else if (r === "added") note(t("cover.added"));
  });
}
