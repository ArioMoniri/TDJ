# Connectors

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
