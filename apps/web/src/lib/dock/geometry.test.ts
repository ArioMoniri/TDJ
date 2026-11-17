import { describe, expect, it } from "vitest";
import {
  bounds,
  boxOf,
  CARD,
  CORNER,
  clampPos,
  DISC,
  defaultSaved,
  dockKey,
  dropTarget,
  formOf,
  handleSize,
  isDisc,
  MARGIN,
  parseSaved,
  pinchSize,
  place,
  placeOf,
  ring,
  serializeSaved,
  settleSize,
  snap,
} from "./geometry";

const phone = { w: 393, h: 852 };
// a phone: the status bar's safe area on top, the tab capsule (and the home indicator) at the foot
const phoneIns = { top: 59 + 56, right: 0, bottom: 34 + 62 + 8, left: 0 };
const disc = { w: 76, h: 76 };

describe("bounds and dragging", () => {
  it("keeps the player inside the safe area, clear of the tab bar", () => {
    const b = bounds(disc, phone, phoneIns);
    expect(b.minX).toBe(MARGIN);
    expect(b.maxX).toBe(phone.w - MARGIN - disc.w);
    expect(b.minY).toBe(phoneIns.top + MARGIN);
    expect(b.maxY).toBe(phone.h - phoneIns.bottom - MARGIN - disc.h);
  });
  it("a drag past any edge stays on screen", () => {
    expect(clampPos({ x: -200, y: 5000 }, disc, phone, phoneIns)).toEqual({
      x: MARGIN,
      y: phone.h - phoneIns.bottom - MARGIN - disc.h,
    });
    expect(clampPos({ x: 9999, y: -9999 }, disc, phone, phoneIns)).toEqual({
      x: phone.w - MARGIN - disc.w,
      y: phoneIns.top + MARGIN,
    });
  });
  it("a box wider than the room still has one place (never a negative range)", () => {
    const b = bounds({ w: 500, h: 900 }, phone, phoneIns);
    expect(b.maxX).toBe(b.minX);
    expect(b.maxY).toBe(b.minY);
  });
  it("a sidebar inset keeps a desktop player off the sidebar", () => {
    const b = bounds(disc, { w: 1440, h: 900 }, { top: 0, right: 0, bottom: 0, left: 240 });
    expect(b.minX).toBe(240 + MARGIN);
  });
});

describe("snap", () => {
  it("goes to the nearer side edge", () => {
    expect(snap({ x: 40, y: 400 }, disc, phone, phoneIns)).toMatchObject({
      x: MARGIN,
      anchor: { edge: "left" },
    });
    expect(snap({ x: 300, y: 400 }, disc, phone, phoneIns)).toMatchObject({
      x: phone.w - MARGIN - disc.w,
      anchor: { edge: "right" },
    });
  });
  it("snaps into a corner near the top or the bottom, keeps the height in between", () => {
    const b = bounds(disc, phone, phoneIns);
    const top = snap({ x: 300, y: b.minY + CORNER - 5 }, disc, phone, phoneIns);
    expect(top).toMatchObject({ y: b.minY, corner: "top", anchor: { edge: "right", y: 0 } });
    const bottom = snap({ x: 10, y: b.maxY - 10 }, disc, phone, phoneIns);
    expect(bottom).toMatchObject({ y: b.maxY, corner: "bottom", anchor: { edge: "left", y: 1 } });
    const mid = snap({ x: 10, y: 420 }, disc, phone, phoneIns);
    expect(mid.corner).toBeNull();
    expect(mid.y).toBe(420);
    expect(mid.anchor.y).toBeCloseTo((420 - b.minY) / (b.maxY - b.minY), 6);
  });
  it("never lands on the tab bar or under the status bar, however far it is thrown", () => {
    const s = snap({ x: 200, y: 4000 }, disc, phone, phoneIns);
    expect(s.y + disc.h).toBeLessThanOrEqual(phone.h - phoneIns.bottom);
    const t = snap({ x: 200, y: -400 }, disc, phone, phoneIns);
    expect(t.y).toBeGreaterThanOrEqual(phoneIns.top);
  });
  it("the anchor keeps its place when the window turns (portrait → landscape)", () => {
    const s = snap({ x: 300, y: 420 }, disc, phone, phoneIns);
    const land = { w: 852, h: 393 };
    const ins = { top: 56, right: 59, bottom: 62 + 21 + 8, left: 59 };
    const p = place(s.anchor, disc, land, ins);
    const b = bounds(disc, land, ins);
    expect(p.x).toBe(b.maxX);
    expect(p.y).toBeGreaterThanOrEqual(b.minY);
    expect(p.y).toBeLessThanOrEqual(b.maxY);
    // the same window: exactly where it was let go
    expect(place(s.anchor, disc, phone, phoneIns)).toEqual({ x: s.x, y: s.y });
  });
});

describe("sizes", () => {
  it("below a card's width it is the gramophone", () => {
    expect(isDisc(CARD.min - 1)).toBe(true);
    expect(isDisc(CARD.min)).toBe(false);
    expect(boxOf(80, 200)).toEqual({ w: 80, h: 80 });
    expect(boxOf(30, 200)).toEqual({ w: DISC.min, h: DISC.min });
    expect(boxOf(320, 188)).toEqual({ w: 320, h: 188 });
  });
  it("settles between the largest gramophone and the narrowest card on the nearer one", () => {
    expect(settleSize(DISC.max + 10)).toBe(DISC.max);
    expect(settleSize(CARD.min - 10)).toBe(CARD.min);
    expect(settleSize(90)).toBe(90);
    expect(settleSize(10)).toBe(DISC.min);
    expect(settleSize(9999)).toBe(CARD.max);
    expect(settleSize(333)).toBe(333);
  });
  it("a pinch scales the size it started at; a broken pinch keeps it", () => {
    expect(pinchSize(76, 100, 200)).toBe(152);
    expect(pinchSize(300, 200, 50)).toBe(75);
    expect(pinchSize(300, 400, 50)).toBe(DISC.min);
    expect(pinchSize(300, 100, 1000)).toBe(CARD.max);
    expect(pinchSize(300, 0, 100)).toBe(300);
  });
  it("the handle grows the card away from its edge", () => {
    expect(handleSize(300, 40, "left")).toBe(340);
    expect(handleSize(300, 40, "right")).toBe(260);
    expect(handleSize(300, -400, "left")).toBe(DISC.min);
  });
});

describe("ring", () => {
  it("draws what has played and says what is left", () => {
    const r = ring(30, 120, 40);
    expect(r.frac).toBe(0.25);
    expect(r.remaining).toBe(90);
    expect(r.circumference).toBeCloseTo(2 * Math.PI * 40, 9);
    expect(r.offset).toBeCloseTo(r.circumference * 0.75, 9);
  });
  it("advances as the song plays", () => {
    const a = ring(10, 180, 36);
    const b = ring(11, 180, 36);
    expect(b.frac).toBeGreaterThan(a.frac);
    expect(b.offset).toBeLessThan(a.offset);
    expect(b.remaining).toBe(169);
  });
  it("is empty with no length, full at the end, never past it", () => {
    expect(ring(5, 0, 40)).toMatchObject({ frac: 0, remaining: 0 });
    expect(ring(Number.NaN, 100, 40).frac).toBe(0);
    expect(ring(500, 100, 40)).toMatchObject({ frac: 1, remaining: 0, offset: 0 });
    expect(ring(-3, 100, 40)).toMatchObject({ frac: 0, remaining: 100 });
  });
});

describe("re-docking a drag", () => {
  const vp = { w: 1440, h: 900 };
  it("onto the open sidebar, or the bottom bar's place", () => {
    expect(dropTarget({ x: 120, y: 500 }, vp, { sideRight: 240, barTop: null })).toBe("side");
    expect(dropTarget({ x: 700, y: 500 }, vp, { sideRight: 240, barTop: null })).toBeNull();
    expect(dropTarget({ x: 200, y: 800 }, phone, { sideRight: null, barTop: 700 })).toBe("bar");
    expect(dropTarget({ x: 200, y: 600 }, phone, { sideRight: null, barTop: 700 })).toBeNull();
  });
});

describe("what a device keeps", () => {
  it("one place per form (a phone, an iPad portrait, a window with the sidebar)", () => {
    expect(formOf(393)).toBe("phone");
    expect(formOf(834)).toBe("tablet");
    expect(formOf(1194)).toBe("desktop");
    expect(dockKey("phone")).toBe("tdj-player-dock:phone");
  });
  it("round-trips, and falls back on anything broken", () => {
    const s = { detached: true, anchor: { edge: "left" as const, y: 0.4 }, size: 88 };
    expect(parseSaved(serializeSaved(s), "phone")).toEqual(s);
    expect(parseSaved(null, "phone")).toEqual(defaultSaved("phone"));
    expect(parseSaved("{oops", "desktop")).toEqual(defaultSaved("desktop"));
    expect(parseSaved('{"anchor":{"edge":"up","y":7},"size":"x"}', "phone")).toEqual({
      detached: false,
      anchor: { edge: "right", y: 1 },
      size: defaultSaved("phone").size,
    });
    // a half-way size from an old build settles
    expect(parseSaved('{"detached":true,"size":200}', "tablet").size).toBe(CARD.min);
  });
});

describe("the place", () => {
  const docked = defaultSaved("desktop");
  it("sidebar open → in it; collapsed → the gramophone; no sidebar → the bottom bar", () => {
    expect(placeOf(docked, { wide: true, collapsed: false })).toBe("side");
    expect(placeOf(docked, { wide: true, collapsed: true })).toBe("disc");
    expect(placeOf(docked, { wide: false, collapsed: false })).toBe("bar");
  });
  it("detached: a card, or the gramophone below a card's width", () => {
    expect(placeOf({ ...docked, detached: true, size: 300 }, { wide: true, collapsed: false })).toBe("float");
    expect(placeOf({ ...docked, detached: true, size: 76 }, { wide: false, collapsed: false })).toBe("disc");
  });
});
