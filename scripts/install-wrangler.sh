#!/usr/bin/env bash
# Installs Node.js (via nvm, if missing) and Wrangler, Cloudflare's CLI.
# Safe to re-run: skips anything already present.
set -euo pipefail

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
MIN_NODE_MAJOR=20   # wrangler v3+ needs Node 18+, we target current LTS

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

# Load nvm into this shell if it's already installed.
# nvm.sh references unset variables, so relax `set -eu` while sourcing it.
load_nvm() {
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    set +eu
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    set -eu
    return 0
  fi
  return 1
}

# Run an nvm command with `set -eu` relaxed (nvm trips both).
nvm_run() {
  set +eu
  nvm "$@"
  local rc=$?
  set -eu
  return $rc
}

node_major() {
  command -v node >/dev/null 2>&1 || return 1
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null
}

# 1. Ensure a recent Node is available.
current_major="$(node_major || echo 0)"
if [ "${current_major:-0}" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
  log "Node $(node --version) already present."
else
  log "Node missing or too old (need >= ${MIN_NODE_MAJOR}). Setting up via nvm..."

  if ! load_nvm; then
    log "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
    load_nvm || { echo "Failed to load nvm after install." >&2; exit 1; }
  fi

  log "Installing Node LTS..."
  nvm_run install --lts
  nvm_run use --lts
fi

log "Using node $(node --version), npm $(npm --version)"

# 2. Install wrangler globally.
if command -v wrangler >/dev/null 2>&1; then
  log "Wrangler already installed: $(wrangler --version)"
  log "Upgrading to latest..."
fi
npm install -g wrangler@latest

log "Done. Wrangler version: $(wrangler --version)"
cat <<'EOF'

Next steps:
  wrangler login                                  # authenticate with Cloudflare
  wrangler pages deploy <output-dir> \
      --project-name=taaluma                      # deploy the built site

If `wrangler` is not found in a new terminal, add nvm to your shell rc:
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
EOF
