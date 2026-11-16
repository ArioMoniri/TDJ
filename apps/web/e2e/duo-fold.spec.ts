/**
 * 2026-11 — iPhone Duo: fold and unfold during a night. iOS resizes the app's one scene between the outer display
 * (466 × 678 pt) and the inner one (951 × 669 pt open; e2e/devices.ts); in the app's WKWebView that is a resize of
 * the same page. Runs once per posture project (iphone-duo-*): the page opens in that posture and is folded or
 * unfolded to the other display, and back.
 *   - nothing reloads (a marker on window survives, one navigation entry),
 *   - the Booth keeps playing the same song, its clock keeps moving,
 *   - the layout follows the width: the phone's tab bar folded, the wider navigation open; no sideways overflow.
 * Screenshots go to $DUO_SHOTS when set.
 */
import { expect, type Page, test } from "@playwright/test";
import { DUO, type DuoPosture, duoSafeArea } from "./devices";

const SHOTS = process.env.DUO_SHOTS;

function wav(sec = 40): Buffer {
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

/** the other display: folded ↔ open */
const OTHER: Record<DuoPosture, DuoPosture> = {
  outer: "inner",
  "outer-landscape": "inner",
  inner: "outer",
  "inner-portrait": "outer",
};

type State = { planIndex: number; state: string; started: boolean; title: string | null };
const booth = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    const cur = s.current as { planIndex: number; title?: string } | null;
    return {
      planIndex: (cur?.planIndex ?? s.planIndex) as number,
      state: String(s.state),
      started: !!s.started,
      title: cur?.title ?? null,
    } as State;
  });

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const navs = (page: Page) =>
  page.evaluate(() => {
    const vis = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    return {
      tabBar: vis('[data-testid="tab-bar"]'),
      pill: vis('[data-testid="nav-pill"]'),
      sidebar: vis('[data-testid="sidebar"]'),
    };
  });

test("fold and unfold mid-night: no reload, the Booth keeps playing, the layout follows the width", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const posture = (info.project.metadata?.posture as DuoPosture | undefined) ?? "outer";
  const other = OTHER[posture];
  await duoSafeArea(page, posture);
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
  await expect(page.locator("#result")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60_000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30_000 });
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: /beginning/ });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await booth(page)).state, { timeout: 30_000 }).toBe("playing");
  await page.evaluate(() => {
    (window as unknown as { __duoMarker: number }).__duoMarker = 1;
  });
  const before = await booth(page);
  const clock0 = await page.getByTestId("booth-elapsed").innerText();
  const layout0 = await navs(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${posture}-before.png` });

  for (const [step, to] of [
    ["fold/unfold", other],
    ["back", posture],
  ] as const) {
    await page.setViewportSize(DUO[to].viewport);
    await duoSafeArea(page, to);
    await page.waitForTimeout(1500);
    // the same page: no reload, no navigation
    expect(await page.evaluate(() => (window as unknown as { __duoMarker?: number }).__duoMarker), step).toBe(
      1,
    );
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length), step).toBe(1);
    await expect(page).toHaveURL(/\/booth/);
    // still playing the same song, the clock still moving
    const now = await booth(page);
    expect(now.state, `${step}: ${JSON.stringify(now)}`).toBe("playing");
    expect(now.planIndex, step).toBe(before.planIndex);
    await expect
      .poll(() => page.getByTestId("booth-elapsed").innerText(), { timeout: 5000 })
      .not.toBe(clock0);
    // the layout follows the width, with nothing wider than the display
    expect(await overflow(page), `${step}: sideways overflow at ${to}`).toBeLessThanOrEqual(1);
    const L = await navs(page);
    if (DUO[to].viewport.width < 640) expect(L.tabBar || L.pill, `${step}: a navigation at ${to}`).toBe(true);
    else
      expect(L.pill || L.sidebar, `${step}: the wide navigation at ${to} (${JSON.stringify(L)})`).toBe(true);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${posture}-${step.replace("/", "-")}-${to}.png` });
  }
  // what it looked like at the start is what it looks like back in the same posture
  expect(await navs(page)).toEqual(layout0);
});
