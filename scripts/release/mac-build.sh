#!/usr/bin/env bash
# TDJ Mac release in one pass, on any Mac with Xcode (a rented cloud Mac or a GitHub macOS runner):
#   signing (App Store Connect API: bundle ID, certificates from local CSRs, profiles; idempotent)
#   → bundled UI → macOS universal app: Developer ID + notarised + stapled DMG (+ updater tarball, latest.json)
#   → Mac App Store .pkg → iOS .ipa (one universal app for iPhone and iPad) → both uploaded to TestFlight
#   → (optional) GitHub Release, store metadata. One version for all of it: the root package.json
#   (scripts/release/version.mjs), checked against the tag.
# Everything reusable stays under $TDJ_DRIVE (default ~/drive): toolchains, caches, signing store, outputs,
# so the second session skips the slow parts. docs/RELEASING.md has the walkthrough and timings.
#
# Usage: scripts/release/mac-build.sh [--targets dmg,mas,ios] [--version 1.0.0] [--build 123]
#                                     [--no-upload] [--github-release] [--metadata] [--signing store|env|ssm]
# Needs: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID and the key at
#        ~/.appstoreconnect/private_keys/AuthKey_TDJ.p8 (or APP_STORE_CONNECT_PRIVATE_KEY / _KEY_PATH).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
TAURI_DIR="$DESKTOP/src-tauri"
DRIVE="${TDJ_DRIVE:-$HOME/drive}"
TEAM_ID="${APPLE_TEAM_ID:-FF68N39FU5}"
BUNDLE_ID="${TDJ_APP_BUNDLE_ID:-com.ariomoniri.tdj}"
REPO="${GITHUB_REPOSITORY:-ArioMoniri/TDJ}"
TARGETS="dmg,mas,ios"
VERSION=""
BUILD=""
UPLOAD=1
GH_RELEASE=0
METADATA=0
SIGNING="store"        # store: $DRIVE/tdj-signing via apple-setup.mjs · env: GitHub secrets · ssm: AWS SSM
SIGNING_STORE="${TDJ_SIGNING_STORE:-dir:$DRIVE/tdj-signing}"

while [ $# -gt 0 ]; do
  case "$1" in
    --targets) TARGETS="$2"; shift ;;
    --version) VERSION="$2"; shift ;;
    --build) BUILD="$2"; shift ;;
    --no-upload) UPLOAD=0 ;;
    --github-release) GH_RELEASE=1 ;;
    --metadata) METADATA=1 ;;
    --signing) SIGNING="$2"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
# `ipad` is the old name of the iOS target (one universal IPA for iPhone and iPad since 2026-11): still accepted
norm_target() { case "$1" in ipad) echo ios ;; *) echo "$1" ;; esac; }
_T=""; IFS=',' read -r -a _TL <<< "$TARGETS"
for t in "${_TL[@]}"; do t="$(norm_target "$(echo "$t" | tr -d ' ')")"; [ -n "$t" ] && _T="${_T:+$_T,}$t"; done
TARGETS="$_T"
for t in "${_TL[@]}"; do case "$(norm_target "$(echo "$t" | tr -d ' ')")" in dmg|mas|ios|"") ;; *) echo "unknown target $t (dmg, mas, ios)" >&2; exit 2 ;; esac; done
want() { [[ ",$TARGETS," == *",$1,"* ]]; }

T0=$(date +%s)
step() { printf '\n\033[1;35m▸ %s\033[0m  (+%ss)\n' "$*" "$(( $(date +%s) - T0 ))"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(uname)" = "Darwin" ] || die "this script runs on macOS (Linux parts: docs/RELEASING.md)"

# ------------------------------------------------------------------ toolchains (cached on the drive)
step "Toolchains"
mkdir -p "$DRIVE"
export RUSTUP_HOME="${RUSTUP_HOME:-$DRIVE/rustup}" CARGO_HOME="${CARGO_HOME:-$DRIVE/cargo}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$DRIVE/tdj-target}"
export PATH="$CARGO_HOME/bin:$DRIVE/node/bin:$PATH"
xcodebuild -version >/dev/null 2>&1 || die "Xcode is missing"; xcodebuild -version | sed -n 1p
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  NODE_V=22.22.0
  curl -fsSL "https://nodejs.org/dist/v$NODE_V/node-v$NODE_V-darwin-$(uname -m | sed 's/x86_64/x64/').tar.gz" | tar -xz -C "$DRIVE"
  rm -rf "$DRIVE/node" && mv "$DRIVE/node-v$NODE_V-darwin-"* "$DRIVE/node"
fi
command -v pnpm >/dev/null || { corepack enable --install-directory "$DRIVE/node/bin" 2>/dev/null || npm i -g pnpm@10.18.0 --prefix "$DRIVE/node"; }
if ! command -v rustup >/dev/null; then
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal
fi
rustup default stable >/dev/null 2>&1 || rustup default stable
# Xcode's "Build Rust Code" phase (iOS) runs with Xcode's own environment, not this shell's: it finds rustup and
# cargo only at their default homes, so point those at the copies cached on the drive
for pair in "$RUSTUP_HOME:$HOME/.rustup" "$CARGO_HOME:$HOME/.cargo"; do
  src="${pair%%:*}"; dst="${pair#*:}"
  [ "$src" = "$dst" ] && continue
  [ -d "$dst" ] && [ ! -L "$dst" ] && rmdir "$dst" 2>/dev/null || true   # an empty leftover from a failed run
  [ -e "$dst" ] || ln -s "$src" "$dst"
done
RUST_TARGETS=()
{ want dmg || want mas; } && RUST_TARGETS+=(aarch64-apple-darwin x86_64-apple-darwin)
# all three iOS targets: `tauri ios init` installs the simulator ones anyway (a slow, surprising step on a runner)
want ios && RUST_TARGETS+=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios)
[ ${#RUST_TARGETS[@]} -gt 0 ] && rustup target add "${RUST_TARGETS[@]}" >/dev/null
if want ios && ! command -v xcodegen >/dev/null; then brew install xcodegen >/dev/null; fi

step "Dependencies"
cd "$ROOT"
pnpm config set store-dir "$DRIVE/pnpm-store" >/dev/null
pnpm install --frozen-lockfile --prefer-offline >/dev/null

# ------------------------------------------------------------------ version + build number
# one version for web + Mac + iOS: the root package.json (scripts/release/version.mjs); a tag must match it
PKG_VERSION=$(node -p 'require("./package.json").version')
TAG=$(git describe --tags --exact-match 2>/dev/null || true)
VERSION="${VERSION:-${TAG#v}}"; VERSION="${VERSION:-$PKG_VERSION}"
node scripts/release/version.mjs --check ${TAG:+--tag "$TAG"} || die "versions out of sync (pnpm release:version $VERSION)"
[ "$VERSION" = "$PKG_VERSION" ] || echo "! --version $VERSION differs from package.json ($PKG_VERSION): the web app will report $PKG_VERSION"
COMMIT=$(git rev-parse --short=12 HEAD)
if [ -z "$BUILD" ]; then
  # one number for every platform of this commit; monotonic (UTC minutes since 2026-01-01)
  BUILD=$(( ($(date -u +%s) - 1767225600) / 60 ))
fi
OUT="${TDJ_OUT:-$DRIVE/tdj-out/$VERSION-$BUILD}"
mkdir -p "$OUT"
echo "version $VERSION build $BUILD commit $COMMIT → $OUT"

# ------------------------------------------------------------------ App Store Connect key
KEY_FILE=""
for f in "${APP_STORE_CONNECT_KEY_PATH:-}" "$HOME/.appstoreconnect/private_keys/AuthKey_TDJ.p8" \
         "$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID:-x}.p8"; do
  if [ -n "$f" ] && [ -f "$f" ]; then KEY_FILE="$f"; break; fi
done
if [ -z "$KEY_FILE" ] && [ -n "${APP_STORE_CONNECT_PRIVATE_KEY:-}" ]; then
  KEY_FILE="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
  mkdir -p "$(dirname "$KEY_FILE")"; umask 077; printf '%s\n' "$APP_STORE_CONNECT_PRIVATE_KEY" > "$KEY_FILE"; umask 022
fi
[ -n "${APP_STORE_CONNECT_KEY_ID:-}" ] && [ -n "${APP_STORE_CONNECT_ISSUER_ID:-}" ] && [ -n "$KEY_FILE" ] \
  || die "App Store Connect key missing: APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID and ~/.appstoreconnect/private_keys/AuthKey_TDJ.p8"
# altool and notarytool look for AuthKey_<KEY_ID>.p8
APPLE_KEY_NAMED="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
[ -f "$APPLE_KEY_NAMED" ] || { install -m 600 "$KEY_FILE" "$APPLE_KEY_NAMED"; }
export APP_STORE_CONNECT_KEY_PATH="$KEY_FILE"

# ------------------------------------------------------------------ signing material
step "Signing (App Store Connect API, idempotent)"
WORK=$(mktemp -d); chmod 700 "$WORK"
SIGN="$WORK/signing"; mkdir -m 700 "$SIGN"
KC_DIR="$DRIVE/tdj-signing"; mkdir -p "$KC_DIR"; chmod 700 "$KC_DIR"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
# ssm with an empty /tdj/apple (the material lives in the repository secrets): fall back to env, said once
if [ "$SIGNING" = "ssm" ]; then
  node scripts/release/apple-setup.mjs export --store "ssm:/tdj/apple" --out "$SIGN" || true
  if [ -z "$(ls -A "$SIGN" 2>/dev/null)" ] && [ -n "${APPLE_DISTRIBUTION_CERT_P12:-}" ]; then
    echo "SSM holds no signing material: using the repository secrets (--signing env)"
    SIGNING="env"
  fi
fi
case "$SIGNING" in
  store) node scripts/release/apple-setup.mjs setup --store "$SIGNING_STORE" --team-id "$TEAM_ID" --bundle-id "$BUNDLE_ID" \
           || echo "! apple-setup reported a problem above; continuing with what the store holds"
         node scripts/release/apple-setup.mjs export --store "$SIGNING_STORE" --out "$SIGN" ;;
  ssm)   [ -n "$(ls -A "$SIGN" 2>/dev/null)" ] || die "no signing material in SSM /tdj/apple and no repository secrets" ;;
  env)   # GitHub environment secrets (APPLE_SETUP.md names), base64
         for p in APPLE_DISTRIBUTION_CERT MAC_INSTALLER_CERT DEVELOPER_ID_APPLICATION_CERT; do
           v="${p}_P12"; w="${p}_PASSWORD"
           if [ -n "${!v:-}" ]; then printf '%s' "${!v}" | base64 --decode > "$SIGN/$p.p12"; printf '%s' "${!w}" > "$SIGN/$p.password"; fi
         done
         [ -n "${IOS_APPSTORE_PROFILE:-}" ] && printf '%s' "$IOS_APPSTORE_PROFILE" | base64 --decode > "$SIGN/IOS_APPSTORE_PROFILE.mobileprovision"
         [ -n "${MAC_APPSTORE_PROFILE:-}" ] && printf '%s' "$MAC_APPSTORE_PROFILE" | base64 --decode > "$SIGN/MAC_APPSTORE_PROFILE.provisionprofile"
         true ;;
  *) die "--signing store|env|ssm" ;;
esac

# a keychain that lives on the drive (re-used next session); its password is generated once and kept beside it
KC="$KC_DIR/tdj.keychain-db"
[ -f "$KC_DIR/KEYCHAIN_PASSWORD" ] || { umask 077; openssl rand -base64 24 > "$KC_DIR/KEYCHAIN_PASSWORD"; umask 022; }
KC_PW=$(cat "$KC_DIR/KEYCHAIN_PASSWORD")
[ -f "$KC" ] || security create-keychain -p "$KC_PW" "$KC"
security unlock-keychain -p "$KC_PW" "$KC"
security set-keychain-settings -lut 21600 "$KC"
for p in APPLE_DISTRIBUTION_CERT MAC_INSTALLER_CERT DEVELOPER_ID_APPLICATION_CERT; do
  [ -f "$SIGN/$p.p12" ] || continue
  security import "$SIGN/$p.p12" -k "$KC" -P "$(cat "$SIGN/$p.password")" -f pkcs12 \
    -T /usr/bin/codesign -T /usr/bin/productbuild -T /usr/bin/productsign -T /usr/bin/security >/dev/null 2>&1 || true
done
# Apple's intermediate CAs: a Developer ID identity is not "valid" (CSSMERR_TP_NOT_TRUSTED) without the G2 CA, and
# a fresh macOS image ships only some of them
for ca in DeveloperIDG2CA AppleWWDRCAG3; do
  curl -fsSL "https://www.apple.com/certificateauthority/$ca.cer" -o "$WORK/$ca.cer" \
    && security import "$WORK/$ca.cer" -k "$KC" >/dev/null 2>&1 || true
done
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PW" "$KC" >/dev/null
# search list: ours first, keep the user's
OTHER_KCS=()
while IFS= read -r k; do [ -n "$k" ] && [ "$k" != "$KC" ] && OTHER_KCS+=("$k"); done < <(security list-keychains -d user | tr -d '" ')
security list-keychains -d user -s "$KC" ${OTHER_KCS[@]+"${OTHER_KCS[@]}"}  # bash 3.2-safe
ident() { security find-identity -v ${2:+-p "$2"} "$KC" | grep -E "$1" | grep "($TEAM_ID)" | head -1 | sed -E 's/.*"(.*)"/\1/'; }
DEVID=$(ident "Developer ID Application" codesigning || true)
DIST=$(ident "Apple Distribution" codesigning || true)
INSTALLER=$(ident "3rd Party Mac Developer Installer|Mac Installer Distribution" || true)
echo "identities: devid=${DEVID:+yes} distribution=${DIST:+yes} installer=${INSTALLER:+yes}"

# ------------------------------------------------------------------ bundled UI (once for every target)
step "Bundled UI (static export of apps/web)"
# the Spotify Client ID the apps sign in with (public, PKCE; repository variable TDJ_SPOTIFY_CLIENT_ID): without it
# a release ships an app whose "Log in with Spotify" only works with the DJ's own Spotify app
if ! [[ "${TDJ_SPOTIFY_CLIENT_ID:-}" =~ ^[A-Za-z0-9]{1,64}$ ]]; then
  [ "${TDJ_ALLOW_NO_SPOTIFY:-}" = 1 ] || die "TDJ_SPOTIFY_CLIENT_ID is missing or malformed (repository variable; TDJ_ALLOW_NO_SPOTIFY=1 builds without it)"
  echo "! building without a Spotify Client ID: DJs must use their own Spotify app"
fi
export TDJ_SPOTIFY_CLIENT_ID="${TDJ_SPOTIFY_CLIENT_ID:-}"
node apps/desktop/scripts/build-ui.mjs >/dev/null
# the bundle carries it (the page reads it; src-tauri/build.rs falls back to it inside Xcode's iOS build)
if [ -n "$TDJ_SPOTIFY_CLIENT_ID" ]; then
  grep -q "\"spotifyClientId\": \"$TDJ_SPOTIFY_CLIENT_ID\"" "$DESKTOP/ui/dist/tdj-bundle.json" \
    || die "the bundled UI does not carry the Spotify Client ID"
fi

export APPLE_API_ISSUER="$APP_STORE_CONNECT_ISSUER_ID" APPLE_API_KEY="$APP_STORE_CONNECT_KEY_ID" APPLE_API_KEY_PATH="$APPLE_KEY_NAMED"
UPLOADED=()
# the App Store app's Apple ID: altool cannot always find it from the bundle ID (2026-11-17: "Cannot determine the
# Apple ID from Bundle ID 'com.ariomoniri.tdj' and platform 'IOS'" left the IPA unuploaded), so it is passed in
ASC_APP_ID="${APPLE_APP_ID:-$(node -e 'console.log(require("./package.json").release?.appStoreId ?? "")')}"
FAILED_UPLOADS=()
altool_upload() { # $1 file, $2 ios|macos — a failed upload fails the run at the end (never a silent skip)
  local extra=()
  if [ -n "$ASC_APP_ID" ]; then
    extra=(--apple-id "$ASC_APP_ID" --bundle-id "$BUNDLE_ID" --bundle-version "$BUILD"
      --bundle-short-version-string "$VERSION")
    xcrun altool --upload-package "$1" -t "$2" "${extra[@]}" --apiKey "$APP_STORE_CONNECT_KEY_ID" \
      --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID" --output-format normal && return 0
  else
    xcrun altool --upload-app -f "$1" -t "$2" --apiKey "$APP_STORE_CONNECT_KEY_ID" \
      --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID" --output-format normal && return 0
  fi
  FAILED_UPLOADS+=("$1")
  return 1
}
tauri() { (cd "$DESKTOP" && pnpm exec tauri "$@"); }

# ------------------------------------------------------------------ 1. Developer ID DMG
if want dmg; then
  step "macOS DMG (universal, Developer ID, notarised)"
  [ -n "$DEVID" ] || die "no Developer ID Application identity (apple-setup printed the manual step), or run with --targets mas,ios"
  UPDATER_KEY="$KC_DIR/updater.key"
  if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
    if [ ! -f "$UPDATER_KEY" ]; then
      umask 077; openssl rand -base64 24 > "$KC_DIR/UPDATER_KEY_PASSWORD"; umask 022
      tauri signer generate --ci -w "$UPDATER_KEY" -p "$(cat "$KC_DIR/UPDATER_KEY_PASSWORD")" >/dev/null
      echo "!! New updater signing key at $UPDATER_KEY. Back it up (CLI: node packages/cli/bin/tdj.mjs apple --updater-key $UPDATER_KEY): every future update must be signed with it."
    fi
    TAURI_SIGNING_PRIVATE_KEY="$(cat "$UPDATER_KEY")"
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$KC_DIR/UPDATER_KEY_PASSWORD")"
    export TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  fi
  PUBKEY="${TAURI_UPDATER_PUBKEY:-$(cat "$UPDATER_KEY.pub" 2>/dev/null || true)}"
  [ -n "$PUBKEY" ] || die "updater public key missing (TAURI_UPDATER_PUBKEY)"
  # installer window art (src-tauri/dmg, laid out by tauri.conf.json bundle.macOS.dmg): Finder draws a sharp retina
  # background only from a multi-resolution TIFF, so pair the 1x and 2x PNGs here; the committed config uses the 1x PNG
  DMG_BG="$TAURI_DIR/dmg/background.png"
  tiffutil -cathidpicheck "$TAURI_DIR/dmg/background.png" "$TAURI_DIR/dmg/background@2x.png" \
    -out "$WORK/dmg-background.tiff" >/dev/null 2>&1 && DMG_BG="$WORK/dmg-background.tiff"
  node -e '
    const [v,b,id,pub,repo,bg]=process.argv.slice(1);
    process.stdout.write(JSON.stringify({version:v,bundle:{createUpdaterArtifacts:true,macOS:{bundleVersion:b,signingIdentity:id,
      dmg:{background:bg}}},
      plugins:{updater:{pubkey:pub,endpoints:[`https://github.com/${repo}/releases/latest/download/latest.json`]}}}))' \
    "$VERSION" "$BUILD" "$DEVID" "$PUBKEY" "$REPO" "$DMG_BG" > "$WORK/dmg.json"
  # Tauri's DMG bundler skips the Finder layout step (background, icon positions) when CI=true, as on GitHub runners;
  # keep it unless the caller sets TAURI_BUNDLER_DMG_IGNORE_CI=false (e.g. a runner without a Finder session)
  # a restored build cache (rust-cache keeps target/) may hold an older version's DMG: start from an empty bundle dir
  B="$CARGO_TARGET_DIR/universal-apple-darwin/release/bundle"
  rm -rf "$B"
  TAURI_BUNDLER_DMG_IGNORE_CI="${TAURI_BUNDLER_DMG_IGNORE_CI:-true}" \
    tauri build --target universal-apple-darwin --bundles app,dmg --features updater --config "$WORK/dmg.json" --ci
  DMG="$B/dmg/T-DJ_${VERSION}_universal.dmg"; APP="$B/macos/T-DJ.app"
  [ -f "$DMG" ] || DMG=$(find "$B/dmg" -name '*.dmg' -newer "$WORK" | head -1)
  [ -n "$DMG" ] && [ -f "$DMG" ] || die "no DMG produced in $B/dmg"
  [ -s "$B/macos/T-DJ.app.tar.gz.sig" ] || die "no updater signature: TAURI_SIGNING_PRIVATE_KEY (and its password) must be set"
  codesign --verify --deep --strict "$APP"
  xcrun stapler validate "$APP"
  if [ -n "$TDJ_SPOTIFY_CLIENT_ID" ]; then
    grep -aq "$TDJ_SPOTIFY_CLIENT_ID" "$APP/Contents/MacOS/TDJ" || die "the DMG app was built without the Spotify Client ID"
  fi
  # the DMG itself: sign, notarise, staple (Gatekeeper checks the download, not only the app inside)
  codesign --force --sign "$DEVID" --timestamp "$DMG"
  xcrun notarytool submit "$DMG" --key "$APPLE_KEY_NAMED" --key-id "$APP_STORE_CONNECT_KEY_ID" --issuer "$APP_STORE_CONNECT_ISSUER_ID" --wait
  xcrun stapler staple "$DMG"
  spctl -a -vvv -t install "$DMG"
  # the App Store name everywhere (T-DJ); TDJ-macOS.dmg stays as a copy for links in apps already installed (1.0.0)
  cp "$DMG" "$OUT/T-DJ-macOS.dmg"; cp "$DMG" "$OUT/T-DJ-$VERSION-macOS.dmg"; cp "$DMG" "$OUT/TDJ-macOS.dmg"
  cp "$B/macos/T-DJ.app.tar.gz" "$OUT/TDJ-macOS.app.tar.gz"; cp "$B/macos/T-DJ.app.tar.gz.sig" "$OUT/TDJ-macOS.app.tar.gz.sig"
  node scripts/release/latest-json.mjs --version "$VERSION" --sig "$OUT/TDJ-macOS.app.tar.gz.sig" \
    --notes-file "${TDJ_RELEASE_NOTES:-apps/desktop/fastlane/metadata/en-US/release_notes.txt}" --repo "$REPO" > "$OUT/latest.json"
  # the auto-update path end to end: latest.json → this release's tarball, signature valid for the app's public key
  node scripts/release/verify-updater.mjs --manifest "$OUT/latest.json" --tarball "$OUT/TDJ-macOS.app.tar.gz" \
    --sig "$OUT/TDJ-macOS.app.tar.gz.sig" --version "$VERSION" --pubkey "$PUBKEY" --repo "$REPO" \
    || die "the updater artifacts do not verify (see above): no release was touched"
  (cd "$OUT" && shasum -a 256 T-DJ-macOS.dmg "T-DJ-$VERSION-macOS.dmg" TDJ-macOS.dmg TDJ-macOS.app.tar.gz > SHA256SUMS)
  unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
fi

# ------------------------------------------------------------------ 2. Mac App Store pkg
if want mas; then
  step "Mac App Store package (universal, sandboxed)"
  [ -n "$DIST" ] && [ -n "$INSTALLER" ] || die "Apple Distribution or Mac Installer identity missing"
  PROFILE="$SIGN/MAC_APPSTORE_PROFILE.provisionprofile"
  [ -f "$PROFILE" ] || die "Mac App Store profile missing"
  node -e '
    const [v,b,id,prof]=process.argv.slice(1);
    process.stdout.write(JSON.stringify({version:v,bundle:{targets:["app"],createUpdaterArtifacts:false,macOS:{bundleVersion:b,
      signingIdentity:id,entitlements:"entitlements/mac-appstore.plist",
      files:{"embedded.provisionprofile":prof,"Resources/PrivacyInfo.xcprivacy":"./PrivacyInfo.xcprivacy"}}}}))' \
    "$VERSION" "$BUILD" "$DIST" "$PROFILE" > "$WORK/mas.json"
  # no notarisation for the store build: the App Store signs it
  ( unset APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
    export TDJ_APP_STORE=1
    tauri build --target universal-apple-darwin --bundles app --config "$WORK/mas.json" --ci )
  MAS_APP="$CARGO_TARGET_DIR/universal-apple-darwin/release/bundle/macos/T-DJ.app"
  codesign -d --entitlements - "$MAS_APP" 2>/dev/null | grep -q app-sandbox || die "the store build is not sandboxed"
  # files copied from the owner-only signing folder (the embedded profile) keep mode 600, which App Store Connect
  # rejects (90255: readable only by root once installed); permissions are not part of the code signature
  chmod -R u+rwX,go+rX "$MAS_APP"
  productbuild --component "$MAS_APP" /Applications --sign "$INSTALLER" --keychain "$KC" "$OUT/TDJ-MacAppStore.pkg"
  if [ "$UPLOAD" = 1 ]; then altool_upload "$OUT/TDJ-MacAppStore.pkg" macos && UPLOADED+=("Mac App Store pkg → TestFlight"); fi
fi

# ------------------------------------------------------------------ 3. iOS IPA (iPhone + iPad)
if want ios; then
  step "iOS app for iPhone and iPad (App Store Connect export)"
  [ -f "$SIGN/APPLE_DISTRIBUTION_CERT.p12" ] && [ -f "$SIGN/IOS_APPSTORE_PROFILE.mobileprovision" ] || die "iOS signing material missing"
  GEN="$TAURI_DIR/gen/apple"
  if [ ! -f "$GEN/project.yml" ]; then
    (cd "$DESKTOP" && APPLE_DEVELOPMENT_TEAM="$TEAM_ID" pnpm exec tauri ios init --ci)
    echo "!! gen/apple was generated: commit apps/desktop/src-tauri/gen/apple so later builds reuse it"
  fi
  # universal: iPhone and iPad (TARGETED_DEVICE_FAMILY "1,2"; until 2026-11 it was "2", iPad only). Orientations per
  # device come from Info.ios.plist (iPhone portrait, iPad every orientation), plus the privacy manifest, launch colour
  # and icons without alpha. Tauri's project.yml has no TARGETED_DEVICE_FAMILY key: set it in the iOS target's base
  # settings, replacing an older "2" left in a committed gen/apple
  FAMILY="${TDJ_IOS_DEVICE_FAMILY:-1,2}"
  if grep -q 'TARGETED_DEVICE_FAMILY:' "$GEN/project.yml"; then
    sed -i '' -E "s/TARGETED_DEVICE_FAMILY: .*/TARGETED_DEVICE_FAMILY: \"$FAMILY\"/" "$GEN/project.yml"
  else
    perl -0pi -e "s/(\n    settings:\n      base:\n)/\$1        TARGETED_DEVICE_FAMILY: \"$FAMILY\"\n/" "$GEN/project.yml"
  fi
  grep -q "TARGETED_DEVICE_FAMILY: \"$FAMILY\"" "$GEN/project.yml" || die "could not set the iOS device family (project.yml)"
  IOS_SRC=$(find "$GEN" -maxdepth 1 -type d -name '*_iOS' | head -1)
  [ -n "$IOS_SRC" ] && cp "$TAURI_DIR/PrivacyInfo.xcprivacy" "$IOS_SRC/PrivacyInfo.xcprivacy"
  mkdir -p "$GEN/Assets.xcassets/LaunchBackground.colorset"
  cat > "$GEN/Assets.xcassets/LaunchBackground.colorset/Contents.json" <<'JSON'
{"colors":[{"idiom":"universal","color":{"color-space":"srgb","components":{"red":"0.043","green":"0.039","blue":"0.063","alpha":"1.000"}}}],"info":{"version":1,"author":"xcode"}}
JSON
  cp "$TAURI_DIR"/icons/ios/*.png "$GEN/Assets.xcassets/AppIcon.appiconset/" 2>/dev/null || true
  (cd "$GEN" && xcodegen generate >/dev/null)
  IOS_CERTIFICATE="$(base64 < "$SIGN/APPLE_DISTRIBUTION_CERT.p12")"
  IOS_CERTIFICATE_PASSWORD="$(cat "$SIGN/APPLE_DISTRIBUTION_CERT.password")"
  IOS_MOBILE_PROVISION="$(base64 < "$SIGN/IOS_APPSTORE_PROFILE.mobileprovision")"
  export IOS_CERTIFICATE IOS_CERTIFICATE_PASSWORD IOS_MOBILE_PROVISION APPLE_DEVELOPMENT_TEAM="$TEAM_ID"
  # CFBundleVersion = the run's build number, as for the DMG and the pkg. Not `--build-number`: Tauri appends that
  # to the version (CFBundleVersion "1.0.0.459871"), which then differs from the Mac builds and from submit-review
  ( export TDJ_APP_STORE=1
    cd "$DESKTOP" && pnpm exec tauri ios build --export-method app-store-connect \
      --config "{\"version\":\"$VERSION\",\"bundle\":{\"iOS\":{\"bundleVersion\":\"$BUILD\"}}}" --ci )
  unset IOS_CERTIFICATE IOS_CERTIFICATE_PASSWORD IOS_MOBILE_PROVISION
  IPA=$(find "$GEN/build" -name '*.ipa' -newer "$WORK" | head -1)
  [ -n "$IPA" ] || die "no .ipa produced (fallback: xcodebuild archive + -exportArchive, docs/RELEASING.md)"
  IPA_PLIST="$WORK/ipa-Info.plist"
  unzip -p "$IPA" 'Payload/*.app/Info.plist' > "$IPA_PLIST"
  IPA_VER=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$IPA_PLIST")
  IPA_BUILD=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$IPA_PLIST")
  IPA_FAMILY=$(/usr/libexec/PlistBuddy -c 'Print :UIDeviceFamily' "$IPA_PLIST" | tr -dc '0-9' | sed 's/./&,/g; s/,$//')
  echo "ipa: version $IPA_VER build $IPA_BUILD device family $IPA_FAMILY"
  [ "$IPA_VER" = "$VERSION" ] || die "the IPA says version $IPA_VER, expected $VERSION"
  [ "$IPA_BUILD" = "$BUILD" ] || echo "::warning::the IPA's CFBundleVersion is $IPA_BUILD, not $BUILD (App Review submission must use $IPA_BUILD)"
  cp "$IPA" "$OUT/TDJ-iOS.ipa"
  if [ "$UPLOAD" = 1 ]; then altool_upload "$OUT/TDJ-iOS.ipa" ios && UPLOADED+=("iOS ipa (iPhone + iPad) → TestFlight"); fi
fi

# ------------------------------------------------------------------ 4. optional: GitHub Release, store metadata
if [ "$GH_RELEASE" = 1 ] && want dmg; then
  step "GitHub Release v$VERSION"
  command -v gh >/dev/null && gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
  node scripts/release/release-notes.mjs --version "$VERSION" --build "$BUILD" --commit "$COMMIT" > "$OUT/release-notes.md"
  HEAD_SHA=$(git rev-parse HEAD)
  # idempotent and one version = one commit: reuse a draft (re-pointed at this commit, notes refreshed); refuse a
  # published release whose tag is another commit (bump the version instead of moving a shipped tag)
  if IS_DRAFT=$(gh release view "v$VERSION" -R "$REPO" --json isDraft --jq .isDraft 2>/dev/null); then
    if [ "$IS_DRAFT" = true ]; then
      gh release edit "v$VERSION" -R "$REPO" --target "$HEAD_SHA" --title "T-DJ $VERSION" --notes-file "$OUT/release-notes.md" >/dev/null
    else
      TAG_SHA=$(gh api "repos/$REPO/commits/v$VERSION" --jq .sha 2>/dev/null || true)
      [ "$TAG_SHA" = "$HEAD_SHA" ] || die "v$VERSION is already published from ${TAG_SHA:-another commit}; this is $HEAD_SHA (pnpm release:version <next>)"
    fi
  else
    gh release create "v$VERSION" -R "$REPO" --draft --target "$HEAD_SHA" --title "T-DJ $VERSION" \
      --notes-file "$OUT/release-notes.md"
  fi
  gh release upload "v$VERSION" -R "$REPO" --clobber "$OUT/T-DJ-macOS.dmg" "$OUT/T-DJ-$VERSION-macOS.dmg" "$OUT/TDJ-macOS.dmg" \
    "$OUT/TDJ-macOS.app.tar.gz" "$OUT/TDJ-macOS.app.tar.gz.sig" "$OUT/latest.json" "$OUT/SHA256SUMS"
  echo "draft release ready: publish it at https://github.com/$REPO/releases (the README button serves the newest published one)"
fi
if [ "$METADATA" = 1 ]; then
  step "Store metadata + screenshots (fastlane deliver)"
  (cd "$DESKTOP" && BUNDLE_PATH="$DRIVE/gems" bundle install --quiet && \
    BUNDLE_PATH="$DRIVE/gems" bundle exec fastlane ios metadata && BUNDLE_PATH="$DRIVE/gems" bundle exec fastlane mac metadata)
fi

step "Done in $(( ($(date +%s) - T0) / 60 )) min"
ls -lh "$OUT"
for u in "${UPLOADED[@]:-}"; do [ -n "$u" ] && echo "✓ $u (processing takes 5–30 min; then it appears in TestFlight)"; done
if [ "${#FAILED_UPLOADS[@]}" -gt 0 ]; then die "upload to App Store Connect failed: ${FAILED_UPLOADS[*]}"; fi
echo "Build number $BUILD, version $VERSION, commit $COMMIT. Outputs: $OUT"
