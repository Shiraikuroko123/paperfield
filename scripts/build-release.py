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
GENERATED_TREES = (
    (ROOT / "apps" / "flowloom" / "dist", "Paperfield/apps/flowloom/dist"),
)
UNIFIED_SOURCE_TREES = (
    (ROOT / "apps" / "flowloom", {".git", ".github", ".playwright-cli", "dist", "node_modules", "output", "tmp"}),
    (ROOT / "content" / "courses", {".git", ".github", "__pycache__", "site"}),
    (ROOT / "packages" / "research-contracts", {"__pycache__"}),
    (ROOT / "src" / "research_atlas", {"__pycache__"}),
)
UNIFIED_SOURCE_FILES = (
    ROOT / "docs" / "MONOREPO_INTEGRATION.md",
    ROOT / "docs" / "RESEARCH_KNOWLEDGE_PLATFORM_DESIGN.md",
    ROOT / "provenance.json",
    ROOT / "scripts" / "build-platform.cmd",
    ROOT / "scripts" / "build-platform.ps1",
    ROOT / "scripts" / "platform-process.ps1",
    ROOT / "scripts" / "recover-paper-library.py",
    ROOT / "scripts" / "run-atlas-scanner.cmd",
    ROOT / "scripts" / "run-atlas-scanner.ps1",
    ROOT / "scripts" / "run-atlas-worker.cmd",
    ROOT / "scripts" / "run-atlas-worker.ps1",
    ROOT / "scripts" / "run-atlas.cmd",
    ROOT / "scripts" / "run-atlas.ps1",
    ROOT / "scripts" / "run-container.py",
    ROOT / "scripts" / "run-platform.cmd",
    ROOT / "scripts" / "run-platform.ps1",
    ROOT / "scripts" / "stop-platform.cmd",
    ROOT / "scripts" / "stop-platform.ps1",
)


def tracked_files() -> list[str]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    return [item.decode("utf-8") for item in output.split(b"\0") if item]


def unified_workspace_files() -> list[str]:
    files: list[str] = []
    for source, excluded_directories in UNIFIED_SOURCE_TREES:
        if not source.is_dir():
            raise RuntimeError(f"Required unified workspace is missing: {source}")
        for current, directories, filenames in os.walk(source):
            directories[:] = sorted(
                name for name in directories if name not in excluded_directories and name != "__pycache__"
            )
            current_path = Path(current)
            for name in sorted(filenames):
                path = current_path / name
                if name.endswith((".pyc", ".log", ".db")) or name in PRIVATE_NAMES:
                    continue
                files.append(path.relative_to(ROOT).as_posix())
    for path in UNIFIED_SOURCE_FILES:
        if not path.is_file():
            raise RuntimeError(f"Required unified platform file is missing: {path}")
        files.append(path.relative_to(ROOT).as_posix())
    return files


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


def add_generated_tree(archive: zipfile.ZipFile, source: Path, destination: str) -> None:
    if not (source / "index.html").is_file():
        raise RuntimeError(f"Required platform build is missing: {source / 'index.html'}")
    for path in sorted(source.rglob("*")):
        if path.is_file():
            archive.write(path, f"{destination}/{path.relative_to(source).as_posix()}")


def main() -> None:
    files = sorted(set(tracked_files()) | set(unified_workspace_files()))
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
        for source, destination in GENERATED_TREES:
            add_generated_tree(archive, source, destination)
        archive.write(ROOT / "deploy" / ".env.example", "Paperfield/local/.env.example")
        archive.writestr(
            "Paperfield/local/README.txt",
            "This folder is private and is never uploaded to GitHub.\n"
            "Rename .env.example to .env when you need explicit API or cloud settings.\n"
            "Paperfield stores reading data under local/data/ and Atlas data under local/atlas/.\n",
        )
    print(target)


if __name__ == "__main__":
    main()
