# Secret Rotation: `STARB_TOKEN_ENC_KEY_B64`

This runbook rotates encrypted connector tokens and blob payloads to a new AES-256-GCM key.

## Scope

- DB-backed encrypted fields:
  - `GoogleConnection.accessTokenEnc`
  - `GoogleConnection.refreshTokenEnc`
  - `GitHubConnection.tokenEnc`
  - `LinearConnection.tokenEnc`
  - `NotionConnection.tokenEnc`
- Blob-store encrypted objects referenced by `Blob` rows (`deletedAt IS NULL`)

## Prerequisites

1. Generate a new 32-byte base64 key.
2. Keep the previous key available.
3. Ensure worker/runtime code with fallback decrypt support is deployed.
4. Ensure blob store credentials (`S3_*`) are present where you run rotation.

## Env Setup (Rotation Window)

Set these env vars on both web and worker:

- `STARB_TOKEN_ENC_KEY_B64=<NEW_KEY>`
- `STARB_TOKEN_ENC_KEY_B64_FALLBACK=<OLD_KEY>`

Notes:

- New writes always use `STARB_TOKEN_ENC_KEY_B64`.
- Fallback key is decrypt-only.
- If running locally against a non-local DB URL, set `STARB_ALLOW_REMOTE_DB=1`.

## Dry-Run

Run from repo root:

```bash
pnpm --filter @starbeam/worker rotate:enc-key
```

Or explicitly:

```bash
pnpm --filter @starbeam/worker exec tsx src/scripts/rotateEncKey.ts --dry-run
```

The script reports counts for each connector table and blobs:

- `scanned`
- `alreadyPrimary`
- `needsRotation`
- `rotated`
- `failed`

No writes occur in dry-run.

## Apply

```bash
pnpm --filter @starbeam/worker exec tsx src/scripts/rotateEncKey.ts --apply
```

The script re-encrypts rows/objects that still require the fallback key.

## Verification

1. Re-run dry-run and confirm `needsRotation=0` and `failed=0` across all sections.
2. Run worker tests/build:

```bash
pnpm --filter @starbeam/worker test
pnpm --filter @starbeam/worker build
```

3. Validate production logs for connector sync and blob reads (no decrypt errors).

## Finalize Rotation

After verification, remove fallback from env:

- unset `STARB_TOKEN_ENC_KEY_B64_FALLBACK`

Redeploy web + worker.

## Rollback

If issues occur before finalization:

1. Restore old key as primary:
   - `STARB_TOKEN_ENC_KEY_B64=<OLD_KEY>`
2. Keep new key as fallback (optional):
   - `STARB_TOKEN_ENC_KEY_B64_FALLBACK=<NEW_KEY>`
3. Redeploy.
