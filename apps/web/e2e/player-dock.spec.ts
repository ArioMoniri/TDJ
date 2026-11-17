/**
 * 2026-11 — the one player (the owner: "the circular shape always on screen player bar like gramophone on side bar";
 * "draggable and resizable … for lower size be a circle in gramophone shape with the circular indicator around it
 * showing how much remains"; the player settings "duplicated on screen, one in left and one in right — all on the
 * left in the side bar"). On a desktop, an iPad landscape, an iPad portrait and a phone:
 * - the night plays on another page in ONE player (the sidebar's where there is one, the bottom bar otherwise) and it
 *   controls the night (Pause asks mid-night, Resume, Next, Mute, volume); no second player anywhere;
 * - collapsing the sidebar turns it into the gramophone; the ring advances; a tap opens Now playing;
 * - drag (snaps to an edge / corner, clear of the tab bar), the resize handle and a pinch, the gramophone below a
 *   card's width; dragging (even from Pause) never pauses the room; the place is kept on the device;
 * - Reduce Motion stops the record; nothing overflows at 393 px.
 * Screenshots (scale 2) go to $PLAYER_SHOTS when set.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.PLAYER_SHOTS;

function wav(sec = 30): Buffer {
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

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const dev = (name: string, extra: Partial<BrowserContextOptions> = {}): BrowserContextOptions => {
  const { defaultBrowserType: _b, ...rest } = devices[name]!;
  return { ...rest, deviceScaleFactor: 2, ...extra };
};
type View = { name: string; o: BrowserContextOptions; side: boolean; touch: boolean };
const VIEWS: View[] = [
  {
    name: "desktop",
    o: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    side: true,
    touch: false,
  },
  {
    name: "ipad-landscape",
    o: dev("iPad Pro 11 landscape", { viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI }),
    side: true,
    touch: true,
  },
  { name: "ipad-portrait", o: dev("iPad Pro 11", { userAgent: IPAD_SAFARI }), side: false, touch: true },
  {
    name: "phone",
    o: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    side: false,
    touch: true,
  },
];

async function openBooth(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tdj-booth-theme", "dark");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
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
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
}

const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    return {
      state: s.state as string,
      cur: ((s.current as { planIndex: number } | null)?.planIndex ?? null) as number | null,
      muted: s.muted as boolean,
      master: s.master as number,
    };
  });
const playing = async (page: Page) => expect(["playing", "cortina"]).toContain((await snap(page)).state);

/** to the Library, client-side (a reload would end the night): the sidebar, the tab bar or the nav pill */
async function toLibrary(page: Page) {
  if (page.url().includes("/booth")) {
    const side = page.locator('[data-testid="sidebar"] a.side-row[href="/library"]');
    if (await side.isVisible().catch(() => false)) await side.click();
    else {
      const any = page.locator('a[href="/library"]:visible').first();
      if (await any.count()) await any.click();
      else {
        await page.getByTestId("booth-more").click();
        await page.getByRole("menuitem", { name: "Leave the booth" }).click();
        await page.locator('a[href="/library"]:visible').first().click();
      }
    }
  } else await page.locator('a[href="/library"]:visible').first().click();
  await expect(page).toHaveURL(/\/library/);
}

const dock = (page: Page) => page.getByTestId("player-dock");
const placeOf = (page: Page) => dock(page).getAttribute("data-place");
const rect = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom };
  }, sel);
/** players a viewer can see (the night's, a preview's, the gramophone) */
const visiblePlayers = (page: Page) =>
  page.evaluate(() =>
    [
      '[data-testid="booth-mini"]',
      '[data-testid="mini-player"]',
      '[data-testid="player-gramophone"]',
      '[data-testid="sidebar-now"]',
    ]
      .flatMap((s) => [...document.querySelectorAll(s)])
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      })
      .map((el) => el.getAttribute("data-testid")),
  );
const noOverflow = async (page: Page) =>
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
}
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

for (const v of VIEWS) {
  test.describe(v.name, () => {
    test.use(v.o);

    test(`${v.name}: one player controls the night; gramophone, drag, snap, resize; the room never stops`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await openBooth(page);
      // on the Booth the Booth is the player
      await expect(page.getByTestId("booth-mini")).toHaveCount(0);
      await toLibrary(page);
      const mini = page.getByTestId("booth-mini");
      await expect(mini).toBeVisible({ timeout: 10000 });
      await playing(page);
      // ONE player: the sidebar's where there is one, the bottom bar otherwise
      expect(await placeOf(page)).toBe(v.side ? "side" : "bar");
      expect(await visiblePlayers(page)).toEqual(["booth-mini"]);
      await expect(page.getByTestId("sidebar-now")).toHaveCount(0);
      if (v.side) {
        const m = (await rect(page, '[data-testid="booth-mini"]'))!;
        const s = (await rect(page, '[data-testid="sidebar"]'))!;
        expect(m.x).toBeGreaterThanOrEqual(s.x);
        expect(m.r).toBeLessThanOrEqual(s.r);
        expect(m.b).toBeLessThanOrEqual(s.b);
        await expect(page.locator('[data-testid="sidebar"] [data-testid="booth-mini"]')).toHaveCount(1);
        // everything the bottom bar and the player settings had: tanda / song N of M, next, the outputs, volume,
        // Now playing
        await expect(mini.getByTestId("booth-mini-when")).toContainText(
          /Tanda \d+ of \d+ · next in \d+:\d\d/,
        );
        await expect(mini.getByTestId("booth-mini-volume")).toBeVisible();
        await expect(mini.getByTestId("booth-mini-out-room")).toContainText("Room");
        await expect(mini.getByTestId("booth-mini-now")).toBeVisible();
        // QA 2026-11 ("the meta lines wrap into four cramped lines"): under the cover, across the card, one fact per
        // line, each on one line and whole — where and next, La Cumparsita, the song of the tanda
        await expect(mini.getByTestId("booth-mini-cumparsita")).toContainText(/La Cumparsita in \d+:\d\d/);
        const lines = await mini.evaluate((el) => {
          const cover = el.querySelector('[data-testid="booth-mini-back"]')!.getBoundingClientRect();
          return [...el.querySelectorAll<HTMLElement>(".booth-mini-line, .booth-mini-dance")].map((l) => {
            const r = l.getBoundingClientRect();
            const lh = Number.parseFloat(getComputedStyle(l).lineHeight) || 16;
            return {
              text: l.textContent,
              oneLine: r.height <= lh + 1,
              whole: l.scrollWidth <= l.clientWidth + 1,
              underCover: r.top >= cover.bottom - 1,
            };
          });
        });
        expect(lines).toHaveLength(3);
        for (const l of lines)
          expect(l, l.text ?? "").toMatchObject({ oneLine: true, whole: true, underCover: true });
      } else {
        await expect(page.getByTestId("player-grip")).toBeVisible();
      }
      await expect(mini.getByTestId("booth-mini-dance")).toContainText(/Song \d+ of \d+|Cortina|Next tanda/);
      await noOverflow(page);
      await shot(page, `${v.name}-1-docked`);

      // it controls the night: Pause asks mid-night (two taps), Resume at once, Mute
      const toggle = mini.getByTestId("booth-mini-toggle");
      await toggle.click();
      await expect(toggle).toHaveAttribute("data-armed", "true");
      await toggle.click();
      await expect.poll(async () => (await snap(page)).state).toBe("paused");
      await toggle.click();
      await expect.poll(async () => (await snap(page)).state).toBe("playing");
      await mini.getByTestId("booth-mini-mute").click();
      await expect.poll(async () => (await snap(page)).muted).toBe(true);
      await mini.getByTestId("booth-mini-mute").click();
      await expect.poll(async () => (await snap(page)).muted).toBe(false);
      if (v.side) {
        await mini.getByTestId("booth-mini-volume").fill("-6");
        await expect.poll(async () => (await snap(page)).master).toBe(-6);
      }

      // a press on Pause that turns into a drag is never Pause (nor its first, arming tap)
      const cur = (await snap(page)).cur;
      const tb = (await toggle.boundingBox())!;
      await drag(page, { x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }, { x: tb.x + 140, y: tb.y - 160 });
      await page.waitForTimeout(900);
      await playing(page);
      await expect(toggle).not.toHaveAttribute("data-armed", "true");
      expect((await snap(page)).cur).toBe(cur);

      // into the gramophone: collapse the sidebar (desktop, iPad landscape) or drag the bar's grabber off (iPad
      // portrait, phone)
      if (v.side) {
        await page.getByTestId("sidebar-hide").click();
        await expect.poll(() => placeOf(page)).toBe("disc");
      } else {
        const g = (await page.getByTestId("player-grip").boundingBox())!;
        const vp = page.viewportSize()!;
        await drag(
          page,
          { x: g.x + g.width / 2, y: g.y + g.height / 2 },
          { x: vp.width * 0.3, y: vp.height * 0.45 },
        );
        await expect.poll(() => placeOf(page)).toBe("disc");
      }
      const disc = page.getByTestId("player-gramophone");
      await expect(disc).toBeVisible();
      expect(await visiblePlayers(page)).toEqual(["player-gramophone"]);
      await playing(page);
      expect((await snap(page)).cur).toBe(cur);
      // the record turns while the room plays, the ring advances
      await expect(disc).toHaveAttribute("data-spin", "true");
      expect(await page.getByTestId("player-record").evaluate((e) => getComputedStyle(e).animationName)).toBe(
        "dock-spin",
      );
      const ringFrac = async () => Number(await page.getByTestId("player-ring").getAttribute("data-frac"));
      const f0 = await ringFrac();
      await expect.poll(ringFrac, { timeout: 8000 }).toBeGreaterThan(f0);
      await noOverflow(page);
      await shot(page, `${v.name}-2-gramophone`);

      // drag: it snaps to the nearer edge and the top corner, never over the tab bar; the room plays on
      const vp = page.viewportSize()!;
      let d = (await disc.boundingBox())!;
      await drag(page, { x: d.x + d.width / 2, y: d.y + d.height / 2 }, { x: vp.width - 30, y: 60 });
      await page.waitForTimeout(500);
      d = (await disc.boundingBox())!;
      expect(vp.width - (d.x + d.width)).toBeGreaterThanOrEqual(11);
      expect(vp.width - (d.x + d.width)).toBeLessThanOrEqual(14);
      const topAfter = d.y;
      expect(topAfter).toBeLessThan(vp.height / 3);
      await playing(page);
      // thrown low: it stays above the tab capsule (let go ON the bar's place, it would dock back into the bar)
      await drag(
        page,
        { x: d.x + d.width / 2, y: d.y + d.height / 2 },
        { x: 40, y: v.side ? vp.height - 10 : vp.height * 0.82 },
      );
      await page.waitForTimeout(500);
      d = (await disc.boundingBox())!;
      expect(d.x).toBeLessThan(vp.width / 2);
      const tab = await rect(page, '[data-testid="tab-bar"]');
      if (tab && tab.h > 0 && tab.y > vp.height / 2) expect(d.y + d.height).toBeLessThanOrEqual(tab.y);
      expect(d.y + d.height).toBeLessThanOrEqual(vp.height);
      await playing(page);
      expect((await snap(page)).cur).toBe(cur);
      // kept on this device
      const key = `tdj-player-dock:${vp.width < 600 ? "phone" : vp.width < 900 ? "tablet" : "desktop"}`;
      const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), key);
      expect(saved).toMatchObject({ detached: true, anchor: { edge: "left" } });
      if (v.side) expect(saved.anchor.y).toBe(1);
      // back in the Booth (the Booth is the player there) and out again: it stands in the same spot
      await page.goBack();
      await expect(page).not.toHaveURL(/\/library/);
      if (page.url().includes("/booth")) await expect(disc).toHaveCount(0);
      else await expect(disc).toBeVisible();
      await page.goForward();
      await expect(page).toHaveURL(/\/library/);
      await expect(disc).toBeVisible({ timeout: 10000 });
      await playing(page);
      const d2 = (await disc.boundingBox())!;
      expect(Math.abs(d2.x - d.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(d2.y - d.y)).toBeLessThanOrEqual(2);

      // a long press: the quick controls (the same player, the same confirm rules)
      await page.mouse.move(d2.x + d2.width / 2, d2.y + d2.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700);
      await page.mouse.up();
      await expect(dock(page)).toHaveAttribute("data-quick", "true");
      await expect(page.getByTestId("booth-mini")).toBeVisible();
      await playing(page);
      await noOverflow(page);
      await shot(page, `${v.name}-3-quick`);
      // into a card: Expand; the handle resizes it; below a card's width it is the gramophone again
      await page.getByTestId("player-expand").click();
      await expect.poll(() => placeOf(page)).toBe("float");
      const w0 = (await dock(page).boundingBox())!.width;
      const h = (await page.getByTestId("player-resize").boundingBox())!;
      await drag(
        page,
        { x: h.x + h.width / 2, y: h.y + h.height / 2 },
        { x: h.x + h.width / 2 + 60, y: h.y + 10 },
      );
      await page.waitForTimeout(400);
      const w1 = (await dock(page).boundingBox())!.width;
      expect(w1).toBeGreaterThan(w0 + 30);
      await noOverflow(page);
      await shot(page, `${v.name}-4-card`);
      // the card drags by its head, snapping right
      const head = (await page.getByTestId("player-head").boundingBox())!;
      await drag(
        page,
        { x: head.x + 60, y: head.y + head.height / 2 },
        { x: vp.width - 40, y: vp.height / 2 },
      );
      await page.waitForTimeout(500);
      const c = (await dock(page).boundingBox())!;
      expect(Math.round(vp.width - (c.x + c.width))).toBeGreaterThanOrEqual(11);
      expect(Math.round(vp.width - (c.x + c.width))).toBeLessThanOrEqual(14);
      await playing(page);
      // the handle (now on the card's left) shrinks it into the gramophone
      const h2 = (await page.getByTestId("player-resize").boundingBox())!;
      await drag(page, { x: h2.x + h2.width / 2, y: h2.y + 10 }, { x: h2.x + 400, y: h2.y + 10 }, 16);
      await expect.poll(() => placeOf(page)).toBe("disc");
      await playing(page);
      expect((await snap(page)).cur).toBe(cur);

      // a tap: Now playing, in the Booth
      await disc.click();
      await expect(page).toHaveURL(/\/booth/);
      await expect(page.getByTestId("now-view")).toBeVisible({ timeout: 15000 });
      await playing(page);
      await shot(page, `${v.name}-5-now-playing`);
      if (!v.side) {
        // let go on the bar's place (above the tab capsule): back into the bar
        await page.goBack();
        await expect(disc).toBeVisible({ timeout: 10000 });
        const b = (await disc.boundingBox())!;
        await drag(
          page,
          { x: b.x + b.width / 2, y: b.y + b.height / 2 },
          { x: vp.width / 2, y: vp.height - 6 },
        );
        await expect.poll(() => placeOf(page)).toBe("bar");
        await expect(page.getByTestId("booth-mini")).toBeVisible();
        await playing(page);
      }
    });

    test(`${v.name}: Reduce Motion keeps the record still`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => {
        try {
          localStorage.setItem(
            "tdj-player-dock:desktop",
            JSON.stringify({ detached: true, anchor: { edge: "right", y: 1 }, size: 80 }),
          );
          localStorage.setItem(
            "tdj-player-dock:tablet",
            JSON.stringify({ detached: true, anchor: { edge: "right", y: 1 }, size: 80 }),
          );
          localStorage.setItem(
            "tdj-player-dock:phone",
            JSON.stringify({ detached: true, anchor: { edge: "right", y: 1 }, size: 80 }),
          );
        } catch {}
      });
      await openBooth(page);
      await toLibrary(page);
      const disc = page.getByTestId("player-gramophone");
      await expect(disc).toBeVisible({ timeout: 10000 });
      await playing(page);
      await expect(disc).toHaveAttribute("data-playing", "true");
      await expect(disc).not.toHaveAttribute("data-spin", /.*/);
      expect(await page.getByTestId("player-record").evaluate((e) => getComputedStyle(e).animationName)).toBe(
        "none",
      );
      // the ring still tells the time
      const ringFrac = async () => Number(await page.getByTestId("player-ring").getAttribute("data-frac"));
      const f0 = await ringFrac();
      await expect.poll(ringFrac, { timeout: 8000 }).toBeGreaterThan(f0);
      await noOverflow(page);
    });
  });
}

test("phone: a pinch on the gramophone grows it into a card", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "tdj-player-dock:phone",
        JSON.stringify({ detached: true, anchor: { edge: "right", y: 0.5 }, size: 96 }),
      );
    } catch {}
  });
  await openBooth(page);
  await toLibrary(page);
  const disc = page.getByTestId("player-gramophone");
  await expect(disc).toBeVisible({ timeout: 10000 });
  const b = (await disc.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const cdp = await ctx.newCDPSession(page);
  const pts = (d: number) => [
    { x: cx - d, y: cy, id: 1 },
    { x: cx + d, y: cy, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(10) });
  for (let d = 12; d <= 70; d += 4) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => placeOf(page)).toBe("float");
  await playing(page);
  await noOverflow(page);
  await ctx.close();
});
