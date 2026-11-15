/**
 * 2026-11 (the owner, on an iPad in landscape: "the search won't work on the playlist songs, it should be working on.
 * Also swapping music while others are playing should be fast and easy, like clicking swap, searching the song and
 * changing"): Find in tonight's night takes the keyboard at once and lists the whole night by tanda, accents off;
 * Play now asks first while the room plays; every row's Swap opens one sheet for that place — Suggested, the
 * catalogue, tonight — and a pick replaces it at once while the room keeps playing, with Undo; a pick that breaks a
 * rule asks in the rule sheet. With 30 s clips, on an iPad Pro 11 in landscape and an iPhone 15 Pro (Chromium with
 * their viewport, scale, touch and user agent).
 */
import { type BrowserContextOptions, devices, expect, type Locator, type Page, test } from "@playwright/test";

const SHOTS = process.env.TDJ_SHOTS;

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
  // against `next dev` its overlay's badge sits over the phone transport's first button: not the app's
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
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

type Snap = { state: string; started: boolean; cur: number | null; items: number };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: {
          getState: () => {
            state: string;
            started: boolean;
            current: { planIndex: number } | null;
            plan: { items: unknown[] };
          };
        };
      }
    ).__tdjBooth.getState();
    return {
      state: s.state,
      started: s.started,
      cur: s.current?.planIndex ?? null,
      items: s.plan.items.length,
    } as Snap;
  });
const titleAt = (page: Page, i: number) =>
  page.evaluate(
    (k) =>
      (
        window as unknown as { __tdjBooth: { getState: () => { plan: { items: Array<{ title: string }> } } } }
      ).__tdjBooth.getState().plan.items[k]!.title,
    i,
  );
/** the plan index of track `k` (0-based) of tanda `tanda` */
const trackOf = (page: Page, tanda: number, k: number) =>
  page.evaluate(
    ([t, n]) => {
      const items = (
        window as unknown as {
          __tdjBooth: { getState: () => { plan: { items: Array<{ kind: string; tanda: number }> } } };
        }
      ).__tdjBooth.getState().plan.items;
      return items.map((it, i) => (it.kind === "track" && it.tanda === t ? i : -1)).filter((i) => i >= 0)[n]!;
    },
    [tanda, k] as const,
  );

const { defaultBrowserType: _a, ...ipad } = devices["iPad Pro 11 landscape"];
const { defaultBrowserType: _b, ...iphone } = devices["iPhone 15 Pro"];
const DEVICES: Array<[string, BrowserContextOptions]> = [
  ["iPad Pro 11 landscape", ipad],
  ["iPhone 15 Pro", iphone],
];

for (const [name, opts] of DEVICES) {
  const phone = name.startsWith("iPhone");
  const slug = phone ? "iphone" : "ipad";
  const shot = async (page: Page, file: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${slug}-${file}.png` });
  };
  const tap = (l: Locator) => (phone ? l.tap() : l.click());
  /** the set list: the column on an iPad, a sheet on a phone */
  const setList = async (page: Page) => {
    if (!phone) return page.getByTestId("booth-set").first();
    if (!(await page.getByTestId("booth-set-sheet").isVisible()))
      await page.getByTestId("booth-set-open").click();
    const sheet = page.getByTestId("booth-set-sheet");
    await expect(sheet).toBeVisible();
    return sheet;
  };
  /** start the night on the first song of tanda 1 */
  const startOnTanda1 = async (page: Page) => {
    const first = await trackOf(page, 1, 0);
    await page.evaluate(
      (i) =>
        (window as unknown as { __tdjBooth: { getState: () => { select: (i: number) => void } } }).__tdjBooth
          .getState()
          .select(i),
      first,
    );
    await page.getByTestId("booth-start").click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(first);
    await expect.poll(async () => (await snap(page)).state, { timeout: 10000 }).toBe("playing");
    return first;
  };
  const minTargets = async (scope: Locator) => {
    for (const b of await scope.getByRole("button").all()) {
      if (!(await b.isVisible())) continue;
      const r = (await b.boundingBox())!;
      expect(r.height, await b.getAttribute("aria-label")).toBeGreaterThanOrEqual(43.5);
    }
  };

  test(`${name}: Find in tonight's night types at once, lists the night by tanda, accents off, T2; Play now asks while playing`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    await page.getByTestId("booth-find-songs").click();
    const sheet = page.getByTestId("booth-tonight-search");
    await expect(sheet).toBeVisible();
    const q = sheet.getByTestId("booth-tonight-q");
    // the field has the keyboard (the Sheet used to move it to Cancel): typing goes straight in
    await expect(q).toBeFocused();
    expect(await q.getAttribute("type")).toBe("search");
    expect(Number.parseFloat(await q.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(
      16,
    );
    // the empty field lists the whole night, grouped by tanda
    const { items } = await snap(page);
    await expect(sheet.getByTestId("booth-tonight-group").nth(3)).toBeVisible();
    expect(await sheet.getByTestId("booth-tonight-hit").count()).toBeGreaterThan(items / 2);
    // an iOS segmented control: equal segments, the selected one marked
    const radios = sheet.getByRole("radio");
    const [r1, r2] = [(await radios.nth(0).boundingBox())!, (await radios.nth(1).boundingBox())!];
    expect(Math.abs(r1.width - r2.width)).toBeLessThan(2);
    expect(r1.height).toBeGreaterThanOrEqual(43.5);
    await expect(sheet.getByRole("radio", { name: "Tonight" })).toHaveAttribute("aria-checked", "true");
    // the sheet fits the screen; its list scrolls inside it
    const box = (await sheet.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box.height).toBeGreaterThan(vp.height * 0.5);
    await shot(page, "tonight-empty");

    await page.keyboard.type("conoces");
    const hit = sheet.getByTestId("booth-tonight-hit").filter({ hasText: "Ahora No Me Conocés" });
    await expect(hit).toHaveCount(1);
    await expect(hit.getByTestId("booth-tonight-where")).toHaveText(/^T\d+ · \d$/);
    await expect(hit.getByTestId("booth-tonight-hit-len")).toHaveText(/^\d+:\d\d$/);
    await expect(hit.getByTestId("artwork").or(hit.locator("img, [aria-hidden]")).first()).toBeVisible();
    await minTargets(hit);
    await shot(page, "tonight-conoces");
    await q.fill("T2");
    const wheres = await sheet.getByTestId("booth-tonight-where").allInnerTexts();
    expect(wheres.length).toBeGreaterThan(1);
    for (const w of wheres) expect(w).toMatch(/^T2 · /);
    // Done closes it
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);

    // while the room plays, Play now asks first; Cancel leaves the room as it is, the answer plays it
    const first = await startOnTanda1(page);
    await page.getByTestId("booth-find-songs").click();
    await expect(q).toBeFocused();
    await page.keyboard.type("Ahora No Me Conocés");
    const target = Number(await hit.getAttribute("data-plan-index"));
    expect(target).not.toBe(first);
    await tap(hit.getByTestId("booth-tonight-play"));
    const confirm = sheet.getByTestId("booth-tonight-confirm");
    await expect(confirm).toBeVisible();
    await shot(page, "tonight-confirm");
    expect((await snap(page)).cur).toBe(first);
    await tap(confirm.getByTestId("booth-tonight-confirm-no"));
    await expect(confirm).toHaveCount(0);
    await tap(hit.getByTestId("booth-tonight-play"));
    await tap(confirm.getByTestId("booth-tonight-confirm-yes"));
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(target);
    await ctx.close();
  });

  test(`${name}: while a song plays, Swap song 3 of its tanda via Suggested; the room plays on; Undo`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const first = await startOnTanda1(page);
    const third = await trackOf(page, 1, 2);
    const was = await titleAt(page, third);
    const list = await setList(page);
    const row = list.locator(`.booth-row[data-plan-index="${third}"]`);
    await row.scrollIntoViewIfNeeded();
    const swap = row.getByTestId("booth-row-swap");
    await expect(swap).not.toHaveAttribute("aria-disabled", "true");
    await tap(swap);
    // one tap: the sheet, no question
    const sheet = page.getByTestId("booth-swap-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("booth-swap-when")).toHaveAttribute("data-when", "ahead");
    await expect(sheet.getByTestId("booth-swap-confirm")).toHaveCount(0);
    const sug = sheet.getByTestId("booth-swap-suggestion").first();
    await expect(sug).toBeVisible({ timeout: 20000 });
    await minTargets(sug);
    await shot(page, "swap-suggested");
    const pickId = (await sug.getAttribute("data-id"))!;
    // the pre-listen is the headphones' (or, with none chosen, this device's test): never the room
    const before = await snap(page);
    await tap(sug.getByTestId("booth-preview"));
    await page.waitForTimeout(400);
    expect((await snap(page)).cur).toBe(before.cur);
    await tap(sug.getByTestId("booth-swap-pick"));
    await expect(sheet).toHaveCount(0, { timeout: 20000 });
    // the row changed, the room did not
    await expect
      .poll(() =>
        page.evaluate(
          (i) =>
            (
              window as unknown as {
                __tdjBooth: { getState: () => { plan: { items: Array<{ id?: string }> } } };
              }
            ).__tdjBooth.getState().plan.items[i]!.id,
          third,
        ),
      )
      .toBe(pickId);
    const now = await titleAt(page, third);
    expect(now).not.toBe(was);
    const after = await snap(page);
    expect(after.cur).toBe(first);
    expect(after.state).toBe("playing");
    expect(after.items).toBe(before.items);
    const listAgain = await setList(page);
    await expect(listAgain.locator(`.booth-row[data-plan-index="${third}"] .booth-row-title`)).toContainText(
      now,
    );
    if (phone) {
      await page.getByTestId("booth-set-sheet").getByRole("button", { name: "Done" }).click();
      await expect(page.getByTestId("booth-set-sheet")).toHaveCount(0);
    }
    // the toast: Swapped · Undo
    const toast = page.getByTestId("toast").filter({ hasText: `Swapped: ${now}` });
    await expect(toast).toBeVisible();
    await shot(page, "swap-toast");
    await tap(toast.getByRole("button", { name: "Undo" }));
    await expect.poll(() => titleAt(page, third), { timeout: 15000 }).toBe(was);
    expect((await snap(page)).cur).toBe(first);
    expect((await snap(page)).state).toBe("playing");
    await ctx.close();
  });

  test(`${name}: Swap from Up Next via the catalogue search; a pick that breaks a rule asks; "Do it as I said"`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const first = await startOnTanda1(page);
    // Up Next: song 2 of tanda 1
    const next = Number(await page.getByTestId("booth-next-title").getAttribute("data-next-index"));
    expect(next).toBe(await trackOf(page, 1, 1));
    await tap(page.getByTestId("booth-next-swap"));
    const sheet = page.getByTestId("booth-swap-sheet");
    await expect(sheet).toBeVisible();
    // the catalogue: another recording by the same orchestra and singer, valid for the place
    const q = sheet.getByTestId("booth-swap-q");
    await q.fill("Vargas");
    const ok = sheet.getByTestId("booth-swap-result").and(page.locator('[data-ok="1"]')).first();
    await expect(ok).toBeVisible({ timeout: 20000 });
    await shot(page, "swap-catalogue");
    const okId = (await ok.getAttribute("data-id"))!;
    await tap(ok.getByTestId("booth-swap-pick"));
    await expect(sheet).toHaveCount(0, { timeout: 20000 });
    await expect(page.getByTestId("rule-sheet")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          (i) =>
            (
              window as unknown as {
                __tdjBooth: { getState: () => { plan: { items: Array<{ id?: string }> } } };
              }
            ).__tdjBooth.getState().plan.items[i]!.id,
          next,
        ),
      )
      .toBe(okId);
    expect((await snap(page)).cur).toBe(first);
    expect((await snap(page)).state).toBe("playing");
    // an instrumental for the vocal tanda: the rule sheet asks; "Do it as I said" puts it there
    const third = await trackOf(page, 1, 2);
    const list = await setList(page);
    await tap(list.locator(`.booth-row[data-plan-index="${third}"]`).getByTestId("booth-row-swap"));
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("booth-swap-q").fill("De Pura Cepa");
    const breaks = sheet.getByTestId("booth-swap-result").filter({ hasText: "De Pura Cepa" }).first();
    await expect(breaks).toBeVisible({ timeout: 20000 });
    await expect(breaks).toHaveAttribute("data-ok", "asks");
    await tap(breaks.getByTestId("booth-swap-pick"));
    const rule = page.getByTestId("rule-sheet");
    await expect(rule).toBeVisible({ timeout: 20000 });
    await shot(page, "swap-rule");
    await tap(rule.getByTestId("rule-as-said"));
    await expect(rule).toHaveCount(0);
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => titleAt(page, third), { timeout: 15000 }).toBe("De Pura Cepa");
    expect((await snap(page)).cur).toBe(first);
    expect((await snap(page)).state).toBe("playing");
    await ctx.close();
  });

  test(`${name}: the playing song swaps only after a confirm; a cortina swaps from its row`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const first = await startOnTanda1(page);
    const was = await titleAt(page, first);
    const list = await setList(page);
    await tap(list.locator(`.booth-row[data-plan-index="${first}"]`).getByTestId("booth-row-swap"));
    const sheet = page.getByTestId("booth-swap-sheet");
    await expect(sheet.getByTestId("booth-swap-when")).toHaveAttribute("data-when", "playing");
    const sug = sheet.getByTestId("booth-swap-suggestion").first();
    await expect(sug).toBeVisible({ timeout: 20000 });
    await tap(sug.getByTestId("booth-swap-pick"));
    const confirm = sheet.getByTestId("booth-swap-confirm");
    await expect(confirm).toBeVisible();
    await shot(page, "swap-playing-confirm");
    // nothing changed yet
    expect(await titleAt(page, first)).toBe(was);
    await tap(confirm.getByTestId("booth-swap-confirm-no"));
    await expect(confirm).toHaveCount(0);
    expect(await titleAt(page, first)).toBe(was);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    // the cortina after tanda 1
    const cortina = await page.evaluate(() =>
      (
        window as unknown as {
          __tdjBooth: { getState: () => { plan: { items: Array<{ kind: string; tanda: number }> } } };
        }
      ).__tdjBooth
        .getState()
        .plan.items.findIndex((it) => it.kind === "cortina" && it.tanda === 1),
    );
    const cwas = await titleAt(page, cortina);
    const list2 = await setList(page);
    const crow = list2.locator(`.booth-row[data-plan-index="${cortina}"]`);
    await crow.scrollIntoViewIfNeeded();
    await tap(crow.getByTestId("booth-row-swap"));
    await expect(sheet).toBeVisible();
    const c = sheet.getByTestId("booth-swap-suggestion").first();
    await expect(c).toBeVisible({ timeout: 20000 });
    const ctitle = (await c.locator(".text-subhead").first().innerText()).trim();
    await tap(c.getByTestId("booth-swap-pick"));
    await expect(sheet).toHaveCount(0, { timeout: 20000 });
    await expect.poll(() => titleAt(page, cortina), { timeout: 15000 }).not.toBe(cwas);
    expect(await titleAt(page, cortina)).toBe(ctitle);
    expect((await snap(page)).cur).toBe(first);
    await ctx.close();
  });
}
