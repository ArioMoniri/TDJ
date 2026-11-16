import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeRoute, nightRunning, showRoutePicker, toAudioEvent } from "./nativeAudio";

afterEach(() => vi.unstubAllGlobals());

describe("the native audio bridge (src-tauri/src/audio.rs ↔ the page)", () => {
  it("reads the native events, and nothing else", () => {
    expect(toAudioEvent({ type: "interruption", phase: "began" })).toEqual({
      type: "interruption",
      phase: "began",
    });
    expect(toAudioEvent({ type: "interruption", phase: "ended", shouldResume: true })).toEqual({
      type: "interruption",
      phase: "ended",
      shouldResume: true,
    });
    expect(toAudioEvent({ type: "interruption", phase: "ended" })).toMatchObject({ shouldResume: false });
    expect(toAudioEvent({ type: "route", reason: 2, previous: ["DDJ-400", 3] })).toEqual({
      type: "route",
      reason: 2,
      previous: ["DDJ-400"],
    });
    expect(toAudioEvent({ type: "devices" })).toBe("devices");
    expect(toAudioEvent({ type: "reset" })).toEqual({ type: "reset" });
    expect(toAudioEvent({ type: "route", reason: "2" })).toBeNull();
    expect(toAudioEvent(null)).toBeNull();
    expect(toAudioEvent({ type: "evil" })).toBeNull();
  });

  it("in a browser every call is a quiet no-op", async () => {
    vi.stubGlobal("window", {});
    expect(await nativeRoute()).toBeNull();
    expect(await showRoutePicker()).toBe(false);
    expect(await nightRunning(true)).toBe(false);
    // the shim still learns that a night runs (it keeps the screen on through a pause)
    expect((window as unknown as { __TDJ_NIGHT_RUNS__?: boolean }).__TDJ_NIGHT_RUNS__).toBe(true);
  });

  it("in the app the commands go to the native side", async () => {
    const calls: string[] = [];
    vi.stubGlobal("window", {
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string) => {
          calls.push(cmd);
          return cmd === "audio_route" ? { platform: "macos", outputs: [] } : true;
        },
      },
    });
    expect(await nativeRoute()).toEqual({ platform: "macos", outputs: [] });
    expect(await showRoutePicker()).toBe(true);
    expect(await nightRunning(false)).toBe(true);
    expect(calls).toEqual(["audio_route", "audio_route_picker", "audio_night"]);
  });
});
