# Contributing to T-DJ

Thank you for helping. T-DJ is a tool for tango DJs, so the most useful contributions are often not code: a
recording with the wrong year or singer, a cortina that does not fit, a screen that is hard to use at 2 a.m. in a
dark booth. All of those are welcome as issues.

By contributing you agree that your contribution is licensed under the project's licence
([PolyForm Noncommercial 1.0.0](LICENSE)) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

| You want to… | Do this |
|---|---|
| Report a bug | [Bug report](https://github.com/ArioMoniri/TDJ/issues/new?template=bug_report.yml): what you did, what you expected, what happened, the version from Settings → About |
| Fix a wrong year, singer or orchestra | [Musical data correction](https://github.com/ArioMoniri/TDJ/issues/new?template=musical_data_correction.yml), with a source (a label scan, tango.info, a discography) |
| Suggest a feature | [Feature request](https://github.com/ArioMoniri/TDJ/issues/new?template=feature_request.yml): the night or the moment it is for, before the solution |
| Ask a question | [SUPPORT.md](SUPPORT.md) (Discussions or an issue) |
| Report a security problem | privately, through [SECURITY.md](SECURITY.md), never a public issue |
| Send code | read on |

Before a large change, open an issue first so we can agree on the shape; it saves you rewriting a pull request.

## Set up

Needs Node 22+, pnpm (`corepack enable`), git, and Python 3 for the index build.

```bash
git clone https://github.com/<you>/TDJ.git && cd TDJ
pnpm install
pnpm dev                       # the web app on http://127.0.0.1:3000
```

The repository is a pnpm + Turborepo monorepo: the engine is `packages/core` (pure TypeScript, vitest), the app is
`apps/web` (Next.js, Tailwind 4), the Mac and iPad shell is `apps/desktop` (Tauri), the launch video is
`apps/video` (Remotion), and the deploy CLI is `packages/cli` (`pnpm tdj --help`). The data index is committed under
`data/`; after changing anything in `data/sources`, rebuild it with `pnpm index:build`.

## Tests and checks

Run what CI runs before you open a pull request:

```bash
pnpm lint                                  # Biome (format + lint); `pnpm format` fixes formatting
pnpm typecheck
pnpm --filter @tdj/core test               # engine rules
pnpm --filter @tdj/web test -- --maxWorkers=2
pnpm --filter tdj-deploy test              # the CLI
pnpm quality                               # the benchmark of composed nights
pnpm readme:check                          # every image and link in the README exists
cd apps/web && pnpm e2e                    # Playwright end-to-end (Chromium)
```

## The rules that matter most

**Musical rules are test-first.** The rules live in `packages/core/src/{profiles,energy,arc,tanda,cortinas}.ts` and
`data/knowledge/*.json`. Every change to a rule starts with a vitest invariant that fails without it
([docs/TDD.md](docs/TDD.md)), and the default 4-hour golden set must still score **≥ 85** on the benchmark
([docs/BENCHMARK.md](docs/BENCHMARK.md), `pnpm quality`). A pull request that lowers the score needs a very good
reason written in it.

**Every word on screen in English and Turkish.** New strings go into `apps/web/src/lib/i18n/en.ts` first, then
`tr.ts`; the dictionary test fails until both exist, keep the same `{placeholders}`, and the Turkish is a real
translation (tango terms and names may stay). Use the terms in [docs/i18n-glossary.md](docs/i18n-glossary.md). Song
titles, orchestras and singers are never translated.

**Design.** Glass (translucent material) only on the control layer: the header, the tab bar and sheets. Content sits
on `surface`. Touch targets are at least 44 px. Plain words: no hype, no exclamation marks. Respect reduced motion.

**Privacy.** API keys are bring-your-own and never stored on a server. Nothing personal goes into logs, tests or
commits; never commit a secret (CI checks).

**Media.** The README's images and clips are real captures: after a visible UI change, regenerate them with
`pnpm media` rather than editing them by hand.

## Branches, commits and pull requests

- Branch from the default branch: `fix/<what>`, `feat/<what>`, `data/<what>` or `docs/<what>`.
- One change per commit. The message is a plain sentence that says what changed and why, the area first when it
  helps: `Booth: the next tanda's first song preloads while the cortina plays`. No emoji, no "WIP".
- Keep a pull request small enough to review in one sitting. Fill in the template: what, why, how you tested it,
  and screenshots (light and dark) for UI changes.
- CI must be green. A maintainer may push small fixes to your branch before merging.

## Data corrections in a pull request

Edit the source under `data/sources` (never the generated index directly), run `pnpm index:build`, and say in the
pull request where the correct value comes from. One recording per line in the description makes review fast.
