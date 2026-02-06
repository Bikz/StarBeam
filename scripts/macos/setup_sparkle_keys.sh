#!/usr/bin/env bash
set -euo pipefail

# Creates (or reuses) a Sparkle Ed25519 signing key in the macOS Keychain,
# exports the private key to a local file, and writes the public key into
# Starbeam's Info.plist.
#
# Safe to commit:
# - The public key is committed in Info.plist
# - The private key export is written to $HOME and must never be committed

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFO_PLIST="$ROOT/apps/macos/Starbeam/Starbeam/Info.plist"

ACCOUNT="${SPARKLE_KEY_ACCOUNT:-starbeam}"
KEY_DIR="${SPARKLE_KEY_DIR:-$HOME/.config/starbeam/sparkle}"
PRIVATE_KEY_FILE="${SPARKLE_PRIVATE_KEY_FILE:-$KEY_DIR/ed25519_private.key}"

mkdir -p "$KEY_DIR"

"$ROOT/scripts/macos/fetch_sparkle_tools.sh" >/dev/null
TOOLS_DIR="$($ROOT/scripts/macos/fetch_sparkle_tools.sh --print-dir)"
GEN_KEYS="$TOOLS_DIR/bin/generate_keys"

# Ensure a key exists in the keychain.
"$GEN_KEYS" --account "$ACCOUNT" >/dev/null

# Export the private key to a file for signing appcasts/updates.
if [[ ! -f "$PRIVATE_KEY_FILE" ]]; then
  "$GEN_KEYS" --account "$ACCOUNT" -x "$PRIVATE_KEY_FILE" >/dev/null
  chmod 600 "$PRIVATE_KEY_FILE"
fi

PUB="$($GEN_KEYS --account "$ACCOUNT" -p)"

# Update Info.plist with the public key.
/usr/libexec/PlistBuddy -c "Set :SUPublicEDKey $PUB" "$INFO_PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :SUPublicEDKey string $PUB" "$INFO_PLIST"

plutil -lint "$INFO_PLIST" >/dev/null

echo "Sparkle keys ready."
echo "- Public key written to: $INFO_PLIST"
echo "- Private key exported to: $PRIVATE_KEY_FILE"
echo "Next: run scripts/macos/release_direct.sh with:"
echo "  export SPARKLE_PRIVATE_KEY=\"$PRIVATE_KEY_FILE\""
