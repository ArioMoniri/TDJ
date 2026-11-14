# TDJ privacy policy

Last updated: 14 November 2026. Applies to the TDJ website (the TDJ cloud), the TDJ apps for Mac and iPad, and
any TDJ server run from this project. Contact: open an issue at https://github.com/ArioMoniri/TDJ/issues (or
use the organiser contact shown on your server's Settings page).

## In short

- No account, no name, no e-mail, no tracking, no advertising, no analytics SDK.
- Your model API keys stay on your device. Your music files stay on your device.
- Connections to Spotify, Google or Dropbox are stored in an encrypted cookie on your device, not in a database.

## What TDJ processes and why

| What | Where it lives | Why |
|---|---|---|
| An anonymous random id (`tdj_uid` cookie, signed by the server) | your device; the server sees it with each request | to count the daily use of a shared AI key fairly, and, when the server's database is turned on, to keep *your* database edits and saved sets apart from other people's |
| Your nights, history, database edits, notes and settings | your device (browser storage, or the app's storage) and, when the server database is on, the server's database under the anonymous id | so they are there next time |
| Feedback you send with the feedback form | the server's store | to improve TDJ |
| Model API keys (Anthropic, OpenAI, Gemini, OpenRouter) you enter | your device only | each request that needs a model carries the key to the TDJ server, which passes it to the provider you chose and **does not store it** |
| Spotify, Google, Dropbox sign-ins | an encrypted ("sealed") cookie on your device; the server keeps no copy | to create playlists, save exports, play music you ask for |
| Music files in folders you link (apps) | your device only; the app reads them to play them | the Booth plays your own files |

TDJ does not sell or share personal data and does not track you across apps or websites.

## Services TDJ talks to

- **The TDJ server** you use (the TDJ cloud runs on Amazon Web Services in the United States, or the server
  your organiser runs).
- **Spotify, Google (Drive, YouTube), Dropbox** — only when you connect them, under their own privacy policies.
- **Deezer, MusicBrainz, Cover Art Archive, iTunes Search** — song previews and facts, requested by the server
  without any personal data.
- **The AI provider you choose** — only with your own key, only when you ask for an AI review or edit.

## Keeping and deleting

Data on your device: delete it in Settings, or remove the app / clear the site's data. Sign out of a service
in Settings → Connections. Data on a server database under your anonymous id: ask the server's organiser to
delete it, or open an issue for the TDJ cloud. Server logs of the TDJ cloud are kept for at most 30 days.

## Children

TDJ is not directed at children under 13 and does not knowingly collect their data.

## Changes

Changes to this policy are made in this file; its history is public in the repository.
