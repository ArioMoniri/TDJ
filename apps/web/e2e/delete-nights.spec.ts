/**
 * 2026-11 (the owner: "delete nights"): from the sidebar's Recent nights (✕ on hover, the right-click menu, Delete) and
 * from History (the row's menu, Edit's multi-select, Clear all…) — asked once, with an Undo; the IndexedDB record goes
 * (tdj-history-v2); the night the Booth has open is never deleted (its action says why).
 */
import { expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

/** the History records IndexedDB holds (idb-keyval's default store) */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("keyval-store");
        req.onsuccess = () => {
          const tx = req.result.transaction("keyval", "readonly");
          const all = tx.objectStore("keyval").getAllKeys();
          all.onsuccess = () =>
            resolve(
              (all.result as string[]).filter(
                (k) => typeof k === "string" && k.startsWith("tdj-history-v2:") && !k.endsWith(":index"),
              ),
            );
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
  );

/** four nights in History (the featured night's music under four names), written as the app writes them */
async function seed(page: Page) {
  await page.goto("/history");
  await page.evaluate(async () => {
    const p = await (await fetch("/featured/golden-double-peak.json")).json();
    const names = ["Night A", "Night B", "Night C", "Night D"];
    const now = Date.now();
    const snaps = names.map((title, i) => ({
      id: `seed-${i}`,
      createdAt: new Date(now - i * 60_000).toISOString(),
      title,
      options: p.options,
      playlist: { ...p, id: `seed-night-${i}`, name: title },
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
  await expect(page.getByTestId("history-row")).toHaveCount(4, { timeout: 30000 });
}
const confirmDelete = async (page: Page) => {
  const sheet = page.getByTestId("delete-nights");
  await expect(sheet).toBeVisible();
  await sheet.locator("#delete-nights-confirm").click();
  await expect(sheet).toBeHidden();
};

test("delete nights from the sidebar and from History, each with an Undo; the night open in the Booth stays", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  const recent = page.getByTestId("sidebar-recent-row");
  await expect(recent).toHaveCount(4);
  expect(await stored(page)).toHaveLength(4);

  // the sidebar: hover shows ✕; asked once; the row and its IndexedDB record go; Undo brings it back
  await recent.filter({ hasText: "Night A" }).hover();
  const x = recent.filter({ hasText: "Night A" }).getByTestId("sidebar-recent-delete");
  await expect(x).toBeVisible();
  await x.click();
  await expect(page.getByTestId("delete-nights")).toContainText("Night A");
  await confirmDelete(page);
  await expect(recent).toHaveCount(3);
  await expect(page.getByTestId("history-row")).toHaveCount(3);
  await expect.poll(() => stored(page)).toHaveLength(3);
  await expect(page.getByTestId("toast")).toContainText("Deleted “Night A”");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(recent).toHaveCount(4);
  await expect(recent.first()).toContainText("Night A");
  await expect.poll(() => stored(page)).toHaveLength(4);

  // right-click a sidebar row: its menu (Play in the Booth, Reopen, Rename…, Delete); then Delete on a focused one
  await recent.filter({ hasText: "Night B" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirmDelete(page);
  await expect(recent).toHaveCount(3);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(recent).toHaveCount(4);
  await recent.filter({ hasText: "Night C" }).locator("a").focus();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("delete-nights")).toContainText("Night C");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("delete-nights")).toBeHidden();
  await expect(recent).toHaveCount(4);

  // History: right-click a row opens its menu
  await page.getByTestId("history-row").filter({ hasText: "Night D" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirmDelete(page);
  await expect(page.getByTestId("history-row")).toHaveCount(3);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("history-row")).toHaveCount(4);

  // History: Edit → select two → Delete 2 → asked once → Undo
  await page.getByTestId("page-toolbar").getByTestId("history-edit").click();
  await page.getByTestId("history-pick").nth(0).click();
  await page.getByTestId("history-pick").nth(1).click();
  await expect(page.getByTestId("history-edit-bar")).toContainText("2 selected");
  await page.getByTestId("history-delete-picked").click();
  await expect(page.getByTestId("delete-nights")).toContainText("Delete 2 nights");
  await confirmDelete(page);
  await expect(page.getByTestId("history-row")).toHaveCount(2);
  await expect.poll(() => stored(page)).toHaveLength(2);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("history-row")).toHaveCount(4);
  await expect.poll(() => stored(page)).toHaveLength(4);
  await page.getByTestId("page-toolbar").getByTestId("history-edit").click();

  // the night playing in the Booth: open Night B there, back to History (client-side), it cannot be deleted
  await page.getByTestId("history-row").filter({ hasText: "Night B" }).locator("button").first().click();
  const detail = page.getByTestId("history-detail");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Set actions" }).click();
  await page.getByRole("menuitem", { name: "Play in the Booth" }).click();
  await expect(page).toHaveURL(/\/booth/);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as { __tdjBooth?: { getState: () => { playlist: { id: string } | null } } }
            ).__tdjBooth?.getState().playlist?.id ?? null,
        ),
      { timeout: 60000 },
    )
    .toBe("seed-night-1");
  await page.goBack();
  await expect(page).toHaveURL(/\/history/);
  const playing = page.getByTestId("history-row").filter({ hasText: "Night B" });
  await expect(playing).toHaveAttribute("data-protected", "");
  await expect(playing).toContainText("In the Booth");
  // its menu's Delete is off (the reason on hover); Delete on the focused row says why
  await playing.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await playing.locator("button").first().focus();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("toast")).toContainText("Booth");
  await expect(page.getByTestId("delete-nights")).toBeHidden();
  await expect(recent.filter({ hasText: "Night B" }).getByTestId("sidebar-recent-delete")).toHaveAttribute(
    "data-protected",
    "",
  );
  // Clear all… keeps it, and says why
  await page.getByTestId("page-toolbar").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear all…" }).click();
  const sheet = page.getByTestId("delete-nights");
  await expect(sheet.getByTestId("delete-nights-kept")).toContainText("Night B");
  await confirmDelete(page);
  await expect(page.getByTestId("history-row")).toHaveCount(1);
  await expect(page.getByTestId("history-row")).toContainText("Night B");
  await expect.poll(() => stored(page)).toHaveLength(1);
});
