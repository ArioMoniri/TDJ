/**
 * Store creative v3 (store/creative): the sizes and limits Apple sets, the black stage's layout (the whole device in
 * view, the words above it, each capture on its screen), what a store picture may show, all checked before anything
 * is rendered; and the rendered files when they are there (`pnpm store:creative` writes them into fastlane/).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { stillRect } from "../../video/src/three/handheld";
import { laptopBounds } from "../../video/src/three/laptop";
import { info, jpegSize } from "../scripts/png.mjs";
import { headlineHtml } from "../store/creative/art";
import { tangoBed, wav } from "../store/creative/audio";
import { HIDE_CSS, isCoverRequest, LYRICS_CSS } from "../store/creative/capture";
import { headerHtml, headerLayout, rawPath, stripHtml } from "../store/creative/compose";
import { macPreviewFits, previewHandheld, previewProblems, previewText } from "../store/creative/preview";
import {
  appRect,
  handheldFit,
  headlineSize,
  LEADING,
  oneLine,
  PLACE,
  stageGrid,
} from "../store/creative/showcase";
import {
  CAPTURE,
  HEADER_COPY,
  HEADERS,
  HYPE,
  headerFile,
  LOCALES,
  lines,
  PANELS,
  PREVIEW_CHAPTERS,
  PREVIEW_FPS,
  PREVIEWS,
  plain,
  previewFile,
  SET_IDS,
  SETS,
  SHOTS,
  shotFile,
} from "../store/creative/spec";

const FASTLANE = new URL("../fastlane/", import.meta.url).pathname;

describe("store creative: Apple's sizes", () => {
  it("every set is an App Store Connect size, and its capture multiplies to the same aspect", () => {
    const want: Record<string, [number, number]> = {
      iphone69: [1320, 2868],
      iphone65: [1284, 2778],
      ipad13: [2064, 2752],
      ipad129: [2048, 2732],
      mac: [2880, 1800],
      mac2560: [2560, 1600],
      duoOuter: [1398, 2034],
      duoInner: [2853, 2007],
    };
    for (const id of SET_IDS) {
      expect([SETS[id].out.width, SETS[id].out.height], id).toEqual(want[id]);
      const c = CAPTURE[SETS[id].capture];
      // portrait sets have portrait captures, landscape sets landscape ones
      expect(c.width > c.height, id).toBe(SETS[id].out.width > SETS[id].out.height);
    }
    // the Duo captures are taken at 3x and multiply to Apple's sizes exactly
    expect([CAPTURE.duoOuter.width * 3, CAPTURE.duoOuter.height * 3]).toEqual([1398, 2034]);
    expect([CAPTURE.duoInner.width * 3, CAPTURE.duoInner.height * 3]).toEqual([2853, 2007]);
    expect([CAPTURE.phone.width * 3, CAPTURE.phone.height * 3]).toEqual([1320, 2868]);
    expect([CAPTURE.tablet.width * 2, CAPTURE.tablet.height * 2]).toEqual([2064, 2752]);
  });

  it("one slot holds at most ten images: fallback sizes are kept in their own folders", () => {
    const perDir = new Map<string, number>();
    for (const id of SET_IDS) perDir.set(SETS[id].dir, (perDir.get(SETS[id].dir) ?? 0) + PANELS.length);
    // screenshots/ holds three slots (6.9", 6.5", iPad 13"): eight each
    expect(PANELS.length).toBeLessThanOrEqual(10);
    expect(SETS.ipad129.dir).not.toBe(SETS.ipad13.dir);
    expect(SETS.mac2560.dir).not.toBe(SETS.mac.dir);
    // deliver does not know iPhone Duo yet: those go up by hand
    expect(SETS.duoOuter.deliver).toBe(false);
    expect(SETS.duoInner.dir).not.toMatch(/^screenshots(_mac)?$/);
  });

  it("header assets: Apple's sizes, the safe area inside the image", () => {
    expect(HEADERS.map((h) => [h.width, h.height])).toEqual([
      [3840, 1646],
      [5244, 2950],
    ]);
    for (const h of HEADERS) {
      expect(h.safe.x + h.safe.width).toBeLessThanOrEqual(h.width);
      expect(h.safe.y + h.safe.height).toBeLessThanOrEqual(h.height);
      // key elements centred: the safe area sits on the vertical centre line
      expect(Math.abs(h.safe.x + h.safe.width / 2 - h.width / 2)).toBeLessThanOrEqual(2);
    }
    expect(HEADERS.find((h) => h.width === 5244)!.format).toBe("png");
  });

  it("app previews: Apple's resolutions, 15–30 s, ≤ 30 fps, deliver's file names", () => {
    expect(PREVIEWS.map((p) => [p.id, p.width, p.height])).toEqual([
      ["iphone", 886, 1920],
      ["ipad", 1200, 1600],
      ["mac", 1920, 1080],
    ]);
    const seconds = PREVIEW_CHAPTERS.reduce((n, c) => n + c.seconds, 0) + (30 + 54) / PREVIEW_FPS;
    expect(seconds).toBeGreaterThanOrEqual(15);
    expect(seconds).toBeLessThanOrEqual(30);
    expect(PREVIEW_FPS).toBeLessThanOrEqual(30);
    expect(previewFile(PREVIEWS[0]!, "tr")).toBe("app_previews/tr/IPHONE_67_tdj.mp4");
    expect(previewFile(PREVIEWS[1]!, "en-US")).toBe("app_previews/en-US/IPAD_PRO_3GEN_129_tdj.mp4");
    expect(previewFile(PREVIEWS[2]!, "en-US")).toBe("app_previews_mac/en-US/DESKTOP_tdj.mp4");
    // Spaceship's preview_type_from_filename: the first type in its list the upper-cased name contains
    const ALL = [
      "IPHONE_40",
      "IPHONE_47",
      "IPHONE_55",
      "IPHONE_58",
      "IPHONE_61",
      "IPHONE_65",
      "IPHONE_67",
      "IPAD_97",
      "IPAD_105",
      "IPAD_PRO_129",
      "IPAD_PRO_3GEN_11",
      "IPAD_PRO_3GEN_129",
      "DESKTOP",
    ];
    for (const p of PREVIEWS)
      expect(ALL.find((t) => previewFile(p, "en-US").toUpperCase().includes(t))).toBe(p.deliverType);
  });

  it("the preview check catches what App Store Connect refuses", () => {
    const ok = {
      width: 886,
      height: 1920,
      fps: 30,
      duration: 23,
      vcodec: "h264",
      profile: "High",
      level: 40,
      bitrate: 11e6,
      acodec: "aac",
      channels: 2,
      sampleRate: 48000,
    };
    expect(previewProblems(ok, PREVIEWS[0]!)).toEqual([]);
    expect(previewProblems({ ...ok, duration: 31 }, PREVIEWS[0]!)).toHaveLength(1);
    expect(previewProblems({ ...ok, fps: 60 }, PREVIEWS[0]!)).toHaveLength(1);
    expect(previewProblems({ ...ok, level: 51 }, PREVIEWS[0]!)).toHaveLength(1);
    expect(previewProblems({ ...ok, acodec: null, channels: 0, sampleRate: 0 }, PREVIEWS[0]!)).toHaveLength(
      1,
    );
  });
});

describe("store creative: words", () => {
  it("eight panels, every headline two lines, ≤ 30 characters, exactly one bold word, no hype", () => {
    expect(PANELS).toHaveLength(8);
    for (const p of PANELS)
      for (const l of LOCALES) {
        const h = p.headline[l];
        expect(lines(h), `${p.id} ${l}`).toHaveLength(2);
        expect([...plain(h).replace("\n", " ")].length, `${p.id} ${l}`).toBeLessThanOrEqual(30);
        expect(h.match(/\*[^*]+\*/g), `${p.id} ${l}`).toHaveLength(1);
        expect(plain(h), `${p.id} ${l}`).not.toMatch(HYPE);
        expect(plain(h)).not.toMatch(/—/);
      }
    for (const l of LOCALES) {
      expect(HEADER_COPY[l].match(/\*[^*]+\*/g)).toHaveLength(1);
      for (const c of PREVIEW_CHAPTERS) {
        expect([...plain(c.words[l])].length, c.shot).toBeLessThanOrEqual(32);
        expect(plain(c.words[l])).not.toMatch(HYPE);
      }
    }
  });

  it("every panel and chapter names a shot the capture takes", () => {
    const ids = new Set(SHOTS.map((s) => s.id));
    for (const p of PANELS) {
      expect(ids.has(p.shot), p.shot).toBe(true);
      if (p.bridge) expect(ids.has(p.bridge), p.bridge).toBe(true);
    }
    for (const c of PREVIEW_CHAPTERS) expect(ids.has(c.shot), c.shot).toBe(true);
  });

  it("headline HTML is escaped, the starred word bold", () => {
    expect(headlineHtml("a *b*\n<img>")).toBe(
      '<span class="ln">a <b>b</b></span><span class="ln">&#60;img&#62;</span>',
    );
  });
});

describe("store creative: drawing (Apple's black stage)", () => {
  const STILLS = { laptop: { light: "/tmp/light.png", dark: "/tmp/dark.png" }, handheld: "/tmp/hand.png" };

  it("every set: the whole device in the panel, under the words, filling it", () => {
    for (const id of SET_IDS) {
      const set = SETS[id];
      const { width: W, height: H } = set.out;
      const g = stageGrid(set.frame, W, H);
      const textBottom = g.top + g.lines * LEADING * g.size;
      const fit = handheldFit(id);
      // the device's outline (keys and hinge included) in px
      const o = fit
        ? {
            left: fit.outer.x,
            right: fit.outer.x + fit.outer.w,
            top: fit.outer.y,
            bottom: fit.outer.y + fit.outer.h,
          }
        : laptopBounds(W, H, PLACE.storeMac);
      expect(o.left, `${id} left`).toBeGreaterThan(W * 0.02);
      expect(o.right, `${id} right`).toBeLessThan(W * 0.98);
      expect(o.bottom, `${id} bottom (breathing room)`).toBeLessThan(H * 0.98);
      expect(o.top, `${id} clear of the headline`).toBeGreaterThan(textBottom + H * 0.01);
      // fill: the device takes the room left under the words
      const fillW = (o.right - o.left) / W;
      const fillH = (o.bottom - o.top) / (H - textBottom);
      expect(Math.max(fillW, fillH), `${id} fill`).toBeGreaterThan(0.8);
      if (!fit) {
        // Mac: the screen still ≥ 58 % of the panel's width, so the app reads at App Store size
        expect(appRect(W, H, PLACE.storeMac).w / W, id).toBeGreaterThanOrEqual(0.58);
        // some of the deck shows below the screen, and its front edge is in the picture
        const r = appRect(W, H, PLACE.storeMac);
        expect(o.bottom - (r.y + r.h), id).toBeGreaterThan(H * 0.03);
      } else {
        // handhelds: the screen is most of the panel's width (portrait) or height (the open foldable)
        const s = fit.screen;
        expect(W > H ? s.h / H : s.w / W, id).toBeGreaterThan(W > H ? 0.6 : 0.68);
      }
    }
  });

  it("each capture sits exactly on its device's screen rectangle, with the screen's corner radius", () => {
    for (const id of SET_IDS) {
      const set = SETS[id];
      const html = stripHtml(id, "tr", STILLS);
      const { width: W, height: H } = set.out;
      expect(html.match(/<section class="stage"/g), id).toHaveLength(PANELS.length);
      const fit = handheldFit(id);
      if (!fit) {
        const r = appRect(W, H, PLACE.storeMac);
        expect(html, id).toContain(
          `class="cap" src="${pathToFileURL(rawPath("mac", "tr", "compose")).href}"`,
        );
        expect(html, id).toContain(`left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`);
        expect(html).toContain("file:///tmp/dark.png");
        continue;
      }
      const s = fit.screen;
      const n = html.split(
        `class="scr" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border-radius:${s.r}px"`,
      ).length;
      expect(n - 1, id).toBe(PANELS.length);
      // the screen's aspect is the capture's: nothing cropped or stretched
      const c = CAPTURE[set.capture];
      expect(s.w / s.h, id).toBeCloseTo(c.width / c.height, 6);
      // the device picture is centred on the screen
      const sr = stillRect(fit);
      expect(sr.x + sr.w / 2).toBeCloseTo(s.x + s.w / 2, 6);
      expect(sr.y + sr.h / 2).toBeCloseTo(s.y + s.h / 2, 6);
    }
  });

  it("the words: the product line and one plain headline in the display face, inside the panel's safe margins", () => {
    for (const id of SET_IDS) {
      const set = SETS[id];
      const { width: W, height: H } = set.out;
      const g = stageGrid(set.frame, W, H);
      expect(g.kickerTop, id).toBeGreaterThan(H * 0.03);
      expect(g.top, id).toBeGreaterThan(g.kickerTop + g.kickerSize);
      // the headline box keeps 5 % of the width free each side; every line fits it at the set's size
      expect(g.width, id).toBeLessThanOrEqual(W * 0.9);
      for (const l of LOCALES) {
        const size = headlineSize(
          g,
          PANELS.map((p) => p.headline[l]),
        );
        expect(size).toBeLessThanOrEqual(g.size);
        for (const p of PANELS)
          for (const line of g.lines === 1 ? [oneLine(p.headline[l])] : lines(plain(p.headline[l])))
            expect([...line].length * 0.56 * size, `${id} ${l} ${line}`).toBeLessThanOrEqual(g.width);
      }
      const html = stripHtml(id, "en-US", STILLS);
      expect(html).toContain('<p class="kicker"');
      expect(html).not.toContain("Fraunces");
      expect(html).not.toContain("<b>");
    }
    expect(oneLine("Two DJs,\none *room*")).toBe("Two DJs, one room");
  });

  it("the header keeps the words and the lockup in Apple's safe area, devices outside it", () => {
    for (const h of HEADERS) {
      const html = headerHtml(h, "tr", { laptop: "/tmp/l.png", tablet: "/tmp/t.png", phone: "/tmp/p.png" });
      expect(html).toContain(
        `left:${h.safe.x}px;top:${h.safe.y}px;width:${h.safe.width}px;height:${h.safe.height}px`,
      );
      const devs = [
        ...html.matchAll(
          /class="dev" src="[^"]+" style="position:absolute;left:([-\d.]+)px;top:([-\d.]+)px;width:([\d.]+)px;height:([\d.]+)px/g,
        ),
      ];
      expect(devs).toHaveLength(3);
      for (const m of devs) {
        const l = Number(m[1]);
        const r = l + Number(m[3]);
        const inside = r > h.safe.x + 4 && l < h.safe.x + h.safe.width - 4;
        expect(inside, `${h.id}: device at ${l}–${r}`).toBe(false);
        expect(l).toBeGreaterThanOrEqual(-1);
        expect(r).toBeLessThanOrEqual(h.width + 1);
      }
      // the devices themselves, whole: the handhelds' outlines and the laptop inside the picture
      const L = headerLayout(h);
      for (const f of [L.tablet, L.phone]) {
        expect(f.outer.x + f.outer.w, h.id).toBeLessThan(h.width);
        expect(f.outer.y + f.outer.h, h.id).toBeLessThan(h.height);
        expect(f.outer.y, h.id).toBeGreaterThan(0);
      }
      const b = laptopBounds(L.laptop.canvas.w, L.laptop.canvas.h, L.laptop.place);
      expect(b.left).toBeGreaterThan(0);
      expect(b.right).toBeLessThan(h.safe.x);
      expect(b.bottom).toBeLessThan(h.height);
    }
  });

  it("app previews: the device whole under the words, its screen readable", () => {
    expect(macPreviewFits()).toBe(true);
    expect(PLACE.previewMac.w).toBeGreaterThanOrEqual(0.5);
    for (const spec of PREVIEWS.filter((p) => p.id !== "mac")) {
      const fit = previewHandheld(spec);
      const t = previewText(spec);
      expect(fit.outer.y, spec.id).toBeGreaterThan(t.bottom);
      expect(fit.outer.y + fit.outer.h, spec.id).toBeLessThan(spec.height);
      expect(fit.outer.x, spec.id).toBeGreaterThan(0);
      expect(fit.screen.w / spec.width, spec.id).toBeGreaterThan(0.6);
    }
  });

  it("the bed is an original synth: stereo, the right length, never clipping", () => {
    const b = tangoBed(2, 8000);
    expect(b.l.length).toBe(16000);
    let peak = 0;
    for (let i = 0; i < b.l.length; i++) peak = Math.max(peak, Math.abs(b.l[i]!), Math.abs(b.r[i]!));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
    const w = wav(b, 8000);
    expect(w.readUInt16LE(22)).toBe(2);
    expect(w.readUInt32LE(24)).toBe(8000);
  });
});

describe("store creative: the rendered files (when there)", () => {
  const present = (rel: string) => existsSync(join(FASTLANE, rel));
  it("screenshots: exact size, opaque JPEG", () => {
    for (const id of SET_IDS)
      for (const l of LOCALES)
        for (const p of PANELS) {
          const rel = shotFile(id, l, p.id);
          if (!present(rel) || !present(shotFile(id, l, "05_dna"))) continue;
          const got = jpegSize(readFileSync(join(FASTLANE, rel)));
          expect({ width: got.width, height: got.height }, rel).toEqual(SETS[id].out);
          expect(got.components, rel).toBe(3);
        }
  });

  it("no image in a deliver folder that this pipeline does not make (a stale set would go up beside the new one)", () => {
    const made = new Set<string>();
    for (const id of SET_IDS)
      for (const l of LOCALES) for (const p of PANELS) made.add(shotFile(id, l, p.id));
    // 01_compose is a v1 name too: a v2 run is told by a panel only v2 has
    const v2 = SET_IDS.some((id) => present(shotFile(id, "en-US", "05_dna")));
    if (!v2) return;
    for (const dir of new Set(SET_IDS.map((s) => SETS[s].dir)))
      for (const l of LOCALES) {
        const d = join(FASTLANE, dir, l);
        if (!existsSync(d)) continue;
        for (const f of readdirSync(d)) expect(made.has(`${dir}/${l}/${f}`), `${dir}/${l}/${f}`).toBe(true);
      }
  });

  it("header images: exact size, no alpha", () => {
    for (const h of HEADERS)
      for (const l of LOCALES) {
        const rel = headerFile(h, l);
        if (!present(rel)) continue;
        const buf = readFileSync(join(FASTLANE, rel));
        expect(info(buf), rel).toMatchObject({ width: h.width, height: h.height, alpha: false });
      }
  });
});

describe("store creative: what a store picture shows", () => {
  it("the README hero at rest keeps the app readable at 840 px (the screen ≥ 3/4 of the frame's width)", () => {
    expect(PLACE.heroRest.w).toBeGreaterThanOrEqual(0.75);
    expect(PLACE.heroWide.w).toBeLessThan(PLACE.heroRest.w);
  });

  it("no full lyrics in a store picture: lyrics blocks are blurred, the Floor keeps two lines", () => {
    expect(LYRICS_CSS).toMatch(/\[data-testid=song-lyrics-text\][^{]*\{filter:blur\(\d+px\)/);
    expect(LYRICS_CSS).toContain(".floor-lyrics p:nth-of-type(n+3){display:none");
  });

  it("no passing tips or toasts (the Rehearsal opening note), no labels' cover art", () => {
    for (const sel of ["[data-testid=toast]", "[data-testid=booth-opening-note]", "[role=tooltip]"])
      expect(HIDE_CSS).toContain(sel);
    expect(HIDE_CSS).toMatch(/\{display:none!important\}$/);
    // covers from the catalogue's hosts fail, so every tile shows the app's own generated art
    expect(isCoverRequest("https://cdn-images.dzcdn.net/images/cover/x/250x250.jpg", "image")).toBe(true);
    expect(isCoverRequest("https://i.scdn.co/image/ab67616d", "image")).toBe(true);
    expect(isCoverRequest("https://open.spotify.com/oembed?url=x", "fetch")).toBe(true);
    expect(isCoverRequest("http://127.0.0.1:3986/_next/static/media/logo.png", "image")).toBe(false);
    expect(isCoverRequest("http://127.0.0.1:9/preview/1.wav", "media")).toBe(false);
  });

  it("the Floor panel captures the Floor screen itself, not Now playing", () => {
    const floor = SHOTS.find((s) => s.id === "floor")!;
    const steps = JSON.stringify(floor.steps);
    expect(steps).toContain("floor-screen");
    // the Floor mode's button in Now playing (the Booth's floor feedback shares the test id)
    expect(steps).toContain('[data-testid=\\"now-view\\"] button[data-testid=\\"now-floor\\"]');
    expect(floor.steps!.find((s) => "waitFor" in s && s.waitFor.includes("floor-screen"))).not.toHaveProperty(
      "optional",
    );
  });
});
