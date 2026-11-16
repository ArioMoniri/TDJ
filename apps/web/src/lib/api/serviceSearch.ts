import type { ServiceAnswer } from "@/lib/smartSearch";
import { searchTracks } from "@/lib/spotifyWeb";
import type { ApiDeps } from "./deps";
import { bad, bodyJson, json } from "./http";

/**
 * POST /api/services/search { q, limit? } — the smart search's connected services (2026-11): the recordings the DJ's
 * own Spotify finds for the words (the hosted session's cookie on the server, the Keychain's token in the apps), up to
 * 10 (Dev Mode's cap). Every service answers with its state, so the field can say "Spotify: not connected" instead of
 * nothing: `ok`, `off` (not offered here), `signed-out`, `busy` (rate limited) or `error`. The catalogue side is
 * POST /api/search; the browser merges the two (lib/smartSearch.ts). More services (YouTube) join this list.
 */
export async function serviceSearch(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<{ q?: unknown; limit?: unknown }>(req);
  if (!body || typeof body !== "object") return bad("Body must be an object");
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 120) : "";
  const limit = Math.max(1, Math.min(10, typeof body.limit === "number" ? body.limit : 10));
  const services: ServiceAnswer[] = [];
  let setCookie: string | undefined;
  if (q.length < 2) return json({ services });
  const spotify = await (async (): Promise<ServiceAnswer> => {
    if (!(await d.spotify.enabled().catch(() => false))) return { id: "spotify", state: "off", tracks: [] };
    const s = await d.spotify.session(req).catch(() => null);
    if (!s) return { id: "spotify", state: "signed-out", tracks: [] };
    setCookie = s.setCookie;
    try {
      return { id: "spotify", state: "ok", tracks: await searchTracks(s.access, q, limit) };
    } catch (e) {
      return {
        id: "spotify",
        state: (e as { status?: number }).status === 429 ? "busy" : "error",
        tracks: [],
      };
    }
  })();
  services.push(spotify);
  const res = json({ services });
  if (setCookie) res.headers.append("set-cookie", setCookie);
  return res;
}
