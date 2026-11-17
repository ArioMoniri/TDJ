/**
 * 2026-11 — Now playing and the dancers' Floor screen, redesigned (the owner: "not aesthetic … the rhythm booming
 * around the song image is not fine … features asked for earlier are not done"): on a desktop, an iPad and a phone,
 * - the dancer info both screens show for a night: Song 2 of 4, the next tanda's rhythm, the cortina's state;
 * - the synced lyrics with exactly one current line;
 * - the segmented control: a filled pill, no focus box on a click;
 * - the beat glow follows the beat, and Reduce motion has none;
 * - nothing overflows at 393 px.
 * LRCLIB, the previews and the DJ's file are mocked: no live network.
 */
import { type Browser, type BrowserContextOptions, expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

function wav(sec: number, rate = 8000): Buffer {
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.1 * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const CLIP = wav(30);
const LRC = Array.from(
  { length: 40 },
  (_, i) => `[${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}.00] Línea ${i + 1}`,
).join("\n");

const DEVICES: ReadonlyArray<readonly [string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["ipad", { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ["phone", { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
];

async function mocks(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("tdj-lyrics-v2");
      localStorage.removeItem("tdj-song-marks-v1");
      localStorage.removeItem("tdj-now-prefs-v1");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route("https://lrclib.net/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith("/api/get")) return r.fulfill({ status: 404, body: "" });
    const title = u.searchParams.get("track_name") ?? "";
    const artist = u.searchParams.get("artist_name") ?? "";
    if (!title) return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          id: 7,
          trackName: title,
          artistName: artist || "Orquesta",
          duration: null,
          syncedLyrics: LRC,
          plainLyrics: "x",
        },
      ]),
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (r) =>
    r.request().url().includes("json=1")
      ? r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : r.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: CLIP,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":false,"user":null}' }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

type Item = { kind: string; tanda: number; id?: string; title: string; artist: string };
type BoothWin = {
  __tdjBooth: {
    getState: () => {
      state: string;
      planIndex: number;
      plan: { items: Item[] };
      playlist: { tandas: Array<{ rhythm: string; orchestra: string }> };
      playNow: (i: number) => Promise<void>;
    };
  };
};
const booth = <T>(page: Page, f: (b: BoothWin["__tdjBooth"]) => T) =>
  page.evaluate((src) => {
    const b = (window as unknown as BoothWin).__tdjBooth;
    return new Function("b", `return (${src})(b)`)(b);
  }, f.toString()) as Promise<T>;

/**
 * The featured night in the Booth, started; the room's clock then reads as a full recording's (a file's or Spotify's:
 * the 30 s clips the e2e plays have no recording clock), 5 s in and running, so the lyrics and the beat follow it.
 */
async function toBooth(page: Page) {
  await mocks(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 150000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("booth-start").click();
  await expect
    .poll(() => booth(page, (b) => b.getState().state), { timeout: 30000 })
    .toMatch(/^(playing|cortina)$/);
  await page.evaluate(() => {
    const b = (
      window as unknown as {
        __tdjBooth: { getState: () => { sources: unknown }; setState: (s: object) => void };
      }
    ).__tdjBooth;
    const t0 = performance.now();
    const src = b.getState().sources;
    b.setState({
      positionOf: () => ({ sec: 5 + (performance.now() - t0) / 1000, playing: true, where: "room" }),
      sources: Array.isArray(src) ? src.map(() => "spotify") : src,
    });
  });
}

/** no element of the view wider than the screen, and no sideways scroll */
async function noOverflow(page: Page, root: string) {
  const bad = await page.evaluate((sel) => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > w + 1)
      out.push(`page ${document.documentElement.scrollWidth}`);
    const r = document.querySelector(sel);
    if (!r) return ["no root"];
    for (const el of r.querySelectorAll<HTMLElement>("*")) {
      const b = el.getBoundingClientRect();
      if (!b.width || getComputedStyle(el).visibility === "hidden" || el.closest("[aria-hidden]")) continue;
      // (inside a box that scrolls or clips sideways is fine)
      let clipped = false;
      for (let p = el.parentElement; p && p !== r; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== "visible") {
          clipped = true;
          break;
        }
      }
      if (!clipped && (b.right > w + 1 || b.left < -1))
        out.push(`${el.tagName}.${el.className} ${Math.round(b.left)}–${Math.round(b.right)}`);
    }
    return out.slice(0, 8);
  }, root);
  expect(bad).toEqual([]);
}

for (const [name, use] of DEVICES) {
  test.describe(`Now playing, ${name}`, () => {
    test("lyrics follow (one current line), the segmented control, the beat glow, the dancers' card", async ({
      browser,
    }) => {
      const ctx = await browser.newContext(use);
      const page = await ctx.newPage();
      await toBooth(page);
      await page.getByTestId("booth-now-full").click();
      const view = page.getByTestId("now-view");
      await expect(view).toBeVisible();

      // the synced lyrics: exactly one current line, large; the source in one line, the credits behind ⓘ
      const lines = view.locator('[data-testid="now-panel-lyrics"] [data-testid="song-lyrics-text"]');
      await expect(lines.locator("[data-current]")).toHaveCount(1, { timeout: 20000 });
      await expect(view.getByTestId("song-lyrics-source")).toContainText("LRCLIB");
      await expect(view.getByTestId("song-lyrics-credits")).toHaveCount(0);
      await view.getByTestId("song-lyrics-credits-btn").click();
      await expect(view.getByTestId("song-lyrics-credits")).toBeVisible();

      // the beat glow: on by default, it follows the beat (the beat's number in the bar changes)
      const wrap = view.getByTestId("now-cover-wrap");
      await expect(wrap).toHaveAttribute("data-beat", "on");
      const seen = new Set<string>();
      await expect
        .poll(
          async () => {
            const n = await wrap.getAttribute("data-beat-n");
            if (n) seen.add(n);
            return seen.size;
          },
          { timeout: 10000, intervals: [100] },
        )
        .toBeGreaterThan(1);
      // the art never moves
      expect(await view.getByTestId("now-cover").evaluate((e) => getComputedStyle(e).transform)).toBe("none");

      // the segmented control: a click selects a filled pill, never a focus box
      const tab = view.getByTestId("now-tab-rhythm");
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      const look = await tab.evaluate((e) => {
        const c = getComputedStyle(e);
        return { outline: c.outlineStyle, width: c.outlineWidth };
      });
      expect(look.outline === "none" || look.width === "0px").toBe(true);
      // (the pill's fill fades in: read it once the selection has settled, not in the click's first frame)
      await expect
        .poll(() => tab.evaluate((e) => getComputedStyle(e).backgroundColor), { timeout: 3000 })
        .not.toBe("rgba(0, 0, 0, 0)");
      // the Beat glow switch turns it off
      await view.getByTestId("now-beat-glow-row").getByRole("switch").click();
      await expect(wrap).toHaveAttribute("data-beat", "off");
      await expect(view.getByTestId("now-beat-glow")).toHaveCount(0);
      await view.getByTestId("now-tab-lyrics").click();

      // song 2 of the first tanda: the dancers' card
      const pick = await booth(page, (b) => {
        const s = b.getState();
        const items = s.plan.items;
        const first = items.findIndex((x) => x.kind === "track");
        const t = items[first]!.tanda;
        const second = items.findIndex((x, j) => j > first && x.kind === "track" && x.tanda === t);
        const n = items.filter((x) => x.kind === "track" && x.tanda === t).length;
        void s.playNow(second);
        return { second, n, tanda: t, next: s.playlist.tandas[t]! };
      });
      await expect
        .poll(() => booth(page, (b) => b.getState().planIndex), { timeout: 20000 })
        .toBe(pick.second);
      const card = view.getByTestId("now-dancer");
      await expect(card.getByTestId("now-song-of")).toHaveText(`Song 2 of ${pick.n}`);
      await expect(card.getByTestId("now-dots").locator("i")).toHaveCount(pick.n);
      await expect(card.getByTestId("now-tanda-left")).toContainText(/left in this tanda/);
      await expect(card.getByTestId("now-then")).toHaveText(`Next: song 3 of ${pick.n}`);
      await expect(card.getByTestId("now-cumparsita")).toContainText("La Cumparsita in");
      await expect(card.getByTestId("now-night").locator("i[data-on]")).toHaveCount(1);
      const word = { tango: "Tango", vals: "Vals", milonga: "Milonga" }[pick.next.rhythm] ?? pick.next.rhythm;
      await expect(card.getByTestId("now-next-tanda")).toContainText(`Next tanda: ${word}`);

      // the cortina: "Cortina — clear the floor", the next tanda's rhythm
      await booth(page, (b) => {
        const s = b.getState();
        void s.playNow(s.plan.items.findIndex((x, i) => i > s.planIndex && x.kind === "cortina"));
      });
      await expect(card.getByTestId("now-cortina")).toHaveText("Cortina — clear the floor", {
        timeout: 20000,
      });
      await expect(card.getByTestId("now-then")).toContainText(`Next: ${word}`);
      await expect(card.getByTestId("now-tanda-left")).toContainText(/Next tanda in \d:\d\d/);

      if (name === "phone") await noOverflow(page, '[data-testid="now-view"]');
      await ctx.close();
    });

    test("Reduce motion: no beat animation", async ({ browser }) => {
      const ctx = await browser.newContext({ ...use, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await toBooth(page);
      await page.getByTestId("booth-now-full").click();
      const view = page.getByTestId("now-view");
      await expect(view.getByTestId("now-cover-wrap")).toHaveAttribute("data-beat", "off");
      await page.waitForTimeout(1500);
      await expect(view.getByTestId("now-beat-glow")).toHaveCount(0);
      expect(await view.getByTestId("now-cover-wrap").getAttribute("data-beat-n")).toBeNull();
      expect(await view.getByTestId("now-cover").evaluate((e) => getComputedStyle(e).transform)).toBe("none");
      await ctx.close();
    });
  });
}

/* ---------------- the Floor screen, from the Booth's state on the channel ---------------- */

const floorState = (o: Record<string, unknown>) => ({
  v: 1,
  kind: "song",
  title: "Bahía Blanca",
  orchestra: "Carlos Di Sarli",
  singer: null,
  rhythm: "tango",
  year: 1957,
  k: 1,
  n: 4,
  tanda: 7,
  tandas: 12,
  stage: "start",
  next: { orchestra: "Francisco Canaro", rhythm: "vals", singer: null },
  positionSec: 42,
  lengthSec: 171,
  playing: true,
  srcStartSec: 0,
  songId: null,
  follows: "song",
  itemStartSec: 5400,
  tandaEndSec: 5400 + 171 * 3,
  closingAtSec: 12600,
  nightSec: 12780,
  arc: [
    "tango",
    "tango",
    "vals",
    "tango",
    "milonga",
    "tango",
    "tango",
    "vals",
    "tango",
    "milonga",
    "tango",
    "tango",
  ],
  ...o,
});

async function floorPage(browser: Browser, use: BrowserContextOptions, path = "/screen") {
  const ctx = await browser.newContext(use);
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.getByTestId("floor-screen")).toBeVisible();
  const say = (s: Record<string, unknown>) =>
    page.evaluate((st) => {
      const ch = new BroadcastChannel("tdj-floor");
      ch.postMessage({ type: "floor", state: { ...st, at: Date.now() } });
      ch.close();
    }, s);
  return { ctx, page, say };
}

for (const [name, use] of DEVICES)
  test(`the Floor screen, ${name}: the song, its place in the tanda, what comes next, the cortina`, async ({
    browser,
  }) => {
    const { ctx, page, say } = await floorPage(browser, use);
    await say(floorState({}));
    await expect(page.getByTestId("floor-song-of")).toHaveText("Song 2 of 4");
    await expect(page.getByTestId("floor-title")).toHaveText("Bahía Blanca");
    await expect(page.getByTestId("floor-orchestra")).toHaveText("Carlos Di Sarli");
    await expect(page.getByTestId("floor-singer")).toHaveText("Instrumental");
    await expect(page.getByTestId("floor-rhythm")).toHaveText("Tango");
    await expect(page.getByTestId("floor-year")).toHaveText("1957");
    await expect(page.getByTestId("floor-then")).toHaveText("Next: song 3 of 4");
    await expect(page.getByTestId("floor-next-tanda")).toHaveText("Next tanda: Vals · Francisco Canaro");
    await expect(page.getByTestId("floor-tanda-left")).toContainText(/^\d:\d\d left in this tanda$/);
    await expect(page.getByTestId("floor-cumparsita")).toContainText(/La Cumparsita in 1 h \d\d min/);
    await expect(page.getByTestId("floor-night").locator("i[data-on]")).toHaveCount(1);
    if (name === "phone") await noOverflow(page, '[data-testid="floor-screen"]');

    // the last song: the cortina follows, then the next tanda
    await say(floorState({ k: 3, stage: "last", follows: "cortina" }));
    await expect(page.getByTestId("floor-then")).toHaveText("Next: cortina, then Vals · Francisco Canaro");
    await expect(page.getByTestId("floor-next-tanda")).toHaveCount(0);

    // the cortina: clear the floor, the next tanda and its countdown
    await say(
      floorState({
        kind: "cortina",
        title: "Cortina",
        orchestra: "",
        rhythm: "cortina",
        k: -1,
        n: 0,
        stage: null,
        positionSec: 12,
        lengthSec: 45,
        tandaEndSec: null,
      }),
    );
    await expect(page.getByTestId("floor-cortina-title")).toHaveText("Cortina — clear the floor");
    await expect(page.getByTestId("floor-next")).toHaveText("Next: Vals · Francisco Canaro");
    await expect(page.getByTestId("floor-countdown")).toContainText(/Next tanda in 0:\d\d/);
    if (name === "phone") await noOverflow(page, '[data-testid="floor-screen"]');
    // no controls on the dancers' screen
    await expect(page.locator("button, a[href], input").filter({ visible: true })).toHaveCount(0);
    await ctx.close();
  });

test("the Floor screen: `?extras=0` hides the lyrics; a raw guitarists' credit reads as names", async ({
  browser,
}) => {
  const { ctx, page, say } = await floorPage(
    browser,
    { viewport: { width: 1280, height: 720 } },
    "/screen?extras=0",
  );
  await say(floorState({ orchestra: "J.ricardo-G.barbieri-J.m.aguilar", singer: "Carlos Gardel" }));
  await expect(page.getByTestId("floor-orchestra")).toHaveText(
    "José Ricardo, Guillermo Barbieri, José María Aguilar (guitars)",
  );
  await expect(page.getByTestId("floor-lyrics")).toHaveCount(0);
  await ctx.close();
});

test("Library: a raw guitarists' credit reads as names in the suggestions and chips; the full name finds it", async ({
  page,
}) => {
  await page.goto("/library");
  const field = page.locator("#library-search").first();
  await expect(field).toBeVisible();
  await field.fill("Guillermo Barbieri");
  await expect(page.getByTestId("library-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("library-row").first()).toContainText("Guillermo Barbieri");
  // no raw credit ("J.ricardo-G.barbieri…") anywhere in the suggestions, the chips or the rows
  await field.fill("barbieri");
  await expect(page.getByTestId("library-row").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/[A-Z]\.[a-z]+-[A-Z]\.[a-z]+/);
});

test("no raw credit anywhere: the Library's orchestra lists, a tap on one, the completion, the Database's orchestras", async ({
  page,
}) => {
  const RAW = /\b[A-Z]\.[a-z]+(\.[a-z]+)?-[A-Z]\.[a-z]+/;
  await page.goto("/library");
  const field = page.locator("#library-search").first();
  const home = page.getByText("José Ricardo, Guillermo Barbieri (guitars)", { exact: true }).first();
  await expect(home).toBeVisible({ timeout: 30_000 });
  expect(await page.locator("main").innerText()).not.toMatch(RAW);
  // a tap searches by the names, which find the sides
  await home.click();
  await expect(field).toHaveValue("José Ricardo Guillermo Barbieri");
  await expect(page.getByTestId("library-row").first()).toContainText("Guillermo Barbieri", {
    timeout: 20_000,
  });
  // All orchestras
  await field.fill("");
  await page.getByTestId("library-all-orchestras").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Aníbal Troilo, Roberto Grela", { exact: true })).toBeVisible();
  expect(await sheet.innerText()).not.toMatch(RAW);
  await page.keyboard.press("Escape");
  // the completion fills in the names
  await field.fill("barbieri");
  const completion = page.getByTestId("library-completion").filter({ hasText: "Guillermo Barbieri" }).first();
  await expect(completion).toBeVisible({ timeout: 20_000 });
  await completion.click();
  await expect(field).not.toHaveValue(RAW);
  // the Database's Orchestras tab: the card, the mark, the detail's title; the full name finds it
  await page.goto("/database");
  await page.getByRole("radio", { name: "Orchestras" }).click();
  const dbField = page.locator("input[type=search]:visible").first();
  await dbField.fill("guillermo barbieri");
  const card = page.locator('[data-orchestra="j-ricardo-g-barbieri"]').first();
  await expect(card).toContainText("José Ricardo, Guillermo Barbieri (guitars)", { timeout: 20_000 });
  expect(await page.locator("main").innerText()).not.toMatch(RAW);
  await card.getByRole("button").first().click();
  await expect(page.getByTestId("orchestra-detail").getByRole("heading").first()).toHaveText(
    "José Ricardo, Guillermo Barbieri (guitars)",
  );
});

/* QA 2026-11: a toast never covers the controls under it — a phone page's header actions, Now playing's bar and its
   transport (an iPhone Duo open: 951 × 669) */
const raise = (page: Page, text: string) =>
  page.evaluate(
    (s) => (window as unknown as { __tdjToast: (t: string, u?: () => void) => void }).__tdjToast(s, () => {}),
    text,
  );
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("a phone: a toast comes in under the page's header row, never over Undo / Redo", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto("/build");
  await expect(page.getByTestId("build-guide")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!(window as unknown as { __tdjToast?: unknown }).__tdjToast);
  await raise(page, "Undone: your hand-built night changed");
  const toast = page.getByTestId("toast");
  await expect(toast).toBeVisible();
  await page.waitForTimeout(400);
  const t = (await toast.boundingBox())!;
  for (const id of ["build-undo", "build-redo", "build-reset"]) {
    const b = (await page.getByTestId("page-toolbar").getByTestId(id).boundingBox())!;
    expect(overlaps(t, b), `toast over ${id}`).toBe(false);
  }
  await ctx.close();
});

test("Now playing on an iPhone Duo open: a toast comes in under the bar, never over Previous / Pause / Next", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 951, height: 669 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await toBooth(page);
  await page.getByTestId("booth-now-full").click();
  const view = page.getByTestId("now-view");
  await expect(view).toBeVisible();
  await raise(page, "Rehearsal: the opening plays on the night (no clip)");
  const toast = page.getByTestId("toast");
  await expect(toast).toBeVisible();
  await page.waitForTimeout(400);
  const t = (await toast.boundingBox())!;
  const play = (await view.getByTestId("now-play").boundingBox())!;
  const close = (await view.getByTestId("now-view-close").boundingBox())!;
  expect(overlaps(t, play), "toast over the transport").toBe(false);
  expect(overlaps(t, close), "toast over the close button").toBe(false);
  expect(
    overlaps(t, { ...play, x: play.x - 120, width: play.width + 240 }),
    "toast over Previous / Next",
  ).toBe(false);
  await ctx.close();
});
