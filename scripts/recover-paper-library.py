from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def backup_database(source: Path, output: Path) -> None:
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite recovery output: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    source_db = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True, timeout=30)
    target_db = sqlite3.connect(output)
    try:
        source_db.backup(target_db, pages=256, sleep=0.05)
    finally:
        target_db.close()
        source_db.close()


def load_app(output: Path):
    data_dir = output.parent.resolve()
    os.environ["PAPERFIELD_LOCAL_DIR"] = str(data_dir)
    os.environ["PAPERFIELD_DATA_DIR"] = str(data_dir)
    os.environ["PAPERFIELD_DB_PATH"] = str(output.resolve())
    sys.path.insert(0, str(ROOT / "src"))
    from paperfield import app

    return app


def decode_paper(row: sqlite3.Row) -> dict[str, Any]:
    keys = set(row.keys())
    return {
        "id": row["id"],
        "title": row["title"],
        "abstract": row["abstract"],
        "authors": json.loads(row["authors_json"] or "[]"),
        "institutions": json.loads(row["institutions_json"] or "[]") if "institutions_json" in keys else [],
        "venue": row["venue"],
        "published": row["published"],
        "updated": row["updated"],
        "source": row["source"],
        "source_url": row["source_url"],
        "pdf_url": row["pdf_url"],
        "doi": row["doi"],
        "journal_ref": row["journal_ref"],
        "topics": json.loads(row["topics_json"] or "[]"),
        "subtopics": json.loads(row["subtopics_json"] or "[]") if "subtopics_json" in keys else [],
        "quality_score": row["quality_score"],
        "citation_count": row["citation_count"],
    }


def merge_papers(app, source: Path) -> dict[str, int]:
    source_db = sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)
    source_db.row_factory = sqlite3.Row
    try:
        rows = source_db.execute("SELECT * FROM papers").fetchall()
    finally:
        source_db.close()
    before = app.STORE.count()
    inserted = app.STORE.upsert_many([decode_paper(row) for row in rows])
    return {"source_rows": len(rows), "inserted": inserted, "before": before, "after": app.STORE.count()}


def restore_archives(app, venue_names: list[str]) -> dict[str, dict[str, int]]:
    entries = {entry["name"]: entry for entry in app.VENUE_CATALOG.entries}
    results: dict[str, dict[str, int]] = {}
    for venue in venue_names:
        if venue not in entries:
            raise ValueError(f"Unknown venue in recovery request: {venue}")
        print(f"Fetching complete DBLP archive for {venue}...", flush=True)
        before = app.STORE.count()
        papers = app.SOURCES.fetch_dblp_archive(entries[venue])
        inserted = app.STORE.upsert_many(papers)
        after = app.STORE.count()
        results[venue] = {
            "fetched": len(papers),
            "inserted": inserted,
            "before": before,
            "after": after,
        }
        print(f"{venue}: fetched={len(papers)} inserted={inserted} total={after}", flush=True)
    return results


def validate_database(path: Path) -> dict[str, Any]:
    db = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    try:
        integrity = [row[0] for row in db.execute("PRAGMA integrity_check").fetchall()]
        total = int(db.execute("SELECT COUNT(*) FROM papers").fetchone()[0])
        venues = {
            row[0]: int(row[1])
            for row in db.execute(
                "SELECT venue, COUNT(*) FROM papers WHERE venue IN ('NeurIPS', 'ICLR', 'ICRA') GROUP BY venue"
            ).fetchall()
        }
        other_related = int(
            db.execute(
                "SELECT COUNT(*) FROM papers WHERE topics_json = ?",
                (json.dumps(["\u5176\u4ed6\u76f8\u5173"], ensure_ascii=False),),
            ).fetchone()[0]
        )
    finally:
        db.close()
    return {"integrity": integrity, "total": total, "venues": venues, "other_related": other_related}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a verified Paperfield recovery database without modifying its sources")
    parser.add_argument("--source", type=Path, required=True, help="Primary database to copy transactionally")
    parser.add_argument("--merge", type=Path, action="append", default=[], help="Additional database whose papers are merged")
    parser.add_argument("--output", type=Path, required=True, help="New database path; must not already exist")
    parser.add_argument("--archive", action="append", default=[], help="Complete DBLP archive venue to restore")
    parser.add_argument("--skip-archives", action="store_true", help="Do not fetch archives; useful when merging an already recovered catalog")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Source database not found: {source}")
    backup_database(source, output)
    app = load_app(output)

    report: dict[str, Any] = {
        "source": str(source),
        "output": str(output),
        "initial_total": app.STORE.count(),
        "merges": {},
        "archives": {},
    }
    for merge_source in args.merge:
        merge_source = merge_source.expanduser().resolve()
        if not merge_source.is_file():
            raise FileNotFoundError(f"Merge database not found: {merge_source}")
        print(f"Merging papers from {merge_source}...", flush=True)
        report["merges"][str(merge_source)] = merge_papers(app, merge_source)

    archive_names = [] if args.skip_archives else (args.archive or list(app.CONFIG.get("retain_unmatched_archive_venues") or []))
    report["archives"] = restore_archives(app, archive_names)
    app.STORE.reclassify_papers(app.CLASSIFIER, force=True)
    with app.STORE.connect() as db:
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    report["validation"] = validate_database(output)
    if report["validation"]["integrity"] != ["ok"]:
        raise RuntimeError(f"Recovery database failed integrity check: {report['validation']['integrity']}")
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
