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
  not change the answer above.
- **Sync** (off until turned on; below): end-to-end encrypted, the developer's default sync server stores only
  ciphertext it cannot read.

## Sync (docs/SYNC.md)

Settings → Sync keeps a DJ's nights, History, favourites, settings and learned preferences the same on their
devices. It is **off until the DJ turns it on**, has **no account**, and is **end-to-end encrypted**: the sync code
that encrypts it is made on the device and never leaves the DJ's devices. The developer (who runs the default sync
server) and Apple (iCloud) store **only ciphertext** they cannot read, under an id derived from the code that names
no one. No email, name, phone number, device identifier or usage data is collected.

How to answer (Apple defines "collect" as transmitting data off the device in a way that lets you or your partners
**access** it longer than needed to serve the request; end-to-end encrypted data the developer cannot decrypt is
not accessible to it):

- **Data Not Collected** stays the answer. The developer cannot access the synced library, cannot link it to a
  person, and uses nothing for tracking, advertising or analytics.
- If App Review asks, say: "Optional sync is end-to-end encrypted on the device (AES-256-GCM, a key derived from a
  random code that never leaves the user's devices). Our server stores only ciphertext; we cannot read it."
- If Apple's form is ever read as requiring a disclosure for it, the narrowest true one is: User Content → Other
  User Content · App Functionality · **not** linked to the user · **not** used for tracking.

What a sync server sees: that an encrypted space exists, record counts and sizes, change times, a random tag per
device with its last request time, and each request's IP address (as any web server). iCloud: the same ciphertext
files in the app's own iCloud container (Mac App Store and iOS builds; the Developer ID DMG has no iCloud).

Export compliance: the encryption is the system's own (WebCrypto in WebKit: AES-GCM, HKDF, HMAC), used to protect
the user's own data; `ITSAppUsesNonExemptEncryption = false` stays correct (exempt: standard encryption, data
protection only).

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
