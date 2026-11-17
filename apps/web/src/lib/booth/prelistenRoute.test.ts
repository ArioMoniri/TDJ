import { describe, expect, it } from "vitest";
import { CUE_ON_ROOM, type OutputDevice } from "./cue";
import { headphoneChoices, type PrelistenOutputs, prelistenRoute, speakerFor } from "./prelistenRoute";

/**
 * 2026-11 (the owner: "can't play these songs even when there is another device connected"): while the Booth plays a
 * night to the room, a tap on any song row pre-listens on a second output — the headphones, or this device's own
 * speaker when the DJ asks and it is not the room's — and never reaches the room.
 */
const DESK: OutputDevice[] = [
  // the system default is the DJ controller (the room)
  { id: "default", label: "This device (DDJ-400)", groupId: "g-ddj" },
  { id: "pods", label: "AirPods Pro", groupId: "g-pods" },
  { id: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
];
const LAPTOP: OutputDevice[] = [
  // the room plays on the laptop's own speakers (the default)
  { id: "default", label: "This device (Built-in Speakers)", groupId: "g1" },
  { id: "hp", label: "AirPods Pro", groupId: "g2" },
];
const out = (o: Partial<PrelistenOutputs> & { devices: OutputDevice[] }): PrelistenOutputs => ({
  room: "default",
  cue: null,
  cueSupported: true,
  ...o,
});
const roomIds = (o: PrelistenOutputs) => {
  const room = o.room ?? "default";
  const g = o.devices.find((d) => d.id === room)?.groupId;
  return new Set(o.devices.filter((d) => d.id === room || (g && d.groupId === g)).map((d) => d.id));
};

describe("pre-listen while the Booth plays a night", () => {
  it("no night: the app's own player", () => {
    expect(prelistenRoute({ started: false, outputs: out({ devices: DESK }) })).toEqual({ kind: "player" });
  });

  it("headphones chosen on a second output: there at once", () => {
    expect(prelistenRoute({ started: true, outputs: out({ devices: DESK, cue: "pods" }) })).toEqual({
      kind: "headphones",
      sink: "pods",
    });
    // the controller's own headphones pair, once the routing has it open
    expect(
      prelistenRoute({ started: true, outputs: out({ devices: DESK, cue: CUE_ON_ROOM }), pairOpen: true }),
    ).toEqual({ kind: "headphones", sink: CUE_ON_ROOM });
  });

  it("no headphones: ask, with the device speaker offered only when it is not the room", () => {
    const desk = prelistenRoute({ started: true, outputs: out({ devices: DESK }) });
    expect(desk).toMatchObject({ kind: "ask", why: "none", canPick: true, speaker: { id: "mac" } });
    // the laptop's speaker is the room: never offered
    const laptop = prelistenRoute({ started: true, outputs: out({ devices: LAPTOP }) });
    expect(laptop).toMatchObject({ kind: "ask", why: "none", canPick: true, speaker: null });
  });

  it("the headphones set to the room's own output: ask why (same), never play there", () => {
    const r = prelistenRoute({ started: true, outputs: out({ devices: LAPTOP, cue: "default" }) });
    expect(r).toMatchObject({ kind: "ask", why: "same" });
  });

  it("the DJ chose this device's speaker: there, and only while it is not the room's", () => {
    expect(prelistenRoute({ started: true, outputs: out({ devices: DESK }), speakerOk: true })).toEqual({
      kind: "speaker",
      sink: "mac",
      label: "MacBook Pro Speakers",
    });
    // the room moved to the laptop's speakers: the choice no longer holds, it asks again
    expect(
      prelistenRoute({ started: true, outputs: out({ devices: DESK, room: "mac" }), speakerOk: true }),
    ).toMatchObject({ kind: "ask", speaker: null });
    // headphones win over the speaker once chosen
    expect(
      prelistenRoute({ started: true, outputs: out({ devices: DESK, cue: "pods" }), speakerOk: true }).kind,
    ).toBe("headphones");
  });

  it("one output for the page (Safari, iPhone, iPad): ask, nothing to pick, no speaker", () => {
    const safari = prelistenRoute({ started: true, outputs: out({ devices: DESK, cueSupported: false }) });
    expect(safari).toEqual({ kind: "ask", why: "unsupported", canPick: false, speaker: null });
    const ipad = prelistenRoute({ started: true, outputs: out({ devices: DESK, cue: "pods" }), apple: true });
    expect(ipad).toMatchObject({ kind: "ask", why: "unsupported", canPick: false });
  });

  it("the speaker is never the room: an unknown hardware group is no proof", () => {
    // the default's group unknown: it may be the room's interface
    expect(
      speakerFor(
        out({
          devices: [
            { id: "default", label: "This device" },
            { id: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
          ],
        }),
      ),
    ).toBeNull();
    // the room on the controller by id, the default being the Mac's speakers (known, different groups): safe
    expect(
      speakerFor(
        out({
          room: "ddj",
          devices: [
            { id: "default", label: "This device (MacBook Pro Speakers)", groupId: "g-mac" },
            { id: "ddj", label: "DDJ-400", groupId: "g-ddj" },
          ],
        }),
      )?.id,
    ).toBe("default");
    // the default being the controller itself: not the speaker
    expect(
      speakerFor(
        out({
          room: "ddj",
          devices: [
            { id: "default", label: "This device (DDJ-400 Speakers)", groupId: "g-ddj" },
            { id: "ddj", label: "DDJ-400", groupId: "g-ddj" },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("built-in speakers are never headphones: they are listed once, as the speaker option", () => {
    const o = out({ room: "default", devices: DESK });
    expect(headphoneChoices(o).map((d) => d.id)).toEqual(["pods"]);
    expect(speakerFor(o)?.id).toBe("mac");
    // the system default when it is the built-in speakers (Chrome: "Default - MacBook Pro Speakers"), room on the DDJ
    const d = out({
      room: "ddj",
      devices: [
        { id: "default", label: "Default - MacBook Pro Speakers", groupId: "g-mac" },
        { id: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
        { id: "ddj", label: "DDJ-400", groupId: "g-ddj" },
        { id: "pods", label: "AirPods Pro", groupId: "g-pods" },
      ],
    });
    expect(headphoneChoices(d).map((x) => x.id)).toEqual(["pods"]);
    expect(speakerFor(d)).not.toBeNull();
    for (const devices of [DESK, LAPTOP])
      for (const room of devices.map((x) => x.id)) {
        const oo = out({ room, devices });
        const sp = speakerFor(oo);
        for (const c of headphoneChoices(oo)) {
          expect(c.label).not.toMatch(/speaker/i);
          if (sp) expect(c.id).not.toBe(sp.id);
        }
      }
  });

  it("invariant: no route and no choice ever names the room's output", () => {
    const cases: PrelistenOutputs[] = [];
    for (const devices of [DESK, LAPTOP])
      for (const room of devices.map((d) => d.id))
        for (const cue of [null, ...devices.map((d) => d.id)])
          for (const cueSupported of [true, false]) cases.push({ devices, room, cue, cueSupported });
    for (const o of cases) {
      const room = roomIds(o);
      for (const speakerOk of [false, true]) {
        const r = prelistenRoute({ started: true, outputs: o, speakerOk });
        if (r.kind === "headphones" || r.kind === "speaker") expect(room.has(r.sink)).toBe(false);
        if (r.kind === "ask" && r.speaker) expect(room.has(r.speaker.id)).toBe(false);
      }
      for (const d of headphoneChoices(o)) expect(room.has(d.id)).toBe(false);
    }
  });
});
