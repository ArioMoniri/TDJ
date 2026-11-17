// `tdj deploy`: your own TDJ on AWS. Two routes (docs/SELF_DEPLOY.md):
//   aws    — from this computer with AWS credentials: checks, `pnpm install`, build, `sst deploy`, setup code
//   github — a fork of the repository runs the "Deploy to AWS" workflow (set up once with `tdj init --github`)
// Settings come from the `.env.local` that `tdj init` wrote; secrets never reach argv, a log line or a kept file.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError, resolveConfig } from "./config.mjs";
import { checks } from "./doctor.mjs";
import { DEPLOY_KEYS, writeEnvFile } from "./envfile.mjs";
import * as v from "./validate.mjs";

export const UPSTREAM = "ArioMoniri/TDJ";
export const WORKFLOW = "deploy-aws.yml";
const TEMPLATE = "infra/github-oidc-role.yaml";
export const ROLE_STACK = "tdj-github-oidc";

/**
 * @typedef {import("./sys.mjs").Run} Run
 * @typedef {import("./sys.mjs").Live} Live
 * @typedef {import("./config.mjs").Config} Config
 * @typedef {{
 *   run: Run, live: Live, open: (url: string) => void, log: (s?: string) => void,
 *   ask: (id: string, q: string, o?: { default?: string, secret?: boolean, validate?: (v: string) => string | null }) => Promise<string>,
 *   confirm: (id: string, q: string, def?: boolean) => Promise<boolean>,
 *   choose: (id: string, q: string, choices: string[], def: string) => Promise<string>,
 *   c: ReturnType<typeof import("./ui.mjs").palette>, env: NodeJS.ProcessEnv, cwd: string, dryRun: boolean,
 *   yes?: boolean, nodeVersion?: string, fetch?: typeof fetch,
 * }} Ctx
 * @typedef {{ id: string, secret: string } | null} Spotify
 */

/** @param {Ctx} ctx @param {Record<string, any>} flags */
export async function deploy(ctx, flags) {
  const cfg = resolveConfig(ctx, flags);
  return cfg.route === "github" ? deployFromFork(ctx, cfg) : deployFromHere(ctx, cfg);
}

/** @param {Ctx} ctx */
export function awsIdentity(ctx) {
  const r = ctx.run("aws", ["sts", "get-caller-identity", "--output", "json"], { allowFail: true });
  if (r.status !== 0) return null;
  try {
    return /** @type {{ Account: string, Arn: string }} */ (JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

/** Fails with every missing piece and its fix, or returns quietly. @param {Ctx} ctx @param {Config} cfg */
export function requireReady(ctx, cfg) {
  const missing = checks(ctx, cfg).filter(
    (r) => !r.pass && (r.need === "always" || r.need === cfg.route) && r.id !== "checkout",
  );
  if (missing.length === 0) return;
  throw new CliError(
    `Not ready to deploy yet: ${missing.map((r) => r.name).join(", ")}.`,
    missing.map((r) => r.fix),
  );
}

/** @param {Ctx} ctx @param {Config} cfg */
export async function deployFromHere(ctx, cfg) {
  const { c, log } = ctx;
  log(c.bold(`Deploy T-DJ · stage ${cfg.stage} · ${cfg.region}`));
  requireReady(ctx, cfg);
  const who = awsIdentity(ctx);
  log(`${c.green("✓")} checks passed${who ? ` · AWS account ${who.Account}` : ""}`);
  let dir = cfg.checkout;
  if (!dir) {
    const target = join(ctx.cwd, "TDJ");
    if (!(await ctx.confirm("clone", `No TDJ checkout here. Clone ${UPSTREAM} into ${target}?`, true))) {
      throw new CliError("There is no TDJ checkout to deploy.", [
        `Run this inside the TDJ folder, pass --dir PATH, or clone it: git clone https://github.com/${UPSTREAM}.git`,
      ]);
    }
    await step(ctx, "git", ["clone", "--depth", "1", `https://github.com/${UPSTREAM}.git`, target]);
    dir = target;
  }
  /** @type {Record<string, string>} */
  const env = { AWS_REGION: cfg.region };
  for (const k of DEPLOY_KEYS) if (cfg.file[k]) env[k] = /** @type {string} */ (cfg.file[k]);
  // secrets only ever come from this process's environment (CI, or a shell the person set up), never a file
  if (ctx.env.SPOTIFY_CLIENT_ID && ctx.env.SPOTIFY_CLIENT_SECRET) {
    env.SPOTIFY_CLIENT_ID = ctx.env.SPOTIFY_CLIENT_ID;
    env.SPOTIFY_CLIENT_SECRET = ctx.env.SPOTIFY_CLIENT_SECRET;
  }
  log();
  log(c.bold("Plan"));
  log(`  1. pnpm install            dependencies (about 1 minute)`);
  log(`  2. build                   the workspace packages the web app uses`);
  log(`  3. sst deploy              CloudFront + Lambda + S3 + DynamoDB in ${cfg.region}`);
  log(`  4. setup code              a one-time code for ${c.bold("/admin")}, kept in Parameter Store`);
  log(c.dim("  The first deploy takes 10–15 minutes (CloudFront). Idle cost: about $0–1 a month."));
  log();
  if (!(await ctx.confirm("go", "Deploy now?", true))) return 1;
  await step(ctx, "pnpm", ["install", "--frozen-lockfile"], { cwd: dir }, [
    "Check your internet connection, then run `tdj deploy` again.",
    "If it says the lockfile is outdated: `git pull` to get a matching TDJ.",
  ]);
  await step(ctx, "pnpm", ["--filter", "@tdj/web^...", "--if-present", "run", "build"], { cwd: dir }, [
    "Run `pnpm --filter @tdj/core test` to see what is broken, or `git pull` for a fixed TDJ.",
  ]);
  await step(ctx, "npx", ["sst", "deploy", "--stage", cfg.stage], { cwd: dir, env }, [
    "Run `tdj doctor`: it reads the deploy log (.sst/log) and names the fix.",
    "Then run `tdj deploy` again; SST picks up where it stopped.",
  ]);
  const url = readUrl(dir);
  const code = ctx.dryRun
    ? { code: "(dry run)", reused: false }
    : ensureSetupCode(ctx, cfg.stage, cfg.region);
  finish(ctx, { url, code, stage: cfg.stage, region: cfg.region });
  return 0;
}

/** @param {string} dir */
export function readUrl(dir) {
  try {
    return /** @type {string} */ (
      JSON.parse(readFileSync(join(dir, ".sst", "outputs.json"), "utf8")).url || ""
    );
  } catch {
    return "";
  }
}

/**
 * Writes one SecureString to Parameter Store. The value goes through a 0600 file that is deleted at once
 * (`--cli-input-json`), never through argv, where `ps` would show it.
 * @param {Ctx} ctx @param {string} name @param {string} value @param {string} region
 */
export function putSecure(ctx, name, value, region) {
  const dir = mkdtempSync(join(tmpdir(), "tdj-"));
  const file = join(dir, "p.json");
  writeFileSync(file, JSON.stringify({ Name: name, Type: "SecureString", Overwrite: true, Value: value }), {
    mode: 0o600,
  });
  try {
    ctx.run("aws", ["ssm", "put-parameter", "--cli-input-json", `file://${file}`, "--region", region]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The same one-time owner code as the deploy workflow (docs/DEPLOY.md → Owner setup): null once a passphrase
 * exists; an unexpired code is reused so every deploy prints the same one.
 * @param {Ctx} ctx @param {string} stage @param {string} region @param {number} [now] unix seconds
 * @returns {{ code: string, reused: boolean } | null}
 */
export function ensureSetupCode(ctx, stage, region, now = Math.floor(Date.now() / 1000)) {
  const base = ["--region", region];
  const hasPass = ctx.run(
    "aws",
    [
      "ssm",
      "get-parameter",
      "--name",
      `/tdj/${stage}/OWNER_PASSPHRASE_HASH`,
      "--query",
      "Parameter.Name",
      ...base,
    ],
    { allowFail: true },
  );
  if (hasPass.status === 0) return null;
  const existing = ctx.run(
    "aws",
    [
      "ssm",
      "get-parameter",
      "--name",
      `/tdj/${stage}/SETUP_CODE`,
      "--with-decryption",
      "--query",
      "Parameter.Value",
      "--output",
      "text",
      ...base,
    ],
    { allowFail: true },
  );
  const m = existing.status === 0 ? /^([0-9a-f]{32})\.(\d+)$/.exec(existing.stdout.trim()) : null;
  if (m && now - Number(m[2]) < 86400) return { code: /** @type {string} */ (m[1]), reused: true };
  const code = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  putSecure(ctx, `/tdj/${stage}/SETUP_CODE`, `${code}.${now}`, region);
  return { code, reused: false };
}

/**
 * @param {Ctx} ctx
 * @param {{ url: string, code: { code: string, reused: boolean } | null, stage: string, region: string, runUrl?: string }} o
 */
function finish(ctx, { url, code, stage, region, runUrl }) {
  const { c, log } = ctx;
  const app = url || "<your app URL>";
  log();
  log(c.bold(c.green("T-DJ is live")) + (url ? `: ${c.bold(url)}` : ""));
  log();
  log(c.bold("Next steps"));
  if (runUrl) {
    log(`1. Open the run summary: ${runUrl}`);
    log('   Under "Owner setup" it shows your app URL and the one-time setup code (valid 24 h).');
  } else if (code) {
    log(`1. Open ${app}/admin and paste this one-time setup code (valid 24 h): ${c.bold(code.code)}`);
    log(
      c.dim(
        `   Kept in AWS Systems Manager → Parameter Store → /tdj/${stage}/SETUP_CODE (${region}); \`tdj status\` says if it is still waiting.`,
      ),
    );
  } else {
    log(`1. Open ${app}/admin and unlock with your owner passphrase (stage ${stage} already has one).`);
  }
  log("2. Choose an owner passphrase. Then, for each service you want, paste its keys next to the redirect");
  log(
    "   addresses /admin shows (Spotify, Google, Dropbox, an AI key for everyone). Nothing else to deploy.",
  );
  log("3. Spotify redirect URIs (https://developer.spotify.com/dashboard → your app → Settings):");
  log(`     ${app}/api/spotify/callback`);
  log(`     ${app}/callback`);
  log("     tdj://spotify-callback   (the Mac and iPad apps)");
  log(`4. Optional, in the T-DJ app for Mac or iPad: Settings → Connections → Link a TDJ server → ${app}`);
}

/** The fork `tdj deploy --github` works on: the configured one, else <you>/TDJ. @param {Ctx} ctx @param {Config} cfg */
export function forkOf(ctx, cfg) {
  if (ctx.run("gh", ["auth", "status"], { allowFail: true }).status !== 0) {
    throw new CliError("The GitHub CLI is not signed in.", ["Run `gh auth login`, then try again."]);
  }
  const login = ctx.run("gh", ["api", "user", "--jq", ".login"], { allowFail: true }).stdout.trim();
  const repo = cfg.repo || `${login}/TDJ`;
  const bad = v.repo(repo);
  if (bad) throw new CliError(bad);
  // never the upstream repository for anyone but its owner: a deploy role trusting it would let the upstream
  // author's workflows deploy into YOUR account, and its secrets and variables are not yours to set
  const [owner] = repo.split("/");
  if (repo.toLowerCase() === UPSTREAM.toLowerCase() && owner?.toLowerCase() !== login.toLowerCase()) {
    throw new CliError(`${repo} is the upstream repository, not your fork.`, [
      `Fork it (https://github.com/${UPSTREAM}/fork), then pass --repo <you>/TDJ or leave --repo out.`,
    ]);
  }
  return repo;
}

/** @param {Ctx} ctx @param {Config} cfg */
export async function deployFromFork(ctx, cfg) {
  const { c, log } = ctx;
  const repo = forkOf(ctx, cfg);
  log(c.bold(`Deploy T-DJ through ${repo} · stage ${cfg.stage}`));
  const names = [
    ctx.run("gh", ["variable", "list", "--repo", repo, "--json", "name", "--jq", ".[].name"], {
      allowFail: true,
    }),
    ctx.run("gh", ["secret", "list", "--repo", repo, "--json", "name", "--jq", ".[].name"], {
      allowFail: true,
    }),
  ]
    .map((r) => r.stdout)
    .join("\n");
  if (!ctx.dryRun && !/^AWS_DEPLOY_ROLE_ARN$/m.test(names)) {
    throw new CliError(`${repo} has no AWS deploy role yet (AWS_DEPLOY_ROLE_ARN).`, [
      "Run `tdj init --github`: it creates the role in your AWS account and stores it on the fork.",
    ]);
  }
  if (!(await ctx.confirm("go", `Run "Deploy to AWS" on ${repo} now?`, true))) return 1;
  await step(ctx, "gh", ["workflow", "run", WORKFLOW, "--repo", repo, "-f", `stage=${cfg.stage}`], {}, [
    `Turn Actions on for the fork: https://github.com/${repo}/actions, then run \`tdj deploy --github\` again.`,
  ]);
  log(c.dim("The first deploy takes 10–15 minutes (CloudFront)."));
  const runs = ctx.run(
    "gh",
    ["run", "list", "--repo", repo, "--workflow", WORKFLOW, "-L", "1", "--json", "databaseId,url"],
    { allowFail: true },
  );
  /** @type {{databaseId: number, url: string}[]} */
  let list = [];
  try {
    list = JSON.parse(runs.stdout || "[]");
  } catch {}
  const latest = list[0];
  if (latest && !ctx.dryRun) {
    const code = await ctx.live("gh", [
      "run",
      "watch",
      String(latest.databaseId),
      "--repo",
      repo,
      "--exit-status",
    ]);
    if (code !== 0)
      throw new CliError('The "Deploy to AWS" run failed.', [
        `Open ${latest.url}, read the red step, and see \`tdj guide\` → Troubleshooting.`,
      ]);
  }
  finish(ctx, {
    url: "",
    code: null,
    stage: cfg.stage,
    region: cfg.region,
    runUrl: latest?.url || `https://github.com/${repo}/actions/workflows/${WORKFLOW}`,
  });
  return 0;
}

/**
 * `tdj init --github`: the fork, Actions on, the one-time deploy role, the repository variables and optional
 * Spotify secrets (stdin). Run once; `tdj deploy --github` (or every push to the fork's main) deploys after.
 * @param {Ctx} ctx @param {Config} cfg @param {Spotify} spotify @param {string} [roleArnFlag]
 */
export async function setupFork(ctx, cfg, spotify, roleArnFlag) {
  const { c, log } = ctx;
  const repo = forkOf(ctx, cfg);
  const [owner, name] = /** @type {[string, string]} */ (repo.split("/"));
  if (ctx.run("gh", ["repo", "view", repo, "--json", "name"], { allowFail: true }).status !== 0) {
    log(`… forking ${UPSTREAM} to ${repo}`);
    await step(ctx, "gh", [
      "repo",
      "fork",
      UPSTREAM,
      "--clone=false",
      "--default-branch-only",
      "--fork-name",
      name,
    ]);
  } else {
    log(`${c.green("✓")} ${repo} exists`);
  }
  // GitHub turns Actions off on new forks
  const actions = [
    "api",
    "-X",
    "PUT",
    `repos/${repo}/actions/permissions`,
    "-F",
    "enabled=true",
    "-f",
    "allowed_actions=all",
  ];
  if (ctx.dryRun) ctx.log(c.dim(`$ gh ${actions.join(" ")}`));
  else ctx.run("gh", actions, { allowFail: true });

  const roleArn = roleArnFlag || (await deployRole(ctx, { owner, name, region: cfg.region, dir: cfg.dir }));
  const bad = v.roleArn(roleArn);
  if (bad && !ctx.dryRun) throw new CliError(bad);
  await step(ctx, "gh", ["variable", "set", "AWS_DEPLOY_ROLE_ARN", "--repo", repo, "--body", roleArn]);
  await step(ctx, "gh", ["variable", "set", "AWS_REGION", "--repo", repo, "--body", cfg.region]);
  if (spotify) {
    await step(ctx, "gh", ["secret", "set", "SPOTIFY_CLIENT_ID", "--repo", repo], { input: spotify.id });
    if (spotify.secret)
      await step(ctx, "gh", ["secret", "set", "SPOTIFY_CLIENT_SECRET", "--repo", repo], {
        input: spotify.secret,
      });
  }
  return repo;
}

/**
 * The one trust step: a role GitHub may assume for this fork only (infra/github-oidc-role.yaml). With AWS
 * credentials here it is created with CloudFormation directly; without, the console link is opened and the
 * RoleArn output is pasted.
 * @param {Ctx} ctx @param {{ owner: string, name: string, region: string, dir?: string }} o
 */
export async function deployRole(ctx, { owner, name, region, dir = ctx.cwd }) {
  const { c, log } = ctx;
  const who = awsIdentity(ctx);
  if (!who) {
    const url = `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/template`;
    log(c.bold("One-time deploy role (about 1 minute, in the AWS console):"));
    log(`1. Open ${url}`);
    log(`2. "Upload a template file" → ${TEMPLATE} (https://github.com/${UPSTREAM}/blob/HEAD/${TEMPLATE}).`);
    log(`3. Stack name ${ROLE_STACK} · GitHubOrg = ${owner} · GitHubRepo = ${name} · CreateProvider = true`);
    log("   (false if the account already has GitHub's OIDC provider) → tick the IAM box → Create stack.");
    log("4. When it says CREATE_COMPLETE, open Outputs and copy RoleArn.");
    ctx.open(url);
    return ctx.ask("roleArn", "RoleArn", { validate: v.roleArn });
  }
  log(`${c.green("✓")} AWS account ${who.Account}: creating the deploy role with CloudFormation`);
  const providers = ctx.run("aws", ["iam", "list-open-id-connect-providers", "--output", "text"], {
    allowFail: true,
  }).stdout;
  const createProvider = providers.includes("token.actions.githubusercontent.com") ? "false" : "true";
  let template = join(dir, TEMPLATE);
  let tmp = "";
  if (!existsSync(template)) {
    tmp = mkdtempSync(join(tmpdir(), "tdj-"));
    template = join(tmp, "github-oidc-role.yaml");
    const raw = ctx.run("gh", [
      "api",
      `repos/${UPSTREAM}/contents/${TEMPLATE}`,
      "-H",
      "Accept: application/vnd.github.raw",
    ]);
    writeFileSync(template, raw.stdout);
  }
  try {
    await step(ctx, "aws", [
      "cloudformation",
      "deploy",
      "--stack-name",
      ROLE_STACK,
      "--template-file",
      template,
      "--capabilities",
      "CAPABILITY_NAMED_IAM",
      "--region",
      region,
      "--parameter-overrides",
      `GitHubOrg=${owner}`,
      `GitHubRepo=${name}`,
      `CreateProvider=${createProvider}`,
    ]);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
  if (ctx.dryRun) return `arn:aws:iam::${who.Account}:role/tdj-github-deploy`;
  const out = ctx.run("aws", [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    ROLE_STACK,
    "--region",
    region,
    "--query",
    "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue",
    "--output",
    "text",
  ]);
  return out.stdout.trim();
}

/** Remembers the fork for later commands. @param {Ctx} ctx @param {string} dir @param {string} repo */
export function rememberFork(ctx, dir, repo) {
  if (!ctx.dryRun) writeEnvFile(dir, { TDJ_GITHUB_REPO: repo });
}

/**
 * Runs a visible step (or prints it in --dry-run). A failure becomes a plain-words error with `next` steps.
 * @param {Ctx} ctx @param {string} cmd @param {string[]} args @param {import("./sys.mjs").RunOpts} [o] @param {string[]} [next]
 */
export async function step(ctx, cmd, args, o = {}, next = []) {
  ctx.log(ctx.c.dim(`$ ${cmd} ${args.join(" ")}`));
  if (ctx.dryRun) return;
  if (o.input !== undefined) {
    const r = ctx.run(cmd, args, { ...o, allowFail: true });
    if (r.status !== 0)
      throw new CliError(`\`${cmd} ${args.slice(0, 2).join(" ")}\` failed${tail(r.stderr)}.`, next);
    return;
  }
  const code = await ctx.live(cmd, args, o);
  if (code === 127)
    throw new CliError(`\`${cmd}\` is not installed or not on PATH.`, [
      "Run `tdj doctor` to see what is missing.",
    ]);
  if (code !== 0) throw new CliError(`\`${cmd} ${args.slice(0, 2).join(" ")}\` failed (exit ${code}).`, next);
}

/** @param {string} s */
const tail = (s) => {
  const last = s.trim().split("\n").pop();
  return last ? `: ${last}` : "";
};
