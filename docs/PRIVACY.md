# TDJ privacy policy

Last updated: 14 November 2026. Applies to the TDJ apps for Mac and iPad, the TDJ website (the TDJ cloud), and
any TDJ server run from this project. Contact: open an issue at https://github.com/ArioMoniri/TDJ/issues (or
use the organiser contact shown on your server's Settings page).

## In short

- No account, no name, no e-mail, no tracking, no advertising, no analytics SDK.
- **The Mac and iPad apps collect no data.** They work entirely on your device: the catalogue, the composer, your
  database, history and settings stay in the app. No TDJ server is involved unless you link one yourself.
- Your model API keys stay on your device. Your music files stay on your device.

## The Mac and iPad apps

| What | Where it lives | Why |
|---|---|---|
| Your nights, history ("On this device"), database edits, what TDJ learned from your edits, settings, cached previews and artwork | the app's own database on your device | so they are there next time |
| Model API keys (Anthropic, OpenAI, Gemini, OpenRouter) you enter | the Keychain on your device | the app sends each model request straight to the provider you chose, with your key; there is no shared key and no TDJ server in between |
| AI agents you connect (ACP) | their address or start command in the app's settings | the app asks the agent you chose directly: over its address, or (Mac) as a program on your computer |
| Your Discogs token, if you add one | the app's settings on your device | sent only to Discogs, when you ask TDJ to fill in missing data |
| Your Spotify sign-in | the Keychain on your device | to create playlists and play music you ask for; the app talks to Spotify directly |
| Music files in folders you link | your device only; the app reads them to play them | the Booth plays your own files |

The apps send song titles and orchestra names (no personal data, no identifier) to Deezer and MusicBrainz for
previews and recording facts (and to the Cover Art Archive and Discogs when you ask TDJ to fill in missing data),
show cover artwork from those services' image servers, and talk to Spotify and the AI provider only when you
connect them or ask for something. Nothing is sent to the developer.

**Optional: a TDJ server you link.** Under Settings → Connections (off by default) you can link a TDJ server you
or your organiser run, for rooms and to keep that server's database in sync with this device; Google Drive,
YouTube and Dropbox then sign in through it. From then on, the database edits you make are also saved on that
server, under that server's own policy (the next section describes what a TDJ server keeps). Unlink it in the
same place.

## The website and TDJ servers

| What | Where it lives | Why |
|---|---|---|
| An anonymous random id (`tdj_uid` cookie, signed by the server) | your device; the server sees it with each request | to count the daily use of a shared AI key fairly, and, when the server's database is turned on, to keep *your* database edits and saved sets apart from other people's |
| Your nights, history, database edits, notes and settings | your browser's storage and, when the server database is on, the server's database under the anonymous id | so they are there next time |
| Feedback you send with the feedback form | the server's store | to improve TDJ |
| Model API keys you enter | your browser only | each request that needs a model carries the key to the TDJ server, which passes it to the provider you chose and **does not store it** |
| Spotify, Google, Dropbox sign-ins | an encrypted ("sealed") cookie in your browser; the server keeps no copy | to create playlists, save exports, play music you ask for |

TDJ does not sell or share personal data and does not track you across apps or websites.

## Services TDJ talks to

- **The apps:** no TDJ server, unless you link one (above).
- **The website:** the TDJ server you use (the TDJ cloud runs on Amazon Web Services in the United States, or the
  server your organiser runs).
- **Spotify, Google (Drive, YouTube), Dropbox** — only when you connect them, under their own privacy policies.
- **Deezer, MusicBrainz, Cover Art Archive, iTunes Search** — song previews and facts, requested without any
  personal data (by the app itself, or by the server for the website).
- **The AI provider you choose** — only with your own key (or, on a server, the organiser's shared key), only
  when you ask for an AI review or edit.

## Keeping and deleting

Data on your device: delete it in Settings, or remove the app / clear the site's data. Sign out of a service
in Settings. Data on a server database under your anonymous id: ask the server's organiser to delete it, or open
an issue for the TDJ cloud. Server logs of the TDJ cloud are kept for at most 30 days.

## Children

TDJ is not directed at children under 13 and does not knowingly collect their data.

## Changes

Changes to this policy are made in this file; its history is public in the repository.
