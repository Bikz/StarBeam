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

Sparkle uses an **Ed25519 signing keypair**:

- The **public key** is committed into the app's `Info.plist` as `SUPublicEDKey`
- The **private key** must stay secret and is used to sign the appcast / updates

We use Sparkle's `generate_keys` tool (downloaded locally) to generate a key in your **macOS Keychain**,
and export the private key to a local file for release automation.

#### Automated (recommended)

Run:

```bash
scripts/macos/setup_sparkle_keys.sh
```

This will:

1. Download Sparkle developer tools to `~/Library/Caches/starbeam/sparkle-tools/<version>`
2. Create/reuse a Keychain key under account `starbeam`
3. Export the private key to `~/.config/starbeam/sparkle/ed25519_private.key`
4. Write the public key into `apps/macos/Starbeam/Starbeam/Info.plist`

#### Manual (if needed)

In `apps/macos/Starbeam/Starbeam/Info.plist`, `SUPublicEDKey` must be set.

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
export SPARKLE_PRIVATE_KEY="$HOME/.config/starbeam/sparkle/ed25519_private.key"

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

### Cloudflare R2 (recommended)

We use a Cloudflare R2 bucket `starbeam-downloads` to host release artifacts.

1. Enable public access (dev URL is fine for early testing):

```bash
wrangler r2 bucket dev-url enable starbeam-downloads
wrangler r2 bucket dev-url get starbeam-downloads
```

2. When `starbeamhq.com` is added to your Cloudflare account, bind the custom domain:

```bash
# Find your Zone ID in the Cloudflare dashboard for starbeamhq.com
scripts/macos/bind_r2_domain.sh <zone-id>
```

3. Upload release artifacts:

```bash
scripts/macos/upload_r2.sh
```

Notes:
- If `downloads.starbeamhq.com` is not yet active, Sparkle updates will not work.
- You can temporarily point `SUFeedURL` to the bucket's `r2.dev` URL for testing.
