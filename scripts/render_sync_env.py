#!/usr/bin/env python3

"""
Sync local .env (gitignored) values into Render services.

Defaults are wired for the StarBeam production environment + services:
  - starbeam-web (web_service)
  - starbeam-worker (background_worker)

Auth:
  - uses Render CLI login credentials in ~/.render/cli.yaml (created by `render login`)
  - or you can set RENDER_API_KEY and RENDER_API_HOST (optional)

This script is additive: it merges keys into existing service env vars and does not
wipe unknown keys.

Note: updating env vars on Render may already trigger a deploy depending on how the
service is configured. To avoid accidental overlapping deploys (duplicate builds),
this script does NOT explicitly trigger deploys by default. Use --deploy if you
want it to.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import secrets
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


DEFAULT_ENV_ID = "evm-d62i8ce3jp1c73bo37m0"  # StarBeam -> Production
DEFAULT_WEB_NAME = "starbeam-web"
DEFAULT_WORKER_NAME = "starbeam-worker"


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
        kv[m.group(1)] = m.group(2)
    return kv


def _ensure_enc_key_in_env(path: Path, kv: dict[str, str]) -> None:
    if kv.get("STARB_TOKEN_ENC_KEY_B64"):
        return
    kv["STARB_TOKEN_ENC_KEY_B64"] = base64.b64encode(secrets.token_bytes(32)).decode("ascii")

    existing = path.read_text() if path.exists() else ""
    lines = existing.splitlines()
    out: list[str] = []
    found = False
    for line in lines:
        if re.match(r"^\s*STARB_TOKEN_ENC_KEY_B64\s*=", line):
            out.append("STARB_TOKEN_ENC_KEY_B64=" + kv["STARB_TOKEN_ENC_KEY_B64"])
            found = True
        else:
            out.append(line)
    if not found:
        if out and out[-1].strip() != "":
            out.append("")
        out.append("STARB_TOKEN_ENC_KEY_B64=" + kv["STARB_TOKEN_ENC_KEY_B64"])
    path.write_text("\n".join(out) + "\n")


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
    ap.add_argument("--worker-name", default=DEFAULT_WORKER_NAME)
    ap.add_argument(
        "--deploy",
        action="store_true",
        help="Trigger a deploy after updating env vars (disabled by default to avoid overlapping deploys).",
    )
    args = ap.parse_args()

    cfg = _read_render_cli_yaml()
    host = os.environ.get("RENDER_API_HOST", cfg["host"])
    key = os.environ.get("RENDER_API_KEY", cfg["key"])

    # Prefer .env.local for local overrides; fall back to .env for the rest.
    env_path = Path(".env")
    env_local_path = Path(".env.local")

    kv = _parse_env_file(env_path)
    kv_local = _parse_env_file(env_local_path)
    for k, v in kv_local.items():
        kv[k] = v
    if not kv.get("DATABASE_URL"):
        raise SystemExit("Missing DATABASE_URL in .env")
    if not kv.get("DIRECT_DATABASE_URL"):
        raise SystemExit(
            "Missing DIRECT_DATABASE_URL in .env (Neon direct/non-pooler connection string). "
            "This is required for Prisma migrations on Render."
        )

    _ensure_enc_key_in_env(env_path, kv)

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
    worker = find_service(args.worker_name)
    if not web or not worker:
        raise SystemExit(
            "Expected services not found. Create them first (Render Blueprint or API)."
        )

    def get_env_vars(service_id: str) -> dict[str, str]:
        current: dict[str, str] = {}

        # Render env vars are paginated. Items include a per-item cursor; request the
        # next page by passing the last cursor.
        cursor: str | None = None
        last_cursor: str | None = None
        while True:
            path = f"/services/{service_id}/env-vars"
            if cursor:
                path = f"{path}?cursor={cursor}"

            items = _api(host, key, "GET", path) or []
            if not isinstance(items, list) or len(items) == 0:
                break

            for it in items:
                if not isinstance(it, dict):
                    continue
                env_var = it.get("envVar")
                if not isinstance(env_var, dict):
                    continue
                k = env_var.get("key")
                v = env_var.get("value")
                if isinstance(k, str) and isinstance(v, str):
                    current[k] = v

            cursor = items[-1].get("cursor") if isinstance(items[-1], dict) else None
            if not isinstance(cursor, str) or not cursor or cursor == last_cursor:
                break
            last_cursor = cursor

        return current

    def put_env_vars(service_id: str, updates: dict[str, str]) -> list[str]:
        current = get_env_vars(service_id)
        merged = dict(current)
        changed: list[str] = []

        for k, v in updates.items():
            if not v:
                continue
            if current.get(k) != v:
                changed.append(k)
            merged[k] = v

        if not changed:
            return []

        payload = [{"key": k, "value": v} for k, v in sorted(merged.items())]
        _api(host, key, "PUT", f"/services/{service_id}/env-vars", payload)
        return sorted(changed)

    common = {
        "NODE_ENV": "production",
        "STARB_TOKEN_ENC_KEY_B64": kv.get("STARB_TOKEN_ENC_KEY_B64", ""),
    }

    web_env = dict(common)
    # Render web services can be finicky about certain key names. We keep the
    # canonical DB URL in STARB_DATABASE_URL and export DATABASE_URL in the
    # service startCommand.
    web_env["STARB_DATABASE_URL"] = kv.get("DATABASE_URL", "")
    web_env["DIRECT_DATABASE_URL"] = kv.get("DIRECT_DATABASE_URL", "")
    for k in [
        "NEXTAUTH_URL",
        "NEXTAUTH_SECRET",
        "NEXT_PUBLIC_WEB_ORIGIN",
        "STARB_ADMIN_EMAILS",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_SECURE",
        "SMTP_USER",
        "SMTP_PASS",
        "EMAIL_FROM",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "OPENAI_API_KEY",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_BUCKET",
    ]:
        if kv.get(k):
            web_env[k] = kv[k]
    # Redundant alias we can export into EMAIL_FROM at runtime if needed.
    if kv.get("EMAIL_FROM"):
        web_env["STARB_EMAIL_FROM"] = kv["EMAIL_FROM"]

    worker_env = dict(common)
    worker_env["DATABASE_URL"] = kv.get("DATABASE_URL", "")
    for k in [
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "OPENAI_API_KEY",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "S3_BUCKET",
    ]:
        if kv.get(k):
            worker_env[k] = kv[k]

    web_changed = put_env_vars(str(web["id"]), web_env)
    worker_changed = put_env_vars(str(worker["id"]), worker_env)

    deploys_triggered = False
    if args.deploy and (web_changed or worker_changed):
        # Optional: explicitly trigger deploys after env update (does not clear build cache).
        _api(
            host,
            key,
            "POST",
            f"/services/{web['id']}/deploys",
            {"clearCache": "do_not_clear"},
        )
        _api(
            host,
            key,
            "POST",
            f"/services/{worker['id']}/deploys",
            {"clearCache": "do_not_clear"},
        )
        deploys_triggered = True

    missing = [k for k in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY"] if not kv.get(k)]
    result = {
        "envId": args.env_id,
        "webServiceId": web["id"],
        "workerServiceId": worker["id"],
        "webChangedKeys": web_changed,
        "workerChangedKeys": worker_changed,
        "deploysTriggered": deploys_triggered,
        "missingLocally": missing,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
