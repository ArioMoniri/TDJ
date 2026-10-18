<p align="center">
  <img src="brand/logo-animated.svg" width="140" alt="TDJ"/>
</p>
<h1 align="center">TDJ — Tango DJ playlist composer</h1>
<p align="center">Tandas · cortinas · a night-long energy arc · export to Spotify, Rekordbox, Traktor, Serato, M3U8.<br/>
<a href="#one-click-deploy">Deploy in one click</a> · <a href="docs/ROADMAP.md">Roadmap</a> · <a href="docs/BENCHMARK.md">Benchmark</a> · <a href="docs/reviews">Expert reviews</a> · <a href="media/video/launch.mp4">Launch video</a></p>

<p align="center"><a href=".github/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/badge/CI-vitest%20%C2%B7%20playwright%20%C2%B7%20biome-7c3aed"></a> <img alt="Next 16" src="https://img.shields.io/badge/Next.js-16.4-black"> <img alt="SST" src="https://img.shields.io/badge/AWS-SST%20v4%20%2B%20OpenNext-f90"> <img alt="index" src="https://img.shields.io/badge/index-21%2C932%20recordings-e0557a"></p>

<p align="center"><img src="media/video/usage.gif" width="880" alt="TDJ usage: compose a 4-hour golden-age milonga, swap a tanda, export"/></p>

## What it does
- **Composes a milonga** for 1–8 h: TTVTTM cycles, 4-3-3 tandas, one orchestra · one singer · ≤ 4 years per tanda, no repeats, orchestras spaced.
- **Shapes the night**: warm-up → build → two peaks → cool-down → **La Cumparsita**. Inside each tanda: slow → up → strongest → settle (or *hammock*, *rising*, *flat*).
- **Matches cortinas** to the energy of the *next* tanda; choose cultures (Turkish, Greek, Persian, Balkan, Brazilian, K-pop, Afrobeats…), trend vs classic, length, or one cortina all night.
- **Any era**: Golden Age 1935–55 (default), Guardia Vieja, post-golden, nuevo, contemporary, or everything.
- **Index lives in the repo** (`data/`): 21,932 recordings from the source spreadsheets, orchestra × year quality heatmap, musicology profiles, Spotify cache — rebuilt with `pnpm index:build`, enriched with `pnpm index:enrich`.
- **Knows the canon**: a reference corpus of 31 published milonga sets (619 tandas), 218 canonical tandas, 1,078 floor-known recordings and 134 non-danceable titles drives openers, D'Arienzo-early, Pugliese-once-and-late, vals/milonga banks and the Cumparsita versions DJs actually close with ([docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md)).
- **Reads the room**: season, weather, room temperature, time of night, event type, crowd, region, holiday and mood shift the arc, shares and cortina pools, each factor graded by evidence ([docs/research/context-factors.md](docs/research/context-factors.md)).
- **Takes feedback**: "more energetic", "calmer start", "more vals", "fewer repeats" chips, or free text to the AI DJ (Anthropic, OpenAI, Gemini or OpenRouter, your own key), recomposing around the tandas you locked.
- **Your own database**: every deployed copy has a Database tab where songs, years, orchestra profiles, cortinas, rules and context factors can be edited and exported; overrides merge over the repo-hosted index that GitHub keeps updated.
- **Listen before you commit**: Spotify embeds per tanda and cortina (your Spotify connection), plus reference tanda playlists for a mood check.
- **Scores every set** honestly against a rubric distilled from reference sets (unknown BPM and transfer data score low on purpose); ≥ 85 = headline marathon DJ.
- **Exports**: Spotify (PKCE, your own Client ID), M3U8, CSV, JSON, Rekordbox XML, Traktor NML, XSPF, DJ CSV, printable set list; with or without cortinas; DJ-app connectors map exports to your music folders.
- **Per-user panel**: Spotify, AI provider + key + model, DJ-app connectors, region, appearance. Keys stay in the browser.
- **Apple-style liquid glass UI**, dark/light, phone-first with a glass tab bar.

<p align="center">
<img src="media/screenshots/01-home-dark.png" width="48%" alt="Home, dark"/> <img src="media/screenshots/02-result-arc.png" width="48%" alt="Energy arc and score"/><br/>
<img src="media/screenshots/03-tandas.png" width="48%" alt="Tanda cards with cortinas"/> <img src="media/screenshots/04-export.png" width="48%" alt="Export sheet"/><br/>
<img src="media/screenshots/08-mobile-home.png" width="23%" alt="Mobile home"/> <img src="media/screenshots/09-mobile-result.png" width="23%" alt="Mobile result"/> <img src="media/screenshots/10-mobile-tandas.png" width="23%" alt="Mobile tandas"/> <img src="media/screenshots/11-mobile-export.png" width="23%" alt="Mobile export"/>
</p>

## Quick start
```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm compose -- --hours=4 --eras=golden --cultures=turkish --seed=42   # CLI set list in the terminal
pnpm test                # engine invariants (vitest)   ·  pnpm e2e (Playwright, desktop + iPhone)
pnpm media               # real screenshots + usage video  ·  pnpm video (Remotion launch video)
```

## One-click deploy
| Target | How |
|---|---|
| **AWS (CloudFront + Lambda, SST v4/OpenNext)** | Actions → **Deploy to AWS** → *Run workflow*. One-time: create the OIDC role with `infra/github-oidc-role.yaml` and set the repo variable `AWS_DEPLOY_ROLE_ARN` — see [docs/DEPLOY.md](docs/DEPLOY.md). No long-lived keys. |
| AWS from a terminal | `pnpm deploy` (needs AWS credentials in the environment) |
| Container (App Runner, ECS, Fly…) | `docker build -t tdj . && docker run -p 3000:3000 tdj` |
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ArioMoniri/TDJ&root-directory=apps/web) |

## How a set is built
`hours` → slots (TTVTTM) → target energy per slot (two-peak arc) → for each slot pick an orchestra family that fits energy, phase, tier and spacing (Pugliese never before 50 %) → order the 4 tracks → cortina tuned to the next tanda → La Cumparsita from another orchestra → score. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), musical rules: [docs/research/musicology.md](docs/research/musicology.md).

## Docs
[Goals](docs/GOALS.md) · [Agent guide & rules](docs/AGENT_GUIDE.md) · [Musicality model](docs/MUSICALITY.md) · [Reference corpus](docs/research/reference-corpus.md) · [Roadmap & phases](docs/ROADMAP.md) · [Benchmark rubric](docs/BENCHMARK.md) · [Enhancements from musician/DJ/UX/QA reviews](docs/ENHANCEMENTS.md) · [TDD](docs/TDD.md) · [Definition of Done](docs/DOD.md) · [Worktrees](docs/WORKTREES.md) · [Deploy](docs/DEPLOY.md) · [Research (2026 integrations)](docs/research/engineering-2026.md) · [Brand](brand/)

## Stack (October 2026)
Next.js 16.4 · React 19.3 · Tailwind 4.3 · motion 14 · dotLottie · Zustand · Vitest · Playwright 1.64 · Biome 2 · Turborepo · SST 4.17 + OpenNext 4 · Remotion 4 · Anthropic SDK (BYOK, Claude 5.5 models) · Spotify Web API (2026 Dev-Mode rules, PKCE).

Source data: *Listado Total de canciones* (2008) and *All orchestras* heatmap, both in `data/sources`. Built with Claude Code; expert passes by musician, DJ/dancer, UX and QA agents are in `docs/reviews`.
