import { beforeEach, describe, expect, it } from "vitest";
import { clearEdits, recordEdit } from "./editHistory";
import { runHistory } from "./editToast";

/** three edits on one page; `night` is what is applied */
let night: string[] = [];
const edit = (label: string) => {
  night.push(label);
  recordEdit({
    label,
    scope: "/",
    undo: () => {
      night = night.filter((x) => x !== label);
    },
    redo: () => {
      night.push(label);
    },
  });
};

describe("runHistory: one ⌘Z is one undo, two are two", () => {
  beforeEach(() => {
    clearEdits();
    night = [];
    for (const l of ["a", "b", "c"]) edit(l);
  });

  it("the header's Undo, Redo and then ⌘Z at once: three steps (the key was lost within 250 ms of a click)", async () => {
    await runHistory("undo", { scope: "/" });
    await runHistory("redo", { scope: "/" });
    expect(night).toEqual(["a", "b", "c"]);
    await runHistory("undo", { source: "key" });
    expect(night).toEqual(["a", "b"]);
  });

  it("two presses of the key in quick succession undo twice", async () => {
    await runHistory("undo", { source: "key" });
    await runHistory("undo", { source: "key" });
    expect(night).toEqual(["a"]);
  });

  it("the Mac app: a key press and its Edit-menu command for the same ⌘Z undo once; the next ⌘Z (key and menu) once more", async () => {
    await runHistory("undo", { source: "key" });
    expect(await runHistory("undo", { source: "menu" })).toBeNull();
    expect(night).toEqual(["a", "b"]);
    await runHistory("undo", { source: "key" });
    expect(await runHistory("undo", { source: "menu" })).toBeNull();
    expect(night).toEqual(["a"]);
  });
});
