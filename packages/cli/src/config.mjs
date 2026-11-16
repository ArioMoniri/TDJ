// Where the checkout is and which stage, region and route a command works on: flags first, then the
// `.env.local` that `tdj init` wrote, then the environment, then the defaults.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readEnvFile } from "./envfile.mjs";
import * as v from "./validate.mjs";

/** A plain-words failure: what went wrong and what to do next. The CLI prints it without a stack. */
export class CliError extends Error {
  /** @param {string} message @param {string[]} [next] */
  constructor(message, next = []) {
    super(message);
    this.next = next;
  }
}

/** The TDJ checkout that contains `dir` (a folder with sst.config.ts and packages/cli), or "". @param {string} dir */
export function findCheckout(dir) {
  let d = resolve(dir);
  for (;;) {
    if (existsSync(join(d, "sst.config.ts")) && existsSync(join(d, "pnpm-workspace.yaml"))) return d;
    const up = dirname(d);
    if (up === d) return "";
    d = up;
  }
}

/**
 * @typedef {{ dir: string, checkout: string, stage: string, region: string, route: "aws" | "github",
 *   repo: string, file: Record<string, string> }} Config
 * @param {{ cwd: string, env: NodeJS.ProcessEnv }} ctx @param {Record<string, any>} flags @returns {Config}
 */
export function resolveConfig(ctx, flags) {
  const checkout = flags.dir ? resolve(ctx.cwd, flags.dir) : findCheckout(ctx.cwd);
  const dir = checkout || ctx.cwd;
  const file = readEnvFile(dir);
  const stage = String(flags.stage || file.TDJ_STAGE || "production");
  const region = String(
    flags.region || file.AWS_REGION || ctx.env.AWS_REGION || ctx.env.AWS_DEFAULT_REGION || "us-east-1",
  );
  const route =
    flags.github || flags.route === "github"
      ? "github"
      : flags.route === "aws"
        ? "aws"
        : file.TDJ_DEPLOY_ROUTE === "github"
          ? "github"
          : "aws";
  if (flags.route && flags.route !== "aws" && flags.route !== "github")
    throw new CliError(`--route must be aws or github, not "${flags.route}".`);
  const bad = v.stage(stage) || v.region(region);
  if (bad) throw new CliError(bad, ["Fix the value in .env.local, or run `tdj init` again."]);
  return {
    dir,
    checkout,
    stage,
    region,
    route,
    repo: String(flags.repo || file.TDJ_GITHUB_REPO || ""),
    file,
  };
}
