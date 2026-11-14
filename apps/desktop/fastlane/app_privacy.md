# App Privacy answers (App Store Connect → TDJ → App Privacy)

The App Store Connect API cannot set these, so they are entered once by hand (about 3 minutes). They match
what the code does (checked 2026-11-14) and `src-tauri/PrivacyInfo.xcprivacy`. Re-check when a feature that
sends data is added.

**Privacy Policy URL:** https://github.com/ArioMoniri/TDJ/blob/HEAD/docs/PRIVACY.md

**Do you or your third-party partners collect data from this app?** Yes.

| Data type (Apple's list) | Collected | Linked to the user | Tracking | Purpose | Why |
|---|---|---|---|---|---|
| Identifiers → User ID | Yes | **No** | **No** | App Functionality | the anonymous signed `tdj_uid` cookie (random id, no name or e-mail): the daily limit of the shared AI key and, when the server database is on, the rows of the DJ's own database |
| User Content → Other User Content | Yes | **No** | **No** | App Functionality | feedback text the DJ sends, saved sets and database edits when the server database is on |

Everything else: **not collected** — no contact info, no location, no health, no financial info, no browsing
history, no purchases, no diagnostics, no usage data, no advertising data. No third-party SDK for analytics or
ads.

Facts behind the answers:
- Model API keys (Anthropic, OpenAI, Gemini, OpenRouter) stay on the device; each request carries the key in a
  header to the TDJ server, which forwards it to the chosen provider and stores nothing.
- Spotify, Google and Dropbox logins: the tokens live in an encrypted (sealed) cookie on the device; the server
  keeps no copy. The service itself receives what the DJ sends to it (a playlist, a file).
- Local music files never leave the device.

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
