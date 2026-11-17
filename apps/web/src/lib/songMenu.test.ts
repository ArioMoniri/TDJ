import { afterEach, describe, expect, it, vi } from "vitest";
import { swallowReleaseClick } from "./songMenu";

/** a click through a capture-phase target, as the window sees a tap: true when it reached the page's own handler */
function tap(target: EventTarget, inner: EventTarget) {
  let reached = false;
  const own = () => {
    reached = true;
  };
  inner.addEventListener("click", own);
  const e = new Event("click", { cancelable: true });
  // (node has no DOM tree: the window's capture listener runs first, then the element's own)
  target.dispatchEvent(e);
  if (!e.defaultPrevented) inner.dispatchEvent(new Event("click"));
  inner.removeEventListener("click", own);
  return reached;
}

describe("swallowReleaseClick (the finger lifting off a long press is not a tap on the menu under it)", () => {
  afterEach(() => vi.useRealTimers());

  it("swallows the click that ends the press, once", () => {
    const win = new EventTarget();
    const item = new EventTarget();
    swallowReleaseClick(win);
    win.dispatchEvent(new Event("pointerup"));
    expect(tap(win, item)).toBe(false);
    // the DJ's own tap afterwards goes through
    expect(tap(win, item)).toBe(true);
  });

  it("a fresh press or a key ends the guard at once (Android's long press sends no click)", () => {
    const win = new EventTarget();
    const item = new EventTarget();
    swallowReleaseClick(win);
    win.dispatchEvent(new Event("pointerdown"));
    expect(tap(win, item)).toBe(true);
    swallowReleaseClick(win);
    win.dispatchEvent(new Event("keydown"));
    expect(tap(win, item)).toBe(true);
  });

  it("ends by itself shortly after the finger lifts when no click comes", () => {
    vi.useFakeTimers();
    const win = new EventTarget();
    const item = new EventTarget();
    swallowReleaseClick(win);
    // the finger is still down: no time limit yet
    vi.advanceTimersByTime(5000);
    win.dispatchEvent(new Event("touchend"));
    vi.advanceTimersByTime(399);
    vi.advanceTimersByTime(2);
    expect(tap(win, item)).toBe(true);
  });
});
