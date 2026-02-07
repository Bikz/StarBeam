#!/usr/bin/env bash
set -euo pipefail

# Builds a direct-download Starbeam.app, signs it (Developer ID), notarizes, and emits:
# - dist/macos/Starbeam-<version>.dmg (first install)
# - dist/macos/Starbeam-<version>.zip (Sparkle update payload)
# - dist/macos/appcast.xml (Sparkle feed, if signing key provided)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="$ROOT/apps/macos/Starbeam/Starbeam.xcodeproj"
SCHEME="Starbeam"
CONFIGURATION="Release"
APP_NAME="Starbeam"
ENTITLEMENTS="$ROOT/apps/macos/Starbeam/Starbeam/Starbeam.entitlements"

OUT_DIR="$ROOT/dist/macos"
BUILD_DIR="$OUT_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/$APP_NAME.xcarchive"
UPDATES_DIR="$OUT_DIR/updates"

DEVELOPER_ID_APP="${DEVELOPER_ID_APP:-}"
NOTARY_PROFILE="${NOTARY_PROFILE:-}"
SPARKLE_PRIVATE_KEY="${SPARKLE_PRIVATE_KEY:-}"

mkdir -p "$OUT_DIR" "$BUILD_DIR"
mkdir -p "$UPDATES_DIR"

if [[ -z "$DEVELOPER_ID_APP" ]]; then
  echo "Missing DEVELOPER_ID_APP (e.g. 'Developer ID Application: Starbeam Inc (TEAMID)')" >&2
  exit 1
fi

# 1) Build unsigned archive (we sign manually so CI/dev machines don't need Xcode signing setup)
echo "Archiving (unsigned)…"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -sdk macosx \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  archive \
  | sed -n '1,80p'

APP_PATH="$ARCHIVE_PATH/Products/Applications/$APP_NAME.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Archive missing app at: $APP_PATH" >&2
  exit 1
fi

VERSION_SHORT="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
VERSION_BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Contents/Info.plist")"
VERSION="$VERSION_SHORT"

DMG_PATH="$OUT_DIR/$APP_NAME-$VERSION.dmg"
ZIP_PATH="$UPDATES_DIR/$APP_NAME-$VERSION.zip"
APPCAST_PATH="$OUT_DIR/appcast.xml"

# 2) Sign nested components first (frameworks, XPC services, helpers), then the app.
sign_one() {
  local target="$1"
  /usr/bin/codesign --force --options runtime --timestamp --sign "$DEVELOPER_ID_APP" "$target"
}

sign_nested() {
  local base="$1"

  # Signing order matters. For example, Sparkle.framework contains nested .app and .xpc bundles.
  # If you sign the framework first, then sign nested bundles, the framework signature becomes invalid.
  # We therefore sign deepest bundles first, then frameworks, then the app.

  # 1) Plug-ins (.appex)
  if [[ -d "$base/Contents/PlugIns" ]]; then
    while IFS= read -r -d '' item; do
      sign_one "$item"
    done < <(find "$base/Contents/PlugIns" -type d -name "*.appex" -print0)
  fi

  # 2) Nested .xpc/.app anywhere under Frameworks (deepest first)
  if [[ -d "$base/Contents/Frameworks" ]]; then
    # Some frameworks (notably Sparkle.framework) embed standalone helper executables
    # under Versions/* (e.g. Autoupdate) that are not bundles. These must be signed
    # explicitly before the enclosing framework is signed, otherwise notarization
    # fails due to ad-hoc signatures.
    while IFS= read -r fw; do
      [[ -z "$fw" ]] && continue
      if [[ -d "$fw/Versions" ]]; then
        while IFS= read -r bin; do
          [[ -z "$bin" ]] && continue
          sign_one "$bin"
        done < <(find "$fw/Versions" -maxdepth 2 -type f -perm -111 -print 2>/dev/null || true)
      fi
    done < <(find "$base/Contents/Frameworks" -maxdepth 1 -type d -name "*.framework" -print)

    while IFS= read -r item; do
      [[ -z "$item" ]] && continue
      sign_one "$item"
    done < <(find "$base/Contents/Frameworks" -type d \( -name "*.xpc" -o -name "*.app" \) -print | awk '{ print length, $0 }' | sort -nr | cut -d" " -f2-)

    # 3) Frameworks last
    while IFS= read -r item; do
      [[ -z "$item" ]] && continue
      sign_one "$item"
    done < <(find "$base/Contents/Frameworks" -maxdepth 1 -type d -name "*.framework" -print)

    # 4) Any top-level dylibs/bundles in Frameworks
    while IFS= read -r item; do
      [[ -z "$item" ]] && continue
      sign_one "$item"
    done < <(find "$base/Contents/Frameworks" -maxdepth 1 \( -name "*.dylib" -o -name "*.bundle" \) -print)
  fi

  # 5) App-level XPC services
  if [[ -d "$base/Contents/XPCServices" ]]; then
    while IFS= read -r -d '' item; do
      sign_one "$item"
    done < <(find "$base/Contents/XPCServices" -type d -name "*.xpc" -print0)
  fi
}

echo "Signing…"
sign_nested "$APP_PATH"
/usr/bin/codesign --force --options runtime --timestamp --entitlements "$ENTITLEMENTS" --sign "$DEVELOPER_ID_APP" "$APP_PATH"

/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP_PATH"

# 3) Build Sparkle update zip
# Sparkle expects the zip to contain the .app bundle at the root.
echo "Creating update zip…"
rm -f "$ZIP_PATH"
(
  cd "$(dirname "$APP_PATH")"
  ditto -c -k --keepParent "$APP_NAME.app" "$ZIP_PATH"
)

# 4) Build a DMG for first-install
# Keep DMG layout simple for now (drag-drop UI can be added later).
echo "Creating DMG…"
rm -f "$DMG_PATH"
DMG_STAGING="$BUILD_DIR/dmg-staging"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"
cp -R "$APP_PATH" "$DMG_STAGING/"

hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$DMG_STAGING" \
  -ov \
  -format UDZO \
  "$DMG_PATH" \
  >/dev/null

# 5) Notarize + staple (optional but strongly recommended for distribution)
if [[ -n "$NOTARY_PROFILE" ]]; then
  echo "Notarizing DMG…"
  xcrun notarytool submit "$DMG_PATH" --keychain-profile "$NOTARY_PROFILE" --wait

  echo "Stapling…"
  xcrun stapler staple "$APP_PATH" >/dev/null
  xcrun stapler staple "$DMG_PATH" >/dev/null
else
  echo "Skipping notarization: set NOTARY_PROFILE to a notarytool keychain profile name." >&2
fi

# 6) Generate appcast (optional; requires Sparkle tools + private key)
# Private key must NOT be committed.
if [[ -n "$SPARKLE_PRIVATE_KEY" ]]; then
  echo "Generating appcast…"
  "$ROOT/scripts/macos/fetch_sparkle_tools.sh" >/dev/null
  TOOLS_DIR="$($ROOT/scripts/macos/fetch_sparkle_tools.sh --print-dir)"

  # Sparkle's generate_appcast will sign updates when provided an EdDSA private key.
  "$TOOLS_DIR/bin/generate_appcast" \
    --ed-key-file "$SPARKLE_PRIVATE_KEY" \
    --download-url-prefix "https://downloads.starbeamhq.com/macos/" \
    -o "$APPCAST_PATH" \
    "$UPDATES_DIR"

  echo "Wrote appcast: $APPCAST_PATH"
else
  echo "Skipping appcast generation: set SPARKLE_PRIVATE_KEY to an Ed25519 private key file." >&2
fi

echo "Done:"
echo "- $DMG_PATH"
echo "- $ZIP_PATH"
[[ -f "$APPCAST_PATH" ]] && echo "- $APPCAST_PATH"
