# Sync: one library on every device

A DJ's nights, History (names, versions, the nights as played, imports), dancer favourites, settings and what
T-DJ learned are the same on their iPhone, iPad, Mac and in the web app. There are **no accounts, no passwords and
no email**: a **sync code** is the only key, and everything is **end-to-end encrypted** with it. Sync works with
iCloud off and in any browser.

Three layers, each enough on its own:

| Layer | Where | Needs |
|---|---|---|
| 1. Sync code | everywhere (web, Mac, iPhone, iPad) | a T-DJ sync server: this web app's own, the build's default, or your own |
| 2. iCloud | the App Store apps (Mac, iPhone, iPad) when iCloud Drive is on | nothing more: Apple devices sync with no server reachable |
| 3. Library file | everywhere | moving one file (encrypted with the code, or plain JSON) |

Settings → **Sync**: turn sync on, show the code and its QR code, join with a code, the devices and when each last
synced, the sync server, iCloud (in the apps), Leave sync, Reset sync code, and the library file.

## How it works

### The code

`tango-k7m2-9qxr-…`: 26 random characters of Crockford base32 (130 bits) and 2 check characters, in groups of four
(`apps/web/src/lib/sync/code.ts`). Typing forgives case, spaces, dashes and look-alikes (`i`/`l` → `1`, `o` → `0`),
and the check characters catch a typo or a swap. It is language-neutral (no English words on a Turkish screen). The
QR code holds `tdj://sync#<code>`: the camera on an iPhone or iPad opens T-DJ on Settings → Sync with the code
filled in (`src-tauri/src/links.rs`); the code sits in the URL fragment, which never reaches a server.

### Keys (`lib/sync/crypto.ts`, WebCrypto)

HKDF-SHA-256 over the code (salt `tdj-sync-v1`) derives three independent values:

- the **space id** (256 bits): the device sends it to the sync server as its capability; the server stores the
  space under SHA-256 of it, so its own database never holds the id;
- an **AES-256-GCM key**: every record is sealed with a fresh 96-bit IV, the record id as additional data (a server
  that swaps two blobs gets blobs that no longer open) and gzip first for anything over 512 bytes;
- an **HMAC-SHA-256 key**: record names (`night:<id>`, `settings`…) become opaque 128-bit record ids.

The code never leaves the device: not to the server, not to iCloud, not into a log. A wrong code derives another
space and another key, and cannot open anything.

### Records and the merge (`lib/sync/merge.ts`, `engine.ts`, `library.ts`)

The library is a set of records: one per night (`night:<id>`), plus `memory` (learned preferences, dancer
favourites, notes, set log), `settings`, `overrides` (the DJ's database edits) and one per device (`device:<id>`:
its name, platform, last seen). Each top-level key of a record is a field stamped with a **hybrid logical clock**
(wall time, a counter, the device id; a stamp read from another device moves the clock forward, so a write made
after reading another device's write always sorts after it).

- **Merge** keeps, field by field, the write with the greater stamp: commutative, associative and idempotent, so
  every device converges whatever it exchanges, in any order, any number of times. Two devices that change
  different things (a rename here, a played night there) both keep their change.
- **Deletes are tombstones** that keep the night's fields. A record is shown while a field was written after its
  latest delete, so *delete vs rename* resolves the same way everywhere: the later wins, and a night renamed after
  its delete comes back renamed. A night is never dropped from the log.
- A night that only fell off the end of a full History (50 nights) is not a delete.
- **Joining** a space reads it first: the space's settings and memory win over the new device's untouched
  defaults; the new device's own nights are all added.
- **Never synced**: model keys and agent connections (BYOK, they stay in each device's Keychain or browser), a DJ
  app's music folder, connector URLs, the Discogs token.

A round (after each change, every 30 s while the page is visible, on focus and when the network returns): capture
this device's edits, then for each transport pull and merge what changed there and push every record whose merged
copy the transport does not hold yet, then apply the result to the stores (`lib/sync/local.ts`, through the
History, memory, settings and database stores' own actions). A push that lost a race is harmless: the next round
merges and pushes the union.

### The sync server (`apps/web/src/app/api/sync/route.ts`, `lib/server/sync.ts`)

A tiny route on the existing deployment, no cookies, no accounts, any origin (the apps call it from their own):

- `GET /api/sync?since=<version>` → `{ version, more, records: [{ rid, blob }], devices }`
- `PUT /api/sync` `{ records: [{ rid, blob }] }` → `{ version }`
- `DELETE /api/sync` → the space is gone (Reset sync code); devices still on the old code get `410`.

The space id travels in `x-tdj-sync-id` (never in the URL, so not in access logs), the device's random tag in
`x-tdj-device`. Storage is the deployment's DynamoDB table (`TDJ_DB_TABLE`, the same table as rooms; items
`sync#<hash>` and `sync#<hash>#r#<rid>`), or the process's memory for `pnpm dev`, `pnpm start` and a container
without a table. Writes claim versions in one conditional update of the space's manifest, then write records only
over older versions; a reader never skips a record still landing.

Limits (`SYNC_LIMITS`): 350 000 characters per record, 25 records and 4 MB per write, 2 500 records and 40 MB per
space, 60 records or 4 MB per read, 120 requests a minute per address and 60 writes a minute per space; anything
that is not a sealed blob is refused. Spaces nobody writes to expire after 400 days.

### iCloud (the App Store apps)

The same sealed records, one file each, in the app's iCloud Documents container
(`<container>/Documents/sync/<hash of the space id>/<rid>.tdjsync`), through the native commands `icloud_status`,
`icloud_list`, `icloud_read`, `icloud_write` and `icloud_remove` (`apps/desktop/src-tauri/src/icloud.rs`). Writes
are atomic (a temporary file renamed); a file still in the cloud is asked for and read on a later round. Apple
devices on one iCloud account sync with no server at all, but still need the code once (iCloud holds only
ciphertext; the key is never put there). With iCloud Drive off, Settings says so and sync codes carry on.

| Build | iCloud |
|---|---|
| Mac App Store | yes (`entitlements/mac-appstore.plist`) |
| iOS: iPhone and iPad | yes (`entitlements/ios.plist`, merged into the Xcode project by `mac-build.sh`) |
| Developer ID DMG | no: a Developer ID app reaches a container only through an embedded profile listing it, which the DMG and its updater do not carry; `icloud_status` answers `unsupported` and the DMG syncs with a code |

### The library file (`lib/sync/file.ts`)

Settings → Sync → Library file: **Export encrypted** (AES-GCM with the sync code: safe in a cloud folder or an
email, opens only with the code), **Export as JSON** (readable), **Import** (adds the file's nights, keeping the
newer copy of a night already here; favourites, settings and what T-DJ learned come from the file). Keys and
folders are never in either.

## Privacy

- The server stores **ciphertext only**, under a hash of an id it cannot link to anyone. It never receives the code
  or any key. The developer, the host or anyone who reads the database cannot read a night, a name, a setting or a
  favourite.
- What a server can see: that a space exists, how many records it has and their sizes, when they change, and a
  random tag per device with its last request time (plus the IP address of each request, as any web server).
- Anyone with the code can read and change the library. Share it only with your own devices; **Reset sync code**
  makes a new one and deletes the old encrypted copy from the server and iCloud.
- Leaving sync keeps everything on the device and stops syncing there; the other devices go on.
- App Store App Privacy answers: `apps/desktop/fastlane/app_privacy.md`.

## Self-hosting

Every T-DJ deployment is a sync server: deploy it (`docs/SELF_DEPLOY.md`) and its web app syncs with itself.

- **Your apps**: Settings → Sync → Sync server → **Your own** → your deployment's address (`https://…`).
- **Your builds' default**: set `TDJ_SYNC_URL` (an https origin) when building the apps. The release workflow
  reads the repository variable `TDJ_SYNC_URL`; locally, `TDJ_SYNC_URL=https://tdj.example.org pnpm --filter
  @tdj/desktop ui`. It becomes `NEXT_PUBLIC_TDJ_SYNC_URL` (`scripts/release/version.mjs` → `releaseEnv`). Empty
  (the default in the repository): the apps have no default server, and use a linked TDJ server (Settings →
  Connections), a server the DJ enters, iCloud or the file. The owner's URL is never committed
  (`pnpm security:check`).
- Nothing else to configure: the route uses the deployment's DynamoDB table (`sst.config.ts`) already.

## Owner steps (the author's builds)

1. GitHub → repository → Settings → Secrets and variables → Actions → **Variables** → `TDJ_SYNC_URL` = the
   production deployment's https address. The next "Release apps" run builds it in.
2. Apple: run `node scripts/release/apple-setup.mjs` (or the "Apple setup" workflow). It enables the App ID's
   **iCloud** capability through the App Store Connect API and regenerates the Mac App Store and iOS profiles when
   they do not grant `iCloud.<bundle ID>`. The API cannot create or assign an iCloud container: if the run prints
   the iCloud step, open developer.apple.com → Identifiers → the App ID → iCloud → Configure, tick
   `iCloud.com.ariomoniri.tdj`, Save, and run it again. (Done for `com.ariomoniri.tdj`: CloudKit support on, one
   container assigned.)
3. App Store Connect → App Privacy: review the answers in `apps/desktop/fastlane/app_privacy.md` (sync section).

## Tests

- `apps/web/src/lib/sync/crypto.test.ts`: codes, deterministic derivation, a wrong code cannot decrypt, blobs bound
  to their record ids, nothing readable in the ciphertext.
- `apps/web/src/lib/sync/merge.test.ts`: the clock, concurrent edits, delete vs rename, idempotency, ordering and
  associativity, whole devices converging, keys never synced, History's limit.
- `apps/web/src/lib/server/sync.test.ts`: the route stores ciphertext only under a hash of the id, refuses
  plaintext and oversize writes, rate limits, reset; paging and a write still landing.
- `apps/web/src/lib/sync/file.test.ts`: the library file.
- `apps/web/e2e/sync.spec.ts`: two browser contexts with one code sync a renamed night and a delete.
- `apps/desktop/test/icloud.test.ts`: two Apple devices through the mocked iCloud folder
  (`apps/desktop/store/icloud-mock.ts`, used by `store/tauri-mock.ts`); `src-tauri/src/icloud.rs` and `links.rs`
  unit tests (`cargo test`).
