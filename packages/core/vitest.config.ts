import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 180000,
    fileParallelism: false,
    coverage: { reporter: ["text", "lcov"] },
  },
});
