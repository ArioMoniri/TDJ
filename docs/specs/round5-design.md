# Round 5 — design, motion and reach

User feedback after round 4: "motion elements and design not applied", "generate buttons are not at easy parts". This round is a design-fidelity pass: implement what the design docs specify but the app does not do, and put the primary actions where thumbs and cursors are.

## 1. Primary action placement (Compose / Regenerate / Tell the DJ)
- **Phone**: a persistent primary bar directly above the Liquid Glass tab bar: `Compose the night` (full-width capsule, 50 pt) while no set exists; once a set exists it becomes a two-up bar `Regenerate` (secondary) + `Export` (primary) with a `•••` for Tell the DJ / Lock all / Clear. The bar is glass (control layer), respects safe-area insets, hides while a sheet is open, and minimises with the tab bar on scroll-down (icon-only pill) and returns on scroll-up. The form's inline Compose button stays as a secondary affordance at the end of the form.
- **Desktop**: the Compose button lives in the sticky page toolbar (top-right, next to the set name) as the primary capsule, visible at every scroll position; in the folded "Set-up" summary row the trailing control is `Regenerate`. Keyboard: ⌘↩ composes, ⌘E opens Export, ⌘K focuses Tell the DJ.
- Feedback chips and Tell the DJ: on phone they live in a bottom sheet opened from the primary bar's `•••` or by tapping the score; on desktop they stay inline under the result header.

## 2. Motion fidelity audit
Audit `docs/design/motion-system.md` §3.1–3.15 and `docs/design/motion-composer.md` §2.1–2.9 against the code and implement every gap. Known gaps to confirm: compose button press and composing state (2.1: capsule → progress pill with narrative, not a spinner only), result reveal choreography (2.2: score count-up, curve draw-on, phase bands fade in order), card entrance stagger limited to the viewport (2.3), lock toggle (2.4), per-track swap line swap (2.5), chip tap → recompose (2.6), export sheet success state (2.7), score breakdown disclosure (2.8), cortina row hover/tap preview (2.9), theme cross-fade (3.5), Test connection states (3.6), Spotify connect flow (3.7), database tab transitions (3.8), skeletons (3.13), empty states with the Lottie assets in `public/anim` (3.14), focus/hover on glass (3.15). Performance budget from `docs/design/performance-budget.md` is a hard constraint: no `layout` animation on whole lists, animations only on transform/opacity, reduced motion honoured; re-run `pnpm --filter @tdj/web perf` and stay inside the budget.

## 3. Design fidelity (UX review round 4, §9 P2 and §10 leftovers)
Apply every P2 item in `docs/reviews/round4-ux.md` §9 (P2-1 … P2-10) and the §10 details not yet built: tanda preview chaining in the mini-player (play the whole tanda), the track-details "swap for a better fit" action, Health-shaped result header details, Sets/History row design (Library-style grouping is fine to keep as a tab). Light mode: wallpaper must not tint content; glass ring per P2-5. Buttons press with opacity, not scale (P2-4).

## 4. Acceptance
- Screenshots before/after for phone and desktop of: home (no set), home (set exists, scrolled mid-list), export sheet, settings connectors. Put them in `media/screenshots/` using the existing capture script (extend it) so the README stays real.
- e2e: primary bar visible above the tab bar on phone at every scroll position of the result; ⌘↩ composes on desktop; reduced-motion run shows no transforms; `cd apps/web && pnpm e2e` green.
- `pnpm --filter @tdj/web perf` within budget; typecheck and Biome clean.
