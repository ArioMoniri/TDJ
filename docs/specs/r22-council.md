# Round 22 — Engineering council: rooms, music data, self-deploy, AI edits, owner needs

Status: decided (2026-11-14), not built. Inputs read: CLAUDE.md, docs/ROADMAP.md (§0–12), docs/DEPLOY.md, `sst.config.ts`, `infra/*`, `.github/workflows/deploy-aws.yml`, `apps/web/src/lib/server/*`, `apps/web/src/app/api/ai/*`, [r22-apps-plan.md](r22-apps-plan.md), [r22-acp-plan.md](r22-acp-plan.md), [docs/APPLE_SETUP.md](../APPLE_SETUP.md), [docs/design/r22-ia.md](../design/r22-ia.md). Roadmap items covered: §3 (scraped data), §6 (connections, models), §12 (rooms, artwork, missing data, prompt editing, one-click self-deploy, no engineer-facing text).

How the council worked: the chair took three specialist seats in turn (realtime/backend, data sources, devops/self-deploy) and recorded each seat's dissent where it lost (§9). No sub-agent tool was available in this session, so these seats are review passes, not separate agents. Facts marked **(V#)** were not checked against a live source today. Each has a spike in §10 before code depends on it.

---

## 0. BLUF

| Topic | Decision | Cost | Main failure mode → answer |
|---|---|---|---|
| **Rooms** | A **server-sequenced semantic op log** in DynamoDB (one op language shared by manual edits, AI edits and undo). The Next function writes and validates every op with `@tdj/core`. **API Gateway WebSocket** carries push and presence only. No CRDT. | ≈ **$0.015 per room per 4-hour night** (5 people). **$0 when idle** (everything on-demand). | Concurrent edits to the same slot → precondition check, then a "keep theirs / use mine" prompt, never a silent overwrite. API Gateway's 2-hour connection limit → auto-reconnect and catch-up by `seq`. Wi-Fi drops in the booth → the night keeps playing from the local copy, and the queued ops rebase when the connection returns. |
| **Music data** | **Keyless sources are on by default:** Deezer (BPM, gain, cover, previews), MusicBrainz + Cover Art Archive (versions via *work*, ISRC, dates), iTunes Search (artwork, previews), the frozen AcousticBrainz dump (BPM and key by MBID, imported once), and **in-browser analysis of previews** (`packages/core/src/audio`, already 1,134 features cached). **Sources that need a key:** Spotify (owner app), Apple MusicKit (owner `.p8`), Discogs (owner token). **Link-out only, no scraping:** TangoTunes, tango.info, El Recodo. Every value is stored as a fact with its provenance in a new `Facts` table. Precedence: **DJ edit > owner edit > curated repo > ranked sources**. | $0 (all free tiers). Apple is covered by the existing $99 per year. | A source returns a wrong match (a reissue date read as the recording date, a half-tempo BPM) → each field is resolved by its own rules (§4.4), and the recording year is never overwritten by a release date. |
| **Playback** | Per-device source chain: **local files** (full mixing) → **Spotify** (Web Playback SDK on desktop; App Remote on iPad; Connect mode on Mac if spike S1 fails) → **Apple Music** (MusicKit JS on the web, native MusicKit in the apps) → YouTube (a visible player, emergency only). Deezer has **no** full-track path. **ISRC** is the bridge between providers, and Spotify playlists and exports stay first-class. | $0 for TDJ. Listeners need Premium or an Apple Music subscription. | A song is missing on the chosen source → a preflight resolves the whole night before it starts and marks gaps, and each song can fall back to another source with a warning about level and gap jumps. |
| **Self-deploy** | **Fork + one CloudFormation quick-create link + one paste (`AWS_DEPLOY_ROLE_ARN`) + "Deploy to AWS".** The stack provisions the web app, `Db`, `Rooms` and `Facts` tables, the WebSocket API, the enrichment cron and the SSM secrets. A **/setup wizard** inside the app replaces every env-var instruction, and engineer-facing UI text is removed (§5.4 lists the lines). | Idle ≈ $0–1 per month per deployment. | The OIDC provider already exists in the account → the quick-create parameter `CreateProvider=false`, with the stack error explained in the setup summary. The setup code expires → re-run the workflow. |
| **AI edits** | `POST /api/ai/edit` returns a **streamed list of typed `EditOp`s**, the same op language as rooms. The model emits *constraints* ("calmer", "a Fiorentino"), never song ids it invented. The engine resolves and validates them. Order: **no model first** (keyword parser) → small model → the DJ's main model only on ambiguity. ACP runs the same job through `/api/ai/prompt` and `/api/ai/parse`. | ≈ 2–3 k input and ≤ 300 output tokens per edit on a small model. | The model misreads the request → a diff preview before applying, one undo per entry, and an eval set in CI (≥ 90 % op-exact, 0 invalid ops applied). |
| **Owner needs** | §7: **required** = an AWS account and a GitHub repo. **Strongly recommended** = a Spotify developer app (Premium owner). **Optional** = Apple MusicKit key, Discogs token, Google/Dropbox apps, a shared model key, a domain. Every item is entered in-app at /setup except the role ARN, which goes in a GitHub variable. | | |

**Blocking fact found while reading the code:** `lib/server/db.ts` stores the database server-side only when `TDJ_DB_TABLE` is set. `sst.config.ts` provisions no DynamoDB table and the workflow does not set the variable, so **server storage is off in production today**. That is also why Settings shows "Set TDJ_DB_TABLE on the server…". Work item W1 (§8) provisions and links the table and removes the copy.

---

## 1. Ground truth (as of today)

- Stack: SST v4 `sst.aws.Nextjs` (OpenNext) on CloudFront, Lambda (arm64, 1,536 MB, 60 s) and S3. The config store is SSM Parameter Store `/tdj/<stage>/*` (`lib/server/config.ts`, 60 s cache), with `/admin` as the owner's setup (setup code → passphrase). OIDC deploy role from `infra/github-oidc-role.yaml` (PowerUserAccess plus IAM for SST).
- No other AWS resources: no DynamoDB, no WebSocket, no cron.
- Identity: an anonymous signed cookie `tdj_uid` (HMAC, derived from the cookie secret). Provider tokens live in sealed httpOnly cookies. BYOK model keys travel in request headers (`x-ai-provider`, `x-ai-key`) and are never stored.
- AI: `lib/server/llm.ts` makes one non-streaming `complete()` call for anthropic, openai, gemini and openrouter (25 s timeout). The `refine`, `review` and `swap` routes use JSON-in-text with `extractJson`. `refine` already has a keyword fallback and `refineWithGuard` (no shrinking of the night). Swap picks only from engine candidates. Both patterns are good and are reused below.
- Data caches in the repo: `data/cache/deezer/tracks.json` (692 tracks with `bpm`, `gain`, `release`), `data/cache/spotify/tracks.json` (953), `data/cache/audio/features.json` (1,134 analyses from previews: BPM, key, Camelot, loudness, intro). The index holds 21,932 recordings.
- `Tanda` has **no stable id**, only `index`. Rooms need ids that survive reordering (§3.3).

---

## 2. Shared foundation: one op language

Manual edits, room sync, AI edits and undo all speak **`Op`**. One validator and one applier live in a new `packages/core/src/ops.ts` (pure TypeScript, vitest). It is not a musical rule, so the 85-point golden set is unaffected, but the validator calls the existing tanda invariants.

```ts
type TandaId = string;               // stable, assigned when a doc is created (see §3.3)
type Op =
  | { t: "song.set";     tanda: TandaId; slot: number; songId: string; prev: string }     // prev = precondition
  | { t: "song.move";    from: [TandaId, number]; to: [TandaId, number]; songId: string }
  | { t: "tanda.replace"; tanda: TandaId; next: TandaSpec; prevHash: string }
  | { t: "tanda.insert"; after: TandaId | null; next: TandaSpec }
  | { t: "tanda.remove"; tanda: TandaId; prevHash: string }
  | { t: "tanda.move";   tanda: TandaId; after: TandaId | null }
  | { t: "tanda.flag";   tanda: TandaId; locked?: boolean; skip?: boolean; note?: string }
  | { t: "option.set";   key: keyof ComposeOptions; value: unknown }                       // last writer wins
  | { t: "night.regenerate"; seed: number; options: Partial<ComposeOptions>; result?: RoomDocPatch }
  | { t: "room.rename" | "room.lock" | "member.role" | "member.kick"; ... }               // owner only
  | { t: "undo"; of: number };                                                            // seq of the entry
```

- **Constraint ops** (from AI or a search) are a pre-stage: `{ t: "tanda.want", tanda, want: { energy?: "calmer"|"livelier"|number, orchestra?, singer?, rhythm?, years?, vocal? } }` and `{ t: "song.want", tanda, slot, want: {...} }`. The engine turns them into concrete `song.set` or `tanda.replace` ops using the existing swap and tanda builders. Only concrete ops are ever stored.
- **Validation tiers**: *hard* failures reject the op (rhythm mismatch inside a tanda, tanda size outside 3–5, the same recording twice in a night, an edit to an already-played tanda). *Soft* problems are accepted and reported as warnings on the log entry (orchestra or singer repeat gap, energy-arc deviation, a benchmark drop of more than 3 points).
- **Inverse**: every applied op stores its `inverse` (built from the actual before-state), which makes undo per entry possible (§3.5).

---

## 3. Rooms

### 3.1 Requirements restated
A named, renamable room with a shareable code. Several people edit one night live. A per-room activity log (who, what, when) with undo per entry, and a list of previous rooms with their logs. Identity is a username plus the room code, with no accounts, on both the apps and the web self-deploys. The owner can lock the room and kick members.

### 3.2 Options weighed

| Option | Fits the stack | Validation by engine | Offline | Idle cost | Verdict |
|---|---|---|---|---|---|
| **A. API Gateway WebSocket (push) + DynamoDB op log + writes through the Next function** | SST `sst.aws.ApiGatewayWebSocket`, `sst.aws.Dynamo` | **Yes**, the Next function already bundles `@tdj/core` and `data/` | queue + rebase | $0 | **Chosen** |
| B. AppSync Events (managed pub/sub WebSocket) + the same DynamoDB log | yes (CDK/Pulumi resource, not a first-class SST component) **(V1)** | yes, if writes still go through Next | same | $0 | Close second; switch if A's connection bookkeeping becomes a burden (§9 D1) |
| C. Yjs/Automerge CRDT over a relay (y-websocket on Fargate, or Lambda + `y-dynamodb`) | relay is always-on (≈ $9–15/month Fargate) or awkward on Lambda | **No**: merges are structural, so two concurrent inserts can create a 5-song vals tanda; validation would still need a server pass | **best** | ≥ $9 | Rejected (§9 D2) |
| D. Cloudflare Durable Objects / PartyKit | second cloud and second account for every self-deployer | yes | good | ~$0 | Rejected: one cloud per self-deploy |
| E. Polling only (`GET ops?after=seq` every 2 s) | trivial | yes | yes | $0 | Kept as the **fallback transport** when WebSockets are blocked |

### 3.3 Data model (DynamoDB table `Rooms`, on-demand, single table)

| pk | sk | Attributes |
|---|---|---|
| `code#<CODE>` | `room` | `roomId` (code → room lookup; rewritten when the owner rotates the code) |
| `room#<id>` | `meta` | `name`, `createdAt`, `lastActiveAt`, `seq` (head), `snapSeq`, `locked: "open"\|"no-joins"\|"read-only"`, `ownerMemberId`, `ownerKeyHash` (scrypt), `codeVersion`, `memberCount`, `keep` (owner pinned, exempt from retention) |
| `room#<id>` | `member#<mid>` | `username`, `role: owner\|editor\|viewer`, `color`, `joinedAt`, `lastSeenAt`, `kickedAt?` |
| `room#<id>` | `op#<seq, 10-digit>` | `mid`, `username` (copied, so the log survives renames), `at`, `op`, `inverse`, `warnings[]`, `summary` (human sentence, en + tr keys), `undoOf?`, `undoneBy?`, `source: manual\|ai\|engine`, `aiSource?` ("Claude Code · local") |
| `room#<id>` | `snap#<seq>` | the full `RoomDoc` (gzip + base64, ≤ 350 KB; above that, S3 under `rooms/<id>/<seq>.json.gz`) every 100 ops and at every `night.regenerate` |
| `room#<id>` | `conn#<connectionId>` | `mid`, `connectedAt`, `expiresAt` (TTL, 3 h) |
| `rl#<bucket>` | `<window>` | rate-limit counters (hashed IP or member id), TTL 1 h |

`RoomDoc = { name, playlist: Playlist, tandaIds: TandaId[], options, nightRules, played: { upTo: TandaId|null } }`. The `tandaIds` array runs in parallel with `playlist.tandas`, so the core `Tanda` type does not change. Ids are 8-character random strings minted when a room is created from a set or when a tanda is inserted.

**Write path** (`POST /api/rooms/<id>/ops`, inside the existing Next function):
1. Authenticate the member token, check the role and the lock state, and apply the rate limit.
2. Load the head (the latest snapshot plus the ops after it, cached per Lambda instance by `seq`).
3. Rebase: if `baseSeq < head`, re-check the op's preconditions against the head (semantic ops rebase trivially; failed preconditions → `409 conflict` carrying the current value and who changed it).
4. Apply and validate with `@tdj/core` (hard rules reject, soft rules warn).
5. `TransactWriteItems`: update `meta.seq = n` (condition `seq = n-1`), and put `op#n` (condition: it does not exist). On a lost race, retry from step 2 up to three times.
6. Fan out: query the `conn#` rows and `PostToConnection` the op (≤ 32 KB; a large `regenerate` result sends `{seq, refetch: true}`). Gone connections (410) are deleted.
7. Reply `{ seq, warnings }`, which the client uses to confirm its optimistic copy.

**WebSocket Lambda** (small, no catalogue): `$connect` takes a single-use 60-second ticket in the query string, issued by `POST /api/rooms/<id>/ticket` (no long-lived secret in URLs or access logs) and checks `Origin`. `$disconnect` deletes the `conn#` row. A `presence` route relays `{mid, view, focus: TandaId?, editing?: boolean}` to the room without storing it. The Next function gets `execute-api:ManageConnections` on the API.

### 3.4 Conflict model

| What | Rule |
|---|---|
| A song slot (`song.set`) | Precondition `prev`. If someone changed the slot first, the op is rejected and the client shows "Ana changed this 3 s ago · Keep hers / Use mine" ("Use mine" re-sends with the new `prev`). No silent last-writer-wins. |
| Tanda structure (replace, remove, move, insert) | Precondition `prevHash` (hash of the tanda's song ids and flags). Moves have no precondition: they are applied in `seq` order and both people see the final order. |
| Locks, skip, note | Per flag, last writer wins, logged. |
| Options and night rules | Per key, last writer wins, logged. The log shows both values. |
| `night.regenerate` | Touches only unlocked, unplayed tandas. **Tandas another member is editing right now (presence `editing`, ≤ 30 s old) count as locked.** When other members are online, a confirmation sheet names them. |
| The playing tanda | Only the **booth device** (the member who pressed Play the night) may edit it. Others send a *proposal* that the booth accepts or declines with one tap. Played tandas are frozen (hard reject). |
| Room settings, members | Owner only. |

### 3.5 Activity log and undo
- The log tab is a reverse-chronological list: avatar dot, username, sentence ("Ana swapped *Remembranza* → *Mandria* in tanda 7"), relative time, warning chips, and an **Undo** button. Filters: person, tanda, AI only. Export as JSON or CSV.
- **Undo #n** sends `{t:"undo", of:n}`. The server applies `inverse(n)` with precondition "the current state equals op n's after-state for the touched paths".
  - Clean → it is applied and logged as "Ario undid #n". `op#n.undoneBy` is set, and the entry is shown struck through.
  - Not clean (someone edited the same place since) → `409` with the blocking entries. The client offers "Undo anyway (overwrites Ana's change to tanda 7)" or Cancel. "Undo anyway" is a normal op with a fresh precondition.
  - Undoing a `regenerate` restores the affected tandas from the before-state stored in its inverse.
- Redo is undo of an undo.

### 3.6 Presence
Coloured name chips in the header (glass control layer), a dot on the tanda each person has in focus, an "editing…" shimmer on that tanda, and the booth device marked ▶. Presence is never written to DynamoDB.

The client sends presence on change, at most once per second, plus a 5-minute heartbeat. The API Gateway idle timeout is 10 minutes and the **maximum connection time is 2 hours (V2)**, so the client reconnects transparently before then and catches up with `GET ops?after=seq`.

### 3.7 Offline
- The client keeps `RoomDoc`, `seq` and the pending ops in IndexedDB (Keychain-backed storage is not needed: nothing here is secret apart from the member token, which goes in the Keychain in the apps).
- Offline edits apply optimistically and queue. On reconnect: fetch the ops after `seq`, then re-send each pending op. Conflicts appear in a "3 changes need a look" sheet.
- **The booth never depends on the network**: playback runs from the local doc. Room ops that arrive late reorder only tandas that have not started yet.

### 3.8 Identity, security, abuse

| Concern | Rule |
|---|---|
| Room code | 8 characters from a 31-symbol alphabet with no look-alikes (`XXXX-XXXX`, ≈ 39.6 bits). It is shown as a code, a QR and a link `https://<server>/r/<CODE>`. Typing a code in the apps uses the app's current server; the link and QR carry the server, so a self-deploy's code works from the app. The owner can **rotate** the code (old links stop working, members stay). |
| Joining | Username (1–32 characters, NFC, trimmed, unique per room; collisions get "·2") plus the code → a **member token** (HMAC over `roomId.mid.role.iat`, key derived with HKDF from `TDJ_COOKIE_SECRET`, label `rooms`). Stored in the Keychain (apps), or IndexedDB plus the server-side `tdj_uid` row (web), which is what makes "previous rooms" work. |
| Owner | Creating a room returns an **owner key** (shown once, stored with the token, and offered as a "recovery code" to type on another device). Owner actions: rename, lock (`no-joins` or `read-only`), rotate the code, change roles, **kick** (sets `kickedAt`, closes the member's connections with `DeleteConnection`, rejects the token from then on), delete the room. |
| What a username is | A display label, not authentication. The log says so in its info popover. Members are told apart by a colour and a join time. |
| Rate limits | Join: 10 per minute per hashed IP, 30 per hour per code (then the code needs the owner to unlock it). Room creation: 5 per hour per IP. Ops: 10 per second, burst 30, per member. Presence: 1 per second. API Gateway stage throttle: 100 rps, burst 200. Members ≤ 16 per room. Op body ≤ 32 KB. Active rooms per deployment ≤ `ROOMS_MAX_ACTIVE` (default 200, set in /setup). |
| Transport | `guard.ts` same-origin on HTTP. The WebSocket `$connect` checks `Origin` (the app origin plus the Tauri origins from r22-apps-plan §3.1) and the single-use ticket. |
| Privacy | No e-mail. IPs exist only as hashed rate-limit keys with a 1-hour TTL. AI edits record the source label, never a key. |

### 3.9 Previous rooms and retention
- **Previous rooms**: Settings → Rooms (and Compose → Room ▾) lists the rooms this device or browser has joined: name, last activity, members, your role. A room opens read-only when it is locked or when you were removed. It is backed by the `tdj_uid` row on the web (`rooms: [{roomId, mid, token}]`) and by the Keychain in the apps.
- **Retention**: a daily `sst.aws.Cron` sweeper deletes rooms whose `lastActiveAt` is more than `ROOMS_RETENTION_DAYS` ago (default 180) unless the owner set `keep`. It batch-deletes all items for the room and the S3 snapshots. Per-item TTL is not used for ops, because it would expire early log entries before later ones. The log is capped at 10,000 ops per room (the oldest ops are folded into a snapshot, with "earlier history compacted" shown in the log).

### 3.10 Cost per active room (us-east-1 list prices, V3)
Assumptions: 5 connections for 4 hours, 400 ops, about 1,000 presence changes, 2 reconnects per client.

| Item | Volume | Cost |
|---|---|---|
| API Gateway WebSocket messages ($1.00 per million) | ≈ 400×5 fan-out + 1,000×5 presence + heartbeats ≈ 7.5 k | $0.0075 |
| Connection minutes ($0.25 per million) | 1,200 | $0.0003 |
| Next Lambda for op writes (1.5 GB, ~300 ms) | 400 × 0.45 GB-s | $0.0024 |
| WebSocket Lambda (256 MB, ~20 ms) plus requests | ≈ 7 k invocations | $0.0018 |
| DynamoDB on-demand (transactions cost 2×) | ≈ 3.2 k WRU + 1 k RRU | $0.0021 |
| Storage (≈ 1 MB per room) | | < $0.001 per month |
| **Total** | | **≈ $0.015 per room-night**. 100 room-nights per month ≈ $1.50. Idle = $0. |

### 3.11 Failure modes

| Failure | Effect | Answer |
|---|---|---|
| WebSockets blocked (venue Wi-Fi, proxy) | no push | fall back to polling every 2 s (transport E). The UI shows "Live updates slow". |
| A Lambda cold start during an edit | ~1–2 s delay | optimistic local apply; a spinner on the log entry only |
| Hot room write race | 409 or a retry | rebase loop (3 retries), then a conflict sheet |
| A regenerate result over 32 KB | the push frame is too large | the push carries `refetch`; clients `GET snap` |
| Server unreachable during a night | no sync | booth plays on; ops queue; sync on return |
| The owner loses the owner key | cannot lock or kick | recovery code; the deployment owner can transfer ownership from /admin |
| Code leaked publicly | strangers join | lock `no-joins`, rotate the code, kick |

---

## 4. Music and metadata beyond Spotify; playback

### 4.1 Source evaluation

| Source | Gives | Coverage for golden-age tango (to measure in D1) | Key / account | Limits | Terms that matter | Decision |
|---|---|---|---|---|---|---|
| **Spotify Web API** | ids, ISRC (`external_ids`), album art, release date (of the *reissue*), playlists | high for popular reissues (953 cached) | owner app (client id + secret); user OAuth for playback and playlists | rolling-window limit; Development Mode seat cap (5 per DEPLOY.md since Feb 2026; the brief says 25, **check the dashboard, V4**) | `audio-features` and `preview_url` are **not available to new apps since Nov 2024**, so no BPM or key from Spotify. Show art unaltered with a link back. Do not cache content beyond what the terms allow (store URLs, not image bytes). | Keep, for ids, art and export |
| **Deezer public API** | `bpm`, `gain` (dB), `release_date`, covers up to 1000 px (`cover_xl`), 30 s preview, ISRC lookup (`/track/isrc:<ISRC>`) | good on European reissue labels (692 cached). `bpm` is often **0 or half/double** on old masters | **none** for public reads | ≈ 50 requests per 5 s per IP **(V5)** | non-commercial use, attribution. New app registration for OAuth may be closed **(V6)**, which only affects writing playlists | **On by default**: BPM and gain candidates, covers, previews |
| **MusicBrainz** | recordings → **work** (groups alternate versions), ISRC, artist credits (orchestra + singer), first-release dates, sometimes recording dates | medium. Strong for popular orchestras, gaps for minor ones | none. A meaningful **User-Agent** with a contact URL is required (use `TDJ/<version> (+<deployment URL>)`, never a personal e-mail) | **1 request per second** per IP | core data CC0 | **On by default** (server cron only, to respect 1 per second) |
| **Cover Art Archive** | front covers by release MBID | follows MusicBrainz releases | none | generous; redirects to archive.org | images carry their uploaders' rights; display with attribution | **On by default**, as an art fallback |
| **iTunes Search API** | artwork (scalable URL, ≥ 600 px), 30 s previews, release dates, Apple ids | high for reissues sold on iTunes | none | ≈ 20 requests per minute **(V7)** | link back to Apple, previews for promotion | **On by default** (art and previews; already a `ResolvedTrack` provider) |
| **AcousticBrainz dumps** | BPM, key/scale, loudness and more, by MBID | whatever was submitted before 2022. Spotty for tango, but free and offline | none | frozen since 2022 | CC0 | **Import once** into `data/cache/audio/acousticbrainz.json` (a script filtered to the MBIDs of our recordings). It is a candidate, never a winner over our own analysis. |
| **Discogs API** | release dates, labels, catalogue numbers, matrix and transfer info (useful for the "transfer tier" in ROADMAP Phase 1), images | good for 78 rpm and LP reissues | personal access token (owner), free | 60 per minute authenticated, 25 unauthenticated | show "Data provided by Discogs" with a link. Images need an authenticated fetch; do not hotlink or store bytes **(V8)** | **Optional connector** (owner token) |
| **Apple MusicKit** (Apple Music API + MusicKit JS / native) | catalogue ids, ISRC, artwork, release dates, previews; **full-track playback for subscribers** | high for reissues | owner MusicKit key (`.p8`, Key ID, Team ID) to sign developer tokens (ES256 JWT, ≤ 6 months); a user token per listener | not published **(V9)** | Apple Music identity guidelines; no audio processing of DRM streams | **Optional connector**; also a playback source (§4.5) |
| **YouTube Data API** | video ids for export and emergency playback | high (uploads of everything) but noisy | Google Cloud project (exists for Drive and YouTube OAuth) | 10 k units per day; `search.list` = 100 units | IFrame player must stay visible; no extracting audio, no background play, no Web Audio processing | Keep for export; playback only as a last resort |
| **TangoTunes** | the best transfers (bought by the DJ) | n/a | store account | no public API | no scraping | **Through local files only** (read their embedded tags). Link out to the shop. |
| **tango.info** | TIN/TINT ids, recording dates, singers | very high | none | no API | site content is not openly licensed **(V10)** | **Link-out only.** Ask permission before any import (an owner decision, §7). |
| **El Recodo** | recording dates, singers, the reference DB of the community | very high | none | no API | personal use **(V10)** | **Link-out only.** The ROADMAP Phase 4 "import from El Recodo links" becomes "paste a link → we read the title and orchestra from the URL text and match locally". |
| **In-browser analysis** (`packages/core/src/audio/dsp.ts` `analyzePcm`) | BPM (with candidates), key, Camelot, loudness, range, intro, energy | every song with a preview (Deezer, iTunes) or a local file | none | the client's CPU; ~0.3 s per 30 s preview | facts derived from a preview; store features, not audio | **On by default**; full-file analysis for local files in the Booth |

### 4.2 How the data lands in the database
New DynamoDB table **`Facts`** (on-demand), linked to the Next function:

| pk | sk | Attributes |
|---|---|---|
| `song#<tdjId>` | `src#<source>` | `fields: { bpm?, key?, gainDb?, artwork?, releaseDate?, isrc?, mbid?, workMbid?, ids: {spotify?, deezer?, apple?, youtube?, discogs?} }`, `match: {query, confidence}`, `fetchedAt`, `etag?` |
| `song#<tdjId>` | `resolved` | the computed winning values per field with their source (written by the resolver after any change) |
| `work#<workMbid>` | `song#<tdjId>` | version grouping (Music → Songs "versions together", IA §8.1) |
| `queue#enrich` | `<priority>#<tdjId>` | the enrichment backlog |

- **Server-side, keyless sources** (Deezer, MusicBrainz, CAA, iTunes, Discogs with the owner token, Apple with the owner key): a `sst.aws.Cron("Enrich")` every 15 minutes takes a bounded batch from `queue#enrich`, respecting each source's rate limit (MusicBrainz 1 per second, so ≈ 800 per run). Songs in the golden set and in recent nights are queued first. The repo's committed caches seed `Facts` at first deploy (a one-time import Lambda), so a new self-deploy starts with the same coverage as `data/cache`.
- **Client-side sources** (Spotify with the DJ's token, Apple with the DJ's user token, in-browser analysis): the client posts **facts, never tokens**, to `POST /api/facts` (same-origin, rate-limited, size-capped). They are stored with `src#analysis:<tdj_uid-hash>` so that one DJ's bad analysis cannot override others until it agrees with a second source.
- **Precedence per field** (implemented in `packages/core/src/facts.ts`, tested):
  1. the **DJ's own edit** (`AppOverrides.songs[id]`, already exists; "the DJ's edit wins", ROADMAP §3), always;
  2. the **owner's edit** (a new instance-wide overrides row, editable from Music by the owner);
  3. the **curated repo** values (`data/index`, `data/knowledge`) for musical fields (year, orchestra, singer, energy);
  4. ranked sources, per field:
     - BPM: full-file analysis > preview analysis (pulse clarity ≥ 0.6) > Deezer (non-zero, octave-corrected to the 50–75 / 100–150 tango range) > AcousticBrainz;
     - key: analysis (confidence ≥ 0.6) > AcousticBrainz;
     - gain: full-file BS.1770 > Deezer `gain` > preview analysis;
     - artwork: DJ pick > Spotify > Apple > Deezer `cover_xl` > CAA > iTunes > the **orchestra placeholder** (a generated monogram per orchestra, shipped in the repo);
     - release date: shown as "reissue: 2006 (Deezer)". **The recording year in the index is never replaced by a release date.** MusicBrainz first-release dates before 1960 may *suggest* a year correction, shown to the owner as a review item, never auto-applied.
- **Refresh**: a fact older than 90 days is re-queued at low priority. A source can be disabled per deployment (its facts are hidden, not deleted). The Music → Info panel shows every candidate value with its source and a "use this" button (which writes a DJ edit).
- **Artwork bytes**: store URLs and let browsers cache them. Proxy and cache bytes (S3 + CloudFront path `/art/*`) **only** for CAA and the placeholders, because the Spotify, Apple and Deezer terms favour linking.

### 4.3 "Connect a source" (Settings → Connections → Sources)
A new group under IA §10.1 Connections:

```
SOURCES FOR SONG DATA                                     [?]
 [●] Deezer            on · fills BPM, gain, covers, previews        [⋯]
 [●] MusicBrainz       on · versions, dates, ISRC                   [⋯]
 [●] iTunes            on · artwork, previews                      [⋯]
 [●] Analyse previews  on · BPM and key in this browser            [⋯]
 [○] Spotify           Connect · ids, artwork, export (account)
 [○] Apple Music       Set up on this server (owner)  ·  Connect (you)
 [○] Discogs           Set up on this server (owner)
 + Add a source …       (shows the list above with "what it fills" and "needs")
 Coverage: artwork 82 % · BPM 64 % · key 51 % of the songs in your nights   [Fill missing now]
```

- Owner-level sources (Discogs, Apple MusicKit) show **Set up** only to the owner (a passphrase session) and lead to /setup. DJs see "Not set up on this server · ask <OWNER_CONTACT>", never secret names.
- "Fill missing now" queues the songs of the current night with priority and runs preview analysis in the browser while the page is open (a Web Worker, 2 at a time).

### 4.4 Matching rules (all sources)
Query = orchestra surname + title + singer, normalised (accents, "Orquesta Típica", "y su Orquesta"). Accept when title similarity ≥ 0.85, the orchestra matches, and the duration is within ±12 s of the index when known. ISRC, once found from any source, drives exact lookups on the others (Deezer `isrc:`, Apple `filter[isrc]`, Spotify `isrc:` search). Every match has `confidence`. Matches below 0.85 go to the DJ's "Find on services" review (the existing `ResolveSheet`).

### 4.5 Playback when Spotify cannot

| Source | Web desktop | macOS app (WKWebView) | iPad app | Fades, gain, gaps | Notes |
|---|---|---|---|---|---|
| **Local files** | ✔ (File System Access on Chromium, `webkitdirectory` fallback) | ✔ `tdj-folder` plugin | ✔ `tdj-folder` (security-scoped bookmarks) | **full** (Web Audio, BS.1770) | the recommended floor source; TangoTunes purchases live here |
| **Spotify** | ✔ Web Playback SDK (Premium) | spike S1. If it fails: **Connect mode**, where TDJ drives the Spotify desktop app through Web API `/me/player` | **App Remote** (iOS SDK, `tdj-spotify` plugin; the Spotify app plays) | none in Connect/App Remote (Spotify's own crossfade setting); gaps ±0.5 s by polling | dev-mode seat cap applies to every listener login |
| **Apple Music** | MusicKit JS v3 (subscriber) | native MusicKit (`ApplicationMusicPlayer`) through a new `tdj-applemusic` plugin, because MusicKit JS DRM in WKWebView is unverified **(V11)** | native MusicKit | volume ramps on the web (MusicKit JS `volume`); none native; no gain analysis of DRM audio (use the facts `gainDb`) | needs the MusicKit App Service on the App ID and `NSAppleMusicUsageDescription` |
| **Deezer full tracks** | ✘ | ✘ | ✘ | — | no public full-track playback for third parties (the JS SDK player was retired, **V6**). Previews only. |
| **YouTube** | IFrame player, visible | same | same | none (no Web Audio on a cross-origin iframe) | ads, quality varies; labelled "emergency source" |

- **Per-night source plan**: before "Play the night", a preflight resolves every side on the DJ's chosen chain (for example *local → Apple → Spotify*), shows "23 of 25 tandas fully local, 2 songs from Apple Music", and lets the DJ fix gaps. Switching sources mid-tanda is allowed with a warning chip (a level jump, and the gap is not sample-accurate).
- **Spotify compatibility stays first-class**: the night stores the TDJ song id plus every resolved id, so export to Spotify, M3U8, Rekordbox and Traktor is unchanged. Importing a Spotify playlist maps URIs → TDJ ids (`/api/spotify/match`), and ISRC lets the same night play from Apple or local files.

---

## 5. One-click self-deploy and first-run setup

### 5.1 Flow (what a self-deployer does)
1. **Fork** `ArioMoniri/TDJ` (or "Use this template" for a private copy; §9 D5).
2. Fork → **Actions → enable workflows** (GitHub disables them on forks) → run **"Set up TDJ"** (new `setup.yml`, no AWS needed). Its summary shows:
   - a **Launch Stack** quick-create link, pre-filled: `https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateURL=<S3 URL of github-oidc-role.yaml>&stackName=tdj-github-oidc&param_GitHubOrg=<owner>&param_GitHubRepo=<repo>&param_CreateProvider=true`. CloudFormation requires `templateURL` on S3, so a `publish-template.yml` workflow uploads each released template version to a public-read object in the project's bucket (pennies).
   - "After the stack says CREATE_COMPLETE, copy its **RoleArn** output and paste it as the repository variable `AWS_DEPLOY_ROLE_ARN`" (one link to the variables page, plus the equivalent `gh variable set` line). **This single paste is the irreducible trust step.**
3. Run **"Deploy to AWS"** (or push to `main`; "Sync fork" then redeploys automatically). The summary shows the URL, the **setup code**, and a QR "Open in TDJ for Mac/iPad" (`tdj://server?url=…`).
4. Open the URL → **/setup** (§5.3). Nothing else touches GitHub or AWS again.

Updates: "Sync fork" → push to `main` → redeploy. Tear-down: a new `remove.yml` (workflow_dispatch, type the stage name to confirm) → `sst remove`. Production tables are `retain`, so the summary names them for manual deletion if wanted.

### 5.2 What the stack provisions (changes to `sst.config.ts`, W1–W3)
- `sst.aws.Dynamo("Db")` (pk) → **linked**, so `TDJ_DB_TABLE` is set automatically. This fixes the blocking fact in §0.
- `sst.aws.Dynamo("Rooms")` (pk + sk) and `sst.aws.Dynamo("Facts")` (pk + sk), on-demand, point-in-time recovery on in production.
- `sst.aws.ApiGatewayWebSocket("Live")` with `$connect`, `$disconnect` and `presence` handlers. Its URL is passed to the web app (`TDJ_LIVE_URL`); the Next function gets `execute-api:ManageConnections`.
- `sst.aws.Cron("Enrich")` every 15 minutes, `sst.aws.Cron("Sweep")` daily (room retention, stale facts).
- `sst.aws.Bucket("Media")` for oversized snapshots and the CAA/placeholder art cache.
- SSM: everything generated on first use (the cookie secret exists; the room token key is derived), plus a setup code by the workflow. **No env var is required.** The GitHub secrets path stays as an optional override (environment wins, as today).
- IAM: the existing OIDC role already covers this (PowerUserAccess). Narrowing it is §9 D6.

### 5.3 First-run inside the app
**Owner, /setup** (replaces the paste-the-code form of /admin; /admin stays as the "Server" page afterwards):

```
Set up your TDJ                                     step 2 of 6
 ✓ Server ready          https://d…cloudfront.net · database ✓ · rooms ✓ · settings store ✓   (checked live)
 ● Owner passphrase      ••••••••        [Save]
 ○ Spotify               1 Open developer.spotify.com ↗   2 Copy these redirect addresses [Copy all]
                         3 Paste Client ID + secret   [Test]   · listener seats: add DJs by e-mail there
 ○ Apple Music (opt.)    Upload AuthKey_XXXX.p8 · Key ID · Team ID   [Test]
 ○ Song data sources     Deezer ✓  MusicBrainz ✓  iTunes ✓  Discogs (token) …
 ○ AI for everyone (opt.) provider · key · daily limit per DJ   [Test]
 ○ Apps                  [QR] scan with TDJ on iPad / open on Mac
                                                   [Skip for now]   [Continue]
```
Each row is green when tested, and "Test" proves the credential (the existing `/api/admin/test`). New keys are added to `CONFIG_KEYS`: `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY`, `APPLE_TEAM_ID`, `DISCOGS_TOKEN`, `SOURCES_DISABLED`, `ROOMS_MAX_ACTIVE`, `ROOMS_RETENTION_DAYS`.

**DJ first run** (any device, skippable, 4 cards): your name (used in rooms) · language (English/Türkçe) · how you play (local folder / Spotify / Apple Music / just compose) · AI (paste a key, connect a local agent through ACP, or "engine only"). Keys go to the browser or the Keychain, never the server (CLAUDE.md).

### 5.4 Engineer-facing text to remove (exact lines found today)

| Where | Now | Becomes |
|---|---|---|
| `apps/web/src/app/settings/page.tsx:552` | "Set TDJ_DB_TABLE on the server to keep the database and memory across devices." | "Saved on this server and in this browser." (or, local dev only: "Saved in this browser.") |
| `apps/web/src/app/api/db/route.ts:12` | `hint: "Set TDJ_DB_TABLE (and TDJ_SECRET)…"` | no hint; the table always exists after W1 |
| `apps/web/src/components/Connectors.tsx:294,297` | "…the owner adds ${secrets} as described in docs/DEPLOY.md → Connectors" / "How to enable · docs/DEPLOY.md" | DJ: "Not set up on this server yet · ask <contact>"; owner: **Set up** → /setup |
| `apps/web/src/app/settings/page.tsx:133,521,545` | the always-visible Workspace ID field and its copy | hidden. It appears only after Test returns "workspace required", with: "This key belongs to an organisation workspace. Paste the workspace ID shown beside the key in the Anthropic console." |
| `apps/web/src/app/admin/page.tsx:836,954` | "Workspace ID… organisation level", "(the CloudFront URL)" | owner-facing, so it may stay in /setup, reworded ("this server's address") |
| `apps/web/src/components/Connectors.tsx:463,526,527` | "paste its Client ID under Advanced… PKCE…" | moved under Advanced → "Use my own Spotify app", in plain words |
| `apps/web/src/lib/server/llm.ts:214` | "Add one in Settings → Written reviews." | "Add one in Settings → Models." (IA §10.2 rename) |

Guard against regressions: a vitest scan of `apps/web/src/{app,components}/**/*.tsx` string literals, excluding `/admin` and `/setup`, for `/TDJ_[A-Z_]+|docs\/|\.md\b|Lambda|DynamoDB|Parameter Store|SSM|environment variable|PKCE|CloudFront/`, plus the same check in the Playwright acceptance pass (IA §12).

### 5.5 Failure modes

| Failure | Answer |
|---|---|
| The OIDC provider already exists → stack fails `AlreadyExists` | the setup summary offers a second link with `CreateProvider=false`, and the error text is quoted in the summary |
| An AWS Organizations SCP blocks IAM or a region | the deploy summary names the denied action; docs give the minimal policy (`infra/agent-deploy-user-policy.json`) |
| First CloudFront deploy takes 10–15 min | the summary says so; the setup page polls `/api/health` |
| The setup code expires (24 h) | re-run the workflow (existing behaviour) |
| A forked repo with Actions disabled | the README's first line in the fork says "Enable Actions" |
| An OIDC `sub` claim format change | the trust policy already lists both forms |

---

## 6. AI editing in Compose by prompt (API keys and ACP identically)

### 6.1 Contract
`POST /api/ai/edit` (same-origin guard, BYOK headers or the shared key, counted like refine):

```ts
// request
{ instruction: string;                    // ≤ 600 chars, en or tr
  doc: { playlist: Playlist; tandaIds: string[]; options: Partial<ComposeOptions>; played?: TandaId|null };
  selection?: { tanda?: TandaId; slot?: number };   // "this tanda" / "the 2nd song" resolve against it
  room?: { id: string; baseSeq: number };           // when editing a room
  mode?: "fast" | "careful" }                       // small model vs the DJ's main model
// response: NDJSON stream, one line per event
{ e: "plan", ops: WantOp[], say: string }         // the model's constraint ops (or the parser's)
{ e: "op", op: Op, preview: OpPreview }           // each concrete, validated op (before → after, warnings)
{ e: "reject", want: WantOp, why: string }        // a constraint the engine could not satisfy ("no Fiorentino vals in your eras")
{ e: "ask", question: string, options: string[] } // ambiguity: one clarifying question instead of a guess
{ e: "done", source: "keywords"|"model"|"agent", model?: string, ms: number, scoreBefore: number, scoreAfter: number }
```

- The model is given a **compact doc** (≈ 1.5–2.5 k tokens): per tanda the id, rhythm, orchestra/singer, years, mean energy, lock/skip/played, and per song the id, title, year, energy, BPM. It also gets the op schema, the house rules and the learned preferences (`summarizeMemory`). The static system prompt is prompt-cached where the provider supports it.
- The model outputs **only `WantOp`s** (constraints plus the targets "tanda 7", "song 2"). It never outputs a song id except one copied from the doc (for moves). The engine resolves `want`s with the existing swap and tanda builders and candidate rankers, validates them (§2) and applies `refineWithGuard`-style length and score guards. **Accuracy comes from the engine, not from the model's knowledge of the catalogue.**
- Structured output: provider-native schemas where available (Anthropic tool use with an input schema; OpenAI/OpenRouter `response_format: json_schema`; Gemini `responseSchema`), otherwise `extractJson` with one repair re-prompt.
- **Apply**: the client shows the diff (struck-through song → new song, energy-bar change, score 88 → 90). "Apply" sends the concrete ops as normal ops (in a room: logged as "Ana · AI (Claude Code · local)", each undoable). A setting "Apply AI edits without preview" is off by default.

### 6.2 Latency budget (small model first, no model before that)

| Stage | Budget | Notes |
|---|---|---|
| 0. Keyword parser (existing `feedbackFromText` + refine fragments, extended to "tanda N", "song N", "calmer/livelier", "a <orchestra>", "swap", "lock", "skip", en + tr) | ≤ 50 ms | when every fragment parses, **no model call at all** |
| 1. Intent → `WantOp`s on a **small model** (the provider's fast tier: Anthropic Haiku-class, OpenAI mini, Gemini Flash; the DJ can change it in Models) | time to first op ≤ 0.8 s, done ≤ 1.5 s (≤ 300 output tokens) | streamed; the client previews the first op as soon as it arrives |
| 2. Engine resolve + validate | ≤ 150 ms per op | in the Next function, catalogue warm |
| 3. Optional taste pick among ≥ 2 equal candidates (only in `careful`) | + ≤ 1.5 s | the same pattern as `/api/ai/swap` |
| 4. Apply / broadcast | ≤ 300 ms | room op path §3.3 |
| **BYOK total** | **p50 ≤ 2 s, p95 ≤ 4 s** | escalate to the main model only on a parse failure or an `ask` |
| **ACP total** | **p50 ≤ 6 s, p95 ≤ 15 s** (warm session) | agents run their own loop; Test shows the timing |

Streaming on Lambda: OpenNext response streaming through SST is assumed **(V12)**. If it is not available, the route returns the whole (small) result at once and the budget still holds for BYOK.

### 6.3 ACP used exactly like an API, for every generation
- Every AI job (`review`, `refine`, `swap`, `edit`, and later `compose-notes`) is restructured into three pure steps: **`prompt(kind, payload) → {system, prompt, schema}`** → **transport** → **`parse(kind, text) → validated result`**. The BYOK routes call `complete()` in the middle. The ACP path calls `/api/ai/prompt`, sends `system + prompt` as one `session/prompt` through the bridge or plugin (r22-acp-plan §3), and posts the collected text to `/api/ai/parse`. **Same prompt builders, same parser, same engine validation, by construction.** Test: for a recorded model answer, the BYOK route and `parse` return byte-identical results.
- The client has one `AiSource` interface (`run(kind, payload): AsyncIterable<Event>`) with `ServerKey`, `SharedKey`, `Acp` and `EngineOnly` implementations, chosen per job by the "Use for" pickers (r22-acp-plan §6). For `edit`, the ACP transport parses `WantOp`s incrementally from the agent's message chunks (NDJSON lines), so previews stream in the same way.
- **Warm sessions**: one ACP session per agent per job kind, opened at connect time. Each prompt carries the full state (stateless semantics), so reuse cannot leak a previous night's context into the reply. The session is renewed after 20 prompts or 30 minutes. Schema compliance for agents comes from instructions plus one repair re-prompt in the same session.
- Rooms: an agent on one member's Mac edits the room **as that member** (their token, attributed "AI via ACP"). No agent runs on the server (r22-acp-plan §3B).

### 6.4 Accuracy gate
`apps/web/src/lib/ai/edit.eval.ts`: 80 instructions (en + tr), each with expected `WantOp` types and targets and a fixture night. It runs in CI against **recorded** model answers (deterministic) and asserts the parser and engine never apply an invalid op. Metrics: op-exact ≥ 90 %, target-exact ≥ 95 %, 0 hard-invalid ops applied. A weekly label-gated job re-records with live keys (optional owner secret `EVAL_ANTHROPIC_API_KEY`). Tests come first (docs/TDD.md). The default 4-hour golden set must stay ≥ 85 after the eval's "make the night livelier" class of edits (warn, never auto-apply below 85).

---

## 7. What the owner needs and how to get each item

Legend: **R** required · **S** strongly recommended · **O** optional. "Goes to" means where the value is entered. `/setup` means in-app, saved to SSM on that deployment.

### 7.1 Hosting (owner's production and every self-deployer)

| # | Item | Where to create | Cost | Goes to | Without it |
|---|---|---|---|---|---|
| H1 **R** | AWS account | aws.amazon.com → Create account (card, MFA on root) | idle ≈ $0–1 per month; rooms ≈ $0.015 per room-night; CloudFront and Lambda in free tiers at small scale | — | no AWS hosting (Docker path, DEPLOY.md §C, without rooms) |
| H2 **R** | GitHub account + the fork | github.com → Fork `ArioMoniri/TDJ`; enable Actions | free (public repo; macOS minutes only for app releases) | — | `pnpm deploy` from a terminal with AWS keys |
| H3 **R** | Deploy role | the quick-create link in the "Set up TDJ" summary (CloudFormation, ~1 minute) | free | GitHub **variable** `AWS_DEPLOY_ROLE_ARN` | nothing deploys |
| H4 O | Region | — | — | variable `AWS_REGION` (default `us-east-1`) | us-east-1 |
| H5 O | Custom domain | Route 53 (or any registrar + hosted zone) | ≈ $10–15 per year + $0.50 per month | variable `TDJ_DOMAIN`; add the same redirect paths under the domain at every provider | the CloudFront address |
| H6 **R** (once) | Owner passphrase | /setup, using the setup code from the deploy summary | — | SSM (scrypt hash) | /admin stays locked |
| H7 (owner of the upstream repo only) | Public bucket for the quick-create template | `publish-template.yml` creates it on the first release | pennies | repository variable `TDJ_TEMPLATE_BUCKET` | self-deployers fall back to CLI `aws cloudformation deploy` |

### 7.2 Music services and data

| # | Item | Where | Cost | Goes to | Without it |
|---|---|---|---|---|---|
| M1 **S** | **Spotify developer app** | developer.spotify.com/dashboard → Create app. APIs: *Web API*, *Web Playback SDK*, *iOS* (for the iPad app). **Redirect URIs, exactly:** `https://<app url>/api/spotify/callback`, `https://<app url>/callback`, `http://127.0.0.1:3000/api/spotify/callback`, `http://127.0.0.1:3000/callback`, `tdj://spotify-callback` (apps); add the same two https paths under `TDJ_DOMAIN` if used. iOS bundle ID = `TDJ_APP_BUNDLE_ID` (APPLE_SETUP.md §7). | free; **the owner must hold Premium** (≈ $12 per month) for Development Mode, and every listener who plays in TDJ needs Premium | /setup → Spotify (or secrets `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`) | DJs use "my own Spotify app" (BYO client id + PKCE), local files, Apple Music or previews; export via CSV to TuneMyMusic or Soundiiz |
| M2 decision | **More listeners than the seat cap** | Dashboard → User Management: add each DJ's Spotify e-mail (cap: 5 per DEPLOY.md since Feb 2026; the brief says 25, **check the number shown in your dashboard**). **Extended Quota Mode** is granted only to organisations (a registered business; Spotify's 2025 criteria also ask for a launched service with ≈ 250 k monthly users, **V4**), so it is realistically unavailable. | — | — | **Decision: rely on self-deploy.** Each deployment registers its own Spotify app with its own seats. Venues with more DJs use the BYO-app path. |
| M3 O | **Apple MusicKit key** (Apple Music playback, catalogue, art) | developer.apple.com → Certificates, IDs & Profiles → **Keys** → + → enable **MusicKit** (choose or create a *Media ID*) → download `AuthKey_<KeyID>.p8` (once only). For the apps: Identifiers → the App ID → **App Services → MusicKit**. Team ID as in APPLE_SETUP.md §1. | included in the $99 per year | /setup → Apple Music: `.p8`, Key ID, Team ID (SSM `APPLE_MUSIC_PRIVATE_KEY`, `APPLE_MUSIC_KEY_ID`, `APPLE_TEAM_ID`) | no Apple Music playback; iTunes Search still gives art and previews |
| M4 O | **Discogs token** | discogs.com → Settings → Developers → **Generate new token** | free | /setup → Sources → Discogs (SSM `DISCOGS_TOKEN`) | no labels, catalogue numbers or transfer info; MusicBrainz covers dates |
| M5 none | Deezer | nothing to create for reads (public API) | free | on by default | — |
| M6 none | MusicBrainz, Cover Art Archive, iTunes Search, AcousticBrainz dump | nothing; TDJ sends `TDJ/<version> (+<app url>)` as its User-Agent (no personal e-mail) | free (consider a MetaBrainz donation) | on by default | — |
| M7 decision | tango.info / El Recodo imports | ask each site's maintainers for written permission | — | — | **link-out only (the default)** |
| M8 O | Google (Drive, YouTube export) | as DEPLOY.md → Google Cloud console (redirect `https://<app url>/api/google/callback` + the 127.0.0.1 one; add test users or verify) | free; YouTube quota 10 k units per day | /setup → Google | the Google rows read "not set up on this server" |
| M9 O | Dropbox | as DEPLOY.md → Dropbox App Console (redirect `https://<app url>/api/dropbox/callback`) | free | /setup → Dropbox | no Dropbox export or folder |

### 7.3 AI

| # | Item | Where | Cost | Goes to | Without it |
|---|---|---|---|---|---|
| A1 O (per DJ) | Model API key: Anthropic / OpenAI / Gemini / OpenRouter | console.anthropic.com → API keys; platform.openai.com → API keys; aistudio.google.com → Get API key; openrouter.ai → Keys | pay as you go; an edit on a small tier costs a fraction of a cent (≈ 2–3 k in, ≤ 300 out tokens) | **Settings → Models on the DJ's device** (browser or Keychain; never the server) | keyword edits and the engine only; the organiser's shared key if enabled |
| A2 O (owner) | Shared "AI for everyone" key | same consoles | owner pays; capped by `AI_DAILY_LIMIT` | /setup → AI for everyone (SSM `AI_PROVIDER`, `AI_KEY`, `AI_MODEL`, `AI_DAILY_LIMIT`; secret `ANTHROPIC_API_KEY` still works) | DJs need their own key or ACP |
| A3 O (per DJ) | ACP agent | install the agent on the DJ's Mac (for example the Claude ACP adapter via npm) and log in there; the web uses `npx <tdj-acp-bridge>` (r22-acp-plan §3) | the DJ's own subscription | Settings → Models → Agents | API keys or engine only |
| A4 O (repo) | Live eval key | console.anthropic.com | a few cents per weekly run | GitHub **secret** `EVAL_ANTHROPIC_API_KEY` | evals run on recorded answers only |

### 7.4 Apps
Everything in [docs/APPLE_SETUP.md](../APPLE_SETUP.md) "Summary — the box to fill": `APPLE_TEAM_ID`, `TDJ_APP_BUNDLE_ID`, `APPLE_APP_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_PRIVATE_KEY`, the three certificates and passwords, two provisioning profiles, the optional Tauri updater key, and `TDJ_APP_BACKEND_URL`. Two additions from this council:
- enable **MusicKit** under App Services on the App ID (M3) before the `tdj-applemusic` plugin ships;
- add `tdj://spotify-callback` to the Spotify app (already in APPLE_SETUP §7).

### 7.5 Final GitHub list
- **Variables**: `AWS_DEPLOY_ROLE_ARN` (R); `AWS_REGION`, `TDJ_DOMAIN`, `NEXT_PUBLIC_APP_URL`, `PIPEDREAM_ENVIRONMENT` (O); `ANTHROPIC_MODEL` (O; deprecated in favour of /setup); the apps' `TDJ_APP_BUNDLE_ID`, `APPLE_APP_ID`, `TDJ_APP_BACKEND_URL`; `TDJ_TEMPLATE_BUCKET` (upstream only).
- **Secrets**: none required for the web. Optional overrides: `SPOTIFY_*`, `GOOGLE_*`, `DROPBOX_*`, `ANTHROPIC_API_KEY`, `TDJ_COOKIE_SECRET`, `TDJ_SECRET`, `PIPEDREAM_*`, `EVAL_ANTHROPIC_API_KEY`. Apple secrets per APPLE_SETUP.md. New connectors (Apple Music, Discogs) are **/setup only** by design.

### 7.6 Decisions only the owner can make
1. Fork vs template for self-deployers (council: **fork**, §9 D5).
2. Spotify strategy beyond the seat cap (council: one Spotify app per self-deploy, plus BYO-app for extras).
3. Room retention days (default 180), maximum members (16), maximum active rooms (200).
4. Whether to ask tango.info and El Recodo for import permission.
5. Whether to offer a shared AI key, and its daily limit.
6. Public or private upstream repo (macOS minutes; template hosting).

---

## 8. Work items (tests first, docs/TDD.md)

| # | Item | Where | First test |
|---|---|---|---|
| W1 | Provision and link `Db`; remove the TDJ_DB_TABLE copy | `sst.config.ts`, `settings/page.tsx`, `api/db/route.ts` | e2e: Settings never shows `TDJ_` text; `/api/db` reports `server` on a deployed stage |
| W2 | `ops.ts`: op types, validate, apply, inverse, rebase | `packages/core/src/ops.ts` | vitest invariants: apply∘inverse = id; hard rules reject; a rebase with a stale `prev` → conflict |
| W3 | Rooms backend: `Rooms` table, WebSocket API, routes `POST /api/rooms`, `/join`, `/ops`, `/ticket`, `GET /ops?after`, `/log`, owner actions; sweeper cron | `sst.config.ts`, `apps/web/src/app/api/rooms/*`, `apps/web/src/lib/server/rooms.ts`, `infra/live/*` (new) | vitest with a DynamoDB-local or in-memory adapter: sequencing race, kick closes connections, rate limits, ticket single use |
| W4 | Rooms UI: create/join sheet, presence chips, log tab with undo, previous rooms, conflict sheet, booth proposals | `components/rooms/*` | Playwright: two browser contexts edit the same tanda → conflict prompt; undo blocked → "undo anyway" |
| W5 | `Facts` table, resolver precedence, `/api/facts`, enrichment cron, seed import, sources UI | `packages/core/src/facts.ts`, `api/facts`, `infra/enrich/*`, `components/settings/Sources*.tsx` | vitest: a DJ edit always wins; the year is never replaced by a release date; BPM octave correction |
| W6 | AcousticBrainz one-time import script | `scripts/import_acousticbrainz.ts` | fixture dump → expected JSON |
| W7 | Apple MusicKit token route + MusicKit JS source + `tdj-applemusic` plugin | `api/apple/token`, `lib/booth/sources/apple.ts`, `apps/native/plugins/tdj-applemusic` | vitest: JWT claims; Booth source contract tests |
| W8 | `/setup` wizard + new `CONFIG_KEYS` + engineer-text regression scan | `app/setup`, `lib/server/config.ts`, `admin.ts` | vitest scan (§5.4); e2e wizard with the memory backend |
| W9 | `setup.yml`, `publish-template.yml`, `remove.yml`; template parameter docs | `.github/workflows/*`, `infra/github-oidc-role.yaml` (parameter text only) | actionlint; dry run in a scratch account |
| W10 | AI: prompt/parse split for all jobs, `/api/ai/edit` NDJSON, keyword parser v2, `AiSource` client, ACP `edit` | `api/ai/{prompt,parse,edit}`, `lib/ai/*`, `lib/acp/*` | eval set (§6.4); BYOK ≡ parse identity test |

Phasing: **P0** W1 + W8 (a self-deploy that works with no env text) → **P1** W2–W4 (rooms) and W10 (AI edits share W2) → **P2** W5–W6 (data) → **P3** W7 and W9 polish. Each phase keeps `pnpm quality` green and the golden set ≥ 85.

---

## 9. Dissent register

| # | Seat | Position | Chair's ruling |
|---|---|---|---|
| D1 | realtime | "Use **AppSync Events**: no connection table, no `PostToConnection` loop, cheaper connection minutes, built-in auth handlers." | Not adopted for v1: SST has a first-class `ApiGatewayWebSocket`, fan-out to ≤ 16 connections is trivial, and writes go through Next either way. **Revisit** if the connection bookkeeping causes incidents; the op log does not change. |
| D2 | realtime | "A **CRDT (Yjs)** gives true offline-first and peer-to-peer in a booth with bad Wi-Fi." | Rejected: tanda validity is a global constraint a CRDT cannot enforce (concurrent inserts, duplicate sides). The engine must validate anyway, and the documents are tiny, so a server-ordered op log is simpler and auditable (the activity log *is* the op log). The booth-offline need is met by local playback plus a queue (§3.7). |
| D3 | realtime | "Let the WebSocket Lambda accept ops directly (lower latency, no HTTP hop)." | Rejected for v1: validation needs the catalogue and `@tdj/core`, which already live in the Next bundle. Duplicating them in a second Lambda doubles cold-start size. Revisit if p95 op latency exceeds 600 ms. |
| D4 | data | "Scrape tango.info and El Recodo; they are the community's ground truth for recording dates and singers." | Rejected: the terms do not allow it (V10). Link out, and ask permission (owner decision §7.6-4). |
| D5 | devops | "Use a **template**, not a fork: private repos, clean history, no accidental PRs upstream." | Fork is the default because "Sync fork" is the only zero-tooling update path. Template stays documented for people who need privacy (they update by pulling upstream manually). |
| D6 | devops | "PowerUserAccess on the deploy role is too broad for strangers' accounts; ship a least-privilege policy." | Agreed in principle, deferred: SST's resource set changes with this round. After W3/W5 land, generate a policy from CloudTrail of a full deploy and offer it as `DeployPolicy=minimal` in the template. |
| D7 | devops | "Remove the one paste by deriving the role ARN (fixed role name + account id)." | Still needs the account id pasted somewhere; no real gain. Kept as one paste. |
| D8 | data | "Store artwork bytes in S3 for every source; URLs rot." | Only for CAA and placeholders (terms). A re-resolve job repairs dead URLs (`HEAD` 404 → re-queue). |
| D9 | backend | "Undo should be a strict stack per user, not per entry." | The brief asks for undo per entry; precondition checks keep it safe. A per-user ⌘Z (the latest of *my* entries) is added as a shortcut over the same mechanism. |

---

## 10. Facts to verify before code depends on them

| # | Claim | Spike |
|---|---|---|
| V1 | AppSync Events pricing/handlers; SST support level | read AWS docs; only matters for D1 |
| V2 | API Gateway WebSocket: 2 h max connection, 10 min idle, 32 KB frame, 128 KB message | AWS quotas page; reconnect test in W3 |
| V3 | List prices used in §3.10 (API Gateway, Lambda arm64, DynamoDB on-demand) | AWS pricing pages, then recompute |
| V4 | Spotify Development Mode seat count today and the Extended Quota criteria | the owner's dashboard + Spotify developer blog |
| V5 | Deezer public API rate limit; `bpm`/`gain` semantics | measure 500 lookups in D1 |
| V6 | Deezer app registration open/closed; no third-party full-track playback | developers.deezer.com |
| V7 | iTunes Search rate limit | measure |
| V8 | Discogs image and attribution terms | Discogs API terms page |
| V9 | Apple Music API rate limits; developer token maximum lifetime | Apple docs |
| V10 | tango.info and El Recodo terms of use | read both; write to the maintainers |
| V11 | MusicKit JS playback inside WKWebView (macOS and iPadOS) | add to apps-plan spike S1 |
| V12 | OpenNext/SST Lambda response streaming for route handlers | a 10-line streaming route on a dev stage |
| D1 | **Coverage spike**: for the 1,100 golden-set sides, measure the share each source fills for art, BPM, key, gain, ISRC and dates | a script on a dev stage; publish the table here |
