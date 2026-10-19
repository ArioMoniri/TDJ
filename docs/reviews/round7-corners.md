# Round 7: glass corners

The user keeps reporting clipped or square corners on glass elements (nav pill left end, mini-player top-right,
toolbar band, card menus) that headless Chromium did not reproduce. This pass reads the two captures, runs a
systematic corner probe of the live site in Chromium, reasons through the WebKit cases Chromium cannot show, and
fixes what it finds. Crops: `round7-corners.png` (panels A–D, referenced below).

## What the two captures show

**`round6-pill-corner.png` (panel A).** A 1x crop of the sm–lg nav pill's left end, dark theme, scroll 0 on
Compose. The hairline is a proper capsule, but the *fill* inside it ends in a straight vertical edge about 4 px
in from the arc, with the page colour showing between the arc and the fill (clear once the crop is
contrast-stretched). The block has ~8 px corners, not the capsule's 26 px, and the active "Compose" tab has no
highlight. That is the tab highlight (`layoutId="nav-pill"`, `--fill-3`) projected from a stale measurement
over the logo (round 6's diagnosis), composited by WebKit without the host's rounded clip: `overflow: clip` +
`border-radius` does not clip a *transformed* child in WebKit, and the host carried the `backdrop-filter`,
which WebKit composites square whenever the element or a descendant is transformed.

**`round6-tablet-bug.webp` (panel A of round 6).** An iPad in landscape, Compose with a set, scrolled so the
large title has left: the pill's band is transparent, so "4h golden milonga" and "78 /100" show around and under
the capsule, and the pill's trailing actions overflow leftwards over the tabs (fixed in round 6: full-bleed band,
`shrink-0` + `useFitLevel`). The capsule's own corners are intact in that capture; what reads as "square" is
the content running up to the capsule's edge.

## Probe

`scratch/qa/corners.mjs` (not committed): Playwright Chromium at 375, 430, 640, 768, 820, 1024, 1180 and
1440 px, dark and light, scroll 0 and mid-page, without and with a composed set, with the mini-player open, a card
menu open, the Export sheet, the Adjust sheet (phone) and `/admin`. Every glass element's bounding box is
screenshotted at device scale 2; for each corner the pixel 2 px inside the box (diagonally, i.e. outside the
rounded shape) is compared with the pixel 2 px outside it (Δ ≤ 12), and the crops are inspected by eye. Repeated
with `prefers-reduced-transparency: reduce` (CDP media emulation) and with `--disable-gpu
--enable-features=OverlayScrollbar` (software compositing, overlay scrollbars: closer to other engines).

## Defects found

| # | Element | Width / theme / state | Root cause | Fix |
| --- | --- | --- | --- | --- |
| 1 | Tanda `•••` sheet (phone), also *Find on services* and *Audio details* sheets | 375 and 430, both themes, set + card menu open | `.tanda-card { container-type: inline-size }` makes the card the containing block for `position: fixed` descendants (size containment), so the sheet's `fixed inset-0` wrapper and its scrim were laid out in the card's box: the sheet was 343 px wide at x = 16, its rows below the fold, the card's `overflow: clip` cut its corners and 10 px of unshaded page showed at each side (panel B, live). | `Sheet` renders through a portal to `<body>` (as the popover menu already did). |
| 2 | Nav pill (tablet, 640–1023 px) | every width in the range, both themes, any page scrolled more than one screen | `html, body { height: 100% }`: `body` is one viewport tall and the content overflows it. The pill's band is `sticky` *in `body`*, so it sticks only while `body`'s box is on screen and scrolls away after one screen (panel C, live at 820 × 900; round 6's iPad project at 1180 px tall scrolled 900 px and never left the box). | `body { min-height: 100% }`. |
| 3 | Every sheet (page position) | any width, any page scrolled, a sheet opened (Export, Adjust, menus, Find on services…) | Same `body { height: 100% }`: the sheet's scroll lock set `overflow: hidden` on `body`, and because `html` has `overflow-x: clip` that overflow never propagates to the viewport; it clipped the one-screen-high `body` instead, the document's scroll height collapsed to one screen and the page snapped to the top under the sheet (live: scrollY 900 → 0, scroll height 11 529 → 932) and stayed there after closing. | `body { min-height: 100% }` (above) and the lock moves to the root element, which keeps its scroll offset. `round4.spec.ts` only passed because of the snap (the reload returned to the top); it now scopes the Guide toggle to the visible one. |
| 4 | Nav pill, tab bar, primary bar / pill, mini player, toast, search button, sheets (WebKit) | any width; the state the user reports: scrolled / animating / after a layout re-measure | WebKit composites `backdrop-filter` without `border-radius` when the element or a descendant is transformed or has `will-change`: the mini player and sheets are transform-animated (`sheetUp`, the sheet spring, drag, `will-change: transform`), the pills carry a transformed `layoutId` highlight. Fill, blur and sheen then paint as a square block behind the rounded outline (the user's capture). Not reproducible in Chromium. | The material (fill + blur + inset hairlines) moves from the host to a `::after` layer under the content, with `isolation: isolate` and an opaque `mask-image` (the bundler writes the `-webkit-mask-image` twin); a mask forces WebKit to render the layer through its rounded clip. The host keeps the hairline and the outer shadow, which a mask would cut. The sheen `::before` gets the same mask. New `sheet-material` utility for sheets; `icon-btn-glass::before` masked too. `corner-shape: inherit` keeps the layers on the host's continuous corner where the engine draws one. |
| 5 | Card `•••` popover (WebKit) | ≥ 640 px, row hovered during the open / close scale animation | `overflow: clip` + `border-radius` on the scale-animated popover: WebKit does not clip the first / last row's hover fill to the corners while the transform runs. A mask on the popover would cut its ring and shadow. | The rows sit in an inner `.menu-list` that clips and carries the mask; the popover keeps ring + shadow. |

Nothing else was wrong in Chromium: every bar, sheet, menu and the mini player kept a rounded outline with the
backdrop colour inside the corner at every width and theme, in the GPU-less and reduced-transparency passes too
(panel D). The round 6 fixes hold (band clearance, opaque menus, no highlight projected over the logo).

## Not changed

- The remaining phone-run deltas in the probe were content under the corner (a card edge, text), not the element:
  the committed test shades the page under the control layer so the comparison is deterministic.
- `apps/web/scripts/perf-probe.ts` counts elements whose computed `backdrop-filter` is not `none`; the material now
  lives on `::after`, which `getComputedStyle(el)` does not see, so its `blur` count reads 0 again. The budget is
  unchanged (same layers, blur ≤ 20 px, no new always-on blur); the probe needs `getComputedStyle(el, "::after")`
  to count them (outside this pass's ownership).
- Tanda cards (`group-inset`, `overflow: clip`, `layout` animation) are the same WebKit clipping case as the
  popover for a row's hover fill at the card's corners; a mask on 27 cards is not worth the compositing cost.

## Test

`e2e/round7-corners.spec.ts` in six new projects (`corners-{phone,tablet,desktop}-{dark,light}`: 430 × 932 touch,
820 × 1180 touch, 1440 × 900). Under a full-viewport shade (z-index 20: above the content, below every bar and
sheet, so the backdrop is uniform) each glass element's corners are sampled as in the probe: pixel 2 px inside the
box equals the pixel 2 px outside (Δ ≤ 12), at scroll 0, scrolled down and up with a set, with the mini player
open, the card menu (popover or sheet), the Export sheet, the Adjust sheet (phone) and on `/admin`. The phone menu
sheet must start at the viewport edge, span it and show its rows; every material element must still blur
(`::after` `backdrop-filter`). The popover's 1 px ring (a spread shadow outside its box) counts as part of its
shape, and the lg toolbar band, which has no corners, is sampled straight across its foot. Negative check: with
`[data-testid="mini-player"]::after { border-radius: 0 }` injected, the top-left sample reads Δ 14 in dark
(the material is 0.72 surface over ink) and far more in light, so a square layer trips the assertion in both
themes; the dark margin is thin because the dark material is close to the page colour by design.

12 new test runs (2 tests × 6 projects). Whole suite: 89 passed, 1 skipped (`round6-tablet` pill clearance in the
1024 project, as before).
