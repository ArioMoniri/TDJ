# Architecture

```
data/                       ← the index lives in the repo
  sources/*.xls             original spreadsheets (21,932 recordings; orchestra × year quality heatmap)
  index/{songs,orchestras,singers,coverage,meta}.json   built by scripts/build_index.py
  knowledge/orchestra_profiles.json   musicology-curated energy/phase/singer-year priors (override built-ins)
  knowledge/cortinas.json             cortina extensions (cultures, trends)
  cache/spotify/tracks.json           Spotify URIs/durations cached by scripts/enrich_spotify.ts
packages/core               pure TypeScript engine (no I/O except load.ts)
  catalog.ts   filter/search + energy annotation      arc.ts      hours → slots (TTVTTM) → target energy curve
  tanda.ts     families → pick → shape inside tanda   cortinas.ts library + matcher (next-tanda energy − 8)
  compose.ts   orchestration + swap                   score.ts    benchmark rubric (C1–C14)
  export/      M3U8 · CSV · JSON · Rekordbox XML · Traktor NML · XSPF · Serato CSV · set list · Spotify plan
apps/web                    Next.js 16 (App Router, Turbopack) · Tailwind 4 · liquid-glass design tokens
  api/compose|swap|search|export|meta|ai/explain       server routes read the index once per Lambda/container
  lib/spotify.ts            PKCE in the browser, BYO Client ID, playlist creation with 2026 Dev-Mode endpoints
  settings                  per-user panel: Spotify Client ID, Anthropic key + model, region, appearance (localStorage only)
apps/video                  Remotion launch video (media/video/launch.mp4)
sst.config.ts               SST v4 → CloudFront + Lambda(arm64) + S3 via OpenNext;  Dockerfile for App Runner/ECS
.github/workflows           ci.yml (lint, typecheck, vitest, build, Playwright) · deploy-aws.yml (OIDC, one click)
```

## Request flow
1. Client posts `ComposeOptions` → `/api/compose`.
2. `planSlots` turns hours into N slots following the pattern; `arcTarget` assigns a target energy per slot (two-peak curve by default).
3. For each slot `buildTanda` picks a family (orchestra + singer + ≤4-year window) by weighted sampling: energy fit, phase affinity, tier, spread, `notBefore` (Pugliese never before 50 %).
4. Songs inside the tanda are ordered by `tandaShape` (`rise-settle`: slow → up → strongest → settle).
5. Cortinas are matched to the **next** tanda's energy, filtered by culture/genre/trend.
6. `La Cumparsita` closes from a different orchestra than the última tanda.
7. `scorePlaylist` grades the set; the UI shows the arc, cards, breakdown and export sheet.

## Determinism
Every set carries a `seed`; the same seed + options reproduce the same set (vitest-enforced).
