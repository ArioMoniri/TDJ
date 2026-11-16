import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEdits,
  onEdit,
  recordEdit,
  recordSnapshot,
  redoEdit,
  undoEdit,
  useEditHistory,
} from "./editHistory";

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

describe("2026-11: the Booth's actions in the same history", () => {
  it("edits of one control in a row merge (a slider dragged): one undo goes back to before the drag", async () => {
    let gain = 0;
    const set = (to: number) => {
      const before = gain;
      gain = to;
      recordEdit({
        label: `gain ${to}`,
        key: "trim:a",
        undo: () => {
          gain = before;
        },
        redo: () => {
          gain = to;
        },
        scope: "/booth",
      });
    };
    set(1);
    set(2);
    set(3);
    expect(useEditHistory.getState().past).toHaveLength(1);
    const e = await undoEdit({ scope: "/booth" });
    // the merged entry's undo is the first one's: back to before the drag
    expect(e?.label).toBe("gain 3");
    expect(gain).toBe(0);
    await redoEdit({ scope: "/booth" });
    expect(gain).toBe(3);
  });

  it("a different control does not merge", () => {
    recordEdit({ label: "a", key: "trim:a", undo: () => {}, redo: () => {}, scope: "/booth" });
    recordEdit({ label: "b", key: "trim:b", undo: () => {}, redo: () => {}, scope: "/booth" });
    recordEdit({ label: "c", undo: () => {}, redo: () => {}, scope: "/booth" });
    expect(useEditHistory.getState().past).toHaveLength(3);
  });

  it("what already played in the room cannot be un-heard: a blocked entry says why and leaves the history", async () => {
    edit(1, "/booth");
    recordEdit({
      label: "Next now",
      undo: () => {
        throw new Error("never");
      },
      redo: () => {},
      blocked: () => "it already played",
      scope: "/booth",
    });
    const first = await undoEdit({ scope: "/booth" });
    expect(first?.why).toBe("it already played");
    expect(night).toBe(1);
    // the next press reaches the edit before it
    const second = await undoEdit({ scope: "/booth" });
    expect(second?.label).toBe("set 1");
    expect(night).toBe(0);
  });

  it("every record, undo and redo is announced (the playlist sync follows the night)", async () => {
    const seen: string[] = [];
    const off = onEdit((e, kind) => seen.push(`${kind}:${e.label}`));
    edit(5);
    await undoEdit({ scope: "/" });
    await redoEdit({ scope: "/" });
    off();
    edit(6);
    expect(seen).toEqual(["record:set 5", "undo:set 5", "redo:set 5"]);
  });
});
