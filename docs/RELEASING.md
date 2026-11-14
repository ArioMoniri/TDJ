# Releasing TDJ for Mac and iPad

How the apps are built, signed and shipped, what runs where, what it costs, and the few steps only the
owner can do. Design: [specs/r22-apps-plan.md](specs/r22-apps-plan.md). Owner checklist (manual path):
[APPLE_SETUP.md](APPLE_SETUP.md).

## What ships

| Artefact | Signed with | Goes to | Updates |
|---|---|---|---|
| `TDJ-macOS.dmg` — universal (Apple silicon + Intel), macOS 13+ | Developer ID Application, hardened runtime; app **and** DMG notarised + stapled | GitHub Release (README "Download for macOS") | in-app: `latest.json` on the newest release, the dialog shows the release notes, installs and relaunches |
| `TDJ-MacAppStore.pkg` — universal, App Sandbox | Apple Distribution + Mac Installer Distribution, Mac App Store profile | TestFlight → Mac App Store | App Store |
| `TDJ-iPad.ipa` — iPadOS 16+, every orientation, Split View | Apple Distribution, iOS App Store profile | TestFlight → App Store | App Store |

All three are the same Tauri 2 app (`apps/desktop`). Bundle ID `com.ariomoniri.tdj` on both platforms (one
App Store record, universal purchase), Team `FF68N39FU5`.

### Why App Review accepts it (guideline 4.2 / 2.5.2)

The UI is **bundled in the app**, not loaded from a website: `apps/desktop/scripts/build-ui.mjs` builds a
static export of `apps/web` (route handlers removed) into the app. Only `/api/*` calls go to the DJ's TDJ
server, through a native bridge (`src-tauri/src/bridge.rs`, `tdjapi://` scheme) that keeps the server's
sealed session cookies in the app's own jar. No server change was needed. Native features on top:
menu bar with every command and shortcut, media keys / Now Playing, keep-awake during a night (IOKit on Mac,
idle timer on iPad), linked music folders with security-scoped bookmarks, headphone cue output device
(Mac), native save panel and print, background audio on iPad, first-launch server choice (self-hosters),
offline playback of the composed night from local files. Nothing executable is downloaded.

Store compliance files: `src-tauri/PrivacyInfo.xcprivacy`, `Info.plist` / `Info.ios.plist`
(`ITSAppUsesNonExemptEncryption=false`, background audio, orientations, launch screen colour),
`entitlements/mac-appstore.plist` (sandbox: network client, user-selected files, app-scoped bookmarks,
print), `entitlements/mac-dmg.plist` (hardened runtime, no exceptions), icons for every size
(`pnpm --filter @tdj/desktop icons`, iPad icons without alpha), metadata in `apps/desktop/fastlane/metadata`
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
the `apple-release` and `app-store` environments with you as reviewer):

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

# 2. everything in one pass (toolchains, signing, DMG + notarisation, MAS pkg, iPad IPA, TestFlight uploads)
mkdir -p ~/drive/tdj-out
scripts/release/mac-build.sh --targets dmg,mas,ipad 2>&1 | tee ~/drive/tdj-out/last.log

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
| iPad: `tauri ios init` (once), arm64 build, archive + export | 8–12 min | 4–6 min |
| Uploads (pkg + ipa) | 2–4 min | 2–4 min |
| **Total** | **35–55 min** | **18–30 min** |

At $0.90/h that is under $1 per session; the $10 budget covers ten full releases. Plan one 90-minute
session for the first release (headroom for a retry). After the first run, commit
`apps/desktop/src-tauri/gen/apple` (created by `tauri ios init`) from the Mac or copy it back, so later
builds skip that step.

If a step fails, rerun with only the remaining targets (`--targets mas,ipad`); signing and caches are
reused. `--no-upload` builds without TestFlight, `--metadata` also uploads store texts and screenshots from
the Mac (they are normally uploaded from Linux, below).

## Route B — GitHub Actions (automated releases later)

| Workflow | Runner | When | What |
|---|---|---|---|
| **Native check** (`native-check.yml`) | Linux | PRs touching the apps, CLI, release scripts or workflows | `cargo fmt/clippy/test`, macOS + iPadOS type-check from Linux, release-script tests (mocked API), CLI tests, metadata limits, shellcheck, actionlint |
| **Store assets** (`store-assets.yml`) | Linux | PRs touching metadata, store pipeline or `apps/web/src`; manual | screenshots of the bundled UI at 2880×1800 (Mac) and 2752×2064 (iPad 13"), en-US + tr; contact sheet artifact; with `upload` (after your approval in `app-store`): `fastlane deliver` metadata + screenshots |
| **Apple setup** (`apple-setup.yml`) | Linux | manual | the same idempotent signing setup through the API; stores `.p12` + passwords + profiles in AWS SSM `/tdj/apple/*` with the deploy OIDC role |
| **Release apps** (`release-apps.yml`) | **one macOS job** | `v*` tag or manual | runs `scripts/release/mac-build.sh` (signing from SSM, else the `apple-release` environment secrets), publishes the release, then metadata upload and App Review submission each wait for your approval in `app-store` |
| **Check secrets** (`check-secrets.yml`) | Linux | manual, or when that file changes | prints only `true/false` per expected secret/variable name |

Cost: GitHub-hosted macOS minutes are free for public repositories; for a private repository they count
10× (one release ≈ 25–45 min ≈ 250–450 Linux-equivalent minutes). Everything else runs on Linux. Signing
secrets are scoped to the `apple-release` environment (branch `main` + tags `v*`), so forks and PRs never
see them.

Release:
```bash
git tag v1.0.0 && git push origin v1.0.0     # or Actions → Release apps → Run workflow (channel, targets)
```
Build number = UTC minutes since 2026-01-01 (monotonic, the same for the DMG, pkg and IPA of one run);
marketing version = the tag (or `apps/desktop/package.json`).

## Store texts and screenshots

`apps/desktop/fastlane/metadata/<locale>/*.txt` (en-US, tr) — edit in a PR; `pnpm --filter @tdj/desktop test`
checks every App Store limit (keywords ≤ 100 bytes, name/subtitle ≤ 30, promo ≤ 170, …). Screenshots:

```bash
pnpm --filter @tdj/desktop ui            # bundled UI (static export)
pnpm --filter @tdj/desktop screenshots   # capture + compose + contact sheet (Linux, Chromium)
open apps/desktop/store/out/contact-sheet.html
```
Scenes and captions: `apps/desktop/store/scenes.ts`. Upload (Linux, API key in env):
`cd apps/desktop && bundle exec fastlane ios metadata && bundle exec fastlane mac metadata`.

## Mac checks (need real hardware; first TestFlight build)

- Sign in to Spotify / Dropbox in the fallback sign-in window; Google needs the server's app-ticket login
  (below). Settings shows the connection afterwards.
- File → Add Music Folder → quit → relaunch → the Booth still reads the folder (security-scoped bookmark).
- Headphone cue: plug a second output device, `cue_devices` lists it, a cue plays on it while the room plays.
- Media keys / Control Center show the song and toggle the Booth; the display stays awake while playing.
- iPad: audio continues with the screen locked; rotation and Split View; the ringer switch does not mute.
- DMG: double-click on a clean Mac opens without a Gatekeeper warning; Check for Updates shows the notes.

## Server follow-ups (apps/web, not required for the first TestFlight)

1. Login hand-off in the system browser: `?client=app` on `/api/{spotify,google,dropbox}/login`, a
   60-second sealed single-use ticket, redirect to `tdj://auth/<provider>?ticket=…&next=…`, and
   `GET /api/app/redeem?provider&ticket&next` that sets the normal cookie. The app already handles both
   ends (`links.rs`, `lib.rs::login`) and probes `/api/app/redeem` to choose it; until then it uses an
   in-app sign-in window (Spotify, Dropbox) and asks Google users to connect on the website.
2. `tdj://spotify-callback` in the Spotify dashboard (owner step 5) for the iPad Spotify SDK / BYO PKCE.
3. The web's command registry (`lib/commands.ts`) should listen for `tdj:command` events (ids in
   `src-tauri/src/menu.rs`); until then the bundle's shim maps navigation and replays the existing keys.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `apple-setup`: certificate limit reached | revoke an unused one at https://developer.apple.com/account/resources/certificates/list, or `--revoke-oldest` (never revokes Developer ID) |
| No Developer ID identity | the key could not create it: owner step 6 |
| `tauri ios build` cannot sign | rerun: every run re-checks the profile against the current certificate and replaces a stale one |
| altool upload: "No suitable application records" | owner step 2 (app record) missing or bundle ID differs |
| Notarisation "Invalid" | `xcrun notarytool log <id> --key … --key-id … --issuer …` prints the reason |
| Certificate expires within 30 days | the release job warns; rerun Apple setup (or the Mac script) to renew |
