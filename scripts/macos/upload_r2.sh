#!/usr/bin/env bash
set -euo pipefail

# Uploads the macOS release artifacts in dist/macos/ to the Cloudflare R2 bucket.
# This is meant to pair with scripts/macos/release_direct.sh.
#
# Expected local files:
# - dist/macos/Starbeam-<version>.dmg
# - dist/macos/Starbeam-<version>.zip
# - dist/macos/appcast.xml
#
# Remote layout (R2 object keys):
# - macos/appcast.xml
# - macos/Starbeam-<version>.dmg
# - macos/Starbeam-<version>.zip

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/dist/macos"
BUCKET="${R2_BUCKET:-starbeam-downloads}"
PREFIX="${R2_PREFIX:-macos}"

if [[ ! -f "$OUT_DIR/appcast.xml" ]]; then
  echo "Missing $OUT_DIR/appcast.xml (run scripts/macos/release_direct.sh with SPARKLE_PRIVATE_KEY)." >&2
  exit 1
fi

# Pick the newest dmg/zip in the output dir.
DMG="$(ls -t "$OUT_DIR"/*.dmg 2>/dev/null | head -n 1 || true)"
ZIP="$(ls -t "$OUT_DIR"/*.zip 2>/dev/null | head -n 1 || true)"

if [[ -z "$DMG" || -z "$ZIP" ]]; then
  echo "Missing .dmg or .zip in $OUT_DIR" >&2
  exit 1
fi

put() {
  local key="$1"
  local file="$2"
  echo "Uploading: r2://$BUCKET/$key"
  wrangler r2 object put "$BUCKET/$key" --file "$file" --content-type "$(file -b --mime-type "$file")"
}

put "$PREFIX/appcast.xml" "$OUT_DIR/appcast.xml"
put "$PREFIX/$(basename "$DMG")" "$DMG"
put "$PREFIX/$(basename "$ZIP")" "$ZIP"

echo "Done."
