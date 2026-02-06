#!/usr/bin/env bash
set -euo pipefail

# Downloads Sparkle's developer tools (generate_appcast, sign_update, generate_keys, etc)
# into a user cache directory so it is not committed.

SPARKLE_VERSION="${SPARKLE_VERSION:-2.8.1}"
CACHE_DIR="${SPARKLE_TOOLS_DIR:-$HOME/Library/Caches/starbeam/sparkle-tools/$SPARKLE_VERSION}"
ZIP_URL="https://github.com/sparkle-project/Sparkle/releases/download/${SPARKLE_VERSION}/Sparkle-for-Developers.zip"

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

ZIP_PATH="$TMP/Sparkle-for-Developers.zip"

echo "Downloading Sparkle tools $SPARKLE_VERSION…"
curl -L --fail --silent --show-error "$ZIP_URL" -o "$ZIP_PATH"

echo "Extracting…"
unzip -q "$ZIP_PATH" -d "$TMP/extracted"

# The zip contains a Sparkle.framework plus a bin/ directory with tooling.
# Copy only what we need.
if [[ ! -d "$TMP/extracted/bin" ]]; then
  echo "Unexpected Sparkle-for-Developers layout (missing bin/)." >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"
cp -R "$TMP/extracted/bin" "$CACHE_DIR/"

# Some tools rely on bundled frameworks in Sparkle.framework.
if [[ -d "$TMP/extracted/Sparkle.framework" ]]; then
  cp -R "$TMP/extracted/Sparkle.framework" "$CACHE_DIR/"
fi

echo "Sparkle tools installed: $CACHE_DIR"
