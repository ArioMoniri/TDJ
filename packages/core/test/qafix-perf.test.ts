/**
 * QA fix (2026-11): the compose budget. The QA's night (golden, single peak, matched Turkish cortinas) composes
 * and auto-improves within COMPOSE_BUDGET_MS for 3, 4 and 5 h on a normal machine (`pnpm --filter @tdj/core
 * bench:compose` prints the timings). Vitest runs files in parallel, so the test allows TDJ_PERF_SLACK × the budget
 * (default 2); the same night is seeded, so it is the same work every run.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadCatalog } from "../src/load";
import { COMPOSE_BUDGET_MS, timeCompose } from "../src/perf";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
  // (the first night pays the JIT warm-up: not part of the budget)
  timeCompose(deps, 1, 99);
}, 600000);

const slack = Number(process.env.TDJ_PERF_SLACK ?? 2);

describe("compose stays within its budget", () => {
  for (const hours of [3, 4, 5])
    it(`${hours} h single peak, matched cortinas: compose + Auto-improve ≤ ${COMPOSE_BUDGET_MS} ms × ${slack}`, () => {
      const r = timeCompose(deps, hours, 1);
      expect(r.tandas).toBeGreaterThan(hours * 4);
      expect(r.totalMs).toBeLessThanOrEqual(COMPOSE_BUDGET_MS * slack);
    }, 120000);
});
