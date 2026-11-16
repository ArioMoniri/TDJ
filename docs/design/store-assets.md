# Store screenshots, header images, previews and banners

What the App Store images, videos and banners look like, why, and where they come from. Everything is generated from
code, so a UI change is one command away from new images: **`pnpm store:creative`** (store creative v2,
`apps/desktop/store/creative/*`, below) makes the screenshots, the product page header images and the app previews;
`pnpm store:banner` the README and social banners. The first set (v1, `pnpm store:shots`, `store/scenes.ts`) is kept
for the banners' captures and is described after v2.

## Store creative v2 (2026-11)

The owner: "for macOS, iPadOS and iOS no images are added in App Store Connect; design and create the best designs",
with three references: Agenda's set, playful colourful sets, and Apple's new product page Header and Search Results.

### What we looked at, and what we took

| Reference | What they do | What T-DJ takes |
|---|---|---|
| Agenda (App Store, iPhone and iPad sets) | one bold two-tone ground that runs through every panel; phones tilted a few degrees, some crossing into the next panel; two-line headlines with one heavy word; an award/quote panel | the panorama: one ground for the whole set (`art.ts → ground`), devices at ±3–4°, a second device on four edges (Booth → Now playing, Build → song sheet, Rooms → the other DJ, Library → Import), two-line headlines with one bold word. No award panel: T-DJ has no award or press quote to show, and an invented one is out |
| Playful colourful sets (big rounded type, one feature per panel) | one idea per panel, very large type, saturated colour | one feature per panel (eight), headline at 9–10 % of the panel width on iPhone (legible at the store's thumbnail size), the brand gradient at full saturation |
| Apple, Header and Search Results (App Store Connect Help → Creative assets specifications) | 21:9 header 3840×1646 (art safe area 1646×661 at 1097,493), 16:9 universal PNG 5244×2950 (safe 1402×962 at 1921,660), no alpha | the lockup and the words inside the safe area, centred; the laptop, iPad and iPhone outside it on both sides, so every crop shows the name and the line (`compose.ts → headerHtml`, tested in `creative.test.ts`) |
| appstore-screenshots skill (Expo/Maestro) | sizes per slot, short benefit-first captions, one screen per idea | its size table and caption rules; not its capture method (our app is captured from the bundled UI with the native side mocked) |
| Mobbin, iOS now-playing screens with synced lyrics (Apple Music, Spotify, Shazam, Deezer, Suno; searched 2026-11-16) | the real UI is the picture; lyrics fill the screen, the current line bright | real captures fill each device (no mock-ups, no placeholder data, tooltips hidden in the capture); Now playing with its lyrics is the device crossing from the Booth panel |

### The set

Eight panels, the same order on every display (`store/creative/spec.ts → PANELS`); headlines ≤ 30 characters, two
lines, one bold word (`*word*`), plain DJ words (the hype list in `spec.ts → HYPE` is tested):

| # | en-US | tr | Screen |
|---|---|---|---|
| 1 | Compose a **milonga** / in one tap | Tek dokunuşla / bir **milonga** | Compose, the featured night with its cover and arc |
| 2 | Play the night / from the **Booth** | Geceyi / **Kabin**'den çalın | the Booth playing; Now playing (lyrics) crossing into 3 |
| 3 | **Transitions** / you can hear | Duyabildiğiniz / **geçişler** | the transition editor with the clip's waveform, Fade picked |
| 4 | Build by hand / with a **checklist** | Elle kurun, / **liste** yanınızda | Build by hand after "Fill the rest"; the song sheet crossing into 5 |
| 5 | Each song's **DNA** / and its lyrics | Her şarkının / **DNA**'sı ve sözleri | Song DNA (Malena, Demare) |
| 6 | Two DJs, / one **room** | İki DJ, / tek **oda** | a room with two DJs; the other DJ's log crossing into 7 |
| 7 | A **Floor** screen / for the dancers | Dansçılar için / **Pist** ekranı | the Floor screen (until it ships: the Booth's full-screen Now playing) |
| 8 | Your **library**, / Spotify, files | **Kütüphane**, / Spotify ve dosyalar | the Library; Import (Spotify, files) at its side |

Colours: teal `#4FD1C5` → pink `#EE7C9E` → coral `#F4906A` (the brand's teal and rose, warmed at the end), ink
`#0B0A10` for the floor and the words (≥ 5:1 on every stop). Art, all in line and at 7–9 % opacity so the words
and screens stay first: records turning on the panel edges, a bandoneon (panels 2 and 7), a herringbone parquet in
the ink floor with a rose edge. Type: Fraunces 400 with the bold word at 800 (the brand's serif display), Inter for
small type. Frames are drawn in CSS (`art.ts → device`), no Apple product artwork: a phone with an island and side
buttons, a thin-bezel tablet, a laptop with a lid and base, the iPhone Duo folded (camera hole) and open (the fold
line down the middle, the 27.1 status bar on the trailing edge).

Sizes: iPhone 6.9" 1320×2868 and 6.5" 1284×2778, iPad 13" 2064×2752 and 12.9" 2048×2732, Mac 2880×1800 and
2560×1600, iPhone Duo outer 1398×2034 and inner 2853×2007; header 3840×1646 and universal 5244×2950; previews
iPhone 886×1920, iPad 1200×1600, Mac 1920×1080 (23.2 s, 30 fps, H.264 High 4.0 ~11 Mbps, AAC stereo 48 kHz, poster
at 5 s). The previews show the captures full screen with a few words on a brand-coloured pill per chapter (Compose,
Booth, Transition, Build, Song DNA, Rooms), between the lockup at the start and "For tango DJs" at the end; the sound
is an original synthesised marcato in A minor (`audio.ts`), no recording.

## v1 (2026-11-15): the first set

## What we looked at, and what we took

Checked in November 2026: the App Store pages of djay (Algoriddim), Serato DJ, Spotify, Apple Music and Tidal, the
screen-design archive at screensdesign.com, and Mobbin's iOS screens of music apps (Spotify's transition editor,
mixing and playback screens). Notes, not copies:

| Reference | What they do | What T-DJ takes |
|---|---|---|
| djay, Serato DJ | the real deck UI, large, one short line on top; no feature lists on the image | the capture fills most of the image; one headline per screen |
| Spotify, Apple Music, Tidal | one background for the whole set, short headlines in the brand face, a plain device body or none | one ink ground on every image (brand ink, rose glow, faint record grooves), Fraunces for the headline, a plain dark device body |
| Spotify's transition editor (Mobbin, iOS) | the transition itself is the picture: two waveforms, the curve, presets under it | the transition editor gets its own screenshot, opened on a real pair of songs with Fade picked |
| All of them | readable at thumbnail size: two-line headline at most, high contrast, the app's own colours carry the image | headline ≤ 38 characters, one supporting line ≤ 72, cream on ink, the rose used only for the small rule |

What we left out: marketing collages, badges and awards on the image, people photos, and long captions. The app's
screens are dense, so the images say one thing each and let the UI show the rest.

## The set

Seven scenes, the same order on every device (`apps/desktop/store/scenes.ts`):

1. Compose with the featured night: "A whole milonga, tanda by tanda"
2. The Booth playing: "Play the night from the Booth"
3. The transition editor: "Every gap, the way you want it"
4. Build by hand after "Fill the rest": "Or build it by hand"
5. Library search with a typo: "Type it wrong, still find it"
6. Database, orchestras heatmap: "Your own tango database"
7. Settings, what it learned: "It learns what fills your floor"

Turkish captions are written for Turkish DJs, not translated word by word, and use the app's own Turkish terms
(Kabin, Kendin oluştur, Pist dolu).

## Copy rules

Plain and specific, in a DJ's voice: name the thing on the screen (tandas, cortinas, La Cumparsita, Spotify Connect,
the silence between songs). Short sentences. No exclamation marks, no em-dash chains, no lists of three adjectives,
none of "seamless", "elevate", "unleash", "powerful", "effortless", and no "AI-powered" headline. The metadata test
(`apps/desktop/test/metadata.test.ts`) checks the store texts for these; the pipeline test checks caption lengths.

## Devices and frames

| Device | Capture (CSS px × scale) | Output | Frame |
|---|---|---|---|
| iPhone 6.9" | 440×956 × 3 | 1320×2868 | phone body, status bar, Dynamic Island, home indicator |
| iPhone 6.5" | 428×926 × 3 | 1284×2778 | same |
| iPad 13" / 12.9" | 1032×1376 / 1024×1366 × 2 | 2064×2752 / 2048×2732 | tablet body, status bar, home indicator |
| Mac | 1440×900 × 2 | 2880×1800 | window, no title bar (the app draws under it) |

The capture runs the bundled app with its native side mocked and the device's **safe areas emulated** (Chromium's
`Emulation.setSafeAreaInsetsOverride`), so the page lays out under the status bar and above the home indicator as it
does on the phone. The status bar is then drawn back in the frame: dark glyphs on light screens, light on dark,
as `UIStatusBarStyleDefault` does.

## Banners

`apps/desktop/store/banner.ts` draws `media/social-preview.png` (1280×640) and `media/store-banner.webp`
(2560×1280): the same ground, the dark lockup, the headline "Build a milonga the way a tango DJ does", and the Mac,
iPad and iPhone captures from the screenshot run. The README opens with the banner; GitHub's social preview is set
by hand once (Settings → Social preview).

Read every image before committing: `apps/desktop/store/out/contact-sheet.html` shows them all with the metadata
and its limits.
