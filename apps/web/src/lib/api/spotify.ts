import type { Playlist } from "@tdj/core";
import { withoutCortinas } from "@/lib/exportPaths";
import type { MatchItem } from "@/lib/match";
import { ApiError as SpotifyError } from "@/lib/providerApi";
import { MATCH_BATCH, orderedUris, spotifyPlanFor, standInCortinas } from "@/lib/spotifyPlan";
import {
  createPlaylist,
  findPlayable,
  MATCH_BUDGET_MS,
  marketOf,
  matchItems,
  updatePlaylistDetails,
  writePlaylist,
} from "@/lib/spotifyWeb";
import type { PlaylistCheck, VerifiedWrite } from "@/lib/spotifyWrite";
import type { ApiDeps } from "./deps";
import { type AnyBody, bodyJson, json } from "./http";

/**
 * Spotify matching and playlists with the DJ's session: the server's sealed cookie (lib/server/deps.ts) or, in the
 * apps, the tokens the device keeps in its Keychain (lib/app/deps.ts). The Web API calls are lib/spotifyWeb.ts.
 */

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** How long one playlist write may take with its read-back, repairs and Retry-After waits. */
const WRITE_BUDGET_MS = () => Number(process.env.TDJ_WRITE_BUDGET_MS) || 25_000;
/** A row Spotify can hold in a playlist: a track or an episode URI. */
export const PLAYLIST_URI = /^spotify:(track|episode):[A-Za-z0-9]+$/;

/** One matcher item from a request body; null when it lacks an id or a title. */
function parseItem(r: unknown, withCortina = false): MatchItem | null {
  const o = (r ?? {}) as Record<string, unknown>;
  const id = str(o.id, 80);
  const title = str(o.title);
  const orchestra = str(o.orchestra);
  if (!id || !title) return null;
  return {
    id,
    title,
    orchestra,
    singer: str(o.singer, 120) || null,
    year: num(o.year),
    durationSec: num(o.durationSec),
    isrc: /^[A-Z0-9]{12}$/i.test(str(o.isrc, 12)) ? str(o.isrc, 12).toUpperCase() : null,
    ...(withCortina && o.cortina === true ? { cortina: true } : {}),
    // round 15: what the hard match rules read (a cortina sends none of them)
    ...(typeof o.vocal === "boolean"
      ? {
          vocal: o.vocal,
          date: /^\d{4}-\d{2}-\d{2}$/.test(str(o.date, 10)) ? str(o.date, 10) : null,
          durationEstimated: o.durationEstimated === true,
          altTitles: Array.isArray(o.altTitles)
            ? o.altTitles
                .slice(0, 5)
                .map((x) => str(x, 120))
                .filter(Boolean)
            : undefined,
        }
      : {}),
  };
}

/**
 * POST { items: [{ id, title, orchestra, singer?, year?, durationSec?, isrc? }] } (≤ 10) →
 * { matches: [{ id, uri, name, artist, album, year, durationMs, score }], missing: [ids], rateLimited?: seconds }.
 * Searches run one at a time on the server with the hosted session; a 429 Spotify would not let us wait out,
 * or a batch that would outrun the request's 20 s budget, ends the batch early and `rateLimited` tells the
 * browser how long to pause.
 */
export async function spotifyMatch(req: Request, d: ApiDeps): Promise<Response> {
  const started = Date.now();
  const cross = await d.guard(req);
  if (cross) return cross;
  if (!(await d.spotify.enabled()))
    return json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const s = await d.spotify.session(req);
  if (!s) return json({ error: "Not logged in with Spotify" }, { status: 401 });
  const body = await bodyJson<AnyBody>(req);
  const raw = Array.isArray(body?.items) ? (body.items as unknown[]) : null;
  if (!raw?.length) return json({ error: "items required" }, { status: 400 });
  if (raw.length > MATCH_BATCH)
    return json({ error: `at most ${MATCH_BATCH} items per request` }, { status: 400 });
  const items: MatchItem[] = [];
  for (const r of raw) {
    const it = parseItem(r);
    if (!it) return json({ error: "each item needs id and title" }, { status: 400 });
    items.push(it);
  }
  try {
    const r = await matchItems(s.access, items, { deadline: started + MATCH_BUDGET_MS });
    const res = json(r);
    if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
    return res;
  } catch (e) {
    const status = e instanceof SpotifyError ? (e.status === 401 ? 401 : 502) : 500;
    return json({ error: (e as Error).message }, { status });
  }
}

/**
 * Creates the playlist in the logged-in user's library. The Export sheet matches first through /api/spotify/match
 * and sends `uris` in running order (with `items`, the matcher's view of each row, so a row the listener's country
 * cannot play can be swapped for a playable version); `playlistId` with `replace` overwrites a playlist made
 * earlier, `playlistId` alone appends, `check` only reads it. Without `uris` (older callers) the unresolved tracks
 * are matched here, one search at a time, stopping at a rate limit or at the 20 s budget (`rateLimited`).
 * Every write is read back page by page and compared row by row: the answer carries that `check`
 * (lib/spotifyWrite.ts), and `added` is what Spotify holds in its own row, never what was sent.
 */
export async function spotifyPlaylist(req: Request, d: ApiDeps): Promise<Response> {
  const started = Date.now();
  const cross = await d.guard(req);
  if (cross) return cross;
  if (!(await d.spotify.enabled()))
    return json({ error: "Hosted Spotify login is not enabled" }, { status: 404 });
  const s = await d.spotify.session(req);
  if (!s) return json({ error: "Not logged in with Spotify" }, { status: 401 });
  const body = await bodyJson<AnyBody>(req);
  const playlist = body?.playlist as Playlist | undefined;
  const rawUris = Array.isArray(body?.uris) ? (body.uris as unknown[]) : null;
  // a row Spotify could never hold is reported (`invalid`), never dropped in silence
  const invalid = (rawUris ?? []).filter((u) => typeof u !== "string" || !PLAYLIST_URI.test(u)).map(String);
  const given = rawUris
    ? rawUris.filter((u): u is string => typeof u === "string" && PLAYLIST_URI.test(u))
    : null;
  if (!playlist?.tandas && !given) return json({ error: "playlist required" }, { status: 400 });
  // the matcher's view of each row, aligned with `uris` (only when every row is accounted for)
  const rawItems = Array.isArray(body?.items) ? (body.items as unknown[]) : null;
  let items: Array<MatchItem | null> | null =
    rawItems && rawUris && rawItems.length === rawUris.length && !invalid.length
      ? rawItems.map((x) => (x ? parseItem(x, true) : null))
      : null;
  const includeCortinas = body.includeCortinas !== false;
  const uris: string[] = given ? [...given] : [];
  const missing: string[] = [];
  /** round 19: the cortinas Spotify could not match and the Spotify-ready cue of their family that stands in */
  let standIns: Array<{ id: string; cue: string; standIn: string; uri: string }> = [];
  let rateLimited: number | undefined;
  const deadline = started + WRITE_BUDGET_MS();
  try {
    if (!given && playlist) {
      const plan = spotifyPlanFor(includeCortinas ? playlist : withoutCortinas(playlist), null, {
        includeCortinas,
      });
      const r = await matchItems(s.access, plan.items, { deadline: started + MATCH_BUDGET_MS });
      const found = new Map(r.matches.map((m) => [m.id, m.uri] as const));
      // round 19: a cortina with no match gets the nearest Spotify-ready cue of its family, never a gap
      const si = includeCortinas
        ? standInCortinas(playlist, r.missing, found, d.catalog().cortinas)
        : { standIns: [], missing: r.missing };
      standIns = si.standIns;
      // running order: each match goes back into its own row (cortinas stay between the tandas)
      uris.push(...orderedUris(plan, found));
      for (const id of si.missing) {
        const t = plan.tracks.find((x) => (x.id ?? "") === id);
        missing.push(t ? `${t.title} ${t.orchestra ?? t.artist}` : id);
      }
      rateLimited = r.rateLimited;
      items = null;
    }
    const playlistId =
      typeof body.playlistId === "string" && /^[A-Za-z0-9]+$/.test(body.playlistId)
        ? (body.playlistId as string)
        : null;
    const market = await marketOf(s.access);
    const verified = (id: string, w: Omit<VerifiedWrite, "market" | "findPlayable">) =>
      writePlaylist(
        s.access,
        id,
        uris,
        {
          ...w,
          market: "from_token",
          findPlayable: async (at, avoid) => {
            const it = items?.[at];
            if (!it) return null;
            return (await findPlayable(s.access, it, avoid, deadline))?.uri ?? null;
          },
        },
        { deadline },
      );
    const answer = (extra: Record<string, unknown>, check: PlaylistCheck) => {
      const res = json({
        ...extra,
        added: check.inPlace,
        check,
        market,
        missing,
        ...(invalid.length ? { invalid } : {}),
        ...(standIns.length ? { standIns } : {}),
        ...(rateLimited ? { rateLimited } : {}),
      });
      if (s.setCookie) res.headers.append("set-cookie", s.setCookie);
      return res;
    };
    if (playlistId) {
      const url = typeof body.url === "string" ? body.url : `https://open.spotify.com/playlist/${playlistId}`;
      if (body.check === true)
        return answer({ id: playlistId, url }, await verified(playlistId, { mode: "check" }));
      const check = await verified(playlistId, { mode: body.replace === true ? "replace" : "append" });
      // an update brings the title and description (with the set's score) up to date too; append ("Try again")
      // and calls without them leave the details alone
      const details =
        body.replace === true && (typeof body.name === "string" || typeof body.description === "string")
          ? await updatePlaylistDetails(s.access, playlistId, {
              name: typeof body.name === "string" ? body.name.trim() : undefined,
              description: typeof body.description === "string" ? body.description : undefined,
            })
          : false;
      return answer({ id: playlistId, url, details }, check);
    }
    const tandas = playlist?.tandas.length ?? 0;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : `TDJ · ${playlist?.name ?? "set"}`;
    const description =
      typeof body.description === "string"
        ? body.description
        : `${tandas} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist?.score?.total ?? "–"}/100.`;
    const pl = await createPlaylist(s.access, { name, description, isPublic: body.isPublic === true });
    const check = await verified(pl.id, { mode: "new", before: pl.snapshot });
    return answer({ id: pl.id, url: pl.url }, check);
  } catch (e) {
    const status = e instanceof SpotifyError ? (e.status === 401 ? 401 : e.status === 429 ? 429 : 502) : 500;
    // nothing proven: `added` is 0, never the count that was meant to go in
    return json({ error: (e as Error).message, added: 0, missing }, { status });
  }
}
