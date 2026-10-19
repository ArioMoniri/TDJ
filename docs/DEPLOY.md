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

Settings → Connectors shows one row per service with a single button. What each row does depends on which secrets the deployment has. All of them are GitHub Actions **secrets** (`Settings → Secrets and variables → Actions → Secrets`), forwarded by `.github/workflows/deploy-aws.yml` into `sst.config.ts`, which passes them to the Next.js Lambda only when set. None reaches the client bundle; user tokens live in a sealed httpOnly cookie (`tdj_sp`, `tdj_gg`, `tdj_db`), never in DynamoDB. Every provider is a **direct OAuth** login with the deployment's own app (`apps/web/src/lib/server/oauth.ts`): no broker, no per-user fee.

| Secret | Effect |
|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | **"Log in with Spotify"** (hosted authorization-code flow at `/api/spotify/login`). Absent → the Settings sheet falls back to the BYO Client ID + PKCE flow (`/callback`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **"Connect with Google"**: Drive uploads into a `TDJ` folder (`/api/google/drive`, scope `drive.file`) and YouTube playlists (`/api/google/youtube`, scope `youtube`). Scopes are asked one feature at a time (`/api/google/login?scope=drive|youtube`, `include_granted_scopes=true`). Absent → the Google row reads "Not enabled on this deployment". |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | **"Connect Dropbox"** (PKCE + `token_access_type=offline` at `/api/dropbox/login`): export files land in `/Apps/TDJ/<set name>/` with a shared link (`/api/dropbox/upload`). Absent → the Dropbox row reads "Not enabled on this deployment". |
| `TDJ_COOKIE_SECRET` | Key for the sealed session cookies (AES-256-GCM). Any long random string (`openssl rand -base64 32`). Absent → derived from `SPOTIFY_CLIENT_SECRET`; rotating either logs everyone out of every provider. |
| `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET` | Optional **Pipedream Connect** alternative (Settings → Advanced) for YouTube, Dropbox, Google Drive and Spotify: `/api/connect/token` mints a Connect Link, `/api/connect/export` sends files/playlists through the Pipedream proxy. Paid beyond 100 users; the direct logins above are the free path. |
| `PIPEDREAM_ENVIRONMENT` (variable) | `development` (default; the free plan, no production end users) or `production`. |
| `NEXT_PUBLIC_APP_URL` (variable) | Public origin used for redirect URIs (e.g. `https://d3k5k2c1l0s5ri.cloudfront.net`). Absent → derived from the request's `Host`/`X-Forwarded-Proto`. |

### Redirect URIs (one list, every provider)

| Provider | Production | Local `pnpm dev` |
|---|---|---|
| Spotify (hosted) | `https://d3k5k2c1l0s5ri.cloudfront.net/api/spotify/callback` | `http://127.0.0.1:3000/api/spotify/callback` |
| Spotify (BYO PKCE, keep) | `https://d3k5k2c1l0s5ri.cloudfront.net/callback` | `http://127.0.0.1:3000/callback` |
| Google | `https://d3k5k2c1l0s5ri.cloudfront.net/api/google/callback` | `http://127.0.0.1:3000/api/google/callback` |
| Dropbox | `https://d3k5k2c1l0s5ri.cloudfront.net/api/dropbox/callback` | `http://127.0.0.1:3000/api/dropbox/callback` |

Add a custom domain (`TDJ_DOMAIN`) → add the same four paths under `https://<domain>/` too. Spotify rejects `localhost`; use `127.0.0.1` everywhere so the three consoles agree.

### Spotify dashboard (developer.spotify.com → your app → Settings → Redirect URIs)
Add the two Spotify rows above, exactly.

**Development Mode limit.** Since February 2026 a Spotify app in Development Mode serves **5 users** and its owner must hold Premium. Add yourself and up to 4 DJs by e-mail under *User Management* in the dashboard, or request **Extended Quota** (organisations only). The Settings copy says this honestly; a sixth user sees Spotify's own "not registered" error on login. Refresh tokens expire after six months, so the sealed cookie is capped at 180 days and the user simply logs in again.

### Google Cloud console (console.cloud.google.com)
1. Create a project (or reuse one) → **APIs & Services → Library**: enable **Google Drive API** and **YouTube Data API v3**.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience): user type **External**, app name "TDJ", support e-mail, your domain. While the app is **unverified / in Testing**, add every DJ as a **test user** (Audience → Test users, up to 100); their refresh tokens then expire after 7 days, so they reconnect weekly until you publish. Publishing with the `drive.file` (non-sensitive) and `youtube` (sensitive) scopes needs Google's brand + sensitive-scope verification (a few days to two weeks); `drive.file` is used on purpose so the restricted-scope review is never triggered.
3. **Credentials → Create credentials → OAuth client ID → Web application**: authorised redirect URIs = the two Google rows above. Copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.
4. Quota: the YouTube Data API gives 10,000 units/day and **100 `search.list` calls/day per project**, shared by every TDJ user. The export says which tracks were left out (`skipped`) when the budget runs out; ask for a quota extension in the console (YouTube Data API → Quotas) once DJs hit it.

### Dropbox App Console (dropbox.com/developers/apps)
1. **Create app** → API: *Scoped access* → access type: **App folder** (the folder is named after the app: call it `TDJ`, files then land in `/Apps/TDJ/`) → name "TDJ".
2. **Permissions** tab: tick `files.content.write` and `sharing.write` (plus the default `account_info.read`) → Submit.
3. **Settings** tab: OAuth 2 → Redirect URIs: add the two Dropbox rows above. Copy **App key** → `DROPBOX_APP_KEY`, **App secret** → `DROPBOX_APP_SECRET`.
4. Development status serves up to 500 linked users; at 50 Dropbox asks you to apply for Production (a form, usually days).

### Pipedream (optional, pipedream.com → Projects → your project → Connect)
1. Create a project, note its **Project ID**; under *OAuth clients* create a client and note **Client ID / Secret**.
2. Allowed origins: add the production origin (and `http://127.0.0.1:3000` for local runs).
3. Plan: Pipedream's free plan allows development end users only; production users need a paid plan ($2 per connected user/month after the first 100, see docs/research/connectors.md §2). With the direct logins above in place it is only an alternative, shown under Settings → Advanced.

### Why no Pipedream / Nango by default
The research (docs/research/connectors.md, "Open-source / free alternatives checked 2026-10-19") found no free, open-source product that brokers these consumer-music OAuth connections: Activepieces' embedding SDK is enterprise-only, Composio only open-sources its SDK, Nango's core is Elastic License 2.0 and its free self-host (auth + proxy) still needs its own Postgres/Redis container, n8n is fair-code. None of them removes the need to register TDJ's own OAuth app at each provider, which is the only step that costs effort. So the free path is what TDJ ships: direct OAuth per provider with the deployment's own credentials, tokens sealed in httpOnly cookies, refreshed on use. Teams that want a hosted dashboard for the same connections can run Nango self-hosted (auth + proxy are free) in front of the same provider apps; Pipedream remains wired in as the paid, zero-infrastructure option.

### Local run
```bash
SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
DROPBOX_APP_KEY=… DROPBOX_APP_SECRET=… TDJ_COOKIE_SECRET=… pnpm dev   # then open http://127.0.0.1:3000 (not localhost)
```
