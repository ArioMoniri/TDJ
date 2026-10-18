# TDJ — Engineering research (state of the art as of 2026-10-18)

Scope: Next.js + TypeScript pnpm/Turborepo monorepo, one-click AWS deploy. Every version below was read from the npm registry (`registry.npmjs.org/<pkg>`) on 2026-10-18 unless noted. "Verified" = fetched from the primary source today; "secondary" = blog/third-party.

Repo facts noticed (so advice matches): `packageManager: pnpm@10.18.0`, `engines.node >=22`, Biome `^2.2.0`, Turbo `^2.5.0`, TS `^5.9.0`, `deploy: sst deploy --stage production`, workspaces `apps/*` + `packages/*` (`packages/core` exists, `apps/` empty).

---

## 1. Spotify Web API (October 2026)

### 1.1 The three regime changes you must design around

| Date | Change | Source |
|---|---|---|
| 2024-11-27 | **Restricted for new apps / dev-mode apps**: Related Artists, Recommendations, **Audio Features**, **Audio Analysis**, Featured Playlists, Category Playlists, 30-s `preview_url` in multi-get responses, algorithmic/editorial playlists. Apps that already had Extended Quota and used them "remain unaffected". | https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api |
| 2026-02-11 (new apps) / 2026-03-09 (existing dev-mode apps; later "postponed", no new date) | **Development Mode overhaul**: app owner must hold **Spotify Premium**; **5 users per app** (allowlist); batch-fetch endpoints removed (`GET /tracks?ids=`, `/albums`, `/artists`, …); `GET /artists/{id}/top-tracks`, `/browse/*`, `/markets`, `GET /users/{id}`, `GET /users/{id}/playlists`, `POST /users/{id}/playlists` removed; library endpoints consolidated into `PUT/DELETE /me/library` + `GET /me/library/contains`; playlist track endpoints moved from `/playlists/{id}/tracks` → **`/playlists/{id}/items`** (field `tracks`→`items`, `tracks.tracks.track`→`items.items.item`); **search `limit` max 50→10, default 20→5**; fields removed from objects (`popularity`, `available_markets`, `linked_from` on tracks; `followers`/`popularity` on artists; `email`/`country`/`product` on `/me`). Playlist *contents* are only returned for playlists the user owns/collaborates on. | https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide ; https://developer.spotify.com/documentation/web-api/references/changes/february-2026 |
| 2026-06-18 (new apps) / 2026-07-20 (existing) | **Refresh tokens expire 6 months after the user's original authorization**; refreshing does not extend; applies to Authorization Code + PKCE, not Client Credentials. On expiry `POST /api/token` → `400 invalid_grant` — do not retry, re-run the auth flow. Store the authorization timestamp yourself (token carries none). | https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration |
| 2026-07-23 | **25 Client IDs per developer account** (was 1); dev-mode quota is now **per developer account** (all your apps share one pool); quota 429s carry `"reason": "QUOTA_EXCEEDED"` to distinguish from rate-limit 429s. | https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates ; https://developer.spotify.com/documentation/web-api/references/changes/july-2026 |

**Audio Features / Recommendations / Related Artists today:** the reference pages are labelled **Deprecated** (verified on `get-audio-features`), and a new app in Development Mode gets 403 on them. There is no path for an individual developer to regain them: Extended Quota Mode is **organizations only since 2025-05-15** (legally registered business, launched service, **≥250k MAU**, review up to 6 weeks). Treat BPM/energy/valence from Spotify as **unavailable** for TDJ; see §2.

Sources: https://developer.spotify.com/documentation/web-api/concepts/quota-modes ; https://developer.spotify.com/documentation/web-api/reference/get-audio-features

### 1.2 Development vs Extended Quota (verified 2026-10-18)

- Dev mode (default): up to **5 authenticated users** (allowlist; non-allowlisted users can log in but get 403 on API calls); owner must keep Premium; per-account quota buckets; lower rate limit.
- Extended: unlimited users, higher rate limit, business-only (above).
- Rate limit: computed over a **rolling 30-second window**; 429 includes `Retry-After` (seconds). No numbers are published. Some endpoints (playlist cover upload) have separate limits.
  https://developer.spotify.com/documentation/web-api/concepts/rate-limits

Consequence for TDJ: Spotify integration is a **personal-use/BYO-app feature**. Ship a settings panel where each DJ pastes *their own* Client ID (they create the app in the Spotify dashboard, add themselves + ≤4 friends to the allowlist, must have Premium). Do not promise a shared TDJ Spotify app.

### 1.3 Auth

**PKCE (browser / Next.js client, no secret):**

```
GET https://accounts.spotify.com/authorize
  ?client_id=…&response_type=code&redirect_uri=…&state=…
  &scope=playlist-modify-public playlist-modify-private playlist-read-private
  &code_challenge_method=S256&code_challenge=<base64url(sha256(verifier))>
POST https://accounts.spotify.com/api/token  (application/x-www-form-urlencoded)
  grant_type=authorization_code&code=…&redirect_uri=…&client_id=…&code_verifier=…
POST …/api/token  grant_type=refresh_token&refresh_token=…&client_id=…
```

```ts
// packages/core/src/spotify/pkce.ts
export async function pkcePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return { verifier, challenge };
}
```
Verifier must be 43–128 chars. Redirect URI must match exactly; use `http://127.0.0.1:3000/callback` in dev (Spotify no longer accepts `localhost`). Refresh response "might not include a new refresh_token" — keep the old one. Gotcha: the 6-month hard expiry means you must persist `authorizedAt` and prompt re-auth.
https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

**Client Credentials (server-only, catalogue reads, no user):** `POST /api/token` with `grant_type=client_credentials`, header `Authorization: Basic base64(client_id:client_secret)`. Cannot touch `/me/*` or create playlists. Not affected by refresh-token expiry.

### 1.4 Create playlist + add tracks (current endpoints)

```
POST https://api.spotify.com/v1/me/playlists          (scopes: playlist-modify-public | playlist-modify-private)
{ "name": "Milonga La Viruta 2026-10-24", "public": false, "collaborative": false,
  "description": "TDJ · 4 tandas · DiSarli/Troilo/D'Arienzo/Pugliese" }
→ 201 { id, uri, snapshot_id, … }

POST https://api.spotify.com/v1/playlists/{playlist_id}/items   (max 100 URIs per call; order preserved; optional "position")
{ "uris": ["spotify:track:…", "spotify:track:…"] }
→ 201 { "snapshot_id": "…" }
```

```ts
const r = await fetch('https://api.spotify.com/v1/me/playlists', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, public: isPublic, description }) });
const { id } = await r.json();
for (let i = 0; i < uris.length; i += 100)
  await fetch(`https://api.spotify.com/v1/playlists/${id}/items`, { method: 'POST', headers, body: JSON.stringify({ uris: uris.slice(i, i+100) }) });
```

**Can API-created playlists be public?** Yes — `public` defaults to `true` on `POST /me/playlists` (private needs `playlist-modify-private`; collaborative requires `public:false` + both scopes). Note Spotify's `public` means "shown on profile"; anyone with the link can open a non-public playlist. Per-user cap ≈11 000 playlists. Dev-mode caveat: only the ≤5 allowlisted users can *call the API*; the resulting playlist itself is a normal Spotify playlist and anyone can follow it.
https://developer.spotify.com/documentation/web-api/reference/create-playlist ; https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist

Old endpoints `POST /users/{id}/playlists` and `POST /playlists/{id}/tracks` are **removed** for dev-mode apps.

### 1.5 Search

`GET /v1/search?q=…&type=track&market=AR&limit=10&offset=0` — `limit` **0–10 (default 5)**, `offset` 0–1000, `type` ∈ album,artist,playlist,track,show,episode,audiobook. Field filters: `artist:`, `track:`, `album:`, `year:1941` or `year:1939-1944`, `genre:`, `isrc:`, `upc:`. Example for tango: `q=track:"Bahía Blanca" artist:"Carlos Di Sarli"&type=track&limit=10`. No batch `GET /tracks?ids=` any more → fetch singles (`GET /tracks/{id}`) and cache aggressively. Policy: Spotify content may not be used to train ML/AI models.
https://developer.spotify.com/documentation/web-api/reference/search

### 1.6 Duration & preview

- `duration_ms` is still on the track object (`GET /tracks/{id}`) — use it for tanda length maths.
- `preview_url` is **deprecated and nullable** (`null` for new apps); "Audio Preview Clips may not be offered as a standalone service". Use Deezer previews instead (§2).
https://developer.spotify.com/documentation/web-api/reference/get-track

### 1.7 SDKs

- `@spotify/web-api-ts-sdk` — last release **1.2.0 (2024-01-17)**; predates every change above (uses `/playlists/{id}/tracks`, `limit` up to 50). Don't adopt; write a ~150-line typed `fetch` client in `packages/core`.
- `spotify-web-api-node` 5.0.2 (2021) — dead.

### 1.8 Spotify × Claude (official connector / MCP)

- Official **Spotify connector for Claude** launched **2026-04-23** (Spotify newsroom), listed at https://claude.com/connectors/spotify (added April 2026, "made by Spotify", endpoint `https://mcp-gateway-external-pilot.spotify.net/mcp`, marked *pilot*). Tools: `search`, `create_playlist`/`generate_playlist`, `get_currently_playing`, `save_to_library`, `remove_from_library`, `fetch_tracks`; Premium users can "describe a vibe" to get a generated playlist; playback via Spotify Connect. Available to Free/Pro/Max Claude users on web/mobile/desktop. There is **no public developer MCP server** from Spotify; the connector is consumer-facing (this session has `mcp__Spotify__*` tools: `search`, `generate_playlist`, `get_currently_playing`, `save_to_library`, `remove_from_library`).
- Community: `verIdyia/spotify-mcp` (updated for Feb-2026 API), `varunneal/spotify-mcp` (inactive).
Sources: https://newsroom.spotify.com/2026-04-23/claude-integration/ ; https://claude.com/connectors/spotify ; https://github.com/verIdyia/spotify-mcp

---

## 2. Audio-analysis alternatives (BPM / energy) — what is legal and alive

| Source | Status 2026-10 | BPM? | Energy/valence? | Preview? | Licence/auth |
|---|---|---|---|---|---|
| **Deezer Simple API** (`https://api.deezer.com/track/{id}`, `/search?q=`) | Live, verified by live call today; new app registration for the *OAuth* API is effectively closed (community asking to reopen), but **public endpoints need no key** | `bpm` (float, often **0** for old recordings — e.g. 0 for Daft Punk 3135556 today), `gain` (ReplayGain-style dB, e.g. -12.4) | no | `preview` 30-s MP3 (signed URL, expires ~15 min) | ToS: non-commercial display, attribution; previews must not be downloaded/stored |
| **MusicBrainz** (`/ws/2/recording?query=…&fmt=json`) | Live (verified; requires `User-Agent: TDJ/0.1 (email)`; 1 req/s) | no (has `length` ms, ISRC, release year) | no | no | CC0 metadata |
| **AcousticBrainz** | **Ended 2022-02-16**; API endpoint returns 400 today; data dumps (low-level JSON incl. BPM/key) still downloadable | dump only | dump only (danceability etc.) | — | CC0 |
| **Essentia.js** (`essentia.js` 0.1.3, 2021-06-24) | Unmaintained npm but functional WASM; `RhythmExtractor2013` (multifeature) gives BPM + beats + confidence; offline-only | yes | partial (loudness, onset rate; "energy" must be derived) | — | AGPL-3.0 (viral — isolate in a worker/package or run server-side) |
| **web-audio-beat-detector** 8.2.39 (2026-08-26) | Maintained, MIT | yes (`guess(audioBuffer)` → {bpm, offset}) | no | — | MIT |
| **realtime-bpm-analyzer** 5.0.16 (2026-10-16) | Maintained | yes (streaming) | no | — | Apache-2.0 |
| **Apple Music API / MusicKit** | Live; needs paid Apple Developer ($99/yr) + JWT developer token; catalog reads need no user | **no tempo attribute** (Songs attributes: `durationInMillis`, `previews[]`, `isrc`, `genreNames`…) | no | `previews[].url` | DPLA 3.3.6 D: only to facilitate users' Apple Music subscriptions |
| **TIDAL API (v2, developer.tidal.com)** | Live, client-credentials for catalog; track attributes include `bpm`/`key` on newer catalogue items (not verified for 1940s tango) | partial | no | no public preview | free dev tier, ToS restricts storage |
| **YouTube Data API v3** | Live; 10 000 units/day; `playlists.insert` 50 u, `playlistItems.insert` 50 u | no | no | — | no audio access; `ytmusicapi` (Python, cookie-based, unofficial) ≠ allowed |
| **Bandcamp** | Developer API gated to labels/merch partners; no catalogue/audio endpoints | no | no | — | — |

Recommendation for TDJ's "energy arc": (1) keep a **curated static index** (you already have `scripts/build_index.py`) with BPM/energy for the golden-age canon — tango metadata is small (≈ 10–20k recordings) and this is what pro tango DJs use (tango.info/tango-dj.at style); (2) for user-uploaded files, compute BPM **in-browser** with `web-audio-beat-detector` (MIT) on a decoded `AudioBuffer`, plus RMS/loudness-based "energy" via Web Audio — no licence issues, no upload; (3) use **Deezer** only for `preview` + `duration` + ISRC matching; never store previews. Avoid Essentia.js in the Next.js bundle (AGPL).

```ts
import { guess } from 'web-audio-beat-detector';
const ctx = new AudioContext();
const buf = await ctx.decodeAudioData(await file.arrayBuffer());
const { bpm, offset } = await guess(buf);           // e.g. { bpm: 128, offset: 0.23 }
// crude energy: mean RMS of channel 0
const ch = buf.getChannelData(0); let s = 0; for (let i = 0; i < ch.length; i += 64) s += ch[i] * ch[i];
const rms = Math.sqrt(s / (ch.length / 64));
```
Gotcha: beat detectors are tuned for 90–180 BPM 4/4; tango (≈ 60–70 BPM in 2/4, often counted 120–140) and vals (3/4) can be reported at ×2 / ×½ — normalise with a genre-aware range (tango 110–145 "DJ BPM", milonga 95–115, vals 150–185 counted in 3).

Sources: https://blog.metabrainz.org/2022/02/16/acousticbrainz-making-a-hard-decision-to-end-the-project/ ; https://essentia.upf.edu/reference/std_RhythmExtractor2013.html ; https://developers.deezer.com/api ; https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary ; https://developer.tidal.com/

---

## 3. DJ-software export formats

All are "collection + playlist" documents. TDJ should keep one internal model `{ tracks: Track[], playlists: Playlist[] }` with `Track.location` as an absolute local path, and write each format from that.

### 3.1 Rekordbox XML (import via *File → Library → Import collection in xml*)

Required: root `DJ_PLAYLISTS Version="1.0.0"`, `PRODUCT`, `COLLECTION Entries=N` with `TRACK` having at least `TrackID` + `Location` (URI, `file://localhost/` + percent-encoded absolute path), and `PLAYLISTS` with a ROOT folder `NODE Type="0"` containing playlist `NODE Type="1" KeyType="0"` whose `TRACK Key` = `TrackID`. `TotalTime` in **seconds**, `Size` bytes, `Rating` 0/51/102/153/204/255, `Tonality` key string, `AverageBpm` float.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="TDJ" Version="0.1.0" Company="TDJ"/>
  <COLLECTION Entries="2">
    <TRACK TrackID="1" Name="Bahía Blanca" Artist="Carlos Di Sarli" Album="" Genre="Tango" Kind="MP3 File"
           TotalTime="173" Year="1957" AverageBpm="124.00" DateAdded="2026-10-18" Tonality="Dm" Rating="0"
           Location="file://localhost/Users/dj/Music/Tango/Di%20Sarli/Bahia%20Blanca.mp3">
      <TEMPO Inizio="0.120" Bpm="124.00" Metro="4/4" Battito="1"/>
    </TRACK>
    <TRACK TrackID="2" Name="Cortina - Blue Monk" Artist="Thelonious Monk" Genre="Cortina" Kind="MP3 File" TotalTime="35"
           Location="file://localhost/Users/dj/Music/Cortinas/Blue%20Monk%2035s.mp3"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Milonga 2026-10-24" Type="1" KeyType="0" Entries="2">
        <TRACK Key="1"/>
        <TRACK Key="2"/>
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
```
Gotchas: Windows paths → `file://localhost/C:/…`; encode with `encodeURI` (not `encodeURIComponent`) so `/` survives; `KeyType="1"` lets `Key` be the Location string instead of TrackID; Rekordbox 7 still reads this format. Reference: https://pyrekordbox.readthedocs.io/en/stable/formats/xml.html (Pioneer's PDF spec "rekordbox_xml_format_list.pdf" is linked there).

### 3.2 Traktor NML (Traktor Pro 3/4; import via drag of `.nml` or *File → Import collection*)

Verified from a real fixture (`NML VERSION="19"`). Minimal valid file with one playlist (Traktor 3.x/4.x use VERSION 19/20):

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<NML VERSION="19">
  <HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"/>
  <MUSICFOLDERS/>
  <COLLECTION ENTRIES="1">
    <ENTRY TITLE="Bahía Blanca" ARTIST="Carlos Di Sarli">
      <LOCATION DIR="/:Users/:dj/:Music/:Tango/:Di Sarli/:" FILE="Bahia Blanca.mp3" VOLUME="Macintosh HD" VOLUMEID="Macintosh HD"/>
      <ALBUM TITLE="Instrumentales"/>
      <INFO GENRE="Tango" PLAYTIME="173" PLAYTIME_FLOAT="172.9" RELEASE_DATE="1957/1/1" KEY="Dm"/>
      <TEMPO BPM="124.000000" BPM_QUALITY="100.000000"/>
      <MUSICAL_KEY VALUE="5"/>
    </ENTRY>
  </COLLECTION>
  <PLAYLISTS>
    <NODE TYPE="FOLDER" NAME="$ROOT">
      <SUBNODES COUNT="1">
        <NODE TYPE="PLAYLIST" NAME="Milonga 2026-10-24">
          <PLAYLIST ENTRIES="1" TYPE="LIST" UUID="7b2f9c0e2d3c4a6b9f1d2e3c4b5a6978">
            <ENTRY><PRIMARYKEY TYPE="TRACK" KEY="Macintosh HD/:Users/:dj/:Music/:Tango/:Di Sarli/:Bahia Blanca.mp3"/></ENTRY>
          </PLAYLIST>
        </NODE>
      </SUBNODES>
    </NODE>
  </PLAYLISTS>
  <INDEXING/>
</NML>
```
Rules: directories use `/:` as the separator and `DIR` ends with `/:`; `PRIMARYKEY.KEY` = `VOLUME + DIR + FILE`; on Windows `VOLUME="C:"`, `DIR="/:Users/:dj/:Music/:"`; `MUSICAL_KEY VALUE` 0–23 (Open-Key order: 0=C,1=Db…12=Am? — Traktor's own numbering, 0–11 major, 12–23 minor); `PLAYTIME` integer seconds. Traktor rewrites `collection.nml` on exit — never write to the live collection, write a separate `.nml` the user imports. Sources: https://github.com/wolkenarchitekt/traktor-nml-utils/blob/master/tests/fixtures/collection.nml ; https://github.com/maxwell-and-millfield/plow/blob/master/doc/collection%20(reverse%20engineered).nml.xml

### 3.3 Serato DJ crate (`.crate`, binary TLV)

Location: `<drive root>/_Serato_/Subcrates/<Name>.crate` (nested crates: `Parent%%Child.crate`); the crate name is only the filename. Serato DJ Pro rescans the folder on start; also `_Serato_/database V2` (same TLV format, `otrk`/`pfil`) lists known files — Serato will add unknown files when it loads the crate. "Smart crates" are `_Serato_/SmartCrates/*.scrate` (same TLV with rule records) — not worth generating. History: Serato DJ ≤3 writes `_Serato_/History/Sessions/*.session` (TLV `oent`/`adat`), **Serato DJ 4.x stores history in `master.sqlite`** instead.

Format (every record = 4-byte ASCII tag + 4-byte **big-endian** length + payload; `o*` = container, `t*`/`p*` = **UTF-16BE** text, `u*` = u32, `b*` = 1 byte):

```
vrsn  "81.0/Serato ScratchLive Crate"   (UTF-16BE; older files "1.0/Serato ScratchLive Crate")
osrt  { tvcn "song"  brev 0x00 }         sort column (optional)
ovct  { tvcn "song"   tvcw "0" }         visible columns (optional, one ovct per column)
ovct  { tvcn "artist" tvcw "0" }
otrk  { ptrk "Users/dj/Music/Tango/Di Sarli/Bahia Blanca.mp3" }   path relative to drive root, NO leading slash
otrk  { ptrk "…" }
```

```ts
// packages/core/src/export/serato.ts  (Node Buffer)
const be16 = (s: string) => { const b = Buffer.alloc(s.length * 2); for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), i * 2); return b; };
const rec = (tag: string, body: Buffer) => Buffer.concat([Buffer.from(tag, 'ascii'), (() => { const l = Buffer.alloc(4); l.writeUInt32BE(body.length); return l; })(), body]);
export function writeCrate(paths: string[]) {       // paths like "Users/dj/Music/x.mp3" (strip leading "/" or "C:\")
  return Buffer.concat([
    rec('vrsn', be16('81.0/Serato ScratchLive Crate')),
    rec('osrt', Buffer.concat([rec('tvcn', be16('song')), rec('brev', Buffer.from([0]))])),
    ...['song','artist','bpm','length'].map(c => rec('ovct', Buffer.concat([rec('tvcn', be16(c)), rec('tvcw', be16('0'))]))),
    ...paths.map(p => rec('otrk', rec('ptrk', be16(p.replace(/\\/g, '/').replace(/^([A-Za-z]:)?\//, ''))))),
  ]);
}
```
Reference implementations: Mixxx wiki https://github.com/mixxxdj/mixxx/wiki/Serato-Database-Format ; `Holzhaus/serato-tags/scripts/database_v2.py` ; `bvandrc/serato-tools` ; `crobinso/scratchlivedb`. No official spec — validate by opening in Serato DJ Pro (free in practice mode).

### 3.4 VirtualDJ

- `Documents/VirtualDJ/database.xml` (UTF-8, `<VirtualDJ_Database Version="…"><Song FilePath="…"><Tags Author= Title= Genre=/><Infos SongLength= FirstSeen=/><Scan Bpm= Key=/><Poi …/></Song>`) — official wiki says reading is fine, **writing is discouraged**. `Scan Bpm` is stored as **seconds per beat** (e.g. 0.4838 = 124 BPM).
- Playlists (VDJ 2024+): XML files in `Documents/VirtualDJ/MyLists/<Name>.vdjfolder`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<VirtualFolder>
  <song path="/Users/dj/Music/Tango/Di Sarli/Bahia Blanca.mp3" artist="Carlos Di Sarli" title="Bahía Blanca"/>
</VirtualFolder>
```
Only `path` is required. VDJ also imports `.m3u`/`.m3u8` directly. https://virtualdj.com/wiki/VDJ_database.html ; https://virtualdj.com/wiki/Lists.html

### 3.5 Engine DJ (Denon)

Library is SQLite: `Engine Library/Database2/m.db` (tables `Track`, `Playlist`, `PlaylistEntity`, …). Denon's official guidance: **do not alter the schema**; third-party writes are tolerated but fragile. Practical export for TDJ: **M3U8** (Engine DJ imports M3U/M3U8 via *Import Playlist*) or Rekordbox XML (Engine DJ can import Rekordbox libraries). https://support.denondj.com/en/support/solutions/articles/69000834165-engine-dj-v3-0-support-for-third-party-database-tools ; https://github.com/mixxxdj/mixxx/wiki/Engine-Library-Format

### 3.6 Mixxx

Library `mixxxdb.sqlite`; imports **M3U/M3U8/PLS/CSV** playlists (*Library → Import Playlist*) and reads Serato crates/Rekordbox devices natively. Export M3U8 for Mixxx.

### 3.7 Generic: M3U8 / XSPF / CSV

```m3u8
#EXTM3U
#EXTINF:173,Carlos Di Sarli - Bahía Blanca
/Users/dj/Music/Tango/Di Sarli/Bahia Blanca.mp3
#EXTINF:35,Cortina - Blue Monk
/Users/dj/Music/Cortinas/Blue Monk 35s.mp3
```
(`.m3u8` = UTF-8; `#EXTINF:<seconds>,<display>`; relative paths resolve from the m3u's folder.)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<playlist version="1" xmlns="http://xspf.org/ns/0/">
  <title>Milonga 2026-10-24</title>
  <trackList>
    <track><location>file:///Users/dj/Music/Tango/Di%20Sarli/Bahia%20Blanca.mp3</location>
      <creator>Carlos Di Sarli</creator><title>Bahía Blanca</title><duration>173000</duration></track>
  </trackList>
</playlist>
```
CSV: `tanda,position,artist,title,year,orchestra,singer,bpm,duration_s,path,spotify_uri` — UTF-8 with BOM for Excel.

---

## 4. AWS one-click deploy for Next.js (2026)

### 4.1 Current versions

| Package | Latest | Date |
|---|---|---|
| `next` | **16.4.2** | 2026-10-15 (16.4 blog 2026-10-06; canary 16.5) |
| `react` / `react-dom` | **19.3.1** | 2026-10-14 |
| `sst` | **4.17.2** | 2026-10-08 (v4 = Pulumi AWS provider v6→v7; "no code changes if you only use SST components"; migrate with `sst refresh`) |
| `@opennextjs/aws` | **4.1.11** | 2026-10-15; peer `next >=15.5.28 <16 \|\| >=16.4.1` |
| `aws-cdk-lib` | 2.273.0 | 2026-10-08 |
| `cdk-nextjs` | 0.7.16 | 2026-10-16 (jetbridge; wraps OpenNext) |
| `aws-actions/configure-aws-credentials` | **v6** (v6.3.0) | — |
| AWS Lambda Web Adapter | 1.1.0 | image `public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0` |

Sources: https://nextjs.org/blog/next-16-4 ; https://sst.dev/docs/migrate-from-v3/ ; https://sst.dev/docs/component/aws/nextjs/ ; https://github.com/aws-actions/configure-aws-credentials ; https://github.com/awslabs/aws-lambda-web-adapter

### 4.2 Options compared

| Option | Fit for "Deploy button in README" | Notes |
|---|---|---|
| **SST v4 `sst.aws.Nextjs`** (OpenNext → Lambda + CloudFront + S3) | **Best.** One `sst.config.ts`, `npx sst deploy`, cheap at low traffic, full Next 16 support (SST auto-picks OpenNext; pin `openNextVersion: "4.1.11"` for Next 16.4) | Next 16.2 shipped a stable **Adapter API**; OpenNext's first-party AWS adapter "expected by end of 2026" — not released as of today; `@opennextjs/aws` 4.x is what SST uses. Repo already has `deploy: sst deploy --stage production`. |
| AWS Amplify Hosting | Easiest UI, but docs still say **Next.js 12–15 only**; `@aws-amplify/adapter-nextjs` peer `<16` (issues #14600/#14614 open) | Not usable for Next 16 today. |
| CDK + `cdk-nextjs` (0.7.x) | Fine if the team already runs CDK; same OpenNext underneath | More boilerplate than SST; fewer docs. |
| App Runner (container, `output: "standalone"`) | Simple, always-on ≈ $5+/mo minimum; no CloudFront caching for ISR | Good for a demo with websockets; worse cold economics than Lambda for a hobby DJ tool. |
| Lambda Web Adapter (Docker, `AWS_LWA_INVOKE_MODE=response_stream`) | Works for Next 16 standalone; you build your own CloudFront/S3 for static | DIY; only pick if you refuse OpenNext. |

**Recommendation:** SST v4 + `sst.aws.Nextjs`, deployed by a GitHub Actions workflow using OIDC. The README "Deploy" button = link to the `workflow_dispatch` run page (`https://github.com/<org>/TDJ/actions/workflows/deploy.yml`) plus a `Fork → set 2 variables → Run workflow` recipe. (AWS has no CloudFormation-style "Launch Stack" for OpenNext; a Launch-Stack button would only bootstrap the OIDC role — see 4.5.)

### 4.3 `sst.config.ts` (SST 4.x)

```ts
/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "tdj",
      home: "aws",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      providers: { aws: { region: "eu-west-1" } },
      version: ">= 4.17.0",
    };
  },
  async run() {
    // SST has no first-class KMS component; use the Pulumi AWS provider global `aws`
    const key = new aws.kms.Key("TdjByokKey", { description: "TDJ BYOK envelope key", enableKeyRotation: true });
    const media = new sst.aws.Bucket("TdjMedia");
    const table = new sst.aws.Dynamo("TdjSettings", { fields: { pk: "string" }, primaryIndex: { hashKey: "pk" } });
    const web = new sst.aws.Nextjs("TdjWeb", {
      path: "apps/web",
      link: [media, table],
      openNextVersion: "4.1.11",
      environment: { KMS_KEY_ARN: key.arn, NEXT_PUBLIC_APP_URL: $interpolate`https://${$app.stage}.tdj.example` },
      server: { memory: "1536 MB", timeout: "30 seconds", architecture: "arm64" },
      permissions: [{ actions: ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"], resources: [key.arn] }],
      // domain: { name: "tdj.example", dns: sst.aws.dns() }   // Route 53; omit for the default CloudFront URL
    });
    return { url: web.url };
  },
});
```
Monorepo gotcha: run `sst` from the repo root with `path: "apps/web"`; OpenNext needs `next.config.ts` `output` **unset** (not `standalone`) and pnpm hoisting works out of the box. CloudFront caps origin response at 60 s unless raised by Support.

### 4.4 GitHub Actions deploy with OIDC

```yaml
# .github/workflows/deploy.yml
name: Deploy (SST)
on:
  push: { branches: [main] }
  workflow_dispatch:
    inputs: { stage: { description: "SST stage", default: "production" } }
permissions: { id-token: write, contents: read }
concurrency: { group: deploy-${{ inputs.stage || 'production' }}, cancel-in-progress: false }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4           # reads packageManager from package.json
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}     # arn:aws:iam::123456789012:role/tdj-github-deploy
          aws-region: ${{ vars.AWS_REGION }}
          role-session-name: tdj-gha-${{ github.run_id }}
      - run: pnpm dlx sst@4 install
      - run: pnpm dlx sst@4 deploy --stage ${{ inputs.stage || 'production' }}
        env: { NODE_OPTIONS: --max-old-space-size=4096 }
```
Gotchas: `id-token: write` is mandatory; the session lasts ≤ 1 h by default (`role-duration-seconds` up to the role's `MaxSessionDuration`, max 12 h); SST state lives in an S3 bucket in your account created on first deploy (`home: "aws"`), so the role needs S3/SSM/CloudFormation-free but broad permissions (Lambda, CloudFront, S3, IAM PassRole, DynamoDB, KMS). Use `PowerUserAccess` + a scoped IAM-write policy for a hobby project; tighten later.

### 4.5 IAM: OIDC provider + trust policy

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com   # thumbprint no longer required; AWS validates GitHub's cert chain
```
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": [
        "repo:getvivax/TDJ:ref:refs/heads/main",
        "repo:getvivax/TDJ:environment:production"
      ] }
    }
  }]
}
```
**2026 gotcha:** repositories created **after 2026-07-15** (or opted in) emit an *immutable* `sub` of the form `repo:getvivax@<ORG_ID>/TDJ@<REPO_ID>:ref:refs/heads/main`; a name-only trust policy then fails `AssumeRoleWithWebIdentity`. Check with a throwaway job that prints `${{ steps.token.outputs… }}` / decode the JWT, and match the form your repo actually produces (or use `StringLike` `repo:getvivax*/TDJ*:ref:refs/heads/main`). Sources: https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services ; https://github.com/aws-actions/configure-aws-credentials

One-click bootstrap: ship `infra/github-oidc-role.yaml` (CloudFormation: OIDC provider + role) and put a real **Launch Stack** button in the README (`https://console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/new?templateURL=https://raw.githubusercontent.com/…/github-oidc-role.yaml&stackName=tdj-github-oidc`). The stack outputs the role ARN; the user pastes it into the repo variable `AWS_DEPLOY_ROLE_ARN` and presses *Run workflow*. That is the honest "one click (plus one paste)" for AWS.

### 4.6 Keeping an **agent session** connected to AWS without keys expiring

| Mechanism | Lifetime | Pros | Cons | Verdict |
|---|---|---|---|---|
| IAM Identity Center (SSO) `aws sso login` | permission-set session 1–12 h (max 12 h); portal/refresh session up to 90 days | human-grade, no secrets on disk, auto-refresh while the SSO session is valid | needs a browser once; unattended containers can't re-login | best for a **human-driven** agent on a laptop |
| GitHub/other OIDC federation → `AssumeRoleWithWebIdentity` | ≤ role `MaxSessionDuration` (≤12 h); token re-minted per job | no long-lived secret anywhere; perfect for CI | only inside a runtime that issues OIDC tokens (GHA, GitLab, K8s SA, Claude Code Remote does not) | use for **CI/CD** |
| **IAM Roles Anywhere** (X.509 from your own CA / AWS Private CA) + `aws_signing_helper` | each session 15 min–12 h, **auto-refreshed forever** by `credential_process` / `serve` / `update` (refreshes 5 min before expiry); cert validity is what you set (e.g. 1 year) | works from any container; revoke by revoking the cert; audit via `aws:SourceArn` trust anchor | cert+key is still a bearer secret on disk; setup (CA, trust anchor, profile) ≈ 30 min; AWS Private CA ≈ $400/mo (use a self-signed CA instead — free) | **best for a long-running agent container** |
| IAM user + long-lived access key with a tight policy | never expires | zero setup | AWS's own guidance: eliminate; keys leak into logs/history; no automatic expiry | acceptable only as a **last resort** with `aws:SourceIp`/`aws:RequestedRegion` conditions, 90-day rotation and a permissions boundary |
| STS `AssumeRole` from an EC2/ECS task role | auto | if the agent *is* on AWS, this is free | agent must run inside AWS | use when you host the agent on AWS |

Recommendation for an agent box (e.g. Claude Code Remote container): **IAM Roles Anywhere** with a self-signed CA kept offline, a 1-year end-entity cert for the agent, trust anchor + profile with a session policy that limits to the TDJ stack, and this config:

```ini
# ~/.aws/config
[profile tdj-agent]
credential_process = /usr/local/bin/aws_signing_helper credential-process \
  --certificate /secrets/agent.crt --private-key /secrets/agent.key \
  --trust-anchor-arn arn:aws:rolesanywhere:eu-west-1:123456789012:trust-anchor/… \
  --profile-arn arn:aws:rolesanywhere:eu-west-1:123456789012:profile/… \
  --role-arn arn:aws:iam::123456789012:role/tdj-agent --session-duration 3600
region = eu-west-1
```
The SDK/CLI re-invokes the helper transparently; `aws_signing_helper serve --port 9911` + `AWS_EC2_METADATA_SERVICE_ENDPOINT=http://127.0.0.1:9911` gives IMDS-style auto-refresh to any SDK. Credential helper 1.8.5 (2026-08-24). Sources: https://docs.aws.amazon.com/rolesanywhere/latest/userguide/credential-helper.html ; https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html ; https://docs.aws.amazon.com/singlesignon/latest/userguide/howtosessionduration.html

If the box can't hold a cert either, fall back to: dedicated IAM user → permissions boundary → `sts:AssumeRole` into the deploy role (so the key alone is near-useless) → rotate every 90 days.

---

## 5. Frontend stack & "liquid glass"

### 5.1 Versions (npm, 2026-10-18)

- **Next.js 16.4.2** (16.0 shipped 2025-10-21; Turbopack is stable + default for `dev` and `build`; 16.4: Cache Components recommended for all apps and on by default in `create-next-app`, `ensureStatic`, `navigation()`/`prefetch()`, `next upgrade --agent`, lazy server HMR, React 19.3; Next 17 will make Cache Components default). Breaking from 15: `middleware.ts` → `proxy.ts` (16.2), async `params`/`searchParams`, `next lint` removed.
- **React 19.3.1** (19.3 2026-09-09: stable `<ViewTransition>` + `addTransitionType`, Fragment refs, `browser()` for client-only components, Trusted Types; no breaking changes).
- **Tailwind CSS 4.3.3** (2026-07-16). v4 = CSS-first config (`@import "tailwindcss"; @theme { --color-… }`), no `tailwind.config.js` needed, `@tailwindcss/postcss` plugin. Native `backdrop-blur-*`, `backdrop-saturate-*`, `@supports` variants (`supports-[backdrop-filter]:`).
- **shadcn CLI 4.22.1** (2026-10-18). Oct 2026: new Trace, Code Block, "AI Elements" (21 agentic-UI patterns, replacing AI SDK Elements); components ship for **Base UI, React Aria and Radix** across 8 styles; Sept 2026: `cn` is a standalone package (`npx shadcn migrate cn`); Aug 2026: private GitHub registries. Tailwind v4 + React 19 support since Feb 2025. `npx shadcn@latest init` then `npx shadcn@latest add button dialog slider`.
- **TypeScript 7.0.2** (2026-07-08; native Go compiler = `tsc`; ~10× faster; **no stable programmatic API until 7.1** → typescript-eslint/ts-morph pin TS 6; repo is on `^5.9` — moving to 7 is safe for `tsc --noEmit` + Next 16.4 (Turbopack uses SWC, not tsc) but check `vitest` typecheck and any `ts-morph` scripts).
Sources: https://nextjs.org/blog/next-16-4 ; https://react.dev/blog/2026/09/09/react-19-3 ; https://ui.shadcn.com/docs/changelog

### 5.2 Liquid Glass (Apple WWDC25 → web)

Apple's guidance ("Meet Liquid Glass", WWDC25 session 219; HIG *Materials*): glass is a **lensing** material — it bends light at the rim, stays clear in the centre, adapts tint/shadow to content beneath; use **Regular** by default; **Clear** only over media with a dimming layer; reserve glass for the **navigation/control layer floating above content**, never glass-on-glass, tint only primary actions, respect Reduce Transparency / Increase Contrast / Reduce Motion. https://developer.apple.com/videos/play/wwdc2025/219/ ; https://developer.apple.com/documentation/technologyoverviews/liquid-glass

Web implementation = 3 layers:

```css
/* 1. frosted base — works everywhere */
.glass {
  background: color-mix(in oklab, var(--surface) 55%, transparent);
  border: 1px solid color-mix(in oklab, white 35%, transparent);
  border-radius: 24px;
  box-shadow: 0 10px 30px rgb(0 0 0 / .18), inset 0 1px 0 rgb(255 255 255 / .45);
}
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .glass { -webkit-backdrop-filter: blur(18px) saturate(180%); backdrop-filter: blur(18px) saturate(180%); }
}
/* 2. refraction rim — Blink only (SVG filter inside backdrop-filter) */
.glass.refract { backdrop-filter: blur(6px) saturate(170%) brightness(1.06) url(#tdj-lens); }
/* 3. specular highlight */
.glass::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  background: linear-gradient(120deg, rgb(255 255 255 / .35), transparent 40%, transparent 60%, rgb(255 255 255 / .12)); }
@media (prefers-reduced-transparency: reduce) { .glass { backdrop-filter: none; background: var(--surface); } }
```
```html
<svg width="0" height="0" style="position:absolute">
  <filter id="tdj-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage href="/lens-map.png" result="map" preserveAspectRatio="none"/>   <!-- radial displacement map: neutral 128,128 centre, ramp at the rim -->
    <feDisplacementMap in="SourceGraphic" in2="map" scale="38" xChannelSelector="R" yChannelSelector="G"/>
    <feSpecularLighting surfaceScale="2" specularConstant=".6" specularExponent="18" lighting-color="#fff" in="SourceGraphic" result="spec">
      <fePointLight x="-40" y="-60" z="120"/>
    </feSpecularLighting>
    <feComposite in="spec" in2="SourceGraphic" operator="in" result="specIn"/>
    <feBlend in="SourceGraphic" in2="specIn" mode="screen"/>
  </filter>
</svg>
```
Gotchas: `backdrop-filter: url(#…)` renders only in **Chromium**; Safari/Firefox ignore the `url()` and may drop the *whole* value — so set the plain blur first and add the `url()` version in a separate rule guarded by JS UA/feature sniff (`@supports` returns true for `url()` in Firefox but it does not render). `feImage` href must be same-origin. Generate the displacement map at runtime on a `<canvas>` for each element size (that is what the libraries do). Apple glass also refracts *outside* its bounds — impossible with `backdrop-filter`; accept it.

Libraries (npm, 2026-10-18): `@vepando/liquid-glass-react` **1.0.1** (2026-10-12; Snell's-law lens map, single `feDisplacementMap`, dispersion per channel, SSR-safe frosted fallback on WebKit/Gecko; `import "@vepando/liquid-glass-react/style.css"; <LiquidGlass radius={999} interactive>…</LiquidGlass>`), `liquid-glass-react` **1.1.1** (rdev, 2025-06-11, unmaintained), `liquid-glass-web-react` (PallavAg; applies the filter to the element's own content instead of the backdrop → works in all three engines but can't refract the page). Sources: https://github.com/LeonardSEO/liquid-glass-react ; https://github.com/PallavAg/liquid-glass-web-react ; https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/

Recommendation: hand-rolled CSS (layers 1+3) as the design-system primitive in Tailwind (`@utility glass { … }`), optional `@vepando/liquid-glass-react` only for the hero/player widget, and always a `prefers-reduced-transparency` fallback.

---

## 6. Lottie in 2026

| Package | Version | Notes |
|---|---|---|
| `@lottiefiles/dotlottie-react` | **0.20.0** (2026-10-06) | Official; renders `.lottie` and `.json` via WASM (`@lottiefiles/dotlottie-web` 0.81.0); theming, state machines, multi-animation bundles; use this |
| `lottie-react` | 3.1.2 (2026-09-07) | thin wrapper around lottie-web |
| `lottie-web` | 5.13.0 (2025-05-21) | Airbnb's original renderer (JSON only, ~250 kB); maintenance mode |

```tsx
'use client';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
export function Vinyl() {
  return <DotLottieReact src="/anim/vinyl.lottie" loop autoplay style={{ width: 160, height: 160 }}
           dotLottieRefCallback={(d) => d?.setSpeed(0.8)} />;
}
```
Gotchas: client component only (WASM); Next 16 serves `.lottie` from `/public` fine; `.lottie` is a zip — 50–80 % smaller than JSON; the WASM is fetched from jsDelivr by default — self-host via `DotLottie.setWasmUrl('/dotlottie-player.wasm')` for CSP/offline. https://www.npmjs.com/package/@lottiefiles/dotlottie-react ; https://github.com/LottieFiles/dotlottie-web/releases

**README (GitHub strips `<script>`/iframes):** export to **GIF** or **animated WebP** (smaller, 24-bit + alpha, GitHub renders it) or **animated SVG (SMIL)** (LottieFiles' VS Code/Figma tools export SMIL; GitHub renders SMIL in `<img>` on github.com but **not** in README previews on npm/VS Code). Pipeline from `.lottie`: render frames headless with Playwright (`page.screenshot` per frame) or `puppeteer-lottie`, then `ffmpeg -framerate 30 -i f%04d.png -vf "scale=480:-1" -loop 0 vinyl.webp` / `… -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" vinyl.gif`. Keep README media under ~2 MB.

**Free music/vinyl animations with licence:** LottieFiles "free" assets are under the **Lottie Simple License** (commercial use + modification OK, no attribution required, **may not be redistributed as standalone files**) — search https://lottiefiles.com/free-animations/vinyl , `/record-player`, `/music`. Check each asset page (some are "Pro"). Also: Icons8 Animated icons (link-back licence), Google's Material animated icons (Apache-2.0), undraw-style SVGs. https://help.lottiefiles.com/hc/en-us/articles/900002438343-Can-I-use-a-free-animation-on-Lottiefiles-for-commercial-business-use

---

## 7. Remotion

- **`remotion` 4.0.536** (2026-10-16); `@remotion/lambda` same version. Remotion 5 (`4.1.0-alpha12` tag `alpha`) not released; licence "will slightly change" in 5.0 (PR remotion-dev/remotion#3750).
- Scaffold: `npx create-video@latest` (Tailwind now opt-in `--tailwind`; deps installed during setup). Dev: `npx remotion studio`. Render: `npx remotion render src/index.ts TdjPromo out/tdj.mp4 --codec=h264 --props=props.json --concurrency=4` (also `--codec=vp9|av1|prores|gif`).
- Lambda: `npx remotion add @remotion/lambda` → `npx remotion lambda policies role|user|validate` → `npx remotion lambda functions deploy` → `npx remotion lambda sites create src/index.ts --site-name=tdj` → `npx remotion lambda render <serve-url> TdjPromo`. Needs `REMOTION_AWS_ACCESS_KEY_ID/SECRET` (or role creds). Limits: ~15-min Lambda timeout → ≤ ~80 min 1080p; 10 GB ephemeral; 1000 concurrent default; cost "a few cents per minute of video".
- **Licence (LICENSE.md, © 2026):** Free License for individuals, **for-profit orgs with ≤ 3 employees**, non-profits, evaluators. Everyone else needs a **Company License**: *Automators* $0.01/render, $100/mo minimum; *Creators* $25/seat/mo; Enterprise from $500/mo; cloud rendering on Lambda for licensed companies via "Cloud Rendering Units". TDJ by a 1-person shop = free, including commercial videos.
Sources: https://github.com/remotion-dev/remotion/releases ; https://cdn.jsdelivr.net/npm/remotion@4.0.536/LICENSE.md ; https://www.remotion.pro/license ; https://www.remotion.dev/docs/lambda/setup ; https://www.remotion.dev/docs/cli/render

---

## 8. "Recordly" and headless screenshots/videos

**Recordly** = `webadderallorg/Recordly` (GitHub, launched March 2026, **AGPL-3.0**, Electron+TS): free open-source Screen-Studio-style desktop recorder (auto-zoom, cursor animation, webcam, backgrounds, captions) for macOS 14+/Windows 10 19041+/Linux; exports MP4 and GIF. **No CLI, no public API, no headless mode** — only internal Electron IPC channels (`recording:start`, `export:start`…) that a community "skill" documents; not a stable interface. Linux can't hide the cursor. Use it by hand for the polished marketing video; not for CI. https://github.com/webadderallorg/Recordly

Automation from a headless container (ffmpeg is present at `/usr/bin/ffmpeg` here):

- **Playwright 1.64.1** (2026-10-14):
  ```ts
  // apps/web/e2e/media.spec.ts
  import { test } from '@playwright/test';
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', video: { mode: 'on', size: { width: 1440, height: 900 } } });
  test('tour', async ({ page }) => {
    await page.goto('/'); await page.screenshot({ path: 'media/home.png', fullPage: true });
    await page.getByRole('button', { name: 'Compose tanda' }).click();
    await page.locator('.glass.player').screenshot({ path: 'media/player.png', omitBackground: true });
  });
  ```
  Videos are **WebM** written on context close (`test-results/**/video.webm`; `page.video().path()`); 1.64 adds `video.show` overlays for action labels/step names. One-off CLI: `npx playwright screenshot --viewport-size=1440,900 --full-page --color-scheme=dark http://localhost:3000 home.png` (also `--device`, `--wait-for-timeout`, `--wait-for-selector`; from the `playwright` package CLI).
- Convert: `ffmpeg -i video.webm -movflags +faststart -pix_fmt yuv420p -vf "scale=1280:-2" tour.mp4`; GIF: `ffmpeg -i video.webm -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer" tour.gif`; WebP: `ffmpeg -i video.webm -vf "fps=15,scale=960:-1" -loop 0 -q:v 70 tour.webp`.
- Alternatives: Remotion (§7) for narrated product videos from code; `playwright` + `page.clock` for deterministic timing. https://playwright.dev/docs/videos ; https://playwright.dev/docs/screenshots

---

## 9. Claude API for "AI tanda explainer / cortina suggester" + BYOK

### 9.1 Current models & SDK (from the bundled `claude-api` skill, cached 2026-10-06; SDK from npm)

- `@anthropic-ai/sdk` **0.135.0** (2026-10-15). `anthropic-version: 2023-06-01` is still the only API version header (SDK sets it).
- Default model for app features: **`claude-opus-5-5`** ($4 / $20 per MTok, 1M ctx, 128K out, thinking always on, effort default `medium`). Cheaper tiers: `claude-sonnet-5-5` ($2/$10), `claude-haiku-5-5` ($0.10/$0.50). Top: `claude-fable-5-1` ($10/$50). Never append date suffixes.
- API drift to respect: `thinking: {type: "adaptive"}` (no `budget_tokens`), `output_config.effort`, `output_config.format` for structured output (not `output_format`), **no assistant prefill**, **no forced `tool_choice: any/tool` on Opus 5.5/Sonnet 5.5/Fable 5.1**, `fallbacks: "default"` + beta `server-side-fallback-2026-07-01` for refusal routing, check `stop_reason === "refusal"`.

```ts
// packages/core/src/ai/explain.ts
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
export const Explanation = z.object({ summary: z.string(), energyArc: z.array(z.number()), cortinaIdeas: z.array(z.object({ title: z.string(), artist: z.string(), why: z.string() })) });
export async function explainTanda(apiKey: string, model: string, tanda: Tanda) {
  const client = new Anthropic({ apiKey, timeout: 60_000 });
  const stream = client.messages.stream({
    model,                                    // user-chosen, default "claude-opus-5-5"
    max_tokens: 4000,
    system: [{ type: 'text', text: TDJ_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: zodToJsonSchema(Explanation) } },
    messages: [{ role: 'user', content: JSON.stringify(tanda) }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('refused');
  return Explanation.parse(JSON.parse(msg.content.find(b => b.type === 'text')!.text));
}
```
(Use `client.messages.parse()` with the SDK's zod helper if you prefer; see skill `typescript/claude-api/tool-use.md`.) Run it in a Next.js **Route Handler / Server Action** on Node runtime, stream to the client with `toReadableStream()`.

### 9.2 BYOK (each user brings their own key + model) — secure design

Principles: the key never reaches the browser after submission, is encrypted at rest with **envelope encryption**, is decrypted only in memory for the duration of one request, and is never logged (mask in all error paths; add a redaction hook to your logger).

- **Storage**: DynamoDB `TdjSettings` item `{ pk: user#<id>, provider: "anthropic", ciphertext, iv, tag, dekWrapped, keyId, createdAt, last4 }`.
- **KMS envelope** (`@aws-sdk/client-kms` 3.1152.0): `GenerateDataKey` (AES-256) → encrypt the API key locally with the plaintext DEK using **AES-256-GCM** → store `CiphertextBlob` (wrapped DEK) + ciphertext; to use: `Decrypt(CiphertextBlob)` → unwrap → decrypt → call Anthropic → zero the buffers. Use `EncryptionContext: { userId }` so a DEK can't be reused for another user. KMS key policy: only the Next.js server role may `Decrypt`; enable rotation.
- **Alternative without KMS** (edge/other clouds): a master key in SST `Secret` + WebCrypto `AES-GCM` with HKDF-derived per-user subkeys; weaker (master key in Lambda env) but still no plaintext at rest.
- **Validation at save time**: call `client.models.retrieve(model)` with the user's key (cheap, no tokens) → confirms key + model; store `last4` for display. Model list for the picker: `client.models.list()` (fields `id`, `display_name`, `max_input_tokens`, `capabilities`).
- **Never**: put the key in cookies/localStorage, echo it in responses, include it in `console.error` of SDK errors (Anthropic errors don't include the key, but request-dumping middleware might), or send it to third-party telemetry. Treat `x-api-key` as PII in CloudWatch (set a logger redaction for `/sk-ant-[A-Za-z0-9_-]+/`).
- **UX**: "Use my own key" panel with provider, key (password input), model dropdown, *Test* button; show quota errors (`RateLimitError` 429) verbatim to the owner since it's their account.

```ts
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const kms = new KMSClient({});
export async function sealKey(userId: string, apiKey: string) {
  const dk = await kms.send(new GenerateDataKeyCommand({ KeyId: process.env.KMS_KEY_ARN, KeySpec: 'AES_256', EncryptionContext: { userId } }));
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', dk.Plaintext!, iv);
  const ct = Buffer.concat([c.update(apiKey, 'utf8'), c.final()]);
  dk.Plaintext!.fill(0);
  return { ct: ct.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), dek: Buffer.from(dk.CiphertextBlob!).toString('base64'), last4: apiKey.slice(-4) };
}
export async function openKey(userId: string, r: Awaited<ReturnType<typeof sealKey>>) {
  const dk = await kms.send(new DecryptCommand({ CiphertextBlob: Buffer.from(r.dek, 'base64'), EncryptionContext: { userId } }));
  const d = createDecipheriv('aes-256-gcm', dk.Plaintext!, Buffer.from(r.iv, 'base64')); d.setAuthTag(Buffer.from(r.tag, 'base64'));
  const key = Buffer.concat([d.update(Buffer.from(r.ct, 'base64')), d.final()]).toString('utf8');
  dk.Plaintext!.fill(0); return key;
}
```
Sources: skill `claude-api` (models table cached 2026-10-06), https://platform.claude.com/docs/en/api/versioning , https://www.npmjs.com/package/@anthropic-ai/sdk

---

## 10. Testing & tooling stack

| Tool | Latest (npm 2026-10-18) | Notes / gotchas |
|---|---|---|
| **Vitest** | **5.0.5** (5.0 released 2026-09-03; `V4` tag 4.1.12) | Requires **Node ≥ 22.12, Vite ≥ 6.4**. Breaking: `clearMocks: true` by default; unawaited `resolves/rejects/toMatchFileSnapshot` **fail**; `expect.poll` times out; `test.sequential` removed → `{ concurrent: false }`; config no longer looked up in ancestor dirs (monorepo: pass `--config` or `--root`); output in `.vitest/`; `bench` is a fixture; subpath exports `vitest/reporters` etc. removed. New: `vi.when`, `vitest doctor`, nested projects inherit root config, Browser Mode trace view (`browser.traceView`), `--repeats`. Browser mode provider package: `@vitest/browser-playwright`. https://vitest.dev/blog/vitest-5 |
| **Playwright** | **1.64.1** (2026-10-14) | `@playwright/test`; video overlays (`video.show`), `page.clock`; browsers via `npx playwright install --with-deps chromium`. |
| **pnpm** | **12.14.0** (2026-10-15) — Rust rewrite, same lockfile v9 & CLI as 11; `latest` tag already 12 | Repo pins `pnpm@10.18.0` via `packageManager` — bump to `pnpm@12.14.0` (breaking: git deps resolve via HTTPS, `--resolution-only` removed → `pnpm peers check`, unknown `pnpm-workspace.yaml` keys reported). https://github.com/pnpm/pnpm/releases/tag/v12.0.0 |
| **Turborepo** | **2.11.9** (2026-10-16) | 2.11: native Rust/Go/Python tasks, 4× faster startup, `devEngines.packageManager`, `turbo prune` production-only. Repo has `^2.5` → `^2.11`. https://turborepo.dev/blog/2-11 |
| **Biome** | **2.5.15** (2026-09-30) | Repo has `^2.2` → `^2.5`. Biome 2.x: type-aware rules without tsc, plugin (GritQL) support, `biome migrate eslint`. |
| **ESLint** | 10.13.0 (2026-10-16; v10 Feb 2026 removed `.eslintrc` entirely) | Next 16 removed `next lint`; `eslint-config-next` still exists for flat config. |
| **TypeScript** | 7.0.2 (see §5.1) | |

**Biome vs ESLint for TDJ:** stay on **Biome** (already in repo): one binary for lint+format, ~100× faster (benchmark 2026-10 on a 403-file Next app: ESLint 10.13 9.6 s vs Biome 2.5.15 131 ms), good TS/React/Next rules (`a11y`, `nursery/useExhaustiveDependencies`, `noUnusedImports`). Only reach for ESLint if you need `eslint-plugin-react-hooks` v7 compiler rules or typescript-eslint type-aware rules Biome lacks — and note typescript-eslint doesn't support TS 7 until TS 7.1.

**TDD conventions for the monorepo:**
- `packages/core`: pure domain (tanda rules, energy arcs, exporters) — Vitest unit tests next to source (`*.test.ts`), 100 % of exporters snapshot-tested (`toMatchFileSnapshot('__snapshots__/rekordbox.xml')` — remember `await`!).
- `apps/web`: Vitest + `@vitest/browser-playwright` for component tests; Playwright e2e in `apps/web/e2e` with `webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI }`.
- `turbo.json`: `"test": { "dependsOn": ["^build"], "outputs": [".vitest/**", "coverage/**"] }`, `"e2e": { "dependsOn": ["build"], "outputs": ["test-results/**", "playwright-report/**"] }`.
- Red-green-refactor per feature branch; conventional commits; CI job matrix `lint → typecheck → test → e2e` with `turbo run --affected`.

```ts
// vitest.workspace replaced by root vitest.config.ts (v5 nested projects)
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: ['packages/*', { extends: true, test: { name: 'web-browser', include: ['apps/web/src/**/*.browser.test.tsx'],
      browser: { enabled: true, provider: 'playwright', instances: [{ browser: 'chromium' }] } } }],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
});
```

---

## Quick decision summary for TDJ

1. Spotify: PKCE in browser, BYO Client ID per DJ (dev mode: Premium + 5 users), `POST /me/playlists` + `/playlists/{id}/items`, search `limit≤10`, store `authorizedAt` for the 6-month refresh-token expiry; **no** audio-features — BPM/energy from your curated index + in-browser `web-audio-beat-detector`; Deezer only for 30-s previews/duration.
2. Exports: Rekordbox XML, Traktor NML, Serato `.crate` (TLV writer above), M3U8 (Mixxx/Engine/VDJ), XSPF/CSV.
3. Deploy: SST 4.17 `sst.aws.Nextjs` (OpenNext 4.1.11, Next 16.4.2) via GitHub Actions OIDC (`configure-aws-credentials@v6`); README "Launch Stack" button creates the OIDC role; long-running agent → IAM Roles Anywhere.
4. UI: Next 16.4 / React 19.3 / Tailwind 4.3 / shadcn 4.22; glass = CSS layers + optional `@vepando/liquid-glass-react`; Lottie via `@lottiefiles/dotlottie-react` 0.20, README media as WebP/GIF via Playwright+ffmpeg.
5. Video: Remotion 4.0.536 (free ≤ 3 employees); screen demo by hand with Recordly (no CLI).
6. AI: `@anthropic-ai/sdk` 0.135, default `claude-opus-5-5`, structured output, BYOK sealed with KMS envelope + AES-GCM.
7. Tooling: pnpm 12.14, Turbo 2.11, Biome 2.5, Vitest 5.0, Playwright 1.64, TS 7 (watch typescript-eslint).
