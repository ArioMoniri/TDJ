# Apple setup — the owner's checklist

What to create at Apple, and which **GitHub secret or variable** each value goes into, so CI can build, sign, notarise and upload the T-DJ macOS app and the universal iOS app (iPhone + iPad) (design: [docs/specs/r22-apps-plan.md](specs/r22-apps-plan.md)). About an hour, once. **You do not need a Mac**: every step works in a browser plus a terminal with `openssl` and `gh` (Linux, Windows WSL or macOS).

Rules: never paste any of these values into a chat, an issue or a commit. Put them only into GitHub → **Settings → Secrets and variables → Actions** (or with `gh secret set`, which reads from a file or stdin, so nothing lands in your shell history). If something leaks, revoke it at Apple (API key: *Revoke*; certificate: *Revoke*) and create a new one.

Apple's web pages change their wording from time to time; the paths below are the ones in use in November 2026.

---

## Summary — the box to fill

| # | Create at | Value | GitHub name | Where in GitHub |
|---|---|---|---|---|
| 1 | developer.apple.com → Account → Membership details | Team ID (10 characters) | `APPLE_TEAM_ID` | repository **secret** |
| 2 | Certificates, IDs & Profiles → Identifiers | Bundle ID, e.g. `com.ariomoniri.tdj` | `TDJ_APP_BUNDLE_ID` | repository **variable** |
| 3 | App Store Connect → Apps → New App | Apple ID of the app (digits, App Information page) | `APPLE_APP_ID` | repository **variable** |
| 4 | App Store Connect → Users and Access → Integrations → App Store Connect API | Issuer ID | `APP_STORE_CONNECT_ISSUER_ID` | repository **secret** |
| 4 | same | Key ID | `APP_STORE_CONNECT_KEY_ID` | repository **secret** |
| 4 | same | contents of `AuthKey_<KeyID>.p8` | `APP_STORE_CONNECT_PRIVATE_KEY` | repository **secret** |
| 5a | Certificates → Apple Distribution | `.p12`, base64 | `APPLE_DISTRIBUTION_CERT_P12` | repository secret |
| 5a | (you choose) | its password | `APPLE_DISTRIBUTION_CERT_PASSWORD` | repository secret |
| 5b | Certificates → Mac Installer Distribution | `.p12`, base64 | `MAC_INSTALLER_CERT_P12` | repository secret |
| 5b | (you choose) | its password | `MAC_INSTALLER_CERT_PASSWORD` | repository secret |
| 5c | Certificates → Developer ID Application | `.p12`, base64 | `DEVELOPER_ID_APPLICATION_CERT_P12` | repository secret |
| 5c | (you choose) | its password | `DEVELOPER_ID_APPLICATION_CERT_PASSWORD` | repository secret |
| 6a | Profiles → App Store Connect (iOS) | `.mobileprovision`, base64 | `IOS_APPSTORE_PROFILE` | repository secret |
| 6b | Profiles → Mac App Store Connect | `.provisionprofile`, base64 | `MAC_APPSTORE_PROFILE` | repository secret |
| 7 | (optional) `tauri signer generate` | updater private key + password | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | repository secret |
| 8 | developer.spotify.com → your app (optional) | the app's Spotify **Client ID** (public; PKCE, no secret), redirect URI `tdj://spotify-callback` | `TDJ_SPOTIFY_CLIENT_ID` | repository **variable** |
| 9 | your production deployment (optional) | the apps' default sync server (docs/SYNC.md), an https origin; never committed | `TDJ_SYNC_URL` | repository **variable** |

Notarisation uses the API key from row 4: **no Apple ID password or app-specific password is needed anywhere.**

---

## 0. Before you start

1. **Apple Developer Program** membership (developer.apple.com/programs, 99 USD/year). Enrol as an *Individual* (fastest) or an *Organization* (needs a D-U-N-S number; the seller name on the store is the company). You must be the **Account Holder** for step 5c (Developer ID) and for the first API-key request.
2. **App Store Connect → Business** (appstoreconnect.apple.com → Business): accept the latest *Apple Developer Program License Agreement* if a banner asks. The *Paid Apps* agreement is **not** needed for a free app.
3. A terminal with `openssl` and the GitHub CLI logged in (`gh auth login`), in a folder that is **not** inside the TDJ repository, e.g. `mkdir ~/tdj-apple && cd ~/tdj-apple`. Delete this folder at the end (step 10).

## 1. Team ID → `APPLE_TEAM_ID`

developer.apple.com → **Account** → **Membership details** → *Team ID* (10 characters, e.g. `A1B2C3D4E5`).
```bash
gh secret set APPLE_TEAM_ID --repo ArioMoniri/TDJ        # paste the Team ID, Enter, Ctrl-D
```

## 2. Bundle ID → `TDJ_APP_BUNDLE_ID`

developer.apple.com → **Account** → **Certificates, IDs & Profiles** → **Identifiers** → **+**
1. *App IDs* → Continue → *App* → Continue.
2. Description: `TDJ`. Bundle ID: **Explicit**, `com.ariomoniri.tdj` (or your own reverse-domain; it can never be changed later).
3. Capabilities: tick nothing for now (no iCloud, no push). → Continue → **Register**.

The same App ID is used by the iOS app (iPhone and iPad, one universal build) and the Mac app (one App Store record, one purchase for all three).
```bash
gh variable set TDJ_APP_BUNDLE_ID --repo ArioMoniri/TDJ --body com.ariomoniri.tdj
# optional: the apps' own Spotify app (without it, DJs paste their own Client ID under Settings → Spotify)
gh variable set TDJ_SPOTIFY_CLIENT_ID --repo ArioMoniri/TDJ --body <client id>
# optional: the apps' default sync server (docs/SYNC.md; without it the DJ enters one under Settings → Sync)
gh variable set TDJ_SYNC_URL --repo ArioMoniri/TDJ --body https://<your deployment>
```

## 3. The app record in App Store Connect → `APPLE_APP_ID`

appstoreconnect.apple.com → **Apps** → **+** → **New App**
- Platforms: tick **iOS** and **macOS**.
- Name: `T-DJ` (done: the app record exists, Apple ID `6834924534`; "TDJ – Tango DJ" was taken).
- Primary Language: **English (U.S.)**.
- Bundle ID: pick the one from step 2.
- SKU: `tdj` (internal, any text).
- User Access: **Full Access** → **Create**.

Then, in the new app:
1. **General → App Information**: copy **Apple ID** (digits) → `gh variable set APPLE_APP_ID --repo ArioMoniri/TDJ --body <digits>`. Category: Primary **Music**, Secondary **Entertainment**. Content Rights: "does not contain, show, or access third-party content" is **wrong** for TDJ (it plays Spotify/Deezer previews) → answer *Yes, it contains third-party content, and I have the rights* (playback goes through the services' own players/APIs under their terms).
2. Next to the language menu at the top right of App Information, **add a localisation: Turkish**.
3. **Pricing and Availability**: Price **Free (0)**; all countries (or your choice). Under *iPhone and iPad Apps on Apple Silicon Macs*: **untick** "Make this app available" (the real Mac app replaces it).
4. **App Privacy**: Privacy Policy URL — use `https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/PRIVACY.md` once that file exists (the engineers write it; later `<server>/privacy`). Data types: answer as in r22-apps-plan.md §8.5 (*Identifiers → User ID*: not linked to you, not used for tracking; *User Content → Other*: app functionality, not linked; nothing else). Click **Publish**.
5. **Age Rating** (on the version page): answer the questionnaire — no violence, no mature themes, no gambling, no unrestricted web access, no user-generated content; *AI/chatbot features*: **Yes** (the AI DJ writes text). Save.
6. **App Review Information** (version page): your name, e-mail, phone; *Sign-in required*: **No**; Notes: paste the review notes from r22-apps-plan.md §8.5.

Descriptions, keywords, screenshots and "what's new" are **not** typed here: CI uploads them from `apps/native/fastlane/metadata/` after designers approve them in a pull request.

## 4. App Store Connect API key → `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`

appstoreconnect.apple.com → **Users and Access** → tab **Integrations** → **App Store Connect API** (left) → **Team Keys**.
1. First time only (Account Holder): **Request Access** → accept the terms.
2. **Generate API Key** (or the **+** button). Name: `TDJ GitHub Actions`. Access: **App Manager** (enough for TestFlight, metadata, screenshots, submission and notarisation; do not choose Admin). → **Generate**.
3. **Issuer ID**: shown above the key table (a UUID) → copy.
4. **Key ID**: the 10-character value in the key's row → copy.
5. **Download API Key** → `AuthKey_<KeyID>.p8`. Apple lets you download it **only once**; keep it in `~/tdj-apple` until step 10.
```bash
gh secret set APP_STORE_CONNECT_ISSUER_ID --repo ArioMoniri/TDJ      # paste Issuer ID, Enter, Ctrl-D
gh secret set APP_STORE_CONNECT_KEY_ID    --repo ArioMoniri/TDJ      # paste Key ID, Enter, Ctrl-D
gh secret set APP_STORE_CONNECT_PRIVATE_KEY --repo ArioMoniri/TDJ < AuthKey_XXXXXXXXXX.p8   # the whole file, BEGIN/END lines included
```

## 5. Signing certificates (three) → `*_CERT_P12` + `*_CERT_PASSWORD`

Each certificate needs a **certificate signing request (CSR)**. Make one private key + CSR per certificate (keeps them independently revocable):
```bash
for n in distribution installer devid; do
  openssl req -new -newkey rsa:2048 -nodes -keyout "$n.key" -out "$n.csr" \
    -subj "/emailAddress=YOUR_APPLE_ID_EMAIL/CN=TDJ $n/C=TR"
done
```
(On a Mac you can instead use *Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority → Saved to disk*, then export the `.p12` from Keychain Access; the openssl route below gives the same result.)

developer.apple.com → **Certificates, IDs & Profiles** → **Certificates** → **+**, three times:

| | Choose (under *Software*) | Upload | Download as |
|---|---|---|---|
| 5a | **Apple Distribution** ("Sign your apps for submission to the App Store…", covers iOS **and** Mac App Store) | `distribution.csr` | `distribution.cer` |
| 5b | **Mac Installer Distribution** ("sign your Mac app's Installer Package for submission to the Mac App Store") | `installer.csr` | `installer.cer` |
| 5c | **Developer ID Application** (Account Holder only; profile type **G2 Sub-CA**) — signs the DMG downloaded from GitHub | `devid.csr` | `devid.cer` |

Convert each `.cer` + key to a password-protected `.p12`, base64 it, and store both values:
```bash
mkp12 () {  # $1 = name, $2 = SECRET prefix
  openssl x509 -inform DER -in "$1.cer" -out "$1.pem"
  PW=$(openssl rand -base64 24)
  openssl pkcs12 -export -legacy -inkey "$1.key" -in "$1.pem" -out "$1.p12" -passout "pass:$PW"
  base64 < "$1.p12" | tr -d '\n' | gh secret set "$2_P12"      --repo ArioMoniri/TDJ
  printf %s "$PW"                  | gh secret set "$2_PASSWORD" --repo ArioMoniri/TDJ
}
mkp12 distribution APPLE_DISTRIBUTION_CERT
mkp12 installer    MAC_INSTALLER_CERT
mkp12 devid        DEVELOPER_ID_APPLICATION_CERT
```
`-legacy` keeps the `.p12` in the format macOS `security import` reads on every runner image. If your openssl says `-legacy` is unknown (LibreSSL on macOS), drop the flag.

## 6. Provisioning profiles (two) → `IOS_APPSTORE_PROFILE`, `MAC_APPSTORE_PROFILE`

developer.apple.com → **Profiles** → **+**:
- **6a** Distribution → **App Store Connect** → Continue → App ID: *TDJ* (`com.ariomoniri.tdj`) → Certificate: the Apple Distribution from 5a → Name: `TDJ iPad App Store` → Generate → Download (`.mobileprovision`).
- **6b** Distribution → **Mac App Store Connect** → Continue → App ID: *TDJ* → Certificate: the Apple Distribution from 5a → Name: `TDJ Mac App Store` → Generate → Download (`.provisionprofile`).

```bash
base64 < TDJ_iPad_App_Store.mobileprovision | tr -d '\n' | gh secret set IOS_APPSTORE_PROFILE --repo ArioMoniri/TDJ
base64 < TDJ_Mac_App_Store.provisionprofile | tr -d '\n' | gh secret set MAC_APPSTORE_PROFILE --repo ArioMoniri/TDJ
```
The DMG (Developer ID) build needs **no** profile. Keep the profile names exactly as above — the workflow refers to them by name.

## 7. Spotify, Google, Dropbox

- **Spotify** (developer.spotify.com → your app → **Settings** → **Edit**): under *iOS*, add the bundle ID from step 2; under *Redirect URIs*, add `tdj://spotify-callback` (used by the Spotify app login on iPad). Keep the existing web redirect URIs (docs/DEPLOY.md). Tick *iOS* under "Which API/SDKs are you planning to use?". The 5-user Development Mode limit applies to the apps too.
- **Google, Dropbox**: nothing to add — the apps log in through the server's existing redirect URIs in the system browser sheet.

## 8. (Optional) DMG auto-update key → `TAURI_SIGNING_PRIVATE_KEY`

Only if you want the downloaded Mac app to update itself from GitHub Releases. In a terminal with Node: `npx @tauri-apps/cli signer generate -w tdj-updater.key` (choose a password), then
```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY          --repo ArioMoniri/TDJ < tdj-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo ArioMoniri/TDJ   # type the password, Ctrl-D
```
Send the engineers the **public** key (`tdj-updater.key.pub`) — that one is not secret and goes into `tauri.conf.json`.

## 9. GitHub secrets

All signing material is kept as **repository secrets** (the owner's choice, no environments). Check the names with `gh secret list --repo ArioMoniri/TDJ`.

## 10. Clean up

Store the `.p8`, the `.p12` files and their passwords in your password manager (you need them again only to re-upload after a renewal), then delete the working folder: `rm -rf ~/tdj-apple`.

## 11. TestFlight testers

App Store Connect → your app → **TestFlight**:
- **Internal Testing** → **+** → group `TDJ team` → add yourself and anyone already in *Users and Access* (up to 100, no review). Every CI build appears here automatically.
- **External Testing** (later, for DJs outside the team) → **+** → group `DJs` → fill *Test Information* (feedback e-mail, what to test). The first build for external testers goes through Beta App Review (usually a day). Testers get a public link or an e-mail invite. Put the public link (`https://testflight.apple.com/join/…`) into the root `package.json` → `release.testflightUrl`: Settings → About and the release notes then point iPhone, iPad and Mac App Store users at it.

## 12. Renewal calendar

| Item | Lifetime | What to do |
|---|---|---|
| Apple Developer Program | 1 year | renew in the Account page |
| Apple Distribution, Mac Installer Distribution | 1 year | repeat step 5a/5b, then step 6 (profiles are tied to the certificate) |
| Developer ID Application | 5 years | repeat step 5c; apps signed before keep working |
| Provisioning profiles | 1 year or until the certificate is revoked | repeat step 6 |
| App Store Connect API key | does not expire | revoke + recreate only if leaked |

The release workflow prints a warning in its summary 30 days before any certificate or profile in the secrets expires.

## 13. What happens after this

- Push a tag `v1.0.0` (or Actions → **Release apps** → Run workflow): CI builds the notarised **`TDJ-macOS.dmg`** on a GitHub Release (the README "Download for macOS" button points at it), and uploads the iOS (iPhone + iPad) and Mac builds to **TestFlight**. The tag must equal the root `package.json` version (`pnpm release:version`); the web is deployed from the same commit (RELEASING.md → One version).
- Store texts and screenshots arrive as a pull request with a contact sheet for the designers; after merge, **Store assets** uploads them.
- **Release apps** with `channel = appstore-review` submits the version for review (again after your approval). Release is manual and phased once Apple approves.
