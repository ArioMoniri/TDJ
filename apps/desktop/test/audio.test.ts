import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-11 (the night never stops by accident; outputs): the native audio commands are wired end to end — declared in
 * build.rs, granted to the app's own pages, registered with the handler — and the iOS settings the night needs are set.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const COMMANDS = ["audio_route", "audio_route_picker", "audio_set_output", "audio_night"];

describe("native audio (src-tauri/src/audio.rs)", () => {
  it("every audio command is in the manifest, the capability and the invoke handler", () => {
    const build = read("../src-tauri/build.rs");
    const cap = JSON.parse(read("../src-tauri/capabilities/default.json")) as { permissions: string[] };
    const lib = read("../src-tauri/src/lib.rs");
    for (const c of COMMANDS) {
      expect(build, c).toContain(`"${c}"`);
      expect(cap.permissions, c).toContain(`allow-${c.replaceAll("_", "-")}`);
      expect(lib, c).toContain(`audio::${c}`);
    }
  });

  it("iOS: the night plays with the screen locked (background audio)", () => {
    const plist = read("../src-tauri/Info.ios.plist");
    expect(plist).toMatch(/<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>/);
  });

  it("iOS: the session is .playback, mode default, without mixWithOthers (other apps never duck the night)", () => {
    const src = read("../src-tauri/src/apple_audio.rs");
    expect(src).toContain("AVAudioSessionCategoryPlayback");
    expect(src).toContain("AVAudioSessionModeDefault");
    expect(src).toMatch(/options: 0usize/);
    expect(src).not.toMatch(/CategoryAmbient|SoloAmbient/);
    for (const n of [
      "AVAudioSessionInterruptionNotification",
      "AVAudioSessionRouteChangeNotification",
      "AVAudioSessionMediaServicesWereResetNotification",
    ])
      expect(src).toContain(n);
  });

  it("Mac: an App Nap / idle-sleep activity while the night runs, and a listener on the device list", () => {
    const src = read("../src-tauri/src/apple_audio.rs");
    expect(src).toContain("beginActivityWithOptions");
    expect(src).toContain("endActivity");
    expect(src).toContain("AudioObjectAddPropertyListenerBlock");
  });

  it("the shim keeps the screen on through a paused night", () => {
    expect(read("../ui/bridge-shim.js")).toContain("__TDJ_NIGHT_RUNS__");
  });
});
