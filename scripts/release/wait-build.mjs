#!/usr/bin/env node
// Waits until App Store Connect has processed the build a release just uploaded (iOS and Mac share one build number),
// so App Review submission in the same run does not race the 5–30 min processing. Fails on FAILED / INVALID.
//   node scripts/release/wait-build.mjs --build 459871 [--app-id 6834924534] [--platforms IOS,MAC_OS] [--timeout-min 75]
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient, loadKey } from "./asc.mjs";
import { readRelease } from "./version.mjs";

/** Polls until every platform's build is VALID; returns { IOS: "VALID", ... }. */
export async function waitForBuilds({
  client,
  appId,
  build,
  platforms = ["IOS", "MAC_OS"],
  timeoutMs = 75 * 60_000,
  intervalMs = 60_000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
  log = console.log,
}) {
  if (!appId)
    throw new Error(
      "no App Store app id (repository variable APPLE_APP_ID or package.json release.appStoreId)",
    );
  if (!/^\d+$/.test(String(build))) throw new Error(`not a build number: ${build}`);
  const done = {};
  const until = now() + timeoutMs;
  for (;;) {
    for (const p of platforms) {
      if (done[p]) continue;
      const q = `/v1/builds?filter[app]=${appId}&filter[version]=${build}&filter[preReleaseVersion.platform]=${p}&fields[builds]=processingState,version&limit=1`;
      const state = (await client.get(q))?.data?.[0]?.attributes?.processingState ?? "NOT_YET_VISIBLE";
      if (state === "VALID") done[p] = state;
      else if (state === "FAILED" || state === "INVALID")
        throw new Error(
          `build ${build} for ${p} is ${state} in App Store Connect (see the email from App Store Connect)`,
        );
      log(`${p} build ${build}: ${state}`);
    }
    if (platforms.every((p) => done[p])) return done;
    if (now() >= until)
      throw new Error(
        `build ${build} not processed in time (${platforms.filter((p) => !done[p]).join(", ")})`,
      );
    await sleep(intervalMs);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      build: { type: "string" },
      "app-id": { type: "string", default: process.env.APPLE_APP_ID || "" },
      platforms: { type: "string", default: "IOS,MAC_OS" },
      "timeout-min": { type: "string", default: "75" },
    },
  });
  try {
    const client = createClient(loadKey());
    await waitForBuilds({
      client,
      appId: values["app-id"] || readRelease().appStoreId,
      build: values.build,
      platforms: values.platforms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      timeoutMs: Number(values["timeout-min"]) * 60_000,
    });
    console.log(`build ${values.build}: processed`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
