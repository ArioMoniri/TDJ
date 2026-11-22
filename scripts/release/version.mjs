#!/usr/bin/env node
/**
 * One version for the web app, the Mac DMG, the Mac App Store build and the iPhone/iPad build: the `version` of the
 * root package.json. Everything else reads it from here:
 *   - apps/web/next.config.ts and apps/desktop/scripts/build-ui.mjs → NEXT_PUBLIC_TDJ_VERSION / _COMMIT (Settings → About)
 *   - apps/desktop/src-tauri/tauri.conf.json → `"version": "../../../package.json"` (the Rust crate's version follows)
 *   - scripts/release/mac-build.sh and .github/workflows/release-apps.yml → marketing version + build number
 *   - scripts/release/release-notes.mjs → the GitHub Release text
 * The root package.json's `release` block holds the store links (App Store ID, public TestFlight link, web URL).
 *
 *   node scripts/release/version.mjs                 # prints 0.1.0
 *   node scripts/release/version.mjs --json          # version, commit, build number, links
 *   node scripts/release/version.mjs --check [--tag v0.1.0]   # every copy in sync (and the tag matches)
 *   node scripts/release/version.mjs --set 1.0.0     # bumps the root and the workspace copies
 * docs/RELEASING.md → "One version".
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** package.json copies that must carry the same version (workspace apps; the libraries version on their own). */
export const COPIES = ["apps/desktop/package.json", "apps/web/package.json"];
/** UTC 2026-01-01: build numbers are minutes since then (monotonic, one number for every platform of a run). */
export const BUILD_EPOCH = 1767225600;
/** The Rust crate (get_native_info reports CARGO_PKG_VERSION) and its lock entry. */
export const CARGO_TOML = "apps/desktop/src-tauri/Cargo.toml";
export const CARGO_LOCK = "apps/desktop/src-tauri/Cargo.lock";
const CARGO_PKG = /(\[package\]\nname = "tdj-desktop"\nversion = ")([^"]+)(")/;
const LOCK_PKG = /(\[\[package\]\]\nname = "tdj-desktop"\nversion = ")([^"]+)(")/;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const isVersion = (v) => typeof v === "string" && SEMVER.test(v);

/** -1, 0, 1. A pre-release sorts before its release (1.0.0-beta.1 < 1.0.0). */
export function compareVersions(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`not a version: ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return Math.sign(d);
  }
  if (pa[4] === pb[4]) return 0;
  if (!pa[4]) return 1;
  if (!pb[4]) return -1;
  return pa[4] < pb[4] ? -1 : 1;
}

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

/** The root package.json's version and release links. */
export function readRelease(root = ROOT) {
  const pkg = readJson(root, "package.json");
  if (!isVersion(pkg.version)) throw new Error(`package.json version is not semver: ${pkg.version}`);
  const r = pkg.release ?? {};
  const repo = r.repo ?? "ArioMoniri/TDJ";
  const appStoreId = String(r.appStoreId ?? "");
  return {
    version: pkg.version,
    repo,
    appStoreId,
    bundleId: String(r.bundleId ?? ""),
    appStoreUrl: appStoreId ? `https://apps.apple.com/app/id${appStoreId}` : "",
    macAppStoreUrl: appStoreId ? `https://apps.apple.com/app/id${appStoreId}?platform=mac` : "",
    testflightUrl: r.testflightUrl ?? "",
    webUrl: r.webUrl ?? "",
    dmgUrl: `https://github.com/${repo}/releases/latest/download/T-DJ-macOS.dmg`,
    releasesUrl: `https://github.com/${repo}/releases`,
    appStoreLive: r.appStoreLive === true,
  };
}

/** Same formula as mac-build.sh and the release workflow. */
export const buildNumber = (date = new Date()) => Math.floor((date.getTime() / 1000 - BUILD_EPOCH) / 60);

/** The commit this build comes from: CI's SHA, else git, else "" (a tarball without .git). */
export function commitSha(env = process.env, root = ROOT) {
  const fromEnv = env.TDJ_COMMIT || env.GITHUB_SHA || env.CODEBUILD_RESOLVED_SOURCE_VERSION || "";
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** The build-time variables the web app and the bundled app UI read (apps/web/src/lib/release.ts). */
export function releaseEnv(root = ROOT, env = process.env) {
  const r = readRelease(root);
  return {
    NEXT_PUBLIC_TDJ_VERSION: r.version,
    NEXT_PUBLIC_TDJ_COMMIT: commitSha(env, root),
    NEXT_PUBLIC_TDJ_APP_STORE_ID: r.appStoreId,
    NEXT_PUBLIC_TDJ_APP_STORE_LIVE: r.appStoreLive ? "1" : "",
    NEXT_PUBLIC_TDJ_TESTFLIGHT_URL: r.testflightUrl,
    NEXT_PUBLIC_TDJ_WEB_URL: r.webUrl,
    NEXT_PUBLIC_TDJ_REPO: r.repo,
    NEXT_PUBLIC_TDJ_BUNDLE_ID: r.bundleId,
  };
}

/** Everything that must agree with the root version; [] when in sync. `tag` (v1.2.3) is checked too when given. */
export function checkSync(root = ROOT, tag) {
  const problems = [];
  const { version } = readRelease(root);
  for (const rel of COPIES) {
    const v = readJson(root, rel).version;
    if (v !== version) problems.push(`${rel} says ${v}, the root package.json says ${version}`);
  }
  for (const [rel, re] of [
    [CARGO_TOML, CARGO_PKG],
    [CARGO_LOCK, LOCK_PKG],
  ]) {
    const v = re.exec(readFileSync(join(root, rel), "utf8"))?.[2];
    if (v !== version) problems.push(`${rel} says ${v}, the root package.json says ${version}`);
  }
  const conf = readJson(root, "apps/desktop/src-tauri/tauri.conf.json");
  const target = resolve(root, "apps/desktop/src-tauri", String(conf.version));
  if (target !== join(root, "package.json"))
    problems.push(`tauri.conf.json version must be "../../../package.json" (got ${conf.version})`);
  if (tag && tag.replace(/^refs\/tags\//, "").replace(/^v/, "") !== version)
    problems.push(`tag ${tag} does not match version ${version}: run \`pnpm release:version <x.y.z>\` first`);
  return problems;
}

/** Writes `version` into the root package.json and every copy (formatting kept: two-space JSON). */
export function setVersion(version, root = ROOT) {
  if (!isVersion(version)) throw new Error(`not a version: ${version}`);
  for (const rel of ["package.json", ...COPIES]) {
    const path = join(root, rel);
    const text = readFileSync(path, "utf8");
    const next = text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
    if (next === text && !text.includes(`"version": "${version}"`))
      throw new Error(`${rel}: no version field`);
    writeFileSync(path, next);
  }
  for (const [rel, re] of [
    [CARGO_TOML, CARGO_PKG],
    [CARGO_LOCK, LOCK_PKG],
  ]) {
    const path = join(root, rel);
    const text = readFileSync(path, "utf8");
    if (!re.test(text)) throw new Error(`${rel}: no tdj-desktop version`);
    writeFileSync(path, text.replace(re, `$1${version}$3`));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const at = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  if (args.includes("--set")) {
    setVersion(at("--set"));
    console.log(`version ${at("--set")}: package.json, ${[...COPIES, CARGO_TOML, CARGO_LOCK].join(", ")}`);
  } else if (args.includes("--check")) {
    const problems = checkSync(ROOT, at("--tag"));
    if (problems.length) {
      console.error(problems.join("\n"));
      process.exit(1);
    }
    console.log(`version ${readRelease().version}: web, Mac and iOS in sync`);
  } else if (args.includes("--json")) {
    const r = readRelease();
    console.log(JSON.stringify({ ...r, commit: commitSha(), build: buildNumber() }, null, 2));
  } else {
    console.log(readRelease().version);
  }
}
