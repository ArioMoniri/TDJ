/**
 * Round 22 booth captures (not a test): the featured night in the player at desktop, iPad landscape and phone, light
 * and dark, deviceScaleFactor 2. `node --experimental-strip-types e2e/shots/booth-shots.mts <baseURL> <outDir>`.
 */
import { chromium } from "playwright";

const [base = "http://localhost:3000", out = "./shots"] = process.argv.slice(2);
const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const sizes = [
  ["desktop", 1440, 900, false],
  ["ipad-landscape", 1180, 820, true],
  ["phone", 390, 844, true],
] as const;

function wav(sec = 8): Buffer {
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

const browser = await chromium.launch({
  executablePath: exe,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
for (const [name, width, height, touch] of sizes)
  for (const theme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      hasTouch: touch,
      isMobile: name === "phone",
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    await page.route(/p\.scdn\.co|preview\.test|\/api\/preview\?/, (r) =>
      r.request().url().includes("json=1")
        ? r.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ url: "https://preview.test/c.wav" }),
          })
        : r.fulfill({
            status: 200,
            contentType: "audio/wav",
            body: WAV,
            headers: { "access-control-allow-origin": "*" },
          }),
    );
    await page.addInitScript((t) => localStorage.setItem("tdj-booth-theme", t), theme);
    await page.goto(`${base}/?featured=golden-double-peak`);
    await page.locator("#result").waitFor({ timeout: 90000 });
    await page.goto(`${base}/booth`);
    await page.getByTestId("booth-now-title").waitFor({ timeout: 30000 });
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="booth-ttc"][data-resolving]'),
      null,
      {
        timeout: 30000,
      },
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${name}-${theme}-ready.png` });
    // the night playing
    await page.getByTestId("booth-start").click();
    await page.getByTestId("booth-pause").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${name}-${theme}-playing.png` });
    if (theme === "dark") {
      // the song sheet (tap a row), the Mix sheet, the set-list sheet on a phone
      if (name === "phone") {
        await page.getByTestId("booth-set-open").click();
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${out}/${name}-${theme}-setlist.png` });
      }
      await page.locator('.booth-row[data-kind="track"]').nth(5).getByTestId("booth-row-play").click();
      await page.getByTestId("booth-play-sheet").waitFor();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/${name}-${theme}-song.png` });
      await page.keyboard.press("Escape");
      if (name === "phone") await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      await page.getByTestId(name === "phone" ? "booth-levels" : "booth-mix").click();
      await page.getByTestId("booth-levels-sheet").waitFor();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${name}-${theme}-mix.png` });
    }
    await ctx.close();
  }
await browser.close();
