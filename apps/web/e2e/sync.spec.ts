/**
 * docs/SYNC.md: two browsers (two devices) with the same sync code. One turns sync on and shows its code, the other
 * joins with it and gets the nights; a rename and a delete on the first then reach the second. The server only sees
 * ciphertext (lib/server/sync.test.ts checks that); here the whole path runs through the real /api/sync.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

/** two nights in History, written as the app writes them (idb-keyval's store, tdj-history-v2) */
async function seed(page: Page) {
  await page.goto("/history");
  await page.evaluate(async () => {
    const p = await (await fetch("/featured/golden-double-peak.json")).json();
    const now = Date.now();
    const snaps = ["Night A", "Night B"].map((title, i) => ({
      id: `sync-seed-${i}`,
      createdAt: new Date(now - i * 60_000).toISOString(),
      title,
      options: p.options,
      playlist: { ...p, id: `sync-seed-night-${i}`, name: title },
      score: p.score?.total ?? 90,
      source: "compose",
    }));
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onupgradeneeded = () => req.result.createObjectStore("keyval");
      req.onsuccess = () => {
        const tx = req.result.transaction("keyval", "readwrite");
        const st = tx.objectStore("keyval");
        st.put(
          snaps.map((s) => s.id),
          "tdj-history-v2:index",
        );
        for (const s of snaps) st.put(s, `tdj-history-v2:${s.id}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.getByTestId("history-row")).toHaveCount(2, { timeout: 30000 });
}

const device = async (browser: Browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { ctx, page: await ctx.newPage() };
};

/** a round now (Settings → Sync → Sync now), and wait for it to finish */
async function syncNow(page: Page) {
  await page.goto("/settings#settings-sync");
  const status = page.getByTestId("sync-status");
  await expect(status).toBeVisible({ timeout: 30000 });
  await page.getByTestId("sync-now").click();
  await expect(status).toHaveAttribute("data-status", "ok", { timeout: 30000 });
}

const titles = (page: Page) => page.getByTestId("history-row").allInnerTexts();

test("two devices with one sync code: nights arrive, then a rename and a delete follow", async ({
  browser,
}) => {
  const a = await device(browser);
  const b = await device(browser);
  await seed(a.page);

  // A: turn sync on; its code is shown with a QR code
  await a.page.goto("/settings#settings-sync");
  await a.page.getByTestId("sync-start").click();
  const code = (await a.page.getByTestId("sync-code").innerText()).trim();
  expect(code).toMatch(/^tango(-[0-9a-z]{4}){7}$/);
  await expect(a.page.getByTestId("qr-code")).toBeVisible();
  await a.page.keyboard.press("Escape");
  await expect(a.page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok", { timeout: 30000 });

  // B: a wrong code is refused; the right one joins
  await b.page.goto("/settings#settings-sync");
  await b.page.getByTestId("sync-join-input").fill(code.replace(/.$/, (c) => (c === "0" ? "1" : "0")));
  await b.page.getByTestId("sync-join").click();
  await expect(b.page.getByTestId("sync-start")).toBeVisible();
  await b.page.getByTestId("sync-join-input").fill(code.toUpperCase());
  await b.page.getByTestId("sync-join").click();
  await expect(b.page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok", { timeout: 30000 });
  await expect(b.page.getByTestId("sync-devices")).toContainText("This device");
  await b.page.goto("/history");
  await expect(b.page.getByTestId("history-row")).toHaveCount(2, { timeout: 30000 });

  // A: rename Night A, delete Night B
  await a.page.goto("/history");
  await a.page.getByTestId("history-row").filter({ hasText: "Night A" }).locator("button").first().click();
  const detail = a.page.getByTestId("history-detail");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Set actions" }).click();
  await a.page.getByRole("menuitem", { name: "Rename…" }).click();
  await a.page.locator("#history-rename").fill("Sábado en Sunderland");
  await a.page.getByRole("dialog", { name: "Rename" }).getByRole("button", { name: "Save" }).click();
  await expect(detail.getByRole("heading", { name: "Sábado en Sunderland" })).toBeVisible();
  await a.page.keyboard.press("Escape");
  await a.page.getByTestId("history-row").filter({ hasText: "Night B" }).click({ button: "right" });
  const sheet = a.page.getByTestId("delete-nights");
  await expect(sheet).toBeVisible();
  await sheet.locator("#delete-nights-confirm").click();
  await expect(a.page.getByTestId("history-row")).toHaveCount(1);
  await syncNow(a.page);

  // B: both changes arrive
  await syncNow(b.page);
  await b.page.goto("/history");
  await expect(b.page.getByTestId("history-row")).toHaveCount(1, { timeout: 30000 });
  expect((await titles(b.page)).join(" ")).toContain("Sábado en Sunderland");
  expect((await titles(b.page)).join(" ")).not.toContain("Night B");

  // a reload keeps it (and A, which made the changes, still agrees)
  await b.page.reload();
  await expect(b.page.getByTestId("history-row")).toHaveCount(1, { timeout: 30000 });
  await syncNow(a.page);
  await a.page.goto("/history");
  await expect(a.page.getByTestId("history-row")).toHaveCount(1);
  await a.ctx.close();
  await b.ctx.close();
});
