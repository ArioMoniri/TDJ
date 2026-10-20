# Round 8: connectivity audit

Every external connection of the app, read end to end in the code and probed on the live deployment
(`https://d3k5k2c1l0s5ri.cloudfront.net`, 2026-10-20, curl + node from a cloud session). Scope: Spotify hosted login and
the BYO PKCE fallback, server-side matching and playlist creation, Google (Drive, YouTube), Dropbox, Deezer previews,
MusicBrainz, the four model providers and the shared key, the webhook export, `/api/admin/*`, `/api/db`, caching,
Lambda timeouts, CORS/CSRF, cookies and the words a DJ reads when something fails.

Severity: **P0** security or data loss · **P1** a flow that does not work · **P2** fragile (works until a plausible
condition) · **P3** polish. Each item names the file and line of the fix. Nothing in the source was changed by this
round; the patches are described, not applied.

## What the live deployment says about itself

| Probe | Answer | Meaning |
|---|---|---|
| `GET /api/admin/status` | `unlocked:false, hasPassphrase:false, hasSetupCode:true, backend:"ssm", storeAvailable:true, origin:https://d3k5…` | The function reaches Parameter Store with its IAM role; **nobody has claimed `/admin` yet** and the setup code from the deploy summary is still valid (see P1-1). |
| `GET /api/admin/public` | `providers: spotify/google/dropbox all false, ai.shared:false, seats 0/5, 0/100, 0/50` | No connector and no shared model key is configured. Every one-tap login is off. |
| `GET /api/spotify/me`, `/api/google/me`, `/api/dropbox/me` | `200 { hosted:false, user:null }` | Correct "not enabled" state; no console 401s. |
| `GET /api/*/login` | `404 { error: "<Provider> login is not enabled on this deployment" }` | Correct. |
| `GET /api/spotify/callback?state=x&code=y` | `302 /settings?error=spotify_disabled`, clears `tdj_sp_state` | Correct ordering (enabled check before state check). |
| `GET /api/resolve` | `{ deezer:true, musicbrainz:true }` | Both keyless services reachable from the Lambda. |
| `POST /api/resolve` (Poema / Canaro / Maida) | Deezer and MusicBrainz candidates, previews signed `exp=+24 h` | Works. MusicBrainz suggests **year 2008** for a 1935 recording (P2-7). |
| `GET /api/preview?provider=deezer&id=16439966[&json=1]` | `302` to `cdnt-preview.dzcdn.net…` / `{ url }`, `cache-control: private, max-age=3600` | Works. The CDN answers `access-control-allow-origin: *` with `Range` allowed, so the analyser's `mode:"cors"` fetch succeeds. |
| `POST /api/admin/unlock` × 7, same `X-Forwarded-For` | 6 × `401` (1.2–1.7 s each), 7th `429` | The limiter works **but is keyed on a header the caller controls** (P1-2). Without the header, 7 attempts from this session never hit the limiter. |
| `OPTIONS /api/admin/config` (Origin evil) | `200`, `access-control-allow-origin: *`, `-methods: *`, `-headers: *` | A permissive CORS policy is attached in front of every `/api/*` route; it is not in the repo (P3-1). |
| `X-Forwarded-Host: evil.example` on `/api/admin/status` | origin stays `https://d3k5…` | OpenNext/CloudFront overwrite the viewer's header: `incomingOrigin()` is not spoofable here. |
| `GET /api/db` | `{ enabled:false, mode:"browser" }` | DynamoDB mode off; nothing in `sst.config.ts` provisions a table (P3-6). |
| `POST /api/ai/review` without key | `401 "No API key. Add one in Settings → Written reviews."` | Correct while no shared key exists. |

Environment the deployed function has: `TDJ_STAGE`, `TDJ_CONFIG_BACKEND=ssm`, `TDJ_DATA_ROOT`, `ANTHROPIC_MODEL`,
`NEXT_PUBLIC_APP_URL=""` (falls back to the request host, which is right), SSM + KMS permissions. It does **not** have
`TDJ_SECRET`, `TDJ_DB_TABLE`, `TDJ_COOKIE_SECRET` (generated into SSM on first use, fine) or any connector secret.

## Owner must still configure

1. Open `/admin` with the setup code from the "Deploy to AWS" run summary **today** (it is valid 24 h from issue and
   anyone who can open the run summary can read it), choose the passphrase.
2. Spotify Client ID + secret (and the two redirect URIs, User Management e-mails), Google client (+ test users),
   Dropbox app key + secret: all three rows are "Not enabled" on the live site.
3. Shared model key, if DJs are to get reviews without their own key. Note P1-4 and P1-5 before choosing OpenAI or
   Gemini.
4. Optional: `TDJ_SECRET` as a GitHub secret (P2-4) once `sst.config.ts` forwards it; `TDJ_DB_TABLE` only after P3-6.

## P0

None found. No secret reaches a browser: `/api/admin/*` returns last-4 hints only, the AI key never leaves `llm.ts`,
tokens live in AES-GCM sealed httpOnly cookies, the setup code is masked in the Actions log and deleted on passphrase.
State-changing routes are protected by `SameSite=Lax` (user sessions) and `SameSite=Strict` (admin), so the
permissive CORS header (P3-1) cannot be combined with cookies.

## P1

### P1-1 · `/admin` is unclaimed on the live deployment and the setup code is live
`GET /api/admin/status` → `hasPassphrase:false, hasSetupCode:true`. Until the owner unlocks, the code printed in the
GitHub run summary (readable by every collaborator with Actions access) is the only secret guarding the connector
store. Not a code bug; an operational one. Also `apps/web/src/lib/server/admin.ts:291-304` reports `hasSetupCode`
to unauthenticated callers, which tells a visitor that the console is unclaimed. Patch: return `hasSetupCode` only
when `unlocked`, keep `hasPassphrase` (the page needs it to pick the prompt).

### P1-2 · Admin unlock rate limit is keyed on a caller-controlled header
`apps/web/src/lib/server/admin.ts:84-91` uses `x-forwarded-for.split(",")[0]`. CloudFront **appends** the viewer
address to whatever `X-Forwarded-For` the client sent, so the first element is attacker-chosen; rotating it defeats the
5-per-10-min lockout (verified: 7 attempts with a fixed spoofed header produced the 429, so the limiter sees the
spoofed value). What is left is scrypt + the 1 s delay per attempt, per Lambda instance, with unbounded parallelism.
Patch: take the **last** element of `x-forwarded-for` (the one CloudFront appended), or prefer
`cloudfront-viewer-address`; and because each Lambda instance keeps its own `attempts` map (`admin.ts:83`), add a
global throttle: store `/tdj/<stage>/UNLOCK_FAILURES` (count + window) in SSM through `setConfigValue` and refuse when
over 20 per hour regardless of client, or move the counter to DynamoDB when P3-6 lands.

### P1-3 · Dropbox upload fails for any set name or file name with a non-Latin-1 character
`apps/web/src/lib/server/dropbox.ts:636` puts `JSON.stringify({ path, … })` into the `dropbox-api-arg` header. Node's
`fetch` rejects header values outside ISO-8859-1 (`TypeError: Cannot convert argument to a ByteString … value of 8211`,
reproduced locally with "Noche de Tango – Ñandú"); Dropbox itself requires non-ASCII to be `\uXXXX`-escaped. Set names
with ñ, í, é or an en dash are the norm in tango. The DJ sees that TypeError verbatim in the Export log. Same bug in
the Pipedream path `apps/web/src/lib/server/connect.ts:148`. Patch (both files): `const httpJson = (v: unknown) =>
JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))` and use
it for the header. Add an e2e case with "Práctica – Ñandú" to `apps/web/e2e/connectors.spec.ts` ("Dropbox upload…").

### P1-4 · OpenAI path sends `max_tokens`, which the default model rejects
`apps/web/src/lib/server/llm.ts:195-197` posts `max_tokens` to `/v1/chat/completions` with default model `gpt-5.2`.
OpenAI's reasoning models (o-series, gpt-5 family) refuse `max_tokens` (`Unsupported parameter: 'max_tokens' is not
supported with this model. Use 'max_completion_tokens' instead.`), so every review on the organiser's or a DJ's OpenAI
key fails with that text. (OpenRouter accepts `max_tokens`; keep it there.) Patch: for `openai` send
`max_completion_tokens: Math.max(maxTokens, 4000)` (reasoning tokens count against it; 1,200 leaves no room for text),
for `openrouter` keep `max_tokens`. Could not be re-verified against the live reference page from this session (403),
so confirm once with a key in `/admin → Test`.

### P1-5 · Gemini default model does not exist
`llm.ts:141` defaults to `gemini-3-pro`; the public models page lists `gemini-3-pro-preview` as shut down and no
`gemini-3-pro`. A DJ or owner who picks Gemini and leaves the model blank gets `404 … models/gemini-3-pro is not found`.
Patch: default to a listed stable ID (`gemini-2.5-flash` or the current flash model), send the key as the
`x-goog-api-key` header instead of `?key=` (`llm.ts:214`; query strings land in access logs), raise
`maxOutputTokens` to ≥ 4000 (thinking models spend it before writing), and have `/admin → Test` print the model it
used.

### P1-6 · YouTube export of a full set exceeds the 30 s Lambda timeout
`apps/web/src/lib/server/google.ts:535-581` runs playlist insert + search + playlistItems insert for every track in
one request: ~1 s per track, a 4 h set has 60–80 tracks, `sst.config.ts:57` sets `timeout: "30 seconds"` (CloudFront's
origin timeout is 30 s too). The DJ sees `Export answered 504`, a half-filled playlist exists on YouTube and the
`skipped`/`missing` report is lost. The e2e mock answers instantly, so the suite does not see it. Patch: mirror the
Spotify design: new `POST /api/google/youtube` body `{ playlistId?, queries[≤10] }` returning `{ id, added, missing,
skipped, quota }`, and loop in `ExportSheet.tsx` with a progress label; or at minimum raise `timeout` to 120 s and
stop the loop at a 20 s deadline, returning the rest as `skipped` with a "Continue" action.

### P1-7 · The organiser's shared model key is open to anyone, uncounted
`apps/web/src/lib/server/llm.ts:99-116`: the daily cap is per `tdj_uid` cookie, and `userFromRequest` mints a fresh id
for a request without one, so a caller who omits cookies gets a new 20-request allowance every call; the counter also
lives in one Lambda instance's memory and is signed with a public secret (P2-4). `/api/ai/review` and `/api/ai/refine`
take no origin check and the CORS policy answers `*`, so a script anywhere can burn the owner's credit at full speed.
With no shared key configured today this is latent; it becomes live the moment the owner saves one. Patch (in order of
value): (a) reject shared use when the request had no valid `tdj_uid` and no `Origin`/`Sec-Fetch-Site: same-origin`
header (`llm.ts:104`); (b) a second counter keyed by `clientKey(req)` from P1-2; (c) a deployment-wide daily ceiling
`AI_DAILY_TOTAL` (default `AI_DAILY_LIMIT × 10`) in the same map; (d) persist the counters (SSM parameter rewritten
per minute, or DynamoDB after P3-6). Also `aiFromHeaders` (`llm.ts:46`) falls back to `process.env.ANTHROPIC_API_KEY`
**without** any counting; drop that fallback or route it through `resolveAi` as a shared key.

## P2

### P2-1 · Open redirect through `?next=//host` after any OAuth login
`apps/web/src/lib/server/oauth.ts:269` and `:331` accept `next` when it `startsWith("/")`; `//evil.example/x` passes
and `new URL("//evil.example/x", origin)` resolves to `https://evil.example/x` (verified in node). A phishing link
`/api/spotify/login?next=//evil.example` sends the DJ through a real Spotify consent and lands them on the attacker's
page with a convincing `?connected=spotify`. Patch: `const safeNext = (s) => /^\/(?!\/)/.test(s) ? s : "/settings"` in
both places; add an e2e assertion.

### P2-2 · Matching batch and the legacy playlist route can outrun the Lambda
`oauth.ts:392-398` waits out one `Retry-After ≤ 10 s` per call; `spotify.ts:362-376` does up to three searches per
item and `/api/spotify/match` takes 10 items, so one unlucky batch can sleep 60 s+; `/api/spotify/playlist` without
`uris` (`playlist/route.ts:38-50`) matches a whole set in one request. Both hit the 30 s timeout and the DJ sees
`Spotify answered 504` instead of the pause message with "Try again". Patch: give `matchItems` a deadline
(`Date.now() + 20_000`); when a 429's wait would cross it, stop and return `rateLimited` as today; in `api()` pass the
remaining budget instead of the fixed `RETRY_AFTER_MAX`. Keep `MATCH_BATCH = 10`.

### P2-3 · Session endpoints carry no `cache-control`
`/api/spotify/me` (returns the live access token), `/api/google/me`, `/api/dropbox/me`, `/api/connect/accounts`,
`/api/db` and `/api/resolve` GET answer without any `cache-control` (observed), while `/api/spotify/access` and the
admin routes say `no-store`. Today CloudFront reports a miss and OpenNext's server behaviour has a 0 s default TTL,
but a future cache-policy change or an intermediate proxy would serve one DJ's token to another. Patch: a tiny
`noStore(json)` helper in `apps/web/src/lib/server/wire.ts` used by every route that reads a cookie
(`spotify/me/route.ts:15,22,31`, `google/me/route.ts`, `dropbox/me/route.ts`, `connect/accounts/route.ts`,
`db/route.ts`, `ai/review/route.ts:61`).

### P2-4 · `tdj_uid` is signed with a public default secret in production
`apps/web/src/lib/server/db.ts:318` falls back to `TDJ_DB_TABLE` or `"tdj-dev-secret"`; `sst.config.ts:23-35` never
forwards `TDJ_SECRET`, so the live deployment signs with the literal. Anyone can mint valid ids, which matters for the
shared-key counter (P1-7) and for the server database the day `TDJ_DB_TABLE` is set (reading another DJ's overrides
and history by forging their id). Patch: derive the HMAC key from `getCookieSecret()` (`config.ts:247`) and make
`userFromRequest` async, or add `TDJ_SECRET` to the `secrets` list in `sst.config.ts` and the workflow.

### P2-5 · A cold start whose SSM read fails silently logs everyone out and seals cookies with a throw-away key
`config.ts:174-191` caches `unavailable` for 60 s; `getCookieSecret()` (`config.ts:247-265`) then generates a
per-process secret. For that minute the instance cannot unseal `tdj_sp`/`tdj_gg`/`tdj_db`/`tdj_admin` (every `/me`
answers "not connected" and **clears the cookie**, `spotify/me/route.ts:16-17`), and a login during the window seals
with a key no other instance knows. The 4 s request timeout × 2 attempts on `config.ts:91` makes this plausible on a
slow SSM morning. Patch: do not clear a session cookie when `storeAvailable()` is false; in `getCookieSecret()` throw
(`503 "Configuration store unavailable, try again in a minute"`) instead of inventing a key when the backend is `ssm`;
log once per instance.

### P2-6 · MusicBrainz: no 1 req/s pacing and an unescaped Lucene query
`apps/web/src/app/api/resolve/route.ts:67-75,107` fires one search per `/api/resolve` call with no throttle, so two
DJs resolving a set at once exceed MusicBrainz's 1 request/second rule and get 503s (the user-agent is correct). The
query `"${title} AND artist:${orchestra}"` is not escaped: "(a divertirse)", "¿Qué?", "D'Arienzo (1951)" or any colon
produce a 400 that the route reports as `error: "MusicBrainz 400"` with no candidates. Patch: quote and escape
(`recording:"${esc(title)}" AND artist:"${esc(orchestra)}"` with `esc = s => s.replace(/["\\]/g, "\\$&")`), and a
per-instance token bucket (`lastMbAt`, sleep to 1,100 ms) before the fetch. Also clamp `score()` to 1 (`:40-56`; the
live answer showed `confidence: 1.05`).

### P2-7 · MusicBrainz "first-release-date" is a reissue date and overwrites a correct year
`resolve/route.ts:149-150` suggests the year of the best MusicBrainz recording; the live probe suggested **2008** for
Canaro's Poema (1935) because the matching recording is a CD reissue. The ResolveSheet offers this as "Use 2008".
Patch: only suggest when the catalogue has no year, or when `|year − catalogueYear| ≤ 2`; prefer `date` from the
earliest release in `releases[]` (request `inc=releases`) over `first-release-date`.

### P2-8 · The shared-key review can exceed the Lambda timeout, and the error is not a DJ sentence
`llm.ts:161-169` is a non-streaming call with `max_tokens` 16,000 and the SDK's 10 min default timeout inside a 30 s
Lambda. A slow answer becomes CloudFront `504` and the Export/Review UI prints `Model request failed`. Patch: pass
`timeout: 25_000, maxRetries: 0` to the client (`llm.ts:154`) and map the SDK's `APIConnectionTimeoutError` to
"The model took too long; try again or ask a shorter question"; raise `server.timeout` in `sst.config.ts:57` to 60 s
(reviews, YouTube, long matches all benefit).

### P2-9 · Google test can report a wrong "accepted"
`admin.ts:519-531` treats `invalid_request` as proof the client authenticated. Google returns `invalid_request` for
a malformed request before it checks the secret, so an owner can save a wrong secret and read "Google accepted the
Client ID and secret". Patch: accept only `invalid_grant` (and for Dropbox `invalid_grant`/`400 without "client"`),
and show the raw `error` on anything else.

## P3

### P3-1 · A wildcard CORS policy sits in front of `/api/*`
Every route answers `access-control-allow-origin: *` and `OPTIONS` reflects `*` methods/headers; nothing in the repo
sets it (it comes from the function URL or distribution defaults). Cookies cannot ride on `*`, so sessions are safe,
but any site can call `/api/compose`, `/api/resolve` and `/api/ai/*` from a visitor's browser. Patch: set the
function URL CORS to the app origin in `sst.config.ts` (`server.cors` or the `transform` hook), and add
`if (req.headers.get("sec-fetch-site") === "cross-site") return 403` to the POST routes in a shared helper.

### P3-2 · "Cancel" on Spotify's consent page reads as "not listed"
`oauth.ts:311-312` maps `error=access_denied` to `spotify_not_listed`, which opens the seats sheet. A DJ who simply
pressed Cancel is told the organiser must add them. Spotify sends `access_denied` for both. Patch: keep the mapping
but word the sheet as "Spotify did not let you in. Either you pressed Cancel, or this e-mail is not on the organiser's
list (N of 5 seats used)…".

### P3-3 · Raw upstream bodies reach the DJ
`oauth.ts:402` builds messages like `/v1/playlists/abc/items: 403 {"error":{"status":403,"message":"…"}}`; the Export
log prints `Error: ` + that; `google/drive/route.ts:39`, `dropbox/upload/route.ts:28`, `spotify/match/route.ts:52`
pass it through. Patch: a `userMessage(e)` in `oauth.ts` mapping 401 → "Log in again", 403 → "<Provider> refused;
check the permissions", 429 → the pause sentence, 5xx → "<Provider> is having trouble; try again in a minute", and
keep the raw body in `console.warn`.

### P3-4 · BYO PKCE fallback: scopes and copy
`apps/web/src/lib/spotify.ts:12` requests only the playlist scopes, so a BYO DJ cannot use the Booth's Spotify
playback (needs `streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state`);
`:52` throws `Spotify token exchange failed: 400`, shown verbatim on `/callback`; the verifier lives in
`sessionStorage`, which Safari drops when the consent page opens in a new tab. Patch: align `SCOPES` with
`SPOTIFY.scopes`, map 400 → "Spotify rejected the code: check that `<origin>/callback` is in your app's Redirect URIs",
and keep the verifier in `localStorage` with a 10 min expiry.

### P3-5 · Spotify add-items fallback hides the first error
`spotify.ts:411-419` catches **any** failure of `/items` (including 401 and a second 429) and retries on the deprecated
`/tracks`, doubling requests while rate-limited. Spotify's reference now documents `POST /me/playlists` and marks
`/playlists/{id}/tracks` deprecated, so the fallback can go: call `/items` only, let `ApiError` propagate.

### P3-6 · DynamoDB mode cannot be turned on from the deploy
`db.ts` and `/api/db` are ready, but `sst.config.ts` creates no table and forwards no `TDJ_DB_TABLE`. Patch: `new
sst.aws.Dynamo("Db", { fields: { pk: "string" }, primaryIndex: { hashKey: "pk" } })`, `link: [table]`, env
`TDJ_DB_TABLE: table.name`; then P1-2 and P1-7 can keep real counters there.

### P3-7 · Owner guide contradicts the workflow on a lost passphrase
`docs/OWNER_GUIDE.md` §A.4 says "Run Deploy to AWS again and use the new setup code"; `.github/workflows/deploy-aws.yml:121-128`
deliberately issues no code while `OWNER_PASSPHRASE_HASH` exists (DEPLOY.md has the right steps). Patch the guide:
"ask whoever has AWS access to delete `/tdj/production/OWNER_PASSPHRASE_HASH` in Parameter Store, then run Deploy".

### P3-8 · Webhook export: non-ASCII set name silently downgrades the request
`apps/web/src/components/ExportSheet.tsx:62` puts the set name in `x-tdj-set`; browsers reject non-Latin-1 header
values, the `catch` on `:69-71` retries `no-cors` with `text/plain` only, and the toast says "Sent to the webhook"
while the format header is gone. Patch: `encodeURIComponent(name)` in the header (document it as URL-encoded) and
keep `x-tdj-format` on the retry.

### P3-9 · Anthropic workspace header is unverified
`llm.ts:156` sends `anthropic-workspace-id` for an "organisation-level key". The Messages API documentation does not
describe such keys or that request header; the SDK has no option for it. It is harmless (unknown headers are
ignored) but the `/admin` copy promises something that may not exist. Patch: keep the field, but have `/admin → Test`
run once without the header and once with it, and report which one the API accepted; drop the hint text if neither
differs.

### P3-10 · Deezer preview endpoint has no per-client pacing
`preview/route.ts:18` fetches `api.deezer.com/track/{id}` once per id per instance (6 h cache). The Booth prefetches a
whole night; Deezer's keyless limit is ~50 requests / 5 s per IP, and all Lambdas share NAT egress. Patch: a small
in-process queue (max 5 concurrent, 100 ms spacing) and a `429 → 503 + Retry-After` mapping so the player skips and
retries instead of marking the track "no preview".

### P3-11 · Pipedream YouTube path counts quota stops as "not found"
`connect.ts:242-245` pushes quota-skipped queries into `missing`, unlike the direct path which separates `skipped`.
Patch: mirror `google.ts:572-577`.

## Things that are right (verified)

- Hosted Spotify: `response_type=code`, state cookie `Path=/api/spotify; Max-Age=600; SameSite=Lax; HttpOnly; Secure`
  on https, exchange on the server with Basic auth, refresh 60 s before expiry with the cookie re-sealed, 180-day
  cap matching the 6-month refresh-token life, `/access` returns only `{ access, expires }`, scopes include the
  Web Playback SDK trio plus both playback-state scopes. `error=invalid_client` and the 403 "not registered" exchange
  both land on `spotify_not_listed`, and Settings renders a sheet with the seats count and the organiser's contact.
- Matching scorer (`apps/web/src/lib/match.ts`), exercised with 17 tango cases: accents and punctuation are
  normalised ("Qué noche" ↔ "Que Noche" 0.80), "(a divertirse)" strips to "vamos" and still prefers Canaro's own
  recording (0.78) over a modern cover (0.10), "Orquesta Típica Víctor" → surname `victor` / filter `Víctor`,
  "Di Sarli" and "De Angelis" keep the particle in the filter, D'Arienzo 1951 vs 1928 La cumparsita splits on
  duration + album year (0.95 vs 0.80), a track credited to the singer only ("Alberto Castillo") without the
  orchestra is "not found" rather than a wrong song. Unit tests pass.
- Playlist creation chunks at 100, `Try again` appends to the same `playlistId`, the browser never retries a 429
  itself; `/api/spotify/match` validates every field and caps at 10 items.
- Google: `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, feature scopes added per request,
  client secret in the body, `scope` merged across consents, Drive `drive.file` with a `TDJ` folder found-or-created,
  YouTube stops at the first `quotaExceeded` and reports `skipped` separately from `missing`. Quota arithmetic in the
  docs matches Google's table (search 100/day bucket, inserts 50 units).
- Dropbox: PKCE S256 with the verifier sealed in a cookie bound to the state, `token_access_type=offline`,
  `shared_link_already_exists` handled.
- Admin: scrypt N=16384 with NFKC, `timingSafeEqual` on both code and hash, `SameSite=Strict` 12 h session, setup
  code deleted on passphrase, cache cleared after every write, SSM `Overwrite:false` race for the cookie secret,
  `Test` never echoes a secret; the e2e suite asserts the response bodies contain none of the secrets.
- Cookies: all four sealed cookies together stay under 3 KB; `Secure` follows the public origin; `clear` headers use
  the same `Path`.

## Suggested order

P1-1 (owner, today) → P1-2 + P2-1 (small, security) → P1-3 (one helper, two files) → P1-4 + P1-5 (provider shapes)
→ P1-7 + P2-4 (shared key) → P1-6 + P2-2 + P2-8 (timeouts; raise `server.timeout` once) → P2-3, P2-5 → the rest.
