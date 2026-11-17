# Releasing T-DJ: web, iPhone, iPad and Mac

How the apps are built, signed and shipped, what runs where, what it costs, and the few steps only the
owner can do. Design: [specs/r22-apps-plan.md](specs/r22-apps-plan.md). Owner checklist (manual path):
[APPLE_SETUP.md](APPLE_SETUP.md).

## What ships

| Artefact | Signed with | Goes to | Updates |
|---|---|---|---|
| `TDJ-macOS.dmg` — universal (Apple silicon + Intel), macOS 13+ | Developer ID Application, hardened runtime; app **and** DMG notarised + stapled | GitHub Release (README "Download for macOS") | in-app: `latest.json` on the newest release, the dialog shows the release notes, installs and relaunches |
| `TDJ-MacAppStore.pkg` — universal, App Sandbox | Apple Distribution + Mac Installer Distribution, Mac App Store profile | TestFlight → Mac App Store | App Store |
| `TDJ-iOS.ipa` — one universal app for iPhone and iPad, iOS/iPadOS 16+; iPhone portrait, iPad every orientation and Split View | Apple Distribution, iOS App Store profile | TestFlight → App Store | App Store |
| the web app (`apps/web`) | — | AWS (deploy-aws.yml), same commit | reload; Settings → About says when a newer version is live |

All three apps are the same Tauri 2 app (`apps/desktop`). Bundle ID `com.ariomoniri.tdj` on every platform (one
App Store record, universal purchase: iPhone, iPad and Mac), Team `FF68N39FU5`. Until 2026-11 the IPA was iPad-only
(`TARGETED_DEVICE_FAMILY "2"`); it is now `"1,2"` and the `ipad` target name still works as an alias of `ios`.

## One version, one commit (linked releases)

The **root `package.json` `version`** is the only version. Everything reads it through
`scripts/release/version.mjs`:

| Where | How |
|---|---|
| web app (Settings → About, `GET /api/version`) | `apps/web/next.config.ts` → `NEXT_PUBLIC_TDJ_VERSION` + `NEXT_PUBLIC_TDJ_COMMIT` (CI's SHA, else git) |
| bundled app UI (iPhone, iPad, Mac) | `apps/desktop/scripts/build-ui.mjs`, same variables, and `tdj-bundle.json` |
| Tauri (`CFBundleShortVersionString`) | `tauri.conf.json` → `"version": "../../../package.json"`; `Cargo.toml` / `Cargo.lock` kept equal |
| build number (`CFBundleVersion`, same for DMG, pkg and IPA) | UTC minutes since 2026-01-01, computed once per run |
| GitHub Release text | `scripts/release/release-notes.mjs`: the store's "what's new" + version, build, commit and every link |
| store links (App Store ID, public TestFlight link, web URL) | root `package.json` → `release` |

```bash
pnpm version:check            # every copy in sync (CI runs it; a v* tag must equal the version)
pnpm release:version 1.0.0    # bumps root, apps/desktop, apps/web, Cargo.toml, Cargo.lock
git commit -am "Release 1.0.0" && git tag v1.0.0 && git push origin HEAD v1.0.0
```

The tag starts **Release apps** (`release-apps.yml`) on that one commit: the `version` job fails if the tag and
`package.json` disagree, `apple` builds the DMG, the Mac App Store pkg and the iOS IPA with one build number,
`publish` publishes the GitHub Release, and `web` deploys the web app from the same commit through
`deploy-aws.yml` (called as a reusable workflow), whose last step reads `/api/version` and warns if it reports
another version. A manual run deploys the web only with `web: true`. Pushes to `main` still deploy the web on their
own (same version number, a newer commit: an open tab sees "A newer build of this version is live").

**Update notices, never automatic updates.** The web tab asks `/api/version` on load, every 30 minutes and when it
comes back to the front; if the server runs a newer version or another commit it shows a quiet toast outside the
Booth and an "Update available" row in Settings → About, and reloads only when the DJ taps it. The apps never call
home (standalone, "Data Not Collected"): About shows their version and where updates come from (App Store or
TestFlight; the DMG's own updater, which asks before installing). Store builds never link the DMG.

When App Review approves, run `node scripts/release/readme-store-badge.mjs`: it removes the README's "coming soon"
notes and sets `release.appStoreLive` to `true`, so About and the release notes link the App Store listing. A
public TestFlight link goes into `release.testflightUrl` (`https://testflight.apple.com/join/…`).

### Why App Review accepts it (guideline 4.2 / 2.5.2)

The apps are **standalone**: each works entirely on its own device. `apps/desktop/scripts/build-ui.mjs` builds
a static export of `apps/web` with `TDJ_TARGET=app` and ships it with the catalogue (`data/`) inside the app.
Every `/api/*` call is answered on the device by one client adapter (`apps/web/src/lib/app/adapter.ts`): the
same route handlers as the server (`apps/web/src/lib/api/*`) run with `@tdj/core` in a Web Worker, and the
server routes listed in `apps/web/scripts/device-routes.mjs` (the AI routes, song search, add a side, build by
hand, fill) ship unchanged, copied with their server imports pointed at `apps/web/src/lib/app/server/*`; the DJ's
database, history, settings and learned preferences live in SQLite (tauri-plugin-sql, versioned migrations in
`apps/web/src/lib/app/store.ts`). Lookups go out natively (`net_fetch`, `src-tauri/src/net.rs`: Deezer,
MusicBrainz, Cover Art Archive, Discogs); model calls run on the provider layer (`apps/web/src/lib/ai/*`) with a
native fetch (`model_fetch`) that puts the DJ's key from the Keychain in place of the page's mark, for that
provider's host only; the Mac app starts local ACP agents (`src-tauri/src/agents.rs`, `registerAcpSpawner`).
Spotify signs in with PKCE through `tdj://spotify-callback`,
tokens in the Keychain. A TDJ server is an opt-in link under Settings → Connections (off by default) for rooms,
database sync, Google and Dropbox (`src-tauri/src/bridge.rs`). No server address is built into the app.
`pnpm --filter @tdj/desktop standalone` runs the bundle in Chromium with the native side mocked and fails if
any request leaves the machine (only cover artwork from the services' image servers is allowed). Native
features on top:
menu bar with every command and shortcut, media keys / Now Playing, keep-awake during a night (IOKit on Mac,
idle timer on iPhone and iPad), linked music folders with security-scoped bookmarks, headphone cue output device
(Mac), native save panel and print, background audio on iPhone and iPad, an optional link to a self-hosted server,
offline playback of the composed night from local files. Nothing executable is downloaded.

Store compliance files: `src-tauri/PrivacyInfo.xcprivacy`, `Info.plist` / `Info.ios.plist`
(`ITSAppUsesNonExemptEncryption=false`, background audio, orientations, launch screen colour),
`entitlements/mac-appstore.plist` (sandbox: network client, user-selected files, app-scoped bookmarks,
print), `entitlements/mac-dmg.plist` (hardened runtime, no exceptions), icons for every size
(`pnpm --filter @tdj/desktop icons`, iPhone and iPad icons without alpha), metadata in `apps/desktop/fastlane/metadata`
(en-US + tr, limits tested), App Privacy + age rating answers in `apps/desktop/fastlane/app_privacy.md`,
privacy policy [PRIVACY.md](PRIVACY.md).

## What only the owner can do (no API exists)

| # | Step | Link | Time |
|---|---|---|---|
| 1 | Create the **App Store Connect API key** (Team Keys; access *App Manager*, or *Admin* so the Developer ID certificate can be created automatically). Download the `.p8` once. | https://appstoreconnect.apple.com/access/integrations/api | 2 min |
| 2 | Create the **app record**: + → New App → platforms iOS **and** macOS, name `T-DJ` (created: Apple ID 6834924534), English (U.S.), bundle ID `com.ariomoniri.tdj` (registered by the scripts if missing), SKU `tdj`. Then add the Turkish localisation. | https://appstoreconnect.apple.com/apps | 3 min |
| 3 | Accept any pending agreement banner (a free app needs no paid agreement). | https://appstoreconnect.apple.com/business | 1 min |
| 4 | **App Privacy** answers and the newer age-rating questions (AI: yes). Copy from `apps/desktop/fastlane/app_privacy.md`. | the app → App Privacy / version → Age Rating | 3 min |
| 5 | **Spotify**: add redirect URI `tdj://spotify-callback` and the iOS bundle ID `com.ariomoniri.tdj`. | https://developer.spotify.com/dashboard | 1 min |
| 6 | Only if the API refuses the **Developer ID** certificate (non-Admin key): upload the CSR the script printed at "+ → Developer ID Application (G2)", download the `.cer`, rerun with `--devid-cer`. | https://developer.apple.com/account/resources/certificates/add | 2 min |
| 7 | Later, for Apple Music playback: enable **MusicKit** on the App ID and create a MusicKit key / Media ID. | https://developer.apple.com/account/resources/identifiers/list · https://developer.apple.com/account/resources/authkeys/add | 3 min |
| 8 | Buy cloud-Mac credit (if releasing from a rented Mac) and approve each App Review submission. | — | — |

Everything else is automated: bundle ID and capabilities, certificates (CSRs made on the build machine,
private keys never leave it), provisioning profiles, signing, notarisation, TestFlight uploads, metadata and
screenshots, the GitHub Release. To set the GitHub side in one go from your own computer (secrets via stdin,
all as repository secrets):

```bash
node packages/cli/bin/tdj.mjs apple        # or: npx tdj-deploy apple
```

## Route A — a rented Mac in one session (current plan)

The owner enters the API key on the Mac through the provider's secure-secret links (never in chat):
`APP_STORE_CONNECT_ISSUER_ID` and `APP_STORE_CONNECT_KEY_ID` as environment variables and the key file at
`~/.appstoreconnect/private_keys/AuthKey_TDJ.p8`. The app record (step 2 above) must already exist.

```bash
# 1. code (kept on the persistent drive; a private repository needs `gh auth login` or a token first)
mkdir -p ~/drive/src && cd ~/drive/src
[ -d TDJ ] || git clone https://github.com/ArioMoniri/TDJ.git
cd TDJ && git fetch origin && git checkout <release-branch-or-tag> && git pull --ff-only || true

# 2. everything in one pass (toolchains, signing, DMG + notarisation, MAS pkg, iOS IPA, TestFlight uploads)
mkdir -p ~/drive/tdj-out
scripts/release/mac-build.sh --targets dmg,mas,ios 2>&1 | tee ~/drive/tdj-out/last.log

# 3. optional, same session: draft GitHub Release with the DMG (needs `gh auth login` on the Mac)
scripts/release/mac-build.sh --targets dmg --github-release   # reuses the build cache: ~3 min + notarisation
```

What persists in `~/drive` (so the next session is fast): `rustup`, `cargo`, `node`, `pnpm-store`,
`tdj-target` (Rust build cache), `tdj-signing/` (owner-only: `.p12` files, random passwords, profiles, the
signing keychain and its password, the updater key), `tdj-out/<version>-<build>/` (artefacts + logs).
**Back up `~/drive/tdj-signing/updater.key*`**: every future DMG update must be signed with it
(`tdj apple --updater-key ~/drive/tdj-signing/updater.key` stores it in GitHub).

Expected Mac time (Apple-silicon cloud Mac):

| Step | First session | Next sessions |
|---|---|---|
| Toolchains (rustup + 3 targets, Node, pnpm install, xcodegen) | 5–7 min | < 1 min |
| Signing via API (bundle ID, 3 certificates, 2 profiles) | 1 min | 10 s (reused) |
| Bundled UI (static export) | 1–2 min | 1–2 min |
| DMG: universal release build (2 architectures, LTO) | 10–14 min | 3–5 min |
| Notarisation (app by Tauri, then DMG) | 4–10 min | 4–10 min |
| Mac App Store build (app crate relinks only) + pkg | 3–5 min | 3–5 min |
| iOS (iPhone + iPad): `tauri ios init` (once), arm64 build, archive + export | 8–12 min | 4–6 min |
| Uploads (pkg + ipa) | 2–4 min | 2–4 min |
| **Total** | **35–55 min** | **18–30 min** |

At $0.90/h that is under $1 per session; the $10 budget covers ten full releases. Plan one 90-minute
session for the first release (headroom for a retry). After the first run, commit
`apps/desktop/src-tauri/gen/apple` (created by `tauri ios init`) from the Mac or copy it back, so later
builds skip that step.

If a step fails, rerun with only the remaining targets (`--targets mas,ios`); signing and caches are
reused. `--no-upload` builds without TestFlight, `--metadata` also uploads store texts and screenshots from
the Mac (they are normally uploaded from Linux, below).

## Route B — GitHub Actions (automated releases later)

| Workflow | Runner | When | What |
|---|---|---|---|
| **Native check** (`native-check.yml`) | Linux | PRs touching the apps, CLI, release scripts or workflows | `cargo fmt/clippy/test`, macOS + iPadOS type-check from Linux, release-script tests (mocked API), CLI tests, metadata limits, shellcheck, actionlint |
| **Store assets** (`store-assets.yml`) | Linux | PRs touching metadata, store pipeline, `apps/web/src` or `apps/video/src`; manual | `pnpm store:creative` on a runner: screenshot sets (iPhone 6.9"/6.5", iPad 13"/12.9", Mac 2880/2560, iPhone Duo outer/inner), Header and Search Results images, app previews, en-US + tr, banners, review page artifact; with `upload`: `fastlane deliver` metadata + screenshots + app previews (iOS, then Mac), then `scripts/asset-library.mjs` (iPhone Duo, Header and Search Results) |
| **Apple setup** (`apple-setup.yml`) | Linux | manual | the same idempotent signing setup through the API; stores `.p12` + passwords + profiles in AWS SSM `/tdj/apple/*` with the deploy OIDC role |
| **Release apps** (`release-apps.yml`) | **one macOS job** | `v*` tag or manual | checks the tag against `package.json`, runs `scripts/release/mac-build.sh` (signing from SSM, else the repository secrets), publishes the release, deploys the web from the same commit, then uploads metadata and submits for App Review |
| **Check secrets** (`check-secrets.yml`) | Linux | manual, or when that file changes | prints only `true/false` per expected secret/variable name |

Cost: GitHub-hosted macOS minutes are free for public repositories; for a private repository they count
10× (one release ≈ 25–45 min ≈ 250–450 Linux-equivalent minutes). Everything else runs on Linux. Signing
secrets are repository secrets (the owner's choice); GitHub never passes secrets to workflows run from forks.

Release:
```bash
pnpm release:version 1.0.0 && git commit -am "Release 1.0.0"
git tag v1.0.0 && git push origin HEAD v1.0.0   # or Actions → Release apps → Run workflow (channel, targets, web)
```
When App Review approves the iOS and Mac App Store build, `node scripts/release/readme-store-badge.mjs` (above).

Build number = UTC minutes since 2026-01-01 (monotonic, the same for the DMG, pkg and IPA of one run);
marketing version = the root `package.json` (a tag must match it).

## Store texts and screenshots

`apps/desktop/fastlane/metadata/<locale>/*.txt` (en-US, tr) — edit in a PR; `pnpm --filter @tdj/desktop test`
checks every App Store limit (keywords ≤ 100 bytes, name/subtitle ≤ 30, promo ≤ 170, description ≤ 4000), that the
description names what the app does on each device, and that the copy stays plain (no exclamation marks, em dashes
or hype words). Review notes: `metadata/review_information/notes.txt` (no demo account; iPhone steps included).

Screenshots, header images and app previews, **one command** (Linux or Mac; Chromium, Remotion, ffmpeg; ~45 min):

```bash
pnpm store:creative                          # = pnpm --filter @tdj/desktop store:creative → apps/desktop/fastlane/
pnpm store:creative --out=/tmp/drafts        # a draft somewhere else; --reuse-ui skips the UI build
open apps/desktop/fastlane/store-creative.html
```

It builds the bundled UI, captures every shot with the native side mocked on five capture devices (iPhone, iPad,
Mac, iPhone Duo folded and open; safe areas emulated; Rooms with two DJs through a linked server held in memory,
`store/creative/rooms.ts`), draws each set as one panorama cut into eight panels (`store/creative/compose.ts`),
draws the product page header images, renders the app previews with Remotion (`apps/video/src/StorePreview.tsx`,
an original synthesised bed, `store/creative/audio.ts`), re-encodes them to Apple's spec with ffmpeg and checks
them with ffprobe, writes the review page, and deletes the raw captures. Memory: one Chromium at a time, one static
server (`PORT`, default 3986), Remotion at concurrency 1. Parts: `--sets=iphone69,mac --previews=iphone
--no-previews --no-headers --locales=tr --skip-capture --keep-raw`. Words, shots and sizes:
`apps/desktop/store/creative/spec.ts`; design notes: [design/store-assets.md](design/store-assets.md). Tests:
`apps/desktop/test/creative.test.ts` (sizes, limits, safe areas, file names, the rendered files).

| Folder (`apps/desktop/fastlane/`) | What | Uploaded by |
|---|---|---|
| `screenshots/<locale>/` | iPhone 6.9" 1320×2868, iPhone 6.5" 1284×2778, iPad 13" 2064×2752 (8 each) | `fastlane ios metadata` (deliver picks the slot from the size) |
| `screenshots_ipad129/<locale>/` | iPad 12.9" 2048×2732 | `fastlane ios metadata ipad:129` instead of the 13" set (same App Store Connect slot) |
| `screenshots_mac/<locale>/` | Mac 2880×1800 | `fastlane mac metadata` |
| `screenshots_mac2560/<locale>/` | Mac 2560×1600 | `fastlane mac metadata mac:2560` instead of the 2880 set (one Mac slot) |
| `app_previews/<locale>/` | iPhone 886×1920 (`IPHONE_67`, the 6.9" slot; 6.5" falls back to it), iPad 1200×1600 (`IPAD_PRO_3GEN_129`, 13") | `fastlane ios metadata` (`app_previews_path`, poster frame at 5 s, previous previews replaced) |
| `app_previews_mac/<locale>/` | Mac 1920×1080 (`DESKTOP`) | `fastlane mac metadata` |
| `app_previews_posters/<locale>/` | the poster frames (5 s), for review | — |
| `screenshots_duo/<locale>/` | iPhone Duo outer 1398×2034, inner 2853×2007 | `scripts/asset-library.mjs` after deliver (below) |
| `product_page/<locale>/` | Header 3840×1646 (21:9), Universal 5244×2950 (16:9 PNG, header and search results) | `scripts/asset-library.mjs` after deliver (below) |

### App Asset Library: iPhone Duo and Header and Search Results (API, checked 2026-11-17)

deliver's set-based screenshot API cannot place these, but App Store Connect API 4.5.1 added the **App Asset
Library**, which can: an image is uploaded once into the app's library, then a *placement* puts it on the App Store
version localization with a placement type (`APP_SCREENSHOT`, `APP_PREVIEW`, `PRODUCT_PAGE_HEADER_ASSET`,
`APP_STORE_SEARCH_RESULTS_ASSET`) and a placement group (a device family; iPhone Duo is display class `IPHONE_DUO`).
Group ids are not an enum: they come from `GET /v1/appAssetLibraryRefData` at run time. The set-based
`appScreenshotSets`/`appPreviewSets` resources are deprecated since 4.5.1. Apple:
[4.5.1 release notes](https://developer.apple.com/documentation/appstoreconnectapi/app-store-connect-api-4-5-1-release-notes),
[Understanding the App Asset Library](https://developer.apple.com/documentation/appstoreconnectapi/understanding-the-app-asset-library),
[Placing assets](https://developer.apple.com/documentation/appstoreconnectapi/placing-assets-on-your-app-store-surfaces),
[Discovering asset specifications](https://developer.apple.com/documentation/appstoreconnectapi/discovering-asset-specifications).

`apps/desktop/scripts/asset-library.mjs` (no dependencies; the same API key as deliver, read by
`scripts/release/asc.mjs`; needs the Admin or App Manager role) does it, and the **Store assets** workflow runs it
after deliver when `upload` is set:

```bash
cd apps/desktop
node scripts/asset-library.mjs --dry-run                       # read-only: the plan per locale and slot
node scripts/asset-library.mjs                                 # iOS: Duo outer + inner, Duo preview, header images
node scripts/asset-library.mjs --platform MAC_OS --only header # Mac: header images
# --locales en-US,tr  --version 1.2.0  --dir <fastlane dir>  --timeout 900 (s per asset)
```

- **What goes where.** Each file's slot comes from Apple's catalog: the spec whose size matches the file, the group
  whose mapping lists that spec, and (for Duo) the group whose display class is `IPHONE_DUO`. Outer and inner go
  where the catalog says, in file-name order. Header: the 21:9 file takes every header slot it fits; the universal
  file takes search results and the header slots left over (a size-specific spec wins over a universal one). The iPhone
  preview goes on the Duo `APP_PREVIEW` group with the poster at 5 s only if Apple matches it to a spec that group
  takes; otherwise the script says so and the preview stays a manual step (below).
- **Checks first.** Every locale is planned before anything is written: a file no spec takes, an alpha channel the
  spec forbids, no Duo group (or two) for a size, or more files than the version allows per group (10 screenshots,
  3 previews, 1 header) stops the run with the reason. If the catalog ever puts outer and inner in **one** group of
  10, the run stops instead of cutting the 16 files: make fewer panels (`store/creative/spec.ts`) and rerun.
- **Idempotent.** Each asset's `referenceName` is `tdj:<sha256 prefix>:<file name>`. A slot that already shows the
  same files in the same order is left alone; a file already in the library is reused, not uploaded again.
  Otherwise the new files are reserved, uploaded to Apple's upload URLs (no token sent there), committed and polled
  until processed (`PREPARE_FOR_SUBMISSION`/`COMPLETE`; `FAILED` stops with Apple's `stateDetails`), and the
  processed `specId` is checked; only then are the slot's old placements deleted, the new ones created and ordered
  (`appAssetLibraryPlacementOrderingRequests`), and our old assets that no placement uses any more deleted.
- **Needs an editable version** (`PREPARE_FOR_SUBMISSION`, rejected, `READY_FOR_REVIEW`) with the locale; deliver
  creates both. A released app's header changes therefore go with the next version through the API; from the web
  UI's Asset Library it can be submitted on its own.
- **Order.** Run it after deliver: `overwrite_screenshots` clears the version's screenshot sets, and since fastlane
  2.241.1 deliver knows an `APP_IPHONE_DUO` set, so the Duo placements may go with them; the script then puts them
  back from the library without uploading again. Tests: `apps/desktop/test/asset-library.test.ts` (mocked API).

The first run against the real account: `--dry-run`, read the groups it names, then the real run, then look at
App Store Connect → the version → Previews and Screenshots → iPhone Duo, and Product Page Information → Header and
Search Results → Preview (iPhone, iPad and Mac crops, both languages).

### Still by hand (only if the script says so)

- **iPhone Duo app preview**, when the script prints "not placed (set it by hand)" or "which this group does not
  take": App Store Connect → T-DJ → the iOS version → Previews and Screenshots → iPhone → iPhone Duo → drag
  `app_previews/<locale>/IPHONE_67_tdj.mp4` → **Set poster frame** at 0:05 → Save; repeat for Turkish.

### iPhone Duo: what the iOS app needs

- **Sizes.** Outer display 1398×2034 px (466×678 pt at 3x, portrait, a camera region at the top), inner display
  2853×2007 px open like a book (951×669 pt, the fold down the middle; 2007×2853 rotated). Apple publishes no point
  sizes: these are the screenshot sizes at 3x, to confirm in Device Hub's iPhone Duo simulator (Xcode 27.1).
- **Build with the iOS 27.1 SDK** so the app runs edge to edge on both displays (toolbars and tab bars move below the
  status bar, which is a vertical bar on the trailing edge when open: insets differ left and right). Older SDKs get a
  centred window with empty space around it.
- **Info.ios.plist.** The app is already universal (`TARGETED_DEVICE_FAMILY "1,2"`). The inner display ignores
  `UISupportedInterfaceOrientations` (the iPhone's portrait-only key does not hold it in portrait), and since iOS 27
  `UIRequiresFullScreen` no longer opts out of resizing: no key change is needed, but nothing may assume portrait.
  `UIApplicationSupportsMultipleScenes` stays off (one window; the outer display cannot open a second one).
  `UILaunchScreen` (the ink colour) works for both displays; there is no storyboard to size.
- **Layout.** The app is the web UI in a WKWebView: a fold or unfold is a resize of the same page (iOS resizes the
  scene discretely), so the CSS breakpoints decide the layout. Folded (466 pt) it is the phone layout (tab bar); open
  (951 pt) it is the tablet layout (navigation pill, `sm`–`lg`); the two-column sidebar layout starts at `lg`
  (1024 pt), so the open Duo does not get it today (see the UI notes in the store-creative report). A resize must not
  reload the page or interrupt the Booth: `apps/web/e2e/duo-fold.spec.ts` folds and unfolds mid-night in every
  posture (projects `iphone-duo-*` in `playwright.config.ts`) and checks no reload, the same song still playing,
  the clock moving, and the navigation for each width. The layout specs (`wave4-mobile`, `booth-ui2`, `qa`) run
  iPhone Duo folded and open in their matrices: `cd apps/web && pnpm e2e --grep "iPhone Duo|iphone-duo"`.
- **Native side.** Nothing reads `UIDevice.orientation` or the screen size in `src-tauri`; the keep-awake idle timer
  and background audio are per app, not per display.

### README media

All README media are real captures of the app, framed by apps/video (Remotion): one 16:10 column at 840 px
(GIFs at 1680 px where they fit under 8 MB, else 840; `pnpm readme:check` enforces 8 MB, GitHub stops inlining at 10).
The devices are our own 3D models (three.js in Remotion, `apps/video/src/three/`; public dimensions only, no product
images, renders or logos): a 14-inch-class laptop (31.26 × 22.12 × 1.55 cm, anodised aluminium, a real key layout,
trackpad, grilles, notch, hinge, feet), an iPad-class tablet and a 393 × 852 pt phone with a titanium band and a
camera cutout. `pnpm media:frames` renders each straight on with a transparent screen to
`apps/video/public/frames/<kind>.png` (committed); `apps/video/src/frames.ts` lays them around the clips and stills
and draws the phone's status bar. Lighting is three's generated studio room (no HDRI download), rendered in software
GL (`--gl=swangle`).

| Command | Makes | Takes (cloud machine, one Chromium, Remotion at concurrency 2) |
|---|---|---|
| `pnpm media` | the clips (`media/readme/<clip>.{mp4,gif}`) and stills (`.webp`) | see the header of `apps/web/scripts/capture-media.ts` |
| `pnpm media:frames` | the device pictures (phone, tablet, laptop) | ~25 s each |
| `pnpm media:hero` | the hero under the tagline: the 3D laptop orbits, opens and wakes, the app plays on it square on, then it shuts for the loop; `hero.{gif,mp4,webm}` (1920 × 1200 master), README line updated | capture ~2 min; rest still ~25 s; render ~20 min at load 20–27 (software GL, concurrency 2); MP4 + WebM ~2 min; GIF 960 px / 24 fps ≈ 7 MB |
| `pnpm media:hero --draft` | the same as `hero-draft.*`, README untouched | |

Both need a production server: `pnpm --filter @tdj/web build && pnpm --filter @tdj/web start -p 3975`, then
`TDJ_URL=http://localhost:3975 pnpm media:hero`. Captures run with the app's capture flag (`?capture=1`, set by the
recorder): no help tag or hint bubble ever shows by the cursor; the cursor and click ripples are drawn by apps/video.
Song previews are answered with a synthesised tango (`apps/web/scripts/media/tango-audio.ts`: bass and piano
marcato, bandoneón line, string pad, phrase stops), so waveforms look like music; no recorded audio is shipped.
`--skip=capture` re-composes the last capture; `--keep-master` keeps the lossless composite so
`--skip=capture,render` only re-encodes; `--blur=4` adds camera motion blur on the lid (4 WebGL renders a frame
there: only on an idle machine). While the app plays the laptop is a still rendered once (`hero-rest.png`) with the
video on the screen's projected rectangle: the camera is square to the screen and holds still, which keeps the
render cheap and the GIF small.

## Mac checks (need real hardware; first TestFlight build)

- Sign in to Spotify / Dropbox in the fallback sign-in window; Google needs the server's app-ticket login
  (below). Settings shows the connection afterwards.
- File → Add Music Folder → quit → relaunch → the Booth still reads the folder (security-scoped bookmark).
- Headphone cue: plug a second output device, `cue_devices` lists it, a cue plays on it while the room plays.
- Media keys / Control Center show the song and toggle the Booth; the display stays awake while playing.
- iPad: audio continues with the screen locked; rotation and Split View; the ringer switch does not mute.
- iPhone: portrait only; the Booth's transport sits above the home indicator, the set list opens from it; audio
  continues with the screen locked; the status bar never covers a page title (the page pads by the safe area).
- DMG: double-click on a clean Mac opens without a Gatekeeper warning; Check for Updates shows the notes.

## Server follow-ups (apps/web, not required for the first TestFlight)

1. ✅ (2026-11) Login hand-off in the system browser: `?client=app` on `/api/{spotify,google,dropbox}/login`
   marks the OAuth state; the callback seals a 60-second single-use ticket and redirects to
   `tdj://auth/<provider>?ticket=…&next=…` (failures to `tdj://open?path=/settings?error=…`), and
   `GET /api/app/redeem?provider&ticket&next` sets the normal cookie in the app's jar (400 without a ticket, so the
   app's probe picks this path). `apps/web/src/lib/server/appTicket.ts`, e2e `connectors.spec.ts`. No new redirect
   URI at any provider: the browser comes back to the server's existing https callback.
2. `tdj://spotify-callback` in the Spotify dashboard (owner step 5) for the iPhone and iPad Spotify SDK / BYO PKCE.
3. The web's command registry (`lib/commands.ts`) should listen for `tdj:command` events (ids in
   `src-tauri/src/menu.rs`); until then the bundle's shim maps navigation and replays the existing keys.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `apple-setup`: certificate limit reached | revoke an unused one at https://developer.apple.com/account/resources/certificates/list, or `--revoke-oldest` (never revokes Developer ID) |
| No Developer ID identity | the key could not create it: owner step 6 |
| `openssl pkcs12 failed: No certificate matches private key` on `--devid-cer` | the `.cer` was made from an older CSR. Since 2026-11-14 the pending key + CSR are kept until a `.cer` is imported; make the certificate from `DEVELOPER_ID_APPLICATION_CERT_CSR` in the store |
| Developer ID identity listed as `CSSMERR_TP_NOT_TRUSTED` | the Developer ID G2 intermediate CA is missing; `mac-build.sh` now imports it (and WWDR G3) into the signing keychain |
| App Store Connect asks for iPhone screenshots | expected since the app is universal: `pnpm store:creative` makes them (6.9" and 6.5"), `fastlane ios metadata` uploads them |
| deliver: "unsupported screenshot size" or a Duo image in an iPhone slot | the Duo sets live in `screenshots_duo/`, never in `screenshots/`: `scripts/asset-library.mjs` places them (Store texts and screenshots → App Asset Library) |
| asset-library: "expected one iPhone Duo screenshot group … found none" / "no … spec is WxH" | Apple's catalog has no group or spec for that size and nothing was changed: check the sizes in `store/creative/spec.ts` against App Store Connect Help → Screenshot specifications |
| asset-library: "No editable IOS App Store version" | create the version first (`fastlane ios metadata` does), or pass `--version` |
| asset-library: 409 "placementType and placementGroup combination is not supported" | the group belongs to another platform: rerun with the right `--platform` |
| A committed `gen/apple/project.yml` still says `TARGETED_DEVICE_FAMILY: "2"` | `mac-build.sh` rewrites it to `"1,2"` on every run (`TDJ_IOS_DEVICE_FAMILY=2` for an iPad-only build) |
| `version.mjs --check` fails | a copy drifted or the tag differs: `pnpm release:version <x.y.z>`, commit, tag again |
| `tauri ios build` cannot sign | rerun: every run re-checks the profile against the current certificate and replaces a stale one |
| altool upload: "No suitable application records" | owner step 2 (app record) missing or bundle ID differs |
| Notarisation "Invalid" | `xcrun notarytool log <id> --key … --key-id … --issuer …` prints the reason |
| Certificate expires within 30 days | the release job warns; rerun Apple setup (or the Mac script) to renew |
