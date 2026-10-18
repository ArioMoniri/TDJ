# Worktrees to build upon

Use git worktrees so parallel agents/people never collide:

```bash
git worktree add ../tdj-engine   -b wt/engine    # packages/core rules, scoring, knowledge json
git worktree add ../tdj-ui       -b wt/ui        # apps/web components, glass system, mobile
git worktree add ../tdj-data     -b wt/data      # index builders, Spotify/BPM enrichment, cortina libraries
git worktree add ../tdj-infra    -b wt/infra     # sst.config.ts, workflows, Dockerfile
git worktree add ../tdj-video    -b wt/video     # Remotion + media capture
```
Each worktree owns a folder; merges go through PRs into `main` with CI green. Suggested next worktrees from the reviews: `wt/bpm` (in-browser beat detection + cache), `wt/requests` (request queue and clock view), `wt/regions` (BsAs/Europe/Istanbul presets).
