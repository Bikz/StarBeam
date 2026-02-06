#!/usr/bin/env bash
set -euo pipefail

# Downloads Sparkle's developer tools (generate_appcast, sign_update, generate_keys, etc)
# into a user cache directory so it is not committed.

SPARKLE_VERSION="${SPARKLE_VERSION:-2.8.1}"
CACHE_DIR="${SPARKLE_TOOLS_DIR:-$HOME/Library/Caches/starbeam/sparkle-tools/$SPARKLE_VERSION}"
ARCHIVE_URL="https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-${SPARKLE_VERSION}.tar.xz"

if [[ "${1:-}" == "--print-dir" ]]; then
  echo "$CACHE_DIR"
  exit 0
fi

if [[ -x "$CACHE_DIR/bin/generate_appcast" ]]; then
  echo "Sparkle tools already present: $CACHE_DIR"
  exit 0
fi

mkdir -p "$CACHE_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ARCHIVE_PATH="$TMP/Sparkle-${SPARKLE_VERSION}.tar.xz"

echo "Downloading Sparkle tools $SPARKLE_VERSION..."
curl -L --fail --silent --show-error "$ARCHIVE_URL" -o "$ARCHIVE_PATH"

echo "Extracting..."
mkdir -p "$TMP/extracted"
tar -xJf "$ARCHIVE_PATH" -C "$TMP/extracted"

# The archive contains a Sparkle.framework plus a bin/ directory with tooling.
# Copy only what we need.
if [[ ! -d "$TMP/extracted/bin" ]]; then
  echo "Unexpected Sparkle archive layout (missing bin/)." >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"
cp -R "$TMP/extracted/bin" "$CACHE_DIR/"

# Some tools rely on bundled frameworks in Sparkle.framework.
if [[ -d "$TMP/extracted/Sparkle.framework" ]]; then
  cp -R "$TMP/extracted/Sparkle.framework" "$CACHE_DIR/"
fi

echo "Sparkle tools installed: $CACHE_DIR"
