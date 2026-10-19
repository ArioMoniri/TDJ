<p align="center">
  <img src="brand/logo-animated.svg" width="140" alt="TDJ"/>
</p>
<h1 align="center">TDJ — Tango DJ playlist composer</h1>
<p align="center">Tandas · cortinas · a night-long energy arc · export to Spotify, Rekordbox, Traktor, Serato, M3U8.<br/>
<a href="https://d3k5k2c1l0s5ri.cloudfront.net">Live demo</a> · <a href="#one-click-deploy">Deploy in one click</a> · <a href="docs/ROADMAP.md">Roadmap</a> · <a href="docs/BENCHMARK.md">Benchmark</a> · <a href="docs/reviews">Expert reviews</a> · <a href="media/video/launch.mp4">Launch video</a></p>

<p align="center"><a href=".github/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/badge/CI-vitest%20%C2%B7%20playwright%20%C2%B7%20biome-7c3aed"></a> <img alt="Next 16" src="https://img.shields.io/badge/Next.js-16.4-black"> <img alt="SST" src="https://img.shields.io/badge/AWS-SST%20v4%20%2B%20OpenNext-f90"> <img alt="index" src="https://img.shields.io/badge/index-21%2C932%20recordings-e0557a"></p>

<p align="center"><img src="media/video/usage.gif" width="880" alt="TDJ usage: compose a 4-hour golden-age milonga, swap a tanda, export"/></p>
<p align="center"><img src="media/video/motion.gif" width="880" alt="Motion: compose narrative, curve draw-on, tanda choreography, export sheet, mobile tab bar"/></p>

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
- **Listen before you commit**: a play button on every song (30 s previews resolved from Deezer for 1,134 reference recordings, full tracks when Spotify is connected) with a mini-player, plus reference tanda playlists for a mood check.
- **Hears the records**: a pure-TypeScript analyser (FFT, chroma, Krumhansl key, octave-folded tempo, loudness, brightness) measured key, BPM and loudness for 690 recordings and runs in your browser for any song with a preview; every tanda shows a cohesion badge (tempo · loudness · key · brightness · energy) built on the model in [docs/research/audio-features.md](docs/research/audio-features.md).
- **Finds and fixes metadata**: "Find on services…" looks a song up on Deezer and MusicBrainz, shows candidates with previews, and offers one-tap year/singer corrections into your database (recording dates only from MusicBrainz, never from reissues).
- **History**: every composed, refined or swapped set is kept (50 in the browser, the newest on the server when enabled) with a score trend, compare sheet, rename, reopen and re-export.
- **Editable guide**: the DJ guide and your house rules are yours to edit; house rules travel with every AI review and refine.
- **Scores every set** honestly against what a professional-DJ audit measures: first D'Arienzo early and instrumental, Pugliese once and late, a strong última, a Cumparsita from a year DJs actually close with, role-ordered tandas, energy steps, cortina fit, context compliance, obscurity share and analysed cohesion; unscored factors drop out of the denominator. ≥ 85 = headline marathon DJ (the default 4 h set scores 87–91 across 12 seeds).
- **Exports**: Spotify (PKCE, your own Client ID), M3U8, CSV, JSON, Rekordbox XML, Traktor NML, XSPF, DJ CSV, printable set list; with or without cortinas; DJ-app connectors map exports to your music folders.
- **One-click connections**: "Log in with Spotify", "Connect with Google" (Drive files, YouTube playlists) and "Connect Dropbox" use the app's own OAuth registration, so DJs never paste a Client ID; tokens live in sealed cookies, never in a database. No paid broker: [docs/research/connectors.md](docs/research/connectors.md) checks Pipedream, Nango, Activepieces and Composio and explains why direct OAuth is the free path. Per-user panel also holds the AI provider + key + model, DJ-app folders, region and appearance; keys stay in the browser.
- **Reach**: on the phone a glass primary bar above the tab bar carries Compose, then Regenerate · Export · more; on desktop Compose sits in the sticky toolbar with ⌘↩ / ⌘E / ⌘K. A performance budget ([docs/design/performance-budget.md](docs/design/performance-budget.md)) keeps a 4-hour set rendering without long tasks on a phone.
- **Night rules per event**: open with La Cumparsita, one or two closing Cumparsitas (Europe / Buenos Aires), birthday vals, show break with energy re-ramp, opener and última rules, Pugliese once, mixed milonga/vals tandas. Each era preset (Golden Age, Guardia Vieja, post-golden, nuevo, contemporary) applies its own structure defaults; pin any control to keep your value.
- **Agents with memory**: the assistant remembers your notes, every set, your feedback and the preferences it learned (per user, in your database tab), and composes and reviews with that memory.
- **Native Apple feel**: inset grouped forms, large titles, a Liquid Glass tab bar on phone and a sidebar on desktop, sheets with detents, context menus and swipe actions, SF-scale typography, light and dark; a motion system (compose narrative, curve draw-on, card choreography, haptic twins) that honours reduced motion.

<p align="center">
<img src="media/screenshots/01-home-dark.png" width="48%" alt="Home, dark"/> <img src="media/screenshots/02-result-arc.png" width="48%" alt="Energy arc and score"/><br/>
<img src="media/screenshots/03-tandas.png" width="48%" alt="Tanda cards with cortinas"/> <img src="media/screenshots/04-export.png" width="48%" alt="Export sheet"/><br/>
<img src="media/screenshots/14-tonight-context.png" width="48%" alt="Tonight: season, weather, room, event, crowd, mood"/> <img src="media/screenshots/13-listen.png" width="48%" alt="Listen: Spotify embeds per tanda"/><br/>
<img src="media/screenshots/12-database.png" width="48%" alt="Your database: songs, orchestras, cortinas, rules, context"/> <img src="media/screenshots/15-settings-ai.png" width="48%" alt="Settings: AI providers and DJ-app connectors"/><br/>
<img src="media/screenshots/17-rules.png" width="48%" alt="Night rules: Cumparsitas, birthday vals, show break, opener and última rules"/> <img src="media/screenshots/18-memory.png" width="48%" alt="Memory: notes, learned preferences, set and feedback history"/><br/>
<img src="media/screenshots/19-history.png" width="48%" alt="History: every set kept, score trend, compare and re-export"/> <img src="media/screenshots/03-tandas.png" width="48%" alt="Play buttons, key · BPM chips and cohesion badges"/><br/>
<img src="media/screenshots/08-mobile-home.png" width="19%" alt="Mobile home"/> <img src="media/screenshots/09-mobile-result.png" width="19%" alt="Mobile result"/> <img src="media/screenshots/10-mobile-tandas.png" width="19%" alt="Mobile tandas"/> <img src="media/screenshots/11-mobile-export.png" width="19%" alt="Mobile export"/> <img src="media/screenshots/19-mobile-settings.png" width="19%" alt="Mobile settings"/>
</p>

## Quick start
```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm compose -- --hours=4 --eras=golden --cultures=turkish --seed=42   # CLI set list in the terminal
pnpm test                # engine invariants (vitest)   ·  pnpm e2e (Playwright, desktop + iPhone)
pnpm media               # real screenshots + usage video  ·  pnpm video (Remotion launch video)
```

## Live
Production deployment on AWS (CloudFront + Lambda via SST, deployed by the GitHub OIDC workflow): **https://d3k5k2c1l0s5ri.cloudfront.net**

<p align="center"><img src="media/screenshots/00-live.png" width="72%" alt="Live site on CloudFront"/> <img src="media/screenshots/00-live-mobile.png" width="19%" alt="Live site on iPhone"/></p>

## One-click deploy
| Target | How |
|---|---|
| **AWS (CloudFront + Lambda, SST v4/OpenNext)** | Actions → **Deploy to AWS** → *Run workflow*. One-time: create the OIDC role with `infra/github-oidc-role.yaml` and set the repo variable `AWS_DEPLOY_ROLE_ARN` — see [docs/DEPLOY.md](docs/DEPLOY.md). No long-lived keys. |
| AWS from a terminal | `pnpm deploy` (needs AWS credentials in the environment) |
| Container (App Runner, ECS, Fly…) | `docker build -t tdj . && docker run -p 3000:3000 tdj` |
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ArioMoniri/TDJ&root-directory=apps/web) |

## How a set is built
`hours` → slots (TTVTTM) → target energy per slot (two-peak arc) → for each slot pick an orchestra family that fits energy, phase, tier, caps and spacing (first D'Arienzo early and instrumental, Pugliese once after 75 %, families from your last three nights step back) → order the tracks (corpus openers first, closers last, analysed tempo/key/loudness cohesion) → cortina from one or two families cycling without repeats, tuned to the next tanda → La Cumparsita from a corpus-attested version → score. Precedence: defaults → era preset → your database rules → what you set tonight → room context only for what you left untouched. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), musical rules: [docs/research/musicology.md](docs/research/musicology.md).

## Docs
[Goals](docs/GOALS.md) · [Agent guide & rules](docs/AGENT_GUIDE.md) · [Musicality model](docs/MUSICALITY.md) · [Reference corpus](docs/research/reference-corpus.md) · [Roadmap & phases](docs/ROADMAP.md) · [Benchmark rubric](docs/BENCHMARK.md) · [Enhancements from musician/DJ/UX/QA reviews](docs/ENHANCEMENTS.md) · [TDD](docs/TDD.md) · [Definition of Done](docs/DOD.md) · [Worktrees](docs/WORKTREES.md) · [Deploy](docs/DEPLOY.md) · [Owner guide (non-technical)](docs/OWNER_GUIDE.md) · [Design: motion system](docs/design/motion-system.md) · [Design: Apple-native pass](docs/design/apple-native-pass.md) · [Reviews round 4 (DJ audit, dancers, UX, wiring)](docs/reviews/) · [Research (2026 integrations)](docs/research/engineering-2026.md) · [Brand](brand/)

## Stack (October 2026)
Next.js 16.4 · React 19.3 · Tailwind 4.3 · motion 14 · dotLottie · Zustand · Vitest · Playwright 1.64 · Biome 2 · Turborepo · SST 4.17 + OpenNext 4 · Remotion 4 · Anthropic SDK (BYOK, Claude 5.5 models) · Spotify Web API (2026 Dev-Mode rules, PKCE).

Source data: *Listado Total de canciones* (2008) and *All orchestras* heatmap, both in `data/sources`. Built with Claude Code; expert passes by musician, DJ/dancer, UX and QA agents are in `docs/reviews`.
