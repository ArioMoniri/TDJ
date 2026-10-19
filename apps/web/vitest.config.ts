import { defineConfig } from "vitest/config";

/** Unit tests of the web app's pure helpers; the Playwright specs under e2e/ are not vitest's. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
