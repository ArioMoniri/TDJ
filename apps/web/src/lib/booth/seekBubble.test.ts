import { describe, expect, it } from "vitest";
import { placeSeekBubble } from "./seekBubble";

describe("the mini controller's jump bubble (the owner: 'UI issue for the jump guide')", () => {
  const bar = { left: 300, right: 1300, top: 860 };
  const buttons = { left: 1150, right: 1300, bottom: 852 };
  it("stands over its marker, its pointer on it", () => {
    const b = placeSeekBubble(bar, 180, 0.2, buttons);
    expect(b.left + b.tip).toBeCloseTo(200, 5);
    expect(b.left).toBe(110);
  });
  it("stays inside the bar at its start", () => {
    const b = placeSeekBubble(bar, 180, 0.01, buttons);
    expect(b.left).toBe(0);
    expect(b.tip).toBe(10);
  });
  it("never runs under the buttons over the bar's right part", () => {
    const b = placeSeekBubble(bar, 180, 0.97, buttons);
    expect(bar.left + b.left + 180).toBeLessThanOrEqual(buttons.left - 8);
    expect(b.tip).toBe(170);
  });
  it("with no buttons above, it keeps to the bar's end", () => {
    const b = placeSeekBubble(bar, 180, 1);
    expect(b.left).toBe(820);
  });
});
