import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" },
  },
  webServer: process.env.TDJ_URL
    ? undefined
    : { command: "pnpm start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
