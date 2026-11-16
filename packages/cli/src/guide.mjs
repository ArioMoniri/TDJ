// `tdj guide`: the whole self-hosting path on one screen (the long form is docs/SELF_DEPLOY.md).

export const INSTALL_URL =
  "https://raw.githubusercontent.com/ArioMoniri/TDJ/claude/admiring-curie-npzd0m/scripts/install.sh";

/** @param {ReturnType<typeof import("./ui.mjs").palette>} c */
export function guideText(c) {
  const h = (/** @type {string} */ s) => c.bold(c.violet(s));
  const cmd = (/** @type {string} */ s) => c.cream(s);
  return [
    h("Your own T-DJ, step by step"),
    "There is no public T-DJ server: each DJ or club runs their own (or uses the Mac, iPad and iPhone apps,",
    "which work on their own). Pick one of three ways; all end with the same app on your AWS account.",
    "",
    h("A. One line (this computer)"),
    `   ${cmd(`curl -fsSL ${INSTALL_URL} | bash`)}`,
    "   Shows its plan and asks first. Clones TDJ (or uses this folder), installs, runs `tdj init` and `tdj deploy`.",
    "",
    h("B. The CLI (inside a TDJ checkout)"),
    `   1. ${cmd("pnpm tdj doctor")}        what is installed and signed in, with the fix for each gap`,
    `   2. ${cmd("pnpm tdj init")}          stage, region, optional Spotify app (secret typed hidden)`,
    `   3. ${cmd("pnpm tdj deploy")}        checks, install, build, sst deploy: prints the URL and setup code`,
    `   4. ${cmd("pnpm tdj status")}        is it answering, which version, is /admin still waiting`,
    "",
    h("C. One click on GitHub (nothing runs on your computer afterwards)"),
    '   1. Fork https://github.com/ArioMoniri/TDJ (or "Use this template").',
    `   2. ${cmd("pnpm tdj init --github")}  creates the deploy role in AWS (infra/github-oidc-role.yaml,`,
    "      trusted by your fork only) and stores AWS_DEPLOY_ROLE_ARN on the fork. Or by hand: CloudFormation →",
    "      upload that template → copy RoleArn → fork Settings → Secrets and variables → Actions → add it.",
    '   3. Actions → "Deploy to AWS" → Run workflow. The run summary shows the URL and the setup code.',
    "",
    h("Then, in the app"),
    "   Open <url>/admin, paste the one-time setup code (24 h), choose an owner passphrase, and add the",
    "   services you want (Spotify, Google, Dropbox, an AI key) next to the redirect addresses it shows.",
    "",
    h("Cost"),
    "   About $0–1 a month for a club: CloudFront, Lambda, S3, DynamoDB and Parameter Store free tiers.",
    "",
    h("Update"),
    `   CLI: ${cmd("git pull && pnpm tdj deploy")} · fork: press "Sync fork" on GitHub, then run "Deploy to AWS".`,
    "",
    h("Remove"),
    `   ${cmd("pnpm tdj destroy")}  (asks you to type the stage name; prints what is kept and how to delete it)`,
    "",
    h("Troubleshooting"),
    `   ${cmd("pnpm tdj doctor")} reads the last deploy log and names the fix. Full guide: docs/SELF_DEPLOY.md`,
    "",
    c.dim("T-DJ is free for personal, educational and non-profit use (PolyForm Noncommercial 1.0.0)."),
    c.dim("Running it for a business needs written permission from the author: open an issue to ask."),
  ].join("\n");
}
