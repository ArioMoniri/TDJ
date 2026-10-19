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
No server secrets are required: users bring their own Spotify Client ID and Anthropic key in **Settings**. Optional server defaults: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
