import { describe, expect, it } from "vitest";
import { isSilentState, resumeBounded, unlockAudio } from "./unlock";

/**
 * 2026-11 (the owner: "Play now in the room doesn't work" on an iPad with Spotify Connect): the Spotify app on the same
 * iPad takes the audio session, WebKit marks the booth's context "interrupted", and its resume() promise stays pending
 * until the interruption ends — Play now awaited it and never reached the engine. A resume is waited on for a bound.
 */
describe("resumeBounded (Play now never waits on an interrupted context)", () => {
  it("returns once the context resumes", async () => {
    let n = 0;
    const r = await resumeBounded(
      {
        resume: () => {
          n++;
          return Promise.resolve();
        },
      },
      1000,
    );
    expect(r).toBe("resumed");
    expect(n).toBe(1);
  });
  it("gives up after the bound when resume() never settles (an interrupted WebKit context)", async () => {
    const t0 = Date.now();
    const r = await resumeBounded({ resume: () => new Promise<void>(() => {}) }, 50);
    expect(r).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it("a rejected or throwing resume, or no context, is not an error", async () => {
    expect(await resumeBounded({ resume: () => Promise.reject(new Error("x")) }, 50)).toBe("failed");
    const bad = {
      resume: (): Promise<void> => {
        throw new Error("x");
      },
    };
    expect(await resumeBounded(bad, 50)).toBe("failed");
    expect(await resumeBounded(null, 50)).toBe("failed");
  });
});

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
