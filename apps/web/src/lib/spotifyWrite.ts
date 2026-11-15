import { type ActualItem, retryAfterOf, sleep, statusOf, type VerifyResult, verify } from "./exportVerify";

/**
 * Writing a Spotify playlist and proving it: the chunks go one after the other (PUT the first 100, POST the rest
 * in order, a short pause between), a 429 waits out its Retry-After and the chunk is sent again, then the whole
 * playlist is read back page by page with the listener's market and compared position by position
 * (lib/exportVerify.ts). A row the listener's country cannot play is swapped for a playable version in the same
 * row (Spotify's relinked track, else a fresh search). Anything still wrong is rewritten, at most twice, and what
 * is left is reported, never hidden. Shared by the hosted route (server) and the BYO path (browser).
 */

/** One Spotify Web API call with a token: throws errors carrying `status` (ApiError) or `retryAfter` (429). */
export type SpotifyCall = <T = unknown>(
  method: "GET" | "PUT" | "POST",
  path: string,
  body?: unknown,
) => Promise<T>;

export const CHUNK = 100;
export interface WriteOpts {
  /** pause between two chunks, ms */
  gapMs?: number;
  /** 429s waited out per request before it gives up */
  maxRetries?: number;
  /** repair rounds after the first write */
  maxRepairs?: number;
  /** epoch ms: a Retry-After that would end past it is not waited out (the request reports it instead) */
  deadline?: number;
  wait?: (ms: number) => Promise<void>;
}

export interface TrackInfo {
  uri: string | null;
  playable?: boolean;
  linkedFrom?: string;
  name?: string;
  artist?: string;
  /** a local file in the DJ's Spotify: never playable from the playlist on another device */
  local?: boolean;
}
interface RawTrack {
  uri?: string;
  name?: string;
  is_playable?: boolean;
  is_local?: boolean;
  artists?: Array<{ name?: string }>;
  linked_from?: { uri?: string };
}
const info = (t: RawTrack | null | undefined, local?: boolean): TrackInfo => ({
  uri: t?.uri ?? null,
  ...(t?.name ? { name: t.name } : {}),
  ...(t?.artists?.length
    ? {
        artist: t.artists
          .map((a) => a.name ?? "")
          .filter(Boolean)
          .join(", "),
      }
    : {}),
  ...(local || t?.is_local ? { local: true } : {}),
  ...(typeof t?.is_playable === "boolean" ? { playable: t.is_playable } : {}),
  ...(t?.linked_from?.uri && t.linked_from.uri !== t.uri ? { linkedFrom: t.linked_from.uri } : {}),
});

/** A row swapped for a version the listener's country can play. */
export interface Replacement {
  at: number;
  from: string;
  to: string;
  how: "relinked" | "search";
}
export interface PlaylistCheck extends VerifyResult {
  /** Spotify's snapshot_id moved with the write (null: Spotify did not say) */
  snapshotChanged: boolean | null;
  /** rewrite rounds after the first write */
  repairs: number;
  replaced: Replacement[];
  /** the intended list, after any replacement: what the playlist should hold */
  uris: string[];
  /** the playlist as the DJ's account holds it after the last read, row by row (the sheet lists it) */
  rows: TrackInfo[];
  /** set when Spotify stopped the write or the read (a long rate limit, an error): the check is what was seen */
  error?: string;
  retryAfter?: number;
}

/** A writer bound to one token: remembers whether the playlist endpoints answer under `/items` or the older `/tracks`. */
export function spotifyWriter(call: SpotifyCall, o: WriteOpts = {}) {
  const wait = o.wait ?? sleep;
  const gapMs = o.gapMs ?? 250;
  const maxRetries = o.maxRetries ?? 4;
  let legacy = false;

  /** one request, a 429 waited out (Retry-After) up to `maxRetries` times; a 5xx tried twice more */
  const send = async <T>(method: "GET" | "PUT" | "POST", path: string, body?: unknown): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call<T>(method, path, body);
      } catch (e) {
        const ra = retryAfterOf(e);
        const st = statusOf(e);
        const ms = ra !== null ? ra * 1000 : st !== null && st >= 500 ? 1000 * (attempt + 1) : null;
        const crosses = o.deadline !== undefined && ms !== null && Date.now() + ms > o.deadline;
        if (ms === null || crosses || attempt >= (ra !== null ? maxRetries : 2)) throw e;
        await wait(ms);
      }
    }
  };
  /** the playlist's rows: `/items` (2026 API), `/tracks` only when `/items` does not exist (never on a 429) */
  const rows = async <T>(method: "GET" | "PUT" | "POST", id: string, query = "", body?: unknown) => {
    if (!legacy)
      try {
        return await send<T>(method, `/playlists/${id}/items${query}`, body);
      } catch (e) {
        const st = statusOf(e);
        if (st !== 404 && st !== 405 && st !== 410) throw e;
        legacy = true;
      }
    return send<T>(method, `/playlists/${id}/tracks${query}`, body);
  };

  /** Writes `uris` in order: `replace` PUTs the first chunk (clearing the playlist), every other chunk is POSTed. */
  const write = async (id: string, uris: string[], mode: "replace" | "append", from = 0) => {
    let snapshot: string | undefined;
    for (let i = from, n = 0; i < uris.length || (mode === "replace" && n === 0); i += CHUNK, n++) {
      if (n > 0) await wait(gapMs);
      const chunk = uris.slice(i, i + CHUNK);
      const put = mode === "replace" && n === 0;
      const r = await rows<{ snapshot_id?: string } | undefined>(put ? "PUT" : "POST", id, "", {
        uris: chunk,
      });
      snapshot = r?.snapshot_id ?? snapshot;
      if (!uris.length) break;
    }
    return snapshot;
  };

  /**
   * Every row of the playlist as the DJ's own account sees it (their token, never a public view), page after page
   * until Spotify's `next` is null; with `market` each row says whether the listener can play it.
   */
  const read = async (id: string, market?: string): Promise<TrackInfo[]> => {
    const out: TrackInfo[] = [];
    const t = "uri,name,is_playable,is_local,artists(name),linked_from(uri)";
    const fields = encodeURIComponent(`items(is_local,track(${t}),item(${t})),next,total`);
    for (let offset = 0, page = 0; page < 200; page++) {
      const q = `?limit=${CHUNK}&offset=${offset}${market ? `&market=${market}` : ""}&fields=${fields}`;
      const j = await rows<{
        items?: Array<{ is_local?: boolean; track?: RawTrack | null; item?: RawTrack | null }>;
        next?: string | null;
      }>("GET", id, q);
      const items = j?.items ?? [];
      for (const x of items) out.push(info(x.track ?? x.item, x.is_local));
      offset += items.length;
      if (!items.length || !j?.next) break;
    }
    return out;
  };

  const snapshotOf = async (id: string): Promise<string | null> => {
    try {
      const j = await send<{ snapshot_id?: string }>("GET", `/playlists/${id}?fields=snapshot_id`);
      return j?.snapshot_id ?? null;
    } catch {
      return null;
    }
  };

  /** The tracks as the listener's market sees them (≤ 50 per call); null when Spotify does not offer the lookup. */
  const lookup = async (uris: string[], market: string): Promise<Map<string, TrackInfo> | null> => {
    const ids = [...new Set(uris.map((u) => /^spotify:track:([A-Za-z0-9]+)$/.exec(u)?.[1]).filter(Boolean))];
    const out = new Map<string, TrackInfo>();
    try {
      for (let i = 0; i < ids.length; i += 50) {
        const j = await send<{ tracks?: Array<RawTrack | null> }>(
          "GET",
          `/tracks?ids=${ids.slice(i, i + 50).join(",")}&market=${market}`,
        );
        (j?.tracks ?? []).forEach((t, k) => {
          out.set(`spotify:track:${ids[i + k]}`, info(t));
        });
      }
      return out;
    } catch (e) {
      if (retryAfterOf(e) !== null) throw e;
      return null;
    }
  };

  return { send, rows, write, read, snapshotOf, lookup };
}

export interface VerifiedWrite {
  /**
   * `replace`: the playlist becomes `uris`; `append`: `uris` go after what it holds; `new`: a playlist just made;
   * `check`: nothing is written, the playlist is only read and compared (the sheet's "Check playlist")
   */
  mode: "replace" | "append" | "new" | "check";
  /** the snapshot before the write (`new`: the one the create answered), for the "did it change" check */
  before?: string | null;
  /** the listener's market for playability (`from_token`): omitted, playability is not checked */
  market?: string;
  /**
   * A playable version for row `at` (same recording for a song, same song and artist for a cortina), searched in
   * the listener's market; null when there is none. Omitted: an unplayable row is only reported.
   */
  findPlayable?: (at: number, uri: string) => Promise<string | null>;
}

const actualOf = (t: TrackInfo): ActualItem => ({
  key: t.uri,
  available: t.local ? false : t.playable,
  linkedFrom: t.linkedFrom,
});

/**
 * Writes the playlist and proves it (see the file comment). Never throws for Spotify's answers: a write or read it
 * could not finish comes back as a check with `error` (and `retryAfter` for a pause), with what could be seen.
 */
export async function writeVerified(
  call: SpotifyCall,
  playlistId: string,
  urisIn: string[],
  w: VerifiedWrite,
  o: WriteOpts = {},
): Promise<PlaylistCheck> {
  const sp = spotifyWriter(call, o);
  const maxRepairs = w.mode === "check" ? 0 : (o.maxRepairs ?? 2);
  const replaced: Replacement[] = [];
  const uris = [...urisIn];
  let error: string | undefined;
  let retryAfter: number | undefined;
  const fail = (e: unknown) => {
    error = (e as Error)?.message ?? String(e);
    const ra = retryAfterOf(e);
    if (ra !== null) retryAfter = ra;
  };
  const writes = w.mode !== "check";
  const before = !writes
    ? null
    : w.mode === "new"
      ? (w.before ?? null)
      : (w.before ?? (await sp.snapshotOf(playlistId)));
  // `append` is checked against what the playlist held before plus the new rows
  let prior: string[] = [];
  try {
    if (w.mode === "append") prior = (await sp.read(playlistId)).map((t) => t.uri ?? "");
  } catch (e) {
    fail(e);
  }

  /** swaps the rows the listener cannot play, from what Spotify said about each one; true when the list changed */
  const swap = async (seen: Array<TrackInfo | undefined>) => {
    let changed = false;
    for (let at = 0; at < uris.length; at++) {
      const t = seen[at];
      const uri = uris[at]!;
      if (!t || t.local) continue;
      if (t.linkedFrom === uri && t.uri && t.uri !== uri && t.playable !== false) {
        // relinked: Spotify itself offers the version this market plays
        replaced.push({ at, from: uri, to: t.uri, how: "relinked" });
        uris[at] = t.uri;
        changed = true;
      } else if (t.playable === false && (t.uri === uri || t.linkedFrom === uri) && w.findPlayable) {
        const to = await w.findPlayable(at, uri).catch((e) => {
          if (retryAfterOf(e) !== null) throw e;
          return null;
        });
        if (to && to !== uri) {
          replaced.push({ at, from: uri, to, how: "search" });
          uris[at] = to;
          changed = true;
        }
      }
    }
    return changed;
  };

  // before writing: the rows the listener's country cannot play get their playable version
  if (writes && w.market && !error)
    try {
      const known = await sp.lookup(uris, w.market);
      if (known) await swap(uris.map((u) => known.get(u)));
    } catch (e) {
      fail(e);
    }

  const offset = w.mode === "append" ? prior.length : 0;
  const expected = () => [...prior.slice(0, offset), ...uris];
  let seen: TrackInfo[] = [];
  let result: VerifyResult | null = null;
  const check = async () => {
    seen = await sp.read(playlistId, w.market);
    result = verify(expected(), seen.map(actualOf));
    return result;
  };
  let repairs = 0;
  try {
    if (writes && !error) {
      if (w.mode === "replace") await sp.write(playlistId, uris, "replace");
      else if (uris.length) await sp.write(playlistId, uris, "append");
    }
  } catch (e) {
    fail(e);
  }
  try {
    if (retryAfter === undefined) {
      let r = await check();
      // after the write: the playlist read says what plays here, also when the track lookup is not offered
      if (writes && w.market && (await swap(seen.slice(offset)))) r = { ...r, ok: false };
      while (!r.ok && repairs < maxRepairs && retryAfter === undefined) {
        repairs++;
        error = undefined;
        await repair(sp, playlistId, expected(), seen);
        r = await check();
      }
    }
  } catch (e) {
    fail(e);
  }
  const after = writes ? await sp.snapshotOf(playlistId) : null;
  const r: VerifyResult = result ?? verify(expected(), []);
  return {
    ...r,
    snapshotChanged: before && after ? before !== after : null,
    repairs,
    replaced,
    uris: [...uris],
    rows: seen,
    ...(error ? { error } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };
}

/**
 * Puts the playlist right: when what it holds is a correct start of the list, only the rest is appended; otherwise
 * the whole list is written again in order (PUT the first 100, POST the others).
 */
async function repair(
  sp: ReturnType<typeof spotifyWriter>,
  id: string,
  expected: string[],
  seen: TrackInfo[],
) {
  const prefix =
    seen.length > 0 &&
    seen.length < expected.length &&
    seen.every((t, i) => t.uri === expected[i] || t.linkedFrom === expected[i]);
  if (prefix) await sp.write(id, expected, "append", seen.length);
  else await sp.write(id, expected, "replace");
}
