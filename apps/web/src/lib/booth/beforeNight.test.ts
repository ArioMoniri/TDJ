import { describe, expect, it } from "vitest";
import { beforeTheNight, platformOf } from "./beforeNight";

describe("Before the night (Settings → Booth)", () => {
  it("knows the platform (an iPad's Safari reports a Mac: its touch points tell)", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("mac");
    expect(platformOf("anything", 0, "ipados")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
  });

  it("Focus can't be set by an app: always explained, with where to do it", () => {
    const l = beforeTheNight({
      platform: "ios",
      battery: null,
      wakeLock: true,
      roomKind: "built-in",
      native: true,
    });
    const focus = l.find((c) => c.id === "focus")!;
    expect(focus.status).toBe("info");
    expect(focus.help?.href).toMatch(/support\.apple\.com/);
    expect(l.find((c) => c.id === "alerts")!.text).toMatch(/alarm/i);
  });

  it("checks what it can: power, the screen lock, a wireless room", () => {
    const l = beforeTheNight({
      platform: "mac",
      battery: { charging: false, level: 0.62 },
      wakeLock: false,
      roomKind: "bluetooth",
      native: false,
    });
    const by = (id: string) => l.find((c) => c.id === id)!;
    expect(by("power")).toMatchObject({ status: "warn" });
    expect(by("power").text).toMatch(/62/);
    expect(by("screen").status).toBe("warn");
    expect(by("bluetooth").status).toBe("warn");
    const ok = beforeTheNight({
      platform: "mac",
      battery: { charging: true, level: 1 },
      wakeLock: true,
      roomKind: "usb",
      native: false,
    });
    expect(ok.filter((c) => c.status === "warn")).toEqual([]);
  });
});
