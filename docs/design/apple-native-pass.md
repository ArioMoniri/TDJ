# TDJ: Apple-native pass

Scope: `apps/web` (Next.js 16, Tailwind 4, `motion` 14, lucide). Goal: TDJ reads as a native iOS 26 / macOS Tahoe app, not a web dashboard. This document is written so that an engineer can apply it file by file. Nothing here needs a new dependency. Motion tokens stay as defined in `docs/design/motion-system.md` and `apps/web/src/lib/motion.ts`; this pass changes structure, type, spacing, materials and controls, and only adds the motion that native controls need (large-title collapse, swipe actions, sheet detents, tab-bar minimise).

Screens audited: `media/screenshots/01–16`. Mobbin references are listed in §7 and cited inline as `[M1]`…`[M28]`.

Decisions in one paragraph: the five tabs stay siblings. Every page gets an iOS large title that collapses into a glass bar. The phone tab bar becomes a Liquid Glass capsule that minimises on scroll, with a detached search button on the two search pages. Desktop gets a sidebar (macOS) above 1024 px and keeps the pill header between 640 and 1024 px. All forms (Composer, Settings, Database, Export) become inset grouped lists: cell rows with a leading label, a trailing value, a disclosure chevron, a switch or a stepper. Chip walls go away except for one place (feedback chips, which Apple uses the same way). Tanda cards become Apple Music track lists with a rhythm-coloured artwork tile. The energy curve gets a Health-style summary header. The ambient gradient stays but drops to a wallpaper level behind the glass. Serif stays for the app's few display moments (hero on first run, set name) and nothing else.

---

## 0. The native vocabulary we are matching

| Idiom | iOS / macOS value | TDJ today | TDJ after |
| --- | --- | --- | --- |
| Page title | Large Title 34/41 bold, collapses to 17 semibold in a bar | 3xl serif inside a card | `PageHeader` with large title + collapsing glass bar (§3.1) |
| Navigation (phone) | Tab bar: glass capsule, 10 pt labels, minimises on scroll, search detached | Glass bar with 12 px labels, static | §3.1 |
| Navigation (desktop) | Sidebar 220 pt (macOS), toolbar above content | Glass pill header with chip tabs | Sidebar ≥ lg, pill between sm and lg (§4) |
| Forms | Inset grouped list: section header 13 pt, cells 44 pt, trailing values, chevrons, footers | Cards with chip walls | `Group` / `Row` primitives (§3.2) |
| Lists of music | Artwork tile 44–56, title 17 regular, subtitle 15 secondary, trailing duration tabular, `•••` | Card with pill, 2xl number, icon buttons | Apple Music rows (§3.4) |
| Summary + chart | Caption label, big number with unit, caption date, chart below, period picker | Name + score at right, chart, legend | Health card (§3.5) |
| Sheets | Grabber 36×5, medium/large detents, inset grouped content, close in a glass circle | Glass panel with X, button grid | §3.6 |
| Search | 36 pt field, radius 10, fill background, magnifier, clear, Cancel on focus | 48 pt pill with accent ring | §3.8 |
| Materials | thick / regular / thin / ultra-thin, hairline separators | one `.glass`, one `.surface` | tokens in §2.3 |
| Tint | one accent for interactive text, chevrons stay tertiary, switch stays green | rose for primary buttons only | rose becomes the tint (§2.5) |
| Icons | SF Symbols regular/semibold | lucide at mixed sizes and 1.8–2.4 stroke | lucide at fixed size/weight pairs (§2.6) |
| Haptics | `.selection`, `.impact(.light)`, `.notification(.success)` | `haptic()` on lock only | twins table in §3.9 |

---

## 1. Gap analysis per screen

Each row: what the screenshot shows → what a native screen would show → the change (section that specifies it).

### 1.1 Compose, desktop dark (01) and light (07)

- Header pill carries logo + "TDJ" + "Tango DJ composer" + five chip tabs with icons. Native: a sidebar (macOS) or a toolbar whose title is the page, not the product. The tagline duplicates the hero. → §4.1, remove "Tango DJ composer" (§5).
- Hero card: 5xl serif + paragraph + vinyl. Native apps do not open with marketing copy; the large title is the hero. → Large title "Compose", tagline becomes one Subhead line shown only until the first set exists; vinyl stays only in the empty state on desktop (§3.3).
- Controls card: two-column grid of chip walls (Era 7 chips, Shape 5 chips, Cultures 12 chips) with labels floating above. Native: inset grouped sections, one row per setting, with the chosen value trailing and a chevron, or an inline segmented control when ≤ 4 options. → §3.3.
- Slider has a clock icon and three tick captions. Native: the label is text only, the value sits trailing in the same cell, the slider is the cell's second line (Settings → Display). Tick captions become the footer. → §3.3.
- Stepper is two 44 pt round buttons with the value between. Native stepper is a joined 94×32 control, value lives in the row's trailing text. → §3.2 `Stepper` restyle.
- Switch row is correct in principle; its 51×31 track is right. Keep.
- Tonight strip (14): 12 select-chips with a coloured dot and "(−3)" in the label, then a summary line. Native (Shortcuts parameter rows, Settings picker rows): one row per factor, label left, chosen value right in tint with `chevron.up.chevron.down`, summary as the section footer. → §3.3 "Tonight" group.
- Three action buttons under the form on desktop ("Compose the night", "Recompose (same seed)", "Export"). Native: primary action in the toolbar (trailing), secondary ones in a `•••` menu. → §4.2.
- Light mode (07): white cards on a peach/lilac gradient. Native light grouped background is a flat warm grey with white cells; the gradient belongs behind glass only. → §2.4.

### 1.2 Result and arc (02, 09)

- Set name in serif 2xl, stats line, score at the far right with verdict. Native (Health): caption label → big number with unit → caption, left-aligned, then the chart. → §3.5.
- Chart has a y-axis with 0/50/100 on the left, dashed target, four phase bands, a five-item legend. Health puts the few y labels on the right, draws two gridlines, no legend when the series are self-explanatory. → §3.5 chart edits.
- "How this set scored" and "Mood check" are `<details>` rows; "Get a written review" button and "Seed 204860595" chip sit below. Native: grouped rows with chevrons; seed goes into the `•••` menu as "Copy seed". → §3.5.
- Phone (09): the score "76/100" is centred under the stats; fine, but it should sit at the top with the name as the caption and the chart under it; the legend wraps to two lines (remove).

### 1.3 Tanda cards (03, 10, 13)

- Each card: uppercase rhythm pill, "#9 · peak · 1945–1947", orchestra, singer, big energy "64" + "of 67 target", two round icon buttons, a reason sentence that restates the header, numbered tracks with a bar and a round swap button each, a "Listen" chip, a cortina box. Native (Apple Music playlist / Replay rows [M1][M4]): a 44 pt artwork tile, title 17, subtitle 15 secondary, trailing tabular number, `•••`; actions on swipe (phone) and in a context menu (desktop); footers in 13 pt. → §3.4.
- The reason sentence and the "of N target" caption are duplicates of header data. Remove the sentence; keep "target 67" only in the context menu's header or as a footnote (§5).
- The track swap buttons are 44 pt circles in every row, nine per card. Native shows `•••` or nothing and reveals actions on swipe/hover. → §3.4.
- Listen (13): a Spotify iframe inside the card, preceded by a two-line explanation. Native: the player is a row with a play glyph; the explanation goes to a footer. → §3.4 "Listen" row.
- Light mode for cards: white cards on the gradient read as web. → grouped background (§2.4).

### 1.4 Export (04, 11)

- Desktop: a centred glass panel with a title, X, a paragraph, a switch in a tinted box, three uppercase group headers with button grids. Native sheet [M16][M17]: title centred 17 semibold, Cancel/Done in the bar, inset grouped rows with chevrons, section footers for explanations, one filled primary button at the bottom. → §3.6.
- Phone: the grabber exists; the sheet opens at a fixed 85 dvh and does not drag. Native: medium detent first (content height), drag to large, drag down to dismiss. → §3.6 detents.
- "File paths use a TDJ/ placeholder…" paragraph is a footer, not body text. → §3.6.

### 1.5 Library (05)

- Card with serif title, counts, a 48 pt rose-ringed search pill; results in a second card with a "40 results" strip; orchestra chips at the bottom. Native (Music search [M5], Rodeo results [M24]): large title "Library" with the search field attached under it, plain list rows with a tile, Cancel appears on focus, results count is a section header, orchestras are a grouped list with trailing counts. → §3.8.
- Rhythm is a coloured uppercase word in a 56 px column. Native puts it in the artwork tile. → §3.8.

### 1.6 Settings (06, 15)

- Serif "Settings" + subtitle, five big cards each with an icon + heading + paragraph + labelled fields + buttons; status pills "Not connected"/"Key saved". Native Settings [M6][M7][M8][M9]: large title, inset groups with a coloured 29 pt icon tile per row, trailing values ("Not connected" as secondary text), chevrons into sub-pages or inline value cells, actions as centred tinted rows, explanations as section footers. → §3.7.
- Model chips row duplicates the datalist. Remove the chips, keep the field (§5).
- "Test connection" button + status text. Native: a tinted action row whose footer shows the result. → §3.7.

### 1.7 Database (12, 16)

- Header card with title, description sentence, three ghost buttons, a status pill; second card with segmented tabs, a 48 pt search pill and a 9-column table of bordered inputs. Native (Reminders/Notes inline editing [M12][M21]): large title with an "Edit" button and a `•••` menu for Import/Export/Reset; the segmented control sits under the title in the bar; the search field is the iOS 36 pt field; rows are plain text until Edit, then become value cells with right-aligned fields. → §3.9.
- Phone (16): the card-per-row fallback is close to an inset group already; the inputs have borders and the "State · index" row is noise. → §3.9.

### 1.8 Guide

- Three cards with dl rows whose terms are uppercase rose/teal 12 px. Native article (Health "About Steps" [M10]): Title1 heading, 17/24 body, Title3 section heads, no uppercase labels, a maximum measure of 680 px, link rows at the end. → §3.10.

### 1.9 Phone chrome (08, 09, 10, 11, 16)

- Tab bar: glass bar, five tabs with 12 px labels and a highlighted pill; above it a second glass bar with the compose button; both stack to 150 px of chrome. Native iOS 26: the tab bar is a capsule that minimises to the active tab while scrolling down, the accessory (compose) sits in a separate capsule that hides with it. → §3.1.
- Content runs under both bars without a scroll-edge effect; the chip rows are clipped by the bars. → §4.4.

---

## 2. Design-token delta for `globals.css`

Add these inside the existing `@theme` and `:root` blocks; nothing is removed until the components that use it are migrated (§6).

### 2.1 Type scale (SF Pro / Dynamic Type default sizes)

Tailwind 4 reads `--text-*` from `@theme` and generates `text-<name>` utilities with the paired line height and weight.

```css
@theme {
  /* Apple text styles, 17 pt body. Names are Apple's. */
  --text-large-title: 2.125rem;        /* 34 */
  --text-large-title--line-height: 2.5625rem; /* 41 */
  --text-large-title--font-weight: 700;
  --text-large-title--letter-spacing: 0.011em;
  --text-title1: 1.75rem;               /* 28 / 34 */
  --text-title1--line-height: 2.125rem;
  --text-title1--font-weight: 700;
  --text-title2: 1.375rem;              /* 22 / 28 */
  --text-title2--line-height: 1.75rem;
  --text-title2--font-weight: 700;
  --text-title3: 1.25rem;               /* 20 / 25 */
  --text-title3--line-height: 1.5625rem;
  --text-title3--font-weight: 600;
  --text-headline: 1.0625rem;           /* 17 / 22 semibold */
  --text-headline--line-height: 1.375rem;
  --text-headline--font-weight: 600;
  --text-body: 1.0625rem;               /* 17 / 22 */
  --text-body--line-height: 1.375rem;
  --text-callout: 1rem;                 /* 16 / 21 */
  --text-callout--line-height: 1.3125rem;
  --text-subhead: 0.9375rem;            /* 15 / 20 */
  --text-subhead--line-height: 1.25rem;
  --text-footnote: 0.8125rem;           /* 13 / 18 */
  --text-footnote--line-height: 1.125rem;
  --text-caption1: 0.75rem;             /* 12 / 16 */
  --text-caption1--line-height: 1rem;
  --text-caption2: 0.6875rem;           /* 11 / 13 */
  --text-caption2--line-height: 0.8125rem;
  --text-tab: 0.625rem;                 /* 10 / 12: tab bar labels */
  --text-tab--line-height: 0.75rem;
  --text-tab--font-weight: 500;
}
```

Usage map (replace ad-hoc `text-sm/text-xs/text-lg`):

| Element | Class |
| --- | --- |
| Page title | `text-large-title` (collapsed: `text-headline`) |
| Set name, sheet title | `text-title2` |
| Section title inside content (Guide h2) | `text-title3` |
| Row label, orchestra name, button label | `text-body` (row label is regular, not medium) |
| Emphasised row label, card header | `text-headline` |
| Row subtitle, singer, segmented labels | `text-subhead text-secondary` |
| Section header, footers, meta lines, cortina | `text-footnote text-secondary` |
| Section header text is uppercase: `text-footnote uppercase tracking-[0.02em]` | |
| Tiny counters, legend | `text-caption1` |
| Tab labels | `text-tab` |
| Numbers | add `tabular-nums` always |

Font: keep Inter via `--font-sans`, but put `-apple-system, "SF Pro Text"` first so Apple devices get San Francisco:

```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-sans-loaded), system-ui, "Segoe UI", Roboto, sans-serif;
```

Serif (`Fraunces`) is kept for exactly two uses: the first-run hero line and the set name in the result header. Everything else that is `font-serif` today becomes `text-large-title` or `text-title2`.

### 2.2 Radii (continuous corners)

```css
@theme {
  --radius-xs: 10px;   /* fields, small buttons, icon tiles 29 pt, chips inside cells */
  --radius-s: 14px;    /* inset group container on desktop, artwork tiles 44–56 */
  --radius-m: 20px;    /* inset group container on phone, result card, popovers */
  --radius-l: 28px;    /* sheets, tab bar capsule, glass bars, hero card */
  --radius-glass: var(--radius-l); /* keep the old name as an alias */
}
/* Continuous (superellipse) corners where supported; no-op elsewhere. */
@supports (corner-shape: superellipse(1.5)) {
  .rounded-continuous { corner-shape: superellipse(1.5); }
}
```

Give `.group-inset`, `.glass`, `.sheet`, `.tile` the `rounded-continuous` class (via `@apply` inside their `@utility`).

### 2.3 Spacing, materials, separators, fills

```css
:root {
  /* 8-pt grid */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --inset-x: 16px;                 /* inset grouped list horizontal margin (phone) */
  --cell-min: 44px;                /* row height */
  --cell-px: 16px;                 /* row horizontal padding */
  --cell-py: 11px;                 /* row vertical padding (44 with 22 line height) */
  --tile: 29px;                    /* Settings icon tile */
  --tile-art: 44px;                /* list artwork tile */

  /* Label hierarchy (iOS label / secondaryLabel / tertiaryLabel / quaternaryLabel) */
  --label: rgb(var(--text));
  --label-2: rgb(var(--text) / 0.6);
  --label-3: rgb(var(--text) / 0.3);
  --label-4: rgb(var(--text) / 0.18);

  /* Fills (iOS systemFill … quaternarySystemFill) */
  --fill-1: rgb(var(--text) / 0.2);
  --fill-2: rgb(var(--text) / 0.16);
  --fill-3: rgb(var(--text) / 0.12);
  --fill-4: rgb(var(--text) / 0.08);

  /* Backgrounds: grouped page vs cell */
  --bg-grouped: 242 239 233;       /* light: warm grey derived from cream */
  --bg-cell: 255 255 255;

  /* Separator: hairline, inset from the leading edge of the text */
  --separator: rgb(var(--text) / 0.16);
  --separator-w: 0.5px;            /* retina hairline; falls back to 1px below */

  /* Materials (backdrop blur + fill) */
  --material-thick: rgb(var(--surface) / 0.86);
  --material-regular: rgb(var(--surface) / 0.72);
  --material-thin: rgb(var(--surface) / 0.55);
  --material-ultrathin: rgb(var(--surface) / 0.38);
  --blur-thick: 40px;
  --blur-regular: 24px;
  --blur-thin: 16px;

  /* Tint (interactive text, chevrons on selected pickers, links). Rose. */
  --tint: var(--accent);
  --tint-rgb: 201 66 106;
  --destructive: #e5484d;
  --system-green: #34c759;         /* switch on */
  --system-gold: #e8b85a;          /* locked */
}
.dark, :root[data-theme="dark"] {
  --bg-grouped: 11 10 16;          /* ink */
  --bg-cell: 26 24 36;             /* one step above ink */
  --tint-rgb: 224 85 122;
  --tint: #e0557a;
  --destructive: #ff6b6b;
  --system-green: #30d158;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg-grouped: 11 10 16; --bg-cell: 26 24 36;
    --tint-rgb: 224 85 122; --tint: #e0557a; --destructive: #ff6b6b; --system-green: #30d158;
  }
}
@media (-webkit-min-device-pixel-ratio: 1) and (max-resolution: 1.5dppx) {
  :root { --separator-w: 1px; }
}
```

`body` background becomes the grouped background. The `.ambient` layer stays but at wallpaper level: multiply its `opacity` by 0.45 (`.ambient::before/::after { opacity: .25 }`, radial gradients at 55 % alpha via `color-mix`). The grouped background must dominate; the glass bars are what lens the colour.

### 2.4 Surface utilities (replace `.surface`, extend `.glass`)

```css
/* Inset grouped list container (UITableView.insetGrouped) */
@utility group-inset {
  background: rgb(var(--bg-cell));
  border-radius: var(--radius-m);
  overflow: clip;
  @media (min-width: 640px) { border-radius: var(--radius-s); }
  @apply rounded-continuous;
}
/* Rows inside a group: 44 pt, hairline separator inset to the text edge */
@utility cell {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--cell-min);
  padding: var(--cell-py) var(--cell-px);
  font-size: var(--text-body);
  line-height: var(--text-body--line-height);
  color: var(--label);
  -webkit-tap-highlight-color: transparent;
}
.cell + .cell { position: relative; }
.cell + .cell::before {
  content: ""; position: absolute; top: 0; right: 0;
  left: var(--cell-px); height: var(--separator-w); background: var(--separator);
}
.cell[data-leading="tile"] + .cell::before { left: calc(var(--cell-px) + var(--tile) + var(--space-3)); }
.cell[data-leading="art"]  + .cell::before { left: calc(var(--cell-px) + var(--tile-art) + var(--space-3)); }
/* Tappable row: fill flash, no hover lift */
.cell-tap { cursor: default; transition: background var(--dur-xs) var(--ease-settle); }
.cell-tap:active { background: var(--fill-4); }
@media (hover: hover) { .cell-tap:hover { background: rgb(var(--text) / 0.04); } }
/* Trailing value + chevron */
.cell-value { margin-left: auto; color: var(--label-2); text-align: right; white-space: nowrap; }
.cell-chevron { color: var(--label-3); flex: none; }
/* Section header / footer */
@utility section-head {
  padding: 0 var(--cell-px);
  margin: var(--space-6) 0 var(--space-2);
  font-size: var(--text-footnote); line-height: var(--text-footnote--line-height);
  text-transform: uppercase; letter-spacing: 0.02em; color: var(--label-2);
}
@utility section-foot {
  padding: 0 var(--cell-px);
  margin: var(--space-2) 0 0;
  font-size: var(--text-footnote); line-height: var(--text-footnote--line-height);
  color: var(--label-2);
}
/* Materials */
@utility material-thick   { background: var(--material-thick);   backdrop-filter: blur(var(--blur-thick)) saturate(160%);   -webkit-backdrop-filter: blur(var(--blur-thick)) saturate(160%); }
@utility material-regular { background: var(--material-regular); backdrop-filter: blur(var(--blur-regular)) saturate(160%); -webkit-backdrop-filter: blur(var(--blur-regular)) saturate(160%); }
@utility material-thin    { background: var(--material-thin);    backdrop-filter: blur(var(--blur-thin)) saturate(140%);    -webkit-backdrop-filter: blur(var(--blur-thin)) saturate(140%); }
/* Glass stays the control layer; it now uses the regular material and the L radius */
@utility glass {
  position: relative;
  @apply material-regular rounded-continuous;
  border: var(--separator-w) solid rgb(255 255 255 / 0.18);
  border-radius: var(--radius-l);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.14), inset 0 1px 0 rgb(255 255 255 / 0.35), inset 0 -0.5px 0 rgb(0 0 0 / 0.08);
  /* keep the existing ::before sheen, reduced-transparency and .reduce-glass rules */
}
/* Scroll-edge effect: content fades out under a glass bar (iOS 26) */
@utility scroll-edge-top {
  position: fixed; inset-inline: 0; top: 0; height: calc(env(safe-area-inset-top) + 56px);
  pointer-events: none; z-index: 39;
  background: linear-gradient(rgb(var(--bg-grouped) / 0.9), rgb(var(--bg-grouped) / 0));
  -webkit-mask-image: linear-gradient(#000 40%, transparent);
  mask-image: linear-gradient(#000 40%, transparent);
}
@utility scroll-edge-bottom {
  position: fixed; inset-inline: 0; bottom: 0; height: calc(env(safe-area-inset-bottom) + 120px);
  pointer-events: none; z-index: 29;
  background: linear-gradient(rgb(var(--bg-grouped) / 0), rgb(var(--bg-grouped) / 0.9));
  -webkit-mask-image: linear-gradient(transparent, #000 60%);
  mask-image: linear-gradient(transparent, #000 60%);
}
/* Keep .surface as an alias during migration, then delete it */
@utility surface { @apply group-inset; padding: var(--space-4); }
```

### 2.5 Controls restyle (edit existing utilities in place)

```css
/* Buttons: iOS filled capsule 50 pt primary, 44 pt secondary; text 17 semibold */
@utility btn { min-height: 44px; padding: 0 20px; font-size: var(--text-body); font-weight: 600; border-radius: 999px; }
@utility btn-primary { background: var(--tint); color: #fff; min-height: 50px; box-shadow: none; }
@utility btn-ghost { background: var(--fill-3); border: 0; color: var(--tint); }
/* Plain tinted text button (toolbar / row action), no background */
@utility btn-plain { min-height: 44px; padding: 0 8px; color: var(--tint); font-size: var(--text-body); font-weight: 400; }
.btn-plain:active { opacity: 0.4; transition: opacity var(--dur-xs); }

/* Icon button: 44 hit area, 34 visible glass/fill circle, no border */
@utility icon-btn { width: 44px; height: 44px; border: 0; background: transparent; color: var(--tint); }
.icon-btn::before { content: ""; position: absolute; inset: 5px; border-radius: 999px; background: var(--fill-4); z-index: -1; }
.icon-btn { position: relative; isolation: isolate; }

/* Field: iOS text field inside a cell (no border, right aligned when it is a value) */
@utility field { min-height: 44px; border: 0; background: transparent; border-radius: 0; padding: 0; font-size: var(--text-body); }
.field-standalone { background: var(--fill-4); border-radius: var(--radius-xs); padding: 0 12px; min-height: 36px; }
.field-value { text-align: right; color: var(--tint); }
.field-value::placeholder { color: var(--label-3); }

/* Search field (UISearchBar): 36 pt, radius 10, tertiary fill, 17 pt text */
@utility search-field {
  display: flex; align-items: center; gap: 6px;
  min-height: 36px; padding: 0 8px; border-radius: var(--radius-xs);
  background: var(--fill-3); color: var(--label);
  font-size: var(--text-body);
}
.search-field svg { color: var(--label-2); }
.search-field input { flex: 1; background: transparent; min-width: 0; outline: 0; }
.search-field input::placeholder { color: var(--label-2); }
@media (hover: none) { .search-field { min-height: 44px; } }

/* Segmented control (UISegmentedControl): 32 pt, radius 9, 13 pt medium, inside a 2 px padded track */
.segmented { padding: 2px; gap: 0; border-radius: 9px; background: var(--fill-3); }
.seg { min-height: 28px; padding: 0 10px; border-radius: 7px; font-size: var(--text-footnote); font-weight: 500; }
.seg-on { color: var(--label); }
/* the thumb (layoutId) gets: bg rgb(var(--bg-cell)) + shadow 0 3px 8px rgb(0 0 0/.12), 0 3px 1px rgb(0 0 0/.04) */
@media (hover: none) { .seg { min-height: 40px; } .segmented { border-radius: 11px; } .seg { border-radius: 9px; } }
@media (max-width: 640px) { .segmented { flex-wrap: nowrap; } .seg { flex: 1 1 0; } }

/* Stepper (UIStepper): joined, 94×32, two halves, hairline divider */
.stepper { display: inline-flex; height: 32px; border-radius: 8px; background: var(--fill-3); overflow: hidden; }
.stepper button { width: 47px; height: 32px; display: grid; place-items: center; color: var(--label); }
.stepper button + button { border-left: var(--separator-w) solid var(--separator); }
.stepper button:active { background: var(--fill-2); }
.stepper button:disabled { color: var(--label-4); }
@media (hover: none) { .stepper { height: 44px; } .stepper button { height: 44px; } }

/* Switch: keep geometry, use system green */
.switch-on .switch-track { background: var(--system-green); }
.switch-track { background: var(--fill-2); }

/* Chips: only the feedback chips remain; 32 pt, 15 pt text, fill-4 bg, tint when on */
@utility chip { min-height: 32px; padding: 0 12px; font-size: var(--text-subhead); border: 0; background: var(--fill-4); }
@utility chip-on { background: var(--tint); color: #fff; }
@media (hover: none) { .chip { min-height: 44px; } }

/* Slider: iOS 4 pt track, 27 pt knob with shadow */
input[type="range"] { -webkit-appearance: none; appearance: none; height: 44px; background: transparent; }
input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(var(--tint), var(--tint)) 0/var(--pct, 50%) 100% no-repeat, var(--fill-2); }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 27px; height: 27px; margin-top: -11.5px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgb(0 0 0 / 0.15), 0 1px 1px rgb(0 0 0 / 0.16); }
/* set style={{ "--pct": `${(v-min)/(max-min)*100}%` }} on the input */

/* Context menu / popover (UIMenu): regular material, radius 14, 44 pt rows, 17 pt, icons trailing */
.menu { @apply material-thick rounded-continuous; border-radius: var(--radius-s); min-width: 250px; padding: 0; box-shadow: 0 12px 40px rgb(0 0 0 / 0.22), 0 0 0 0.5px rgb(0 0 0 / 0.1); }
.menu-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 0 16px; font-size: var(--text-body); }
.menu-item + .menu-item { border-top: var(--separator-w) solid var(--separator); }
.menu-item[data-destructive] { color: var(--destructive); }
.menu-group + .menu-group { border-top: 8px solid var(--fill-4); }

/* Swipe actions (UISwipeActionsConfiguration): full-height coloured buttons behind the row */
.swipe-actions { position: absolute; inset: 0 0 0 auto; display: flex; }
.swipe-action { display: grid; place-items: center; width: 74px; color: #fff; font-size: var(--text-footnote); gap: 2px; }
.swipe-action[data-kind="lock"] { background: var(--system-gold); color: #1a1400; }
.swipe-action[data-kind="swap"] { background: var(--tint); }

/* Settings icon tile (29×29, radius 7, white glyph) */
.tile { width: var(--tile); height: var(--tile); border-radius: 7px; display: grid; place-items: center; color: #fff; flex: none; }
/* Artwork tile for music rows (44, radius 10 continuous) */
.tile-art { width: var(--tile-art); height: var(--tile-art); border-radius: var(--radius-xs); display: grid; place-items: center; color: #fff; font-weight: 600; flex: none; @apply rounded-continuous; }
.tile-art[data-rhythm="tango"]   { background: linear-gradient(160deg, #e0557a, #b3264f); }
.tile-art[data-rhythm="vals"]    { background: linear-gradient(160deg, #4fd1c5, #0f766e); }
.tile-art[data-rhythm="milonga"] { background: linear-gradient(160deg, #8b7cf6, #6d28d9); }
```

Delete after migration (§6): `.ctx-chip*`, `.chip-row` phone mask rules, `.db-table*`, `.glass-pill`, `.skeleton` stays.

### 2.6 Icons: lucide as SF Symbols

Fixed size/weight pairs; never mix inside one surface.

| Role | lucide `size` | `strokeWidth` | SF equivalent |
| --- | --- | --- | --- |
| Tab bar | 24 (selected 24, `strokeWidth` 2.25) | 1.75 | `.regular` / `.semibold` |
| Toolbar / icon-btn glyph | 20 | 1.75 | `.regular` |
| Row leading glyph inside `.tile` | 16 | 2 | `.medium` |
| Row trailing chevron | 16, `className="cell-chevron"` | 2.5 | `chevron.right` (semibold, tertiary) |
| Picker chevron | 14 | 2 | `chevron.up.chevron.down` → `ChevronsUpDown` |
| `•••` | 20 | 2 | `ellipsis.circle` → `Ellipsis` inside `.icon-btn` |
| Inline text glyph | 15 | 2 | matches 15 pt subhead |

Mapping: `Share` (lucide, box + up arrow) replaces `Share2`; `Ellipsis` replaces secondary buttons; `ChevronRight` for disclosure; `Lock`/`LockOpen` keep; `RefreshCw` → `Repeat2` (closer to `arrow.2.squarepath`); `Search`; `CircleX` with `fill="currentColor"` + `stroke="rgb(var(--bg-cell))"` for the clear glyph; `Play` with `fill="currentColor"`; `AudioLines` for cortina; `Minus`/`Plus` in the stepper; `SlidersHorizontal` for Settings tab; `ListMusic` Compose; `Disc3` Library; `Database`; `BookOpen` Guide.

---

## 3. Component-by-component changes

New files the engineer creates (all under `apps/web/src/components/`): `PageHeader.tsx`, `Form.tsx` (Group, Row, ValueRow, PickerRow, SwitchRow, StepperRow, SliderRow, NavRow, ActionRow), `Sheet.tsx` (dialog scaffold extracted from ExportSheet, with detents), `Menu.tsx` (context menu / `•••` menu), `SwipeRow.tsx`, `SearchField.tsx`, `TrackRow.tsx`. Existing files change as listed.

### 3.1 `Nav.tsx` → iOS 26 tab bar (phone) and large-title bar (all)

Phone tab bar (replace the `<nav className="glass fixed …">` block):

```tsx
<LayoutGroup id="mobile-nav">
  <nav
    className="glass fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center p-1 sm:hidden"
    data-min={minimised || undefined}
    aria-label="Primary mobile"
    style={{ transition: "width var(--dur-s) var(--ease-settle)" }}
  >
    {items.map((it) => <MobileTab key={it.href} it={it} on={path === it.href} min={minimised} />)}
  </nav>
  {(path === "/library" || path === "/database") && (
    <button type="button" className="glass fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-40 grid h-14 w-14 place-items-center sm:hidden"
      aria-label="Search" onClick={() => document.getElementById(path === "/library" ? "library-search" : "db-search")?.focus()}>
      <Search size={22} strokeWidth={2} />
    </button>
  )}
</LayoutGroup>
```

- `MobileTab`: `min-w-[64px] min-h-[52px]`, icon 24, label `text-tab` (10 pt, weight 500), label colour `var(--label-2)` off and `var(--tint)` on; the pill `layoutId="tab-pill"` keeps `bg-[var(--fill-3)]` and `rounded-full`. Drop the Lottie tab glow (§5). Icon cross-fade stays.
- Minimise on scroll (iOS 26): a `useScrollDirection()` hook (`lib/hooks.ts`): on `scrollY` increasing by > 24 px past 80 px set `minimised = true`; on any upward scroll of > 8 px set `false`. When minimised the nav renders only the active tab (`items.filter(on)`) and the tab shows the icon only; width animates via `layout`. `prefers-reduced-motion`: no minimise.
- When a search page's search field is focused on phone the tab bar hides (`translate-y-[120%]`) so the keyboard has room; when it blurs it returns.
- The tab bar also gets `role="tablist"` semantics via `aria-current` as today.
- The compose accessory bar in `Composer.tsx` (the phone `glass fixed … bottom-[calc(…+66px)]`) becomes `bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+68px)]` and hides together with the tab bar when minimised (`data-min` → `translate-y-[calc(100%+80px)] opacity-0`).

Desktop header (between `sm` and `lg`) keeps the pill but becomes a toolbar: left slot is the page title in `text-headline` (shown only when the large title is scrolled out; otherwise just the logo), centre is the tab chips at `text-subhead`, right slot is the page's toolbar actions (passed through a `ToolbarSlot` context from `PageHeader`). Remove the "Tango DJ composer" subtitle. At `lg` and above render the sidebar (§4.1) instead of the pill.

Large title with collapse, `PageHeader.tsx` (used on every page):

```tsx
export function PageHeader({ title, subtitle, trailing, children }: { title: string; subtitle?: ReactNode; trailing?: ReactNode; children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: "-56px 0px 0px 0px" });
    if (sentinel.current) io.observe(sentinel.current);
    return () => io.disconnect();
  }, []);
  return (
    <>
      {/* Collapsed bar: glass, 44 pt + safe area, title centred, trailing actions right. Phone and tablet. */}
      <div className={`fixed inset-x-0 top-0 z-40 lg:hidden ${collapsed ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!collapsed}>
        <div className="material-regular border-b border-[var(--separator)] pt-[env(safe-area-inset-top)]"
             style={{ opacity: collapsed ? 1 : 0, transition: "opacity var(--dur-s) var(--ease-settle)" }}>
          <div className="relative mx-auto flex h-11 max-w-6xl items-center justify-center px-4">
            <span className="text-headline">{title}</span>
            <div className="absolute right-2 flex items-center gap-1">{trailing}</div>
          </div>
        </div>
      </div>
      <div ref={sentinel} className="h-px" />
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-0">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-large-title">{title}</h1>
          <div className="flex items-center gap-1 pb-1">{trailing}</div>
        </div>
        {subtitle && <p className="text-subhead mt-1 text-[var(--label-2)]">{subtitle}</p>}
        {children /* search field or segmented control that belongs to the bar */}
      </header>
    </>
  );
}
```

The `layout.tsx` main becomes `className="mx-auto w-full max-w-[720px] px-4 pb-[calc(env(safe-area-inset-bottom)+150px)] pt-2 sm:px-6 sm:pb-16 lg:max-w-[980px] lg:pl-[252px]"` (sidebar offset at lg, §4.1). Add `<div className="scroll-edge-top sm:hidden" aria-hidden />` and `<div className="scroll-edge-bottom sm:hidden" aria-hidden />` after `<Nav />`.

### 3.2 `ui.tsx` → `Form.tsx` primitives

Keep `Switch`, `Segmented`, `Stepper` in `ui.tsx` but restyle; add `Form.tsx`:

```tsx
export function Group({ header, footer, children, ...rest }: { header?: ReactNode; footer?: ReactNode; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest}>
      {header && <h2 className="section-head">{header}</h2>}
      <div className="group-inset">{children}</div>
      {footer && <p className="section-foot">{footer}</p>}
    </section>
  );
}
/** label left, value right (text), optional tile, optional chevron. */
export function Row({ tile, label, sub, value, chevron, onClick, children, leading }: RowProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`cell w-full text-left ${onClick ? "cell-tap" : ""}`} data-leading={tile ? "tile" : leading}>
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      {value !== undefined && <span className="cell-value text-body">{value}</span>}
      {children}
      {chevron && <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />}
    </Tag>
  );
}
/** Native select dressed as a picker row (Picker .menu): iOS shows the system picker, desktop the menu. */
export function PickerRow<K extends string>({ label, value, items, onChange, placeholder = "Choose" }: PickerProps<K>) {
  const id = useId();
  const current = items.find(([k]) => k === value)?.[1];
  return (
    <label htmlFor={id} className="cell cell-tap relative w-full">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={`cell-value ${current ? "text-[var(--tint)]" : ""}`}>{current ?? placeholder}</span>
      <ChevronsUpDown size={14} strokeWidth={2} className="cell-chevron" aria-hidden />
      <select id={id} value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as K)}
        className="absolute inset-0 cursor-default opacity-0">
        <option value="">{placeholder}</option>
        {items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}
export function SwitchRow({ label, sub, checked, onChange, tile }: …) {
  return (
    <div className="cell" data-leading={tile ? "tile" : undefined}>
      {tile}
      <span className="min-w-0 flex-1"><span className="block">{label}</span>{sub && <span className="text-footnote block text-[var(--label-2)]">{sub}</span>}</span>
      <Switch checked={checked} onChange={onChange} label={label} bare />
    </div>
  );
}
export function StepperRow({ label, value, unit, ...stepper }: …) {
  return (
    <div className="cell">
      <span className="flex-1">{label}</span>
      <span className="cell-value tabular-nums">{value}{unit}</span>
      <Stepper label={label} value={value} {...stepper} />
    </div>
  );
}
/** label + trailing value on line 1, slider on line 2 (Settings → Display & Brightness) */
export function SliderRow({ label, value, display, min, max, step, onChange }: …) {
  return (
    <div className="cell flex-col items-stretch gap-2">
      <div className="flex items-center justify-between"><span>{label}</span><span className="cell-value tabular-nums">{display}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${((value - min) / (max - min)) * 100}%` }} aria-label={label} />
    </div>
  );
}
/** Centred tinted action, iOS "Sign Out" style; destructive in red. */
export function ActionRow({ label, onClick, destructive, disabled, busy }: …) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`cell cell-tap w-full justify-center ${destructive ? "text-[var(--destructive)]" : "text-[var(--tint)]"} disabled:text-[var(--label-3)]`}>
      {busy ? <LoaderCircle size={16} className="animate-spin" /> : label}
    </button>
  );
}
/** Inline segmented inside a cell (label above when > 2 items would not fit next to it) */
export function SegmentedRow<K extends string>({ label, ...seg }: …) {
  return (
    <div className="cell flex-col items-stretch gap-2">
      <span>{label}</span>
      <Segmented {...seg} />
    </div>
  );
}
/** Multi-select: opens a Sheet (phone) / Menu (desktop) with checkmark rows */
export function MultiPickerRow({ label, values, items, onChange }: …) { /* value = items joined by ", ", chevron, opens <Sheet title={label}> with ChecklistRows */ }
```

`Segmented` in `ui.tsx`: remove the `chips` mode entirely; the thumb span becomes `className="absolute inset-0 -z-10 rounded-[7px] bg-[rgb(var(--bg-cell))] shadow-[0_3px_8px_rgb(0_0_0/.12),0_3px_1px_rgb(0_0_0/.04)]"`.

`Stepper` in `ui.tsx`: wrapper `className="stepper"`, buttons without `icon-btn`, icons `size={16} strokeWidth={2.25}`; drop the `<output>` (the value is shown by `StepperRow`), keep `aria-label` and `aria-live` on a visually hidden span.

`Switch`: add `bare` prop that renders only the `<button role="switch">` (no label layout) for use inside `SwitchRow`.

`Field` (label-above group): delete after migration; every label is now a row.

### 3.3 `Composer.tsx` → grouped form

Structure (phone and desktop share it; desktop lays the groups in two columns at `md`):

```tsx
<PageHeader title="Compose" subtitle={!hasPlaylist ? "Era, length and room; TDJ builds the tandas and the arc." : undefined}
  trailing={<>
    {hasPlaylist && <button className="icon-btn" aria-label="Export" onClick={() => setExportOpen(true)}><Share size={20} strokeWidth={1.75} /></button>}
    <Menu label="More" items={[
      hasPlaylist && { label: "Recompose with same seed", icon: Repeat2, onClick: () => run(playlist.options.seed) },
      hasPlaylist && { label: "Copy seed", icon: Copy, onClick: copySeed },
      hasPlaylist && { label: "Written review", icon: MessageSquareText, onClick: explain },
    ].filter(Boolean)} />
  </>}
/>

<div className="md:grid md:grid-cols-2 md:gap-x-6">
  <Group header="Night" footer="1 h is a práctica, 4 h a milonga, 8 h a marathon.">
    <SliderRow label="Length" display={`${hours} h · ≈${tandasEst} tandas`} min={1} max={8} step={0.5} value={hours} onChange={(v) => setOptions({ hours: v })} />
    <PickerRow label="Era" value={(options.eras ?? ["golden"])[0]} items={ERAS} onChange={(k) => setOptions({ eras: [k] })} />
    <SegmentedRow label="Arc" value={options.arc ?? "classic-two-peaks"} items={ARCS} onChange={(k) => setOptions({ arc: k })} />
    <PickerRow label="Shape inside a tanda" value={options.tandaShape ?? "rise-settle"} items={SHAPES} onChange={(k) => setOptions({ tandaShape: k })} />
    <SwitchRow label="Close with La Cumparsita" checked={options.closeWithCumparsita ?? true} onChange={(v) => setOptions({ closeWithCumparsita: v })} />
  </Group>

  <Group header="Cortinas" footer={cortinaStyle === "none" ? "Tandas follow each other without a break." : "Each cortina sits about 8 energy points under the tanda that follows."}>
    <SegmentedRow label="Style" value={cortinaStyle} items={CORTINA_STYLES_SHORT /* Matched / Same / None */} onChange={(k) => setOptions({ cortinaStyle: k })} />
    {cortinaStyle !== "none" && (<>
      <SegmentedRow label="Flavour" value={options.cortinaTrend ?? "mixed"} items={CORTINA_TRENDS} onChange={(k) => setOptions({ cortinaTrend: k })} />
      <MultiPickerRow label="Cultures" values={cultures} items={CULTURES.map((c) => [c, CULTURE_LABEL[c] ?? c])} onChange={(v) => setOptions({ cortinaCultures: v.length ? v : ["global"] })} />
      <StepperRow label="Length" value={options.cortinaLengthSec ?? 45} unit=" s" min={20} max={90} step={5} onChange={(v) => setOptions({ cortinaLengthSec: v })} />
    </>)}
  </Group>

  <div className="md:col-span-2"><ContextStrip … /></div>  {/* becomes a Group, §3.3a */}
</div>

{/* Desktop primary action: toolbar slot (sidebar toolbar at lg, pill right slot at sm) */}
<ToolbarPrimary>
  <button className="btn btn-primary hidden sm:inline-flex" onClick={() => run()} disabled={busy}>
    {busy ? <LoaderCircle size={18} className="animate-spin" /> : null} Compose
  </button>
</ToolbarPrimary>
```

Rules for this file:

- Remove the hero `<section>` entirely. On desktop with no playlist, render an `EmptyState`-style centred block under the form: `Vinyl` 120 px + `text-title3 font-serif` "Compose a milonga, tanda by tanda." + `text-subhead text-[var(--label-2)]` one sentence. On phone nothing (the subtitle under the large title carries it).
- `CORTINA_STYLES` labels shorten to "Matched", "Same all night", "None" so three fit in a segmented control at phone width.
- Status line (`role="status"`) stays, as a `section-foot` under the last group; error text in `text-[var(--destructive)]`.
- "N locked tandas stay on recompose" and "Using your database edits" become footers of the Result group, not loose spans.
- The phone compose accessory bar stays (one filled button + the Share icon-btn); its container gets `rounded-full` and `p-1.5`; the button is `btn btn-primary flex-1 min-h-[50px]` with no `Disc3` icon.

#### 3.3a `ContextStrip.tsx` → "Tonight" group

```tsx
<Group header="Tonight" footer={summary ?? "Nothing set: era, arc and cortinas alone shape the set."}>
  {CONTEXT_FIELDS.map((f) => {
    const v = value[f.key] as string | undefined;
    const r = researchOption(model, f.key, v);
    return (
      <PickerRow key={f.key} label={f.label} value={v} placeholder="Not set"
        items={f.options.map(([k, l]) => { const ro = researchOption(model, f.key, k)?.option; const s = ro ? fmtShift(ro.energyShift) : ""; return [k, s ? `${l} (${s})` : l]; })}
        onChange={(k) => set(f.key, k ?? "")}
        trailingDot={r?.option?.evidence ? EVIDENCE_COLOR[r.option.evidence] : undefined} />
    );
  })}
  {chosen > 0 && <ActionRow label="Clear tonight" onClick={() => onChange({})} />}
</Group>
```

`PickerRow` renders `trailingDot` as a 8 px circle before the value (evidence colour) with `title` = evidence label. On desktop ≥ md, the group uses `columns-2` via `md:grid md:grid-cols-2` on the `.group-inset` with the separator rule adjusted (`.group-inset.md\:grid .cell::before` → full width); simpler: render two `Group`s ("Tonight" with the first six factors, "Also tonight" with the rest) side by side at md.

### 3.4 `TandaCard.tsx` → Apple Music track list

A tanda becomes one inset group: a header row with the artwork tile, the track rows, a cortina footer row, a "Listen" row. Everything else moves to a context menu (desktop `•••` + right-click) and swipe actions (phone).

```tsx
<motion.article layout … id={`tanda-${i + 1}`} className={`group-inset ${active ? "ring-2 ring-[var(--tint)]" : ""} ${t.locked ? "ring-1 ring-[var(--system-gold)]/60" : ""}`}>
  <SwipeRow actions={[
      { kind: "lock", label: t.locked ? "Unlock" : "Lock", icon: t.locked ? LockOpen : Lock, onClick: () => { haptic(8); onLock(); } },
      { kind: "swap", label: "Swap", icon: Repeat2, onClick: onSwap, disabled: t.locked || busy },
    ]}>
    <div className="cell" data-leading="art">
      <div className="tile-art" data-rhythm={t.rhythm} aria-hidden>
        <span className="text-headline tabular-nums">{i + 1}</span>
      </div>
      <span className="min-w-0 flex-1">
        <span className="text-headline block truncate">{t.orchestra}</span>
        <span className="text-subhead block truncate text-[var(--label-2)]">
          {t.singer ?? "Instrumental"} · {t.yearRange ? `${t.yearRange[0]}–${t.yearRange[1]}` : "year ?"} · {PHASE[t.phase] ?? t.phase}
        </span>
      </span>
      <span className="text-right">
        <span className="text-headline block tabular-nums"><CountUp value={t.energy} from={prevEnergy ?? t.energy} duration={DUR.slow} /></span>
        <span className="text-caption1 block text-[var(--label-2)]">target {t.targetEnergy}</span>
      </span>
      {t.locked && <Lock size={14} strokeWidth={2.25} className="text-[var(--system-gold)]" aria-label="Locked" />}
      <Menu label={`Tanda ${i + 1} actions`} items={[
        { label: t.locked ? "Unlock" : "Lock", icon: t.locked ? LockOpen : Lock, onClick: onLock },
        { label: "Swap tanda", icon: Repeat2, onClick: onSwap, disabled: t.locked || busy },
        { label: listen ? "Hide player" : "Listen", icon: Headphones, onClick: () => setListen((v) => !v) },
      ]} className="hidden sm:inline-flex" />
    </div>
  </SwipeRow>

  <ol>
    {t.songs.map((s, k) => (
      <TrackRow key={s.id} n={k + 1} title={s.title} year={s.year} approx={s.yearApprox} energy={s.energy ?? 50}
        inFlight={swappingTrack === k} nudge={nudge?.k === k ? nudge.n : 0}
        onSwap={() => onSwapTrack(k)} disabled={t.locked} />
    ))}
  </ol>

  {t.cortina && (
    <button type="button" className="cell cell-tap w-full" onClick={() => setCortinaOpen((v) => !v)} aria-expanded={cortinaOpen}>
      <AudioLines size={16} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
      <span className="text-footnote min-w-0 flex-1 truncate text-[var(--label-2)]">
        Cortina · {t.cortina.artist} – {t.cortina.title} · {t.cortina.lengthSec ?? 45} s
      </span>
      <ChevronRight size={16} strokeWidth={2.5} className={`cell-chevron transition-transform ${cortinaOpen ? "rotate-90" : ""}`} aria-hidden />
    </button>
  )}
  {/* cortina preview + listen panel keep their AnimatePresence height animation, rendered as plain cells (no inner border box) */}
</motion.article>
```

`TrackRow.tsx` (Apple Music track row [M1][M4][M27]):

```tsx
<motion.li layout="position" variants={lineSwap} … className="cell" data-leading="num">
  <span className="text-subhead w-5 shrink-0 text-right tabular-nums text-[var(--label-2)]">{n}</span>
  <span className="min-w-0 flex-1 truncate">
    {title} <span className="text-[var(--label-2)]">{approx ? "c. " : ""}{year ?? "?"}</span>
  </span>
  <span className="text-subhead tabular-nums text-[var(--label-2)]" aria-label={`Energy ${energy} of 100`}>{energy}</span>
  <span className="relative hidden h-1 w-10 overflow-hidden rounded-full bg-[var(--fill-3)] sm:block" aria-hidden>
    <motion.span className="block h-full origin-left rounded-full bg-[var(--tint)]" animate={{ scaleX: energy / 100 }} transition={{ duration: DUR.slow, ease: EASE.inOut }} />
  </span>
  {/* desktop: swap appears on hover; phone: swipe */}
  <button type="button" onClick={onSwap} disabled={disabled} aria-label={`Swap track ${n}`}
    className="icon-btn hidden opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 sm:inline-flex"><Repeat2 size={18} strokeWidth={1.75} /></button>
</motion.li>
```

Wrap each `TrackRow` in `SwipeRow` with a single "Swap" action on phone. The `.cell[data-leading="num"] + .cell::before` separator inset is `calc(var(--cell-px) + 20px + 12px)`.

`SwipeRow.tsx`: `motion.div` with `drag="x"`, `dragConstraints={{ left: -(74 * actions.length), right: 0 }}`, `dragElastic={0.08}`, `dragDirectionLock`, snaps open at `< -40` and closed otherwise (`spring.gentle`); only one row open at a time (module-level `openRow` ref); actions rendered in `.swipe-actions` behind; full swipe past `-180` triggers the first action with `haptic(10)`. Disabled on `(hover: hover)` devices (render children only). Reduced motion: drag still works, snap is instant.

`Menu.tsx`: a `•••` `icon-btn` that opens a `.menu` popover anchored bottom-right (`position: absolute`, `top: 100%`, `right: 0`) with `role="menu"`, arrow-key navigation, Escape, click-outside; on `(hover: hover)` devices it also opens on `contextmenu` of the parent `.group-inset` (desktop context menu [M19][M20]). Enter with `scale .96 → 1, opacity 0 → 1` in `--dur-s`, transform origin top right. On phone, the same component renders as a `Sheet` with the items as rows (no tiny popovers on phone).

Remove from `TandaCard`: the rhythm pill, the `#9 · peak` line (phase moved into the subtitle), the `reason` paragraph, the "of N target" below the number (now `target 67` caption), both round icon buttons in the header, the Listen chip (now a menu item on desktop and a row on phone: add a `cell cell-tap` "Listen" row with `Headphones` leading and chevron for phone only, `sm:hidden`), the cortina bordered box, the Lottie cortina wave (keep `AudioLines`), the listen-bars Lottie.

`Listen.tsx`: `TandaListen` and `CortinaPreview` content renders inside a `cell` with `flex-col items-stretch`; the explanation sentences become `section-foot` text under the group. The Spotify iframe keeps `borderRadius: 12`.

### 3.5 `EnergyCurve.tsx` + result header → Health summary card

Result header in `Composer.tsx` (replaces the `surface rise` block's top):

```tsx
<Group header="Tonight's set" footer={`${fmtDuration(playlist.stats.durationSec)} · ${playlist.tandas.length} tandas · ${Object.keys(playlist.stats.orchestras).length} orchestras${lockedCount ? ` · ${lockedCount} locked` : ""}${dbChanges ? " · using your database edits" : ""}`}>
  <div className="cell flex-col items-stretch gap-3 py-4">
    <div className="flex items-baseline justify-between">
      <span className="text-subhead text-[var(--label-2)]">Score</span>
      <span className="text-footnote text-[var(--label-2)]">{playlist.score.verdict}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-large-title tabular-nums text-[var(--tint)]"><CountUp value={playlist.score.total} … /></span>
      <span className="text-title3 text-[var(--label-2)]">/100</span>
      <span className="text-title2 ml-auto font-serif">{playlist.name}</span>
    </div>
    <EnergyCurve compact={isPhone} p={playlist} active={active} onPick={…} />
  </div>
  <Row label="How this set scored" chevron onClick={() => setScoreOpen(true)} value={`${playlist.score.factors.length} factors`} />
  {playlists.some((p) => p.kind === "tandas") && <Row label="Mood check" sub="Aren León's reference tandas" chevron onClick={() => setMoodOpen(true)} />}
  <Row label="Written review" value={ai ? "Ready" : undefined} chevron onClick={explain} />
</Group>
```

The three rows open `Sheet`s: scored → inset group of rows (`label` left, `value` = `87 %`, a 4 px bar under the label in `var(--tint)`); mood → the two Spotify embeds; review → the text in `text-body` with `whitespace-pre-wrap`. The `<details>` elements go.

Chart edits in `EnergyCurve.tsx` (Health chart [M10][M11]):

- Y labels: only `50` and `100`, right-aligned at `x = W - 4`, `textAnchor="end"`, `fontSize 11`, `fillOpacity .5`; gridlines `strokeOpacity .12`, no dashed 50 line (solid, same opacity). Set `px = compact ? 8 : 12` on the left and reserve `28` on the right.
- Phase bands: keep, `fillOpacity` alternating `0 / 0.04`; phase labels `fontSize 11`, `fillOpacity .5`, x-axis label baseline `H - 6`.
- Target line: `strokeDasharray "3 4"`, `strokeOpacity .35`.
- Energy line: stroke `var(--tint)` (read via `getComputedStyle` once or pass as prop; SVG `stroke="var(--tint)"` works directly in inline SVG), width `2.5`; area gradient `.22 → 0`.
- Dots: radius `4.5` (compact) / `5.5`, active `+2`; the vals dot / milonga square markers stay (they are the only legend needed).
- Remove the `<figcaption>` legend. Add a single `text-caption1 text-[var(--label-2)]` line under the chart: "Line: energy · dashed: target · tango ● vals ◉ milonga ▣" rendered with the three tile colours (one line, no wrapping at 360 px).
- The `figure` gets `aria-describedby` pointing at that caption.

### 3.6 `ExportSheet.tsx` → native sheet with detents

Extract `Sheet.tsx` from the dialog scaffold (focus trap, Escape, scroll lock, restore). API: `<Sheet open onClose title detents={["medium","large"]} trailing={<Button>}>`.

Phone geometry: `fixed inset-x-0 bottom-0`, `material-thick`, `rounded-t-[var(--radius-l)]`, `pb-[env(safe-area-inset-bottom)]`, max-height `92dvh`; grabber `mx-auto mt-2 h-[5px] w-9 rounded-full bg-[var(--label-3)]`. Header: 44 pt row with the title centred `text-headline` and a glass circle X at the right (`icon-btn` with `material-thin` circle, iOS 26 style) [M16]. Detents: `motion.div` with `drag="y"`, snap points at `0` (large) and `large - mediumHeight` (medium = content height, measured once), dismiss when dragged past `+120` or velocity `> 600`; backdrop `bg-black/40` fades with drag progress. Desktop (`sm+`): centred panel `w-[540px] max-h-[80vh] rounded-[var(--radius-l)]`, no grabber, no drag; title bar with Cancel (left, `btn-plain`) and the title centred [M17]. Backdrop click closes. Keep `.glass-settling` behaviour (blur after the spring settles).

Export content:

```tsx
<Sheet open={open} onClose={onClose} title="Export">
  <Group footer={`${count} ${count === 1 ? "track" : "tracks"} will be exported${includeCortinas ? "" : ` (${cortinas} cortinas left out)`}.`}>
    <SwitchRow label="Include cortinas" checked={includeCortinas} onChange={setIncludeCortinas} />
  </Group>
  {GROUPS.map(([g, keys]) => (
    <Group key={g} header={g} footer={g === "DJ software" && noFolders ? <>Paths use a TDJ/ placeholder. Set each app's music folder in <Link href="/settings" className="text-[var(--tint)]">Settings</Link>.</> : undefined}>
      {keys.map((f) => (
        <Row key={f} tile={<span className="tile" style={{ background: TILE_COLOR[f] }}><FileDown size={16} strokeWidth={2} /></span>}
          label={EXPORT_META[f].label} sub={folderFor(f) ? `Paths under ${folderFor(f)}` : undefined}
          value={`.${EXPORT_META[f].ext}`} chevron onClick={() => dl(f)} busy={dlBusy === f} />
      ))}
    </Group>
  ))}
  <div className="px-4 pt-6">
    <button className="btn btn-primary w-full" …>{spotifyToken ? "Create playlist in Spotify" : "Connect Spotify and create playlist"}</button>
    {!settings.spotifyClientId && <p className="section-foot mt-2 text-center">Needs a Spotify Client ID. Add one in <Link href="/settings" className="text-[var(--tint)]">Settings</Link>.</p>}
  </div>
  {result && <ActionRow label="Open in Spotify" onClick={() => window.open(result)} />}
  {log.length > 0 && <Group header="Progress"><div className="cell text-footnote whitespace-pre-wrap text-[var(--label-2)]">{log.join("\n")}</div></Group>}
</Sheet>
```

`TILE_COLOR`: rekordbox `#111`, traktor `#1d6fd6`, serato `#111`, m3u8 `#ff9500`, xspf `#ff9500`, csv `#34c759`, json `#8e8e93`, setlist `#8e8e93`. Row busy state swaps the chevron for `LoaderCircle`. Remove the paragraph "Download a file for your DJ software, or create the playlist in Spotify." (the title says it).

### 3.7 `app/settings/page.tsx` → inset grouped Settings

```tsx
<div className="mx-auto max-w-[720px]">
  <PageHeader title="Settings" />
  <Group header="Spotify" footer="Create an app at developer.spotify.com (Premium account), add the redirect URI to it, then paste the Client ID. Connected, Listen plays the exact recordings.">
    <Row tile={<Tile color="#1db954"><Radio size={16} strokeWidth={2} /></Tile>} label="Status"
      value={spotifyToken ? `Connected · ${minutesLeft} min` : "Not connected"} />
    <Row label="Redirect URI" value={<span className="font-mono text-footnote">{redirect}</span>} chevron={false}>
      <button className="btn-plain" onClick={copyRedirect}>{copied ? "Copied" : "Copy"}</button>
    </Row>
    <label className="cell">
      <span className="flex-1">Client ID</span>
      <input id="spotify-client-id" className="field field-value w-[55%]" placeholder="Required" value={settings.spotifyClientId} onChange={…} autoComplete="off" spellCheck={false} />
    </label>
    <ActionRow label={spotifyToken ? "Reconnect" : "Connect Spotify"} onClick={() => beginAuth(settings.spotifyClientId)} disabled={!settings.spotifyClientId} />
    {spotifyToken && <ActionRow label="Disconnect" destructive onClick={() => setSpotifyToken(null)} />}
  </Group>

  <Group header="Written reviews" footer={test.text ?? "A model key lets you ask for a written review of a set and turns “Tell the DJ” into precise changes. Without a key, free text still works by keyword. The key is sent with your own requests only and never stored on the server."}>
    <Row tile={<Tile color="#5856d6"><KeyRound size={16} strokeWidth={2} /></Tile>} label="Status" value={ai.key ? "Key saved" : "No key"} />
    <SegmentedRow label="Provider" value={ai.provider} items={AI_PROVIDERS} onChange={switchProvider} />
    <label className="cell">
      <span className="flex-1">API key</span>
      <input id="ai-key" type={showKey ? "text" : "password"} className="field field-value w-[55%] font-mono" placeholder={KEY_PLACEHOLDER[ai.provider]} … />
      <button className="btn-plain" onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>{showKey ? "Hide" : "Show"}</button>
    </label>
    <label className="cell">
      <span className="flex-1">Model</span>
      <input id="ai-model" list="ai-model-list" className="field field-value w-[55%] font-mono" placeholder={AI_DEFAULT_MODEL[ai.provider]} … />
      <datalist id="ai-model-list">{…}</datalist>
    </label>
    <ActionRow label="Test connection" onClick={testConnection} disabled={!ai.key} busy={test.state === "busy"} />
  </Group>

  <Group header="DJ apps" footer={`Exports point at real paths once a folder is set. Files are expected as “${settings.fileNaming || DEFAULT_NAMING}.mp3”. Placeholders: {artist} {title} {orchestra} {singer} {year} {tanda} {n}.`}>
    <Row tile={<Tile color="#ff9500"><FolderOpen size={16} strokeWidth={2} /></Tile>} label="File naming">
      <input className="field field-value w-[55%] font-mono" value={settings.fileNaming} placeholder={DEFAULT_NAMING} … />
    </Row>
    {DJ_APPS.map((app) => (
      <Row key={app.id} label={app.label} sub={app.format} chevron onClick={() => setFolderFor(app.id)} value={settings.djApps[app.id]?.folder ? "Set" : "Not set"} />
    ))}
  </Group>
  {/* setFolderFor opens a Sheet titled app.label: one full-width field cell (font-mono), footer app.note, Done in the bar */}

  <Group header="Region" footer="Default for Tonight's region on the composer.">
    <PickerRow label="Where you usually play" value={settings.region} items={REGIONS} onChange={(r) => setSettings({ region: r })} />
  </Group>

  <Group header="Appearance" footer="Reduce transparency makes navigation and sheets solid; easier to read, lighter on the battery.">
    <SegmentedRow label="Theme" value={settings.theme} items={THEMES} onChange={(t) => setSettings({ theme: t })} />
    <SwitchRow label="Reduce transparency" checked={settings.reduceGlass} onChange={(v) => setSettings({ reduceGlass: v })} />
  </Group>
</div>
```

`Tile` = `<span className="tile" style={{ background }}>` with a 16 px white glyph. The status pill (`Badge`) is deleted; status is a trailing value. Section introductions become footers (one sentence shorter each). The model suggestion chips are deleted (`datalist` keeps them). Test result colour: `text-[var(--system-green)]` or `text-[var(--destructive)]` on the footer.

### 3.8 `app/library/page.tsx` → iOS search page

```tsx
<PageHeader title="Library" subtitle={meta && `${meta.meta.songs.toLocaleString()} recordings · ${meta.meta.orchestras} orchestras · ${meta.meta.singers} singers`}>
  <SearchField id="library-search" value={q} onChange={setQ} placeholder="Orchestra, singer, title or year" className="mt-3" />
</PageHeader>

{q.length >= 2 && rows.length > 0 && (
  <Group header={`${rows.length} results`}>
    {rows.map((s) => (
      <Row key={s.id} leading="art" tile={<span className="tile-art" data-rhythm={s.rhythm} aria-label={s.rhythm}>{RHYTHM_GLYPH[s.rhythm]}</span>}
        label={s.title} sub={`${s.orchestra}${s.singer ? ` · ${s.singer}` : ""}`}
        value={<><span className="tabular-nums">{s.year ?? "?"}</span><span className="text-footnote ml-2 tabular-nums text-[var(--label-3)]">{s.energy}</span></>} />
    ))}
  </Group>
)}
{q.length < 2 && meta && (
  <Group header="Orchestras" footer="Count is how many recordings the index holds.">
    {meta.orchestras.slice(0, 30).map((o) => (
      <Row key={o.id} label={o.name} value={o.count.toLocaleString()} chevron onClick={() => setQ(o.name)} />
    ))}
    <Row label="All orchestras" value={`${meta.orchestras.length}`} chevron onClick={() => setShowAll(true)} />
  </Group>
)}
```

`RHYTHM_GLYPH`: tango "T", vals "V", milonga "M" in `text-footnote font-semibold`; 'cancion' etc. use a `Music` glyph. Empty / no-match states use `EmptyState` with the text in `text-subhead`.

`SearchField.tsx`: `.search-field` with `Search size={16}`; `type="search"`; a `CircleX` clear button appears when `value`; on phone, focus shows a "Cancel" `btn-plain` to the right that blurs and clears; `enterKeyHint="search"`; `autoCapitalize="none"`. When the collapsed bar is active, the field is rendered inside the bar at `h-9` (the bar grows to 44 + 44 + 8).

### 3.9 `app/database/page.tsx` + `components/db/*` → editable grouped rows with Edit mode

Page:

```tsx
<PageHeader title="Database" subtitle={`Index built ${built} · ${meta?.meta.songs.toLocaleString() ?? "…"} songs · ${changes} ${changes === 1 ? "change" : "changes"}`}
  trailing={<>
    <button className="btn-plain" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit"}</button>
    <Menu label="More" items={[
      { label: "Import JSON…", icon: Upload, onClick: () => file.current?.click() },
      { label: "Export JSON", icon: Download, onClick: exportJson },
      { label: storageMode === "server" ? "Stored on the server" : "Stored in this browser", icon: HardDrive, disabled: true },
      { label: "Reset to index…", icon: RotateCcw, onClick: reset, destructive: true, disabled: !changes },
    ]} />
  </>}>
  <div className="mt-3"><Segmented label="Section" value={tab} onChange={setTab} items={TABS} /></div>
</PageHeader>
<DbEditContext.Provider value={editing}>{tab === "songs" && <SongsTab />}…</DbEditContext.Provider>
<p className="section-foot" role="status" aria-live="polite">{msg ?? "Every set you compose uses these edits."}</p>
```

`reset` uses a confirm `Sheet` (two actions: "Reset N changes" destructive, "Cancel") instead of `window.confirm` [M21]. The `Segmented` here fits five items at phone width because `.seg` is 13 pt and flexes.

`SongsTab.tsx`:

- Search field: `<SearchField id="db-search" placeholder="Title, orchestra, singer or year">`.
- Each result is a `Group` (header = none; first cell is the title cell): 

```tsx
<Group key={s.id} footer={edited ? "Edited · tap Revert in Edit mode" : undefined}>
  <div className="cell" data-leading="art">
    <span className="tile-art" data-rhythm={v.rhythm}>{RHYTHM_GLYPH[v.rhythm]}</span>
    <span className="min-w-0 flex-1"><span className="text-headline block truncate">{s.title}</span><span className="text-subhead block truncate text-[var(--label-2)]">{s.orchestra}{s.singer ? ` · ${s.singer}` : ""}</span></span>
    {editing && edited && <button className="btn-plain" onClick={() => revert(s.id)}>Revert</button>}
  </div>
  <ValueCell label="Year" editing={editing} value={p.year} placeholder={s.year} type="number" min={1900} max={2030} onChange={(n) => setField(s, "year", n)} />
  <ValueCell label="Singer" editing={editing} value={p.singer} placeholder={s.singer ?? "Instrumental"} onChange={(t) => setField(s, "singer", t)} />
  <PickerRow label="Rhythm" value={v.rhythm} items={RHYTHM_ITEMS} onChange={(r) => setField(s, "rhythm", r)} disabled={!editing} />
  <ValueCell label="Energy" editing={editing} value={p.energy} placeholder={s.energy} type="number" min={0} max={100} onChange={…} />
  <ValueCell label="BPM" editing={editing} value={p.bpm} placeholder={s.bpm ?? "–"} type="number" min={40} max={240} onChange={…} />
  <ValueCell label="Spotify" editing={editing} mono value={p.spotify?.uri} placeholder={s.spotify?.uri ?? "spotify:track:…"} onChange={…} />
  <SwitchRow label="Shown in sets" checked={!p.hidden} onChange={(on) => setField(s, "hidden", on ? undefined : true)} />
</Group>
```

`ValueCell` (in `db/shared.tsx`, replaces `Num`/`Text`): a `cell` with the label left and, when not editing, the effective value right in `cell-value` (edited values in `text-[var(--tint)]`, index values in `--label-2`); when editing, a right-aligned `field field-value` input with the index value as placeholder. The `cell-saved` pulse stays on the cell. `Edited` component is deleted.

Desktop (`lg+`): the same groups render in a two-column `grid` so two songs sit side by side; no table. (The nine-column table was the main "dashboard" tell.)

"Your own recordings": a `Group` with header "Your recordings", one `Row` per added song with a swipe-to-delete (`SwipeRow` action kind `destructive`, red, `Trash2`) on phone and a red `CircleMinus` leading button in Edit mode (Reminders style); "Add a recording" is an `ActionRow` that opens a `Sheet` with the form as value cells and a "Save" trailing bar button.

`OrchestrasTab.tsx`: search field + one `Group` per orchestra (name/count header cell, `ValueCell` Energy, `PickerRow` Style, `PickerRow` Tier, `ValueCell` Not before, a `Row` "Phases" whose value lists the chosen phases and opens a checklist `Sheet`, a `Row` "Singer years" with chevron that opens a `Sheet` of `ValueCell` pairs). Limit to 24 groups on screen, "Show more" `ActionRow`.

`RulesTab.tsx`: already row-shaped. Each numeric rule becomes `StepperRow` with `sub` = hint and the "Index default N" as the value when untouched; a set rule shows a `Revert` `btn-plain` in Edit mode. Track-energy and not-before overrides become `Group`s with rows + swipe delete + "Add…" `ActionRow` that opens a `Sheet`.

`CortinasTab.tsx`: `Group` "Cortinas" with one `Row` per cortina (tile with `AudioLines`, label `artist – title`, sub `genre · culture · energy`, value `lengthSec s`, chevron → edit `Sheet`). The JSON editor stays inside the sheet as a full-width mono `textarea` cell with the error as the footer in red.

`ContextTab.tsx`: one `Group` per factor with a header; each option is a `Row` (evidence dot leading, label) that expands (Disclosure) into five `ValueCell`s. The `details/table` goes.

### 3.10 `app/guide/page.tsx` → article typography

```tsx
<article className="mx-auto max-w-[680px]">
  <PageHeader title="How TDJ composes" subtitle="Rules from working DJs and the research behind the index." />
  <Group>
    {rows.map(([k, v]) => <div key={k} className="cell flex-col items-stretch gap-1 py-3"><span className="text-headline">{k}</span><span className="text-body text-[var(--label-2)]">{v}</span></div>)}
  </Group>
  <h2 className="text-title3 mt-8 px-4">What a great set takes into account</h2>
  <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">Five layers, from the notes inside a tanda to the booth.</p>
  <Group>{takes.map(…same cell…)}</Group>
  <Group header="Read more">
    <Row label="Factors, with sources" chevron onClick={() => window.open(…)} />
    <Row label="Rules the DJ follows" chevron onClick={() => window.open(…)} />
  </Group>
  {contextModel && (<>
    <h2 className="text-title3 mt-8 px-4">Context factors</h2>
    <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">What “Tonight” does. Shifts are energy points; vals and milonga are the share of the night.</p>
    {contextModel.factors.map((f) => (
      <Group key={f.id} header={f.label}>
        {f.options.map((o) => <Row key={o.id} tile={<span className="h-2 w-2 rounded-full" style={{ background: EVIDENCE_COLOR[o.evidence ?? "speculative"] }} />} label={o.label} sub={o.notes} value={bits.join(" · ")} />)}
      </Group>
    ))}
    <p className="section-foot">Dot: {Object.entries(EVIDENCE_LABEL).map(([k, l]) => `${l}`).join(" · ")}</p>
  </>)}
</article>
```

Links use `text-[var(--tint)]` and the external glyph `ExternalLink size={14}` trailing; no uppercase labels; body is 17/22.

### 3.11 `FeedbackBar.tsx` → "Adjust" group

```tsx
<Group header="Adjust" footer={note ?? "Locked tandas stay where they are."}>
  <div className="cell flex-wrap gap-2 py-3">
    {FEEDBACK_CHIPS.map(([k, l]) => <button key={k} className="chip" disabled={busy} onClick={() => onFeedback(k)}>{l}</button>)}
  </div>
  <form onSubmit={submit} className="cell">
    <input id="tell-dj" className="field flex-1" placeholder="Tell the DJ: warmer start, more vals, no Canaro" … />
    <button type="submit" className="icon-btn" disabled={busy || !text.trim()} aria-label="Apply">
      {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
    </button>
  </form>
</Group>
```

Chips are the one place chips remain (Waymo feedback [M18]); on phone they wrap (no horizontal scroll row). The send button is the iOS "arrow.up.circle.fill" idiom: give the `icon-btn::before` `background: var(--tint)` when enabled and the glyph white.

### 3.12 Haptic twins (phone) and their visual twin (everywhere)

`lib/haptics.ts` already wraps `navigator.vibrate`. Add named patterns and call them from the components above:

| Event | `haptic()` | Visual twin |
| --- | --- | --- |
| Tab change | 4 | pill lands (`spring.thumb`) |
| Segmented change | 4 | thumb slides |
| Switch toggle | 6 | knob squash |
| Picker change (select `onChange`) | 4 | value cross-fades 125 ms |
| Stepper tick | 4 | value nudge (existing) |
| Swipe action reveal threshold | 10 | row snaps open |
| Lock / unlock | 8 (existing) | icon dip |
| Compose finished | [8, 40, 8] | result group `rise` |
| Destructive confirm | [12, 30, 12] | sheet drops |
| Sheet reaches a detent | 6 | spring settle |

---

## 4. Layout rules

### 4.1 Desktop (≥ 1024 px): sidebar, toolbar, max widths

- Sidebar: `fixed left-0 top-0 h-dvh w-[220px]` with `material-thin` on top of the ambient layer, `pt-[max(1rem,env(safe-area-inset-top))] px-3`. Logo + "TDJ" (`text-headline`) at top, then the five items as macOS source-list rows: `h-9 rounded-[8px] px-3 text-subhead` with icon 18 at `strokeWidth 1.75`, selected row `bg-[var(--fill-3)]` and `text-[var(--label)]`, others `text-[var(--label-2)]`; the selected background is the existing `layoutId="nav-pill"` span. Bottom of the sidebar: "Settings" stays in the list (it is a tab on phone); nothing else [M26][M27].
- Toolbar: each page's `PageHeader` renders at lg a 52 pt toolbar row above the content: large title left (`text-title1` at lg, not 34), `trailing` actions right, primary action (`ToolbarPrimary` context) right-most as `btn btn-primary min-h-[36px] text-subhead`.
- Content column: `max-w-[980px]`; forms `max-w-[720px]`; article `max-w-[680px]`; the result and tanda list use the full 980 with tandas in `grid-cols-2 gap-4` (keep).
- Between 640 and 1024: no sidebar; the existing glass pill header is the toolbar (§3.1); content `max-w-[720px]`.
- Pointer: `cursor: default` on rows and buttons (macOS does not use the hand cursor for controls), `cursor: text` on fields, `cursor: pointer` only on links.
- Hover: rows get a 4 % fill; nothing lifts, scales or glows (motion-system anti-list).
- Context menus: right-click on a tanda group, a database group or a library row opens the same `Menu`.
- Keyboard: ⌘↩ composes, ⌘E exports, ⌘F focuses the search field on Library/Database, Esc closes sheets and menus. Show the shortcut as trailing `text-footnote text-[var(--label-3)]` in menu items (macOS style).

### 4.2 Toolbar actions per page

| Page | Trailing (all) | Primary (desktop toolbar / phone accessory bar) | `•••` |
| --- | --- | --- | --- |
| Compose | Share (when a set exists) | Compose | Recompose same seed, Copy seed, Written review |
| Library | none | none | none |
| Database | Edit / Done | none | Import, Export, storage status, Reset |
| Guide | none | none | none |
| Settings | none | none | none |

### 4.3 Phone (< 640 px)

- Safe areas: top via `PageHeader` padding and the collapsed bar's `pt-[env(safe-area-inset-top)]`; bottom via `main` padding `calc(env(safe-area-inset-bottom) + 150px)` on Compose (two bars) and `+ 84px` elsewhere (set by a `data-page` attribute on `main`, or by each page adding `pb-16`).
- Large title collapses at 56 px of scroll into the 44 pt bar (§3.1). On Library and Database the search field / segmented control moves into the bar.
- Tab bar minimises on downward scroll (§3.1) and the compose accessory goes with it; both return on the first upward scroll.
- 44 pt minimum targets everywhere: rows (`--cell-min`), `icon-btn`, `switch`, stepper halves at 44 on touch (§2.5), chips 44 on touch, segmented 40 on touch inside a 44 cell.
- Scroll-edge effects: `scroll-edge-top` and `scroll-edge-bottom` layers (§2.4) so content fades under the bars; they are purely decorative (`pointer-events: none`, `aria-hidden`).
- Inset groups: `mx-0` inside a `px-4` main (the 16 px gutter is the inset), radius 20.
- Swipe actions replace the per-row buttons (§3.4). Context menus render as sheets.
- Sheets open at the medium detent, drag to large, drag down to close; the keyboard pushes a sheet with a focused field to large.
- Pickers: `PickerRow` uses the native `<select>` so iOS shows its own picker; multi-select and long lists use a `Sheet` with checkmark rows (Apple Music add-to-playlist [M5]).
- Text in fields is 17 pt so iOS Safari does not zoom on focus.
- `overscroll-behavior-y: none` stays on `body`; sheets set `overscroll-behavior: contain`.
- `apple-mobile-web-app-status-bar-style` stays `black-translucent`; `theme-color` becomes `--bg-grouped` per scheme (`<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2efe9">` and dark `#0b0a10`).

### 4.4 Light and dark parity

- Light: `--bg-grouped` warm grey `#f2efe9` (cream-derived, not Apple's blue-grey), cells pure white, separators `text/0.16`, tint rose `#c9426a` (4.6:1 on white), ambient at 45 % opacity so the gradient reads as a wallpaper behind glass bars only.
- Dark: grouped ink `#0b0a10`, cells `#1a1824`, separators `cream/0.16`, tint `#e0557a`, switch `#30d158`, ambient as today but at 45 %.
- Glass: light uses `--material-regular` on white (72 %) with the sheen; dark uses the same alpha on `#181622` with the sheen reduced to 14 % (`.dark .glass::before { opacity: .6 }`).
- Elevated surfaces in dark (sheets, menus) use `--material-thick`; cells never get shadows in either scheme.
- Both schemes pass: body on cell ≥ 12:1, secondary label ≥ 4.5:1 (`text/0.6` on white = 5.7:1; cream/0.6 on `#1a1824` = 6.4:1), tint on cell ≥ 4.5:1, tertiary chevrons are decorative.
- Theme cross-fade (`html.theming`) is unchanged.

---

## 5. What to remove

Visual noise and duplicates, by file:

- `Nav.tsx`: "Tango DJ composer" subtitle; icons inside desktop tab chips (sidebar rows keep an icon; the pill header shows text only); the Lottie tab glow; the 12 px labels (10 pt).
- `Composer.tsx`: the hero card on every visit (kept as a desktop empty state only); the `Clock3` glyph next to Length; the three slider captions as inline text (footer); the `Disc3` icon on the Compose button and the `Dices` icon on Recompose; the "Recompose (same seed)" and "Export" buttons under the form (menu + toolbar); the seed chip; the "Get a written review" button; `<details>` summaries; `rise` on the result card (groups fade like everything else); the "Closing" card (La Cumparsita becomes the last `TrackRow` of the last tanda group, or a one-row `Group` with the `tile-art` tango glyph).
- `ContextStrip.tsx`: the chip-selects, the coloured dot inside the chip label, the "(−3)" inside chip labels (it stays inside the picker options), the "Room, crowd and calendar shape the set" hint.
- `TandaCard.tsx`: the uppercase rhythm pill; the "#9 · peak · 1945–1947" line (merged into the subtitle); the `reason` sentence; "of 67 target" under the number (now a caption "target 67"); both header icon buttons; the per-track round swap buttons; the per-track energy bar on phone (number only); the "Listen"/"Hide player" chip; the bordered cortina box, its bold "Cortina" prefix and `genre · energy` inline values (energy and genre move into the expanded preview footer); the cortina-wave and listen-bars Lotties.
- `EnergyCurve.tsx`: the 0 label, the dashed 50 gridline, the five-item legend.
- `ExportSheet.tsx`: the description paragraph; button grids; the tinted switch box; uppercase group headers become `section-head` (still uppercase, 13 pt, secondary).
- `settings/page.tsx`: the `Badge` pills; the section icon + heading rows (icon tiles live on the first row of each group); model suggestion chips; intro paragraphs as body text (footers); the "Keys stay in this browser…" subtitle (footer of the reviews group).
- `library/page.tsx`: the rose focus ring around the search pill; the 56 px uppercase rhythm column; the orchestra chip wall.
- `database/page.tsx` + `db/*`: the header card; the three ghost buttons; the storage pill; the nine-column table; bordered inputs; the "State · index / edited · revert" column; `window.confirm`.
- `guide/page.tsx`: uppercase rose/teal term labels; cards around prose.
- `globals.css`: `.ctx-chip*`, `.db-table*`, `.chip-row` phone mask, `.surface` (after migration), `btn-ghost` borders, `field` borders, the accent-coloured focus ring on search (focus-visible stays as a 2 px tint ring on buttons and rows only).
- Words: "AI" does not appear in the UI today and must not be introduced; the status line "Reading the set…" and the "Written reviews" title stay. Replace "Get a written review" with "Written review"; replace "Tell the DJ… e.g." with "Tell the DJ:"; drop "Choose as many as you like" (the multi-picker shows checkmarks); drop "Not quite right?" (header "Adjust").
- Emoji-like icons: none are emoji today; the only decorative glyphs are the Lotties listed above and `Vinyl` (kept only in the desktop empty state).

---

## 6. Implementation order and effort

S = under half a day, M = a day, L = two to three days. Each step leaves the app shippable.

1. **Tokens** (`globals.css` §2.1–2.5): add type scale, radii, label/fill/material/separator tokens, `group-inset`/`cell`/`section-*`/`search-field`/`stepper`/`menu`/`tile*` utilities; restyle `btn`, `icon-btn`, `field`, `segmented`, `switch`, `chip`, range. Keep `.surface` as an alias. Switch `body` to `--bg-grouped` and dim `.ambient`. — **M**
2. **Primitives**: `Form.tsx` (Group, Row, PickerRow, SwitchRow, StepperRow, SliderRow, SegmentedRow, ActionRow, MultiPickerRow), `SearchField.tsx`, `Sheet.tsx` (extracted from ExportSheet, with detents), `Menu.tsx`, `SwipeRow.tsx`; `ui.tsx` restyles (`Segmented` without `chips`, `Stepper` joined, `Switch bare`). — **L**
3. **Chrome**: `PageHeader.tsx` with large-title collapse; `Nav.tsx` tab bar (10 pt labels, minimise on scroll, search accessory), pill header as toolbar, sidebar at lg; `layout.tsx` main widths, scroll-edge layers, theme-color metas; `lib/hooks.ts` `useScrollDirection`. — **M**
4. **Settings** (`settings/page.tsx`): first full inset-grouped page; proves the primitives. — **S**
5. **Export** (`ExportSheet.tsx`): on the new `Sheet`, rows with tiles. — **S**
6. **Composer form** (`Composer.tsx`, `ContextStrip.tsx`): groups, pickers, slider row, multi-picker sheet for cultures, toolbar/menu actions, hero removal. — **M**
7. **Result + chart** (`Composer.tsx` result block, `EnergyCurve.tsx`): Health header, chart edits, three rows opening sheets. — **M**
8. **Tanda list** (`TandaCard.tsx`, new `TrackRow.tsx`, `Listen.tsx`): Apple Music rows, swipe actions, context menu, cortina row. — **L**
9. **Feedback** (`FeedbackBar.tsx`): Adjust group. — **S**
10. **Library** (`library/page.tsx`): search page, result rows, orchestras group. — **S**
11. **Database** (`database/page.tsx`, `db/shared.tsx` `ValueCell`, `SongsTab`, `OrchestrasTab`, `RulesTab`, `CortinasTab`, `ContextTab`): Edit mode, grouped rows, sheets for add/edit, confirm sheet. — **L**
12. **Guide** (`guide/page.tsx`): article typography. — **S**
13. **Cleanup**: delete `.surface`, `.ctx-chip`, `.db-table`, `Field`, `Badge`, `Edited`, `Num`, `Text`, unused Lotties and `anim/*.json` that nothing references; run the Playwright suite and update selectors (`data-testid="energy-path"`, `db-changes`, `empty-state` are kept). — **S**

Total: roughly three weeks for one engineer, with the first visible native feel (steps 1–5) after the first week.

---

## 7. Mobbin references and what each one lends

| # | Reference | Borrowed |
| --- | --- | --- |
| M1 | [Apple Music, Replay top songs](https://mobbin.com/screens/ec5c8c61-7012-416a-b2b0-52ae8993d2f9) | Numbered rows: rank, artwork tile, title 17 + subtitle 15 secondary, trailing `•••`; the shape of `TrackRow` and the tanda header. |
| M2 | [Apple Music, Playlists](https://mobbin.com/screens/f5205195-c3a7-4a63-a183-0b639887b47f) | Large title with the back/`+`/sort/`•••` glass circles in the bar; artwork tile + label + chevron rows; the Library orchestras group. |
| M3 | [Apple Music, Playlists (long)](https://mobbin.com/screens/eabdf610-5137-47b6-a550-8c2d32ff659d) | Separator inset to the text edge after a 56 pt tile (`data-leading="art"` rule); mini-player + tab bar + detached search capsule. |
| M4 | [Apple Music, Playlist detail](https://mobbin.com/screens/f78e3e00-5409-4d6a-a61e-d8a967b6f797) | Title centred under artwork, tinted artist line, "Add Music" as a tinted row with a tile, "Suggested Songs" as a card with a header + refresh glyph; the result group header pattern. |
| M5 | [Apple Music, add-to-playlist search](https://mobbin.com/screens/e9881c08-8c52-4b09-ad63-8427b40bafff) | Sheet with a search field under the title, a segmented control, rows with chevrons; the `MultiPickerRow` sheet and the Database search-in-bar. |
| M6 | [Copilot, Settings](https://mobbin.com/screens/59bb9a40-9c88-47fb-a603-af80be44600c) | Inset groups with a 17 pt header, trailing values ("Automatic", "Off") in secondary + chevron, toggles; the exact `Row` and `PickerRow` layout. |
| M7 | [Shopify, Settings](https://mobbin.com/screens/0235744d-9530-4d75-89ab-cbdcafa2b61e) | Large title "Settings" on a dark bar, rows with leading glyphs, Liquid Glass tab capsule with the search button detached on the left; the phone tab bar + search accessory. |
| M8 | [Brink, Settings](https://mobbin.com/screens/fcf3bca6-e466-48cf-829a-4e91451e606e) | Row with icon + title + 13 pt subtitle + chevron, "Mode · Light" value rows, centred sheet title with a glass X; the Settings DJ-apps rows and the sheet header. |
| M9 | [Lifesum, Settings](https://mobbin.com/screens/c7c496e0-364e-4412-8206-848b30d0f3d0) | Uppercase 13 pt section headers on a cream grouped background, white cells, "Premium"/"Connect" trailing values; the light-mode palette (`--bg-grouped` cream grey, white cells). |
| M10 | [Apple Health, Steps](https://mobbin.com/screens/ee42f048-62bf-4c45-af1c-9d4613c4398e) | Highlight card: caption, sentence, "Today 1,700 steps" big number in tint next to a grey "Average", chart below, "About Steps" article in 17 pt; the result header and the Guide typography. |
| M11 | [Apple Health, Blood Pressure](https://mobbin.com/screens/f6471b67-8921-4d71-826b-476849a1ec61) | Segmented period picker under the title, y-axis labels on the right, light gridlines, a tinted "Show All …" link row, glass tab bar; the chart edits in §3.5. |
| M12 | [Apple Music, Library edit mode](https://mobbin.com/screens/fa12db92-20f6-4803-93af-1eae3a2c0ed6) | Edit mode: checkmark leading, drag handles trailing, ✓ Done in a glass circle; the Database Edit/Done toggle and the edit-mode leading controls. |
| M13 | [Shopify, Search](https://mobbin.com/screens/904d082d-43f9-44c5-b3ed-97d26af9bad2) | Search field with a close circle on the left, scope chips under it, a glass X; the `SearchField` + Cancel behaviour on phone. |
| M14 | [Luma, Search on dark](https://mobbin.com/screens/62d5b671-19b5-4322-b133-6f22c9276155) | Dark Liquid Glass tab capsule with 10 pt labels over a blurred backdrop; dark-mode glass alpha and label sizes. |
| M15 | [Claude, Add to Chat sheet](https://mobbin.com/screens/42bb2da1-3873-4690-858f-dbfd808e6a6b) | Sheet with a centred title and glass X, tile buttons, then inset groups with trailing values + chevrons and a toggle; the Export sheet structure. |
| M16 | [Perplexity, Options sheet](https://mobbin.com/screens/d7220e78-7231-4822-ab69-169c863deff9) | Grabber, title left + X, rows with icon + title + 13 pt subtitle + trailing glyph; row-with-subtitle in the Export groups. |
| M17 | [Bumble, Report sheet](https://mobbin.com/screens/1621a627-3b03-4482-a226-e96ddf1bed87) | Sheet rows that are plain label + chevron on hairlines; the "How this set scored" / "Mood check" / "Written review" rows. |
| M18 | [Waymo, Feedback](https://mobbin.com/screens/7c6ac66b-81b0-469a-97b2-39099ad26f39) | Outlined 32 pt chips that wrap, with a selected one filled, above a text field and a filled primary; the only chip wall that stays (FeedbackBar). |
| M19 | [Mindtrip, Context menu](https://mobbin.com/screens/15bf8936-2045-48ad-a7d0-5369ecf8ea91) | Thick-material menu, 44 pt rows, glyph trailing, destructive row last in red; the `Menu` component. |
| M20 | [Mesh, Context menu](https://mobbin.com/screens/ca9b4efa-c08c-4192-bbc6-8b0ec30edc14) | Menu with leading glyphs, a submenu chevron, destructive "Delete"; desktop right-click on tanda groups. |
| M21 | [Shopify, Select mode + delete alert](https://mobbin.com/screens/8fc2001a-2cb5-408c-b35a-1d7e3b58bafe) | Selection count bar at the bottom and a centred confirm alert with Cancel / Delete; the Database reset confirmation. |
| M22 | [Shopify, Segments list](https://mobbin.com/screens/b8fd7555-20b2-43a9-bbe2-f7562dff89d6) | Filter field inside the card header with a sort glyph, rows of title + 13 pt timestamp; Orchestras/Cortinas tab lists. |
| M23 | [Brink, Podcasts selection](https://mobbin.com/screens/51b4a643-6f0c-4c9b-8b01-ee7027bad3c1) | Segmented control inside the card, "Select All / Clear" tinted row, checklist rows with artwork, a bottom search capsule; the multi-select sheet for Cultures and Phases. |
| M24 | [Rodeo, Search results](https://mobbin.com/screens/b6351124-9d6b-4e4e-ae93-c3b3d3827891) | Search field with clear + Cancel, result rows with a small tile, title 17, subtitle 13; Library results. |
| M25 | [Insight Timer, Search](https://mobbin.com/screens/6240cfd4-7755-4623-9f8b-89d94dfb1fd3) | The bare 36 pt search field with a placeholder that states the count ("Search 1,597 Live Events"); Library placeholder "Search 21,932 recordings". |
| M26 | [Apple Music web, album with context menu](https://mobbin.com/screens/ef86b595-0980-4f78-ad2b-87a350374fca) | 220 pt sidebar with 13 pt source-list rows, track table with hover row and a `•••` menu, durations right-aligned; the desktop sidebar and desktop track rows. |
| M27 | [Apple Music web, track list end](https://mobbin.com/screens/ffd1356a-86ec-4185-a19a-d48bf888d67a) | Track rows 3:44-style trailing numbers, a footer line in 11 pt secondary ("14 songs, 51 minutes"); the tanda group footer and `TrackRow` trailing number. |
| M28 | [Spotify, Playlist](https://mobbin.com/screens/e0e5c85e-1854-4ba0-bd09-c1c80a7b4d95) | Action chips row (Refine / Add / Mix / Edit) above the track list; what we are not doing (chips as actions) and the `•••` per row we are. |
| M29 | [Klarna onboarding](https://mobbin.com/flows/ece82567-bc12-4466-8b01-35cf7132c1a0) | Three glyph + sentence feature rows and a single Continue; if a first-run screen is ever added it is this shape, with the serif hero line above it. |

Mobbin's Shortcuts and Reminders screens were not in the result set; the parameter-row idea (label + tinted value + `chevron.up.chevron.down`) is taken from the Settings picker rows in M6 and M8, and the inline edit idea from M12.

---

## 8. Checks before merging each step

- Every text sits on the scale in §2.1 (grep for `text-sm`, `text-xs`, `text-lg`, `text-2xl`, `text-3xl`, `text-5xl` and replace).
- Every radius is `--radius-xs/s/m/l` (grep `rounded-xl`, `rounded-[16px]`, `rounded-2xl`).
- Every interactive element is ≥ 44 pt on `(hover: none)`.
- No border on cells, fields or chips; separators are hairlines, inset to the text.
- Exactly one tint; chevrons are tertiary; switches are green; destructive is red; gold marks locked.
- Glass only on: tab bar, search accessory, collapsed title bar, compose accessory, sheets, menus, sidebar.
- Reduced motion and reduced transparency still hold (motion-system §2.4–2.5).
- Playwright: `energy-path`, `db-changes`, `empty-state` test ids survive; add `data-testid="page-title"` on the large title and `data-testid="tab-bar"` on the nav.
