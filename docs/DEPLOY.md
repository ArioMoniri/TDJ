# Deploy

Current production: https://d3k5k2c1l0s5ri.cloudfront.net (stack `tdj-production`, us-east-1, deployed by run #5 of "Deploy to AWS" on 2026-10-19).

Lessons from the first deploys: pass a full 40-character SHA to the `commit` input; do not pin a pnpm version in `pnpm/action-setup` when `packageManager` is set; GitHub OIDC `sub` claims now carry `org@id/repo@id`, so the trust policy lists both forms; do not override `buildCommand` in `sst.config.ts` or OpenNext will not run.

## A. One click from GitHub (recommended, no expiring keys)
1. **Once per AWS account** – create the OIDC role (CloudFormation):
   ```bash
   aws cloudformation deploy --stack-name tdj-github-oidc --template-file infra/github-oidc-role.yaml \
     --capabilities CAPABILITY_NAMED_IAM --parameter-overrides GitHubOrg=ArioMoniri GitHubRepo=TDJ
   aws cloudformation describe-stacks --stack-name tdj-github-oidc --query "Stacks[0].Outputs[0].OutputValue" --output text
   ```
   (or Console → CloudFormation → Create stack → upload `infra/github-oidc-role.yaml`).
2. In GitHub → Settings → Secrets and variables → Actions → **Variables**: `AWS_DEPLOY_ROLE_ARN` = the output above, `AWS_REGION` = `us-east-1` (optional `TDJ_DOMAIN`, `ANTHROPIC_MODEL`).
3. Actions → **Deploy to AWS** → Run workflow (or merge to `main`). The job prints the CloudFront URL.

Why OIDC: GitHub mints a short-lived token per run and AWS exchanges it for role credentials. Nothing to rotate, nothing expires in a repo variable.

## B. From a terminal or an agent session
```bash
pnpm install
pnpm deploy          # = sst deploy --stage production
```
Needs AWS credentials in the environment. For a Claude session, keep access durable with one of:
- **Best**: IAM Roles Anywhere or SSO are not usable from a headless session; use a dedicated **IAM user `tdj-deployer`** with the policy in `infra/agent-deploy-user-policy.json` and store `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION` as environment variables of the cloud environment (session title bar → environment → Edit). Long-lived keys do not expire; rotate quarterly.
- Temporary STS keys (what this session had) expire in hours; `AWS_CREDENTIAL_EXPIRATION` showed 2026-10-16 so the deploy from the session was impossible on 2026-10-18.

## C. Container (App Runner, ECS, Fly, Render)
```bash
docker build -t tdj . && docker run -p 3000:3000 tdj
```

## Runtime configuration
No server secrets are required to run: without them, users bring their own Spotify Client ID and Anthropic key in **Settings**. Optional server defaults: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`. The connector secrets below turn the BYO fields into one-tap logins.

## Connectors

Settings → Connectors shows one row per service with a single button. What each row does depends on which secrets the deployment has. All of them are GitHub Actions **secrets** (`Settings → Secrets and variables → Actions → Secrets`), forwarded by `.github/workflows/deploy-aws.yml` into `sst.config.ts`, which passes them to the Next.js Lambda only when set. None reaches the client bundle; user tokens live in a sealed httpOnly cookie, never in DynamoDB.

| Secret | Effect |
|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | **"Log in with Spotify"** (hosted authorization-code flow at `/api/spotify/login`). Absent → the Settings sheet falls back to the BYO Client ID + PKCE flow (`/callback`). |
| `TDJ_COOKIE_SECRET` | Key for the sealed Spotify session cookie (AES-256-GCM). Any long random string (`openssl rand -base64 32`). Absent → derived from `SPOTIFY_CLIENT_SECRET`; rotating either logs everyone out. |
| `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET` | **Pipedream Connect** for YouTube, Dropbox, Google Drive (and Spotify as an alternative): `/api/connect/token` mints a Connect Link, `/api/connect/export` sends files/playlists through the Pipedream proxy. Absent → those rows read "Not enabled on this deployment". |
| `PIPEDREAM_ENVIRONMENT` (variable) | `development` (default; the free plan, no production end users) or `production`. |
| `NEXT_PUBLIC_APP_URL` (variable) | Public origin used for redirect URIs (e.g. `https://d3k5k2c1l0s5ri.cloudfront.net`). Absent → derived from the request's `Host`/`X-Forwarded-Proto`. |

### Spotify dashboard (developer.spotify.com → your app → Settings → Redirect URIs)
Add **all** of these, exactly:

- `https://d3k5k2c1l0s5ri.cloudfront.net/api/spotify/callback` — hosted login, production
- `http://127.0.0.1:3000/api/spotify/callback` — hosted login, local `pnpm dev` (Spotify rejects `localhost`; use `127.0.0.1`)
- `https://d3k5k2c1l0s5ri.cloudfront.net/callback` and `http://127.0.0.1:3000/callback` — the existing BYO PKCE flow (keep them)

Add a custom domain (`TDJ_DOMAIN`) → add `https://<domain>/api/spotify/callback` and `https://<domain>/callback` too.

**Development Mode limit.** Since February 2026 a Spotify app in Development Mode serves **5 users** and its owner must hold Premium. Add yourself and up to 4 DJs by e-mail under *User Management* in the dashboard, or request **Extended Quota** (organisations only). The Settings copy says this honestly; a sixth user sees Spotify's own "not registered" error on login. Refresh tokens expire after six months, so the sealed cookie is capped at 180 days and the user simply logs in again.

### Pipedream (pipedream.com → Projects → your project → Connect)
1. Create a project, note its **Project ID**; under *OAuth clients* create a client and note **Client ID / Secret**.
2. Allowed origins: add the production origin (and `http://127.0.0.1:3000` for local runs).
3. Optional: bring your own Google OAuth client (so Drive asks for `drive.file` only) and your own YouTube quota; the managed clients work out of the box. YouTube's Data API is quota-bound (10,000 units/day, 100 searches/day per project), so YouTube playlists are best effort and the export sheet says which tracks were left out.
4. Plan: Pipedream's free plan allows development end users only; production users need a paid plan ($2 per connected user/month after the first 100, see docs/research/connectors.md §2).

### Local run
```bash
SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… TDJ_COOKIE_SECRET=… pnpm dev   # then open http://127.0.0.1:3000
```
