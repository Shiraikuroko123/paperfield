from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import html
import http.client
import ipaddress
import json
import os
import posixpath
import re
import shutil
import sqlite3
import secrets
import textwrap
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
LOCAL_DIR = Path(os.environ.get("PAPERFIELD_LOCAL_DIR", ROOT / "local")).expanduser().resolve()
try:
    from dotenv import load_dotenv

    load_dotenv(LOCAL_DIR / ".env", override=False)
    load_dotenv(ROOT / ".env", override=False)
except ImportError:
    pass
STATIC_DIR = ROOT / "static"
LEGACY_DATA_DIR = ROOT / "data"
DEFAULT_DATA_DIR = LEGACY_DATA_DIR if LEGACY_DATA_DIR.exists() and not (LOCAL_DIR / "data").exists() else LOCAL_DIR / "data"
DATA_DIR = Path(os.environ.get("PAPERFIELD_DATA_DIR", DEFAULT_DATA_DIR)).expanduser().resolve()
DB_PATH = Path(os.environ.get("PAPERFIELD_DB_PATH", DATA_DIR / "papers.db")).expanduser().resolve()
PDF_DIR = Path(os.environ.get("PAPERFIELD_PDF_DIR", DATA_DIR / "pdfs")).expanduser().resolve()
FULLTEXT_DIR = Path(os.environ.get("PAPERFIELD_FULLTEXT_DIR", DATA_DIR / "fulltext")).expanduser().resolve()
PROJECT_REPO_DIR = Path(os.environ.get("PAPERFIELD_PROJECT_REPO_DIR", DATA_DIR / "repos")).expanduser().resolve()
PROJECT_DOC_TRANSLATION_DIR = Path(
    os.environ.get("PAPERFIELD_PROJECT_DOC_TRANSLATION_DIR", DATA_DIR / "project-doc-translations")
).expanduser().resolve()
AUTH_USERS_PATH = Path(
    os.environ.get("PAPERFIELD_AUTH_USERS_PATH", DATA_DIR / "auth-users.json")
).expanduser().resolve()
SETTINGS_PATH = Path(os.environ.get("PAPERFIELD_SETTINGS_PATH", DATA_DIR / "settings.json")).expanduser().resolve()
CONFIG_PATH = Path(os.environ.get("PAPERFIELD_CONFIG_PATH", ROOT / "config.json")).expanduser().resolve()
VENUES_PATH = Path(os.environ.get("PAPERFIELD_VENUES_PATH", ROOT / "venues.json")).expanduser().resolve()
INSTITUTIONS_PATH = Path(os.environ.get("PAPERFIELD_INSTITUTIONS_PATH", ROOT / "institutions.json")).expanduser().resolve()
APP_VERSION = "0.11.1"
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


class AuthService:
    MAX_USERS = 4
    ITERATIONS = 310_000
    SESSION_TTL = timedelta(days=7)

    def __init__(self, path: Path, required: bool | None = None) -> None:
        self.path = path
        self.required = (
            os.environ.get("PAPERFIELD_AUTH_REQUIRED", "").strip() == "1"
            if required is None else required
        )
        self._lock = threading.RLock()
        self._sessions: dict[str, dict[str, Any]] = {}

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"schema_version": 1, "max_users": self.MAX_USERS, "users": []}
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        users = payload.get("users") if isinstance(payload.get("users"), list) else []
        return {"schema_version": 1, "max_users": self.MAX_USERS, "users": users[:self.MAX_USERS]}

    def _save(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    @property
    def enabled(self) -> bool:
        return self.required or bool(self._load()["users"])

    def validate_startup(self) -> None:
        if self.required and not self._load()["users"]:
            raise RuntimeError(f"已启用登录保护，但账户文件中没有用户：{self.path}")

    @staticmethod
    def _normalize_username(username: str) -> str:
        value = compact_text(username).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,31}", value):
            raise ValueError("用户名需为 3-32 位小写字母、数字、点、下划线或连字符")
        return value

    @classmethod
    def _password_record(cls, password: str) -> tuple[str, str]:
        if len(password) < 6 or len(password) > 128:
            raise ValueError("密码长度必须为 6-128 位")
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, cls.ITERATIONS)
        return (
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        )

    def upsert_user(
        self,
        username: str,
        password: str,
        display_name: str = "",
        role: str | None = "standard",
    ) -> dict[str, Any]:
        normalized = self._normalize_username(username)
        normalized_role = compact_text(role).lower() if role is not None else ""
        if normalized_role and normalized_role not in {"beta", "standard"}:
            raise ValueError("账户角色必须是 beta 或 standard")
        salt, password_hash = self._password_record(password)
        with self._lock:
            payload = self._load()
            users = payload["users"]
            existing = next((item for item in users if item.get("username") == normalized), None)
            if existing is None and len(users) >= self.MAX_USERS:
                raise ValueError(f"内测账户最多允许 {self.MAX_USERS} 个")
            record = {
                "username": normalized,
                "display_name": compact_text(display_name)[:60] or normalized,
                "role": normalized_role or (existing.get("role", "standard") if existing else "standard"),
                "enabled": True,
                "salt": salt,
                "password_hash": password_hash,
                "iterations": self.ITERATIONS,
                "created_at": existing.get("created_at", utc_now().isoformat()) if existing else utc_now().isoformat(),
                "updated_at": utc_now().isoformat(),
            }
            if existing:
                users[users.index(existing)] = record
            else:
                users.append(record)
            self._save(payload)
        return self.public_user(record)

    def set_enabled(self, username: str, enabled: bool) -> dict[str, Any]:
        normalized = self._normalize_username(username)
        with self._lock:
            payload = self._load()
            record = next((item for item in payload["users"] if item.get("username") == normalized), None)
            if not record:
                raise ValueError("账户不存在")
            record["enabled"] = bool(enabled)
            record["updated_at"] = utc_now().isoformat()
            self._save(payload)
            if not enabled:
                self._sessions = {
                    token: session for token, session in self._sessions.items()
                    if session.get("username") != normalized
                }
        return self.public_user(record)

    @staticmethod
    def public_user(record: dict[str, Any]) -> dict[str, Any]:
        return {
            "username": record.get("username", ""),
            "display_name": record.get("display_name", ""),
            "role": record.get("role", "standard"),
            "enabled": bool(record.get("enabled", True)),
            "created_at": record.get("created_at", ""),
            "updated_at": record.get("updated_at", ""),
        }

    def users(self) -> list[dict[str, Any]]:
        return [self.public_user(record) for record in self._load()["users"]]

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        try:
            normalized = self._normalize_username(username)
        except ValueError:
            return None
        record = next((item for item in self._load()["users"] if item.get("username") == normalized), None)
        if not record or not record.get("enabled", True):
            return None
        try:
            salt = base64.urlsafe_b64decode(str(record.get("salt", "")))
            expected = base64.urlsafe_b64decode(str(record.get("password_hash", "")))
            iterations = int(record.get("iterations", self.ITERATIONS))
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        except (TypeError, ValueError):
            return None
        return self.public_user(record) if hmac.compare_digest(actual, expected) else None

    def create_session(self, username: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._sessions[token] = {
                "username": username,
                "expires_at": utc_now() + self.SESSION_TTL,
            }
        return token

    def session_user(self, token: str) -> dict[str, Any] | None:
        if not token:
            return None
        with self._lock:
            now = utc_now()
            self._sessions = {
                key: value for key, value in self._sessions.items()
                if value.get("expires_at") and value["expires_at"] > now
            }
            session = self._sessions.get(token)
        if not session:
            return None
        record = next(
            (item for item in self._load()["users"] if item.get("username") == session["username"]),
            None,
        )
        return self.public_user(record) if record and record.get("enabled", True) else None

    def revoke_session(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)


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
                    default_branch TEXT NOT NULL DEFAULT '',
                    size_kb INTEGER NOT NULL DEFAULT 0,
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
                CREATE TABLE IF NOT EXISTS project_assets (
                    project_full_name TEXT PRIMARY KEY,
                    local_repo_path TEXT NOT NULL DEFAULT '',
                    readme_path TEXT NOT NULL DEFAULT '',
                    file_count INTEGER NOT NULL DEFAULT 0,
                    source_chars INTEGER NOT NULL DEFAULT 0,
                    checked_at TEXT NOT NULL DEFAULT '',
                    error_text TEXT NOT NULL DEFAULT '',
                    explanation_json TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY(project_full_name) REFERENCES github_projects(full_name)
                );
                CREATE TABLE IF NOT EXISTS project_chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_full_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
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
                CREATE TABLE IF NOT EXISTS cloud_usage_monthly (
                    month TEXT PRIMARY KEY,
                    class_a INTEGER NOT NULL DEFAULT 0,
                    class_b INTEGER NOT NULL DEFAULT 0,
                    bytes_uploaded INTEGER NOT NULL DEFAULT 0,
                    bytes_downloaded INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS cloud_usage_daily (
                    day TEXT PRIMARY KEY,
                    class_a INTEGER NOT NULL DEFAULT 0,
                    class_b INTEGER NOT NULL DEFAULT 0,
                    bytes_uploaded INTEGER NOT NULL DEFAULT 0,
                    bytes_downloaded INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS cloud_objects (
                    object_key TEXT PRIMARY KEY,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS cloud_inventory_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    last_scan TEXT NOT NULL DEFAULT '',
                    object_count INTEGER NOT NULL DEFAULT 0,
                    total_bytes INTEGER NOT NULL DEFAULT 0,
                    error_text TEXT NOT NULL DEFAULT ''
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
                CREATE INDEX IF NOT EXISTS idx_project_chat_messages_project
                    ON project_chat_messages(project_full_name, id);
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
            project_columns = {row["name"] for row in db.execute("PRAGMA table_info(github_projects)").fetchall()}
            for name, definition in (
                ("default_branch", "TEXT NOT NULL DEFAULT ''"),
                ("size_kb", "INTEGER NOT NULL DEFAULT 0"),
            ):
                if name not in project_columns:
                    db.execute(f"ALTER TABLE github_projects ADD COLUMN {name} {definition}")

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
                        open_issues, language, license, default_branch, size_kb, topics_json,
                        categories_json, created_at, updated_at, pushed_at, fetched_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        default_branch=excluded.default_branch,
                        size_kb=excluded.size_kb,
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
                        project.get("default_branch", ""), project.get("size_kb", 0),
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

    def get_project_asset(self, full_name: str) -> dict[str, Any] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM project_assets WHERE project_full_name = ?", (full_name,)).fetchone()
        if not row:
            return None
        result = dict(row)
        raw = result.pop("explanation_json", "")
        result["explanation"] = json.loads(raw) if raw else None
        return result

    def save_project_asset(self, full_name: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.get_project_asset(full_name) or {}
        explanation = payload.get("explanation", current.get("explanation"))
        values = {
            "local_repo_path": payload.get("local_repo_path", current.get("local_repo_path", "")),
            "readme_path": payload.get("readme_path", current.get("readme_path", "")),
            "file_count": int(payload.get("file_count", current.get("file_count", 0)) or 0),
            "source_chars": int(payload.get("source_chars", current.get("source_chars", 0)) or 0),
            "checked_at": payload.get("checked_at", utc_now().isoformat()),
            "error_text": str(payload.get("error_text", current.get("error_text", "")))[:2000],
            "explanation_json": json.dumps(explanation, ensure_ascii=False) if explanation else "",
        }
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO project_assets (
                    project_full_name, local_repo_path, readme_path, file_count,
                    source_chars, checked_at, error_text, explanation_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_full_name) DO UPDATE SET
                    local_repo_path=excluded.local_repo_path,
                    readme_path=excluded.readme_path,
                    file_count=excluded.file_count,
                    source_chars=excluded.source_chars,
                    checked_at=excluded.checked_at,
                    error_text=excluded.error_text,
                    explanation_json=excluded.explanation_json
                """,
                (
                    full_name, values["local_repo_path"], values["readme_path"], values["file_count"],
                    values["source_chars"], values["checked_at"], values["error_text"], values["explanation_json"],
                ),
            )
        return self.get_project_asset(full_name) or {"project_full_name": full_name, **values}

    def save_project_explanation(self, full_name: str, explanation: dict[str, Any]) -> dict[str, Any]:
        return self.save_project_asset(full_name, {"explanation": explanation})

    def add_project_chat_message(self, full_name: str, role: str, content: str) -> None:
        with self.connect() as db:
            db.execute(
                "INSERT INTO project_chat_messages (project_full_name, role, content, created_at) VALUES (?, ?, ?, ?)",
                (full_name, role, content[:30000], utc_now().isoformat()),
            )

    def project_chat_history(self, full_name: str, limit: int = 12) -> list[dict[str, Any]]:
        limit_clause = " LIMIT ?" if limit > 0 else ""
        parameters: tuple[Any, ...] = (full_name, limit) if limit > 0 else (full_name,)
        with self.connect() as db:
            rows = db.execute(
                f"""
                SELECT role, content, created_at FROM project_chat_messages
                WHERE project_full_name = ? ORDER BY id DESC{limit_clause}
                """,
                parameters,
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def has_local_project_reading(self, full_name: str) -> bool:
        with self.connect() as db:
            asset = db.execute(
                "SELECT explanation_json FROM project_assets WHERE project_full_name = ?", (full_name,),
            ).fetchone()
            chat = db.execute(
                "SELECT 1 FROM project_chat_messages WHERE project_full_name = ? LIMIT 1", (full_name,),
            ).fetchone()
        return bool((asset and asset["explanation_json"]) or chat)

    def restore_project_reading(self, full_name: str, payload: dict[str, Any]) -> None:
        explanation = payload.get("explanation") if isinstance(payload.get("explanation"), dict) else None
        messages = payload.get("chat") if isinstance(payload.get("chat"), list) else []
        if explanation:
            self.save_project_explanation(full_name, explanation)
        with self.connect() as db:
            db.execute("DELETE FROM project_chat_messages WHERE project_full_name = ?", (full_name,))
            db.executemany(
                "INSERT INTO project_chat_messages (project_full_name, role, content, created_at) VALUES (?, ?, ?, ?)",
                [
                    (
                        full_name,
                        str(item.get("role", "")),
                        str(item.get("content", ""))[:30000],
                        str(item.get("created_at", "")) or utc_now().isoformat(),
                    )
                    for item in messages
                    if item.get("role") in {"user", "assistant"} and item.get("content")
                ],
            )

    def project_ids_with_reading(self) -> list[str]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT project_full_name FROM project_assets WHERE explanation_json != ''
                UNION SELECT DISTINCT project_full_name FROM project_chat_messages
                """
            ).fetchall()
        return [str(row[0]) for row in rows]

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

    def record_cloud_operation(self, operation_class: str, byte_count: int = 0, count: int = 1) -> None:
        if operation_class not in {"class_a", "class_b"}:
            raise ValueError("未知的云端操作类型")
        month = utc_now().strftime("%Y-%m")
        class_a = count if operation_class == "class_a" else 0
        class_b = count if operation_class == "class_b" else 0
        uploaded = max(0, byte_count) if operation_class == "class_a" else 0
        downloaded = max(0, byte_count) if operation_class == "class_b" else 0
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO cloud_usage_monthly (month, class_a, class_b, bytes_uploaded, bytes_downloaded)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(month) DO UPDATE SET
                    class_a=class_a + excluded.class_a,
                    class_b=class_b + excluded.class_b,
                    bytes_uploaded=bytes_uploaded + excluded.bytes_uploaded,
                    bytes_downloaded=bytes_downloaded + excluded.bytes_downloaded
                """,
                (month, class_a, class_b, uploaded, downloaded),
            )
            db.execute(
                """
                INSERT INTO cloud_usage_daily (day, class_a, class_b, bytes_uploaded, bytes_downloaded)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(day) DO UPDATE SET
                    class_a=class_a + excluded.class_a,
                    class_b=class_b + excluded.class_b,
                    bytes_uploaded=bytes_uploaded + excluded.bytes_uploaded,
                    bytes_downloaded=bytes_downloaded + excluded.bytes_downloaded
                """,
                (utc_now().date().isoformat(), class_a, class_b, uploaded, downloaded),
            )

    def cloud_usage(self, month: str | None = None) -> dict[str, Any]:
        selected = month or utc_now().strftime("%Y-%m")
        with self.connect() as db:
            row = db.execute("SELECT * FROM cloud_usage_monthly WHERE month = ?", (selected,)).fetchone()
        return dict(row) if row else {
            "month": selected, "class_a": 0, "class_b": 0, "bytes_uploaded": 0, "bytes_downloaded": 0,
        }

    def cloud_usage_range(self, start_day: str, end_day: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                """
                SELECT COALESCE(SUM(class_a), 0) AS class_a, COALESCE(SUM(class_b), 0) AS class_b,
                       COALESCE(SUM(bytes_uploaded), 0) AS bytes_uploaded,
                       COALESCE(SUM(bytes_downloaded), 0) AS bytes_downloaded
                FROM cloud_usage_daily WHERE day >= ? AND day < ?
                """,
                (start_day, end_day),
            ).fetchone()
        return {"period_start": start_day, "period_end": end_day, **dict(row)}

    def save_cloud_object(self, key: str, size_bytes: int) -> None:
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO cloud_objects (object_key, size_bytes, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(object_key) DO UPDATE SET size_bytes=excluded.size_bytes, updated_at=excluded.updated_at
                """,
                (key, max(0, size_bytes), utc_now().isoformat()),
            )

    def has_cloud_object(self, key: str) -> bool:
        with self.connect() as db:
            return bool(db.execute("SELECT 1 FROM cloud_objects WHERE object_key = ? LIMIT 1", (key,)).fetchone())

    def cloud_object_size(self, key: str) -> int:
        with self.connect() as db:
            row = db.execute(
                "SELECT size_bytes FROM cloud_objects WHERE object_key = ? LIMIT 1",
                (key,),
            ).fetchone()
        return int(row["size_bytes"] if row else 0)

    def cloud_object_summary(self) -> dict[str, int]:
        with self.connect() as db:
            row = db.execute(
                "SELECT COUNT(*) AS object_count, COALESCE(SUM(size_bytes), 0) AS total_bytes FROM cloud_objects"
            ).fetchone()
        return {"object_count": int(row["object_count"]), "total_bytes": int(row["total_bytes"])}

    def save_cloud_inventory(self, objects: list[tuple[str, int]], error_text: str = "") -> dict[str, Any]:
        now = utc_now().isoformat()
        with self.connect() as db:
            if not error_text:
                db.execute("DELETE FROM cloud_objects")
                db.executemany(
                    "INSERT INTO cloud_objects (object_key, size_bytes, updated_at) VALUES (?, ?, ?)",
                    [(key, max(0, size), now) for key, size in objects],
                )
            total_bytes = sum(max(0, size) for _, size in objects)
            db.execute(
                """
                INSERT INTO cloud_inventory_state (id, last_scan, object_count, total_bytes, error_text)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    last_scan=excluded.last_scan,
                    object_count=excluded.object_count,
                    total_bytes=excluded.total_bytes,
                    error_text=excluded.error_text
                """,
                (now, len(objects), total_bytes, error_text[:2000]),
            )
        return self.cloud_inventory()

    def cloud_inventory(self) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM cloud_inventory_state WHERE id = 1").fetchone()
            if row:
                return dict(row)
            summary = db.execute(
                "SELECT COUNT(*) AS object_count, COALESCE(SUM(size_bytes), 0) AS total_bytes FROM cloud_objects"
            ).fetchone()
        return {
            "last_scan": "", "object_count": int(summary["object_count"]),
            "total_bytes": int(summary["total_bytes"]), "error_text": "",
        }

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
        limit_clause = " LIMIT ?" if limit > 0 else ""
        parameters: tuple[Any, ...] = (paper_id, limit) if limit > 0 else (paper_id,)
        with self.connect() as db:
            rows = db.execute(
                f"""
                SELECT role, content, created_at FROM paper_chat_messages
                WHERE paper_id = ? ORDER BY id DESC{limit_clause}
                """,
                parameters,
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def has_local_paper_reading(self, paper_id: str) -> bool:
        with self.connect() as db:
            state = db.execute("SELECT 1 FROM user_state WHERE paper_id = ? LIMIT 1", (paper_id,)).fetchone()
            chat = db.execute("SELECT 1 FROM paper_chat_messages WHERE paper_id = ? LIMIT 1", (paper_id,)).fetchone()
        return bool(state or chat)

    def restore_paper_reading(self, paper_id: str, payload: dict[str, Any]) -> None:
        state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
        explanation = state.get("explanation") if isinstance(state.get("explanation"), dict) else None
        messages = payload.get("chat") if isinstance(payload.get("chat"), list) else []
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO user_state (paper_id, status, favorite, notes, explanation_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                    status=excluded.status,
                    favorite=excluded.favorite,
                    notes=excluded.notes,
                    explanation_json=excluded.explanation_json,
                    updated_at=excluded.updated_at
                """,
                (
                    paper_id,
                    str(state.get("status", "unread")),
                    int(bool(state.get("favorite"))),
                    str(state.get("notes", ""))[:5000],
                    json.dumps(explanation, ensure_ascii=False) if explanation else "",
                    str(payload.get("updated_at", "")) or utc_now().isoformat(),
                ),
            )
            db.execute("DELETE FROM paper_chat_messages WHERE paper_id = ?", (paper_id,))
            db.executemany(
                "INSERT INTO paper_chat_messages (paper_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                [
                    (
                        paper_id,
                        str(item.get("role", "")),
                        str(item.get("content", ""))[:20000],
                        str(item.get("created_at", "")) or utc_now().isoformat(),
                    )
                    for item in messages
                    if item.get("role") in {"user", "assistant"} and item.get("content")
                ],
            )

    def paper_ids_with_reading(self) -> list[str]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT paper_id FROM user_state
                WHERE explanation_json != '' OR status != 'unread' OR favorite != 0 OR notes != ''
                UNION SELECT DISTINCT paper_id FROM paper_chat_messages
                """
            ).fetchall()
        return [str(row[0]) for row in rows]

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
        category_query = " OR ".join(f"cat:{category}" for category in categories)
        query_specs = [(f"({category_query})", "submittedDate", 1)]
        focus_pages = max(1, int(self.config.get("arxiv_focus_pages", 2)))
        query_specs.extend(
            (f"({category_query}) AND ({focus_query})", "lastUpdatedDate", focus_pages)
            for focus_query in self.config.get("arxiv_focus_queries", [])
        )
        ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        papers: dict[str, dict[str, Any]] = {}
        request_count = 0
        page_size = max(1, int(self.config["max_results_per_source"]))
        for search_query, sort_by, max_pages in query_specs:
            for page in range(max_pages):
                if request_count:
                    time.sleep(3)
                params = urllib.parse.urlencode(
                    {
                        "search_query": search_query,
                        "start": page * page_size,
                        "max_results": page_size,
                        "sortBy": sort_by,
                        "sortOrder": "descending",
                    }
                )
                request = urllib.request.Request(
                    f"https://export.arxiv.org/api/query?{params}", headers={"User-Agent": USER_AGENT},
                )
                with urllib.request.urlopen(request, timeout=35) as response:
                    root = ET.fromstring(response.read())
                request_count += 1
                entries = root.findall("atom:entry", ns)
                for entry in entries:
                    entry_url = compact_text(entry.findtext("atom:id", default="", namespaces=ns))
                    raw_arxiv_id = entry_url.rsplit("/", 1)[-1]
                    arxiv_id = re.sub(r"v\d+$", "", raw_arxiv_id)
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
                        "source_url": f"https://arxiv.org/abs/{arxiv_id}",
                        "pdf_url": links.get("application/pdf", f"https://arxiv.org/pdf/{arxiv_id}"),
                        "doi": compact_text(entry.findtext("arxiv:doi", default="", namespaces=ns)),
                        "journal_ref": journal_ref,
                        "citation_count": 0,
                    }
                    self.classifier.enrich(paper)
                    paper["topics"] = self.classifier.classify(paper)
                    if paper["topics"] != ["其他相关"]:
                        paper["quality_score"] = self.classifier.quality(paper)
                        papers[paper["id"]] = paper
                if len(entries) < page_size:
                    break
        return list(papers.values())

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
                    "default_branch": repo.get("default_branch") or "",
                    "size_kb": repo.get("size") or 0,
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


class ProjectAssetService:
    TEXT_EXTENSIONS = {
        ".py", ".pyi", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".java", ".kt",
        ".c", ".cc", ".cpp", ".h", ".hpp", ".go", ".rs", ".rb", ".php", ".swift",
        ".sh", ".ps1", ".bat", ".yaml", ".yml", ".json", ".toml", ".ini", ".cfg",
        ".md", ".rst", ".txt", ".html", ".css", ".scss", ".sql", ".proto", ".ipynb",
    }
    TEXT_FILENAMES = {
        "dockerfile", "makefile", "license", "notice", "requirements.txt", "environment.yml",
        "pyproject.toml", "package.json", "cargo.toml", "go.mod", "cmakelists.txt",
    }
    IGNORED_PARTS = {
        ".git", ".github", "node_modules", "vendor", "dist", "build", "target", "__pycache__",
        ".venv", "venv", "datasets", "data", "checkpoints", "weights", "outputs", "logs",
    }
    LANGUAGE_LABELS = {
        ".py": "Python", ".pyi": "Python", ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
        ".ts": "TypeScript", ".tsx": "TSX", ".jsx": "JSX", ".java": "Java", ".kt": "Kotlin",
        ".c": "C", ".cc": "C++", ".cpp": "C++", ".h": "C/C++ Header", ".hpp": "C++ Header",
        ".go": "Go", ".rs": "Rust", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift",
        ".sh": "Shell", ".ps1": "PowerShell", ".bat": "Batch", ".yaml": "YAML", ".yml": "YAML",
        ".json": "JSON", ".toml": "TOML", ".ini": "INI", ".cfg": "Config", ".md": "Markdown",
        ".rst": "reStructuredText", ".txt": "Text", ".html": "HTML", ".css": "CSS", ".scss": "SCSS",
        ".sql": "SQL", ".proto": "Protocol Buffers", ".ipynb": "Notebook",
    }

    def __init__(self, store: PaperStore) -> None:
        self.store = store
        self._lock = threading.RLock()
        PROJECT_REPO_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _cache_key(full_name: str) -> str:
        return hashlib.sha256(full_name.encode("utf-8")).hexdigest()[:24]

    def _repo_path(self, full_name: str) -> Path:
        return PROJECT_REPO_DIR / self._cache_key(full_name)

    @classmethod
    def _wanted_file(cls, relative: Path) -> bool:
        lower_parts = {part.lower() for part in relative.parts}
        if lower_parts.intersection(cls.IGNORED_PARTS):
            return False
        return relative.suffix.lower() in cls.TEXT_EXTENSIONS or relative.name.lower() in cls.TEXT_FILENAMES

    def _download(self, project: dict[str, Any], target: Path) -> tuple[int, int, str]:
        full_name = project["full_name"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name):
            raise ValueError("GitHub 仓库名称不合法")
        maximum_zip = max(20, int(os.environ.get("PAPERFIELD_PROJECT_ZIP_MAX_MB", "120"))) * 1024 * 1024
        branch = compact_text(project.get("default_branch"))
        archive_url = (
            f"https://codeload.github.com/{full_name}/zip/refs/heads/{urllib.parse.quote(branch, safe='')}"
            if branch else f"https://github.com/{full_name}/archive/HEAD.zip"
        )
        request = urllib.request.Request(
            archive_url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/zip"},
        )
        archive = PROJECT_REPO_DIR / f"{self._cache_key(full_name)}.zip.part"
        try:
            with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as handle:
                content_length = int(response.headers.get("Content-Length", "0") or 0)
                if content_length > maximum_zip:
                    raise ValueError("仓库压缩包超过缓存大小限制")
                total = 0
                while True:
                    chunk = response.read(1024 * 512)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > maximum_zip:
                        raise ValueError("仓库压缩包超过缓存大小限制")
                    handle.write(chunk)
            if target.exists():
                resolved_target = target.resolve()
                if not resolved_target.is_relative_to(PROJECT_REPO_DIR.resolve()):
                    raise ValueError("仓库缓存目录不安全")
                shutil.rmtree(target)
            target.mkdir(parents=True, exist_ok=True)
            file_count = 0
            source_chars = 0
            extracted_bytes = 0
            extracted_limit = max(50, int(os.environ.get("PAPERFIELD_PROJECT_TEXT_MAX_MB", "200"))) * 1024 * 1024
            with zipfile.ZipFile(archive) as bundle:
                for index, info in enumerate(bundle.infolist()):
                    if index >= 20000:
                        break
                    if info.is_dir() or info.file_size > 1024 * 1024:
                        continue
                    if ((info.external_attr >> 16) & 0o170000) == 0o120000:
                        continue
                    parts = [part for part in info.filename.replace("\\", "/").split("/") if part]
                    if len(parts) < 2:
                        continue
                    relative = Path(*parts[1:])
                    if relative.is_absolute() or ".." in relative.parts or not self._wanted_file(relative):
                        continue
                    extracted_bytes += info.file_size
                    if extracted_bytes > extracted_limit or file_count >= 5000:
                        break
                    content = bundle.read(info)
                    if b"\x00" in content[:4096]:
                        continue
                    destination = (target / relative).resolve()
                    if not destination.is_relative_to(target.resolve()):
                        continue
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(content)
                    file_count += 1
                    source_chars += len(content.decode("utf-8", errors="replace"))
            readmes = sorted(
                (path for path in target.rglob("*") if path.is_file() and path.name.lower().startswith("readme")),
                key=lambda path: (len(path.relative_to(target).parts), path.name.lower()),
            )
            readme_path = str(readmes[0]) if readmes else ""
            return file_count, source_chars, readme_path
        finally:
            archive.unlink(missing_ok=True)

    def prepare(self, project: dict[str, Any], force: bool = False) -> dict[str, Any]:
        with self._lock:
            asset = self.store.get_project_asset(project["full_name"]) or {}
            repo_path = Path(asset.get("local_repo_path", "")) if asset.get("local_repo_path") else None
            if not force and repo_path and repo_path.exists() and asset.get("checked_at"):
                try:
                    if (utc_now() - datetime.fromisoformat(asset["checked_at"])).days < 7:
                        return self.workspace(project, asset)
                except ValueError:
                    pass
            target = self._repo_path(project["full_name"])
            try:
                file_count, source_chars, readme_path = self._download(project, target)
                asset = self.store.save_project_asset(
                    project["full_name"],
                    {
                        "local_repo_path": str(target),
                        "readme_path": readme_path,
                        "file_count": file_count,
                        "source_chars": source_chars,
                        "error_text": "" if file_count else "仓库中没有可安全显示的文本源码",
                    },
                )
            except Exception as error:
                asset = self.store.save_project_asset(project["full_name"], {"error_text": str(error)})
            return self.workspace(project, asset)

    def _root(self, full_name: str, asset: dict[str, Any] | None = None) -> Path | None:
        value = asset or self.store.get_project_asset(full_name) or {}
        root = Path(value.get("local_repo_path", "")) if value.get("local_repo_path") else None
        return root if root and root.exists() and root.resolve().is_relative_to(PROJECT_REPO_DIR.resolve()) else None

    def files(self, full_name: str, asset: dict[str, Any] | None = None) -> list[str]:
        root = self._root(full_name, asset)
        if not root:
            return []
        return sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())

    @staticmethod
    def _file_group(path: str) -> tuple[str, str]:
        lower = path.lower()
        name = Path(path).name.lower()
        parts = set(Path(lower).parts)
        if name.startswith("readme") or name in {"license", "license.md", "changelog.md", "contributing.md"}:
            return "start", "开始阅读"
        if parts.intersection({"docs", "doc", "examples", "example", "tutorials", "notebooks"}) or lower.endswith((".md", ".rst")):
            return "docs", "文档与示例"
        if parts.intersection({"test", "tests", "testing", "benchmarks", "benchmark"}) or name.startswith("test_"):
            return "tests", "测试与评测"
        if any(marker in lower for marker in ("train", "training", "infer", "inference", "eval", "demo", "serve")):
            return "runtime", "训练与推理"
        if name in {
            "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "package.json", "package-lock.json",
            "yarn.lock", "pnpm-lock.yaml", "environment.yml", "dockerfile", "compose.yaml", "docker-compose.yml",
            "cargo.toml", "go.mod", "makefile", ".gitignore", ".env.example",
        } or parts.intersection({"config", "configs", ".github"}) or lower.endswith((".yaml", ".yml", ".toml", ".ini")):
            return "config", "配置与依赖"
        if lower.endswith((".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java", ".cpp", ".cc", ".c", ".h", ".hpp")):
            return "source", "核心源码"
        return "other", "其他文件"

    def file_groups(self, files: list[str]) -> list[dict[str, Any]]:
        order = ["start", "source", "runtime", "config", "docs", "tests", "other"]
        grouped: dict[str, dict[str, Any]] = {}
        for path in files:
            key, label = self._file_group(path)
            grouped.setdefault(key, {"key": key, "label": label, "files": []})["files"].append(path)
        return [grouped[key] for key in order if key in grouped]

    @classmethod
    def _language(cls, path: str) -> str:
        name = Path(path).name.lower()
        if name == "dockerfile":
            return "Dockerfile"
        if name == "makefile":
            return "Makefile"
        return cls.LANGUAGE_LABELS.get(Path(path).suffix.lower(), "Text")

    def file_entries(self, files: list[str]) -> list[dict[str, Any]]:
        entries = []
        for path in files:
            key, label = self._file_group(path)
            pure = Path(path)
            directory = pure.parent.as_posix()
            entries.append(
                {
                    "path": path,
                    "name": pure.name,
                    "directory": "" if directory == "." else directory,
                    "group_key": key,
                    "group_label": label,
                    "language": self._language(path),
                    "important_document": self.is_important_document(path),
                }
            )
        return entries

    @classmethod
    def _reading_route(cls, path: str) -> tuple[str, str, int] | None:
        lower = path.lower()
        name = Path(path).name.lower()
        depth = len(Path(path).parts)
        group_key, _ = cls._file_group(path)
        root_manifest = name in {
            "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "package.json",
            "environment.yml", "dockerfile", "compose.yaml", "docker-compose.yml", "makefile",
        }
        if depth == 1 and name.startswith("readme"):
            return "start", "项目总览与官方阅读入口", 100
        if depth <= 2 and root_manifest:
            return "start", "安装、依赖或启动方式", 94 - depth
        if re.search(r"(^|/)(main|app|server|cli|run)\.(py|js|ts|tsx|go|rs|java)$", lower):
            return "start", "程序入口，先理解输入与启动流程", 92 - depth
        if any(marker in lower for marker in ("infer", "inference", "demo", "serve", "predict")):
            return "flow", "推理、演示或服务入口", 88 - min(depth, 6)
        if any(marker in lower for marker in ("train", "training", "finetune", "eval", "benchmark")):
            return "flow", "训练或评测链路", 86 - min(depth, 6)
        if group_key == "source" and any(marker in lower for marker in ("model", "agent", "policy", "network", "core", "module")):
            return "core", "核心模型或任务逻辑", 82 - min(depth, 8)
        if group_key == "source":
            return "core", "主要源码实现", 70 - min(depth, 8)
        if group_key == "config":
            return "setup", "实验配置与依赖声明", 74 - min(depth, 8)
        if group_key == "docs" or name.startswith("readme"):
            return "docs", "补充文档或使用示例", 66 - min(depth, 8)
        return None

    def reading_sections(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        definitions = [
            ("start", "从这里开始", 7),
            ("flow", "运行链路", 7),
            ("core", "核心实现", 10),
            ("setup", "配置与依赖", 6),
            ("docs", "补充文档", 6),
        ]
        candidates: dict[str, list[dict[str, Any]]] = {key: [] for key, _, _ in definitions}
        for entry in entries:
            route = self._reading_route(entry["path"])
            if not route:
                continue
            section, reason, score = route
            candidates[section].append({**entry, "reason": reason, "priority": score})
        sections = []
        for key, label, maximum in definitions:
            items = sorted(
                candidates[key],
                key=lambda item: (-item["priority"], len(Path(item["path"]).parts), item["path"].lower()),
            )[:maximum]
            if items:
                sections.append({"key": key, "label": label, "items": items})
        return sections

    def important_documents(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        documents = []
        for entry in entries:
            if Path(entry["path"]).suffix.lower() != ".md":
                continue
            route = self._reading_route(entry["path"])
            reason = route[1] if route else "Markdown 文档，支持中英日按需阅读"
            priority = route[2] if route else 60 - min(len(Path(entry["path"]).parts), 8)
            documents.append({**entry, "reason": reason, "priority": priority})
        return sorted(
            documents,
            key=lambda item: (-item["priority"], len(Path(item["path"]).parts), item["path"].lower()),
        )[:12]

    def is_important_document(self, path: str) -> bool:
        return Path(path).suffix.lower() == ".md"

    @staticmethod
    def _unwrap_markdown_divs(value: str) -> str:
        output: list[str] = []
        buffered: list[str] = []
        depth = 0
        for line in value.splitlines():
            if re.fullmatch(r"\s*<div\b[^>]*>\s*", line, flags=re.IGNORECASE):
                depth += 1
                continue
            if depth and re.fullmatch(r"\s*</div>\s*", line, flags=re.IGNORECASE):
                depth -= 1
                if depth == 0:
                    output.extend(textwrap.dedent("\n".join(buffered)).splitlines())
                    buffered = []
                continue
            if depth:
                buffered.append(line.lstrip())
            else:
                output.append(line)
        if buffered:
            output.extend(buffered)
        return "\n".join(output)

    @staticmethod
    def _readme_html(markdown_text: str, full_name: str, branch: str, readme_relative: str) -> str:
        if not markdown_text:
            return ""
        try:
            import bleach
            import markdown
        except ImportError:
            return f"<pre>{html.escape(markdown_text)}</pre>"
        markdown_text = re.sub(
            r"<(script|style)\b[^>]*>.*?</\1\s*>", "", markdown_text, flags=re.IGNORECASE | re.DOTALL,
        )
        markdown_text = ProjectAssetService._unwrap_markdown_divs(markdown_text)
        rendered = markdown.markdown(markdown_text, extensions=["fenced_code", "tables", "sane_lists"])
        allowed_tags = {
            "a", "blockquote", "br", "code", "del", "details", "em", "h1", "h2", "h3", "h4", "h5", "h6",
            "hr", "img", "li", "ol", "p", "pre", "strong", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul",
        }
        cleaned = bleach.clean(
            rendered,
            tags=allowed_tags,
            attributes={"a": ["href", "title"], "img": ["src", "alt", "title"], "code": ["class"]},
            protocols={"http", "https", "mailto"},
            strip=True,
        )
        return ReadmeLinkRewriter(full_name, branch or "HEAD", readme_relative).rewrite(cleaned)

    def file(self, full_name: str, relative_path: str, limit: int = 500000) -> dict[str, Any] | None:
        root = self._root(full_name)
        if not root:
            return None
        normalized = urllib.parse.unquote(relative_path).replace("\\", "/").lstrip("/")
        target = (root / normalized).resolve()
        if not target.is_relative_to(root.resolve()) or not target.is_file():
            return None
        content = target.read_text(encoding="utf-8", errors="replace")[:limit]
        path = target.relative_to(root).as_posix()
        payload = {
            "path": path,
            "content": content,
            "truncated": target.stat().st_size > limit,
            "language": self._language(path),
            "line_count": content.count("\n") + (1 if content else 0),
            "size_bytes": target.stat().st_size,
        }
        if target.suffix.lower() == ".md":
            project = self.store.get_project(full_name) or {}
            payload["rendered_html"] = self._readme_html(
                content, full_name, project.get("default_branch", ""), path,
            )
            payload["important_document"] = self.is_important_document(path)
        return payload

    def workspace(self, project: dict[str, Any], asset: dict[str, Any] | None = None) -> dict[str, Any]:
        value = asset or self.store.get_project_asset(project["full_name"]) or {}
        files = self.files(project["full_name"], value)
        readme = ""
        readme_path = Path(value.get("readme_path", "")) if value.get("readme_path") else None
        if readme_path and readme_path.exists():
            readme = readme_path.read_text(encoding="utf-8", errors="replace")[:300000]
        readme_relative = ""
        root = self._root(project["full_name"], value)
        if root and readme_path and readme_path.exists():
            readme_relative = readme_path.relative_to(root).as_posix()
        entries = self.file_entries(files)
        return {
            "project": project,
            "ready": bool(files),
            "files": files,
            "file_groups": self.file_groups(files),
            "file_entries": entries,
            "reading_sections": self.reading_sections(entries),
            "important_documents": self.important_documents(entries),
            "readme": readme,
            "readme_html": self._readme_html(
                readme, project["full_name"], project.get("default_branch", ""), readme_relative,
            ),
            "readme_path": readme_relative or (readme_path.name if readme_path else ""),
            "file_count": len(files),
            "source_chars": int(value.get("source_chars", 0) or 0),
            "checked_at": value.get("checked_at", ""),
            "error": value.get("error_text", ""),
            "explanation": value.get("explanation"),
        }

    @staticmethod
    def _numbered(content: str) -> str:
        return "\n".join(f"{index:04d}: {line}" for index, line in enumerate(content.splitlines(), start=1))

    def source_context(self, full_name: str, selected_path: str = "", limit: int = 70000) -> str:
        files = self.files(full_name)
        priorities = ("readme", "pyproject", "requirements", "package.json", "main.", "app.", "server.", "model", "train", "config")
        ordered = sorted(files, key=lambda path: (not any(marker in path.lower() for marker in priorities), len(Path(path).parts), path))
        if selected_path and selected_path in ordered:
            ordered.remove(selected_path)
            ordered.insert(0, selected_path)
        chunks = []
        used = 0
        for path in ordered[:40]:
            item = self.file(full_name, path, limit=18000)
            if not item:
                continue
            chunk = f"--- file: {path} ---\n{self._numbered(item['content'])}"
            if chunks and used + len(chunk) > limit:
                break
            chunks.append(chunk)
            used += len(chunk)
        return "\n\n".join(chunks)


class ProjectExplainer:
    def __init__(self, store: PaperStore, assets: ProjectAssetService, ai: PaperExplainer) -> None:
        self.store = store
        self.assets = assets
        self.ai = ai

    @staticmethod
    def _parse_json(output: str) -> dict[str, Any]:
        match = re.search(r"\{.*\}", output, flags=re.S)
        if not match:
            raise ValueError("模型没有返回可解析的 JSON")
        return json.loads(match.group(0))

    @staticmethod
    def _fallback(project: dict[str, Any], workspace: dict[str, Any], notice: str = "") -> dict[str, Any]:
        result = {
            "mode": "metadata",
            "overview": project.get("description") or "仓库没有提供简介。",
            "architecture": "当前未完成 AI 代码分析，无法可靠还原模块架构。",
            "entry_points": ["从 README 和根目录配置文件开始阅读。"],
            "code_flow": "打开左侧源码后，可按入口文件、核心模块、训练或推理脚本顺序阅读。",
            "setup": "请以 README 中的安装说明为准。",
            "strengths": [f"仓库包含 {workspace['file_count']} 个可阅读文本文件。"],
            "risks": ["尚未对代码执行安全审计，也不会在本地自动运行仓库代码。"],
            "learning_path": ["README", "依赖与配置", "入口文件", "核心模型", "训练或推理流程"],
            "generated_at": utc_now().isoformat(),
        }
        if notice:
            result["notice"] = notice
        return result

    def explain(self, project: dict[str, Any]) -> dict[str, Any]:
        workspace = self.assets.prepare(project)
        if not workspace.get("ready"):
            result = self._fallback(project, workspace, f"源码尚不可用：{workspace.get('error') or '未找到文本源码'}")
            self.store.save_project_explanation(project["full_name"], result)
            return result
        connection = self.ai.connection()
        if not connection:
            result = self._fallback(project, workspace, "当前未配置大模型，已返回仓库元数据导读。")
            self.store.save_project_explanation(project["full_name"], result)
            return result
        context = self.assets.source_context(project["full_name"])
        prompt = f"""你是一名严谨的中文代码导师。请只依据仓库元数据和源码摘录讲解项目，不得声称运行过代码。
返回严格 JSON，不要 Markdown，字段为 overview, architecture, entry_points, code_flow, setup, strengths, risks, learning_path。
entry_points、strengths、risks、learning_path 使用字符串数组；其他字段使用中文字符串。
architecture 说明模块职责；code_flow 按输入、预处理、核心逻辑、输出说明；涉及代码结论时引用文件路径。

项目：{project['full_name']}
简介：{project.get('description', '')}
语言：{project.get('language', '')}
主题：{', '.join(project.get('topics', []))}
关联论文：{', '.join(paper['title'] for paper in project.get('papers', [])) or '无'}

源码摘录：
{context}
"""
        try:
            result = self._parse_json(self.ai._request_text(prompt, connection, timeout=180))
        except Exception as error:
            result = self._fallback(project, workspace, f"AI 服务暂时不可用：{error}")
            self.store.save_project_explanation(project["full_name"], result)
            return result
        result.update(
            {
                "mode": "ai",
                "provider": connection["provider"],
                "model": connection["model"],
                "generated_at": utc_now().isoformat(),
            }
        )
        self.store.save_project_explanation(project["full_name"], result)
        return result

    def ask(self, project: dict[str, Any], question: str, selected_path: str = "") -> dict[str, Any]:
        connection = self.ai.connection()
        if not connection:
            raise RuntimeError("当前没有可用的大模型配置")
        context = self.assets.source_context(project["full_name"], selected_path, limit=60000)
        if not context:
            raise RuntimeError("项目源码尚未缓存，无法进行基于代码的问答")
        history = self.store.project_chat_history(project["full_name"])
        history_text = "\n".join(
            f"{('用户' if item['role'] == 'user' else '代码导师')}：{item['content']}" for item in history[-8:]
        )
        prompt = f"""你是中文代码阅读导师。只依据提供的仓库源码回答问题，不得声称运行过代码。
先给直接结论，再解释调用链、关键实现和风险。代码判断引用 [文件路径:L起-L止]；材料不足时明确说明。

项目：{project['full_name']}
当前文件：{selected_path or '未选择'}
最近对话：
{history_text or '无'}

用户问题：{question}

源码材料：
{context}
"""
        answer = self.ai._request_text(prompt, connection, timeout=180).strip()
        self.store.add_project_chat_message(project["full_name"], "user", question)
        self.store.add_project_chat_message(project["full_name"], "assistant", answer)
        return {
            "answer": answer,
            "provider": connection["provider"],
            "model": connection["model"],
            "generated_at": utc_now().isoformat(),
        }


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


class ReadmeLinkRewriter(HTMLParser):
    def __init__(self, full_name: str, branch: str, readme_path: str) -> None:
        super().__init__(convert_charrefs=False)
        self.full_name = full_name
        self.branch = branch
        self.base_dir = posixpath.dirname(readme_path)
        self.parts: list[str] = []

    def _url(self, value: str, image: bool) -> str:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme or value.startswith(("#", "//")):
            return value
        normalized = posixpath.normpath(posixpath.join(self.base_dir, parsed.path)).lstrip("/")
        if normalized.startswith("../"):
            return "#"
        root = "https://raw.githubusercontent.com" if image else "https://github.com"
        segment = "" if image else "/blob"
        rebuilt = f"{root}/{self.full_name}{segment}/{self.branch}/{urllib.parse.quote(normalized, safe='/')}"
        if parsed.query:
            rebuilt += f"?{parsed.query}"
        if parsed.fragment:
            rebuilt += f"#{parsed.fragment}"
        return rebuilt

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = []
        for name, value in attrs:
            current = value or ""
            if tag == "a" and name == "href":
                current = self._url(current, False)
            elif tag == "img" and name == "src":
                current = self._url(current, True)
            values.append(f' {name}="{html.escape(current, quote=True)}"')
        self.parts.append(f"<{tag}{''.join(values)}>")

    def handle_endtag(self, tag: str) -> None:
        self.parts.append(f"</{tag}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_entityref(self, name: str) -> None:
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.parts.append(f"&#{name};")

    def rewrite(self, value: str) -> str:
        self.feed(value)
        return "".join(self.parts)


class TranslatableHtml(HTMLParser):
    SKIP_TAGS = {"code", "pre", "kbd", "samp", "script", "style"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.tokens: list[dict[str, Any]] = []
        self.skip_depth = 0

    @staticmethod
    def _tag(tag: str, attrs: list[tuple[str, str | None]], closing: str = ">") -> str:
        values = "".join(
            f' {name}="{html.escape(value or "", quote=True)}"' for name, value in attrs
        )
        return f"<{tag}{values}{closing}"

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tokens.append({"kind": "html", "value": self._tag(tag, attrs)})
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tokens.append({"kind": "html", "value": self._tag(tag, attrs, " />")})

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
        self.tokens.append({"kind": "html", "value": f"</{tag}>"})

    def handle_data(self, data: str) -> None:
        should_translate = not self.skip_depth and bool(re.search(r"[A-Za-z]{2,}", data))
        self.tokens.append({"kind": "text", "value": data, "translate": should_translate})

    def handle_entityref(self, name: str) -> None:
        self.tokens.append({"kind": "html", "value": f"&{name};"})

    def handle_charref(self, name: str) -> None:
        self.tokens.append({"kind": "html", "value": f"&#{name};"})

    def translated_html(self, translator: "TranslationService", target: str) -> tuple[str, str]:
        indexes = [index for index, token in enumerate(self.tokens) if token.get("translate")]
        provider = ""
        batches: list[list[int]] = []
        current: list[int] = []
        current_chars = 0
        for index in indexes:
            size = len(self.tokens[index]["value"])
            if current and (len(current) >= 24 or current_chars + size > 10000):
                batches.append(current)
                current = []
                current_chars = 0
            current.append(index)
            current_chars += size
        if current:
            batches.append(current)
        for batch in batches:
            markers = [f"[[[PF_SEGMENT_{index:06d}]]]" for index in batch]
            source = "\n".join(
                f"{marker}\n{self.tokens[index]['value'].strip()}" for marker, index in zip(markers, batch)
            )
            result = translator.translate(source, "en", target)
            provider = result.get("provider", provider)
            translated = result.get("text", "")
            matches = list(re.finditer(r"\[\[\[PF_SEGMENT_(\d{6})\]\]\]\s*", translated))
            if len(matches) != len(batch):
                raise RuntimeError("翻译服务未保留文档分段标记")
            for position, match in enumerate(matches):
                token_index = int(match.group(1))
                end = matches[position + 1].start() if position + 1 < len(matches) else len(translated)
                original = self.tokens[token_index]["value"]
                prefix = re.match(r"^\s*", original).group(0)
                suffix = re.search(r"\s*$", original).group(0)
                self.tokens[token_index]["value"] = f"{prefix}{translated[match.end():end].strip()}{suffix}"
        rendered = "".join(
            token["value"] if token["kind"] == "html" else html.escape(token["value"])
            for token in self.tokens
        )
        return rendered, provider


class RuntimeSettings:
    MODES = {"local", "cloud", "hybrid"}

    def __init__(self, path: Path | None = None) -> None:
        self.path = path
        self._lock = threading.RLock()
        self._values = self._defaults()
        if path and path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                self._values.update({key: loaded[key] for key in self._values if key in loaded})
            except (OSError, ValueError, TypeError):
                pass
        self._values = self._validated(self._values, cloud_configured=True)

    @staticmethod
    def _defaults() -> dict[str, Any]:
        return {
            "pdf_storage_mode": os.environ.get("PAPERFIELD_PDF_STORAGE_MODE", "local"),
            "local_pdf_dir": str(PDF_DIR),
            "local_cache_max_mb": int(os.environ.get("PAPERFIELD_LOCAL_CACHE_MAX_MB", "2048")),
            "shared_storage_max_mb": int(os.environ.get("PAPERFIELD_SHARED_STORAGE_MAX_MB", "2048")),
            "r2_billing_cycle_day": int(os.environ.get("PAPERFIELD_R2_BILLING_CYCLE_DAY", "1")),
        }

    @classmethod
    def _validated(cls, payload: dict[str, Any], cloud_configured: bool) -> dict[str, Any]:
        mode = str(payload.get("pdf_storage_mode", "local")).strip().lower()
        if mode not in cls.MODES:
            raise ValueError("默认存储方式必须是本地、云端或本地 + 云端")
        if mode in {"cloud", "hybrid"} and not cloud_configured:
            raise ValueError("云端存储尚未配置，不能设为默认目标")
        raw_path = str(payload.get("local_pdf_dir", "")).strip()
        if not raw_path:
            raise ValueError("请填写本地 PDF 文件夹")
        local_path = Path(raw_path).expanduser().resolve()
        local_path.mkdir(parents=True, exist_ok=True)
        cache_mb = int(payload.get("local_cache_max_mb", 2048))
        if cache_mb < 128 or cache_mb > 1024 * 1024:
            raise ValueError("本地缓存限制需在 128 MB 到 1 TB 之间")
        shared_storage_mb = int(payload.get("shared_storage_max_mb", 2048))
        if shared_storage_mb < 128 or shared_storage_mb > 1024 * 1024:
            raise ValueError("共享云端容量上限需在 128 MB 到 1 TB 之间")
        billing_day = int(payload.get("r2_billing_cycle_day", 1))
        if billing_day < 1 or billing_day > 28:
            raise ValueError("R2 账期起始日需在 1 到 28 之间")
        return {
            "pdf_storage_mode": mode, "local_pdf_dir": str(local_path),
            "local_cache_max_mb": cache_mb, "shared_storage_max_mb": shared_storage_mb,
            "r2_billing_cycle_day": billing_day,
        }

    def get(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._values)

    def update(self, payload: dict[str, Any], cloud_configured: bool) -> dict[str, Any]:
        with self._lock:
            merged = {**self._values, **payload}
            self._values = self._validated(merged, cloud_configured)
            if self.path:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                temporary = self.path.with_suffix(".json.tmp")
                temporary.write_text(json.dumps(self._values, ensure_ascii=False, indent=2), encoding="utf-8")
                temporary.replace(self.path)
            return dict(self._values)

    @property
    def pdf_dir(self) -> Path:
        path = Path(self.get()["local_pdf_dir"])
        path.mkdir(parents=True, exist_ok=True)
        return path


class S3ObjectStorage:
    def __init__(self, store: PaperStore) -> None:
        self.store = store
        disabled = os.environ.get("PAPERFIELD_DISABLE_CLOUD", "").strip() == "1"
        self.bucket = "" if disabled else os.environ.get("PAPERFIELD_S3_BUCKET", "").strip()
        self.endpoint = None if disabled else os.environ.get("PAPERFIELD_S3_ENDPOINT", "").strip() or None
        self.region = "auto" if disabled else os.environ.get("PAPERFIELD_S3_REGION", "auto").strip() or "auto"
        self.access_key = "" if disabled else os.environ.get("PAPERFIELD_S3_ACCESS_KEY_ID", "").strip()
        self.secret_key = "" if disabled else os.environ.get("PAPERFIELD_S3_SECRET_ACCESS_KEY", "").strip()
        self.provider = "" if disabled else os.environ.get("PAPERFIELD_S3_PROVIDER", "S3 兼容对象存储").strip()
        raw_prefix = "" if disabled else os.environ.get("PAPERFIELD_CLOUD_PREFIX", "").strip().strip("/")
        if raw_prefix and not re.fullmatch(r"[A-Za-z0-9._/-]{1,120}", raw_prefix):
            raise ValueError("云端命名空间只能包含字母、数字、点、下划线、连字符和斜杠")
        self.prefix = f"{raw_prefix}/" if raw_prefix else ""
        self.shared_storage_limit_bytes = (
            max(128, int(os.environ.get("PAPERFIELD_SHARED_STORAGE_MAX_MB", "2048"))) * 1024 * 1024
            if self.prefix else 0
        )
        self._client_value: Any = None

    @property
    def configured(self) -> bool:
        return bool(self.bucket and (self.access_key and self.secret_key or not self.endpoint))

    @property
    def shared_library(self) -> bool:
        return bool(self.prefix)

    def set_shared_storage_limit(self, value_mb: int) -> None:
        self.shared_storage_limit_bytes = max(128, int(value_mb)) * 1024 * 1024 if self.prefix else 0

    def remote_key(self, key: str) -> str:
        relative = str(key).replace("\\", "/").lstrip("/")
        if not relative or ".." in Path(relative).parts:
            raise ValueError("云端对象路径无效")
        return f"{self.prefix}{relative}"

    def ensure_upload_capacity(self, key: str, size: int) -> None:
        if not self.shared_storage_limit_bytes:
            return
        summary = self.store.cloud_object_summary()
        projected = summary["total_bytes"] - self.store.cloud_object_size(key) + max(0, size)
        if projected > self.shared_storage_limit_bytes:
            limit_mb = self.shared_storage_limit_bytes // (1024 * 1024)
            raise RuntimeError(f"共享云端资料库已达到 {limit_mb} MB 上限")

    def client(self) -> Any:
        if not self.configured:
            raise RuntimeError("尚未配置云端对象存储")
        if self._client_value is None:
            try:
                import boto3
                from botocore.config import Config
            except ImportError as error:
                raise RuntimeError("云端存储依赖未安装，请重新安装 requirements.txt") from error
            options: dict[str, Any] = {
                "region_name": self.region,
                "config": Config(connect_timeout=5, read_timeout=20, retries={"max_attempts": 2, "mode": "standard"}),
            }
            if self.endpoint:
                options["endpoint_url"] = self.endpoint
            if self.access_key and self.secret_key:
                options["aws_access_key_id"] = self.access_key
                options["aws_secret_access_key"] = self.secret_key
            self._client_value = boto3.client("s3", **options)
        return self._client_value

    def upload(self, path: Path, key: str, content_type: str) -> None:
        size = path.stat().st_size
        self.ensure_upload_capacity(key, size)
        with path.open("rb") as handle:
            self.client().put_object(Bucket=self.bucket, Key=self.remote_key(key), Body=handle, ContentType=content_type)
        self.store.record_cloud_operation("class_a", size)
        self.store.save_cloud_object(key, size)

    def upload_bytes(self, content: bytes, key: str, content_type: str = "application/json") -> None:
        self.ensure_upload_capacity(key, len(content))
        self.client().put_object(Bucket=self.bucket, Key=self.remote_key(key), Body=content, ContentType=content_type)
        self.store.record_cloud_operation("class_a", len(content))
        self.store.save_cloud_object(key, len(content))

    def download_bytes(self, key: str) -> bytes:
        response = self.client().get_object(Bucket=self.bucket, Key=self.remote_key(key))
        content = response["Body"].read()
        self.store.record_cloud_operation("class_b", len(content))
        return content

    def download(self, key: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".cloudpart")
        try:
            response = self.client().get_object(Bucket=self.bucket, Key=self.remote_key(key))
            total = 0
            with temporary.open("wb") as handle:
                while True:
                    chunk = response["Body"].read(1024 * 256)
                    if not chunk:
                        break
                    total += len(chunk)
                    handle.write(chunk)
            temporary.replace(target)
            self.store.record_cloud_operation("class_b", total)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

    def refresh_inventory(self) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("尚未配置云端对象存储")
        objects: list[tuple[str, int]] = []
        token = ""
        while True:
            options: dict[str, Any] = {"Bucket": self.bucket, "MaxKeys": 1000}
            if self.prefix:
                options["Prefix"] = self.prefix
            if token:
                options["ContinuationToken"] = token
            response = self.client().list_objects_v2(**options)
            self.store.record_cloud_operation("class_a")
            objects.extend(
                (
                    str(item.get("Key", ""))[len(self.prefix):] if self.prefix else str(item.get("Key", "")),
                    int(item.get("Size", 0) or 0),
                )
                for item in response.get("Contents", [])
            )
            if not response.get("IsTruncated"):
                break
            token = str(response.get("NextContinuationToken", ""))
            if not token:
                break
        return self.store.save_cloud_inventory(objects)

    @staticmethod
    def _usage_ratio(value: float, free: float) -> float:
        return round(value / free * 100, 3) if free else 0.0

    def status(self, settings: RuntimeSettings, refresh: bool = False) -> dict[str, Any]:
        inventory = self.store.cloud_inventory()
        inventory_error = inventory.get("error_text", "")
        if self.configured:
            stale = True
            if inventory.get("last_scan"):
                try:
                    stale = utc_now() - datetime.fromisoformat(inventory["last_scan"]) >= timedelta(hours=24)
                except ValueError:
                    pass
            if refresh or stale:
                try:
                    inventory = self.refresh_inventory()
                    inventory_error = ""
                except Exception as error:
                    inventory_error = str(error)
        values = settings.get()
        scoped_summary = self.store.cloud_object_summary()
        billing_day = int(values.get("r2_billing_cycle_day", 1))
        now = utc_now()
        if now.day >= billing_day:
            period_start = datetime(now.year, now.month, billing_day, tzinfo=timezone.utc)
        else:
            previous_month = now.month - 1 or 12
            previous_year = now.year - 1 if now.month == 1 else now.year
            period_start = datetime(previous_year, previous_month, billing_day, tzinfo=timezone.utc)
        next_month = period_start.month + 1 if period_start.month < 12 else 1
        next_year = period_start.year + 1 if period_start.month == 12 else period_start.year
        period_end = datetime(next_year, next_month, billing_day, tzinfo=timezone.utc)
        usage = self.store.cloud_usage_range(period_start.date().isoformat(), period_end.date().isoformat())
        storage_gb = int(inventory.get("total_bytes", 0) or 0) / 1_000_000_000
        class_a = int(usage.get("class_a", 0) or 0)
        class_b = int(usage.get("class_b", 0) or 0)
        storage_cost = max(0.0, storage_gb - 10) * 0.015
        class_a_cost = max(0, class_a - 1_000_000) / 1_000_000 * 4.5
        class_b_cost = max(0, class_b - 10_000_000) / 1_000_000 * 0.36
        return {
            "configured": self.configured,
            "missing_configuration": [
                label
                for label, present in (
                    ("S3 endpoint", bool(self.endpoint)),
                    ("bucket", bool(self.bucket)),
                    ("Access Key ID", bool(self.access_key)),
                    ("Secret Access Key", bool(self.secret_key)),
                )
                if not present
            ],
            "provider": self.provider if self.configured else "",
            "bucket": self.bucket if self.configured else "",
            "namespace": self.prefix.rstrip("/"),
            "shared_library": self.shared_library,
            "settings": values,
            "usage": {
                **usage,
                "object_count": int(inventory.get("object_count", 0) or 0),
                "storage_bytes": int(inventory.get("total_bytes", 0) or 0),
                "last_inventory_scan": inventory.get("last_scan", ""),
                "inventory_error": inventory_error,
                "class_a_free": 1_000_000,
                "class_b_free": 10_000_000,
                "storage_free_gb": 10,
                "class_a_percent": self._usage_ratio(class_a, 1_000_000),
                "class_b_percent": self._usage_ratio(class_b, 10_000_000),
                "storage_percent": self._usage_ratio(storage_gb, 10),
                "estimated_overage_usd": round(storage_cost + class_a_cost + class_b_cost, 6),
                "shared_storage_bytes": scoped_summary["total_bytes"],
                "shared_storage_limit_bytes": self.shared_storage_limit_bytes,
                "shared_storage_percent": self._usage_ratio(
                    scoped_summary["total_bytes"], self.shared_storage_limit_bytes,
                ),
                "estimate_notice": (
                    "共享容量仅统计当前命名空间；操作数仅统计本实例发起的请求。"
                    if self.shared_library else
                    "操作数仅统计 Paperfield 发起的请求；容量来自每日桶清点，费用按当前容量估算。"
                ),
            },
        }


class ReadingArchiveService:
    def __init__(self, store: PaperStore, cloud: S3ObjectStorage) -> None:
        self.store = store
        self.cloud = cloud
        self._locks: dict[str, threading.Lock] = {}
        self._pending: dict[str, int] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _key(kind: str, identifier: str) -> str:
        digest = hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:24]
        return f"{kind}/{digest}/reading-state.json"

    def _item_lock(self, key: str) -> threading.Lock:
        with self._lock:
            return self._locks.setdefault(key, threading.Lock())

    def backup_paper(self, paper_id: str) -> bool:
        if not self.cloud.configured:
            return False
        key = self._key("papers", paper_id)
        with self._item_lock(key):
            paper = self.store.get_paper(paper_id)
            if not paper:
                return False
            payload = {
                "schema_version": 1,
                "kind": "paper-reading",
                "paper_id": paper_id,
                "updated_at": utc_now().isoformat(),
                "state": {
                    "status": paper.get("status", "unread"),
                    "favorite": bool(paper.get("favorite")),
                    "notes": paper.get("notes", ""),
                    "explanation": paper.get("explanation"),
                },
                "chat": self.store.chat_history(paper_id, 0),
            }
            content = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.cloud.upload_bytes(content, key)
            return True

    def paper_backup_available(self, paper_id: str) -> bool:
        return self.cloud.configured and self.store.has_cloud_object(self._key("papers", paper_id))

    def paper_backup_pending(self, paper_id: str) -> bool:
        with self._lock:
            return self._pending.get(self._key("papers", paper_id), 0) > 0

    def restore_paper_if_needed(self, paper_id: str) -> bool:
        if not self.cloud.configured or self.store.has_local_paper_reading(paper_id):
            return False
        key = self._key("papers", paper_id)
        if not self.store.has_cloud_object(key):
            return False
        payload = json.loads(self.cloud.download_bytes(key).decode("utf-8"))
        if payload.get("paper_id") != paper_id:
            raise ValueError("云端论文阅读档案标识不匹配")
        self.store.restore_paper_reading(paper_id, payload)
        return True

    def backup_project(self, full_name: str) -> bool:
        if not self.cloud.configured:
            return False
        key = self._key("projects", full_name)
        with self._item_lock(key):
            asset = self.store.get_project_asset(full_name) or {}
            payload = {
                "schema_version": 1,
                "kind": "project-reading",
                "project_full_name": full_name,
                "updated_at": utc_now().isoformat(),
                "explanation": asset.get("explanation"),
                "chat": self.store.project_chat_history(full_name, 0),
            }
            content = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.cloud.upload_bytes(content, key)
            return True

    def project_backup_available(self, full_name: str) -> bool:
        return self.cloud.configured and self.store.has_cloud_object(self._key("projects", full_name))

    def project_backup_pending(self, full_name: str) -> bool:
        with self._lock:
            return self._pending.get(self._key("projects", full_name), 0) > 0

    def restore_project_if_needed(self, full_name: str) -> bool:
        if not self.cloud.configured or self.store.has_local_project_reading(full_name):
            return False
        key = self._key("projects", full_name)
        if not self.store.has_cloud_object(key):
            return False
        payload = json.loads(self.cloud.download_bytes(key).decode("utf-8"))
        if payload.get("project_full_name") != full_name:
            raise ValueError("云端项目阅读档案标识不匹配")
        self.store.restore_project_reading(full_name, payload)
        return True

    def backup_paper_async(self, paper_id: str) -> None:
        self._backup_async("paper", paper_id)

    def backup_project_async(self, full_name: str) -> None:
        self._backup_async("project", full_name)

    def _backup_async(self, kind: str, identifier: str) -> None:
        if not self.cloud.configured:
            return
        key = self._key("papers" if kind == "paper" else "projects", identifier)
        with self._lock:
            self._pending[key] = self._pending.get(key, 0) + 1

        def run() -> None:
            try:
                if kind == "paper":
                    self.backup_paper(identifier)
                else:
                    self.backup_project(identifier)
            except Exception as error:
                print(f"Cloud reading backup failed for {kind} {identifier}: {error}")
            finally:
                with self._lock:
                    remaining = self._pending.get(key, 1) - 1
                    if remaining > 0:
                        self._pending[key] = remaining
                    else:
                        self._pending.pop(key, None)

        threading.Thread(target=run, name=f"reading-backup-{kind}", daemon=True).start()

    def backup_existing_async(self) -> None:
        if not self.cloud.configured:
            return

        def run() -> None:
            try:
                for paper_id in self.store.paper_ids_with_reading():
                    if not self.paper_backup_available(paper_id):
                        self.backup_paper(paper_id)
                for full_name in self.store.project_ids_with_reading():
                    if not self.project_backup_available(full_name):
                        self.backup_project(full_name)
            except Exception as error:
                print(f"Cloud reading backfill failed: {error}")

        threading.Thread(target=run, name="reading-backup-backfill", daemon=True).start()


class PaperAssetService:
    def __init__(self, store: PaperStore, cloud: S3ObjectStorage, settings: RuntimeSettings | None = None) -> None:
        self.store = store
        self.cloud = cloud
        self.settings = settings or RuntimeSettings()
        self._lock = threading.RLock()
        self.settings.pdf_dir.mkdir(parents=True, exist_ok=True)
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
        limit = max(128, int(self.settings.get()["local_cache_max_mb"])) * 1024 * 1024
        files = [path for path in self.settings.pdf_dir.glob("*.pdf") if path.is_file()]
        total = sum(path.stat().st_size for path in files)
        for path in sorted(files, key=lambda item: item.stat().st_mtime):
            if total <= limit:
                break
            if exclude and path.resolve() == exclude.resolve():
                continue
            size = path.stat().st_size
            path.unlink(missing_ok=True)
            total -= size

    def _storage_mode(self, requested: str = "") -> str:
        mode = compact_text(requested).lower() or self.settings.get()["pdf_storage_mode"]
        if mode not in RuntimeSettings.MODES:
            raise ValueError("存储目标必须是 local、cloud 或 hybrid")
        if mode in {"cloud", "hybrid"} and not self.cloud.configured:
            raise RuntimeError("尚未配置云端对象存储")
        return mode

    def _apply_storage_mode(self, paper_id: str, mode: str) -> dict[str, Any]:
        asset = self.store.get_asset(paper_id) or {}
        if mode == "local":
            return self.store.save_asset(paper_id, {"storage_mode": "local"})
        pdf_path = Path(asset.get("local_pdf_path", "")) if asset.get("local_pdf_path") else None
        if asset.get("cloud_pdf_key"):
            local_pdf_path = str(pdf_path) if pdf_path and pdf_path.exists() else ""
            if mode == "cloud" and pdf_path and pdf_path.exists():
                pdf_path.unlink(missing_ok=True)
                local_pdf_path = ""
            return self.store.save_asset(paper_id, {"storage_mode": mode, "local_pdf_path": local_pdf_path})
        return self.store.get_asset(paper_id) if not pdf_path or not pdf_path.exists() else self._archive_asset(paper_id, mode)

    def import_pdf(self, paper: dict[str, Any], content: bytes, filename: str = "", storage_mode: str = "") -> dict[str, Any]:
        if not content or len(content) > MAX_PDF_BYTES:
            raise ValueError("PDF 为空或超过大小限制")
        if b"%PDF" not in content[:2048]:
            raise ValueError("导入文件不是有效 PDF")
        mode = self._storage_mode(storage_mode)
        target = self.settings.pdf_dir / f"{self._cache_key(paper['id'])}.pdf"
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
                "storage_mode": mode,
                "page_count": page_count,
                "text_chars": text_chars,
                "error_text": "",
            },
        )
        self._prune_pdf_cache(target)
        saved = self._apply_storage_mode(paper["id"], mode)
        return self.public_asset(paper["id"], saved)

    def _archive_asset(self, paper_id: str, mode: str) -> dict[str, Any]:
        if mode not in {"cloud", "hybrid"}:
            raise ValueError("云端归档方式无效")
        return self.store.get_asset(paper_id) if not self.cloud.configured else self._upload_asset(paper_id, mode == "cloud")

    def archive_to_cloud(self, paper_id: str, remove_local: bool = True) -> dict[str, Any]:
        existing = self.store.get_asset(paper_id) or {}
        if existing.get("cloud_pdf_key") and self.cloud.configured:
            local_path = Path(existing.get("local_pdf_path", "")) if existing.get("local_pdf_path") else None
            if remove_local:
                if local_path and local_path.exists():
                    local_path.unlink(missing_ok=True)
                saved = self.store.save_asset(paper_id, {"local_pdf_path": "", "storage_mode": "cloud"})
            else:
                if not local_path or not local_path.exists():
                    self.pdf_path(paper_id)
                saved = self.store.save_asset(paper_id, {"storage_mode": "hybrid"})
            return self.public_asset(paper_id, saved)
        return self._upload_asset(paper_id, remove_local)

    def _upload_asset(self, paper_id: str, remove_local: bool) -> dict[str, Any]:
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

    def prepare(self, paper: dict[str, Any], force: bool = False, storage_mode: str = "") -> dict[str, Any]:
        with self._lock:
            mode = self._storage_mode(storage_mode)
            asset = self.store.get_asset(paper["id"]) or {}
            if asset.get("cloud_pdf_key") and self.cloud.configured:
                if mode in {"local", "hybrid"}:
                    self.pdf_path(paper["id"])
                asset = self._apply_storage_mode(paper["id"], mode)
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
                asset = self._apply_storage_mode(paper["id"], mode)
                return self.public_asset(paper["id"], asset)

            errors = []
            target = self.settings.pdf_dir / f"{self._cache_key(paper['id'])}.pdf"
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
                            "storage_mode": mode,
                            "page_count": page_count,
                            "text_chars": text_chars,
                            "error_text": extract_error,
                        },
                    )
                    self._prune_pdf_cache(target)
                    saved = self._apply_storage_mode(paper["id"], mode)
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
            target = self.settings.pdf_dir / f"{self._cache_key(paper_id)}.pdf"
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


class ProjectDocumentTranslationService:
    def __init__(
        self,
        store: PaperStore,
        cloud: S3ObjectStorage,
        assets: ProjectAssetService,
        translator: TranslationService,
    ) -> None:
        self.store = store
        self.cloud = cloud
        self.assets = assets
        self.translator = translator
        self._lock = threading.RLock()
        PROJECT_DOC_TRANSLATION_DIR.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _project_key(full_name: str) -> str:
        return hashlib.sha256(full_name.encode("utf-8")).hexdigest()[:24]

    @staticmethod
    def _document_key(path: str) -> str:
        return hashlib.sha256(path.encode("utf-8")).hexdigest()[:24]

    def _local_path(self, full_name: str, path: str, target: str) -> Path:
        directory = PROJECT_DOC_TRANSLATION_DIR / self._project_key(full_name)
        directory.mkdir(parents=True, exist_ok=True)
        return directory / f"{self._document_key(path)}.{target}.json"

    def _cloud_key(self, full_name: str, path: str, target: str) -> str:
        return (
            f"projects/{self._project_key(full_name)}/document-translations/"
            f"{self._document_key(path)}-{target}.json"
        )

    @staticmethod
    def _valid(payload: dict[str, Any], source_hash: str, path: str, target: str) -> bool:
        return bool(
            payload.get("html")
            and payload.get("source_hash") == source_hash
            and payload.get("path") == path
            and payload.get("target") == target
        )

    def translate(self, full_name: str, path: str, target: str) -> dict[str, Any]:
        if target not in {"zh", "ja"}:
            raise ValueError("文档目标语言必须是中文或日文")
        source = self.assets.file(full_name, path)
        if not source or not source.get("rendered_html"):
            raise ValueError("Markdown 文档不存在或无法渲染")
        if not source.get("important_document"):
            raise ValueError("当前文档不在重要 Markdown 导读范围内")
        source_hash = hashlib.sha256(source["content"].encode("utf-8")).hexdigest()
        local_path = self._local_path(full_name, path, target)
        cloud_key = self._cloud_key(full_name, path, target)
        with self._lock:
            if local_path.exists():
                try:
                    cached = json.loads(local_path.read_text(encoding="utf-8"))
                    if self._valid(cached, source_hash, path, target):
                        return {**cached, "cached": True, "cloud_backed_up": self.store.has_cloud_object(cloud_key)}
                except (OSError, ValueError, json.JSONDecodeError):
                    pass
            if self.cloud.configured and self.store.has_cloud_object(cloud_key):
                try:
                    cached = json.loads(self.cloud.download_bytes(cloud_key).decode("utf-8"))
                    if self._valid(cached, source_hash, path, target):
                        local_path.write_text(json.dumps(cached, ensure_ascii=False), encoding="utf-8")
                        return {**cached, "cached": True, "cloud_backed_up": True}
                except (OSError, ValueError, json.JSONDecodeError):
                    pass
            document = TranslatableHtml()
            document.feed(source["rendered_html"])
            rendered, provider = document.translated_html(self.translator, target)
            payload = {
                "schema_version": 1,
                "project_full_name": full_name,
                "path": path,
                "target": target,
                "source_hash": source_hash,
                "provider": provider,
                "html": rendered,
                "generated_at": utc_now().isoformat(),
            }
            local_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            cloud_backed_up = False
            if self.cloud.configured:
                try:
                    self.cloud.upload_bytes(
                        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
                        cloud_key,
                    )
                    cloud_backed_up = True
                except Exception as error:
                    print(f"Cloud document translation backup failed for {full_name}/{path}/{target}: {error}")
            return {**payload, "cached": False, "cloud_backed_up": cloud_backed_up}


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
PROJECT_ASSETS = ProjectAssetService(STORE)
PROJECT_EXPLAINER = ProjectExplainer(STORE, PROJECT_ASSETS, EXPLAINER)
SETTINGS = RuntimeSettings(SETTINGS_PATH)
CLOUD = S3ObjectStorage(STORE)
CLOUD.set_shared_storage_limit(SETTINGS.get()["shared_storage_max_mb"])
READING_ARCHIVE = ReadingArchiveService(STORE, CLOUD)
ASSETS = PaperAssetService(STORE, CLOUD, SETTINGS)
TRANSLATOR = TranslationService()
PROJECT_DOCUMENTS = ProjectDocumentTranslationService(STORE, CLOUD, PROJECT_ASSETS, TRANSLATOR)
AUTH = AuthService(AUTH_USERS_PATH)
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
        WEEKLY_PREPARATION.start()
        time.sleep(300)


def rotate_daily_candidates(
    ranked: list[tuple[float, dict[str, Any], dict[str, Any], dict[str, Any] | None]],
    limit: int,
    topic: str,
    day: Any,
) -> list[tuple[float, dict[str, Any], dict[str, Any], dict[str, Any] | None]]:
    rotation_pool = ranked[:max(limit, limit * 7)]
    block_count = max(1, len(rotation_pool) // limit)
    topic_offset = int(hashlib.sha256(topic.encode("utf-8")).hexdigest()[:8], 16)
    block_index = (day.toordinal() // 7 + topic_offset) % block_count
    rotated = rotation_pool[block_index * limit:(block_index + 1) * limit]
    rotated_ids = {entry[1]["id"] for entry in rotated}
    return [*rotated, *(entry for entry in ranked if entry[1]["id"] not in rotated_ids)]


def daily_recommendations(topic: str = "", per_topic: int | None = None) -> dict[str, Any]:
    papers = filter_papers(STORE.list_papers(), {})
    topics = [topic] if topic else CONFIG.get("daily_topics", list(CLASSIFIER.topics))
    limit = max(1, min(10, per_topic or int(CONFIG.get("daily_recommendations_per_topic", 5))))
    window_days = max(7, int(CONFIG.get("recommendation_window_days", 45)))
    cutoff = (utc_now() - timedelta(days=window_days)).date().isoformat()
    groups = []
    items = []
    seen: set[str] = set()
    today = utc_now().date()
    rotation_week_start = today - timedelta(days=today.weekday())
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
        available = [entry for entry in ranked if entry[1]["id"] not in seen]
        ranked_for_week = rotate_daily_candidates(available, limit, current_topic, rotation_week_start)
        selected = []
        for _, paper, score, asset in ranked_for_week:
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
        "rotation_week_start": rotation_week_start.isoformat(),
        "rotation_week_end": (rotation_week_start + timedelta(days=6)).isoformat(),
        "rotation_policy": "同一自然周稳定、每周轮换七组高分候选",
        "weights": CONFIG.get("recommendation_weights", {}),
        "generated_at": utc_now().isoformat(),
    }


class WeeklySelectionService:
    def __init__(self, store: PaperStore, config: dict[str, Any], path: Path, ranking_loader: Any) -> None:
        self.store = store
        self.config = config
        self.path = path
        self.ranking_loader = ranking_loader
        self._lock = threading.RLock()

    def _read(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, ValueError, json.JSONDecodeError):
            return {}

    def _write(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def _select(self, per_topic: int) -> dict[str, Any]:
        ranked = self.ranking_loader("", per_topic)
        state = {
            "schema_version": 1,
            "week_start": ranked["rotation_week_start"],
            "week_end": ranked["rotation_week_end"],
            "per_topic": per_topic,
            "window_days": ranked["window_days"],
            "selected_at": utc_now().isoformat(),
            "groups": [],
        }
        for group in ranked["groups"]:
            state["groups"].append(
                {
                    "topic": group["topic"],
                    "items": [
                        {
                            "id": paper["id"],
                            "recommendation_topic": paper["recommendation_topic"],
                            "recommendation_score": paper["recommendation_score"],
                            "score_breakdown": paper["score_breakdown"],
                        }
                        for paper in group["items"]
                    ],
                }
            )
        self._write(state)
        return state

    def get(self, topic: str = "", per_topic: int | None = None) -> dict[str, Any]:
        configured_limit = max(1, min(10, int(self.config.get("daily_recommendations_per_topic", 5))))
        requested_limit = max(1, min(configured_limit, per_topic or configured_limit))
        today = utc_now().date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        with self._lock:
            state = self._read()
            if state.get("week_start") != week_start or int(state.get("per_topic", 0) or 0) != configured_limit:
                state = self._select(configured_limit)

        papers = {paper["id"]: paper for paper in self.store.list_papers()}
        ids = [item["id"] for group in state.get("groups", []) for item in group.get("items", [])]
        assets = self.store.assets_for_papers(ids)
        groups = []
        items = []
        for saved_group in state.get("groups", []):
            if topic and saved_group.get("topic") != topic:
                continue
            selected = []
            for saved in saved_group.get("items", [])[:requested_limit]:
                paper = papers.get(saved["id"])
                if not paper:
                    continue
                asset = assets.get(saved["id"])
                item = {
                    **paper,
                    **saved,
                    "is_recommended": True,
                    "pdf_cached": bool(asset and asset.get("local_pdf_path")),
                    "fulltext_cached": bool(asset and int(asset.get("text_chars", 0) or 0) > 1000),
                }
                selected.append(item)
                items.append(item)
            groups.append({"topic": saved_group.get("topic", ""), "items": selected, "count": len(selected)})
        return {
            "items": items,
            "groups": groups,
            "total": len(items),
            "per_topic": requested_limit,
            "window_days": int(state.get("window_days", self.config.get("recommendation_window_days", 45))),
            "rotation_week_start": state.get("week_start", week_start),
            "rotation_week_end": state.get("week_end", ""),
            "rotation_policy": "同一自然周冻结入选名单，下周重新排名",
            "weights": self.config.get("recommendation_weights", {}),
            "generated_at": state.get("selected_at", ""),
        }


class WeeklyPreparationService:
    SCHEMA_VERSION = 2
    TERMINAL_PDF = {"ready", "unavailable"}
    TERMINAL_EXPLANATION = {"ready", "skipped_no_fulltext"}

    def __init__(
        self,
        store: PaperStore,
        assets: PaperAssetService,
        explainer: PaperExplainer,
        archive: ReadingArchiveService,
        config: dict[str, Any],
        path: Path,
        recommendation_loader: Any,
    ) -> None:
        self.store = store
        self.assets = assets
        self.explainer = explainer
        self.archive = archive
        self.config = config
        self.path = path
        self.recommendation_loader = recommendation_loader
        self._lock = threading.RLock()
        self._running = False

    @staticmethod
    def candidates(payload: dict[str, Any]) -> list[dict[str, Any]]:
        groups = [group.get("items", []) for group in payload.get("groups", [])]
        ordered: list[dict[str, Any]] = []
        seen: set[str] = set()
        for index in range(max((len(group) for group in groups), default=0)):
            for group in groups:
                if index >= len(group):
                    continue
                paper = group[index]
                if paper.get("id") and paper["id"] not in seen:
                    ordered.append(paper)
                    seen.add(paper["id"])
        return ordered

    def _read(self) -> dict[str, Any]:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except (OSError, ValueError, json.JSONDecodeError):
            return {}

    def _write(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def _week_payload(self, recommendations: dict[str, Any]) -> dict[str, Any]:
        return {
            "schema_version": self.SCHEMA_VERSION,
            "week_start": recommendations["rotation_week_start"],
            "week_end": recommendations["rotation_week_end"],
            "status": "scheduled",
            "started_at": "",
            "last_attempt_at": "",
            "finished_at": "",
            "updated_at": utc_now().isoformat(),
            "current_paper_id": "",
            "current_title": "",
            "items": {},
        }

    def _summary(self, state: dict[str, Any], recommendations: dict[str, Any]) -> dict[str, Any]:
        candidates = self.candidates(recommendations)
        pdf_limit = min(len(candidates), max(0, int(self.config.get("weekly_pdf_preparation_max_papers", 35))))
        items = state.get("items", {}) if state.get("week_start") == recommendations.get("rotation_week_start") else {}
        explanation_candidates = [
            paper for paper in candidates[:pdf_limit]
            if items.get(paper["id"], {}).get("fulltext_available")
        ]
        explanation_limit = min(
            len(explanation_candidates),
            max(0, int(self.config.get("weekly_explanation_preparation_max_papers", 10))),
        )
        pdf_ready = sum(items.get(paper["id"], {}).get("pdf_status") == "ready" for paper in candidates[:pdf_limit])
        pdf_checked = sum(items.get(paper["id"], {}).get("pdf_status") in self.TERMINAL_PDF for paper in candidates[:pdf_limit])
        explanation_ready = sum(
            items.get(paper["id"], {}).get("explanation_status") == "ready"
            for paper in explanation_candidates[:explanation_limit]
        )
        explanation_checked = sum(
            items.get(paper["id"], {}).get("explanation_status") in self.TERMINAL_EXPLANATION
            for paper in explanation_candidates[:explanation_limit]
        )
        return {
            "enabled": bool(self.config.get("weekly_preparation_enabled", True)),
            "running": self._running,
            "status": state.get("status", "scheduled") if items else "scheduled",
            "week_start": recommendations.get("rotation_week_start", ""),
            "week_end": recommendations.get("rotation_week_end", ""),
            "pdf_target": pdf_limit,
            "pdf_ready": pdf_ready,
            "pdf_checked": pdf_checked,
            "explanation_target": explanation_limit,
            "explanation_ready": explanation_ready,
            "explanation_checked": explanation_checked,
            "current_paper_id": state.get("current_paper_id", "") if items else "",
            "current_title": state.get("current_title", "") if items else "",
            "updated_at": state.get("updated_at", "") if items else "",
            "items": items,
        }

    def status(self, recommendations: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = recommendations or self.recommendation_loader()
        with self._lock:
            return self._summary(self._read(), payload)

    def _due(self, recommendations: dict[str, Any]) -> bool:
        if not self.config.get("weekly_preparation_enabled", True):
            return False
        state = self._read()
        if int(state.get("schema_version", 0) or 0) != self.SCHEMA_VERSION:
            return True
        if state.get("week_start") != recommendations.get("rotation_week_start"):
            return True
        if state.get("status") == "running":
            return True
        if state.get("status") == "completed":
            return False
        last_attempt = state.get("last_attempt_at", "")
        if not last_attempt:
            return True
        try:
            retry_hours = max(1, int(self.config.get("weekly_preparation_retry_hours", 6)))
            return (utc_now() - datetime.fromisoformat(last_attempt)).total_seconds() >= retry_hours * 3600
        except ValueError:
            return True

    def start(self, recommendations: dict[str, Any] | None = None, force: bool = False) -> bool:
        payload = recommendations or self.recommendation_loader()
        with self._lock:
            if self._running or (not force and not self._due(payload)):
                return False
            self._running = True

        def run() -> None:
            try:
                self.run(payload)
            except Exception as error:
                with self._lock:
                    state = self._read() or self._week_payload(payload)
                    state.update({"status": "partial", "error": str(error)[:1200], "updated_at": utc_now().isoformat()})
                    self._write(state)
            finally:
                with self._lock:
                    self._running = False

        threading.Thread(target=run, daemon=True, name="weekly-paper-preparation").start()
        return True

    def run(self, recommendations: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = recommendations or self.recommendation_loader()
        candidates = self.candidates(payload)
        pdf_limit = min(len(candidates), max(0, int(self.config.get("weekly_pdf_preparation_max_papers", 35))))
        delay = max(0, int(self.config.get("weekly_preparation_delay_seconds", 3)))
        with self._lock:
            state = self._read()
            if state.get("week_start") != payload.get("rotation_week_start"):
                state = self._week_payload(payload)
            now = utc_now().isoformat()
            state.update({"schema_version": self.SCHEMA_VERSION, "status": "running", "started_at": state.get("started_at") or now, "last_attempt_at": now, "updated_at": now, "error": ""})
            self._write(state)

        for paper in candidates[:pdf_limit]:
            paper_id = paper["id"]
            item = state.setdefault("items", {}).setdefault(paper_id, {"title": paper.get("title", "")})
            if item.get("pdf_status") in self.TERMINAL_PDF:
                continue
            state.update({"current_paper_id": paper_id, "current_title": paper.get("title", ""), "updated_at": utc_now().isoformat()})
            self._write(state)
            try:
                asset = self.assets.prepare(paper)
                item.update(
                    {
                        "pdf_status": "ready" if asset.get("pdf_available") else "unavailable",
                        "fulltext_available": bool(asset.get("fulltext_available")),
                        "pdf_provider": asset.get("provider", ""),
                        "page_count": int(asset.get("page_count", 0) or 0),
                        "error": asset.get("error", ""),
                        "updated_at": utc_now().isoformat(),
                    }
                )
            except Exception as error:
                item.update({"pdf_status": "failed", "error": str(error)[:1200], "updated_at": utc_now().isoformat()})
            self._write(state)
            if delay:
                time.sleep(delay)

        explanation_candidates = [
            paper for paper in candidates[:pdf_limit]
            if state.get("items", {}).get(paper["id"], {}).get("fulltext_available")
        ]
        explanation_limit = min(
            len(explanation_candidates),
            max(0, int(self.config.get("weekly_explanation_preparation_max_papers", 10))),
        )
        for paper in explanation_candidates[:explanation_limit]:
            paper_id = paper["id"]
            item = state.setdefault("items", {}).setdefault(paper_id, {"title": paper.get("title", "")})
            current = self.store.get_paper(paper_id) or paper
            existing = current.get("explanation") or {}
            if existing.get("reading_basis") == "fulltext":
                item.update({"explanation_status": "ready", "explanation_provider": existing.get("provider", ""), "updated_at": utc_now().isoformat()})
                self._write(state)
                continue
            fulltext = self.assets.fulltext(paper_id)
            if not fulltext:
                item.update({"explanation_status": "skipped_no_fulltext", "updated_at": utc_now().isoformat()})
                self._write(state)
                continue
            if not self.explainer.connection():
                item.update({"explanation_status": "blocked_no_provider", "error": "当前没有可用的大模型配置", "updated_at": utc_now().isoformat()})
                self._write(state)
                continue
            state.update({"current_paper_id": paper_id, "current_title": paper.get("title", ""), "updated_at": utc_now().isoformat()})
            self._write(state)
            try:
                notes = self.assets.reading_notes(paper_id, fulltext)
                explanation = self.explainer.explain(
                    current,
                    fulltext,
                    notes,
                    (lambda value, current_id=paper_id, text=fulltext: self.assets.save_reading_notes(current_id, text, value)),
                )
                if explanation.get("mode") != "ai" or explanation.get("reading_basis") != "fulltext":
                    raise RuntimeError(explanation.get("notice") or "全文精读未成功生成")
                self.store.save_explanation(paper_id, explanation)
                self.archive.backup_paper_async(paper_id)
                item.update(
                    {
                        "explanation_status": "ready",
                        "explanation_provider": explanation.get("provider", ""),
                        "explanation_model": explanation.get("model", ""),
                        "error": "",
                        "updated_at": utc_now().isoformat(),
                    }
                )
            except Exception as error:
                item.update({"explanation_status": "failed", "error": str(error)[:1200], "updated_at": utc_now().isoformat()})
            self._write(state)
            if delay:
                time.sleep(delay)

        summary = self._summary(state, payload)
        complete = summary["pdf_checked"] >= summary["pdf_target"] and summary["explanation_checked"] >= summary["explanation_target"]
        state.update(
            {
                "status": "completed" if complete else "partial",
                "current_paper_id": "",
                "current_title": "",
                "finished_at": utc_now().isoformat() if complete else "",
                "updated_at": utc_now().isoformat(),
            }
        )
        self._write(state)
        return self._summary(state, payload)


WEEKLY_SELECTION = WeeklySelectionService(
    STORE,
    CONFIG,
    DATA_DIR / "weekly-selection.json",
    daily_recommendations,
)


WEEKLY_PREPARATION = WeeklyPreparationService(
    STORE,
    ASSETS,
    EXPLAINER,
    READING_ARCHIVE,
    CONFIG,
    DATA_DIR / "weekly-preparation.json",
    WEEKLY_SELECTION.get,
)


def project_recommendation(project: dict[str, Any], reference_time: datetime | None = None) -> dict[str, Any]:
    reference = reference_time or utc_now()
    try:
        pushed = datetime.fromisoformat(project.get("pushed_at", "").replace("Z", "+00:00"))
        if pushed.tzinfo is None:
            pushed = pushed.replace(tzinfo=timezone.utc)
        age_days = max(0, (reference - pushed).days)
    except ValueError:
        age_days = 365
    categories = project.get("categories", [])
    topics = project.get("topics", [])
    relevance = min(20.0, 8.0 + len(categories) * 6.0 + min(4.0, len(topics)))
    freshness = 25.0 * max(0.08, 1 - min(age_days, 60) / 65)
    stars = int(project.get("stars", 0) or 0)
    adoption = 20.0 * min(1.0, (stars / 1000) ** 0.5)
    linked = int(project.get("linked_paper_count", 0) or 0)
    paper_link = 0.0 if linked == 0 else 17.0 if linked == 1 else min(25.0, 17.0 + linked * 4.0)
    completeness_signals = (
        bool(project.get("description")), bool(project.get("language")), bool(project.get("license")),
        bool(project.get("homepage")), bool(topics),
    )
    completeness = 10.0 * sum(completeness_signals) / len(completeness_signals)
    size_kb = int(project.get("size_kb", 0) or 0)
    if size_kb > 500000:
        completeness = min(completeness, 3.0)
    elif size_kb > 200000:
        completeness = min(completeness, 6.0)
    components = [
        ("方向匹配", relevance, 20, "仓库主题与具身智能、大模型配置的匹配"),
        ("近期活跃", freshness, 25, f"最近推送距今约 {age_days} 天"),
        ("社区采用", adoption, 20, f"当前 Stars {stars}"),
        ("论文关联", paper_link, 25, f"高置信度关联论文 {linked} 篇"),
        ("仓库完整度", completeness, 10, f"说明、语言、许可证与源码体积约 {round(size_kb / 1024)} MB" if size_kb else "说明、语言、许可证、主页和主题元数据"),
    ]
    return {
        "total": round(sum(value for _, value, _, _ in components), 1),
        "components": [
            {"name": name, "score": round(value, 1), "max": maximum, "reason": reason}
            for name, value, maximum, reason in components
        ],
    }


def weekly_project_recommendations(limit: int | None = None, week_start: Any = None) -> dict[str, Any]:
    configured_limit = CONFIG.get("weekly_project_recommendations", CONFIG.get("daily_project_recommendations", 4))
    maximum = max(1, min(4, limit or int(configured_limit)))
    window_days = max(7, int(CONFIG.get("project_recommendation_window_days", 45)))
    today = utc_now().date()
    rotation_week_start = week_start or (today - timedelta(days=today.weekday()))
    selection_time = datetime(
        rotation_week_start.year, rotation_week_start.month, rotation_week_start.day, tzinfo=timezone.utc,
    )
    cutoff = selection_time - timedelta(days=window_days)
    projects = []
    for project in STORE.list_projects():
        try:
            pushed = datetime.fromisoformat(project.get("pushed_at", "").replace("Z", "+00:00"))
            if pushed.tzinfo is None:
                pushed = pushed.replace(tzinfo=timezone.utc)
        except ValueError:
            pushed = datetime.min.replace(tzinfo=timezone.utc)
        if pushed < cutoff or pushed > selection_time:
            continue
        score = project_recommendation(project, selection_time)
        projects.append({**project, "recommendation_score": score["total"], "score_breakdown": score["components"]})
    projects.sort(
        key=lambda item: (item["recommendation_score"], item["linked_paper_count"], item["stars"], item["pushed_at"]),
        reverse=True,
    )
    rotation_pool_size = min(len(projects), maximum * 7)
    rotation_pool = projects[:rotation_pool_size]
    block_count = max(1, (len(rotation_pool) + maximum - 1) // maximum)
    block_index = (rotation_week_start.toordinal() // 7) % block_count
    block_start = block_index * maximum
    weekly_block = rotation_pool[block_start:block_start + maximum]
    weekly_names = {project["full_name"] for project in weekly_block}
    ordered = [*weekly_block, *(project for project in projects if project["full_name"] not in weekly_names)]

    selected = []
    represented = set()
    for project in ordered:
        primary_category = (project.get("categories") or [""])[0]
        if primary_category and primary_category in represented:
            continue
        selected.append(project)
        represented.add(primary_category)
        if len(selected) >= maximum:
            break
    if len(selected) < maximum:
        selected_names = {project["full_name"] for project in selected}
        remaining = [project for project in ordered if project["full_name"] not in selected_names]
        selected.extend(remaining[: maximum - len(selected)])
    return {
        "items": selected,
        "total": len(selected),
        "candidate_total": len(projects),
        "limit": maximum,
        "window_days": window_days,
        "rotation_week_start": rotation_week_start.isoformat(),
        "rotation_week_end": (rotation_week_start + timedelta(days=6)).isoformat(),
        "rotation_policy": "同一自然周稳定、每周轮换高分项目候选",
        "generated_at": utc_now().isoformat(),
    }


def daily_project_recommendations(limit: int | None = None) -> dict[str, Any]:
    """Compatibility alias for clients older than 0.10.2."""
    return weekly_project_recommendations(limit)


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
    _login_lock = threading.Lock()
    _login_failures: dict[str, list[float]] = {}

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def send_json(self, payload: Any, status: int = 200, headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def redirect(self, location: str, headers: dict[str, str] | None = None) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()

    def session_token(self) -> str:
        try:
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            return cookie.get("paperfield_session").value if cookie.get("paperfield_session") else ""
        except (KeyError, TypeError):
            return ""

    def current_user(self) -> dict[str, Any] | None:
        return AUTH.session_user(self.session_token()) if AUTH.enabled else None

    def require_auth(self, parsed: urllib.parse.ParseResult) -> dict[str, Any] | None:
        if not AUTH.enabled:
            self.auth_user = {"username": "local", "display_name": "本地用户", "role": "local", "enabled": True}
            return self.auth_user
        user = self.current_user()
        if user:
            self.auth_user = user
            return user
        if parsed.path.startswith("/api/"):
            self.send_json({"error": "登录已失效，请重新登录", "auth_required": True}, 401)
        else:
            next_path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
            self.redirect(f"/login?next={urllib.parse.quote(next_path, safe='')}")
        return None

    def host_ai_allowed(self) -> bool:
        user = getattr(self, "auth_user", None)
        return not AUTH.enabled or bool(user and user.get("role") == "beta")

    def require_host_ai(self) -> bool:
        if self.host_ai_allowed():
            return True
        self.send_json(
            {
                "error": "普通账户不能使用内测主机的 GPT 额度；请在自己的电脑上运行 Paperfield 并连接本地 API",
                "local_ai_required": True,
            },
            403,
        )
        return False

    def secure_cookie(self, token: str, clear: bool = False) -> str:
        secure = self.headers.get("X-Forwarded-Proto", "").lower() == "https" or "https" in self.headers.get("CF-Visitor", "").lower()
        value = f"paperfield_session={'deleted' if clear else token}; Path=/; HttpOnly; SameSite=Lax"
        value += "; Max-Age=0" if clear else f"; Max-Age={int(AuthService.SESSION_TTL.total_seconds())}"
        return value + ("; Secure" if secure else "")

    def client_address_key(self) -> str:
        return compact_text(self.headers.get("CF-Connecting-IP")) or self.client_address[0]

    def login_blocked(self) -> bool:
        key = self.client_address_key()
        cutoff = time.monotonic() - 600
        with self._login_lock:
            recent = [value for value in self._login_failures.get(key, []) if value >= cutoff]
            self._login_failures[key] = recent
            return len(recent) >= 10

    def record_login_failure(self) -> None:
        key = self.client_address_key()
        with self._login_lock:
            self._login_failures.setdefault(key, []).append(time.monotonic())

    def clear_login_failures(self) -> None:
        with self._login_lock:
            self._login_failures.pop(self.client_address_key(), None)

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
        try:
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
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            payload = {"status": "ok", "version": APP_VERSION}
            if not AUTH.enabled:
                payload.update({"papers": STORE.count(), "projects": STORE.count_projects()})
            self.send_json(payload)
            return
        if parsed.path == "/login":
            if not AUTH.enabled or self.current_user():
                self.redirect("/")
                return
            self.path = "/login.html"
            return super().do_GET()
        if parsed.path in {"/login.css", "/login.js"}:
            return super().do_GET()
        if parsed.path == "/api/auth/me":
            if not AUTH.enabled:
                self.send_json({"enabled": False, "user": None, "host_ai_allowed": True})
                return
            user = self.current_user()
            self.send_json(
                {"enabled": True, "user": user, "host_ai_allowed": bool(user and user.get("role") == "beta")},
                200 if user else 401,
            )
            return
        if not self.require_auth(parsed):
            return
        if not parsed.path.startswith("/api/"):
            if parsed.path not in {"/", "/index.html"} and not (STATIC_DIR / parsed.path.lstrip("/")).exists():
                self.path = "/index.html"
            return super().do_GET()
        params = urllib.parse.parse_qs(parsed.query)
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
            recommendations = WEEKLY_SELECTION.get(topic, per_topic)
            WEEKLY_PREPARATION.start()
            preparation = WEEKLY_PREPARATION.status()
            for paper in recommendations["items"]:
                paper["weekly_preparation"] = preparation["items"].get(paper["id"], {})
            recommendations["preparation"] = preparation
            self.send_json(recommendations)
            return
        if parsed.path == "/api/weekly-preparation":
            WEEKLY_PREPARATION.start()
            self.send_json(WEEKLY_PREPARATION.status())
            return
        if parsed.path == "/api/project-recommendations":
            configured_limit = CONFIG.get("weekly_project_recommendations", CONFIG.get("daily_project_recommendations", 4))
            try:
                limit = int((params.get("limit") or [str(configured_limit)])[0])
            except ValueError:
                limit = int(configured_limit)
            self.send_json(weekly_project_recommendations(limit))
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
        project_action = re.fullmatch(r"/api/projects/(.+)/(workspace|source|chat)", parsed.path)
        if project_action:
            full_name = urllib.parse.unquote(project_action.group(1))
            action = project_action.group(2)
            if action in {"explain", "chat"} and not self.require_host_ai():
                return
            project = STORE.get_project(full_name)
            if not project:
                self.send_json({"error": "项目不存在"}, 404)
                return
            try:
                READING_ARCHIVE.restore_project_if_needed(full_name)
            except Exception as error:
                print(f"Cloud project reading restore failed for {full_name}: {error}")
            if action == "workspace":
                workspace = PROJECT_ASSETS.workspace(project)
                workspace["reading_backup_available"] = READING_ARCHIVE.project_backup_available(full_name)
                workspace["reading_backup_pending"] = READING_ARCHIVE.project_backup_pending(full_name)
                self.send_json(workspace)
                return
            if action == "source":
                relative_path = (params.get("path") or [""])[0]
                source_file = PROJECT_ASSETS.file(full_name, relative_path)
                self.send_json(source_file or {"error": "源码文件不存在"}, 200 if source_file else 404)
                return
            self.send_json({"items": STORE.project_chat_history(full_name, 0), "project_full_name": full_name})
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
            if action == "chat":
                try:
                    if READING_ARCHIVE.restore_paper_if_needed(paper_id):
                        paper = STORE.get_paper(paper_id) or paper
                except Exception as error:
                    print(f"Cloud paper reading restore failed for {paper_id}: {error}")
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
            self.send_json({"items": STORE.chat_history(paper_id, 0), "paper_id": paper_id})
            return
        if parsed.path.startswith("/api/papers/"):
            paper_id = urllib.parse.unquote(parsed.path.removeprefix("/api/papers/"))
            paper = STORE.get_paper(paper_id)
            if paper:
                try:
                    if READING_ARCHIVE.restore_paper_if_needed(paper_id):
                        paper = STORE.get_paper(paper_id) or paper
                except Exception as error:
                    print(f"Cloud paper reading restore failed for {paper_id}: {error}")
                paper["asset"] = ASSETS.public_asset(paper_id)
                paper["reading_backup_available"] = READING_ARCHIVE.paper_backup_available(paper_id)
                paper["reading_backup_pending"] = READING_ARCHIVE.paper_backup_pending(paper_id)
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
            self.send_json(CLOUD.status(SETTINGS, (params.get("refresh") or [""])[0] == "1"))
            return
        if parsed.path == "/api/settings":
            self.send_json(SETTINGS.get())
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
            ai_connection = EXPLAINER.connection() if self.host_ai_allowed() else None
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
        if parsed.path == "/api/auth/login":
            if not AUTH.enabled:
                self.send_json({"error": "当前实例未启用账户登录"}, 400)
                return
            if self.login_blocked():
                self.send_json({"error": "登录尝试过多，请十分钟后再试"}, 429)
                return
            payload = self.read_json()
            user = AUTH.authenticate(
                str(payload.get("username", "")),
                str(payload.get("password", "")),
            )
            if not user:
                self.record_login_failure()
                self.send_json({"error": "用户名或密码错误"}, 401)
                return
            self.clear_login_failures()
            token = AUTH.create_session(user["username"])
            self.send_json(
                {"ok": True, "user": user},
                headers={"Set-Cookie": self.secure_cookie(token)},
            )
            return
        if parsed.path == "/api/auth/logout":
            AUTH.revoke_session(self.session_token())
            self.send_json(
                {"ok": True},
                headers={"Set-Cookie": self.secure_cookie("", clear=True)},
            )
            return
        if not self.require_auth(parsed):
            return
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
        if parsed.path == "/api/settings":
            if AUTH.enabled and not self.host_ai_allowed():
                self.send_json({"error": "只有内测账户可以修改主机存储设置"}, 403)
                return
            try:
                updated = SETTINGS.update(self.read_json(), CLOUD.configured)
                CLOUD.set_shared_storage_limit(updated["shared_storage_max_mb"])
                self.send_json(updated)
            except (OSError, TypeError, ValueError) as error:
                self.send_json({"error": str(error)}, 400)
            return
        if parsed.path == "/api/connectors/import":
            try:
                self.send_json(CONNECTOR.import_paper(self.read_json()), 201)
            except (TypeError, ValueError) as error:
                self.send_json({"error": str(error)}, 400)
            return
        project_action = re.fullmatch(r"/api/projects/(.+)/(workspace|explain|chat|document)", parsed.path)
        if project_action:
            full_name = urllib.parse.unquote(project_action.group(1))
            action = project_action.group(2)
            project = STORE.get_project(full_name)
            if not project:
                self.send_json({"error": "项目不存在"}, 404)
                return
            try:
                READING_ARCHIVE.restore_project_if_needed(full_name)
            except Exception as error:
                print(f"Cloud project reading restore failed for {full_name}: {error}")
            if action == "workspace":
                payload = self.read_json()
                workspace = PROJECT_ASSETS.prepare(project, bool(payload.get("force")))
                workspace["reading_backup_available"] = READING_ARCHIVE.project_backup_available(full_name)
                workspace["reading_backup_pending"] = READING_ARCHIVE.project_backup_pending(full_name)
                self.send_json(workspace)
                return
            if action == "document":
                payload = self.read_json()
                try:
                    self.send_json(
                        PROJECT_DOCUMENTS.translate(
                            full_name,
                            compact_text(str(payload.get("path", ""))),
                            compact_text(str(payload.get("target", ""))).lower(),
                        )
                    )
                except (OSError, RuntimeError, TypeError, ValueError) as error:
                    self.send_json({"error": str(error)}, 503)
                return
            if action == "explain":
                try:
                    explanation = PROJECT_EXPLAINER.explain(project)
                    STORE.save_project_explanation(full_name, explanation)
                    READING_ARCHIVE.backup_project_async(full_name)
                    self.send_json(explanation)
                except Exception as error:
                    self.send_json({"error": str(error)}, 503)
                return
            payload = self.read_json()
            question = compact_text(str(payload.get("question", "")))[:4000]
            if not question:
                self.send_json({"error": "请输入关于项目代码的问题"}, 400)
                return
            try:
                answer = PROJECT_EXPLAINER.ask(project, question, compact_text(str(payload.get("selected_path", ""))))
                READING_ARCHIVE.backup_project_async(full_name)
                self.send_json(answer)
            except Exception as error:
                self.send_json({"error": str(error)}, 503)
            return
        match = re.fullmatch(r"/api/papers/(.+)/(state|explain|resolve|chat|import|archive)", parsed.path)
        if match:
            paper_id = urllib.parse.unquote(match.group(1))
            action = match.group(2)
            if action in {"explain", "chat"} and not self.require_host_ai():
                return
            paper = STORE.get_paper(paper_id)
            if not paper:
                self.send_json({"error": "论文不存在"}, 404)
                return
            try:
                if READING_ARCHIVE.restore_paper_if_needed(paper_id):
                    paper = STORE.get_paper(paper_id) or paper
            except Exception as error:
                print(f"Cloud paper reading restore failed for {paper_id}: {error}")
            if action == "state":
                updated = STORE.update_state(paper_id, self.read_json())
                READING_ARCHIVE.backup_paper_async(paper_id)
                self.send_json(updated)
                return
            if action == "import":
                try:
                    filename = urllib.parse.unquote(self.headers.get("X-Paperfield-Filename", ""))[:240]
                    storage_mode = self.headers.get("X-Paperfield-Storage", "")
                    effective_mode = compact_text(storage_mode).lower() or SETTINGS.get()["pdf_storage_mode"]
                    if (
                        CLOUD.shared_library
                        and effective_mode in {"cloud", "hybrid"}
                        and self.headers.get("X-Paperfield-Share-Confirmed", "") != "1"
                    ):
                        raise ValueError("上传到共享云端前，请确认你有权共享这份 PDF")
                    self.send_json(ASSETS.import_pdf(paper, self.read_binary(), filename, storage_mode), 201)
                except (OSError, TypeError, ValueError) as error:
                    self.send_json({"error": str(error)}, 400)
                return
            if action == "archive":
                payload = self.read_json()
                try:
                    asset = STORE.get_asset(paper_id) or {}
                    if (
                        CLOUD.shared_library
                        and str(asset.get("provider", "")).startswith("手动导入")
                        and not bool(payload.get("share_confirmed"))
                    ):
                        raise ValueError("上传到共享云端前，请确认你有权共享这份 PDF")
                    self.send_json(ASSETS.archive_to_cloud(paper_id, bool(payload.get("remove_local", True))))
                except Exception as error:
                    self.send_json({"error": str(error)}, 503)
                return
            if action == "resolve":
                payload = self.read_json()
                try:
                    self.send_json(ASSETS.prepare(paper, bool(payload.get("force")), str(payload.get("storage", ""))))
                except (RuntimeError, ValueError) as error:
                    self.send_json({"error": str(error)}, 400)
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
                READING_ARCHIVE.backup_paper_async(paper_id)
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
            READING_ARCHIVE.backup_paper_async(paper_id)
            self.send_json(explanation)
            return
        self.send_json({"error": "接口不存在"}, 404)


def main() -> None:
    parser = argparse.ArgumentParser(description="Paperfield local research client")
    parser.add_argument("--host", default=os.environ.get("PAPERFIELD_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PAPERFIELD_PORT", "8765")))
    parser.add_argument("--refresh", action="store_true", help="refresh data and exit")
    args = parser.parse_args()
    AUTH.validate_startup()
    seed_if_empty()
    STORE.recalculate_quality(CLASSIFIER)
    if args.refresh:
        print(json.dumps(refresh_all(), ensure_ascii=False, indent=2))
        return
    if os.environ.get("PAPERFIELD_AUTO_REFRESH", "1").strip() != "0":
        threading.Thread(target=scheduler_loop, daemon=True, name="refresh-scheduler").start()
    WEEKLY_PREPARATION.start()
    READING_ARCHIVE.backup_existing_async()
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
