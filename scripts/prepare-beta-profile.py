from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY_DATA = ROOT / "data"
LOCAL_DATA = ROOT / "local" / "data"
DEFAULT_DATA = LEGACY_DATA if LEGACY_DATA.exists() and not LOCAL_DATA.exists() else LOCAL_DATA
DEFAULT_SOURCE = DEFAULT_DATA / "papers.db"
DEFAULT_PROFILE = DEFAULT_DATA / "profiles" / "beta"


PRIVATE_TABLES = (
    "user_state",
    "paper_chat_messages",
    "project_chat_messages",
    "paper_assets",
    "project_assets",
    "cloud_objects",
    "cloud_usage_daily",
    "cloud_inventory_state",
)


def remap_legacy_profile_path(value: object, legacy_profile: Path, profile: Path) -> str | None:
    if not value:
        return None
    try:
        source = Path(str(value)).expanduser().resolve()
        relative = source.relative_to(legacy_profile)
    except (OSError, ValueError):
        return None
    target = (profile / relative).resolve()
    if source.is_file() and not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        source.replace(target)
    return str(target)


def repair_profile_paths(profile: Path) -> int:
    """Move beta caches away from the retired data/ profile path once."""
    legacy_profile = (ROOT / "data" / "profiles" / "beta").resolve()
    profile = profile.resolve()
    if profile == legacy_profile:
        return 0

    for name in ("pdfs", "fulltext", "repos", "project-doc-translations"):
        (profile / name).mkdir(parents=True, exist_ok=True)

    repaired = 0
    settings_path = profile / "settings.json"
    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8")) if settings_path.exists() else {}
    except (OSError, ValueError, json.JSONDecodeError):
        settings = {}
    if isinstance(settings, dict):
        remapped = remap_legacy_profile_path(settings.get("local_pdf_dir"), legacy_profile, profile)
        if remapped and settings.get("local_pdf_dir") != remapped:
            settings["local_pdf_dir"] = remapped
            settings_path.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
            repaired += 1

    database = profile / "papers.db"
    if not database.exists():
        return repaired
    connection = sqlite3.connect(database)
    try:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        if "paper_assets" not in tables:
            return repaired
        rows = connection.execute(
            "SELECT paper_id, local_pdf_path, local_text_path FROM paper_assets"
        ).fetchall()
        for paper_id, pdf_path, text_path in rows:
            new_pdf = remap_legacy_profile_path(pdf_path, legacy_profile, profile)
            new_text = remap_legacy_profile_path(text_path, legacy_profile, profile)
            if not new_pdf and not new_text:
                continue
            connection.execute(
                "UPDATE paper_assets SET local_pdf_path = ?, local_text_path = ? WHERE paper_id = ?",
                (new_pdf or pdf_path, new_text or text_path, paper_id),
            )
            repaired += 1
        connection.commit()
    finally:
        connection.close()
    return repaired


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare an isolated Paperfield beta profile")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--force", action="store_true", help="replace an existing beta database")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    profile = args.profile.expanduser().resolve()
    target = profile / "papers.db"
    if not target.exists() or args.force:
        if not source.exists():
            raise FileNotFoundError(f"Source database not found: {source}")
        profile.mkdir(parents=True, exist_ok=True)
        temporary = profile / "papers.db.preparing"
        temporary.unlink(missing_ok=True)
        source_db = sqlite3.connect(source)
        target_db = sqlite3.connect(temporary)
        try:
            source_db.backup(target_db)
            tables = {
                row[0]
                for row in target_db.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
            }
            for table in PRIVATE_TABLES:
                if table in tables:
                    target_db.execute(f"DELETE FROM {table}")
            if "sync_runs" in tables:
                target_db.execute("DELETE FROM sync_runs")
            target_db.commit()
            target_db.execute("VACUUM")
        finally:
            target_db.close()
            source_db.close()
        temporary.replace(target)
        print(f"Prepared isolated beta profile: {profile}")
    else:
        print(f"Beta profile already exists: {profile}")

    repaired = repair_profile_paths(profile)
    if repaired:
        print(f"Repaired {repaired} beta cache path(s): {profile}")


if __name__ == "__main__":
    main()
