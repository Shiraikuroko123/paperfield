from __future__ import annotations

import os
import re
import subprocess
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
EXCLUDED_PREFIXES = (".github/", ".impeccable/", "tests/")
PRIVATE_PREFIXES = ("data/", "local/")
PRIVATE_NAMES = {".env", "auth-users.json", "papers.db"}


def tracked_files() -> list[str]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    return [item.decode("utf-8") for item in output.split(b"\0") if item]


def version() -> str:
    source = (ROOT / "src" / "paperfield" / "app.py").read_text(encoding="utf-8")
    match = re.search(r'^APP_VERSION = "([^"]+)"', source, flags=re.M)
    if not match:
        raise RuntimeError("APP_VERSION was not found")
    return match.group(1)


def assert_public_tree(files: list[str]) -> None:
    unsafe = []
    for path in files:
        normalized = path.replace("\\", "/")
        name = Path(normalized).name
        if normalized.startswith(PRIVATE_PREFIXES) or name in PRIVATE_NAMES or normalized.endswith((".db", ".log")):
            unsafe.append(normalized)
    if unsafe:
        raise RuntimeError("Private files are tracked by Git: " + ", ".join(unsafe))


def main() -> None:
    files = tracked_files()
    assert_public_tree(files)
    release_version = version()
    tag = os.environ.get("GITHUB_REF_NAME", "")
    if tag and tag != f"v{release_version}":
        raise RuntimeError(f"Tag {tag} does not match APP_VERSION {release_version}")

    DIST.mkdir(exist_ok=True)
    target = DIST / f"Paperfield-v{release_version}-windows.zip"
    target.unlink(missing_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            normalized = path.replace("\\", "/")
            if normalized.startswith(EXCLUDED_PREFIXES) or normalized == "scripts/build-release.py":
                continue
            archive.write(ROOT / path, f"Paperfield/{normalized}")
        archive.write(ROOT / "deploy" / ".env.example", "Paperfield/local/.env.example")
        archive.writestr(
            "Paperfield/local/README.txt",
            "This folder is private and is never uploaded to GitHub.\n"
            "Rename .env.example to .env when you need explicit API or cloud settings.\n"
            "Paperfield stores its database, PDFs, repository cache, explanations, and chats under local/data/.\n",
        )
    print(target)


if __name__ == "__main__":
    main()
