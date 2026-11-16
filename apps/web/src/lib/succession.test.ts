import { type Succession, type SuccessionSide, succession } from "@tdj/core";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n";
import { successionText } from "./succession";

const side = (x: Partial<SuccessionSide> & Pick<SuccessionSide, "orchestraId">): SuccessionSide => ({
  singer: null,
  rhythm: "tango",
  vocal: false,
  energy: 60,
  targetEnergy: 60,
  meanYear: 1941,
  ...x,
});
const DA = side({
  orchestraId: "juan-d-arienzo",
  energy: 82,
  energyClose: 84,
  targetEnergy: 76,
  meanYear: 1937,
});

afterEach(() => setLocale("en"));

describe("the succession line (inspector, swap sheet)", () => {
  it("follows well: one line with the strongest reasons and the corpus count", () => {
    const s = succession(
      DA,
      side({ orchestraId: "carlos-di-sarli", energy: 62, energyOpen: 64, targetEnergy: 64 }),
    );
    const v = successionText(s, "Juan D'Arienzo");
    expect(v.tone).toBe("good");
    expect(v.text).toMatch(/^Follows Juan D'Arienzo well: /);
    expect(v.text).toMatch(/common in DJ sets \(\d+×\)|lyrical after driving/);
    expect(v.text).not.toMatch(/\n/);
  });
  it("two rhythmic tandas in a row: the warning leads", () => {
    const s = succession(
      DA,
      side({ orchestraId: "rodolfo-biagi", energy: 80, targetEnergy: 76, meanYear: 1939 }),
    );
    const v = successionText(s, "Juan D'Arienzo");
    expect(v.tone).toBe("warn");
    expect(v.text).toMatch(/^Two rhythmic tandas in a row/);
  });
  it("in Turkish", () => {
    setLocale("tr");
    const s: Succession = succession(
      DA,
      side({ orchestraId: "rodolfo-biagi", energy: 80, targetEnergy: 76 }),
    );
    expect(successionText(s, "Juan D'Arienzo").text).toMatch(/^Arka arkaya iki ritmik tanda/);
  });
});
