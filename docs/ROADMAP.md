# Roadmap

Phases are sized for one worktree each (see `docs/WORKTREES.md`). ✅ shipped · 🔧 in progress · ⏳ planned.

## Phase 0 — Foundation ✅
Catalogue index in-repo (21,932 recordings, orchestra heatmap), composer engine (tandas, arc, cortinas, Cumparsita), benchmark scorer, exports, liquid-glass web app (desktop + mobile), BYOK panel, CI, SST/OIDC deploy, Remotion launch video, agent reviews.

## Phase 1 — Trust the ears 🔧
- ✅ Musician + DJ review corrections applied (44 profiles, 338 track energies, index v2 with approximate years, medley/solo-piano flags).
- ✅ Reference corpus (31 sets, 218 canonical tandas, 1,078 famous recordings, blacklist) and corpus rules in the engine.
- ✅ Context factors (season, weather, room, time, event, crowd, region, holiday, mood) with evidence grades.
- ✅ Per-user overrides database, feedback loop, locks, track swap, export with/without cortinas, multi-provider AI.
- Spotify enrichment of golden-age tandas (`pnpm index:enrich`), commit cache; `requireSpotify` option becomes useful.
- BPM/key per recording: in-browser beat detection on previews (`web-audio-beat-detector`, MIT) → `data/cache/bpm.json`; activate rubric C9.
- Transfer-tier tagging per album/label (TangoTunes, CTA, El Bandoneón, Euro Records…).

## Phase 2 — The DJ booth 🔧
- ✅ Locks that survive recompose, per-track swap, feedback chips and free-text refine, night rules (Cumparsitas, birthday vals, show break, opener/última), era presets with pinned controls, agent memory, Apple-native UI and motion system.
- Lock/unlock tandas (persisted), drag reorder, swap a single track, "avoid this orchestra tonight".
- Clock view (wall-clock timeline, "we are here"), print/PDF set list, request queue with insert-at-energy.
- Floor-feedback knob (re-plan remaining night up/down 10 energy points).
- Regional presets (Buenos Aires traditional, European marathon, Istanbul, Asia, US alternative).

## Phase 3 — Everywhere ⏳
- Serato `.crate` binary writer, VirtualDJ `.vdjfolder`, Engine DJ import; local-file matching for DJ apps (choose music folder, fuzzy match to M3U8).
- Apple Music / TIDAL / Deezer resolvers behind the same `Resolved` interface.
- PWA offline mode (index cached in IndexedDB), share link with seed + options.

## Phase 4 — Community ⏳
- Public set gallery with benchmark scores, import tandas from El Recodo / tango.info links.
- Multi-user accounts on AWS (Cognito) with encrypted BYOK storage (KMS envelope) instead of localStorage.
- Remotion "set trailer" per playlist.
