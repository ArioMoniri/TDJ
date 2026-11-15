import { describe, expect, it } from "vitest";
import { NAV_MAIN, NAV_MAIN_TITLE, NAV_PINNED, PHONE_MORE, PHONE_TABS, PILL_ITEMS } from "./navItems";

const every = [...NAV_MAIN, ...NAV_PINNED].map((i) => i.href).sort();

describe("navigation reaches every page on every device (wave 2)", () => {
  it("the iPad pill has every item, Rooms and Build by hand included", () => {
    expect(PILL_ITEMS.map((i) => i.href).sort()).toEqual(every);
    expect(PILL_ITEMS.map((i) => i.label)).toEqual(
      expect.arrayContaining(["Rooms", "Build by hand", "Booth"]),
    );
  });

  it("the iPhone tab bar plus its More tab has every item, Booth among the tabs", () => {
    expect([...PHONE_TABS, ...PHONE_MORE].map((i) => i.href).sort()).toEqual(every);
    expect(PHONE_TABS.map((i) => i.label)).toContain("Booth");
    expect(PHONE_TABS.length).toBeLessThanOrEqual(5);
  });

  it("the sidebar section is not named like an item inside it", () => {
    expect(NAV_MAIN.map((i) => i.label)).not.toContain(NAV_MAIN_TITLE());
  });
});
