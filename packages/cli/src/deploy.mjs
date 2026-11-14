// `tdj deploy`: your own TDJ on AWS. Two routes (docs/SELF_DEPLOY.md):
//   aws    — from this computer with AWS credentials: `sst deploy` of a TDJ checkout, then the setup code
//   github — a fork of the repository: the one-time deploy role (CloudFormation), one repository variable,
//            and the "Deploy to AWS" workflow; nothing runs on this computer after that
// Only what cannot be set inside the app later is asked: the region, the deploy role, optionally Spotify.
// Everything else (Google, Dropbox, the AI key, the owner passphrase) is set in the app at /admin.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as v from "./validate.mjs";

export const UPSTREAM = "ArioMoniri/TDJ";
const TEMPLATE = "infra/github-oidc-role.yaml";

/**
 * @typedef {import("./sys.mjs").Run} Run
 * @typedef {import("./sys.mjs").Live} Live
 * @typedef {{
 *   run: Run, live: Live, open: (url: string) => void, log: (s?: string) => void,
 *   ask: (id: string, q: string, o?: { default?: string, secret?: boolean, validate?: (v: string) => string | null }) => Promise<string>,
 *   confirm: (id: string, q: string, def?: boolean) => Promise<boolean>,
 *   choose: (id: string, q: string, choices: string[], def: string) => Promise<string>,
 *   c: ReturnType<typeof import("./ui.mjs").palette>, env: NodeJS.ProcessEnv, cwd: string, dryRun: boolean,
 * }} Ctx
 */

/** @param {Ctx} ctx @param {Record<string, string | boolean | undefined>} flags */
export async function deploy(ctx, flags) {
  const { c, log } = ctx;
  log(c.bold("Deploy your own TDJ"));
  log(c.dim("Two questions, maybe three. Everything else is set later inside the app (/admin)."));
  log();
  const route = /** @type {string} */ (
    flags.route ||
      (await ctx.choose(
        "route",
        "Deploy from this computer (aws) or from a GitHub fork (github)?",
        ["aws", "github"],
        "github",
      ))
  );
  if (route !== "aws" && route !== "github") throw new Error("--route must be aws or github");
  const region = /** @type {string} */ (
    flags.region ||
      (await ctx.ask("region", "AWS region", {
        default: ctx.env.AWS_REGION || ctx.env.AWS_DEFAULT_REGION || "us-east-1",
        validate: v.region,
      }))
  );
  if (v.region(region)) throw new Error(/** @type {string} */ (v.region(region)));
  const stage = /** @type {string} */ (flags.stage || "production");
  if (v.stage(stage)) throw new Error(/** @type {string} */ (v.stage(stage)));
  const spotify = await spotifyCredentials(ctx, flags);
  return route === "aws"
    ? deployFromHere(ctx, { region, stage, spotify, flags })
    : deployFromFork(ctx, { region, stage, spotify, flags });
}

/** Spotify is the one connector worth entering now (or later in /admin). Secrets come from env or a hidden prompt. */
async function spotifyCredentials(/** @type {Ctx} */ ctx, /** @type {Record<string, any>} */ flags) {
  const fromEnv = ctx.env.SPOTIFY_CLIENT_ID && ctx.env.SPOTIFY_CLIENT_SECRET;
  if (fromEnv)
    return {
      id: /** @type {string} */ (ctx.env.SPOTIFY_CLIENT_ID),
      secret: /** @type {string} */ (ctx.env.SPOTIFY_CLIENT_SECRET),
    };
  if (flags["spotify-later"] || flags.yes) return null;
  const now = await ctx.confirm(
    "spotifyNow",
    "Add your Spotify app now? (No = set it later in the app at /admin)",
    false,
  );
  if (!now) return null;
  ctx.open("https://developer.spotify.com/dashboard");
  const id = await ctx.ask("spotifyId", "Spotify Client ID", { validate: v.spotifyClientId });
  const secret = await ctx.ask("spotifySecret", "Spotify Client secret (hidden)", {
    secret: true,
    validate: v.spotifySecret,
  });
  return { id, secret };
}

/** @param {Ctx} ctx */
function awsIdentity(ctx) {
  const r = ctx.run("aws", ["sts", "get-caller-identity", "--output", "json"], { allowFail: true });
  if (r.status !== 0) return null;
  try {
    return /** @type {{ Account: string, Arn: string }} */ (JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

/** @param {Ctx} ctx @param {{ region: string, stage: string, spotify: {id: string, secret: string} | null, flags: Record<string, any> }} o */
export async function deployFromHere(ctx, { region, stage, spotify, flags }) {
  const { c, log } = ctx;
  const who = awsIdentity(ctx);
  if (!who) {
    throw new Error(
      "No AWS credentials here (aws sts get-caller-identity failed). Run `aws configure sso` or `aws configure`, or use --route github.",
    );
  }
  log(`${c.green("✓")} AWS account ${who.Account}`);
  let dir = /** @type {string} */ (flags.dir || ctx.cwd);
  if (!existsSync(join(dir, "sst.config.ts"))) {
    const target = join(ctx.cwd, "TDJ");
    if (!(await ctx.confirm("clone", `No TDJ checkout here. Clone ${UPSTREAM} into ${target}?`, true))) {
      throw new Error("Run this inside a TDJ checkout, or pass --dir.");
    }
    await step(ctx, "git", ["clone", "--depth", "1", `https://github.com/${UPSTREAM}.git`, target]);
    dir = target;
  }
  const env = {
    AWS_REGION: region,
    ...(spotify ? { SPOTIFY_CLIENT_ID: spotify.id, SPOTIFY_CLIENT_SECRET: spotify.secret } : {}),
  };
  log();
  log(
    `${c.bold("Plan")}: sst deploy --stage ${stage} in ${region} (CloudFront + Lambda + S3; idle cost about $0–1 a month)`,
  );
  if (!(await ctx.confirm("go", "Deploy now?", true))) return 1;
  await step(ctx, "pnpm", ["install", "--frozen-lockfile"], { cwd: dir });
  await step(ctx, "npx", ["sst", "deploy", "--stage", stage], { cwd: dir, env });
  const url = readUrl(dir);
  const code = ctx.dryRun ? "(dry run)" : setupCode(ctx, stage, region);
  finish(ctx, url, code, stage);
  return 0;
}

/** @param {string} dir */
function readUrl(dir) {
  try {
    return /** @type {string} */ (
      JSON.parse(readFileSync(join(dir, ".sst", "outputs.json"), "utf8")).url || ""
    );
  } catch {
    return "";
  }
}

/** The same one-time owner code as the deploy workflow (docs/DEPLOY.md → Owner setup). @param {Ctx} ctx @param {string} stage @param {string} region */
export function setupCode(ctx, stage, region) {
  const base = ["--region", region];
  const hasPass = ctx.run(
    "aws",
    ["ssm", "get-parameter", "--name", `/tdj/${stage}/OWNER_PASSPHRASE_HASH`, ...base],
    { allowFail: true },
  );
  if (hasPass.status === 0) return null;
  const code = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const dir = mkdtempSync(join(tmpdir(), "tdj-"));
  const file = join(dir, "p.json");
  const body = {
    Name: `/tdj/${stage}/SETUP_CODE`,
    Type: "SecureString",
    Overwrite: true,
    Value: `${code}.${Math.floor(Date.now() / 1000)}`,
  };
  writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
  try {
    ctx.run("aws", ["ssm", "put-parameter", "--cli-input-json", `file://${file}`, ...base]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return code;
}

/** @param {Ctx} ctx @param {string} url @param {string | null} code @param {string} stage */
function finish(ctx, url, code, stage) {
  const { c, log } = ctx;
  const app = url || "<your app URL>";
  log();
  log(c.bold(c.green("TDJ is live")) + (url ? `: ${c.bold(url)}` : ""));
  log();
  log(c.bold("Next steps"));
  if (code) {
    log(`1. Open ${app}/admin and paste this one-time setup code (24 h): ${c.bold(code)}`);
  } else {
    log(`1. Open ${app}/admin and unlock with your owner passphrase (stage ${stage} already has one).`);
  }
  log("2. Choose an owner passphrase. Then, for each service you want, paste its keys next to the redirect");
  log(
    "   addresses /admin shows (Spotify, Google, Dropbox, an AI key for everyone). Nothing else to deploy.",
  );
  log(`3. Spotify redirect URIs to add at https://developer.spotify.com/dashboard → your app → Settings:`);
  log(`     ${app}/api/spotify/callback`);
  log(`     ${app}/callback`);
  log("     tdj://spotify-callback   (the Mac and iPad apps)");
  log(`4. In the TDJ app for Mac or iPad: TDJ menu → Change Server → ${app}`);
}

/** @param {Ctx} ctx @param {{ region: string, stage: string, spotify: {id: string, secret: string} | null, flags: Record<string, any> }} o */
export async function deployFromFork(ctx, { region, stage, spotify, flags }) {
  const { c, log } = ctx;
  if (ctx.run("gh", ["auth", "status"], { allowFail: true }).status !== 0) {
    throw new Error("GitHub CLI is not logged in: run `gh auth login`, then try again.");
  }
  const me = ctx.run("gh", ["api", "user", "--jq", ".login"]).stdout.trim();
  const repo = /** @type {string} */ (flags.repo || `${me}/TDJ`);
  if (v.repo(repo)) throw new Error(/** @type {string} */ (v.repo(repo)));
  const [owner, name] = repo.split("/");

  if (ctx.run("gh", ["repo", "view", repo, "--json", "name"], { allowFail: true }).status !== 0) {
    log(`… forking ${UPSTREAM} to ${repo}`);
    await step(ctx, "gh", [
      "repo",
      "fork",
      UPSTREAM,
      "--clone=false",
      "--default-branch-only",
      "--fork-name",
      /** @type {string} */ (name),
    ]);
  } else {
    log(`${c.green("✓")} ${repo} exists`);
  }
  // GitHub turns Actions off on new forks
  ctx.run(
    "gh",
    [
      "api",
      "-X",
      "PUT",
      `repos/${repo}/actions/permissions`,
      "-F",
      "enabled=true",
      "-f",
      "allowed_actions=all",
    ],
    { allowFail: true },
  );

  let roleArn = /** @type {string} */ (flags["role-arn"] || "");
  if (!roleArn)
    roleArn = await deployRole(ctx, {
      owner: /** @type {string} */ (owner),
      name: /** @type {string} */ (name),
      region,
    });
  if (v.roleArn(roleArn)) throw new Error(/** @type {string} */ (v.roleArn(roleArn)));

  await step(ctx, "gh", ["variable", "set", "AWS_DEPLOY_ROLE_ARN", "--repo", repo, "--body", roleArn]);
  await step(ctx, "gh", ["variable", "set", "AWS_REGION", "--repo", repo, "--body", region]);
  if (spotify) {
    await step(ctx, "gh", ["secret", "set", "SPOTIFY_CLIENT_ID", "--repo", repo], { input: spotify.id });
    await step(ctx, "gh", ["secret", "set", "SPOTIFY_CLIENT_SECRET", "--repo", repo], {
      input: spotify.secret,
    });
  }
  log();
  if (!(await ctx.confirm("go", `Run "Deploy to AWS" on ${repo} now?`, true))) return 1;
  await step(ctx, "gh", ["workflow", "run", "deploy-aws.yml", "--repo", repo, "-f", `stage=${stage}`]);
  log(c.dim("The first deploy takes 10–15 minutes (CloudFront)."));
  const runs = ctx.run(
    "gh",
    ["run", "list", "--repo", repo, "--workflow", "deploy-aws.yml", "-L", "1", "--json", "databaseId,url"],
    { allowFail: true },
  );
  /** @type {{databaseId: number, url: string}[]} */
  let list = [];
  try {
    list = JSON.parse(runs.stdout || "[]");
  } catch {}
  const latest = list[0];
  if (latest && !ctx.dryRun)
    await ctx.live("gh", ["run", "watch", String(latest.databaseId), "--repo", repo, "--exit-status"]);
  log();
  log(c.bold(c.green("Deployed.")) + ` Open the run summary for your app URL and the one-time setup code:`);
  log(`  ${latest?.url || `https://github.com/${repo}/actions/workflows/deploy-aws.yml`}`);
  finish(ctx, "", null, stage);
  return 0;
}

/**
 * The one trust step: a role GitHub may assume for this fork. With AWS credentials here it is created with
 * CloudFormation directly; without, the console link is opened and the RoleArn output is pasted.
 * @param {Ctx} ctx @param {{ owner: string, name: string, region: string }} o
 */
export async function deployRole(ctx, { owner, name, region }) {
  const { c, log } = ctx;
  const who = awsIdentity(ctx);
  if (!who) {
    const url = `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/template`;
    log(c.bold("One-time deploy role (about 1 minute):"));
    log(`1. Open ${url}`);
    log(
      `2. "Upload a template file" → ${TEMPLATE} from the repository (https://github.com/${UPSTREAM}/blob/main/${TEMPLATE}).`,
    );
    log(
      `3. Stack name tdj-github-oidc · GitHubOrg = ${owner} · GitHubRepo = ${name} · CreateProvider = true`,
    );
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
  let template = join(ctx.cwd, TEMPLATE);
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
      "tdj-github-oidc",
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
  const out = ctx.run("aws", [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    "tdj-github-oidc",
    "--region",
    region,
    "--query",
    "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue",
    "--output",
    "text",
  ]);
  return out.stdout.trim();
}

/** Runs a visible step (or prints it in --dry-run). @param {Ctx} ctx @param {string} cmd @param {string[]} args @param {import("./sys.mjs").RunOpts} [o] */
export async function step(ctx, cmd, args, o = {}) {
  ctx.log(ctx.c.dim(`$ ${cmd} ${args.join(" ")}`));
  if (ctx.dryRun) return;
  if (o.input !== undefined) {
    ctx.run(cmd, args, o);
    return;
  }
  const code = await ctx.live(cmd, args, o);
  if (code !== 0) throw new Error(`${cmd} ${args[0]} failed (exit ${code})`);
}
