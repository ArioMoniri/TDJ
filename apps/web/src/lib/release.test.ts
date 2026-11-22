import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canSelfUpdate,
  channelOf,
  compareVersions,
  LINKS,
  updateLink,
  updateState,
  versionLabel,
} from "./release";

describe("release: one version for web and apps", () => {
  it("compares versions as semver", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("x", "1.0.0")).toBeNull();
  });

  it("a newer version or a later deploy of the same version is an update; older or garbage never is", () => {
    const local = { version: "1.0.0", commit: "aaaaaaa" };
    expect(updateState({ version: "1.1.0", commit: "b" }, local)).toBe("newer");
    expect(updateState({ version: "1.0.0", commit: "bbbbbbb" }, local)).toBe("redeployed");
    expect(updateState({ version: "1.0.0", commit: "aaaaaaa" }, local)).toBe("current");
    expect(updateState({ version: "0.9.0", commit: "c" }, local)).toBe("current");
    expect(updateState({ version: "nope" }, local)).toBe("current");
    expect(updateState(null, local)).toBe("current");
    // a dev build without a commit is not told to reload
    expect(updateState({ version: "1.0.0", commit: "b" }, { version: "1.0.0", commit: "" })).toBe("current");
  });

  it("channel per install: web, DMG, Mac App Store, iPhone and iPad", () => {
    expect(channelOf(false, { platform: "macos" })).toBe("web");
    expect(channelOf(true, { platform: "macos", appStore: false, updater: true })).toBe("dmg");
    expect(channelOf(true, { platform: "macos", appStore: true })).toBe("mac-app-store");
    expect(channelOf(true, { platform: "ipados", appStore: true })).toBe("ios");
  });

  it('"Check for updates" only in the DMG Mac app, never the Mac App Store, iPhone/iPad or the web', () => {
    expect(canSelfUpdate(true, { platform: "macos", appStore: false, updater: true })).toBe(true);
    expect(canSelfUpdate(true, { platform: "macos", appStore: true, updater: true })).toBe(false);
    expect(canSelfUpdate(true, { platform: "macos", appStore: false, updater: false })).toBe(false);
    expect(canSelfUpdate(true, { platform: "macos", appStore: false })).toBe(false);
    expect(canSelfUpdate(true, { platform: "ipados", appStore: true, updater: true })).toBe(false);
    expect(canSelfUpdate(true, { platform: "ios", updater: true })).toBe(false);
    expect(canSelfUpdate(false, { platform: "macos", updater: true })).toBe(false);
    expect(canSelfUpdate(true, null)).toBe(false);
  });

  it("each channel gets its own link; the web reloads instead", () => {
    expect(updateLink("web")).toBeNull();
    expect(updateLink("dmg")).toMatch(/github\.com\/.+\/releases$/);
    // the store links only once the App Store listing is live; before that the public TestFlight link, if any
    for (const c of ["ios", "mac-app-store"] as const) {
      const l = updateLink(c);
      if (LINKS.appStoreLive) expect(l).toMatch(/^https:\/\/apps\.apple\.com\/app\/id\d+/);
      else expect(l === null || l.startsWith("https://testflight.apple.com/")).toBe(true);
    }
  });

  it("labels the version with its short commit", () => {
    expect(versionLabel("1.0.0", "0123456789ab")).toBe("1.0.0 (0123456)");
    expect(versionLabel("1.0.0", "")).toBe("1.0.0");
  });

  it("the build reads the root package.json (next.config.ts and the app's UI build)", () => {
    for (const p of ["../../next.config.ts", "../../../desktop/scripts/build-ui.mjs"])
      expect(readFileSync(new URL(p, import.meta.url), "utf8")).toMatch(/releaseEnv\(\)/);
  });
});
