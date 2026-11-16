import { describe, expect, it } from "vitest";
import type { Tanda } from "@/lib/types";
import { realDelta, shownDelta, tandaSec, tandasSec } from "./endBasis";

/** QA 2026-11: Change the end in Rehearsal works on the clock the DJ sees (30 s clips), the real night on real lengths */
const tanda = (lens: number[], cortina: number | null = 45, bypass = false) =>
  ({
    songs: lens.map((d, i) => ({ id: `s${i}`, durationSec: d })),
    cortina: cortina === null ? null : { id: "c", lengthSec: cortina },
    bypass,
  }) as unknown as Tanda;

const REHEARSAL = { clipSec: 30, gapSec: 2.5 };
const REAL = { clipSec: null, gapSec: 2.5 };

describe("the end's time basis", () => {
  it("a tanda on the rehearsal clock counts each item at most its 30 s clip, plus the gap", () => {
    const t = tanda([180, 170, 160, 175], 45);
    expect(tandaSec(t, REHEARSAL)).toBe(5 * 30 + 5 * 2.5);
    expect(tandaSec(t, REAL)).toBe(180 + 170 + 160 + 175 + 45 + 5 * 2.5);
    expect(tandaSec(tanda([180], 45, true), REAL)).toBe(0);
  });

  it("a wish on the rehearsal clock becomes the same share of the real night (10 rehearsal min ≈ 6 tandas)", () => {
    const rest = Array.from({ length: 10 }, () => tanda([180, 180, 180, 180], 45));
    const wish = 10 * 60;
    const real = realDelta(wish, rest, REHEARSAL);
    // a rehearsal tanda is 162.5 s, a real one 777.5 s: 10 rehearsal minutes are ~3.7 rehearsal tandas
    expect(real / tandaSec(rest[0]!, REAL)).toBeCloseTo(wish / tandaSec(rest[0]!, REHEARSAL), 6);
    // on the real night the wish is the engine's own
    expect(realDelta(wish, rest, REAL)).toBe(wish);
  });

  it("the preview's end moves by what the change takes on the shown clock, never a real length on a clip clock", () => {
    const before = [tanda([180, 180, 180, 180]), tanda([170, 170, 170])];
    const after = [...before, tanda([200, 200, 200, 200])];
    expect(shownDelta(before, after, REHEARSAL)).toBe(5 * 32.5);
    expect(shownDelta(before, after, REAL)).toBe(800 + 45 + 5 * 2.5);
    expect(shownDelta(after, before, REHEARSAL)).toBe(-5 * 32.5);
    expect(tandasSec(after, REHEARSAL)).toBe(5 * 32.5 + 4 * 32.5 + 5 * 32.5);
  });
});
