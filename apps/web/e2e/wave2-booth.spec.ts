/**
 * Wave 2 (the T-DJ test users' Booth issues): esc never stops the room and the Stop confirm focuses Cancel; a
 * tanda skipped tonight leaves Up next and the plan; the iPad transport keeps one height, labels every control and
 * never hides the set list; plain words instead of shorthand; the Last-4 toast with Undo; no "?" years; swap labels
 * counted per tanda; the iPhone's transport alone at the foot of the booth.
 */
import { devices, expect, type Page, test } from "@playwright/test";

function wav(sec = 12): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * 32767), i * 2);
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
const WAV = wav();

async function mockClips(page: Page) {
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
    route.request().url().includes("json=1")
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

async function compose(page: Page) {
  await mockClips(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}
async function openBooth(page: Page) {
  await compose(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}
async function start(page: Page) {
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", /playing|cortina/, {
    timeout: 20000,
  });
}
type Item = { kind: string; tanda: number };
const planOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tdjBoothPlan: { items: Item[] } }).__tdjBoothPlan.items);

test("esc never opens Stop (Mix, esc, esc keeps playing); the Stop confirm focuses Cancel and Enter keeps playing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await start(page);
  await page.getByTestId("booth-mix").click();
  await expect(page.getByTestId("booth-levels-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("booth-levels-sheet")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await expect(page.getByTestId("booth-stop-sheet")).toHaveCount(0);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", /playing|cortina/);
  // the strip's Stop: Cancel has the focus, Enter keeps the music playing
  await page.getByTestId("booth-stop").click();
  const sheet = page.getByTestId("booth-stop-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("booth-stop-cancel")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", /playing|cortina/);
  // the destructive choices take a deliberate tap
  await page.getByTestId("booth-stop").click();
  await page.getByTestId("booth-stop-fade").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "stopped", { timeout: 10000 });
  // the keyboard sheet no longer offers esc for Stop
  await page.keyboard.press("?");
  await expect(page.getByTestId("booth-shortcuts")).not.toContainText(/Stop…/);
});

test("Skip tanda 2 tonight: Up next and the night's time move past it and its cortina", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const items = await planOf(page);
  const first2 = items.findIndex((x) => x.kind === "track" && x.tanda === 2);
  const first3 = items.findIndex((x) => x.kind === "track" && x.tanda === 3);
  const nextTanda = page.getByTestId("booth-next-tanda");
  await expect(nextTanda).toHaveAttribute("data-plan-index", String(first2));
  const ttc0 = Number(await page.getByTestId("booth-time").getAttribute("data-ttc"));
  const cortina2 = await page.getByTestId("booth-next-cortina").innerText();
  await page.locator('.booth-tanda[data-tanda="2"]').getByTestId("booth-bypass").click();
  await expect(page.locator('.booth-tanda[data-tanda="2"]')).toHaveAttribute("data-bypassed", "true");
  await expect(nextTanda).toHaveAttribute("data-plan-index", String(first3));
  await expect(nextTanda).toContainText("3 of 25");
  await expect(page.getByTestId("booth-next-cortina")).not.toHaveText(cortina2);
  await expect
    .poll(async () => Number(await page.getByTestId("booth-time").getAttribute("data-ttc")))
    .toBeLessThan(ttc0);
  // on tanda 1's last song the room hears tanda 3 next, never tanda 2 or its cortina
  const last1 = items.findLastIndex((x) => x.kind === "track" && x.tanda === 1);
  await page.evaluate((i) => {
    const b = (window as unknown as { __tdjBooth: { setState: (s: object) => void } }).__tdjBooth;
    b.setState({ planIndex: i });
  }, last1);
  const next = Number(await page.getByTestId("booth-next-title").getAttribute("data-plan-index"));
  expect(items[next]!.tanda === 2).toBe(false);
});

test("iPad landscape: the transport keeps one height, labels every control, and the set list scrolls clear of it", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    ...devices["iPad Pro 11 landscape"],
    defaultBrowserType: undefined,
  });
  const page = await ctx.newPage();
  await openBooth(page);
  const strip = page.getByTestId("booth-strip");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    )
    .toBe(0);
  const h0 = (await strip.boundingBox())!.height;
  expect(h0).toBeLessThanOrEqual(72);
  // every control: a visible word, and an accessible name
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="booth-strip"] button')]
      .filter((b) => b.offsetParent)
      .map((b) => ({
        name: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
        word: (b.innerText ?? "").trim(),
      })),
  );
  expect(controls.length).toBeGreaterThan(5);
  for (const c of controls) {
    expect(c.name, JSON.stringify(c)).not.toBe("");
    expect(c.word, JSON.stringify(c)).not.toBe("");
  }
  // the set list scrolls fully above the transport
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-testid="booth-set"]')!;
    const scroller = s.scrollHeight > s.clientHeight ? s : s.closest<HTMLElement>(".booth-col-set")!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(300);
  const foot = await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-testid="booth-set"] .booth-row');
    return {
      last: rows[rows.length - 1]!.getBoundingClientRect().bottom,
      strip: document.querySelector('[data-testid="booth-strip"]')!.getBoundingClientRect().top,
    };
  });
  expect(foot.last).toBeLessThanOrEqual(foot.strip);
  // the strip keeps its height when the night starts
  await start(page);
  await page.waitForTimeout(500);
  expect((await strip.boundingBox())!.height).toBe(h0);
  // a trackpad's hover explains a control through the hint layer
  await page.mouse.move(0, 0);
  const mix = await page.getByTestId("booth-mix").boundingBox();
  await page.mouse.move(mix!.x + mix!.width / 2, mix!.y + mix!.height / 2);
  await expect(page.getByTestId("tip")).toContainText(/Transitions/);
  await ctx.close();
});

test("rehearsal: an item without a clip is explained in plain words; no shorthand; End tanda never on the closing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const booth = page.getByTestId("booth");
  await expect(page.getByTestId("booth-ttc-label")).toHaveText("Rehearsal to La Cumparsita");
  await expect(page.getByTestId("booth-full-night")).toContainText("Every song in full");
  await expect(booth).not.toContainText(/\bin 0:00|stop at \d|– · –|full night/);
  await start(page);
  await expect(booth).not.toContainText(/[−-]\d+:\d\d (early|late)/);
  await page.getByTestId("booth-jump-cumparsita").click();
  await page.getByTestId("booth-jump-confirm").click();
  await expect
    .poll(async () => {
      const items = await planOf(page);
      const i = Number(
        await page.locator('[data-plan-index][aria-current="true"]').getAttribute("data-plan-index"),
      );
      return items[i]?.kind;
    })
    .toBe("closing");
  await expect(page.getByTestId("booth-end-tanda")).toHaveCount(0);
  // the closing has no clip in this night: the banner says why, in words
  const banners = page.getByTestId("booth-banners");
  await expect(banners).toContainText(/is passed over: the rehearsal has no 30 s clip/);
  await expect(banners).not.toContainText(/\(skipped\)|No source/);
});

test("Last 4 tandas tango only: a toast names the tandas it skips, and Undo turns it back off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await page.getByTestId("booth-last4").click();
  await expect(page.getByTestId("booth-last4")).toHaveAttribute("aria-pressed", "true");
  const t = page.getByRole("status").filter({ hasText: /Skipping tanda/ });
  await expect(t).toContainText(/Skipping tanda 21 \(milonga\) and tanda 23 \(vals\) tonight/);
  await t.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("booth-last4")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.booth-tanda[data-tanda="23"]')).not.toHaveAttribute("data-bypassed", "true");
});

test("swap labels count songs per tanda; cortinas have their own; no year prints as ?", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const set = page.getByTestId("booth-set");
  await expect(set.getByRole("button", { name: "Swap tanda 2, song 1", exact: true })).toHaveCount(1);
  await expect(set.getByRole("button", { name: /^Swap track/ })).toHaveCount(0);
  await expect(set.getByRole("button", { name: "Cortina after tanda 1: fades and stop" })).toHaveCount(1);
  await expect(page.getByTestId("booth")).not.toContainText(/ · \?(\s|$)/);
  // Compose: the opening and the closing La Cumparsita without a "?" year
  await page.goto("/");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  for (const id of ["opening", "closing"]) {
    const el = page.getByTestId(id);
    if (await el.count()) await expect(el).not.toContainText(/·\s*\?/);
  }
});

test("iPhone 14: the booth's transport alone at the foot — no tab bar stacked over the deck", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
    defaultBrowserType: undefined,
  });
  const page = await ctx.newPage();
  await openBooth(page);
  const m = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="booth-strip"]')!.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Primary mobile"]');
    const navShown =
      !!nav && getComputedStyle(nav).visibility !== "hidden" && nav.getBoundingClientRect().height > 0;
    const navTop = navShown ? nav!.getBoundingClientRect().top : window.innerHeight;
    return { stripTop: strip.top, stripBottom: strip.bottom, navShown, navTop, vh: window.innerHeight };
  });
  // nothing stacks: the strip is the only bar, and it covers at most its own row at the foot
  expect(m.navShown).toBe(false);
  expect(m.vh - m.stripTop).toBeLessThanOrEqual(90);
  // the deck's controls can be reached without anything over them
  for (const id of ["booth-end-tanda", "booth-now-info"]) {
    const el = page.getByTestId(id);
    await el.scrollIntoViewIfNeeded();
    const free = await el.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && b.contains(hit);
    });
    expect(free, id).toBe(true);
  }
  // the way out lives in •••
  await page.getByTestId("booth-more").click();
  await expect(page.getByRole("menuitem", { name: "Leave the booth" })).toBeVisible();
  await ctx.close();
});
