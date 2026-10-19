# TDJ — Managed connectors for playlist export (research, 2026-10-19)

Scope: how TDJ (Next.js 16 on Lambda via SST/OpenNext, no accounts today, BYOK settings in the browser) should let a DJ push a composed set to **Spotify, Apple Music, YouTube Music, TIDAL, Deezer, SoundCloud, Amazon Music**, push export files (Rekordbox XML, Traktor NML, M3U8, XSPF, CSV, Serato) to **Dropbox / Google Drive**, and whether **Beatport / Beatsource** are reachable at all. Compares Pipedream Connect, Nango, Composio, Paragon, Merge-style unified APIs and doing it ourselves.

"Verified" = read from the primary source today; "secondary" = news/forum/third-party; "unverified" = could not confirm, treat as a risk. Spotify specifics are covered in depth in `docs/research/engineering-2026.md` §1 and only summarised here.

---

## 0. TL;DR

1. **No vendor covers the catalogue we need.** Pipedream, Nango and Composio all support Spotify, YouTube Data, Dropbox and Google Drive. **None** of them has Apple Music, TIDAL, Deezer or Amazon Music; SoundCloud exists only in Composio. Apple Music is not OAuth at all (MusicKit developer JWT + Music User Token), so it will never be in an OAuth broker.
2. **Spotify cannot be "managed" away.** Since Feb 2026 a Development Mode Client ID serves **5 users** and the owner must hold Premium; Extended Quota is organisations with ≥250k MAU only. A shared Spotify OAuth app (ours, Pipedream's, anyone's) stops at 5 DJs. Spotify stays **bring-your-own Client ID**, exactly as today — we only move the token exchange and storage to the server.
3. **Deezer, Amazon Music, Beatport/Beatsource must not be promised.** Deezer switched off "My apps" in June 2025 with no restoration found; Amazon Music's playlist API is a closed beta; Beatport v4 is partner-gated and has no tango catalogue anyway.
4. **Recommendation:** a small in-house *connector kernel* (server-side OAuth/PKCE, KMS-encrypted token store in DynamoDB, per-provider adapters, a global ISRC/search match cache) and **Nango Cloud pay-as-you-go as the OAuth broker for Dropbox, Google Drive, YouTube and (optionally) Spotify-BYO**, with Apple Music and TIDAL implemented directly. Nango is $0.29/connection/month, lets each connection override the OAuth client (the only way to broker Spotify BYO), and is self-hostable later (ELv2, free tier = auth + proxy, which is all we use). Pipedream Connect is the better product for *breadth* but costs **$2 per connected user per month after 100** and burns credits per proxied request; at 1,000 DJs that is ~$1.9k/month for four integrations. Code for both is in §4.
5. **Ship order:** files to Dropbox/Drive (zero catalogue matching, immediate value) → Apple Music + TIDAL (real public APIs with ISRC lookup, tango catalogue is on both) → Spotify server-side BYO → YouTube (quota-starved; best-effort) → SoundCloud (opportunistic) → Deezer/Amazon only if their programmes reopen.

---

## 1. What each provider actually allows in October 2026

| Provider | New apps allowed? | Auth | Create playlist | Add items | ISRC lookup | Hard limits | Verdict for TDJ |
|---|---|---|---|---|---|---|---|
| **Spotify** | Yes, Development Mode only (owner needs Premium; **5 authorized users per Client ID**; 25 Client IDs/account; per-account quota). Extended Quota = organisations, launched service, ≥250k MAU, up to 6 weeks review (orgs-only since 2025-05-15). Refresh tokens die 6 months after authorization. | OAuth 2 Auth Code + PKCE | `POST /v1/me/playlists` `{name, description, public}` (scopes `playlist-modify-private/public`) | `POST /v1/playlists/{id}/items` `{uris[], position?}` max **100**/request (old `/tracks` removed) | `GET /v1/search?q=isrc:XXXX&type=track&limit=10` (search `limit` max **10**, default 5); `GET /tracks/{id}` returns `external_ids.isrc` (removal was reverted) | Rolling 30 s rate window (numbers unpublished); 429 with `reason: QUOTA_EXCEEDED` for quota | **BYO Client ID per DJ** (each DJ is "the app owner" of their own dev app and its 1 user). Keep. |
| **Apple Music** | Yes: Apple Developer Program **$99/yr**, MusicKit identifier + `.p8` key. No app review for the API. | **Not OAuth.** Server-signed developer JWT (ES256, `iss`=Team ID, `kid`=Key ID, max lifetime ~6 months) + **Music User Token** obtained in the browser via MusicKit JS `authorize()` | `POST https://api.music.apple.com/v1/me/library/playlists` body `{attributes:{name,description}, relationships:{tracks:{data:[{id,type:"songs"}]}}}` headers `Authorization: Bearer <dev JWT>`, `Music-User-Token: <MUT>` | `POST /v1/me/library/playlists/{id}/tracks` `{data:[{id,type:"songs"}]}` | `GET /v1/catalog/{storefront}/songs?filter[isrc]=A,B,C` (developer token only) | Unpublished; be polite (~20 req/s is folklore, not documented) | **Do it ourselves** (nobody brokers MusicKit). Good tango catalogue (Odeon/RCA reissues). |
| **YouTube (Music)** | Yes (Google Cloud project). YouTube scopes are **sensitive** → brand + sensitive-scope verification (2–3 days + ~10 business days); unverified apps capped at 100 users (secondary). | OAuth 2 (Google) scope `https://www.googleapis.com/auth/youtube` (or `youtube.force-ssl`) | `POST /youtube/v3/playlists?part=snippet,status` **50 units** | `POST /youtube/v3/playlistItems?part=snippet` **50 units each**, one video per call | No ISRC. `search.list` is now its own bucket: **100 calls/day per project** (since 2026-06-01), 1 unit each | **10,000 units/day per project** → ~200 playlist inserts/day for *all* users combined; quota extension via Google's form/audit | Best-effort, behind a **global match cache**; expect to request quota extension. YouTube Music playlists are YouTube playlists (same API). |
| **TIDAL** | Yes: developer.tidal.com dashboard (self-serve app creation; sign-up conditions unverified today) | OAuth 2 Auth Code + PKCE at `https://login.tidal.com/authorize`, scopes `playlists.read playlists.write` (also `collection.*`, `entitlements.read`, `playback`) | `POST https://openapi.tidal.com/v2/playlists?countryCode=XX` content-type `application/vnd.api+json`, body `{data:{type:"playlists",attributes:{name,description,accessType:"PUBLIC"|"UNLISTED"}}}`, optional `Idempotency-Key` header (409/422 on replay) | `POST /v2/playlists/{id}/relationships/items` body `{data:[{id:"<trackId>",type:"tracks"}]}`; the API applies a **global cap of 20 items** per page/operation — chunk by 20 | `GET /v2/tracks?countryCode=XX&filter[isrc]=A,B` (one track per ISRC when several given) | Heavy throttling reported by users (secondary); numbers unpublished | **Do it ourselves** (or contribute a 12-line `providers.yaml` entry to Nango). Write endpoints are live in the OpenAPI spec. |
| **Deezer** | **No.** "My apps" in the developer portal was switched off in June 2025, "not known how long"; no reopening found as of today. Native SDK deprecated. | OAuth 2 (legacy) | `POST /user/me/playlists?title=` (legacy docs) | `POST /playlist/{id}/tracks?songs=a,b,c` | `GET /track/isrc:XXXX` | n/a | **Do not promise.** Build the adapter only if an app can be created. |
| **SoundCloud** | Yes, but app registration is for **Artist Pro** subscribers via the `soundcloud` API CLI (recommended) or the browser "Your Apps" page | OAuth 2.1 + PKCE, confidential client (secret required), access token ~1 h, refresh tokens single-use | `POST https://api.soundcloud.com/playlists` `{playlist:{title,sharing,tracks:[{id}]}}` | same call (tracks array) / `PUT /playlists/{id}` | None; `GET /tracks?q=` only; catalogue is user uploads, 78-rpm reissues mostly absent | Client-credentials tokens 50/12 h/app, 30/h/IP; 429 otherwise | Opportunistic, phase 5. Low match rate for tango. |
| **Amazon Music** | **No.** "These Amazon Music APIs are currently in a closed Beta." | Login with Amazon, scope `music::library` | `POST /playlists` | `PUT /playlists/{id}/tracks` | n/a | n/a | **Do not promise.** |
| **Beatport / Beatsource** | **No** public tier: v4 API is OAuth 2 auth-code, partner-gated via the Partner Portal; beets maintainers still had no official credential path in Feb 2026. No Beatsource API found. | — | — | — | — | — | **Do not promise**; electronic catalogue, irrelevant for tango. |
| **Dropbox** | Yes. Development status: up to 500 linked users; at **50 users** you have 2 weeks to get Production approval (usually days) | OAuth 2 (+PKCE ok), `token_access_type=offline` for refresh tokens, scope `files.content.write` | n/a | `POST https://content.dropboxapi.com/2/files/upload` with `Dropbox-API-Arg: {"path":"/TDJ/set.m3u8","mode":"add","autorename":true}` and `Content-Type: application/octet-stream` (≤150 MB; our files are KB) | n/a | Generous per-user limits | Trivial; first thing to ship. |
| **Google Drive** | Yes. Use `https://www.googleapis.com/auth/drive.file` (per-file, the recommended scope; avoids restricted-scope review that full `drive` triggers) | OAuth 2 (Google), `access_type=offline` | n/a | `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` (`multipart/related`: JSON metadata part then file part) | n/a | Generous | Trivial; ship with Dropbox. Same Google OAuth client as YouTube → one verification. |

Sources: Spotify quota modes https://developer.spotify.com/documentation/web-api/concepts/quota-modes ; Feb-2026 update https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security ; Feb-2026 changes https://developer.spotify.com/documentation/web-api/references/changes/february-2026 ; July-2026 quota update https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates ; create playlist https://developer.spotify.com/documentation/web-api/reference/create-playlist ; add items https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist ; search filters https://developer.spotify.com/documentation/web-api/reference/search ; TechCrunch summary https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/ · Apple: https://developer.apple.com/documentation/applemusicapi/create-a-new-library-playlist ; https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens ; https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-isrc ; program fee https://developer.apple.com/programs/ · YouTube: https://developers.google.com/youtube/v3/determine_quota_cost ; https://developers.google.com/youtube/data/revision_history (2026-06-01 granular buckets) ; scopes https://developers.google.com/identity/protocols/oauth2/scopes ; verification https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification · TIDAL: OpenAPI mirror https://apis.io/apis/tidal/tidal-playlists-api/ and https://raw.githubusercontent.com/api-evangelist/tidal/refs/heads/main/openapi/tidal-playlists-api-openapi.yml (read today: `PlaylistsCreateOperation_Payload`, `PlaylistsItemsRelationshipAddOperation_Payload_Data` with `type: tracks|videos`, `filter[isrc]` on `/tracks`, scopes list), status thread https://github.com/orgs/tidal-music/discussions/6 (20-item global cap, write ops) · Deezer: https://en.deezercommunity.com/features-feedback-44/deezer-developer-apps-80863 ; https://support.deezer.com/hc/en-gb/articles/360011538897-Deezer-FAQs-For-Developers ; https://github.com/FoxxMD/multi-scrobbler/issues/175 · SoundCloud: https://developers.soundcloud.com/docs · Amazon: https://developer.amazon.com/docs/music/API_web_playlist.html · Beatport: https://github.com/api-evangelist/beatport ; https://github.com/orgs/music-assistant/discussions/4039 · Dropbox: https://www.dropbox.com/developers/reference/developer-guide ; https://www.dropboxforum.com/discussions/101000042/do-i-need-to-request-production-status/857591 · Drive: https://developers.google.com/workspace/drive/api/guides/manage-uploads

---

## 2. Vendor comparison

### 2.1 Facts gathered (verified today unless marked)

**Pipedream Connect** — https://pipedream.com/pricing , https://pipedream.com/docs/connect/managed-auth/quickstart , https://pipedream.com/docs/connect/api-proxy , https://pipedream.com/docs/connect/api-reference/create-connect-token , https://pipedream.com/docs/connect/api-reference/rate-limits.md
- Plans (pricing page, read today; packaging changed in early Oct 2026): **Free** = development only, no production end users. **Startup $99/mo billed annually ($150 monthly)**: production, **100 external users included, then $2/user/month**; **10,000 credits/month, then $0.012/credit**; 1 credit per 30 s of compute, and **every proxied request consumes credits**. Business = custom (SSO, HIPAA, static egress IPs). An "external user" is each distinct `external_user_id` that has connected ≥1 account.
- Mechanics: server creates a short-lived (≤4 h, single-use) Connect token `client.tokens.create({ externalUserId, allowedOrigins, successRedirectUri, errorRedirectUri, webhookUri })` → browser SDK `connectAccount({ app, oauthAppId? })` opens an iframe, or hand the user the `connectLinkUrl` (Connect Link, add `?app=`). Afterwards the server calls `client.proxy.post({ externalUserId, accountId, url, headers, body })`; Pipedream injects the user's credentials. Proxy timeout 30 s; Connect-token endpoint 100/min per external user; accounts API 2,000 per 5 min per project.
- Apps: `spotify` (managed OAuth client, 20 actions incl. Create Playlist / Add Items, proxy enabled; fixed scope set unless you bring your own client), `youtube_data_api` (Create Playlist, Add Playlist Items, proxy), `dropbox` (Upload a File, proxy), `google_drive` (Upload File, proxy; **managed client asks for full `drive` scope** — bring your own client for `drive.file`). **No** `tidal`, `deezer`, `soundcloud`, `apple-music` app pages (404 today). Custom OAuth clients are per project, not per end user.
- Open question (unverified): which Spotify quota mode Pipedream's managed Spotify client is in. If it is Development Mode it caps at 5 end users for *everybody*; if Extended, scopes are fixed and still subject to Spotify's endpoint removals. Either way it does not give TDJ a shared Spotify app we can rely on.

**Nango** — https://nango.dev/pricing , https://nango.dev/docs/reference/sdks/node , https://nango.dev/docs/reference/sdks/frontend , https://nango.dev/docs/guides/platform/free-self-hosting , https://github.com/NangoHQ/nango (LICENSE read today: **Elastic License 2.0**)
- Plans: **Free $0** (10 connections, 10 compute h, 10 GB, hard caps). **Pay-as-you-go $50/mo** including $50 credits, then **$0.29 per connection/month**, $0.72/compute hour, $0.50/GB. Growth add-on $450/mo (Slack support, 5-day integration turnaround). Enterprise custom: self-hosting/BYOC in any AWS region, down to $0.01/connection at volume. The pricing page lists no proxy-request quota.
- Self-hosting: **free edition = Auth + Proxy only** (no functions/syncs/webhooks/MCP, no SSO/RBAC); docker-compose or an EC2 guide; bring Postgres + Redis; Elasticsearch/OpenSearch optional (logs); set `NANGO_SERVER_URL` and `NANGO_ENCRYPTION_KEY` (cannot be changed afterwards). ECS guide is Enterprise-only. Auth + proxy is exactly the slice TDJ needs, so self-host is a credible exit.
- Mechanics: backend `nango.createConnectSession({ tags:{end_user_id}, allowed_integrations:[...] })` → 30-min session token → frontend `new Nango({ connectSessionToken })` + `openConnectUI({ sessionToken, onEvent })`, or `nango.auth('<integration>', { credentials: { oauth_client_id_override, oauth_client_secret_override } })` for **per-connection OAuth client override** (the feature that makes Spotify BYO brokerable). Backend `nango.get/post({ providerConfigKey, connectionId, endpoint, data, headers, retries })` proxies with credential injection and auto-refresh; or `getConnection()` returns the access token (cache ≤5 min). Nango auto-refreshes tokens that expire within 15 min.
- Providers (read `packages/providers/providers.yaml` today, 30,276 lines): `spotify` (OAuth2, proxy base `https://api.spotify.com`), `spotify-oauth2-cc`, `youtube` (alias of `google`), `google-drive` (alias of `google`), `dropbox` (`token_access_type: offline`), `discogs`. **No** tidal, deezer, soundcloud, apple-music, beatport, amazon-music. You must register your own OAuth app for every provider (Nango has no managed clients).

**Composio** — https://composio.dev/pricing , https://composio.dev/toolkits/spotify , https://composio.dev/toolkits/soundcloud
- New pricing (sign-ups from 2026-08-15): **Hobby $0**: 100k tool calls/mo, unlimited connected accounts, 3 seats. **Pro $29/mo** incl. $29 credit, then $0.0003/tool call. With *Composio-managed* OAuth apps: only 20k free calls, $0.0005/call, first 1k connected accounts free then $0.10 one-time each. Toolkits: Spotify (84 tools incl. Create playlist / Add items; **you must register your own Spotify app**), SoundCloud (51 tools, own app), YouTube, Google Drive, Dropbox. It is an agent-tool platform (MCP, tool calling) rather than a plain auth broker; the proxy exists but the product centre of gravity is LLM tool-calling. No TIDAL/Apple/Deezer.

**Paragon** — https://www.useparagon.com ; pricing is "Custom" on both plans (secondary, Sept 2026), billed per **Connected User** (tenant), third-party estimates $500–3,000+/mo. B2B SaaS catalogue (CRM, ticketing, storage); no music providers. Not a fit.

**Merge / unified APIs (Merge, Unified.to, Truto)** — category-shaped (HRIS, ATS, CRM, accounting, file storage, ticketing). File storage would cover Dropbox/Drive only; none has a "music" category. Not a fit. "MusicAPI.com"-style aggregators claim TIDAL/Amazon playlist write but are unofficial wrappers (their own docs admit TIDAL cannot remove/reorder via them); they would put TDJ's users' credentials through a third party with no provider sanction. Rejected.

**Do it ourselves** — standard OAuth 2 + PKCE per provider on Lambda, tokens in DynamoDB encrypted with KMS, refresh on use. Marginal cost ≈ $0 (DynamoDB on-demand pennies, KMS $1/key/month). Fixed costs: Apple $99/yr; the TDJ owner's Spotify Premium is **not** needed because each DJ owns their own Spotify dev app; SoundCloud Artist Pro only if we pursue it; Google verification effort (one-off, ~2–3 weeks elapsed).

### 2.2 Decision matrix

Cost assumptions: a DJ connects on average 2 providers; exports 3 sets/month; a 4-hour set is ~70 tracks + ~18 cortinas ≈ 90 items; **track matching is cached globally** (one search per track per provider ever, not per user — see §3.5), so steady-state proxied calls per export ≈ 1 create + 1–5 adds + a few misses. Without the cache a Pipedream export would cost ~90 credits.

| Criterion | Pipedream Connect | Nango Cloud (PAYG) | Nango self-host (free tier) | Composio | Paragon / Merge-style | DIY kernel |
|---|---|---|---|---|---|---|
| Coverage of our 8 music targets | Spotify*, YouTube (2/8) | Spotify*, YouTube (2/8) + add TIDAL via open `providers.yaml` PR (3/8) | same as cloud | Spotify*, YouTube, SoundCloud (3/8) | 0/8 | Spotify*, Apple, YouTube, TIDAL, SoundCloud (5/8; Deezer/Amazon/Beatport closed to everyone) |
| Dropbox / Drive | yes (managed Google client = full `drive` scope; BYO client for `drive.file`) | yes (own apps) | yes | yes | yes | yes |
| Spotify BYO Client ID per DJ (mandatory) | no (custom OAuth clients are per project) | **yes** (`oauth_client_id_override` per connection) | yes | no | no | yes (today's PKCE, moved server-side) |
| Apple Music (MusicKit, non-OAuth) | no | no | no | no | no | **only option** |
| Cost @100 DJs | $99–150/mo (100 users incl.) + credits (~10k incl.) | ≈ $58/mo (200 conn × $0.29, $50 credit) | infra ≈ $40–80/mo (small ECS/EC2 + RDS Postgres + ElastiCache) | $0–29/mo | custom, ≥$500/mo (est.) | ≈ $5/mo (KMS + DynamoDB) + $99/yr Apple |
| Cost @1,000 DJs | **≈ $1,900/mo** ($99 + 900×$2) + credits | ≈ $580/mo | infra ≈ $80–150/mo | $29 + ≈ $2/mo calls | custom | ≈ $10/mo |
| Cost @10,000 DJs | ≈ $19,900/mo list (Business contract) | ≈ $5,800/mo list; Enterprise quote (down to $0.01/conn → ≈ $200–500) | infra ≈ $150–300/mo | ≈ $30–60/mo | custom | ≈ $30/mo |
| Token security | Tokens never leave Pipedream; we see only proxy responses (best) | Tokens in Nango's cloud (SOC 2); `getConnection` can return them to our server | Tokens in our Postgres, encrypted with our key | Tokens in Composio | vendor | Tokens in our DynamoDB, KMS envelope, never to the browser; Apple MUT transits the browser once by design |
| Rate limits of the broker | 30 s proxy timeout; 100 tokens/min/user; credits per request | no published proxy cap; free plan hard-caps | our infra | tool-call metering | n/a | provider limits only |
| Self-host | no | no | yes (auth + proxy, ELv2) | no (self-host is enterprise) | no | yes by definition |
| Time to first provider (Dropbox) | ~1 day | ~1 day (+ registering our Dropbox app) | ~3 days (+ infra) | ~1 day | weeks (sales) | ~2 days |
| Time to full scope (§6) | 3–4 weeks + DIY for Apple/TIDAL anyway | 3–4 weeks | 4–5 weeks | 3–4 weeks + DIY | n/a | 4–6 weeks |
| Lock-in / exit | proxy-shaped code; no token export | open source, token export, self-host path | none | moderate | high | none |

\* Spotify works only as a per-DJ Development-Mode app regardless of broker.

### 2.3 Why Nango + DIY, not Pipedream

- Pipedream's price unit (connected users) is exactly our growth axis; four integrations at $2/user/month is the cost of a whole extra Spotify Premium per DJ and we still have to write Apple + TIDAL ourselves.
- Pipedream's managed OAuth clients, its real differentiator (no Google verification, no Dropbox production review), are partly unusable for us: the Google client asks for full `drive` (restricted scope on the consent screen, worse UX) and the Spotify client cannot be ours. We would end up registering our own apps anyway, at which point Nango or DIY brokers the same apps for a fraction of the price.
- Nango's per-connection client override is the only broker feature that maps onto Spotify's 5-user rule.
- The DIY kernel is unavoidable for Apple Music and TIDAL, so the incremental cost of also doing Dropbox/Drive/YouTube ourselves is small. Nango is kept because it removes refresh-token edge cases for Google (expiring refresh tokens for unverified apps, revoked grants) and Dropbox, and gives a UI-free upgrade path to self-hosting. If the team prefers one less vendor, §4.1's adapters already talk to a `Connection` interface that works with raw tokens.

---

## 3. Architecture for TDJ

### 3.1 Identity (prerequisite)

Connectors need a stable server-side user id. TDJ has none today (settings live in `localStorage`/IndexedDB). Reuse the round-2 spec's **signed cookie** (`TDJ_SECRET`, `tdj_uid` = random 128-bit id, HttpOnly, SameSite=Lax, 1-year) and the optional DynamoDB "server storage" mode. The cookie id becomes `external_user_id` for Nango/Pipedream and the partition key of the token store. No passwords; a DJ who clears cookies simply reconnects. (Add passkeys later if people ask to keep connections across devices.)

### 3.2 Data model (DynamoDB, single table `TDJ_CONNECT_TABLE`)

```
PK = USER#<uid>      SK = CONN#<provider>          → { provider, kind: "nango"|"direct"|"apple", connectionId?, ciphertext?, kmsKeyId, scopes, displayName, authorizedAt, expiresAt, status }
PK = MATCH#<provider> SK = TRACK#<tdjTrackId>      → { providerId, isrc?, confidence, method: "isrc"|"search"|"manual", durationMs, title, artist, verifiedBy?, updatedAt }   (global, shared by all users)
PK = JOB#<uid>       SK = EXPORT#<ulid>            → { provider, status, created, playlistUrl?, unmatched: [...], error? }  (TTL 30 days)
```
Secrets: `ciphertext` = KMS envelope (`GenerateDataKey` AES-256-GCM, data key wrapped by `TDJ_KMS_KEY_ARN`). Refresh tokens are **never** returned to the browser; the browser only ever learns `{ provider, status, displayName }`.

### 3.3 Connect flow

1. Settings → "Connect Dropbox" → `POST /api/connect/session { provider }` (server reads `tdj_uid`, creates a Nango connect session restricted to that integration, returns the session token).
2. Browser opens Nango Connect UI (popup) → user authorizes at the provider → Nango stores tokens → Nango calls our **auth webhook** `POST /api/connect/webhook` (signature verified with `NANGO_WEBHOOK_SECRET`) with `connectionId` + `tags.end_user_id` → we write `CONN#dropbox { kind:"nango", connectionId }`. The browser's `onEvent('connect')` just refetches `GET /api/connect`.
3. Direct providers (Apple, TIDAL, Spotify-BYO): same route names, DIY implementation (§4.3). PKCE verifier lives in an HttpOnly cookie for 10 minutes; token exchange happens on the server; the browser receives nothing but a redirect to `/settings?connected=tidal`.
4. Disconnect: `DELETE /api/connect/{provider}` → Nango `deleteConnection` or KMS-encrypted row deletion; for Spotify also tell the user to remove the app at spotify.com/account/apps.

Pipedream variant (if chosen instead): `POST /api/connect/token` → `client.tokens.create` → browser `connectAccount({ app })` or Connect Link; after success the server looks up `client.accounts.list({ externalUserId, app })` and stores `accountId`. Code in §4.2.

### 3.4 Export flow

`POST /api/export/push { playlist, provider, includeCortinas, visibility, name? }` → creates `JOB#`, runs synchronously when it fits in the Lambda budget (Spotify/TIDAL/Apple: 1 create + ≤5 adds ≈ 3–8 s), otherwise returns `202` and the client polls `GET /api/export/jobs/{id}`. Steps inside an adapter:

1. `resolve(tracks)` — hit `MATCH#` cache; for misses run §3.5, write back with confidence.
2. `createPlaylist({ name: "<Milonga name> — <date> (TDJ)", description: "Composed with TDJ · cortinas included/excluded · <n> tandas" })`.
3. `addItems(ids)` chunked by provider limit (Spotify 100, TIDAL 20, Apple ~25 per request to be safe, YouTube 1).
4. Return `{ url, matched, unmatched: [{ tdjTrackId, title, orchestra, year, suggestion?, searchUrl }] }`. Unmatched tracks are listed in the sheet with a "Find on <provider>" link and a "Paste link to fix" field that writes a `manual` match into the global cache (`verifiedBy: uid`).

File push: `POST /api/export/push { format: "rekordbox"|"traktor"|"m3u8"|…, provider: "dropbox"|"google_drive", folder }` → `EXPORTERS[format]` → upload bytes with `Content-Type` from `EXPORT_META`; Dropbox path `/Apps/TDJ/<name>.<ext>` (app-folder permission is enough), Drive `parents: [folderId]` created once (`TDJ` folder, remembered in the CONN row).

### 3.5 Track matching for 78-rpm reissues (ISRC first, then scored search)

Golden-age tango recordings exist on streaming services as dozens of reissues (Euro Records, El Bandoneón, Reliquias, RCA Victor 100 años, Tango Argentino, BMG, Odeon, unlicensed "greatest hits"), each with **its own ISRC**; some are re-recordings or modern orchestras with the same title. Strategy:

1. **Seed ISRCs at index time.** `pnpm index:enrich` already pulls Spotify track objects; keep `external_ids.isrc` (the field was briefly removed in Feb 2026 and reverted — guard for `undefined`). Also store duration and album name. Commit to `data/` like the Spotify cache.
2. **ISRC lookup per provider** (batch): Apple `filter[isrc]` (up to ~25 per call), TIDAL `filter[isrc]` (one track per ISRC), Deezer `/track/isrc:`, Spotify `q=isrc:`. Hit → confidence 0.95.
3. **Scored search** on miss: query `"<title>" <orchestra surname>` (strip "Orquesta Típica", "y su Orquesta", diacritics, parentheses, "con <singer>"); fetch ≤10 candidates; score = 0.45·title similarity (token Jaro–Winkler on normalised strings) + 0.25·artist contains orchestra surname or a known alias (`orchestra_profiles.json` aliases, e.g. "D'Arienzo" / "Darienzo" / "Juan D'Arienzo y su Orquesta Típica") + 0.20·duration within ±4 s of the index duration (78s are 2:20–3:20; a 4:30 candidate is a modern cover) + 0.10·singer surname present. Penalties: artist contains "Sexteto", "Tributo", "Orquesta Escuela", "Live", "Remix", "(Versión 20xx)"; album name suggests re-recording. Accept ≥0.80 automatically, 0.60–0.80 as "needs a look" (exported but flagged), <0.60 unmatched.
4. **Global cache** `MATCH#<provider>` shared by all users with `method` and `confidence`; a DJ's manual fix (paste link / pick from candidates) upgrades it to `manual` for everyone. This is what keeps YouTube's **100 searches/day** and Spotify's per-account quota survivable: after the first few hundred exports the hit rate is near 100 % for the core 2,000-track corpus.
5. **Per-user overrides win**: `overrides.songs[id].spotify/apple/tidal/youtube` (extend the existing `spotify` URI override in `types.ts`) are checked before the global cache.
6. YouTube: search only when no cache row exists and the daily budget (tracked in a `QUOTA#youtube#<date>` row) has room; otherwise mark "deferred" and finish the playlist with what matched. Consider a nightly offline job that matches the whole index at ≤100 searches/day so coverage grows without user-facing cost.

### 3.6 Fallbacks and failure handling

- Every export sheet always offers the **file download** and **copy as text** path first; provider push is additive.
- Per-provider **circuit breaker** in the `JOB#` layer: 3 consecutive 5xx/429-quota failures → `status: "degraded"` for 15 min, surfaced in `GET /api/meta.connectors` and in Settings ("TIDAL is rate-limiting us, try again in a few minutes").
- Spotify `400 invalid_grant` on refresh (6-month expiry) → mark CONN `status:"reauth"`, show "Reconnect Spotify" with the reason.
- Google `invalid_grant` for unverified-app 7-day refresh tokens (test mode) → same reauth path; verified status removes it.
- Partial playlists: we never silently drop tracks; the result shows the unmatched list and a "Retry unmatched" button that only re-runs matching.
- If a provider is unavailable at connect time (Deezer/Amazon), the card shows "Not available: <reason>" with the date we last checked, not a broken button.

---

## 4. Code sketches (TypeScript, Next.js 16 app router, Lambda)

### 4.1 Common kernel

```ts
// apps/web/src/lib/server/connect/types.ts
export type Provider = "spotify" | "apple" | "tidal" | "youtube" | "soundcloud" | "dropbox" | "google_drive";

export interface Connection {
  provider: Provider;
  /** Performs an authenticated request; the implementation decides whether it proxies (Nango/Pipedream) or uses a stored token. */
  fetch(path: string, init?: RequestInit & { base?: string }): Promise<Response>;
}

export interface TrackRef { id: string; title: string; orchestra: string; singer?: string | null; year?: number | null; durationMs?: number; isrc?: string | null }
export interface Match { providerId: string; confidence: number; method: "isrc" | "search" | "manual"; title: string; artist: string; durationMs?: number }

export interface PlaylistAdapter {
  provider: Provider;
  chunk: number;
  lookupIsrc(conn: Connection, isrcs: string[]): Promise<Map<string, Match>>;
  search(conn: Connection, t: TrackRef): Promise<Match[]>;
  createPlaylist(conn: Connection, p: { name: string; description: string; isPublic: boolean }): Promise<{ id: string; url: string }>;
  addItems(conn: Connection, playlistId: string, ids: string[]): Promise<void>;
}

export interface FileAdapter {
  provider: "dropbox" | "google_drive";
  upload(conn: Connection, f: { name: string; mime: string; bytes: Uint8Array; folder?: string }): Promise<{ url?: string; path: string }>;
}
```

```ts
// apps/web/src/lib/server/connect/adapters/tidal.ts  (JSON:API; 20-item cap; Idempotency-Key)
import type { PlaylistAdapter } from "../types";
const BASE = "https://openapi.tidal.com/v2";
const J = { "content-type": "application/vnd.api+json", accept: "application/vnd.api+json" };

export const tidal: PlaylistAdapter = {
  provider: "tidal",
  chunk: 20,
  async lookupIsrc(conn, isrcs) {
    const out = new Map();
    for (let i = 0; i < isrcs.length; i += 20) {
      const q = new URLSearchParams({ countryCode: "AR" });
      for (const x of isrcs.slice(i, i + 20)) q.append("filter[isrc]", x);
      const r = await conn.fetch(`${BASE}/tracks?${q}`, { headers: J });
      if (!r.ok) continue;
      const j = await r.json();
      for (const t of j.data ?? []) out.set(t.attributes.isrc, { providerId: t.id, confidence: 0.95, method: "isrc", title: t.attributes.title, artist: "", durationMs: iso8601ToMs(t.attributes.duration) });
    }
    return out;
  },
  async search(conn, t) {
    // Search is a separate TIDAL "searchResults" resource; include tracks relationship.
    const q = encodeURIComponent(`${t.title} ${t.orchestra}`);
    const r = await conn.fetch(`${BASE}/searchResults/${q}?countryCode=AR&include=tracks`, { headers: J });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.included ?? []).filter((x: any) => x.type === "tracks").map((x: any) => ({ providerId: x.id, confidence: 0, method: "search", title: x.attributes.title, artist: "", durationMs: iso8601ToMs(x.attributes.duration) }));
  },
  async createPlaylist(conn, p) {
    const r = await conn.fetch(`${BASE}/playlists?countryCode=AR`, {
      method: "POST",
      headers: { ...J, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ data: { type: "playlists", attributes: { name: p.name, description: p.description, accessType: p.isPublic ? "PUBLIC" : "UNLISTED" } } }),
    });
    if (!r.ok) throw new Error(`tidal create ${r.status} ${await r.text()}`);
    const { data } = await r.json();
    return { id: data.id, url: `https://tidal.com/playlist/${data.id}` };
  },
  async addItems(conn, id, ids) {
    for (let i = 0; i < ids.length; i += 20) {
      const r = await conn.fetch(`${BASE}/playlists/${id}/relationships/items?countryCode=AR`, {
        method: "POST",
        headers: J,
        body: JSON.stringify({ data: ids.slice(i, i + 20).map((x) => ({ id: x, type: "tracks" })) }),
      });
      if (r.status === 429) { await sleep(Number(r.headers.get("retry-after") ?? 5) * 1000); i -= 20; continue; }
      if (!r.ok) throw new Error(`tidal add ${r.status} ${await r.text()}`);
    }
  },
};
```

```ts
// apps/web/src/lib/server/connect/adapters/apple.ts  (developer JWT server-side, Music User Token stored encrypted)
import { SignJWT, importPKCS8 } from "jose";
let devToken: { jwt: string; exp: number } | null = null;
export async function developerToken() {
  if (devToken && devToken.exp - 60 > Date.now() / 1000) return devToken.jwt;
  const key = await importPKCS8(process.env.APPLE_MUSIC_PRIVATE_KEY!, "ES256");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 150; // ≤ 6 months
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_MUSIC_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!).setIssuedAt().setExpirationTime(exp).sign(key);
  devToken = { jwt, exp };
  return jwt;
}
export const apple: PlaylistAdapter = {
  provider: "apple",
  chunk: 25,
  async lookupIsrc(conn, isrcs) { /* GET /v1/catalog/{storefront}/songs?filter[isrc]=a,b,c with developer token only */ … },
  async search(conn, t) { /* GET /v1/catalog/{storefront}/search?types=songs&limit=10&term=… */ … },
  async createPlaylist(conn, p) {
    const r = await conn.fetch("https://api.music.apple.com/v1/me/library/playlists", { method: "POST", body: JSON.stringify({ attributes: { name: p.name, description: p.description } }) });
    const { data } = await r.json();
    return { id: data[0].id, url: `https://music.apple.com/library/playlist/${data[0].id}` };
  },
  async addItems(conn, id, ids) {
    for (let i = 0; i < ids.length; i += 25)
      await conn.fetch(`https://api.music.apple.com/v1/me/library/playlists/${id}/tracks`, { method: "POST", body: JSON.stringify({ data: ids.slice(i, i + 25).map((x) => ({ id: x, type: "songs" })) }) });
  },
};
// Connection for Apple: fetch() adds `Authorization: Bearer <developerToken()>` and `Music-User-Token: <decrypted MUT>`.
```

Browser side for Apple (the only token that must originate in the browser): load `https://js-cdn.music.apple.com/musickit/v3/musickit.js`, `MusicKit.configure({ developerToken: await (await fetch('/api/connect/apple/dev-token')).text(), app: { name: 'TDJ', build: '1' } })`, `const mut = await MusicKit.getInstance().authorize()`, then `POST /api/connect/apple { mut }` once; the client drops it. The dev token endpoint is public by design (it is embedded in every MusicKit web app) — restrict it with the `origin` claim (`setClaims({ origin: [NEXT_PUBLIC_APP_URL] })`).

### 4.2 Pipedream Connect in our stack (if chosen)

```ts
// apps/web/src/lib/server/connect/pipedream.ts
import { PipedreamClient } from "@pipedream/sdk";
export const pd = new PipedreamClient({
  projectEnvironment: (process.env.PIPEDREAM_ENVIRONMENT ?? "development") as "development" | "production",
  projectId: process.env.PIPEDREAM_PROJECT_ID!,
  clientId: process.env.PIPEDREAM_CLIENT_ID!,
  clientSecret: process.env.PIPEDREAM_CLIENT_SECRET!,
});

// app/api/connect/token/route.ts
import { NextResponse } from "next/server";
import { uidFromCookie } from "@/lib/server/identity";
export async function POST(req: Request) {
  const uid = await uidFromCookie(req);            // signed tdj_uid cookie, 401 if absent
  const { token, expiresAt, connectLinkUrl } = await pd.tokens.create({
    externalUserId: uid,
    allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL!],
    successRedirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/settings?connected=1`,
  });
  return NextResponse.json({ token, expiresAt, connectLinkUrl }); // single-use, ≤4 h
}

// app/api/connect/[app]/route.ts  (GET: which account is connected)
export async function GET(req: Request, { params }: { params: Promise<{ app: string }> }) {
  const uid = await uidFromCookie(req);
  const { app } = await params;
  const accounts = await pd.accounts.list({ externalUserId: uid, app });   // never includeCredentials
  const a = accounts.data?.[0];
  return NextResponse.json(a ? { accountId: a.id, name: a.name, healthy: a.healthy } : null);
}

// Connection implementation on top of the proxy
export function pipedreamConnection(provider: Provider, uid: string, accountId: string): Connection {
  return {
    provider,
    async fetch(url, init = {}) {
      const method = (init.method ?? "GET").toLowerCase() as "get" | "post" | "put" | "delete";
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(init.headers ?? {})) headers[`x-pd-proxy-${k}`] = String(v); // forwarded upstream
      const res = await pd.proxy[method]({ externalUserId: uid, accountId, url, headers, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(res), { status: 200 }); // proxy surfaces upstream errors as thrown errors; wrap in try/catch upstream
    },
  };
}
```

```tsx
// Browser (Settings card)
"use client";
import { PipedreamClient } from "@pipedream/sdk";
const client = new PipedreamClient({
  projectEnvironment: process.env.NEXT_PUBLIC_PIPEDREAM_ENV as "development" | "production",
  externalUserId: uid, // from /api/me
  tokenCallback: async () => (await (await fetch("/api/connect/token", { method: "POST" })).json()).token,
});
export function ConnectButton({ app, oauthAppId }: { app: "dropbox" | "google_drive" | "youtube_data_api" | "spotify"; oauthAppId?: string }) {
  return (
    <button className="h-11 …" onClick={() => client.connectAccount({ app, oauthAppId, onSuccess: () => mutate(`/api/connect/${app}`), onError: (e) => toast(e.message) })}>
      Connect
    </button>
  );
}
// Mobile Safari / no-popup fallback: window.location.assign(`${connectLinkUrl}&app=${app}`)
```

Notes: set `Cross-Origin-Opener-Policy: same-origin-allow-popups` only if we ever enforce COOP; pass `oauthAppId` for our own Google client so the Drive scope is `drive.file`; every proxied call costs credits, so keep the match cache in front of it; set `PIPEDREAM_ENVIRONMENT=production` only on the production SST stage (Free plan cannot serve production users).

### 4.3 Nango in our stack (recommended)

```ts
// apps/web/src/lib/server/connect/nango.ts
import { Nango } from "@nangohq/node";
export const nango = new Nango({ apiKey: process.env.NANGO_SECRET_KEY!, host: process.env.NANGO_HOST /* undefined = cloud; https://nango.internal when self-hosted */ });

// app/api/connect/session/route.ts
export async function POST(req: Request) {
  const uid = await uidFromCookie(req);
  const { provider } = await req.json();                       // "dropbox" | "google-drive" | "youtube" | "spotify"
  if (!NANGO_INTEGRATIONS.includes(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  const { data } = await nango.createConnectSession({
    tags: { end_user_id: uid },
    allowed_integrations: [provider],
    integrations_config_defaults: provider === "google-drive" ? { "google-drive": { connection_config: { oauth_scopes_override: "https://www.googleapis.com/auth/drive.file" } } } : undefined,
  });
  return NextResponse.json({ token: data.token, expiresAt: data.expires_at }); // 30 min
}

// app/api/connect/webhook/route.ts  (Nango auth webhook → persist connectionId)
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-nango-signature") ?? "";
  if (!nango.verifyIncomingWebhookRequest(raw, sig)) return new Response("bad signature", { status: 401 });
  const ev = JSON.parse(raw);
  if (ev.type === "auth" && ev.operation === "creation" && ev.success) {
    await putConnection({ uid: ev.endUser?.endUserId ?? ev.tags?.end_user_id, provider: ev.providerConfigKey, kind: "nango", connectionId: ev.connectionId, authorizedAt: Date.now() });
  }
  return new Response("ok");
}

// Connection on top of the Nango proxy (tokens never touch our code)
export function nangoConnection(provider: Provider, providerConfigKey: string, connectionId: string, base: string): Connection {
  return {
    provider,
    async fetch(url, init = {}) {
      const endpoint = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
      const m = (init.method ?? "GET").toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
      const r = await nango[m]({ providerConfigKey, connectionId, endpoint, baseUrlOverride: base, headers: init.headers as Record<string, string>, data: init.body ? JSON.parse(String(init.body)) : undefined, retries: 3 });
      return new Response(JSON.stringify(r.data), { status: r.status, headers: { "content-type": "application/json" } });
    },
  };
}
// For binary uploads (Dropbox/Drive) use nango.getConnection(key, id) → credentials.access_token (cache ≤5 min, never persist, never send to browser) and call the provider directly with the raw body.
```

```tsx
// Browser (Settings card)
"use client";
import Nango from "@nangohq/frontend";
export async function connect(provider: "dropbox" | "google-drive" | "youtube" | "spotify", spotifyClient?: { id: string; secret: string }) {
  const { token } = await (await fetch("/api/connect/session", { method: "POST", body: JSON.stringify({ provider }) })).json();
  const nango = new Nango({ connectSessionToken: token, host: process.env.NEXT_PUBLIC_NANGO_HOST });
  if (provider === "spotify" && spotifyClient) {
    // Spotify Development Mode: the DJ's own app (5 users). Nango stores the override with the connection.
    await nango.auth("spotify", { credentials: { oauth_client_id_override: spotifyClient.id, oauth_client_secret_override: spotifyClient.secret } });
    return;
  }
  nango.openConnectUI({ sessionToken: token, onEvent: (e) => { if (e.type === "connect" || e.type === "close") mutate("/api/connect"); } });
}
```

Spotify through Nango needs the DJ's Client Secret in the browser for the override call. If that is unacceptable, keep Spotify fully in the DIY kernel (next block) — the PKCE flow needs no secret.

```ts
// DIY PKCE on the server (Spotify BYO today, TIDAL, SoundCloud): app/api/connect/[provider]/start/route.ts
export async function GET(req: Request, { params }) {
  const { provider } = await params; const uid = await uidFromCookie(req);
  const url = new URL(req.url); const clientId = url.searchParams.get("client_id") ?? PROVIDERS[provider].clientId; // Spotify: the DJ's own id (stored in CONN row)
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = crypto.randomUUID();
  const auth = new URL(PROVIDERS[provider].authorize); // spotify: accounts.spotify.com/authorize, tidal: login.tidal.com/authorize
  auth.search = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: `${APP}/api/connect/${provider}/callback`, scope: PROVIDERS[provider].scopes, code_challenge_method: "S256", code_challenge: challenge, state }).toString();
  const res = NextResponse.redirect(auth);
  res.cookies.set(`tdj_pkce_${provider}`, sealed({ verifier, state, clientId, uid }), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/connect" });
  return res;
}
// callback: verify state, POST token endpoint with code_verifier (+ Basic auth for TIDAL/SoundCloud confidential clients, none for Spotify PKCE), encrypt {access, refresh, expires, authorizedAt} with KMS, put CONN row, redirect to /settings?connected=<provider>.
// refresh-on-use: if expires < now+60s → refresh; on 400 invalid_grant → status "reauth".
```

---

## 5. Env, config and settings copy

### 5.1 Server environment (SST `environment` + GitHub Actions secrets; none of these ever reach the client)

| Var | Purpose |
|---|---|
| `TDJ_SECRET` | signs `tdj_uid` and the PKCE cookie (exists in round-2 spec) |
| `TDJ_CONNECT_TABLE` | DynamoDB table (connections, global match cache, jobs) |
| `TDJ_KMS_KEY_ARN` | KMS key for envelope encryption of tokens / Apple MUT |
| `NANGO_SECRET_KEY`, `NANGO_HOST?`, `NANGO_WEBHOOK_SECRET` | Nango backend + webhook verification |
| `APPLE_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` (PEM, multiline) | MusicKit developer token |
| `TIDAL_CLIENT_ID`, `TIDAL_CLIENT_SECRET` | our TIDAL app (if DIY rather than Nango) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | registered in Nango (one Google client for Drive + YouTube) |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | registered in Nango |
| `SOUNDCLOUD_CLIENT_ID/SECRET` | optional, phase 5 |
| `PIPEDREAM_CLIENT_ID/SECRET/PROJECT_ID/ENVIRONMENT` | only if the Pipedream path is chosen |
| `NEXT_PUBLIC_APP_URL` | redirect URIs, MusicKit `origin` claim (exists) |
| `NEXT_PUBLIC_CONNECTORS` | comma list of enabled providers so the UI hides what the stage has no keys for |

SST additions: `new sst.aws.Dynamo("Connect", { fields: { pk: "string", sk: "string" }, primaryIndex: { hashKey: "pk", rangeKey: "sk" }, ttl: "ttl" })`, `new aws.kms.Key(...)`, link both to `Web`. Lambda timeout stays 30 s; long exports go through the `JOB#` polling path.

Per-DJ settings that stay client-side (zustand `settings`): `spotifyClientId` (already), `connectors.visibility` (private/unlisted default), `connectors.folder` per file target, `connectors.namePattern` (`{milonga} {date} — TDJ`).

### 5.2 Settings UI copy (card "Send your set elsewhere")

- Section intro: "Push the finished set straight into a streaming library, or drop the Rekordbox / Traktor / M3U8 file into your cloud folder. Connections are stored on the TDJ server, encrypted; we never see your password and nothing is kept in this browser."
- **Spotify** — "Uses your own Spotify developer app (Spotify allows 5 listeners per app, so every DJ needs their own). Paste the Client ID from developer.spotify.com, add `https://<app>/api/connect/spotify/callback` as a Redirect URI, then Connect. Spotify asks you to reconnect every six months." Button: *Connect Spotify* / *Reconnect* / *Disconnect*. Status line: "Connected as {displayName} · playlists go to your library as private".
- **Apple Music** — "Needs an active Apple Music subscription. Sign in with your Apple ID in the window that opens; TDJ only receives a library token, never your Apple ID password." Button: *Connect Apple Music*.
- **TIDAL** — "Sign in with your TIDAL account. Playlists are created as unlisted; switch to public below." Button: *Connect TIDAL*.
- **YouTube Music** — "Creates a YouTube playlist in your account (YouTube Music shows it too). Matching is limited to a daily budget shared by all TDJ users, so some 78-rpm recordings may show as 'not found yet' — they fill in over the next days." Button: *Connect YouTube*.
- **Dropbox / Google Drive** — "Saves export files to a TDJ folder. Pick a folder and a file name pattern; Rekordbox and Traktor paths use the music folder from the DJ-apps card." Buttons: *Connect Dropbox*, *Connect Google Drive*.
- **SoundCloud** (hidden unless enabled) — "Most golden-age recordings are not on SoundCloud; expect gaps."
- **Deezer / Amazon Music / Beatport** cards (disabled, grey): "Not available — Deezer stopped accepting new apps in 2025 / Amazon Music's API is in a closed beta / Beatport is partner-only. We check again every release." (keep the "last checked" date in `docs/research/connectors.md` and the UI).
- Export sheet result: "{n} of {total} tracks added to {provider}. {k} not found — tap to fix: we remember your fix for everyone." · "Cortinas included/excluded" · "Open in {provider}".
- Error copy: "Spotify needs you to reconnect (tokens expire after six months)." · "TIDAL is rate-limiting us; your playlist is saved with {n} tracks — retry the rest in a few minutes." · "YouTube's daily matching budget is used up; we'll finish this playlist tomorrow if you leave it in the queue."

---

## 6. What we must NOT promise

1. **Deezer export.** App creation has been off since June 2025; no official reopening. Do not ship a Deezer button; keep a greyed card with the reason.
2. **Amazon Music export.** Closed beta, no public access path.
3. **Beatport / Beatsource.** Partner-only API, no public credentials; no tango catalogue.
4. **"Connect Spotify in one click."** Each DJ must create their own Spotify app and hold Premium; 5 users per app; reconnection every 6 months. Do not advertise a shared TDJ Spotify app. Do not promise Spotify-derived BPM/energy (Audio Features is gone, see engineering-2026.md).
5. **Complete YouTube playlists on the first try.** 100 searches/day/project and 10,000 units/day (≈200 inserts) across all users until Google grants a quota extension; wording must say "fills in over the next days".
6. **SoundCloud coverage.** Catalogue is user uploads; matching will be poor and registration needs Artist Pro.
7. **That tokens never touch the browser for Apple Music.** The Music User Token is issued to the browser by MusicKit JS by design; we send it to the server once and discard it client-side. Say "encrypted on our server", not "never in the browser", for Apple.
8. **Instant exports for large sets through a broker.** Nango/Pipedream proxies add latency and (Pipedream) credits; a 90-item TIDAL export is ≥6 sequential requests.
9. **Reorder/remove on TIDAL** beyond what the official API supports (PATCH/DELETE on items exist in the spec but are throttled; we only create and append).
10. **Any pricing figure above as stable.** Pipedream re-packaged its plans in Oct 2026, Composio in Aug 2026, Nango's page lists no proxy quota; re-check before committing to a vendor contract.

---

## 7. Phased plan

| Phase | Scope | Output | Effort |
|---|---|---|---|
| **0. Foundation** (week 1) | Signed-cookie identity, `TDJ_CONNECT_TABLE` + KMS, `Connection`/adapter interfaces, `JOB#` + polling route, settings card skeleton, `NEXT_PUBLIC_CONNECTORS` gating, e2e for connect/disconnect state. Register Dropbox app and Google Cloud project (start brand + sensitive-scope verification now, ~3 weeks elapsed). | PR, no user-visible provider yet | 3–4 days |
| **1. Files to the cloud** (week 2) | Nango Cloud PAYG; `dropbox` and `google-drive` (own OAuth apps, `drive.file`); upload adapters for all `EXPORTERS`; folder/name pattern settings. | "Save to Dropbox / Google Drive" in the export sheet | 3 days |
| **2. Catalogue matching + Apple + TIDAL** (weeks 3–4) | Extend `index:enrich` to store ISRC/duration/album; global match cache; scorer with vitest fixtures of 50 known 78-rpm reissues and 10 impostors (modern covers); Apple (MusicKit JS + dev JWT) and TIDAL (DIY PKCE, or Nango once `providers.yaml` PR merges) adapters; unmatched-fix UI. | Apple Music + TIDAL export | 6–8 days |
| **3. Spotify server-side BYO** (week 5) | Move `lib/spotify.ts` token exchange to `/api/connect/spotify/*`; encrypted refresh token; 6-month `authorizedAt` tracking; `/playlists/{id}/items`; search `limit=10`; the Listen tab keeps using a short-lived access token fetched from `GET /api/connect/spotify/access` (never the refresh token). | Spotify works without tokens in localStorage; existing DJs re-connect once | 2–3 days |
| **4. YouTube (Music)** (week 6, after Google verification) | `youtube` via Nango; `playlists.insert` + per-item `playlistItems.insert`; search budget row; nightly offline matcher; quota-extension request with usage justification. | Best-effort YouTube playlists | 3 days |
| **5. Opportunistic** | SoundCloud (Artist Pro + CLI app registration) if someone asks; Deezer/Amazon adapters only when their programmes reopen; evaluate Nango self-host (free auth+proxy tier on ECS/RDS) once connections > ~5k or compliance asks for data residency. | — | as needed |

Quality bar for every phase (per CLAUDE.md): vitest invariants for the matcher and chunking, e2e for connect state and export result sheet on desktop + iPhone, 44 px targets, no secrets in the client bundle (`grep -r NANGO_SECRET apps/web/.next` in CI), and a fixture-based contract test per adapter run against recorded responses so provider changes are caught before a DJ hits them.
