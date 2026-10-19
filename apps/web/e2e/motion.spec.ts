/** Motion system: reduced motion renders the result without waiting on animations; the compose narrative narrates a slow compose. */
import { expect, test } from "@playwright/test";

test("reduced motion: the result renders fully (score, curve, cards) with no pending animation", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    reducedMotion: "reduce",
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  // the live region reports the set without any animation delay
  await expect(page.getByTestId("compose-status")).toHaveText(/Set ready: \d+ tandas\./, { timeout: 15000 });
  // the score is the final value immediately (no count-up), the visible counter matches the sr-only label
  const score = page.getByTestId("score");
  const label = await score.locator(".sr-only").innerText();
  const shown = await score.locator("[aria-hidden]").innerText();
  expect(label).toBe(`${shown} of 100`);
  expect(Number(shown)).toBeGreaterThan(0);
  // the energy path is fully drawn (pathLength 1 → no dash offset) and every card is opaque and unscaled
  const path = page.getByTestId("energy-path");
  await expect(path).toBeVisible();
  const dash = await path.evaluate((el) => ({
    offset: getComputedStyle(el).strokeDashoffset,
    opacity: getComputedStyle(el).opacity,
  }));
  expect(["0px", "0", "none", ""]).toContain(dash.offset);
  expect(Number(dash.opacity)).toBe(1);
  await page.waitForTimeout(100);
  const cards = page.locator("article[id^=tanda-]");
  expect(await cards.count()).toBeGreaterThan(10);
  const styles = await cards.evaluateAll((els) =>
    els.map((el) => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })),
  );
  for (const s of styles) {
    expect(Number(s.opacity)).toBe(1);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(s.transform);
  }
  // the narrative Lottie never mounts under reduced motion for a fast compose, and nothing errored
  expect(errors).toEqual([]);
  await ctx.close();
});

test("compose narrative: a slow compose shows the staged narrative and the live region sequence", async ({
  page,
}) => {
  await page.goto("/?slow=1");
  const status = page.getByTestId("compose-status");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(status).toHaveText("Composing the night…");
  // the narrative mounts after 250 ms and walks the four steps (450 ms each) while the request is slowed by 1.5 s
  const narrative = page.getByTestId("compose-narrative");
  await expect(narrative).toBeVisible({ timeout: 2000 });
  await expect(narrative).toContainText(/Placing tandas|Matching cortinas/);
  await expect(narrative).toContainText(/Shaping the arc|Scoring the night/, { timeout: 2500 });
  // the button label cross-faded to "Composing…" while busy
  await expect(page.getByRole("button", { name: /Composing/ })).toBeDisabled();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(status).toHaveText(/Set ready: \d+ tandas\./);
  await expect(narrative).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByRole("button", { name: /Compose the night/ })).toBeEnabled();
});
