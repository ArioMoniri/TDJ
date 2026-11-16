/**
 * QA fix 2026-11 (a 3 h single-peak night with matched cortinas took 32.9 s on a phone in Turkish, on a shared CPU):
 * the compose budget and a bench to hold it. `pnpm --filter @tdj/core bench:compose [hours…]` composes the QA's
 * night (and Auto-improve, which /api/compose runs by default) for a few seeds and fails past the budget.
 *
 * Profile (2026-11, 4 cores): ~75 % of a compose is the strict panel's repair (repair.ts `strictRepair` → `bestEdit`,
 * which re-checks every candidate edit with `strictChecks`), then the side order (order.ts `orderWithCost`) and the
 * tanda builder; the succession weight, the insert / edit guide and the Cumparsita candidates do not show up.
 */

import { improveNight } from "./benchmark";
import type { ComposeDeps } from "./compose";
import { compose } from "./compose";
import type { ComposeOptions } from "./types";

/** a 3–5 h night, compose + Auto-improve, on a normal machine (ms) */
export const COMPOSE_BUDGET_MS = 5000;

/** the QA's night: a golden single peak with matched cortinas from the Turkish cortina set */
export const QA_NIGHT: Partial<ComposeOptions> = {
  eras: ["golden"],
  arc: "single-peak",
  arcShape: "single",
  cortinaStyle: "matched",
  cortinaCultures: ["turkish"],
};

export interface ComposeTiming {
  hours: number;
  seed: number;
  composeMs: number;
  improveMs: number;
  totalMs: number;
  tandas: number;
}

/** one timed compose + Auto-improve */
export function timeCompose(deps: ComposeDeps, hours: number, seed: number): ComposeTiming {
  const a = performance.now();
  const p = compose({ ...QA_NIGHT, hours, seed }, deps);
  const b = performance.now();
  improveNight(p, deps);
  const c = performance.now();
  return {
    hours,
    seed,
    composeMs: Math.round(b - a),
    improveMs: Math.round(c - b),
    totalMs: Math.round(c - a),
    tandas: p.tandas.length,
  };
}

/** the bench: `tsx src/perf.ts [hours…]` */
async function main() {
  const { loadCatalog } = await import("./load");
  const deps = loadCatalog();
  const hours = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const rows: ComposeTiming[] = [];
  for (const h of hours.length ? hours : [3, 4, 5])
    for (const seed of [1, 2, 3]) {
      const r = timeCompose(deps, h, seed);
      rows.push(r);
      console.log(
        `${h} h seed ${seed}: compose ${r.composeMs} ms + improve ${r.improveMs} ms = ${r.totalMs} ms (${r.tandas} tandas)`,
      );
    }
  const worst = Math.max(...rows.map((r) => r.totalMs));
  console.log(`worst ${worst} ms (budget ${COMPOSE_BUDGET_MS} ms)`);
  if (worst > COMPOSE_BUDGET_MS) process.exitCode = 1;
}
if (process.argv[1] && /perf\.ts$/.test(process.argv[1])) void main();
