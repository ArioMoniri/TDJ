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
  keyOf,
  matchesCombo,
  migrateKeymap,
  normalizeCombo,
  resetAllBindings,
  resetBinding,
  setBinding,
  shownBindings,
  recordStep,
  reservedReason,
  proposeBinding,
  applyBinding,
  removeBinding,
  isDefaultBinding,
  setRecording,
  isRecording,
  useKeymap,
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

describe('redo on ⌘Y / Ctrl+Y (2026-11, the owner: "Ctrl or Cmd+Y to redo, editable")', () => {
  it("mod+y is a default of redo beside ⇧⌘Z and Ctrl+Y: ⌘Y on a Mac, Ctrl+Y elsewhere", () => {
    expect(ACTIONS.find((a) => a.id === "edit.redo")!.defaults).toEqual(["mod+shift+z", "mod+y", "ctrl+y"]);
    // a Mac: ⌘Y is mod+y (and ⌃Y still answers, as before)
    expect(comboOf(press("y", { meta: true }), true)).toBe("mod+y");
    expect(matchesCombo(press("y", { meta: true }), "mod+y", true)).toBe(true);
    expect(matchesCombo(press("y", { ctrl: true }), "ctrl+y", true)).toBe(true);
    expect(matchesCombo(press("y", { meta: true, alt: true }), "mod+y", true)).toBe(false);
    // Windows / Linux: Ctrl+Y is mod+y
    expect(comboOf(press("y", { ctrl: true }), false)).toBe("mod+y");
    expect(matchesCombo(press("y", { ctrl: true }), "mod+y", false)).toBe(true);
    expect(matchesCombo(press("y", { ctrl: true, shift: true }), "mod+y", false)).toBe(false);
    expect(matchesCombo(press("y"), "mod+y", false)).toBe(false);
    // the actions: Ctrl+Y redoes, never undoes; Y alone is nothing
    expect(isAction("edit.redo", press("y", { ctrl: true }))).toBe(true);
    expect(isAction("edit.undo", press("y", { ctrl: true }))).toBe(false);
    expect(actionOf(press("y"))).toBeNull();
  });

  it("shown once per platform: ⇧⌘Z ⌘Y ⌃Y on a Mac, Ctrl+Shift+Z Ctrl+Y elsewhere", () => {
    const redo = bindingsOf("edit.redo");
    expect(shownBindings(redo, true).map((c) => formatCombo(c, true))).toEqual(["⇧⌘Z", "⌘Y", "⌃Y"]);
    expect(shownBindings(redo, false).map((c) => formatCombo(c, false))).toEqual(["Ctrl+Shift+Z", "Ctrl+Y"]);
  });

  it("editable: replaced, cleared, reset (one action or all) brings ⌘Y back", () => {
    setBinding("edit.redo", ["mod+r"]);
    expect(matchesCombo(press("y", { meta: true }), bindingsOf("edit.redo")[0]!, true)).toBe(false);
    resetBinding("edit.redo");
    expect(bindingsOf("edit.redo")).toContain("mod+y");
    setBinding("edit.redo", []);
    expect(bindingsOf("edit.redo")).toEqual([]);
    resetAllBindings();
    expect(bindingsOf("edit.redo")).toEqual(["mod+shift+z", "mod+y", "ctrl+y"]);
    // saving the defaults again keeps nothing of the DJ's (it follows later defaults)
    setBinding("edit.redo", ["mod+shift+z", "mod+y", "ctrl+y"]);
    expect(localStorage.getItem("tdj-keymap")).toBeNull();
  });

  it("one key per platform: Ctrl+Y and mod+y are one key off a Mac, ⌃Y and ⌘Y two on a Mac", () => {
    expect(keyOf("ctrl+y", false)).toBe("mod+y");
    expect(keyOf("mod+y", false)).toBe("mod+y");
    expect(keyOf("ctrl+y", true)).toBe("ctrl+y");
    expect(keyOf("mod+y", true)).toBe("mod+y");
  });

  it("conflicts: Ctrl+Y given to another action is named first, then taken from redo (both its spellings)", () => {
    // (vitest runs as Windows / Linux: Ctrl+Y records as mod+y)
    expect(conflictsOf("mod+y", "edit.swap")).toEqual(["edit.redo"]);
    expect(conflictsOf("ctrl+y", "edit.swap")).toEqual(["edit.redo"]);
    setBinding("edit.swap", ["mod+y"], { takeFrom: true });
    expect(bindingsOf("edit.redo")).toEqual(["mod+shift+z"]);
    expect(actionOf(press("y", { ctrl: true }), ["edit.redo", "edit.swap"])).toBe("edit.swap");
    // ⇧⌘Z / Ctrl+Shift+Z still redoes
    expect(isAction("edit.redo", press("z", { ctrl: true, shift: true }))).toBe(true);
  });

  it("a key the DJ chose before ⌘Y was a default stays theirs: the new default never takes it back", () => {
    const custom = migrateKeymap({ "booth.fade": ["mod+y"] });
    expect(bindingsOf("edit.redo", custom)).toEqual(["mod+shift+z"]);
    expect(bindingsOf("booth.fade", custom)).toEqual(["mod+y"]);
    expect(conflictsOf("mod+y", "edit.undo", custom)).toEqual(["booth.fade"]);
    // a key elsewhere leaves redo's defaults whole
    expect(bindingsOf("edit.redo", migrateKeymap({ "booth.fade": ["mod+g"] }))).toHaveLength(3);
  });

  it("saved keymaps: redo never changed (or saved as the old defaults) gets ⌘Y; a redo of their own stays", () => {
    expect(bindingsOf("edit.redo", migrateKeymap({ "booth.fade": ["g"] }))).toContain("mod+y");
    const old = migrateKeymap({ "edit.redo": ["Mod+Shift+Z", "ctrl+y"], "booth.fade": ["g"] });
    expect(old["edit.redo"]).toBeUndefined();
    expect(bindingsOf("edit.redo", old)).toEqual(["mod+shift+z", "mod+y", "ctrl+y"]);
    const own = migrateKeymap({ "edit.redo": ["ctrl+y"] });
    expect(bindingsOf("edit.redo", own)).toEqual(["ctrl+y"]);
    expect(migrateKeymap(null)).toEqual({});
    expect(migrateKeymap({ "edit.redo": "mod+y", nope: ["x"] })).toEqual({});
  });
});

describe('a key chip records its replacement (2026-11, the owner: "click the key shown, then press the new keys")', () => {
  beforeEach(() => setRecording(false));

  it("record: a combo with its modifiers; Esc cancels, Tab leaves, ⌫ / Delete clear, a modifier alone waits", () => {
    expect(recordStep(press("k"), false)).toEqual({ kind: "combo", combo: "k" });
    expect(recordStep(press("K", { ctrl: true, shift: true }), false)).toEqual({
      kind: "combo",
      combo: "mod+shift+k",
    });
    expect(recordStep(press("k", { meta: true, alt: true }, "KeyK"), true)).toEqual({
      kind: "combo",
      combo: "mod+alt+k",
    });
    expect(recordStep(press("Escape"), false)).toEqual({ kind: "cancel" });
    expect(recordStep(press("Escape", { meta: true }), true)).toEqual({ kind: "cancel" });
    expect(recordStep(press("Tab"), false)).toEqual({ kind: "leave" });
    expect(recordStep(press("Tab", { shift: true }), false)).toEqual({ kind: "leave" });
    expect(recordStep(press("Backspace"), false)).toEqual({ kind: "clear" });
    expect(recordStep(press("Delete"), false)).toEqual({ kind: "clear" });
    // with a modifier, ⌫ is a key like any other
    expect(recordStep(press("Backspace", { meta: true }), true)).toEqual({
      kind: "combo",
      combo: "mod+backspace",
    });
    expect(recordStep(press("Shift", { shift: true }), false)).toEqual({ kind: "wait" });
    expect(recordStep(press("Meta", { meta: true }), true)).toEqual({ kind: "wait" });
  });

  it("while a chip records, no shortcut runs (the Booth's keys, undo); after, they do again", () => {
    expect(isAction("booth.pause", press(" "))).toBe(true);
    setRecording(true);
    expect(isRecording()).toBe(true);
    expect(isAction("booth.pause", press(" "))).toBe(false);
    expect(actionOf(press("z", { ctrl: true }))).toBeNull();
    setRecording(false);
    expect(actionOf(press(" "))).toBe("booth.pause");
  });

  it("reserved: ⌘Q ⌘W ⌘T ⌘R (Ctrl off a Mac) and the like are refused with their reason", () => {
    expect(reservedReason("mod+q", true)).toBe("keys.reserved_quit");
    expect(reservedReason("mod+w", true)).toBe("keys.reserved_close");
    expect(reservedReason("mod+t", false)).toBe("keys.reserved_new_tab");
    expect(reservedReason("mod+r", false)).toBe("keys.reserved_reload");
    expect(reservedReason("ctrl+r", false)).toBe("keys.reserved_reload");
    expect(reservedReason("mod+shift+t", false)).toBe("keys.reserved_reopen");
    expect(reservedReason("alt+f4", false)).toBe("keys.reserved_close");
    expect(reservedReason("f5", false)).toBe("keys.reserved_reload");
    expect(reservedReason("mod+h", true)).toBe("keys.reserved_hide");
    // ⌃R on a Mac is not ⌘R; Ctrl+H off a Mac is not the system's
    expect(reservedReason("ctrl+r", true)).toBeNull();
    expect(reservedReason("mod+h", false)).toBeNull();
    // a default is never reserved
    for (const a of ACTIONS)
      for (const c of a.defaults) {
        expect(reservedReason(c, true), `${a.id} ${c} (Mac)`).toBeNull();
        expect(reservedReason(c, false), `${a.id} ${c}`).toBeNull();
      }
    expect(proposeBinding("booth.pause", "mod+w", undefined, false)).toEqual({
      status: "reserved",
      reason: "keys.reserved_close",
    });
  });

  it("propose: fine, its own already, or a conflict that names the other action", () => {
    expect(proposeBinding("booth.pause", "k", undefined, false)).toEqual({ status: "ok" });
    expect(proposeBinding("booth.pause", "space", undefined, false)).toEqual({ status: "same" });
    expect(proposeBinding("booth.pause", "f", undefined, false)).toEqual({
      status: "conflict",
      with: ["booth.fade"],
    });
    // off a Mac Ctrl+Y is redo's mod+y: its own key, not a new one
    expect(proposeBinding("edit.redo", "ctrl+y", undefined, false)).toEqual({ status: "same" });
  });

  it("replace one chip: the key takes the chip's place; the store has it at once, and this device keeps it", () => {
    applyBinding("booth.pause", "k", "space");
    expect(bindingsOf("booth.pause")).toEqual(["k"]);
    expect(useKeymap.getState().custom["booth.pause"]).toEqual(["k"]);
    expect(actionOf(press("k"))).toBe("booth.pause");
    expect(actionOf(press(" "))).toBeNull();
    expect(isDefaultBinding("booth.pause")).toBe(false);
    expect(localStorage.getItem("tdj-keymap")).toContain('"booth.pause":["k"]');
  });

  it("conflict → Replace takes the key from the other action; Cancel (no apply) changes nothing", () => {
    const before = JSON.stringify(useKeymap.getState().custom);
    expect(proposeBinding("booth.pause", "f", undefined, false).status).toBe("conflict");
    expect(JSON.stringify(useKeymap.getState().custom)).toBe(before);
    applyBinding("booth.pause", "f", "space", { takeFrom: true });
    expect(bindingsOf("booth.pause")).toEqual(["f"]);
    expect(bindingsOf("booth.fade")).toEqual([]);
    expect(actionOf(press("f"))).toBe("booth.pause");
  });

  it("multi-binding: each chip of redo is its own (replace the middle one, add one, remove one)", () => {
    // (vitest runs off a Mac: redo shows Ctrl+Shift+Z and Ctrl+Y; the Ctrl+Y chip is both mod+y and ctrl+y)
    expect(shownBindings(bindingsOf("edit.redo"), false)).toEqual(["mod+shift+z", "mod+y"]);
    applyBinding("edit.redo", "mod+e", "mod+y");
    expect(bindingsOf("edit.redo")).toEqual(["mod+shift+z", "mod+e"]);
    applyBinding("edit.redo", "mod+shift+y", null);
    expect(bindingsOf("edit.redo")).toEqual(["mod+shift+z", "mod+e", "mod+shift+y"]);
    // replacing the first keeps the order
    applyBinding("edit.redo", "mod+alt+z", "mod+shift+z");
    expect(bindingsOf("edit.redo")).toEqual(["mod+alt+z", "mod+e", "mod+shift+y"]);
    // a key the action already has on another chip is not doubled
    applyBinding("edit.redo", "mod+e", "mod+shift+y");
    expect(bindingsOf("edit.redo")).toEqual(["mod+alt+z", "mod+e"]);
    removeBinding("edit.redo", "mod+alt+z");
    expect(bindingsOf("edit.redo")).toEqual(["mod+e"]);
    removeBinding("edit.redo", "mod+e");
    expect(bindingsOf("edit.redo")).toEqual([]);
    expect(isDefaultBinding("edit.redo")).toBe(false);
  });

  it("reset: one row puts its defaults back (taking them back from an action given one), Reset all every one", () => {
    applyBinding("booth.fade", "space", "f", { takeFrom: true });
    expect(bindingsOf("booth.pause")).toEqual([]);
    applyBinding("booth.next", "l", "arrowright");
    resetBinding("booth.pause");
    expect(bindingsOf("booth.pause")).toEqual(["space"]);
    expect(isDefaultBinding("booth.pause")).toBe(true);
    // the fade gave Space back
    expect(bindingsOf("booth.fade")).toEqual([]);
    expect(bindingsOf("booth.next")).toEqual(["l"]);
    resetAllBindings();
    for (const a of ACTIONS) expect(isDefaultBinding(a.id), a.id).toBe(true);
    expect(localStorage.getItem("tdj-keymap")).toBeNull();
  });
});
