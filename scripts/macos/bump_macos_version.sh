#!/usr/bin/env bash
set -euo pipefail

# Bumps the macOS app version in the Xcode project.
#
# - MARKETING_VERSION: semver (e.g. 0.1.0)
# - CURRENT_PROJECT_VERSION: build number (integer)
#
# Usage:
#   scripts/macos/bump_macos_version.sh minor
#   scripts/macos/bump_macos_version.sh patch
#   scripts/macos/bump_macos_version.sh major

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PBXPROJ="$ROOT/apps/macos/Starbeam/Starbeam.xcodeproj/project.pbxproj"
GEN_RB="$ROOT/apps/macos/Starbeam/scripts/generate_xcodeproj.rb"

KIND="${1:-minor}"
if [[ "$KIND" != "major" && "$KIND" != "minor" && "$KIND" != "patch" ]]; then
  echo "Unknown bump kind: $KIND (expected major|minor|patch)" >&2
  exit 1
fi

current_version="$(
  rg -n "MARKETING_VERSION = " "$PBXPROJ" | head -n 1 | sed -E 's/.*MARKETING_VERSION = ([0-9]+\.[0-9]+\.[0-9]+);/\1/'
)"
if [[ ! "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Could not parse MARKETING_VERSION from $PBXPROJ" >&2
  exit 1
fi

IFS='.' read -r major minor patch <<<"$current_version"
case "$KIND" in
  major)
    major=$((major + 1))
    minor=0
    patch=0
    ;;
  minor)
    minor=$((minor + 1))
    patch=0
    ;;
  patch)
    patch=$((patch + 1))
    ;;
esac

new_version="$major.$minor.$patch"

current_build="$(
  rg -n "CURRENT_PROJECT_VERSION = " "$PBXPROJ" | head -n 1 | sed -E 's/.*CURRENT_PROJECT_VERSION = ([0-9]+);/\1/'
)"
if [[ ! "$current_build" =~ ^[0-9]+$ ]]; then
  echo "Could not parse CURRENT_PROJECT_VERSION from $PBXPROJ" >&2
  exit 1
fi
new_build=$((current_build + 1))

# Update all occurrences (Debug/Release).
perl -pi -e "s/MARKETING_VERSION = \\Q${current_version}\\E;/MARKETING_VERSION = ${new_version};/g" "$PBXPROJ"
perl -pi -e "s/CURRENT_PROJECT_VERSION = \\Q${current_build}\\E;/CURRENT_PROJECT_VERSION = ${new_build};/g" "$PBXPROJ"

# Keep generator script in sync (used by contributors).
perl -pi -e "s/(MARKETING_VERSION'\\] = ')\\Q${current_version}\\E(')/\\$1${new_version}\\$2/g" "$GEN_RB"
perl -pi -e "s/(CURRENT_PROJECT_VERSION'\\] = ')\\Q${current_build}\\E(')/\\$1${new_build}\\$2/g" "$GEN_RB" || true

# Sanity check.
rg -n "MARKETING_VERSION = ${new_version};" "$PBXPROJ" >/dev/null
rg -n "CURRENT_PROJECT_VERSION = ${new_build};" "$PBXPROJ" >/dev/null

echo "Bumped macOS version: $current_version ($current_build) -> $new_version ($new_build)"

