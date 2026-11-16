# Store screenshots and banners

What the App Store images and banners look like, why, and where they come from. Everything is generated from code
(`pnpm store:shots`, `apps/desktop/store/*`), so a UI change is one command away from new images.

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
