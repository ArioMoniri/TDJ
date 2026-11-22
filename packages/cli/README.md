# tdj (tdj-deploy)

Your own [T-DJ](https://github.com/ArioMoniri/TDJ) (tango DJ composer) on your own AWS account. There is no public
T-DJ server; this CLI deploys yours.

```bash
pnpm tdj               # in a TDJ checkout: init, then deploy
pnpm tdj doctor        # what is missing or broken, with the fix for each (reads the last deploy log)
pnpm tdj init          # stage, region, optional Spotify app (secret typed hidden)
pnpm tdj init --github # a fork that deploys itself: OIDC deploy role in AWS + repository settings via gh
pnpm tdj deploy        # checks, pnpm install, build, sst deploy; prints the URL and the /admin setup code
pnpm tdj status        # URL, version it answers with, whether /admin still waits for its owner
pnpm tdj connectors    # Spotify, YouTube, Google, Dropbox: console steps, then the keys (secrets typed hidden)
pnpm tdj connectors --check   # which connector keys are set, and whether the running app sees them
pnpm tdj destroy       # remove a stage (type its name to confirm)
pnpm tdj guide         # the step-by-step guide
pnpm tdj apple         # project owner: Apple + GitHub release setup
pnpm tdj --help
```

Or with no checkout yet, the one line (it prints its plan and asks first):

```bash
curl -fsSL https://raw.githubusercontent.com/ArioMoniri/TDJ/claude/admiring-curie-npzd0m/scripts/install.sh | bash
```

Settings go to `.env.local` (git-ignored, mode 0600, never a secret). Secrets go to AWS Parameter Store as
SecureStrings or to GitHub secrets through stdin; they are never printed, never on a command line and never in a
file that is kept (`tdj connectors --target local` writes `apps/web/.env.local` for `pnpm dev`: git-ignored, mode
0600). Every connector, its limits and console steps:
[docs/CONNECTORS.md](https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/CONNECTORS.md). `NO_COLOR=1` or `--no-color` for plain output, `TDJ_ASCII=1` for a pure-ASCII banner.

No dependencies beyond Node 22. Tests: `pnpm --filter tdj-deploy test` (child processes are mocked).
Full guide: [docs/SELF_DEPLOY.md](https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/SELF_DEPLOY.md).

Developed by Ariorad Moniri. PolyForm Noncommercial 1.0.0.
