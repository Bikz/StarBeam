# macOS Releasing (Direct Download)

This repo ships a macOS **menu bar app** (`Starbeam.app`). For direct downloads, we use:

- **Developer ID** signing + notarization (Apple Gatekeeper compatible)
- **Sparkle 2** for update checks (download silently, ask before install)

App Store distribution is intentionally not set up yet (Sparkle cannot be used in App Store builds).

## Prereqs

1. Xcode (macOS 15+ supported)
2. A **Developer ID Application** signing identity installed in your keychain.
3. Notarization credentials set up via `notarytool`.
4. (Optional) Sparkle Ed25519 signing key for appcast/update signatures.

## One-time setup

### 1) Notarytool keychain profile

Create a keychain profile (recommended):

```bash
xcrun notarytool store-credentials "starbeam-notary" \
  --apple-id "you@starbeamhq.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "APP_SPECIFIC_PASSWORD"
```

Then export:

```bash
export NOTARY_PROFILE=starbeam-notary
```

### 2) Sparkle public key

In `apps/macos/Starbeam/Starbeam/Info.plist` there is a placeholder:

- `SUPublicEDKey`: `REPLACE_ME_WITH_SPARKLE_PUBLIC_KEY`

To generate keys, download Sparkle tools and run `generate_keys`:

```bash
scripts/macos/fetch_sparkle_tools.sh
TOOLS_DIR="$(scripts/macos/fetch_sparkle_tools.sh --print-dir)"
"$TOOLS_DIR/bin/generate_keys"
```

Keep the **private key** secret (do not commit it). Put the **public key** value into `SUPublicEDKey`.

## Build + sign + notarize

From repo root:

```bash
export DEVELOPER_ID_APP='Developer ID Application: Your Company (TEAMID)'
export NOTARY_PROFILE=starbeam-notary

# Optional (enables appcast generation):
export SPARKLE_PRIVATE_KEY="$HOME/.config/starbeam/sparkle_ed25519_private.key"

scripts/macos/release_direct.sh
```

Outputs:

- `dist/macos/Starbeam-<version>.dmg` (first install)
- `dist/macos/Starbeam-<version>.zip` (Sparkle update payload)
- `dist/macos/appcast.xml` (if Sparkle private key provided)

## Hosting

For real updates you must host:

- `Starbeam-<version>.zip`
- `appcast.xml`

at the same origin as `SUFeedURL`, typically:

- `https://downloads.starbeamhq.com/macos/`

