import { describe, expect, it } from "vitest";
import {
  type AuditionIO,
  type AuditionRow,
  clampLead,
  encodeWav,
  hearingAt,
  planAudition,
  runAuditionSteps,
  sideSpan,
  spotifyAuditionSteps,
} from "./audition";

describe("the audition's WAV", () => {
  it("is a 16-bit PCM RIFF with the buffer's rate, channels and samples", async () => {
    const ch = [new Float32Array([0, 0.5, -1, 2]), new Float32Array([0, -0.5, 1, -2])];
    const blob = encodeWav({
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 4,
      getChannelData: (c) => ch[c]!,
    });
    expect(blob.type).toBe("audio/wav");
    const v = new DataView(await blob.arrayBuffer());
    const s = (o: number, n: number) => String.fromCharCode(...new Uint8Array(v.buffer, o, n));
    expect(s(0, 4)).toBe("RIFF");
    expect(s(8, 4)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(40, true)).toBe(4 * 2 * 2);
    // interleaved, clipped to ±1
    expect(v.getInt16(44 + 2 * 2, true)).toBe(Math.round(0.5 * 0x7fff - 0.5) + 0);
    expect(v.getInt16(44 + 6 * 2, true)).toBe(0x7fff);
    expect(v.getInt16(44 + 7 * 2, true)).toBe(-0x8000);
  });
});

const song = (o: Partial<AuditionRow> = {}): AuditionRow => ({
  kind: "track",
  lengthSec: 180,
  tanda: 1,
  ...o,
});
const base = {
  edit: null,
  nightGapSec: 2.5,
  songFadeOutSec: 0,
  cortinaFadeOutSec: 4,
  silenceMode: "gap" as const,
  leadSec: 8,
  media: {
    out: { kind: "recording" as const, durationSec: 180 },
    in: { kind: "recording" as const, durationSec: 200 },
  },
};

describe("the audition schedule: the last N seconds of the outgoing into the incoming, as the night plays it", () => {
  it("a file into a file at the night's gap: A from (its end − N), B from its start after the gap", () => {
    const s = planAudition({ ...base, a: song(), b: song({ lengthSec: 200 }) });
    expect(s.axisFrom).toBe(-8);
    expect(s.out).toEqual({ srcFrom: 172, durSec: 8 });
    expect(s.gapSec).toBe(2.5);
    expect(s.in.at).toBe(10.5);
    expect(s.in.srcFrom).toBe(0);
    expect(s.totalSec).toBe(18.5);
    expect(hearingAt(s, 1)).toBe("out");
    expect(hearingAt(s, 9)).toBe("gap");
    expect(hearingAt(s, 12)).toBe("in");
    expect(hearingAt(s, 19)).toBe("end");
  });
  it("N is the DJ's: 5–15 s", () => {
    expect(planAudition({ ...base, leadSec: 5, a: song(), b: song() }).out.srcFrom).toBe(175);
    expect(planAudition({ ...base, leadSec: 15, a: song(), b: song() }).out.srcFrom).toBe(165);
    expect(clampLead(30)).toBe(15);
    expect(clampLead(2)).toBe(5);
    expect(clampLead(Number.NaN)).toBe(8);
  });
  it("start points: a cued outgoing ends at its stop second; a cortina starts at its own start", () => {
    const s = planAudition({
      ...base,
      a: song({ cued: true, trimInSec: 10, stopSec: 150, lengthSec: 140 }),
      b: { kind: "cortina", lengthSec: 45, tanda: 1, trimInSec: 40, stopSec: 85, fadeOutSec: 4 },
    });
    expect(s.out.srcFrom).toBe(142);
    expect(s.in.srcFrom).toBe(40);
  });
  it("silence: a silent tail longer than the gap is cut (gap mode) and the incoming follows at once", () => {
    const s = planAudition({ ...base, a: song({ tailSilenceSec: 4 }), b: song() });
    expect(s.tailCutSec).toBe(1.5);
    expect(s.out.srcFrom).toBe(170.5);
    expect(s.gapSec).toBe(0);
    expect(s.in.at).toBe(8);
    // "off" (a template's own silence mode): nothing cut, the whole gap after the silent tail
    const off = planAudition({
      ...base,
      edit: { preset: "gap", gapSec: 2.5, silence: "off" },
      a: song({ tailSilenceSec: 4 }),
      b: song(),
    });
    expect(off.out.srcFrom).toBe(172);
    expect(off.in.at).toBe(10.5);
  });
  it("a fade: both silences cut whole, the fades on the audition's clock", () => {
    const s = planAudition({
      ...base,
      edit: { preset: "fade", fadeOutSec: 3, fadeInSec: 2, gapSec: 1 },
      a: song({ tailSilenceSec: 1 }),
      b: song({ headSilenceSec: 0.5 }),
    });
    expect(s.out.srcFrom).toBe(171);
    expect(s.in.srcFrom).toBe(0.5);
    expect(s.fadeOut).toEqual({ at: 5, len: 3, curve: "sCurve" });
    expect(s.in.at).toBe(9);
    expect(s.fadeIn).toEqual({ at: 9, len: 2, curve: "sCurve" });
  });
  it("a blend overlaps; a longer overlap than N starts the audition earlier; Spotify plays it as Auto", () => {
    const s = planAudition({ ...base, edit: { preset: "blend", overlapSec: 6 }, a: song(), b: song() });
    expect(s.axisFrom).toBe(-8);
    expect(s.in.at).toBe(2);
    expect(s.gapSec).toBe(0);
    expect(hearingAt(s, 3)).toBe("both");
    const long = planAudition({
      ...base,
      leadSec: 5,
      edit: { preset: "blend", overlapSec: 10 },
      a: song(),
      b: song(),
    });
    expect(long.axisFrom).toBe(-10);
    const sp = planAudition({
      ...base,
      external: true,
      edit: { preset: "blend", overlapSec: 6 },
      a: song(),
      b: song(),
    });
    expect(sp.overlapDropped).toBe(true);
    expect(sp.tr).toBeNull();
    expect(sp.in.at).toBe(10.5);
  });
  it("30 s clips: the outgoing clip's last N seconds into the incoming clip's start (not the real ending)", () => {
    const s = planAudition({
      ...base,
      a: song({ tailSilenceSec: 3 }),
      b: song(),
      media: { out: { kind: "clip", durationSec: 30 }, in: { kind: "clip", durationSec: 30 } },
    });
    expect(s.out.srcFrom).toBe(22);
    expect(s.in.srcFrom).toBe(0);
    expect(s.tailCutSec).toBe(0);
    expect(sideSpan(song(), { kind: "clip", durationSec: 30 })).toEqual({ srcStart: 0, srcEnd: 30 });
  });
});

describe("the Spotify audition's steps", () => {
  const fade = planAudition({
    ...base,
    edit: { preset: "fade", fadeOutSec: 3, fadeInSec: 2, gapSec: 1 },
    a: song(),
    b: song(),
    external: true,
  });
  it("SDK: seek the outgoing to (its end − N), fade it in volume steps, then play the incoming from its start", () => {
    const st = spotifyAuditionSteps(fade, {
      uriOut: "spotify:track:A",
      uriIn: "spotify:track:B",
      fades: true,
    });
    expect(st.slice(0, 3)).toEqual([
      { at: 0, op: "volume", level: 1 },
      { at: 0, op: "play", uri: "spotify:track:A", positionMs: 172000, side: "out" },
      { at: 0, op: "seek", positionMs: 172000 },
    ]);
    const out = st.filter((x) => x.op === "volume" && x.at > 0 && x.at <= 8);
    expect(out.length).toBeGreaterThan(50);
    expect(out[0]!.at).toBeGreaterThan(5);
    const levels = out.map((x) => (x.op === "volume" ? x.level : -1));
    expect(levels.at(-1)).toBe(0);
    expect([...levels].sort((p, q) => q - p)).toEqual(levels);
    const playB = st.findIndex((x) => x.op === "play" && x.side === "in");
    expect(st[playB]).toEqual({ at: 9, op: "play", uri: "spotify:track:B", positionMs: 0, side: "in" });
    expect(st.find((x) => x.op === "pause")!.at).toBe(8);
    // the rise: volume 0 at B's start, then up to 1 within 2 s
    const rise = st.filter((x) => x.op === "volume" && x.at >= 9 && x.at <= 11);
    expect(rise[0]).toEqual({ at: 9, op: "volume", level: 0 });
    expect(rise.at(-1)).toMatchObject({ level: 1 });
    expect(st.at(-2)).toEqual({ at: fade.totalSec, op: "pause" });
    expect(st.at(-1)).toEqual({ at: fade.totalSec, op: "volume", level: 1 });
  });
  it("Connect: the same plays and the gap, no volume steps (the device cannot fade)", () => {
    const st = spotifyAuditionSteps(fade, {
      uriOut: "spotify:track:A",
      uriIn: "spotify:track:B",
      fades: false,
    });
    expect(st.some((x) => x.op === "volume")).toBe(false);
    expect(st.map((x) => `${x.op}@${x.at}`)).toEqual([
      "play@0",
      "seek@0",
      "pause@8",
      "play@9",
      `pause@${fade.totalSec}`,
    ]);
  });
  it("runs in time: seek(A, len − N) first, then B's play at the gap; Stop pauses and restores the volume", async () => {
    let clock = 1000;
    const calls: string[] = [];
    const io: AuditionIO = {
      play: async (uri, ms) => void calls.push(`${clock - 1000} play ${uri} ${ms}`),
      seek: async (ms) => void calls.push(`${clock - 1000} seek ${ms}`),
      volume: (v) => void calls.push(`${clock - 1000} vol ${v}`),
      pause: async () => void calls.push(`${clock - 1000} pause`),
    };
    const steps = spotifyAuditionSteps(fade, { uriOut: "A", uriIn: "B", fades: false });
    let started = -1;
    const r = await runAuditionSteps(steps, io, {
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
      onStart: (t0) => {
        started = t0;
      },
    });
    expect(r).toBe("done");
    expect(started).toBe(1000);
    expect(calls).toEqual([
      "0 play A 172000",
      "0 seek 172000",
      "8000 pause",
      "9000 play B 0",
      `${Math.round(fade.totalSec * 1000)} pause`,
    ]);
    // Stop half way
    calls.length = 0;
    clock = 1000;
    const ac = new AbortController();
    const r2 = await runAuditionSteps(steps, io, {
      signal: ac.signal,
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
        if (clock - 1000 >= 8000) ac.abort();
      },
    });
    expect(r2).toBe("stopped");
    expect(calls.some((c) => c.includes("play B"))).toBe(false);
    expect(calls.at(-2)).toMatch(/pause$/);
    expect(calls.at(-1)).toMatch(/vol 1$/);
  });
});
