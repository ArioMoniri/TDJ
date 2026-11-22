import { describe, expect, it } from "vitest";
import { en } from "./i18n/en";
import { tr } from "./i18n/tr";
import {
  fold,
  hashTarget,
  SECTION_GROUPS,
  SECTION_META,
  SECTIONS,
  SETTINGS,
  searchSettings,
  sectionOf,
} from "./settingsIndex";

/** the ids of the settings a query finds, best first */
const ids = (q: string, app = false) => searchSettings(q, { app }).flatMap((g) => g.entries.map((e) => e.id));
const first = (q: string, app = false) => ids(q, app)[0];

describe("the Settings map", () => {
  it("every category is in the phone list once, and every setting sits in a category", () => {
    expect(SECTION_GROUPS.flat().sort()).toEqual([...SECTIONS].sort());
    for (const e of SETTINGS) expect(SECTIONS).toContain(e.section);
    for (const s of SECTIONS) expect(SETTINGS.some((e) => e.section === s)).toBe(true);
  });

  it("ids are unique and every label, help and category text exists in English and Turkish, without placeholders", () => {
    expect(new Set(SETTINGS.map((e) => e.id)).size).toBe(SETTINGS.length);
    const keys = [
      ...SETTINGS.flatMap((e) => [e.label, e.help]),
      ...SECTIONS.flatMap((s) => [SECTION_META[s].title, SECTION_META[s].blurb]),
    ].filter((k): k is keyof typeof en => !!k);
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(tr[k], k).toBeTruthy();
      expect(en[k], k).not.toMatch(/\{\w+\}/);
    }
  });

  it("every setting names where it is on the page", () => {
    for (const e of SETTINGS) expect(e.target.length, e.id).toBeGreaterThan(0);
  });
});

describe("searchSettings", () => {
  it("finds a setting by its label", () => {
    expect(first("Reduce transparency")).toBe("reduce-transparency");
    expect(first("battery saver")).toBe("battery-saver");
    expect(first("file naming")).toBe("file-naming");
  });

  it("finds a setting by a synonym", () => {
    expect(first("dark mode")).toBe("theme");
    expect(first("hotkey")).toBe("shortcuts");
    expect(first("midi")).toBe("controller");
    expect(ids("rekordbox")).toContain("dj-apps");
  });

  it("finds a setting by its help text", () => {
    expect(ids("chimes")).toContain("sounds");
  });

  it("finds a setting by a Turkish query, with or without the Turkish letters", () => {
    expect(first("karanlık")).toBe("theme");
    expect(first("kulaklık")).toBe("outputs");
    expect(first("KULAKLIK")).toBe("outputs");
    expect(first("kulaklik")).toBe("outputs");
    expect(first("pil tasarrufu")).toBe("battery-saver");
    expect(first("şarkı sözü")).toBe("lyrics");
    expect(first("dil")).toBe("language");
  });

  it("matches the start of words, every word of the query", () => {
    expect(first("transp")).toBe("reduce-transparency");
    expect(ids("spotify login")).toEqual(["spotify"]);
    expect(ids("zzzz")).toEqual([]);
    expect(ids("   ")).toEqual([]);
  });

  it("groups the results by category, the best category first", () => {
    const g = searchSettings("cortina");
    expect(g[0]!.section).toBe("night");
    expect(g[0]!.entries.map((e) => e.id)).toEqual(
      expect.arrayContaining(["cortina-chorus", "cortina-length", "cortina-follow"]),
    );
    for (const x of g) for (const e of x.entries) expect(e.section).toBe(x.section);
  });

  it("finds the merged rows: my own Spotify app, Check for updates (the apps)", () => {
    expect(first("own spotify app")).toBe("spotify-own-app");
    expect(ids("check for updates", true)).toContain("check-updates");
    expect(ids("check for updates")).not.toContain("check-updates");
  });

  it("an app-only setting shows only in the apps", () => {
    expect(ids("server")).not.toContain("tdj-server");
    expect(ids("server", true)).toContain("tdj-server");
  });
});

describe("deep links", () => {
  it("a hash finds its setting's category; an old anchor still works", () => {
    expect(hashTarget("#ai-key")).toEqual({ id: "ai-key", section: "ai" });
    expect(hashTarget("#app-connections")).toEqual({ id: "app-connections", section: "connections" });
    expect(hashTarget("#settings-keyboard")).toEqual({ id: "settings-keyboard", section: "keyboard" });
    expect(hashTarget("#lyrics-sources")).toEqual({ id: "lyrics-sources", section: "connections" });
    expect(hashTarget("#connections")).toEqual({ id: "connectors", section: "connections" });
    expect(hashTarget("#battery")).toEqual({ id: "", section: "battery" });
    expect(hashTarget("#something-else")).toEqual({ id: "something-else", section: null });
  });

  it("a query names a category; a sign-in coming back opens Connections", () => {
    expect(sectionOf({ section: "ai" })).toBe("ai");
    expect(sectionOf({ section: "nope" })).toBeNull();
    expect(sectionOf({ error: "spotify_denied" })).toBe("connections");
    expect(sectionOf({ connected: "dropbox" })).toBe("connections");
    expect(sectionOf({})).toBeNull();
  });

  it("folds case and Turkish letters", () => {
    expect(fold("İstanbul KULAKLIK Müzik")).toBe("istanbul kulaklik muzik");
  });
});
