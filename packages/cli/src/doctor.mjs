// `tdj doctor`: what is installed and signed in, what the last deploy log says went wrong, and the fix for each.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig } from "./config.mjs";
import { ENV_FILE, secretsIn } from "./envfile.mjs";

/**
 * @typedef {{ id: string, name: string, pass: boolean, detail?: string, fix: string,
 *   need: "always" | "aws" | "github" | "optional" }} Check
 */

/** Why `aws sts get-caller-identity` failed, in plain words, with the command that fixes it. @param {string} stderr */
export function awsCredentialFix(stderr) {
  if (/expired|ExpiredToken|Token has expired|sso.*(login|session)/i.test(stderr))
    return "Your AWS sign-in has expired: run `aws sso login` (or `aws configure` for access keys).";
  if (/Unable to locate credentials|NoCredentialProviders|could not be found/i.test(stderr))
    return "No AWS credentials on this computer: run `aws configure sso` (or `aws configure`).";
  if (/InvalidClientTokenId|SignatureDoesNotMatch|AuthFailure/i.test(stderr))
    return "The AWS access key is wrong or deleted: create a new one and run `aws configure`.";
  if (/profile.*not.*found|ProfileNotFound/i.test(stderr))
    return "AWS_PROFILE names a profile that does not exist: `aws configure list-profiles`, then set AWS_PROFILE.";
  return "Run `aws configure sso` (or `aws configure`), then `aws sts get-caller-identity` to confirm.";
}

/**
 * Everything the deploy needs, checked without changing anything.
 * @param {import("./deploy.mjs").Ctx} ctx @param {import("./config.mjs").Config} [cfg] @returns {Check[]}
 */
export function checks(ctx, cfg) {
  const ok = (/** @type {string} */ cmd, /** @type {string[]} */ args) =>
    ctx.run(cmd, args, { allowFail: true });
  const nodeVersion = ctx.nodeVersion ?? process.versions.node;
  const nodeMajor = Number(nodeVersion.split(".")[0]);
  const pnpm = ok("pnpm", ["--version"]);
  const corepack = pnpm.status === 0 ? null : ok("corepack", ["--version"]);
  const aws = ok("aws", ["--version"]).status === 0;
  const awsId = aws ? ok("aws", ["sts", "get-caller-identity", "--output", "json"]) : null;
  const gh = ok("gh", ["--version"]).status === 0;
  const ghAuth = gh ? ok("gh", ["auth", "status"]) : null;
  const checkout = cfg?.checkout || "";
  /** @type {Check[]} */
  const list = [
    {
      id: "node",
      name: "Node.js 22 or newer",
      pass: nodeMajor >= 22,
      detail: `v${nodeVersion}`,
      fix: "Install Node 22 LTS from https://nodejs.org (or `nvm install 22`).",
      need: "always",
    },
    {
      id: "git",
      name: "git",
      pass: ok("git", ["--version"]).status === 0,
      fix: "Install git: https://git-scm.com/downloads",
      need: "aws",
    },
    {
      id: "pnpm",
      name: "pnpm",
      pass: pnpm.status === 0,
      detail: pnpm.status === 0 ? pnpm.stdout.trim() : undefined,
      fix:
        corepack?.status === 0
          ? "Run `corepack enable` (it ships with Node; if it asks for permission, run it with sudo yourself)."
          : "Install pnpm: https://pnpm.io/installation",
      need: "aws",
    },
    {
      id: "aws-cli",
      name: "AWS CLI",
      pass: aws,
      fix: "Install the AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
      need: "aws",
    },
    {
      id: "aws-credentials",
      name: "AWS credentials",
      pass: awsId?.status === 0,
      detail: awsId?.status === 0 ? accountOf(awsId.stdout) : undefined,
      fix: awsCredentialFix(awsId?.stderr ?? ""),
      need: "aws",
    },
    {
      id: "gh",
      name: "GitHub CLI (for --github)",
      pass: gh,
      fix: "Install the GitHub CLI: https://cli.github.com",
      need: "github",
    },
    {
      id: "gh-auth",
      name: "GitHub login (for --github)",
      pass: ghAuth?.status === 0,
      fix: "Run `gh auth login`.",
      need: "github",
    },
  ];
  if (cfg) {
    list.push({
      id: "checkout",
      name: "TDJ checkout",
      pass: !!checkout,
      detail: checkout || undefined,
      fix: "Run this inside the TDJ folder, pass --dir PATH, or let `tdj deploy` clone it.",
      need: "aws",
    });
    if (checkout) {
      list.push({
        id: "deps",
        name: "Dependencies installed",
        pass:
          existsSync(join(checkout, "node_modules", ".bin", "sst")) ||
          existsSync(join(checkout, "node_modules", "sst")),
        fix: "Run `pnpm install` in the checkout (`tdj deploy` does it for you).",
        need: "optional",
      });
    }
    const leaked = secretsIn(cfg.file);
    list.push({
      id: "env-file",
      name: `${ENV_FILE} from \`tdj init\``,
      pass: Object.keys(cfg.file).length > 0 && leaked.length === 0,
      detail: leaked.length ? `holds secrets: ${leaked.join(", ")}` : undefined,
      fix: leaked.length
        ? `Remove ${leaked.join(", ")} from ${ENV_FILE}; run \`tdj init\` to store them encrypted instead.`
        : "Run `tdj init` (it asks the stage, region and optional Spotify app).",
      need: "optional",
    });
  }
  return list;
}

/** @param {string} json */
function accountOf(json) {
  try {
    return `account ${JSON.parse(json).Account}`;
  } catch {
    return undefined;
  }
}

/** Known failures in a deploy log, newest last. Each entry: what it means and the fix. */
export const LOG_PATTERNS = /** @type {const} */ ([
  [
    /ExpiredToken|token.*expired|The SSO session.*expired/i,
    "AWS sign-in expired",
    "Run `aws sso login`, then `tdj deploy` again.",
  ],
  [
    /Unable to locate credentials|NoCredentialProviders/i,
    "No AWS credentials",
    "Run `aws configure sso` (or `aws configure`).",
  ],
  [
    /locked|ConcurrentUpdate|another (update|deploy) is in progress/i,
    "A previous deploy left the stage locked",
    "Run `npx sst unlock --stage <stage>`, then deploy again.",
  ],
  [
    /AccessDenied|not authorized to perform/i,
    "The AWS user may not create these resources",
    "Use an admin (or PowerUser + IAM) account; the error names the missing permission.",
  ],
  [
    /EntityAlreadyExists.*oidc|Provider with url .* already exists/i,
    "GitHub's OIDC provider already exists in this account",
    "Deploy infra/github-oidc-role.yaml with CreateProvider=false (`tdj init --github` decides this for you).",
  ],
  [
    /ENOSPC|no space left/i,
    "The disk is full",
    "Free a few GB (the build needs about 2 GB), then deploy again.",
  ],
  [
    /JavaScript heap out of memory/i,
    "The build ran out of memory",
    "Run `NODE_OPTIONS=--max-old-space-size=4096 tdj deploy`.",
  ],
  [
    /ERR_PNPM_OUTDATED_LOCKFILE|frozen-lockfile/i,
    "The lockfile does not match package.json",
    "Pull the latest TDJ (`git pull`), then deploy again.",
  ],
  [
    /protected stage|stage is protected/i,
    "The stage is protected from removal",
    "`tdj destroy` asks for the stage name and lifts the protection for that one run.",
  ],
  [
    /CNAMEAlreadyExists|certificate.*(pending|not.*valid)/i,
    "The custom domain is not ready",
    "Check TDJ_DOMAIN's DNS and certificate, or remove TDJ_DOMAIN from .env.local.",
  ],
]);

/** @param {string} text @returns {{ problem: string, fix: string }[]} */
export function diagnoseLog(text) {
  const found = [];
  for (const [re, problem, fix] of LOG_PATTERNS) if (re.test(text)) found.push({ problem, fix });
  return found;
}

/** The newest SST log in the checkout, if any. @param {string} checkout */
function lastLog(checkout) {
  const dir = join(checkout, ".sst", "log");
  if (!checkout || !existsSync(dir)) return "";
  try {
    const files = readdirSync(dir)
      .map((f) => join(dir, f))
      .filter((f) => statSync(f).isFile())
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return files[0] ? readFileSync(files[0], "utf8").slice(-200_000) : "";
  } catch {
    return "";
  }
}

/** @param {import("./deploy.mjs").Ctx} ctx @param {Record<string, any>} [flags] */
export function doctor(ctx, flags = {}) {
  const { c, log } = ctx;
  const cfg = resolveConfig(ctx, flags);
  log(c.bold("tdj doctor"));
  log(c.dim(`stage ${cfg.stage} · region ${cfg.region} · route ${cfg.route}`));
  log();
  const list = checks(ctx, cfg);
  for (const r of list) {
    const mark = r.pass
      ? c.green("✓")
      : r.need === "optional" || (r.need !== cfg.route && r.need !== "always")
        ? c.yellow("•")
        : c.red("✗");
    log(`${mark} ${r.name}${r.detail ? c.dim(`  ${r.detail}`) : ""}`);
    if (!r.pass) log(c.dim(`    → ${r.fix}`));
  }
  const failed = list.filter((r) => !r.pass && (r.need === "always" || r.need === cfg.route));
  const logText = lastLog(cfg.checkout);
  const found = logText ? diagnoseLog(logText) : [];
  if (found.length) {
    log();
    log(c.bold("From the last deploy log (.sst/log):"));
    for (const f of found) log(`${c.yellow("•")} ${f.problem}\n    → ${f.fix.replace("<stage>", cfg.stage)}`);
  }
  log();
  if (failed.length === 0) {
    log(c.green(`Ready to deploy (${cfg.route === "github" ? "tdj deploy --github" : "tdj deploy"}).`));
    return 0;
  }
  log(`${failed.length} thing${failed.length > 1 ? "s" : ""} to fix first (the ✗ lines above).`);
  if (cfg.route === "aws" && list.find((r) => r.id === "gh-auth")?.pass)
    log(c.dim("Or deploy through a GitHub fork instead: `tdj init --github`."));
  return 1;
}
