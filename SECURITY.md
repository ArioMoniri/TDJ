# Security policy

## Reporting a vulnerability

Please report security problems **privately**, through GitHub's private vulnerability reporting:

**[Report a vulnerability](https://github.com/ArioMoniri/TDJ/security/advisories/new)** (repository → Security →
Advisories → Report a vulnerability).

Do not open a public issue, discussion or pull request for a vulnerability, and do not include real secrets (API
keys, OAuth client secrets, setup codes) in the report: describe where they leak instead.

A useful report says what is affected (web app, Mac or iPad app, the `tdj` CLI, the deploy workflow or the AWS
template), the version (Settings → About), the steps to reproduce, and what an attacker could do with it.

## What to expect

- An acknowledgement within a week.
- A first assessment, and a fix or a mitigation plan, as soon as it is understood. T-DJ is maintained by one person,
  so serious problems come first and the rest in order.
- Credit in the advisory and the release notes if you want it.

Please give a reasonable time to fix the problem before you disclose it publicly.

## Scope

In scope: this repository's code (`apps/web`, `apps/desktop`, `packages/core`, `packages/cli`), the GitHub Actions
workflows, `infra/github-oidc-role.yaml` and `sst.config.ts`.

Out of scope: a self-hosted deployment's own configuration (its AWS account, its Spotify, Google or Dropbox apps),
third-party services, and denial of service by volume. If you are not sure, report it anyway.

## Supported versions

Only the latest release (the default branch, the newest DMG and the current App Store build) receives fixes.
Self-hosters update with `git pull && pnpm tdj deploy`, or "Sync fork" on GitHub (docs/SELF_DEPLOY.md).
