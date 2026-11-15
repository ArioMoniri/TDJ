import { type ActualItem, retryAfterOf, sleep, statusOf, type VerifyResult, verify } from "./exportVerify";

/**
 * The YouTube export proves itself like the Spotify one (lib/spotifyWrite.ts): the playlist is read back with the
 * DJ's own Google token, every page (`pageToken`), and compared video by video with what the export added
 * (lib/exportVerify.ts). Each video is checked for the DJ's country: private, deleted or rejected videos and
 * region restrictions (`contentDetails.regionRestriction`) make it unavailable, and it is swapped for another
 * result of the same search. Missing, extra and misplaced videos are put right in place, at most twice. A rate
 * error (403 rateLimitExceeded, 429) is retried with backoff; the daily quota ends the check with what was seen.
 */
export type YtCall = <T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<T>;

export interface YtExpected {
  videoId: string;
  /** the search that found it: asked again for a replacement */
  query: string;
}
export interface YtRow {
  itemId: string;
  videoId: string | null;
  title?: string;
  channel?: string;
}
export interface YtReplacement {
  at: number;
  from: string;
  to: string;
}
export interface YoutubeCheck extends VerifyResult {
  replaced: YtReplacement[];
  repairs: number;
  /** the playlist as the DJ's account holds it, row by row */
  rows: Array<{ videoId: string | null; title?: string; channel?: string; available?: boolean }>;
  /** the intended videos after replacements */
  videoIds: string[];
  error?: string;
  quota?: boolean;
}
export interface YtOpts {
  /** the DJ's country (ISO 3166-1 alpha-2) for region restrictions; omitted: not checked */
  region?: string;
  maxRepairs?: number;
  wait?: (ms: number) => Promise<void>;
  /** rate-error retries per request */
  maxRetries?: number;
  /** the daily quota is tried once more after a pause (default); false: it ends at once */
  retryQuota?: boolean;
}

const errText = (e: unknown) => `${(e as { body?: string })?.body ?? ""} ${(e as Error)?.message ?? ""}`;
export const isYtRateError = (e: unknown) =>
  statusOf(e) === 429 ||
  (statusOf(e) === 403 && /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(errText(e)));
export const isYtQuotaError = (e: unknown) =>
  statusOf(e) === 403 && /quotaExceeded|dailyLimitExceeded/i.test(errText(e));

/** One request; a rate error waits 1 s, 2 s, 4 s… (or its Retry-After) and tries again; the quota is tried once more. */
export function ytRetry(call: YtCall, o: YtOpts = {}): YtCall {
  const wait = o.wait ?? sleep;
  const max = o.maxRetries ?? 4;
  return (async (method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call(method, path, body);
      } catch (e) {
        const rate = isYtRateError(e);
        const quota = o.retryQuota !== false && isYtQuotaError(e);
        if ((!rate && !quota) || attempt >= (quota ? 1 : max)) throw e;
        await wait((retryAfterOf(e) ?? 2 ** attempt) * 1000);
      }
    }
  }) as YtCall;
}

interface RawItem {
  id: string;
  snippet?: { title?: string; videoOwnerChannelTitle?: string; resourceId?: { videoId?: string } };
  contentDetails?: { videoId?: string };
}
/** Every row of the playlist, page after page until there is no `nextPageToken`. */
export async function readYoutube(call: YtCall, playlistId: string): Promise<YtRow[]> {
  const out: YtRow[] = [];
  let token = "";
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ part: "snippet,contentDetails", maxResults: "50", playlistId });
    if (token) q.set("pageToken", token);
    const j = await call<{ items?: RawItem[]; nextPageToken?: string }>(
      "GET",
      `/youtube/v3/playlistItems?${q}`,
    );
    for (const x of j?.items ?? [])
      out.push({
        itemId: x.id,
        videoId: x.contentDetails?.videoId ?? x.snippet?.resourceId?.videoId ?? null,
        title: x.snippet?.title,
        channel: x.snippet?.videoOwnerChannelTitle,
      });
    token = j?.nextPageToken ?? "";
    if (!token) break;
  }
  return out;
}

interface RawVideo {
  id: string;
  status?: { privacyStatus?: string; uploadStatus?: string; embeddable?: boolean };
  contentDetails?: { regionRestriction?: { allowed?: string[]; blocked?: string[] } };
}
/** Whether each video plays for the DJ: a video YouTube does not return at all was deleted. */
export async function availability(
  call: YtCall,
  ids: string[],
  region?: string,
): Promise<Map<string, boolean>> {
  const uniq = [...new Set(ids)];
  const out = new Map<string, boolean>(uniq.map((id) => [id, false]));
  for (let i = 0; i < uniq.length; i += 50) {
    const q = new URLSearchParams({ part: "status,contentDetails", id: uniq.slice(i, i + 50).join(",") });
    const j = await call<{ items?: RawVideo[] }>("GET", `/youtube/v3/videos?${q}`);
    for (const v of j?.items ?? []) {
      const st = v.status ?? {};
      const rr = v.contentDetails?.regionRestriction;
      const blocked =
        !!region && (!!rr?.blocked?.includes(region) || (!!rr?.allowed && !rr.allowed.includes(region)));
      const gone = st.privacyStatus === "private" || /deleted|rejected|failed/.test(st.uploadStatus ?? "");
      out.set(v.id, !blocked && !gone);
    }
  }
  return out;
}

/**
 * Reads the playlist back and puts it right (see the file comment). Never throws for YouTube's answers: a read
 * or a fix it could not finish comes back with `error` (and `quota` when the daily quota ran out).
 */
export async function verifyYoutube(
  rawCall: YtCall,
  playlistId: string,
  expectedIn: YtExpected[],
  o: YtOpts = {},
): Promise<YoutubeCheck> {
  const call = ytRetry(rawCall, o);
  const expected = expectedIn.map((x) => ({ ...x }));
  const replaced: YtReplacement[] = [];
  let rows: YtRow[] = [];
  let avail = new Map<string, boolean>();
  let result: VerifyResult | null = null;
  let repairs = 0;
  let error: string | undefined;
  let quota = false;
  const check = async () => {
    rows = await readYoutube(call, playlistId);
    avail = await availability(
      call,
      rows.flatMap((r) => (r.videoId ? [r.videoId] : [])),
      o.region,
    );
    result = verify(
      expected.map((x) => x.videoId),
      rows.map((r): ActualItem => ({ key: r.videoId, available: r.videoId ? avail.get(r.videoId) : false })),
    );
    return result;
  };
  /** another result of the same search that plays here, for each unavailable intended video */
  const replace = async (r: VerifyResult) => {
    let changed = false;
    for (const u of r.unavailable) {
      const want = expected[u.at]!;
      const s = await call<{ items?: Array<{ id?: { videoId?: string } }> }>(
        "GET",
        `/youtube/v3/search?${new URLSearchParams({ part: "snippet", type: "video", maxResults: "5", q: want.query })}`,
      );
      const ids = (s?.items ?? []).flatMap((x) =>
        x.id?.videoId && x.id.videoId !== want.videoId ? [x.id.videoId] : [],
      );
      const ok = await availability(call, ids, o.region);
      const to = ids.find((id) => ok.get(id));
      if (to) {
        replaced.push({ at: u.at, from: want.videoId, to });
        want.videoId = to;
        changed = true;
      }
    }
    return changed;
  };
  /** every intended video into its own position (moved when it is there, inserted when not), then the rest removed */
  const repair = async () => {
    const model = rows.map((r) => ({ ...r }));
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!.videoId;
      if (model[i]?.videoId === want) continue;
      const j = model.findIndex((m, k) => k > i && m.videoId === want);
      if (j >= 0) {
        const item = model[j]!;
        await call("PUT", "/youtube/v3/playlistItems?part=snippet", {
          id: item.itemId,
          snippet: { playlistId, position: i, resourceId: { kind: "youtube#video", videoId: want } },
        });
        model.splice(j, 1);
        model.splice(i, 0, item);
      } else {
        const made = await call<{ id?: string }>("POST", "/youtube/v3/playlistItems?part=snippet", {
          snippet: { playlistId, position: i, resourceId: { kind: "youtube#video", videoId: want } },
        });
        model.splice(i, 0, { itemId: made?.id ?? "", videoId: want });
      }
    }
    for (const extra of model.slice(expected.length))
      if (extra.itemId)
        await call("DELETE", `/youtube/v3/playlistItems?${new URLSearchParams({ id: extra.itemId })}`);
  };
  try {
    let r = await check();
    if (r.unavailable.length && (await replace(r))) r = { ...r, ok: false };
    while (!r.ok && repairs < (o.maxRepairs ?? 2)) {
      repairs++;
      await repair();
      r = await check();
    }
  } catch (e) {
    error = (e as Error)?.message ?? String(e);
    quota = isYtQuotaError(e);
  }
  const r: VerifyResult =
    result ??
    verify(
      expected.map((x) => x.videoId),
      [],
    );
  return {
    ...r,
    replaced,
    repairs,
    rows: rows.map((x) => ({
      videoId: x.videoId,
      title: x.title,
      channel: x.channel,
      available: x.videoId ? avail.get(x.videoId) : false,
    })),
    videoIds: expected.map((x) => x.videoId),
    ...(error ? { error } : {}),
    ...(quota ? { quota } : {}),
  };
}
