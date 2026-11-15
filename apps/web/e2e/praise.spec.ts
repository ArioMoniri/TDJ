/**
 * 2026-11-15 (the owner, live: "The 14th Troilo tanda was amazing. It finished so nicely, the tanda started and
 * connected so nicely. Have that also in the learned things."). In the Booth the DJ taps "Praise this tanda ★" in
 * the Controls panel's Floor group, adds a short note and saves: the DJ's memory holds the praise (the night, the
 * tanda, its sides in order, its neighbours and cortinas, its role, the note); the button reads as pressed.
 * Database → Memory lists it under "Praised by you" with what it teaches, next to the featured night's own praise,
 * and deletes it. A compose that carries the praise still keeps every tanda in one mode.
 */
import { expect, type Page, test } from "@playwright/test";

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
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

type Praise = {
  id: string;
  nightId: string;
  tanda: number;
  songIds: string[];
  family: string;
  role: string;
  reason: string;
  note?: string;
  prevCortinaId: string | null;
  nextCortinaId: string | null;
  source?: string;
};
/** the DJ's memory as the app stored it (IndexedDB, idb-keyval's default store) */
const memoryOf = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("keyval-store");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("keyval", "readonly");
          const get = tx.objectStore("keyval").get("tdj-memory");
          get.onsuccess = () => resolve((get.result as Record<string, unknown>) ?? null);
          get.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );
const praiseOf = async (page: Page) =>
  (((await memoryOf(page))?.learned as { praise?: Praise[] } | undefined)?.praise ?? []) as Praise[];

test("Praise this tanda ★ in the Booth → the DJ's memory holds it → Database → Memory lists what it teaches and deletes it", async ({
  page,
}) => {
  test.setTimeout(240000);
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth.getState()
            .state,
      ),
    )
    .toBe("playing");

  // the Controls panel's Floor group: next to the floor reactions
  await page.getByTestId("booth-controls-toggle").click();
  const praise = page.getByTestId("ctl-tanda-praise");
  await expect(praise).toBeVisible();
  await expect(page.getByTestId("ctl-tanda-floor")).toBeVisible();
  expect((await praise.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(praise).toHaveAttribute("aria-pressed", "false");
  await praise.click();
  const sheet = page.getByTestId("praise-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("praise-note").fill("the floor sang along");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(praise).toHaveAttribute("aria-pressed", "true");

  // the memory: the same entry the featured night's store holds, for this night, with the note
  await expect.poll(async () => (await praiseOf(page)).length).toBe(1);
  const night = (await (await page.request.get("/featured/golden-double-peak.json")).json()) as {
    id: string;
    options: Record<string, unknown>;
    tandas: Array<{ songs: Array<{ id: string; title: string }>; phase: string }>;
  };
  const p = (await praiseOf(page))[0]!;
  expect(p.nightId).toBe(night.id);
  expect(p.source).toBe("dj");
  expect(p.note).toBe("the floor sang along");
  const t = night.tandas[p.tanda]!;
  expect(p.songIds).toEqual(t.songs.filter((s) => !/cumparsita/i.test(s.title)).map((s) => s.id));
  expect(p.role).toBe(t.phase);
  expect(p.family).toMatch(/\|/);

  // Database → Memory: the DJ's praise under "Praised by you", and the featured night's own praise in its group
  await page.goto("/database?tab=memory");
  const mine = page.getByTestId("learned-praise");
  await expect(mine).toBeVisible({ timeout: 30000 });
  await expect(mine).toContainText("Praised by you");
  const row = mine.locator(`[data-testid="praise-row"][data-praise="${p.id}"]`);
  await expect(row).toContainText("the floor sang along");
  await expect(row.getByTestId("praise-teaches")).toContainText("The tanda:");
  await expect(row).toContainText("The order:");
  const featured = page.getByTestId("featured-praise");
  await expect(featured).toContainText("The 14th Troilo tanda was amazing", { timeout: 30000 });
  await expect(featured).toContainText("The connections:");

  // a compose that carries the praise keeps every tanda it builds in one mode
  const { learned: _l, favourites: _f, overrides: _o, recent: _r, explicit: _e, ...options } = night.options;
  const r = await page.request.post("/api/compose", {
    data: { ...options, seed: 99, learned: { praise: await praiseOf(page) } },
    timeout: 120000,
  });
  expect(r.ok()).toBe(true);
  const composed = (await r.json()) as {
    tandas: Array<{ pinned?: unknown; songs: Array<{ vocal?: boolean; title: string }> }>;
  };
  for (const x of composed.tandas.filter((y) => !y.pinned)) {
    const v = x.songs.filter((s) => !/cumparsita/i.test(s.title)).map((s) => !!s.vocal);
    expect(new Set(v).size).toBeLessThanOrEqual(1);
  }

  // delete it: gone from the list and from the memory
  await row.getByTestId("praise-delete").click();
  await expect(mine.locator('[data-testid="praise-row"]')).toHaveCount(0);
  await expect.poll(async () => (await praiseOf(page)).length).toBe(0);
});
