import { defineConfig } from "@playwright/test";

const launchOptions = { executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" };
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    // every spec at the default (desktop) viewport, as before the tablet projects existed
    { name: "default", testIgnore: /round6-tablet/ },
    // round 6: the sm–lg nav pill and the one-column tanda grid on an iPad and on a 1024 × 768 desktop
    {
      name: "tablet-ipad",
      testMatch: /round6-tablet/,
      // an iPad's viewport, touch and user agent by hand: the `devices` descriptor would ask for WebKit
      use: {
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        launchOptions,
      },
    },
    {
      name: "desktop-1024",
      testMatch: /round6-tablet/,
      use: { viewport: { width: 1024, height: 768 }, launchOptions },
    },
  ],
  webServer: process.env.TDJ_URL
    ? undefined
    : { command: "pnpm start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
