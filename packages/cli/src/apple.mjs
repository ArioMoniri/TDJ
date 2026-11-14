// `tdj apple`: the owner's one-time Apple + GitHub setup from their own computer (gh logged in).
// Opens the exact pages, asks for the three API-key values and the .p8 path, and sets every GitHub secret,
// variable and environment the release needs. Values go to GitHub through stdin; nothing is written to disk.
// What no API can do is listed at the end with links (docs/RELEASING.md "What only the owner can do").
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { step, UPSTREAM } from "./deploy.mjs";
import * as v from "./validate.mjs";

export const DEFAULTS = {
  teamId: "FF68N39FU5",
  bundleId: "com.ariomoniri.tdj",
  backend: "https://d3k5k2c1l0s5ri.cloudfront.net",
};

export const PAGES = {
  apiKeys: "https://appstoreconnect.apple.com/access/integrations/api",
  newApp: "https://appstoreconnect.apple.com/apps",
  membership: "https://developer.apple.com/account#MembershipDetailsCard",
  spotify: "https://developer.spotify.com/dashboard",
};

/** @param {string} p */
const expand = (p) => p.replace(/^~(?=$|\/)/, homedir());

/**
 * @param {import("./deploy.mjs").Ctx} ctx
 * @param {Record<string, string | boolean | undefined>} flags
 */
export async function apple(ctx, flags) {
  const { c, log } = ctx;
  if (ctx.run("gh", ["auth", "status"], { allowFail: true }).status !== 0) {
    throw new Error("GitHub CLI is not logged in: run `gh auth login` first.");
  }
  const repo = /** @type {string} */ (flags.repo || UPSTREAM);
  if (v.repo(repo)) throw new Error(/** @type {string} */ (v.repo(repo)));
  log(c.bold(`Apple release setup for ${repo}`));
  log(c.dim("You will paste three values from one Apple page. Everything else is set for you."));
  log();

  // 1. the App Store Connect API key (the only Apple credential CI and the cloud Mac need)
  log(c.bold("1. App Store Connect API key"));
  log(`   Opening ${PAGES.apiKeys}`);
  log('   Team Keys → Generate API Key → name "TDJ" → Access "App Manager" (Admin if you want the');
  log("   Developer ID certificate created automatically too) → Generate → Download the .p8 (only once).");
  ctx.open(PAGES.apiKeys);
  const issuer = /** @type {string} */ (
    flags["issuer-id"] ||
      (await ctx.ask("issuerId", "Issuer ID (above the table)", { validate: v.ascIssuer }))
  );
  const keyId = /** @type {string} */ (
    flags["key-id"] || (await ctx.ask("keyId", "Key ID (the key's row)", { validate: v.ascKeyId }))
  );
  const defaultP8 = [
    join(homedir(), "Downloads", `AuthKey_${keyId}.p8`),
    join(homedir(), ".appstoreconnect", "private_keys", "AuthKey_TDJ.p8"),
  ].find((p) => existsSync(p));
  const p8Path = expand(
    /** @type {string} */ (
      flags.p8 ||
        (await ctx.ask("p8", "Path of the downloaded .p8", {
          default: defaultP8,
          validate: (p) => (existsSync(expand(p)) ? null : "No file there."),
        }))
    ),
  );
  const p8 = readFileSync(p8Path, "utf8");
  if (!/BEGIN PRIVATE KEY/.test(p8)) throw new Error(`${p8Path} is not an App Store Connect .p8 key.`);
  const keyErr = v.ascIssuer(issuer) || v.ascKeyId(keyId);
  if (keyErr) throw new Error(keyErr);
  const teamId = /** @type {string} */ (flags["team-id"] || DEFAULTS.teamId);
  const bundleId = /** @type {string} */ (flags["bundle-id"] || DEFAULTS.bundleId);
  if (v.teamId(teamId) || v.bundleId(bundleId))
    throw new Error(/** @type {string} */ (v.teamId(teamId) || v.bundleId(bundleId)));

  // 2. secrets and variables (stdin for every secret)
  log();
  log(c.bold("2. GitHub secrets and variables"));
  /** @param {string} name @param {string} value */
  const secret = (name, value) => step(ctx, "gh", ["secret", "set", name, "--repo", repo], { input: value });
  /** @param {string} name @param {string} value */
  const variable = (name, value) =>
    step(ctx, "gh", ["variable", "set", name, "--repo", repo, "--body", value]);
  await secret("APP_STORE_CONNECT_ISSUER_ID", issuer);
  await secret("APP_STORE_CONNECT_KEY_ID", keyId);
  await secret("APP_STORE_CONNECT_PRIVATE_KEY", p8);
  await secret("APPLE_TEAM_ID", teamId);
  await variable("TDJ_APP_BUNDLE_ID", bundleId);
  await variable("TDJ_APP_BACKEND_URL", /** @type {string} */ (flags.backend || DEFAULTS.backend));
  const appId = /** @type {string} */ (
    flags["app-id"] ??
      (await ctx.ask("appId", "Apple ID of the app record (digits; Enter to skip until it exists)", {
        default: "",
        validate: v.optional(v.appleAppId),
      }))
  );
  if (appId) await variable("APPLE_APP_ID", appId);

  if (flags["updater-key"]) {
    const keyPath = expand(/** @type {string} */ (flags["updater-key"]));
    await secret("TAURI_SIGNING_PRIVATE_KEY", readFileSync(keyPath, "utf8"));
    if (existsSync(`${keyPath}.pub`))
      await variable("TAURI_UPDATER_PUBKEY", readFileSync(`${keyPath}.pub`, "utf8").trim());
    const pwFile = join(keyPath, "..", "UPDATER_KEY_PASSWORD");
    if (existsSync(pwFile))
      await secret("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", readFileSync(pwFile, "utf8").trim());
  }

  // 3. environments: apple-release (main + v* tags only), app-store (you approve uploads and submissions)
  log();
  log(c.bold("3. GitHub environments"));
  const me = ctx.run("gh", ["api", "user", "--jq", ".id"]).stdout.trim();
  await step(ctx, "gh", ["api", "-X", "PUT", `repos/${repo}/environments/apple-release`, "--input", "-"], {
    input: JSON.stringify({
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    }),
  });
  for (const [type, pattern] of [
    ["branch", "main"],
    ["tag", "v*"],
  ]) {
    await step(
      ctx,
      "gh",
      [
        "api",
        "-X",
        "POST",
        `repos/${repo}/environments/apple-release/deployment-branch-policies`,
        "-f",
        `name=${pattern}`,
        "-f",
        `type=${type}`,
      ],
      { input: "" },
    ).catch(() => {});
  }
  await step(ctx, "gh", ["api", "-X", "PUT", `repos/${repo}/environments/app-store`, "--input", "-"], {
    input: JSON.stringify({ reviewers: [{ type: "User", id: Number(me) }], deployment_branch_policy: null }),
  });

  // 4. what the API cannot do
  log();
  log(c.bold("4. Only you can do these (links open one by one)"));
  const todo = [
    [
      `Create the app record: ${PAGES.newApp} → + → New App → iOS and macOS, "TDJ – Tango DJ", English (U.S.), bundle ID ${bundleId}, SKU tdj.`,
      PAGES.newApp,
    ],
    [
      `Spotify: ${PAGES.spotify} → your app → Settings → Redirect URIs → add tdj://spotify-callback; under iOS add bundle ID ${bundleId}.`,
      PAGES.spotify,
    ],
    [
      "App Privacy + the newer age-rating questions: answers in apps/desktop/fastlane/app_privacy.md (3 minutes).",
      "",
    ],
  ];
  for (const [i, [text, url]] of todo.entries()) {
    log(`   ${i + 1}. ${text}`);
    if (url && !flags.yes && (await ctx.confirm(`open${i}`, "      Open it now?", true))) ctx.open(url);
  }
  log();
  log(c.bold("5. Signing certificates and profiles"));
  log("   Created for you through the API, no certificate ever touches your computer:");
  log(`   • GitHub: Actions → "Apple setup" → Run workflow (stores them in AWS SSM), or`);
  log("   • on the release Mac: scripts/release/mac-build.sh does it on its first run (kept in ~/drive).");
  if (!flags.yes && (await ctx.confirm("runSetup", `Start "Apple setup" on ${repo} now?`, false))) {
    await step(ctx, "gh", ["workflow", "run", "apple-setup.yml", "--repo", repo]);
  }
  log();
  log(c.green('✓ Done. Check with: Actions → "Check secrets" → Run workflow (prints only true/false).'));
  return 0;
}
