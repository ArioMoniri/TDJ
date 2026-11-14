#!/usr/bin/env bash
# Type-checks the macOS and iPadOS Rust code on Linux (no Xcode): `cargo check` never links, so the few C /
# Objective-C helper files of dependencies are replaced by empty objects from a stand-in compiler, and xcrun
# points at an empty SDK folder. Catches every Rust error in apple.rs and the cfg(target_os) branches; behaviour
# still needs a Mac. Usage: apps/desktop/scripts/check-apple.sh [macos|ios|all]
set -euo pipefail
cd "$(dirname "$0")/../src-tauri"
which="${1:-all}"
FAKE=$(mktemp -d)
trap 'rm -rf "$FAKE"' EXIT
mkdir -p "$FAKE/cc" "$FAKE/xcrun" "$FAKE/sdk"
cat > "$FAKE/cc/cc" <<'SH'
#!/usr/bin/env bash
out=""; prev=""
for a in "$@"; do
  [ "$prev" = "-o" ] && out="$a"
  case "$a" in -E) echo clang; echo gnu; exit 0 ;; -o?*) out="${a#-o}" ;; -Fo*) out="${a#-Fo}" ;; esac
  prev="$a"
done
[ -n "$out" ] && : > "$out"
exit 0
SH
printf '#!/bin/sh\necho %s\n' "$FAKE/sdk" > "$FAKE/xcrun/xcrun"
chmod +x "$FAKE/cc/cc" "$FAKE/xcrun/xcrun"
rustup target add aarch64-apple-darwin aarch64-apple-ios >/dev/null
if [ "$which" = macos ] || [ "$which" = all ]; then
  echo "▸ cargo check --target aarch64-apple-darwin --all-features"
  CC_aarch64_apple_darwin="$FAKE/cc/cc" CXX_aarch64_apple_darwin="$FAKE/cc/cc" AR_aarch64_apple_darwin=ar \
    cargo check --target aarch64-apple-darwin --all-features
  CC_aarch64_apple_darwin="$FAKE/cc/cc" CXX_aarch64_apple_darwin="$FAKE/cc/cc" AR_aarch64_apple_darwin=ar \
    TDJ_APP_STORE=1 cargo check --target aarch64-apple-darwin
fi
if [ "$which" = ios ] || [ "$which" = all ]; then
  echo "▸ cargo check --target aarch64-apple-ios"
  PATH="$FAKE/xcrun:$PATH" SDKROOT="$FAKE/sdk" CC_aarch64_apple_ios="$FAKE/cc/cc" CXX_aarch64_apple_ios="$FAKE/cc/cc" \
    AR_aarch64_apple_ios=ar TDJ_APP_STORE=1 cargo check --target aarch64-apple-ios
fi
