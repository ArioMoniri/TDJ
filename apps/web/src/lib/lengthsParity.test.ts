/**
 * 2026-11 (the DJ-user review): Compose said 4:35:12, tanda 1 = 11:37 and cortinas 48 s / 41 s; the Booth said
 * 4:42:04, tanda 1 = 11:41 and every cortina 0:45. One played length per item now: the checked Spotify recording's
 * `durationMs` (else the index length), the DJ's cues, each cortina from its start for its own length (or the DJ's
 * cortina length when set). Compose's numbers and the Booth plan's must be the same seconds; the Booth's gaps are
 * apart ("music + gaps").
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attachBooth, type Playlist } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { withSpotifyLengths } from "./booth/clips";
import { durationLabel } from "./booth/plan";
import {
  boothCortinaStop,
  cortinaPlaySec,
  fmtLen,
  lengthOf,
  musicSec,
  nightLength,
  tandaTotal,
  wholeSec,
} from "./lengths";
import { lengthText } from "./nightName";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

/** the Booth's plan as `rePlan` makes it (the inputs that decide the lengths) */
const boothPlan = (p: Playlist, settings: { cortinaStopSec?: number | null } = {}) =>
  attachBooth(withSpotifyLengths(p), { cortinaStopSec: boothCortinaStop(settings) }).booth!;

describe("2026-11: Compose and the Booth print the same lengths", () => {
  for (const settings of [{}, { cortinaStopSec: 45 }]) {
    const label = settings.cortinaStopSec ? "the DJ's 45 s cortinas" : "the composed cortina lengths";
    it(`every tanda's total matches, the featured night (${label})`, () => {
      const plan = boothPlan(featured, settings);
      featured.tandas.forEach((t, ti) => {
        const booth = plan.items
          .filter((x) => x.kind === "track" && x.tanda === ti + 1)
          .reduce((a, x) => a + x.lengthSec, 0);
        const compose = tandaTotal(t.songs, featured.booth?.songCues).sec;
        expect(Math.round(compose)).toBe(Math.round(booth));
      });
    });
    it(`every cortina and every side has one length; the night's music matches (${label})`, () => {
      const plan = boothPlan(featured, settings);
      const byId = new Map(plan.items.map((x) => [x.id, x]));
      for (const t of featured.tandas) {
        for (const s of t.songs)
          expect(lengthOf(s, featured.booth?.songCues)).toBeCloseTo(byId.get(s.id)!.lengthSec, 2);
        if (t.cortina)
          expect(cortinaPlaySec(t.cortina, settings)).toBeCloseTo(byId.get(t.cortina.id)!.lengthSec, 2);
      }
      expect(Math.round(nightLength(featured, settings).sec)).toBe(Math.round(musicSec(plan.items)));
    });
  }
  it("the cortinas follow their composed lengths (not one 45 s for all) unless the DJ sets a length", () => {
    const plan = boothPlan(featured);
    const lens = new Set(plan.items.filter((x) => x.kind === "cortina").map((x) => Math.round(x.lengthSec)));
    expect(lens.size).toBeGreaterThan(1);
    const fixed = boothPlan(featured, { cortinaStopSec: 45 });
    for (const c of fixed.items.filter((x) => x.kind === "cortina"))
      expect(c.lengthSec).toBeLessThanOrEqual(45);
  });
  it("the Booth's wall clock is the music plus its gaps", () => {
    const plan = boothPlan(featured);
    const gaps = plan.items.reduce((a, x) => a + x.gapAfterSec - (x.overlapAfterSec ?? 0), 0);
    const breaks = plan.items.reduce((a, x) => a + (x.kind === "break" ? x.lengthSec : 0), 0);
    expect(plan.wallClockSec).toBeCloseTo(musicSec(plan.items) + gaps + breaks, 1);
  });
});

describe("QA fix 2026-11: one rounding rule (Compose 2:38 / 10:58 against the Booth's 2:37 / 10:57)", () => {
  it("every side, tanda and the night print the same m:ss in Compose (fmtLen) and the Booth (durationLabel)", () => {
    const plan = boothPlan(featured);
    const byId = new Map(plan.items.map((x) => [x.id, x]));
    featured.tandas.forEach((t, ti) => {
      for (const s of t.songs)
        expect(fmtLen(lengthOf(s, featured.booth?.songCues))).toBe(durationLabel(byId.get(s.id)!.lengthSec));
      const booth = plan.items
        .filter((x) => x.kind === "track" && x.tanda === ti + 1)
        .reduce((a, x) => a + x.lengthSec, 0);
      expect(fmtLen(tandaTotal(t.songs, featured.booth?.songCues).sec)).toBe(durationLabel(booth));
    });
    expect(fmtLen(nightLength(featured).sec)).toBe(durationLabel(musicSec(plan.items)));
  });
  it("whole seconds are floored, and a sum of exact lengths keeps its second", () => {
    expect(fmtLen(157.9)).toBe("2:37");
    expect(durationLabel(157.9)).toBe("2:37");
    expect(wholeSec(0.1 + 0.2 + 657.7)).toBe(658);
    expect(lengthText(4 * 3600 + 36 * 60 + 59)).toBe("4 h 36 min");
  });
});
