# Definition of Done

A change is done when:
- [ ] Unit tests for the engine pass (`pnpm --filter @tdj/core test`) and new rules have tests.
- [ ] `pnpm lint` and `pnpm typecheck` are clean.
- [ ] `pnpm --filter @tdj/web build` succeeds; e2e passes on desktop and iPhone emulation (no horizontal overflow, 44 px targets).
- [ ] A default 4 h golden set still scores ≥ 85 on the benchmark rubric.
- [ ] Screenshots/video regenerated if the UI changed (`pnpm media`) and README embeds updated.
- [ ] Index changes rebuilt with `pnpm index:build` and committed (`data/index`), Spotify cache committed if enriched.
- [ ] Docs updated (ROADMAP phase ticked, ENHANCEMENTS status).
- [ ] Deploy workflow green on `main` (or `workflow_dispatch`).
