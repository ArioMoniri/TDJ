import { beforeEach } from "vitest";

// Vitest's worker reports each test's start to the main process over an RPC with a fixed 60 s timeout.
// Many invariants here compose whole 4 h nights synchronously for over a minute, which blocks the worker's
// event loop while that report is still waiting for its answer, and the run ends with
// "[vitest-worker]: Timeout calling onTaskUpdate" although every test passed. A short pause before each
// test lets the pending report (and the runner's 100 ms throttled follow-up) settle first.
beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 250)));
