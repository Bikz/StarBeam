#!/usr/bin/env bash
set -euo pipefail

# End-to-end direct-download release (local):
# 1) bump version (default: minor)
# 2) build/sign/(optionally)notarize + generate appcast
# 3) upload to R2
# 4) verify URLs
#
# Required env:
# - DEVELOPER_ID_APP: codesign identity name (Developer ID recommended; Apple Development ok for local testing)
# - SPARKLE_PRIVATE_KEY: path to ed25519 private key file (never commit)
#
# Optional env:
# - NOTARY_PROFILE: notarytool keychain profile name
#
# Usage:
#   export DEVELOPER_ID_APP='Developer ID Application: Your Company (TEAMID)'
#   export SPARKLE_PRIVATE_KEY="$HOME/.config/starbeam/sparkle/ed25519_private.key"
#   export NOTARY_PROFILE=starbeam-notary
#   scripts/macos/cut_release.sh minor

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KIND="${1:-minor}"

: "${DEVELOPER_ID_APP:?Set DEVELOPER_ID_APP (codesign identity name).}"
: "${SPARKLE_PRIVATE_KEY:?Set SPARKLE_PRIVATE_KEY (path to ed25519 private key file).}"

PBXPROJ="$ROOT/apps/macos/Starbeam/Starbeam.xcodeproj/project.pbxproj"

# Ensure sparkle tools exist.
"$ROOT/scripts/macos/fetch_sparkle_tools.sh" >/dev/null

# Clean dist output so we can validate deterministically.
rm -rf "$ROOT/dist/macos" || true
mkdir -p "$ROOT/dist/macos"

# Bump version (also bumps build number).
"$ROOT/scripts/macos/bump_macos_version.sh" "$KIND"

NEW_VERSION="$(
  rg -n "MARKETING_VERSION = " "$PBXPROJ" | head -n 1 | sed -E 's/.*MARKETING_VERSION = ([0-9]+\.[0-9]+\.[0-9]+);/\1/'
)"

# Commit version bump so the build is reproducible.
git -C "$ROOT" add "$PBXPROJ" "$ROOT/apps/macos/Starbeam/scripts/generate_xcodeproj.rb"
# This repo runs monorepo-wide hooks on commit; for a release bump we only want to
# commit the version files even if other work is in progress locally.
git -C "$ROOT" commit --no-verify -m "chore(release): bump macOS to $NEW_VERSION" || true

# Build + sign/notarize + generate appcast.
"$ROOT/scripts/macos/release_direct.sh"

# Upload to R2.
"$ROOT/scripts/macos/upload_r2.sh"

# Verify.
BASE="https://downloads.starbeamhq.com/macos"
ZIP_URL="$BASE/Starbeam-$NEW_VERSION.zip"
DMG_URL="$BASE/Starbeam-$NEW_VERSION.dmg"
APPCAST_URL="$BASE/appcast.xml"

echo "Verifying appcast contains $NEW_VERSION..."
curl -fsS "$APPCAST_URL" | rg -n "$NEW_VERSION" >/dev/null

for u in "$ZIP_URL" "$DMG_URL"; do
  echo "HEAD $u"
  curl -fsSI "$u" | rg -n "^HTTP/" | head -n 1
  curl -fsSI "$u" | rg -n "content-length|content-type" || true
  echo ""
done

echo "Release OK: $NEW_VERSION"
