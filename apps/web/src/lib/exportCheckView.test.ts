import { afterEach, describe, expect, it } from "vitest";
import { checkView } from "./exportCheckView";
import { verify } from "./exportVerify";
import { setLocale } from "./i18n";

afterEach(() => setLocale("en"));
const night = Array.from({ length: 5 }, (_, i) => ({
  kind: (i === 2 ? "cortina" : "track") as "track" | "cortina",
  tanda: 1,
  song: i < 2 ? i + 1 : 1,
  title: `T${i}`,
  artist: "A",
}));
const keys = night.map((_, i) => `k${i}`);

describe("checkView (the sheet's verified result)", () => {
  it("all there: N of N, in order ✓, every row marked ✓", () => {
    const v = checkView(
      "Spotify",
      verify(keys, keys),
      night,
      keys.map(() => ({})),
    );
    expect(v.summary).toBe("5 of 5 in Spotify, in order ✓");
    expect(v.ok).toBe(true);
    expect(v.rows.map((r) => r.mark)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(v.rows[2]!.slot).toBe("Cortina 1");
    expect(v.rows[1]!.slot).toBe("Tanda 1, song 2");
  });
  it("a missing cortina is named with its tanda; replaced and unavailable rows are listed", () => {
    const r = verify(keys, ["k0", { key: "k1", available: false }, "k3", "k4"]);
    const v = checkView("Spotify", { ...r, replaced: [{ at: 0 }] }, night, [{}, {}, {}, {}]);
    expect(v.ok).toBe(false);
    expect(v.summary).toBe("2 of 5 in Spotify, in order");
    const text = v.lines.join("\n");
    expect(text).toContain("Missing: T2 (A) (cortina 1)");
    expect(text).toContain(
      "1 track was not available in your country and was replaced with another version: T0 (A) (tanda 1)",
    );
    expect(text).toContain("Not available in your country: T1 (A) (tanda 1)");
    expect(v.rows.find((x) => x.mark === "missing")?.pos).toBe(3);
    expect(v.fixable).toBe(true);
  });
  it("speaks Turkish", () => {
    setLocale("tr");
    const v = checkView(
      "Spotify",
      verify(keys, keys),
      night,
      keys.map(() => ({})),
    );
    expect(v.summary).toBe("5 parçanın 5 tanesi Spotify'da, sırası doğru ✓");
  });
});
