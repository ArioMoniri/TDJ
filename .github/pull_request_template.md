## What and why

<!-- One or two sentences: what changes for the DJ (or the developer), and why. Link the issue: "Fixes #123". -->

## How I tested it

<!-- The commands you ran and what you checked by hand. Delete what does not apply. -->

- [ ] `pnpm lint` and `pnpm typecheck`
- [ ] `pnpm --filter @tdj/core test` (engine) / `pnpm --filter @tdj/web test -- --maxWorkers=2` (app) / `pnpm --filter tdj-deploy test` (CLI)
- [ ] `cd apps/web && pnpm e2e` for flows that changed
- [ ] `pnpm readme:check` if the README or its media changed

## Checklist

- [ ] A musical rule changed: a vitest invariant came first, and the default 4 h golden set still scores ≥ 85 (`pnpm quality`)
- [ ] New or changed words on screen exist in both `en.ts` and `tr.ts` (docs/i18n-glossary.md)
- [ ] UI: glass only on the control layer, content on `surface`, touch targets ≥ 44 px; screenshots in light and dark below
- [ ] `data/sources` changed: `pnpm index:build` was run and the source of each correction is named
- [ ] No secret, API key, setup code or personal data in the diff, the tests or the screenshots
- [ ] I agree my contribution is licensed under the project's licence (PolyForm Noncommercial 1.0.0)

## Screenshots

<!-- UI changes: before and after, light and dark. -->
