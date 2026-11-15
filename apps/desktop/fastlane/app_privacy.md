# App Privacy answers (App Store Connect → TDJ → App Privacy)

The App Store Connect API cannot set these, so they are entered once by hand (about 3 minutes). They match
what the code does (checked 2026-11-14, the standalone app) and `src-tauri/PrivacyInfo.xcprivacy`. Re-check when a
feature that sends data is added.

**Privacy Policy URL:** https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/PRIVACY.md

**Do you or your third-party partners collect data from this app?** **No** ("Data Not Collected").

Why: the apps are standalone. The catalogue, the composer, the DJ's database, history, settings and learned
preferences live on the device (the bundled UI and its SQLite database); no TDJ server is contacted and there is
no account, no identifier, no analytics or advertising SDK. Nothing is sent to the developer.

Facts behind the answer:
- Composing, improving, benchmarking and swaps run in the app (`@tdj/core` in a Web Worker) over the catalogue
  shipped inside it.
- Song previews and recording facts come from Deezer and MusicBrainz (and, when the DJ asks to fill in missing
  data, the Cover Art Archive and Discogs), requested by the app with the song's title and orchestra only (no
  personal data, no identifier). Cover artwork is shown from those services' image servers.
- Model API keys (Anthropic, OpenAI, Gemini, OpenRouter) are the DJ's own, kept in the Keychain; the app sends
  requests straight to the provider the DJ chose. There is no shared key and no TDJ server in between. An ACP
  agent the DJ connects is asked directly (its address, or on the Mac a program the DJ entered).
- Spotify: the DJ signs in to their own account (Authorization Code with PKCE, no client secret in the app); the
  tokens stay in the Keychain and the app talks to Spotify directly. Spotify receives what the DJ sends (a
  playlist, a search).
- Local music files never leave the device.
- **Optional link to a TDJ server** (Settings → Connections, off by default): a DJ may link a server they run
  themselves (or their organiser runs) for rooms, database sync, Google and Dropbox. That server is the DJ's own
  choice and not operated for this app; nothing is linked unless the DJ types its address and confirms. It does
  not change the answer above. If the developer ever operates a server that the app links to by default, revisit
  these answers.

## Age rating (App Store Connect → the version → Age Rating)

`fastlane/metadata/app_rating_config.json` uploads the classic answers (all "None", no gambling, no
unrestricted web access). Answer the newer questions by hand:
- User-generated content: **No** · Messaging or chat: **No** · Advertising: **No** · Parental controls: **No** ·
  Age assurance: **No** · Health or wellness topics: **No** · Loot boxes: **No**.
- AI / generated content: **Yes** — the optional AI DJ writes short text about music with the DJ's own key.

Expected rating: 4+ (or 9+ if Apple maps the AI answer that way).

## Export compliance

`ITSAppUsesNonExemptEncryption = false` is in both Info.plists (only HTTPS and the operating system's own
cryptography), so App Store Connect does not ask per build.
