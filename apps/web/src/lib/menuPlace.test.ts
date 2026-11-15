import { describe, expect, it } from "vitest";
import { MENU_GAP, MENU_MARGIN, placeMenu } from "./menuPlace";

const ipadPortrait = { width: 834, height: 1194 };
const menu = { width: 256, height: 264 };
const at = (top: number, right = 744) => ({ top, bottom: top + 44, left: right - 44, right });

describe("placeMenu", () => {
  it("opens below the trigger when it fits", () => {
    const p = placeMenu(at(100), menu, ipadPortrait);
    expect(p.up).toBe(false);
    expect(p.top).toBe(144 + MENU_GAP);
    expect(p.left).toBe(744 - 256);
  });

  it("flips up near the bottom edge (iPad portrait tanda menu: was cut off at y 1047 + 264 > 1194)", () => {
    const p = placeMenu(at(1000), menu, ipadPortrait);
    expect(p.up).toBe(true);
    expect(p.top + menu.height).toBeLessThanOrEqual(1000 - MENU_GAP);
    expect(p.top).toBeGreaterThanOrEqual(MENU_MARGIN);
  });

  it("keeps the menu above the bottom safe area", () => {
    const p = placeMenu(at(870), menu, ipadPortrait, { top: 24, bottom: 34, left: 0, right: 0 });
    expect(p.top + menu.height).toBeLessThanOrEqual(1194 - 34 - MENU_MARGIN);
  });

  it("shifts inside when neither side has room for the whole menu", () => {
    const short = { width: 834, height: 400 };
    const p = placeMenu(at(150), menu, short);
    expect(p.top).toBeGreaterThanOrEqual(MENU_MARGIN);
    expect(p.top + menu.height).toBeLessThanOrEqual(400 - MENU_MARGIN);
  });

  it("caps the height and scrolls when the menu is taller than the viewport", () => {
    const p = placeMenu(at(100), { width: 256, height: 900 }, { width: 834, height: 500 });
    expect(p.maxHeight).toBe(500 - 2 * MENU_MARGIN);
    expect(p.top).toBe(MENU_MARGIN);
  });

  it("never crosses the left or right edge", () => {
    expect(placeMenu(at(100, 60), menu, ipadPortrait).left).toBe(MENU_MARGIN);
    expect(placeMenu(at(100, 820), menu, ipadPortrait, undefined, "left").left).toBe(834 - MENU_MARGIN - 256);
  });
});
