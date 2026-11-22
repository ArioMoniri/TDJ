// Leak check (`pnpm security:check`, CI): nothing a self-deployer forks, clones, builds or deploys may carry the
// upstream author's credentials or identity, and no key may be committed at all.
//   1. no tracked key, certificate, profile or .env file;
//   2. no secret-shaped value in any tracked text file (fakes in tests are recognised by their obvious patterns);
//   3. the deploy surface (sst.config.ts, infra/, the deploy workflows, the web app's source, the CLI) holds none of
//      the author's Apple team / bundle IDs, GitHub account id, AWS account ids or CloudFront hosts;
//   4. a workflow that falls back to the author's public Apple IDs does so only inside the upstream repository;
//   5. no secret travels through a NEXT_PUBLIC_* variable (those are inlined into the browser bundle);
//   6. after `next build` (apps/web/.next present), the browser bundle holds no secret-shaped value and none of the
//      secret values set in this environment.
// A finding prints the file, the line and the rule, and the first 4 characters of the match: never the value.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
const MAX_BYTES = 8 * 1024 * 1024;
const BINARY =
  /\.(png|jpe?g|gif|webp|avif|ico|icns|mp3|mp4|m4a|mov|wav|ogg|woff2?|ttf|otf|pdf|zip|gz|xls|xlsx|car)$/i;

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT })
  .toString()
  .split("\0")
  .filter((f) => f && existsSync(join(ROOT, f)));

/** @param {string} abs */
function text(abs) {
  const st = statSync(abs);
  if (!st.isFile() || st.size > MAX_BYTES || BINARY.test(abs)) return null;
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return null;
  return buf.toString("utf8");
}

/** masked: the first 4 characters and the length, never the value */
const mask = (/** @type {string} */ s) => `${s.slice(0, 4)}… (${s.length} chars)`;

/** an obviously fake value in a test or a doc */
const FAKE =
  /abcdefgh|ABCDEFGH|EXAMPLE|example|0123456789|123456789012|xxxxxxxx|XXXXXXXX|fake|dummy|test|e2e|mock|placeholder|REDACTED|\.\.\.|…/;

/** high-confidence secret shapes */
const SECRET_RULES = [
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["AWS secret access key", /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/gi],
  ["Anthropic API key", /\bsk-ant-(?:api|admin)\d\d-[A-Za-z0-9_-]{40,}/g],
  ["OpenAI-style API key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}/g],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{20,}/g],
  ["Dropbox access token", /\bsl\.[A-Za-z0-9_-]{100,}/g],
  ["private key block", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----\s*(?:\\n)?[A-Za-z0-9+/=\s\\n]{120,}/g],
  ["minisign / Tauri updater secret key", /untrusted comment: (?!signature)[^\n]*secret key/g],
  // the same two, base64-wrapped (how a .p8 or the Tauri key travels in a variable)
  [
    "base64 private key",
    /LS0tLS1CRUdJTiBQUklWQVRF|LS0tLS1CRUdJTiBFQyBQUklWQVRF|dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWdu/g,
  ],
  [
    "secret assigned a literal",
    /\b(?:SPOTIFY_CLIENT_SECRET|GOOGLE_CLIENT_SECRET|DROPBOX_APP_SECRET|YOUTUBE_API_KEY|TDJ_COOKIE_SECRET|TDJ_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY|AI_KEY|PIPEDREAM_CLIENT_SECRET|TAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?|APP_STORE_CONNECT_PRIVATE_KEY|[A-Z_]*CERT_PASSWORD|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["'`]([A-Za-z0-9+/_.=-]{16,})/g,
  ],
];

/** files that must never be committed */
const FORBIDDEN_FILE =
  /(^|\/)\.env(\.(?!example$)[^/]*)?$|\.(p8|p12|pfx|pem|key|jks|keystore|mobileprovision|provisionprofile|keychain-db|certSigningRequest)$|(^|\/)UPDATER_KEY_PASSWORD$/;

/** the upstream author's identifiers, which a fork must never inherit on its deploy surface */
const OWNER_RULES = [
  ["the author's Apple Team ID", /FF68N39FU5/g],
  ["the author's bundle ID", /com\.ariomoniri\.tdj/gi],
  ["the author's GitHub account id", /\b92126657\b/g],
  ["a real CloudFront host", /\b[a-z0-9]{10,}\.cloudfront\.net\b/g],
  ["a real AWS account id in an ARN", /\barn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:(?!123456789012:)\d{12}:/g],
];
/** what a self-deployer's build and deploy read */
const SURFACE = [
  /^sst\.config\.ts$/,
  /^infra\//,
  /^\.github\/workflows\/(deploy-aws|merge-owner-contributions|ci|check-secrets)\.yml$/,
  /^apps\/web\/(src|public)\/.*(?<!\.test\.tsx?)$/,
  /^apps\/web\/next\.config\.ts$/,
  /^packages\/cli\/(src|bin)\//,
  /^scripts\/install\.sh$/,
  /^Dockerfile$/,
];
/** documented exceptions: the upstream-only defaults of `tdj apple` (used only when --repo is the upstream repo) */
const SURFACE_ALLOW = new Set(["packages/cli/src/apple.mjs"]);

/** @param {string} body @param {[string, RegExp][]} rules @param {(v: string) => boolean} [skip] */
function findings(file, body, rules, skip = () => false) {
  const out = [];
  for (const [rule, re] of rules) {
    re.lastIndex = 0;
    for (const m of body.matchAll(re)) {
      const value = m[1] ?? m[0];
      if (skip(value) || skip(m[0])) continue;
      const line = body.slice(0, m.index).split("\n").length;
      out.push(`${file}:${line} ${rule}: ${mask(value)}`);
    }
  }
  return out;
}

test("no key, certificate, profile or .env file is tracked", () => {
  assert.deepEqual(
    tracked.filter((f) => FORBIDDEN_FILE.test(f)),
    [],
  );
});

test("no secret-shaped value in any tracked text file", () => {
  const bad = [];
  for (const f of tracked) {
    // (this file holds the patterns themselves)
    if (f === "scripts/security/leaks.test.mjs") continue;
    const body = text(join(ROOT, f));
    if (body) bad.push(...findings(f, body, SECRET_RULES, (v) => FAKE.test(v)));
  }
  assert.deepEqual(bad, [], `rotate and remove (never print the value):\n${bad.join("\n")}`);
});

test("the deploy surface carries none of the upstream author's identifiers", () => {
  const bad = [];
  for (const f of tracked) {
    if (!SURFACE.some((re) => re.test(f)) || SURFACE_ALLOW.has(f)) continue;
    const body = text(join(ROOT, f));
    if (body) bad.push(...findings(f, body, OWNER_RULES));
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("no real AWS account id or CloudFront host anywhere in the repository", () => {
  const bad = [];
  for (const f of tracked) {
    if (f === "scripts/security/leaks.test.mjs") continue;
    const body = text(join(ROOT, f));
    if (body) bad.push(...findings(f, body, OWNER_RULES.slice(3)));
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a workflow uses the author's Apple IDs only inside the upstream repository", () => {
  const dir = join(ROOT, ".github/workflows");
  const bad = [];
  for (const f of readdirSync(dir)) {
    const lines = readFileSync(join(dir, f), "utf8").split("\n");
    lines.forEach((l, i) => {
      if (/FF68N39FU5|com\.ariomoniri\.tdj/i.test(l) && !/github\.repository == 'ArioMoniri\/TDJ'/.test(l))
        bad.push(`.github/workflows/${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], `an unguarded fallback to the author's Apple IDs:\n${bad.join("\n")}`);
});

test("no secret travels through a NEXT_PUBLIC_* variable", () => {
  const bad = [];
  for (const f of tracked) {
    if (f === "scripts/security/leaks.test.mjs") continue;
    const body = text(join(ROOT, f));
    if (!body) continue;
    for (const m of body.matchAll(
      /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY|_KEY)\b/g,
    ))
      bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

/** every file under a folder */
function* walk(/** @type {string} */ dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const STATIC = join(ROOT, "apps/web/.next/static");
test("the browser bundle holds no secret (after next build)", {
  skip: !existsSync(STATIC) && "no build",
}, () => {
  const names = [
    "SPOTIFY_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "DROPBOX_APP_SECRET",
    "TDJ_COOKIE_SECRET",
    "TDJ_SECRET",
    "ANTHROPIC_API_KEY",
    "PIPEDREAM_CLIENT_SECRET",
    "TAURI_SIGNING_PRIVATE_KEY",
    "APP_STORE_CONNECT_PRIVATE_KEY",
  ];
  const values = names.map((n) => process.env[n]).filter((v) => v && v.length >= 8);
  const bad = [];
  for (const abs of walk(STATIC)) {
    const body = text(abs);
    if (!body) continue;
    const f = relative(ROOT, abs);
    bad.push(...findings(f, body, SECRET_RULES.slice(0, -1), (v) => FAKE.test(v)));
    for (const v of values)
      if (body.includes(/** @type {string} */ (v))) bad.push(`${f}: an environment secret`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
