// tdj — deploy your own T-DJ, and set up its Apple releases. `tdj --help`.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { apple } from "./apple.mjs";
import { CliError } from "./config.mjs";
import { connectors } from "./connectors.mjs";
import { deploy } from "./deploy.mjs";
import { destroy } from "./destroy.mjs";
import { doctor } from "./doctor.mjs";
import { guideText } from "./guide.mjs";
import { init } from "./init.mjs";
import { status } from "./status.mjs";
import * as sys from "./sys.mjs";
import { asciiOnly, banner, palette, prompter, useColor } from "./ui.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

export const COMMANDS = [
  "start",
  "init",
  "deploy",
  "connectors",
  "doctor",
  "status",
  "destroy",
  "guide",
  "apple",
  "help",
];

export const HELP = `tdj ${VERSION} — your own T-DJ on your own AWS account

Usage
  pnpm tdj <command> [options]      (in a TDJ checkout; or: node packages/cli/bin/tdj.mjs, npx tdj-deploy)

Commands
  (none)             init, then deploy: the whole guided path
  init               check this computer, choose stage + region + optional Spotify app, save the settings
  init --github      the same for a GitHub fork: deploy role in AWS (OIDC) + repository settings, via gh
  deploy             checks, pnpm install, build, sst deploy; prints the URL and the /admin setup code
  connectors         Spotify, YouTube, Google, Dropbox: what each unlocks, the console steps, your keys
                     (secrets typed hidden → Parameter Store, GitHub secrets or apps/web/.env.local)
  connectors --check which connector keys are set and whether the running app sees them
  doctor             what is missing or broken, and the fix for each (reads the last deploy log too)
  status             the app URL, the version it answers with, whether /admin still waits for you
  destroy            remove a stage (you type its name to confirm)
  guide              the step-by-step guide: one line, CLI, one click on GitHub, costs, update, remove
  apple              project owner only: Apple + GitHub release setup for the Mac and iPad apps

Options
  --stage NAME             SST stage (default: .env.local, else production)
  --region REGION          AWS region (default: .env.local, $AWS_REGION, else us-east-1)
  --github                 use the GitHub fork route (same as --route github)
  --route aws|github       aws: deploy from this computer · github: the fork runs "Deploy to AWS"
  --repo OWNER/NAME        the fork (default <you>/TDJ)
  --role-arn ARN           init --github: an existing deploy role (skips CloudFormation)
  --dir PATH               the TDJ checkout (default: the folder you are in)
  --spotify-client-id ID   init: the public Client ID; the secret is only ever typed hidden or read
                           from SPOTIFY_CLIENT_SECRET in the environment, never a flag
  --spotify-later          init: skip Spotify (set it in the app at /admin)
  --confirm STAGE          destroy with --yes: the stage name, typed out
  --only LIST              connectors: some of spotify,youtube,google,dropbox,pipedream
  --target WHERE           connectors: aws, github or local (default: your deploy route)
  --check                  connectors: show what is set, change nothing
  -y, --yes                no questions: defaults for everything not given as a flag
  --dry-run                print every command instead of running it
  --no-color               plain output (also NO_COLOR=1; TDJ_ASCII=1 for a pure-ASCII banner)
  -h, --help · -v, --version

Nothing secret is printed or written to disk: secrets go to AWS Parameter Store (encrypted) or to GitHub
secrets through stdin. Guide: docs/SELF_DEPLOY.md · Problems: tdj doctor · Developed by Ariorad Moniri`;

const OPTIONS = /** @type {const} */ ({
  route: { type: "string" },
  github: { type: "boolean" },
  region: { type: "string" },
  stage: { type: "string" },
  "role-arn": { type: "string" },
  repo: { type: "string" },
  dir: { type: "string" },
  confirm: { type: "string" },
  only: { type: "string" },
  target: { type: "string" },
  check: { type: "boolean" },
  "spotify-later": { type: "boolean" },
  "issuer-id": { type: "string" },
  "key-id": { type: "string" },
  p8: { type: "string" },
  "team-id": { type: "string" },
  "bundle-id": { type: "string" },
  "app-id": { type: "string" },
  "spotify-client-id": { type: "string" },
  "updater-key": { type: "string" },
  yes: { type: "boolean", short: "y" },
  "dry-run": { type: "boolean" },
  "no-color": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
});

/** @param {string[]} argv @returns {{ command: string, flags: Record<string, any> }} */
export function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  const command = positionals[0] ?? "start";
  if (positionals.length > 1) throw new Error(`Unexpected "${positionals[1]}" after "${command}".`);
  return { command, flags: /** @type {Record<string, any>} */ (values) };
}

/**
 * @param {string[]} argv
 * @param {Partial<import("./deploy.mjs").Ctx> & { answers?: Record<string,string>, isTTY?: boolean }} [inject] tests
 */
export async function main(argv, inject = {}) {
  const log = inject.log ?? ((/** @type {string} */ s = "") => console.log(s));
  let parsed;
  try {
    parsed = parse(argv);
  } catch (e) {
    log(
      `${e instanceof Error ? e.message.replace(/^TypeError \[\w+\]: /, "") : e}\n\nRun \`tdj --help\` for the commands and options.`,
    );
    return 2;
  }
  const { command, flags } = parsed;
  if (flags.version) {
    log(VERSION);
    return 0;
  }
  const env = inject.env ?? process.env;
  const c = palette({ color: useColor(env, inject.isTTY ?? !!process.stdout.isTTY, !flags["no-color"]) });
  if (flags.help || command === "help") {
    log(banner(c, { ascii: asciiOnly(env) }));
    log();
    log(HELP);
    return 0;
  }
  if (!COMMANDS.includes(command) && command !== "setup") {
    log(
      `Unknown command "${command}". The commands are: ${COMMANDS.join(", ")}.\nRun \`tdj --help\` for details.`,
    );
    return 2;
  }
  const run = inject.run ?? sys.run;
  const p = prompter({ answers: inject.answers, yes: !!flags.yes });
  /** @type {import("./deploy.mjs").Ctx} */
  const ctx = {
    run,
    live: inject.live ?? sys.live,
    open: inject.open ?? ((url) => (flags.yes ? undefined : sys.openUrl(run, url))),
    log,
    ask: inject.ask ?? p.ask,
    confirm: inject.confirm ?? p.confirm,
    choose: inject.choose ?? p.choose,
    c,
    env,
    cwd: inject.cwd ?? process.cwd(),
    dryRun: !!flags["dry-run"],
    yes: !!flags.yes,
    nodeVersion: inject.nodeVersion,
    fetch: inject.fetch,
  };
  if (command === "guide") {
    log(guideText(c));
    return 0;
  }
  log(banner(c, { ascii: asciiOnly(env) }));
  log();
  try {
    switch (command) {
      case "start": {
        const code = await init(ctx, flags);
        if (code !== 0) return code;
        log();
        if (!(await ctx.confirm("deployNow", "Deploy now?", true))) {
          log(`Later: ${c.bold("pnpm tdj deploy")}`);
          return 0;
        }
        return await deploy(ctx, flags);
      }
      case "init":
        return await init(ctx, flags);
      case "deploy":
        return await deploy(ctx, flags);
      case "connectors":
        return await connectors(ctx, flags);
      case "doctor":
        return doctor(ctx, flags);
      case "status":
        return await status(ctx, flags);
      case "destroy":
        return await destroy(ctx, flags);
      default:
        return await apple(ctx, flags);
    }
  } catch (e) {
    log();
    log(`${c.red("✗")} ${e instanceof Error ? e.message : String(e)}`);
    const next = e instanceof CliError ? e.next : ["Run `tdj doctor` for a check of this computer."];
    if (next.length) {
      log(c.bold("What to do next"));
      for (const n of next) log(`  → ${n}`);
    }
    return 1;
  }
}
