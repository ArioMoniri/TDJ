import { describe, expect, it } from "vitest";
import { COMPOSE_STEPS, composeStep, DEFAULT_COMPOSE_MS, expectedComposeMs } from "./composeProgress";

describe("compose progress (wave 2, item 5)", () => {
  it("names the engine's four stages in the DJ's words", () => {
    expect(COMPOSE_STEPS).toEqual(["Choosing tandas", "Ordering", "Cortinas", "Checking the night"]);
  });
  it("walks the steps in order as time passes and holds on the last", () => {
    const at = (ms: number) => composeStep(ms, 10_000).step;
    expect(at(0)).toBe(0);
    expect(at(3500)).toBe(1);
    expect(at(5000)).toBe(2);
    expect(at(6000)).toBe(3);
    expect(at(60_000)).toBe(3);
    const seen = [0, 1000, 3000, 4600, 5600, 9000].map(at);
    expect([...seen].sort()).toEqual(seen);
  });
  it("the bar never reaches the end before the answer", () => {
    expect(composeStep(5000, 10_000).share).toBeCloseTo(0.5);
    expect(composeStep(30_000, 10_000).share).toBeLessThan(0.96);
    expect(composeStep(30_000, 10_000).share).toBeGreaterThan(0.9);
  });
  it("without a measurement (no storage in node) it expects the default", () => {
    expect(expectedComposeMs()).toBe(DEFAULT_COMPOSE_MS);
  });
});
