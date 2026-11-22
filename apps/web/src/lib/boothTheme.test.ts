import { describe, expect, it } from "vitest";
import { htmlTheme } from "./boothTheme";
import { DEFAULT_SETTINGS } from "./types";

/** 2026-11 (the owner: "the Booth tab is always in dark mode"): the Booth follows Appearance; always-dark is opt-in */
describe("the Booth's theme", () => {
  const at = (theme: "auto" | "light" | "dark", boothDark = false, systemDark = false) =>
    htmlTheme(theme, { booth: true, boothDark, systemDark });

  it("follows the app's appearance: Light is light, Dark is dark, Auto follows the device", () => {
    expect(at("light")).toBe("light");
    expect(at("dark")).toBe("dark");
    expect(at("auto", false, false)).toBe("light");
    expect(at("auto", false, true)).toBe("dark");
  });

  it('"Always dark in the Booth" is off by default, and dark whatever the appearance when on', () => {
    expect(DEFAULT_SETTINGS.boothDark ?? false).toBe(false);
    expect(at("light", true)).toBe("dark");
    expect(at("auto", true, false)).toBe("dark");
  });

  it("other pages keep the app's own value (Auto stays Auto)", () => {
    for (const t of ["auto", "light", "dark"] as const)
      expect(htmlTheme(t, { booth: false, boothDark: true, systemDark: true })).toBe(t);
  });
});
