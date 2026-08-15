from __future__ import annotations

import json
import os
import secrets
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ATLAS_SCRIPT = ROOT / "src" / "research_atlas" / "app.py"
PAPERFIELD_SCRIPT = ROOT / "src" / "paperfield" / "app.py"
ATLAS_HEALTH_URL = "http://127.0.0.1:8795/api/health"


def ensure_proxy_token(environment: dict[str, str]) -> str:
    paperfield = environment.get("PAPERFIELD_ATLAS_PROXY_TOKEN", "").strip()
    atlas = environment.get("RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN", "").strip()
    if paperfield and atlas and paperfield != atlas:
        raise RuntimeError("Paperfield and Atlas proxy tokens are configured with different values")
    token = paperfield or atlas or secrets.token_urlsafe(48)
    if len(token) < 32:
        raise RuntimeError("The unified platform proxy token must contain at least 32 characters")
    environment["PAPERFIELD_ATLAS_PROXY_TOKEN"] = token
    environment["RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN"] = token
    return token


def wait_for_atlas(
    process: subprocess.Popen[bytes], proxy_token: str, timeout_seconds: int = 60
) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Research Atlas exited during startup with code {process.returncode}")
        try:
            request = urllib.request.Request(
                ATLAS_HEALTH_URL,
                headers={"X-Atlas-Proxy-Token": proxy_token},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                payload = json.load(response)
            if payload.get("status") == "ok" and payload.get("proxy_token_match") is True:
                return
        except (OSError, ValueError):
            time.sleep(0.25)
    raise RuntimeError("Research Atlas did not become healthy within 60 seconds")


def stop_process(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> int:
    environment = os.environ.copy()
    environment.setdefault("RESEARCH_ATLAS_HOST", "127.0.0.1")
    environment.setdefault("RESEARCH_ATLAS_PORT", "8795")
    environment.setdefault("PAPERFIELD_ATLAS_INTERNAL_URL", ATLAS_HEALTH_URL.removesuffix("/api/health"))
    proxy_token = ensure_proxy_token(environment)

    atlas: subprocess.Popen[bytes] | None = None
    paperfield: subprocess.Popen[bytes] | None = None
    stopping = False

    def request_stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True
        stop_process(paperfield)
        stop_process(atlas)

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    try:
        atlas = subprocess.Popen([sys.executable, str(ATLAS_SCRIPT)], cwd=ROOT, env=environment)
        wait_for_atlas(atlas, proxy_token)
        paperfield = subprocess.Popen([sys.executable, str(PAPERFIELD_SCRIPT)], cwd=ROOT, env=environment)

        while not stopping:
            paperfield_code = paperfield.poll()
            atlas_code = atlas.poll()
            if paperfield_code is not None:
                return paperfield_code
            if atlas_code is not None:
                print(f"Research Atlas exited unexpectedly with code {atlas_code}", file=sys.stderr)
                return atlas_code or 1
            time.sleep(0.5)
        return 0
    finally:
        stop_process(paperfield)
        stop_process(atlas)


if __name__ == "__main__":
    raise SystemExit(main())
