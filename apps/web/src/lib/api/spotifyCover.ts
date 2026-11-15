import type { ApiDeps } from "./deps";
import { bodyJson, json } from "./http";

/**
 * Wave 4 — the playlist cover for the hosted login (and the apps' device session): the browser draws the cover and
 * sends its JPEG here (the server keeps the token, and the page never calls Spotify with it), the route PUTs it to
 * /v1/playlists/{id}/images. A session without `ugc-image-upload` (granted before the scope was asked for) gets
 * `{ added: false, reason: "scope" }`, which the page turns into its "Reconnect Spotify" line. Never an error page:
 * the export it follows has already succeeded.
 *
 * POST { playlistId, jpeg: <base64> } → { added: true } | { added: false, reason: "scope" | "spotify" | "input" }
 */
const COVER_SCOPE = "ugc-image-upload";
/** Spotify's cap, on the base64 body */
const MAX_B64 = 256 * 1024;
const env = (k: string) => (typeof process !== "undefined" ? process.env?.[k] : undefined);
const API = () => (env("SPOTIFY_API_URL") ?? "https://api.spotify.com/v1").replace(/\/$/, "");

export async function spotifyCover(req: Request, d: ApiDeps): Promise<Response> {
  const cross = await d.guard(req);
  if (cross) return cross;
  if (!(await d.spotify.enabled()))
    return json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const s = await d.spotify.session(req);
  if (!s) return json({ error: "Not logged in with Spotify" }, { status: 401 });
  const withCookie = (r: Response) => {
    if (s.setCookie) r.headers.append("set-cookie", s.setCookie);
    return r;
  };
  if (s.scopes?.length && !s.scopes.includes(COVER_SCOPE))
    return withCookie(json({ added: false, reason: "scope" }));
  const body = await bodyJson<{ playlistId?: unknown; jpeg?: unknown }>(req);
  const id =
    typeof body?.playlistId === "string" && /^[A-Za-z0-9]+$/.test(body.playlistId) ? body.playlistId : null;
  const jpeg = typeof body?.jpeg === "string" && /^[A-Za-z0-9+/]+=*$/.test(body.jpeg) ? body.jpeg : null;
  if (!id || !jpeg || jpeg.length > MAX_B64) return withCookie(json({ added: false, reason: "input" }));
  try {
    const r = await d.fetch(`${API()}/playlists/${id}/images`, {
      method: "PUT",
      headers: { authorization: `Bearer ${s.access}`, "content-type": "image/jpeg" },
      body: jpeg,
    });
    if (r.ok) return withCookie(json({ added: true }));
    return withCookie(
      json({ added: false, reason: r.status === 401 || r.status === 403 ? "scope" : "spotify" }),
    );
  } catch {
    return withCookie(json({ added: false, reason: "spotify" }));
  }
}
