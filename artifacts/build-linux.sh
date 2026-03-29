#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Build Agent Bar Hangout desktop app for Linux
# ──────────────────────────────────────────────
# Prerequisites: Node.js 18+, Rust/Cargo 1.77.2+,
#   and Tauri Linux dependencies:
#   sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
#     libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
# ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BUILDS_DIR="$SCRIPT_DIR/builds"

echo "=== Agent Bar Hangout — Linux Build ==="
echo "Repo root: $REPO_ROOT"

# [1/5] Check prerequisites
echo -e "\n[1/5] Checking prerequisites..."

if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js not found. Install from https://nodejs.org/" >&2
    exit 1
fi
echo "  Node.js: $(node --version)"

if ! command -v cargo &>/dev/null; then
    # Try sourcing cargo env
    [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
    if ! command -v cargo &>/dev/null; then
        echo "ERROR: Rust/Cargo not found. Install from https://rustup.rs/" >&2
        exit 1
    fi
fi
echo "  Cargo: $(cargo --version)"

# [2/5] Install npm dependencies
echo -e "\n[2/5] Installing npm dependencies..."
cd "$REPO_ROOT"
npm install --prefer-offline 2>&1 | tail -1
echo "  npm install complete."

# [3/5] Build with Tauri
echo -e "\n[3/5] Building Tauri application..."
cd "$REPO_ROOT"
npm run tauri:build 2>&1 | sed 's/^/  /'

# [4/5] Copy artifacts
echo -e "\n[4/5] Copying build artifacts..."
mkdir -p "$BUILDS_DIR"

BUNDLE_DIR="$REPO_ROOT/src-tauri/target/release/bundle"

# .deb package
if [ -d "$BUNDLE_DIR/deb" ]; then
    find "$BUNDLE_DIR/deb" -name "*.deb" -exec cp {} "$BUILDS_DIR/" \; -exec echo "  Copied: {}" \;
fi

# .rpm package
if [ -d "$BUNDLE_DIR/rpm" ]; then
    find "$BUNDLE_DIR/rpm" -name "*.rpm" -exec cp {} "$BUILDS_DIR/" \; -exec echo "  Copied: {}" \;
fi

# AppImage
if [ -d "$BUNDLE_DIR/appimage" ]; then
    find "$BUNDLE_DIR/appimage" -name "*.AppImage" -exec cp {} "$BUILDS_DIR/" \; -exec echo "  Copied: {}" \;
fi

# [5/5] Summary
echo -e "\n[5/5] Build complete!"
echo ""
echo "Build artifacts in $BUILDS_DIR :"
for f in "$BUILDS_DIR"/*; do
    [ "$(basename "$f")" = ".gitkeep" ] && continue
    [ -f "$f" ] || continue
    size=$(du -h "$f" | cut -f1)
    echo "  $(basename "$f")  ($size)"
done
