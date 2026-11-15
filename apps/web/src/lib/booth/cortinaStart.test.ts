import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Playlist } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { cortinaHookOf, cortinaStartOf } from "./cortinaStart";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

describe("2026-11: where a cortina starts, as the Booth prints it", () => {
  it("a chorus start reads 'Starts at 0:42 (chorus)'", () => {
    const c = featured.tandas.map((t) => t.cortina).find((x) => cortinaHookOf(x?.id)?.kind === "chorus")!;
    const info = cortinaStartOf({ id: c.id, trimInSec: 42 });
    expect(info.label).toBe("Starts at 0:42 (chorus)");
    expect(info.kind).toBe("chorus");
  });
  it("the first verse, the DJ's own start, and a cortina from 0", () => {
    const fv = featured.tandas
      .map((t) => t.cortina)
      .find((x) => cortinaHookOf(x?.id)?.kind === "first-vocal")!;
    expect(cortinaStartOf({ id: fv.id, trimInSec: 26 }).label).toBe("Starts at 0:26 (first verse)");
    expect(cortinaStartOf({ id: fv.id, trimInSec: 12 }, { [fv.id]: { startSec: 12 } }).label).toBe(
      "Starts at 0:12 (your start)",
    );
    expect(cortinaStartOf({ id: "c-sing-sing", trimInSec: 0 }).label).toBe("Starts at 0:00");
  });
  it("every featured cortina with a start carries its hook data", () => {
    for (const t of featured.tandas) {
      const c = t.cortina;
      if (!c || !(c.startSec ?? 0)) continue;
      expect(cortinaHookOf(c.id)?.source, c.id).toBe("lyrics");
    }
  });
});
