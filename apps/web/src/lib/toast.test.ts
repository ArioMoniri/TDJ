import { beforeEach, describe, expect, it } from "vitest";
import { useSheets } from "./sheets";
import { toast, toastStale, useGlobalToast } from "./toast";

/**
 * QA 2026-11: "Undid: crossfade · Redo" showed inside the Stop the music? sheet, "Lo Pasado, Pasó plays next · Undo"
 * inside Change the end — a toast must never sit over a modal sheet opened after it.
 */
describe("a toast and the sheets", () => {
  beforeEach(() => {
    useSheets.setState({ open: 0 });
    useGlobalToast.getState().dismiss();
  });

  it("a sheet opening over a live Undo / Redo toast dismisses it", () => {
    toast("Undid: Crossfade", () => {}, "Redo");
    expect(useGlobalToast.getState().toast?.sheets).toBe(0);
    useSheets.getState()._inc();
    expect(useGlobalToast.getState().toast).toBeNull();
  });

  it("a toast raised inside the open sheet stays (its inline status) and floats on when the sheet closes", () => {
    useSheets.getState()._inc();
    toast("Lo Pasado, Pasó plays next", () => {});
    expect(useGlobalToast.getState().toast?.text).toBe("Lo Pasado, Pasó plays next");
    useSheets.getState()._dec();
    expect(useGlobalToast.getState().toast?.sheets).toBe(0);
    // … and the next sheet to open takes it away
    useSheets.getState()._inc();
    expect(useGlobalToast.getState().toast).toBeNull();
  });

  it("a second sheet over the first dismisses the first sheet's toast", () => {
    useSheets.getState()._inc();
    toast("Saved");
    useSheets.getState()._inc();
    expect(useGlobalToast.getState().toast).toBeNull();
  });

  it("toastStale: only when more sheets are open than when it appeared", () => {
    expect(toastStale(null, 3)).toBe(false);
    expect(toastStale({ sheets: 0 }, 0)).toBe(false);
    expect(toastStale({ sheets: 1 }, 1)).toBe(false);
    expect(toastStale({ sheets: 0 }, 1)).toBe(true);
    expect(toastStale({}, 1)).toBe(true);
  });
});
