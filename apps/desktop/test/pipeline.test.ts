import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DATA_DIR, dataFiles, injectShim, SHIM_TAG, stripDynamic } from "../scripts/build-ui.mjs";
import { flattenAlpha, info, jpegSize } from "../scripts/png.mjs";
import { frameHtml } from "../store/compose";
import { DEVICES, LOCALES, outDir, outPath, SCENES, SIZES, scenesFor } from "../store/scenes";
import { resolveAsset } from "../store/serve";

describe("bundled UI build", () => {
  it("injects the bridge shim first in <head>, once", () => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><script src="/_next/a.js"></script></head>';
    const once = injectShim(html);
    expect(once.indexOf(SHIM_TAG)).toBeLessThan(once.indexOf("/_next/a.js"));
    expect(injectShim(once)).toBe(once);
  });

  it("ships every data file the engine loads (one list: packages/core/src/data.ts)", () => {
    const files = dataFiles();
    expect(files).toContain("data/index/songs.json");
    expect(files).toContain("data/knowledge/context_factors.json");
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const f of files)
      expect(existsSync(new URL(`../../../${f}`, import.meta.url).pathname), f).toBe(true);
    expect(DATA_DIR).toBe("tdj-data");
  });

  it("removes only the per-request rendering switches", () => {
    const src =
      'import x from "y";\nexport const dynamic = "force-dynamic";\nexport const revalidate = 0;\nexport const dynamicParams = true;\n';
    expect(stripDynamic(src)).toBe('import x from "y";\n\n\nexport const dynamicParams = true;\n');
  });
});

describe("standalone app", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  it("names no TDJ server: not in the config, the capabilities, the shim or the Rust sources", () => {
    for (const p of [
      "../src-tauri/tauri.conf.json",
      "../src-tauri/capabilities/default.json",
      "../ui/bridge-shim.js",
      "../src-tauri/src/settings.rs",
      "../src-tauri/src/lib.rs",
      "../src-tauri/src/commands.rs",
    ])
      expect(read(p), p).not.toMatch(/cloudfront\.net|DEFAULT_SERVER|TDJ_APP_BACKEND_URL/);
    expect(existsSync(new URL("../src-tauri/capabilities/remote.json", import.meta.url))).toBe(false);
  });

  it("the shim no longer sends /api to a server (the page's adapter answers it)", () => {
    const shim = read("../ui/bridge-shim.js");
    expect(shim).not.toMatch(/window\.fetch\s*=/);
    expect(shim).not.toMatch(/tdjapi/);
  });

  it("privacy answers: no data collected", () => {
    expect(read("../src-tauri/PrivacyInfo.xcprivacy")).toMatch(
      /<key>NSPrivacyCollectedDataTypes<\/key><array\/>/,
    );
    expect(read("../fastlane/app_privacy.md")).toMatch(/\*\*No\*\* \("Data Not Collected"\)/);
  });
});

describe("store screenshots", () => {
  it("every device size multiplies to the exact App Store size", () => {
    for (const d of DEVICES) {
      const s = SIZES[d];
      expect([s.width * s.scale, s.height * s.scale], d).toEqual([s.out.width, s.out.height]);
    }
    expect(SIZES.iphone69.out).toEqual({ width: 1320, height: 2868 });
    expect(SIZES.iphone65.out).toEqual({ width: 1284, height: 2778 });
    expect(SIZES.ipad13.out).toEqual({ width: 2064, height: 2752 });
    expect(SIZES.ipad129.out).toEqual({ width: 2048, height: 2732 });
    expect(SIZES.mac.out).toEqual({ width: 2880, height: 1800 });
  });

  it("5–8 scenes per device (Apple takes up to 10 per slot), unique ids, short captions per locale", () => {
    for (const d of DEVICES) {
      expect(scenesFor(d).length, d).toBeGreaterThanOrEqual(5);
      expect(scenesFor(d).length, d).toBeLessThanOrEqual(8);
    }
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    for (const s of SCENES)
      for (const l of LOCALES) {
        expect(s.caption[l].title.length, `${s.id} ${l}`).toBeLessThanOrEqual(38);
        expect(s.caption[l].sub.length, `${s.id} ${l}`).toBeLessThanOrEqual(72);
        expect(s.caption[l].title + s.caption[l].sub, `${s.id} ${l}`).not.toMatch(/!|\u2014/);
      }
  });

  it("deliver layout: iPhone and iPad 13 under screenshots/, Mac under screenshots_mac/, 12.9 kept apart", () => {
    expect(outPath("iphone69", "tr", "01_compose")).toBe("screenshots/tr/01_compose_iphone69.jpg");
    expect(outPath("ipad13", "en-US", "01_compose")).toBe("screenshots/en-US/01_compose_ipad13.jpg");
    expect(outPath("mac", "en-US", "01_compose")).toBe("screenshots_mac/en-US/01_compose_mac.jpg");
    // same App Store Connect slot as the 13-inch: never uploaded together
    expect(outDir("ipad129")).toBe("screenshots_ipad129");
  });

  it("the committed screenshots are all there, at their exact size, opaque JPEGs", () => {
    const fastlane = new URL("../fastlane/", import.meta.url).pathname;
    // store creative v2 (`pnpm store:creative`) replaces this set; test/creative.test.ts checks its files
    if (existsSync(`${fastlane}screenshots/en-US/05_dna_iphone69.jpg`)) return;
    for (const d of DEVICES)
      for (const l of LOCALES)
        for (const s of scenesFor(d)) {
          const p = fastlane + outPath(d, l, s.id);
          expect(existsSync(p), p).toBe(true);
          const got = jpegSize(readFileSync(p));
          expect({ width: got.width, height: got.height }, p).toEqual(SIZES[d].out);
          expect(got.components, p).toBe(3);
        }
  });

  it("the lanes upload iOS and Mac screenshots, not the 12.9 set by default", () => {
    const fastfile = readFileSync(new URL("../fastlane/Fastfile", import.meta.url), "utf8");
    expect(fastfile).toMatch(/deliver_common\("ios"/);
    expect(fastfile).toMatch(/deliver_common\("osx", File\.expand_path\("screenshots_mac"/);
    expect(fastfile).toMatch(/screenshots_ipad129/);
  });

  it("caption HTML is escaped", () => {
    const html = frameHtml({
      size: SIZES.iphone69,
      title: '<img src=x onerror="1">',
      sub: "<b>",
      image: "data:,",
      dark: true,
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
  });

  it("the preview server never serves files outside the bundle", () => {
    const dir = mkdtempSync(join(tmpdir(), "tdj-ui-"));
    writeFileSync(join(dir, "booth.html"), "b");
    writeFileSync(join(dir, "index.html"), "i");
    expect(resolveAsset(dir, "/booth")).toBe(join(dir, "booth.html"));
    expect(resolveAsset(dir, "/")).toBe(join(dir, "index.html"));
    expect(resolveAsset(dir, "/../../etc/passwd")).toBeNull();
    expect(resolveAsset(dir, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });
});

describe("png tools", () => {
  const rgbaPng = (w: number, h: number, px: [number, number, number, number]) => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunk = (t: string, d: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(d.length);
      return Buffer.concat([len, Buffer.from(t), d, Buffer.alloc(4)]); // CRC unchecked by the reader
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const rows = Buffer.concat(
      Array.from({ length: h }, () => Buffer.from([0, ...Array(w).fill(px).flat()])),
    );
    return Buffer.concat([
      sig,
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  };

  it("flattens RGBA onto the background and drops the alpha channel", () => {
    const out = flattenAlpha(rgbaPng(2, 2, [255, 0, 0, 128]), [0, 0, 255]);
    expect(info(out)).toMatchObject({ width: 2, height: 2, colorType: 2, alpha: false });
  });

  it("the committed iOS icons (iPhone, iPad, store) are all there, at their size, without alpha", () => {
    // iPhone: 20@2x/@3x, 29@2x/@3x, 40@2x/@3x, 60@2x/@3x; iPad: 20, 29, 40, 76 @1x/@2x, 83.5@2x; store 1024
    const want: Record<string, number> = {
      "AppIcon-20x20@2x.png": 40,
      "AppIcon-20x20@3x.png": 60,
      "AppIcon-29x29@2x.png": 58,
      "AppIcon-29x29@3x.png": 87,
      "AppIcon-40x40@2x.png": 80,
      "AppIcon-40x40@3x.png": 120,
      "AppIcon-60x60@2x.png": 120,
      "AppIcon-60x60@3x.png": 180,
      "AppIcon-20x20@1x.png": 20,
      "AppIcon-29x29@1x.png": 29,
      "AppIcon-40x40@1x.png": 40,
      "AppIcon-76x76@1x.png": 76,
      "AppIcon-76x76@2x.png": 152,
      "AppIcon-83.5x83.5@2x.png": 167,
      "AppIcon-512@2x.png": 1024,
    };
    for (const [name, px] of Object.entries(want)) {
      const p = new URL(`../src-tauri/icons/ios/${name}`, import.meta.url).pathname;
      expect(info(readFileSync(p)), name).toMatchObject({ width: px, height: px, alpha: false });
    }
  });

  it("Info.ios.plist: iPhone portrait, iPad every orientation, launch colour, no encryption", () => {
    const plist = readFileSync(new URL("../src-tauri/Info.ios.plist", import.meta.url), "utf8");
    const arr = (key: string) =>
      [
        ...(plist.split(`<key>${key}</key>`)[1]?.split("</array>")[0] ?? "").matchAll(
          /<string>(\w+)<\/string>/g,
        ),
      ].map((m) => m[1]);
    expect(arr("UISupportedInterfaceOrientations")).toEqual(["UIInterfaceOrientationPortrait"]);
    expect(arr("UISupportedInterfaceOrientations~iphone")).toEqual(["UIInterfaceOrientationPortrait"]);
    expect(arr("UISupportedInterfaceOrientations~ipad")).toHaveLength(4);
    expect(plist).toMatch(/<key>UILaunchScreen<\/key>/);
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key><false\/>/);
  });

  it("the release script builds one universal iOS app (iPhone + iPad)", () => {
    const sh = readFileSync(new URL("../../../scripts/release/mac-build.sh", import.meta.url), "utf8");
    expect(sh).toMatch(/FAMILY="\$\{TDJ_IOS_DEVICE_FAMILY:-1,2\}"/);
    expect(sh).not.toMatch(/TARGETED_DEVICE_FAMILY: "2"/);
    expect(sh).toMatch(/TDJ-iOS\.ipa/);
  });

  it("reads JPEG dimensions", () => {
    // SOI, SOF0 (len 17): precision 8, height 1800, width 2880, 3 components
    const sof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x08, 0x0b, 0x40, 0x03]);
    expect(jpegSize(sof)).toEqual({ width: 2880, height: 1800, components: 3 });
  });
});
