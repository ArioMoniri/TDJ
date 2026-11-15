import { describe, expect, it } from "vitest";
import { metaLine, yearText } from "./year";

describe("the year display (wave 2: an unknown year is hidden, never `?`)", () => {
  it("yearText: a real year, or null", () => {
    expect(yearText(1941)).toBe("1941");
    expect(yearText(null)).toBeNull();
    expect(yearText(undefined)).toBeNull();
    expect(yearText(0)).toBeNull();
    expect(yearText(Number.NaN)).toBeNull();
  });
  it("metaLine joins the known parts with ` · ` and leaves the unknown ones out", () => {
    expect(metaLine("Bandonegro", yearText(null))).toBe("Bandonegro");
    expect(metaLine("La Cumparsita", "Bandonegro", yearText(undefined))).toBe("La Cumparsita · Bandonegro");
    expect(metaLine("Di Sarli", null, "", yearText(1940))).toBe("Di Sarli · 1940");
    expect(metaLine("x", yearText(null))).not.toContain("?");
  });
});
