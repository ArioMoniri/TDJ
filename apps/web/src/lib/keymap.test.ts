import { beforeEach, describe, expect, it } from "vitest";

// (vitest runs in node: a Map stands in for the browser's localStorage)
const mem = new Map<string, string>();
(
  globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }
).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
};

const {
  ACTIONS,
  actionOf,
  bindingsOf,
  comboOf,
  conflictsOf,
  formatCombo,
  isAction,
  matchesCombo,
  normalizeCombo,
  resetAllBindings,
  resetBinding,
  setBinding,
} = await import("./keymap");

const press = (
  key: string,
  m: Partial<{ meta: boolean; ctrl: boolean; alt: boolean; shift: boolean }> = {},
  code?: string,
) => ({
  key,
  code,
  metaKey: !!m.meta,
  ctrlKey: !!m.ctrl,
  altKey: !!m.alt,
  shiftKey: !!m.shift,
});

beforeEach(() => resetAllBindings());

describe("keymap: every shortcut in one list, rebindable per device", () => {
  it("combos read the same however they are typed", () => {
    expect(comboOf(press("z", { meta: true }), true)).toBe("mod+z");
    expect(comboOf(press("Z", { meta: true, shift: true }), true)).toBe("mod+shift+z");
    expect(comboOf(press("z", { ctrl: true }), false)).toBe("mod+z");
    expect(comboOf(press(" "), false)).toBe("space");
    expect(comboOf(press("P", { shift: true }), false)).toBe("shift+p");
    // a symbol carries its own shift
    expect(comboOf(press("?", { shift: true }), false)).toBe("?");
    // ⌥ changes the key on a Mac: the physical key is read
    expect(comboOf(press("∑", { alt: true }, "KeyW"), true)).toBe("alt+w");
    expect(comboOf(press("Shift", { shift: true }), true)).toBeNull();
    expect(normalizeCombo("Shift+Mod+Z")).toBe("mod+shift+z");
  });

  it("the defaults keep the old keys: ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo, the Booth's letters", () => {
    expect(isAction("edit.undo", press("z", { meta: true }))).toBe(true);
    expect(isAction("edit.undo", press("z", { ctrl: true }))).toBe(true);
    expect(isAction("edit.redo", press("z", { ctrl: true, shift: true }))).toBe(true);
    expect(isAction("edit.redo", press("y", { ctrl: true }))).toBe(true);
    expect(isAction("edit.undo", press("z"))).toBe(false);
    expect(isAction("edit.undo", press("z", { ctrl: true }))).toBe(true);
    // ⌘Y is not redo on a Mac (Ctrl+Y is, off a Mac)
    expect(matchesCombo(press("y", { meta: true }), "ctrl+y", true)).toBe(false);
    expect(matchesCombo(press("y", { ctrl: true }), "ctrl+y", false)).toBe(true);
    expect(matchesCombo(press("z", { ctrl: true }), "mod+z", true)).toBe(true);
    expect(actionOf(press("f"))).toBe("booth.fade");
    expect(actionOf(press("P", { shift: true }))).toBe("booth.stopPrelisten");
    expect(actionOf(press("p"))).toBe("booth.prelisten");
    expect(actionOf(press(" "))).toBe("booth.pause");
    expect(actionOf(press("ArrowUp", { alt: true }))).toBe("edit.moveUp");
    expect(actionOf(press("ArrowUp"))).toBe("booth.faderUp");
    // no default is bound twice
    const all = ACTIONS.flatMap((a) => a.defaults.map(normalizeCombo));
    expect(new Set(all).size).toBe(all.length);
  });

  it("a new binding replaces the old one, warns of a conflict and can take the key from the other action", () => {
    setBinding("booth.fade", ["g"]);
    expect(isAction("booth.fade", press("g"))).toBe(true);
    expect(isAction("booth.fade", press("f"))).toBe(false);
    expect(conflictsOf("x", "booth.fade")).toEqual(["booth.crossfade"]);
    setBinding("booth.fade", ["x"], { takeFrom: true });
    expect(bindingsOf("booth.crossfade")).toEqual([]);
    expect(actionOf(press("x"))).toBe("booth.fade");
    resetBinding("booth.fade");
    expect(bindingsOf("booth.fade")).toEqual(["f"]);
    resetAllBindings();
    expect(bindingsOf("booth.crossfade")).toEqual(["x"]);
  });

  it("kept on this device (localStorage), read back", () => {
    setBinding("edit.undo", ["mod+u"]);
    expect(localStorage.getItem("tdj-keymap")).toContain("mod+u");
    expect(matchesCombo(press("u", { meta: true }), "mod+u", true)).toBe(true);
    resetAllBindings();
    expect(localStorage.getItem("tdj-keymap")).toBeNull();
  });

  it("reads like the platform: ⌘⇧Z on a Mac, Ctrl+Shift+Z elsewhere", () => {
    expect(formatCombo("mod+shift+z", true)).toBe("⇧⌘Z");
    expect(formatCombo("mod+shift+z", false)).toBe("Ctrl+Shift+Z");
    expect(formatCombo("arrowright", false)).toBe("→");
    expect(formatCombo("f", false)).toBe("f");
    expect(formatCombo("shift+p", true)).toBe("⇧P");
  });
});
