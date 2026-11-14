// App Store Connect limits for every metadata file (fastlane deliver layout). A one-character miss is a
// rejected upload, so the limits are enforced here rather than discovered on the Mac.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const META = new URL("../fastlane/metadata/", import.meta.url).pathname;
const LOCALES = ["en-US", "tr"];
const read = (p: string) => readFileSync(META + p, "utf8");
const chars = (s: string) => [...s].length;

const LIMITS: Record<string, number> = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "promotional_text.txt": 170,
  "description.txt": 4000,
  "release_notes.txt": 4000,
};

describe.each(LOCALES)("metadata %s", (locale) => {
  it.each(Object.entries(LIMITS))("%s within %i characters and not empty", (file, max) => {
    const text = read(`${locale}/${file}`).trim();
    expect(text.length).toBeGreaterThan(0);
    expect(chars(text)).toBeLessThanOrEqual(max);
  });

  it("keywords: ≤ 100 bytes, comma-separated without spaces around commas, no word from the name", () => {
    const kw = read(`${locale}/keywords.txt`).trim();
    expect(Buffer.byteLength(kw, "utf8")).toBeLessThanOrEqual(100);
    expect(kw).not.toMatch(/\s,|,\s/);
    const name = read(`${locale}/name.txt`).toLowerCase();
    for (const k of kw.split(",")) {
      expect(k.length).toBeGreaterThan(0);
      expect(name.split(/[^a-zçğıöşü]+/i)).not.toContain(k.toLowerCase());
    }
    expect(new Set(kw.split(",")).size).toBe(kw.split(",").length);
  });

  it("URLs are https and point at the project", () => {
    for (const f of ["support_url.txt", "marketing_url.txt", "privacy_url.txt"]) {
      expect(read(`${locale}/${f}`).trim()).toMatch(/^https:\/\/github\.com\/ArioMoniri\/TDJ/);
    }
  });

  it("description makes no claim the app cannot back (pre-listen ships with the Booth cue UI)", () => {
    const d = read(`${locale}/description.txt`).toLowerCase();
    expect(d).not.toMatch(/pre-listen|kulaklıkta dinleyin|iphone/);
  });
});

describe("shared metadata", () => {
  it("category Music, copyright, review notes say no login", () => {
    expect(read("primary_category.txt").trim()).toBe("MUSIC");
    expect(read("copyright.txt").trim()).toBe("© 2026 Ario Moniri");
    const notes = read("review_information/notes.txt");
    expect(notes).toMatch(/No login/);
    expect(notes.length).toBeLessThanOrEqual(4000);
  });

  it("the privacy policy the metadata links to exists in the repo", () => {
    expect(existsSync(new URL("../../../docs/PRIVACY.md", import.meta.url).pathname)).toBe(true);
  });

  it("age rating config is valid JSON with no unrestricted web access", () => {
    const cfg = JSON.parse(read("app_rating_config.json"));
    expect(cfg.unrestrictedWebAccess).toBe(false);
    expect(cfg.gambling).toBe(false);
  });

  it("no personal e-mail or phone committed in metadata", () => {
    for (const f of ["review_information/notes.txt", "en-US/description.txt", "tr/description.txt"]) {
      expect(read(f)).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|\+\d{6,}/i);
    }
  });
});
