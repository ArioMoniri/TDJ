# Self-deploy TDJ

Run your own TDJ server on your own AWS account: your own Spotify app (its own 5 listener seats), your own
database and settings. Design: [r22-council.md §5](specs/r22-council.md). Cost when idle: about $0–1 a month
(CloudFront, Lambda and S3 free tiers cover a small club).

Everything except the AWS region and the deploy role is set **inside the app** afterwards, at `/admin`:
owner passphrase, Spotify, Google, Dropbox, an AI key for everyone.

## The one-command way: `tdj-deploy`

```bash
npx tdj-deploy                 # published package
node packages/cli/bin/tdj.mjs  # the same, from a checkout of this repository (Node 22+)
```

It shows a bandoneon, checks what you have (`tdj-deploy doctor`), then asks at most three things:

1. **Route** — `github` (recommended: a fork of this repository deploys itself; nothing else runs on your
   computer, and "Sync fork" updates it) or `aws` (deploy from this computer with AWS credentials).
2. **AWS region** — default `us-east-1`.
3. **Spotify now?** — default *no*: you paste the Client ID and secret later at `/admin`, next to the exact
   redirect addresses it shows. If you say yes, the secret is typed hidden and goes only to GitHub (stdin)
   or to the deploy process (environment), never to a file or the command line.

At the end it prints your app URL, the one-time **setup code** for `/admin`, and the Spotify redirect URIs.

### Route `github` (fork)

What the CLI does for you, in order (each command is printed; `--dry-run` prints without running):

| Step | Command it runs |
|---|---|
| Fork `ArioMoniri/TDJ` to `<you>/TDJ`, turn Actions on | `gh repo fork …`, `gh api -X PUT repos/<you>/TDJ/actions/permissions` |
| The **one trust step**: an IAM role GitHub may assume for your fork (OIDC, no stored AWS keys) | with AWS credentials here: `aws cloudformation deploy --stack-name tdj-github-oidc --template-file infra/github-oidc-role.yaml …` (CreateProvider decided automatically); without: opens the CloudFormation console and asks you to paste the stack's **RoleArn** |
| Remember the role | `gh variable set AWS_DEPLOY_ROLE_ARN`, `gh variable set AWS_REGION` |
| Optional Spotify | `gh secret set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET` (stdin) |
| Deploy | `gh workflow run deploy-aws.yml -f stage=production`, then `gh run watch` |

Needs: the GitHub CLI logged in (`gh auth login`). AWS credentials are optional (without them you click
through one CloudFormation page).

### Route `aws` (this computer)

Needs Node 22, pnpm, git, the AWS CLI with credentials (`aws configure sso`). Inside a TDJ checkout (or it
clones one): `pnpm install`, `npx sst deploy --stage production`, then it writes the setup code to SSM
exactly like the workflow does.

### Flags (non-interactive use)

```bash
npx tdj-deploy --route github --region eu-central-1 --spotify-later --yes
npx tdj-deploy --route github --role-arn arn:aws:iam::123456789012:role/tdj-github-deploy --yes
SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… npx tdj-deploy --route aws --yes   # secrets only via env
npx tdj-deploy --help
```
`--no-color` or `NO_COLOR=1` for plain output.

## The manual way (same result)

1. Fork this repository → **Actions** tab → enable workflows.
2. AWS console → CloudFormation → Create stack → upload `infra/github-oidc-role.yaml` → stack name
   `tdj-github-oidc`, `GitHubOrg` = your user, `GitHubRepo` = `TDJ`, `CreateProvider` = `true` (or `false` if
   the account already has GitHub's OIDC provider) → acknowledge IAM → Create. Copy the **RoleArn** output.
3. Fork → Settings → Secrets and variables → Actions → Variables → `AWS_DEPLOY_ROLE_ARN` = the RoleArn
   (optional `AWS_REGION`).
4. Actions → **Deploy to AWS** → Run workflow. The run summary shows the URL and the setup code.
5. Open `<url>/admin`, paste the code, choose a passphrase, add your services.

## After deploying

- **Updates**: on your fork press **Sync fork** (GitHub) → the push to `main` redeploys.
- **Apps**: TDJ for Mac/iPad → TDJ menu → **Change Server** → your URL (or open
  `tdj://server?url=<your url>`). The app asks you to confirm the server once.
- **Spotify app**: add `<url>/api/spotify/callback`, `<url>/callback` and `tdj://spotify-callback` as redirect
  URIs; add each DJ under *User Management* (5 seats in Development Mode).
- **Remove**: `npx sst remove --stage production` in a checkout with AWS credentials (production tables are
  retained on purpose; delete them in the console if you want them gone), then delete the
  `tdj-github-oidc` stack.

## Troubleshooting

| Symptom | Fix |
|---|---|
| CloudFormation `AlreadyExists` for the OIDC provider | rerun with `CreateProvider=false` (the CLI checks this for you) |
| "Deploy to AWS" fails at *configure-aws-credentials* | the role's trust policy names another repository: redeploy the stack with your `GitHubOrg`/`GitHubRepo` |
| First deploy seems stuck | CloudFront takes 10–15 minutes the first time |
| Setup code expired (24 h) | run "Deploy to AWS" again: a new code is issued while no passphrase exists |
