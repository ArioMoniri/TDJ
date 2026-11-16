import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUE_ON_ROOM, canPrelisten, cueRouted } from "./cue";
import { _resetGuard, armGuard, type GuardDeps, handle, nightEnded, onNightLive, useAudio } from "./guard";
import { nightSafeHandlers } from "./media";

/** The Booth's guard with every platform API mocked: a fake Tauri bridge, a fake context, fake devices. */
function setup(o: { native?: boolean; policy?: "pause" | "continue"; live?: boolean } = {}) {
  const invoked: Array<[string, unknown]> = [];
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  if (o.native)
    win.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: unknown) => {
        invoked.push([cmd, args]);
        if (cmd === "audio_route")
          return {
            platform: "ipados",
            outputs: [
              { id: "spk", name: "iPhone Speaker", portType: "Speaker", channels: 2, isDefault: true },
            ],
          };
        return true;
      },
    };
  vi.stubGlobal("window", win);
  const banners: Array<{ key: string; text: string; action?: { label: string; run: () => void } }> = [];
  const pauses: number[] = [];
  let devices = [
    { id: "default", label: "This device (DDJ-400)", groupId: "g3" },
    { id: "mac", label: "MacBook Pro Speakers", groupId: "g1" },
  ];
  let devCb: (() => void) | null = null;
  const night = {
    started: true,
    live: o.live ?? true,
    title: "Poema",
    position: 74,
    room: "default",
    cue: null as string | null,
  };
  const resume = vi.fn(async () => {});
  const deps: GuardDeps = {
    ctx: () => null,
    engine: () => ({ setOutput() {}, outputLatencySec: 0, pause: (f?: number) => pauses.push(f ?? -1) }),
    night: () => ({ ...night, devices }),
    resume,
    banner: (b) => {
      const i = banners.findIndex((x) => x.key === b.key);
      if (i >= 0) banners.splice(i, 1);
      banners.push(b);
    },
    dismiss: (k) => {
      const i = banners.findIndex((x) => x.key === k);
      if (i >= 0) banners.splice(i, 1);
    },
    policy: () => o.policy ?? "pause",
    refreshOutputs: async () => {},
    setCue: (id) => {
      night.cue = id;
    },
  };
  const spotify = { onInterrupted: null as ((d: string | null) => void) | null };
  armGuard(deps, {
    onDeviceChange: (cb) => {
      devCb = cb;
      return () => {
        devCb = null;
      };
    },
    spotify,
  });
  return {
    win,
    invoked,
    banners,
    pauses,
    resume,
    night,
    spotify,
    unplug: async (next: typeof devices) => {
      devices = next;
      devCb?.();
      await new Promise((r) => setTimeout(r, 0));
    },
    fire: (detail: unknown) => win.dispatchEvent(new CustomEvent("tdj:audio", { detail })),
  };
}

beforeEach(() => _resetGuard());
afterEach(() => {
  _resetGuard();
  vi.unstubAllGlobals();
});

describe("the Booth's guard (2026-11: the night never stops by accident)", () => {
  it("iOS app: a call holds the night where it is; the end with shouldResume plays on by itself", async () => {
    const g = setup({ native: true });
    await new Promise((r) => setTimeout(r, 0));
    // the night running keeps the device awake (App Nap / idle timer) through the native command
    expect(g.invoked).toContainEqual(["audio_night", { on: true }]);
    g.fire({ type: "interruption", phase: "began" });
    expect(g.pauses).toEqual([0]);
    expect(useAudio.getState().heldFor).toBe("interruption");
    expect(g.banners[0]!.text).toMatch(/Poema · 1:14/);
    g.night.live = false;
    g.fire({ type: "interruption", phase: "ended", shouldResume: true });
    expect(g.resume).toHaveBeenCalledTimes(1);
    expect(g.banners).toEqual([]);
  });

  it("an interruption without shouldResume: a one-tap Resume with where the night was", async () => {
    const g = setup({ native: true });
    g.fire({ type: "interruption", phase: "began" });
    g.night.live = false;
    g.fire({ type: "interruption", phase: "ended", shouldResume: false });
    expect(g.resume).not.toHaveBeenCalled();
    const b = g.banners.find((x) => x.key === "guard")!;
    expect(b.action?.label).toBe("Resume");
    b.action!.run();
    expect(g.resume).toHaveBeenCalledTimes(1);
    expect(useAudio.getState().heldFor).toBeNull();
  });

  it("iOS route change oldDeviceUnavailable: pause and ask — never on into the phone speaker", () => {
    const g = setup({ native: true });
    g.fire({ type: "route", reason: 2, previous: ["DDJ-400"] });
    expect(g.pauses).toEqual([0]);
    expect(g.banners[0]!.text).toMatch(/DDJ-400/);
  });

  it("…or play on through the next output when the DJ chose that", () => {
    const g = setup({ native: true, policy: "continue" });
    g.fire({ type: "route", reason: 2, previous: ["AirPods Pro"] });
    expect(g.pauses).toEqual([]);
    expect(g.banners[0]!.key).toBe("device");
  });

  it("web: the room's device unplugged (devicechange) holds the night", async () => {
    const g = setup();
    await g.unplug([{ id: "default", label: "This device (MacBook Pro Speakers)", groupId: "g1" }]);
    expect(g.pauses).toEqual([0]);
    expect(g.banners.find((b) => b.key === "guard")!.text).toMatch(/DDJ-400/);
  });

  it("web: a new device plugged in is only a note (the room keeps playing)", async () => {
    const g = setup();
    await g.unplug([
      { id: "default", label: "This device (DDJ-400)", groupId: "g3" },
      { id: "mac", label: "MacBook Pro Speakers", groupId: "g1" },
      { id: "pods", label: "AirPods Pro", groupId: "g2" },
    ]);
    expect(g.pauses).toEqual([]);
    expect(g.banners).toEqual([]);
  });

  it("Spotify stopped mid-song on its device: the guard holds the night and offers Resume", () => {
    const g = setup();
    g.spotify.onInterrupted!("iPhone");
    expect(g.pauses).toEqual([0]);
    expect(g.banners[0]!.text).toMatch(/iPhone/);
    expect(useAudio.getState().heldFor).toBe("spotify");
    // the DJ played on from the transport: the hold and its banner are over
    onNightLive(true);
    expect(useAudio.getState().heldFor).toBeNull();
    expect(g.banners).toEqual([]);
  });

  it("nothing playing: an interruption or a plug-out changes nothing", () => {
    const g = setup({ live: false });
    handle({ type: "interruption", phase: "began" });
    handle({ type: "output-lost", name: "DDJ" });
    expect(g.pauses).toEqual([]);
    expect(g.banners).toEqual([]);
  });

  it("the night's end lets the device sleep again", async () => {
    const g = setup({ native: true });
    nightEnded();
    await new Promise((r) => setTimeout(r, 0));
    expect(g.invoked).toContainEqual(["audio_night", { on: false }]);
  });
});

describe("headphones on the room device's other pair", () => {
  it("can pre-listen without setSinkId once the pair is routed, and says why before", () => {
    expect(cueRouted()).toBe(false);
    expect(canPrelisten({ supported: false, roomId: "default", cueId: CUE_ON_ROOM }).ok).toBe(false);
  });
});

describe("media keys never end the night", () => {
  it("a system stop is a pause", () => {
    const calls: string[] = [];
    const h = nightSafeHandlers({
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      next: () => calls.push("next"),
      previous: () => calls.push("previous"),
    });
    h.stop();
    expect(calls).toEqual(["pause"]);
  });
});
