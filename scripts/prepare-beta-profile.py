from __future__ import annotations

import argparse
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare an isolated Paperfield beta profile")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--force", action="store_true", help="replace an existing beta database")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    profile = args.profile.expanduser().resolve()
    target = profile / "papers.db"
    if target.exists() and not args.force:
        print(f"Beta profile already exists: {profile}")
        return
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


if __name__ == "__main__":
    main()
