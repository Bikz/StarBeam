#!/usr/bin/env bash
set -euo pipefail

# Binds a custom domain (downloads.starbeamhq.com) to the Starbeam R2 bucket.
# Requires the Cloudflare Zone to already exist in the account you are logged into.

BUCKET="${R2_BUCKET:-starbeam-downloads}"
DOMAIN="${R2_DOMAIN:-downloads.starbeamhq.com}"
ZONE_ID="${CF_ZONE_ID:-${1:-}}"

if [[ -z "$ZONE_ID" ]]; then
  echo "Missing zone id. Usage:" >&2
  echo "  scripts/macos/bind_r2_domain.sh <zone-id>" >&2
  echo "Or set CF_ZONE_ID env var." >&2
  exit 1
fi

echo "Binding $DOMAIN -> r2://$BUCKET (zone=$ZONE_ID)"
wrangler r2 bucket domain add "$BUCKET" --domain "$DOMAIN" --zone-id "$ZONE_ID" --min-tls 1.2 --force
wrangler r2 bucket domain list "$BUCKET"
