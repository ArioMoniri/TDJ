# TDD workflow

1. **Write the invariant first** in `packages/core/test/*.test.ts` (vitest). Invariants are musical rules: one orchestra per tanda, ≤ 4-year spread, no title repeats, Pugliese after midpoint, duration within ± 6 min, deterministic seeds.
2. Run `pnpm --filter @tdj/core test:watch`; make it pass with the smallest engine change.
3. For UI: a Playwright spec in `apps/web/e2e` (desktop + iPhone 15 Pro project) that drives the real server (`pnpm e2e`).
4. Regenerate media when the UI changes: `pnpm media` (real screenshots + usage video).
5. CI (`.github/workflows/ci.yml`) runs lint → typecheck → vitest → build → e2e on every push.

Conventions: Biome for lint/format; no snapshot tests of generated sets (they are seeded, assert properties instead); every bug fix lands with a failing test first.
