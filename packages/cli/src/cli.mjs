// tdj — deploy your own TDJ and set up its Apple releases. `tdj --help`.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { apple } from "./apple.mjs";
import { deploy } from "./deploy.mjs";
import { doctor } from "./doctor.mjs";
import * as sys from "./sys.mjs";
import { banner, palette, prompter, useColor } from "./ui.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

export const HELP = `tdj ${VERSION} — your own TDJ in one command

Usage
  npx tdj-deploy [command] [options]        (inside the repository: node packages/cli/bin/tdj.mjs)

Commands
  deploy (default)   deploy TDJ to your AWS account (from here, or through a GitHub fork)
  doctor             check what is installed and signed in
  apple              one-time Apple + GitHub setup for the Mac and iPad releases (owner, gh logged in)

Deploy options
  --route aws|github       aws: from this computer with AWS credentials · github: a fork runs "Deploy to AWS"
  --region REGION          AWS region (default: $AWS_REGION or us-east-1)
  --stage NAME             SST stage (default production)
  --role-arn ARN           github route: an existing deploy role (skips the CloudFormation step)
  --repo OWNER/NAME        github route: the fork (default <you>/TDJ)
  --dir PATH               aws route: the TDJ checkout (default: this folder)
  --spotify-later          do not ask for Spotify now (set it in the app at /admin)
                           Spotify keys can also come from SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET (env only,
                           never flags: flags end up in shell history)

Apple options
  --repo OWNER/NAME        repository to configure (default ArioMoniri/TDJ)
  --issuer-id ID --key-id ID --p8 PATH     the App Store Connect API key (asked if missing)
  --team-id ID --bundle-id ID --app-id DIGITS --spotify-client-id ID (the apps' own Spotify app; public, PKCE)
  --updater-key PATH       also store the Tauri updater key (+ .pub) made on the release Mac

Common
  -y, --yes                non-interactive: defaults for everything not given as a flag
  --dry-run                print every command instead of running it
  --no-color               plain output (also NO_COLOR=1)
  -h, --help · -v, --version

Nothing secret is written to disk: keys go to GitHub through stdin and to the deploy through the environment.`;

const OPTIONS = /** @type {const} */ ({
  route: { type: "string" },
  region: { type: "string" },
  stage: { type: "string" },
  "role-arn": { type: "string" },
  repo: { type: "string" },
  dir: { type: "string" },
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

/** @param {string[]} argv */
export function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  return { command: positionals[0] ?? "deploy", flags: /** @type {Record<string, any>} */ (values) };
}

/**
 * @param {string[]} argv
 * @param {Partial<import("./deploy.mjs").Ctx> & { answers?: Record<string,string>, isTTY?: boolean }} [inject] tests
 */
export async function main(argv, inject = {}) {
  let parsed;
  try {
    parsed = parse(argv);
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : e}\n\n${HELP}`);
    return 2;
  }
  const { command, flags } = parsed;
  const log = inject.log ?? ((/** @type {string} */ s = "") => console.log(s));
  if (flags.help || flags.version) {
    log(flags.help ? HELP : VERSION);
    return 0;
  }
  const env = inject.env ?? process.env;
  const c = palette({ color: useColor(env, inject.isTTY ?? !!process.stdout.isTTY, !flags["no-color"]) });
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
  };
  log(banner(c));
  log();
  switch (command) {
    case "deploy":
      return deploy(ctx, flags);
    case "doctor":
      return doctor(ctx);
    case "apple":
    case "setup":
      return apple(ctx, flags);
    default:
      log(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}
