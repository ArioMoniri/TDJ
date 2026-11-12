import { describe, expect, it } from "vitest";
import { isSilentState, unlockAudio } from "./unlock";

/** round20-booth.md "can't hear": the steps that let a phone play the booth with the silent switch on. */
describe("unlockAudio (round 20)", () => {
  const fakeCtx = () => {
    const calls: string[] = [];
    return {
      calls,
      ctx: {
        state: "suspended",
        sampleRate: 48000,
        destination: {},
        resume: () => {
          calls.push("resume");
          return Promise.resolve();
        },
        createBuffer: (c: number, l: number, r: number) => {
          calls.push(`buffer ${c}x${l}@${r}`);
          return {} as AudioBuffer;
        },
        createBufferSource: () => ({
          buffer: null as AudioBuffer | null,
          connect: () => calls.push("connect"),
          start: (w?: number) => calls.push(`start ${w}`),
        }),
      },
    };
  };

  it("sets the iOS audio session to playback, resumes and primes the output synchronously", () => {
    const { ctx, calls } = fakeCtx();
    const nav = { audioSession: { type: "auto" } };
    const r = unlockAudio(ctx, nav);
    expect(nav.audioSession.type).toBe("playback");
    expect(r).toEqual({ session: "playback", resumed: true, primed: true });
    // all of it happened before this line: nothing waited on a promise
    expect(calls).toEqual(["resume", "buffer 1x1@48000", "connect", "start 0"]);
  });

  it("is a no-op where the APIs are missing, and never throws", () => {
    expect(unlockAudio({ resume: () => Promise.reject(new Error("x")) }, {})).toEqual({
      session: "unsupported",
      resumed: true,
      primed: false,
    });
    const bad = {
      resume: () => {
        throw new Error("x");
      },
    };
    expect(() => unlockAudio(bad, undefined)).not.toThrow();
  });

  it("suspended and interrupted contexts are silent", () => {
    expect(isSilentState("suspended")).toBe(true);
    expect(isSilentState("interrupted")).toBe(true);
    expect(isSilentState("running")).toBe(false);
  });
});
