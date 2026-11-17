import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForBuilds } from "../wait-build.mjs";

/** A fake App Store Connect client: each platform walks through the given states, one per poll. */
function fake(states) {
  const calls = [];
  const seen = {};
  return {
    calls,
    get: async (q) => {
      calls.push(q);
      const p = /platform\]=(\w+)/.exec(q)[1];
      seen[p] = (seen[p] ?? -1) + 1;
      const i = seen[p];
      const s = states[p][Math.min(i, states[p].length - 1)];
      return { data: s ? [{ attributes: { processingState: s } }] : [] };
    },
  };
}
const quiet = { sleep: async () => {}, log: () => {} };

test("wait-build: polls each platform by the shared build number until both are VALID", async () => {
  const client = fake({ IOS: [null, "PROCESSING", "VALID"], MAC_OS: ["PROCESSING", "VALID"] });
  const r = await waitForBuilds({ client, appId: "6834924534", build: "459871", ...quiet });
  assert.deepEqual(r, { IOS: "VALID", MAC_OS: "VALID" });
  assert.ok(
    client.calls.every((q) => q.includes("filter[app]=6834924534") && q.includes("filter[version]=459871")),
  );
  // a platform already VALID is not asked again
  assert.equal(client.calls.filter((q) => q.includes("MAC_OS")).length, 2);
});

test("wait-build: fails on a rejected build, a timeout, a missing app id or a non-numeric build", async () => {
  await assert.rejects(
    waitForBuilds({
      client: fake({ IOS: ["INVALID"] }),
      appId: "1",
      build: "2",
      platforms: ["IOS"],
      ...quiet,
    }),
    /INVALID/,
  );
  let t = 0;
  await assert.rejects(
    waitForBuilds({
      client: fake({ IOS: ["PROCESSING"] }),
      appId: "1",
      build: "2",
      platforms: ["IOS"],
      timeoutMs: 3,
      now: () => t++,
      ...quiet,
    }),
    /not processed in time/,
  );
  await assert.rejects(waitForBuilds({ client: fake({}), appId: "", build: "2", ...quiet }), /APPLE_APP_ID/);
  await assert.rejects(
    waitForBuilds({ client: fake({}), appId: "1", build: "1.0.0.2", ...quiet }),
    /not a build/,
  );
});
