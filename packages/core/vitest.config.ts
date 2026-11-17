import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 180000,
    // 2026-11 (CI: the suite one file at a time ran past its 20-minute job): files run side by side, but with two
    // cores left to vitest's own process — it answers every worker's reports, and a starved one answered late enough
    // that a worker deep in a synchronous compose gave up on it ("Timeout calling onTaskUpdate"). A 4-core runner
    // runs two files at a time; CI also splits the files into shards (.github/workflows/ci.yml).
    maxWorkers: Math.max(1, availableParallelism() - 2),
    coverage: { reporter: ["text", "lcov"] },
  },
});
