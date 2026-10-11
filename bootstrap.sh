#!/usr/bin/env bash
# bootstrap.sh — one development setup for every tool and environment.
#
#   ./bootstrap.sh [web|mobile|all] [--env-file FILE]      (default: all)
#
# Called by the Claude Code SessionStart hook (.claude/hooks/session-start.sh),
# by a Codex or Claude cloud environment's setup script, or by hand on a fresh
# clone. Keep the logic here; callers should stay one line.
#
# ── What it does ──────────────────────────────────────────────────────────
#
# 1. Finds the Node major in .nvmrc: the Node already on PATH, else nvm, else a
#    known install directory (/opt/node20 in cloud containers, Homebrew's
#    node@20). Fails, rather than continuing, if none matches: installing on
#    the wrong Node resolves a different dependency graph than CI (see
#    guard-node in the Makefile).
# 2. Runs `npm ci` in each app only when its lockfile or the Node version has
#    changed since the last run here. A stamp in node_modules records both, so
#    resumes and repeat calls cost a hash, not an install. `npm ci` never takes
#    --legacy-peer-deps (see eddy-ios/README.md).
# 3. For mobile, makes sure Python has `pathspec` for the .easignore check.
# 4. With --env-file, appends one `export PATH=...` line (once) so LATER shells
#    get the same Node. Running `nvm use` inside a hook or setup script changes
#    only that process; Claude passes $CLAUDE_ENV_FILE, Codex can pass
#    ~/.bashrc.
#
# Progress goes to stderr; stdout is a single summary line, because a
# SessionStart hook's stdout is added to the session's context.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="all"
ENV_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    web|mobile|all) TARGET="$1" ;;
    --env-file) ENV_FILE="${2:-}"; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "bootstrap: unknown argument '$1'" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "bootstrap: $*" >&2; }

WANT="$(tr -d '[:space:]v' < "$ROOT/.nvmrc")"
WANT="${WANT%%.*}"

node_major() { "$1" -v 2>/dev/null | sed 's/^v//;s/\..*//'; }

resolve_node_bin() {
  local current candidate
  current="$(command -v node || true)"
  if [ -n "$current" ] && [ "$(node_major "$current")" = "$WANT" ]; then
    dirname "$current"; return
  fi
  local nvm_sh="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [ -s "$nvm_sh" ]; then
    # nvm.sh is not written for `set -u`.
    set +u
    # shellcheck disable=SC1090
    . "$nvm_sh" >/dev/null
    nvm install "$WANT" >/dev/null 2>&1 || true
    candidate="$(nvm which "$WANT" 2>/dev/null || true)"
    set -u
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      dirname "$candidate"; return
    fi
  fi
  for candidate in "/opt/node$WANT/bin" "/usr/local/opt/node@$WANT/bin" "/opt/homebrew/opt/node@$WANT/bin"; do
    if [ -x "$candidate/node" ] && [ "$(node_major "$candidate/node")" = "$WANT" ]; then
      echo "$candidate"; return
    fi
  done
  return 1
}

if ! NODE_BIN="$(resolve_node_bin)"; then
  log "no Node $WANT found (on PATH, via nvm, or in /opt/node$WANT). Install it: nvm install $WANT"
  exit 1
fi
export PATH="$NODE_BIN:$PATH"
log "using Node $(node -v) from $NODE_BIN"

install_app() {
  local dir="$ROOT/$1" stamp key
  stamp="$dir/node_modules/.eddy-bootstrap-stamp"
  key="$(node -v) $(sha256sum "$dir/package-lock.json" | cut -d' ' -f1)"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$key" ]; then
    log "$1: dependencies current, skipping npm ci"
    return
  fi
  log "$1: npm ci"
  (cd "$dir" && npm ci --no-audit --no-fund >&2)
  echo "$key" > "$stamp"
}

ensure_pathspec() {
  python3 -c 'import pathspec' 2>/dev/null && return
  log "installing Python pathspec for the .easignore check"
  # Same fallback as `make bundle-mobile`: the second form covers PEP 668.
  python3 -m pip install --quiet --user pathspec >&2 2>&1 \
    || python3 -m pip install --quiet --user --break-system-packages pathspec >&2 2>&1 \
    || log "could not install pathspec; check-easignore.py will refuse to run"
}

case "$TARGET" in
  web) install_app missouri-float-planner ;;
  mobile) install_app eddy-ios; ensure_pathspec ;;
  all) install_app missouri-float-planner; install_app eddy-ios; ensure_pathspec ;;
esac

if [ -n "$ENV_FILE" ]; then
  line="export PATH=\"$NODE_BIN:\$PATH\""
  touch "$ENV_FILE"
  grep -qxF "$line" "$ENV_FILE" || echo "$line" >> "$ENV_FILE"
fi

echo "bootstrap: Node $(node -v) ready, $TARGET dependencies installed; run make check-web / check-mobile from the repo root."
