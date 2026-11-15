import { describe, expect, it } from "vitest";
import { createScrollLock } from "./scrollLock";

describe("scroll lock (round 23: the trackpad could not scroll after two sheets)", () => {
  it("unlocks when overlapping sheets close out of order", () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    const l = createScrollLock(root);
    const a = l.lock();
    const b = l.lock();
    expect("scrollLock" in root.dataset).toBe(true);
    a(); // the first sheet finishes closing after the second opened
    expect("scrollLock" in root.dataset).toBe(true);
    b();
    expect("scrollLock" in root.dataset).toBe(false);
    expect(l.count).toBe(0);
  });

  it("a release called twice does not unlock another sheet", () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    const l = createScrollLock(root);
    const a = l.lock();
    a();
    a();
    const b = l.lock();
    a();
    expect("scrollLock" in root.dataset).toBe(true);
    b();
    expect("scrollLock" in root.dataset).toBe(false);
  });
});
