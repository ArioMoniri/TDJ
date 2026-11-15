import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DATA_DIR, dataFiles, injectShim, SHIM_TAG, stripDynamic } from "../scripts/build-ui.mjs";
import { flattenAlpha, info, jpegSize } from "../scripts/png.mjs";
import { frameHtml } from "../store/compose";
import { LOCALES, outPath, PLATFORMS, SCENES, SIZES } from "../store/scenes";
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
  it("every platform size multiplies to the exact App Store size", () => {
    for (const p of PLATFORMS) {
      const s = SIZES[p];
      expect([s.width * s.scale, s.height * s.scale]).toEqual([s.out.width, s.out.height]);
    }
    expect(SIZES.mac.out).toEqual({ width: 2880, height: 1800 });
    expect(SIZES.ipad.out).toEqual({ width: 2752, height: 2064 });
  });

  it("1–10 scenes, unique ids, a caption per locale that fits two lines", () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(1);
    expect(SCENES.length).toBeLessThanOrEqual(10);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    for (const s of SCENES) for (const l of LOCALES) expect(s.caption[l].length).toBeLessThanOrEqual(48);
  });

  it("deliver layout: iPad under screenshots/, Mac under screenshots_mac/", () => {
    expect(outPath("ipad", "tr", "01_compose")).toBe("screenshots/tr/01_compose_ipad.jpg");
    expect(outPath("mac", "en-US", "01_compose")).toBe("screenshots_mac/en-US/01_compose_mac.jpg");
  });

  it("caption HTML is escaped", () => {
    const html = frameHtml({
      width: 100,
      height: 100,
      caption: '<img src=x onerror="1">',
      image: "data:,",
      dark: true,
    });
    expect(html).not.toContain("<img");
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

  it("the committed iPad icons have no alpha channel (App Store rule)", () => {
    const p = new URL("../src-tauri/icons/ios/AppIcon-512@2x.png", import.meta.url).pathname;
    expect(info(readFileSync(p))).toMatchObject({ width: 1024, height: 1024, alpha: false });
  });

  it("reads JPEG dimensions", () => {
    // SOI, SOF0 (len 17): precision 8, height 1800, width 2880, 3 components
    const sof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x08, 0x0b, 0x40, 0x03]);
    expect(jpegSize(sof)).toEqual({ width: 2880, height: 1800, components: 3 });
  });
});
