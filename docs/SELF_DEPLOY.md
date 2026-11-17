# Self-host T-DJ

**There is no public T-DJ server.** The author's own deployment is private (it carries their API keys). To use the
web app you run your own copy, which takes a few minutes and costs about nothing when idle:

| Way | What runs where | Best for |
|---|---|---|
| [A. One line](#a-one-line) | this computer deploys to your AWS account | trying it quickly on macOS, Linux or WSL |
| [B. The `tdj` CLI](#b-the-tdj-cli) | the same, step by step, inside a checkout | changing the code, several stages |
| [C. One click on GitHub](#c-one-click-on-github) | your fork deploys itself with GitHub Actions | a club or a DJ who wants updates by pressing "Sync fork" |
| [D. Your own computer](#d-your-own-computer) | `pnpm dev` on a laptop, nothing on AWS | development, a single DJ at home |
| The apps | iPhone, iPad and Mac apps work on their own | playing nights without any server |

Your deployment is yours: your own Spotify app (its own 5 listener seats in Development Mode), your own database and
settings. Everything except the AWS region and the deploy role is set **inside the app** afterwards, at `/admin`:
the owner passphrase, Spotify, Google, Dropbox and an AI key for everyone. Design notes:
[r22-council.md §5](specs/r22-council.md); the full deploy reference: [DEPLOY.md](DEPLOY.md).

## A. One line

```bash
curl -fsSL https://raw.githubusercontent.com/ArioMoniri/TDJ/claude/admiring-curie-npzd0m/scripts/install.sh | bash
```

The script ([scripts/install.sh](../scripts/install.sh), short enough to read first) prints its plan and asks
`[y/N]` before it does anything. Then it:

1. checks git, Node.js 22+ and pnpm or corepack (it installs nothing system-wide and **never runs sudo**; if
   something is missing it says what to install);
2. uses the TDJ checkout you are in, or clones TDJ into `./TDJ`;
3. installs the dependencies with pnpm through corepack;
4. runs `tdj init` and `tdj deploy` (below).

Options go after `bash -s --`:

```bash
curl -fsSL …/install.sh | bash -s -- --yes              # no y/N question (tdj still asks what it needs)
curl -fsSL …/install.sh | bash -s -- --github           # set up and deploy through your GitHub fork (way C)
curl -fsSL …/install.sh | bash -s -- --dir ~/TDJ --dry-run   # show every command, run nothing
```

**Windows**: use WSL. In PowerShell, `wsl --install` (once, then restart), open *Ubuntu* from the Start menu, and run
the line there. Native PowerShell is not supported: the deploy tools (SST, the AWS CLI scripts) expect a Unix shell.

## B. The `tdj` CLI

From a checkout (`git clone https://github.com/ArioMoniri/TDJ.git && cd TDJ && pnpm install`):

```bash
pnpm tdj doctor     # what is installed and signed in, and the fix for each gap
pnpm tdj init       # stage, region, optional Spotify app; saves the settings
pnpm tdj deploy     # checks, pnpm install, build, sst deploy; prints the URL and the setup code
pnpm tdj status     # the URL, the version it answers with, whether /admin still waits for you
pnpm tdj guide      # this page, short, in the terminal
pnpm tdj --help
```

`pnpm tdj` with no command runs `init` and then `deploy`. The same CLI runs as `node packages/cli/bin/tdj.mjs`.

**What `tdj init` asks** (Enter keeps the default):

1. **Checks**: Node 22+, git, pnpm, the AWS CLI and AWS credentials (`aws configure sso`). Anything missing stops
   here with the fix, before a single question.
2. **Stage**: `production` by default; `dev` for a second copy to try changes.
3. **Region**: `us-east-1` by default (or `$AWS_REGION`).
4. **Spotify (optional)**: the Client ID, and the Client secret typed hidden. Enter skips both: you can paste them
   later at `/admin`.

**Where it saves things**:

| What | Where |
|---|---|
| stage, region, route, Spotify Client ID (public) | `.env.local` at the checkout root (git-ignored, mode 0600, never a secret) |
| Spotify Client ID + secret | AWS Systems Manager Parameter Store, `/tdj/<stage>/SPOTIFY_CLIENT_*`, SecureString: the same encrypted store `/admin` writes and the app reads at runtime |

Secrets are never printed, never passed as command-line arguments (`ps` would show them) and never written to
`.env.local`. Instead of SST's own `sst secret set`, T-DJ keeps every runtime setting in Parameter Store, so the app
can change them later from `/admin` without a redeploy.

**What `tdj deploy` does**: the checks again, `pnpm install --frozen-lockfile`, a build of the workspace packages
the web app uses, `sst deploy --stage <stage>` (CloudFront, Lambda, S3, DynamoDB; OpenNext builds the web app),
and then a one-time **setup code** for `/admin`. It prints the code and where it is kept:
*Parameter Store → `/tdj/<stage>/SETUP_CODE`*, valid 24 hours, deleted once you choose a passphrase. Running
`tdj deploy` again prints the same code while it is valid.

Every flag: `--stage`, `--region`, `--dir`, `--yes`, `--dry-run` (print every command, run nothing), `--no-color`
(or `NO_COLOR=1`). Secrets are never flags: `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` in the environment are
read if set.

## C. One click on GitHub

Nothing runs on your computer after the setup, and updates are one button. Your fork deploys itself with the
[Deploy to AWS](../.github/workflows/deploy-aws.yml) workflow, which signs in to AWS with OIDC (no stored AWS keys).

1. **[Fork T-DJ](https://github.com/ArioMoniri/TDJ/fork)** (or "Use this template"), then open your fork's
   **Actions** tab and enable workflows.
2. **The one trust step**: an IAM role in your AWS account that only your fork may use.
   - *With the CLI* (GitHub CLI signed in with `gh auth login`): `pnpm tdj init --github`. It forks if needed,
     creates the role with CloudFormation from [infra/github-oidc-role.yaml](../infra/github-oidc-role.yaml)
     (it checks whether the account already has GitHub's OIDC provider), and stores `AWS_DEPLOY_ROLE_ARN` and
     `AWS_REGION` on the fork with `gh`. Without AWS credentials on the computer it opens the CloudFormation page
     and asks you to paste the role ARN.
   - *By hand*: AWS console → CloudFormation → Create stack → upload `infra/github-oidc-role.yaml` → stack name
     `tdj-github-oidc`, `GitHubOrg` = your user, `GitHubRepo` = your fork's name, `CreateProvider` = `true`
     (`false` if the account already has GitHub's OIDC provider) → tick the IAM box → Create. Copy the **RoleArn**
     output. Then on the fork: Settings → Secrets and variables → Actions → add `AWS_DEPLOY_ROLE_ARN` (a variable or
     a secret; the workflow reads either) and, optionally, the variable `AWS_REGION`.
3. **Deploy**: your fork → Actions → **Deploy to AWS** → Run workflow (or `pnpm tdj deploy --github`). The first
   run takes 10–15 minutes. The run summary shows your app URL and the setup code under *Owner setup*.

Optional Spotify keys for the fork: `tdj init --github` stores them as the GitHub secrets `SPOTIFY_CLIENT_ID` and
`SPOTIFY_CLIENT_SECRET` (through stdin); or paste them later at `/admin`.

## D. Your own computer

```bash
git clone https://github.com/ArioMoniri/TDJ.git && cd TDJ
pnpm install
pnpm dev            # http://127.0.0.1:3000
```

Without AWS the settings live in memory (`/admin` works, but forgets on restart). Connector keys for a local run:
[DEPLOY.md → Local run](DEPLOY.md).

## Then, in the app

1. Open `<your url>/admin`, paste the one-time setup code, choose an owner passphrase.
2. Add the services you want (Spotify, Google, Dropbox, an AI key for everyone), next to the redirect addresses
   `/admin` shows. For Spotify, add `<url>/api/spotify/callback`, `<url>/callback` and `tdj://spotify-callback` as
   redirect URIs in the Spotify dashboard, and each DJ under *User Management* (5 seats in Development Mode).
3. Optional: in the T-DJ app for Mac or iPad, Settings → Connections → Link a TDJ server → your URL.

## Nothing of the author's comes with it

A copy of T-DJ starts empty and only ever uses what you give it:

- **No keys in the code.** The repository holds no API key, client secret, certificate or AWS account; every
  connector key is entered by you at `/admin` (or as your fork's own GitHub secrets). `pnpm security:check` (run in CI)
  fails if a key, a `.env` file or the author's identifiers ever land on the deploy path.
- **Your own owner.** A fresh deployment has no passphrase: `/admin` opens only with the one-time setup code your
  own deploy wrote to *your* Parameter Store, and then with the passphrase you choose. No e-mail or account of the
  author is trusted.
- **Your own AWS and GitHub.** The deploy role trusts only the repository you name (`GitHubOrg` has no default);
  `tdj` refuses to use the upstream repository as "your fork". The Deploy, Release, Apple setup and Store workflows
  stop with an error in a fork that has not set its own role and keys, and never fall back to the author's account.
- **Owner contributions** land in your own table and are merged into your own repository, committed as your
  repository's owner.

## What it costs

A small club's T-DJ fits in AWS's free tiers; expect **about $0–1 a month** idle and a few dollars at most when busy.

| Service | Used for | Free tier (as of 2026; check AWS's pricing pages) |
|---|---|---|
| CloudFront | the web app's CDN | 1 TB out and 10 million requests a month, always free |
| Lambda | the server functions (arm64) | 1 million requests and 400,000 GB-seconds a month, always free |
| S3 | static files and SST's state | 5 GB for the first 12 months, then a few cents a month |
| DynamoDB | rooms, short links, synced rows | 25 GB storage always free; on-demand requests cost fractions of a cent |
| Parameter Store | settings and secrets | standard parameters and the default `aws/ssm` key are free |
| CloudWatch Logs | function logs | 5 GB a month free |

A custom domain (`TDJ_DOMAIN`) adds Route 53 costs (about $0.50 a month per hosted zone plus the domain). Set an
AWS Budget alert of $5 if you want to be sure.

## How to update

- **CLI / one line**: `cd TDJ && git pull && pnpm tdj deploy`.
- **GitHub fork**: press **Sync fork** on your fork's page, then Actions → Deploy to AWS → Run workflow. (A push to
  a branch named `main` on the fork deploys by itself too.)
- `pnpm tdj status` shows the version your deployment answers with; Settings → About in the app shows it too.

## How to remove it

```bash
pnpm tdj destroy                 # asks you to type the stage name
pnpm tdj destroy --stage dev     # another stage
```

It runs `sst remove` for that stage (the `production` stage is protected in `sst.config.ts`; typing its name lifts
the protection for that one run). Production **keeps** its DynamoDB table and its `/tdj/production/*` settings on
purpose; `tdj destroy` prints the commands that delete them, and the one that deletes the `tdj-github-oidc` role
stack if you made one. It never deletes those by itself.

## Troubleshooting

Run `pnpm tdj doctor` first: it checks the computer and reads the last deploy log (`.sst/log`) for these.

| Symptom | Fix |
|---|---|
| `ExpiredToken`, "Token has expired" | `aws sso login`, then deploy again |
| "Unable to locate credentials" | `aws configure sso` (or `aws configure`) |
| The stage is locked after an interrupted deploy | `npx sst unlock --stage <stage>`, then deploy again |
| CloudFormation `AlreadyExists` for the OIDC provider | rerun the role stack with `CreateProvider=false` (`tdj init --github` checks this) |
| "Deploy to AWS" fails at *configure-aws-credentials* | the role trusts another repository: redeploy the stack with your `GitHubOrg`/`GitHubRepo` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `git pull` for a matching checkout |
| JavaScript heap out of memory | `NODE_OPTIONS=--max-old-space-size=4096 pnpm tdj deploy` |
| First deploy seems stuck | CloudFront takes 10–15 minutes the first time |
| Setup code expired (24 h) | `pnpm tdj deploy` (or run the workflow) again: a new code is issued while no passphrase exists |
| Lost the owner passphrase | delete `/tdj/<stage>/OWNER_PASSPHRASE_HASH` in Parameter Store, deploy again for a new code |

Still stuck: [SUPPORT.md](../SUPPORT.md). Found a security problem: [SECURITY.md](../SECURITY.md).

## Licence

T-DJ is free for personal, educational and non-profit use ([PolyForm Noncommercial 1.0.0](../LICENSE)). Running it
for a business, selling it, or offering a service built on it needs written permission from the author: open an
issue titled "Commercial use".
