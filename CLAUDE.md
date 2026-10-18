# TDJ — working notes for agents

- Monorepo: pnpm + Turborepo. Engine `packages/core` (pure TS, vitest), app `apps/web` (Next 16, Tailwind 4), video `apps/video` (Remotion). Data index is committed under `data/`.
- Run: `pnpm dev` · test: `pnpm --filter @tdj/core test` · e2e: `cd apps/web && pnpm e2e` (Chromium at /opt/pw-browsers/chromium in cloud sessions; never `playwright install`).
- Rebuild the index after touching `data/sources`: `pnpm index:build`. Spotify cache: `pnpm index:enrich` (needs SPOTIFY_CLIENT_ID/SECRET).
- Musical rules live in `packages/core/src/{profiles,energy,arc,tanda,cortinas}.ts` and `data/knowledge/*.json`; every rule change needs a vitest invariant first (docs/TDD.md) and must keep a default 4 h golden set ≥ 85 on the benchmark.
- UI: glass only on the control layer (header, tab bar, sheets); content on `surface`. Touch targets ≥ 44 px. Keys are BYOK and never persisted server-side.
- Media in README are real captures: regenerate with `pnpm media` after UI changes; launch video with `pnpm video`.
- Deploy: GitHub Actions "Deploy to AWS" (OIDC) or `pnpm deploy` (SST). See docs/DEPLOY.md.
