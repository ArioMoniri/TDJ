/**
 * QA fix 2026-11 ("the Analyse song in browser button doesn't always work"): the measure ladder — the DJ's file, the
 * clip through the app, the clip's direct link — and the one-line reason when nothing can be read.
 */
import { describe, expect, it } from "vitest";
import { MeasureError, measureAction, measureBytes, measureFailure, withTimeout } from "./measureSource";

const bytes = (n = 8) => new Uint8Array(n).buffer;
const res = (status: number, body: BodyInit | null = null, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : body, { status, headers });
const side = {
  id: "s1",
  resolved: { provider: "deezer", id: "123", previewUrl: "https://cdn.example/clip.mp3" },
};

describe("the measure ladder", () => {
  it("the DJ's own file first (no network at all)", async () => {
    const calls: string[] = [];
    const r = await measureBytes(side, {
      localFile: async () => ({ arrayBuffer: async () => bytes(3) }),
      fetch: async (u) => {
        calls.push(u);
        return res(500);
      },
    });
    expect(r.from).toBe("file");
    expect(r.bytes.byteLength).toBe(3);
    expect(calls).toEqual([]);
  });
  it("then the clip's bytes through the app (same origin: no CORS)", async () => {
    const calls: string[] = [];
    const r = await measureBytes(side, {
      localFile: async () => null,
      fetch: async (u) => {
        calls.push(u);
        return res(200, bytes(5));
      },
    });
    expect(r.from).toBe("clip");
    expect(calls[0]).toBe("/api/preview?provider=deezer&id=123&bytes=1");
  });
  it("the app's route missing: the provider's direct link (a CORS-blocked one is a network failure)", async () => {
    const calls: string[] = [];
    const ok = await measureBytes(side, {
      localFile: async () => null,
      fetch: async (u) => {
        calls.push(u);
        if (u.endsWith("bytes=1")) return res(500);
        if (u.endsWith("json=1")) return res(200, JSON.stringify({ url: "https://cdn.example/signed.mp3" }));
        return res(200, bytes(2));
      },
    });
    expect(ok.from).toBe("clip");
    expect(calls.at(-1)).toBe("https://cdn.example/signed.mp3");
    await expect(
      measureBytes(side, {
        localFile: async () => null,
        fetch: async (u) => {
          if (u.endsWith("bytes=1")) return res(500);
          if (u.endsWith("json=1"))
            return res(200, JSON.stringify({ url: "https://cdn.example/signed.mp3" }));
          throw new TypeError("Failed to fetch"); // the browser's CORS refusal
        },
      }),
    ).rejects.toMatchObject({ reason: "network" });
  });
  it("a clip that is gone says so (404), not “request failed (403)”", async () => {
    await expect(
      measureBytes(side, { localFile: async () => null, fetch: async () => res(404) }),
    ).rejects.toMatchObject({ reason: "gone" });
  });
  it("no clip at all: a Spotify-only side and a side with nothing are told apart", async () => {
    const none = { localFile: async () => null, fetch: async () => res(500) };
    await expect(measureBytes({ id: "x", spotify: { uri: "spotify:track:1" } }, none)).rejects.toMatchObject({
      reason: "spotify-only",
    });
    await expect(measureBytes({ id: "x" }, none)).rejects.toMatchObject({ reason: "no-source" });
  });
});

describe("the reasons and their actions", () => {
  it("maps errors to one reason each", () => {
    expect(measureFailure(new MeasureError("gone"))).toBe("gone");
    expect(measureFailure(new DOMException("Unable to decode audio data", "EncodingError"))).toBe("decode");
    expect(measureFailure(new TypeError("Failed to fetch"))).toBe("network");
  });
  it("each reason offers its action", () => {
    expect(measureAction("no-source")).toBe("find");
    expect(measureAction("gone")).toBe("find");
    expect(measureAction("spotify-only")).toBe("folder");
    expect(measureAction("timeout")).toBe("retry");
    expect(measureAction("decode")).toBeNull();
  });
  it("a slow measure times out with a reason", async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toMatchObject({ reason: "timeout" });
  });
});
