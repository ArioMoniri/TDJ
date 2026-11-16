import { describe, expect, it } from "vitest";
import { bannerText, outputLost, ROUTE_REASON, react, whereText } from "./continuity";

const live = { live: true, heldFor: null } as const;
const idle = { live: false, heldFor: null } as const;

describe("the night never stops by accident (2026-11)", () => {
  it("a call / Siri / an alarm: hold where the night is; when it ends, resume if the system says so, else offer it", () => {
    expect(react({ type: "interruption", phase: "began" }, live)).toEqual({
      do: "hold",
      why: "interruption",
      banner: "interrupted",
    });
    const held = { live: false, heldFor: "interruption" } as const;
    expect(react({ type: "interruption", phase: "ended", shouldResume: true }, held)).toEqual({
      do: "resume",
    });
    expect(react({ type: "interruption", phase: "ended", shouldResume: false }, held)).toEqual({
      do: "offer",
      banner: "interrupted",
    });
    // the DJ already played on during the call: the end of it starts nothing a second time
    expect(
      react(
        { type: "interruption", phase: "ended", shouldResume: true },
        { live: true, heldFor: "interruption" },
      ),
    ).toEqual({ do: "nothing" });
    // nothing played: nothing to hold, nothing to resume (the DJ's own pause is never undone by the system)
    expect(react({ type: "interruption", phase: "began" }, idle)).toEqual({ do: "nothing" });
    expect(
      react({ type: "interruption", phase: "ended", shouldResume: true }, { live: false, heldFor: null }),
    ).toEqual({ do: "nothing" });
  });

  it("the output unplugged: never on into the phone speaker — pause and ask (or go on, when the DJ chose that)", () => {
    const lost = { type: "route", reason: ROUTE_REASON.oldDeviceUnavailable, previous: ["DDJ-400"] } as const;
    expect(react(lost, live)).toEqual({ do: "hold", why: "output", banner: "output-lost" });
    expect(react(lost, live, "continue")).toEqual({ do: "note", banner: "output-moved" });
    expect(react(lost, idle)).toEqual({ do: "nothing" });
    expect(react({ type: "output-lost", name: "AirPods" }, live)).toMatchObject({ do: "hold" });
    // a new output never moves the night by itself
    expect(react({ type: "route", reason: ROUTE_REASON.newDeviceAvailable }, live)).toEqual({
      do: "note",
      banner: "output-new",
    });
    expect(react({ type: "route", reason: ROUTE_REASON.categoryChange }, live)).toEqual({ do: "nothing" });
  });

  it("a suspended / interrupted context (iOS Safari): the clock is frozen, so offer the one tap; running clears it", () => {
    expect(react({ type: "context", state: "interrupted" }, live)).toEqual({
      do: "offer",
      banner: "context",
    });
    expect(react({ type: "context", state: "suspended" }, live)).toEqual({ do: "offer", banner: "context" });
    expect(react({ type: "context", state: "running" }, live)).toEqual({ do: "clear" });
    expect(react({ type: "context", state: "suspended" }, idle)).toEqual({ do: "nothing" });
  });

  it("Spotify stopped mid-song on its device: hold the night (no drift) and offer Resume", () => {
    expect(react({ type: "spotify-paused", device: "iPhone" }, live)).toEqual({
      do: "hold",
      why: "spotify",
      banner: "spotify",
    });
  });

  it("says where the night was", () => {
    expect(whereText("Milonga de mis amores", 134.9)).toBe("Milonga de mis amores · 2:14");
    expect(whereText(null, 5)).toBe("0:05");
    expect(bannerText("output-lost", { name: "DDJ-400", where: "Poema · 1:02" })).toMatch(
      /DDJ-400.*Poema · 1:02/,
    );
    expect(bannerText("spotify", { device: "iPhone", where: "Poema · 1:02" })).toMatch(/iPhone/);
  });
});

describe("outputLost (web devicechange, Mac device list)", () => {
  const mac = { id: "mac", label: "MacBook Pro Speakers", groupId: "g1" };
  const pods = { id: "pods", label: "AirPods Pro", groupId: "g2" };
  const ddj = { id: "ddj", label: "DDJ-400", groupId: "g3" };
  const def = (label: string, groupId: string) => ({
    id: "default",
    label: `This device (${label})`,
    groupId,
  });

  it("a chosen room device that disappears is lost", () => {
    const r = outputLost({
      before: [def("MacBook Pro Speakers", "g1"), ddj],
      after: [def("MacBook Pro Speakers", "g1")],
      room: "ddj",
    });
    expect(r).toMatchObject({ lost: true, name: "DDJ-400", now: "MacBook Pro Speakers" });
    expect(
      outputLost({
        before: [def("MacBook Pro Speakers", "g1"), ddj],
        after: [def("MacBook Pro Speakers", "g1"), ddj, pods],
        room: "ddj",
      }).lost,
    ).toBe(false);
  });

  it("the system default: AirPods dropping moves the night to the speakers — lost", () => {
    const r = outputLost({
      before: [def("AirPods Pro", "g2"), mac],
      after: [def("MacBook Pro Speakers", "g1")],
      room: "default",
    });
    expect(r).toMatchObject({ lost: true, name: "AirPods Pro", now: "MacBook Pro Speakers" });
  });

  it("the DJ switching outputs in System Settings is a change, not a loss", () => {
    const r = outputLost({
      before: [def("AirPods Pro", "g2"), mac],
      after: [def("MacBook Pro Speakers", "g1"), pods],
      room: "default",
    });
    expect(r).toEqual({ lost: false, name: "AirPods Pro", now: "MacBook Pro Speakers", changed: true });
  });

  it("nothing behind the default changed (a new device plugged in)", () => {
    expect(
      outputLost({
        before: [def("MacBook Pro Speakers", "g1")],
        after: [def("MacBook Pro Speakers", "g1"), ddj],
        room: "default",
      }),
    ).toEqual({
      lost: false,
      changed: false,
    });
  });

  it("without device names (no permission) the group id still tells", () => {
    const anon = (g: string) => ({ id: "default", label: "This device", groupId: g });
    expect(
      outputLost({
        before: [anon("g2"), { id: "o1", label: "Output 2", groupId: "g1" }],
        after: [anon("g1")],
        room: "default",
      }).lost,
    ).toBe(true);
  });
});
