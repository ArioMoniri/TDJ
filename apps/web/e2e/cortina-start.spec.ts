/**
 * 2026-11 (the owner: "cortinas play 40 s from the start, so dancers don't recognise them: the first part is mostly
 * melody"): in the Booth a cortina row says where it starts — "Starts at 1:04 (chorus)" — and the DJ's own start,
 * set in the cortina's sheet, is saved per cortina id with the night (it survives a reload) and goes back to the
 * chorus in one tap. Desktop and iPhone 15 Pro (Chromium with its viewport, touch and user agent), 30 s clips.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

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

async function openBooth(page: Page) {
  await page.addInitScript(() => {
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
  await waitBooth(page);
}
async function waitBooth(page: Page) {
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

type Row = { i: number; id: string; trimIn: number; saved?: number };
/** the plan's cortina rows (index, id, start) and what the night saved for them */
const cortinaRows = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: {
          getState: () => {
            plan: { items: Array<{ kind: string; id?: string; trimInSec?: number }> };
            playlist: { booth?: { cortinaEdits?: Record<string, { startSec?: number }> } };
          };
        };
      }
    ).__tdjBooth.getState();
    return s.plan.items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.kind === "cortina")
      .map(({ it, i }) => ({
        i,
        id: it.id!,
        trimIn: it.trimInSec ?? 0,
        saved: s.playlist.booth?.cortinaEdits?.[it.id!]?.startSec,
      })) as Row[];
  });
const clock = (sec: number) => {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15 Pro"];
const DEVICES: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["iPhone 15 Pro", iphone],
];

for (const [name, opts] of DEVICES) {
  const phone = name !== "desktop";
  const setList = async (page: Page) => {
    if (!phone) return page.getByTestId("booth-set").first();
    if (!(await page.getByTestId("booth-set-sheet").isVisible()))
      await page.getByTestId("booth-set-open").click();
    const sheet = page.getByTestId("booth-set-sheet");
    await expect(sheet).toBeVisible();
    return sheet;
  };

  test(`${name}: a cortina row says it starts at its chorus; the DJ's own start persists, and goes back in one tap`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    // the featured night's cortinas start at their chorus (data/cache/cortina_hooks.json)
    const rows = await cortinaRows(page);
    expect(rows.length).toBe(24);
    expect(rows.filter((r) => r.trimIn > 0).length).toBeGreaterThan(15);
    // a later cortina (the playhead's own is read-only once the night runs; before the night every row edits)
    const target = rows.filter((r) => r.trimIn > 20)[2]!;
    const list = await setList(page);
    const row = list.locator(`.booth-row[data-plan-index="${target.i}"]`);
    await row.scrollIntoViewIfNeeded();
    const label = row.getByTestId("booth-cortina-start");
    await expect(label).toContainText(`Starts at ${clock(target.trimIn)} (chorus)`);

    // the row opens the cortina's sheet: the same start field as a song's
    if (phone) await row.locator(".booth-row-n").tap();
    else await row.locator(".booth-row-n").click();
    const sheet = page.getByTestId("booth-play-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("booth-cortina-start-label")).toHaveText(
      `Starts at ${clock(target.trimIn)} (chorus)`,
    );
    const input = sheet.getByTestId("booth-start-at");
    await input.scrollIntoViewIfNeeded();
    await input.fill("0:30");
    await input.press("Enter");
    await expect(sheet.getByTestId("booth-cortina-start-label")).toHaveText("Starts at 0:30 (your start)");
    await expect
      .poll(async () => (await cortinaRows(page)).find((r) => r.i === target.i))
      .toMatchObject({ trimIn: 30, saved: 30 });
    // only this cortina changed
    const others = (await cortinaRows(page)).filter((r) => r.i !== target.i);
    expect(others.every((r) => r.saved === undefined)).toBe(true);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);

    // saved with the night: a reload keeps it
    await page.reload();
    await waitBooth(page);
    await expect
      .poll(async () => (await cortinaRows(page)).find((r) => r.i === target.i))
      .toMatchObject({ trimIn: 30, saved: 30 });
    const list2 = await setList(page);
    const row2 = list2.locator(`.booth-row[data-plan-index="${target.i}"]`);
    await row2.scrollIntoViewIfNeeded();
    await expect(row2.getByTestId("booth-cortina-start")).toContainText("Starts at 0:30 (your start)");

    // one tap back to the chorus
    if (phone) await row2.locator(".booth-row-n").tap();
    else await row2.locator(".booth-row-n").click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /^Use the chorus/ }).click();
    await expect(sheet.getByTestId("booth-cortina-start-label")).toHaveText(
      `Starts at ${clock(target.trimIn)} (chorus)`,
    );
    await expect
      .poll(async () => (await cortinaRows(page)).find((r) => r.i === target.i))
      .toMatchObject({ trimIn: target.trimIn });
    expect((await cortinaRows(page)).find((r) => r.i === target.i)!.saved).toBeUndefined();
    await ctx.close();
  });
}
