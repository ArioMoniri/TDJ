#!/usr/bin/env node
/**
 * The GitHub Release text for one linked release: the store's "what's new" (fastlane metadata, en-US), then where
 * this same version runs (web, iPhone + iPad, Mac App Store, DMG), with the commit and build number every build
 * of the release shares. mac-build.sh writes it to the draft release; the workflow summary shows the same lines.
 *   node scripts/release/release-notes.mjs --version 1.0.0 --build 459871 --commit 0123abcd [--notes file]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ROOT, readRelease } from "./version.mjs";

export const NOTES_FILE = "apps/desktop/fastlane/metadata/en-US/release_notes.txt";

export function releaseNotes({ version, build, commit, notes, release = readRelease() }) {
  const store = release.appStoreLive
    ? `[App Store](${release.appStoreUrl}) (iPhone and iPad) · [Mac App Store](${release.macAppStoreUrl})`
    : release.testflightUrl
      ? `TestFlight beta: ${release.testflightUrl} (App Store review pending)`
      : "TestFlight (invited testers), App Store review pending";
  return `${notes.replace(/\r\n/g, "\n").trim()}

## This release everywhere

| | |
|---|---|
| Version | **${version}** (build ${build}) |
| Commit | \`${commit}\` |
| Web | ${release.webUrl} (deployed from the same commit; \`/api/version\` reports it) |
| iPhone, iPad, Mac App Store | ${store} |
| Mac download | [TDJ-macOS.dmg](https://github.com/${release.repo}/releases/download/v${version}/TDJ-macOS.dmg), signed and notarised, updates itself; \`SHA256SUMS\` attached |
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      build: { type: "string", default: "" },
      commit: { type: "string", default: "" },
      notes: { type: "string", default: NOTES_FILE },
    },
  });
  const release = readRelease();
  process.stdout.write(
    releaseNotes({
      version: values.version ?? release.version,
      build: values.build,
      commit: values.commit,
      notes: readFileSync(join(ROOT, values.notes), "utf8"),
      release,
    }),
  );
}
