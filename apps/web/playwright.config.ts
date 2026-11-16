import { defineConfig, devices } from "@playwright/test";
import { DUO, type DuoPosture, duo } from "./e2e/devices";

// CHROMIUM unset: the cloud session's pre-installed browser; CHROMIUM= (empty, as CI sets it): Playwright's own
const chromium = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const launchOptions = chromium ? { executablePath: chromium } : {};
// wave 3: TDJ_LOCALE=tr runs the specs with a Turkish browser; the app's Auto language follows it (e2e/lang.ts)
const locale = process.env.TDJ_LOCALE === "tr" ? "tr-TR" : undefined;
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  // one worker on CI: every test composes nights on the single Next server, whose compose is synchronous CPU work,
  // so a second worker's compose stalls this one's clicks, navigations and timing budgets (2 workers on a 4-core runner)
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions,
    ...(locale ? { locale } : {}),
  },
  projects: [
    // every spec at the default (desktop) viewport, as before the tablet projects existed
    {
      name: "default",
      testIgnore: /round6-tablet|round7-corners|round23|wave2-layout|search\.spec|duo-fold/,
    },
    // 2026-11: the shared search on the Library and the Database, on a desktop and an iPhone 15 Pro (Chromium with the
    // phone's viewport, scale, touch and user agent)
    {
      name: "search-desktop",
      testMatch: /search\.spec/,
      use: { viewport: { width: 1440, height: 900 }, launchOptions },
    },
    {
      name: "search-iphone",
      testMatch: /search\.spec/,
      use: {
        ...devices["iPhone 15 Pro"],
        browserName: "chromium" as const,
        defaultBrowserType: undefined,
        launchOptions,
      },
    },
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
    // round 7: glass corners at 430 / 820 / 1440, dark and light
    ...(
      [
        ["phone", { width: 430, height: 932 }, true],
        ["tablet", { width: 820, height: 1180 }, true],
        ["desktop", { width: 1440, height: 900 }, false],
      ] as const
    ).flatMap(([name, viewport, touch]) =>
      (["dark", "light"] as const).map((colorScheme) => ({
        name: `corners-${name}-${colorScheme}`,
        testMatch: /round7-corners/,
        use: {
          viewport,
          deviceScaleFactor: 2,
          colorScheme,
          hasTouch: touch,
          isMobile: name === "phone",
          launchOptions,
        },
      })),
    ),
    // round 23: the top chrome, the scroll edge, the sidebar and wide layouts on iPad Pro 11 (portrait and landscape,
    // Chromium with the iPad's viewport, scale, touch and user agent), a desktop and a phone, light and dark
    ...(
      [
        ["ipad-portrait", { ...devices["iPad Pro 11"] }],
        ["ipad-landscape", { ...devices["iPad Pro 11 landscape"] }],
        ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
        [
          "phone",
          { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        ],
      ] as const
    ).flatMap(([name, use]) =>
      (["light", "dark"] as const).map((colorScheme) => ({
        name: `r23-${name}-${colorScheme}`,
        testMatch: /round23/,
        use: {
          ...use,
          browserName: "chromium" as const,
          defaultBrowserType: undefined,
          colorScheme,
          launchOptions,
        },
      })),
    ),
    // wave 2 (testers): layout, Database, Rooms, Share and Settings on iPad Pro 11 portrait and landscape, a phone and
    // a desktop; each test skips the devices it does not concern
    ...(
      [
        ["ipad-portrait", { ...devices["iPad Pro 11"] }],
        ["ipad-landscape", { ...devices["iPad Pro 11 landscape"] }],
        [
          "phone",
          { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        ],
        ["desktop", { viewport: { width: 1440, height: 900 } }],
      ] as const
    ).map(([name, use]) => ({
      name: `wave2-${name}`,
      testMatch: /wave2-layout/,
      use: { ...use, browserName: "chromium" as const, defaultBrowserType: undefined, launchOptions },
    })),
    // 2026-11: iPhone Duo, each posture (e2e/devices.ts: viewport, 3x, touch, user agent; safe areas through CDP). The
    // fold spec opens in one posture and folds or unfolds to the other with the page kept; the layout specs
    // (wave4-mobile, booth-ui2, qa) run the folded and open rows in their own matrices (`--grep "iPhone Duo"`).
    ...(Object.keys(DUO) as DuoPosture[]).map((posture) => ({
      name: `iphone-duo-${posture}`,
      testMatch: /duo-fold/,
      use: { ...duo(posture), browserName: "chromium" as const, launchOptions },
      metadata: { posture },
    })),
  ],
  webServer: process.env.TDJ_URL
    ? undefined
    : { command: "pnpm start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
