from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import http.client
import ipaddress
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = Path(os.environ.get("PAPERFIELD_DATA_DIR", ROOT / "data")).expanduser().resolve()
DB_PATH = Path(os.environ.get("PAPERFIELD_DB_PATH", DATA_DIR / "papers.db")).expanduser().resolve()
PDF_DIR = Path(os.environ.get("PAPERFIELD_PDF_DIR", DATA_DIR / "pdfs")).expanduser().resolve()
FULLTEXT_DIR = Path(os.environ.get("PAPERFIELD_FULLTEXT_DIR", DATA_DIR / "fulltext")).expanduser().resolve()
CONFIG_PATH = Path(os.environ.get("PAPERFIELD_CONFIG_PATH", ROOT / "config.json")).expanduser().resolve()
VENUES_PATH = Path(os.environ.get("PAPERFIELD_VENUES_PATH", ROOT / "venues.json")).expanduser().resolve()
INSTITUTIONS_PATH = Path(os.environ.get("PAPERFIELD_INSTITUTIONS_PATH", ROOT / "institutions.json")).expanduser().resolve()
APP_VERSION = "0.6.0"
USER_AGENT = "Paperfield/1.0 (local research client; contact: local-user)"
MAX_PDF_BYTES = int(os.environ.get("PAPERFIELD_MAX_PDF_MB", "100")) * 1024 * 1024


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_date(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, dict):
        parts = value.get("date-parts") or []
        if parts and parts[0]:
            nums = parts[0]
            return "-".join(str(item).zfill(2) for item in nums[:3])
        value = value.get("date-time") or ""
    text = str(value)
    match = re.search(r"\d{4}-\d{2}-\d{2}", text)
    return match.group(0) if match else text[:10]


def compact_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def venue_sync_error_status(error: Exception | str) -> str:
    message = str(error).lower()
    challenge_markers = (
        "challengerequirederror",
        "browser challenge verification",
        "requires browser challenge",
    )
    return "blocked" if any(marker in message for marker in challenge_markers) else "error"


def slug_id(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._:-]+", "-", value.strip()).strip("-").lower()


class VenueCatalog:
    TIER_ORDER = ["顶级会议", "顶级期刊", "重要会议", "重要期刊", "预印本", "其他相关"]

    def __init__(self, entries: list[dict[str, Any]]) -> None:
        self.entries = entries
        aliases = []
        for entry in entries:
            for alias in entry.get("aliases", []):
                aliases.append((self.normalize(alias), entry))
        self.aliases = sorted(aliases, key=lambda item: len(item[0]), reverse=True)

    @staticmethod
    def normalize(value: str | None) -> str:
        text = html.unescape(value or "").lower()
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _without_year(value: str) -> str:
        return re.sub(r"\b(?:19|20)\d{2}\b", "", value).strip()

    def _match(self, value: str) -> dict[str, Any] | None:
        normalized = self.normalize(value)
        without_year = self._without_year(normalized)
        tokens = set(without_year.split())
        for alias, entry in self.aliases:
            if " " not in alias and alias in tokens:
                return entry
            if without_year == alias or normalized == alias:
                return entry
            if " " in alias and f" {alias} " in f" {without_year} ":
                return entry
        return None

    def describe(self, venue: str, journal_ref: str = "", source: str = "") -> dict[str, Any]:
        entry = self._match(venue) or self._match(journal_ref)
        if entry:
            return {
                "canonical_venue": entry["name"],
                "venue_tier": entry["tier"],
                "venue_type": entry["kind"],
                "platform": entry["platform"],
                "venue_domains": entry.get("domains", []),
                "publication_status": "正式发表",
            }
        source_text = f"{venue} {journal_ref} {source}".lower()
        if "arxiv" in source_text or self.normalize(venue) == "corr":
            return {
                "canonical_venue": "arXiv",
                "venue_tier": "预印本",
                "venue_type": "预印本",
                "platform": "arXiv",
                "venue_domains": [],
                "publication_status": "尚未确认录用",
            }
        return {
            "canonical_venue": venue or source or "来源未知",
            "venue_tier": "其他相关",
            "venue_type": "其他",
            "platform": source or "其他来源",
            "venue_domains": [],
            "publication_status": "元数据收录",
        }

    def enrich(self, paper: dict[str, Any]) -> None:
        metadata = self.describe(paper.get("venue", ""), paper.get("journal_ref", ""), paper.get("source", ""))
        paper["venue"] = metadata.pop("canonical_venue")
        paper.update(metadata)

    def platforms(self) -> list[str]:
        return sorted({entry["platform"] for entry in self.entries})

    def venues(self) -> list[str]:
        return [entry["name"] for entry in self.entries]


class InstitutionCatalog:
    def __init__(self, entries: list[dict[str, Any]]) -> None:
        self.entries = entries
        aliases = []
        for entry in entries:
            for alias in entry.get("aliases", []):
                aliases.append((self.normalize(alias), entry))
        self.aliases = sorted(aliases, key=lambda item: len(item[0]), reverse=True)

    @staticmethod
    def normalize(value: str | None) -> str:
        text = html.unescape(value or "").lower()
        text = re.sub(r"[^\w\u4e00-\u9fff]+", " ", text, flags=re.UNICODE)
        return re.sub(r"\s+", " ", text).strip()

    def match(self, affiliations: list[str]) -> list[dict[str, Any]]:
        matched = []
        seen = set()
        normalized_affiliations = [self.normalize(value) for value in affiliations if compact_text(value)]
        for affiliation in normalized_affiliations:
            for alias, entry in self.aliases:
                if alias and f" {alias} " in f" {affiliation} " and entry["id"] not in seen:
                    matched.append(
                        {
                            "id": entry["id"],
                            "name": entry["name"],
                            "parent": entry.get("parent", ""),
                            "type": entry.get("type", ""),
                            "region": entry.get("region", ""),
                            "strengths": entry.get("strengths", []),
                            "url": entry.get("url", ""),
                        }
                    )
                    seen.add(entry["id"])
                    break
        return matched[:6]


class PaperStore:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self) -> None:
        with self.connect() as db:
            db.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS papers (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    abstract TEXT NOT NULL DEFAULT '',
                    authors_json TEXT NOT NULL DEFAULT '[]',
                    institutions_json TEXT NOT NULL DEFAULT '[]',
                    venue TEXT NOT NULL DEFAULT '',
                    published TEXT NOT NULL DEFAULT '',
                    updated TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL DEFAULT '',
                    source_url TEXT NOT NULL DEFAULT '',
                    pdf_url TEXT NOT NULL DEFAULT '',
                    doi TEXT NOT NULL DEFAULT '',
                    journal_ref TEXT NOT NULL DEFAULT '',
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    quality_score REAL NOT NULL DEFAULT 0,
                    citation_count INTEGER NOT NULL DEFAULT 0,
                    fetched_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_state (
                    paper_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'unread',
                    favorite INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    explanation_json TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(paper_id) REFERENCES papers(id)
                );
                CREATE TABLE IF NOT EXISTS sync_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    status TEXT NOT NULL,
                    inserted_count INTEGER NOT NULL DEFAULT 0,
                    error_text TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS github_projects (
                    full_name TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    owner TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    url TEXT NOT NULL,
                    homepage TEXT NOT NULL DEFAULT '',
                    stars INTEGER NOT NULL DEFAULT 0,
                    forks INTEGER NOT NULL DEFAULT 0,
                    open_issues INTEGER NOT NULL DEFAULT 0,
                    language TEXT NOT NULL DEFAULT '',
                    license TEXT NOT NULL DEFAULT '',
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    categories_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT '',
                    pushed_at TEXT NOT NULL DEFAULT '',
                    fetched_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS paper_project_links (
                    paper_id TEXT NOT NULL,
                    project_full_name TEXT NOT NULL,
                    score REAL NOT NULL DEFAULT 0,
                    reason TEXT NOT NULL DEFAULT '',
                    PRIMARY KEY (paper_id, project_full_name),
                    FOREIGN KEY(paper_id) REFERENCES papers(id),
                    FOREIGN KEY(project_full_name) REFERENCES github_projects(full_name)
                );
                CREATE TABLE IF NOT EXISTS paper_assets (
                    paper_id TEXT PRIMARY KEY,
                    resolved_pdf_url TEXT NOT NULL DEFAULT '',
                    landing_url TEXT NOT NULL DEFAULT '',
                    provider TEXT NOT NULL DEFAULT '',
                    access_status TEXT NOT NULL DEFAULT 'unknown',
                    local_pdf_path TEXT NOT NULL DEFAULT '',
                    local_text_path TEXT NOT NULL DEFAULT '',
                    cloud_pdf_key TEXT NOT NULL DEFAULT '',
                    cloud_text_key TEXT NOT NULL DEFAULT '',
                    storage_mode TEXT NOT NULL DEFAULT 'local',
                    page_count INTEGER NOT NULL DEFAULT 0,
                    text_chars INTEGER NOT NULL DEFAULT 0,
                    checked_at TEXT NOT NULL DEFAULT '',
                    error_text TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY(paper_id) REFERENCES papers(id)
                );
                CREATE TABLE IF NOT EXISTS paper_chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    paper_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(paper_id) REFERENCES papers(id)
                );
                CREATE TABLE IF NOT EXISTS venue_sync_state (
                    venue TEXT PRIMARY KEY,
                    last_sync TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT '',
                    item_count INTEGER NOT NULL DEFAULT 0,
                    error_text TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_papers_title_normalized
                    ON papers(lower(trim(title)));
                CREATE INDEX IF NOT EXISTS idx_github_projects_pushed_at
                    ON github_projects(pushed_at DESC);
                CREATE INDEX IF NOT EXISTS idx_paper_project_links_project
                    ON paper_project_links(project_full_name);
                CREATE INDEX IF NOT EXISTS idx_paper_chat_messages_paper
                    ON paper_chat_messages(paper_id, id);
                """
            )
            paper_columns = {row["name"] for row in db.execute("PRAGMA table_info(papers)").fetchall()}
            if "institutions_json" not in paper_columns:
                db.execute("ALTER TABLE papers ADD COLUMN institutions_json TEXT NOT NULL DEFAULT '[]'")
            asset_columns = {row["name"] for row in db.execute("PRAGMA table_info(paper_assets)").fetchall()}
            for name, definition in (
                ("cloud_pdf_key", "TEXT NOT NULL DEFAULT ''"),
                ("cloud_text_key", "TEXT NOT NULL DEFAULT ''"),
                ("storage_mode", "TEXT NOT NULL DEFAULT 'local'"),
            ):
                if name not in asset_columns:
                    db.execute(f"ALTER TABLE paper_assets ADD COLUMN {name} {definition}")

    def count(self) -> int:
        with self.connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM papers").fetchone()[0])

    def recalculate_quality(self, classifier: "PaperClassifier") -> None:
        with self._lock, self.connect() as db:
            rows = db.execute(
                "SELECT id, venue, journal_ref, source, published, citation_count, topics_json FROM papers"
            ).fetchall()
            updates = []
            for row in rows:
                paper = dict(row)
                paper["topics"] = json.loads(paper.pop("topics_json") or "[]")
                classifier.enrich(paper)
                updates.append((classifier.quality(paper), paper["id"]))
            db.executemany("UPDATE papers SET quality_score = ? WHERE id = ?", updates)

    def upsert(self, paper: dict[str, Any]) -> bool:
        with self._lock, self.connect() as db:
            return self._upsert_with_db(db, paper)

    def upsert_many(self, papers: list[dict[str, Any]]) -> int:
        with self._lock, self.connect() as db:
            return sum(int(self._upsert_with_db(db, paper)) for paper in papers)

    @staticmethod
    def _upsert_with_db(db: sqlite3.Connection, paper: dict[str, Any]) -> bool:
        title_match = db.execute(
            "SELECT id FROM papers WHERE lower(trim(title)) = lower(trim(?)) LIMIT 1",
            (paper["title"],),
        ).fetchone()
        if title_match and title_match["id"] != paper["id"]:
            paper = {**paper, "id": title_match["id"]}
        exists = db.execute("SELECT 1 FROM papers WHERE id = ?", (paper["id"],)).fetchone()
        db.execute(
            """
            INSERT INTO papers (
                id, title, abstract, authors_json, institutions_json, venue, published, updated,
                source, source_url, pdf_url, doi, journal_ref, topics_json,
                quality_score, citation_count, fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                abstract=CASE WHEN length(excluded.abstract) > length(papers.abstract) THEN excluded.abstract ELSE papers.abstract END,
                authors_json=excluded.authors_json,
                institutions_json=CASE WHEN excluded.institutions_json != '[]' THEN excluded.institutions_json ELSE papers.institutions_json END,
                venue=CASE WHEN excluded.venue != '' THEN excluded.venue ELSE papers.venue END,
                published=CASE WHEN excluded.published != '' THEN excluded.published ELSE papers.published END,
                updated=CASE WHEN excluded.updated != '' THEN excluded.updated ELSE papers.updated END,
                source=CASE
                    WHEN excluded.source IN ('PMLR', 'CVF Open Access', 'DBLP', 'DBLP archive', 'Crossref targeted', 'Crossref / ACM MM', 'Crossref / IEEE T-RO') THEN excluded.source
                    ELSE papers.source
                END,
                source_url=CASE WHEN excluded.source_url != '' THEN excluded.source_url ELSE papers.source_url END,
                pdf_url=CASE WHEN excluded.pdf_url != '' THEN excluded.pdf_url ELSE papers.pdf_url END,
                doi=CASE WHEN excluded.doi != '' THEN excluded.doi ELSE papers.doi END,
                journal_ref=CASE WHEN excluded.journal_ref != '' THEN excluded.journal_ref ELSE papers.journal_ref END,
                topics_json=excluded.topics_json,
                quality_score=max(papers.quality_score, excluded.quality_score),
                citation_count=max(papers.citation_count, excluded.citation_count),
                fetched_at=excluded.fetched_at
            """,
            (
                paper["id"], paper["title"], paper.get("abstract", ""),
                json.dumps(paper.get("authors", []), ensure_ascii=False),
                json.dumps(paper.get("institutions", []), ensure_ascii=False),
                paper.get("venue", ""), paper.get("published", ""), paper.get("updated", ""),
                paper.get("source", ""), paper.get("source_url", ""), paper.get("pdf_url", ""),
                paper.get("doi", ""), paper.get("journal_ref", ""),
                json.dumps(paper.get("topics", []), ensure_ascii=False),
                paper.get("quality_score", 0), paper.get("citation_count", 0), utc_now().isoformat(),
            ),
        )
        return exists is None

    def upsert_projects(self, projects: list[dict[str, Any]]) -> int:
        inserted = 0
        with self._lock, self.connect() as db:
            for project in projects:
                exists = db.execute(
                    "SELECT 1 FROM github_projects WHERE full_name = ?",
                    (project["full_name"],),
                ).fetchone()
                db.execute(
                    """
                    INSERT INTO github_projects (
                        full_name, name, owner, description, url, homepage, stars, forks,
                        open_issues, language, license, topics_json, categories_json,
                        created_at, updated_at, pushed_at, fetched_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(full_name) DO UPDATE SET
                        name=excluded.name,
                        owner=excluded.owner,
                        description=excluded.description,
                        url=excluded.url,
                        homepage=excluded.homepage,
                        stars=excluded.stars,
                        forks=excluded.forks,
                        open_issues=excluded.open_issues,
                        language=excluded.language,
                        license=excluded.license,
                        topics_json=excluded.topics_json,
                        categories_json=excluded.categories_json,
                        updated_at=excluded.updated_at,
                        pushed_at=excluded.pushed_at,
                        fetched_at=excluded.fetched_at
                    """,
                    (
                        project["full_name"], project["name"], project["owner"], project.get("description", ""),
                        project["url"], project.get("homepage", ""), project.get("stars", 0), project.get("forks", 0),
                        project.get("open_issues", 0), project.get("language", ""), project.get("license", ""),
                        json.dumps(project.get("topics", []), ensure_ascii=False),
                        json.dumps(project.get("categories", []), ensure_ascii=False),
                        project.get("created_at", ""), project.get("updated_at", ""), project.get("pushed_at", ""),
                        utc_now().isoformat(),
                    ),
                )
                inserted += int(exists is None)
        return inserted

    def list_projects(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT g.*, COUNT(l.paper_id) AS linked_paper_count
                FROM github_projects g
                LEFT JOIN paper_project_links l ON l.project_full_name = g.full_name
                GROUP BY g.full_name
                """
            ).fetchall()
        return [self._serialize_project(row) for row in rows]

    def get_project(self, full_name: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                """
                SELECT g.*, COUNT(l.paper_id) AS linked_paper_count
                FROM github_projects g
                LEFT JOIN paper_project_links l ON l.project_full_name = g.full_name
                WHERE g.full_name = ?
                GROUP BY g.full_name
                """,
                (full_name,),
            ).fetchone()
        if not row:
            return None
        project = self._serialize_project(row)
        project["papers"] = self.papers_for_project(full_name)
        return project

    def count_projects(self) -> int:
        with self.connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM github_projects").fetchone()[0])

    def link_count(self) -> int:
        with self.connect() as db:
            return int(db.execute("SELECT COUNT(*) FROM paper_project_links").fetchone()[0])

    def replace_project_links(self, links: list[tuple[str, str, float, str]]) -> None:
        with self._lock, self.connect() as db:
            db.execute("DELETE FROM paper_project_links")
            db.executemany(
                "INSERT INTO paper_project_links (paper_id, project_full_name, score, reason) VALUES (?, ?, ?, ?)",
                links,
            )

    def projects_for_paper(self, paper_id: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT g.*, l.score, l.reason, 0 AS linked_paper_count
                FROM paper_project_links l
                JOIN github_projects g ON g.full_name = l.project_full_name
                WHERE l.paper_id = ?
                ORDER BY l.score DESC, g.stars DESC
                LIMIT 12
                """,
                (paper_id,),
            ).fetchall()
        return [self._serialize_project(row) for row in rows]

    def papers_for_project(self, full_name: str) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT p.*, COALESCE(s.status, 'unread') AS status,
                       COALESCE(s.favorite, 0) AS favorite,
                       COALESCE(s.notes, '') AS notes,
                       COALESCE(s.explanation_json, '') AS explanation_json,
                       CASE WHEN COALESCE(s.explanation_json, '') != '' THEN 1 ELSE 0 END AS has_explanation,
                       l.score AS project_score,
                       l.reason AS project_reason
                FROM paper_project_links l
                JOIN papers p ON p.id = l.paper_id
                LEFT JOIN user_state s ON s.paper_id = p.id
                WHERE l.project_full_name = ?
                ORDER BY l.score DESC, p.quality_score DESC
                LIMIT 12
                """,
                (full_name,),
            ).fetchall()
        return [self._serialize(row) for row in rows]

    def list_papers(self) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT p.*, COALESCE(s.status, 'unread') AS status,
                       COALESCE(s.favorite, 0) AS favorite,
                       COALESCE(s.notes, '') AS notes,
                       CASE WHEN COALESCE(s.explanation_json, '') != '' THEN 1 ELSE 0 END AS has_explanation
                FROM papers p
                LEFT JOIN user_state s ON s.paper_id = p.id
                """
            ).fetchall()
        return [self._serialize(row) for row in rows]

    def get_paper(self, paper_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute(
                """
                SELECT p.*, COALESCE(s.status, 'unread') AS status,
                       COALESCE(s.favorite, 0) AS favorite,
                       COALESCE(s.notes, '') AS notes,
                       COALESCE(s.explanation_json, '') AS explanation_json,
                       CASE WHEN COALESCE(s.explanation_json, '') != '' THEN 1 ELSE 0 END AS has_explanation
                FROM papers p
                LEFT JOIN user_state s ON s.paper_id = p.id
                WHERE p.id = ?
                """,
                (paper_id,),
            ).fetchone()
        if not row:
            return None
        paper = self._serialize(row, include_explanation=True)
        paper["projects"] = self.projects_for_paper(paper_id)
        return paper

    def find_paper(self, doi: str = "", title: str = "") -> dict[str, Any] | None:
        normalized_doi = compact_text(doi).lower()
        normalized_title = compact_text(title).lower()
        with self.connect() as db:
            row = None
            if normalized_doi:
                row = db.execute("SELECT id FROM papers WHERE lower(doi) = ? LIMIT 1", (normalized_doi,)).fetchone()
            if not row and normalized_title:
                row = db.execute("SELECT id FROM papers WHERE lower(trim(title)) = ? LIMIT 1", (normalized_title,)).fetchone()
        return self.get_paper(row["id"]) if row else None

    def update_state(self, paper_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        current = self.get_paper(paper_id)
        if not current:
            return None
        status = payload.get("status", current.get("status", "unread"))
        favorite = int(bool(payload.get("favorite", current.get("favorite", False))))
        notes = str(payload.get("notes", current.get("notes", "")))[:5000]
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO user_state (paper_id, status, favorite, notes, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                    status=excluded.status,
                    favorite=excluded.favorite,
                    notes=excluded.notes,
                    updated_at=excluded.updated_at
                """,
                (paper_id, status, favorite, notes, utc_now().isoformat()),
            )
        return self.get_paper(paper_id)

    def save_explanation(self, paper_id: str, explanation: dict[str, Any]) -> None:
        paper = self.get_paper(paper_id)
        if not paper:
            return
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO user_state (paper_id, status, favorite, notes, explanation_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                    explanation_json=excluded.explanation_json,
                    updated_at=excluded.updated_at
                """,
                (
                    paper_id, paper.get("status", "unread"), int(bool(paper.get("favorite"))),
                    paper.get("notes", ""), json.dumps(explanation, ensure_ascii=False), utc_now().isoformat(),
                ),
            )

    def get_asset(self, paper_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM paper_assets WHERE paper_id = ?", (paper_id,)).fetchone()
        return dict(row) if row else None

    def assets_for_papers(self, paper_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not paper_ids:
            return {}
        placeholders = ",".join("?" for _ in paper_ids)
        with self.connect() as db:
            rows = db.execute(f"SELECT * FROM paper_assets WHERE paper_id IN ({placeholders})", paper_ids).fetchall()
        return {row["paper_id"]: dict(row) for row in rows}

    def save_asset(self, paper_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.get_asset(paper_id) or {}
        values = {
            "resolved_pdf_url": payload.get("resolved_pdf_url", current.get("resolved_pdf_url", "")),
            "landing_url": payload.get("landing_url", current.get("landing_url", "")),
            "provider": payload.get("provider", current.get("provider", "")),
            "access_status": payload.get("access_status", current.get("access_status", "unknown")),
            "local_pdf_path": payload.get("local_pdf_path", current.get("local_pdf_path", "")),
            "local_text_path": payload.get("local_text_path", current.get("local_text_path", "")),
            "cloud_pdf_key": payload.get("cloud_pdf_key", current.get("cloud_pdf_key", "")),
            "cloud_text_key": payload.get("cloud_text_key", current.get("cloud_text_key", "")),
            "storage_mode": payload.get("storage_mode", current.get("storage_mode", "local")),
            "page_count": int(payload.get("page_count", current.get("page_count", 0)) or 0),
            "text_chars": int(payload.get("text_chars", current.get("text_chars", 0)) or 0),
            "checked_at": payload.get("checked_at", utc_now().isoformat()),
            "error_text": str(payload.get("error_text", current.get("error_text", "")))[:2000],
        }
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO paper_assets (
                    paper_id, resolved_pdf_url, landing_url, provider, access_status,
                    local_pdf_path, local_text_path, cloud_pdf_key, cloud_text_key, storage_mode,
                    page_count, text_chars, checked_at, error_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                    resolved_pdf_url=excluded.resolved_pdf_url,
                    landing_url=excluded.landing_url,
                    provider=excluded.provider,
                    access_status=excluded.access_status,
                    local_pdf_path=excluded.local_pdf_path,
                    local_text_path=excluded.local_text_path,
                    cloud_pdf_key=excluded.cloud_pdf_key,
                    cloud_text_key=excluded.cloud_text_key,
                    storage_mode=excluded.storage_mode,
                    page_count=excluded.page_count,
                    text_chars=excluded.text_chars,
                    checked_at=excluded.checked_at,
                    error_text=excluded.error_text
                """,
                (
                    paper_id, values["resolved_pdf_url"], values["landing_url"], values["provider"],
                    values["access_status"], values["local_pdf_path"], values["local_text_path"],
                    values["cloud_pdf_key"], values["cloud_text_key"], values["storage_mode"],
                    values["page_count"], values["text_chars"], values["checked_at"], values["error_text"],
                ),
            )
        return self.get_asset(paper_id) or {"paper_id": paper_id, **values}

    def has_project(self, paper_id: str) -> bool:
        with self.connect() as db:
            row = db.execute("SELECT 1 FROM paper_project_links WHERE paper_id = ? LIMIT 1", (paper_id,)).fetchone()
        return bool(row)

    def paper_ids_with_projects(self, paper_ids: list[str]) -> set[str]:
        if not paper_ids:
            return set()
        placeholders = ",".join("?" for _ in paper_ids)
        with self.connect() as db:
            rows = db.execute(
                f"SELECT DISTINCT paper_id FROM paper_project_links WHERE paper_id IN ({placeholders})",
                paper_ids,
            ).fetchall()
        return {row["paper_id"] for row in rows}

    def add_chat_message(self, paper_id: str, role: str, content: str) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO paper_chat_messages (paper_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (paper_id, role, content[:20000], utc_now().isoformat()),
            )

    def chat_history(self, paper_id: str, limit: int = 12) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT role, content, created_at FROM paper_chat_messages
                WHERE paper_id = ? ORDER BY id DESC LIMIT ?
                """,
                (paper_id, limit),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def begin_sync(self) -> int:
        with self.connect() as db:
            cursor = db.execute(
                "INSERT INTO sync_runs (started_at, status) VALUES (?, 'running')",
                (utc_now().isoformat(),),
            )
            return int(cursor.lastrowid)

    def finish_sync(self, run_id: int, status: str, inserted: int, error: str = "") -> None:
        with self.connect() as db:
            db.execute(
                """
                UPDATE sync_runs SET finished_at=?, status=?, inserted_count=?, error_text=? WHERE id=?
                """,
                (utc_now().isoformat(), status, inserted, error[:4000], run_id),
            )

    def latest_sync(self) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def venue_sync_states(self) -> dict[str, dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM venue_sync_state").fetchall()
        return {row["venue"]: dict(row) for row in rows}

    def save_venue_sync(self, venue: str, status: str, item_count: int, error: str = "") -> None:
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO venue_sync_state (venue, last_sync, status, item_count, error_text)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(venue) DO UPDATE SET
                    last_sync=excluded.last_sync,
                    status=excluded.status,
                    item_count=excluded.item_count,
                    error_text=excluded.error_text
                """,
                (venue, utc_now().isoformat(), status, item_count, error[:1000]),
            )

    @staticmethod
    def _serialize(row: sqlite3.Row, include_explanation: bool = False) -> dict[str, Any]:
        result = dict(row)
        result["authors"] = json.loads(result.pop("authors_json") or "[]")
        result["institutions"] = json.loads(result.pop("institutions_json", "[]") or "[]")
        result["notable_institutions"] = INSTITUTION_CATALOG.match(result["institutions"])
        result["topics"] = json.loads(result.pop("topics_json") or "[]")
        venue_metadata = VENUE_CATALOG.describe(result.get("venue", ""), result.get("journal_ref", ""), result.get("source", ""))
        result["venue"] = venue_metadata.pop("canonical_venue")
        result.update(venue_metadata)
        result["favorite"] = bool(result.get("favorite"))
        result["has_explanation"] = bool(result.get("has_explanation"))
        if include_explanation:
            raw = result.pop("explanation_json", "")
            result["explanation"] = json.loads(raw) if raw else None
        else:
            result.pop("explanation_json", None)
        return result

    @staticmethod
    def _serialize_project(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["topics"] = json.loads(result.pop("topics_json") or "[]")
        result["categories"] = json.loads(result.pop("categories_json") or "[]")
        result["linked_paper_count"] = int(result.get("linked_paper_count") or 0)
        return result


class PaperClassifier:
    def __init__(self, config: dict[str, Any], venue_catalog: VenueCatalog) -> None:
        self.config = config
        self.topics: dict[str, list[str]] = config["topics"]
        self.top_venues = [item.lower() for item in config["top_venues"]]
        self.venue_catalog = venue_catalog

    def enrich(self, paper: dict[str, Any]) -> None:
        self.venue_catalog.enrich(paper)

    @staticmethod
    def contains_keyword(text: str, keyword: str) -> bool:
        normalized_keyword = keyword.lower().strip()
        if not normalized_keyword:
            return False
        if " " in normalized_keyword:
            return normalized_keyword in text
        return re.search(rf"(?<![a-z0-9]){re.escape(normalized_keyword)}(?![a-z0-9])", text) is not None

    def classify(self, paper: dict[str, Any]) -> list[str]:
        title = paper.get("title", "").lower()
        haystack = " ".join(
            [paper.get("title", ""), paper.get("abstract", ""), paper.get("venue", ""), paper.get("journal_ref", "")]
        ).lower()
        scores: list[tuple[int, str]] = []
        for topic, keywords in self.topics.items():
            score = sum(
                2 if self.contains_keyword(title, keyword) else 1
                for keyword in keywords
                if self.contains_keyword(haystack, keyword)
            )
            if score:
                scores.append((score, topic))
        scores.sort(reverse=True)
        return [topic for _, topic in scores[:3]] or ["其他相关"]

    def quality(self, paper: dict[str, Any]) -> float:
        venue_text = f"{paper.get('venue', '')} {paper.get('journal_ref', '')}".lower()
        tier_bonus = {
            "顶级会议": 36,
            "顶级期刊": 36,
            "重要会议": 24,
            "重要期刊": 24,
        }.get(paper.get("venue_tier", ""), 0)
        venue_bonus = max(tier_bonus, 30 if any(venue in venue_text for venue in self.top_venues) else 0)
        citation_bonus = min(25, (paper.get("citation_count", 0) or 0) ** 0.5 * 2.5)
        topic_bonus = min(24, len(paper.get("topics", [])) * 8)
        date_bonus = 0
        try:
            published = datetime.fromisoformat(paper.get("published", "")[:10]).replace(tzinfo=timezone.utc)
            age = max(0, (utc_now() - published).days)
            date_bonus = max(0, 21 - age * 0.6)
        except ValueError:
            pass
        return round(min(100, venue_bonus + citation_bonus + topic_bonus + date_bonus), 1)

    def recommendation(
        self,
        paper: dict[str, Any],
        topic: str,
        asset: dict[str, Any] | None = None,
        has_project: bool = False,
    ) -> dict[str, Any]:
        weights = self.config.get("recommendation_weights") or {
            "academic": 30,
            "relevance": 25,
            "freshness": 20,
            "evidence": 15,
            "impact_reproducibility": 10,
        }
        tier_ratio = {
            "顶级会议": 1.0,
            "顶级期刊": 1.0,
            "重要会议": 0.82,
            "重要期刊": 0.82,
            "预印本": 0.52,
            "其他相关": 0.34,
        }.get(paper.get("venue_tier", ""), 0.34)
        academic = weights["academic"] * tier_ratio

        topics = paper.get("topics", [])
        if topics and topics[0] == topic:
            relevance_ratio = 1.0
        elif topic in topics:
            relevance_ratio = 0.84
        else:
            relevance_ratio = 0.35
        relevance_ratio = min(1.0, relevance_ratio + max(0, len(topics) - 1) * 0.04)
        relevance = weights["relevance"] * relevance_ratio

        age_days = 365
        try:
            published = datetime.fromisoformat(paper.get("published", "")[:10]).replace(tzinfo=timezone.utc)
            age_days = max(0, (utc_now() - published).days)
        except ValueError:
            pass
        freshness_ratio = max(0.15, 1 - min(age_days, 90) / 106)
        freshness = weights["freshness"] * freshness_ratio

        local_text = bool(asset and int(asset.get("text_chars", 0) or 0) > 1000)
        local_pdf = bool(asset and asset.get("local_pdf_path"))
        direct_pdf = bool(paper.get("pdf_url"))
        abstract = bool(compact_text(paper.get("abstract")))
        evidence_ratio = 1.0 if local_text else 0.86 if local_pdf else 0.68 if direct_pdf else 0.34 if abstract else 0.1
        evidence = weights["evidence"] * evidence_ratio

        citations = int(paper.get("citation_count", 0) or 0)
        impact_ratio = min(0.5, citations ** 0.5 / 20) + (0.5 if has_project else 0)
        impact = weights["impact_reproducibility"] * impact_ratio

        components = [
            ("学术质量", academic, weights["academic"], "刊物层级与正式发表状态"),
            ("方向匹配", relevance, weights["relevance"], f"与“{topic}”及相邻主题的关键词匹配"),
            ("时效性", freshness, weights["freshness"], f"发表距今约 {age_days} 天"),
            ("证据完整度", evidence, weights["evidence"], "公开 PDF、全文缓存与摘要可用性"),
            ("影响与复现", impact, weights["impact_reproducibility"], "引用线索与高置信度代码关联"),
        ]
        return {
            "total": round(sum(value for _, value, _, _ in components), 1),
            "components": [
                {"name": name, "score": round(value, 1), "max": maximum, "reason": reason}
                for name, value, maximum, reason in components
            ],
        }


class PaperSources:
    ROBOTICS_FOCUSED_VENUES = {
        "RSS", "CoRL", "ICRA", "IROS", "HRI", "Humanoids", "WAFR",
        "Science Robotics", "IEEE T-RO", "IJRR", "IEEE RA-L",
        "IEEE Transactions on Haptics", "Autonomous Robots", "Soft Robotics",
    }

    def __init__(self, config: dict[str, Any], classifier: PaperClassifier) -> None:
        self.config = config
        self.classifier = classifier

    def request_json(self, url: str) -> Any:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=25) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                if error.code not in {429, 502, 503, 504} or attempt == 2:
                    raise
                retry_after = error.headers.get("Retry-After", "")
                try:
                    delay = max(float(retry_after), 2 ** (attempt + 1))
                except ValueError:
                    delay = 2 ** (attempt + 1)
                time.sleep(min(delay, 30))
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException):
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))
        raise RuntimeError("论文数据源请求失败")

    def request_text(self, url: str, timeout: int = 45) -> str:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    return response.read().decode("utf-8", "replace")
            except urllib.error.HTTPError as error:
                if error.code not in {429, 502, 503, 504} or attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException):
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))
        raise RuntimeError("论文网页请求失败")

    @staticmethod
    def crossref_institutions(item: dict[str, Any]) -> list[str]:
        values = []
        for author in item.get("author", []):
            for affiliation in author.get("affiliation", []) or []:
                name = compact_text(affiliation.get("name"))
                if name and name not in values:
                    values.append(name)
        return values

    @staticmethod
    def is_non_research_title(title: str) -> bool:
        normalized = compact_text(title).lower()
        patterns = (
            "information for authors",
            "society information",
            "table of contents",
            "front cover",
            "back cover",
            "list of reviewers",
            "reviewer acknowledgement",
            "correction to:",
            "erratum to:",
        )
        return any(pattern in normalized for pattern in patterns)

    def fetch_arxiv(self) -> list[dict[str, Any]]:
        categories = self.config["arxiv_categories"]
        query = " OR ".join(f"cat:{category}" for category in categories)
        params = urllib.parse.urlencode(
            {
                "search_query": f"({query})",
                "start": 0,
                "max_results": self.config["max_results_per_source"],
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            }
        )
        url = f"https://export.arxiv.org/api/query?{params}"
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=35) as response:
            root = ET.fromstring(response.read())
        ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        papers = []
        for entry in root.findall("atom:entry", ns):
            entry_url = compact_text(entry.findtext("atom:id", default="", namespaces=ns))
            arxiv_id = entry_url.rsplit("/", 1)[-1]
            links = {link.attrib.get("type", ""): link.attrib.get("href", "") for link in entry.findall("atom:link", ns)}
            authors = [compact_text(node.findtext("atom:name", default="", namespaces=ns)) for node in entry.findall("atom:author", ns)]
            journal_ref = compact_text(entry.findtext("arxiv:journal_ref", default="", namespaces=ns))
            paper = {
                "id": f"arxiv:{arxiv_id}",
                "title": compact_text(entry.findtext("atom:title", default="", namespaces=ns)),
                "abstract": compact_text(entry.findtext("atom:summary", default="", namespaces=ns)),
                "authors": authors,
                "venue": journal_ref or "arXiv",
                "published": iso_date(entry.findtext("atom:published", default="", namespaces=ns)),
                "updated": iso_date(entry.findtext("atom:updated", default="", namespaces=ns)),
                "source": "arXiv",
                "source_url": entry_url,
                "pdf_url": links.get("application/pdf", f"https://arxiv.org/pdf/{arxiv_id}"),
                "doi": compact_text(entry.findtext("arxiv:doi", default="", namespaces=ns)),
                "journal_ref": journal_ref,
                "citation_count": 0,
            }
            self.classifier.enrich(paper)
            paper["topics"] = self.classifier.classify(paper)
            if paper["topics"] != ["其他相关"]:
                paper["quality_score"] = self.classifier.quality(paper)
                papers.append(paper)
        return papers

    @staticmethod
    def abstract_from_inverted_index(index: dict[str, list[int]] | None) -> str:
        if not index:
            return ""
        positions: list[tuple[int, str]] = []
        for word, spots in index.items():
            positions.extend((position, word) for position in spots)
        return " ".join(word for _, word in sorted(positions))

    def fetch_openalex(self) -> list[dict[str, Any]]:
        from_date = (utc_now() - timedelta(days=self.config["days_back"])).date().isoformat()
        queries = ["embodied intelligence robot learning", "large language model multimodal agent"]
        papers: list[dict[str, Any]] = []
        for query in queries:
            params = urllib.parse.urlencode(
                {
                    "search": query,
                    "filter": f"from_publication_date:{from_date}",
                    "sort": "publication_date:desc",
                    "per-page": min(50, self.config["max_results_per_source"]),
                }
            )
            payload = self.request_json(f"https://api.openalex.org/works?{params}")
            for item in payload.get("results", []):
                source = ((item.get("primary_location") or {}).get("source") or {})
                doi = (item.get("doi") or "").replace("https://doi.org/", "")
                openalex_id = (item.get("id") or "").rsplit("/", 1)[-1]
                ids = item.get("ids") or {}
                source_url = item.get("doi") or ids.get("openalex") or ""
                best_location = item.get("best_oa_location") or item.get("primary_location") or {}
                paper = {
                    "id": f"doi:{doi.lower()}" if doi else f"openalex:{openalex_id}",
                    "title": compact_text(item.get("display_name")),
                    "abstract": compact_text(self.abstract_from_inverted_index(item.get("abstract_inverted_index"))),
                    "authors": [
                        compact_text((authorship.get("author") or {}).get("display_name"))
                        for authorship in item.get("authorships", [])
                        if (authorship.get("author") or {}).get("display_name")
                    ],
                    "institutions": list(dict.fromkeys(
                        compact_text(institution.get("display_name"))
                        for authorship in item.get("authorships", [])
                        for institution in authorship.get("institutions", [])
                        if compact_text(institution.get("display_name"))
                    )),
                    "venue": compact_text(source.get("display_name")) or "OpenAlex",
                    "published": item.get("publication_date") or "",
                    "updated": item.get("publication_date") or "",
                    "source": "OpenAlex",
                    "source_url": source_url,
                    "pdf_url": best_location.get("pdf_url") or "",
                    "doi": doi,
                    "journal_ref": compact_text(source.get("display_name")),
                    "citation_count": item.get("cited_by_count") or 0,
                }
                self.classifier.enrich(paper)
                paper["topics"] = self.classifier.classify(paper)
                if paper["topics"] != ["其他相关"]:
                    paper["quality_score"] = self.classifier.quality(paper)
                    papers.append(paper)
        return papers

    def fetch_crossref(self) -> list[dict[str, Any]]:
        from_date = (utc_now() - timedelta(days=self.config["days_back"])).date().isoformat()
        queries = ["embodied intelligence robotics", "large language model multimodal"]
        papers: list[dict[str, Any]] = []
        for query in queries:
            params = urllib.parse.urlencode(
                {
                    "query": query,
                    "filter": f"from-pub-date:{from_date}",
                    "rows": min(40, self.config["max_results_per_source"]),
                    "sort": "published",
                    "order": "desc",
                    "select": "DOI,title,abstract,author,container-title,published,published-online,published-print,created,URL,link,is-referenced-by-count,type",
                }
            )
            payload = self.request_json(f"https://api.crossref.org/works?{params}")
            for item in (payload.get("message") or {}).get("items", []):
                doi = compact_text(item.get("DOI"))
                title = compact_text(html.unescape(" ".join(item.get("title") or [])))
                if not doi or not title:
                    continue
                links = item.get("link") or []
                pdf_url = next((link.get("URL", "") for link in links if "pdf" in link.get("content-type", "").lower()), "")
                venue = compact_text(" ".join(item.get("container-title") or [])) or "Crossref"
                authors = [
                    compact_text(f"{author.get('given', '')} {author.get('family', '')}")
                    for author in item.get("author", [])
                ]
                abstract = re.sub(r"<[^>]+>", " ", item.get("abstract") or "")
                published_candidates = [
                    iso_date(item.get(field))
                    for field in ("published-online", "created", "published-print", "published")
                ]
                latest_visible_date = (utc_now() + timedelta(days=1)).date().isoformat()
                published = next(
                    (date for date in published_candidates if date and date <= latest_visible_date),
                    iso_date(item.get("published")),
                )
                paper = {
                    "id": f"doi:{doi.lower()}",
                    "title": title,
                    "abstract": compact_text(abstract),
                    "authors": authors,
                    "institutions": self.crossref_institutions(item),
                    "venue": venue,
                    "published": published,
                    "updated": published,
                    "source": "Crossref",
                    "source_url": item.get("URL") or f"https://doi.org/{doi}",
                    "pdf_url": pdf_url,
                    "doi": doi,
                    "journal_ref": venue,
                    "citation_count": item.get("is-referenced-by-count") or 0,
                }
                self.classifier.enrich(paper)
                paper["topics"] = self.classifier.classify(paper)
                if paper["topics"] != ["其他相关"]:
                    paper["quality_score"] = self.classifier.quality(paper)
                    papers.append(paper)
        return papers

    @staticmethod
    def ordinal(value: int) -> str:
        if 10 <= value % 100 <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(value % 10, "th")
        return f"{value}{suffix}"

    def fetch_acm_mm(self) -> list[dict[str, Any]]:
        current_year = utc_now().year
        years_back = max(1, int(self.config.get("acm_mm_years_back", 3)))
        papers_by_id: dict[str, dict[str, Any]] = {}
        for year in range(current_year - years_back, current_year + 1):
            edition = year - 1992
            if edition < 1:
                continue
            proceedings = f"Proceedings of the {self.ordinal(edition)} ACM International Conference on Multimedia"
            params = urllib.parse.urlencode(
                {
                    "query.container-title": proceedings,
                    "filter": f"from-pub-date:{year}-01-01,until-pub-date:{year}-12-31,type:proceedings-article",
                    "rows": 1000,
                    "select": "DOI,title,abstract,author,container-title,published,created,URL,link,is-referenced-by-count,type",
                }
            )
            payload = self.request_json(f"https://api.crossref.org/works?{params}")
            for item in (payload.get("message") or {}).get("items", []):
                container = compact_text(" ".join(item.get("container-title") or []))
                normalized_container = VenueCatalog.normalize(container)
                if "acm international conference on multimedia" not in normalized_container:
                    continue
                doi = compact_text(item.get("DOI"))
                title = compact_text(" ".join(item.get("title") or []))
                if not doi or not title:
                    continue
                links = item.get("link") or []
                pdf_url = next(
                    (link.get("URL", "") for link in links if "pdf" in link.get("content-type", "").lower()),
                    "",
                )
                authors = [
                    compact_text(f"{author.get('given', '')} {author.get('family', '')}")
                    for author in item.get("author", [])
                    if compact_text(f"{author.get('given', '')} {author.get('family', '')}")
                ]
                abstract = compact_text(re.sub(r"<[^>]+>", " ", item.get("abstract") or ""))
                published = iso_date(item.get("published")) or iso_date(item.get("created"))
                paper = {
                    "id": f"doi:{doi.lower()}",
                    "title": title,
                    "abstract": abstract,
                    "authors": authors,
                    "institutions": self.crossref_institutions(item),
                    "venue": "ACM MM",
                    "published": published,
                    "updated": published,
                    "source": "Crossref / ACM MM",
                    "source_url": item.get("URL") or f"https://doi.org/{doi}",
                    "pdf_url": pdf_url,
                    "doi": doi,
                    "journal_ref": container,
                    "citation_count": item.get("is-referenced-by-count") or 0,
                }
                self.classifier.enrich(paper)
                paper["topics"] = self.classifier.classify(paper)
                if paper["topics"] == ["其他相关"]:
                    continue
                paper["quality_score"] = self.classifier.quality(paper)
                papers_by_id[paper["id"]] = paper
        return list(papers_by_id.values())

    def fetch_ieee_tro(self) -> list[dict[str, Any]]:
        current_year = utc_now().year
        years_back = max(1, int(self.config.get("ieee_tro_years_back", 3)))
        params = urllib.parse.urlencode(
            {
                "query.container-title": "IEEE Transactions on Robotics",
                "filter": (
                    f"from-pub-date:{current_year - years_back}-01-01,"
                    f"until-pub-date:{current_year}-12-31,type:journal-article"
                ),
                "rows": 1000,
                "select": "DOI,title,abstract,author,container-title,published,created,URL,link,is-referenced-by-count,type",
            }
        )
        payload = self.request_json(f"https://api.crossref.org/works?{params}")
        papers = []
        for item in (payload.get("message") or {}).get("items", []):
            container = compact_text(" ".join(item.get("container-title") or []))
            if VenueCatalog.normalize(container) != "ieee transactions on robotics":
                continue
            doi = compact_text(item.get("DOI"))
            title = compact_text(html.unescape(" ".join(item.get("title") or [])))
            if not doi or not title:
                continue
            if self.is_non_research_title(title):
                continue
            links = item.get("link") or []
            pdf_url = next(
                (link.get("URL", "") for link in links if "pdf" in link.get("content-type", "").lower()),
                "",
            )
            authors = [
                compact_text(f"{author.get('given', '')} {author.get('family', '')}")
                for author in item.get("author", [])
                if compact_text(f"{author.get('given', '')} {author.get('family', '')}")
            ]
            abstract = compact_text(re.sub(r"<[^>]+>", " ", html.unescape(item.get("abstract") or "")))
            published = iso_date(item.get("published")) or iso_date(item.get("created"))
            paper = {
                "id": f"doi:{doi.lower()}",
                "title": title,
                "abstract": abstract,
                "authors": authors,
                "institutions": self.crossref_institutions(item),
                "venue": "IEEE T-RO",
                "published": published,
                "updated": published,
                "source": "Crossref / IEEE T-RO",
                "source_url": item.get("URL") or f"https://doi.org/{doi}",
                "pdf_url": pdf_url,
                "doi": doi,
                "journal_ref": container,
                "citation_count": item.get("is-referenced-by-count") or 0,
            }
            self.classifier.enrich(paper)
            paper["topics"] = self.classifier.classify(paper)
            if paper["topics"] == ["其他相关"]:
                paper["topics"] = ["具身智能"]
            paper["quality_score"] = self.classifier.quality(paper)
            papers.append(paper)
        return papers

    def fetch_catalog_venue(self, entry: dict[str, Any]) -> list[dict[str, Any]]:
        current_year = utc_now().year
        years_back = max(1, int(self.config.get("targeted_venue_years_back", 3)))
        aliases = entry.get("aliases", []) or [entry["name"]]
        query_name = max(aliases, key=lambda value: len(VenueCatalog.normalize(value)))
        publication_type = "proceedings-article" if entry.get("kind") == "会议" else "journal-article"
        params = urllib.parse.urlencode(
            {
                "query.container-title": query_name,
                "filter": (
                    f"from-pub-date:{current_year - years_back}-01-01,"
                    f"until-pub-date:{current_year}-12-31,type:{publication_type}"
                ),
                "rows": max(50, min(300, int(self.config.get("targeted_venue_rows", 160)))),
                "select": "DOI,title,abstract,author,container-title,published,created,URL,link,is-referenced-by-count,type",
            }
        )
        payload = self.request_json(f"https://api.crossref.org/works?{params}")
        papers = []
        robotics_focused = entry["name"] in self.ROBOTICS_FOCUSED_VENUES
        for item in (payload.get("message") or {}).get("items", []):
            container = compact_text(" ".join(item.get("container-title") or []))
            metadata = self.classifier.venue_catalog.describe(container, container, "Crossref targeted")
            if metadata["canonical_venue"] != entry["name"]:
                continue
            doi = compact_text(item.get("DOI"))
            title = compact_text(html.unescape(" ".join(item.get("title") or [])))
            if not doi or not title:
                continue
            if self.is_non_research_title(title):
                continue
            links = item.get("link") or []
            pdf_url = next(
                (link.get("URL", "") for link in links if "pdf" in link.get("content-type", "").lower()),
                "",
            )
            authors = [
                compact_text(f"{author.get('given', '')} {author.get('family', '')}")
                for author in item.get("author", [])
                if compact_text(f"{author.get('given', '')} {author.get('family', '')}")
            ]
            abstract = compact_text(re.sub(r"<[^>]+>", " ", html.unescape(item.get("abstract") or "")))
            published = iso_date(item.get("published")) or iso_date(item.get("created"))
            paper = {
                "id": f"doi:{doi.lower()}",
                "title": title,
                "abstract": abstract,
                "authors": authors,
                "institutions": self.crossref_institutions(item),
                "venue": entry["name"],
                "published": published,
                "updated": published,
                "source": "Crossref targeted",
                "source_url": item.get("URL") or f"https://doi.org/{doi}",
                "pdf_url": pdf_url,
                "doi": doi,
                "journal_ref": container,
                "citation_count": item.get("is-referenced-by-count") or 0,
            }
            self.classifier.enrich(paper)
            paper["topics"] = self.classifier.classify(paper)
            if paper["topics"] == ["其他相关"]:
                if robotics_focused:
                    paper["topics"] = ["具身智能"]
                else:
                    continue
            paper["quality_score"] = self.classifier.quality(paper)
            papers.append(paper)
        return papers

    def fetch_dblp_archive(self, entry: dict[str, Any]) -> list[dict[str, Any]]:
        archive_path = (self.config.get("dblp_venue_paths") or {}).get(entry["name"], "")
        if not archive_path:
            return []
        index_text = self.request_text(f"https://dblp.org/db/{archive_path}/index.xml")
        root = ET.fromstring(index_text)
        page_paths = []
        minimum_year = utc_now().year - int(self.config.get("targeted_venue_years_back", 3))
        for proceedings in root.iter("proceedings"):
            year_text = compact_text(proceedings.findtext("year"))
            candidate = compact_text(proceedings.findtext("url"))
            if year_text.isdigit() and int(year_text) >= minimum_year and candidate.endswith(".html"):
                if candidate not in page_paths:
                    page_paths.append(candidate)
        for list_item in root.iter("li"):
            reference = list_item.find(".//ref")
            if reference is None:
                continue
            candidate = reference.attrib.get("href", "")
            label = compact_text("".join(list_item.itertext()))
            year_match = re.search(r"(?:19|20)\d{2}", label)
            if candidate.endswith(".html") and year_match and int(year_match.group(0)) >= minimum_year:
                if candidate not in page_paths:
                    page_paths.append(candidate)
        for node in root.iter():
            candidate = ""
            if node.tag == "ref":
                candidate = node.attrib.get("href", "")
            elif node.tag == "url":
                candidate = compact_text(node.text)
            if candidate.endswith(".html") and "/index.html" not in candidate:
                year_match = re.search(r"(?:19|20)\d{2}", candidate)
                if not year_match or int(year_match.group(0)) < minimum_year:
                    continue
                if candidate not in page_paths:
                    page_paths.append(candidate)
        page_paths.sort(reverse=True)
        max_pages = max(1, int(self.config.get("dblp_archive_pages", 8)))
        papers_by_id: dict[str, dict[str, Any]] = {}
        robotics_focused = entry["name"] in self.ROBOTICS_FOCUSED_VENUES
        for page_path in page_paths[:max_pages]:
            page_text = self.request_text(f"https://dblp.org/{page_path.removesuffix('.html')}.xml")
            page_root = ET.fromstring(page_text)
            for record_tag in ("inproceedings", "article", "incollection"):
                for record in page_root.iter(record_tag):
                    title_node = record.find("title")
                    title = compact_text("".join(title_node.itertext()) if title_node is not None else "")
                    if not title or self.is_non_research_title(title):
                        continue
                    authors = [compact_text("".join(node.itertext())) for node in record.findall("author")]
                    year = compact_text(record.findtext("year"))
                    ee_nodes = record.findall("ee")
                    links = [compact_text(node.text) for node in ee_nodes if compact_text(node.text)]
                    source_url = next(
                        (compact_text(node.text) for node in ee_nodes if node.attrib.get("type") == "oa" and compact_text(node.text)),
                        links[0] if links else "",
                    )
                    pdf_url = next((link for link in links if link.lower().endswith(".pdf")), "")
                    doi_url = next((link for link in links if "doi.org/" in link.lower()), "")
                    doi = doi_url.split("doi.org/", 1)[-1] if doi_url else ""
                    key = record.attrib.get("key", title)
                    paper = {
                        "id": f"doi:{doi.lower()}" if doi else f"dblp:{slug_id(key)}",
                        "title": title,
                        "abstract": "",
                        "authors": authors,
                        "institutions": [],
                        "venue": entry["name"],
                        "published": f"{year}-01-01" if year else "",
                        "updated": f"{year}-01-01" if year else "",
                        "source": "DBLP archive",
                        "source_url": source_url,
                        "pdf_url": pdf_url,
                        "doi": doi,
                        "journal_ref": compact_text(record.findtext("booktitle") or record.findtext("journal")) or entry["name"],
                        "citation_count": 0,
                    }
                    self.classifier.enrich(paper)
                    paper["topics"] = self.classifier.classify(paper)
                    if paper["topics"] == ["其他相关"]:
                        if robotics_focused:
                            paper["topics"] = ["具身智能"]
                        else:
                            continue
                    paper["quality_score"] = self.classifier.quality(paper)
                    papers_by_id[paper["id"]] = paper
            time.sleep(0.6)
        return list(papers_by_id.values())

    def fetch_dblp(self) -> list[dict[str, Any]]:
        queries = self.config.get("source_queries") or [
            "embodied robot learning",
            "vision language action robot",
            "dexterous manipulation tactile robot",
            "large language model reasoning",
            "multimodal large language model",
            "language model agent tool use",
            "retrieval augmented generation",
            "llm inference serving quantization",
        ]
        minimum_year = utc_now().year - 1
        limit = min(100, self.config["max_results_per_source"])
        papers_by_id: dict[str, dict[str, Any]] = {}
        successful_queries = 0
        last_error: Exception | None = None
        for query in queries:
            params = urllib.parse.urlencode({"q": query, "h": limit, "format": "json"})
            try:
                payload = self.request_json(f"https://dblp.org/search/publ/api?{params}")
                successful_queries += 1
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
                last_error = error
                continue
            hits = (((payload.get("result") or {}).get("hits") or {}).get("hit") or [])
            if isinstance(hits, dict):
                hits = [hits]
            for hit in hits:
                info = hit.get("info") or {}
                try:
                    year = int(info.get("year") or 0)
                except (TypeError, ValueError):
                    year = 0
                if year < minimum_year:
                    continue
                title = compact_text(html.unescape(info.get("title") or "")).removesuffix(".")
                venue = compact_text(html.unescape(info.get("venue") or ""))
                if not title or not venue:
                    continue
                author_nodes = (info.get("authors") or {}).get("author") or []
                if isinstance(author_nodes, (str, dict)):
                    author_nodes = [author_nodes]
                authors = []
                for author in author_nodes:
                    name = author.get("text", "") if isinstance(author, dict) else str(author)
                    authors.append(re.sub(r"\s+\d{4}$", "", compact_text(html.unescape(name))))
                doi = compact_text(info.get("doi"))
                external_links = info.get("ee") or []
                if isinstance(external_links, str):
                    external_links = [external_links]
                source_url = next((link for link in external_links if isinstance(link, str)), "") or info.get("url", "")
                pdf_url = next((link for link in external_links if isinstance(link, str) and link.lower().endswith(".pdf")), "")
                paper = {
                    "id": f"doi:{doi.lower()}" if doi else f"dblp:{slug_id(info.get('key') or title)}",
                    "title": title,
                    "abstract": "",
                    "authors": authors,
                    "venue": venue,
                    "published": f"{year}-01-01",
                    "updated": f"{year}-01-01",
                    "source": "DBLP",
                    "source_url": source_url,
                    "pdf_url": pdf_url,
                    "doi": doi,
                    "journal_ref": venue,
                    "citation_count": 0,
                }
                self.classifier.enrich(paper)
                if paper["venue_tier"] not in {"顶级会议", "顶级期刊", "重要会议", "重要期刊"}:
                    continue
                paper["topics"] = self.classifier.classify(paper)
                if paper["topics"] == ["其他相关"]:
                    continue
                paper["quality_score"] = self.classifier.quality(paper)
                papers_by_id[paper["id"]] = paper
            time.sleep(1.0)
        if not successful_queries and last_error:
            raise last_error
        return list(papers_by_id.values())

    def fetch_pmlr(self) -> list[dict[str, Any]]:
        base_url = "https://proceedings.mlr.press"
        index = self.request_text(f"{base_url}/")
        volume_items = re.findall(
            r'<li><a href="(v\d+)"><b>Volume \d+</b></a>\s*(.*?)</li>',
            index,
            flags=re.I | re.S,
        )
        minimum_year = utc_now().year - 1
        selected: list[tuple[str, str, int]] = []
        for volume, raw_name in volume_items:
            name = compact_text(re.sub(r"<[^>]+>", " ", html.unescape(raw_name)))
            year_match = re.search(r"(?:19|20)\d{2}", name)
            year = int(year_match.group(0)) if year_match else 0
            if year < minimum_year or "workshop" in name.lower():
                continue
            venue = ""
            for candidate in ("ICML", "CoRL", "AISTATS"):
                if re.search(rf"\b{candidate}\b", name, flags=re.I):
                    venue = candidate
                    break
            if venue:
                selected.append((volume, venue, year))

        papers: list[dict[str, Any]] = []
        for volume, venue, year in selected[:8]:
            page = self.request_text(f"{base_url}/{volume}/")
            blocks = re.findall(r'<div class="paper">(.*?)</div>', page, flags=re.I | re.S)
            for block in blocks:
                title_match = re.search(r'<p class="title">(.*?)</p>', block, flags=re.I | re.S)
                authors_match = re.search(r'<span class="authors">(.*?)</span>', block, flags=re.I | re.S)
                if not title_match:
                    continue
                title = compact_text(re.sub(r"<[^>]+>", " ", html.unescape(title_match.group(1))))
                authors_text = compact_text(re.sub(r"<[^>]+>", " ", html.unescape(authors_match.group(1)))) if authors_match else ""
                authors = [compact_text(name) for name in authors_text.split(",") if compact_text(name)]
                links = re.findall(r'href="([^"]+)"', block, flags=re.I)
                source_url = next((link for link in links if link.endswith(".html")), f"{base_url}/{volume}/")
                pdf_url = next((link for link in links if link.lower().endswith(".pdf")), "")
                paper = {
                    "id": f"pmlr:{volume}:{slug_id(source_url.rsplit('/', 1)[-1].removesuffix('.html'))}",
                    "title": title,
                    "abstract": "",
                    "authors": authors,
                    "venue": venue,
                    "published": f"{year}-01-01",
                    "updated": f"{year}-01-01",
                    "source": "PMLR",
                    "source_url": source_url,
                    "pdf_url": pdf_url,
                    "doi": "",
                    "journal_ref": venue,
                    "citation_count": 0,
                }
                self.classifier.enrich(paper)
                paper["topics"] = self.classifier.classify(paper)
                if paper["topics"] == ["其他相关"]:
                    continue
                paper["quality_score"] = self.classifier.quality(paper)
                papers.append(paper)
        return papers

    def fetch_cvf(self) -> list[dict[str, Any]]:
        base_url = "https://openaccess.thecvf.com"
        menu = self.request_text(f"{base_url}/menu")
        event_names = re.findall(r'href="/?((?:CVPR|ICCV|WACV)\d{4})"', menu, flags=re.I)
        minimum_year = utc_now().year - 1
        events = []
        for event in event_names:
            year_match = re.search(r"\d{4}", event)
            year = int(year_match.group(0)) if year_match else 0
            if year >= minimum_year and event.upper() not in events:
                events.append(event.upper())

        papers: list[dict[str, Any]] = []
        for event in events[:5]:
            venue_match = re.match(r"[A-Z]+", event)
            year_match = re.search(r"\d{4}", event)
            if not venue_match or not year_match:
                continue
            venue = venue_match.group(0)
            year = int(year_match.group(0))
            page = self.request_text(f"{base_url}/{event}?day=all", timeout=60)
            entries = re.findall(
                r'<dt class="ptitle">.*?<a href="([^"]+)">(.*?)</a></dt>\s*<dd>(.*?)</dd>',
                page,
                flags=re.I | re.S,
            )
            for relative_url, raw_title, block in entries:
                title = compact_text(re.sub(r"<[^>]+>", " ", html.unescape(raw_title)))
                authors = [compact_text(html.unescape(name)) for name in re.findall(r'name="query_author" value="([^"]+)"', block)]
                source_url = urllib.parse.urljoin(base_url, relative_url)
                pdf_match = re.search(r'href="([^"]+\.pdf)"', block, flags=re.I)
                pdf_url = urllib.parse.urljoin(base_url, pdf_match.group(1)) if pdf_match else ""
                month = 6 if venue == "CVPR" else 10 if venue == "ICCV" else 1
                paper = {
                    "id": f"cvf:{slug_id(relative_url.rsplit('/', 1)[-1].removesuffix('.html'))}",
                    "title": title,
                    "abstract": "",
                    "authors": authors,
                    "venue": venue,
                    "published": f"{year}-{month:02d}-01",
                    "updated": f"{year}-{month:02d}-01",
                    "source": "CVF Open Access",
                    "source_url": source_url,
                    "pdf_url": pdf_url,
                    "doi": "",
                    "journal_ref": venue,
                    "citation_count": 0,
                }
                self.classifier.enrich(paper)
                paper["topics"] = self.classifier.classify(paper)
                if paper["topics"] == ["其他相关"]:
                    continue
                paper["quality_score"] = self.classifier.quality(paper)
                papers.append(paper)
        return papers


class PaperConnector:
    def __init__(self, store: PaperStore, sources: PaperSources, classifier: PaperClassifier) -> None:
        self.store = store
        self.sources = sources
        self.classifier = classifier

    @staticmethod
    def _doi(value: str) -> str:
        match = re.search(r"(?:doi\.org/|doi:\s*)?(10\.\d{4,9}/[-._;()/:a-z0-9]+)", compact_text(value), flags=re.I)
        return match.group(1).rstrip(".,") if match else ""

    @staticmethod
    def _arxiv_id(value: str) -> str:
        match = re.search(r"(?:arxiv\.org/(?:abs|pdf)/|arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)", value, flags=re.I)
        return match.group(1) if match else ""

    def _crossref_paper(self, item: dict[str, Any]) -> dict[str, Any] | None:
        doi = compact_text(item.get("DOI"))
        title = compact_text(html.unescape(" ".join(item.get("title") or [])))
        if not title:
            return None
        venue = compact_text(" ".join(item.get("container-title") or [])) or "Crossref"
        links = item.get("link") or []
        pdf_url = next((link.get("URL", "") for link in links if "pdf" in link.get("content-type", "").lower()), "")
        authors = [
            compact_text(f"{author.get('given', '')} {author.get('family', '')}")
            for author in item.get("author", [])
            if compact_text(f"{author.get('given', '')} {author.get('family', '')}")
        ]
        published = next(
            (
                iso_date(item.get(field))
                for field in ("published-online", "created", "published-print", "published")
                if iso_date(item.get(field))
            ),
            "",
        )
        paper = {
            "id": f"doi:{doi.lower()}" if doi else f"connector:{hashlib.sha256(title.lower().encode('utf-8')).hexdigest()[:20]}",
            "title": title,
            "abstract": compact_text(re.sub(r"<[^>]+>", " ", html.unescape(item.get("abstract") or ""))),
            "authors": authors,
            "institutions": self.sources.crossref_institutions(item),
            "venue": venue,
            "published": published,
            "updated": published,
            "source": "Connector / Crossref",
            "source_url": item.get("URL") or (f"https://doi.org/{doi}" if doi else ""),
            "pdf_url": pdf_url,
            "doi": doi,
            "journal_ref": venue,
            "citation_count": item.get("is-referenced-by-count") or 0,
        }
        self.classifier.enrich(paper)
        paper["topics"] = self.classifier.classify(paper)
        paper["quality_score"] = self.classifier.quality(paper)
        return paper

    def _arxiv_paper(self, arxiv_id: str) -> dict[str, Any] | None:
        params = urllib.parse.urlencode({"id_list": arxiv_id, "max_results": 1})
        root = ET.fromstring(self.sources.request_text(f"https://export.arxiv.org/api/query?{params}"))
        namespace = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        entry = root.find("atom:entry", namespace)
        if entry is None:
            return None
        title = compact_text(entry.findtext("atom:title", default="", namespaces=namespace))
        if not title:
            return None
        authors = [compact_text(node.findtext("atom:name", default="", namespaces=namespace)) for node in entry.findall("atom:author", namespace)]
        journal_ref = compact_text(entry.findtext("arxiv:journal_ref", default="", namespaces=namespace))
        published = iso_date(entry.findtext("atom:published", default="", namespaces=namespace))
        paper = {
            "id": f"arxiv:{arxiv_id}",
            "title": title,
            "abstract": compact_text(entry.findtext("atom:summary", default="", namespaces=namespace)),
            "authors": [author for author in authors if author],
            "institutions": [],
            "venue": journal_ref or "arXiv",
            "published": published,
            "updated": iso_date(entry.findtext("atom:updated", default="", namespaces=namespace)),
            "source": "Connector / arXiv",
            "source_url": f"https://arxiv.org/abs/{arxiv_id}",
            "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}",
            "doi": compact_text(entry.findtext("arxiv:doi", default="", namespaces=namespace)),
            "journal_ref": journal_ref,
            "citation_count": 0,
        }
        self.classifier.enrich(paper)
        paper["topics"] = self.classifier.classify(paper)
        paper["quality_score"] = self.classifier.quality(paper)
        return paper

    def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        value = compact_text(query)
        if not value:
            return []
        papers: list[dict[str, Any]] = []
        arxiv_id = self._arxiv_id(value)
        doi = self._doi(value)
        if arxiv_id:
            paper = self._arxiv_paper(arxiv_id)
            if paper:
                papers.append(paper)
        else:
            if doi:
                payload = self.sources.request_json(f"https://api.crossref.org/works/{urllib.parse.quote(doi, safe='')}")
                items = [payload.get("message") or {}]
            else:
                params = urllib.parse.urlencode(
                    {
                        "query.bibliographic": value,
                        "rows": max(1, min(20, limit)),
                        "select": "DOI,title,abstract,author,container-title,published,published-online,published-print,created,URL,link,is-referenced-by-count,type",
                    }
                )
                payload = self.sources.request_json(f"https://api.crossref.org/works?{params}")
                items = (payload.get("message") or {}).get("items", [])
            for item in items:
                paper = self._crossref_paper(item)
                if paper:
                    papers.append(paper)
        results = []
        seen = set()
        for paper in papers:
            key = paper.get("doi", "").lower() or VenueCatalog.normalize(paper["title"])
            if key in seen:
                continue
            seen.add(key)
            existing = self.store.find_paper(paper.get("doi", ""), paper["title"])
            results.append({**paper, "already_saved": bool(existing), "existing_id": existing["id"] if existing else ""})
        return results[:limit]

    def import_paper(self, payload: dict[str, Any]) -> dict[str, Any]:
        title = compact_text(str(payload.get("title", "")))
        if not title:
            raise ValueError("论文标题不能为空")
        doi = compact_text(str(payload.get("doi", "")))
        existing = self.store.find_paper(doi, title)
        if existing:
            return existing
        paper_id = compact_text(str(payload.get("id", "")))
        if not re.fullmatch(r"(?:doi|arxiv|connector):[a-zA-Z0-9._:/-]+", paper_id):
            paper_id = f"connector:{hashlib.sha256(title.lower().encode('utf-8')).hexdigest()[:20]}"
        paper = {
            "id": paper_id,
            "title": title,
            "abstract": compact_text(str(payload.get("abstract", ""))),
            "authors": [compact_text(str(value)) for value in payload.get("authors", []) if compact_text(str(value))][:100],
            "institutions": [compact_text(str(value)) for value in payload.get("institutions", []) if compact_text(str(value))][:100],
            "venue": compact_text(str(payload.get("venue", ""))) or "手动导入",
            "published": iso_date(payload.get("published")),
            "updated": iso_date(payload.get("updated")) or iso_date(payload.get("published")),
            "source": compact_text(str(payload.get("source", ""))) or "Connector",
            "source_url": compact_text(str(payload.get("source_url", ""))),
            "pdf_url": compact_text(str(payload.get("pdf_url", ""))),
            "doi": doi,
            "journal_ref": compact_text(str(payload.get("journal_ref", ""))),
            "citation_count": int(payload.get("citation_count", 0) or 0),
        }
        self.classifier.enrich(paper)
        paper["topics"] = self.classifier.classify(paper)
        paper["quality_score"] = self.classifier.quality(paper)
        self.store.upsert(paper)
        return self.store.find_paper(doi, title) or paper


class GitHubSource:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.token = os.environ.get("GITHUB_TOKEN", "").strip()

    def request_json(self, url: str) -> Any:
        headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(url, headers=headers)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                if error.code not in {403, 429, 502, 503, 504} or attempt == 2:
                    raise
                reset_at = error.headers.get("X-RateLimit-Reset", "")
                try:
                    delay = max(2 ** (attempt + 1), int(reset_at) - int(time.time()) + 1)
                except ValueError:
                    delay = 2 ** (attempt + 1)
                time.sleep(min(delay, 65))
        raise RuntimeError("GitHub API 请求失败")

    def fetch(self) -> list[dict[str, Any]]:
        days_back = max(1, int(self.config.get("github_days_back", 30)))
        since = (utc_now() - timedelta(days=days_back)).date().isoformat()
        per_query = max(1, min(100, int(self.config.get("github_per_query", 50))))
        min_stars = max(0, int(self.config.get("github_min_stars", 3)))
        projects: dict[str, dict[str, Any]] = {}
        successful_queries = 0
        last_error: Exception | None = None
        for item in self.config.get("github_queries", []):
            category = item["category"]
            query = f"{item['query']} pushed:>={since} stars:>={min_stars} archived:false fork:false"
            params = urllib.parse.urlencode(
                {"q": query, "sort": "updated", "order": "desc", "per_page": per_query}
            )
            try:
                payload = self.request_json(f"https://api.github.com/search/repositories?{params}")
                successful_queries += 1
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
                last_error = error
                continue
            for repo in payload.get("items", []):
                full_name = repo.get("full_name") or ""
                if not full_name:
                    continue
                existing = projects.get(full_name)
                categories = sorted(set((existing or {}).get("categories", [])) | {category})
                topics = sorted(set((existing or {}).get("topics", [])) | set(repo.get("topics") or []))
                project = {
                    "full_name": full_name,
                    "name": repo.get("name") or full_name.rsplit("/", 1)[-1],
                    "owner": (repo.get("owner") or {}).get("login") or full_name.split("/", 1)[0],
                    "description": compact_text(repo.get("description")),
                    "url": repo.get("html_url") or f"https://github.com/{full_name}",
                    "homepage": compact_text(repo.get("homepage")),
                    "stars": repo.get("stargazers_count") or 0,
                    "forks": repo.get("forks_count") or 0,
                    "open_issues": repo.get("open_issues_count") or 0,
                    "language": repo.get("language") or "",
                    "license": ((repo.get("license") or {}).get("spdx_id") or "").replace("NOASSERTION", ""),
                    "topics": topics,
                    "categories": categories,
                    "created_at": repo.get("created_at") or "",
                    "updated_at": repo.get("updated_at") or "",
                    "pushed_at": repo.get("pushed_at") or "",
                }
                projects[full_name] = project
            time.sleep(0.7 if self.token else 7.0)
        if not successful_queries and last_error:
            raise last_error
        return list(projects.values())


LINK_STOPWORDS = {
    "about", "after", "against", "based", "benchmark", "deep", "efficient", "evaluation", "framework",
    "from", "general", "large", "language", "learning", "method", "model", "models", "multimodal", "network",
    "robot", "robotic", "robots", "system", "systems", "through", "towards", "using", "vision", "with",
    "agent", "agents", "embodied", "generation", "reasoning", "reinforcement", "training",
    "augmented", "capabilities", "code", "context", "data", "image", "implementation", "llm", "llms", "official",
    "open", "platform", "project", "retrieval", "source", "toolkit", "video", "visual",
}


def link_tokens(value: str) -> set[str]:
    return {
        token for token in VenueCatalog.normalize(value).split()
        if len(token) >= 4 and token not in LINK_STOPWORDS
    }


def paper_project_match(paper: dict[str, Any], project: dict[str, Any]) -> tuple[float, str] | None:
    title = VenueCatalog.normalize(paper.get("title", ""))
    project_text = VenueCatalog.normalize(
        " ".join(
            [project.get("name", ""), project.get("full_name", ""), project.get("description", ""),
             project.get("homepage", ""), " ".join(project.get("topics", []))]
        )
    )
    raw_project_text = " ".join(
        [project.get("description", ""), project.get("homepage", ""), " ".join(project.get("topics", []))]
    ).lower()
    identifiers = [paper.get("doi", "")]
    identifiers.extend(re.findall(r"\b\d{4}\.\d{4,5}\b", " ".join([paper.get("id", ""), paper.get("source_url", ""), paper.get("pdf_url", "")])))
    for identifier in identifiers:
        if identifier and identifier.lower() in raw_project_text:
            return 100.0, f"项目说明包含论文标识 {identifier}"
    if title and len(title) >= 12 and title in project_text:
        return 99.0, "项目说明包含完整论文标题"
    repo_compact = VenueCatalog.normalize(project.get("name", "")).replace(" ", "")
    title_compact = title.replace(" ", "")
    if len(repo_compact) >= 5 and repo_compact in title_compact:
        return 94.0, "仓库名称与论文标题中的方法名一致"

    paper_tokens = link_tokens(title)
    project_tokens = link_tokens(project_text)
    project_name_tokens = link_tokens(project.get("name", ""))
    shared = paper_tokens & project_tokens
    name_shared = paper_tokens & project_name_tokens
    if len(shared) >= 4 and name_shared:
        coverage = len(shared) / max(1, min(len(paper_tokens), len(project_tokens)))
        if coverage >= 0.6:
            score = min(92.0, 68.0 + len(shared) * 3.0 + coverage * 18.0)
            return score, f"仓库名称及说明匹配论文专有词：{'、'.join(sorted(shared)[:5])}"

    return None


def rebuild_project_links() -> int:
    papers = STORE.list_papers()
    projects = STORE.list_projects()
    paper_profiles = []
    for paper in papers:
        identifiers = {paper.get("doi", "").lower()} if paper.get("doi") else set()
        identifiers.update(
            re.findall(
                r"\b\d{4}\.\d{4,5}\b",
                " ".join([paper.get("id", ""), paper.get("source_url", ""), paper.get("pdf_url", "")]),
            )
        )
        paper_profiles.append(
            (paper, set(paper.get("topics", [])), link_tokens(paper.get("title", "")), identifiers)
        )
    links: list[tuple[str, str, float, str]] = []
    for project in projects:
        candidates = []
        project_name_normalized = VenueCatalog.normalize(project.get("name", ""))
        if any(marker in project_name_normalized.split() for marker in {"awesome", "handbook", "roadmap", "survey", "collection"}):
            continue
        project_categories = set(project.get("categories", []))
        project_text = " ".join(
            [project.get("name", ""), project.get("full_name", ""), project.get("description", ""),
             project.get("homepage", ""), " ".join(project.get("topics", []))]
        )
        project_tokens = link_tokens(project_text)
        project_name_tokens = link_tokens(project.get("name", ""))
        project_identifiers = set(re.findall(r"\b\d{4}\.\d{4,5}\b", project_text.lower()))
        for paper, paper_topics, paper_tokens, paper_identifiers in paper_profiles:
            if project_categories and not project_categories.intersection(paper_topics):
                continue
            shared = paper_tokens & project_tokens
            if not (
                paper_identifiers.intersection(project_identifiers)
                or paper_tokens.intersection(project_name_tokens)
                or len(shared) >= 4
            ):
                continue
            match = paper_project_match(paper, project)
            if match and match[0] >= 72:
                candidates.append((match[0], paper["id"], match[1]))
        for score, paper_id, reason in sorted(candidates, reverse=True)[:4]:
            links.append((paper_id, project["full_name"], score, reason))
    STORE.replace_project_links(links)
    return len(links)


class S3ObjectStorage:
    def __init__(self) -> None:
        self.bucket = os.environ.get("PAPERFIELD_S3_BUCKET", "").strip()
        self.endpoint = os.environ.get("PAPERFIELD_S3_ENDPOINT", "").strip() or None
        self.region = os.environ.get("PAPERFIELD_S3_REGION", "auto").strip() or "auto"
        self.access_key = os.environ.get("PAPERFIELD_S3_ACCESS_KEY_ID", "").strip()
        self.secret_key = os.environ.get("PAPERFIELD_S3_SECRET_ACCESS_KEY", "").strip()
        self.provider = os.environ.get("PAPERFIELD_S3_PROVIDER", "S3 兼容对象存储").strip()
        self._client_value: Any = None

    @property
    def configured(self) -> bool:
        return bool(self.bucket and (self.access_key and self.secret_key or not self.endpoint))

    def client(self) -> Any:
        if not self.configured:
            raise RuntimeError("尚未配置云端对象存储")
        if self._client_value is None:
            try:
                import boto3
            except ImportError as error:
                raise RuntimeError("云端存储依赖未安装，请重新安装 requirements.txt") from error
            options: dict[str, Any] = {"region_name": self.region}
            if self.endpoint:
                options["endpoint_url"] = self.endpoint
            if self.access_key and self.secret_key:
                options["aws_access_key_id"] = self.access_key
                options["aws_secret_access_key"] = self.secret_key
            self._client_value = boto3.client("s3", **options)
        return self._client_value

    def upload(self, path: Path, key: str, content_type: str) -> None:
        self.client().upload_file(str(path), self.bucket, key, ExtraArgs={"ContentType": content_type})

    def download(self, key: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".cloudpart")
        try:
            self.client().download_file(self.bucket, key, str(temporary))
            temporary.replace(target)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

    def status(self) -> dict[str, Any]:
        return {
            "configured": self.configured,
            "provider": self.provider if self.configured else "",
            "bucket": self.bucket if self.configured else "",
            "local_cache_max_mb": int(os.environ.get("PAPERFIELD_LOCAL_CACHE_MAX_MB", "2048")),
        }


class PaperAssetService:
    def __init__(self, store: PaperStore, cloud: S3ObjectStorage) -> None:
        self.store = store
        self.cloud = cloud
        self._lock = threading.RLock()
        PDF_DIR.mkdir(parents=True, exist_ok=True)
        FULLTEXT_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _safe_remote_url(url: str) -> bool:
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                return False
            host = parsed.hostname.lower()
            if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
                return False
            try:
                address = ipaddress.ip_address(host)
                if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
                    return False
            except ValueError:
                pass
            return True
        except ValueError:
            return False

    @staticmethod
    def _request_json(url: str) -> Any:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.loads(response.read().decode("utf-8"))

    @staticmethod
    def _arxiv_id(paper: dict[str, Any]) -> str:
        if str(paper.get("id", "")).startswith("arxiv:"):
            return str(paper["id"]).removeprefix("arxiv:")
        for value in (paper.get("source_url", ""), paper.get("pdf_url", "")):
            match = re.search(r"arxiv\.org/(?:abs|pdf)/([^?#/]+)", value)
            if match:
                return match.group(1).removesuffix(".pdf")
        return ""

    def candidate_urls(self, paper: dict[str, Any]) -> list[tuple[str, str]]:
        candidates: list[tuple[str, str]] = []

        def add(url: str | None, provider: str) -> None:
            value = compact_text(url)
            if value and self._safe_remote_url(value) and all(existing != value for existing, _ in candidates):
                candidates.append((value, provider))

        asset = self.store.get_asset(paper["id"])
        if asset:
            add(asset.get("resolved_pdf_url"), asset.get("provider") or "已解析公开副本")
        add(paper.get("pdf_url"), paper.get("source") or "来源提供")

        arxiv_id = self._arxiv_id(paper)
        if arxiv_id:
            add(f"https://arxiv.org/pdf/{arxiv_id}", "arXiv")
        source_url = paper.get("source_url", "")
        if "openreview.net" in source_url:
            parsed = urllib.parse.urlparse(source_url)
            review_id = (urllib.parse.parse_qs(parsed.query).get("id") or [""])[0]
            if review_id:
                add(f"https://openreview.net/pdf?id={urllib.parse.quote(review_id)}", "OpenReview")

        doi = compact_text(paper.get("doi"))
        try:
            if doi:
                query = urllib.parse.urlencode({"filter": f"doi:https://doi.org/{doi}", "per-page": 1})
            else:
                query = urllib.parse.urlencode({"search": paper.get("title", ""), "per-page": 5})
            openalex = self._request_json(f"https://api.openalex.org/works?{query}")
            for work in (openalex.get("results") or [])[:5]:
                if not doi:
                    expected = VenueCatalog.normalize(paper.get("title"))
                    actual = VenueCatalog.normalize(work.get("display_name"))
                    if expected != actual:
                        continue
                locations = [work.get("best_oa_location"), work.get("primary_location"), *(work.get("locations") or [])]
                for location in locations:
                    if location:
                        add(location.get("pdf_url"), "OpenAlex 公开版本")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
            pass

        identifier = f"DOI:{doi}" if doi else f"ARXIV:{arxiv_id}" if arxiv_id else ""
        if identifier:
            try:
                encoded = urllib.parse.quote(identifier, safe=":")
                fields = urllib.parse.urlencode({"fields": "title,openAccessPdf,url,externalIds"})
                semantic = self._request_json(f"https://api.semanticscholar.org/graph/v1/paper/{encoded}?{fields}")
                add((semantic.get("openAccessPdf") or {}).get("url"), "Semantic Scholar 公开版本")
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
                pass

        if doi:
            try:
                query = urllib.parse.urlencode({"query": f"DOI:{doi}", "format": "json", "pageSize": 3})
                europe = self._request_json(f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?{query}")
                for item in ((europe.get("resultList") or {}).get("result") or []):
                    pmcid = compact_text(item.get("pmcid"))
                    if pmcid:
                        add(f"https://europepmc.org/articles/{pmcid}?pdf=render", "Europe PMC")
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError):
                pass
        return candidates

    @staticmethod
    def _cache_key(paper_id: str) -> str:
        return hashlib.sha256(paper_id.encode("utf-8")).hexdigest()[:24]

    def _cloud_key(self, paper_id: str, filename: str) -> str:
        return f"papers/{self._cache_key(paper_id)}/{filename}"

    def _prune_pdf_cache(self, exclude: Path | None = None) -> None:
        limit = max(128, int(os.environ.get("PAPERFIELD_LOCAL_CACHE_MAX_MB", "2048"))) * 1024 * 1024
        files = [path for path in PDF_DIR.glob("*.pdf") if path.is_file()]
        total = sum(path.stat().st_size for path in files)
        for path in sorted(files, key=lambda item: item.stat().st_mtime):
            if total <= limit:
                break
            if exclude and path.resolve() == exclude.resolve():
                continue
            size = path.stat().st_size
            path.unlink(missing_ok=True)
            total -= size

    def import_pdf(self, paper: dict[str, Any], content: bytes, filename: str = "") -> dict[str, Any]:
        if not content or len(content) > MAX_PDF_BYTES:
            raise ValueError("PDF 为空或超过大小限制")
        if b"%PDF" not in content[:2048]:
            raise ValueError("导入文件不是有效 PDF")
        target = PDF_DIR / f"{self._cache_key(paper['id'])}.pdf"
        temporary = target.with_suffix(".importpart")
        temporary.write_bytes(content)
        temporary.replace(target)
        text_target = FULLTEXT_DIR / f"{self._cache_key(paper['id'])}.json"
        try:
            page_count, text_chars = self._extract(target, text_target, paper.get("title", ""))
        except Exception as error:
            target.unlink(missing_ok=True)
            text_target.unlink(missing_ok=True)
            raise ValueError(f"PDF 全文提取失败：{error}") from error
        saved = self.store.save_asset(
            paper["id"],
            {
                "provider": f"手动导入{f' · {filename}' if filename else ''}",
                "access_status": "ready" if text_chars else "pdf_only",
                "local_pdf_path": str(target),
                "local_text_path": str(text_target),
                "storage_mode": "local",
                "page_count": page_count,
                "text_chars": text_chars,
                "error_text": "",
            },
        )
        self._prune_pdf_cache(target)
        return self.public_asset(paper["id"], saved)

    def archive_to_cloud(self, paper_id: str, remove_local: bool = True) -> dict[str, Any]:
        if not self.cloud.configured:
            raise RuntimeError("尚未配置云端对象存储")
        asset = self.store.get_asset(paper_id) or {}
        pdf_path = Path(asset.get("local_pdf_path", "")) if asset.get("local_pdf_path") else None
        text_path = Path(asset.get("local_text_path", "")) if asset.get("local_text_path") else None
        if not pdf_path or not pdf_path.exists():
            raise RuntimeError("本地没有可归档的 PDF")
        pdf_key = self._cloud_key(paper_id, "paper.pdf")
        self.cloud.upload(pdf_path, pdf_key, "application/pdf")
        text_key = ""
        if text_path and text_path.exists():
            text_key = self._cloud_key(paper_id, "fulltext.json")
            self.cloud.upload(text_path, text_key, "application/json")
        local_pdf_path = str(pdf_path)
        if remove_local:
            pdf_path.unlink(missing_ok=True)
            local_pdf_path = ""
        saved = self.store.save_asset(
            paper_id,
            {
                "cloud_pdf_key": pdf_key,
                "cloud_text_key": text_key,
                "storage_mode": "cloud" if remove_local else "hybrid",
                "local_pdf_path": local_pdf_path,
                "provider": f"{asset.get('provider', 'PDF')} · {self.cloud.provider}",
                "error_text": "",
            },
        )
        return self.public_asset(paper_id, saved)

    def _download(self, url: str, target: Path) -> str:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.2"},
        )
        temporary = target.with_suffix(".part")
        try:
            with urllib.request.urlopen(request, timeout=75) as response:
                final_url = response.geturl()
                if not self._safe_remote_url(final_url):
                    raise ValueError("PDF 重定向地址不安全")
                content_length = int(response.headers.get("Content-Length", "0") or 0)
                if content_length > MAX_PDF_BYTES:
                    raise ValueError("PDF 超过本地缓存大小限制")
                total = 0
                prefix = b""
                with temporary.open("wb") as handle:
                    while True:
                        chunk = response.read(1024 * 256)
                        if not chunk:
                            break
                        if total < 2048:
                            prefix += chunk[: 2048 - total]
                        total += len(chunk)
                        if total > MAX_PDF_BYTES:
                            raise ValueError("PDF 超过本地缓存大小限制")
                        handle.write(chunk)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        if b"%PDF" not in prefix:
            temporary.unlink(missing_ok=True)
            raise ValueError("下载内容不是有效 PDF")
        temporary.replace(target)
        return final_url

    @staticmethod
    def _extract(pdf_path: Path, text_path: Path, title: str) -> tuple[int, int]:
        import fitz

        pages = []
        with fitz.open(pdf_path) as document:
            for index, page in enumerate(document):
                pages.append({"page": index + 1, "text": page.get_text("text").strip()})
        payload = {"title": title, "pages": pages}
        text_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return len(pages), sum(len(page["text"]) for page in pages)

    def prepare(self, paper: dict[str, Any], force: bool = False) -> dict[str, Any]:
        with self._lock:
            asset = self.store.get_asset(paper["id"]) or {}
            if asset.get("cloud_pdf_key") and self.cloud.configured:
                return self.public_asset(paper["id"], asset)
            if not force and asset.get("access_status") == "unavailable" and asset.get("checked_at"):
                try:
                    checked = datetime.fromisoformat(asset["checked_at"])
                    if (utc_now() - checked).total_seconds() < 12 * 3600:
                        return self.public_asset(paper["id"], asset)
                except ValueError:
                    pass
            pdf_path = Path(asset.get("local_pdf_path", "")) if asset.get("local_pdf_path") else None
            text_path = Path(asset.get("local_text_path", "")) if asset.get("local_text_path") else None
            if pdf_path and pdf_path.exists():
                if not text_path or not text_path.exists():
                    text_path = FULLTEXT_DIR / f"{self._cache_key(paper['id'])}.json"
                    try:
                        page_count, text_chars = self._extract(pdf_path, text_path, paper.get("title", ""))
                        asset = self.store.save_asset(
                            paper["id"],
                            {"local_text_path": str(text_path), "page_count": page_count, "text_chars": text_chars, "access_status": "ready", "error_text": ""},
                        )
                    except Exception as error:
                        asset = self.store.save_asset(paper["id"], {"access_status": "pdf_only", "error_text": f"全文提取失败：{error}"})
                return self.public_asset(paper["id"], asset)

            errors = []
            target = PDF_DIR / f"{self._cache_key(paper['id'])}.pdf"
            for url, provider in self.candidate_urls(paper):
                try:
                    final_url = self._download(url, target)
                    text_target = FULLTEXT_DIR / f"{self._cache_key(paper['id'])}.json"
                    page_count = 0
                    text_chars = 0
                    extract_error = ""
                    try:
                        page_count, text_chars = self._extract(target, text_target, paper.get("title", ""))
                    except Exception as error:
                        extract_error = f"全文提取失败：{error}"
                    saved = self.store.save_asset(
                        paper["id"],
                        {
                            "resolved_pdf_url": final_url,
                            "landing_url": paper.get("source_url", ""),
                            "provider": provider,
                            "access_status": "ready" if text_chars else "pdf_only",
                            "local_pdf_path": str(target),
                            "local_text_path": str(text_target) if text_target.exists() else "",
                            "page_count": page_count,
                            "text_chars": text_chars,
                            "error_text": extract_error,
                        },
                    )
                    return self.public_asset(paper["id"], saved)
                except Exception as error:
                    target.unlink(missing_ok=True)
                    errors.append(f"{provider}: {error}")
            saved = self.store.save_asset(
                paper["id"],
                {
                    "landing_url": paper.get("source_url", ""),
                    "access_status": "unavailable",
                    "error_text": "；".join(errors[-4:]) or "没有找到可直接访问的公开 PDF 副本",
                },
            )
            return self.public_asset(paper["id"], saved)

    def public_asset(self, paper_id: str, asset: dict[str, Any] | None = None) -> dict[str, Any]:
        value = asset or self.store.get_asset(paper_id) or {}
        pdf_path = Path(value.get("local_pdf_path", "")) if value.get("local_pdf_path") else None
        text_path = Path(value.get("local_text_path", "")) if value.get("local_text_path") else None
        local_pdf = bool(pdf_path and pdf_path.exists())
        local_text = bool(text_path and text_path.exists())
        cloud_pdf = bool(value.get("cloud_pdf_key") and self.cloud.configured)
        cloud_text = bool(value.get("cloud_text_key") and self.cloud.configured)
        pdf_available = local_pdf or cloud_pdf
        fulltext_available = bool((local_text or cloud_text) and int(value.get("text_chars", 0) or 0) > 1000)
        return {
            "paper_id": paper_id,
            "status": value.get("access_status", "unknown"),
            "provider": value.get("provider", ""),
            "landing_url": value.get("landing_url", ""),
            "pdf_available": pdf_available,
            "fulltext_available": fulltext_available,
            "local_cached": local_pdf,
            "cloud_available": cloud_pdf,
            "storage_mode": value.get("storage_mode", "local"),
            "cloud_provider": self.cloud.provider if cloud_pdf else "",
            "pdf_url": f"/api/papers/{urllib.parse.quote(paper_id, safe='')}/pdf" if pdf_available else "",
            "page_count": int(value.get("page_count", 0) or 0),
            "text_chars": int(value.get("text_chars", 0) or 0),
            "checked_at": value.get("checked_at", ""),
            "error": value.get("error_text", ""),
        }

    def pdf_path(self, paper_id: str) -> Path | None:
        asset = self.store.get_asset(paper_id) or {}
        path = Path(asset.get("local_pdf_path", "")) if asset.get("local_pdf_path") else None
        if path and path.exists():
            return path
        cloud_key = asset.get("cloud_pdf_key", "")
        if cloud_key and self.cloud.configured:
            target = PDF_DIR / f"{self._cache_key(paper_id)}.pdf"
            self.cloud.download(cloud_key, target)
            self.store.save_asset(paper_id, {"local_pdf_path": str(target)})
            self._prune_pdf_cache(target)
            return target
        return None

    def _text_path(self, paper_id: str, asset: dict[str, Any]) -> Path | None:
        path = Path(asset.get("local_text_path", "")) if asset.get("local_text_path") else None
        if path and path.exists():
            return path
        cloud_key = asset.get("cloud_text_key", "")
        if cloud_key and self.cloud.configured:
            target = FULLTEXT_DIR / f"{self._cache_key(paper_id)}.json"
            self.cloud.download(cloud_key, target)
            self.store.save_asset(paper_id, {"local_text_path": str(target)})
            return target
        return None

    def fulltext(self, paper_id: str) -> str:
        asset = self.store.get_asset(paper_id) or {}
        path = self._text_path(paper_id, asset)
        if not path or not path.exists():
            return ""
        payload = json.loads(path.read_text(encoding="utf-8"))
        return "\n\n".join(f"--- 第 {page['page']} 页 ---\n{page['text']}" for page in payload.get("pages", []) if page.get("text"))

    def page(self, paper_id: str, page_number: int) -> dict[str, Any] | None:
        asset = self.store.get_asset(paper_id) or {}
        path = self._text_path(paper_id, asset)
        if not path or not path.exists():
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        pages = payload.get("pages", [])
        if page_number < 1 or page_number > len(pages):
            return None
        return {"page": page_number, "page_count": len(pages), "text": pages[page_number - 1].get("text", "")}

    def reading_notes(self, paper_id: str, fulltext: str) -> list[dict[str, Any]] | None:
        path = FULLTEXT_DIR / f"{self._cache_key(paper_id)}.notes.json"
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            fingerprint = hashlib.sha256(fulltext.encode("utf-8")).hexdigest()
            return payload.get("notes") if payload.get("fingerprint") == fingerprint else None
        except (OSError, ValueError, json.JSONDecodeError):
            return None

    def save_reading_notes(self, paper_id: str, fulltext: str, notes: list[dict[str, Any]]) -> None:
        path = FULLTEXT_DIR / f"{self._cache_key(paper_id)}.notes.json"
        path.write_text(
            json.dumps(
                {"fingerprint": hashlib.sha256(fulltext.encode("utf-8")).hexdigest(), "notes": notes},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )


class TranslationService:
    def translate(self, text: str, source: str = "en", target: str = "zh") -> dict[str, Any]:
        endpoint = os.environ.get("PAPERFIELD_TRANSLATE_ENDPOINT", "").strip().rstrip("/")
        content = text[:16000]
        if endpoint:
            payload = {"q": content, "source": source, "target": target, "format": "text"}
            api_key = os.environ.get("PAPERFIELD_TRANSLATE_API_KEY", "").strip()
            if api_key:
                payload["api_key"] = api_key
            request = urllib.request.Request(
                f"{endpoint}/translate",
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                result = json.loads(response.read().decode("utf-8"))
            translated = result.get("translatedText") or result.get("translation") or ""
            if not translated:
                raise RuntimeError("翻译服务没有返回结果")
            return {"text": translated, "provider": "LibreTranslate", "uses_gpt": False}

        chunks = [content[index:index + 3500] for index in range(0, len(content), 3500)]
        translated_chunks = []
        for chunk in chunks:
            params = urllib.parse.urlencode(
                {"client": "gtx", "sl": source, "tl": "zh-CN" if target == "zh" else target, "dt": "t", "q": chunk}
            )
            request = urllib.request.Request(
                f"https://translate.googleapis.com/translate_a/single?{params}",
                headers={"User-Agent": USER_AGENT},
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                result = json.loads(response.read().decode("utf-8"))
            translated_chunks.append("".join(item[0] for item in (result[0] or []) if item and item[0]))
        return {"text": "\n\n".join(translated_chunks), "provider": "Google 免费翻译端点", "uses_gpt": False}


class PaperExplainer:
    @staticmethod
    def connection() -> dict[str, str] | None:
        override_key = os.environ.get("PAPERFIELD_OPENAI_API_KEY", "").strip()
        if override_key:
            return {
                "key": override_key,
                "base_url": os.environ.get("PAPERFIELD_OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
                "model": os.environ.get("PAPERFIELD_OPENAI_MODEL", "gpt-5-mini").strip(),
                "provider": "Paperfield 环境变量",
            }

        codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
        codex_config = codex_home / "config.toml"
        codex_auth = codex_home / "auth.json"
        if codex_config.exists() and codex_auth.exists():
            try:
                config_text = codex_config.read_text(encoding="utf-8")
                provider_match = re.search(r'^model_provider\s*=\s*"([^"]+)"', config_text, flags=re.M)
                model_match = re.search(r'^model\s*=\s*"([^"]+)"', config_text, flags=re.M)
                auth = json.loads(codex_auth.read_text(encoding="utf-8"))
                key = compact_text(auth.get("OPENAI_API_KEY"))
                if provider_match and model_match and key:
                    provider_id = provider_match.group(1)
                    section_match = re.search(
                        rf'^\[model_providers\.{re.escape(provider_id)}\]\s*(.*?)(?=^\[|\Z)',
                        config_text,
                        flags=re.M | re.S,
                    )
                    provider_section = section_match.group(1) if section_match else ""
                    base_match = re.search(r'^base_url\s*=\s*"([^"]+)"', provider_section, flags=re.M)
                    wire_match = re.search(r'^wire_api\s*=\s*"([^"]+)"', provider_section, flags=re.M)
                    base_url = base_match.group(1).rstrip("/") if base_match else "https://api.openai.com/v1"
                    return {
                        "key": key,
                        "base_url": base_url,
                        "model": model_match.group(1),
                        "provider": f"CC Switch / {provider_id}",
                        "wire_api": wire_match.group(1) if wire_match else "responses",
                    }
            except (OSError, ValueError, json.JSONDecodeError):
                pass

        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if key:
            return {
                "key": key,
                "base_url": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
                "model": os.environ.get("OPENAI_MODEL", "gpt-5-mini").strip(),
                "provider": "OpenAI 环境变量",
                "wire_api": os.environ.get("OPENAI_WIRE_API", "responses").strip(),
            }
        return None

    @staticmethod
    def _paper_context(fulltext: str, limit: int = 115000) -> str:
        if len(fulltext) <= limit:
            return fulltext
        middle_start = max(0, len(fulltext) // 2 - 12500)
        return "\n\n".join(
            [
                fulltext[:65000],
                "--- 中段抽样 ---",
                fulltext[middle_start:middle_start + 25000],
                "--- 末段 ---",
                fulltext[-25000:],
            ]
        )

    @staticmethod
    def _fulltext_chunks(fulltext: str, limit: int = 12000) -> list[str]:
        pages = [item for item in re.split(r"(?=--- 第 \d+ 页 ---)", fulltext) if item.strip()]
        chunks: list[str] = []
        current = ""
        for page in pages:
            if current and len(current) + len(page) > limit:
                chunks.append(current)
                current = page
            else:
                current = f"{current}\n\n{page}".strip()
        if current:
            chunks.append(current)
        return chunks or [fulltext[:limit]]

    def explain(
        self,
        paper: dict[str, Any],
        fulltext: str = "",
        reading_notes: list[dict[str, Any]] | None = None,
        notes_callback: Any = None,
    ) -> dict[str, Any]:
        connection = self.connection()
        if connection:
            try:
                return self._openai_explain(paper, connection, fulltext, reading_notes, notes_callback)
            except Exception as error:
                fallback = self._fallback(paper)
                fallback["notice"] = f"AI 服务暂时不可用，已返回摘要导读：{error}"
                return fallback
        return self._fallback(paper)

    def _request_text(self, prompt: str, connection: dict[str, str], timeout: int = 180) -> str:
        model = connection["model"]
        wire_api = connection.get("wire_api", "responses").lower()
        if wire_api in {"chat", "chat_completions", "chat-completions"}:
            endpoint = "chat/completions"
            request_payload = {"model": model, "messages": [{"role": "user", "content": prompt}]}
        else:
            endpoint = "responses"
            request_payload = {
                "model": model,
                "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
            }
        body = json.dumps(request_payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{connection['base_url']}/{endpoint}",
            data=body,
            headers={"Authorization": f"Bearer {connection['key']}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if endpoint == "chat/completions":
            choices = payload.get("choices") or []
            output_text = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
        else:
            output_text = payload.get("output_text") or ""
            if not output_text:
                pieces = []
                for output in payload.get("output", []):
                    for content in output.get("content", []):
                        if content.get("type") in {"output_text", "text"}:
                            pieces.append(content.get("text", ""))
                output_text = "".join(pieces)
        if not output_text:
            raise ValueError("模型没有返回文本")
        return output_text

    def _openai_explain(
        self,
        paper: dict[str, Any],
        connection: dict[str, str],
        fulltext: str = "",
        reading_notes: list[dict[str, Any]] | None = None,
        notes_callback: Any = None,
    ) -> dict[str, Any]:
        basis = "全文" if fulltext else "摘要"
        source_material = paper.get("abstract", "")
        if fulltext and not reading_notes:
            chunks = self._fulltext_chunks(fulltext)
            reading_notes = [None] * len(chunks)

            def extract_note(item: tuple[int, str]) -> tuple[int, dict[str, Any]]:
                index, chunk = item
                note_prompt = f"""你正在分段精读论文《{paper['title']}》的第 {index}/{len(chunks)} 个页块。
请只依据当前页块提取可供最终讲解使用的中文研究笔记。保留所有重要页码、公式编号、数据集、指标和实验数字。
返回严格 JSON，不要 Markdown，字段为：structure, problem, method, algorithm, equations, experiments, conclusions, limitations, evidence。
除 evidence 外字段均为中文字符串数组；evidence 为包含 claim 和 pages 的对象数组。没有信息的字段返回空数组，不得猜测。
每个字段最多 3 条，每条尽量简洁，总输出不超过 1200 个中文字符。

当前页块：
{chunk}
"""
                output = self._request_text(note_prompt, connection, timeout=120)
                match = re.search(r"\{.*\}", output, flags=re.S)
                return index - 1, json.loads(match.group(0)) if match else {"raw_notes": output}

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, len(chunks))) as executor:
                futures = [executor.submit(extract_note, (index, chunk)) for index, chunk in enumerate(chunks, start=1)]
                for future in concurrent.futures.as_completed(futures):
                    note_index, note = future.result()
                    reading_notes[note_index] = note
            reading_notes = [note for note in reading_notes if note]
            if notes_callback:
                notes_callback(reading_notes)
        if fulltext:
            source_material = json.dumps(reading_notes, ensure_ascii=False)
        metadata = f"""标题：{paper['title']}
作者：{', '.join(paper.get('authors', []))}
刊物：{paper.get('venue', '')}
日期：{paper.get('published', '')}
主题：{', '.join(paper.get('topics', []))}
材料来源：{basis}{'分段阅读笔记（由带页码的全文逐块提取）' if fulltext else ''}"""

        def parse_json_output(output: str) -> dict[str, Any]:
            match = re.search(r"\{.*\}", output, flags=re.S)
            if not match:
                raise ValueError("模型没有返回可解析的 JSON")
            return json.loads(match.group(0))

        if fulltext:
            method_material = [
                {key: note.get(key, []) for key in ("structure", "problem", "method", "algorithm", "equations", "conclusions")}
                for note in (reading_notes or [])
            ]
            experiment_material = [
                {key: note.get(key, []) for key in ("method", "experiments", "conclusions", "limitations", "evidence")}
                for note in (reading_notes or [])
            ]

            def generate_part(kind: str) -> tuple[str, dict[str, Any]]:
                if kind == "method":
                    fields = "one_sentence, paper_structure, background, problem, method, algorithm_flow, derivation"
                    instructions = "algorithm_flow 按输入、表示、核心模块、训练目标、推理输出展开；derivation 解释公式、损失项或设计逻辑。"
                    material = method_material
                else:
                    fields = "experiments, conclusions, contributions, limitations, evidence"
                    instructions = "experiments 覆盖数据集、基线、指标、主结果、消融和失败案例；evidence 为包含 claim 和 pages 的对象数组。"
                    material = experiment_material
                prompt = f"""你是一名严谨的中文论文导师。只依据提供的全文阅读笔记生成讲解，不得补写没有证据的事实。
返回严格 JSON，不要 Markdown，仅包含字段：{fields}。
除 evidence 外，字段使用中文字符串或字符串数组；不能确认时明确写“正文未明确说明”。
{instructions}
总输出不超过 2600 个中文字符，但要让研究生能复述方法与结论。

{metadata}
全文阅读笔记：
{json.dumps(material, ensure_ascii=False)}
"""
                return kind, parse_json_output(self._request_text(prompt, connection, timeout=120))

            parts: dict[str, dict[str, Any]] = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                futures = [executor.submit(generate_part, kind) for kind in ("method", "experiments")]
                for future in concurrent.futures.as_completed(futures):
                    kind, result = future.result()
                    parts[kind] = result
            learning_prompt = f"""你是一名中文研究导师。根据下面已经核对全文得到的方法与实验讲解，补充学习路径。
返回严格 JSON，不要 Markdown，仅包含 prerequisites, fit, glossary。
prerequisites 是从基础到进阶的字符串数组；fit 说明论文适合怎样的研究方向与阅读优先级；
glossary 是包含 term 和 explanation 的对象数组，最多 10 个关键术语。不得引入材料之外的论文结论。

{metadata}
已核对讲解：
{json.dumps(parts, ensure_ascii=False)}
"""
            learning = parse_json_output(self._request_text(learning_prompt, connection, timeout=120))
            explanation = {**parts.get("method", {}), **parts.get("experiments", {}), **learning}
        else:
            prompt = f"""你是一名严谨、耐心的中文研究导师。请只根据论文摘要生成中文导读，不得凭标题猜测。
返回严格 JSON，不要 Markdown。字段包括 one_sentence, paper_structure, background, problem, method, algorithm_flow,
derivation, experiments, conclusions, contributions, limitations, prerequisites, fit, evidence, glossary。
无法从摘要确认的字段要明确说明“摘要未提供”。

{metadata}
摘要：{source_material}
"""
            explanation = parse_json_output(self._request_text(prompt, connection, timeout=120))
        explanation["mode"] = "ai"
        explanation["reading_basis"] = "fulltext" if fulltext else "abstract"
        explanation["provider"] = connection["provider"]
        explanation["model"] = connection["model"]
        explanation["wire_api"] = connection.get("wire_api", "responses")
        explanation["generated_at"] = utc_now().isoformat()
        return explanation

    def ask(
        self,
        paper: dict[str, Any],
        question: str,
        fulltext: str,
        history: list[dict[str, Any]],
        selected_text: str = "",
        reading_notes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        connection = self.connection()
        if not connection:
            raise RuntimeError("当前没有可用的大模型配置")
        if reading_notes:
            material = json.dumps(reading_notes, ensure_ascii=False)
            basis = "带页码的全文阅读笔记"
        elif fulltext:
            material = self._paper_context(fulltext, limit=12000)
            basis = "全文抽样页块"
        else:
            material = paper.get("abstract", "")
            basis = "摘要"
        history_text = "\n".join(
            f"{('用户' if item.get('role') == 'user' else '导师')}：{item.get('content', '')}"
            for item in history[-8:]
        )
        prompt = f"""你是论文精读导师。请回答用户关于当前论文的问题。
优先使用论文材料，关键判断附上 [第N页]；如果材料不足，直接说明，不得凭标题猜测。
请用中文回答，先给直接结论，再给推理过程、论文证据和需要核查的边界。不要返回 JSON。

论文：{paper['title']}
材料基础：{basis}
选中文本：{selected_text[:8000] or '无'}
最近对话：
{history_text or '无'}

用户问题：{question}

论文材料：
{material}
"""
        answer = self._request_text(prompt, connection, timeout=180).strip()
        return {
            "answer": answer,
            "reading_basis": "fulltext" if reading_notes else "fulltext_excerpt" if fulltext else "abstract",
            "provider": connection["provider"],
            "model": connection["model"],
            "generated_at": utc_now().isoformat(),
        }

    def _fallback(self, paper: dict[str, Any]) -> dict[str, Any]:
        abstract = compact_text(paper.get("abstract"))
        sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", abstract) if item.strip()]
        topics = paper.get("topics", [])
        topic_text = "、".join(topics) if topics else "相关研究"
        first = sentences[0] if sentences else "公开元数据暂未提供摘要。"
        method = " ".join(sentences[1:3]) if len(sentences) > 1 else first
        results = " ".join(sentences[-2:]) if len(sentences) > 2 else "需要阅读论文实验部分确认数据集、基线和指标。"
        return {
            "mode": "abstract",
            "reading_basis": "abstract",
            "generated_at": utc_now().isoformat(),
            "one_sentence": f"这是一篇与{topic_text}相关的工作，核心线索是：{first}",
            "paper_structure": "未读取全文，无法可靠还原章节结构。",
            "background": f"论文被系统归入{topic_text}。当前导读只依据标题、刊物和公开摘要生成，不替代全文阅读。",
            "problem": first,
            "method": method,
            "algorithm_flow": "未读取全文，无法可靠拆解算法输入、模块、训练目标与输出。",
            "derivation": "未读取全文，无法核对公式、损失函数和推导过程。",
            "experiments": results,
            "conclusions": results,
            "contributions": ["提出或验证了摘要中描述的核心方法。", "为相关主题提供了可继续追踪的研究线索。"],
            "limitations": ["未调用大模型时无法可靠翻译和解释全文细节。", "需要核对正文中的实验设置、消融实验和失败案例。"],
            "prerequisites": ["先理解标题中的主要任务和输入输出。", "阅读方法总览图、主结果表和结论。"],
            "fit": "如果你对这篇论文的任务场景、方法类型和实验方式都感兴趣，可以将其加入精读列表。",
            "evidence": [],
            "glossary": [{"term": topic, "explanation": f"系统根据关键词识别出的研究主题：{topic}"} for topic in topics[:4]],
        }


def load_config() -> dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


CONFIG = load_config()
VENUE_CATALOG = VenueCatalog(json.loads(VENUES_PATH.read_text(encoding="utf-8")))
INSTITUTION_CATALOG = InstitutionCatalog(json.loads(INSTITUTIONS_PATH.read_text(encoding="utf-8")))
STORE = PaperStore(DB_PATH)
CLASSIFIER = PaperClassifier(CONFIG, VENUE_CATALOG)
SOURCES = PaperSources(CONFIG, CLASSIFIER)
CONNECTOR = PaperConnector(STORE, SOURCES, CLASSIFIER)
GITHUB_SOURCE = GitHubSource(CONFIG)
EXPLAINER = PaperExplainer()
CLOUD = S3ObjectStorage()
ASSETS = PaperAssetService(STORE, CLOUD)
TRANSLATOR = TranslationService()
REFRESH_STATE: dict[str, Any] = {"running": False, "message": "", "lock": threading.Lock()}


def seed_if_empty() -> None:
    if STORE.count():
        return
    seeds = [
        {
            "id": "arxiv:2505.22566",
            "title": "Universal Visuo-Tactile Video Understanding for Embodied Interaction",
            "abstract": "Tactile perception is essential for embodied agents to understand physical attributes of objects that cannot be determined through visual inspection alone. The work presents VTV-LLM, a multimodal large language model for universal visuo-tactile video understanding, together with a 150K-frame dataset covering multiple tactile sensors and physical attributes.",
            "authors": ["Yifan Xie", "Mingyang Li", "Shoujie Li", "Wenbo Ding"],
            "venue": "NeurIPS 2025",
            "published": "2025-05-28",
            "updated": "2025-05-28",
            "source": "starter",
            "source_url": "https://arxiv.org/abs/2505.22566",
            "pdf_url": "https://arxiv.org/pdf/2505.22566",
            "doi": "",
            "journal_ref": "NeurIPS 2025",
            "citation_count": 0,
        },
        {
            "id": "starter:omnicvr",
            "title": "OmniCVR: A Benchmark for Omni-Composed Video Retrieval with Vision, Audio, and Text",
            "abstract": "The work introduces a large-scale benchmark for composed video retrieval where source video, audio, and modification text must be reasoned over jointly. It also proposes an audio-aware extension of VLM2Vec and studies the limitations of current multimodal retrieval systems.",
            "authors": ["Junyang Ji", "Shengjun Zhang", "Wenming Yang"],
            "venue": "ICLR 2026",
            "published": "2026-01-20",
            "updated": "2026-01-20",
            "source": "starter",
            "source_url": "https://openreview.net/forum?id=KxxR7emO5K",
            "pdf_url": "https://openreview.net/pdf?id=KxxR7emO5K",
            "doi": "",
            "journal_ref": "ICLR 2026",
            "citation_count": 0,
        },
        {
            "id": "starter:sap-slam",
            "title": "SAP-SLAM: Semantic-Assisted Perception SLAM with 3D Gaussian Splatting",
            "abstract": "SAP-SLAM combines dense SLAM, semantic features from pretrained visual models, and 3D Gaussian Splatting to build high-fidelity semantic maps. Semantic consistency guides Gaussian densification and pruning in difficult regions.",
            "authors": ["Yuheng Yang", "Yudong Lin", "Wenming Yang", "Guijin Wang", "Qingmin Liao"],
            "venue": "ICRA 2025",
            "published": "2025-05-19",
            "updated": "2025-05-19",
            "source": "starter",
            "source_url": "https://ieeexplore.ieee.org/document/11127553",
            "pdf_url": "",
            "doi": "",
            "journal_ref": "ICRA 2025",
            "citation_count": 0,
        },
        {
            "id": "starter:h-drunkwalk",
            "title": "H-DrunkWalk: Collaborative and Adaptive Navigation for Heterogeneous MAV Swarm",
            "abstract": "The paper studies infrastructure-free navigation for heterogeneous micro-aerial vehicle swarms. A small number of advanced MAVs collaborate with lower-cost basic MAVs to reduce localization error and improve navigation success.",
            "authors": ["Xinlei Chen", "Carlos Ruiz", "Sihan Zeng", "Pei Zhang"],
            "venue": "ACM TOSN",
            "published": "2020-04-01",
            "updated": "2020-04-01",
            "source": "starter",
            "source_url": "https://dl.acm.org/doi/10.1145/3382094",
            "pdf_url": "",
            "doi": "10.1145/3382094",
            "journal_ref": "ACM Transactions on Sensor Networks",
            "citation_count": 0,
        },
    ]
    for paper in seeds:
        CLASSIFIER.enrich(paper)
        paper["topics"] = CLASSIFIER.classify(paper)
        paper["quality_score"] = CLASSIFIER.quality(paper)
        STORE.upsert(paper)


def build_catalog_coverage(
    entries: list[dict[str, Any]],
    papers: list[dict[str, Any]],
    sync_states: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    visible_cutoff = (utc_now() + timedelta(days=1)).date().isoformat()
    stored_counts: dict[str, int] = {}
    visible_counts: dict[str, int] = {}
    scheduled_counts: dict[str, int] = {}
    for paper in papers:
        if PaperSources.is_non_research_title(paper.get("title", "")):
            continue
        venue = paper.get("venue", "")
        stored_counts[venue] = stored_counts.get(venue, 0) + 1
        published = paper.get("published", "")
        if published and published > visible_cutoff:
            scheduled_counts[venue] = scheduled_counts.get(venue, 0) + 1
        else:
            visible_counts[venue] = visible_counts.get(venue, 0) + 1

    items = []
    for entry in entries:
        state = sync_states.get(entry["name"], {})
        count = visible_counts.get(entry["name"], 0)
        stored_count = stored_counts.get(entry["name"], 0)
        scheduled_count = scheduled_counts.get(entry["name"], 0)
        sync_status = state.get("status", "")
        if count > 0:
            availability_status = "available"
        elif scheduled_count > 0:
            availability_status = "scheduled"
        elif sync_status in {"blocked", "error", "empty"}:
            availability_status = sync_status
        elif stored_count > 0:
            availability_status = "filtered"
        else:
            availability_status = "pending"
        items.append(
            {
                "venue": entry["name"],
                "count": count,
                "stored_count": stored_count,
                "scheduled_count": scheduled_count,
                "tier": entry["tier"],
                "kind": entry["kind"],
                "platform": entry["platform"],
                "domains": entry.get("domains", []),
                "last_sync": state.get("last_sync", ""),
                "sync_status": sync_status or ("covered" if stored_count else "not_targeted"),
                "availability_status": availability_status,
                "sync_error": state.get("error_text", ""),
            }
        )
    covered = sum(1 for item in items if item["count"] > 0)
    indexed = sum(1 for item in items if item["stored_count"] > 0)
    return {
        "items": items,
        "catalog_total": len(items),
        "covered": covered,
        "indexed": indexed,
        "zero": len(items) - covered,
        "scheduled": sum(1 for item in items if item["availability_status"] == "scheduled"),
        "blocked": sum(1 for item in items if item["availability_status"] == "blocked"),
        "coverage_rate": round(covered / len(items) * 100, 1) if items else 0,
        "indexed_rate": round(indexed / len(items) * 100, 1) if items else 0,
    }


def catalog_coverage() -> dict[str, Any]:
    return build_catalog_coverage(VENUE_CATALOG.entries, STORE.list_papers(), STORE.venue_sync_states())


def refresh_catalog_coverage(force: bool = False, max_venues: int | None = None) -> dict[str, Any]:
    coverage = catalog_coverage()
    budget = max_venues if max_venues is not None else int(CONFIG.get("targeted_venues_per_refresh", 8))
    now = utc_now()
    candidates = []
    for item in coverage["items"]:
        due = force or (item["count"] == 0 and not item.get("last_sync"))
        if item.get("last_sync") and not force:
            try:
                last_sync = datetime.fromisoformat(item["last_sync"])
                retry_days = 30 if item.get("sync_status") == "blocked" else 14
                due = (now - last_sync).days >= retry_days
            except ValueError:
                due = True
        if due:
            candidates.append(item)
    candidates.sort(key=lambda item: (item["count"] > 0, item["tier"] not in {"顶级会议", "顶级期刊"}, item["venue"]))
    entry_by_name = {entry["name"]: entry for entry in VENUE_CATALOG.entries}
    results = {}
    inserted = 0
    for item in candidates[: max(0, budget)]:
        venue = item["venue"]
        try:
            papers = SOURCES.fetch_catalog_venue(entry_by_name[venue])
            if not papers:
                papers = SOURCES.fetch_dblp_archive(entry_by_name[venue])
            inserted += STORE.upsert_many(papers)
            status = "success" if papers else "empty"
            STORE.save_venue_sync(venue, status, len(papers))
            results[venue] = {"status": status, "items": len(papers)}
        except Exception as error:
            status = venue_sync_error_status(error)
            STORE.save_venue_sync(venue, status, 0, str(error))
            results[venue] = {"status": status, "items": 0, "error": str(error)}
        time.sleep(0.2)
    return {"inserted": inserted, "venues": results, "processed": len(results)}


def refresh_all() -> dict[str, Any]:
    with REFRESH_STATE["lock"]:
        if REFRESH_STATE["running"]:
            return {"running": True, "message": "更新任务正在运行"}
        REFRESH_STATE["running"] = True
        REFRESH_STATE["message"] = "正在连接论文数据源"
    run_id = STORE.begin_sync()
    inserted = 0
    errors = []
    source_results = {}
    try:
        source_fetchers = [
            ("arXiv", SOURCES.fetch_arxiv),
            ("OpenAlex", SOURCES.fetch_openalex),
            ("Crossref", SOURCES.fetch_crossref),
            ("ACM MM", SOURCES.fetch_acm_mm),
            ("IEEE T-RO", SOURCES.fetch_ieee_tro),
            ("PMLR", SOURCES.fetch_pmlr),
            ("CVF Open Access", SOURCES.fetch_cvf),
        ]
        if os.environ.get("PAPERFIELD_ENABLE_DBLP", "").strip() == "1":
            source_fetchers.append(("DBLP", SOURCES.fetch_dblp))
        for name, fetcher in source_fetchers:
            REFRESH_STATE["message"] = f"正在更新 {name}"
            try:
                papers = fetcher()
                source_results[name] = len(papers)
                inserted += STORE.upsert_many(papers)
            except Exception as error:
                errors.append(f"{name}: {error}")
                source_results[name] = 0
        REFRESH_STATE["message"] = "正在回填目录刊物"
        coverage_result = refresh_catalog_coverage()
        inserted += coverage_result["inserted"]
        source_results["目录刊物回填"] = coverage_result["processed"]
        STORE.recalculate_quality(CLASSIFIER)
        REFRESH_STATE["message"] = "正在更新 GitHub 项目"
        try:
            projects = GITHUB_SOURCE.fetch()
            inserted += STORE.upsert_projects(projects)
            source_results["GitHub"] = len(projects)
        except Exception as error:
            errors.append(f"GitHub: {error}")
            source_results["GitHub"] = 0
        REFRESH_STATE["message"] = "正在关联论文与代码项目"
        source_results["论文项目关联"] = rebuild_project_links()
        status = "partial" if errors else "success"
        STORE.finish_sync(run_id, status, inserted, "\n".join(errors))
        return {"running": False, "inserted": inserted, "sources": source_results, "errors": errors}
    except Exception as error:
        STORE.finish_sync(run_id, "error", inserted, str(error))
        return {"running": False, "inserted": inserted, "sources": source_results, "errors": [str(error)]}
    finally:
        REFRESH_STATE["running"] = False
        REFRESH_STATE["message"] = ""


def refresh_in_background() -> bool:
    with REFRESH_STATE["lock"]:
        if REFRESH_STATE["running"]:
            return False
    threading.Thread(target=refresh_all, daemon=True, name="paper-refresh").start()
    return True


def scheduler_loop() -> None:
    interval = max(1, int(CONFIG.get("refresh_hours", 24))) * 3600
    while True:
        latest = STORE.latest_sync()
        due = latest is None
        if latest and latest.get("finished_at"):
            try:
                due = (utc_now() - datetime.fromisoformat(latest["finished_at"])).total_seconds() >= interval
            except ValueError:
                due = True
        if due:
            refresh_in_background()
        time.sleep(300)


def daily_recommendations(topic: str = "", per_topic: int | None = None) -> dict[str, Any]:
    papers = filter_papers(STORE.list_papers(), {})
    topics = [topic] if topic else CONFIG.get("daily_topics", list(CLASSIFIER.topics))
    limit = max(1, min(10, per_topic or int(CONFIG.get("daily_recommendations_per_topic", 5))))
    window_days = max(7, int(CONFIG.get("recommendation_window_days", 45)))
    cutoff = (utc_now() - timedelta(days=window_days)).date().isoformat()
    groups = []
    items = []
    seen: set[str] = set()
    for current_topic in topics:
        candidates = [paper for paper in papers if current_topic in paper.get("topics", [])]
        recent = [paper for paper in candidates if not paper.get("published") or paper["published"] >= cutoff]
        pool = recent if len(recent) >= limit else candidates
        pool.sort(
            key=lambda paper: (
                bool(paper.get("topics")) and paper["topics"][0] == current_topic,
                paper.get("quality_score", 0),
                paper.get("published", ""),
            ),
            reverse=True,
        )
        shortlist = pool[:80]
        shortlist_ids = [paper["id"] for paper in shortlist]
        assets = STORE.assets_for_papers(shortlist_ids)
        linked_papers = STORE.paper_ids_with_projects(shortlist_ids)
        ranked = []
        for paper in shortlist:
            asset = assets.get(paper["id"])
            score = CLASSIFIER.recommendation(paper, current_topic, asset, paper["id"] in linked_papers)
            ranked.append((score["total"], paper, score, asset))
        ranked.sort(key=lambda item: (item[0], item[1].get("published", "")), reverse=True)
        selected = []
        for _, paper, score, asset in ranked:
            if paper["id"] in seen:
                continue
            item = {
                **paper,
                "is_recommended": True,
                "recommendation_topic": current_topic,
                "recommendation_score": score["total"],
                "score_breakdown": score["components"],
                "pdf_cached": bool(asset and asset.get("local_pdf_path")),
                "fulltext_cached": bool(asset and int(asset.get("text_chars", 0) or 0) > 1000),
            }
            selected.append(item)
            items.append(item)
            seen.add(paper["id"])
            if len(selected) >= limit:
                break
        groups.append({"topic": current_topic, "items": selected, "count": len(selected)})
    return {
        "items": items,
        "groups": groups,
        "total": len(items),
        "per_topic": limit,
        "window_days": window_days,
        "weights": CONFIG.get("recommendation_weights", {}),
        "generated_at": utc_now().isoformat(),
    }


def filter_papers(papers: list[dict[str, Any]], params: dict[str, list[str]]) -> list[dict[str, Any]]:
    get = lambda name, default="": (params.get(name) or [default])[0].strip()
    query = get("q").lower()
    topic = get("topic")
    venue = get("venue")
    author = get("author").lower()
    institution = get("institution").lower()
    source = get("source")
    tier = get("tier")
    platform = get("platform")
    venue_type = get("venue_type")
    top_only = get("top")
    status = get("status")
    favorite = get("favorite")
    date_from = get("date_from")
    sort = get("sort", "quality")
    sort_secondary = get("sort_secondary")
    latest_visible_date = (utc_now() + timedelta(days=1)).date().isoformat()
    result = []
    for paper in papers:
        text = " ".join([paper["title"], paper["abstract"], " ".join(paper["authors"]), paper["venue"]]).lower()
        if query and query not in text:
            continue
        if topic and topic not in paper["topics"]:
            continue
        if venue and venue != paper["venue"]:
            continue
        if author and not any(author in item.lower() for item in paper["authors"]):
            continue
        if institution:
            institution_text = " ".join(
                paper.get("institutions", [])
                + [
                    value
                    for item in paper.get("notable_institutions", [])
                    for value in (item.get("id", ""), item.get("name", ""), item.get("parent", ""))
                ]
            ).lower()
            if institution not in institution_text:
                continue
        if source and source != paper["source"]:
            continue
        if tier and tier != paper["venue_tier"]:
            continue
        if platform and platform != paper["platform"]:
            continue
        if venue_type and venue_type != paper["venue_type"]:
            continue
        if top_only == "1" and paper["venue_tier"] not in {"顶级会议", "顶级期刊", "重要会议", "重要期刊"}:
            continue
        if status and status != paper["status"]:
            continue
        if favorite == "1" and not paper["favorite"]:
            continue
        if SOURCES.is_non_research_title(paper["title"]):
            continue
        if paper["published"] and paper["published"] > latest_visible_date:
            continue
        if date_from and paper["published"] and paper["published"] < date_from:
            continue
        result.append(paper)
    paper_sorters = {
        "quality": (lambda item: float(item.get("quality_score", 0) or 0), True),
        "date": (lambda item: item.get("published", ""), True),
        "citations": (lambda item: int(item.get("citation_count", 0) or 0), True),
        "title": (lambda item: item.get("title", "").casefold(), False),
        "venue": (lambda item: item.get("venue", "").casefold(), False),
    }
    fallback = {"quality": "date", "date": "quality", "citations": "quality", "title": "date", "venue": "date"}
    apply_multi_sort(result, sort, sort_secondary or fallback.get(sort, "date"), paper_sorters)
    return result


def filter_projects(projects: list[dict[str, Any]], params: dict[str, list[str]]) -> list[dict[str, Any]]:
    get = lambda name, default="": (params.get(name) or [default])[0].strip()
    query = get("q").lower()
    topic = get("topic")
    language = get("language")
    date_from = get("date_from")
    sort = get("sort", "updated")
    sort_secondary = get("sort_secondary")
    result = []
    for project in projects:
        text = " ".join(
            [project["full_name"], project["description"], " ".join(project["topics"]), " ".join(project["categories"])]
        ).lower()
        if query and query not in text:
            continue
        if topic and topic not in project["categories"]:
            continue
        if language and language != project["language"]:
            continue
        if date_from and project["pushed_at"] and project["pushed_at"][:10] < date_from:
            continue
        result.append(project)
    project_sorters = {
        "updated": (lambda item: item.get("pushed_at", ""), True),
        "links": (lambda item: int(item.get("linked_paper_count", 0) or 0), True),
        "stars": (lambda item: int(item.get("stars", 0) or 0), True),
        "forks": (lambda item: int(item.get("forks", 0) or 0), True),
        "issues": (lambda item: int(item.get("open_issues", 0) or 0), True),
        "name": (lambda item: item.get("full_name", "").casefold(), False),
    }
    fallback = {"updated": "stars", "links": "stars", "stars": "updated", "forks": "stars", "issues": "stars", "name": "stars"}
    apply_multi_sort(result, sort, sort_secondary or fallback.get(sort, "stars"), project_sorters)
    return result


def apply_multi_sort(
    items: list[dict[str, Any]],
    primary: str,
    secondary: str,
    sorters: dict[str, tuple[Any, bool]],
) -> None:
    fields = []
    for field in (primary, secondary):
        if field in sorters and field not in fields:
            fields.append(field)
    for field in reversed(fields):
        key, descending = sorters[field]
        items.sort(key=key, reverse=descending)


class AppHandler(SimpleHTTPRequestHandler):
    server_version = f"Paperfield/{APP_VERSION}"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def read_binary(self, maximum: int = MAX_PDF_BYTES) -> bytes:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("上传内容为空")
        if length > maximum:
            raise ValueError("上传文件超过大小限制")
        return self.rfile.read(length)

    def send_pdf_file(self, path: Path) -> None:
        size = path.stat().st_size
        start = 0
        end = size - 1
        status = HTTPStatus.OK
        range_header = self.headers.get("Range", "")
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip()) if range_header else None
        if match:
            if match.group(1):
                start = int(match.group(1))
            if match.group(2):
                end = min(end, int(match.group(2)))
            if start > end or start >= size:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            status = HTTPStatus.PARTIAL_CONTENT
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Disposition", f'inline; filename="{path.name}"')
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == HTTPStatus.PARTIAL_CONTENT:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        with path.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(1024 * 256, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            if parsed.path not in {"/", "/index.html"} and not (STATIC_DIR / parsed.path.lstrip("/")).exists():
                self.path = "/index.html"
            return super().do_GET()
        params = urllib.parse.parse_qs(parsed.query)
        if parsed.path == "/api/health":
            self.send_json(
                {
                    "status": "ok",
                    "version": APP_VERSION,
                    "papers": STORE.count(),
                    "projects": STORE.count_projects(),
                }
            )
            return
        if parsed.path == "/api/papers":
            papers = filter_papers(STORE.list_papers(), params)
            limit = max(1, min(500, int((params.get("limit") or ["100"])[0])))
            offset = max(0, int((params.get("offset") or ["0"])[0]))
            self.send_json(
                {
                    "items": papers[offset:offset + limit],
                    "total": len(papers),
                    "offset": offset,
                    "limit": limit,
                    "has_more": offset + limit < len(papers),
                }
            )
            return
        if parsed.path == "/api/recommendations":
            topic = (params.get("topic") or [""])[0].strip()
            try:
                per_topic = int((params.get("per_topic") or [str(CONFIG.get("daily_recommendations_per_topic", 5))])[0])
            except ValueError:
                per_topic = int(CONFIG.get("daily_recommendations_per_topic", 5))
            self.send_json(daily_recommendations(topic, per_topic))
            return
        if parsed.path == "/api/projects":
            projects = filter_projects(STORE.list_projects(), params)
            limit = max(1, min(500, int((params.get("limit") or ["100"])[0])))
            offset = max(0, int((params.get("offset") or ["0"])[0]))
            self.send_json(
                {
                    "items": projects[offset:offset + limit],
                    "total": len(projects),
                    "offset": offset,
                    "limit": limit,
                    "has_more": offset + limit < len(projects),
                }
            )
            return
        if parsed.path.startswith("/api/projects/"):
            full_name = urllib.parse.unquote(parsed.path.removeprefix("/api/projects/"))
            project = STORE.get_project(full_name)
            self.send_json(project or {"error": "项目不存在"}, 200 if project else 404)
            return
        paper_action = re.fullmatch(r"/api/papers/(.+)/(asset|pdf|text|chat)", parsed.path)
        if paper_action:
            paper_id = urllib.parse.unquote(paper_action.group(1))
            action = paper_action.group(2)
            paper = STORE.get_paper(paper_id)
            if not paper:
                self.send_json({"error": "论文不存在"}, 404)
                return
            if action == "asset":
                self.send_json(ASSETS.public_asset(paper_id))
                return
            if action == "pdf":
                try:
                    path = ASSETS.pdf_path(paper_id)
                    if not path:
                        ASSETS.prepare(paper)
                        path = ASSETS.pdf_path(paper_id)
                except Exception as error:
                    self.send_json({"error": f"PDF 读取失败：{error}"}, 503)
                    return
                if not path:
                    self.send_json({"error": "暂未找到可直接访问的公开 PDF 副本"}, 404)
                    return
                self.send_pdf_file(path)
                return
            if action == "text":
                try:
                    page_number = max(1, int((params.get("page") or ["1"])[0]))
                except ValueError:
                    page_number = 1
                try:
                    page = ASSETS.page(paper_id, page_number)
                except Exception as error:
                    self.send_json({"error": f"全文读取失败：{error}"}, 503)
                    return
                self.send_json(page or {"error": "该页全文尚不可用"}, 200 if page else 404)
                return
            self.send_json({"items": STORE.chat_history(paper_id), "paper_id": paper_id})
            return
        if parsed.path.startswith("/api/papers/"):
            paper_id = urllib.parse.unquote(parsed.path.removeprefix("/api/papers/"))
            paper = STORE.get_paper(paper_id)
            if paper:
                paper["asset"] = ASSETS.public_asset(paper_id)
            self.send_json(paper or {"error": "论文不存在"}, 200 if paper else 404)
            return
        if parsed.path == "/api/options":
            papers = filter_papers(STORE.list_papers(), {})
            projects = STORE.list_projects()
            coverage = catalog_coverage()
            self.send_json(
                {
                    "topics": sorted({topic for paper in papers for topic in paper["topics"]}),
                    "venues": sorted({paper["venue"] for paper in papers if paper["venue"]} | set(VENUE_CATALOG.venues())),
                    "venue_counts": {item["venue"]: item["count"] for item in coverage["items"]},
                    "venue_coverage": coverage,
                    "sources": sorted({paper["source"] for paper in papers if paper["source"]}),
                    "authors": sorted({author for paper in papers for author in paper["authors"]}),
                    "institutions": INSTITUTION_CATALOG.entries,
                    "tiers": VenueCatalog.TIER_ORDER,
                    "platforms": sorted({paper["platform"] for paper in papers if paper["platform"]} | set(VENUE_CATALOG.platforms())),
                    "venue_types": ["会议", "期刊", "综述期刊", "预印本", "其他"],
                    "project_languages": sorted({project["language"] for project in projects if project["language"]}),
                    "project_categories": sorted({category for project in projects for category in project["categories"]}),
                }
            )
            return
        if parsed.path == "/api/venues":
            self.send_json({"items": VENUE_CATALOG.entries, "total": len(VENUE_CATALOG.entries)})
            return
        if parsed.path == "/api/coverage":
            self.send_json(catalog_coverage())
            return
        if parsed.path == "/api/storage":
            self.send_json(CLOUD.status())
            return
        if parsed.path == "/api/connectors/search":
            query = (params.get("q") or [""])[0].strip()
            if not query:
                self.send_json({"items": [], "total": 0})
                return
            try:
                items = CONNECTOR.search(query)
                self.send_json({"items": items, "total": len(items)})
            except Exception as error:
                self.send_json({"error": f"论文连接器查询失败：{error}"}, 503)
            return
        if parsed.path == "/api/stats":
            papers = filter_papers(STORE.list_papers(), {})
            projects = STORE.list_projects()
            today = utc_now().date().isoformat()
            topic_counts: dict[str, int] = {}
            for paper in papers:
                for topic in paper["topics"]:
                    topic_counts[topic] = topic_counts.get(topic, 0) + 1
            ai_connection = EXPLAINER.connection()
            self.send_json(
                {
                    "total": len(papers),
                    "today": sum(1 for paper in papers if paper["published"] == today),
                    "unread": sum(1 for paper in papers if paper["status"] == "unread"),
                    "favorites": sum(1 for paper in papers if paper["favorite"]),
                    "top_venue_count": sum(
                        1 for paper in papers
                        if paper["venue_tier"] in {"顶级会议", "顶级期刊", "重要会议", "重要期刊"}
                    ),
                    "project_total": len(projects),
                    "project_updated_today": sum(1 for project in projects if project["pushed_at"][:10] == today),
                    "project_link_count": STORE.link_count(),
                    "topic_counts": topic_counts,
                    "latest_sync": STORE.latest_sync(),
                    "refresh": {"running": REFRESH_STATE["running"], "message": REFRESH_STATE["message"]},
                    "ai_enabled": bool(ai_connection),
                    "ai_provider": ai_connection["provider"] if ai_connection else "",
                    "ai_model": ai_connection["model"] if ai_connection else "",
                    "ai_wire_api": ai_connection.get("wire_api", "responses") if ai_connection else "",
                }
            )
            return
        self.send_json({"error": "接口不存在"}, 404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/translate":
            payload = self.read_json()
            text = str(payload.get("text", "")).strip()
            if not text:
                self.send_json({"error": "没有需要翻译的文本"}, 400)
                return
            try:
                self.send_json(TRANSLATOR.translate(text, str(payload.get("source", "en")), str(payload.get("target", "zh"))))
            except Exception as error:
                self.send_json({"error": str(error)}, 503)
            return
        if parsed.path == "/api/refresh":
            started = refresh_in_background()
            self.send_json({"started": started, "message": "更新已开始" if started else "更新任务正在运行"}, 202)
            return
        if parsed.path == "/api/connectors/import":
            try:
                self.send_json(CONNECTOR.import_paper(self.read_json()), 201)
            except (TypeError, ValueError) as error:
                self.send_json({"error": str(error)}, 400)
            return
        match = re.fullmatch(r"/api/papers/(.+)/(state|explain|resolve|chat|import|archive)", parsed.path)
        if match:
            paper_id = urllib.parse.unquote(match.group(1))
            action = match.group(2)
            paper = STORE.get_paper(paper_id)
            if not paper:
                self.send_json({"error": "论文不存在"}, 404)
                return
            if action == "state":
                updated = STORE.update_state(paper_id, self.read_json())
                self.send_json(updated)
                return
            if action == "import":
                try:
                    filename = urllib.parse.unquote(self.headers.get("X-Paperfield-Filename", ""))[:240]
                    self.send_json(ASSETS.import_pdf(paper, self.read_binary(), filename), 201)
                except (OSError, TypeError, ValueError) as error:
                    self.send_json({"error": str(error)}, 400)
                return
            if action == "archive":
                payload = self.read_json()
                try:
                    self.send_json(ASSETS.archive_to_cloud(paper_id, bool(payload.get("remove_local", True))))
                except Exception as error:
                    self.send_json({"error": str(error)}, 503)
                return
            if action == "resolve":
                payload = self.read_json()
                self.send_json(ASSETS.prepare(paper, bool(payload.get("force"))))
                return
            if action == "chat":
                payload = self.read_json()
                question = str(payload.get("question", "")).strip()[:4000]
                if not question:
                    self.send_json({"error": "请输入关于论文的问题"}, 400)
                    return
                try:
                    ASSETS.prepare(paper)
                    fulltext = ASSETS.fulltext(paper_id)
                    notes = ASSETS.reading_notes(paper_id, fulltext) if fulltext else None
                    history = STORE.chat_history(paper_id)
                    answer = EXPLAINER.ask(
                        paper,
                        question,
                        fulltext,
                        history,
                        str(payload.get("selected_text", "")),
                        notes,
                    )
                except Exception as error:
                    self.send_json({"error": str(error)}, 503)
                    return
                STORE.add_chat_message(paper_id, "user", question)
                STORE.add_chat_message(paper_id, "assistant", answer["answer"])
                self.send_json(answer)
                return
            try:
                ASSETS.prepare(paper)
                fulltext = ASSETS.fulltext(paper_id)
                notes = ASSETS.reading_notes(paper_id, fulltext) if fulltext else None
                explanation = EXPLAINER.explain(
                    paper,
                    fulltext,
                    notes,
                    (lambda value: ASSETS.save_reading_notes(paper_id, fulltext, value)) if fulltext else None,
                )
            except Exception as error:
                self.send_json({"error": str(error)}, 503)
                return
            STORE.save_explanation(paper_id, explanation)
            self.send_json(explanation)
            return
        self.send_json({"error": "接口不存在"}, 404)


def main() -> None:
    parser = argparse.ArgumentParser(description="Paperfield local research client")
    parser.add_argument("--host", default=os.environ.get("PAPERFIELD_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PAPERFIELD_PORT", "8765")))
    parser.add_argument("--refresh", action="store_true", help="refresh data and exit")
    args = parser.parse_args()
    seed_if_empty()
    STORE.recalculate_quality(CLASSIFIER)
    if args.refresh:
        print(json.dumps(refresh_all(), ensure_ascii=False, indent=2))
        return
    if os.environ.get("PAPERFIELD_AUTO_REFRESH", "1").strip() != "0":
        threading.Thread(target=scheduler_loop, daemon=True, name="refresh-scheduler").start()
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"Paperfield is running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
