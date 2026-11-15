import { describe, expect, it } from "vitest";
import { verifyYoutube, type YtCall } from "./youtubeVerify";

class FakeErr extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`${status} ${body}`);
    this.status = status;
    this.body = body;
  }
}
/** A fake YouTube Data API: one playlist, pages of ≤ 50, insert/update with position, delete, videos, search. */
function fakeYoutube(items: string[]) {
  let n = 0;
  const f = {
    items: items.map((videoId) => ({ id: `it${n++}`, videoId })),
    /** video id → why it does not play ("private", "deleted", or a blocked region) */
    bad: new Map<string, "private" | "deleted" | { blocked: string[] }>(),
    search: new Map<string, string[]>(),
    /** calls answered 403 rateLimitExceeded once each (1-based, over all calls) */
    rateLimit: new Set<number>(),
    log: [] as string[],
  };
  let calls = 0;
  const call = (async (method: string, path: string, body?: unknown) => {
    calls++;
    f.log.push(`${method} ${path.split("?")[0]}`);
    if (f.rateLimit.has(calls)) {
      f.rateLimit.delete(calls);
      throw new FakeErr(403, '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}');
    }
    const u = new URL(path, "https://yt.test");
    const b = body as { id?: string; snippet?: { position?: number; resourceId?: { videoId: string } } };
    if (u.pathname === "/youtube/v3/playlistItems") {
      if (method === "GET") {
        const start = Number(u.searchParams.get("pageToken") || 0);
        const page = f.items.slice(start, start + 50);
        return {
          items: page.map((x) => ({
            id: x.id,
            snippet: {
              title: `T ${x.videoId}`,
              videoOwnerChannelTitle: "Ch",
              resourceId: { videoId: x.videoId },
            },
            contentDetails: { videoId: x.videoId },
          })),
          ...(start + 50 < f.items.length ? { nextPageToken: String(start + 50) } : {}),
        };
      }
      if (method === "POST") {
        const it = { id: `it${n++}`, videoId: b.snippet!.resourceId!.videoId };
        f.items.splice(b.snippet?.position ?? f.items.length, 0, it);
        return { id: it.id };
      }
      if (method === "PUT") {
        const k = f.items.findIndex((x) => x.id === b.id);
        const [it] = f.items.splice(k, 1);
        f.items.splice(b.snippet!.position!, 0, it!);
        return {};
      }
      if (method === "DELETE") {
        f.items = f.items.filter((x) => x.id !== u.searchParams.get("id"));
        return undefined;
      }
    }
    if (u.pathname === "/youtube/v3/videos") {
      const ids = (u.searchParams.get("id") ?? "").split(",");
      if (ids.length > 50) throw new FakeErr(400, "too many");
      return {
        items: ids
          .filter((id) => f.bad.get(id) !== "deleted")
          .map((id) => {
            const why = f.bad.get(id);
            return {
              id,
              status: { privacyStatus: why === "private" ? "private" : "public", uploadStatus: "processed" },
              contentDetails: typeof why === "object" ? { regionRestriction: why } : {},
            };
          }),
      };
    }
    if (u.pathname === "/youtube/v3/search")
      return {
        items: (f.search.get(u.searchParams.get("q") ?? "") ?? []).map((videoId) => ({ id: { videoId } })),
      };
    throw new FakeErr(404, "no route");
  }) as YtCall;
  return { f, call };
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
const want = (xs: string[]) => xs.map((videoId) => ({ videoId, query: `q ${videoId}` }));
const o = { wait: async () => {}, region: "TR" };

describe("verifyYoutube (YouTube read-back)", () => {
  it("reads every page (118 rows over 3 pages of 50) and finds a lost row at position 105", async () => {
    const all = ids(118);
    const { f, call } = fakeYoutube(all.filter((_, i) => i !== 105));
    const r = await verifyYoutube(call, "pl", want(all), { ...o, maxRepairs: 0 });
    expect(f.log.filter((l) => l === "GET /youtube/v3/playlistItems")).toHaveLength(3);
    expect(r.actual).toBe(117);
    expect(r.missing.map((m) => m.at)).toEqual([105]);
  });
  it("puts a missing, an extra and a swapped pair right, in place, and reads back 118 of 118", async () => {
    const all = ids(118);
    const held = all.filter((_, i) => i !== 40);
    [held[10], held[11]] = [held[11]!, held[10]!];
    held.push("stray");
    const { f, call } = fakeYoutube(held);
    const r = await verifyYoutube(call, "pl", want(all), o);
    expect(r.ok).toBe(true);
    expect(r.repairs).toBe(1);
    expect(f.items.map((x) => x.videoId)).toEqual(all);
  });
  it("the same cortina twice stays twice", async () => {
    const all = ["a", "cue", "b", "cue"];
    const { f, call } = fakeYoutube(all);
    const r = await verifyYoutube(call, "pl", want(all), o);
    expect(r.ok && r.actual === 4).toBe(true);
    expect(f.items).toHaveLength(4);
  });
  it("private, deleted and region-blocked videos are replaced from the same search, in their own row", async () => {
    const all = ids(6);
    const { f, call } = fakeYoutube(all);
    f.bad.set("v1", "private");
    f.bad.set("v3", "deleted");
    f.bad.set("v4", { blocked: ["TR", "DE"] });
    f.bad.set("alt4a", { blocked: ["TR"] });
    f.search.set("q v1", ["v1", "alt1"]);
    f.search.set("q v3", ["alt3"]);
    f.search.set("q v4", ["alt4a", "alt4b"]);
    const r = await verifyYoutube(call, "pl", want(all), o);
    expect(r.replaced).toEqual([
      { at: 1, from: "v1", to: "alt1" },
      { at: 3, from: "v3", to: "alt3" },
      { at: 4, from: "v4", to: "alt4b" },
    ]);
    expect(f.items.map((x) => x.videoId)).toEqual(["v0", "alt1", "v2", "alt3", "alt4b", "v5"]);
    expect(r.ok).toBe(true);
    expect(r.unavailable).toEqual([]);
    expect(r.rows.every((x) => x.available)).toBe(true);
  });
  it("a video with no playable alternative stays and is listed as not available", async () => {
    const { f, call } = fakeYoutube(["a", "b"]);
    f.bad.set("b", { blocked: ["TR"] });
    const r = await verifyYoutube(call, "pl", want(["a", "b"]), o);
    expect(r.ok).toBe(true);
    expect(r.unavailable.map((u) => u.at)).toEqual([1]);
  });
  it("a 403 rateLimitExceeded is retried with backoff", async () => {
    const { f, call } = fakeYoutube(ids(3));
    f.rateLimit.add(1);
    const waited: number[] = [];
    const r = await verifyYoutube(call, "pl", want(ids(3)), {
      ...o,
      wait: async (ms) => void waited.push(ms),
    });
    expect(waited).toEqual([1000]);
    expect(r.ok).toBe(true);
  });
});
