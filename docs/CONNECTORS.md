# Connectors

T-DJ talks to a handful of music services. Some need nothing; some need a login with an app registered at the
provider; YouTube search can run on an API key. This page lists them all, explains how to set up each one step by
step, and says what a self-hosted server or an organisation can do on top.

Nothing here ships with the app: **the repository and the apps contain no client secret or API key**. Each service
works with one of three things:

1. **The server's credentials**, when the person who runs a T-DJ server sets them (environment variables, AWS Parameter
   Store or `/admin`). A self-hosted server always uses its own credentials first when they are set.
2. **Your own credentials ("bring your own")**, where the provider allows a *public client* (one that has no secret).
   You enter them in **Settings → Connections**. They stay on your device (the Keychain in the Mac and iPad apps, this
   browser's storage on the web) and go only to that provider, never to a TDJ server.
3. **Nothing**: the keyless services work for everyone. When a service has neither of the first two, Settings says so
   in one plain sentence and names what is missing.

- [Every connector at a glance](#every-connector-at-a-glance)
- [Spotify](#spotify)
- [YouTube Data API v3](#youtube-data-api-v3)
- [Google Drive (OAuth)](#google-drive-oauth)
- [Dropbox](#dropbox)
- [Apple Music (MusicKit)](#apple-music-musickit)
- [Deezer, MusicBrainz, LRCLIB](#deezer-musicbrainz-lrclib)
- [For self-hosters: environment variables](#for-self-hosters-environment-variables)
- [For organisations](#for-organisations)

## Every connector at a glance

| Connector | What T-DJ uses it for | Login or key needed | Limits and costs | Bring your own |
|---|---|---|---|---|
| **Spotify** | Playlists of a night, full tracks in Listen and the live view, ISRC matching | Login with a Spotify app (the server's, or your own Client ID) | Free. Development Mode: **5 users** per app, each listed by e-mail; the owner needs Premium. Extended quota: organisations with **250,000+ monthly users** only | **Yes**: Client ID (PKCE, no secret), web and apps |
| **YouTube** | "Find a video" (Now playing → Video); YouTube playlists of a night | Search: an API key (yours or the server's) or a Google login. Playlists: a Google login | Free. **10,000 units a day per Google Cloud project**; one search costs **100** (so about 100 searches a day) | **Yes**: an API key, web and apps |
| **Google Drive** | Export files (Rekordbox, Traktor, M3U8, CSV…) into a `TDJ` folder | Google login (the server's OAuth client, or your own in the apps) | Free. Unverified apps: 100 test users, sign-ins last 7 days | **Apps only**: an iOS OAuth client ID (PKCE). Google's web clients always need a secret, so the web uses the server's |
| **Dropbox** | Export files into `/Apps/<app name>/<set name>/` | Dropbox login (the server's app, or your own app key) | Free. 500 linked users in development; Dropbox asks for a production review at 50 | **Yes**: an app key (PKCE, no secret), web and apps |
| **Apple Music** | Not in T-DJ yet (planned: playlists) | A MusicKit developer token (the owner's) + each listener's Apple Music subscription | Apple Developer Program, $99 a year | No (the developer token is the owner's) |
| **Deezer** | 30-second previews, song details | Nothing | Public API, about 50 requests per 5 seconds | Not needed |
| **MusicBrainz** | Recording dates, singers, labels | Nothing | About 1 request a second per client | Not needed |
| **LRCLIB** | Synced lyrics for songs and cortinas | Nothing | Open and free | Not needed |

In the app, **Settings → Connections** shows the same list: one status per service (*Ready*, *Your own*, *Sign in*,
*Off*), what it unlocks, its limits, the fields for your own credentials, and "Set up your own" with the exact redirect
address to copy. Logins with the server's apps stay under **Settings → Accounts and services**.

---

## Spotify


Every T-DJ (the Mac app, the iPhone and iPad app, the web and a self-hosted server) signs in to Spotify with
Authorization Code + PKCE: a public client, so **no client secret is ever needed or asked for**.

### Which Spotify app signs you in

| Setting | What signs you in |
|---|---|
| Your own Client ID in Settings → Connections → Spotify → Advanced | your own Spotify app |
| nothing there | the app's built-in Spotify app (`TDJ_SPOTIFY_CLIENT_ID`, baked in at build time) |

Your own Client ID is kept **on this device only**: in the Keychain in the Mac, iPhone and iPad apps
(`spotify.client_id`, `apps/desktop/src-tauri/src/secrets.rs`), in this browser's local storage on the web.

Why: since February 2026 a Spotify app in Development Mode admits **5 listed users**, and Extended Quota needs an
organisation with 250k+ monthly active users. Past those 5, a DJ signs in with a free Spotify app of their own.
When Spotify refuses an account ("User not registered in the Developer Dashboard", `invalid_client`, a 403 from
`/v1/me`), Settings says so in plain words and offers **Use my own Spotify app**.

### Use my own Spotify app: the steps

1. Open <https://developer.spotify.com/dashboard> and choose **Create app** (any name and description).
2. Under **Redirect URIs**, add exactly:
   - the Mac, iPhone and iPad apps: `tdj://spotify-callback`
   - the web app in your browser: `<origin>/callback` (for example `https://tdj.example.org/callback`)
   - a self-hosted TDJ server's own "Log in with Spotify": also `<origin>/api/spotify/callback`
3. Apps only: under **iOS**, add the bundle ID `com.ariomoniri.tdj`.
4. Tick **Web API** and **Web Playback SDK**, accept the terms and save.
5. In the app's **Settings → User Management**, add your name and the email of your Spotify account.
6. Copy the **Client ID** from **Basic Information** and paste it in T-DJ under Settings → Connections → Spotify →
   Advanced. No client secret: never paste it anywhere.

Then **Log in with Spotify**. Settings lists the same steps (`apps/web/src/lib/spotifyOwnApp.ts`).

### How the apps' sign-in works

1. The page makes the PKCE verifier, challenge and state (`apps/web/src/lib/app/pkce.ts`) and hands the verifier
   and state to the native side (`spotify_begin`) before it opens the system browser.
2. Spotify redirects to `tdj://spotify-callback?code=…&state=…`. The deep-link plugin delivers it once
   (`links.rs` `Recent`); the native side checks the state (a mismatch is refused), exchanges the code at
   `accounts.spotify.com/api/token`, keeps the refresh token in the Keychain and the access token in memory
   (`apps/desktop/src-tauri/src/spotify.rs`, `commands.rs`).
3. The window opens `next?connected=spotify` (or `?error=spotify_denied|spotify_not_listed|spotify_state|…`); the
   page reads the session back from the native side (`syncAppSpotify`, also on every launch) and Settings shows
   "Logged in as …". A token the Keychain no longer backs is dropped, so nothing shows "connected" without one.
4. A sign-in begun before the app restarted is finished by the page's `/callback` with what it kept.

Release builds must carry the built-in Client ID: `release-apps.yml` passes the repository variable
`TDJ_SPOTIFY_CLIENT_ID`, and `scripts/release/mac-build.sh` stops when it is missing (`TDJ_ALLOW_NO_SPOTIFY=1` builds
without it) and checks that the bundle and the DMG's binary carry it.

### A self-hosted server's own login

A server can also offer **Log in with Spotify** with its own Spotify app for every DJ: the dashboard steps above, then
**View client secret** in Basic Information, stored as `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` on the server
([below](#for-self-hosters-environment-variables)), never in an app. For a local run add
`http://127.0.0.1:3000/api/spotify/callback` and `http://127.0.0.1:3000/callback` (Spotify rejects `localhost`).

### Development Mode and extended quota

- **Development Mode** (every new app): 5 users, listed by hand; the owner needs Premium. Refresh tokens last six
  months, then each DJ logs in again.
- **Extended quota mode** is granted only to **organisations** (a registered business, not an individual) with an
  **established service of 250,000+ monthly active users**, available in Spotify's key markets, that complies with the
  Developer Terms and Design Guidelines. It is requested from the dashboard (your app → **Extension request**) and
  reviewed by Spotify; see [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
- So for a club or a school, the practical path is **each DJ (or each group of 5) uses their own Spotify app** with the
  bring-your-own Client ID above. It is free and takes about five minutes.

---

## YouTube Data API v3

**What it unlocks:** "Find a video" (Now playing → Video: five embeddable candidates), and YouTube playlists of a night
(Export → Send to → YouTube; YouTube Music shows them too).

**Which credential does what:**

| Credential | Search ("Find a video") | Create a playlist |
|---|---|---|
| **Your own API key** (Settings → Connections → YouTube) | Yes, straight from your device to Google | No (an API key cannot write to an account) |
| **The server's key** (`YOUTUBE_API_KEY`) | Yes, for every DJ, without a Google login | No |
| **A Google login** with the YouTube permission | Yes | Yes |

T-DJ tries them in that order. Your own key's errors (quota used up, key refused) are said as they are.

### Get an API key

1. Open the **[Google Cloud console](https://console.cloud.google.com/)** and create a project (or pick one):
   **[Create project](https://console.cloud.google.com/projectcreate)**.
2. Turn on the API: **[YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)** →
   **Enable**.
3. **[APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)** → **Create credentials** →
   **API key**.
4. **Restrict the key** (Edit API key):
   - **API restrictions** → *Restrict key* → **YouTube Data API v3** only. Always do this.
   - **Application restrictions**:
     - a key for **your browser** on the web: *Websites* → add your T-DJ address, e.g. `https://your-app.example/*`;
     - a key for **the Mac or iPad app**: *None* (the app calls Google directly; with *iOS apps* you would add the
       bundle ID `com.ariomoniri.tdj`, but the Mac app does not send it, so leave it unrestricted and rely on the API
       restriction);
     - a key for **a server** (`YOUTUBE_API_KEY`): *None* (AWS Lambda has no fixed address); the API restriction
       limits what a leaked key can do.
5. Paste it in **Settings → Connections → YouTube → API key** (it stays on this device), or give it to the server as
   `YOUTUBE_API_KEY` ([below](#for-self-hosters-environment-variables)).

### Quota math

Every Google Cloud project gets **10,000 units a day**, reset at midnight Pacific time, shared by every key and every
login of that project. What T-DJ spends ([costs](https://developers.google.com/youtube/v3/determine_quota_cost)):

| Call | Units | Used for |
|---|---|---|
| `search.list` | **100** | one "Find a video", or one track of a playlist export |
| `playlists.insert` | 50 | creating the export playlist |
| `playlistItems.insert` | 50 | each track added |
| `playlistItems.list`, `videos.list` | 1 | reading the playlist back, checking each video plays in your country |

- **Find a video**: 100 units → about **100 searches a day** per project.
- **Exporting a 50-track night**: 50 + 50 × 100 + 50 × 50 ≈ **7,550 units**, so one full export a day per project.
  The Export sheet sends 10 searches per request, stops at the first quota error and lists the tracks it had to leave
  out.
- Your own key has its own project, so its 10,000 units are yours alone. More: see
  [For organisations](#for-organisations).

---

## Google Drive (OAuth)

**What it unlocks:** export files (Rekordbox XML, Traktor NML, M3U8, CSV…) saved into a `TDJ` folder of your Drive, and
(with the same login) YouTube playlists. T-DJ asks for **`drive.file`**: it sees only the files it created, which
keeps the app out of Google's restricted-scope review.

**Two ways:**

- **The server's Google client** (web and the apps through a linked server): a *Web application* client with a secret,
  `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
- **Your own client, in the Mac and iPad apps**: an **iOS** client, which has no secret, so the app signs in with PKCE
  and keeps the refresh token in the Keychain. Enter its Client ID in **Settings → Connections → Google Drive**.
  *Not on the web:* Google's web clients always require a client secret, which a browser cannot keep, so the web uses
  the server's client.

### The consent screen (Google Auth Platform)

1. **[Google Cloud console](https://console.cloud.google.com/)** → your project. Turn on
   **[Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)** (and **YouTube Data API
   v3** for playlists).
2. **[Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding)**: app name (e.g. "T-DJ"), user
   support e-mail, logo (optional; a logo triggers brand verification), **App domain** (your T-DJ address, privacy
   policy and terms links), **Authorised domains** (your domain), developer contact e-mail.
3. **[Audience](https://console.cloud.google.com/auth/audience)**: **External**. While the app is in **Testing**, add
   each person under **Test users** (at most **100**); their sign-ins expire after **7 days**.
4. **[Data access](https://console.cloud.google.com/auth/scopes)** → **Add or remove scopes**: `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile`, **`.../auth/drive.file`** (non-sensitive), and for playlists **`.../auth/youtube`**
   (sensitive).

### The client

- **For a server**: **[Clients](https://console.cloud.google.com/auth/clients)** → **Create client** → **Web
  application** → **Authorised redirect URIs**: `https://your-app.example/api/google/callback` (and
  `http://127.0.0.1:3000/api/google/callback` for a local run). Copy the **Client ID** and **Client secret** →
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **For your own client in the apps**: **Create client** → **iOS** → **Bundle ID** `com.ariomoniri.tdj` (or your own
  build's). No secret is issued. The app signs in with the redirect URI **`com.ariomoniri.tdj:/oauth2redirect`**, which
  it registers as a URL scheme; Settings → Connections → Google Drive shows both values with a Copy button. Paste the
  **Client ID** (`…apps.googleusercontent.com`) there and press *Sign in with my Google client*.

### Verification

- **Testing** works at once for up to 100 test users, with weekly sign-ins.
- **In production**, `drive.file` alone needs only **brand verification** (your domain verified in
  [Search Console](https://search.google.com/search-console), a privacy policy on that domain, the app name and logo
  matching). It usually takes a few days.
- The **`youtube`** scope is **sensitive**: publishing needs **sensitive-scope verification**, with a short demo video
  of the consent flow and of how T-DJ uses the scope, and a written justification. Plan for one to several weeks.
  Start it from the **[Verification centre](https://console.cloud.google.com/auth/verification)**.
- T-DJ never asks for restricted scopes (full Drive access), so the paid security assessment (CASA) does not apply.

---

## Dropbox

**What it unlocks:** export files saved into a folder of your Dropbox (`/Apps/<app name>/<set name>/`), with a shared
link when the app may make one.

**Two ways:**

- **The server's Dropbox app**: `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET`, redirect
  `https://your-app.example/api/dropbox/callback`.
- **Your own Dropbox app** (web and apps): only the **App key**, never the secret. T-DJ signs in with PKCE and uploads
  straight from your device to Dropbox:
  - **web**: Dropbox sends the browser back to `https://your-app.example/connections/callback`; the tokens stay in
    this browser;
  - **Mac and iPad apps**: no redirect is needed. The system browser shows a code after you allow access; paste it
    in Settings → Connections → Dropbox → *Finish*. The refresh token goes to the Keychain.

### Create a Dropbox app

1. **[Dropbox App Console](https://www.dropbox.com/developers/apps)** → **Create app**.
2. **Choose an API**: *Scoped access*. **Type of access**: **App folder** (T-DJ never sees the rest of your Dropbox).
   Name it, e.g. `TDJ` (files then land in `/Apps/TDJ/`).
3. **Permissions** tab: tick **`files.content.write`** and **`sharing.write`** (`account_info.read` is on by default)
   → **Submit**.
4. **Settings** tab → **OAuth 2**:
   - **Allow public clients (Implicit Grant & PKCE)**: **Allow** (needed for your own app key).
   - **Redirect URIs**: add the ones you use:

     | Used by | Redirect URI |
     |---|---|
     | the server's login | `https://your-app.example/api/dropbox/callback` |
     | your own app key on the web | `https://your-app.example/connections/callback` |
     | a local run | `http://127.0.0.1:3000/api/dropbox/callback`, `http://127.0.0.1:3000/connections/callback` |
     | the Mac and iPad apps | none (the code is pasted) |

5. Copy the **App key** (Settings → Connections → Dropbox, or `DROPBOX_APP_KEY`) and, for a server only, the **App
   secret** (`DROPBOX_APP_SECRET`).
6. **Development** status serves up to **500** linked users; once **50** have linked it, Dropbox asks you to **Apply for
   production** (a short form, usually a few days).

---

## Apple Music (MusicKit)

**Not in T-DJ yet.** It is planned (playlists with ISRC matching; see `docs/research/connectors.md`), and these are the
owner-only steps to prepare, because Apple Music is not OAuth: every request carries a **developer token** that the
owner signs with a private key, plus each listener's **Music User Token** from MusicKit. There is no
bring-your-own: the developer token is the owner's, and a listener needs an Apple Music subscription.

1. **Apple Developer Program** membership ($99 a year), signed in at
   **[developer.apple.com/account](https://developer.apple.com/account)**. Note the **Team ID** (Membership details).
2. **Media ID** (for MusicKit on the web and the server):
   **[Identifiers](https://developer.apple.com/account/resources/identifiers/list/mediaId)** → **+** → **Media IDs** →
   description and a reverse-domain identifier (e.g. `media.com.example.tdj`) → tick **MusicKit** → Register.
3. **Private key**: **[Keys](https://developer.apple.com/account/resources/authkeys/list)** → **+** → name it, tick
   **Media Services (MusicKit, ShazamKit, Apple Music Feed)** → **Configure** → choose the Media ID → Save → Continue
   → Register → **Download** the `.p8` file (**once only**) and note the **Key ID**.
4. **The apps** (MusicKit on device): in **Identifiers → App IDs** → the app's bundle ID (`com.ariomoniri.tdj` for
   T-DJ's) → **App Services** → tick **MusicKit**.
5. **Developer token**: a JWT signed **ES256** with the `.p8` key, header `{ "alg": "ES256", "kid": "<Key ID>" }`,
   claims `{ "iss": "<Team ID>", "iat": <now>, "exp": <at most 6 months later> }` and, for the web, an
   `"origin": ["https://your-app.example"]` claim so it only works from your site. The server signs it; the key
   never leaves the server.
6. Keep them as `APPLE_TEAM_ID`, `APPLE_MUSIC_KEY_ID` and `APPLE_MUSIC_PRIVATE_KEY` (the PEM text) in Parameter Store
   or GitHub secrets, ready for when the connector ships. T-DJ does not read them yet.

---

## Deezer, MusicBrainz, LRCLIB

Keyless and free; nothing to set up. Deezer gives 30-second previews and song details (public API, about 50 requests
per 5 seconds), MusicBrainz gives recording dates, singers and labels (about 1 request a second; T-DJ sends a
descriptive User-Agent as MusicBrainz asks), and LRCLIB gives synced lyrics. If one of them is down, Settings →
Connections still says *Ready*, and each feature that uses it says what it could not reach.

---

## For self-hosters: environment variables

A self-hosted server reads every connector credential from the **environment first, then AWS Parameter Store**
(`/tdj/<stage>/<KEY>`, SecureString), so a value set either way works, and the environment wins
(`apps/web/src/lib/server/config.ts`). `sst.config.ts` forwards these names to the server function when they are set;
none of them reaches the browser.

| Variable | Connector | Secret? | Also settable at `/admin` |
|---|---|---|---|
| `SPOTIFY_CLIENT_ID` | Spotify (server login) | no (public) | yes |
| `SPOTIFY_CLIENT_SECRET` | Spotify | **yes** | yes |
| `GOOGLE_CLIENT_ID` | Google Drive + YouTube playlists | no (public) | yes |
| `GOOGLE_CLIENT_SECRET` | Google | **yes** | yes |
| `DROPBOX_APP_KEY` | Dropbox | no (public) | yes |
| `DROPBOX_APP_SECRET` | Dropbox | **yes** | yes |
| `YOUTUBE_API_KEY` | YouTube search without a login | **yes** (keep it private) | no: use one of the ways below |
| `NEXT_PUBLIC_APP_URL` | the public address used in redirect URIs | no | yes ("Public URL") |
| `TDJ_SPOTIFY_CLIENT_ID` (repository *variable*) | the Client ID built into the Mac / iPad apps | no | no |

### Where to set them

- **The `tdj` CLI** (any route): `pnpm tdj connectors` walks through each service: what it unlocks, its limits, the
  console to open, the exact redirect URIs and scopes for your app's address, then asks for the keys (the public ID
  visibly, the secret typed hidden). It stores them:
  - `--target aws` (the default for the CLI route): **Parameter Store** `/tdj/<stage>/<KEY>`, through a 0600 file that is
    deleted at once; the app picks them up within a minute, **no redeploy**;
  - `--target github` (the default for the fork route): the fork's **GitHub secrets** through stdin; run *Deploy to AWS*
    again so the function gets them;
  - `--target local`: **`apps/web/.env.local`** for `pnpm dev` (git-ignored, mode 0600; restart `pnpm dev`).

  `--only youtube,dropbox` picks services; values already in the environment (`DROPBOX_APP_KEY=… pnpm tdj connectors
  --yes`) are used without a question. Secrets are never printed or put on a command line.
- **GitHub secrets** by hand: your fork → *Settings → Secrets and variables → Actions → New repository secret*, with
  the names above. `.github/workflows/deploy-aws.yml` forwards them on the next deploy.
- **`/admin`** in your deployed app: Spotify, Google and Dropbox (with the exact redirect URIs to copy and a *Test*
  button). It writes the same Parameter Store entries.
- **Local run**: `apps/web/.env.local` (as `tdj connectors --target local` writes it), or the variables in your
  shell: `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… pnpm dev`. Open `http://127.0.0.1:3000`, not `localhost`.

### How to verify

- `pnpm tdj connectors --check`: which keys are set at the target (names only, never values) and whether the running
  app reports each service at `/api/admin/public`.
- `curl https://your-app.example/api/admin/public` answers `providers` (`spotify`, `google`, `dropbox`: true when both
  the ID and the secret are set) and `keys.youtube`. No value is ever in it.
- `/admin` → *Test* next to each service proves the saved pair against the provider.
- In the app: **Settings → Connections**: each service reads *Ready* when the server's credentials work.

---

## For organisations

A company or association account changes what the providers allow. What it helps with, and what to prepare:

### Google: app verification

Verification lifts the 100-test-user cap and the 7-day sign-ins, and removes the "unverified app" screen.

- **Who**: an organisation's Google Workspace or Cloud account is not required, but the **domain must be yours**
  (verified in Search Console) and the support e-mail should be on it.
- **Prepare**: a homepage and a **privacy policy** on your domain that say what T-DJ does with Drive and YouTube data
  (only files it created; playlists it made), terms of service, the app logo and name exactly as shown, the list of
  scopes with one sentence each, and for `youtube` a **demo video** (unlisted YouTube link) of the consent screen and
  the export.
- **Where**: [Verification centre](https://console.cloud.google.com/auth/verification) → *Prepare for verification*.

### Spotify: extended quota

The only way past 5 users per app.

- **Criteria** (Spotify, May 2025): a **legally registered business or organisation** (not an individual), an
  **established, launched service with at least 250,000 monthly active users**, available in Spotify's key markets,
  commercially viable, and compliant with the Developer Terms and the Design Guidelines.
- **Prepare**: company registration, the service's MAU figures, screenshots or a video of every place Spotify content
  and the Spotify logo appear (attribution and "Play on Spotify" links as the guidelines require), the scopes and why
  each is needed, and the privacy policy.
- **Where**: [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → your app → *Extension
  request*. Until a club reaches that size, keep to **one Spotify app per 5 DJs** with the bring-your-own Client ID.

### YouTube: more quota

- **What**: a higher daily quota than 10,000 units for one Cloud project.
- **Prepare**: an organisation account helps the review (a company name, a website and a privacy policy on your
  domain); T-DJ's use of the API (search and playlist creation on behalf of signed-in users, as above); the expected
  calls per day from the [quota math](#quota-math); and compliance with the YouTube API Services Terms (the player stays
  visible, nothing downloaded).
- **Where**: the **[YouTube API Services audit and quota extension form](https://support.google.com/youtube/contact/yt_api_form)**.
  Google audits the app first; plan for several weeks. Meanwhile, each DJ's own API key has its own 10,000 units.

### Apple

An organisation enrolled in the Apple Developer Program (D-U-N-S number) publishes the apps and owns the MusicKit key
under its own name, not a person's. See [Apple Music](#apple-music-musickit) and [APPLE_SETUP.md](APPLE_SETUP.md).

### Dropbox

At 50 linked users, apply for **production** in the App Console (app name, description, how files are used). A
company name and website make it routine.
