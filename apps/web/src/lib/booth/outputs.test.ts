import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n";
import {
  chainOf,
  describeOutput,
  fromBrowser,
  fromNative,
  kindFromLabel,
  kindFromPortType,
  kindFromTransport,
  latencyOf,
  normalizeRouting,
  type OutputInfo,
  pairsOf,
  roomLatencySec,
} from "./outputs";

afterEach(() => setLocale("en"));

const out = (o: Partial<OutputInfo> & Pick<OutputInfo, "id" | "label" | "kind">): OutputInfo => ({
  via: "browser",
  ...o,
});

describe("output kinds (2026-11: see the connection)", () => {
  it("reads the kind from a browser label", () => {
    expect(kindFromLabel("Default - MacBook Pro Speakers")).toBe("built-in");
    expect(kindFromLabel("External Headphones")).toBe("headphones");
    expect(kindFromLabel("Headphones (Realtek(R) Audio)")).toBe("headphones");
    expect(kindFromLabel("AirPods Pro")).toBe("bluetooth");
    expect(kindFromLabel("JBL Flip 6")).toBe("bluetooth");
    expect(kindFromLabel("DDJ-400")).toBe("usb");
    expect(kindFromLabel("Pioneer DDJ-FLX4")).toBe("usb");
    expect(kindFromLabel("Scarlett 2i2 USB")).toBe("usb");
    expect(kindFromLabel("LG HDR 4K (DisplayPort)")).toBe("displayport");
    expect(kindFromLabel("SAMSUNG (HDMI)")).toBe("hdmi");
    expect(kindFromLabel("Multi-Output Device")).toBe("multi");
    expect(kindFromLabel("BlackHole 2ch")).toBe("virtual");
    expect(kindFromLabel("Living Room (AirPlay)")).toBe("airplay");
    expect(kindFromLabel("Something")).toBe("unknown");
  });

  it("reads CoreAudio's transport type and the built-in data source (Mac app)", () => {
    expect(kindFromTransport("bltn", "ispk")).toBe("built-in");
    expect(kindFromTransport("bltn", "hdpn")).toBe("headphones");
    expect(kindFromTransport("usb ")).toBe("usb");
    expect(kindFromTransport("blue")).toBe("bluetooth");
    expect(kindFromTransport("bleo")).toBe("bluetooth");
    expect(kindFromTransport("airp")).toBe("airplay");
    expect(kindFromTransport("hdmi")).toBe("hdmi");
    expect(kindFromTransport("dprt")).toBe("displayport");
    expect(kindFromTransport("grup", null, true)).toBe("multi");
    expect(kindFromTransport("grup", null, false)).toBe("aggregate");
    expect(kindFromTransport(null)).toBe("unknown");
  });

  it("reads AVAudioSession port types (iPhone / iPad app)", () => {
    expect(kindFromPortType("Speaker")).toBe("built-in");
    expect(kindFromPortType("Headphones")).toBe("headphones");
    expect(kindFromPortType("BluetoothA2DPOutput")).toBe("bluetooth");
    expect(kindFromPortType("BluetoothLE")).toBe("bluetooth");
    expect(kindFromPortType("USBAudio")).toBe("usb");
    expect(kindFromPortType("AirPlay")).toBe("airplay");
    expect(kindFromPortType("HDMI")).toBe("hdmi");
    expect(kindFromPortType("LineOut")).toBe("line");
  });

  it("uses the reported latency, else the kind's estimate (Bluetooth ~200 ms, AirPlay ~2 s)", () => {
    expect(latencyOf({ kind: "bluetooth" })).toEqual({ ms: 200, from: "estimate" });
    expect(latencyOf({ kind: "airplay" })).toEqual({ ms: 2000, from: "estimate" });
    expect(latencyOf({ kind: "bluetooth", latencyMs: 163.4 })).toEqual({ ms: 163, from: "reported" });
    expect(latencyOf({ kind: "unknown" })).toBeNull();
  });

  it("describes an output with what is known", () => {
    expect(
      describeOutput(
        out({ id: "u", label: "DDJ-400", kind: "usb", channels: 4, sampleRate: 48000, latencyMs: 11 }),
      ),
    ).toBe("USB / USB-C · 4 ch · 48 kHz · 11 ms");
    expect(describeOutput(out({ id: "b", label: "AirPods", kind: "bluetooth" }))).toBe("Bluetooth · ~200 ms");
  });

  it("maps native outputs (CoreAudio and AVAudioSession) to one model", () => {
    const mac = fromNative(
      [
        {
          id: "BuiltIn",
          name: "MacBook Pro Speakers",
          transport: "bltn",
          dataSource: "ispk",
          channels: 2,
          sampleRate: 48000,
          isDefault: true,
        },
        {
          id: "DDJ",
          name: "DDJ-400",
          transport: "usb ",
          channels: 4,
          sampleRate: 44100,
          latencyMs: 9.5,
          isDefault: false,
        },
      ],
      "macos",
    );
    expect(mac.map((m) => [m.kind, m.channels, m.latencyFrom, m.via])).toEqual([
      ["built-in", 2, "estimate", "coreaudio"],
      ["usb", 4, "reported", "coreaudio"],
    ]);
    const ios = fromNative(
      [{ id: "x", name: "AirPods Pro", portType: "BluetoothA2DPOutput", channels: 2, isDefault: true }],
      "ipados",
    );
    expect(ios[0]).toMatchObject({ kind: "bluetooth", via: "avaudiosession" });
  });

  it("fills the room device's channels, rate and latency from the context (browser)", () => {
    const list = fromBrowser(
      [
        { id: "default", label: "This device (MacBook Pro Speakers)", groupId: "g1" },
        { id: "ddj", label: "DDJ-400", groupId: "g2" },
      ],
      { id: "ddj", channels: 4, sampleRate: 48000, latencySec: 0.012 },
    );
    expect(list[1]).toMatchObject({
      kind: "usb",
      channels: 4,
      sampleRate: 48000,
      latencyMs: 12,
      latencyFrom: "reported",
    });
    expect(list[0]!.channels).toBeUndefined();
    // a context reporting 23 ms on AirPods did not count the Bluetooth buffer: the estimate stands
    const bt = fromBrowser([{ id: "pods", label: "AirPods Pro" }], { id: "pods", latencySec: 0.023 });
    expect(bt[0]).toMatchObject({ latencyFrom: "estimate", latencyMs: undefined });
    expect(describeOutput(bt[0]!)).toBe("Bluetooth · ~200 ms");
    expect(roomLatencySec(bt[0]!, 0.023)).toBe(0.2);
  });
});

describe("the chain line and its warnings", () => {
  const ddj = out({ id: "ddj", label: "Pioneer DDJ-400", kind: "usb", channels: 4 });
  const pods = out({ id: "pods", label: "AirPods Pro", kind: "bluetooth" });
  const mac = out({
    id: "default",
    label: "MacBook Pro Speakers",
    kind: "built-in",
    channels: 2,
    groupId: "g1",
  });

  it("a 4-channel controller: room on 1–2, headphones on 3–4", () => {
    const c = chainOf({
      room: ddj,
      cue: null,
      routing: { roomPair: 0, cuePair: 1, mirror: null, trimMs: {} },
    });
    expect(c.line).toBe("T-DJ → Pioneer DDJ-400 (USB / USB-C, 4 ch) → ch 1–2 ROOM · ch 3–4 HEADPHONES");
    expect(c.warnings).toEqual([]);
  });

  it("Bluetooth in the room: a warning with the delay", () => {
    const c = chainOf({ room: pods, cue: null });
    expect(c.line).toBe("T-DJ → AirPods Pro (Bluetooth, ~200 ms) → ROOM");
    expect(c.warnings.map((w) => w.id)).toEqual(["bt-room"]);
    expect(c.warnings[0]!.text).toMatch(/200 ms/);
  });

  it("separate headphones: the cue on its own device; Bluetooth headphones lag", () => {
    const c = chainOf({ room: mac, cue: pods });
    expect(c.line).toBe(
      "T-DJ → MacBook Pro Speakers (Built-in speakers) → ROOM · AirPods Pro (Bluetooth, ~200 ms) → HEADPHONES",
    );
    expect(c.warnings.map((w) => w.id)).toEqual(["bt-cue"]);
  });

  it("room and headphones on the same stereo output: one pair can't cue", () => {
    const c = chainOf({ room: mac, cue: { ...mac, id: "mac2" } });
    expect(c.warnings.map((w) => w.id)).toEqual(["one-pair"]);
    const d = chainOf({ room: ddj, cue: ddj });
    expect(d.warnings.map((w) => w.id)).toEqual(["same-device"]);
  });

  it("the phone's own speaker is no room; AirPlay delays; a Multi-Output Device needs drift correction", () => {
    expect(chainOf({ room: mac, cue: null, mobile: true }).warnings.map((w) => w.id)).toEqual([
      "phone-speaker",
    ]);
    expect(
      chainOf({ room: out({ id: "a", label: "Living Room", kind: "airplay" }), cue: null }).warnings[0]!.id,
    ).toBe("airplay-room");
    expect(
      chainOf({ room: out({ id: "m", label: "Multi-Output Device", kind: "multi" }), cue: null }).warnings[0]!
        .id,
    ).toBe("multi-drift");
  });

  it("two speaker sets: the second output on the line, a wireless one warned", () => {
    const c = chainOf({ room: ddj, cue: null, mirror: pods });
    expect(c.line).toContain("AirPods Pro (Bluetooth, ~200 ms) → ROOM 2");
    expect(c.warnings.map((w) => w.id)).toContain("mirror-wireless");
  });

  it("Spotify Connect: the device plays the room", () => {
    expect(chainOf({ room: mac, cue: null, connect: "Kitchen iPad" }).line).toBe(
      "T-DJ → Spotify → Kitchen iPad → ROOM",
    );
  });

  it("Turkish words on the line", () => {
    setLocale("tr");
    const c = chainOf({
      room: ddj,
      cue: null,
      routing: { roomPair: 0, cuePair: 1, mirror: null, trimMs: {} },
    });
    expect(c.line).toBe(
      "T-DJ → Pioneer DDJ-400 (USB / USB-C, 4 kanal) → kanal 1–2 SALON · kanal 3–4 KULAKLIK",
    );
  });
});

describe("routing on one device", () => {
  it("keeps only pairs the device has, never the cue on the room's pair, never the mirror on the room", () => {
    expect(pairsOf(2)).toBe(1);
    expect(pairsOf(8)).toBe(4);
    expect(pairsOf(undefined)).toBe(1);
    expect(normalizeRouting({ roomPair: 0, cuePair: 1 }, { channels: 4, roomId: "ddj" })).toMatchObject({
      roomPair: 0,
      cuePair: 1,
    });
    expect(normalizeRouting({ roomPair: 0, cuePair: 1 }, { channels: 2, roomId: "mac" })).toMatchObject({
      cuePair: null,
    });
    expect(normalizeRouting({ roomPair: 1, cuePair: 1 }, { channels: 4, roomId: "ddj" })).toMatchObject({
      roomPair: 1,
      cuePair: null,
    });
    expect(normalizeRouting({ roomPair: 3 }, { channels: 4, roomId: "ddj" }).roomPair).toBe(0);
    expect(normalizeRouting({ mirror: "ddj" }, { channels: 4, roomId: "ddj" }).mirror).toBeNull();
    expect(normalizeRouting({ trimMs: { a: 9999, b: -3, c: 42.4 } }, { roomId: "x" }).trimMs).toEqual({
      a: 500,
      b: 0,
      c: 42,
    });
  });
});

describe("the room's latency for the playhead (6: Bluetooth)", () => {
  const bt = out({ id: "b", label: "AirPods", kind: "bluetooth" });
  it("trusts what the context reports, else the device's figure, else the estimate", () => {
    // Chromium reports 0.18 s for a Bluetooth output: that is it
    expect(roomLatencySec(bt, 0.18)).toBe(0.18);
    // Safari reports nothing: the Bluetooth estimate
    expect(roomLatencySec(bt, 0)).toBe(0.2);
    // the Mac app's CoreAudio figure beats a small context figure
    expect(roomLatencySec({ ...bt, latencyMs: 150, latencyFrom: "reported" }, 0.01)).toBe(0.15);
    expect(roomLatencySec(null, 0.01)).toBe(0.01);
  });
});
