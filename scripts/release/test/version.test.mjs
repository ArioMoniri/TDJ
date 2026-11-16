import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  BUILD_EPOCH,
  buildNumber,
  CARGO_LOCK,
  CARGO_TOML,
  COPIES,
  checkSync,
  commitSha,
  compareVersions,
  isVersion,
  ROOT,
  readRelease,
  releaseEnv,
  setVersion,
} from "../version.mjs";

/** a copy of the files the version lives in, to bump without touching the repo */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "tdj-version-"));
  for (const rel of [
    "package.json",
    ...COPIES,
    CARGO_TOML,
    CARGO_LOCK,
    "apps/desktop/src-tauri/tauri.conf.json",
  ]) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    cpSync(join(ROOT, rel), join(dir, rel));
  }
  return dir;
}

test("the repository is in sync: one version for web, Mac and iOS", () => {
  assert.deepEqual(checkSync(), []);
  const r = readRelease();
  assert.ok(isVersion(r.version));
  // Tauri reads the root package.json, not a copy
  const conf = JSON.parse(readFileSync(join(ROOT, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(conf.version, "../../../package.json");
});

test("release links: App Store ID from the root package.json, nothing claims the store is live yet", () => {
  const r = readRelease();
  assert.match(r.appStoreId, /^\d{9,10}$/);
  assert.equal(r.appStoreUrl, `https://apps.apple.com/app/id${r.appStoreId}`);
  assert.match(r.macAppStoreUrl, /platform=mac$/);
  assert.equal(r.dmgUrl, "https://github.com/ArioMoniri/TDJ/releases/latest/download/TDJ-macOS.dmg");
  assert.match(r.webUrl, /^https:\/\//);
  assert.ok(r.testflightUrl === "" || r.testflightUrl.startsWith("https://testflight.apple.com/join/"));
  assert.equal(typeof r.appStoreLive, "boolean");
});

test("a tag must match the version", () => {
  const { version } = readRelease();
  assert.deepEqual(checkSync(ROOT, `v${version}`), []);
  assert.deepEqual(checkSync(ROOT, `refs/tags/v${version}`), []);
  assert.equal(checkSync(ROOT, "v99.0.0").length, 1);
});

test("--set bumps every copy, and the check then passes; a stale copy is reported", () => {
  const dir = sandbox();
  setVersion("2.3.4", dir);
  assert.deepEqual(checkSync(dir, "v2.3.4"), []);
  assert.equal(readRelease(dir).version, "2.3.4");
  assert.match(readFileSync(join(dir, CARGO_TOML), "utf8"), /name = "tdj-desktop"\nversion = "2\.3\.4"/);
  assert.match(readFileSync(join(dir, CARGO_LOCK), "utf8"), /name = "tdj-desktop"\nversion = "2\.3\.4"/);
  const web = join(dir, "apps/web/package.json");
  writeFileSync(web, readFileSync(web, "utf8").replace('"2.3.4"', '"2.3.3"'));
  assert.match(checkSync(dir).join("\n"), /apps\/web\/package\.json says 2\.3\.3/);
  assert.throws(() => setVersion("two", dir));
});

test("versions compare as semver, a pre-release before its release", () => {
  assert.equal(compareVersions("1.0.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.2.0", "1.10.0"), -1);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.throws(() => compareVersions("1.0", "1.0.0"));
});

test("build number: UTC minutes since 2026-01-01, monotonic, as in mac-build.sh", () => {
  assert.equal(buildNumber(new Date(BUILD_EPOCH * 1000)), 0);
  assert.equal(buildNumber(new Date(Date.UTC(2026, 0, 2))), 1440);
  assert.ok(
    buildNumber(new Date(Date.UTC(2026, 10, 16, 0, 1))) > buildNumber(new Date(Date.UTC(2026, 10, 16))),
  );
  const sh = readFileSync(join(ROOT, "scripts/release/mac-build.sh"), "utf8");
  assert.match(sh, new RegExp(`- ${BUILD_EPOCH}\\) / 60`));
});

test("build-time env for the web app: version and the CI commit", () => {
  const env = releaseEnv(ROOT, { GITHUB_SHA: "0123456789abcdef0123" });
  assert.equal(env.NEXT_PUBLIC_TDJ_VERSION, readRelease().version);
  assert.equal(env.NEXT_PUBLIC_TDJ_COMMIT, "0123456789ab");
  assert.equal(commitSha({ TDJ_COMMIT: "abc" }), "abc");
});

test("the release workflow and mac-build.sh read the root version, and accept the old ipad target", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/release-apps.yml"), "utf8");
  assert.match(wf, /scripts\/release\/version\.mjs/);
  const sh = readFileSync(join(ROOT, "scripts/release/mac-build.sh"), "utf8");
  assert.match(sh, /require\("\.\/package\.json"\)\.version/);
  assert.match(sh, /ipad\)\s*echo ios/);
});

test("release notes: the store's what's new, then one version, one commit, and every place it runs", async () => {
  const { releaseNotes } = await import("../release-notes.mjs");
  const release = readRelease();
  const md = releaseNotes({
    version: "1.2.3",
    build: "459871",
    commit: "0123abcd",
    notes: "What is new.\r\n",
    release,
  });
  assert.match(md, /^What is new\.\n/);
  assert.match(md, /\*\*1\.2\.3\*\* \(build 459871\)/);
  assert.match(md, /`0123abcd`/);
  assert.ok(md.includes(release.webUrl));
  assert.ok(md.includes("releases/download/v1.2.3/TDJ-macOS.dmg"));
  // not live yet: no claim that the App Store has it
  if (!release.appStoreLive) assert.match(md, /review pending/);
  const live = releaseNotes({
    version: "1.2.3",
    build: "1",
    commit: "c",
    notes: "x",
    release: { ...release, appStoreLive: true },
  });
  assert.ok(live.includes(release.appStoreUrl));
});
