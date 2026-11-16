#!/usr/bin/env bash
# T-DJ one-line self-deploy (docs/SELF_DEPLOY.md):
#
#   curl -fsSL https://raw.githubusercontent.com/ArioMoniri/TDJ/claude/admiring-curie-npzd0m/scripts/install.sh | bash
#
# What it does, in order (it prints this plan and asks before doing anything):
#   1. checks git, Node.js 22+ and corepack (it never installs system software and never runs sudo)
#   2. uses the TDJ checkout you are in, or clones TDJ into ./TDJ (or --dir PATH)
#   3. installs the dependencies with pnpm through corepack (no global install needed)
#   4. runs `tdj init` (asks stage, region, optional Spotify app) and then `tdj deploy` (your AWS account)
#
# Options (after `bash -s --` when piped):  --yes  --github  --dir PATH  --ref BRANCH  --dry-run  --help
#   curl -fsSL …/install.sh | bash -s -- --github        # deploy through your GitHub fork instead
# Windows: use WSL (https://learn.microsoft.com/windows/wsl/install) and run the line inside Ubuntu.
set -euo pipefail

REPO_URL="https://github.com/ArioMoniri/TDJ.git"
DIR=""
REF="${TDJ_REF:-}"
YES=0
DRY=0
TDJ_ARGS=()

say() { printf '%s\n' "$*"; }
bold() { if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then printf '\033[1m%s\033[0m\n' "$*"; else say "$*"; fi; }
fail() {
  printf '\n✗ %s\n' "$1" >&2
  shift
  for next in "$@"; do printf '  → %s\n' "$next" >&2; done
  exit 1
}
usage() {
  if [ -f "$0" ]; then
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  else
    say "Options: --yes --github --dir PATH --ref BRANCH --dry-run   (guide: docs/SELF_DEPLOY.md)"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    -y | --yes) YES=1; TDJ_ARGS+=("--yes") ;;
    --github) TDJ_ARGS+=("--github") ;;
    --dir) DIR="${2:?--dir needs a path}"; shift ;;
    --ref) REF="${2:?--ref needs a branch or tag}"; shift ;;
    --dry-run) DRY=1; TDJ_ARGS+=("--dry-run") ;;
    -h | --help) usage; exit 0 ;;
    *) fail "Unknown option: $1" "Options: --yes --github --dir PATH --ref BRANCH --dry-run" ;;
  esac
  shift
done

# Questions are read from the terminal even when the script itself arrives through a pipe.
TTY=""
if [ -r /dev/tty ] && { : </dev/tty; } 2>/dev/null; then TTY=/dev/tty; fi
ask_yes_no() { # $1 question; default No
  if [ "$YES" = 1 ]; then return 0; fi
  [ -n "$TTY" ] || fail "No terminal to ask on." "Run it again with --yes:  curl -fsSL … | bash -s -- --yes"
  local answer=""
  printf '%s [y/N] ' "$1"
  read -r answer <"$TTY" || true
  case "$answer" in y | Y | yes | YES) return 0 ;; *) return 1 ;; esac
}

# --- where the checkout is ---------------------------------------------------------------------------
in_checkout() { [ -f "$1/sst.config.ts" ] && [ -f "$1/packages/cli/bin/tdj.mjs" ]; }
if [ -z "$DIR" ]; then
  if in_checkout "$PWD"; then DIR="$PWD"; else DIR="$PWD/TDJ"; fi
fi
CLONE=1
if in_checkout "$DIR"; then CLONE=0; fi

cat <<'BANNER'

   ┌───────┐╱╲╱╲╱╲╱╲╱╲╱╲╱┌───────┐
   │ ● ● ● │ │ │ │ │ │ │ │ ● ● ● │
   │● ● ● ●│ │ │ │ │ │ │ │● ● ● ●│
   └───────┘╲╱╲╱╲╱╲╱╲╱╲╱╲└───────┘
   T-DJ · your own server, one line
   Developed by Ariorad Moniri

BANNER

bold "This will:"
if [ "$CLONE" = 1 ]; then
  say "  1. clone $REPO_URL${REF:+ (branch $REF)} into $DIR"
else
  say "  1. use the TDJ checkout in $DIR"
fi
say "  2. install its dependencies with pnpm (through corepack, inside that folder only)"
say "  3. run tdj init   (asks the stage, the AWS region and an optional Spotify app)"
say "  4. run tdj deploy (deploys to the AWS account you are signed in to; about \$0–1 a month idle)"
say "Nothing is installed system-wide and nothing runs with sudo."
say ""
ask_yes_no "Go ahead?" || { say "Stopped. Nothing was changed."; exit 0; }

# --- prerequisites -----------------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || fail "git is not installed." "Install it from https://git-scm.com/downloads, then run the line again."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed." "Install Node 22 LTS from https://nodejs.org (or: nvm install 22), then run the line again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $(node -v) is too old: T-DJ needs 22 or newer." "Install Node 22 LTS from https://nodejs.org (or: nvm install 22 && nvm use 22)."
if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  fail "Neither pnpm nor corepack was found." "Install pnpm (https://pnpm.io/installation) or a Node that ships corepack."
fi
if ! command -v aws >/dev/null 2>&1; then
  say "Note: the AWS CLI is not installed. tdj init will say how (or use --github to deploy through a fork)."
fi

run() {
  printf '$ %s\n' "$*"
  if [ "$DRY" = 1 ]; then return 0; fi
  "$@"
}

# --- 1. checkout -------------------------------------------------------------------------------------
if [ "$CLONE" = 1 ]; then
  if [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    fail "$DIR exists and is not a TDJ checkout." "Pass another folder: … | bash -s -- --dir ~/TDJ"
  fi
  if [ -n "$REF" ]; then
    run git clone --depth 1 --branch "$REF" "$REPO_URL" "$DIR"
  else
    run git clone --depth 1 "$REPO_URL" "$DIR"
  fi
fi
if [ "$DRY" = 0 ]; then cd "$DIR"; fi

# --- 2. dependencies ---------------------------------------------------------------------------------
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
run "${PNPM[@]}" install --frozen-lockfile

# --- 3 + 4. the CLI ----------------------------------------------------------------------------------
TDJ=(node packages/cli/bin/tdj.mjs)
if [ -n "$TTY" ] && [ "$DRY" = 0 ]; then
  "${TDJ[@]}" init "${TDJ_ARGS[@]}" <"$TTY"
  "${TDJ[@]}" deploy "${TDJ_ARGS[@]}" <"$TTY"
else
  run "${TDJ[@]}" init "${TDJ_ARGS[@]}"
  run "${TDJ[@]}" deploy "${TDJ_ARGS[@]}"
fi
say ""
say "Later: cd $DIR && pnpm tdj status   ·   pnpm tdj doctor   ·   pnpm tdj guide"
