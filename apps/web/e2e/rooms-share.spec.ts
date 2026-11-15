/**
 * §12 Rooms and §13 share a night. Two DJs in two browser contexts: Ana makes a room with her night, Ben joins by
 * its code and gets the same night; Ben's lock and Ana's reorder reach the other DJ, and both appear in the log
 * with who made them. A night link made on one origin opens on another and lands in History; the .tdjnight file
 * does the same.
 */
import { expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.TDJ_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
/** the same server under another origin (localhost ↔ 127.0.0.1) */
const otherOrigin = (url: string) => {
  const u = new URL(url);
  u.hostname = u.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return u.toString();
};

test.describe.configure({ timeout: 240_000 });

async function composeFeatured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 150_000 });
}

test("two DJs edit one night in a room and see each other's edits in the log", async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await browser.newContext({
    viewport: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
  });
  const ana = await a.newPage();
  const ben = await b.newPage();

  await composeFeatured(ana);
  await ana.goto("/rooms");
  await ana.getByTestId("room-user").fill("Ana");
  await ana.getByTestId("room-name").fill("Saturday at La Viruta");
  await ana.locator("#room-create").click();
  await expect(ana.getByTestId("room-tandas")).toBeVisible({ timeout: 20_000 });
  await expect(ana.getByRole("heading", { name: "Saturday at La Viruta" }).first()).toBeVisible();
  await ana.getByRole("button", { name: "Invite" }).first().click();
  const code = (await ana.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(ana.getByTestId("room-invite").getByTestId("qr-code")).toBeVisible();
  await shot(ana, "01-invite");
  await ana.keyboard.press("Escape");

  const tandas = await ana.locator('[data-testid^="room-tanda-"]').count();
  expect(tandas).toBeGreaterThan(10);
  const first = await ana.getByTestId("room-tanda-1").innerText();

  // Ben opens the room link on his phone, names himself and joins
  await ben.goto(`${baseURL}/rooms?join=${code}`);
  await expect(ben.getByTestId("room-code-input")).toHaveValue(code);
  await ben.getByTestId("room-user").fill("Ben");
  await ben.getByTestId("room-join").click();
  await expect(ben.getByTestId("room-tandas")).toBeVisible({ timeout: 30_000 });
  await expect(ben.locator('[data-testid^="room-tanda-"]')).toHaveCount(tandas);
  await expect(ben.getByTestId("room-tanda-1")).toContainText(first.split("\n")[0]!.slice(0, 20));
  await shot(ben, "02-ben-joined");

  // Ben sets tanda 2 to skip tonight: Ana sees it
  await expect(ben.getByTestId("room-skip-2")).toHaveAttribute("aria-pressed", "false");
  await ben.getByTestId("room-skip-2").click();
  await expect(ana.getByTestId("room-skip-2")).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

  // Ana moves tanda 1 later: Ben sees the new order, with his skipped tanda now first
  const second = (await ana.getByTestId("room-tanda-2").innerText()).split("\n")[0]!.replace(/^2\. /, "");
  await ana.getByTestId("room-down-1").click();
  await expect(ben.getByTestId("room-tanda-1")).toContainText(second.slice(0, 18), { timeout: 15_000 });
  await expect(ben.getByTestId("room-skip-1")).toHaveAttribute("aria-pressed", "true");

  // the log says who did what
  await ana.getByRole("radio", { name: /Log/ }).click();
  const log = ana.getByTestId("room-log");
  await expect(log).toContainText("Ben set tanda 2 to skip tonight", { timeout: 15_000 });
  await expect(log).toContainText("You moved tanda 1");
  await expect(log).toContainText("Ben joined the room");
  await shot(ana, "03-log");
  await ben.getByRole("radio", { name: /Log/ }).click();
  await expect(ben.getByTestId("room-log")).toContainText("Ana moved tanda 1", { timeout: 15_000 });
  await shot(ben, "04-ben-log");

  // the night is in the composer on Ben's side too, so he can play or export it
  await ben.goto("/");
  await expect(ben.locator("#result")).toBeVisible({ timeout: 30_000 });

  // leaving keeps the room in the list of previous rooms, with its log
  await ben.goto("/rooms");
  await ben.locator("#room-leave").click();
  await ben.getByTestId(`room-past-${code}`).click();
  await expect(ben.getByTestId("room-past").getByTestId("room-log")).toContainText(
    "You set tanda 2 to skip tonight",
    {
      timeout: 15_000,
    },
  );
  await shot(ben, "05-previous-room");
  await a.close();
  await b.close();
});

test("a night link made on one origin opens on another and lands in History", async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await a.newPage();
  await composeFeatured(page);
  const name = (await page.locator("#result").getAttribute("data-name")) ?? null;
  await page.keyboard.press("Meta+e");
  await expect(page.getByTestId("export-sheet")).toBeVisible();
  await page.locator("#export-share").click();
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("share-copy-link")).toBeEnabled({ timeout: 15_000 });
  await sheet.getByTestId("share-copy-link").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/night#n1\.[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(24_100);
  await sheet.getByTestId("share-show-code").click();
  await expect(sheet.getByTestId("qr-code")).toBeVisible({ timeout: 15_000 });
  await shot(page, "06-share-sheet");

  const download = page.waitForEvent("download");
  await sheet.getByTestId("share-save-file").click();
  const file = await (await download).path();
  expect((await download).suggestedFilename()).toMatch(/\.tdjnight$/);

  // another origin, another browser: the link opens there with a preview
  const b = await browser.newContext();
  const other = await b.newPage();
  const there = otherOrigin(link);
  expect(new URL(there).origin).not.toBe(new URL(baseURL!).origin);
  await other.goto(there);
  await expect(other.getByTestId("night-import")).toBeVisible({ timeout: 30_000 });
  await expect(other.getByTestId("night-missing")).toHaveCount(0);
  await expect(other.getByTestId("night-tandas")).toBeVisible();
  await shot(other, "07-night-preview");
  await other.getByTestId("night-import").click();
  await expect(other.locator("#result")).toBeVisible({ timeout: 30_000 });
  await other.goto(`${new URL(there).origin}/history`);
  await expect(other.getByText(/· import/).first()).toBeVisible({ timeout: 15_000 });
  if (name) await expect(other.getByText(name).first()).toBeVisible();

  // the file opens the same way
  await other.goto(`${new URL(there).origin}/night`);
  await other.getByTestId("night-file-input").setInputFiles(file!);
  await expect(other.getByTestId("night-import")).toBeVisible({ timeout: 30_000 });
  await a.close();
  await b.close();
});

test("a damaged link says so in plain words", async ({ page }) => {
  await page.goto("/night#n1.AAAA");
  await expect(page.getByTestId("night-error")).toContainText(/damaged|not a T-DJ night/);
});
