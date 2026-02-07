#!/usr/bin/env python3

"""
Set email-related env vars on the Render web service (production by default).

This intentionally updates ONLY SMTP/Email keys (does not touch DATABASE_URL, auth, etc).

Auth:
  - Uses Render CLI login credentials in ~/.render/cli.yaml (created by `render login`)
  - Or set RENDER_API_KEY and RENDER_API_HOST.

Inputs:
  - Reads from .env.local (repo root) first, then .env.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

DEFAULT_ENV_ID = "evm-d62i8ce3jp1c73bo37m0"  # StarBeam -> Production
DEFAULT_WEB_NAME = "starbeam-web"


def _read_render_cli_yaml() -> dict[str, str]:
    cfg_path = Path.home() / ".render" / "cli.yaml"
    raw = cfg_path.read_text().splitlines()

    def get(prefix: str) -> str | None:
        for line in raw:
            if line.strip().startswith(prefix + ":"):
                return line.split(":", 1)[1].strip()
        return None

    workspace = get("workspace")
    host = None
    key = None
    for line in raw:
        if line.strip().startswith("host:"):
            host = line.split(":", 1)[1].strip()
        if line.strip().startswith("key:") and line.startswith("    "):
            key = line.split(":", 1)[1].strip()

    if not workspace or not host or not key:
        raise RuntimeError("Could not read Render credentials from ~/.render/cli.yaml")

    return {"workspace": workspace, "host": host.rstrip("/"), "key": key}


def _parse_env_file(path: Path) -> dict[str, str]:
    text = path.read_text() if path.exists() else ""
    kv: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line)
        if not m:
            continue
        kv[m.group(1)] = m.group(2).strip()
    return kv


def _api(host: str, key: str, method: str, path: str, body: object | None = None) -> object | None:
    url = f"{host}{path}"
    data = None
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            raw = resp.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Render API {method} {path} failed: HTTP {e.code}: {raw}") from e


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-id", default=DEFAULT_ENV_ID)
    ap.add_argument("--web-name", default=DEFAULT_WEB_NAME)
    args = ap.parse_args()

    cfg = _read_render_cli_yaml()
    host = os.environ.get("RENDER_API_HOST", cfg["host"])
    key = os.environ.get("RENDER_API_KEY", cfg["key"])

    kv = {}
    kv.update(_parse_env_file(Path(".env.local")))
    kv.update({k: v for k, v in _parse_env_file(Path(".env")).items() if k not in kv})

    # Email keys only.
    updates: dict[str, str] = {}
    for k in ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]:
        if kv.get(k):
            updates[k] = kv[k]
    if kv.get("EMAIL_FROM"):
        # Redundant alias so the Render startCommand can export EMAIL_FROM from this
        # even if EMAIL_FROM is blocked/removed in the future.
        updates["STARB_EMAIL_FROM"] = kv["EMAIL_FROM"]

    missing = [k for k in ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"] if not updates.get(k)]
    if missing:
        raise SystemExit(f"Missing required keys locally: {', '.join(missing)}")

    services = _api(host, key, "GET", "/services") or []
    assert isinstance(services, list)

    def find_service(name: str) -> dict[str, object] | None:
        for entry in services:
            if not isinstance(entry, dict):
                continue
            svc = entry.get("service") if "service" in entry else entry
            if not isinstance(svc, dict):
                continue
            if svc.get("name") == name and svc.get("environmentId") == args.env_id:
                return svc
        return None

    web = find_service(args.web_name)
    if not web:
        raise SystemExit("Web service not found for the given env-id/name.")

    service_id = str(web["id"])

    # Render env vars are paginated. Each item includes a per-item cursor; request
    # the next page by passing the last cursor.
    current: dict[str, str] = {}
    cursor: str | None = None
    last_cursor: str | None = None
    while True:
        path = f"/services/{service_id}/env-vars"
        if cursor:
            path = f"{path}?cursor={cursor}"

        current_items = _api(host, key, "GET", path) or []
        if not isinstance(current_items, list) or len(current_items) == 0:
            break

        for it in current_items:
            if not isinstance(it, dict):
                continue
            env_var = it.get("envVar")
            if not isinstance(env_var, dict):
                continue
            k = env_var.get("key")
            v = env_var.get("value")
            if isinstance(k, str) and isinstance(v, str):
                current[k] = v

        cursor = (
            current_items[-1].get("cursor") if isinstance(current_items[-1], dict) else None
        )
        if not isinstance(cursor, str) or not cursor or cursor == last_cursor:
            break
        last_cursor = cursor

    merged = dict(current)
    merged.update(updates)
    payload = [{"key": k, "value": v} for k, v in sorted(merged.items())]
    _api(host, key, "PUT", f"/services/{service_id}/env-vars", payload)

    # Kick a deploy (no cache clear).
    _api(host, key, "POST", f"/services/{service_id}/deploys", {"clearCache": "do_not_clear"})

    # Print only non-secret metadata.
    print(
        json.dumps(
            {
                "envId": args.env_id,
                "webServiceId": service_id,
                "updatedKeys": sorted(list(updates.keys())),
                "deployTriggered": True,
            },
            indent=2,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
