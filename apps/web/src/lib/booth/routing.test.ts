import { describe, expect, it } from "vitest";
import { alignDelays, type RCtx, type RNode, RoomRouter } from "./routing";

/** A fake context that records the graph: "a → b[out:in]" */
function fakeCtx(maxChannelCount = 4) {
  const edges: string[] = [];
  let n = 0;
  const node = (name: string, extra: object = {}) => {
    const id = `${name}${++n}`;
    const self: RNode & { id: string } = {
      id,
      connect(to: unknown, o?: number, i?: number) {
        edges.push(`${id} → ${(to as { id: string }).id}${o !== undefined ? `[${o}:${i}]` : ""}`);
        return to;
      },
      disconnect() {
        for (let k = edges.length - 1; k >= 0; k--) if (edges[k]!.startsWith(`${id} →`)) edges.splice(k, 1);
      },
      ...extra,
    };
    return self;
  };
  const destination = {
    id: "dest",
    channelCount: 2,
    maxChannelCount,
    channelCountMode: "max",
    channelInterpretation: "speakers",
  };
  const ctx: RCtx & { edges: string[] } = {
    edges,
    destination,
    createGain: () => node("gain"),
    createChannelMerger: (c: number) => node(`merger${c}_`),
    createChannelSplitter: (c: number) => node(`split${c}_`),
    createDelay: () =>
      node("delay", { delayTime: { value: 0 } }) as unknown as ReturnType<RCtx["createDelay"]>,
    createMediaStreamDestination: () =>
      node("bridge", { stream: "stream" }) as unknown as RNode & { stream: unknown },
    createMediaStreamSource: () => node("src"),
    close: () => Promise.resolve(),
  };
  return ctx;
}

describe("RoomRouter (Part B §5: a DJ controller's channels, two speaker sets)", () => {
  it("plain stereo: the room straight to the destination, opened as 2 speakers", async () => {
    const ctx = fakeCtx(2);
    const r = new RoomRouter(ctx);
    const res = await r.apply({ roomPair: 0, cuePair: null, roomDelayMs: 0, mirror: null });
    expect(res).toEqual({ channels: 2, mapped: false, mirrored: false, limits: [] });
    expect(ctx.destination.channelInterpretation).toBe("speakers");
    expect(ctx.edges.some((e) => e.endsWith("→ dest"))).toBe(true);
    // a mono side still reaches both speakers: the input is a 2-channel "speakers" node
    expect(r.input).toMatchObject({
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
  });

  it("a 4-channel controller: room on ch 1–2, the pre-listen on ch 3–4, discrete", async () => {
    const ctx = fakeCtx(4);
    const r = new RoomRouter(ctx);
    const res = await r.apply({ roomPair: 0, cuePair: 1, roomDelayMs: 0, mirror: null });
    expect(res).toMatchObject({ channels: 4, mapped: true });
    expect(ctx.destination).toMatchObject({
      channelCount: 4,
      channelInterpretation: "discrete",
      channelCountMode: "explicit",
    });
    expect(ctx.edges.filter((e) => e.includes("merger4_") && e.includes("[")).length).toBe(4);
    const into = (pair: string) => ctx.edges.filter((e) => e.includes(pair));
    expect(into("[0:0]").length + into("[1:1]").length).toBe(2);
    expect(into("[0:2]").length + into("[1:3]").length).toBe(2);
    expect(ctx.edges.some((e) => /merger4_\d+ → dest/.test(e))).toBe(true);
  });

  it("asking for more channels than the device has keeps the room on 1–2 and says why", async () => {
    const ctx = fakeCtx(2);
    const r = new RoomRouter(ctx);
    const res = await r.apply({ roomPair: 0, cuePair: 1, roomDelayMs: 0, mirror: null });
    expect(res).toEqual({ channels: 2, mapped: false, mirrored: false, limits: ["channels"] });
  });

  it("re-applying replaces the graph (no doubled connections)", async () => {
    const ctx = fakeCtx(4);
    const r = new RoomRouter(ctx);
    await r.apply({ roomPair: 0, cuePair: 1, roomDelayMs: 0, mirror: null });
    await r.apply({ roomPair: 0, cuePair: null, roomDelayMs: 0, mirror: null });
    expect(ctx.edges.filter((e) => e.endsWith("→ dest")).length).toBe(1);
    expect(ctx.destination.channelCount).toBe(2);
  });

  it("a second speaker set: the room bridged into a second context on that device, each with its delay", async () => {
    const ctx = fakeCtx(2);
    const mirror = fakeCtx(2);
    const asked: string[] = [];
    const r = new RoomRouter(ctx, async (id) => {
      asked.push(id);
      return mirror;
    });
    const res = await r.apply({
      roomPair: 0,
      cuePair: null,
      roomDelayMs: 120,
      mirror: { sinkId: "pods", delayMs: 30 },
    });
    expect(res.mirrored).toBe(true);
    expect(asked).toEqual(["pods"]);
    expect(ctx.edges.some((e) => /^gain\d+ → bridge/.test(e))).toBe(true);
    expect(mirror.edges.some((e) => /^delay\d+ → dest/.test(e))).toBe(true);
    // the same mirror again: not reopened
    await r.apply({ roomPair: 0, cuePair: null, roomDelayMs: 0, mirror: { sinkId: "pods", delayMs: 60 } });
    expect(asked).toEqual(["pods"]);
  });

  it("a browser that can't open a second output says so", async () => {
    const r = new RoomRouter(fakeCtx(2), async () => null);
    const res = await r.apply({
      roomPair: 0,
      cuePair: null,
      roomDelayMs: 0,
      mirror: { sinkId: "x", delayMs: 0 },
    });
    expect(res).toMatchObject({ mirrored: false, limits: ["mirror"] });
  });
});

describe("alignDelays", () => {
  it("the faster output waits for the slower one, plus the DJ's trim", () => {
    expect(
      alignDelays([
        { id: "usb", latencyMs: 12 },
        { id: "bt", latencyMs: 200 },
      ]),
    ).toEqual({ usb: 188, bt: 0 });
    expect(
      alignDelays([
        { id: "a", latencyMs: 10, trimMs: 5 },
        { id: "b", latencyMs: 10 },
      ]),
    ).toEqual({ a: 5, b: 0 });
  });
});
