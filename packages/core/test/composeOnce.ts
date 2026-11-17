import { compose, type Playlist } from "../src/index";

type Opts = Parameters<typeof compose>[0];
type Deps = Parameters<typeof compose>[1];

const nights = new WeakMap<Deps, Map<string, Playlist>>();

/**
 * `compose`, once per options and catalogue in a test file. Compose is a pure function of its options (the seed
 * included) and the catalogue — two calls differ only in `createdAt` — so the invariants that read the same seeded
 * nights (the 12-seed 4 h golden set, read by most of round 4 and round 8) share one compose of each instead of
 * composing it again in every test. Every caller gets its own deep copy: a test that edits its night never changes
 * another test's. Options are keyed as JSON, so pass plain data (no functions).
 */
/** one turn of the event loop that also reads its I/O (setImmediate runs after the poll phase; a 0 ms timer does not) */
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Compose a file's shared nights before its tests, one night at a time with a turn of the event loop between
 * them: `await warm(SEEDS.map((s) => () => golden(s)))` in a `beforeAll`. The engine is synchronous; composed in a
 * test's body, 24 nights blocked the worker for a minute and more (round 9 and round 10 at 57–59 s on CI one file at
 * a time, 141 s with the files side by side), and vitest's worker gives up on an answer it is waiting for after 60 s
 * ("Timeout calling onTaskUpdate") although every test passed. Between two nights the answer is read.
 */
export async function warm(steps: Array<() => unknown>): Promise<void> {
  for (const step of steps) {
    await turn();
    step();
  }
  await turn();
}

/** a `beforeAll` timeout for `warm`: composing a file's nights takes minutes on a loaded runner */
export const WARM_TIMEOUT = 600_000;

export function composeOnce(opts: Opts, deps: Deps): Playlist {
  let byOpts = nights.get(deps);
  if (!byOpts) {
    byOpts = new Map();
    nights.set(deps, byOpts);
  }
  const key = JSON.stringify(opts);
  let p = byOpts.get(key);
  if (!p) {
    p = compose(opts, deps);
    byOpts.set(key, p);
  }
  return structuredClone(p);
}
