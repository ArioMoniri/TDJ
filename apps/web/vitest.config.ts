import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
// the build-time release values (version, store ids, bundle id) the app reads, as next.config.ts sets them
import { releaseEnv } from "../../scripts/release/version.mjs";

/** Unit tests of the web app's pure helpers; the Playwright specs under e2e/ are not vitest's. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // the app adapter's tests run the server routes beside the on-device ones (src/lib/app/routes.test.ts)
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // the app's device copies of the server routes it runs unchanged (scripts/device-routes.mjs)
    globalSetup: ["./test/device-routes.setup.ts"],
    environment: "node",
    env: releaseEnv(),
    testTimeout: 60_000,
  },
});
