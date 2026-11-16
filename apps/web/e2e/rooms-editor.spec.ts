/**
 * 2026-11 (the owner: "not all functions available in other editors are available in the rooms, the list is not
 * complete, and I can't select from available nights"; "rooms can be deletable"):
 * - the room's night is the whole night (opening, every tanda with its songs and cortina, closing) with Compose's
 *   editing: a song reordered inside a tanda and a cortina changed reach the other DJ; ⌘Z undoes for both
 * - a new room starts with a night chosen from History; the owner switches the room's night (confirmed) and the
 *   other DJ gets it
 * - the owner closes the room for everyone: the other DJ reads "closed by its owner"; a non-owner removes a room from
 *   their list only; the list says when an idle room expires
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

async function composeFeatured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 150_000 });
}
async function twoDjs(browser: Browser) {
  const a = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { a, b, ana: await a.newPage(), ben: await b.newPage() };
}
/** waits until React owns the control (a click before hydration is lost) */
async function ready(page: Page, sel: string) {
  await expect
    .poll(() =>
      page
        .locator(sel)
        .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
        .catch(() => false),
    )
    .toBe(true);
}
async function makeRoom(page: Page, name: string) {
  await page.goto("/rooms");
  await ready(page, "#room-create");
  await page.getByTestId("room-user").fill("Ana");
  await page.getByTestId("room-name").fill(name);
  await page.locator("#room-create").click();
  await expect(page.getByTestId("room-tandas")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Invite" }).first().click();
  const code = (await page.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  await page.keyboard.press("Escape");
  return code;
}
async function join(page: Page, baseURL: string, code: string) {
  await page.goto(`${baseURL}/rooms?join=${code}`);
  await ready(page, '[data-testid="room-join"]');
  await page.getByTestId("room-user").fill("Ben");
  await page.getByTestId("room-join").click();
  await expect(page.getByTestId("room-tandas")).toBeVisible({ timeout: 30_000 });
}
const songsOf = (page: Page, n: number) =>
  page.getByTestId(`room-tanda-${n}`).locator("[data-reorder-row][data-song]");

test("the room's night is the whole night with Compose's editing, synced: reorder a song, change a cortina, undo", async ({
  browser,
  baseURL,
}) => {
  const { a, b, ana, ben } = await twoDjs(browser);
  await composeFeatured(ana);
  const code = await makeRoom(ana, "Editor parity");
  // the whole night: the opening, every tanda with its songs and cortina, the closing
  const editor = ana.getByTestId("room-tandas");
  await expect(editor.getByTestId("night-editor-opening")).toContainText("La Cumparsita");
  await expect(editor.getByTestId("night-editor-closing")).toContainText("La Cumparsita");
  const tandas = await ana.locator('[data-testid^="room-tanda-"][data-reorder-row]').count();
  expect(tandas).toBeGreaterThan(20);
  await expect(songsOf(ana, 1)).toHaveCount(4);
  await expect(ana.getByTestId("room-tanda-1").getByTestId("cortina-row")).toBeVisible();
  // the covers, not letter tiles
  await expect(ana.getByTestId("room-tanda-1").getByTestId("tanda-card-art").first()).toBeVisible();

  await join(ben, baseURL!, code);
  const firstId = await songsOf(ana, 1).first().getAttribute("data-song");
  const secondId = await songsOf(ana, 1).nth(1).getAttribute("data-song");
  // Ana moves the first song of tanda 1 down (Alt+↓, as in Compose): Ben gets the new order
  await songsOf(ana, 1).first().focus();
  await ana.keyboard.press("Alt+ArrowDown");
  await expect(songsOf(ana, 1).first()).toHaveAttribute("data-song", secondId!);
  await expect(songsOf(ben, 1).first()).toHaveAttribute("data-song", secondId!, { timeout: 20_000 });
  // ⌘Z undoes it, for both
  await ana.locator("body").click({ position: { x: 5, y: 5 } });
  await ana.keyboard.press("ControlOrMeta+z");
  await expect(songsOf(ana, 1).first()).toHaveAttribute("data-song", firstId!);
  await expect(songsOf(ben, 1).first()).toHaveAttribute("data-song", firstId!, { timeout: 20_000 });
  // Ben changes the cortina after tanda 1: Ana gets it
  const before = await ana.getByTestId("room-tanda-1").getByTestId("cortina-row").innerText();
  await ben.getByTestId("room-tanda-1").getByTestId("editor-change-cortina").click();
  const pick = ben.getByTestId("cortina-pick");
  await expect(pick.getByTestId("cortina-option").first()).toBeVisible({ timeout: 20_000 });
  const title = (await pick.getByTestId("cortina-option").first().innerText()).split("\n")[0]!;
  await pick.getByTestId("cortina-option").first().click();
  await expect(pick).toBeHidden();
  await expect(ana.getByTestId("room-tanda-1").getByTestId("cortina-row")).toContainText(title.slice(0, 12), {
    timeout: 20_000,
  });
  expect(before).not.toContain(title.slice(0, 12));
  // a tanda moves by its bar (Alt+↓): both see the new order
  // (the bar reads "T2. Orchestra · Tango · 11:41": the cover's rhythm letter, the place, the tanda)
  const t2 = (await ana.getByTestId("room-tanda-2").getByTestId("editor-tanda-bar").innerText()).replace(
    /^[TVM]?\s*2\.\s*/,
    "",
  );
  await ana.getByTestId("room-tanda-1").getByTestId("editor-tanda-bar").focus();
  await ana.keyboard.press("Alt+ArrowDown");
  await expect(ben.getByTestId("room-tanda-1").getByTestId("editor-tanda-bar")).toContainText(
    t2.slice(0, 14),
    {
      timeout: 20_000,
    },
  );
  await a.close();
  await b.close();
});

test("choose a night from History for a new room; the owner switches the room's night and the other DJ gets it", async ({
  browser,
  baseURL,
}) => {
  const { a, b, ana, ben } = await twoDjs(browser);
  // two nights in History: the featured one, then a fresh compose
  await composeFeatured(ana);
  const firstTanda = await ana.locator("#result [data-tanda]").first().innerText();
  // a fresh compose (the featured night goes to History): once React owns the toolbar's Regenerate
  await ready(ana, '[data-testid="toolbar-regenerate"]');
  await ana.getByTestId("toolbar-regenerate").click();
  await expect
    .poll(() => ana.locator("#result [data-tanda]").first().innerText(), { timeout: 150_000 })
    .not.toBe(firstTanda);
  await ana.goto("/rooms");
  await ready(ana, "#room-create");
  await ana.getByTestId("room-user").fill("Ana");
  await ana.getByTestId("room-name").fill("Chosen night");
  // the picker lists the night open now, History and the featured nights, with a preview
  await ana.getByTestId("room-choose-night").click();
  const picker = ana.getByTestId("night-picker");
  await expect(picker.getByTestId("night-picker-current")).toBeVisible();
  await expect(picker.getByTestId("night-picker-featured")).toBeVisible();
  await picker.getByTestId("night-picker-featured").getByTestId("night-choice").first().click();
  await expect(picker.getByTestId("night-picker-preview")).toContainText("25 tandas");
  await picker.locator("#night-picker-use").click();
  await expect(picker).toBeHidden();
  await expect(ana.getByTestId("room-choose-night")).toContainText("25 tandas");
  await ana.locator("#room-create").click();
  await expect(ana.getByTestId("room-tandas")).toBeVisible({ timeout: 30_000 });
  await expect(ana.locator('[data-testid^="room-tanda-"][data-reorder-row]')).toHaveCount(25);
  await ana.getByRole("button", { name: "Invite" }).first().click();
  const code = (await ana.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  await ana.keyboard.press("Escape");
  await join(ben, baseURL!, code);
  await expect(ben.locator('[data-testid^="room-tanda-"][data-reorder-row]')).toHaveCount(25);
  // Ben is not the owner: no switch
  await expect(ben.getByTestId("room-switch-night")).toHaveCount(0);
  // Ana switches to the night she composed (from History), confirms; Ben gets it
  await ana.getByTestId("room-switch-night").click();
  const p2 = ana.getByTestId("night-picker");
  await p2.getByTestId("night-picker-history").getByTestId("night-choice").first().click();
  const n = Number((await p2.getByTestId("night-picker-preview").innerText()).match(/(\d+) tandas/)![1]);
  await p2.locator("#night-picker-use").click();
  await expect(ana.getByTestId("room-switch-confirm")).toBeVisible();
  await ana.locator("#room-switch-yes").click();
  await expect(ana.locator('[data-testid^="room-tanda-"][data-reorder-row]')).toHaveCount(n, {
    timeout: 20_000,
  });
  await expect(ben.locator('[data-testid^="room-tanda-"][data-reorder-row]')).toHaveCount(n, {
    timeout: 30_000,
  });
  await ben.getByRole("radio", { name: /Log/ }).click();
  await expect(ben.getByTestId("room-log")).toContainText("Ana loaded the night", { timeout: 20_000 });
  await a.close();
  await b.close();
});

test("the owner closes the room for everyone; the other DJ reads why; a guest removes a room from their list only", async ({
  browser,
  baseURL,
}) => {
  const { a, b, ana, ben } = await twoDjs(browser);
  await composeFeatured(ana);
  const code = await makeRoom(ana, "To be closed");
  await join(ben, baseURL!, code);
  // Ben (not the owner) has no Close
  await expect(ben.locator("#room-close")).toHaveCount(0);
  // a second room Ben is only a guest in, kept in his list after leaving
  await ana.locator("#room-close").click();
  await expect(ana.getByTestId("room-close-confirm")).toContainText("deleted from the server");
  await ana.locator("#room-close-yes").click();
  await expect(ana.getByTestId("room-tandas")).toHaveCount(0);
  await expect(ana.getByTestId(`room-past-${code}`)).toHaveCount(0);
  // Ben's next poll: closed by its owner, and the room leaves his list
  await expect(ben.getByTestId("rooms-error")).toContainText("closed by its owner", { timeout: 30_000 });
  await expect(ben.getByTestId(`room-past-${code}`)).toHaveCount(0);
  // the server answers 410 for the code now
  const r = await ben.request.get(`/api/rooms/${code}?since=0`);
  expect(r.status()).toBe(410);

  // a guest: Ben joins Ana's new room, leaves it (kept in his list with its expiry), then removes it there
  const code2 = await makeRoom(ana, "Guest only");
  await join(ben, baseURL!, code2);
  await ben.locator("#room-leave").click();
  const row = ben.getByTestId(`room-past-${code2}`);
  await expect(row).toContainText("expires in 30 days unless used");
  await ben.getByTestId("rooms-edit").click();
  await ben.getByTestId(`room-delete-${code2}`).click();
  await expect(row).toHaveCount(0);
  // the room is still there for Ana
  await expect(ana.getByTestId("room-tandas")).toBeVisible();
  const still = await ana.request.get(`/api/rooms/${code2}?since=0`);
  expect(still.status()).toBe(200);
  await a.close();
  await b.close();
});
