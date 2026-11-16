/**
 * 2026-11 (the owner: "depending on the feedback received for each tanda via the buttons — Floor full ♥ / OK / Floor
 * emptied, room hearts, praise — the AI should suggest changes for the upcoming tandas, and learn for the future"). In
 * the Booth with 30 s clips the night plays from tanda 5; the DJ taps "Floor emptied" on a played tanda; the suggestion
 * card offers a better next tanda (core adapt.ts) and changes nothing by itself; Apply swaps it through the rule check;
 * the toast's Undo restores the night. Settings → learning lists what the floor taught, with its switch.
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

type BoothW = {
  __tdjBooth: {
    getState: () => {
      state: string;
      select: (i: number) => void;
      plan: { items: Array<{ kind: string; tanda: number }> };
      playlist: { tandas: Array<{ songs: Array<{ id: string }> }> };
    };
  };
};
const tandaIds = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as BoothW).__tdjBooth
      .getState()
      .playlist.tandas.map((t) => t.songs.map((s) => s.id).join(",")),
  );

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
  // one known night: the composer's request with a fixed seed
  await page.route(/\/api\/compose$/, async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    await route.continue({ postData: JSON.stringify({ ...body, seed: 2 }) });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  // Compose's inspector: how the tanda follows the one before (or leads into the next), one line
  await expect(page.getByTestId("inspector-flow")).toHaveText(
    /^(Follows|Leads into|Two|An|A big|The same|Rare)/,
  );
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

test("the inspector's flow line; Floor emptied → a suggestion for the next tandas; Apply swaps it; Undo restores the night", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  // the night plays from tanda 5 (tandas 1–5 have played or play: their floor buttons show)
  const first = await page.evaluate(() => {
    const s = (window as unknown as BoothW).__tdjBooth.getState();
    return s.plan.items.findIndex((it) => it.kind === "track" && it.tanda === 5);
  });
  await page.evaluate((i) => (window as unknown as BoothW).__tdjBooth.getState().select(i), first);
  await page.getByTestId("booth-start").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as BoothW).__tdjBooth.getState().state), {
      timeout: 20000,
    })
    .toBe("playing");
  const before = await tandaIds(page);
  const set = page.getByTestId("booth-set").first();
  const card = page.getByTestId("booth-adapt");
  // the floor emptied after tanda 5 (then 4, then 3): at most one card, never a change by itself
  let shown = false;
  for (const k of [5, 4, 3]) {
    const btn = set.getByTestId(`set-${k}-floor-emptied`).first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    try {
      await expect(card).toBeVisible({ timeout: 20000 });
      shown = true;
      break;
    } catch {
      // the plan held after this tanda: the next one
    }
  }
  expect(shown, "a suggestion after an emptied floor").toBe(true);
  await expect(card).toContainText(/The floor emptied after .+\./);
  await expect(page.getByTestId("booth-adapt-what")).toContainText(/swap .+ for .+/);
  expect(await tandaIds(page)).toEqual(before);
  // Apply: one tanda changes (through the rule check); a rule sheet, if one asks, is confirmed
  await page.getByTestId("booth-adapt-apply").click();
  const confirm = page.getByTestId("rule-as-said");
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click();
  await expect(card).toBeHidden({ timeout: 20000 });
  await expect
    .poll(async () => (await tandaIds(page)).filter((x, i) => x !== before[i]).length, {
      timeout: 20000,
    })
    .toBe(1);
  // the toast's Undo: the night as it was
  await page.getByTestId("toast").getByRole("button", { name: /undo/i }).click();
  await expect.poll(() => tandaIds(page), { timeout: 20000 }).toEqual(before);
  // Settings → learning: the floor's lesson, with the source and the switch
  await page.goto("/settings");
  const g = page.getByTestId("floor-learning");
  await g.scrollIntoViewIfNeeded();
  await expect(g.getByTestId("floor-lesson").first()).toContainText(/From floor reactions/);
  await expect(g.getByRole("switch", { name: /Learn from floor reactions/ })).toBeVisible();
});
