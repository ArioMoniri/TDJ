import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./ruleCheck", () => ({
  gateEdit: vi.fn(async (o: { apply: (p: unknown, l: string) => unknown; after: unknown; label: string }) => {
    await o.apply(o.after, o.label);
    return "applied";
  }),
  reshaped: () => true,
  ruleText: (_m: string, text: string) => text,
}));
vi.mock("./toast", () => ({ toast: vi.fn() }));
vi.mock("./editHistory", () => ({ undoEdit: vi.fn() }));

import { applyFix, hideGuide, showGuide, useGuide } from "./spot";

type Night = { id: string; tag: string };
const night = (tag: string) => ({ id: "n", tag }) as unknown as import("./types").Playlist;

/**
 * 2026-11 (insert-remove e2e: "edit-guide-close" never stable): after a one-tap fix the guide asked the engine about
 * the fix alone (the night before the fix → after it), so the edit's other consequences ("the night is longer")
 * vanished with the card. The guide after a fix reads the whole edit again: the night before the edit → now.
 */
describe("the edit guide after a fix", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("compares the night before the edit with the night after the fix", async () => {
    const calls: Array<{ action: string; before?: Night; playlist?: Night }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body: string }) => {
        const b = JSON.parse(init.body);
        calls.push(b);
        if (b.action === "fix") return new Response(JSON.stringify({ ...night("fixed"), changed: true }));
        // the guide: the length line while the edit is compared from the start, the opening line until fixed
        const lines = [] as Array<{ key: string; message: string; text: string; fix?: unknown }>;
        if (b.before.tag === "start") lines.push({ key: "length", message: "", text: "longer" });
        if (b.playlist.tag !== "fixed")
          lines.push({
            key: "opening",
            message: "",
            text: "opening",
            fix: { message: "", text: "fix", fix: {} },
          });
        return new Response(JSON.stringify({ lines }));
      }),
    );
    const apply = vi.fn();
    await showGuide(night("start"), night("edited"), apply, "Tanda added");
    expect(useGuide.getState().lines.map((l) => l.key)).toEqual(["length", "opening"]);
    const opening = useGuide.getState().lines[1]!;
    expect(await applyFix(opening as never)).toBe(true);
    const last = calls.at(-1)!;
    expect(last.action).toBe("guide");
    expect(last.before?.tag).toBe("start");
    expect(last.playlist?.tag).toBe("fixed");
    // the length line stays, the opening line is gone: the card stays open with what is left
    expect(useGuide.getState().lines.map((l) => l.key)).toEqual(["length"]);
  });
  it("Keep (close) while a fix is on its way: the fix applies, the card stays closed", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body: string }) => {
        const b = JSON.parse(init.body);
        if (b.action === "fix") {
          await gate;
          return new Response(JSON.stringify({ ...night("fixed"), changed: true }));
        }
        return new Response(
          JSON.stringify({
            lines: [{ key: "opening", message: "", text: "o", fix: { message: "", text: "f", fix: {} } }],
          }),
        );
      }),
    );
    const apply = vi.fn();
    await showGuide(night("start"), night("edited"), apply, "Tanda added");
    const fixing = applyFix(useGuide.getState().lines[0] as never);
    hideGuide();
    release();
    expect(await fixing).toBe(true);
    expect(apply).toHaveBeenCalled();
    expect(useGuide.getState().lines).toEqual([]);
  });
});
