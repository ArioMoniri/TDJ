import { beforeEach, describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  clearEdits,
  HISTORY_LIMIT,
  historyKey,
  isTextTarget,
  recordEdit,
  recordSnapshot,
  redoEdit,
  undoEdit,
  useEditHistory,
} from "./editHistory";

/** a night as a number: each edit sets it, undo puts the old one back */
let night = 0;
const edit = (to: number, scope = "/") => {
  const before = night;
  night = to;
  return recordSnapshot(
    `set ${to}`,
    before,
    to,
    (x) => {
      night = x;
    },
    scope,
  );
};

beforeEach(() => {
  clearEdits();
  night = 0;
});

describe("one undo / redo history", () => {
  it("undo walks back edit by edit, redo forward again", async () => {
    edit(1);
    edit(2);
    edit(3);
    await undoEdit({ scope: "/" });
    expect(night).toBe(2);
    await undoEdit({ scope: "/" });
    expect(night).toBe(1);
    await redoEdit({ scope: "/" });
    expect(night).toBe(2);
    await redoEdit({ scope: "/" });
    expect(night).toBe(3);
    expect(await redoEdit({ scope: "/" })).toBeNull();
  });
  it("a new edit after an undo drops what could be redone", async () => {
    edit(1);
    edit(2);
    await undoEdit({ scope: "/" });
    edit(5);
    expect(canRedo("/")).toBe(false);
    await undoEdit({ scope: "/" });
    expect(night).toBe(1);
  });
  it("the toast's Undo is the same history: undoing that edit makes it redoable", async () => {
    const id = edit(7);
    await undoEdit({ id });
    expect(night).toBe(0);
    expect(canUndo("/")).toBe(false);
    await redoEdit({ scope: "/" });
    expect(night).toBe(7);
  });
  it("each page undoes its own edits only (the Booth never reaches into Compose)", async () => {
    edit(1, "/");
    let booth = 0;
    recordEdit({
      label: "booth",
      scope: "/booth",
      undo: () => {
        booth = -1;
      },
      redo: () => {
        booth = 1;
      },
    });
    await undoEdit({ scope: "/booth" });
    expect(booth).toBe(-1);
    expect(night).toBe(1);
    expect(await undoEdit({ scope: "/booth" })).toBeNull();
    await undoEdit({ scope: "/" });
    expect(night).toBe(0);
  });
  it("waits for an async undo before taking the next press, and keeps at most the limit", async () => {
    let release: () => void = () => {};
    recordEdit({
      label: "slow",
      scope: "/",
      undo: () => new Promise<void>((r) => (release = r)),
      redo: () => {},
    });
    const first = undoEdit({ scope: "/" });
    expect(await undoEdit({ scope: "/" })).toBeNull();
    release();
    expect((await first)?.label).toBe("slow");
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) edit(i);
    expect(useEditHistory.getState().past).toHaveLength(HISTORY_LIMIT);
  });
});

describe("the keys", () => {
  const k = (
    key: string,
    m: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {},
  ) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...m,
  });
  it("⌘Z / Ctrl+Z undo; ⇧⌘Z, Ctrl+Shift+Z, ⌘Y and Ctrl+Y redo; nothing else", () => {
    expect(historyKey(k("z", { metaKey: true }))).toBe("undo");
    expect(historyKey(k("z", { ctrlKey: true }))).toBe("undo");
    expect(historyKey(k("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(historyKey(k("z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(historyKey(k("y", { ctrlKey: true }))).toBe("redo");
    expect(historyKey(k("z"))).toBeNull();
    expect(historyKey(k("z", { metaKey: true, altKey: true }))).toBeNull();
    expect(historyKey(k("y", { metaKey: true }))).toBe("redo");
    expect(historyKey(k("y", { metaKey: true, shiftKey: true }))).toBeNull();
    expect(historyKey(k("y"))).toBeNull();
  });
  it("a text field keeps its own undo; a button or a checkbox does not", () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) =>
      ({ tagName, ...extra }) as unknown as Element;
    expect(isTextTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isTextTarget(el("TEXTAREA"))).toBe(true);
    expect(isTextTarget(el("DIV", { isContentEditable: true }))).toBe(true);
    expect(isTextTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTextTarget(el("BUTTON"))).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});
