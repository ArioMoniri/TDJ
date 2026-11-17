/**
 * README stills: a real screenshot (2×, a phone 3×), framed like the clips (the brand background, the 3D-rendered
 * laptop, tablet or phone from apps/video/public/frames, a soft shadow), saved as WebP. The frame is put together
 * by the same browser from a small HTML page, so no image library is needed.
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import type { Browser, Page } from "playwright";
import {
  fitDevice,
  frameFile,
  frameOver,
  frameUnder,
  type Kind,
  screenRadius,
  screenRect,
} from "../../../video/src/frames";
import { newCtx, offlineAudio, openBooth, openFeatured, settle } from "./clips";

/** the device picture as a data URL (`pnpm media:frames` renders them; they are committed) */
const frameData = (kind: Kind) =>
  `data:image/png;base64,${readFileSync(new URL(`../../../video/public/${frameFile(kind)}`, import.meta.url)).toString("base64")}`;

import { ffmpeg } from "./ffmpeg";

export type StillCtx = { browser: Browser; base: string; out: string };

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 };
const IPAD = {
  viewport: { width: 1180, height: 820 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const PHONE = {
  // an iPhone 15 Pro class screen (393 × 852 pt, 3×) less its 54 pt status bar, which the frame draws
  viewport: { width: 393, height: 798 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

const BG =
  "radial-gradient(1100px 700px at 12% 8%, #f07aa0 0%, transparent 60%), radial-gradient(900px 800px at 92% 96%, #5b2a86 0%, transparent 62%), linear-gradient(135deg, #b0305e 0%, #7a2350 52%, #3b1840 100%)";

/**
 * The screenshot inside its frame on the brand background → <out>/<name>.webp. The frames are the clips' own
 * (apps/video/src/frames.ts): the laptop seen straight on, the iPad, the phone with its status bar. Every still is
 * 16:10 like the clips, so a README column of GIFs and stills lines up; drawn at 2× for a sharp 840 px display.
 */
async function frame(
  browser: Browser,
  png: Buffer,
  out: string,
  name: string,
  kind: Kind,
  look: { dark: boolean; bg?: string; w: number; h: number },
) {
  const src = `data:image/png;base64,${png.toString("base64")}`;
  const W = 1600;
  const H = 1000;
  const c =
    kind === "phone"
      ? fitDevice(kind, look.w, look.h, W / 2, H / 2, 520, 950)
      : fitDevice(kind, look.w, look.h, W / 2, H / 2, 1460, 930);
  const sc = screenRect(kind, c);
  const device = [
    frameUnder(kind, c, { dark: look.dark }),
    `<div style="position:absolute;left:${sc.x}px;top:${sc.y}px;width:${sc.w}px;height:${sc.h}px;border-radius:${screenRadius(kind, c)};overflow:hidden;background:#000">`,
    `<img src="${src}" style="position:absolute;left:${c.x - sc.x}px;top:${c.y - sc.y}px;width:${c.w}px;height:${c.h}px"></div>`,
    frameOver(kind, c, { dark: look.dark, statusBg: look.bg, img: frameData(kind) }),
  ].join("");
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await page.setContent(
    `<html><body style="margin:0;width:${W}px;height:${H}px;background:${BG};position:relative;overflow:hidden">${device}</body></html>`,
  );
  await page.waitForTimeout(150);
  const tmp = `${out}/.${name}.png`;
  await page.screenshot({ path: tmp });
  await page.close();
  mkdirSync(out, { recursive: true });
  ffmpeg(["-i", tmp, "-c:v", "libwebp", "-quality", "88", "-compression_level", "6", `${out}/${name}.webp`]);
  rmSync(tmp, { force: true });
}

/**
 * Before the picture: no toast (a note the shot raised along the way, such as the floor's "No better tanda…"), and
 * every sliding title at its start rather than caught mid-slide.
 */
async function tidy(page: Page) {
  for (const close of await page.getByTestId("toast-close").all())
    await close.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() =>
    document.querySelectorAll(".marquee-inner").forEach((el) =>
      el.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = 0;
      }),
    ),
  );
}

/** the page's top colour (a phone's status bar takes it) */
const topColour = (page: Page) =>
  page.evaluate(() => {
    let el: Element | null = document.elementFromPoint(window.innerWidth / 2, 2) ?? document.body;
    let bg = "rgba(0, 0, 0, 0)";
    while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
      bg = getComputedStyle(el).backgroundColor;
      el = el.parentElement;
    }
    return bg;
  });

/** a shot may hand back another page of the same context to photograph (the Floor screen beside the Booth) */
type Shot = (page: Page, base: string) => Promise<Page | void>;
/** per still: a second output (AirPods) for the headphones; the sidebar's width (px) */
type Opts = { outputs?: boolean; side?: number };
function still(
  name: string,
  kind: "desktop" | "tablet" | "phone",
  theme: "light" | "dark",
  shoot: Shot,
  opts: Opts = {},
): (c: StillCtx) => Promise<void> {
  return async ({ browser, base, out }) => {
    const device = kind === "desktop" ? DESKTOP : kind === "tablet" ? IPAD : PHONE;
    // the Turkish still: the app's language is Auto, which follows the browser's
    const ctx = await newCtx(browser, name === "turkish" ? { ...device, locale: "tr-TR" } : device, theme);
    // no song's lyrics in a README picture (the store's screenshots blur them; here they are simply not fetched)
    await ctx.route("https://lrclib.net/**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "[]",
      }),
    );
    if (opts.side)
      await ctx.addInitScript(
        `try { localStorage.setItem("tdj-sidebar", JSON.stringify({ w: ${opts.side}, collapsed: false })) } catch {}`,
      );
    const first = await ctx.newPage();
    await offlineAudio(first, opts.outputs);
    const page = (await shoot(first, base)) || first;
    await tidy(page);
    await page.waitForTimeout(700);
    const png = await page.screenshot();
    const bg = await topColour(page).catch(() => undefined);
    await ctx.close();
    await frame(browser, png, out, name, kind, {
      dark: theme === "dark",
      bg,
      w: device.viewport.width,
      h: device.viewport.height,
    });
  };
}

const resultArc: Shot = async (page, base) => {
  await openFeatured(page, base);
  await page.locator("#result").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -70));
  // the "Featured night loaded" toast leaves first
  await page.waitForTimeout(3500);
};

/** the night playing in the Booth (the featured one, its first song) */
async function nightPlaying(page: Page, base: string) {
  await openBooth(page, base);
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await page.getByTestId("booth-start").click();
  await page.getByTestId("booth-pause").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
}

/** the second song of the first tanda: the dancers' card reads "Song 2 of 4" */
async function playSecondSong(page: Page) {
  await page.evaluate(async () => {
    type B = {
      getState: () => {
        plan: { items: Array<{ kind: string; tanda: number }> };
        playNow: (i: number) => Promise<void>;
      };
    };
    const s = (window as unknown as { __tdjBooth: B }).__tdjBooth.getState();
    const items = s.plan.items;
    const first = items.findIndex((x) => x.kind === "track");
    const i = items.findIndex((x, j) => j > first && x.kind === "track" && x.tanda === items[first]!.tanda);
    await s.playNow(i);
  });
  await page.waitForTimeout(2500);
}

/** client-side to another page (a reload would end the night): the sidebar's row */
async function sideTo(page: Page, href: string) {
  await page.getByTestId("sidebar").locator(`a.side-row[href="${href}"]`).first().click();
  await page.waitForURL((u) => u.pathname === href, { timeout: 20_000 });
  await settle(page, 900);
}

/** a Library row's preview answered locally (the server would ask Deezer) */
async function localResolve(page: Page) {
  await page.route(/\/api\/resolve$/, async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { title?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            provider: "deezer",
            id: `dz-${(body.title ?? "x").length}`,
            title: body.title,
            artist: "",
            previewUrl: `https://preview.test/clip.wav?s=${(body.title ?? "x").length}`,
            confidence: 0.9,
          },
        ],
      }),
    });
  });
}

const DEFS: Record<
  string,
  [kind: "desktop" | "tablet" | "phone", theme: "light" | "dark", shoot: Shot, opts?: Opts]
> = {
  "compose-light": ["desktop", "light", resultArc],
  "compose-dark": ["desktop", "dark", resultArc],
  /** the Booth on an iPad in landscape, the sidebar folded, a song playing and the floor's reaction kept */
  booth: [
    "tablet",
    "dark",
    async (page, base) => {
      await openBooth(page, base);
      await page.getByTestId("sidebar-hide").click();
      await page.getByTestId("booth-start").click();
      await page.getByTestId("booth-pause").waitFor({ timeout: 20_000 });
      await page.getByTestId("now-floor-full").click();
      // the "Saved: Floor full" toast leaves first
      await page.waitForTimeout(3500);
    },
  ],
  "booth-phone": [
    "phone",
    "dark",
    async (page, base) => {
      await openBooth(page, base);
      await page.getByTestId("booth-start").click();
      await page.getByTestId("booth-pause").waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
    },
  ],
  /** the transition editor, opened from the marker between two songs, with Fade picked */
  transitions: [
    "tablet",
    "dark",
    async (page, base) => {
      await openBooth(page, base);
      await page.getByTestId("sidebar-hide").click();
      await page.getByTestId("booth-gap").nth(3).click();
      const ed = page.getByTestId("booth-transition-sheet");
      await ed.waitFor({ timeout: 15_000 });
      await ed.getByTestId("booth-tr-preset-fade").click();
      await page.waitForTimeout(1200);
    },
  ],
  build: [
    "desktop",
    "light",
    async (page, base) => {
      await page.goto(`${base}/build`, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        localStorage.removeItem("tdj-build-draft");
        localStorage.removeItem("tdj-build-meta");
      });
      await page.reload({ waitUntil: "networkidle" });
      for (let k = 0; k < 2; k++) {
        const add = page.getByTestId("build-suggestion").first().getByRole("button", { name: /^Add/ });
        await add.waitFor({ timeout: 30_000 });
        await add.click();
        await page.waitForTimeout(1200);
        const sheet = page.getByTestId("rule-sheet");
        if (await sheet.isVisible().catch(() => false)) await sheet.getByTestId("rule-as-said").click();
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(1270, 790);
      await page.waitForTimeout(900);
    },
  ],
  search: [
    "desktop",
    "light",
    async (page, base) => {
      await page.goto(`${base}/library`, { waitUntil: "networkidle" });
      await page.locator("#library-search").first().fill("ventaron");
      await page.getByTestId("library-corrected").waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1200);
    },
  ],
  memory: [
    "desktop",
    "light",
    async (page, base) => {
      await page.goto(`${base}/database?tab=memory`, { waitUntil: "networkidle" });
      await page.getByRole("radio", { name: "From databases" }).click();
      await page.waitForTimeout(1200);
    },
  ],
  "database-orchestras": [
    "desktop",
    "light",
    async (page, base) => {
      await page.goto(`${base}/database`, { waitUntil: "networkidle" });
      await page.getByRole("radio", { name: "Orchestras" }).click();
      await page.mouse.move(1270, 790);
      await page.waitForTimeout(900);
    },
  ],
  guide: [
    "desktop",
    "light",
    async (page, base) => {
      await page.goto(`${base}/guide`, { waitUntil: "networkidle" });
    },
  ],
  settings: [
    "desktop",
    "light",
    async (page, base) => {
      // the learning section: what the featured night's edits taught, as rules a DJ can weigh or delete
      await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
      await page.getByTestId("featured-learned").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -110));
      await page.waitForTimeout(800);
    },
  ],
  ipad: [
    "tablet",
    "light",
    async (page, base) => {
      await openFeatured(page, base);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(3500);
    },
  ],
  phone: ["phone", "dark", resultArc],
  /** the night plays on while the DJ browses: the sidebar's player, and the song menu on a Library row */
  player: [
    "desktop",
    "light",
    async (page, base) => {
      await nightPlaying(page, base);
      await sideTo(page, "/library");
      await page.locator("#library-search").first().fill("pugliese 1944");
      const row = page.getByTestId("library-row").nth(2);
      await row.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1200);
      await row.click({ button: "right", position: { x: 300, y: 30 } });
      await page.getByTestId("song-menu").waitFor({ timeout: 10_000 });
      await page.waitForTimeout(600);
    },
    { side: 300 },
  ],
  /** pre-listen: the room plays the night, a Library row plays in the headphones, the sidebar says so */
  prelisten: [
    "desktop",
    "dark",
    async (page, base) => {
      await localResolve(page);
      await openBooth(page, base);
      await page.getByTestId("booth-out-cue").click();
      await page.getByTestId("booth-output-sheet").locator('[data-device="hp"]').click();
      await page.waitForTimeout(600);
      await page.keyboard.press("Escape");
      await page.getByTestId("booth-start").click();
      await page.getByTestId("booth-pause").waitFor({ timeout: 20_000 });
      await sideTo(page, "/library");
      await page.locator("#library-search").first().fill("pugliese 1944");
      await page.getByTestId("library-row").nth(2).waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1000);
      await page.getByTestId("library-row").nth(1).getByTestId("play-button").click();
      await page.getByTestId("booth-mini-cue").waitFor({ timeout: 15_000 });
      // the "Playing in your headphones" toast leaves first
      await page.waitForTimeout(6500);
      await page.mouse.move(1270, 790);
    },
    { outputs: true, side: 300 },
  ],
  /** the sidebar folded: the night's player becomes the gramophone, its ring the time left in the song */
  gramophone: [
    "tablet",
    "light",
    async (page, base) => {
      await nightPlaying(page, base);
      await sideTo(page, "/");
      await page.getByTestId("sidebar-hide").click();
      await page.getByTestId("player-gramophone").waitFor({ timeout: 10_000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(2500);
    },
  ],
  /** Now playing: the dancers' card (song 2 of the tanda, the next tanda, La Cumparsita), the rhythm lane */
  "now-playing": [
    "desktop",
    "dark",
    async (page, base) => {
      await nightPlaying(page, base);
      await playSecondSong(page);
      await page
        .getByTestId("booth-now-full")
        .first()
        .evaluate((e) => (e as HTMLButtonElement).click());
      const view = page.getByTestId("now-view");
      await view.waitFor({ timeout: 10_000 });
      await view.getByTestId("now-tab-rhythm").click();
      await page.waitForTimeout(800);
      await page.evaluate(() => document.querySelector(".now-view-body")?.scrollTo(0, 0));
      await page.waitForTimeout(1500);
    },
  ],
  /** the dancers' Floor screen (a projector or a TV), following the Booth in the same browser */
  floor: [
    "desktop",
    "dark",
    async (page, base) => {
      await nightPlaying(page, base);
      await playSecondSong(page);
      const floor = await page.context().newPage();
      await floor.goto(`${base}/screen`, { waitUntil: "networkidle" });
      await floor.getByTestId("floor-song-of").waitFor({ timeout: 20_000 });
      await floor.waitForTimeout(2500);
      return floor;
    },
  ],
  /** click a key to change it: Pause's chip waits for the new keys */
  keys: [
    "desktop",
    "dark",
    async (page, base) => {
      await nightPlaying(page, base);
      await page.locator("body").click({ position: { x: 640, y: 5 } });
      await page.keyboard.press("?");
      const sheet = page.getByTestId("booth-shortcuts");
      await sheet.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(600);
      await sheet.getByTestId("shortcut-booth.pause").getByTestId("key-chip").first().click();
      await page.waitForTimeout(800);
    },
  ],
  /** Song DNA: one composition's recordings over the years, this one marked */
  "song-dna": [
    "desktop",
    "dark",
    async (page, base) => {
      await page.goto(`${base}/library`, { waitUntil: "networkidle" });
      await page.locator("#library-search").first().fill("malena");
      const row = page.getByTestId("library-row").first();
      await row.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await row.getByTestId("song-info").click();
      await page.getByTestId("song-details-sheet").getByTestId("song-dna-link").click();
      await page.getByTestId("dna-timeline").waitFor({ timeout: 20_000 });
      // the pointer off the chart: no mark's tooltip in the picture
      await page.mouse.move(150, 780);
      await page.waitForTimeout(2000);
    },
  ],
  /** the app in Turkish (Settings → Language → Auto follows the browser); TDJ_URL_TR points at another build if needed */
  turkish: ["desktop", "light", (page, base) => resultArc(page, process.env.TDJ_URL_TR ?? base)],
};

export const STILLS: Record<string, (c: StillCtx) => Promise<void>> = Object.fromEntries(
  Object.entries(DEFS).map(([name, [kind, theme, shoot, opts]]) => [
    name,
    still(name, kind, theme, shoot, opts),
  ]),
);
