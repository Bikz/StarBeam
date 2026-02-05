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
    args = ap.parse_args()

    cfg = _read_render_cli_yaml()
    host = os.environ.get("RENDER_API_HOST", cfg["host"])
    key = os.environ.get("RENDER_API_KEY", cfg["key"])

    env_path = Path(".env")
    kv = _parse_env_file(env_path)
    if not kv.get("DATABASE_URL"):
        raise SystemExit("Missing DATABASE_URL in .env")

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
        items = _api(host, key, "GET", f"/services/{service_id}/env-vars") or []
        current: dict[str, str] = {}
        for it in items:
            if not isinstance(it, dict):
                continue
            k = it.get("key")
            v = it.get("value")
            if isinstance(k, str) and isinstance(v, str):
                current[k] = v
        return current

    def put_env_vars(service_id: str, updates: dict[str, str]) -> None:
        merged = get_env_vars(service_id)
        for k, v in updates.items():
            if v:
                merged[k] = v
        payload = [{"key": k, "value": v} for k, v in sorted(merged.items())]
        _api(host, key, "PUT", f"/services/{service_id}/env-vars", payload)

    common = {
        "NODE_ENV": "production",
        "DATABASE_URL": kv.get("DATABASE_URL", ""),
        "STARB_TOKEN_ENC_KEY_B64": kv.get("STARB_TOKEN_ENC_KEY_B64", ""),
    }

    web_env = dict(common)
    for k in [
        "AUTH_SECRET",
        "AUTH_URL",
        "NEXT_PUBLIC_WEB_ORIGIN",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "OPENAI_API_KEY",
    ]:
        if kv.get(k):
            web_env[k] = kv[k]

    worker_env = dict(common)
    for k in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY"]:
        if kv.get(k):
            worker_env[k] = kv[k]

    put_env_vars(str(web["id"]), web_env)
    put_env_vars(str(worker["id"]), worker_env)

    # Kick deploys after env update (does not clear build cache).
    _api(host, key, "POST", f"/services/{web['id']}/deploys", {"clearCache": "do_not_clear"})
    _api(host, key, "POST", f"/services/{worker['id']}/deploys", {"clearCache": "do_not_clear"})

    missing = [k for k in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY"] if not kv.get(k)]
    result = {
        "envId": args.env_id,
        "webServiceId": web["id"],
        "workerServiceId": worker["id"],
        "missingLocally": missing,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

