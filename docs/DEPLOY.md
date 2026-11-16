# Deploy

The author's own deployment is private (stack `tdj-production`, us-east-1). Everyone else deploys their own: see docs/SELF_DEPLOY.md.

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

## Server database (DynamoDB)
`sst.config.ts` creates one DynamoDB table, `Db` (on-demand, key `pk` as a string, items expire on `ttl`), links it to the Next.js function and passes its name as `TDJ_DB_TABLE`. It holds:
- **Rooms** (`room#<code>`, forgotten 90 days after the last change), written with an optimistic revision check so two DJs editing at once never overwrite each other;
- **short night links** (`night#<id>`, 30 days);
- each DJ's synced database rows, keyed by the signed anonymous `tdj_uid` cookie.

- the **owner's contributions** (`owner#contrib#<id>` and `owner#contrib#index`, below), written only by the owner session.

Nothing to set by hand: the first deploy after `999810a` creates the table, and the deploy role's `PowerUserAccess` already covers DynamoDB. Without `TDJ_DB_TABLE` (`pnpm dev`, `pnpm start`, a container) rooms and short links live in the server's memory and are lost on restart; on Lambda without a table, rooms are switched off (set `TDJ_ROOMS_MEMORY=1` only for a single-instance test). The production stage is protected and retains its resources, so the table outlives an `sst remove`; on any other stage removing it deletes the table and every room in it.

## Owner contributions (the owner's edits reach the repo data)

Every DJ's changes (Database corrections, filled values, added songs, artwork, matches, learning, favourites, history)
stay **per user**: in the browser (IndexedDB / localStorage) or the app's on-device database, or — with the server
database on — in that DJ's own row (`user#<signed tdj_uid>`), which no other DJ can read. Nothing a DJ does ever
changes the shared catalogue.

The deployment **owner** (whoever unlocked `/admin`, `lib/server/admin.ts`) is the exception: while the owner session
is open on a device, that device also sends the owner's **catalogue facts** to the server as contributions, and a
workflow merges them into the repo, so the owner's own deployment and apps ship them.

```
Settings → Owner (owner devices only)            POST /api/owner/contributions (owner cookie, same origin,
  catalogue edits, a few s after each change  ─▶   ≤ 256 KB, ≤ 400 items, whitelisted fields, no secrets,
  "Send my existing changes" (preview first)       rate-limited) ─▶ DynamoDB owner#contrib#<id> (pending)
  "Export my changes as a contribution file"
            │                                     Actions → "Merge owner contributions" (every 6 h + manual)
            ▼                                       pull pending → pnpm data:apply-contributions
  pnpm data:apply-contributions <file>  ─────────▶   → data/sources/owner-overrides.json (keyed, provenance)
  (by hand, offline)                                 → pnpm index:build → data/index/owner.json
                                                     → data tests + pnpm quality (golden ≥ 85)
                                                     → merge commit as ArioMoniri to the deploy branch
                                                     → mark merged → (optional) Deploy to AWS
```

- **What travels** (always, while the switch "Contribute my catalogue changes" is on): song corrections (year, date,
  singer, rhythm, BPM, energy, album, hide…), added songs, cortinas, orchestra profile edits, filled values (BPM, key,
  level, artwork, release, Deezer and Spotify ids), Spotify and YouTube matches and covers. **Never**: the Guide, house
  rules, connector URLs, keys or tokens, notes or analysed audio. Values are rebuilt from a field whitelist
  (`packages/core/src/owner.ts`) on the device and again on the server and in the workflow.
- **Personal** categories — learning, favourites, history, orchestra grades — go only when the owner switches each on
  under Settings → Owner → "Share to the catalogue". They are archived in `owner-overrides.json → personal` and never
  change the catalogue.
- **Applied where**: `data/index/owner.json` is a `DATA_FILES` role (`packages/core/src/data.ts`), applied over the
  repo-level database and under each DJ's own edits, on the server and in the apps (the app bundle copies it). Owner
  covers join the shipped artwork (`/api/artwork`).
- **Apps**: linked to the owner's server (Settings → Connections), the Mac / iPhone / iPad apps send `/api/admin/*`
  and `/api/owner/*` to that server through the bridge's cookie jar; unlinked, contributing is off (use Export).

### One-time setup for the workflow
1. The workflow uses the deploy role (`AWS_DEPLOY_ROLE_ARN`, `infra/github-oidc-role.yaml`); its `PowerUserAccess`
   already covers `dynamodb:GetItem`, `BatchGetItem`, `UpdateItem` and `tag:GetResources`. A narrower role needs exactly
   those on the table.
2. Repository variable **`TDJ_DB_TABLE`** = the table name (the deploy run's summary prints `table` from
   `.sst/outputs.json`). Without it the workflow looks the table up by its `sst:app=tdj` / `sst:stage` tags.
3. Optional variables: `OWNER_CONTRIB_BRANCH` (default `claude/admiring-curie-npzd0m`), `OWNER_CONTRIB_DEPLOY=true`
   to deploy after every merge, `OWNER_CONTRIB_ENABLED=false` to pause it.
4. Scheduled runs only start from the **default branch**: keep `.github/workflows/merge-owner-contributions.yml` there
   too (the job itself checks out and pushes to the deploy branch). The push uses the run's `GITHUB_TOKEN`
   (`contents: write`); a branch protection that forbids it must allow GitHub Actions.

Commits are authored as `ArioMoniri <92126657+ArioMoniri@users.noreply.github.com>`, carry no trailers, and land as
a merge commit (never a force push). When a data test or the quality gate fails nothing is pushed or marked: the
contributions stay pending and the run summary says why. A contribution that fails validation is marked `rejected`
with the reason. Merged ones expire from the table after 30 days; pending ones after 180.

Offline or without AWS: Settings → Owner → **Export my changes as a contribution file**, then
`pnpm data:apply-contributions ~/Downloads/tdj-owner-contribution-<date>.json` and commit `data/` (running it twice
changes nothing).

## Connectors

### Owner setup (no GitHub secrets needed)

The plain-language version of everything below, for a non-technical organiser, is [docs/OWNER_GUIDE.md](OWNER_GUIDE.md). `/admin` also holds **People** (organiser contact, the seat lists per provider; stored as `OWNER_CONTACT`, `SPOTIFY_SEATS`, `GOOGLE_SEATS`, `DROPBOX_SEATS`; `GET /api/admin/public` exposes only the counts and the contact) and **AI reviews for everyone** (`AI_PROVIDER`, `AI_KEY`, `AI_MODEL`, `AI_WORKSPACE_ID`, `AI_DAILY_LIMIT`: the shared model key used by `/api/ai/review` and `/api/ai/refine` for DJs without a key of their own, counted per `tdj_uid` cookie and per day in the memory of each Lambda instance, so the limit is a courtesy cap rather than an exact quota). A Spotify login by a DJ who is not in the app's User Management list lands on `/settings?error=spotify_not_listed`, where Settings explains the 5 seats and offers Export → Send to → "Spotify via a transfer service" (a title/artist/album CSV for TuneMyMusic or Soundiiz).

The deployed app configures its own connectors; nothing to add in GitHub or the AWS console after the first deploy.

1. **Deploy** (Actions → Deploy to AWS → Run workflow, or merge to `main`).
2. Open the run → **Summary**: the "Owner setup" box holds a one-time **setup code** (32 hex characters; valid 24 h). It is masked in the logs, but anyone who can open the run summary can read it until step 4, so do the next steps right away.
3. Open **`<app url>/admin`**, paste the code → **Unlock**.
4. Choose an **owner passphrase** (≥ 8 characters). It is stored as a scrypt hash and the setup code is deleted the same moment; from now on `/admin` opens with the passphrase (12 h session in that browser).
5. For each service, the page shows the **exact redirect URIs** to paste into the provider console (Copy button), the fields for the **Client ID + Client secret** (Spotify, Google) or **App key + App secret** (Dropbox), **Save**, and **Test**, which proves the saved pair against the provider (Spotify: a client-credentials token; Google and Dropbox: the token endpoint must answer `invalid_grant`, not `invalid_client`). The page only ever shows "Configured · …last 4 of the ID"; secrets never come back to a browser.

Where it lives: AWS Systems Manager **Parameter Store**, SecureStrings under `/tdj/<stage>/<KEY>` (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, optional `NEXT_PUBLIC_APP_URL`, plus `OWNER_PASSPHRASE_HASH`, `SETUP_CODE` while it exists, and `TDJ_COOKIE_SECRET`, generated on first use so sealed cookies survive redeploys without any manual secret). `apps/web/src/lib/server/config.ts` resolves every key as environment first, then the store (cached 60 s per Lambda instance), so a GitHub secret still wins and shows as "set by the deployment's environment" on `/admin`. Settings → Connectors shows an **Owner setup** row that leads to `/admin` while no service is configured.

Forgot the passphrase: delete `/tdj/<stage>/OWNER_PASSPHRASE_HASH` in Parameter Store and run the workflow again; it issues a new setup code (it does not while a passphrase exists). Local run: `TDJ_CONFIG_BACKEND=memory TDJ_CONFIG_SEED='{"SETUP_CODE":"anything"}' pnpm dev`, then `http://127.0.0.1:3000/admin` (values live in the process only).

**One-time IAM change.** The deploy role now carries an explicit `tdj-owner-setup` policy (`ssm:PutParameter`/`GetParameter` on `arn:aws:ssm:*:*:parameter/tdj/*`, KMS via SSM) in `infra/github-oidc-role.yaml`. Re-deploy the stack once so the role matches the file:
```bash
aws cloudformation deploy --stack-name tdj-github-oidc --template-file infra/github-oidc-role.yaml \
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides GitHubOrg=ArioMoniri GitHubRepo=TDJ
```
(The role's `PowerUserAccess` already allows SSM, so a deploy made before this command still works; the explicit statement keeps the dependency visible when the managed policy is narrowed later.) The Next.js function gets `ssm:GetParameter`, `ssm:GetParametersByPath`, `ssm:PutParameter`, `ssm:DeleteParameter` on `/tdj/*` and `kms:Encrypt`/`kms:Decrypt` from `sst.config.ts`, and `TDJ_STAGE` / `TDJ_CONFIG_BACKEND=ssm` in its environment.

### GitHub secrets (alternative)

Settings → Connectors shows one row per service with a single button. What each row does depends on which secrets the deployment has. Instead of (or in addition to) the owner setup above, all of them can be GitHub Actions **secrets** (`Settings → Secrets and variables → Actions → Secrets`), forwarded by `.github/workflows/deploy-aws.yml` into `sst.config.ts`, which passes them to the Next.js Lambda only when set. None reaches the client bundle; user tokens live in a sealed httpOnly cookie (`tdj_sp`, `tdj_gg`, `tdj_db`), never in DynamoDB. Every provider is a **direct OAuth** login with the deployment's own app (`apps/web/src/lib/server/oauth.ts`): no broker, no per-user fee.

| Secret | Effect |
|---|---|
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | **"Log in with Spotify"** (hosted authorization-code flow at `/api/spotify/login`). Absent → the Settings sheet falls back to the BYO Client ID + PKCE flow (`/callback`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **"Connect with Google"**: Drive uploads into a `TDJ` folder (`/api/google/drive`, scope `drive.file`) and YouTube playlists (`/api/google/youtube`, scope `youtube`). Scopes are asked one feature at a time (`/api/google/login?scope=drive|youtube`, `include_granted_scopes=true`). Absent → the Google row reads "Not enabled on this deployment". |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | **"Connect Dropbox"** (PKCE + `token_access_type=offline` at `/api/dropbox/login`): export files land in `/Apps/TDJ/<set name>/` with a shared link (`/api/dropbox/upload`). Absent → the Dropbox row reads "Not enabled on this deployment". |
| `TDJ_COOKIE_SECRET` | Key for the sealed session cookies (AES-256-GCM). Any long random string (`openssl rand -base64 32`). Absent → one is generated on first use and kept in Parameter Store (`/tdj/<stage>/TDJ_COOKIE_SECRET`); rotating it logs everyone out of every provider. While Parameter Store cannot be read on a cold start the function keeps the last secret it read; an instance that never read one answers `/me` with `storeUnavailable: true` and keeps the cookies instead of clearing them (it never invents a key). |
| `TDJ_SECRET` | HMAC key for the anonymous `tdj_uid` cookie (the shared model key's per-DJ counter, and the server database rows once `TDJ_DB_TABLE` is set). Absent → derived from the cookie secret above; there is no literal fallback in production. Rotating it gives every DJ a fresh id. |
| `ANTHROPIC_API_KEY` | Optional deployment-wide model key. It is a *shared* key exactly like the one saved on `/admin` (counted per DJ, per client address and per deployment, `AI_DAILY_LIMIT` / `AI_DAILY_TOTAL`); the `/admin` key wins when both exist. |
| `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET` | Optional **Pipedream Connect** alternative (Settings → Advanced) for YouTube, Dropbox, Google Drive and Spotify: `/api/connect/token` mints a Connect Link, `/api/connect/export` sends files/playlists through the Pipedream proxy. Paid beyond 100 users; the direct logins above are the free path. |
| `PIPEDREAM_ENVIRONMENT` (variable) | `development` (default; the free plan, no production end users) or `production`. |
| `NEXT_PUBLIC_APP_URL` (variable) | Public origin used for redirect URIs (e.g. `https://your-app`). Absent → the "Public URL" saved on `/admin`, else derived from the request's `Host`/`X-Forwarded-Proto`. |

### Redirect URIs (one list, every provider)

| Provider | Production | Local `pnpm dev` |
|---|---|---|
| Spotify (hosted) | `https://your-app/api/spotify/callback` | `http://127.0.0.1:3000/api/spotify/callback` |
| Spotify (BYO PKCE, keep) | `https://your-app/callback` | `http://127.0.0.1:3000/callback` |
| Google | `https://your-app/api/google/callback` | `http://127.0.0.1:3000/api/google/callback` |
| Dropbox | `https://your-app/api/dropbox/callback` | `http://127.0.0.1:3000/api/dropbox/callback` |

**The Mac and iPhone / iPad apps** add exactly one redirect URI, at Spotify only: `tdj://spotify-callback` (PKCE from
the device with the app's Client ID, `TDJ_SPOTIFY_CLIENT_ID`; tick *iOS* and add the bundle ID `com.ariomoniri.tdj`).
Google and Dropbox sign in from the apps through a linked TDJ server in the system browser and come back to the
rows above; the server hands the session to the app through `tdj://auth/<provider>?ticket=…` (docs/RELEASING.md,
server follow-up 1). Nothing else is registered: no loopback port, no custom Google client.

Add a custom domain (`TDJ_DOMAIN`) → add the same four paths under `https://<domain>/` too. Spotify rejects `localhost`; use `127.0.0.1` everywhere so the three consoles agree.

### Spotify dashboard (developer.spotify.com → your app → Settings → Redirect URIs)
Add the two Spotify rows above, exactly.

**Development Mode limit.** Since February 2026 a Spotify app in Development Mode serves **5 users** and its owner must hold Premium. Add yourself and up to 4 DJs by e-mail under *User Management* in the dashboard, or request **Extended Quota** (organisations only). The Settings copy says this honestly; a sixth user sees Spotify's own "not registered" error on login. Refresh tokens expire after six months, so the sealed cookie is capped at 180 days and the user simply logs in again.

### Google Cloud console (console.cloud.google.com)
1. Create a project (or reuse one) → **APIs & Services → Library**: enable **Google Drive API** and **YouTube Data API v3**.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience): user type **External**, app name "TDJ", support e-mail, your domain. While the app is **unverified / in Testing**, add every DJ as a **test user** (Audience → Test users, up to 100); their refresh tokens then expire after 7 days, so they reconnect weekly until you publish. Publishing with the `drive.file` (non-sensitive) and `youtube` (sensitive) scopes needs Google's brand + sensitive-scope verification (a few days to two weeks); `drive.file` is used on purpose so the restricted-scope review is never triggered.
3. **Credentials → Create credentials → OAuth client ID → Web application**: authorised redirect URIs = the two Google rows above. Copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.
4. Quota: the YouTube Data API gives 10,000 units/day and **100 `search.list` calls/day per project**, shared by every TDJ user. The export says which tracks were left out (`skipped`) when the budget runs out; ask for a quota extension in the console (YouTube Data API → Quotas) once DJs hit it. The Export sheet sends the set in batches of 10 searches per request (`POST /api/google/youtube { queries, playlistId? }`), so a long set never hits the function's timeout, and stops at the first quota error.

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
Without AWS credentials the config store is the process memory (`TDJ_CONFIG_BACKEND` defaults to `memory` off Lambda), so `/admin` works locally too but forgets everything on restart. `TDJ_CONFIG_BACKEND=ssm TDJ_STAGE=production` with AWS credentials reads the deployed values.
