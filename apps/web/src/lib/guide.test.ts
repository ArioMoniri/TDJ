import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_CHAPTERS, GUIDE_LOTTIES } from "./guide";
import { engineerWord } from "./plainWords";

const PUBLIC = join(__dirname, "../../public");
const all = GUIDE_CHAPTERS.map((c) =>
  [c.eyebrow, c.title, c.text, ...(c.points ?? []).flatMap((p) => [p.title, p.text])].join("\n"),
).join("\n");

describe("the Guide's tour", () => {
  it("explains every round-22 feature", () => {
    for (const words of [
      /Compose/,
      /Edit with AI/,
      /Build by hand/,
      /Booth/,
      /Pre-listen in your headphones/,
      /Mix/,
      /Cue and stop/,
      /Skip tonight/,
      /Last 4 tandas tango only/,
      /Jump to La Cumparsita/,
      /Era badges/,
      /Rooms/,
      /link, file or QR/,
      /Find songs/,
      /Versions and sources/,
      /Learned preferences/,
    ])
      expect(all).toMatch(words);
    expect(new Set(GUIDE_CHAPTERS.map((c) => c.id)).size).toBe(GUIDE_CHAPTERS.length);
  });
  it("speaks the DJ's language, never an engineer's", () => {
    for (const line of all.split("\n")) expect(engineerWord(line), line).toBeNull();
  });
  it("every chapter has a picture and somewhere to go", () => {
    for (const c of GUIDE_CHAPTERS) {
      expect(c.art).toBeTruthy();
      expect(c.where?.href).toMatch(/^\//);
    }
  });
  it("each Lottie is a small, valid loop in public/lottie", () => {
    expect(GUIDE_LOTTIES.length).toBeGreaterThanOrEqual(4);
    for (const src of GUIDE_LOTTIES) {
      expect(src).toMatch(/^\/lottie\/[a-z-]+\.json$/);
      const file = join(PUBLIC, src);
      expect(statSync(file).size, src).toBeLessThan(8 * 1024);
      const j = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> & {
        layers: Array<{ ty: number; op: number }>;
      };
      expect(j.v).toBeTruthy();
      expect(j.fr).toBeGreaterThan(0);
      expect(j.op as number).toBeGreaterThan(j.ip as number);
      expect(j.w).toBeGreaterThan(0);
      expect(j.layers.length).toBeGreaterThan(0);
      // shape layers only: no images, no fonts, nothing fetched at play time
      for (const l of j.layers) expect(l.ty).toBe(4);
      expect(j.assets).toEqual([]);
    }
  });
});
