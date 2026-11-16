import { describe, expect, it } from "vitest";
import { BOOTH_KEYMAP, boothKey, keyLabel } from "./keys";

/** 2026-11: the Booth's bindings in one place (Settings → Keyboard can make them editable) */
describe("booth keymap", () => {
  const ev = (key: string, o: Partial<KeyboardEvent> = {}) =>
    ({
      key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      ...o,
    }) as KeyboardEvent;
  it("Enter is Play now in the room (no modifier, no auto-repeat)", () => {
    expect(BOOTH_KEYMAP.playNow.key).toBe("Enter");
    expect(boothKey(ev("Enter"), "playNow")).toBe(true);
    expect(boothKey(ev("Enter", { metaKey: true }), "playNow")).toBe(false);
    expect(boothKey(ev("Enter", { repeat: true }), "playNow")).toBe(false);
    expect(boothKey(ev(" "), "playNow")).toBe(false);
  });
  it("a remapped binding is honoured; the help sheet prints the key", () => {
    expect(boothKey(ev("g"), "playNow", { playNow: { key: "g" } })).toBe(true);
    expect(boothKey(ev("Enter"), "playNow", { playNow: { key: "g" } })).toBe(false);
    expect(keyLabel("playNow")).toBe("enter");
    expect(keyLabel("playNow", { playNow: { key: "g" } })).toBe("g");
  });
});
