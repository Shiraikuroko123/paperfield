from __future__ import annotations

import argparse
import base64
import binascii
import contextlib
import functools
import hashlib
import hmac
import ipaddress
import json
import mimetypes
import os
import re
import sqlite3
import threading
import time
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

try:
    from .schema_validation import SchemaValidationError, validate_json_schema
    from .curriculum import (
        COURSE_VENDOR_ROOT,
        build_curriculum,
        load_course_lesson,
        resolve_course_asset_path,
    )
except ImportError:
    from schema_validation import SchemaValidationError, validate_json_schema
    from curriculum import COURSE_VENDOR_ROOT, build_curriculum, load_course_lesson, resolve_course_asset_path


PACKAGE_DIR = Path(__file__).resolve().parent
ROOT = PACKAGE_DIR.parents[1]
STATIC_DIR = PACKAGE_DIR / "static"
DEFAULT_LOCAL_DIR = ROOT / "local" / "atlas"
DEFAULT_DB_PATH = DEFAULT_LOCAL_DIR / "atlas.db"
ANALYSIS_STAGE_SCHEMA = json.loads(
    (PACKAGE_DIR / "schemas" / "analysis-stage-complete.schema.json").read_text(encoding="utf-8")
)
APP_VERSION = "0.17.4"
SCHEMA_VERSION = 16
SCHEMA_MIGRATION_SPECS = {
    8: ("phase5_private_research_loop", "phase5-v8-20260812"),
    9: ("phase6_reproducible_workspace", "phase6-v9-20260812"),
    10: ("phase7_idempotent_workspace_operations", "phase7-v10-20260812"),
    11: ("phase7_linear_research_view_runs", "phase7-v11-20260812"),
    12: ("phase8_claim_lineage_and_threads", "phase8-v12-20260813"),
    13: ("phase8_claim_owner_and_integrity", "phase8-v13-20260813"),
    14: ("phase8_owner_claim_identity_and_evaluation", "phase8-v14-20260813"),
    15: ("phase8_publication_and_evaluation_integrity", "phase8-v15-20260813"),
    16: ("phase9_owner_scoped_learning_progress", "phase9-v16-20260813"),
}
MAX_JSON_BYTES = 1024 * 1024
RESEARCH_IMPORT_MAX_JSON_BYTES = 64 * 1024 * 1024
RESEARCH_DATA_SCHEMA_VERSION = 2
SEARCH_MAX_LIMIT = 100
SEARCH_MAX_CURSOR_BYTES = 2048
SEARCH_SNAPSHOT_TTL_SECONDS = 30 * 60
SEARCH_SNAPSHOT_MAX_ITEMS = 50_000
SEARCH_SNAPSHOT_MAX_ACTIVE_PER_OWNER = 4
SEARCH_SNAPSHOT_MAX_TOTAL_ITEMS_PER_OWNER = 100_000
RESEARCH_VIEW_KINDS = {"search", "radar", "focus"}
RESEARCH_VIEW_MAX_PER_OWNER = 100
RESEARCH_VIEW_RUN_MAX_ITEMS = 200
NOTIFICATION_KINDS = {"published_signal", "reviewed_relationship", "paper_lead", "first_party_lead"}
PROVENANCE_BUNDLE_VERSION = 1
PROVENANCE_BUNDLE_MAX_PAPERS = 100
IDEMPOTENCY_KEY_MAX_LENGTH = 200
IDEMPOTENCY_OPERATION_KINDS = {
    "research_view_run",
    "provenance_bundle",
    "claim_import",
    "claim_candidate",
    "claim_cluster",
    "claim_membership",
    "research_thread",
    "thread_revision",
    "claim_evaluation",
}
BACKUP_MANIFEST_VERSION = 1
BACKUP_MAX_BYTES = 16 * 1024 * 1024 * 1024
ANALYSIS_STAGES = (
    ("structure", "结构解析"),
    ("claims", "主张抽取"),
    ("method", "方法拆解"),
    ("math", "数学重构"),
    ("experiments", "实验审计"),
    ("code", "代码映射"),
    ("lineage", "相关工作检索"),
    ("critique", "批判审阅"),
    ("citations", "引证核查"),
)
ANALYSIS_STAGE_KEYS = {key for key, _label in ANALYSIS_STAGES}
TASK_STATUS = {"queued", "running", "paused", "partial", "failed", "completed", "cancelled"}
STAGE_STATUS = {"pending", "running", "paused", "completed", "failed", "cancelled"}
SOURCE_BASIS = {"metadata", "abstract", "fulltext", "supplementary", "code", "mixed"}
CONTENT_SOURCE_KINDS = {
    "paper_claim",
    "platform_derivation",
    "editorial_judgment",
    "insufficient_information",
}
CONFIDENCE_LEVELS = {"high", "medium", "low", "unknown"}
EVIDENCE_DIRECTIONS = {"supports", "contradicts", "qualifies"}
MATERIAL_AUTHORIZATION_MODES = {"none", "public_pdf_local", "public_pdf_external"}
EDITOR_ACCOUNT_ROLES = {"beta", "editor"}
MATERIAL_STATUS = {
    "unavailable",
    "awaiting_authorization",
    "authorized",
    "downloading",
    "downloaded",
    "parsing",
    "ready",
    "failed",
}
MATERIAL_ACTIVE_STATUS = {"downloading", "downloaded", "parsing"}
FRONTIER_RUN_STATUS = {"running", "completed", "partial", "failed"}
FRONTIER_REVIEW_STATUS = {"unreviewed", "promoted", "dismissed"}
FRONTIER_UPDATE_SOURCE_KINDS = {"first_party"}
FRONTIER_TERM_KINDS = {"coined_name", "defined_acronym"}
FRONTIER_SIGNAL_STATUS = {"draft", "published", "retracted"}
FRONTIER_SIGNAL_TYPES = {
    "terminology_shift",
    "research_question",
    "method_change",
    "benchmark",
    "replication",
    "artifact_release",
}
FRONTIER_SIGNAL_MATURITY = {"candidate", "emerging", "validated", "contested", "stable", "cooling"}
FRONTIER_SIGNAL_DOMAINS = {"embodied", "llm", "cross"}
FRONTIER_SIGNAL_EVIDENCE_ROLES = {
    "naming_context",
    "definition",
    "representative",
    "replication",
    "contradiction",
    "latest_progress",
}
FOCUS_ENTITY_KINDS = {"method", "problem", "thread"}
SAVED_ITEM_KINDS = {"paper", "project", "signal", "term", "method", "problem", "thread"}
LEARNING_STATUSES = {"not_started", "queued", "learning", "review", "mastered"}
DIGEST_TYPES = {"public", "private"}
BATCH_KINDS = {
    "l1_structure",
    "l2_anchor",
    "coverage_scan",
    "recompute",
}
BATCH_STATUS = {
    "queued",
    "previewing",
    "previewed",
    "running",
    "paused",
    "partial",
    "completed",
    "failed",
    "cancelled",
}
BATCH_ITEM_STATUS = {
    "pending",
    "running",
    "proposed",
    "approved",
    "rejected",
    "completed",
    "failed",
    "skipped",
}
EDITOR_ENTITY_KINDS = {"paper", "project", "term", "method", "problem", "thread"}
EDITOR_ENTITY_STATUS = {"candidate", "active", "merged", "retired"}
EDITOR_RELATION_TYPES = {
    "extends",
    "uses",
    "compares",
    "replicates",
    "contradicts",
    "qualifies",
    "surveys",
    "implements",
    "related_to",
}
EDITOR_RELATION_STATUS = {"candidate", "active", "rejected", "retired"}
EDITOR_BATCH_MAX_ITEMS = 500
EDITOR_AUDIT_ACTIONS = {
    "batch_created",
    "batch_previewed",
    "batch_applied",
    "batch_paused",
    "batch_resumed",
    "batch_cancelled",
    "batch_retried",
    "batch_item_proposed",
    "batch_item_approved",
    "batch_item_rejected",
    "batch_item_failed",
    "entity_created",
    "entity_updated",
    "entity_merged",
    "alias_added",
    "relationship_created",
    "relationship_updated",
    "relationship_retired",
    "coverage_recomputed",
    "paperfield_sync",
    "saved_item_created",
    "saved_item_updated",
    "saved_item_deleted",
    "focus_profile_updated",
    "digest_created",
    "atlas_backup_created",
    "atlas_imported",
    "learning_progress_updated",
    "research_view_created",
    "research_view_updated",
    "research_view_deleted",
    "research_view_run_created",
    "notification_read",
    "provenance_bundle_exported",
    "paper_context_exported",
    "claims_imported",
    "claim_candidate_created",
    "claim_candidate_reviewed",
    "claim_cluster_created",
    "claim_membership_created",
    "claim_membership_reviewed",
    "research_thread_created",
    "thread_revision_created",
    "thread_revision_published",
    "thread_revision_retracted",
    "thread_revision_rolled_back",
    "claim_evaluation_created",
    "claim_golden_item_created",
    "research_thread_exported",
}
CLAIM_SOURCE_KINDS = CONTENT_SOURCE_KINDS
CLAIM_RELATION_TYPES = {"supports", "extends", "narrows", "reproduces", "contradicts", "unclear"}
CLAIM_REVIEW_STATUS = {"pending", "approved", "rejected"}
CLAIM_CLUSTER_STATUS = {"candidate", "active", "retired"}
THREAD_REVISION_STATUS = {"draft", "published", "retracted"}
THREAD_CLAIM_ROLES = {"definition", "foundation", "representative", "benchmark", "replication", "counter_evidence", "latest_progress"}
CLAIM_EVAL_DOMAINS = {"llm", "embodied"}
EVIDENCE_LOCATOR_FIELDS = ("page", "section", "figure", "table", "equation", "quote")
DEFAULT_LEASE_SECONDS = 300
MIN_LEASE_SECONDS = 60
MAX_LEASE_SECONDS = 1800

# Paperfield catalog sync is deliberately bounded per pass.  A fresh Atlas
# database can therefore catch up in the background without monopolising the
# Paperfield HTTP worker or delaying the public UI.
PAPERFIELD_SYNC_DEFAULT_INTERVAL_SECONDS = 15
PAPERFIELD_SYNC_DEFAULT_MAX_PAGES = 12
PAPERFIELD_SYNC_PAGE_LIMIT = 500


@functools.lru_cache(maxsize=2)
def _curriculum_reference_index(track_id: str = "") -> dict[str, list[dict[str, Any]]]:
    """Index curated course chapters by canonical paper reference."""
    payload = build_curriculum(track_id)
    index: dict[str, list[dict[str, Any]]] = {}
    for track in payload.get("tracks", []):
        for module in track.get("modules", []):
            for chapter in module.get("chapters", []):
                chapter_context = {
                    "track_id": track.get("id", ""),
                    "track_title": track.get("title", ""),
                    "module_id": module.get("id", ""),
                    "module_title": module.get("title", ""),
                    "chapter_id": chapter.get("id", ""),
                    "chapter_code": chapter.get("code", ""),
                    "chapter_title": chapter.get("title", ""),
                    "chapter_status": chapter.get("status", ""),
                    "prerequisites": list(chapter.get("prerequisites") or []),
                    "course_lessons": list(chapter.get("course_lessons") or []),
                    "concepts": list(chapter.get("concepts") or []),
                    "frontier_queries": list(chapter.get("frontier_queries") or []),
                }
                for paper in chapter.get("papers", []):
                    reference = compact_text(paper.get("ref"), 500)
                    if not reference:
                        continue
                    index.setdefault(reference, []).append(
                        {
                            **chapter_context,
                            "paper_role": compact_text(paper.get("role"), 200),
                            "paper_evidence_status": compact_text(paper.get("evidence_status"), 80),
                        }
                    )
    return index


@functools.lru_cache(maxsize=1)
def _curriculum_chapter_index() -> dict[str, dict[str, Any]]:
    """Flatten the versioned curriculum into a stable chapter lookup."""
    payload = build_curriculum()
    index: dict[str, dict[str, Any]] = {}
    for track in payload.get("tracks", []):
        for module in track.get("modules", []):
            for chapter in module.get("chapters", []):
                item = dict(chapter)
                item["track_id"] = track.get("id", "")
                item["track_title"] = track.get("title", "")
                item["module_id"] = module.get("id", "")
                item["module_title"] = module.get("title", "")
                index[str(chapter.get("id", ""))] = item
    return index


def curriculum_context_for_paper(reference: Any) -> dict[str, Any]:
    ref = compact_text(reference, 500)
    chapters = _curriculum_reference_index().get(ref, []) if ref else []
    return {
        "matched": bool(chapters),
        "paper_ref": ref,
        "chapters": chapters,
        "source": "atlas_curriculum_v1",
    }


class AtlasError(RuntimeError):
    status = HTTPStatus.BAD_REQUEST


class NotFoundError(AtlasError):
    status = HTTPStatus.NOT_FOUND


class ConflictError(AtlasError):
    status = HTTPStatus.CONFLICT


class ForbiddenError(AtlasError):
    status = HTTPStatus.FORBIDDEN


class ServiceUnavailableError(AtlasError):
    status = HTTPStatus.SERVICE_UNAVAILABLE


class UnauthorizedError(AtlasError):
    status = HTTPStatus.UNAUTHORIZED


class GoneError(AtlasError):
    status = HTTPStatus.GONE


class _ClosingSQLiteConnection(sqlite3.Connection):
    """Commit or roll back a scoped connection, then release its file handle."""

    atlas_thread_transition_allowed = False

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> bool:
        try:
            return bool(super().__exit__(exc_type, exc, traceback))
        finally:
            self.close()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_after(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).replace(microsecond=0).isoformat()


def parse_utc(value: Any) -> datetime | None:
    text = compact_text(value, 80)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def compact_text(value: Any, maximum: int = 1000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:maximum]


def clean_string_list(value: Any, item_maximum: int = 240, limit: int = 100) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = compact_text(item, item_maximum)
        key = text.casefold()
        if text and key not in seen:
            cleaned.append(text)
            seen.add(key)
        if len(cleaned) >= limit:
            break
    return cleaned


def clean_http_url(value: Any) -> str:
    text = compact_text(value, 2000)
    if not text:
        return ""
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return urllib.parse.urlunparse(parsed._replace(fragment=""))


def origin_for_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Invalid HTTP origin: {value}")
    return f"{parsed.scheme}://{parsed.netloc}"


def normalize_doi(value: Any) -> str:
    text = compact_text(value, 500).lower()
    text = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", text)
    text = re.sub(r"^doi:\s*", "", text)
    return urllib.parse.unquote(text).strip().rstrip(".")


def arxiv_id_from(value: Any) -> str:
    text = compact_text(value, 2000)
    match = re.search(
        r"(?:arxiv:\s*|arxiv\.org/(?:abs|pdf)/)?((?:\d{4}\.\d{4,5}|[a-z-]+/\d{7}))(?:v\d+)?(?:\.pdf)?(?:$|[?#])",
        text,
        flags=re.IGNORECASE,
    )
    return match.group(1).lower() if match else ""


def openreview_id_from(value: Any) -> str:
    text = compact_text(value, 2000)
    if text.lower().startswith("openreview:"):
        return text.split(":", 1)[1].strip()
    parsed = urllib.parse.urlparse(text)
    if "openreview.net" not in parsed.netloc.lower():
        return ""
    params = urllib.parse.parse_qs(parsed.query)
    return compact_text((params.get("id") or params.get("forum") or [""])[0], 240)


def normalized_title(value: Any) -> str:
    text = compact_text(value, 1000).casefold()
    text = re.sub(r"[^\w\u3400-\u9fff]+", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def paper_year(payload: dict[str, Any]) -> str:
    published = compact_text(payload.get("published"), 40)
    match = re.search(r"(?:19|20)\d{2}", published)
    return match.group(0) if match else "unknown"


def canonical_paper_ref(payload: dict[str, Any]) -> str:
    explicit = compact_text(payload.get("canonicalRef") or payload.get("canonical_ref"), 500)
    doi = normalize_doi(payload.get("doi"))
    if not doi and explicit.lower().startswith("doi:"):
        doi = normalize_doi(explicit)
    if not doi:
        for value in (payload.get("sourceUrl"), payload.get("source_url"), payload.get("pdfUrl"), payload.get("pdf_url")):
            parsed = urllib.parse.urlparse(compact_text(value, 2000))
            if "doi.org" in parsed.netloc.lower():
                doi = normalize_doi(value)
                break
    if doi:
        return f"doi:{doi}"

    for value in (
        explicit,
        payload.get("arxivId"),
        payload.get("arxiv_id"),
        payload.get("sourceUrl"),
        payload.get("source_url"),
        payload.get("pdfUrl"),
        payload.get("pdf_url"),
        payload.get("paperfieldId"),
        payload.get("paperfield_id"),
    ):
        arxiv_id = arxiv_id_from(value)
        if arxiv_id:
            return f"arxiv:{arxiv_id}"

    for value in (explicit, payload.get("openreviewId"), payload.get("sourceUrl"), payload.get("source_url")):
        openreview_id = openreview_id_from(value)
        if openreview_id:
            return f"openreview:{openreview_id}"

    if explicit and not explicit.lower().startswith("paperfield:"):
        prefix, separator, identifier = explicit.partition(":")
        if separator and re.fullmatch(r"[a-z][a-z0-9_-]{1,30}", prefix.lower()) and identifier.strip():
            return f"{prefix.lower()}:{identifier.strip()}"

    title = normalized_title(payload.get("title"))
    if title:
        digest = hashlib.sha256(f"{title}|{paper_year(payload)}".encode("utf-8")).hexdigest()[:20]
        return f"title:{paper_year(payload)}:{digest}"

    paperfield_id = compact_text(payload.get("paperfieldId") or payload.get("paperfield_id"), 500)
    if paperfield_id:
        return f"paperfield:{paperfield_id}"
    raise AtlasError("缺少可解析的论文标识或标题")


def source_version(payload: dict[str, Any]) -> str:
    explicit = compact_text(payload.get("version") or payload.get("sourceVersion") or payload.get("source_version"), 40)
    if explicit:
        return explicit
    for value in (payload.get("sourceUrl"), payload.get("source_url"), payload.get("pdfUrl"), payload.get("pdf_url")):
        match = re.search(r"v(\d+)(?:\.pdf)?(?:$|[?#])", compact_text(value, 2000), flags=re.IGNORECASE)
        if match:
            return f"v{match.group(1)}"
    return ""


def encode_search_cursor(payload: dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        raise AtlasError("cursor 数据无效")
    data = dict(payload)
    data.setdefault("v", 1)
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    envelope = {
        **data,
        "checksum": hashlib.sha256(b"research-atlas-search-cursor-v1\0" + canonical).hexdigest()[:24],
    }
    raw = json.dumps(envelope, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    if len(encoded) > SEARCH_MAX_CURSOR_BYTES:
        raise AtlasError("cursor 超过长度限制")
    return encoded


def sign_search_cursor(payload: dict[str, Any], secret: str) -> str:
    """Bind a materialized cursor to this Atlas database."""
    data = {key: payload[key] for key in payload if key not in {"checksum", "signature"}}
    canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hmac.new(
        str(secret).encode("utf-8"),
        b"research-atlas-search-cursor-v2\0" + canonical,
        hashlib.sha256,
    ).hexdigest()


def decode_search_cursor(value: Any) -> dict[str, Any]:
    raw_value = str(value or "")
    if len(raw_value) > SEARCH_MAX_CURSOR_BYTES:
        raise AtlasError("cursor 超过长度限制")
    text = raw_value.strip()
    if not text:
        return {}
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,2048}", text):
        raise AtlasError("cursor 格式无效")
    try:
        padded = text + "=" * (-len(text) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (binascii.Error, ValueError, TypeError, UnicodeError, json.JSONDecodeError) as error:
        raise AtlasError("cursor 格式无效") from error
    if not isinstance(payload, dict) or payload.get("v") != 1:
        raise AtlasError("cursor 版本不受支持")
    if not all(key in payload for key in ("fingerprint", "date", "kind", "ref", "checksum")):
        raise AtlasError("cursor 缺少排序锚点")
    # Validate the checksum over every field except the checksum itself.  The
    # first cursor format only had the ordering tuple; later cursors add a
    # snapshot watermark and per-kind row caps.  Hashing all fields keeps the
    # extension backwards compatible while preventing an attacker from
    # changing an unrecognised cursor field without detection.
    data = {key: payload[key] for key in payload if key != "checksum"}
    expected = hashlib.sha256(
        b"research-atlas-search-cursor-v1\0"
        + json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:24]
    checksum = payload.get("checksum")
    if not isinstance(checksum, str) or not hmac.compare_digest(checksum, expected):
        raise AtlasError("cursor 校验失败")
    if not isinstance(payload.get("fingerprint"), str) or not re.fullmatch(r"[a-f0-9]{24}", payload["fingerprint"]):
        raise AtlasError("cursor fingerprint 无效")
    if not isinstance(payload.get("date"), str) or len(payload["date"]) > 80:
        raise AtlasError("cursor 日期无效")
    if "watermark" in payload and (
        not isinstance(payload["watermark"], str) or len(payload["watermark"]) > 80
    ):
        raise AtlasError("cursor watermark is invalid")
    for key in ("paper_max_id", "project_max_rowid"):
        if key in payload:
            value = payload[key]
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise AtlasError(f"cursor {key} is invalid")
            # SQLite rowids and INTEGER PRIMARY KEY values are signed 64-bit.
            if value > 9_223_372_036_854_775_807:
                raise AtlasError(f"cursor {key} is invalid")
    if payload.get("kind") not in {"paper", "project"}:
        raise AtlasError("cursor kind 无效")
    if not isinstance(payload.get("ref"), str) or not payload["ref"] or len(payload["ref"]) > 500:
        raise AtlasError("cursor 排序引用无效")
    if "snapshot_id" in payload:
        snapshot_id = payload.get("snapshot_id")
        if not isinstance(snapshot_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", snapshot_id):
            raise AtlasError("cursor snapshot_id is invalid")
        position = payload.get("position")
        if isinstance(position, bool) or not isinstance(position, int) or position < 0:
            raise AtlasError("cursor position is invalid")
        if not isinstance(payload.get("expires_at"), str) or parse_utc(payload["expires_at"]) is None:
            raise AtlasError("cursor expires_at is invalid")
        signature = payload.get("signature")
        if not isinstance(signature, str) or not re.fullmatch(r"[a-f0-9]{64}", signature):
            raise AtlasError("cursor signature is invalid")
    return payload


def search_fingerprint(
    query: str,
    kinds: list[str],
    domains: list[str],
    statuses: list[str],
) -> str:
    canonical = json.dumps(
        {
            "query": compact_text(query, 300).casefold(),
            "kinds": sorted(kinds),
            "domains": sorted(domains),
            "statuses": sorted(statuses),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]


def clean_multiline_text(value: Any, maximum: int = 20000) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:maximum]


def normalize_evidence_items(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise AtlasError("evidence 必须是数组")
    result: list[dict[str, Any]] = []
    for raw in value[:50]:
        if not isinstance(raw, dict):
            raise AtlasError("evidence 条目必须是对象")
        page_value = raw.get("page")
        page: int | None = None
        if page_value is not None and page_value != "":
            try:
                page = int(page_value)
            except (TypeError, ValueError) as error:
                raise AtlasError("证据页码必须是整数") from error
            if page < 1 or page > 10000:
                raise AtlasError("证据页码超出有效范围")
        direction = compact_text(raw.get("direction") or "supports", 20)
        if direction not in EVIDENCE_DIRECTIONS:
            raise AtlasError("证据方向必须是 supports、contradicts 或 qualifies")
        item = {
            "label": compact_text(raw.get("label"), 300),
            "page": page,
            "section": compact_text(raw.get("section"), 300),
            "figure": compact_text(raw.get("figure"), 120),
            "table": compact_text(raw.get("table") or raw.get("table_no"), 120),
            "quote": clean_multiline_text(raw.get("quote") or raw.get("quote_text"), 4000),
            "source_url": clean_http_url(raw.get("sourceUrl") or raw.get("source_url")),
            "direction": direction,
        }
        if not any(item[key] for key in ("page", "section", "figure", "table", "quote", "source_url")):
            raise AtlasError("证据必须包含页码、章节、图表、引文或来源链接")
        result.append(item)
    return result


def normalize_stage_content(
    stage_key: str,
    value: Any,
    source_basis: str = "metadata",
    source_sha256: str = "",
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AtlasError("阶段结果 content 必须是对象")
    summary = clean_multiline_text(value.get("summary"), 12000)
    raw_sections = value.get("sections")
    if not isinstance(raw_sections, list) or not raw_sections:
        raise AtlasError("阶段结果至少需要一个 sections 条目")
    sections: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_sections[:60], start=1):
        if not isinstance(raw, dict):
            raise AtlasError("sections 条目必须是对象")
        title = compact_text(raw.get("title"), 300) or f"分析条目 {index}"
        body = clean_multiline_text(raw.get("body"), 30000)
        if not body:
            raise AtlasError("分析条目正文不能为空")
        source_kind = compact_text(raw.get("sourceKind") or raw.get("source_kind"), 40)
        if source_kind not in CONTENT_SOURCE_KINDS:
            raise AtlasError("分析条目必须声明有效的 sourceKind")
        confidence = compact_text(raw.get("confidence") or "unknown", 20)
        if confidence not in CONFIDENCE_LEVELS:
            raise AtlasError("confidence 必须是 high、medium、low 或 unknown")
        evidence = normalize_evidence_items(raw.get("evidence"))
        if source_kind in {"paper_claim", "platform_derivation"} and not evidence:
            raise AtlasError("论文主张与平台推导必须附带证据定位")
        claim_seed = json.dumps(
            {
                "stage": stage_key,
                "title": title,
                "body": body,
                "source_kind": source_kind,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        claim_id = f"claim-{hashlib.sha256(claim_seed.encode('utf-8')).hexdigest()[:20]}"
        normalized_evidence: list[dict[str, Any]] = []
        for evidence_index, item in enumerate(evidence, start=1):
            evidence_seed = json.dumps(
                {"claim_id": claim_id, "position": evidence_index, **item},
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            normalized_evidence.append(
                {
                    **item,
                    "evidence_id": f"evidence-{hashlib.sha256(evidence_seed.encode('utf-8')).hexdigest()[:20]}",
                    "source_type": source_basis,
                    "source_sha256": source_sha256,
                    "locator_complete": bool(
                        item.get("page")
                        or item.get("section")
                        or item.get("figure")
                        or item.get("table")
                    ),
                }
            )
        sections.append(
            {
                "claim_id": claim_id,
                "title": title,
                "body": body,
                "source_kind": source_kind,
                "confidence": confidence,
                "evidence": normalized_evidence,
            }
        )
    return {
        "schema_version": 2,
        "stage": stage_key,
        "summary": summary,
        "sections": sections,
    }


class AtlasStore:
    def __init__(self, path: Path) -> None:
        self.path = path.expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._preflight_existing_schema()
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.path,
            timeout=30,
            factory=_ClosingSQLiteConnection,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.create_function(
            "atlas_thread_transition_allowed",
            0,
            lambda: int(bool(connection.atlas_thread_transition_allowed)),
        )
        return connection

    @staticmethod
    @contextlib.contextmanager
    def _allow_thread_transition(db: sqlite3.Connection):
        previous = bool(getattr(db, "atlas_thread_transition_allowed", False))
        db.atlas_thread_transition_allowed = True
        try:
            yield
        finally:
            db.atlas_thread_transition_allowed = previous

    def close(self) -> None:
        """Release any store-owned resources; request connections are scoped."""
        return None

    @staticmethod
    def _migration_rows_are_valid(rows: list[sqlite3.Row], current: int) -> None:
        expected = {version: spec for version, spec in SCHEMA_MIGRATION_SPECS.items() if version <= current}
        grouped: dict[int, list[sqlite3.Row]] = {}
        for row in rows:
            try:
                version = int(row["version"])
            except (TypeError, ValueError) as error:
                raise AtlasError("Atlas schema_migrations contains an invalid version") from error
            grouped.setdefault(version, []).append(row)
        unknown = sorted(set(grouped) - set(expected))
        missing = sorted(set(expected) - set(grouped))
        duplicates = sorted(version for version, items in grouped.items() if len(items) != 1)
        if unknown:
            raise AtlasError(f"Atlas schema_migrations contains unexpected versions: {unknown}")
        if missing:
            raise AtlasError(f"Atlas schema_migrations is missing versions: {missing}")
        if duplicates:
            raise AtlasError(f"Atlas schema_migrations contains duplicate versions: {duplicates}")
        for version, (expected_name, expected_checksum) in expected.items():
            row = grouped[version][0]
            if (
                row["name"] != expected_name
                or row["checksum"] != expected_checksum
                or not isinstance(row["applied_at"], str)
                or not row["applied_at"].strip()
            ):
                raise AtlasError(f"Atlas schema migration v{version} metadata does not match this build")

    @classmethod
    def _validate_migration_ledger(cls, db: sqlite3.Connection, current: int) -> None:
        table = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ).fetchone()
        expected = any(version <= current for version in SCHEMA_MIGRATION_SPECS)
        if table is None:
            if expected:
                raise AtlasError("Atlas schema_migrations table is missing")
            return
        try:
            rows = db.execute(
                "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version"
            ).fetchall()
        except sqlite3.DatabaseError as error:
            raise AtlasError("Atlas schema_migrations table is invalid") from error
        cls._migration_rows_are_valid(rows, current)

    def _preflight_existing_schema(self) -> None:
        """Reject incompatible databases before any write-capable connection."""
        if not self.path.is_file():
            return
        uri = f"{self.path.as_uri()}?mode=ro"
        try:
            connection = sqlite3.connect(uri, uri=True, timeout=5)
            connection.row_factory = sqlite3.Row
            try:
                metadata = connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_metadata'"
                ).fetchone()
                if metadata is None:
                    return
                row = connection.execute(
                    "SELECT value FROM app_metadata WHERE key='schema_version'"
                ).fetchone()
                if row is None:
                    return
                try:
                    current = int(row["value"])
                except (TypeError, ValueError) as error:
                    raise AtlasError("Atlas schema_version is invalid") from error
                if current > SCHEMA_VERSION:
                    raise AtlasError(
                        f"Atlas database version {current} 高于当前程序支持的版本 {SCHEMA_VERSION}"
                    )
                self._validate_migration_ledger(connection, current)
            finally:
                connection.close()
        except AtlasError:
            raise
        except sqlite3.DatabaseError as error:
            raise AtlasError("Atlas database schema preflight failed") from error

    @staticmethod
    def _ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @staticmethod
    def _migrate_v7_to_v8(db: sqlite3.Connection) -> None:
        statements = (
            """
            CREATE TABLE IF NOT EXISTS paperfield_sync_runs (
                id TEXT PRIMARY KEY,
                source_url TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                cursor_before INTEGER NOT NULL DEFAULT 0,
                cursor_after INTEGER NOT NULL DEFAULT 0,
                source_watermark INTEGER NOT NULL DEFAULT 0,
                source_schema_version INTEGER NOT NULL DEFAULT 0,
                fetched_count INTEGER NOT NULL DEFAULT 0,
                created_count INTEGER NOT NULL DEFAULT 0,
                updated_count INTEGER NOT NULL DEFAULT 0,
                deleted_count INTEGER NOT NULL DEFAULT 0,
                unchanged_count INTEGER NOT NULL DEFAULT 0,
                actor TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT '',
                source_sha256 TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL,
                finished_at TEXT,
                error_text TEXT NOT NULL DEFAULT ''
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS paperfield_sync_objects (
                object_kind TEXT NOT NULL,
                external_id TEXT NOT NULL,
                canonical_ref TEXT NOT NULL DEFAULT '',
                payload_sha256 TEXT NOT NULL DEFAULT '',
                source_sequence INTEGER NOT NULL DEFAULT 0,
                deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(object_kind, external_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sync_checkpoints (
                source_key TEXT PRIMARY KEY,
                cursor_value INTEGER NOT NULL DEFAULT 0,
                source_watermark INTEGER NOT NULL DEFAULT 0,
                source_schema_version INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS focus_profiles (
                owner_id TEXT PRIMARY KEY,
                domains_json TEXT NOT NULL DEFAULT '[]',
                keywords_json TEXT NOT NULL DEFAULT '[]',
                source_keys_json TEXT NOT NULL DEFAULT '[]',
                method_ids_json TEXT NOT NULL DEFAULT '[]',
                problem_ids_json TEXT NOT NULL DEFAULT '[]',
                thread_ids_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS saved_items (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                item_kind TEXT NOT NULL,
                item_ref TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(owner_id, item_kind, item_ref)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_digests (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                digest_type TEXT NOT NULL DEFAULT 'private',
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                as_of TEXT NOT NULL DEFAULT '',
                scope_json TEXT NOT NULL DEFAULT '{}',
                source_snapshot_json TEXT NOT NULL DEFAULT '{}',
                content_json TEXT NOT NULL DEFAULT '{}',
                markdown TEXT NOT NULL DEFAULT '',
                source_sha256 TEXT NOT NULL,
                previous_digest_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT '',
                UNIQUE(owner_id, digest_type, period_start, period_end, as_of, source_sha256),
                FOREIGN KEY(previous_digest_id) REFERENCES research_digests(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS atlas_backup_runs (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                manifest_json TEXT NOT NULL DEFAULT '{}',
                database_sha256 TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON paperfield_sync_runs(started_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_sync_objects_sequence ON paperfield_sync_objects(source_sequence)",
            "CREATE INDEX IF NOT EXISTS idx_saved_items_owner ON saved_items(owner_id, updated_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_digests_owner_period ON research_digests(owner_id, digest_type, period_end DESC)",
            "CREATE INDEX IF NOT EXISTS idx_backup_runs_created ON atlas_backup_runs(created_at DESC)",
        )
        for statement in statements:
            db.execute(statement)

    @staticmethod
    def _migrate_v8_to_v9(db: sqlite3.Connection) -> None:
        statements = (
            """
            CREATE TABLE IF NOT EXISTS search_snapshots (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                query_json TEXT NOT NULL,
                watermark TEXT NOT NULL,
                paper_max_id INTEGER NOT NULL DEFAULT 0,
                project_max_rowid INTEGER NOT NULL DEFAULT 0,
                result_count INTEGER NOT NULL,
                result_sha256 TEXT NOT NULL,
                max_items INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_accessed_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS search_snapshot_items (
                snapshot_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                item_json TEXT NOT NULL,
                PRIMARY KEY(snapshot_id, position),
                FOREIGN KEY(snapshot_id) REFERENCES search_snapshots(id) ON DELETE CASCADE
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_views (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                view_kind TEXT NOT NULL,
                definition_json TEXT NOT NULL,
                evidence_boundary_json TEXT NOT NULL,
                revision INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(owner_id, name)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_view_runs (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                view_id TEXT NOT NULL,
                view_name TEXT NOT NULL,
                view_kind TEXT NOT NULL,
                view_revision INTEGER NOT NULL,
                definition_json TEXT NOT NULL,
                evidence_boundary_json TEXT NOT NULL,
                search_snapshot_id TEXT NOT NULL DEFAULT '',
                result_json TEXT NOT NULL,
                result_sha256 TEXT NOT NULL,
                run_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_notifications (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                dedupe_key TEXT NOT NULL,
                notification_kind TEXT NOT NULL,
                evidence_level TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                source_kind TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                source_revision TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                read_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(owner_id, dedupe_key)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS provenance_bundles (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                view_run_id TEXT NOT NULL,
                manifest_json TEXT NOT NULL,
                bundle_json TEXT NOT NULL,
                markdown TEXT NOT NULL,
                bundle_sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_search_snapshots_expiry ON search_snapshots(expires_at)",
            "CREATE INDEX IF NOT EXISTS idx_search_snapshots_owner ON search_snapshots(owner_id, last_accessed_at, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_research_views_owner ON research_views(owner_id, updated_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_research_view_runs_view ON research_view_runs(owner_id, view_id, run_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_owner ON research_notifications(owner_id, read_at, last_seen_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_provenance_bundles_owner ON provenance_bundles(owner_id, created_at DESC)",
        )
        for statement in statements:
            db.execute(statement)

    @staticmethod
    def _migrate_v9_to_v10(db: sqlite3.Connection) -> None:
        AtlasStore._ensure_column(db, "research_view_runs", "previous_run_id", "TEXT NOT NULL DEFAULT ''")
        AtlasStore._ensure_column(db, "research_view_runs", "delta_json", "TEXT NOT NULL DEFAULT '{}'")
        AtlasStore._ensure_column(db, "research_view_runs", "delta_sha256", "TEXT NOT NULL DEFAULT ''")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS operation_idempotency (
                owner_id TEXT NOT NULL,
                operation_kind TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                request_sha256 TEXT NOT NULL,
                resource_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(owner_id, operation_kind, idempotency_key)
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_operation_idempotency_created "
            "ON operation_idempotency(owner_id, created_at DESC)"
        )
    @classmethod
    def _sync_provenance_bundle_run_sequences(
        cls,
        db: sqlite3.Connection,
        runs: dict[tuple[str, str], dict[str, Any]],
    ) -> None:
        rows = db.execute("SELECT * FROM provenance_bundles ORDER BY rowid").fetchall()
        delta_fields = {"previous_run_id", "delta", "delta_sha256"}
        for row in rows:
            bundle = json.loads(row["bundle_json"] or "{}")
            manifest = json.loads(row["manifest_json"] or "{}")
            bundle_run = bundle.get("run")
            if not isinstance(bundle_run, dict):
                raise AtlasError(f"provenance bundle {row['id']} has no run summary")
            present_delta_fields = delta_fields.intersection(bundle_run)
            if not present_delta_fields:
                # Phase 6 bundles predate run deltas and remain byte-for-byte stable.
                continue
            if present_delta_fields != delta_fields:
                raise AtlasError(f"provenance bundle {row['id']} has a partial run delta")
            run = runs.get((row["owner_id"], row["view_run_id"]))
            if run is None:
                raise AtlasError(f"provenance bundle {row['id']} points to a missing run")
            if compact_text(bundle_run.get("result_sha256"), 64) != run["result_sha256"]:
                raise AtlasError(f"provenance bundle {row['id']} result SHA-256 is invalid")
            checked = cls.verify_provenance_bundle(
                {
                    "manifest": manifest,
                    "bundle": bundle,
                    "markdown": row["markdown"],
                    "bundle_sha256": row["bundle_sha256"],
                }
            )
            if not checked["valid"]:
                raise AtlasError(f"provenance bundle {row['id']} verification failed")

            bundle_run.update(
                {
                    "run_sequence": run["run_sequence"],
                    "previous_run_id": run["previous_run_id"],
                    "delta": run["delta"],
                    "delta_sha256": run["delta_sha256"],
                }
            )
            canonical_bundle = json.dumps(
                bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")
            bundle_sha256 = hashlib.sha256(canonical_bundle).hexdigest()
            manifest["bundle_sha256"] = bundle_sha256
            manifest["content_bytes"] = len(canonical_bundle)
            serialized_manifest = json.dumps(
                manifest,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            if (
                row["bundle_json"] == canonical_bundle.decode("utf-8")
                and row["manifest_json"] == serialized_manifest
                and row["bundle_sha256"] == bundle_sha256
            ):
                continue
            db.execute(
                """
                UPDATE provenance_bundles
                SET manifest_json=?, bundle_json=?, bundle_sha256=?
                WHERE id=?
                """,
                (
                    serialized_manifest,
                    canonical_bundle.decode("utf-8"),
                    bundle_sha256,
                    row["id"],
                ),
            )

    @classmethod
    def _backfill_research_view_run_sequences(cls, db: sqlite3.Connection) -> None:
        """Repair each owner/view into one insertion-ordered, hash-verified run chain."""
        table = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_view_runs'"
        ).fetchone()
        if table is None:
            return
        columns = {row["name"] for row in db.execute("PRAGMA table_info(research_view_runs)")}
        required = {"run_sequence", "previous_run_id", "delta_json", "delta_sha256"}
        if not required.issubset(columns):
            return

        rows = db.execute(
            """
            SELECT rowid AS insertion_order, id, owner_id, view_id, view_kind,
                   result_json, result_sha256, run_sequence,
                   previous_run_id, delta_json, delta_sha256, run_at
            FROM research_view_runs
            ORDER BY owner_id, view_id, insertion_order
            """
        ).fetchall()
        results_by_id: dict[str, dict[str, Any]] = {}
        for row in rows:
            try:
                result = json.loads(row["result_json"] or "{}")
            except (TypeError, json.JSONDecodeError) as error:
                raise AtlasError(
                    f"research view run {row['id']} has invalid result JSON"
                ) from error
            if not isinstance(result, dict):
                raise AtlasError(f"research view run {row['id']} result must be an object")
            serialized_result = json.dumps(
                result, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            result_sha256 = hashlib.sha256(serialized_result.encode("utf-8")).hexdigest()
            if not hmac.compare_digest(str(row["result_sha256"] or ""), result_sha256):
                raise AtlasError(f"research view run {row['id']} result SHA-256 is invalid")
            results_by_id[row["id"]] = result

        groups: dict[tuple[str, str], list[sqlite3.Row]] = {}
        for row in rows:
            groups.setdefault((row["owner_id"], row["view_id"]), []).append(row)

        materialized_runs: dict[tuple[str, str], dict[str, Any]] = {}
        for group_rows in groups.values():
            previous_run_id = ""
            previous_result: dict[str, Any] | None = None
            expected_rows: list[tuple[sqlite3.Row, int, str, dict[str, Any], str, str]] = []
            rewrite_required = False
            for sequence, row in enumerate(group_rows, start=1):
                delta = cls._research_run_delta(
                    row["view_kind"],
                    results_by_id[row["id"]],
                    previous_result,
                    previous_run_id,
                )
                serialized_delta = json.dumps(
                    delta, ensure_ascii=False, sort_keys=True, separators=(",", ":")
                )
                delta_sha256 = hashlib.sha256(serialized_delta.encode("utf-8")).hexdigest()
                expected_rows.append(
                    (row, sequence, previous_run_id, delta, serialized_delta, delta_sha256)
                )
                rewrite_required = rewrite_required or (
                    int(row["run_sequence"] or 0) != sequence
                    or row["previous_run_id"] != previous_run_id
                    or row["delta_json"] != serialized_delta
                    or not hmac.compare_digest(
                        str(row["delta_sha256"] or ""), delta_sha256
                    )
                )
                previous_run_id = row["id"]
                previous_result = results_by_id[row["id"]]

            if rewrite_required:
                db.executemany(
                    "UPDATE research_view_runs SET run_sequence=? WHERE id=?",
                    [
                        (-sequence, row["id"])
                        for row, sequence, _previous, _delta, _serialized, _sha
                        in expected_rows
                    ],
                )
            for row, sequence, previous_run_id, delta, serialized_delta, delta_sha256 in expected_rows:
                if rewrite_required:
                    db.execute(
                        """
                        UPDATE research_view_runs
                        SET run_sequence=?, previous_run_id=?, delta_json=?, delta_sha256=?
                        WHERE id=?
                        """,
                        (
                            sequence,
                            previous_run_id,
                            serialized_delta,
                            delta_sha256,
                            row["id"],
                        ),
                    )
                materialized_runs[(row["owner_id"], row["id"])] = {
                    "run_sequence": sequence,
                    "previous_run_id": previous_run_id,
                    "delta": delta,
                    "delta_sha256": delta_sha256,
                    "result_sha256": row["result_sha256"],
                }

        cls._sync_provenance_bundle_run_sequences(db, materialized_runs)

    @staticmethod
    def _migrate_v10_to_v11(db: sqlite3.Connection) -> None:
        AtlasStore._ensure_column(
            db, "research_view_runs", "run_sequence", "INTEGER NOT NULL DEFAULT 0"
        )
        db.execute("DROP INDEX IF EXISTS idx_research_view_runs_view")
        AtlasStore._backfill_research_view_run_sequences(db)
        db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_view_runs_sequence "
            "ON research_view_runs(owner_id, view_id, run_sequence)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_research_view_runs_view "
            "ON research_view_runs(owner_id, view_id, run_sequence DESC)"
        )

    @staticmethod
    def _migrate_v11_to_v12(db: sqlite3.Connection) -> None:
        statements = (
            """
            CREATE TABLE IF NOT EXISTS scientific_claims (
                id TEXT PRIMARY KEY,
                canonical_paper_id INTEGER NOT NULL,
                paper_version TEXT NOT NULL,
                analysis_request_id TEXT NOT NULL,
                stage_key TEXT NOT NULL,
                stage_attempt INTEGER NOT NULL,
                dossier_claim_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                statement TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                source_basis TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                insufficient_information_json TEXT NOT NULL DEFAULT '[]',
                source_sha256 TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT '',
                prompt_version TEXT NOT NULL DEFAULT '',
                claim_sha256 TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                UNIQUE(
                    canonical_paper_id, paper_version, analysis_request_id, stage_key,
                    stage_attempt, dossier_claim_id, source_sha256
                ),
                FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id),
                FOREIGN KEY(analysis_request_id) REFERENCES analysis_requests(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_candidates (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                left_claim_id TEXT NOT NULL,
                right_claim_id TEXT NOT NULL,
                proposed_relation TEXT NOT NULL,
                retrieval_score REAL,
                model_score REAL,
                generator TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                prompt_version TEXT NOT NULL DEFAULT '',
                request_sha256 TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                reviewed_relation TEXT NOT NULL DEFAULT '',
                reviewer TEXT NOT NULL DEFAULT '',
                review_reason TEXT NOT NULL DEFAULT '',
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(owner_id, left_claim_id, right_claim_id, proposed_relation, request_sha256),
                CHECK(left_claim_id <> right_claim_id),
                FOREIGN KEY(left_claim_id) REFERENCES scientific_claims(id),
                FOREIGN KEY(right_claim_id) REFERENCES scientific_claims(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_clusters (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                label TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'candidate',
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_cluster_memberships (
                id TEXT PRIMARY KEY,
                cluster_id TEXT NOT NULL,
                claim_id TEXT NOT NULL,
                candidate_id TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                reviewer TEXT NOT NULL DEFAULT '',
                review_reason TEXT NOT NULL DEFAULT '',
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(cluster_id, claim_id, candidate_id),
                FOREIGN KEY(cluster_id) REFERENCES claim_clusters(id),
                FOREIGN KEY(claim_id) REFERENCES scientific_claims(id),
                FOREIGN KEY(candidate_id) REFERENCES claim_candidates(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_threads (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                owner_id TEXT NOT NULL DEFAULT 'local',
                current_published_revision INTEGER,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_thread_revisions (
                thread_id TEXT NOT NULL,
                revision INTEGER NOT NULL,
                title TEXT NOT NULL,
                problem_statement TEXT NOT NULL,
                change_summary TEXT NOT NULL,
                why_it_matters TEXT NOT NULL,
                competing_routes_json TEXT NOT NULL DEFAULT '[]',
                counter_evidence_json TEXT NOT NULL DEFAULT '[]',
                known_unknowns_json TEXT NOT NULL DEFAULT '[]',
                representative_papers_json TEXT NOT NULL DEFAULT '[]',
                delta_json TEXT NOT NULL DEFAULT '{}',
                reviewer TEXT NOT NULL DEFAULT '',
                review_reason TEXT NOT NULL DEFAULT '',
                content_sha256 TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TEXT NOT NULL,
                published_at TEXT,
                retracted_at TEXT,
                PRIMARY KEY(thread_id, revision),
                UNIQUE(thread_id, content_sha256),
                FOREIGN KEY(thread_id) REFERENCES research_threads(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_thread_claims (
                thread_id TEXT NOT NULL,
                revision INTEGER NOT NULL,
                position INTEGER NOT NULL,
                claim_id TEXT NOT NULL,
                cluster_id TEXT NOT NULL,
                membership_id TEXT NOT NULL,
                role TEXT NOT NULL,
                PRIMARY KEY(thread_id, revision, position),
                UNIQUE(thread_id, revision, claim_id, role),
                FOREIGN KEY(thread_id, revision) REFERENCES research_thread_revisions(thread_id, revision),
                FOREIGN KEY(claim_id) REFERENCES scientific_claims(id),
                FOREIGN KEY(cluster_id) REFERENCES claim_clusters(id),
                FOREIGN KEY(membership_id) REFERENCES claim_cluster_memberships(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS research_thread_relations (
                thread_id TEXT NOT NULL,
                revision INTEGER NOT NULL,
                position INTEGER NOT NULL,
                candidate_id TEXT NOT NULL,
                left_claim_id TEXT NOT NULL,
                right_claim_id TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                PRIMARY KEY(thread_id, revision, position),
                UNIQUE(thread_id, revision, candidate_id),
                FOREIGN KEY(thread_id, revision) REFERENCES research_thread_revisions(thread_id, revision),
                FOREIGN KEY(candidate_id) REFERENCES claim_candidates(id),
                FOREIGN KEY(left_claim_id) REFERENCES scientific_claims(id),
                FOREIGN KEY(right_claim_id) REFERENCES scientific_claims(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_golden_items (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                left_claim_id TEXT NOT NULL,
                right_claim_id TEXT NOT NULL,
                expected_cluster INTEGER NOT NULL,
                expected_relation TEXT NOT NULL,
                expected_locators_json TEXT NOT NULL DEFAULT '[]',
                reviewer TEXT NOT NULL,
                review_reason TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(left_claim_id) REFERENCES scientific_claims(id),
                FOREIGN KEY(right_claim_id) REFERENCES scientific_claims(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_eval_runs (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                model TEXT NOT NULL DEFAULT '',
                prompt_version TEXT NOT NULL DEFAULT '',
                code_version TEXT NOT NULL DEFAULT '',
                input_sha256 TEXT NOT NULL,
                cost REAL NOT NULL DEFAULT 0,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                abstention_count INTEGER NOT NULL DEFAULT 0,
                item_count INTEGER NOT NULL DEFAULT 0,
                metrics_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_eval_results (
                run_id TEXT NOT NULL,
                golden_item_id TEXT NOT NULL,
                predicted_cluster INTEGER,
                predicted_relation TEXT NOT NULL DEFAULT '',
                locator_complete INTEGER NOT NULL DEFAULT 0,
                abstained INTEGER NOT NULL DEFAULT 0,
                reviewer_agreement REAL,
                PRIMARY KEY(run_id, golden_item_id),
                FOREIGN KEY(run_id) REFERENCES claim_eval_runs(id),
                FOREIGN KEY(golden_item_id) REFERENCES claim_golden_items(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claim_import_runs (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                analysis_request_id TEXT NOT NULL,
                request_sha256 TEXT NOT NULL,
                response_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(analysis_request_id) REFERENCES analysis_requests(id)
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_scientific_claims_paper ON scientific_claims(canonical_paper_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_claim_candidates_owner_status ON claim_candidates(owner_id, status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_claim_memberships_cluster ON claim_cluster_memberships(cluster_id, status, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_thread_revisions_status ON research_thread_revisions(status, published_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_claim_eval_runs_owner ON claim_eval_runs(owner_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_claim_import_runs_owner ON claim_import_runs(owner_id, created_at DESC)",
            """
            CREATE TRIGGER IF NOT EXISTS scientific_claims_immutable_update
            BEFORE UPDATE ON scientific_claims BEGIN
                SELECT RAISE(ABORT, 'scientific claims are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS scientific_claims_immutable_delete
            BEFORE DELETE ON scientific_claims BEGIN
                SELECT RAISE(ABORT, 'scientific claims are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS reviewed_claim_candidates_immutable_update
            BEFORE UPDATE ON claim_candidates
            WHEN OLD.status IN ('approved','rejected') BEGIN
                SELECT RAISE(ABORT, 'reviewed claim candidates are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS reviewed_claim_candidates_immutable_delete
            BEFORE DELETE ON claim_candidates
            WHEN OLD.status IN ('approved','rejected') BEGIN
                SELECT RAISE(ABORT, 'reviewed claim candidates are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS reviewed_claim_memberships_immutable_update
            BEFORE UPDATE ON claim_cluster_memberships
            WHEN OLD.status IN ('approved','rejected') BEGIN
                SELECT RAISE(ABORT, 'reviewed claim memberships are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS reviewed_claim_memberships_immutable_delete
            BEFORE DELETE ON claim_cluster_memberships
            WHEN OLD.status IN ('approved','rejected') BEGIN
                SELECT RAISE(ABORT, 'reviewed claim memberships are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_revision_immutable_update
            BEFORE UPDATE ON research_thread_revisions
            WHEN OLD.status='retracted'
              OR (
                OLD.status='published' AND NOT (
                    NEW.status='retracted'
                    AND NEW.thread_id IS OLD.thread_id
                    AND NEW.revision IS OLD.revision
                    AND NEW.title IS OLD.title
                    AND NEW.problem_statement IS OLD.problem_statement
                    AND NEW.change_summary IS OLD.change_summary
                    AND NEW.why_it_matters IS OLD.why_it_matters
                    AND NEW.competing_routes_json IS OLD.competing_routes_json
                    AND NEW.counter_evidence_json IS OLD.counter_evidence_json
                    AND NEW.known_unknowns_json IS OLD.known_unknowns_json
                    AND NEW.representative_papers_json IS OLD.representative_papers_json
                    AND NEW.delta_json IS OLD.delta_json
                    AND NEW.reviewer IS OLD.reviewer
                    AND NEW.review_reason IS OLD.review_reason
                    AND NEW.content_sha256 IS OLD.content_sha256
                    AND NEW.created_at IS OLD.created_at
                    AND NEW.published_at IS OLD.published_at
                    AND NEW.retracted_at IS NOT NULL
                )
              ) BEGIN
                SELECT RAISE(ABORT, 'published thread revisions are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_claims_immutable_insert
            BEFORE INSERT ON research_thread_claims
            WHEN EXISTS (
                SELECT 1 FROM research_thread_revisions r
                WHERE r.thread_id=NEW.thread_id AND r.revision=NEW.revision
                  AND r.status IN ('published','retracted')
            ) BEGIN SELECT RAISE(ABORT, 'published thread claims are immutable'); END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_claims_immutable_update
            BEFORE UPDATE ON research_thread_claims
            WHEN EXISTS (
                SELECT 1 FROM research_thread_revisions r
                WHERE r.thread_id=OLD.thread_id AND r.revision=OLD.revision
                  AND r.status IN ('published','retracted')
            ) BEGIN SELECT RAISE(ABORT, 'published thread claims are immutable'); END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_claims_immutable_delete
            BEFORE DELETE ON research_thread_claims
            WHEN EXISTS (
                SELECT 1 FROM research_thread_revisions r
                WHERE r.thread_id=OLD.thread_id AND r.revision=OLD.revision
                  AND r.status IN ('published','retracted')
            ) BEGIN SELECT RAISE(ABORT, 'published thread claims are immutable'); END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_relations_immutable_insert
            BEFORE INSERT ON research_thread_relations
            WHEN EXISTS (
                SELECT 1 FROM research_thread_revisions r
                WHERE r.thread_id=NEW.thread_id AND r.revision=NEW.revision
                  AND r.status IN ('published','retracted')
            ) BEGIN SELECT RAISE(ABORT, 'published thread relations are immutable'); END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_relations_immutable_update
            BEFORE UPDATE ON research_thread_relations
            WHEN EXISTS (
                SELECT 1 FROM research_thread_revisions r
                WHERE r.thread_id=OLD.thread_id AND r.revision=OLD.revision
                  AND r.status IN ('published','retracted')
            ) BEGIN SELECT RAISE(ABORT, 'published thread relations are immutable'); END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS published_thread_relations_immutable_delete
            BEFORE DELETE ON research_thread_relations
            WHEN EXISTS (
                SELECT 1 FROM research_thread_revisions r
                WHERE r.thread_id=OLD.thread_id AND r.revision=OLD.revision
                  AND r.status IN ('published','retracted')
            ) BEGIN SELECT RAISE(ABORT, 'published thread relations are immutable'); END
            """,
        )
        for statement in statements:
            db.execute(statement)

    @staticmethod
    def _migrate_v12_to_v13(db: sqlite3.Connection) -> None:
        # Claims predate owner-scoped thread editing. Temporarily remove the
        # immutability trigger so existing rows can inherit their dossier owner.
        db.execute("DROP TRIGGER IF EXISTS scientific_claims_immutable_update")
        AtlasStore._ensure_column(
            db, "scientific_claims", "owner_id", "TEXT NOT NULL DEFAULT 'local'"
        )
        db.execute(
            """
            UPDATE scientific_claims
            SET owner_id=COALESCE(
                (SELECT ar.owner_id FROM analysis_requests ar
                 WHERE ar.id=scientific_claims.analysis_request_id),
                'local'
            )
            """
        )
        statements = (
            "CREATE INDEX IF NOT EXISTS idx_scientific_claims_owner_paper "
            "ON scientific_claims(owner_id, canonical_paper_id, created_at DESC)",
            """
            CREATE TRIGGER IF NOT EXISTS scientific_claims_immutable_update
            BEFORE UPDATE ON scientific_claims BEGIN
                SELECT RAISE(ABORT, 'scientific claims are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_candidates_owner_insert
            BEFORE INSERT ON claim_candidates
            WHEN NOT EXISTS (
                SELECT 1 FROM scientific_claims l, scientific_claims r
                WHERE l.id=NEW.left_claim_id AND r.id=NEW.right_claim_id
                  AND l.owner_id=NEW.owner_id AND r.owner_id=NEW.owner_id
            ) BEGIN
                SELECT RAISE(ABORT, 'claim candidate owner mismatch');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_candidates_owner_update
            BEFORE UPDATE ON claim_candidates
            WHEN NOT EXISTS (
                SELECT 1 FROM scientific_claims l, scientific_claims r
                WHERE l.id=NEW.left_claim_id AND r.id=NEW.right_claim_id
                  AND l.owner_id=NEW.owner_id AND r.owner_id=NEW.owner_id
            ) BEGIN
                SELECT RAISE(ABORT, 'claim candidate owner mismatch');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_candidates_review_insert
            BEFORE INSERT ON claim_candidates
            WHEN NEW.status='approved'
              AND NEW.reviewed_relation NOT IN (
                'supports','extends','narrows','reproduces','contradicts','unclear'
              )
            BEGIN
                SELECT RAISE(ABORT, 'approved candidate requires final reviewed relation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_candidates_review_update
            BEFORE UPDATE ON claim_candidates
            WHEN NEW.status='approved' AND NEW.reviewed_relation NOT IN (
                'supports','extends','narrows','reproduces','contradicts','unclear'
            )
            BEGIN
                SELECT RAISE(ABORT, 'approved candidate requires final reviewed relation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_memberships_integrity_insert
            BEFORE INSERT ON claim_cluster_memberships
            WHEN NOT EXISTS (
                SELECT 1
                FROM claim_clusters cl
                JOIN claim_candidates ca ON ca.id=NEW.candidate_id
                JOIN scientific_claims sc ON sc.id=NEW.claim_id
                WHERE cl.id=NEW.cluster_id
                  AND ca.owner_id=cl.owner_id
                  AND sc.owner_id=cl.owner_id
                  AND NEW.claim_id IN (ca.left_claim_id, ca.right_claim_id)
                  AND (
                    NEW.status<>'approved'
                    OR (
                      ca.status='approved'
                      AND ca.reviewed_relation<>''
                      AND NEW.relation_type=ca.reviewed_relation
                    )
                  )
            ) BEGIN
                SELECT RAISE(ABORT, 'claim membership integrity violation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_memberships_integrity_update
            BEFORE UPDATE ON claim_cluster_memberships
            WHEN NOT EXISTS (
                SELECT 1
                FROM claim_clusters cl
                JOIN claim_candidates ca ON ca.id=NEW.candidate_id
                JOIN scientific_claims sc ON sc.id=NEW.claim_id
                WHERE cl.id=NEW.cluster_id
                  AND ca.owner_id=cl.owner_id
                  AND sc.owner_id=cl.owner_id
                  AND NEW.claim_id IN (ca.left_claim_id, ca.right_claim_id)
                  AND (
                    NEW.status<>'approved'
                    OR (
                      ca.status='approved'
                      AND ca.reviewed_relation<>''
                      AND NEW.relation_type=ca.reviewed_relation
                    )
                  )
            ) BEGIN
                SELECT RAISE(ABORT, 'claim membership integrity violation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_clusters_owner_update
            BEFORE UPDATE OF owner_id ON claim_clusters
            WHEN NEW.owner_id<>OLD.owner_id BEGIN
                SELECT RAISE(ABORT, 'cluster owner is immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_candidates_owner_immutable
            BEFORE UPDATE OF owner_id ON claim_candidates
            WHEN NEW.owner_id<>OLD.owner_id BEGIN
                SELECT RAISE(ABORT, 'claim candidate owner is immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS research_threads_owner_immutable
            BEFORE UPDATE OF owner_id ON research_threads
            WHEN NEW.owner_id<>OLD.owner_id BEGIN
                SELECT RAISE(ABORT, 'research thread owner is immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_claims_integrity_insert
            BEFORE INSERT ON research_thread_claims
            WHEN NOT EXISTS (
                SELECT 1
                FROM research_threads t
                JOIN research_thread_revisions rv
                  ON rv.thread_id=t.id
                 AND rv.thread_id=NEW.thread_id AND rv.revision=NEW.revision
                JOIN scientific_claims sc ON sc.id=NEW.claim_id
                JOIN claim_clusters cl ON cl.id=NEW.cluster_id
                JOIN claim_cluster_memberships m ON m.id=NEW.membership_id
                WHERE sc.owner_id=t.owner_id AND cl.owner_id=t.owner_id
                  AND m.cluster_id=NEW.cluster_id AND m.claim_id=NEW.claim_id
                  AND m.status='approved'
            ) BEGIN
                SELECT RAISE(ABORT, 'thread claim integrity violation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_claims_integrity_update
            BEFORE UPDATE ON research_thread_claims
            WHEN NOT EXISTS (
                SELECT 1
                FROM research_threads t
                JOIN research_thread_revisions rv
                  ON rv.thread_id=t.id
                 AND rv.thread_id=NEW.thread_id AND rv.revision=NEW.revision
                JOIN scientific_claims sc ON sc.id=NEW.claim_id
                JOIN claim_clusters cl ON cl.id=NEW.cluster_id
                JOIN claim_cluster_memberships m ON m.id=NEW.membership_id
                WHERE sc.owner_id=t.owner_id AND cl.owner_id=t.owner_id
                  AND m.cluster_id=NEW.cluster_id AND m.claim_id=NEW.claim_id
                  AND m.status='approved'
            ) BEGIN
                SELECT RAISE(ABORT, 'thread claim integrity violation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_relations_integrity_insert
            BEFORE INSERT ON research_thread_relations
            WHEN NOT EXISTS (
                SELECT 1
                FROM research_threads t
                JOIN research_thread_revisions rv
                  ON rv.thread_id=t.id
                 AND rv.thread_id=NEW.thread_id AND rv.revision=NEW.revision
                JOIN claim_candidates ca ON ca.id=NEW.candidate_id
                WHERE ca.owner_id=t.owner_id AND ca.status='approved'
                  AND ca.reviewed_relation=NEW.relation_type
                  AND ca.left_claim_id=NEW.left_claim_id
                  AND ca.right_claim_id=NEW.right_claim_id
                  AND EXISTS (
                    SELECT 1 FROM research_thread_claims lc
                    WHERE lc.thread_id=NEW.thread_id AND lc.revision=NEW.revision
                      AND lc.claim_id=NEW.left_claim_id
                  )
                  AND EXISTS (
                    SELECT 1 FROM research_thread_claims rc
                    WHERE rc.thread_id=NEW.thread_id AND rc.revision=NEW.revision
                      AND rc.claim_id=NEW.right_claim_id
                  )
            ) BEGIN
                SELECT RAISE(ABORT, 'thread relation integrity violation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_relations_integrity_update
            BEFORE UPDATE ON research_thread_relations
            WHEN NOT EXISTS (
                SELECT 1
                FROM research_threads t
                JOIN research_thread_revisions rv
                  ON rv.thread_id=t.id
                 AND rv.thread_id=NEW.thread_id AND rv.revision=NEW.revision
                JOIN claim_candidates ca ON ca.id=NEW.candidate_id
                WHERE ca.owner_id=t.owner_id AND ca.status='approved'
                  AND ca.reviewed_relation=NEW.relation_type
                  AND ca.left_claim_id=NEW.left_claim_id
                  AND ca.right_claim_id=NEW.right_claim_id
                  AND EXISTS (
                    SELECT 1 FROM research_thread_claims lc
                    WHERE lc.thread_id=NEW.thread_id AND lc.revision=NEW.revision
                      AND lc.claim_id=NEW.left_claim_id
                  )
                  AND EXISTS (
                    SELECT 1 FROM research_thread_claims rc
                    WHERE rc.thread_id=NEW.thread_id AND rc.revision=NEW.revision
                      AND rc.claim_id=NEW.right_claim_id
                  )
            ) BEGIN
                SELECT RAISE(ABORT, 'thread relation integrity violation');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_current_revision_insert
            BEFORE INSERT ON research_threads
            WHEN NEW.current_published_revision IS NOT NULL
            BEGIN
                SELECT RAISE(ABORT, 'new thread cannot point to a published revision');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_current_revision_update
            BEFORE UPDATE OF current_published_revision ON research_threads
            WHEN NEW.current_published_revision IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM research_thread_revisions rv
                WHERE rv.thread_id=NEW.id
                  AND rv.revision=NEW.current_published_revision
                  AND rv.status='published'
            ) BEGIN
                SELECT RAISE(ABORT, 'thread current revision must be published');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS current_thread_revision_status_update
            BEFORE UPDATE OF status ON research_thread_revisions
            WHEN NEW.status<>'published' AND EXISTS (
                SELECT 1 FROM research_threads t
                WHERE t.id=OLD.thread_id
                  AND t.current_published_revision=OLD.revision
            ) BEGIN
                SELECT RAISE(ABORT, 'current thread revision must remain published');
            END
            """,
        )
        for statement in statements:
            db.execute(statement)

    @staticmethod
    def _migrate_v13_to_v14(db: sqlite3.Connection) -> None:
        # SQLite cannot drop the table-level UNIQUE(claim_sha256) constraint in
        # place. Rebuild the parent table while foreign-key enforcement is
        # disabled by the migration runner, then restore its immutable guards.
        dependent_triggers = db.execute(
            """
            SELECT name, sql FROM sqlite_master
            WHERE type='trigger' AND sql IS NOT NULL AND sql LIKE '%scientific_claims%'
            ORDER BY name
            """
        ).fetchall()
        for trigger in dependent_triggers:
            name = str(trigger["name"]).replace('"', '""')
            db.execute(f'DROP TRIGGER "{name}"')
        db.execute(
            """
            CREATE TABLE scientific_claims_v14 (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL DEFAULT 'local',
                canonical_paper_id INTEGER NOT NULL,
                paper_version TEXT NOT NULL,
                analysis_request_id TEXT NOT NULL,
                stage_key TEXT NOT NULL,
                stage_attempt INTEGER NOT NULL,
                dossier_claim_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                statement TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                source_basis TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                insufficient_information_json TEXT NOT NULL DEFAULT '[]',
                source_sha256 TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT '',
                prompt_version TEXT NOT NULL DEFAULT '',
                claim_sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(owner_id, claim_sha256),
                UNIQUE(
                    owner_id, canonical_paper_id, paper_version,
                    analysis_request_id, stage_key, stage_attempt,
                    dossier_claim_id, source_sha256
                ),
                FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id),
                FOREIGN KEY(analysis_request_id) REFERENCES analysis_requests(id)
            )
            """
        )
        db.execute(
            """
            INSERT INTO scientific_claims_v14(
                id, owner_id, canonical_paper_id, paper_version,
                analysis_request_id, stage_key, stage_attempt, dossier_claim_id,
                title, statement, source_kind, source_basis, evidence_json,
                insufficient_information_json, source_sha256, model,
                prompt_version, claim_sha256, created_at
            )
            SELECT
                id, owner_id, canonical_paper_id, paper_version,
                analysis_request_id, stage_key, stage_attempt, dossier_claim_id,
                title, statement, source_kind, source_basis, evidence_json,
                insufficient_information_json, source_sha256, model,
                prompt_version, claim_sha256, created_at
            FROM scientific_claims
            """
        )
        db.execute("DROP TABLE scientific_claims")
        db.execute("ALTER TABLE scientific_claims_v14 RENAME TO scientific_claims")
        db.execute(
            "CREATE INDEX idx_scientific_claims_paper "
            "ON scientific_claims(canonical_paper_id, created_at DESC)"
        )
        db.execute(
            "CREATE INDEX idx_scientific_claims_owner_paper "
            "ON scientific_claims(owner_id, canonical_paper_id, created_at DESC)"
        )
        for trigger in dependent_triggers:
            db.execute(trigger["sql"])
        AtlasStore._ensure_column(
            db, "claim_eval_results", "predicted_locators_json", "TEXT NOT NULL DEFAULT '[]'"
        )
        # Pre-v14 evaluation rows accepted caller-supplied completeness and
        # agreement values. They cannot be reconstructed without the original
        # predicted locator fields, so erase those untrusted derived values.
        db.execute(
            """
            UPDATE claim_eval_results
            SET predicted_locators_json='[]', locator_complete=0,
                reviewer_agreement=NULL
            """
        )
        for row in db.execute("SELECT id, metrics_json FROM claim_eval_runs").fetchall():
            metrics = json.loads(row["metrics_json"] or "{}")
            metrics["locator_completeness"] = None
            metrics["reviewer_agreement"] = None
            db.execute(
                "UPDATE claim_eval_runs SET metrics_json=? WHERE id=?",
                (json.dumps(metrics, ensure_ascii=False, sort_keys=True), row["id"]),
            )

    @staticmethod
    def _migrate_v14_to_v15(db: sqlite3.Connection) -> None:
        # v14 already contained editable thread revisions. Validate those rows
        # before installing the v15 publication guards so a corrupt legacy
        # database cannot become publicly readable merely by being migrated.
        AtlasStore._validate_research_thread_integrity(db)
        AtlasStore._ensure_column(
            db, "claim_golden_items", "owner_id", "TEXT NOT NULL DEFAULT 'local'"
        )
        db.execute(
            """
            UPDATE claim_golden_items
            SET owner_id=COALESCE(
                (SELECT l.owner_id FROM scientific_claims l
                 WHERE l.id=claim_golden_items.left_claim_id),
                'local'
            )
            """
        )
        invalid_golden = db.execute(
            """
            SELECT g.id
            FROM claim_golden_items g
            LEFT JOIN scientific_claims l ON l.id=g.left_claim_id
            LEFT JOIN scientific_claims r ON r.id=g.right_claim_id
            WHERE l.id IS NULL OR r.id IS NULL
               OR l.owner_id<>g.owner_id OR r.owner_id<>g.owner_id
            LIMIT 1
            """
        ).fetchone()
        if invalid_golden is not None:
            raise AtlasError(
                f"claim golden item {invalid_golden['id']} has inconsistent ownership"
            )
        invalid_result = db.execute(
            """
            SELECT result.run_id, result.golden_item_id
            FROM claim_eval_results result
            JOIN claim_eval_runs run ON run.id=result.run_id
            JOIN claim_golden_items golden ON golden.id=result.golden_item_id
            WHERE run.owner_id<>golden.owner_id
            LIMIT 1
            """
        ).fetchone()
        if invalid_result is not None:
            raise AtlasError(
                "claim evaluation result has inconsistent golden item ownership"
            )
        statements = (
            "CREATE INDEX IF NOT EXISTS idx_claim_golden_items_owner "
            "ON claim_golden_items(owner_id, created_at DESC)",
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_status_insert_guard
            BEFORE INSERT ON research_thread_revisions
            WHEN NEW.status<>'draft'
              OR NEW.published_at IS NOT NULL
              OR NEW.retracted_at IS NOT NULL
            BEGIN
                SELECT RAISE(ABORT, 'thread revisions must be inserted as drafts');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_public_metadata_guard
            BEFORE UPDATE OF status, reviewer, review_reason, published_at, retracted_at
            ON research_thread_revisions
            WHEN NEW.status NOT IN ('draft','published','retracted')
              OR (NEW.status<>OLD.status AND NOT (
                    (OLD.status='draft' AND NEW.status='published')
                    OR (OLD.status='published' AND NEW.status='retracted')
                  ))
              OR (NEW.status='published' AND (
                    NEW.published_at IS NULL OR trim(NEW.reviewer)=''
                    OR trim(NEW.review_reason)='' OR NEW.retracted_at IS NOT NULL
                  ))
              OR (NEW.status='draft' AND (
                    NEW.published_at IS NOT NULL OR NEW.retracted_at IS NOT NULL
                    OR trim(NEW.reviewer)<>'' OR trim(NEW.review_reason)<>''
                  ))
              OR (NEW.status='retracted' AND (
                    NEW.published_at IS NULL OR NEW.retracted_at IS NULL
                    OR trim(NEW.reviewer)='' OR trim(NEW.review_reason)=''
                  ))
            BEGIN
                SELECT RAISE(ABORT, 'thread revision status metadata is incomplete');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_date_format_guard
            BEFORE INSERT ON research_thread_revisions
            WHEN julianday(NEW.created_at) IS NULL
              OR (NEW.published_at IS NOT NULL AND julianday(NEW.published_at) IS NULL)
              OR (NEW.retracted_at IS NOT NULL AND julianday(NEW.retracted_at) IS NULL)
            BEGIN
                SELECT RAISE(ABORT, 'thread revision dates must be valid ISO timestamps');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_date_format_guard_update
            BEFORE UPDATE OF status, created_at, published_at, retracted_at
            ON research_thread_revisions
            WHEN julianday(NEW.created_at) IS NULL
              OR (NEW.published_at IS NOT NULL AND julianday(NEW.published_at) IS NULL)
              OR (NEW.retracted_at IS NOT NULL AND julianday(NEW.retracted_at) IS NULL)
            BEGIN
                SELECT RAISE(ABORT, 'thread revision dates must be valid ISO timestamps');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_status_transition_guard
            BEFORE UPDATE OF status ON research_thread_revisions
            WHEN NEW.status<>OLD.status
              AND atlas_thread_transition_allowed()<>1
            BEGIN
                SELECT RAISE(ABORT, 'thread revision status requires controlled transition');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_delete_guard
            BEFORE DELETE ON research_thread_revisions
            WHEN OLD.status IN ('published','retracted')
            BEGIN
                SELECT RAISE(ABORT, 'published thread revisions are immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_public_json_guard_insert
            BEFORE INSERT ON research_thread_revisions
            WHEN NOT (
                json_valid(NEW.competing_routes_json)
                AND json_type(NEW.competing_routes_json)='array'
                AND json_array_length(NEW.competing_routes_json)<=30
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.competing_routes_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>2000
                )
                AND json_valid(NEW.counter_evidence_json)
                AND json_type(NEW.counter_evidence_json)='array'
                AND json_array_length(NEW.counter_evidence_json)<=50
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.counter_evidence_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>4000
                )
                AND json_valid(NEW.known_unknowns_json)
                AND json_type(NEW.known_unknowns_json)='array'
                AND json_array_length(NEW.known_unknowns_json)<=50
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.known_unknowns_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>4000
                )
                AND json_valid(NEW.representative_papers_json)
                AND json_type(NEW.representative_papers_json)='array'
                AND json_array_length(NEW.representative_papers_json)<=100
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.representative_papers_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>500
                )
                AND json_valid(NEW.delta_json)
                AND json_type(NEW.delta_json)='object'
            )
            BEGIN
                SELECT RAISE(ABORT, 'thread public arrays must contain strings');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS thread_revision_public_json_guard_update
            BEFORE UPDATE OF competing_routes_json, counter_evidence_json,
                known_unknowns_json, representative_papers_json, delta_json
            ON research_thread_revisions
            WHEN NOT (
                json_valid(NEW.competing_routes_json)
                AND json_type(NEW.competing_routes_json)='array'
                AND json_array_length(NEW.competing_routes_json)<=30
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.competing_routes_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>2000
                )
                AND json_valid(NEW.counter_evidence_json)
                AND json_type(NEW.counter_evidence_json)='array'
                AND json_array_length(NEW.counter_evidence_json)<=50
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.counter_evidence_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>4000
                )
                AND json_valid(NEW.known_unknowns_json)
                AND json_type(NEW.known_unknowns_json)='array'
                AND json_array_length(NEW.known_unknowns_json)<=50
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.known_unknowns_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>4000
                )
                AND json_valid(NEW.representative_papers_json)
                AND json_type(NEW.representative_papers_json)='array'
                AND json_array_length(NEW.representative_papers_json)<=100
                AND NOT EXISTS (
                    SELECT 1 FROM json_each(NEW.representative_papers_json)
                    WHERE type<>'text' OR trim(value)='' OR length(value)>500
                )
                AND json_valid(NEW.delta_json)
                AND json_type(NEW.delta_json)='object'
            )
            BEGIN
                SELECT RAISE(ABORT, 'thread public arrays must contain strings');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_golden_items_owner_insert
            BEFORE INSERT ON claim_golden_items
            WHEN NOT EXISTS (
                SELECT 1 FROM scientific_claims l, scientific_claims r
                WHERE l.id=NEW.left_claim_id AND r.id=NEW.right_claim_id
                  AND l.owner_id=NEW.owner_id AND r.owner_id=NEW.owner_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'golden item owner mismatch');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_golden_items_owner_immutable
            BEFORE UPDATE OF owner_id ON claim_golden_items
            WHEN NEW.owner_id<>OLD.owner_id
            BEGIN
                SELECT RAISE(ABORT, 'golden item owner is immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_golden_items_owner_update
            BEFORE UPDATE OF left_claim_id, right_claim_id ON claim_golden_items
            WHEN NOT EXISTS (
                SELECT 1 FROM scientific_claims l, scientific_claims r
                WHERE l.id=NEW.left_claim_id AND r.id=NEW.right_claim_id
                  AND l.owner_id=NEW.owner_id AND r.owner_id=NEW.owner_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'golden item owner mismatch');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_eval_runs_owner_immutable
            BEFORE UPDATE OF owner_id ON claim_eval_runs
            WHEN NEW.owner_id<>OLD.owner_id
            BEGIN
                SELECT RAISE(ABORT, 'claim evaluation owner is immutable');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_eval_results_owner_insert
            BEFORE INSERT ON claim_eval_results
            WHEN NOT EXISTS (
                SELECT 1 FROM claim_eval_runs run
                JOIN claim_golden_items golden ON golden.id=NEW.golden_item_id
                WHERE run.id=NEW.run_id AND run.owner_id=golden.owner_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'claim evaluation owner mismatch');
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS claim_eval_results_owner_update
            BEFORE UPDATE OF run_id, golden_item_id ON claim_eval_results
            WHEN NOT EXISTS (
                SELECT 1 FROM claim_eval_runs run
                JOIN claim_golden_items golden ON golden.id=NEW.golden_item_id
                WHERE run.id=NEW.run_id AND run.owner_id=golden.owner_id
            )
            BEGIN
                SELECT RAISE(ABORT, 'claim evaluation owner mismatch');
            END
            """,
        )
        for statement in statements:
            db.execute(statement)

    @staticmethod
    def _migrate_v15_to_v16(db: sqlite3.Connection) -> None:
        """Install the explicit, owner-scoped learning state ledger.

        Curriculum content is versioned source data, while this table stores
        only a user's deliberate state and a short note.  Keeping the two
        separate lets the course catalog evolve without rewriting private
        learning history.
        """
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS learning_progress (
                owner_id TEXT NOT NULL,
                chapter_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'not_started',
                confidence INTEGER,
                note TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'explicit_user_action',
                started_at TEXT,
                last_reviewed_at TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(owner_id, chapter_id)
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_learning_progress_owner_status "
            "ON learning_progress(owner_id, status, updated_at DESC)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_learning_progress_chapter "
            "ON learning_progress(chapter_id, status)"
        )

    @staticmethod
    def _validate_thread_public_array(
        revision_id: str, field: str, raw: Any, item_limit: int, item_maximum: int
    ) -> list[str]:
        try:
            value = json.loads(raw or "[]")
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise AtlasError(f"thread revision {revision_id} has invalid {field} JSON") from error
        if not isinstance(value, list) or len(value) > item_limit:
            raise AtlasError(f"thread revision {revision_id} has invalid {field} JSON")
        for item in value:
            if not isinstance(item, str) or not item.strip() or len(item) > item_maximum:
                raise AtlasError(f"thread revision {revision_id} has invalid {field} JSON")
        return value

    @staticmethod
    def _validate_research_thread_integrity(db: sqlite3.Connection) -> None:
        """Validate publication state and lineage before exposing a database."""
        tables = {
            row["name"]
            for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        required = {
            "research_threads",
            "research_thread_revisions",
            "research_thread_claims",
            "research_thread_relations",
        }
        if not required.issubset(tables):
            return

        revisions = db.execute(
            "SELECT * FROM research_thread_revisions ORDER BY thread_id, revision"
        ).fetchall()
        revisions_by_thread: dict[str, list[sqlite3.Row]] = {}
        for row in revisions:
            thread_id = str(row["thread_id"])
            revision_id = f"{thread_id}:{row['revision']}"
            status = row["status"]
            if status not in THREAD_REVISION_STATUS:
                raise AtlasError(f"thread revision {revision_id} has invalid status")
            if not isinstance(row["revision"], int) or int(row["revision"]) < 1:
                raise AtlasError(f"thread revision {revision_id} has invalid revision")
            if parse_utc(row["created_at"]) is None:
                raise AtlasError(f"thread revision {revision_id} has invalid created_at")
            for field, limit, maximum in (
                ("competing_routes_json", 30, 2000),
                ("counter_evidence_json", 50, 4000),
                ("known_unknowns_json", 50, 4000),
                ("representative_papers_json", 100, 500),
            ):
                AtlasStore._validate_thread_public_array(
                    revision_id, field, row[field], limit, maximum
                )
            try:
                delta = json.loads(row["delta_json"] or "{}")
            except (TypeError, ValueError, json.JSONDecodeError) as error:
                raise AtlasError(f"thread revision {revision_id} has invalid delta JSON") from error
            if not isinstance(delta, dict):
                raise AtlasError(f"thread revision {revision_id} delta must be a JSON object")

            published_at = row["published_at"]
            retracted_at = row["retracted_at"]
            if published_at is not None and parse_utc(published_at) is None:
                raise AtlasError(f"thread revision {revision_id} has invalid published_at")
            if retracted_at is not None and parse_utc(retracted_at) is None:
                raise AtlasError(f"thread revision {revision_id} has invalid retracted_at")
            reviewer = compact_text(row["reviewer"], 200)
            reason = compact_text(row["review_reason"], 4000)
            if status == "draft":
                if published_at is not None or retracted_at is not None or reviewer or reason:
                    raise AtlasError(f"draft thread revision {revision_id} has publication metadata")
            elif status == "published":
                if published_at is None or not reviewer or not reason or retracted_at is not None:
                    raise AtlasError(f"published thread revision {revision_id} has incomplete metadata")
            elif status == "retracted":
                if published_at is None or retracted_at is None or not reviewer or not reason:
                    raise AtlasError(f"retracted thread revision {revision_id} has incomplete metadata")
            revisions_by_thread.setdefault(thread_id, []).append(row)

        thread_rows = db.execute("SELECT * FROM research_threads").fetchall()
        known_threads = {str(row["id"]): row for row in thread_rows}
        for thread_id, rows in revisions_by_thread.items():
            if thread_id not in known_threads:
                raise AtlasError(f"thread revision {thread_id} points to a missing thread")
            claim_rows = db.execute(
                "SELECT * FROM research_thread_claims WHERE thread_id=? ORDER BY revision, position",
                (thread_id,),
            ).fetchall()
            relation_rows = db.execute(
                "SELECT * FROM research_thread_relations WHERE thread_id=? ORDER BY revision, position",
                (thread_id,),
            ).fetchall()
            claims_by_revision: dict[int, set[str]] = {}
            for claim in claim_rows:
                revision = int(claim["revision"])
                if not db.execute(
                    "SELECT 1 FROM research_thread_revisions WHERE thread_id=? AND revision=?",
                    (thread_id, revision),
                ).fetchone():
                    raise AtlasError(f"thread claim points to a missing revision {thread_id}:{revision}")
                claim_exists = db.execute(
                    "SELECT id FROM scientific_claims WHERE id=?", (claim["claim_id"],)
                ).fetchone()
                if claim_exists is None:
                    raise AtlasError(f"thread claim points to a missing claim {thread_id}:{revision}")
                claims_by_revision.setdefault(revision, set()).add(str(claim["claim_id"]))
            relations_by_revision: dict[int, list[sqlite3.Row]] = {}
            for relation in relation_rows:
                revision = int(relation["revision"])
                relations_by_revision.setdefault(revision, []).append(relation)
                if not db.execute(
                    "SELECT 1 FROM claim_candidates WHERE id=?", (relation["candidate_id"],)
                ).fetchone():
                    raise AtlasError(f"thread relation points to a missing candidate {thread_id}:{revision}")
                candidate = db.execute(
                    "SELECT * FROM claim_candidates WHERE id=?", (relation["candidate_id"],)
                ).fetchone()
                claim_ids = claims_by_revision.get(revision, set())
                if (
                    relation["left_claim_id"] not in claim_ids
                    or relation["right_claim_id"] not in claim_ids
                    or relation["left_claim_id"] == relation["right_claim_id"]
                    or candidate["left_claim_id"] != relation["left_claim_id"]
                    or candidate["right_claim_id"] != relation["right_claim_id"]
                    or candidate["status"] != "approved"
                    or candidate["reviewed_relation"] != relation["relation_type"]
                ):
                    raise AtlasError(f"thread relation endpoints are invalid for {thread_id}:{revision}")
            for revision_row in rows:
                revision = int(revision_row["revision"])
                if revision_row["status"] in {"published", "retracted"} and not claims_by_revision.get(revision):
                    raise AtlasError(f"public thread revision {thread_id}:{revision} has no claims")
            current = known_threads[thread_id]["current_published_revision"]
            published = [row for row in rows if row["status"] == "published"]
            if published and current is None:
                raise AtlasError(f"thread {thread_id} has published revisions but no current revision")
            if current is not None:
                current_row = next((row for row in rows if int(row["revision"]) == int(current)), None)
                if current_row is None or current_row["status"] != "published":
                    raise AtlasError(f"thread {thread_id} current revision is not published")
        for thread_id, thread in known_threads.items():
            if thread["current_published_revision"] is not None and thread_id not in revisions_by_thread:
                raise AtlasError(f"thread {thread_id} current revision has no revision row")

    def _run_migrations(self, db: sqlite3.Connection) -> None:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
            """
        )
        row = db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()
        try:
            current = int(row["value"] if row else 7)
        except (TypeError, ValueError) as error:
            raise AtlasError("Atlas schema_version 无效") from error
        if current > SCHEMA_VERSION:
            raise AtlasError(f"Atlas database version {current} 高于当前程序支持的版本 {SCHEMA_VERSION}")

        migrations = {
            8: (*SCHEMA_MIGRATION_SPECS[8], self._migrate_v7_to_v8),
            9: (*SCHEMA_MIGRATION_SPECS[9], self._migrate_v8_to_v9),
            10: (*SCHEMA_MIGRATION_SPECS[10], self._migrate_v9_to_v10),
            11: (*SCHEMA_MIGRATION_SPECS[11], self._migrate_v10_to_v11),
            12: (*SCHEMA_MIGRATION_SPECS[12], self._migrate_v11_to_v12),
            13: (*SCHEMA_MIGRATION_SPECS[13], self._migrate_v12_to_v13),
            14: (*SCHEMA_MIGRATION_SPECS[14], self._migrate_v13_to_v14),
            15: (*SCHEMA_MIGRATION_SPECS[15], self._migrate_v14_to_v15),
            16: (*SCHEMA_MIGRATION_SPECS[16], self._migrate_v15_to_v16),
        }
        self._validate_migration_ledger(db, current)
        outer_savepoint = "atlas_migration_chain"
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute(f"SAVEPOINT {outer_savepoint}")
        try:
            for version in range(current + 1, SCHEMA_VERSION + 1):
                if version not in migrations:
                    raise AtlasError(f"缺少 Atlas schema migration v{version}")
                name, checksum, migration = migrations[version]
                prior = db.execute(
                    "SELECT checksum FROM schema_migrations WHERE version=?", (version,)
                ).fetchone()
                if prior and prior["checksum"] != checksum:
                    raise AtlasError(f"Atlas schema migration v{version} checksum 不一致")
                migration(db)
                db.execute(
                    "INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
                    (version, name, checksum, utc_now()),
                )
                db.execute(
                    "INSERT INTO app_metadata(key, value) VALUES('schema_version', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (str(version),),
                )
            final_row = db.execute(
                "SELECT value FROM app_metadata WHERE key='schema_version'"
            ).fetchone()
            final_version = int(final_row["value"]) if final_row else current
            if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise AtlasError("Atlas schema migration left invalid foreign keys")
            self._validate_migration_ledger(db, final_version)
            db.execute(f"RELEASE SAVEPOINT {outer_savepoint}")
            db.execute("PRAGMA foreign_keys=ON")
        except Exception:
            db.execute(f"ROLLBACK TO SAVEPOINT {outer_savepoint}")
            db.execute(f"RELEASE SAVEPOINT {outer_savepoint}")
            db.execute("PRAGMA foreign_keys=ON")
            raise

    def initialize(self) -> None:
        with self.connect() as db:
            db.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS app_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS canonical_papers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    canonical_ref TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL DEFAULT '',
                    normalized_title TEXT NOT NULL DEFAULT '',
                    abstract TEXT NOT NULL DEFAULT '',
                    authors_json TEXT NOT NULL DEFAULT '[]',
                    venue TEXT NOT NULL DEFAULT '',
                    published TEXT NOT NULL DEFAULT '',
                    current_version TEXT NOT NULL DEFAULT '',
                    source_url TEXT NOT NULL DEFAULT '',
                    pdf_url TEXT NOT NULL DEFAULT '',
                    doi TEXT NOT NULL DEFAULT '',
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS paper_aliases (
                    canonical_paper_id INTEGER NOT NULL,
                    namespace TEXT NOT NULL,
                    external_id TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT '',
                    verified_at TEXT NOT NULL,
                    PRIMARY KEY(namespace, external_id),
                    FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id)
                );
                CREATE TABLE IF NOT EXISTS research_projects (
                    full_name TEXT PRIMARY KEY,
                    description TEXT NOT NULL DEFAULT '',
                    url TEXT NOT NULL DEFAULT '',
                    homepage TEXT NOT NULL DEFAULT '',
                    language TEXT NOT NULL DEFAULT '',
                    license TEXT NOT NULL DEFAULT '',
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    source_updated_at TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analysis_requests (
                    id TEXT PRIMARY KEY,
                    canonical_paper_id INTEGER NOT NULL,
                    owner_id TEXT NOT NULL DEFAULT 'local',
                    trigger TEXT NOT NULL,
                    requested_sections_json TEXT NOT NULL DEFAULT '[]',
                    source_version TEXT NOT NULL DEFAULT '',
                    source_sha256 TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    progress_json TEXT NOT NULL DEFAULT '[]',
                    estimated_cost REAL,
                    actual_cost REAL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    updated_at TEXT NOT NULL,
                    error_text TEXT NOT NULL DEFAULT '',
                    lease_owner TEXT NOT NULL DEFAULT '',
                    lease_token_sha256 TEXT NOT NULL DEFAULT '',
                    lease_expires_at TEXT,
                    lease_heartbeat_at TEXT,
                    worker_claim_count INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id)
                );
                CREATE TABLE IF NOT EXISTS analysis_materials (
                    id TEXT PRIMARY KEY,
                    analysis_request_id TEXT NOT NULL UNIQUE,
                    canonical_paper_id INTEGER NOT NULL,
                    authorization_mode TEXT NOT NULL DEFAULT 'none',
                    source_url TEXT NOT NULL DEFAULT '',
                    download_authorized INTEGER NOT NULL DEFAULT 0,
                    external_processing_authorized INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'awaiting_authorization',
                    media_type TEXT NOT NULL DEFAULT '',
                    source_sha256 TEXT NOT NULL DEFAULT '',
                    byte_size INTEGER,
                    page_count INTEGER,
                    extracted_characters INTEGER,
                    authorized_at TEXT,
                    download_started_at TEXT,
                    downloaded_at TEXT,
                    parsed_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    error_text TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY(analysis_request_id) REFERENCES analysis_requests(id),
                    FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id)
                );
                CREATE TABLE IF NOT EXISTS analysis_stage_runs (
                    analysis_request_id TEXT NOT NULL,
                    stage_key TEXT NOT NULL,
                    stage_label TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    attempt INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    percent INTEGER NOT NULL DEFAULT 0,
                    content_json TEXT NOT NULL DEFAULT '{}',
                    source_basis TEXT NOT NULL DEFAULT 'metadata',
                    source_sha256 TEXT NOT NULL DEFAULT '',
                    model TEXT NOT NULL DEFAULT '',
                    prompt_version TEXT NOT NULL DEFAULT '',
                    started_at TEXT,
                    finished_at TEXT,
                    updated_at TEXT NOT NULL,
                    error_text TEXT NOT NULL DEFAULT '',
                    PRIMARY KEY(analysis_request_id, stage_key, attempt),
                    FOREIGN KEY(analysis_request_id) REFERENCES analysis_requests(id)
                );
                CREATE TABLE IF NOT EXISTS paper_analyses (
                    id TEXT PRIMARY KEY,
                    canonical_paper_id INTEGER NOT NULL,
                    analysis_request_id TEXT NOT NULL UNIQUE,
                    owner_id TEXT NOT NULL DEFAULT 'local',
                    visibility TEXT NOT NULL DEFAULT 'private',
                    analysis_level TEXT NOT NULL,
                    sections_json TEXT NOT NULL DEFAULT '[]',
                    content_json TEXT NOT NULL DEFAULT '{}',
                    source_basis TEXT NOT NULL,
                    source_sha256 TEXT NOT NULL DEFAULT '',
                    model TEXT NOT NULL DEFAULT '',
                    prompt_version TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    generated_at TEXT NOT NULL,
                    reviewed_at TEXT,
                    supersedes_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id),
                    FOREIGN KEY(analysis_request_id) REFERENCES analysis_requests(id),
                    FOREIGN KEY(supersedes_id) REFERENCES paper_analyses(id)
                );
                CREATE TABLE IF NOT EXISTS bridge_messages (
                    message_id TEXT PRIMARY KEY,
                    message_type TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    received_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS frontier_source_runs (
                    id TEXT PRIMARY KEY,
                    source_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    query_spec_json TEXT NOT NULL DEFAULT '[]',
                    query_results_json TEXT NOT NULL DEFAULT '[]',
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    fetched_count INTEGER NOT NULL DEFAULT 0,
                    accepted_count INTEGER NOT NULL DEFAULT 0,
                    new_count INTEGER NOT NULL DEFAULT 0,
                    updated_count INTEGER NOT NULL DEFAULT 0,
                    unchanged_count INTEGER NOT NULL DEFAULT 0,
                    error_text TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS frontier_candidates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    canonical_paper_id INTEGER NOT NULL,
                    source_name TEXT NOT NULL,
                    source_identifier TEXT NOT NULL,
                    source_basis TEXT NOT NULL DEFAULT 'abstract',
                    domains_json TEXT NOT NULL DEFAULT '[]',
                    matched_queries_json TEXT NOT NULL DEFAULT '[]',
                    categories_json TEXT NOT NULL DEFAULT '[]',
                    published_at TEXT NOT NULL DEFAULT '',
                    source_updated_at TEXT NOT NULL DEFAULT '',
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    latest_run_id TEXT NOT NULL,
                    review_status TEXT NOT NULL DEFAULT 'unreviewed',
                    payload_sha256 TEXT NOT NULL,
                    UNIQUE(source_name, source_identifier),
                    FOREIGN KEY(canonical_paper_id) REFERENCES canonical_papers(id),
                    FOREIGN KEY(latest_run_id) REFERENCES frontier_source_runs(id)
                );
                CREATE TABLE IF NOT EXISTS frontier_updates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_key TEXT NOT NULL,
                    source_label TEXT NOT NULL,
                    source_kind TEXT NOT NULL DEFAULT 'first_party',
                    source_identifier TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL DEFAULT '',
                    source_url TEXT NOT NULL,
                    domains_json TEXT NOT NULL DEFAULT '[]',
                    matched_queries_json TEXT NOT NULL DEFAULT '[]',
                    related_paper_refs_json TEXT NOT NULL DEFAULT '[]',
                    published_at TEXT NOT NULL DEFAULT '',
                    source_updated_at TEXT NOT NULL DEFAULT '',
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    latest_run_id TEXT NOT NULL,
                    review_status TEXT NOT NULL DEFAULT 'unreviewed',
                    payload_sha256 TEXT NOT NULL,
                    UNIQUE(source_key, source_identifier),
                    FOREIGN KEY(latest_run_id) REFERENCES frontier_source_runs(id)
                );
                CREATE TABLE IF NOT EXISTS frontier_term_candidates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    normalized_term TEXT NOT NULL UNIQUE,
                    display_term TEXT NOT NULL,
                    term_kind TEXT NOT NULL,
                    canonical_expansion TEXT NOT NULL DEFAULT '',
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    first_source_published_at TEXT NOT NULL DEFAULT '',
                    last_source_updated_at TEXT NOT NULL DEFAULT '',
                    review_status TEXT NOT NULL DEFAULT 'unreviewed'
                );
                CREATE TABLE IF NOT EXISTS frontier_term_evidence (
                    term_id INTEGER NOT NULL,
                    frontier_candidate_id INTEGER NOT NULL,
                    display_term TEXT NOT NULL,
                    expansion TEXT NOT NULL DEFAULT '',
                    context_text TEXT NOT NULL DEFAULT '',
                    extraction_rule TEXT NOT NULL,
                    payload_sha256 TEXT NOT NULL,
                    first_seen_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    PRIMARY KEY(term_id, frontier_candidate_id),
                    FOREIGN KEY(term_id) REFERENCES frontier_term_candidates(id),
                    FOREIGN KEY(frontier_candidate_id) REFERENCES frontier_candidates(id)
                );
                CREATE TABLE IF NOT EXISTS frontier_signals (
                    id TEXT PRIMARY KEY,
                    source_term_id INTEGER NOT NULL UNIQUE,
                    slug TEXT NOT NULL UNIQUE,
                    signal_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    change_summary TEXT NOT NULL,
                    why_it_matters TEXT NOT NULL DEFAULT '',
                    known_unknowns TEXT NOT NULL DEFAULT '',
                    counter_evidence TEXT NOT NULL DEFAULT '',
                    domain TEXT NOT NULL,
                    maturity TEXT NOT NULL DEFAULT 'candidate',
                    status TEXT NOT NULL DEFAULT 'draft',
                    source_basis TEXT NOT NULL DEFAULT 'abstract_context',
                    as_of_date TEXT NOT NULL,
                    editor_name TEXT NOT NULL DEFAULT '',
                    review_reason TEXT NOT NULL DEFAULT '',
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    reviewed_at TEXT,
                    published_at TEXT,
                    retracted_at TEXT,
                    FOREIGN KEY(source_term_id) REFERENCES frontier_term_candidates(id)
                );
                CREATE TABLE IF NOT EXISTS frontier_signal_evidence (
                    signal_id TEXT NOT NULL,
                    frontier_candidate_id INTEGER NOT NULL,
                    direction TEXT NOT NULL DEFAULT 'supports',
                    evidence_role TEXT NOT NULL DEFAULT 'naming_context',
                    context_text TEXT NOT NULL DEFAULT '',
                    source_basis TEXT NOT NULL DEFAULT 'abstract_context',
                    payload_sha256 TEXT NOT NULL,
                    added_at TEXT NOT NULL,
                    PRIMARY KEY(signal_id, frontier_candidate_id),
                    FOREIGN KEY(signal_id) REFERENCES frontier_signals(id),
                    FOREIGN KEY(frontier_candidate_id) REFERENCES frontier_candidates(id)
                );
                CREATE TABLE IF NOT EXISTS frontier_signal_revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signal_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    editor_name TEXT NOT NULL DEFAULT '',
                    reason TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    UNIQUE(signal_id, revision),
                    FOREIGN KEY(signal_id) REFERENCES frontier_signals(id)
                );
                CREATE TABLE IF NOT EXISTS editor_batches (
                    id TEXT PRIMARY KEY,
                    batch_kind TEXT NOT NULL,
                    scope_json TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'queued',
                    dry_run INTEGER NOT NULL DEFAULT 1,
                    requested_by TEXT NOT NULL DEFAULT '',
                    reason TEXT NOT NULL DEFAULT '',
                    model TEXT NOT NULL DEFAULT '',
                    prompt_version TEXT NOT NULL DEFAULT '',
                    total_items INTEGER NOT NULL DEFAULT 0,
                    pending_items INTEGER NOT NULL DEFAULT 0,
                    proposed_items INTEGER NOT NULL DEFAULT 0,
                    completed_items INTEGER NOT NULL DEFAULT 0,
                    failed_items INTEGER NOT NULL DEFAULT 0,
                    rejected_items INTEGER NOT NULL DEFAULT 0,
                    estimated_work REAL NOT NULL DEFAULT 0,
                    actual_work REAL NOT NULL DEFAULT 0,
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    paused_at TEXT,
                    finished_at TEXT,
                    updated_at TEXT NOT NULL,
                    error_text TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS editor_batch_items (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT NOT NULL,
                    item_kind TEXT NOT NULL,
                    item_ref TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    attempt INTEGER NOT NULL DEFAULT 1,
                    current_json TEXT NOT NULL DEFAULT '{}',
                    proposed_json TEXT NOT NULL DEFAULT '{}',
                    diff_json TEXT NOT NULL DEFAULT '[]',
                    decision TEXT NOT NULL DEFAULT '',
                    decision_reason TEXT NOT NULL DEFAULT '',
                    source_sha256 TEXT NOT NULL DEFAULT '',
                    model TEXT NOT NULL DEFAULT '',
                    prompt_version TEXT NOT NULL DEFAULT '',
                    estimated_work REAL NOT NULL DEFAULT 1,
                    actual_work REAL NOT NULL DEFAULT 0,
                    error_text TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    updated_at TEXT NOT NULL,
                    UNIQUE(batch_id, item_kind, item_ref),
                    FOREIGN KEY(batch_id) REFERENCES editor_batches(id)
                );
                CREATE TABLE IF NOT EXISTS editor_audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    actor TEXT NOT NULL DEFAULT '',
                    entity_kind TEXT NOT NULL DEFAULT '',
                    entity_id TEXT NOT NULL DEFAULT '',
                    batch_id TEXT NOT NULL DEFAULT '',
                    before_json TEXT NOT NULL DEFAULT '{}',
                    after_json TEXT NOT NULL DEFAULT '{}',
                    reason TEXT NOT NULL DEFAULT '',
                    model TEXT NOT NULL DEFAULT '',
                    prompt_version TEXT NOT NULL DEFAULT '',
                    work_units REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS knowledge_entities (
                    id TEXT PRIMARY KEY,
                    entity_kind TEXT NOT NULL,
                    canonical_name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'candidate',
                    source_kind TEXT NOT NULL DEFAULT 'editor',
                    source_ref TEXT NOT NULL DEFAULT '',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    reviewed_at TEXT,
                    merged_into_id TEXT,
                    UNIQUE(entity_kind, normalized_name),
                    FOREIGN KEY(merged_into_id) REFERENCES knowledge_entities(id)
                );
                CREATE TABLE IF NOT EXISTS knowledge_entity_aliases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_id TEXT NOT NULL,
                    entity_kind TEXT NOT NULL,
                    alias TEXT NOT NULL,
                    normalized_alias TEXT NOT NULL,
                    alias_kind TEXT NOT NULL DEFAULT 'editor',
                    source_kind TEXT NOT NULL DEFAULT 'editor',
                    source_ref TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(entity_id, normalized_alias),
                    FOREIGN KEY(entity_id) REFERENCES knowledge_entities(id)
                );
                CREATE TABLE IF NOT EXISTS knowledge_relationships (
                    id TEXT PRIMARY KEY,
                    from_entity_id TEXT NOT NULL,
                    to_entity_id TEXT NOT NULL,
                    relation_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'candidate',
                    evidence_json TEXT NOT NULL DEFAULT '[]',
                    source_kind TEXT NOT NULL DEFAULT 'editor',
                    source_ref TEXT NOT NULL DEFAULT '',
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    reviewed_at TEXT,
                    UNIQUE(from_entity_id, to_entity_id, relation_type),
                    FOREIGN KEY(from_entity_id) REFERENCES knowledge_entities(id),
                    FOREIGN KEY(to_entity_id) REFERENCES knowledge_entities(id)
                );
                CREATE TABLE IF NOT EXISTS coverage_gaps (
                    id TEXT PRIMARY KEY,
                    domain TEXT NOT NULL,
                    layer TEXT NOT NULL,
                    label TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    severity TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'open',
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    source_batch_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(domain, layer, label),
                    FOREIGN KEY(source_batch_id) REFERENCES editor_batches(id)
                );
                CREATE INDEX IF NOT EXISTS idx_paper_aliases_paper ON paper_aliases(canonical_paper_id);
                CREATE INDEX IF NOT EXISTS idx_canonical_papers_created
                    ON canonical_papers(created_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_research_projects_created
                    ON research_projects(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_analysis_requests_paper ON analysis_requests(canonical_paper_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_analysis_requests_status ON analysis_requests(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_analysis_stage_runs_request ON analysis_stage_runs(analysis_request_id, position, attempt DESC);
                CREATE INDEX IF NOT EXISTS idx_paper_analyses_paper ON paper_analyses(canonical_paper_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_analysis_materials_status ON analysis_materials(status, updated_at);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_frontier_source_active
                    ON frontier_source_runs(source_name) WHERE status='running';
                CREATE INDEX IF NOT EXISTS idx_frontier_candidates_recent
                    ON frontier_candidates(source_updated_at DESC, last_seen_at DESC);
                CREATE INDEX IF NOT EXISTS idx_frontier_candidates_review
                    ON frontier_candidates(review_status, source_updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_frontier_updates_recent
                    ON frontier_updates(source_updated_at DESC, published_at DESC);
                CREATE INDEX IF NOT EXISTS idx_frontier_updates_review
                    ON frontier_updates(review_status, source_updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_frontier_term_candidates_recent
                    ON frontier_term_candidates(last_source_updated_at DESC, last_seen_at DESC);
                CREATE INDEX IF NOT EXISTS idx_frontier_term_evidence_candidate
                    ON frontier_term_evidence(frontier_candidate_id, term_id);
                CREATE INDEX IF NOT EXISTS idx_frontier_signals_status
                    ON frontier_signals(status, published_at DESC, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_frontier_signal_evidence_candidate
                    ON frontier_signal_evidence(frontier_candidate_id, signal_id);
                CREATE INDEX IF NOT EXISTS idx_frontier_signal_revisions_signal
                    ON frontier_signal_revisions(signal_id, revision DESC);
                CREATE INDEX IF NOT EXISTS idx_editor_batches_status
                    ON editor_batches(status, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_editor_batch_items_batch
                    ON editor_batch_items(batch_id, status, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_editor_audit_created
                    ON editor_audit_events(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_editor_entities_kind_status
                    ON knowledge_entities(entity_kind, status, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_editor_aliases_lookup
                    ON knowledge_entity_aliases(entity_kind, normalized_alias, status);
                CREATE INDEX IF NOT EXISTS idx_editor_relationships_status
                    ON knowledge_relationships(status, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_coverage_gaps_status
                    ON coverage_gaps(status, severity, updated_at DESC);
                """
            )
            self._ensure_column(db, "canonical_papers", "abstract", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(db, "canonical_papers", "pdf_url", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(db, "analysis_requests", "lease_owner", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(db, "analysis_requests", "lease_token_sha256", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(db, "analysis_requests", "lease_expires_at", "TEXT")
            self._ensure_column(db, "analysis_requests", "lease_heartbeat_at", "TEXT")
            self._ensure_column(db, "analysis_requests", "worker_claim_count", "INTEGER NOT NULL DEFAULT 0")
            self._backfill_stage_runs(db)
            self._backfill_analysis_materials(db)
            version_row = db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()
            if version_row is None:
                db.execute("INSERT INTO app_metadata(key, value) VALUES('schema_version', '7')")
            else:
                try:
                    existing_version = int(version_row["value"])
                except (TypeError, ValueError) as error:
                    raise AtlasError("Atlas schema_version 无效") from error
                if existing_version < 7:
                    db.execute("UPDATE app_metadata SET value='7' WHERE key='schema_version'")
            # Foreign-key mode can only change outside a transaction. Commit
            # base-schema compatibility repairs before the atomic migration chain.
            db.commit()
            self._run_migrations(db)
            # Schema 12 existed briefly during development before the claim-import
            # run ledger was added. Reapplying the idempotent DDL repairs only that
            # unreleased shape and leaves the migration ledger unchanged.
            self._migrate_v11_to_v12(db)
            self._ensure_column(
                db,
                "claim_candidates",
                "reviewed_relation",
                "TEXT NOT NULL DEFAULT ''",
            )
            # Repair databases opened by an early schema-11 development build.
            self._backfill_research_view_run_sequences(db)
            # Phase 5 was developed against temporary v8 databases before release. Keep
            # those databases readable while the final v8 contract gains private-focus
            # and frozen-digest fields.
            self._ensure_column(db, "focus_profiles", "method_ids_json", "TEXT NOT NULL DEFAULT '[]'")
            self._ensure_column(db, "focus_profiles", "problem_ids_json", "TEXT NOT NULL DEFAULT '[]'")
            self._ensure_column(db, "focus_profiles", "thread_ids_json", "TEXT NOT NULL DEFAULT '[]'")
            self._ensure_column(db, "research_digests", "digest_type", "TEXT NOT NULL DEFAULT 'private'")
            self._ensure_column(db, "research_digests", "as_of", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(db, "research_digests", "source_snapshot_json", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(db, "research_digests", "updated_at", "TEXT NOT NULL DEFAULT ''")
            db.execute(
                "INSERT OR IGNORE INTO app_metadata(key, value) VALUES('search_cursor_secret', ?)",
                (os.urandom(32).hex(),),
            )
            # Re-run the v15 guard installation on every startup. This keeps
            # already-stamped databases aligned with the integrity rules and
            # rejects corruption before any public projection is served.
            self._migrate_v14_to_v15(db)
            # v16 is intentionally idempotent on already-migrated databases;
            # this also repairs databases created by an early phase-9 build.
            self._migrate_v15_to_v16(db)

    @staticmethod
    def _stage_plan(sections: list[str]) -> list[tuple[str, str]]:
        return [
            (key, label)
            for key, label in ANALYSIS_STAGES
            if key in sections or key in {"structure", "claims", "citations"}
        ]

    def _backfill_analysis_materials(self, db: sqlite3.Connection) -> None:
        rows = db.execute(
            """
            SELECT request.id AS request_id, request.canonical_paper_id, request.created_at,
                   paper.pdf_url
            FROM analysis_requests request
            JOIN canonical_papers paper ON paper.id=request.canonical_paper_id
            LEFT JOIN analysis_materials material ON material.analysis_request_id=request.id
            WHERE material.id IS NULL
            ORDER BY request.created_at
            """
        ).fetchall()
        now = utc_now()
        for row in rows:
            source_url = clean_http_url(row["pdf_url"])
            db.execute(
                """
                INSERT INTO analysis_materials(
                    id, analysis_request_id, canonical_paper_id, authorization_mode,
                    source_url, download_authorized, external_processing_authorized,
                    status, created_at, updated_at
                ) VALUES (?, ?, ?, 'none', ?, 0, 0, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    row["request_id"],
                    row["canonical_paper_id"],
                    source_url,
                    "awaiting_authorization" if source_url else "unavailable",
                    row["created_at"] or now,
                    now,
                ),
            )

    def _backfill_stage_runs(self, db: sqlite3.Connection) -> None:
        rows = db.execute("SELECT * FROM analysis_requests ORDER BY created_at").fetchall()
        now = utc_now()
        for row in rows:
            existing = db.execute(
                "SELECT 1 FROM analysis_stage_runs WHERE analysis_request_id=? LIMIT 1",
                (row["id"],),
            ).fetchone()
            if existing:
                continue
            requested = json.loads(row["requested_sections_json"] or "[]")
            legacy_progress = {
                item.get("key"): item
                for item in json.loads(row["progress_json"] or "[]")
                if isinstance(item, dict) and item.get("key")
            }
            for position, (key, label) in enumerate(self._stage_plan(requested)):
                legacy = legacy_progress.get(key, {})
                status = compact_text(legacy.get("status"), 20)
                if status not in STAGE_STATUS:
                    status = "pending"
                try:
                    percent = max(0, min(100, int(legacy.get("percent") or 0)))
                except (TypeError, ValueError):
                    percent = 0
                db.execute(
                    """
                    INSERT INTO analysis_stage_runs(
                        analysis_request_id, stage_key, stage_label, position, attempt,
                        status, percent, updated_at
                    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
                    """,
                    (row["id"], key, label, position, status, percent, row["updated_at"] or now),
                )

    @staticmethod
    def _latest_stage_rows(db: sqlite3.Connection, task_id: str) -> list[sqlite3.Row]:
        return db.execute(
            """
            SELECT stage.*
            FROM analysis_stage_runs stage
            JOIN (
                SELECT stage_key, MAX(attempt) AS attempt
                FROM analysis_stage_runs
                WHERE analysis_request_id=?
                GROUP BY stage_key
            ) latest ON latest.stage_key=stage.stage_key AND latest.attempt=stage.attempt
            WHERE stage.analysis_request_id=?
            ORDER BY stage.position
            """,
            (task_id, task_id),
        ).fetchall()

    @staticmethod
    def _stage_from_row(row: sqlite3.Row, include_content: bool = False) -> dict[str, Any]:
        result = {
            "key": row["stage_key"],
            "label": row["stage_label"],
            "status": row["status"],
            "percent": row["percent"],
            "attempt": row["attempt"],
            "source_basis": row["source_basis"],
            "model": row["model"],
            "prompt_version": row["prompt_version"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            "updated_at": row["updated_at"],
            "error_text": row["error_text"],
            "result_available": bool(row["content_json"] and row["content_json"] != "{}"),
        }
        if include_content:
            result["content"] = json.loads(row["content_json"] or "{}")
            result["source_sha256"] = row["source_sha256"]
        return result

    @staticmethod
    def _analysis_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["sections"] = json.loads(result.pop("sections_json") or "[]")
        result["content"] = json.loads(result.pop("content_json") or "{}")
        for stage_key, stage in result["content"].items():
            if not isinstance(stage, dict):
                continue
            stage_basis = compact_text(stage.get("source_basis") or result.get("source_basis"), 40)
            stage_hash = compact_text(stage.get("source_sha256"), 64)
            for position, section in enumerate(stage.get("sections", []), start=1):
                if not isinstance(section, dict):
                    continue
                if not section.get("claim_id"):
                    seed = json.dumps(
                        {
                            "stage": stage_key,
                            "title": section.get("title", ""),
                            "body": section.get("body", ""),
                            "source_kind": section.get("source_kind", ""),
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                    section["claim_id"] = f"claim-{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:20]}"
                for evidence_position, evidence in enumerate(section.get("evidence", []), start=1):
                    if not isinstance(evidence, dict):
                        continue
                    evidence.setdefault("source_type", stage_basis)
                    evidence.setdefault("source_sha256", stage_hash)
                    evidence.setdefault(
                        "locator_complete",
                        bool(
                            evidence.get("page")
                            or evidence.get("section")
                            or evidence.get("figure")
                            or evidence.get("table")
                        ),
                    )
                    if not evidence.get("evidence_id"):
                        seed = json.dumps(
                            {
                                "claim_id": section["claim_id"],
                                "position": evidence_position,
                                **evidence,
                            },
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                        )
                        evidence["evidence_id"] = (
                            f"evidence-{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:20]}"
                        )
        claims = [
            section
            for stage in result["content"].values()
            if isinstance(stage, dict)
            for section in stage.get("sections", [])
            if isinstance(section, dict)
            and section.get("source_kind") in {"paper_claim", "platform_derivation"}
        ]
        located = [
            section
            for section in claims
            if any(
                evidence.get("locator_complete")
                for evidence in section.get("evidence", [])
                if isinstance(evidence, dict)
            )
        ]
        hashed = [
            section
            for section in claims
            if any(
                evidence.get("source_sha256")
                for evidence in section.get("evidence", [])
                if isinstance(evidence, dict)
            )
        ]
        denominator = len(claims)
        result["coverage"] = {
            "definition": "可核查的 paper_claim 与 platform_derivation 条目中，至少有一个页码、章节或图表定位的比例。",
            "claim_denominator": denominator,
            "located_claims": len(located),
            "hashed_claims": len(hashed),
            "locator_ratio": round(len(located) / denominator, 4) if denominator else None,
            "material_hash_ratio": round(len(hashed) / denominator, 4) if denominator else None,
        }
        return result

    @staticmethod
    def _material_from_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        result = dict(row)
        result["download_authorized"] = bool(result["download_authorized"])
        result["external_processing_authorized"] = bool(result["external_processing_authorized"])
        result["execution_ready"] = bool(
            result["download_authorized"]
            and result["external_processing_authorized"]
            and result["status"] == "ready"
        )
        return result

    @staticmethod
    def _paper_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["authors"] = json.loads(result.pop("authors_json") or "[]")
        result["topics"] = json.loads(result.pop("topics_json") or "[]")
        alias_rows = db.execute(
            "SELECT namespace, external_id FROM paper_aliases WHERE canonical_paper_id=? ORDER BY namespace, external_id",
            (result["id"],),
        ).fetchall()
        result["aliases"] = [dict(item) for item in alias_rows]
        result["paperfield_id"] = next(
            (item["external_id"] for item in alias_rows if item["namespace"] == "paperfield"),
            "",
        )
        result["curriculum"] = curriculum_context_for_paper(result.get("canonical_ref"))
        return result

    @staticmethod
    def _project_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["topics"] = json.loads(result.pop("topics_json") or "[]")
        return result

    @staticmethod
    def _frontier_source_run_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["query_spec"] = json.loads(result.pop("query_spec_json") or "[]")
        result["query_results"] = json.loads(result.pop("query_results_json") or "[]")
        started = parse_utc(result.get("started_at"))
        finished = parse_utc(result.get("finished_at"))
        result["duration_ms"] = (
            max(0, round((finished - started).total_seconds() * 1000))
            if started and finished
            else None
        )
        result["transport_channels"] = sorted(
            {
                compact_text(item.get("transport"), 40)
                for item in result["query_results"]
                if isinstance(item, dict) and compact_text(item.get("transport"), 40)
            }
        )
        result["source_watermark"] = result.get("finished_at") or result.get("started_at") or ""
        result["counts"] = {
            "fetched": int(result.get("fetched_count") or 0),
            "accepted": int(result.get("accepted_count") or 0),
            "new": int(result.get("new_count") or 0),
            "updated": int(result.get("updated_count") or 0),
            "unchanged": int(result.get("unchanged_count") or 0),
        }
        return result

    @staticmethod
    def _frontier_candidate_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["domains"] = json.loads(result.pop("domains_json") or "[]")
        result["matched_queries"] = json.loads(result.pop("matched_queries_json") or "[]")
        result["categories"] = json.loads(result.pop("categories_json") or "[]")
        paper_row = db.execute(
            "SELECT * FROM canonical_papers WHERE id=?",
            (result["canonical_paper_id"],),
        ).fetchone()
        result["paper"] = AtlasStore._paper_from_row(db, paper_row) if paper_row else None
        return result

    @staticmethod
    def _frontier_update_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["domains"] = json.loads(result.pop("domains_json") or "[]")
        result["matched_queries"] = json.loads(result.pop("matched_queries_json") or "[]")
        result["related_paper_refs"] = json.loads(result.pop("related_paper_refs_json") or "[]")
        return result

    @staticmethod
    def _frontier_term_from_row(
        db: sqlite3.Connection,
        row: sqlite3.Row,
        evidence_limit: int = 6,
    ) -> dict[str, Any]:
        result = dict(row)
        evidence_count = int(result.pop("evidence_count", 0) or 0)
        evidence_rows = db.execute(
            """
            SELECT e.*, c.canonical_paper_id, c.source_name, c.source_identifier,
                   c.domains_json, c.published_at, c.source_updated_at
            FROM frontier_term_evidence e
            JOIN frontier_candidates c ON c.id=e.frontier_candidate_id
            WHERE e.term_id=?
            ORDER BY c.source_updated_at DESC, c.published_at DESC
            LIMIT ?
            """,
            (result["id"], max(1, min(20, int(evidence_limit)))),
        ).fetchall()
        evidence: list[dict[str, Any]] = []
        domains: list[str] = []
        for evidence_row in evidence_rows:
            item = dict(evidence_row)
            item.pop("term_id", None)
            item["candidate_id"] = item.pop("frontier_candidate_id")
            item_domains = json.loads(item.pop("domains_json") or "[]")
            domains.extend(item_domains)
            paper_row = db.execute(
                "SELECT * FROM canonical_papers WHERE id=?",
                (item.pop("canonical_paper_id"),),
            ).fetchone()
            item["paper"] = AtlasStore._paper_from_row(db, paper_row) if paper_row else None
            evidence.append(item)
        result["domains"] = clean_string_list(domains, 80, 12)
        result["evidence_count"] = evidence_count
        result["independent_paper_count"] = evidence_count
        result["adoption_status"] = "cross_paper" if evidence_count >= 2 else "single_paper"
        result["evidence"] = evidence
        return result

    @staticmethod
    def _frontier_signal_from_row(
        db: sqlite3.Connection,
        row: sqlite3.Row,
        include_revisions: bool = False,
    ) -> dict[str, Any]:
        result = dict(row)
        term_row = db.execute(
            "SELECT * FROM frontier_term_candidates WHERE id=?",
            (result["source_term_id"],),
        ).fetchone()
        result["source_term"] = dict(term_row) if term_row else None
        evidence_rows = db.execute(
            """
            SELECT evidence.*, candidate.canonical_paper_id, candidate.source_name,
                   candidate.source_identifier, candidate.domains_json,
                   candidate.published_at, candidate.source_updated_at
            FROM frontier_signal_evidence evidence
            JOIN frontier_candidates candidate ON candidate.id=evidence.frontier_candidate_id
            WHERE evidence.signal_id=?
            ORDER BY candidate.source_updated_at DESC, candidate.published_at DESC
            """,
            (result["id"],),
        ).fetchall()
        evidence: list[dict[str, Any]] = []
        for evidence_row in evidence_rows:
            item = dict(evidence_row)
            item.pop("signal_id", None)
            item["candidate_id"] = item.pop("frontier_candidate_id")
            item["domains"] = json.loads(item.pop("domains_json") or "[]")
            paper_row = db.execute(
                "SELECT * FROM canonical_papers WHERE id=?",
                (item.pop("canonical_paper_id"),),
            ).fetchone()
            item["paper"] = AtlasStore._paper_from_row(db, paper_row) if paper_row else None
            evidence.append(item)
        result["evidence"] = evidence
        result["evidence_count"] = len(evidence)
        result["independent_paper_count"] = len({item["paper"]["id"] for item in evidence if item["paper"]})
        if include_revisions:
            revision_rows = db.execute(
                """
                SELECT revision, action, snapshot_json, editor_name, reason, created_at
                FROM frontier_signal_revisions
                WHERE signal_id=?
                ORDER BY revision DESC
                LIMIT 50
                """,
                (result["id"],),
            ).fetchall()
            result["revisions"] = [
                {
                    **{key: revision[key] for key in ("revision", "action", "editor_name", "reason", "created_at")},
                    "snapshot": json.loads(revision["snapshot_json"] or "{}"),
                }
                for revision in revision_rows
            ]
        return result

    @staticmethod
    def _editor_json(value: Any, fallback: Any) -> Any:
        if value in (None, ""):
            return fallback
        try:
            return json.loads(value) if isinstance(value, str) else value
        except (TypeError, ValueError, json.JSONDecodeError):
            return fallback

    @staticmethod
    def _batch_from_row(
        db: sqlite3.Connection,
        row: sqlite3.Row,
        include_items: bool = False,
    ) -> dict[str, Any]:
        result = dict(row)
        result["scope"] = AtlasStore._editor_json(result.pop("scope_json", "{}"), {})
        result["dry_run"] = bool(result.get("dry_run"))
        result["metrics"] = {
            "total": result.get("total_items", 0),
            "pending": result.get("pending_items", 0),
            "proposed": result.get("proposed_items", 0),
            "completed": result.get("completed_items", 0),
            "failed": result.get("failed_items", 0),
            "rejected": result.get("rejected_items", 0),
            "estimated_work": result.get("estimated_work", 0),
            "actual_work": result.get("actual_work", 0),
            "duration_ms": result.get("duration_ms", 0),
            "completion_rate": round(
                float(result.get("completed_items", 0)) / max(1, int(result.get("total_items", 0))),
                4,
            ),
            "failure_rate": round(
                float(result.get("failed_items", 0)) / max(1, int(result.get("total_items", 0))),
                4,
            ),
        }
        if include_items:
            rows = db.execute(
                "SELECT * FROM editor_batch_items WHERE batch_id=? ORDER BY created_at, id",
                (result["id"],),
            ).fetchall()
            result["items"] = [AtlasStore._batch_item_from_row(item) for item in rows]
        return result

    @staticmethod
    def _batch_item_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["current"] = AtlasStore._editor_json(result.pop("current_json", "{}"), {})
        result["proposed"] = AtlasStore._editor_json(result.pop("proposed_json", "{}"), {})
        result["diff"] = AtlasStore._editor_json(result.pop("diff_json", "[]"), [])
        return result

    @staticmethod
    def _entity_snapshot(row: sqlite3.Row | None) -> dict[str, Any]:
        if row is None:
            return {}
        return {
            "id": row["id"],
            "entity_kind": row["entity_kind"],
            "canonical_name": row["canonical_name"],
            "description": row["description"],
            "status": row["status"],
            "source_kind": row["source_kind"],
            "source_ref": row["source_ref"],
            "metadata": AtlasStore._editor_json(row["metadata_json"], {}),
            "revision": row["revision"],
            "reviewed_at": row["reviewed_at"],
            "merged_into_id": row["merged_into_id"],
        }

    @staticmethod
    def _entity_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        result = AtlasStore._entity_snapshot(row)
        alias_rows = db.execute(
            """
            SELECT id, alias, alias_kind, source_kind, source_ref, status, created_at, updated_at
            FROM knowledge_entity_aliases
            WHERE entity_id=?
            ORDER BY normalized_alias
            """,
            (row["id"],),
        ).fetchall()
        result["aliases"] = [dict(item) for item in alias_rows]
        result["relationship_count"] = int(
            db.execute(
                """
                SELECT COUNT(*) FROM knowledge_relationships
                WHERE from_entity_id=? OR to_entity_id=?
                """,
                (row["id"], row["id"]),
            ).fetchone()[0]
        )
        return result

    @staticmethod
    def _relationship_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["evidence"] = AtlasStore._editor_json(result.pop("evidence_json", "[]"), [])
        from_row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (row["from_entity_id"],)).fetchone()
        to_row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (row["to_entity_id"],)).fetchone()
        result["from_entity"] = AtlasStore._entity_snapshot(from_row) if from_row else None
        result["to_entity"] = AtlasStore._entity_snapshot(to_row) if to_row else None
        return result

    @staticmethod
    def _coverage_gap_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["metrics"] = AtlasStore._editor_json(result.pop("metrics_json", "{}"), {})
        return result

    @staticmethod
    def _audit_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["before"] = AtlasStore._editor_json(result.pop("before_json", "{}"), {})
        result["after"] = AtlasStore._editor_json(result.pop("after_json", "{}"), {})
        return result

    @staticmethod
    def _sync_run_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return dict(row)

    @staticmethod
    def _task_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        lease_token_sha256 = result.pop("lease_token_sha256", "")
        result["requested_sections"] = json.loads(result.pop("requested_sections_json") or "[]")
        result.pop("progress_json", None)
        result["progress"] = [
            AtlasStore._stage_from_row(stage)
            for stage in AtlasStore._latest_stage_rows(db, result["id"])
        ]
        if result["progress"]:
            result["percent"] = round(sum(item["percent"] for item in result["progress"]) / len(result["progress"]))
        else:
            result["percent"] = 0
        paper_row = db.execute("SELECT * FROM canonical_papers WHERE id=?", (result["canonical_paper_id"],)).fetchone()
        result["paper"] = AtlasStore._paper_from_row(db, paper_row) if paper_row else None
        material_row = db.execute(
            "SELECT * FROM analysis_materials WHERE analysis_request_id=?",
            (result["id"],),
        ).fetchone()
        result["material"] = AtlasStore._material_from_row(material_row)
        result["worker_lease"] = {
            "claimed": bool(lease_token_sha256),
            "worker_id": result.pop("lease_owner", ""),
            "expires_at": result.pop("lease_expires_at", None),
            "heartbeat_at": result.pop("lease_heartbeat_at", None),
            "claim_count": result.pop("worker_claim_count", 0),
        }
        return result

    def _upsert_paper_with_db(self, db: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
        canonical_ref = canonical_paper_ref(payload)
        title = compact_text(payload.get("title"), 1000)
        expected_title = compact_text(payload.get("expectedTitle") or payload.get("expected_title"), 1000)
        if expected_title and title and normalized_title(expected_title) != normalized_title(title):
            raise ConflictError("论文标题与 expectedTitle 不一致")
        if expected_title:
            existing = db.execute(
                "SELECT title FROM canonical_papers WHERE canonical_ref=?",
                (canonical_ref,),
            ).fetchone()
            if existing and normalized_title(existing["title"]) != normalized_title(expected_title):
                raise ConflictError("canonicalRef 已对应另一篇论文标题")
        abstract = clean_multiline_text(payload.get("abstract"), 30000)
        authors = clean_string_list(payload.get("authors"), 240, 100)
        venue = compact_text(payload.get("venue"), 300)
        published = compact_text(payload.get("published"), 40)
        version = source_version(payload)
        source_url = clean_http_url(payload.get("sourceUrl") or payload.get("source_url"))
        pdf_url = clean_http_url(payload.get("pdfUrl") or payload.get("pdf_url"))
        doi = normalize_doi(payload.get("doi"))
        topics = clean_string_list(payload.get("topics"), 120, 20)
        now = utc_now()
        db.execute(
            """
            INSERT INTO canonical_papers(
                canonical_ref, title, normalized_title, abstract, authors_json, venue, published,
                current_version, source_url, pdf_url, doi, topics_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(canonical_ref) DO UPDATE SET
                title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE canonical_papers.title END,
                normalized_title=CASE WHEN excluded.normalized_title<>'' THEN excluded.normalized_title ELSE canonical_papers.normalized_title END,
                abstract=CASE WHEN length(excluded.abstract)>length(canonical_papers.abstract) THEN excluded.abstract ELSE canonical_papers.abstract END,
                authors_json=CASE WHEN excluded.authors_json<>'[]' THEN excluded.authors_json ELSE canonical_papers.authors_json END,
                venue=CASE WHEN excluded.venue<>'' THEN excluded.venue ELSE canonical_papers.venue END,
                published=CASE WHEN excluded.published<>'' THEN excluded.published ELSE canonical_papers.published END,
                current_version=CASE WHEN excluded.current_version<>'' THEN excluded.current_version ELSE canonical_papers.current_version END,
                source_url=CASE WHEN excluded.source_url<>'' THEN excluded.source_url ELSE canonical_papers.source_url END,
                pdf_url=CASE WHEN excluded.pdf_url<>'' THEN excluded.pdf_url ELSE canonical_papers.pdf_url END,
                doi=CASE WHEN excluded.doi<>'' THEN excluded.doi ELSE canonical_papers.doi END,
                topics_json=CASE WHEN excluded.topics_json<>'[]' THEN excluded.topics_json ELSE canonical_papers.topics_json END,
                updated_at=excluded.updated_at
            """,
            (
                canonical_ref, title, normalized_title(title), abstract, json.dumps(authors, ensure_ascii=False), venue,
                published, version, source_url, pdf_url, doi, json.dumps(topics, ensure_ascii=False), now, now,
            ),
        )
        row = db.execute("SELECT * FROM canonical_papers WHERE canonical_ref=?", (canonical_ref,)).fetchone()
        assert row is not None
        if pdf_url:
            db.execute(
                """
                UPDATE analysis_materials
                SET source_url=?, status=CASE WHEN status='unavailable' THEN 'awaiting_authorization' ELSE status END,
                    updated_at=?
                WHERE canonical_paper_id=? AND source_url=''
                """,
                (pdf_url, now, row["id"]),
            )
        aliases: list[tuple[str, str, str]] = []
        paperfield_id = compact_text(payload.get("paperfieldId") or payload.get("paperfield_id"), 500)
        if paperfield_id:
            aliases.append(("paperfield", paperfield_id, "paperfield-bridge"))
        prefix, _separator, identifier = canonical_ref.partition(":")
        if prefix in {"doi", "arxiv", "openreview"} and identifier:
            aliases.append((prefix, identifier, "canonical-ref"))
        doi_alias = normalize_doi(payload.get("doi"))
        if doi_alias:
            aliases.append(("doi", doi_alias, "paper-metadata"))
        for value in (
            payload.get("arxivId"),
            payload.get("arxiv_id"),
            payload.get("sourceUrl"),
            payload.get("source_url"),
            payload.get("pdfUrl"),
            payload.get("pdf_url"),
        ):
            arxiv_alias = arxiv_id_from(value)
            if arxiv_alias:
                aliases.append(("arxiv", arxiv_alias, "paper-metadata"))
                break
        for value in (
            payload.get("openreviewId"),
            payload.get("openreview_id"),
            payload.get("sourceUrl"),
            payload.get("source_url"),
        ):
            openreview_alias = openreview_id_from(value)
            if openreview_alias:
                aliases.append(("openreview", openreview_alias, "paper-metadata"))
                break
        explicit = compact_text(payload.get("canonicalRef") or payload.get("canonical_ref"), 500)
        if explicit.startswith("paperfield:"):
            aliases.append(("paperfield", explicit.split(":", 1)[1], "paperfield-bridge"))
        for namespace, external_id, source in aliases:
            db.execute(
                """
                INSERT INTO paper_aliases(canonical_paper_id, namespace, external_id, source, verified_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(namespace, external_id) DO UPDATE SET
                    canonical_paper_id=excluded.canonical_paper_id,
                    source=excluded.source,
                    verified_at=excluded.verified_at
                """,
                (row["id"], namespace, external_id, source, now),
            )
        return self._paper_from_row(db, row)

    def upsert_paper(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock, self.connect() as db:
            return self._upsert_paper_with_db(db, payload)

    def resolve_paper(self, reference: str) -> dict[str, Any] | None:
        value = compact_text(reference, 500)
        if not value:
            return None
        with self.connect() as db:
            row = db.execute("SELECT * FROM canonical_papers WHERE canonical_ref=?", (value,)).fetchone()
            if not row:
                namespace, separator, external_id = value.partition(":")
                if separator and external_id:
                    row = db.execute(
                        """
                        SELECT p.* FROM canonical_papers p
                        JOIN paper_aliases a ON a.canonical_paper_id=p.id
                        WHERE a.namespace=? AND a.external_id=?
                        """,
                        (namespace, external_id),
                    ).fetchone()
            return self._paper_from_row(db, row) if row else None

    def get_paper(self, paper_id: int, owner_id: str = "local") -> dict[str, Any]:
        owner = self._learning_owner(owner_id)
        with self.connect() as db:
            row = db.execute("SELECT * FROM canonical_papers WHERE id=?", (paper_id,)).fetchone()
            if not row:
                raise NotFoundError("论文档案不存在")
            paper = self._paper_from_row(db, row)
            task_rows = db.execute(
                "SELECT * FROM analysis_requests WHERE canonical_paper_id=? AND owner_id=? ORDER BY created_at DESC",
                (paper_id, owner),
            ).fetchall()
            paper["analysis_requests"] = [self._task_from_row(db, item) for item in task_rows]
            analysis_row = db.execute(
                "SELECT * FROM paper_analyses WHERE canonical_paper_id=? AND owner_id=? ORDER BY updated_at DESC LIMIT 1",
                (paper_id, owner),
            ).fetchone()
            paper["dossier"] = self._analysis_from_row(analysis_row) if analysis_row else None
            paper["dossier_status"] = paper["dossier"]["status"] if paper["dossier"] else "not_generated"
            return paper

    @staticmethod
    def _paperfield_path(
        paper: dict[str, Any],
        page: Any = None,
        locator: dict[str, Any] | None = None,
    ) -> str:
        paperfield_id = compact_text(paper.get("paperfield_id"), 500)
        params: dict[str, Any]
        if paperfield_id:
            params = {"paper": paperfield_id}
        else:
            params = {
                "paper_ref": paper.get("canonical_ref", ""),
                "action": "resolve",
            }
        # Atlas is the map and Paperfield owns the PDF reader.  Deep links
        # should land in that reader rather than the metadata detail pane.
        params["reader"] = "1"
        try:
            page_number = int(page)
        except (TypeError, ValueError):
            page_number = 0
        if page_number > 0:
            params["page"] = page_number
        if isinstance(locator, dict):
            for key, maximum in (
                ("section", 500),
                ("figure", 200),
                ("table", 200),
                ("equation", 200),
                ("quote", 1000),
            ):
                value = compact_text(locator.get(key), maximum)
                if value:
                    params[key] = value
        return "/?" + urllib.parse.urlencode(params)

    def export_dossier(self, paper_id: int, format: str = "json", owner_id: str = "local") -> dict[str, Any]:
        paper = self.get_paper(paper_id, owner_id)
        dossier = paper.get("dossier")
        if dossier is None:
            raise NotFoundError("论文档案尚未生成")
        export = {
            "schema_version": 1,
            "exported_at": utc_now(),
            "paper": {
                "id": paper["id"],
                "canonical_ref": paper["canonical_ref"],
                "title": paper["title"],
                "current_version": paper.get("current_version", ""),
                "source_url": paper.get("source_url", ""),
                "paperfield_id": paper.get("paperfield_id", ""),
                "paperfield_path": self._paperfield_path(paper),
            },
            "dossier": {
                "id": dossier["id"],
                "analysis_level": dossier["analysis_level"],
                "source_basis": dossier["source_basis"],
                "source_sha256": dossier["source_sha256"],
                "model": dossier["model"],
                "prompt_version": dossier["prompt_version"],
                "status": dossier["status"],
                "generated_at": dossier["generated_at"],
                "updated_at": dossier["updated_at"],
                "coverage": dossier.get("coverage", {}),
            },
            "stages": dossier.get("content", {}),
        }
        if format.casefold() == "json":
            return export
        if format.casefold() != "markdown":
            raise AtlasError("导出格式只支持 json 或 markdown")
        lines = [
            f"# {paper.get('title') or 'Untitled'}",
            "",
            f"- Canonical ref: `{paper.get('canonical_ref', '')}`",
            f"- Paperfield: `{export['paper']['paperfield_path']}`",
            f"- Paper version: `{dossier.get('current_version') or paper.get('current_version') or 'unlabeled'}`",
            f"- Analysis level: `{dossier.get('analysis_level', '')}`",
            f"- Source basis: `{dossier.get('source_basis', '')}`",
            f"- Source SHA-256: `{dossier.get('source_sha256', '') or 'mixed/none'}`",
            f"- Model: `{dossier.get('model', '') or 'unrecorded'}`",
            f"- Prompt version: `{dossier.get('prompt_version', '') or 'unrecorded'}`",
            "",
            "## Evidence coverage",
            "",
            json.dumps(dossier.get("coverage", {}), ensure_ascii=False, indent=2),
        ]
        for stage_key, stage in dossier.get("content", {}).items():
            if not isinstance(stage, dict):
                continue
            lines.extend(["", f"## {stage_key}", "", stage.get("summary", "")])
            for section in stage.get("sections", []):
                lines.extend(
                    [
                        "",
                        f"### {section.get('title', 'Claim')} (`{section.get('claim_id', '')}`)",
                        "",
                        section.get("body", ""),
                    ]
                )
                for evidence in section.get("evidence", []):
                    locator = ", ".join(
                        str(value)
                        for value in (
                            f"p.{evidence.get('page')}" if evidence.get("page") else "",
                            evidence.get("section", ""),
                            evidence.get("figure", ""),
                            evidence.get("table", ""),
                        )
                        if value
                    ) or "locator unavailable"
                    page_path = self._paperfield_path(
                        paper, evidence.get("page"), evidence
                    )
                    lines.append(
                        f"- Evidence `{evidence.get('evidence_id', '')}` [{evidence.get('direction', 'supports')}]: "
                        f"{locator}; source `{evidence.get('source_sha256', '') or 'unhashed'}`; "
                        f"[Open in Paperfield]({page_path})"
                    )
        return {"schema_version": 1, "content": "\n".join(lines) + "\n", "export": export}

    def export_paper_flowloom_context(
        self,
        paper_id: int,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        """Export a bounded, source-labelled paper dossier for Flowloom.

        This endpoint deliberately does not call a model or include raw PDF
        bytes.  It only forwards dossier material that already has a paper
        locator, keeps unknowns explicit, and records the user confirmation in
        the editor audit trail.
        """
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        if payload.get("confirmed") is not True:
            raise AtlasError("Flowloom paper context export requires explicit confirmation")
        paper = self.get_paper(paper_id, owner_id)
        dossier = paper.get("dossier")
        if dossier is None:
            raise NotFoundError("paper dossier is not available yet")

        def valid_hash(value: Any) -> str:
            candidate = compact_text(value, 64).lower()
            return candidate if re.fullmatch(r"[a-f0-9]{64}", candidate) else ""

        def bounded_locator(evidence: dict[str, Any]) -> dict[str, Any]:
            locator: dict[str, Any] = {
                "kind": "paper",
                "canonical_paper_ref": paper.get("canonical_ref", ""),
                "paperfield_id": paper.get("paperfield_id", ""),
                "url": clean_http_url(evidence.get("source_url")) or paper.get("pdf_url", ""),
            }
            for key, maximum in (
                ("page", 10000),
                ("section", 300),
                ("figure", 120),
                ("table", 120),
                ("equation", 120),
                ("quote", 1200),
            ):
                value = evidence.get(key)
                if key == "page":
                    try:
                        value = int(value) if value not in (None, "") else 0
                    except (TypeError, ValueError):
                        value = 0
                    if value < 1 or value > maximum:
                        value = 0
                else:
                    value = compact_text(value, maximum)
                if value:
                    locator[key] = value
            source_hash = valid_hash(evidence.get("source_sha256")) or valid_hash(dossier.get("source_sha256"))
            if source_hash:
                locator["content_sha256"] = source_hash
            return locator

        def bounded_evidence(evidence: Any) -> dict[str, Any] | None:
            if not isinstance(evidence, dict):
                return None
            locator = bounded_locator(evidence)
            if not any(locator.get(key) for key in ("page", "section", "figure", "table", "equation", "quote")):
                return None
            return {
                "evidence_id": compact_text(evidence.get("evidence_id"), 120),
                "label": compact_text(evidence.get("label"), 240),
                "direction": compact_text(evidence.get("direction") or "supports", 20),
                "paperfield_path": self._paperfield_path(paper, evidence.get("page"), evidence),
                "source_locator": locator,
            }

        stages: dict[str, dict[str, Any]] = {}
        claims: list[dict[str, Any]] = []
        unknowns: list[str] = []
        terms = clean_string_list(paper.get("topics"), 120, 24)
        content = dossier.get("content", {}) if isinstance(dossier.get("content"), dict) else {}
        for stage_key, raw_stage in list(content.items())[:10]:
            if not isinstance(raw_stage, dict):
                continue
            stage_name = compact_text(stage_key, 60)
            stage_hash = valid_hash(raw_stage.get("source_sha256")) or valid_hash(dossier.get("source_sha256"))
            stage_output: dict[str, Any] = {
                "stage": stage_name,
                "summary": clean_multiline_text(raw_stage.get("summary"), 4000),
                "source_basis": compact_text(raw_stage.get("source_basis") or dossier.get("source_basis"), 40),
                "sections": [],
            }
            if stage_hash:
                stage_output["source_sha256"] = stage_hash
            raw_sections = raw_stage.get("sections", [])
            if not isinstance(raw_sections, list):
                raw_sections = []
            for raw_section in raw_sections[:12]:
                if not isinstance(raw_section, dict):
                    continue
                source_kind = compact_text(raw_section.get("source_kind"), 40) or "insufficient_information"
                body = clean_multiline_text(raw_section.get("body"), 5000)
                evidence_items = [
                    item for item in (bounded_evidence(value) for value in raw_section.get("evidence", [])[:8])
                    if item is not None
                ]
                claim_hash = stage_hash or next(
                    (
                        valid_hash(item.get("source_locator", {}).get("content_sha256"))
                        for item in evidence_items
                        if isinstance(item, dict)
                    ),
                    "",
                )
                section_output = {
                    "claim_id": compact_text(raw_section.get("claim_id"), 120),
                    "title": compact_text(raw_section.get("title"), 300),
                    "body": body,
                    "source_kind": source_kind,
                    "confidence": compact_text(raw_section.get("confidence") or "unknown", 20),
                    "evidence": evidence_items,
                }
                stage_output["sections"].append(section_output)
                source_claim = (
                    source_kind in {"paper_claim", "platform_derivation"}
                    and bool(body)
                    and bool(evidence_items)
                    and bool(claim_hash)
                )
                if source_claim:
                    claim = {
                        "claim_id": section_output["claim_id"],
                        "stage": stage_name,
                        "title": section_output["title"],
                        "statement": body,
                        "source_kind": source_kind,
                        "confidence": section_output["confidence"],
                        "evidence": evidence_items,
                    }
                    claim["source_sha256"] = claim_hash
                    claims.append(claim)
                else:
                    if body:
                        unknowns.append(body[:800])
                if section_output["title"]:
                    terms.append(section_output["title"])
            if stage_output["sections"] or stage_output["summary"]:
                stages[stage_name] = stage_output

        curriculum = paper.get("curriculum") if isinstance(paper.get("curriculum"), dict) else {}
        curriculum_payload = {
            "matched": bool(curriculum.get("matched")),
            "paper_ref": compact_text(curriculum.get("paper_ref"), 500),
            "source": compact_text(curriculum.get("source"), 100),
            "chapters": [
                {
                    key: compact_text(item.get(key), 300)
                    for key in ("id", "title", "track_id", "module_id")
                    if item.get(key)
                }
                for item in curriculum.get("chapters", [])[:12]
                if isinstance(item, dict)
            ],
        }
        topic_text = " ".join(terms).casefold()
        template_ids = (
            ["vla-policy", "embodied-loop", "world-model-rollout"]
            if any(token in topic_text for token in ("vla", "robot", "embodied", "具身", "机器人"))
            else ["multimodal-foundation"]
        )
        dossier_hash = valid_hash(dossier.get("source_sha256"))
        context: dict[str, Any] = {
            "schema_version": 1,
            "canonical_paper_ref": paper.get("canonical_ref", ""),
            "paperfield_id": paper.get("paperfield_id", ""),
            "title": compact_text(paper.get("title"), 1000),
            "abstract": clean_multiline_text(paper.get("abstract"), 6000),
            "authors": clean_string_list(paper.get("authors"), 240, 40),
            "venue": compact_text(paper.get("venue"), 200),
            "published": compact_text(paper.get("published"), 80),
            "version": compact_text(paper.get("current_version"), 80),
            "source_url": clean_http_url(paper.get("source_url")),
            "pdf_url": clean_http_url(paper.get("pdf_url")),
            "paperfield_path": self._paperfield_path(paper),
            "topics": clean_string_list(paper.get("topics"), 120, 24),
            "dossier": {
                "id": compact_text(dossier.get("id"), 120),
                "status": compact_text(dossier.get("status"), 40),
                "analysis_level": compact_text(dossier.get("analysis_level"), 40),
                "source_basis": compact_text(dossier.get("source_basis"), 40),
                "coverage": dossier.get("coverage", {}) if isinstance(dossier.get("coverage"), dict) else {},
                "stages": stages,
            },
            "claims": claims[:80],
            "terms": clean_string_list(terms, 160, 60),
            "curriculum": curriculum_payload,
            "insufficient_information": clean_string_list(unknowns, 800, 40),
            "template_ids": template_ids,
            "library_elements": [
                "source-bounded-claim",
                "paper-locator",
                "verified-node",
                "inferred-node-review",
                "template-layout-prior",
            ],
            "provenance": {
                "producer": "research-atlas",
                "produced_at": utc_now(),
                "source_bounded": True,
            },
        }
        if dossier_hash:
            context["source_sha256"] = dossier_hash
            context["dossier"]["source_sha256"] = dossier_hash
        with self._lock, self.connect() as db:
            self._record_editor_audit(
                db,
                "paper_context_exported",
                actor,
                entity_kind="canonical_paper",
                entity_id=str(paper_id),
                after={
                    "target": "flowloom",
                    "claim_count": len(context["claims"]),
                    "stage_count": len(stages),
                    "source_sha256": dossier_hash,
                },
                reason=reason,
            )
        return context

    def list_papers(self, limit: int = 80) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM canonical_papers ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
            return [self._paper_from_row(db, row) for row in rows]

    def _upsert_project_with_db(self, db: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
        full_name = compact_text(payload.get("fullName") or payload.get("full_name"), 300)
        if not re.fullmatch(r"[^/\s]+/[^/\s]+", full_name):
            raise AtlasError("GitHub 项目必须使用 owner/repo 格式")
        now = utc_now()
        values = (
            full_name,
            compact_text(payload.get("description"), 2000),
            clean_http_url(payload.get("url")) or f"https://github.com/{full_name}",
            clean_http_url(payload.get("homepage")),
            compact_text(payload.get("language"), 100),
            compact_text(payload.get("license"), 160),
            json.dumps(clean_string_list(payload.get("topics"), 120, 40), ensure_ascii=False),
            compact_text(payload.get("updatedAt") or payload.get("updated_at"), 80),
            now,
            now,
        )
        db.execute(
            """
            INSERT INTO research_projects(
                full_name, description, url, homepage, language, license, topics_json,
                source_updated_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(full_name) DO UPDATE SET
                description=CASE WHEN excluded.description<>'' THEN excluded.description ELSE research_projects.description END,
                url=CASE WHEN excluded.url<>'' THEN excluded.url ELSE research_projects.url END,
                homepage=CASE WHEN excluded.homepage<>'' THEN excluded.homepage ELSE research_projects.homepage END,
                language=CASE WHEN excluded.language<>'' THEN excluded.language ELSE research_projects.language END,
                license=CASE WHEN excluded.license<>'' THEN excluded.license ELSE research_projects.license END,
                topics_json=CASE WHEN excluded.topics_json<>'[]' THEN excluded.topics_json ELSE research_projects.topics_json END,
                source_updated_at=CASE WHEN excluded.source_updated_at<>'' THEN excluded.source_updated_at ELSE research_projects.source_updated_at END,
                updated_at=excluded.updated_at
            """,
            values,
        )
        row = db.execute("SELECT * FROM research_projects WHERE full_name=?", (full_name,)).fetchone()
        assert row is not None
        return self._project_from_row(row)

    def upsert_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock, self.connect() as db:
            return self._upsert_project_with_db(db, payload)

    def get_project(self, full_name: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM research_projects WHERE full_name=?", (full_name,)).fetchone()
            if not row:
                raise NotFoundError("项目研究关联尚未建立")
            project = self._project_from_row(row)
            project["related_papers"] = []
            project["research_status"] = "relationship_pending"
            return project

    def list_projects(self, limit: int = 80) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute("SELECT * FROM research_projects ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
            return [self._project_from_row(row) for row in rows]

    @staticmethod
    def _search_snapshot(db: sqlite3.Connection) -> tuple[str, int, int]:
        """Capture an immutable boundary for a catalog search.

        ``created_at`` is the public snapshot watermark and remains stable
        when an object is refreshed.  The per-table row caps close the small
        same-second hole caused by legacy records (and by the app's historical
        second-resolution timestamps): an object inserted after this read can
        never enter an existing cursor even when it has the same timestamp.
        """
        watermark = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        paper_row = db.execute(
            "SELECT COALESCE(MAX(id), 0) FROM canonical_papers WHERE created_at <= ?",
            (watermark,),
        ).fetchone()
        project_row = db.execute(
            "SELECT COALESCE(MAX(rowid), 0) FROM research_projects WHERE created_at <= ?",
            (watermark,),
        ).fetchone()
        return watermark, int(paper_row[0] or 0), int(project_row[0] or 0)

    @staticmethod
    def _search_cursor_secret(db: sqlite3.Connection) -> str:
        row = db.execute("SELECT value FROM app_metadata WHERE key='search_cursor_secret'").fetchone()
        if row is None or not re.fullmatch(r"[a-f0-9]{64}", str(row["value"] or "")):
            raise AtlasError("Atlas search cursor secret is unavailable")
        return str(row["value"])

    @staticmethod
    def _catalog_item_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        item = dict(row)
        domains_json = item.pop("domains_json", "[]")
        try:
            item["domains"] = clean_string_list(json.loads(domains_json or "[]"), 80, 12)
        except (TypeError, ValueError, json.JSONDecodeError):
            item["domains"] = []
        item["paperfield_ref"] = item.get("canonical_ref", "")
        item["paperfield_link_state"] = "available" if item.get("canonical_ref") else "unresolved"
        item["title"] = compact_text(item.get("title"), 1000)
        item["summary"] = clean_multiline_text(item.get("summary"), 2400)
        item["canonical_ref"] = compact_text(item.get("canonical_ref"), 500)
        return item

    @staticmethod
    def _search_snapshot_from_row(row: sqlite3.Row, *, include_query: bool = True) -> dict[str, Any]:
        expires_at = parse_utc(row["expires_at"])
        result = {
            "id": row["id"],
            "owner_id": row["owner_id"],
            "fingerprint": row["fingerprint"],
            "watermark": row["watermark"],
            "paper_max_id": int(row["paper_max_id"]),
            "project_max_rowid": int(row["project_max_rowid"]),
            "result_count": int(row["result_count"]),
            "result_sha256": row["result_sha256"],
            "max_items": int(row["max_items"]),
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            "last_accessed_at": row["last_accessed_at"],
            "expired": bool(expires_at and expires_at <= datetime.now(timezone.utc)),
        }
        if include_query:
            result["query"] = json.loads(row["query_json"] or "{}")
        return result

    @staticmethod
    def _cleanup_search_snapshots_with_db(
        db: sqlite3.Connection,
        owner_id: str,
        incoming_items: int = 0,
        incoming_snapshots: int = 0,
    ) -> dict[str, int]:
        if incoming_items > SEARCH_SNAPSHOT_MAX_ITEMS:
            raise AtlasError(
                f"search snapshot exceeds the {SEARCH_SNAPSHOT_MAX_ITEMS} item limit; refine the query"
            )
        if incoming_snapshots not in {0, 1}:
            raise AtlasError("incoming snapshot count must be zero or one")
        owner = compact_text(owner_id, 120) or "catalog"
        now = utc_now()
        expired = db.execute(
            "SELECT id, result_count FROM search_snapshots WHERE owner_id=? AND expires_at<=?",
            (owner, now),
        ).fetchall()
        expired_items = sum(int(row["result_count"] or 0) for row in expired)
        db.execute(
            "DELETE FROM search_snapshots WHERE owner_id=? AND expires_at<=?",
            (owner, now),
        )
        rows = db.execute(
            """
            SELECT id, result_count FROM search_snapshots
            WHERE owner_id=?
            ORDER BY last_accessed_at ASC, created_at ASC, id ASC
            """,
            (owner,),
        ).fetchall()
        active_items = sum(int(row["result_count"] or 0) for row in rows)
        capacity_removed = 0
        capacity_items = 0
        while rows and (
            len(rows) + incoming_snapshots > SEARCH_SNAPSHOT_MAX_ACTIVE_PER_OWNER
            or active_items + incoming_items > SEARCH_SNAPSHOT_MAX_TOTAL_ITEMS_PER_OWNER
        ):
            victim = rows.pop(0)
            count = int(victim["result_count"] or 0)
            db.execute("DELETE FROM search_snapshots WHERE id=? AND owner_id=?", (victim["id"], owner))
            active_items -= count
            capacity_removed += 1
            capacity_items += count
        if active_items + incoming_items > SEARCH_SNAPSHOT_MAX_TOTAL_ITEMS_PER_OWNER:
            raise AtlasError("search snapshot owner capacity is exhausted; refine the query")
        return {
            "expired_snapshots": len(expired),
            "expired_items": expired_items,
            "capacity_snapshots": capacity_removed,
            "capacity_items": capacity_items,
        }

    def cleanup_search_snapshots(self, owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        with self._lock, self.connect() as db:
            cleanup = self._cleanup_search_snapshots_with_db(db, owner)
            active = db.execute(
                "SELECT COUNT(*), COALESCE(SUM(result_count), 0) FROM search_snapshots WHERE owner_id=?",
                (owner,),
            ).fetchone()
            return {
                **cleanup,
                "owner_id": owner,
                "active_snapshots": int(active[0]),
                "active_items": int(active[1]),
                "limits": {
                    "ttl_seconds": SEARCH_SNAPSHOT_TTL_SECONDS,
                    "max_items": SEARCH_SNAPSHOT_MAX_ITEMS,
                    "max_active_per_owner": SEARCH_SNAPSHOT_MAX_ACTIVE_PER_OWNER,
                    "max_total_items_per_owner": SEARCH_SNAPSHOT_MAX_TOTAL_ITEMS_PER_OWNER,
                },
            }

    def list_search_snapshots(self, owner_id: str = "local", limit: int = 50) -> list[dict[str, Any]]:
        owner = compact_text(owner_id, 120) or "local"
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM search_snapshots WHERE owner_id=? ORDER BY created_at DESC, id DESC LIMIT ?",
                (owner, safe_limit),
            ).fetchall()
            return [self._search_snapshot_from_row(row) for row in rows]

    def get_search_snapshot(
        self,
        snapshot_id: str,
        owner_id: str = "local",
        *,
        include_items: bool = False,
        item_limit: int = 200,
    ) -> dict[str, Any]:
        snapshot_ref = compact_text(snapshot_id, 80)
        owner = compact_text(owner_id, 120) or "local"
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM search_snapshots WHERE id=? AND owner_id=?",
                (snapshot_ref, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("search snapshot does not exist")
            result = self._search_snapshot_from_row(row)
            # Keep expired metadata available for diagnostics, but never
            # project stale catalog rows after the evidence boundary elapsed.
            if result.get("expired"):
                result["status"] = "expired"
                if include_items:
                    result["items"] = []
                    result["items_truncated"] = bool(int(row["result_count"] or 0))
                return result
            if include_items:
                safe_limit = max(1, min(SEARCH_SNAPSHOT_MAX_ITEMS, int(item_limit)))
                item_rows = db.execute(
                    "SELECT item_json FROM search_snapshot_items WHERE snapshot_id=? ORDER BY position LIMIT ?",
                    (snapshot_ref, safe_limit),
                ).fetchall()
                result["items"] = [json.loads(item["item_json"]) for item in item_rows]
                result["items_truncated"] = len(item_rows) < int(row["result_count"])
            return result

    @staticmethod
    def _snapshot_cursor(
        snapshot: sqlite3.Row,
        item: dict[str, Any],
        position: int,
        secret: str,
    ) -> str:
        payload = {
            "v": 1,
            "fingerprint": snapshot["fingerprint"],
            "date": compact_text(item.get("sort_date"), 80),
            "kind": compact_text(item.get("kind"), 20),
            "ref": compact_text(item.get("ref"), 500),
            "watermark": snapshot["watermark"],
            "paper_max_id": int(snapshot["paper_max_id"]),
            "project_max_rowid": int(snapshot["project_max_rowid"]),
            "snapshot_id": snapshot["id"],
            "position": int(position),
            "expires_at": snapshot["expires_at"],
        }
        payload["signature"] = sign_search_cursor(payload, secret)
        return encode_search_cursor(payload)

    def _materialized_search_page(
        self,
        anchor: dict[str, Any],
        owner_id: str,
        safe_limit: int,
        cursor: str,
        normalized_query: str,
        normalized_kinds: list[str],
        normalized_domains: list[str],
        normalized_statuses: list[str],
    ) -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "catalog"
        snapshot_id = compact_text(anchor.get("snapshot_id"), 80)
        with self._lock, self.connect() as db:
            secret = self._search_cursor_secret(db)
            expected = sign_search_cursor(anchor, secret)
            if not hmac.compare_digest(str(anchor.get("signature") or ""), expected):
                raise AtlasError("cursor signature verification failed")
            snapshot = db.execute(
                "SELECT * FROM search_snapshots WHERE id=? AND owner_id=?",
                (snapshot_id, owner),
            ).fetchone()
            if snapshot is None:
                raise GoneError("search snapshot expired or was cleaned")
            expires_at = parse_utc(snapshot["expires_at"])
            if expires_at is None or expires_at <= datetime.now(timezone.utc):
                db.execute("DELETE FROM search_snapshots WHERE id=? AND owner_id=?", (snapshot_id, owner))
                raise GoneError("search snapshot expired")
            if snapshot["fingerprint"] != anchor["fingerprint"] or snapshot["expires_at"] != anchor["expires_at"]:
                raise AtlasError("cursor does not match its search snapshot")
            anchor_row = db.execute(
                "SELECT item_json FROM search_snapshot_items WHERE snapshot_id=? AND position=?",
                (snapshot_id, int(anchor["position"])),
            ).fetchone()
            if anchor_row is None:
                raise AtlasError("cursor snapshot position is invalid")
            anchor_item = json.loads(anchor_row["item_json"])
            if (
                anchor_item.get("sort_date", "") != anchor["date"]
                or anchor_item.get("kind", "") != anchor["kind"]
                or anchor_item.get("ref", "") != anchor["ref"]
            ):
                raise AtlasError("cursor snapshot anchor is invalid")
            rows = db.execute(
                """
                SELECT position, item_json FROM search_snapshot_items
                WHERE snapshot_id=? AND position>?
                ORDER BY position LIMIT ?
                """,
                (snapshot_id, int(anchor["position"]), safe_limit + 1),
            ).fetchall()
            db.execute(
                "UPDATE search_snapshots SET last_accessed_at=? WHERE id=? AND owner_id=?",
                (utc_now(), snapshot_id, owner),
            )
            has_more = len(rows) > safe_limit
            page_rows = rows[:safe_limit]
            items = [json.loads(row["item_json"]) for row in page_rows]
            next_cursor = ""
            if has_more and page_rows:
                next_cursor = self._snapshot_cursor(snapshot, items[-1], int(page_rows[-1]["position"]), secret)
            metadata = self._search_snapshot_from_row(snapshot, include_query=False)
        return {
            "items": items,
            "total": int(snapshot["result_count"]),
            "limit": safe_limit,
            "cursor": cursor,
            "next_cursor": next_cursor,
            "nextCursor": next_cursor,
            "has_more": has_more,
            "hasMore": has_more,
            "returned": len(items),
            "query": normalized_query,
            "filters": {"kinds": normalized_kinds, "domains": normalized_domains, "statuses": normalized_statuses},
            "ordering": "created_at_desc,kind_asc,ref_asc",
            "watermark": snapshot["watermark"],
            "snapshot": metadata,
            "snapshot_id": snapshot["id"],
            "snapshot_mode": "materialized",
        }

    def _create_materialized_search(
        self,
        *,
        owner_id: str,
        fingerprint: str,
        normalized_query: str,
        normalized_kinds: list[str],
        normalized_domains: list[str],
        normalized_statuses: list[str],
        safe_limit: int,
    ) -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "catalog"
        kind_sql = ",".join("?" for _ in normalized_kinds)
        domain_predicate = ""
        domain_params: list[Any] = []
        if normalized_domains:
            placeholders = ",".join("?" for _ in normalized_domains)
            domain_predicate = (
                " AND EXISTS (SELECT 1 FROM json_each(catalog.domains_json) "
                f"WHERE lower(CAST(json_each.value AS TEXT)) IN ({placeholders}))"
            )
            domain_params = list(normalized_domains)
        status_predicate = ""
        status_params: list[Any] = []
        if normalized_statuses:
            placeholders = ",".join("?" for _ in normalized_statuses)
            status_predicate = f" AND lower(catalog.status) IN ({placeholders})"
            status_params = list(normalized_statuses)
        with self._lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            watermark, paper_max_id, project_max_rowid = self._search_snapshot(db)
            cte = f"""
                WITH catalog AS (
                    SELECT
                        'paper' AS kind, CAST(p.id AS TEXT) AS ref, p.id AS snapshot_id,
                        p.canonical_ref AS canonical_ref, p.title AS title, p.abstract AS summary,
                        p.topics_json AS domains_json,
                        CASE
                            WHEN EXISTS (SELECT 1 FROM paper_analyses a WHERE a.canonical_paper_id=p.id AND a.status='completed') THEN 'analysed'
                            WHEN EXISTS (SELECT 1 FROM analysis_requests r WHERE r.canonical_paper_id=p.id AND r.status IN ('queued','running','paused','partial')) THEN 'in_progress'
                            ELSE 'catalogued'
                        END AS status,
                        p.created_at AS created_at, p.created_at AS sort_date, p.published AS published,
                        p.source_url AS source_url, p.pdf_url AS pdf_url
                    FROM canonical_papers p
                    WHERE (NOT EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='paper' AND sync.canonical_ref=p.canonical_ref
                    ) OR EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='paper' AND sync.canonical_ref=p.canonical_ref AND sync.deleted=0
                    ))
                    AND p.created_at<=? AND p.id<=?
                    UNION ALL
                    SELECT
                        'project' AS kind, r.full_name AS ref, r.rowid AS snapshot_id,
                        r.full_name AS canonical_ref, r.full_name AS title, r.description AS summary,
                        r.topics_json AS domains_json, 'catalogued' AS status,
                        r.created_at AS created_at, r.created_at AS sort_date, r.source_updated_at AS published,
                        r.url AS source_url, '' AS pdf_url
                    FROM research_projects r
                    WHERE (NOT EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='project' AND sync.canonical_ref=r.full_name
                    ) OR EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='project' AND sync.canonical_ref=r.full_name AND sync.deleted=0
                    ))
                    AND r.created_at<=? AND r.rowid<=?
                )
                SELECT catalog.* FROM catalog
                WHERE catalog.kind IN ({kind_sql})
                  AND (instr(lower(COALESCE(catalog.title, '')), ?) > 0
                       OR instr(lower(COALESCE(catalog.summary, '')), ?) > 0)
                  {domain_predicate}
                  {status_predicate}
                ORDER BY catalog.sort_date DESC, catalog.kind ASC, catalog.ref ASC
            """
            params: list[Any] = [watermark, paper_max_id, watermark, project_max_rowid]
            params.extend(normalized_kinds)
            query_text = normalized_query.casefold()
            params.extend([query_text, query_text, *domain_params, *status_params])
            total = int(db.execute(f"SELECT COUNT(*) FROM ({cte})", params).fetchone()[0])
            self._cleanup_search_snapshots_with_db(db, owner, total, incoming_snapshots=1)
            rows = db.execute(cte, params).fetchall()
            items = [self._catalog_item_from_row(row) for row in rows]
            digest = hashlib.sha256()
            serialized_items: list[str] = []
            for item in items:
                serialized = json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                serialized_items.append(serialized)
                digest.update(serialized.encode("utf-8"))
                digest.update(b"\n")
            snapshot_id = str(uuid.uuid4())
            created_at = utc_now()
            expires_at = utc_after(SEARCH_SNAPSHOT_TTL_SECONDS)
            query_spec = {
                "query": normalized_query,
                "kinds": normalized_kinds,
                "domains": normalized_domains,
                "statuses": normalized_statuses,
                "ordering": "created_at_desc,kind_asc,ref_asc",
            }
            db.execute(
                """
                INSERT INTO search_snapshots(
                    id, owner_id, fingerprint, query_json, watermark, paper_max_id,
                    project_max_rowid, result_count, result_sha256, max_items,
                    created_at, expires_at, last_accessed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id, owner, fingerprint,
                    json.dumps(query_spec, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    watermark, paper_max_id, project_max_rowid, total, digest.hexdigest(),
                    SEARCH_SNAPSHOT_MAX_ITEMS, created_at, expires_at, created_at,
                ),
            )
            db.executemany(
                "INSERT INTO search_snapshot_items(snapshot_id, position, item_json) VALUES (?, ?, ?)",
                ((snapshot_id, position, serialized) for position, serialized in enumerate(serialized_items)),
            )
            snapshot = db.execute("SELECT * FROM search_snapshots WHERE id=?", (snapshot_id,)).fetchone()
            assert snapshot is not None
            secret = self._search_cursor_secret(db)
            has_more = total > safe_limit
            page_items = items[:safe_limit]
            next_cursor = ""
            if has_more and page_items:
                next_cursor = self._snapshot_cursor(snapshot, page_items[-1], len(page_items) - 1, secret)
            metadata = self._search_snapshot_from_row(snapshot, include_query=False)
        return {
            "items": page_items,
            "total": total,
            "limit": safe_limit,
            "cursor": "",
            "next_cursor": next_cursor,
            "nextCursor": next_cursor,
            "has_more": has_more,
            "hasMore": has_more,
            "returned": len(page_items),
            "query": normalized_query,
            "filters": {"kinds": normalized_kinds, "domains": normalized_domains, "statuses": normalized_statuses},
            "ordering": "created_at_desc,kind_asc,ref_asc",
            "watermark": watermark,
            "snapshot": metadata,
            "snapshot_id": snapshot_id,
            "snapshot_mode": "materialized",
        }

    def search_catalog(
        self,
        query: str = "",
        kinds: list[str] | None = None,
        domains: list[str] | None = None,
        statuses: list[str] | None = None,
        limit: int = 40,
        cursor: str = "",
        owner_id: str = "catalog",
    ) -> dict[str, Any]:
        """Keyset search over a stable catalog snapshot.

        Results are ordered by immutable ``created_at``.  A first request
        pins a timestamp and per-kind row caps in the cursor; subsequent
        requests apply those values before the keyset anchor.  Updating an
        existing paper or project therefore cannot move it across pages, and
        records inserted after the first request are excluded from that
        snapshot.
        """
        allowed_kinds = {"paper", "project"}
        normalized_kinds = [compact_text(item, 20).lower() for item in (kinds or []) if compact_text(item, 20)]
        if not normalized_kinds:
            normalized_kinds = ["paper", "project"]
        if any(item not in allowed_kinds for item in normalized_kinds):
            raise AtlasError("搜索 kind 无效")
        normalized_kinds = sorted(set(normalized_kinds))
        normalized_domains = sorted(
            set(compact_text(item, 120).casefold() for item in (domains or []) if compact_text(item, 120))
        )
        normalized_statuses = sorted(
            set(compact_text(item, 40).casefold() for item in (statuses or []) if compact_text(item, 40))
        )
        try:
            safe_limit = max(1, min(SEARCH_MAX_LIMIT, int(limit)))
        except (TypeError, ValueError) as error:
            raise AtlasError("搜索 limit 必须是整数") from error
        normalized_query = compact_text(query, 300)
        fingerprint = search_fingerprint(normalized_query, normalized_kinds, normalized_domains, normalized_statuses)
        anchor = decode_search_cursor(cursor)
        if anchor and anchor.get("fingerprint") != fingerprint:
            raise AtlasError("cursor 与当前搜索条件不匹配")

        if anchor.get("snapshot_id"):
            return self._materialized_search_page(
                anchor,
                owner_id,
                safe_limit,
                cursor,
                normalized_query,
                normalized_kinds,
                normalized_domains,
                normalized_statuses,
            )
        if not anchor:
            return self._create_materialized_search(
                owner_id=owner_id,
                fingerprint=fingerprint,
                normalized_query=normalized_query,
                normalized_kinds=normalized_kinds,
                normalized_domains=normalized_domains,
                normalized_statuses=normalized_statuses,
                safe_limit=safe_limit,
            )

        # Keep a read transaction open across the count and page query.  The
        # cursor carries the resulting boundary, so a later request can use
        # the same logical snapshot even after this transaction closes.
        snapshot_active = bool(anchor and anchor.get("watermark") is not None) or not anchor
        watermark = compact_text(anchor.get("watermark"), 80) if anchor else ""
        paper_max_id: int | None = anchor.get("paper_max_id") if anchor else None
        project_max_rowid: int | None = anchor.get("project_max_rowid") if anchor else None
        # Cursors issued before snapshot fields were introduced remain
        # readable.  They use the old live-catalog semantics for that one
        # continuation rather than being silently assigned a new boundary.
        if anchor and not (
            watermark and paper_max_id is not None and project_max_rowid is not None
        ):
            snapshot_active = False
            watermark = ""
            paper_max_id = None
            project_max_rowid = None

        kind_sql = ",".join("?" for _ in normalized_kinds)
        query_text = normalized_query.casefold()
        domain_predicate = ""
        domain_params: list[Any] = []
        if normalized_domains:
            placeholders = ",".join("?" for _ in normalized_domains)
            domain_predicate = (
                " AND EXISTS (SELECT 1 FROM json_each(catalog.domains_json) "
                f"WHERE lower(CAST(json_each.value AS TEXT)) IN ({placeholders}))"
            )
            domain_params = list(normalized_domains)
        status_predicate = ""
        status_params: list[Any] = []
        if normalized_statuses:
            placeholders = ",".join("?" for _ in normalized_statuses)
            status_predicate = f" AND lower(catalog.status) IN ({placeholders})"
            status_params = list(normalized_statuses)
        anchor_predicate = ""
        anchor_params: list[Any] = []
        if anchor:
            anchor_predicate = (
                " AND (catalog.sort_date < ? OR "
                "(catalog.sort_date = ? AND catalog.kind > ?) OR "
                "(catalog.sort_date = ? AND catalog.kind = ? AND catalog.ref > ?))"
            )
            anchor_params = [
                compact_text(anchor.get("date"), 80),
                compact_text(anchor.get("date"), 80),
                compact_text(anchor.get("kind"), 20),
                compact_text(anchor.get("date"), 80),
                compact_text(anchor.get("kind"), 20),
                compact_text(anchor.get("ref"), 500),
            ]

        with self.connect() as db:
            db.execute("BEGIN")
            if not anchor:
                watermark, paper_max_id, project_max_rowid = self._search_snapshot(db)
            snapshot_predicate = ""
            snapshot_params: list[Any] = []
            if snapshot_active:
                snapshot_predicate = (
                    " AND catalog.created_at <= ?"
                    " AND ((catalog.kind='paper' AND catalog.snapshot_id <= ?)"
                    "      OR (catalog.kind='project' AND catalog.snapshot_id <= ?))"
                )
                snapshot_params = [watermark, int(paper_max_id or 0), int(project_max_rowid or 0)]

            cte = f"""
                WITH catalog AS (
                    SELECT
                        'paper' AS kind,
                        CAST(p.id AS TEXT) AS ref,
                        p.id AS snapshot_id,
                        p.canonical_ref AS canonical_ref,
                        p.title AS title,
                        p.abstract AS summary,
                        p.topics_json AS domains_json,
                        CASE
                            WHEN EXISTS (SELECT 1 FROM paper_analyses a WHERE a.canonical_paper_id=p.id AND a.status='completed') THEN 'analysed'
                            WHEN EXISTS (SELECT 1 FROM analysis_requests r WHERE r.canonical_paper_id=p.id AND r.status IN ('queued','running','paused','partial')) THEN 'in_progress'
                            ELSE 'catalogued'
                        END AS status,
                        p.created_at AS created_at,
                        p.created_at AS sort_date,
                        p.published AS published,
                        p.source_url AS source_url,
                        p.pdf_url AS pdf_url
                    FROM canonical_papers p
                    WHERE NOT EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='paper' AND sync.canonical_ref=p.canonical_ref
                    )
                       OR EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='paper' AND sync.canonical_ref=p.canonical_ref
                          AND sync.deleted=0
                    )
                    UNION ALL
                    SELECT
                        'project' AS kind,
                        r.full_name AS ref,
                        r.rowid AS snapshot_id,
                        r.full_name AS canonical_ref,
                        r.full_name AS title,
                        r.description AS summary,
                        r.topics_json AS domains_json,
                        'catalogued' AS status,
                        r.created_at AS created_at,
                        r.created_at AS sort_date,
                        r.source_updated_at AS published,
                        r.url AS source_url,
                        '' AS pdf_url
                    FROM research_projects r
                    WHERE NOT EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='project' AND sync.canonical_ref=r.full_name
                    )
                       OR EXISTS (
                        SELECT 1 FROM paperfield_sync_objects sync
                        WHERE sync.object_kind='project' AND sync.canonical_ref=r.full_name
                          AND sync.deleted=0
                    )
                )
                SELECT catalog.*
                FROM catalog
                WHERE catalog.kind IN ({kind_sql})
                  AND (instr(lower(COALESCE(catalog.title, '')), ?) > 0
                       OR instr(lower(COALESCE(catalog.summary, '')), ?) > 0)
                  {snapshot_predicate}
                  {domain_predicate}
                  {status_predicate}
                  {anchor_predicate}
                ORDER BY catalog.sort_date DESC, catalog.kind ASC, catalog.ref ASC
            """
            base_params: list[Any] = list(normalized_kinds)
            base_params.extend([query_text, query_text])
            base_params.extend(snapshot_params)
            base_params.extend(domain_params)
            base_params.extend(status_params)
            # ``total`` describes the full filtered result set within the
            # pinned snapshot, not merely rows after the keyset anchor.
            count_cte = cte.replace(anchor_predicate, "", 1) if anchor_predicate else cte
            count_sql = f"SELECT COUNT(*) FROM ({count_cte.replace('SELECT catalog.*', 'SELECT catalog.ref')})"
            total = int(db.execute(count_sql, base_params).fetchone()[0])
            rows = db.execute(
                f"{cte} LIMIT ?",
                [*base_params, *anchor_params, safe_limit + 1],
            ).fetchall()
        has_more = len(rows) > safe_limit
        rows = rows[:safe_limit]
        items: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item.pop("domains_json", None)
            try:
                item["domains"] = clean_string_list(json.loads(row["domains_json"] or "[]"), 80, 12)
            except (TypeError, ValueError, json.JSONDecodeError):
                item["domains"] = []
            item["paperfield_ref"] = row["canonical_ref"]
            item["paperfield_link_state"] = "available" if row["canonical_ref"] else "unresolved"
            item["title"] = compact_text(item.get("title"), 1000)
            item["summary"] = clean_multiline_text(item.get("summary"), 2400)
            item["canonical_ref"] = compact_text(item.get("canonical_ref"), 500)
            items.append(item)
        next_cursor = ""
        if has_more and rows:
            last = rows[-1]
            cursor_payload = {
                "v": 1,
                "fingerprint": fingerprint,
                "date": last["sort_date"] or "",
                "kind": last["kind"],
                "ref": last["ref"],
            }
            if snapshot_active:
                cursor_payload.update(
                    {
                        "watermark": watermark,
                        "paper_max_id": int(paper_max_id or 0),
                        "project_max_rowid": int(project_max_rowid or 0),
                    }
                )
            next_cursor = encode_search_cursor(cursor_payload)
        return {
            "items": items,
            "total": total,
            "limit": safe_limit,
            "cursor": cursor or "",
            "next_cursor": next_cursor,
            "nextCursor": next_cursor,
            "has_more": has_more,
            "hasMore": has_more,
            "returned": len(items),
            "query": normalized_query,
            "filters": {"kinds": normalized_kinds, "domains": normalized_domains, "statuses": normalized_statuses},
            "ordering": "created_at_desc,kind_asc,ref_asc",
            "watermark": watermark,
        }

    @staticmethod
    def _backup_manifest_path(database_path: Path) -> Path:
        return database_path.with_name(f"{database_path.name}.manifest.json")

    @staticmethod
    def _sha256_file(path: Path, maximum: int = BACKUP_MAX_BYTES) -> tuple[str, int]:
        if not path.is_file():
            raise NotFoundError("备份文件不存在")
        digest = hashlib.sha256()
        size = 0
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > maximum:
                    raise AtlasError("备份文件超过体积限制")
                digest.update(chunk)
        return digest.hexdigest(), size

    @staticmethod
    def _sqlite_backup(source: Path, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        source_uri = f"{source.resolve().as_uri()}?mode=ro"
        with sqlite3.connect(source_uri, uri=True) as source_db:
            with sqlite3.connect(target) as target_db:
                source_db.backup(target_db)
                target_db.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    @staticmethod
    def _inspect_sqlite_backup(path: Path) -> dict[str, Any]:
        try:
            with path.open("rb") as handle:
                if handle.read(16) != b"SQLite format 3\x00":
                    raise AtlasError("备份不是有效的 SQLite 数据库")
        except OSError as error:
            raise NotFoundError("备份文件不存在") from error
        uri = f"{path.resolve().as_uri()}?mode=ro"
        try:
            with sqlite3.connect(uri, uri=True) as db:
                tables = {
                    row[0]
                    for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
                }
                required = {
                    "app_metadata",
                    "schema_migrations",
                    "canonical_papers",
                    "research_projects",
                    "analysis_requests",
                }
                if not required.issubset(tables):
                    raise AtlasError("备份缺少 Atlas 核心表")
                version_row = db.execute(
                    "SELECT value FROM app_metadata WHERE key='schema_version'"
                ).fetchone()
                try:
                    schema_version = int(version_row[0]) if version_row else 0
                except (TypeError, ValueError) as error:
                    raise AtlasError("备份 schema_version 无效") from error
                integrity = [str(row[0]).lower() for row in db.execute("PRAGMA integrity_check").fetchall()]
                if integrity != ["ok"]:
                    raise AtlasError("备份 SQLite integrity_check 失败")
                foreign = db.execute("PRAGMA foreign_key_check").fetchone()
                if foreign is not None:
                    raise AtlasError("备份存在 SQLite 外键完整性错误")
                page_count = int(db.execute("PRAGMA page_count").fetchone()[0] or 0)
                return {
                    "schema_version": schema_version,
                    "integrity": "ok",
                    "page_count": page_count,
                    "tables": sorted(tables),
                }
        except sqlite3.DatabaseError as error:
            raise AtlasError("备份 SQLite 数据库无法读取") from error

    def validate_backup(
        self,
        backup_path: Path | str,
        manifest: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        path = Path(backup_path).expanduser().resolve()
        if manifest is None:
            manifest_path = self._backup_manifest_path(path)
            try:
                raw = manifest_path.read_text(encoding="utf-8")
                manifest = json.loads(raw)
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
                raise AtlasError("备份清单不存在或格式无效") from error
        if not isinstance(manifest, dict):
            raise AtlasError("备份清单必须是对象")
        try:
            manifest_version = int(manifest.get("manifest_version", manifest.get("manifestVersion")))
            schema_version = int(manifest.get("schema_version", manifest.get("schemaVersion")))
        except (TypeError, ValueError) as error:
            raise AtlasError("备份清单版本无效") from error
        if manifest_version != BACKUP_MANIFEST_VERSION:
            raise AtlasError("备份清单版本不受支持")
        if schema_version != SCHEMA_VERSION:
            raise AtlasError("备份 schema_version 与当前程序不一致")
        app_version = compact_text(manifest.get("app_version") or manifest.get("appVersion"), 40)
        if app_version != APP_VERSION:
            raise AtlasError("backup app_version is incompatible with this Atlas build")
        if compact_text(manifest.get("integrity"), 20).lower() != "ok":
            raise AtlasError("backup manifest integrity status is invalid")
        expected_hash = compact_text(
            manifest.get("database_sha256") or manifest.get("databaseSha256"),
            64,
        ).lower()
        if not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
            raise AtlasError("备份清单缺少有效的 SHA-256")
        expected_size = manifest.get(
            "database_size",
            manifest.get("databaseSize", manifest.get("byte_size", manifest.get("byteSize"))),
        )
        try:
            expected_size = int(expected_size)
        except (TypeError, ValueError) as error:
            raise AtlasError("备份清单大小无效") from error
        actual_hash, actual_size = self._sha256_file(path)
        if not hmac.compare_digest(actual_hash, expected_hash):
            raise AtlasError("备份 SHA-256 校验失败")
        if actual_size != expected_size:
            raise AtlasError("备份大小校验失败")
        inspected = self._inspect_sqlite_backup(path)
        if inspected["schema_version"] != schema_version:
            raise AtlasError("备份文件版本与清单不一致")
        return {
            **manifest,
            "manifest_version": manifest_version,
            "schema_version": schema_version,
            "app_version": app_version,
            "database_sha256": expected_hash,
            "database_size": expected_size,
            **inspected,
            "path": str(path),
        }

    @staticmethod
    def _backup_row_from_db(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        try:
            result["manifest"] = json.loads(result.pop("manifest_json") or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            result["manifest"] = {}
        return result

    def list_backups(self, limit: int = 50) -> list[dict[str, Any]]:
        safe_limit = max(1, min(100, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM atlas_backup_runs ORDER BY created_at DESC LIMIT ?",
                (safe_limit,),
            ).fetchall()
            return [self._backup_row_from_db(row) for row in rows]

    def create_backup(
        self,
        directory: Path | str | None = None,
        editor_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = editor_payload or {}
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        backup_dir = Path(directory).expanduser().resolve() if directory else self.path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_id = str(uuid.uuid4())
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target = backup_dir / f"atlas-{stamp}-{backup_id[:8]}.db"
        temporary = backup_dir / f".{target.name}.{uuid.uuid4().hex}.tmp"
        manifest_path = self._backup_manifest_path(target)
        manifest_temporary = backup_dir / f".{manifest_path.name}.{uuid.uuid4().hex}.tmp"
        try:
            with self._lock:
                self._sqlite_backup(self.path, temporary)
                os.replace(temporary, target)
                inspected = self._inspect_sqlite_backup(target)
                database_hash, database_size = self._sha256_file(target)
                manifest = {
                    "manifest_version": BACKUP_MANIFEST_VERSION,
                    "schema_version": SCHEMA_VERSION,
                    "app_version": APP_VERSION,
                    "database_file": target.name,
                    "database_size": database_size,
                    "database_sha256": database_hash,
                    "created_at": utc_now(),
                    **inspected,
                }
                manifest_temporary.write_text(
                    json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                    encoding="utf-8",
                )
                os.replace(manifest_temporary, manifest_path)
                with self.connect() as db:
                    db.execute(
                        "INSERT INTO atlas_backup_runs(id, path, manifest_json, database_sha256, actor, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            backup_id,
                            str(target),
                            json.dumps(manifest, ensure_ascii=False, sort_keys=True),
                            database_hash,
                            actor,
                            reason,
                            manifest["created_at"],
                        ),
                    )
                    self._record_editor_audit(
                        db,
                        "atlas_backup_created",
                        actor,
                        entity_kind="backup",
                        entity_id=backup_id,
                        after={"path": str(target), "manifest": manifest},
                        reason=reason,
                    )
            return {
                "id": backup_id,
                "path": str(target),
                "manifest_path": str(manifest_path),
                "manifest": manifest,
                "database_sha256": database_hash,
                "database_size": database_size,
            }
        except Exception:
            for path in (temporary, manifest_temporary, target, manifest_path):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            raise

    def restore_backup(
        self,
        backup_path: Path | str,
        manifest: dict[str, Any] | None = None,
        editor_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Accept restore_backup(path, editor_payload) for callers that do not
        # pass a separate manifest.
        if editor_payload is None and isinstance(manifest, dict) and (
            "editorName" in manifest or "editor_name" in manifest or "reason" in manifest
        ):
            editor_payload, manifest = manifest, None
        payload = editor_payload or {}
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        source = Path(backup_path).expanduser().resolve()
        if source == self.path:
            raise AtlasError("不能把当前数据库作为恢复源")
        checked = self.validate_backup(source, manifest)
        staged = self.path.parent / f".{self.path.name}.restore-{uuid.uuid4().hex}.tmp"
        rollback = self.path.parent / f".{self.path.name}.rollback-{uuid.uuid4().hex}.db"
        replaced = False
        try:
            with self._lock:
                self._sqlite_backup(source, staged)
                staged_check = self._inspect_sqlite_backup(staged)
                if staged_check["schema_version"] != checked["schema_version"]:
                    raise AtlasError("恢复预检的 schema_version 不一致")
                # Record the restore audit in the staged database.  All work
                # that can fail is completed before the atomic replacement,
                # so a failed restore leaves the current database untouched.
                staged_db = sqlite3.connect(staged)
                try:
                    staged_db.row_factory = sqlite3.Row
                    with staged_db:
                        staged_db.execute("PRAGMA foreign_keys=ON")
                        self._record_editor_audit(
                            staged_db,
                            "atlas_imported",
                            actor,
                            entity_kind="backup",
                            entity_id=checked["database_sha256"],
                            after={
                                "source": source.name,
                                "source_sha256": checked["database_sha256"],
                                "schema_version": staged_check["schema_version"],
                            },
                            reason=reason,
                        )
                finally:
                    staged_db.close()
                restored_check = self._inspect_sqlite_backup(staged)
                restored_hash, restored_size = self._sha256_file(staged)
                self._sqlite_backup(self.path, rollback)
                current = self.connect()
                try:
                    with current:
                        current.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                finally:
                    current.close()
                for suffix in ("-wal", "-shm", "-journal"):
                    Path(f"{self.path}{suffix}").unlink(missing_ok=True)
                os.replace(staged, self.path)
                replaced = True
            try:
                rollback.unlink(missing_ok=True)
            except OSError:
                pass
            return {
                "restored": True,
                "source": str(source),
                "source_sha256": checked["database_sha256"],
                "database_sha256": restored_hash,
                "database_size": restored_size,
                "schema_version": restored_check["schema_version"],
                "integrity": restored_check["integrity"],
            }
        except Exception:
            # Atomic replacement is the last fallible state transition.  No
            # validation or audit work runs after it, so a reported failure
            # cannot occur after the current database has been replaced.
            if replaced:
                raise AtlasError("restore replacement completed but finalization failed")
            raise
        finally:
            for path in (staged, rollback):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass

    # Explicit names used by external maintenance scripts.
    export_backup = create_backup
    import_backup = restore_backup

    def paperfield_sync_checkpoint(self) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM sync_checkpoints WHERE source_key='paperfield_catalog'"
            ).fetchone()
            if row:
                return dict(row)
        return {
            "source_key": "paperfield_catalog",
            "cursor_value": 0,
            "source_watermark": 0,
            "source_schema_version": 0,
            "updated_at": "",
        }

    def list_paperfield_sync_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM paperfield_sync_runs ORDER BY started_at DESC LIMIT ?",
                (safe_limit,),
            ).fetchall()
            return [self._sync_run_from_row(row) for row in rows]

    @staticmethod
    def _validate_paperfield_sync_page(page: dict[str, Any]) -> tuple[int, int, int, int, list[dict[str, Any]]]:
        if not isinstance(page, dict):
            raise AtlasError("Paperfield catalog 响应必须是对象")
        try:
            schema_version = int(page.get("schemaVersion"))
            cursor = int(page.get("cursor"))
            next_cursor = int(page.get("nextCursor"))
            watermark = int(page.get("watermark"))
        except (TypeError, ValueError) as error:
            raise AtlasError("Paperfield catalog 游标格式无效") from error
        if schema_version != 1:
            raise AtlasError(f"不支持 Paperfield catalog schema v{schema_version}")
        if min(cursor, next_cursor, watermark) < 0 or next_cursor < cursor or watermark < next_cursor:
            raise AtlasError("Paperfield catalog 游标顺序无效")
        items = page.get("items")
        if not isinstance(items, list) or len(items) > 500:
            raise AtlasError("Paperfield catalog items 格式或数量无效")
        previous = cursor
        normalized: list[dict[str, Any]] = []
        for raw in items:
            if not isinstance(raw, dict):
                raise AtlasError("Paperfield catalog 事件必须是对象")
            try:
                sequence = int(raw.get("seq"))
            except (TypeError, ValueError) as error:
                raise AtlasError("Paperfield catalog 事件序号无效") from error
            if sequence <= previous or sequence > next_cursor:
                raise AtlasError("Paperfield catalog 事件序号不是严格递增")
            previous = sequence
            kind = compact_text(raw.get("kind"), 20)
            external_id = compact_text(raw.get("externalId"), 500)
            deleted = bool(raw.get("deleted"))
            payload = raw.get("payload")
            payload_hash = compact_text(raw.get("payloadSha256"), 64).lower()
            if kind not in {"paper", "project"} or not external_id:
                raise AtlasError("Paperfield catalog 事件对象无效")
            if deleted:
                payload = None
            elif not isinstance(payload, dict):
                raise AtlasError("Paperfield catalog upsert 缺少 payload")
            canonical = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            expected_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            if not re.fullmatch(r"[a-f0-9]{64}", payload_hash) or not hmac.compare_digest(payload_hash, expected_hash):
                raise AtlasError("Paperfield catalog payload hash 校验失败")
            normalized.append(
                {
                    "seq": sequence,
                    "kind": kind,
                    "external_id": external_id,
                    "deleted": deleted,
                    "payload": payload,
                    "payload_sha256": payload_hash,
                }
            )
        if normalized and normalized[-1]["seq"] != next_cursor:
            raise AtlasError("Paperfield catalog nextCursor 与最后事件不一致")
        if not normalized and next_cursor != cursor:
            raise AtlasError("空 Paperfield catalog 页面不能推进游标")
        return schema_version, cursor, next_cursor, watermark, normalized

    @staticmethod
    def _paperfield_sync_source_hash(items: list[dict[str, Any]]) -> str:
        """Hash the complete page identity, including tombstones.

        A payload-only digest is insufficient for replay detection: two
        different objects (or an upsert and a delete) can otherwise produce
        the same digest.  Include the immutable event identity and operation
        in the canonical representation used by the idempotency check.
        """
        canonical_items = [
            {
                "seq": int(item["seq"]),
                "kind": item["kind"],
                "external_id": item["external_id"],
                "deleted": bool(item["deleted"]),
                "payload_sha256": item["payload_sha256"],
            }
            for item in items
        ]
        canonical = json.dumps(canonical_items, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def apply_paperfield_sync_page(
        self,
        page: dict[str, Any],
        *,
        source_url: str,
        editor_payload: dict[str, Any],
        reset: bool = False,
    ) -> dict[str, Any]:
        """Apply one page while making a successful network retry idempotent.

        The response can be lost after SQLite commits.  A caller retrying the
        same page must receive the original completed run instead of a cursor
        conflict.  The store lock covers the lookup and apply so two threads
        in this process cannot both consume the same cursor.
        """
        # Validate the caller even when this is only a replay lookup. A
        # previously completed run must not become an authorization bypass.
        self._editor_actor(editor_payload)
        self._editor_reason(editor_payload, required=True)
        _schema_version, cursor, next_cursor, watermark, items = self._validate_paperfield_sync_page(page)
        source_hash = self._paperfield_sync_source_hash(items)
        normalized_url = clean_http_url(source_url)
        with self._lock:
            with self.connect() as db:
                previous = db.execute(
                    """
                    SELECT * FROM paperfield_sync_runs
                    WHERE source_url=? AND status='completed'
                      AND cursor_before=? AND cursor_after=? AND source_watermark=? AND source_sha256=?
                    ORDER BY finished_at DESC LIMIT 1
                    """,
                    (normalized_url, cursor, next_cursor, watermark, source_hash),
                ).fetchone()
            if previous is not None:
                result = self._sync_run_from_row(previous)
                result["idempotent_replay"] = True
                return result
            result = self._apply_paperfield_sync_page_unlocked(
                page,
                source_url=source_url,
                editor_payload=editor_payload,
                reset=reset,
                expected_source_hash=source_hash,
            )
            result["idempotent_replay"] = False
            return result

    def _apply_paperfield_sync_page_unlocked(
        self,
        page: dict[str, Any],
        *,
        source_url: str,
        editor_payload: dict[str, Any],
        reset: bool = False,
        expected_source_hash: str = "",
    ) -> dict[str, Any]:
        actor = self._editor_actor(editor_payload)
        reason = self._editor_reason(editor_payload, required=True)
        schema_version, cursor, next_cursor, watermark, items = self._validate_paperfield_sync_page(page)
        run_id = str(uuid.uuid4())
        started_at = utc_now()
        with self.connect() as db:
            db.execute(
                """
                INSERT INTO paperfield_sync_runs(
                    id, source_url, status, cursor_before, cursor_after, source_watermark,
                    source_schema_version, actor, reason, started_at
                ) VALUES (?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, clean_http_url(source_url), cursor, cursor, watermark, schema_version, actor, reason, started_at),
            )
        counts = {"fetched": len(items), "created": 0, "updated": 0, "deleted": 0, "unchanged": 0}
        source_hash = expected_source_hash or self._paperfield_sync_source_hash(items)
        try:
            with self.connect() as db:
                checkpoint = db.execute(
                    "SELECT * FROM sync_checkpoints WHERE source_key='paperfield_catalog'"
                ).fetchone()
                checkpoint_cursor = int(checkpoint["cursor_value"]) if checkpoint else 0
                if reset:
                    if cursor != 0:
                        raise ConflictError("重置同步必须从 cursor 0 开始")
                elif cursor != checkpoint_cursor:
                    raise ConflictError(f"Paperfield catalog cursor 冲突：期望 {checkpoint_cursor}，收到 {cursor}")
                for item in items:
                    existing = db.execute(
                        "SELECT * FROM paperfield_sync_objects WHERE object_kind=? AND external_id=?",
                        (item["kind"], item["external_id"]),
                    ).fetchone()
                    if existing and int(existing["source_sequence"]) >= item["seq"]:
                        counts["unchanged"] += 1
                        continue
                    same_payload = bool(
                        existing
                        and existing["payload_sha256"] == item["payload_sha256"]
                        and bool(existing["deleted"]) == item["deleted"]
                    )
                    canonical_ref = existing["canonical_ref"] if existing else ""
                    now = utc_now()
                    if item["deleted"]:
                        counts["deleted"] += 1
                    elif same_payload:
                        counts["unchanged"] += 1
                    elif item["kind"] == "paper":
                        paper = self._upsert_paper_with_db(db, item["payload"] or {})
                        canonical_ref = paper["canonical_ref"]
                        counts["updated" if existing else "created"] += 1
                    else:
                        project = self._upsert_project_with_db(db, item["payload"] or {})
                        canonical_ref = project["full_name"]
                        counts["updated" if existing else "created"] += 1
                    db.execute(
                        """
                        INSERT INTO paperfield_sync_objects(
                            object_kind, external_id, canonical_ref, payload_sha256,
                            source_sequence, deleted, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(object_kind, external_id) DO UPDATE SET
                            canonical_ref=excluded.canonical_ref,
                            payload_sha256=excluded.payload_sha256,
                            source_sequence=excluded.source_sequence,
                            deleted=excluded.deleted,
                            updated_at=excluded.updated_at
                        """,
                        (
                            item["kind"], item["external_id"], canonical_ref, item["payload_sha256"],
                            item["seq"], int(item["deleted"]), now, now,
                        ),
                    )
                db.execute(
                    """
                    INSERT INTO sync_checkpoints(
                        source_key, cursor_value, source_watermark, source_schema_version, updated_at
                    ) VALUES('paperfield_catalog', ?, ?, ?, ?)
                    ON CONFLICT(source_key) DO UPDATE SET
                        cursor_value=excluded.cursor_value,
                        source_watermark=excluded.source_watermark,
                        source_schema_version=excluded.source_schema_version,
                        updated_at=excluded.updated_at
                    """,
                    (next_cursor, watermark, schema_version, utc_now()),
                )
                finished_at = utc_now()
                db.execute(
                    """
                    UPDATE paperfield_sync_runs SET
                        status='completed', cursor_after=?, fetched_count=?, created_count=?,
                        updated_count=?, deleted_count=?, unchanged_count=?, source_sha256=?, finished_at=?
                    WHERE id=?
                    """,
                    (
                        next_cursor, counts["fetched"], counts["created"], counts["updated"],
                        counts["deleted"], counts["unchanged"], source_hash, finished_at, run_id,
                    ),
                )
                self._record_editor_audit(
                    db,
                    "paperfield_sync",
                    actor,
                    entity_kind="catalog",
                    entity_id="paperfield",
                    before={"cursor": cursor},
                    after={"cursor": next_cursor, "watermark": watermark, **counts},
                    reason=reason,
                    work_units=float(len(items)),
                )
        except Exception as error:
            with self.connect() as db:
                db.execute(
                    "UPDATE paperfield_sync_runs SET status='failed', finished_at=?, error_text=? WHERE id=?",
                    (utc_now(), compact_text(str(error), 4000), run_id),
                )
            raise
        with self.connect() as db:
            row = db.execute("SELECT * FROM paperfield_sync_runs WHERE id=?", (run_id,)).fetchone()
            assert row is not None
            return self._sync_run_from_row(row)

    def start_frontier_source_run(self, source_name: str, query_spec: list[dict[str, Any]]) -> dict[str, Any]:
        source = compact_text(source_name, 80).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,79}", source):
            raise AtlasError("前沿来源名称不合法")
        if not isinstance(query_spec, list) or not all(isinstance(item, dict) for item in query_spec):
            raise AtlasError("前沿扫描 query spec 必须是对象数组")
        try:
            serialized = json.dumps(query_spec, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as error:
            raise AtlasError("前沿扫描 query spec 不是有效 JSON") from error
        if len(serialized.encode("utf-8")) > 100_000:
            raise AtlasError("前沿扫描 query spec 过大")
        run_id = str(uuid.uuid4())
        now = utc_now()
        stale_before = utc_after(-3600)
        with self._lock, self.connect() as db:
            db.execute(
                """
                UPDATE frontier_source_runs
                SET status='failed', finished_at=?, error_text='扫描进程超过一小时未完成，已由下一次运行恢复'
                WHERE source_name=? AND status='running' AND started_at<?
                """,
                (now, source, stale_before),
            )
            try:
                db.execute(
                    """
                    INSERT INTO frontier_source_runs(id, source_name, status, query_spec_json, started_at)
                    VALUES (?, ?, 'running', ?, ?)
                    """,
                    (run_id, source, serialized, now),
                )
            except sqlite3.IntegrityError as error:
                raise ConflictError(f"{source} 已有扫描正在运行") from error
            row = db.execute("SELECT * FROM frontier_source_runs WHERE id=?", (run_id,)).fetchone()
            assert row is not None
            return self._frontier_source_run_from_row(row)

    def get_frontier_source_run(self, run_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM frontier_source_runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise NotFoundError("前沿来源运行记录不存在")
            return self._frontier_source_run_from_row(row)

    def finish_frontier_source_run(
        self,
        run_id: str,
        status: str,
        query_results: list[dict[str, Any]],
        metrics: dict[str, Any],
        error_text: str = "",
    ) -> dict[str, Any]:
        if status not in FRONTIER_RUN_STATUS - {"running"}:
            raise AtlasError("前沿来源运行终态不合法")
        if not isinstance(query_results, list) or not all(isinstance(item, dict) for item in query_results):
            raise AtlasError("前沿来源结果必须是对象数组")
        try:
            results_json = json.dumps(query_results, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as error:
            raise AtlasError("前沿来源结果不是有效 JSON") from error
        counts: dict[str, int] = {}
        for key in ("fetched", "accepted", "new", "updated", "unchanged"):
            try:
                counts[key] = max(0, int(metrics.get(key) or 0))
            except (TypeError, ValueError) as error:
                raise AtlasError(f"前沿来源指标 {key} 必须是整数") from error
        with self._lock, self.connect() as db:
            row = db.execute("SELECT * FROM frontier_source_runs WHERE id=?", (run_id,)).fetchone()
            if not row:
                raise NotFoundError("前沿来源运行记录不存在")
            if row["status"] != "running":
                raise ConflictError("前沿来源运行已经结束")
            db.execute(
                """
                UPDATE frontier_source_runs
                SET status=?, query_results_json=?, finished_at=?, fetched_count=?, accepted_count=?,
                    new_count=?, updated_count=?, unchanged_count=?, error_text=?
                WHERE id=?
                """,
                (
                    status,
                    results_json,
                    utc_now(),
                    counts["fetched"],
                    counts["accepted"],
                    counts["new"],
                    counts["updated"],
                    counts["unchanged"],
                    compact_text(error_text, 4000),
                    run_id,
                ),
            )
            updated = db.execute("SELECT * FROM frontier_source_runs WHERE id=?", (run_id,)).fetchone()
            assert updated is not None
            return self._frontier_source_run_from_row(updated)

    def record_frontier_candidates(
        self,
        run_id: str,
        source_name: str,
        candidates: list[dict[str, Any]],
    ) -> dict[str, int]:
        if not isinstance(candidates, list) or len(candidates) > 1000:
            raise AtlasError("单次前沿候选数量必须不超过 1000")
        source = compact_text(source_name, 80).lower()
        counts = {"accepted": 0, "new": 0, "updated": 0, "unchanged": 0}
        seen: set[str] = set()
        now = utc_now()
        with self._lock, self.connect() as db:
            run = db.execute("SELECT * FROM frontier_source_runs WHERE id=?", (run_id,)).fetchone()
            if not run:
                raise NotFoundError("前沿来源运行记录不存在")
            if run["status"] != "running" or run["source_name"] != source:
                raise ConflictError("前沿候选与来源运行状态不匹配")
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    raise AtlasError("前沿候选必须是对象")
                identifier = compact_text(
                    candidate.get("sourceIdentifier") or candidate.get("source_identifier"),
                    300,
                ).lower()
                if not identifier or not re.fullmatch(r"[a-z0-9._/-]+", identifier):
                    raise AtlasError("前沿候选来源标识不合法")
                record_key = f"{source}:{identifier}"
                if record_key in seen:
                    continue
                seen.add(record_key)
                payload_sha256 = compact_text(
                    candidate.get("payloadSha256") or candidate.get("payload_sha256"),
                    64,
                ).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", payload_sha256):
                    raise AtlasError("前沿候选缺少有效的来源内容 SHA-256")
                paper_payload = candidate.get("paper")
                if not isinstance(paper_payload, dict):
                    raise AtlasError("前沿候选缺少论文元数据")
                paper = self._upsert_paper_with_db(db, paper_payload)
                source_basis = compact_text(
                    candidate.get("sourceBasis") or candidate.get("source_basis"),
                    20,
                )
                if source_basis not in {"metadata", "abstract"}:
                    source_basis = "abstract" if paper.get("abstract") else "metadata"
                domains = clean_string_list(candidate.get("domains"), 80, 12)
                matched_queries = clean_string_list(
                    candidate.get("matchedQueries") or candidate.get("matched_queries"),
                    240,
                    30,
                )
                categories = clean_string_list(candidate.get("categories"), 80, 30)
                published_at = compact_text(
                    candidate.get("publishedAt") or candidate.get("published_at") or paper.get("published"),
                    80,
                )
                source_updated_at = compact_text(
                    candidate.get("sourceUpdatedAt") or candidate.get("source_updated_at") or published_at,
                    80,
                )
                existing = db.execute(
                    "SELECT * FROM frontier_candidates WHERE source_name=? AND source_identifier=?",
                    (source, identifier),
                ).fetchone()
                if existing is None:
                    counts["new"] += 1
                elif existing["payload_sha256"] != payload_sha256:
                    counts["updated"] += 1
                else:
                    counts["unchanged"] += 1
                db.execute(
                    """
                    INSERT INTO frontier_candidates(
                        canonical_paper_id, source_name, source_identifier, source_basis,
                        domains_json, matched_queries_json, categories_json, published_at,
                        source_updated_at, first_seen_at, last_seen_at, latest_run_id,
                        review_status, payload_sha256
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?)
                    ON CONFLICT(source_name, source_identifier) DO UPDATE SET
                        canonical_paper_id=excluded.canonical_paper_id,
                        source_basis=excluded.source_basis,
                        domains_json=excluded.domains_json,
                        matched_queries_json=excluded.matched_queries_json,
                        categories_json=excluded.categories_json,
                        published_at=excluded.published_at,
                        source_updated_at=excluded.source_updated_at,
                        last_seen_at=excluded.last_seen_at,
                        latest_run_id=excluded.latest_run_id,
                        payload_sha256=excluded.payload_sha256
                    """,
                    (
                        paper["id"],
                        source,
                        identifier,
                        source_basis,
                        json.dumps(domains, ensure_ascii=False),
                        json.dumps(matched_queries, ensure_ascii=False),
                        json.dumps(categories, ensure_ascii=False),
                        published_at,
                        source_updated_at,
                        now,
                        now,
                        run_id,
                        payload_sha256,
                    ),
                )
                counts["accepted"] += 1
        return counts

    def record_frontier_updates(
        self,
        run_id: str,
        candidates: list[dict[str, Any]],
    ) -> dict[str, int]:
        if not isinstance(candidates, list) or len(candidates) > 1000:
            raise AtlasError("单次官方动态候选数量必须不超过 1000")
        counts = {"accepted": 0, "new": 0, "updated": 0, "unchanged": 0}
        seen: set[str] = set()
        now = utc_now()
        with self._lock, self.connect() as db:
            run = db.execute("SELECT * FROM frontier_source_runs WHERE id=?", (run_id,)).fetchone()
            if not run:
                raise NotFoundError("前沿来源运行记录不存在")
            if run["status"] != "running" or run["source_name"] != "official_updates":
                raise ConflictError("官方动态候选与来源运行状态不匹配")
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    raise AtlasError("官方动态候选必须是对象")
                source_key = compact_text(candidate.get("sourceKey") or candidate.get("source_key"), 80).lower()
                if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,79}", source_key):
                    raise AtlasError("官方动态来源 key 不合法")
                identifier = compact_text(
                    candidate.get("sourceIdentifier") or candidate.get("source_identifier"),
                    64,
                ).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", identifier):
                    raise AtlasError("官方动态来源标识必须是 SHA-256")
                record_key = f"{source_key}:{identifier}"
                if record_key in seen:
                    continue
                seen.add(record_key)
                payload_sha256 = compact_text(
                    candidate.get("payloadSha256") or candidate.get("payload_sha256"),
                    64,
                ).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", payload_sha256):
                    raise AtlasError("官方动态候选缺少有效的来源内容 SHA-256")
                source_label = compact_text(candidate.get("sourceLabel") or candidate.get("source_label"), 160)
                source_kind = compact_text(
                    candidate.get("sourceKind") or candidate.get("source_kind") or "first_party",
                    40,
                )
                title = compact_text(candidate.get("title"), 1000)
                summary = clean_multiline_text(candidate.get("summary"), 20_000)
                source_url = clean_http_url(candidate.get("sourceUrl") or candidate.get("source_url"))
                if not source_label or source_kind not in FRONTIER_UPDATE_SOURCE_KINDS:
                    raise AtlasError("官方动态候选缺少有效的来源类型")
                if not title or not source_url:
                    raise AtlasError("官方动态候选缺少标题或来源 URL")
                domains = clean_string_list(candidate.get("domains"), 80, 12)
                matched_queries = clean_string_list(
                    candidate.get("matchedQueries") or candidate.get("matched_queries"),
                    240,
                    30,
                )
                related_refs = clean_string_list(
                    candidate.get("relatedPaperRefs") or candidate.get("related_paper_refs"),
                    500,
                    30,
                )
                published_at = compact_text(
                    candidate.get("publishedAt") or candidate.get("published_at"),
                    80,
                )
                source_updated_at = compact_text(
                    candidate.get("sourceUpdatedAt") or candidate.get("source_updated_at") or published_at,
                    80,
                )
                existing = db.execute(
                    "SELECT * FROM frontier_updates WHERE source_key=? AND source_identifier=?",
                    (source_key, identifier),
                ).fetchone()
                if existing is None:
                    counts["new"] += 1
                elif existing["payload_sha256"] != payload_sha256:
                    counts["updated"] += 1
                else:
                    counts["unchanged"] += 1
                db.execute(
                    """
                    INSERT INTO frontier_updates(
                        source_key, source_label, source_kind, source_identifier, title, summary,
                        source_url, domains_json, matched_queries_json, related_paper_refs_json,
                        published_at, source_updated_at, first_seen_at, last_seen_at, latest_run_id,
                        review_status, payload_sha256
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', ?)
                    ON CONFLICT(source_key, source_identifier) DO UPDATE SET
                        source_label=excluded.source_label,
                        source_kind=excluded.source_kind,
                        title=excluded.title,
                        summary=excluded.summary,
                        source_url=excluded.source_url,
                        domains_json=excluded.domains_json,
                        matched_queries_json=excluded.matched_queries_json,
                        related_paper_refs_json=excluded.related_paper_refs_json,
                        published_at=excluded.published_at,
                        source_updated_at=excluded.source_updated_at,
                        last_seen_at=excluded.last_seen_at,
                        latest_run_id=excluded.latest_run_id,
                        payload_sha256=excluded.payload_sha256
                    """,
                    (
                        source_key,
                        source_label,
                        source_kind,
                        identifier,
                        title,
                        summary,
                        source_url,
                        json.dumps(domains, ensure_ascii=False),
                        json.dumps(matched_queries, ensure_ascii=False),
                        json.dumps(related_refs, ensure_ascii=False),
                        published_at,
                        source_updated_at,
                        now,
                        now,
                        run_id,
                        payload_sha256,
                    ),
                )
                counts["accepted"] += 1
        return counts

    def record_frontier_term_candidates(
        self,
        candidates: list[dict[str, Any]],
        source_name: str = "arxiv",
        synchronize: bool = False,
    ) -> dict[str, int]:
        if not isinstance(candidates, list) or len(candidates) > 5000:
            raise AtlasError("单次术语证据数量必须不超过 5000")
        source = compact_text(source_name, 80).lower()
        counts = {
            "accepted": 0,
            "new_terms": 0,
            "new_evidence": 0,
            "updated_evidence": 0,
            "unchanged_evidence": 0,
            "removed_evidence": 0,
            "removed_terms": 0,
        }
        seen: set[str] = set()
        now = utc_now()
        with self._lock, self.connect() as db:
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    raise AtlasError("术语候选必须是对象")
                source_identifier = compact_text(
                    candidate.get("sourceIdentifier") or candidate.get("source_identifier"),
                    300,
                ).lower()
                frontier_row = db.execute(
                    "SELECT * FROM frontier_candidates WHERE source_name=? AND source_identifier=?",
                    (source, source_identifier),
                ).fetchone()
                if not frontier_row:
                    raise NotFoundError("术语证据对应的论文候选不存在")
                display_term = compact_text(candidate.get("displayTerm") or candidate.get("display_term"), 120)
                normalized_term = re.sub(r"[^a-z0-9]+", "", display_term.casefold())[:120]
                provided_normalized = compact_text(
                    candidate.get("normalizedTerm") or candidate.get("normalized_term"),
                    120,
                ).lower()
                if provided_normalized and provided_normalized != normalized_term:
                    raise AtlasError("术语规范化标识与显示名称不匹配")
                if len(normalized_term) < 2:
                    raise AtlasError("术语候选名称不合法")
                term_kind = compact_text(candidate.get("termKind") or candidate.get("term_kind"), 40)
                if term_kind not in FRONTIER_TERM_KINDS:
                    raise AtlasError("术语候选类型不合法")
                expansion = compact_text(candidate.get("expansion"), 500)
                context_text = clean_multiline_text(
                    candidate.get("contextText") or candidate.get("context_text"),
                    3000,
                )
                extraction_rule = compact_text(
                    candidate.get("extractionRule") or candidate.get("extraction_rule"),
                    80,
                ).lower()
                if not re.fullmatch(r"[a-z0-9][a-z0-9_]{1,79}", extraction_rule):
                    raise AtlasError("术语提取规则标识不合法")
                payload_sha256 = compact_text(
                    candidate.get("payloadSha256") or candidate.get("payload_sha256"),
                    64,
                ).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", payload_sha256):
                    raise AtlasError("术语证据缺少有效的 SHA-256")
                evidence_key = f"{source}:{source_identifier}:{normalized_term}"
                if evidence_key in seen:
                    continue
                seen.add(evidence_key)
                published_at = compact_text(frontier_row["published_at"], 80)
                source_updated_at = compact_text(
                    frontier_row["source_updated_at"] or frontier_row["published_at"],
                    80,
                )
                term_row = db.execute(
                    "SELECT * FROM frontier_term_candidates WHERE normalized_term=?",
                    (normalized_term,),
                ).fetchone()
                if term_row is None:
                    db.execute(
                        """
                        INSERT INTO frontier_term_candidates(
                            normalized_term, display_term, term_kind, canonical_expansion,
                            first_seen_at, last_seen_at, first_source_published_at,
                            last_source_updated_at, review_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed')
                        """,
                        (
                            normalized_term,
                            display_term,
                            term_kind,
                            expansion if term_kind == "defined_acronym" else "",
                            now,
                            now,
                            published_at,
                            source_updated_at,
                        ),
                    )
                    counts["new_terms"] += 1
                    term_row = db.execute(
                        "SELECT * FROM frontier_term_candidates WHERE normalized_term=?",
                        (normalized_term,),
                    ).fetchone()
                else:
                    first_published = min(
                        [value for value in (term_row["first_source_published_at"], published_at) if value],
                        default="",
                    )
                    last_updated = max(
                        [value for value in (term_row["last_source_updated_at"], source_updated_at) if value],
                        default="",
                    )
                    prefer_incoming = term_kind == "defined_acronym" and term_row["term_kind"] != "defined_acronym"
                    db.execute(
                        """
                        UPDATE frontier_term_candidates
                        SET display_term=?, term_kind=?, canonical_expansion=?, last_seen_at=?,
                            first_source_published_at=?, last_source_updated_at=?
                        WHERE id=?
                        """,
                        (
                            display_term if prefer_incoming else term_row["display_term"],
                            term_kind if prefer_incoming else term_row["term_kind"],
                            expansion if prefer_incoming else term_row["canonical_expansion"],
                            now,
                            first_published,
                            last_updated,
                            term_row["id"],
                        ),
                    )
                assert term_row is not None
                existing_evidence = db.execute(
                    """
                    SELECT * FROM frontier_term_evidence
                    WHERE term_id=? AND frontier_candidate_id=?
                    """,
                    (term_row["id"], frontier_row["id"]),
                ).fetchone()
                if existing_evidence is None:
                    counts["new_evidence"] += 1
                elif existing_evidence["payload_sha256"] != payload_sha256:
                    counts["updated_evidence"] += 1
                else:
                    counts["unchanged_evidence"] += 1
                db.execute(
                    """
                    INSERT INTO frontier_term_evidence(
                        term_id, frontier_candidate_id, display_term, expansion, context_text,
                        extraction_rule, payload_sha256, first_seen_at, last_seen_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(term_id, frontier_candidate_id) DO UPDATE SET
                        display_term=excluded.display_term,
                        expansion=excluded.expansion,
                        context_text=excluded.context_text,
                        extraction_rule=excluded.extraction_rule,
                        payload_sha256=excluded.payload_sha256,
                        last_seen_at=excluded.last_seen_at
                    """,
                    (
                        term_row["id"],
                        frontier_row["id"],
                        display_term,
                        expansion,
                        context_text,
                        extraction_rule,
                        payload_sha256,
                        now,
                        now,
                    ),
                )
                counts["accepted"] += 1
            if synchronize:
                evidence_rows = db.execute(
                    """
                    SELECT e.term_id, e.frontier_candidate_id, t.normalized_term,
                           c.source_identifier
                    FROM frontier_term_evidence e
                    JOIN frontier_term_candidates t ON t.id=e.term_id
                    JOIN frontier_candidates c ON c.id=e.frontier_candidate_id
                    WHERE c.source_name=? AND t.review_status='unreviewed'
                    """,
                    (source,),
                ).fetchall()
                for evidence_row in evidence_rows:
                    evidence_key = f"{source}:{evidence_row['source_identifier']}:{evidence_row['normalized_term']}"
                    if evidence_key in seen:
                        continue
                    db.execute(
                        "DELETE FROM frontier_term_evidence WHERE term_id=? AND frontier_candidate_id=?",
                        (evidence_row["term_id"], evidence_row["frontier_candidate_id"]),
                    )
                    counts["removed_evidence"] += 1
                orphan_rows = db.execute(
                    """
                    SELECT t.id FROM frontier_term_candidates t
                    LEFT JOIN frontier_term_evidence e ON e.term_id=t.id
                    WHERE t.review_status='unreviewed'
                    GROUP BY t.id
                    HAVING COUNT(e.frontier_candidate_id)=0
                    """
                ).fetchall()
                for orphan_row in orphan_rows:
                    db.execute("DELETE FROM frontier_term_candidates WHERE id=?", (orphan_row["id"],))
                    counts["removed_terms"] += 1
        return counts

    def list_frontier_candidates(self, limit: int = 40) -> list[dict[str, Any]]:
        safe_limit = max(1, min(1000, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT * FROM frontier_candidates
                ORDER BY source_updated_at DESC, published_at DESC, last_seen_at DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
            return [self._frontier_candidate_from_row(db, row) for row in rows]

    def list_frontier_updates(self, limit: int = 30) -> list[dict[str, Any]]:
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT * FROM frontier_updates
                ORDER BY source_updated_at DESC, published_at DESC, last_seen_at DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
            return [self._frontier_update_from_row(row) for row in rows]

    def list_frontier_terms(self, limit: int = 80) -> list[dict[str, Any]]:
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT t.*, COUNT(e.frontier_candidate_id) AS evidence_count
                FROM frontier_term_candidates t
                LEFT JOIN frontier_term_evidence e ON e.term_id=t.id
                GROUP BY t.id
                ORDER BY evidence_count DESC, t.last_source_updated_at DESC, t.last_seen_at DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
            return [self._frontier_term_from_row(db, row) for row in rows]

    def get_frontier_term(self, term_id: int) -> dict[str, Any]:
        try:
            normalized_id = int(term_id)
        except (TypeError, ValueError) as error:
            raise AtlasError("术语 ID 无效") from error
        with self.connect() as db:
            row = db.execute(
                """
                SELECT t.*, COUNT(e.frontier_candidate_id) AS evidence_count
                FROM frontier_term_candidates t
                LEFT JOIN frontier_term_evidence e ON e.term_id=t.id
                WHERE t.id=?
                GROUP BY t.id
                """,
                (normalized_id,),
            ).fetchone()
            if row is None:
                raise NotFoundError("术语候选不存在")
            result = self._frontier_term_from_row(db, row, evidence_limit=50)
            signal = db.execute(
                "SELECT id, slug, status, revision, title, as_of_date FROM frontier_signals WHERE source_term_id=?",
                (normalized_id,),
            ).fetchone()
            result["signal"] = dict(signal) if signal else None
            result["terminology_boundary"] = {
                "first_seen_means": "Atlas 首次观察到该名称的时间，不等同于领域首次提出时间。",
                "adoption_means": "跨论文出现次数只表示候选库中的采用，不代表共识或等价。",
            }
            return result

    @staticmethod
    def _frontier_score(date_value: Any, evidence_count: int = 0, query_count: int = 0, maturity: str = "") -> dict[str, Any]:
        parsed = parse_utc(date_value)
        age_days = 9999
        if parsed:
            age_days = max(0, (datetime.now(timezone.utc) - parsed).days)
        recency = max(0, 30 - min(30, age_days))
        evidence = min(40, max(0, int(evidence_count)) * 10)
        cross_query = min(20, max(0, int(query_count)) * 5)
        maturity_points = {"validated": 10, "stable": 8, "emerging": 5, "candidate": 2, "contested": 1, "cooling": 0}
        maturity_value = maturity_points.get(maturity, 0)
        return {
            "total": recency + evidence + cross_query + maturity_value,
            "components": {
                "recency": recency,
                "independent_evidence": evidence,
                "cross_query": cross_query,
                "review_maturity": maturity_value,
            },
            "age_days": age_days,
            "policy": "attention score only; it is not a scientific quality or truth score",
        }

    def frontier_radar(
        self,
        *,
        query: str = "",
        domains: list[str] | None = None,
        sources: list[str] | None = None,
        date_from: str = "",
        date_to: str = "",
        maturity: list[str] | None = None,
        review_status: list[str] | None = None,
        limit: int = 40,
    ) -> dict[str, Any]:
        allowed_domains = {compact_text(item, 40).casefold() for item in (domains or []) if compact_text(item, 40)}
        allowed_sources = {compact_text(item, 100).casefold() for item in (sources or []) if compact_text(item, 100)}
        allowed_maturity = {compact_text(item, 40).casefold() for item in (maturity or []) if compact_text(item, 40)}
        allowed_review = {compact_text(item, 40).casefold() for item in (review_status or []) if compact_text(item, 40)}
        needle = compact_text(query, 240).casefold()

        def matches_query(item: dict[str, Any], *extra: Any) -> bool:
            if not needle:
                return True
            haystack = " ".join(
                [
                    str(item.get("title") or ""),
                    str(item.get("summary") or ""),
                    str(item.get("change_summary") or ""),
                    str(item.get("why_it_matters") or ""),
                    str(item.get("source_name") or ""),
                    str(item.get("source_key") or ""),
                    " ".join(str(value) for value in (item.get("matched_queries") or [])),
                    *[str(value) for value in extra],
                ]
            ).casefold()
            return needle in haystack

        def in_date(value: Any) -> bool:
            day = compact_text(value, 80)[:10]
            return (not date_from or day >= date_from[:10]) and (not date_to or day <= date_to[:10])

        signals = self.list_frontier_signals("published", max(200, min(1000, int(limit) * 5)))
        candidates = self.list_frontier_candidates(max(200, min(1000, int(limit) * 5)))
        updates = self.list_frontier_updates(max(200, min(1000, int(limit) * 5)))
        ranked_signals: list[dict[str, Any]] = []
        for signal in signals:
            if not matches_query(signal, signal.get("domain")):
                continue
            if allowed_domains and signal.get("domain", "").casefold() not in allowed_domains:
                continue
            if allowed_maturity and signal.get("maturity", "").casefold() not in allowed_maturity:
                continue
            if allowed_review and signal.get("status", "").casefold() not in allowed_review:
                continue
            if allowed_sources:
                signal_sources = {
                    str(item.get("source_name") or "").casefold()
                    for item in (signal.get("evidence") or [])
                    if isinstance(item, dict)
                }
                if not signal_sources.intersection(allowed_sources):
                    continue
            if not in_date(signal.get("as_of_date")):
                continue
            score = self._frontier_score(
                signal.get("as_of_date"),
                int(signal.get("independent_paper_count") or 0),
                len(signal.get("evidence") or []),
                signal.get("maturity", ""),
            )
            ranked_signals.append({**signal, "ranking": score})
        ranked_signals.sort(
            key=lambda item: (
                -item["ranking"]["total"],
                str(item.get("as_of_date") or ""),
                str(item.get("id") or ""),
            )
        )

        ranked_candidates: list[dict[str, Any]] = []
        for candidate in candidates:
            if not matches_query(candidate, " ".join(candidate.get("domains") or [])):
                continue
            candidate_domains = {str(item).casefold() for item in candidate.get("domains", [])}
            if allowed_domains and not candidate_domains.intersection(allowed_domains):
                continue
            if allowed_sources and str(candidate.get("source_name", "")).casefold() not in allowed_sources:
                continue
            if allowed_review and str(candidate.get("review_status", "")).casefold() not in allowed_review:
                continue
            if not in_date(candidate.get("source_updated_at") or candidate.get("published_at")):
                continue
            score = self._frontier_score(
                candidate.get("source_updated_at") or candidate.get("published_at"),
                int(candidate.get("evidence_count") or 0),
                len(candidate.get("matched_queries") or []),
            )
            ranked_candidates.append({**candidate, "ranking": score})
        ranked_candidates.sort(key=lambda item: (-item["ranking"]["total"], str(item.get("source_identifier") or "")))

        ranked_updates: list[dict[str, Any]] = []
        for update in updates:
            if not matches_query(update, " ".join(update.get("domains") or [])):
                continue
            update_domains = {str(item).casefold() for item in update.get("domains", [])}
            if allowed_domains and not update_domains.intersection(allowed_domains):
                continue
            if allowed_sources and str(update.get("source_key", "")).casefold() not in allowed_sources:
                continue
            if allowed_review and str(update.get("review_status", "")).casefold() not in allowed_review:
                continue
            if not in_date(update.get("source_updated_at") or update.get("published_at")):
                continue
            score = self._frontier_score(
                update.get("source_updated_at") or update.get("published_at"),
                0,
                len(update.get("matched_queries") or []),
            )
            ranked_updates.append({**update, "ranking": score, "evidence_boundary": "first_party_update"})
        ranked_updates.sort(key=lambda item: (-item["ranking"]["total"], str(item.get("source_identifier") or "")))
        raw_terms = self.list_frontier_terms(min(200, max(20, int(limit) * 2)))
        ranked_terms: list[dict[str, Any]] = []
        for term in raw_terms:
            if needle and not matches_query(term, term.get("display_term"), term.get("canonical_expansion")):
                continue
            term_domains = {str(item).casefold() for item in term.get("domains", [])}
            if allowed_domains and not term_domains.intersection(allowed_domains):
                continue
            term_evidence = [item for item in (term.get("evidence") or []) if isinstance(item, dict)]
            if allowed_sources:
                term_sources = {str(item.get("source_name") or "").casefold() for item in term_evidence}
                if not term_sources.intersection(allowed_sources):
                    continue
            if date_from or date_to:
                if not any(in_date(item.get("source_updated_at") or item.get("published_at")) for item in term_evidence):
                    continue
            ranked_terms.append(term)
        return {
            "as_of": utc_now(),
            "filters": {
                "query": query[:240],
                "domains": sorted(allowed_domains),
                "sources": sorted(allowed_sources),
                "date_from": date_from[:10],
                "date_to": date_to[:10],
                "maturity": sorted(allowed_maturity),
                "review_status": sorted(allowed_review),
            },
            "ranking_policy": "Signals, candidate papers and first-party updates are separate evidence layers. News never raises paper evidence level.",
            "signals": ranked_signals[:limit],
            "candidates": ranked_candidates[:limit],
            "updates": ranked_updates[:limit],
            "terms": ranked_terms[: min(200, max(20, int(limit) * 2))],
            "sources": {
                "papers": self.frontier_source_state(),
                "updates": self.frontier_update_source_state(),
            },
        }

    @staticmethod
    def _signal_evidence_ids(value: Any) -> list[int]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise AtlasError("evidenceCandidateIds 必须是数组")
        result: list[int] = []
        for raw in value[:20]:
            try:
                candidate_id = int(raw)
            except (TypeError, ValueError) as error:
                raise AtlasError("证据候选 ID 必须是整数") from error
            if candidate_id <= 0:
                raise AtlasError("证据候选 ID 无效")
            if candidate_id not in result:
                result.append(candidate_id)
        return result

    @staticmethod
    def _signal_fields(payload: dict[str, Any], current: sqlite3.Row | None = None) -> dict[str, str]:
        current_values = dict(current) if current else {}

        def field(camel: str, snake: str, default: str = "") -> Any:
            if camel in payload:
                return payload[camel]
            if snake in payload:
                return payload[snake]
            return current_values.get(snake, default)

        signal_type = compact_text(field("signalType", "signal_type", "terminology_shift"), 60)
        if signal_type not in FRONTIER_SIGNAL_TYPES:
            raise AtlasError("signalType 无效")
        maturity = compact_text(field("maturity", "maturity", "candidate"), 40)
        if maturity not in FRONTIER_SIGNAL_MATURITY:
            raise AtlasError("maturity 无效")
        title = compact_text(field("title", "title"), 300)
        change_summary = clean_multiline_text(field("changeSummary", "change_summary"), 6000)
        why_it_matters = clean_multiline_text(field("whyItMatters", "why_it_matters"), 6000)
        known_unknowns = clean_multiline_text(field("knownUnknowns", "known_unknowns"), 6000)
        counter_evidence = clean_multiline_text(field("counterEvidence", "counter_evidence"), 6000)
        editor_name = compact_text(field("editorName", "editor_name", "本地编辑"), 120)
        review_reason = clean_multiline_text(field("reviewReason", "review_reason"), 2000)
        if not title:
            raise AtlasError("研究变化标题不能为空")
        if len(change_summary) < 20:
            raise AtlasError("变化说明至少需要 20 个字符")
        if not editor_name:
            raise AtlasError("必须记录草稿编辑者")
        return {
            "signal_type": signal_type,
            "maturity": maturity,
            "title": title,
            "change_summary": change_summary,
            "why_it_matters": why_it_matters,
            "known_unknowns": known_unknowns,
            "counter_evidence": counter_evidence,
            "editor_name": editor_name,
            "review_reason": review_reason,
        }

    @staticmethod
    def _signal_evidence_rows(
        db: sqlite3.Connection,
        term_id: int,
        requested_ids: list[int],
    ) -> list[sqlite3.Row]:
        all_rows = db.execute(
            """
            SELECT evidence.*, candidate.canonical_paper_id, candidate.domains_json,
                   candidate.source_basis
            FROM frontier_term_evidence evidence
            JOIN frontier_candidates candidate ON candidate.id=evidence.frontier_candidate_id
            WHERE evidence.term_id=?
            ORDER BY candidate.source_updated_at DESC, candidate.published_at DESC
            """,
            (term_id,),
        ).fetchall()
        selected_ids = requested_ids or [int(row["frontier_candidate_id"]) for row in all_rows]
        selected = [row for row in all_rows if int(row["frontier_candidate_id"]) in selected_ids]
        if len(selected) != len(selected_ids):
            raise AtlasError("所选论文不属于该术语的证据集合")
        independent_papers = {int(row["canonical_paper_id"]) for row in selected}
        if len(independent_papers) < 2:
            raise AtlasError("研究变化草稿至少需要两篇独立论文证据")
        return selected

    @staticmethod
    def _signal_domain(evidence_rows: list[sqlite3.Row]) -> str:
        domains = {
            domain
            for row in evidence_rows
            for domain in json.loads(row["domains_json"] or "[]")
            if domain in {"embodied", "llm"}
        }
        return next(iter(domains)) if len(domains) == 1 else "cross"

    @staticmethod
    def _signal_snapshot(signal: dict[str, Any]) -> dict[str, Any]:
        return {
            key: signal.get(key)
            for key in (
                "id",
                "source_term_id",
                "slug",
                "signal_type",
                "title",
                "change_summary",
                "why_it_matters",
                "known_unknowns",
                "counter_evidence",
                "domain",
                "maturity",
                "status",
                "source_basis",
                "as_of_date",
                "editor_name",
                "review_reason",
                "revision",
                "created_at",
                "updated_at",
                "reviewed_at",
                "published_at",
                "retracted_at",
            )
        } | {
            "evidence": [
                {
                    "candidate_id": item.get("candidate_id"),
                    "canonical_ref": (item.get("paper") or {}).get("canonical_ref", ""),
                    "direction": item.get("direction"),
                    "evidence_role": item.get("evidence_role"),
                    "context_text": item.get("context_text"),
                    "source_basis": item.get("source_basis"),
                    "payload_sha256": item.get("payload_sha256"),
                }
                for item in signal.get("evidence", [])
            ]
        }

    @classmethod
    def _record_signal_revision(
        cls,
        db: sqlite3.Connection,
        row: sqlite3.Row,
        action: str,
        editor_name: str,
        reason: str,
    ) -> None:
        signal = cls._frontier_signal_from_row(db, row)
        db.execute(
            """
            INSERT INTO frontier_signal_revisions(
                signal_id, revision, action, snapshot_json, editor_name, reason, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                signal["id"],
                signal["revision"],
                action,
                json.dumps(cls._signal_snapshot(signal), ensure_ascii=False),
                editor_name,
                reason,
                utc_now(),
            ),
        )

    @staticmethod
    def _replace_signal_evidence(
        db: sqlite3.Connection,
        signal_id: str,
        evidence_rows: list[sqlite3.Row],
    ) -> None:
        db.execute("DELETE FROM frontier_signal_evidence WHERE signal_id=?", (signal_id,))
        now = utc_now()
        for row in evidence_rows:
            source_basis = "public_abstract" if row["source_basis"] == "abstract" else "metadata_context"
            db.execute(
                """
                INSERT INTO frontier_signal_evidence(
                    signal_id, frontier_candidate_id, direction, evidence_role,
                    context_text, source_basis, payload_sha256, added_at
                ) VALUES (?, ?, 'supports', 'naming_context', ?, ?, ?, ?)
                """,
                (
                    signal_id,
                    row["frontier_candidate_id"],
                    row["context_text"],
                    source_basis,
                    row["payload_sha256"],
                    now,
                ),
            )

    def create_frontier_signal_from_term(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            term_id = int(payload.get("sourceTermId") or payload.get("source_term_id"))
        except (TypeError, ValueError) as error:
            raise AtlasError("sourceTermId 必须是整数") from error
        fields = self._signal_fields(payload)
        evidence_ids = self._signal_evidence_ids(
            payload.get("evidenceCandidateIds", payload.get("evidence_candidate_ids"))
        )
        with self.connect() as db:
            term_row = db.execute(
                "SELECT * FROM frontier_term_candidates WHERE id=?",
                (term_id,),
            ).fetchone()
            if term_row is None:
                raise NotFoundError("术语候选不存在")
            if db.execute("SELECT 1 FROM frontier_signals WHERE source_term_id=?", (term_id,)).fetchone():
                raise ConflictError("该术语已经存在研究变化草稿")
            evidence_rows = self._signal_evidence_rows(db, term_id, evidence_ids)
            slug_base = re.sub(r"[^a-z0-9]+", "-", str(term_row["normalized_term"]).lower()).strip("-")
            slug = f"{slug_base or f'term-{term_id}'}-signal"
            signal_id = str(uuid.uuid4())
            now = utc_now()
            db.execute(
                """
                INSERT INTO frontier_signals(
                    id, source_term_id, slug, signal_type, title, change_summary,
                    why_it_matters, known_unknowns, counter_evidence, domain,
                    maturity, status, source_basis, as_of_date, editor_name,
                    review_reason, revision, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft',
                          'abstract_context', ?, ?, ?, 1, ?, ?)
                """,
                (
                    signal_id,
                    term_id,
                    slug,
                    fields["signal_type"],
                    fields["title"],
                    fields["change_summary"],
                    fields["why_it_matters"],
                    fields["known_unknowns"],
                    fields["counter_evidence"],
                    self._signal_domain(evidence_rows),
                    fields["maturity"],
                    datetime.now().date().isoformat(),
                    fields["editor_name"],
                    fields["review_reason"],
                    now,
                    now,
                ),
            )
            self._replace_signal_evidence(db, signal_id, evidence_rows)
            row = db.execute("SELECT * FROM frontier_signals WHERE id=?", (signal_id,)).fetchone()
            assert row is not None
            self._record_signal_revision(
                db,
                row,
                "created",
                fields["editor_name"],
                fields["review_reason"] or "从术语证据建立草稿",
            )
            return self._frontier_signal_from_row(db, row, include_revisions=True)

    def update_frontier_signal(self, signal_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_id = compact_text(signal_id, 80)
        with self.connect() as db:
            current = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            if current is None:
                raise NotFoundError("研究变化草稿不存在")
            if current["status"] != "draft":
                raise ConflictError("只有草稿状态可以编辑")
            fields = self._signal_fields(payload, current)
            raw_ids = payload.get("evidenceCandidateIds", payload.get("evidence_candidate_ids"))
            if raw_ids is None:
                evidence_ids = [
                    int(row[0])
                    for row in db.execute(
                        "SELECT frontier_candidate_id FROM frontier_signal_evidence WHERE signal_id=?",
                        (normalized_id,),
                    ).fetchall()
                ]
            else:
                evidence_ids = self._signal_evidence_ids(raw_ids)
            evidence_rows = self._signal_evidence_rows(db, int(current["source_term_id"]), evidence_ids)
            now = utc_now()
            db.execute(
                """
                UPDATE frontier_signals
                SET signal_type=?, title=?, change_summary=?, why_it_matters=?,
                    known_unknowns=?, counter_evidence=?, domain=?, maturity=?,
                    editor_name=?, review_reason=?, revision=revision+1, updated_at=?
                WHERE id=?
                """,
                (
                    fields["signal_type"],
                    fields["title"],
                    fields["change_summary"],
                    fields["why_it_matters"],
                    fields["known_unknowns"],
                    fields["counter_evidence"],
                    self._signal_domain(evidence_rows),
                    fields["maturity"],
                    fields["editor_name"],
                    fields["review_reason"],
                    now,
                    normalized_id,
                ),
            )
            self._replace_signal_evidence(db, normalized_id, evidence_rows)
            row = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            assert row is not None
            self._record_signal_revision(
                db,
                row,
                "updated",
                fields["editor_name"],
                fields["review_reason"] or "更新研究变化草稿",
            )
            return self._frontier_signal_from_row(db, row, include_revisions=True)

    def publish_frontier_signal(self, signal_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_id = compact_text(signal_id, 80)
        editor_name = compact_text(payload.get("editorName") or payload.get("editor_name"), 120)
        review_reason = clean_multiline_text(payload.get("reviewReason") or payload.get("review_reason"), 2000)
        if not editor_name:
            raise AtlasError("发布必须记录审核者")
        if len(review_reason) < 10:
            raise AtlasError("发布审核理由至少需要 10 个字符")
        with self.connect() as db:
            current = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            if current is None:
                raise NotFoundError("研究变化草稿不存在")
            if current["status"] != "draft":
                raise ConflictError("只有草稿可以发布")
            signal = self._frontier_signal_from_row(db, current)
            if signal["independent_paper_count"] < 2:
                raise AtlasError("发布至少需要两篇独立论文证据")
            if len(signal["why_it_matters"]) < 20:
                raise AtlasError("发布前必须补充至少 20 个字符的关注理由")
            if len(signal["known_unknowns"]) < 10:
                raise AtlasError("发布前必须明确当前未知项或反证边界")
            now = utc_now()
            db.execute(
                """
                UPDATE frontier_signals
                SET status='published', editor_name=?, review_reason=?, revision=revision+1,
                    reviewed_at=?, published_at=?, updated_at=?
                WHERE id=?
                """,
                (editor_name, review_reason, now, now, now, normalized_id),
            )
            db.execute(
                "UPDATE frontier_term_candidates SET review_status='promoted' WHERE id=?",
                (current["source_term_id"],),
            )
            row = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            assert row is not None
            self._record_signal_revision(db, row, "published", editor_name, review_reason)
            return self._frontier_signal_from_row(db, row, include_revisions=True)

    def retract_frontier_signal(self, signal_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_id = compact_text(signal_id, 80)
        editor_name = compact_text(payload.get("editorName") or payload.get("editor_name"), 120)
        reason = clean_multiline_text(payload.get("reviewReason") or payload.get("review_reason"), 2000)
        if not editor_name or len(reason) < 10:
            raise AtlasError("撤回必须记录审核者和至少 10 个字符的理由")
        with self.connect() as db:
            current = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            if current is None:
                raise NotFoundError("研究变化不存在")
            if current["status"] != "published":
                raise ConflictError("只有已发布研究变化可以撤回")
            now = utc_now()
            db.execute(
                """
                UPDATE frontier_signals
                SET status='retracted', editor_name=?, review_reason=?, revision=revision+1,
                    retracted_at=?, updated_at=?
                WHERE id=?
                """,
                (editor_name, reason, now, now, normalized_id),
            )
            row = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            assert row is not None
            self._record_signal_revision(db, row, "retracted", editor_name, reason)
            return self._frontier_signal_from_row(db, row, include_revisions=True)

    def get_frontier_signal(self, signal_id: str) -> dict[str, Any]:
        normalized_id = compact_text(signal_id, 80)
        with self.connect() as db:
            row = db.execute("SELECT * FROM frontier_signals WHERE id=?", (normalized_id,)).fetchone()
            if row is None:
                raise NotFoundError("研究变化不存在")
            return self._frontier_signal_from_row(db, row, include_revisions=True)

    def list_frontier_signals(self, status: str = "published", limit: int = 40) -> list[dict[str, Any]]:
        normalized_status = compact_text(status, 20) or "published"
        if normalized_status not in FRONTIER_SIGNAL_STATUS:
            raise AtlasError("研究变化状态无效")
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT * FROM frontier_signals
                WHERE status=?
                ORDER BY COALESCE(published_at, updated_at) DESC, updated_at DESC
                LIMIT ?
                """,
                (normalized_status, safe_limit),
            ).fetchall()
            return [self._frontier_signal_from_row(db, row) for row in rows]

    def list_frontier_source_runs(self, limit: int = 20) -> list[dict[str, Any]]:
        safe_limit = max(1, min(100, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM frontier_source_runs ORDER BY started_at DESC LIMIT ?",
                (safe_limit,),
            ).fetchall()
            return [self._frontier_source_run_from_row(row) for row in rows]

    def _frontier_source_state_for(self, source_name: str, candidate_table: str) -> dict[str, Any]:
        if candidate_table not in {"frontier_candidates", "frontier_updates"}:
            raise ValueError("unsupported frontier candidate table")
        with self.connect() as db:
            latest = db.execute(
                "SELECT * FROM frontier_source_runs WHERE source_name=? ORDER BY started_at DESC LIMIT 1",
                (source_name,),
            ).fetchone()
            usable = db.execute(
                """
                SELECT * FROM frontier_source_runs
                WHERE source_name=? AND status IN ('completed', 'partial')
                ORDER BY finished_at DESC LIMIT 1
                """,
                (source_name,),
            ).fetchone()
            candidate_count = db.execute(f"SELECT COUNT(*) FROM {candidate_table}").fetchone()[0]
            unreviewed_count = db.execute(
                f"SELECT COUNT(*) FROM {candidate_table} WHERE review_status='unreviewed'"
            ).fetchone()[0]
            if latest is None:
                status = "not_connected"
            elif latest["status"] == "running":
                status = "scanning"
            elif latest["status"] == "completed":
                status = "connected"
            else:
                status = "degraded"
            return {
                "status": status,
                "candidate_count": candidate_count,
                "unreviewed_count": unreviewed_count,
                "latest_run": self._frontier_source_run_from_row(latest) if latest else None,
                "last_usable_run": self._frontier_source_run_from_row(usable) if usable else None,
            }

    def frontier_source_state(self) -> dict[str, Any]:
        return self._frontier_source_state_for("arxiv", "frontier_candidates")

    def frontier_update_source_state(self) -> dict[str, Any]:
        return self._frontier_source_state_for("official_updates", "frontier_updates")

    @staticmethod
    def _focus_from_row(row: sqlite3.Row | None) -> dict[str, Any]:
        if row is None:
            return {
                "owner_id": "local",
                "domains": [],
                "keywords": [],
                "source_keys": [],
                "method_ids": [],
                "problem_ids": [],
                "thread_ids": [],
                "created_at": "",
                "updated_at": "",
            }
        result = dict(row)
        for field in ("domains", "keywords", "source_keys", "method_ids", "problem_ids", "thread_ids"):
            result[field] = json.loads(result.pop(f"{field}_json") or "[]")
        return result

    def get_focus_profile(self, owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        with self.connect() as db:
            row = db.execute("SELECT * FROM focus_profiles WHERE owner_id=?", (owner,)).fetchone()
            return self._focus_from_row(row)

    def update_focus_profile(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        domains = clean_string_list(payload.get("domains"), 80, 20)
        keywords = clean_string_list(payload.get("keywords"), 160, 50)
        source_keys = clean_string_list(payload.get("sourceKeys") or payload.get("source_keys"), 120, 30)
        requested: dict[str, list[str]] = {}
        for key, field in (
            ("methodIds", "method_ids"),
            ("problemIds", "problem_ids"),
            ("threadIds", "thread_ids"),
        ):
            values = clean_string_list(payload.get(key) or payload.get(field), 160, 50)
            requested[field] = values
        now = utc_now()
        with self._lock, self.connect() as db:
            for field, kind in (("method_ids", "method"), ("problem_ids", "problem"), ("thread_ids", "thread")):
                for entity_id in requested[field]:
                    row = db.execute(
                        "SELECT status FROM knowledge_entities WHERE id=? AND entity_kind=?",
                        (entity_id, kind),
                    ).fetchone()
                    if row is None or row["status"] == "merged":
                        raise NotFoundError(f"关注的{kind}实体不存在")
            existing = db.execute("SELECT created_at FROM focus_profiles WHERE owner_id=?", (owner,)).fetchone()
            db.execute(
                """
                INSERT INTO focus_profiles(
                    owner_id, domains_json, keywords_json, source_keys_json,
                    method_ids_json, problem_ids_json, thread_ids_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(owner_id) DO UPDATE SET
                    domains_json=excluded.domains_json,
                    keywords_json=excluded.keywords_json,
                    source_keys_json=excluded.source_keys_json,
                    method_ids_json=excluded.method_ids_json,
                    problem_ids_json=excluded.problem_ids_json,
                    thread_ids_json=excluded.thread_ids_json,
                    updated_at=excluded.updated_at
                """,
                (
                    owner,
                    json.dumps(domains, ensure_ascii=False),
                    json.dumps(keywords, ensure_ascii=False),
                    json.dumps(source_keys, ensure_ascii=False),
                    json.dumps(requested["method_ids"], ensure_ascii=False),
                    json.dumps(requested["problem_ids"], ensure_ascii=False),
                    json.dumps(requested["thread_ids"], ensure_ascii=False),
                    existing["created_at"] if existing else now,
                    now,
                ),
            )
            row = db.execute("SELECT * FROM focus_profiles WHERE owner_id=?", (owner,)).fetchone()
            assert row is not None
            actor = self._editor_actor(payload, required=False)
            self._record_editor_audit(
                db,
                "focus_profile_updated",
                actor,
                entity_kind="focus_profile",
                entity_id=owner,
                after=self._focus_from_row(row),
                reason=self._editor_reason(payload, required=False),
            )
            return self._focus_from_row(row)

    @staticmethod
    def _saved_item_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["tags"] = json.loads(result.pop("tags_json") or "[]")
        result["saved"] = True
        return result

    def list_saved_items(self, owner_id: str = "local", limit: int = 200) -> list[dict[str, Any]]:
        safe_limit = max(1, min(500, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM saved_items WHERE owner_id=? ORDER BY updated_at DESC, id DESC LIMIT ?",
                (compact_text(owner_id, 120) or "local", safe_limit),
            ).fetchall()
            return [self._saved_item_from_row(row) for row in rows]

    def save_item(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        item_kind = compact_text(payload.get("itemKind") or payload.get("item_kind"), 40).lower()
        item_ref = compact_text(payload.get("itemRef") or payload.get("item_ref"), 500)
        if item_kind not in SAVED_ITEM_KINDS or not item_ref:
            raise AtlasError("保存对象类型或引用无效")
        title = compact_text(payload.get("title"), 500)
        tags = clean_string_list(payload.get("tags"), 120, 20)
        note = clean_multiline_text(payload.get("note"), 4000)
        now = utc_now()
        with self._lock, self.connect() as db:
            existing = db.execute(
                "SELECT * FROM saved_items WHERE owner_id=? AND item_kind=? AND item_ref=?",
                (owner, item_kind, item_ref),
            ).fetchone()
            item_id = existing["id"] if existing else str(uuid.uuid4())
            db.execute(
                """
                INSERT INTO saved_items(id, owner_id, item_kind, item_ref, title, tags_json, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(owner_id, item_kind, item_ref) DO UPDATE SET
                    title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE saved_items.title END,
                    tags_json=excluded.tags_json,
                    note=excluded.note,
                    updated_at=excluded.updated_at
                """,
                (item_id, owner, item_kind, item_ref, title, json.dumps(tags, ensure_ascii=False), note,
                 existing["created_at"] if existing else now, now),
            )
            row = db.execute("SELECT * FROM saved_items WHERE id=?", (item_id,)).fetchone()
            assert row is not None
            self._record_editor_audit(
                db,
                "saved_item_updated" if existing else "saved_item_created",
                self._editor_actor(payload, required=False),
                entity_kind=item_kind,
                entity_id=item_ref,
                after=self._saved_item_from_row(row),
                reason=self._editor_reason(payload, required=False),
            )
            return self._saved_item_from_row(row)

    def delete_saved_item(self, item_id: str, owner_id: str = "local") -> dict[str, Any]:
        normalized_id = compact_text(item_id, 120)
        owner = compact_text(owner_id, 120) or "local"
        with self._lock, self.connect() as db:
            row = db.execute("SELECT * FROM saved_items WHERE id=? AND owner_id=?", (normalized_id, owner)).fetchone()
            if row is None:
                raise NotFoundError("保存对象不存在")
            result = self._saved_item_from_row(row)
            db.execute("DELETE FROM saved_items WHERE id=? AND owner_id=?", (normalized_id, owner))
            self._record_editor_audit(
                db,
                "saved_item_deleted",
                "本地编辑",
                entity_kind=result["item_kind"],
                entity_id=result["item_ref"],
                before=result,
            )
            return result

    @staticmethod
    def _learning_row_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["confidence"] = int(result["confidence"]) if result.get("confidence") is not None else None
        return result

    @staticmethod
    def _learning_owner(owner_id: Any) -> str:
        owner = compact_text(str(owner_id or ""), 120).lower()
        if not owner:
            return "local"
        if not re.fullmatch(r"[a-z0-9][a-z0-9._:@-]{0,119}", owner):
            raise AtlasError("学习记录所属账户标识无效")
        return owner

    def learning_projection(self, owner_id: str = "local") -> dict[str, Any]:
        """Return the curriculum joined with explicit user learning state.

        A page visit never changes this projection.  Only rows written by
        ``update_learning_progress`` participate in readiness and queue
        calculations, which keeps recommendations explainable and reversible.
        """
        owner = self._learning_owner(owner_id)
        curriculum = build_curriculum()
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM learning_progress WHERE owner_id=?",
                (owner,),
            ).fetchall()
        saved = {str(row["chapter_id"]): self._learning_row_from_row(row) for row in rows}
        chapters = _curriculum_chapter_index()
        items: list[dict[str, Any]] = []
        counts = {status: 0 for status in LEARNING_STATUSES}
        for track in curriculum.get("tracks", []):
            for module in track.get("modules", []):
                for chapter in module.get("chapters", []):
                    chapter_id = str(chapter.get("id", ""))
                    record = saved.get(chapter_id, {})
                    status = record.get("status", "not_started")
                    if status not in LEARNING_STATUSES:
                        status = "not_started"
                    counts[status] += 1
                    prerequisite_ids = [str(value) for value in chapter.get("prerequisites", [])]
                    prerequisite_gaps = [
                        {
                            "chapter_id": prerequisite_id,
                            "title": chapters.get(prerequisite_id, {}).get("title", prerequisite_id),
                            "status": saved.get(prerequisite_id, {}).get("status", "not_started"),
                        }
                        for prerequisite_id in prerequisite_ids
                        if saved.get(prerequisite_id, {}).get("status") != "mastered"
                    ]
                    ready = status != "mastered" and not prerequisite_gaps
                    item = {
                        "chapter_id": chapter_id,
                        "track_id": track.get("id", ""),
                        "track_title": track.get("title", ""),
                        "module_id": module.get("id", ""),
                        "module_title": module.get("title", ""),
                        "chapter_code": chapter.get("code", ""),
                        "chapter_title": chapter.get("title", ""),
                        "chapter_order": chapter.get("order", 0),
                        "status": status,
                        "confidence": record.get("confidence"),
                        "note": record.get("note", ""),
                        "source": record.get("source", "explicit_user_action"),
                        "started_at": record.get("started_at", ""),
                        "last_reviewed_at": record.get("last_reviewed_at", ""),
                        "updated_at": record.get("updated_at", ""),
                        "prerequisites": prerequisite_ids,
                        "prerequisite_gaps": prerequisite_gaps,
                        "ready": ready,
                        "blocked": bool(prerequisite_gaps) and status != "mastered",
                    }
                    items.append(item)
        queue: list[dict[str, Any]] = []
        for item in items:
            if item["status"] == "mastered":
                continue
            if item["prerequisite_gaps"]:
                continue
            if item["status"] == "review":
                reason, priority = "你标记为需复习，且先修已满足", 0
            elif item["status"] in {"learning", "queued"}:
                reason, priority = "你已显式加入学习路径", 1
            else:
                reason, priority = "先修已满足，可作为下一步", 2
            queue.append({
                "chapter_id": item["chapter_id"],
                "track_id": item["track_id"],
                "chapter_code": item["chapter_code"],
                "chapter_title": item["chapter_title"],
                "module_title": item["module_title"],
                "status": item["status"],
                "priority": priority,
                "reason": reason,
            })
        queue.sort(key=lambda value: (value["priority"], value["track_id"], value["chapter_code"]))
        total = len(items)
        track_stats: dict[str, dict[str, Any]] = {}
        for track_id in {str(item["track_id"]) for item in items}:
            track_items = [item for item in items if str(item["track_id"]) == track_id]
            track_counts = {
                status: sum(1 for item in track_items if item["status"] == status)
                for status in LEARNING_STATUSES
            }
            track_total = len(track_items)
            track_stats[track_id] = {
                "total": track_total,
                **track_counts,
                "blocked": sum(1 for item in track_items if item["blocked"]),
                "ready": sum(1 for item in track_items if item["ready"]),
                "completion_ratio": (track_counts["mastered"] / track_total) if track_total else 0,
            }
        return {
            "schema_version": 1,
            "owner_id": owner,
            "curriculum_version": curriculum.get("curriculum_version", ""),
            "items": items,
            "queue": queue[:24],
            "stats": {
                "total": total,
                "mastered": counts["mastered"],
                "learning": counts["learning"],
                "queued": counts["queued"],
                "review": counts["review"],
                "not_started": counts["not_started"],
                "blocked": sum(1 for item in items if item["blocked"]),
                "ready": sum(1 for item in items if item["ready"]),
                "completion_ratio": (counts["mastered"] / total) if total else 0,
            },
            "track_stats": track_stats,
            "updated_at": max((item["updated_at"] for item in items if item["updated_at"]), default=""),
        }

    def update_learning_progress(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        owner = self._learning_owner(owner_id)
        chapter_id = compact_text(payload.get("chapterId") or payload.get("chapter_id"), 160)
        if chapter_id not in _curriculum_chapter_index():
            raise NotFoundError("课程章节不存在")
        status = compact_text(payload.get("status"), 30).lower() or "not_started"
        if status not in LEARNING_STATUSES:
            raise AtlasError("学习状态必须是 not_started、queued、learning、review 或 mastered")
        confidence_supplied = "confidence" in payload
        confidence_value = payload.get("confidence")
        confidence: int | None
        if confidence_value in (None, ""):
            confidence = None
        else:
            try:
                confidence = int(confidence_value)
            except (TypeError, ValueError) as error:
                raise AtlasError("掌握信心必须是 0-100 的整数") from error
            if confidence < 0 or confidence > 100:
                raise AtlasError("掌握信心必须是 0-100 的整数")
        note_supplied = "note" in payload
        note = clean_multiline_text(payload.get("note"), 2000)
        now = utc_now()
        with self._lock, self.connect() as db:
            previous = db.execute(
                "SELECT * FROM learning_progress WHERE owner_id=? AND chapter_id=?",
                (owner, chapter_id),
            ).fetchone()
            if previous and not confidence_supplied:
                confidence = int(previous["confidence"]) if previous["confidence"] is not None else None
            if previous and not note_supplied:
                note = str(previous["note"] or "")
            started_at = previous["started_at"] if previous else None
            if status in {"queued", "learning"} and not started_at:
                started_at = now
            last_reviewed_at = now if status in {"review", "mastered"} else (previous["last_reviewed_at"] if previous else None)
            db.execute(
                """
                INSERT INTO learning_progress(
                    owner_id, chapter_id, status, confidence, note, source,
                    started_at, last_reviewed_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'explicit_user_action', ?, ?, ?)
                ON CONFLICT(owner_id, chapter_id) DO UPDATE SET
                    status=excluded.status,
                    confidence=excluded.confidence,
                    note=excluded.note,
                    source=excluded.source,
                    started_at=excluded.started_at,
                    last_reviewed_at=excluded.last_reviewed_at,
                    updated_at=excluded.updated_at
                """,
                (owner, chapter_id, status, confidence, note, started_at, last_reviewed_at, now),
            )
            self._record_editor_audit(
                db,
                "learning_progress_updated",
                self._editor_actor(payload, required=False),
                entity_kind="curriculum_chapter",
                entity_id=chapter_id,
                before=self._learning_row_from_row(previous) if previous else None,
                after={"owner_id": owner, "chapter_id": chapter_id, "status": status, "confidence": confidence, "note": note},
                reason=self._editor_reason(payload, required=False),
            )
        projection = self.learning_projection(owner)
        current = next(item for item in projection["items"] if item["chapter_id"] == chapter_id)
        return {"item": current, "projection": projection}

    @staticmethod
    def _research_view_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["definition"] = json.loads(result.pop("definition_json") or "{}")
        result["evidence_boundary"] = json.loads(result.pop("evidence_boundary_json") or "{}")
        return result

    @staticmethod
    def _research_view_run_from_row(row: sqlite3.Row, *, include_result: bool = True) -> dict[str, Any]:
        result = dict(row)
        result["definition"] = json.loads(result.pop("definition_json") or "{}")
        result["evidence_boundary"] = json.loads(result.pop("evidence_boundary_json") or "{}")
        result["delta"] = json.loads(result.pop("delta_json", "{}") or "{}")
        raw_result = result.pop("result_json")
        if include_result:
            result["result"] = json.loads(raw_result or "{}")
        return result

    @staticmethod
    def _research_run_items(view_kind: str, result: dict[str, Any]) -> list[dict[str, str]]:
        if view_kind == "search":
            source = result.get("items") or []
            return [
                {
                    "key": f"{compact_text(item.get('kind'), 30)}:{compact_text(item.get('canonical_ref') or item.get('ref'), 500)}",
                    "kind": compact_text(item.get("kind"), 30),
                    "ref": compact_text(item.get("canonical_ref") or item.get("ref"), 500),
                    "title": compact_text(item.get("title"), 1000),
                }
                for item in source
                if isinstance(item, dict) and compact_text(item.get("canonical_ref") or item.get("ref"), 500)
            ]
        fields = (
            ("signals", "signal", "title", "id"),
            ("candidates", "paper_lead", "title", "id"),
            ("updates", "first_party_lead", "title", "id"),
            ("terms", "term_lead", "display_term", "id"),
        )
        items: list[dict[str, str]] = []
        for field, kind, title_field, id_field in fields:
            for item in result.get(field) or []:
                if not isinstance(item, dict):
                    continue
                reference = compact_text(
                    item.get(id_field) or item.get("canonical_ref") or item.get("source_url"),
                    500,
                )
                if not reference:
                    continue
                items.append(
                    {
                        "key": f"{kind}:{reference}",
                        "kind": kind,
                        "ref": reference,
                        "title": compact_text(item.get(title_field) or item.get("canonical_name"), 1000),
                    }
                )
        return items

    @classmethod
    def _research_run_delta(
        cls,
        view_kind: str,
        result: dict[str, Any],
        previous_result: dict[str, Any] | None,
        previous_run_id: str = "",
    ) -> dict[str, Any]:
        current_items = cls._research_run_items(view_kind, result)
        current_map = {item["key"]: item for item in current_items}
        previous_items = cls._research_run_items(view_kind, previous_result or {})
        previous_map = {item["key"]: item for item in previous_items}
        added = [current_map[key] for key in current_map.keys() - previous_map.keys()]
        removed = [previous_map[key] for key in previous_map.keys() - current_map.keys()]
        changed = [
            {"before": previous_map[key], "after": current_map[key]}
            for key in current_map.keys() & previous_map.keys()
            if current_map[key] != previous_map[key]
        ]
        added.sort(key=lambda item: item["key"])
        removed.sort(key=lambda item: item["key"])
        changed.sort(key=lambda item: item["after"]["key"])
        return {
            "previous_run_id": previous_run_id,
            "baseline": not bool(previous_run_id),
            "current_count": len(current_items),
            "previous_count": len(previous_items),
            "added_count": len(added),
            "removed_count": len(removed),
            "changed_count": len(changed),
            "unchanged_count": len(current_map.keys() & previous_map.keys()) - len(changed),
            "added": added[:RESEARCH_VIEW_RUN_MAX_ITEMS],
            "removed": removed[:RESEARCH_VIEW_RUN_MAX_ITEMS],
            "changed": changed[:RESEARCH_VIEW_RUN_MAX_ITEMS],
            "items_truncated": any(
                len(items) > RESEARCH_VIEW_RUN_MAX_ITEMS for items in (added, removed, changed)
            ),
        }

    @staticmethod
    def _normalize_research_view(view_kind: Any, value: Any) -> tuple[str, dict[str, Any], dict[str, Any]]:
        kind = compact_text(view_kind, 30).casefold()
        if kind not in RESEARCH_VIEW_KINDS:
            raise AtlasError("research view kind must be search, radar, or focus")
        if not isinstance(value, dict):
            raise AtlasError("research view definition must be an object")

        def list_field(*names: str, maximum: int = 40, item_maximum: int = 120) -> list[str]:
            raw: Any = None
            for name in names:
                if name in value:
                    raw = value[name]
                    break
            if raw is None:
                return []
            if not isinstance(raw, list):
                raise AtlasError(f"research view field {names[0]} must be an array")
            return clean_string_list(raw, item_maximum, maximum)

        if kind == "search":
            kinds = [item.rstrip("s").casefold() for item in list_field("kinds", "kind", maximum=2, item_maximum=20)]
            if not kinds:
                kinds = ["paper", "project"]
            if any(item not in {"paper", "project"} for item in kinds):
                raise AtlasError("research search view kind filter is invalid")
            statuses = [item.casefold() for item in list_field("statuses", "status", maximum=3, item_maximum=40)]
            if any(item not in {"catalogued", "in_progress", "analysed"} for item in statuses):
                raise AtlasError("research search view status filter is invalid")
            try:
                limit = max(1, min(SEARCH_MAX_LIMIT, int(value.get("limit") or 40)))
            except (TypeError, ValueError) as error:
                raise AtlasError("research search view limit must be an integer") from error
            definition = {
                "query": compact_text(value.get("query") or value.get("q"), 300),
                "kinds": sorted(set(kinds)),
                "domains": sorted(set(item.casefold() for item in list_field("domains", "domain"))),
                "statuses": sorted(set(statuses)),
                "limit": limit,
            }
            boundary = {
                "catalog_projection": "metadata_at_snapshot_creation",
                "result_consistency": "materialized_until_expiry",
                "external_model_calls": False,
            }
            return kind, definition, boundary

        if kind == "radar":
            date_from = compact_text(value.get("dateFrom") or value.get("date_from"), 20)
            date_to = compact_text(value.get("dateTo") or value.get("date_to"), 20)
            for label, day in (("date_from", date_from), ("date_to", date_to)):
                if day and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
                    raise AtlasError(f"research radar view {label} must use YYYY-MM-DD")
            if date_from and date_to and date_from > date_to:
                raise AtlasError("research radar view date range is invalid")
            maturity = [item.casefold() for item in list_field("maturity", maximum=20, item_maximum=40)]
            if any(item not in FRONTIER_SIGNAL_MATURITY for item in maturity):
                raise AtlasError("research radar view maturity filter is invalid")
            review_status = [
                item.casefold()
                for item in list_field("reviewStatus", "review_status", maximum=20, item_maximum=40)
            ]
            allowed_review = FRONTIER_REVIEW_STATUS | FRONTIER_SIGNAL_STATUS
            if any(item not in allowed_review for item in review_status):
                raise AtlasError("research radar view review status filter is invalid")
            try:
                limit = max(1, min(200, int(value.get("limit") or 40)))
            except (TypeError, ValueError) as error:
                raise AtlasError("research radar view limit must be an integer") from error
            definition = {
                "domains": sorted(set(item.casefold() for item in list_field("domains", "domain"))),
                "sources": sorted(set(item.casefold() for item in list_field("sources", "source"))),
                "date_from": date_from,
                "date_to": date_to,
                "maturity": sorted(set(maturity)),
                "review_status": sorted(set(review_status)),
                "limit": limit,
            }
            boundary = {
                "published_signals": "editor_reviewed",
                "paper_candidates": "abstract_context_lead",
                "first_party_updates": "lead_only",
                "news_raises_paper_evidence": False,
                "external_model_calls": False,
            }
            return kind, definition, boundary

        definition = {
            "domains": sorted(set(item.casefold() for item in list_field("domains", maximum=20, item_maximum=80))),
            "keywords": list_field("keywords", maximum=50, item_maximum=160),
            "source_keys": list_field("sourceKeys", "source_keys", maximum=30),
            "method_ids": list_field("methodIds", "method_ids", maximum=50, item_maximum=160),
            "problem_ids": list_field("problemIds", "problem_ids", maximum=50, item_maximum=160),
            "thread_ids": list_field("threadIds", "thread_ids", maximum=50, item_maximum=160),
        }
        boundary = {
            "interest_source": "explicit_user_definition",
            "browsing_inference": False,
            "external_model_calls": False,
        }
        return kind, definition, boundary

    @staticmethod
    def _validate_research_view_entities(db: sqlite3.Connection, definition: dict[str, Any]) -> None:
        for field, entity_kind in (
            ("method_ids", "method"),
            ("problem_ids", "problem"),
            ("thread_ids", "thread"),
        ):
            for entity_id in definition.get(field, []):
                row = db.execute(
                    "SELECT status FROM knowledge_entities WHERE id=? AND entity_kind=?",
                    (entity_id, entity_kind),
                ).fetchone()
                if row is None or row["status"] == "merged":
                    raise NotFoundError(f"research view {entity_kind} entity does not exist")

    def create_research_view(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        name = compact_text(payload.get("name"), 200)
        if not name:
            raise AtlasError("research view name is required")
        kind, definition, boundary = self._normalize_research_view(
            payload.get("viewKind") or payload.get("view_kind"),
            payload.get("definition"),
        )
        description = clean_multiline_text(payload.get("description"), 2000)
        now = utc_now()
        with self._lock, self.connect() as db:
            count = int(db.execute("SELECT COUNT(*) FROM research_views WHERE owner_id=?", (owner,)).fetchone()[0])
            if count >= RESEARCH_VIEW_MAX_PER_OWNER:
                raise ConflictError("research view owner limit reached")
            if db.execute("SELECT 1 FROM research_views WHERE owner_id=? AND name=?", (owner, name)).fetchone():
                raise ConflictError("research view name already exists")
            self._validate_research_view_entities(db, definition)
            view_id = str(uuid.uuid4())
            db.execute(
                """
                INSERT INTO research_views(
                    id, owner_id, name, description, view_kind, definition_json,
                    evidence_boundary_json, revision, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    view_id, owner, name, description, kind,
                    json.dumps(definition, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    json.dumps(boundary, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    now, now,
                ),
            )
            row = db.execute("SELECT * FROM research_views WHERE id=?", (view_id,)).fetchone()
            assert row is not None
            result = self._research_view_from_row(row)
            self._record_editor_audit(
                db,
                "research_view_created",
                self._editor_actor(payload, required=False),
                entity_kind="research_view",
                entity_id=view_id,
                after=result,
                reason=self._editor_reason(payload, required=False),
            )
            return result

    def list_research_views(
        self,
        owner_id: str = "local",
        view_kind: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        owner = compact_text(owner_id, 120) or "local"
        kind = compact_text(view_kind, 30).casefold()
        if kind and kind not in RESEARCH_VIEW_KINDS:
            raise AtlasError("research view kind is invalid")
        safe_limit = max(1, min(RESEARCH_VIEW_MAX_PER_OWNER, int(limit)))
        with self.connect() as db:
            if kind:
                rows = db.execute(
                    "SELECT * FROM research_views WHERE owner_id=? AND view_kind=? ORDER BY updated_at DESC LIMIT ?",
                    (owner, kind, safe_limit),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT * FROM research_views WHERE owner_id=? ORDER BY updated_at DESC LIMIT ?",
                    (owner, safe_limit),
                ).fetchall()
            return [self._research_view_from_row(row) for row in rows]

    def get_research_view(self, view_id: str, owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_id = compact_text(view_id, 80)
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM research_views WHERE id=? AND owner_id=?",
                (normalized_id, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("research view does not exist")
            return self._research_view_from_row(row)

    def update_research_view(self, view_id: str, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_id = compact_text(view_id, 80)
        with self._lock, self.connect() as db:
            row = db.execute(
                "SELECT * FROM research_views WHERE id=? AND owner_id=?",
                (normalized_id, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("research view does not exist")
            before = self._research_view_from_row(row)
            expected_revision = payload.get("expectedRevision", payload.get("expected_revision"))
            if expected_revision is not None:
                try:
                    expected_revision = int(expected_revision)
                except (TypeError, ValueError) as error:
                    raise AtlasError("expected research view revision must be an integer") from error
                if expected_revision != int(row["revision"]):
                    raise ConflictError("research view revision conflict")
            name = compact_text(payload.get("name", row["name"]), 200)
            if not name:
                raise AtlasError("research view name is required")
            description = clean_multiline_text(payload.get("description", row["description"]), 2000)
            raw_definition = payload.get("definition", before["definition"])
            requested_kind = payload.get("viewKind", payload.get("view_kind", row["view_kind"]))
            kind, definition, boundary = self._normalize_research_view(requested_kind, raw_definition)
            self._validate_research_view_entities(db, definition)
            duplicate = db.execute(
                "SELECT 1 FROM research_views WHERE owner_id=? AND name=? AND id<>?",
                (owner, name, normalized_id),
            ).fetchone()
            if duplicate:
                raise ConflictError("research view name already exists")
            changed = any(
                (
                    name != row["name"],
                    description != row["description"],
                    kind != row["view_kind"],
                    definition != before["definition"],
                    boundary != before["evidence_boundary"],
                )
            )
            if not changed:
                return {**before, "unchanged": True}
            db.execute(
                """
                UPDATE research_views SET name=?, description=?, view_kind=?, definition_json=?,
                    evidence_boundary_json=?, revision=revision+1, updated_at=?
                WHERE id=? AND owner_id=?
                """,
                (
                    name, description, kind,
                    json.dumps(definition, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    json.dumps(boundary, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    utc_now(), normalized_id, owner,
                ),
            )
            updated = db.execute("SELECT * FROM research_views WHERE id=?", (normalized_id,)).fetchone()
            assert updated is not None
            result = self._research_view_from_row(updated)
            self._record_editor_audit(
                db,
                "research_view_updated",
                self._editor_actor(payload, required=False),
                entity_kind="research_view",
                entity_id=normalized_id,
                before=before,
                after=result,
                reason=self._editor_reason(payload, required=False),
            )
            return result

    def delete_research_view(self, view_id: str, owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_id = compact_text(view_id, 80)
        with self._lock, self.connect() as db:
            row = db.execute(
                "SELECT * FROM research_views WHERE id=? AND owner_id=?",
                (normalized_id, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("research view does not exist")
            result = self._research_view_from_row(row)
            db.execute("DELETE FROM research_views WHERE id=? AND owner_id=?", (normalized_id, owner))
            self._record_editor_audit(
                db,
                "research_view_deleted",
                "local editor",
                entity_kind="research_view",
                entity_id=normalized_id,
                before=result,
            )
            return result

    @staticmethod
    def _filter_radar_keywords(radar: dict[str, Any], keywords: list[str]) -> dict[str, Any]:
        normalized = [item.casefold() for item in keywords if item]
        if not normalized:
            return radar
        for key in ("signals", "candidates", "updates", "terms"):
            radar[key] = [
                item
                for item in radar.get(key, [])
                if any(
                    word in " ".join(
                        str(item.get(field, ""))
                        for field in ("title", "change_summary", "summary", "display_term", "canonical_expansion")
                    ).casefold()
                    for word in normalized
                )
            ]
        return radar

    def apply_research_view(
        self,
        view_id: str,
        owner_id: str = "local",
        operation_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_view_id = compact_text(view_id, 80)
        payload = operation_payload or {}
        key = self._idempotency_key(payload)
        request_hash = self._operation_request_hash(
            "research_view_run",
            {"view_id": normalized_view_id},
        )

        # Keep the lookup, potentially expensive snapshot creation, and final
        # resource/idempotency inserts under one process lock. This prevents a
        # simultaneous retry from materializing an orphan snapshot.
        with self._lock:
            if key:
                with self.connect() as db:
                    replay = self._lookup_operation_idempotency(
                        db, owner, "research_view_run", key, request_hash
                    )
                    if replay is not None:
                        return self._idempotent_run_response(db, replay, owner, key)

            view = self.get_research_view(normalized_view_id, owner)
            definition = view["definition"]
            if view["view_kind"] == "search":
                result = self.search_catalog(
                    query=definition["query"],
                    kinds=definition["kinds"],
                    domains=definition["domains"],
                    statuses=definition["statuses"],
                    limit=definition["limit"],
                    owner_id=owner,
                )
                snapshot_id = result.get("snapshot_id", "")
                result["continuation_path"] = "/api/private/search"
            elif view["view_kind"] == "radar":
                result = self.frontier_radar(
                    domains=definition["domains"],
                    sources=definition["sources"],
                    date_from=definition["date_from"],
                    date_to=definition["date_to"],
                    maturity=definition["maturity"],
                    review_status=definition["review_status"],
                    limit=definition["limit"],
                )
                snapshot_id = ""
            else:
                result = self.frontier_radar(
                    domains=definition["domains"],
                    sources=definition["source_keys"],
                    limit=40,
                )
                result = self._filter_radar_keywords(result, definition["keywords"])
                result["scope"] = definition
                snapshot_id = ""
            serialized = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            run_id = self._deterministic_operation_id("research_view_run", owner, key) if key else str(uuid.uuid4())
            run_at = utc_now()
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                current = db.execute(
                    "SELECT * FROM research_views WHERE id=? AND owner_id=?",
                    (view["id"], owner),
                ).fetchone()
                if current is None or int(current["revision"]) != int(view["revision"]):
                    raise ConflictError("research view changed while the run was being created")
                previous = db.execute(
                    """
                    SELECT id, result_json, run_sequence FROM research_view_runs
                    WHERE owner_id=? AND view_id=?
                    ORDER BY run_sequence DESC LIMIT 1
                    """,
                    (owner, view["id"]),
                ).fetchone()
                previous_run_id = previous["id"] if previous else ""
                previous_result = json.loads(previous["result_json"] or "{}") if previous else None
                run_sequence = int(previous["run_sequence"]) + 1 if previous else 1
                delta = self._research_run_delta(
                    view["view_kind"], result, previous_result, previous_run_id
                )
                serialized_delta = json.dumps(
                    delta, ensure_ascii=False, sort_keys=True, separators=(",", ":")
                )
                delta_sha256 = hashlib.sha256(serialized_delta.encode("utf-8")).hexdigest()
                db.execute(
                    """
                    INSERT INTO research_view_runs(
                        id, owner_id, view_id, view_name, view_kind, view_revision,
                        definition_json, evidence_boundary_json, search_snapshot_id,
                        result_json, result_sha256, run_sequence, previous_run_id, delta_json,
                        delta_sha256, run_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id, owner, view["id"], view["name"], view["view_kind"], view["revision"],
                        json.dumps(view["definition"], ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                        json.dumps(view["evidence_boundary"], ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                        snapshot_id, serialized, hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
                        run_sequence, previous_run_id, serialized_delta, delta_sha256, run_at,
                    ),
                )
                if key:
                    db.execute(
                        """
                        INSERT INTO operation_idempotency(
                            owner_id, operation_kind, idempotency_key, request_sha256,
                            resource_id, created_at
                        ) VALUES (?, 'research_view_run', ?, ?, ?, ?)
                        """,
                        (owner, key, request_hash, run_id, run_at),
                    )
                row = db.execute("SELECT * FROM research_view_runs WHERE id=?", (run_id,)).fetchone()
                assert row is not None
                run = self._research_view_run_from_row(row)
                self._record_editor_audit(
                    db,
                    "research_view_run_created",
                    self._editor_actor(payload, required=False),
                    entity_kind="research_view_run",
                    entity_id=run_id,
                    after={
                        "view_id": view["id"],
                        "view_revision": view["revision"],
                        "result_sha256": run["result_sha256"],
                        "search_snapshot_id": snapshot_id,
                        "run_sequence": run_sequence,
                        "previous_run_id": previous_run_id,
                        "delta_sha256": delta_sha256,
                        "idempotency_key_sha256": hashlib.sha256(key.encode("utf-8")).hexdigest() if key else "",
                    },
                    reason=self._editor_reason(payload, required=False),
                )
        return {
            "view": view,
            "run": run,
            "result": result,
            "idempotent_replay": False,
            "idempotency_key": key,
        }

    def list_research_view_runs(
        self,
        owner_id: str = "local",
        view_id: str = "",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_view_id = compact_text(view_id, 80)
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            if normalized_view_id:
                rows = db.execute(
                    """
                    SELECT * FROM research_view_runs WHERE owner_id=? AND view_id=?
                    ORDER BY run_sequence DESC LIMIT ?
                    """,
                    (owner, normalized_view_id, safe_limit),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT * FROM research_view_runs WHERE owner_id=? ORDER BY run_at DESC, rowid DESC LIMIT ?",
                    (owner, safe_limit),
                ).fetchall()
            return [self._research_view_run_from_row(row, include_result=False) for row in rows]

    def get_research_view_run(self, run_id: str, owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_id = compact_text(run_id, 80)
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM research_view_runs WHERE id=? AND owner_id=?",
                (normalized_id, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("research view run does not exist")
            return self._research_view_run_from_row(row)

    @staticmethod
    def _notification_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["payload"] = json.loads(result.pop("payload_json") or "{}")
        result["read"] = bool(result.get("read_at"))
        return result

    @staticmethod
    def _focus_matches_text(focus: dict[str, Any], text: str, domains: list[str], source_key: str = "") -> bool:
        focus_domains = {str(item).casefold() for item in focus.get("domains", [])}
        item_domains = {str(item).casefold() for item in domains}
        if focus_domains and focus_domains.intersection(item_domains):
            return True
        focus_sources = {str(item).casefold() for item in focus.get("source_keys", [])}
        if source_key and source_key.casefold() in focus_sources:
            return True
        folded = text.casefold()
        return any(str(keyword).casefold() in folded for keyword in focus.get("keywords", []) if keyword)

    @staticmethod
    def _upsert_notification(
        db: sqlite3.Connection,
        *,
        owner_id: str,
        notification_kind: str,
        evidence_level: str,
        title: str,
        body: str,
        source_kind: str,
        source_ref: str,
        source_revision: str,
        payload: dict[str, Any],
        now: str,
    ) -> bool:
        if notification_kind not in NOTIFICATION_KINDS:
            raise AtlasError("notification kind is invalid")
        dedupe_seed = f"{notification_kind}\0{source_kind}\0{source_ref}\0{source_revision}"
        dedupe_key = hashlib.sha256(dedupe_seed.encode("utf-8")).hexdigest()
        existing = db.execute(
            "SELECT id FROM research_notifications WHERE owner_id=? AND dedupe_key=?",
            (owner_id, dedupe_key),
        ).fetchone()
        db.execute(
            """
            INSERT INTO research_notifications(
                id, owner_id, dedupe_key, notification_kind, evidence_level,
                title, body, source_kind, source_ref, source_revision, payload_json,
                first_seen_at, last_seen_at, read_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            ON CONFLICT(owner_id, dedupe_key) DO UPDATE SET
                title=excluded.title,
                body=excluded.body,
                evidence_level=excluded.evidence_level,
                payload_json=excluded.payload_json,
                last_seen_at=excluded.last_seen_at,
                updated_at=excluded.updated_at
            """,
            (
                str(uuid.uuid4()), owner_id, dedupe_key, notification_kind, evidence_level,
                compact_text(title, 500), clean_multiline_text(body, 4000), source_kind,
                compact_text(source_ref, 500), compact_text(source_revision, 160),
                json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                now, now, now, now,
            ),
        )
        return existing is None

    def refresh_notifications(self, owner_id: str = "local") -> dict[str, Any]:
        """Refresh the private inbox from explicit focus and bounded public evidence."""
        owner = compact_text(owner_id, 120) or "local"
        focus = self.get_focus_profile(owner)
        if not any(
            focus.get(key)
            for key in ("domains", "keywords", "source_keys", "method_ids", "problem_ids", "thread_ids")
        ):
            return {"created": 0, "matched": 0, "owner_id": owner, "empty_reason": "explicit focus is required"}
        now = utc_now()
        created = 0
        matched = 0
        with self._lock, self.connect() as db:
            signal_rows = db.execute(
                """
                SELECT id, title, change_summary, domain, maturity, revision, as_of_date,
                       known_unknowns, counter_evidence
                FROM frontier_signals WHERE status='published'
                ORDER BY published_at DESC, updated_at DESC LIMIT 500
                """
            ).fetchall()
            for row in signal_rows:
                text = f"{row['title']} {row['change_summary']}"
                if not self._focus_matches_text(focus, text, [row["domain"]]):
                    continue
                matched += 1
                created += int(
                    self._upsert_notification(
                        db,
                        owner_id=owner,
                        notification_kind="published_signal",
                        evidence_level="editor_reviewed_signal",
                        title=row["title"],
                        body=row["change_summary"],
                        source_kind="frontier_signal",
                        source_ref=row["id"],
                        source_revision=str(row["revision"]),
                        payload={
                            "signal_id": row["id"],
                            "revision": row["revision"],
                            "domain": row["domain"],
                            "maturity": row["maturity"],
                            "as_of_date": row["as_of_date"],
                            "known_unknowns": row["known_unknowns"],
                            "counter_evidence": row["counter_evidence"],
                            "evidence_boundary": "published_editor_reviewed_signal",
                        },
                        now=now,
                    )
                )

            followed_entities = {
                *focus.get("method_ids", []),
                *focus.get("problem_ids", []),
                *focus.get("thread_ids", []),
            }
            if followed_entities:
                relationship_rows = db.execute(
                    """
                    SELECT r.*, source.canonical_name AS from_name, target.canonical_name AS to_name
                    FROM knowledge_relationships r
                    JOIN knowledge_entities source ON source.id=r.from_entity_id
                    JOIN knowledge_entities target ON target.id=r.to_entity_id
                    WHERE r.status='active' AND r.reviewed_at IS NOT NULL
                    ORDER BY r.reviewed_at DESC, r.updated_at DESC LIMIT 500
                    """
                ).fetchall()
                for row in relationship_rows:
                    if row["from_entity_id"] not in followed_entities and row["to_entity_id"] not in followed_entities:
                        continue
                    matched += 1
                    title = f"{row['from_name']} {row['relation_type']} {row['to_name']}"
                    created += int(
                        self._upsert_notification(
                            db,
                            owner_id=owner,
                            notification_kind="reviewed_relationship",
                            evidence_level="editor_reviewed_relationship",
                            title=title,
                            body="A reviewed public knowledge relationship changed within the explicit focus scope.",
                            source_kind="knowledge_relationship",
                            source_ref=row["id"],
                            source_revision=str(row["revision"]),
                            payload={
                                "relationship_id": row["id"],
                                "revision": row["revision"],
                                "from_entity_id": row["from_entity_id"],
                                "to_entity_id": row["to_entity_id"],
                                "relation_type": row["relation_type"],
                                "reviewed_at": row["reviewed_at"],
                                "evidence": json.loads(row["evidence_json"] or "[]"),
                                "evidence_boundary": "reviewed_public_relationship",
                            },
                            now=now,
                        )
                    )

            candidate_rows = db.execute(
                """
                SELECT c.id, c.source_name, c.source_identifier, c.domains_json, c.payload_sha256,
                       c.published_at, c.source_updated_at, p.id AS paper_id, p.canonical_ref, p.title, p.abstract
                FROM frontier_candidates c JOIN canonical_papers p ON p.id=c.canonical_paper_id
                ORDER BY c.source_updated_at DESC, c.last_seen_at DESC LIMIT 500
                """
            ).fetchall()
            for row in candidate_rows:
                domains = json.loads(row["domains_json"] or "[]")
                if not self._focus_matches_text(focus, f"{row['title']} {row['abstract']}", domains, row["source_name"]):
                    continue
                matched += 1
                created += int(
                    self._upsert_notification(
                        db,
                        owner_id=owner,
                        notification_kind="paper_lead",
                        evidence_level="unreviewed_abstract_lead",
                        title=row["title"],
                        body="Unreviewed paper candidate. Inspect the source before treating it as a research conclusion.",
                        source_kind="frontier_candidate",
                        source_ref=f"{row['source_name']}:{row['source_identifier']}",
                        source_revision=row["payload_sha256"],
                        payload={
                            "candidate_id": row["id"],
                            "paper_id": row["paper_id"],
                            "canonical_ref": row["canonical_ref"],
                            "domains": domains,
                            "published_at": row["published_at"],
                            "source_updated_at": row["source_updated_at"],
                            "evidence_boundary": "abstract_context_lead_only",
                        },
                        now=now,
                    )
                )

            update_rows = db.execute(
                """
                SELECT id, source_key, source_identifier, title, summary, source_url,
                       domains_json, payload_sha256, published_at, source_updated_at
                FROM frontier_updates
                ORDER BY source_updated_at DESC, last_seen_at DESC LIMIT 500
                """
            ).fetchall()
            for row in update_rows:
                domains = json.loads(row["domains_json"] or "[]")
                if not self._focus_matches_text(focus, f"{row['title']} {row['summary']}", domains, row["source_key"]):
                    continue
                matched += 1
                created += int(
                    self._upsert_notification(
                        db,
                        owner_id=owner,
                        notification_kind="first_party_lead",
                        evidence_level="first_party_lead",
                        title=row["title"],
                        body="First-party update lead. It does not raise the evidence level of any paper claim.",
                        source_kind="frontier_update",
                        source_ref=f"{row['source_key']}:{row['source_identifier']}",
                        source_revision=row["payload_sha256"],
                        payload={
                            "update_id": row["id"],
                            "source_url": row["source_url"],
                            "domains": domains,
                            "published_at": row["published_at"],
                            "source_updated_at": row["source_updated_at"],
                            "evidence_boundary": "first_party_lead_only",
                        },
                        now=now,
                    )
                )
            total = int(db.execute("SELECT COUNT(*) FROM research_notifications WHERE owner_id=?", (owner,)).fetchone()[0])
            unread = int(
                db.execute(
                    "SELECT COUNT(*) FROM research_notifications WHERE owner_id=? AND read_at IS NULL",
                    (owner,),
                ).fetchone()[0]
            )
        return {"created": created, "matched": matched, "total": total, "unread": unread, "owner_id": owner}

    def list_notifications(
        self,
        owner_id: str = "local",
        *,
        unread_only: bool = False,
        notification_kind: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        owner = compact_text(owner_id, 120) or "local"
        kind = compact_text(notification_kind, 40)
        if kind and kind not in NOTIFICATION_KINDS:
            raise AtlasError("notification kind is invalid")
        safe_limit = max(1, min(500, int(limit)))
        predicates = ["owner_id=?"]
        params: list[Any] = [owner]
        if unread_only:
            predicates.append("read_at IS NULL")
        if kind:
            predicates.append("notification_kind=?")
            params.append(kind)
        with self.connect() as db:
            rows = db.execute(
                f"SELECT * FROM research_notifications WHERE {' AND '.join(predicates)} "
                "ORDER BY CASE WHEN read_at IS NULL THEN 0 ELSE 1 END, last_seen_at DESC, id DESC LIMIT ?",
                [*params, safe_limit],
            ).fetchall()
            return [self._notification_from_row(row) for row in rows]

    def mark_notification_read(
        self,
        notification_id: str,
        read: bool = True,
        owner_id: str = "local",
    ) -> dict[str, Any]:
        if not isinstance(read, bool):
            raise AtlasError("notification read state must be a boolean")
        owner = compact_text(owner_id, 120) or "local"
        normalized_id = compact_text(notification_id, 80)
        with self._lock, self.connect() as db:
            row = db.execute(
                "SELECT * FROM research_notifications WHERE id=? AND owner_id=?",
                (normalized_id, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("notification does not exist")
            before = self._notification_from_row(row)
            read_at = utc_now() if read else None
            if bool(row["read_at"]) != read:
                db.execute(
                    "UPDATE research_notifications SET read_at=?, updated_at=? WHERE id=? AND owner_id=?",
                    (read_at, utc_now(), normalized_id, owner),
                )
                self._record_editor_audit(
                    db,
                    "notification_read",
                    "local editor",
                    entity_kind="research_notification",
                    entity_id=normalized_id,
                    before={"read_at": before["read_at"]},
                    after={"read_at": read_at},
                )
            updated = db.execute("SELECT * FROM research_notifications WHERE id=?", (normalized_id,)).fetchone()
            assert updated is not None
            return self._notification_from_row(updated)

    @staticmethod
    def _bundle_evidence_summary(dossier: dict[str, Any]) -> dict[str, Any]:
        claims = 0
        evidence = 0
        incomplete = 0
        counter_evidence: list[dict[str, Any]] = []
        unknowns: list[dict[str, Any]] = []
        for stage_key, stage in (dossier.get("stages") or {}).items():
            if not isinstance(stage, dict):
                continue
            for section in stage.get("sections") or []:
                if not isinstance(section, dict):
                    continue
                claims += 1
                if section.get("source_kind") == "insufficient_information":
                    unknowns.append({"stage": stage_key, "claim_id": section.get("claim_id", ""), "body": section.get("body", "")})
                for item in section.get("evidence") or []:
                    if not isinstance(item, dict):
                        continue
                    evidence += 1
                    if not item.get("locator_complete"):
                        incomplete += 1
                    if item.get("direction") == "contradicts":
                        counter_evidence.append(
                            {
                                "stage": stage_key,
                                "claim_id": section.get("claim_id", ""),
                                "evidence_id": item.get("evidence_id", ""),
                                "quote": item.get("quote", ""),
                                "source_sha256": item.get("source_sha256", ""),
                            }
                        )
        return {
            "claims": claims,
            "evidence": evidence,
            "locator_incomplete": incomplete,
            "counter_evidence": counter_evidence,
            "unknowns": unknowns,
        }

    @staticmethod
    def _provenance_bundle_markdown(bundle: dict[str, Any]) -> str:
        view = bundle.get("view") or {}
        run = bundle.get("run") or {}
        lines = [
            "# Research Atlas provenance bundle",
            "",
            f"- Bundle schema: `{bundle.get('schema_version', PROVENANCE_BUNDLE_VERSION)}`",
            f"- View: `{view.get('name', '')}` ({view.get('view_kind', '')})",
            f"- View revision: `{run.get('view_revision', '')}`",
            f"- Run: `{run.get('id', '')}` at `{run.get('run_at', '')}`",
            f"- Result SHA-256: `{run.get('result_sha256', '')}`",
            "",
            "## Evidence boundary",
            "",
            json.dumps(view.get("evidence_boundary", {}), ensure_ascii=False, indent=2),
        ]
        snapshot = bundle.get("search_snapshot")
        if isinstance(snapshot, dict):
            lines.extend(
                [
                    "",
                    "## Search snapshot",
                    "",
                    f"- Snapshot: `{snapshot.get('id', '')}`",
                    f"- Created: `{snapshot.get('created_at', '')}`",
                    f"- Expires: `{snapshot.get('expires_at', '')}`",
                    f"- Result count: `{snapshot.get('result_count', 0)}`",
                    f"- Snapshot SHA-256: `{snapshot.get('result_sha256', '')}`",
                ]
            )
            if snapshot.get("status") == "expired":
                lines.append("- Snapshot status: `expired; item projection unavailable`")
        lines.extend(["", "## Papers", ""])
        papers = bundle.get("papers") or []
        if not papers:
            lines.append("No dossier was available in this run.")
        for item in papers:
            paper = item.get("paper") or {}
            lines.extend(
                [
                    f"### {paper.get('title', 'Untitled')} (`{paper.get('canonical_ref', '')}`)",
                    "",
                    f"- Paperfield: `{paper.get('paperfield_path', '')}`",
                    f"- Dossier status: `{item.get('dossier_status', 'unavailable')}`",
                    f"- Source SHA-256: `{(item.get('dossier') or {}).get('source_sha256', '')}`",
                    f"- Evidence summary: `{json.dumps(item.get('evidence_summary', {}), ensure_ascii=False)}`",
                    "",
                ]
            )
        return "\n".join(lines).rstrip() + "\n"

    def create_provenance_bundle(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        run_id = compact_text(payload.get("viewRunId") or payload.get("view_run_id"), 80)
        if not run_id:
            raise AtlasError("provenance bundle requires viewRunId")
        key = self._idempotency_key(payload)
        run = self.get_research_view_run(run_id, owner)
        # Runs are immutable records and survive view deletion. Resolve the
        # live view when available, otherwise reconstruct the historical
        # definition captured on the run for a durable export.
        view = None
        if run.get("view_id"):
            try:
                view = self.get_research_view(run["view_id"], owner)
            except NotFoundError:
                view = None
        if view is None:
            view = {
                "id": run.get("view_id", ""),
                "owner_id": run.get("owner_id", owner),
                "name": run.get("view_name", ""),
                "description": "",
                "view_kind": run.get("view_kind", ""),
                "revision": run.get("view_revision", 0),
                "created_at": run.get("run_at", ""),
                "updated_at": run.get("run_at", ""),
                "definition": run.get("definition", {}),
                "evidence_boundary": run.get("evidence_boundary", {}),
                "deleted": True,
            }
        snapshot: dict[str, Any] | None = None
        if run.get("search_snapshot_id"):
            try:
                snapshot = self.get_search_snapshot(
                    run["search_snapshot_id"], owner, include_items=True, item_limit=SEARCH_SNAPSHOT_MAX_ITEMS
                )
            except (GoneError, NotFoundError):
                snapshot = {
                    "id": run["search_snapshot_id"],
                    "status": "expired",
                    "items": [],
                    "items_truncated": True,
                }

        requested_ids = payload.get("paperIds") or payload.get("paper_ids") or []
        requested_refs = payload.get("paperRefs") or payload.get("paper_refs") or []
        if not isinstance(requested_ids, list) or not isinstance(requested_refs, list):
            raise AtlasError("provenance bundle paperIds and paperRefs must be arrays")
        paper_ids: list[int] = []
        for raw in requested_ids:
            try:
                paper_id = int(raw)
            except (TypeError, ValueError) as error:
                raise AtlasError("provenance bundle paper id is invalid") from error
            if paper_id > 0 and paper_id not in paper_ids:
                paper_ids.append(paper_id)
        normalized_refs = sorted(
            set(compact_text(raw_ref, 500) for raw_ref in requested_refs if compact_text(raw_ref, 500))
        )
        request_hash = self._operation_request_hash(
            "provenance_bundle",
            {
                "view_run_id": run_id,
                "paper_ids": sorted(paper_ids),
                "paper_refs": normalized_refs,
            },
        )
        if key:
            with self._lock, self.connect() as db:
                replay = self._lookup_operation_idempotency(
                    db, owner, "provenance_bundle", key, request_hash
                )
                if replay is not None:
                    row = db.execute(
                        "SELECT * FROM provenance_bundles WHERE id=? AND owner_id=?",
                        (replay["resource_id"], owner),
                    ).fetchone()
                    if row is None:
                        raise AtlasError("idempotency record points to a missing provenance bundle")
                    return self._bundle_response_from_row(row, replay=True, key=key)
        for raw_ref in normalized_refs:
            paper = self.resolve_paper(raw_ref)
            if paper and int(paper["id"]) not in paper_ids:
                paper_ids.append(int(paper["id"]))
        if not paper_ids and snapshot and snapshot.get("items"):
            for item in snapshot["items"]:
                if item.get("kind") != "paper":
                    continue
                try:
                    paper_id = int(item.get("ref"))
                except (TypeError, ValueError):
                    continue
                if paper_id not in paper_ids:
                    paper_ids.append(paper_id)
                if len(paper_ids) >= PROVENANCE_BUNDLE_MAX_PAPERS:
                    break
        if len(paper_ids) > PROVENANCE_BUNDLE_MAX_PAPERS:
            raise AtlasError(f"provenance bundle supports at most {PROVENANCE_BUNDLE_MAX_PAPERS} papers")

        papers: list[dict[str, Any]] = []
        for paper_id in paper_ids:
            try:
                exported = self.export_dossier(paper_id, "json")
            except NotFoundError:
                try:
                    paper = self.get_paper(paper_id)
                except NotFoundError:
                    continue
                papers.append(
                    {
                        "paper": {
                            "id": paper["id"],
                            "canonical_ref": paper.get("canonical_ref", ""),
                            "title": paper.get("title", ""),
                            "paperfield_path": self._paperfield_path(paper),
                        },
                        "dossier_status": "unavailable",
                        "dossier": None,
                        "evidence_summary": {
                            "claims": 0,
                            "evidence": 0,
                            "locator_incomplete": 0,
                            "counter_evidence": [],
                            "unknowns": [{"reason": "dossier not generated"}],
                        },
                    }
                )
                continue
            papers.append(
                {
                    "paper": exported["paper"],
                    "dossier_status": exported["dossier"].get("status", ""),
                    "dossier": exported["dossier"],
                    "stages": exported.get("stages", {}),
                    "evidence_summary": self._bundle_evidence_summary(exported),
                }
            )

        bundle = {
            "schema_version": PROVENANCE_BUNDLE_VERSION,
            "bundle_type": "research_atlas_provenance",
            "generated_at": utc_now(),
            "view": {
                "id": view.get("id", run.get("view_id", "")),
                "name": view.get("name", run.get("view_name", "")),
                "view_kind": view.get("view_kind", run.get("view_kind", "")),
                "revision": run.get("view_revision", view.get("revision", 0)),
                "definition": run.get("definition", view.get("definition", {})),
                "evidence_boundary": run.get("evidence_boundary", view.get("evidence_boundary", {})),
                "deleted": bool(view.get("deleted", False)),
            },
            "run": {
                "id": run["id"],
                "view_id": run["view_id"],
                "view_revision": run["view_revision"],
                "run_at": run["run_at"],
                "run_sequence": run["run_sequence"],
                "result_sha256": run["result_sha256"],
                "previous_run_id": run.get("previous_run_id", ""),
                "delta": run.get("delta", {}),
                "delta_sha256": run.get("delta_sha256", ""),
            },
            "search_snapshot": snapshot,
            "papers": papers,
            "unknowns": [
                {
                    "kind": "snapshot",
                    "reason": "snapshot expired before export",
                    "snapshot_id": run.get("search_snapshot_id", ""),
                }
            ]
            if snapshot and snapshot.get("status") == "expired"
            else [],
        }
        canonical_bundle = json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        bundle_sha = hashlib.sha256(canonical_bundle).hexdigest()
        markdown = self._provenance_bundle_markdown(bundle)
        manifest = {
            "schema_version": PROVENANCE_BUNDLE_VERSION,
            "bundle_type": "research_atlas_provenance",
            "algorithm": "sha256",
            "canonicalization": "json-sort-keys-compact-utf8",
            "bundle_sha256": bundle_sha,
            "content_bytes": len(canonical_bundle),
            "markdown_sha256": hashlib.sha256(markdown.encode("utf-8")).hexdigest(),
            "markdown_bytes": len(markdown.encode("utf-8")),
            "generated_at": bundle["generated_at"],
        }
        bundle_id = self._deterministic_operation_id("provenance_bundle", owner, key) if key else str(uuid.uuid4())
        with self._lock, self.connect() as db:
            if key:
                replay = self._lookup_operation_idempotency(
                    db, owner, "provenance_bundle", key, request_hash
                )
                if replay is not None:
                    row = db.execute(
                        "SELECT * FROM provenance_bundles WHERE id=? AND owner_id=?",
                        (replay["resource_id"], owner),
                    ).fetchone()
                    if row is None:
                        raise AtlasError("idempotency record points to a missing provenance bundle")
                    return self._bundle_response_from_row(row, replay=True, key=key)
            db.execute(
                """
                INSERT INTO provenance_bundles(
                    id, owner_id, view_run_id, manifest_json, bundle_json, markdown,
                    bundle_sha256, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    bundle_id, owner, run_id,
                    json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                    canonical_bundle.decode("utf-8"), markdown, bundle_sha, bundle["generated_at"],
                ),
            )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key, request_sha256,
                        resource_id, created_at
                    ) VALUES (?, 'provenance_bundle', ?, ?, ?, ?)
                    """,
                    (owner, key, request_hash, bundle_id, bundle["generated_at"]),
                )
            self._record_editor_audit(
                db,
                "provenance_bundle_exported",
                self._editor_actor(payload, required=False),
                entity_kind="provenance_bundle",
                entity_id=bundle_id,
                after={
                    "view_run_id": run_id,
                    "bundle_sha256": bundle_sha,
                    "paper_count": len(papers),
                    "idempotency_key_sha256": hashlib.sha256(key.encode("utf-8")).hexdigest() if key else "",
                },
                reason=self._editor_reason(payload, required=False),
            )
        return {
            "id": bundle_id,
            "manifest": manifest,
            "bundle": bundle,
            "markdown": markdown,
            "bundle_sha256": bundle_sha,
            "created_at": bundle["generated_at"],
            "view_run_id": run_id,
            "idempotent_replay": False,
            "idempotency_key": key,
        }

    def get_provenance_bundle(self, bundle_id: str, owner_id: str = "local") -> dict[str, Any]:
        owner = compact_text(owner_id, 120) or "local"
        normalized_id = compact_text(bundle_id, 80)
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM provenance_bundles WHERE id=? AND owner_id=?",
                (normalized_id, owner),
            ).fetchone()
            if row is None:
                raise NotFoundError("provenance bundle does not exist")
            return self._bundle_response_from_row(row)

    def list_provenance_bundles(self, owner_id: str = "local", limit: int = 50) -> list[dict[str, Any]]:
        owner = compact_text(owner_id, 120) or "local"
        safe_limit = max(1, min(200, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT id, view_run_id, manifest_json, bundle_sha256, created_at FROM provenance_bundles "
                "WHERE owner_id=? ORDER BY created_at DESC, id DESC LIMIT ?",
                (owner, safe_limit),
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "view_run_id": row["view_run_id"],
                    "manifest": json.loads(row["manifest_json"] or "{}"),
                    "bundle_sha256": row["bundle_sha256"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ]

    @staticmethod
    def verify_provenance_bundle(payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict) or not isinstance(payload.get("bundle"), dict):
            raise AtlasError("provenance bundle payload is invalid")
        manifest = payload.get("manifest")
        if not isinstance(manifest, dict):
            raise AtlasError("provenance bundle manifest is invalid")
        bundle = payload["bundle"]
        canonical = json.dumps(bundle, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        actual = hashlib.sha256(canonical).hexdigest()
        expected = compact_text(manifest.get("bundle_sha256") or payload.get("bundle_sha256"), 128)
        payload_expected = compact_text(payload.get("bundle_sha256"), 128)
        try:
            expected_content_bytes = int(manifest.get("content_bytes"))
        except (TypeError, ValueError):
            expected_content_bytes = None
        content_bytes_valid = expected_content_bytes == len(canonical)
        bundle_hash_valid = bool(expected and hmac.compare_digest(actual, expected))
        payload_hash_valid = not payload_expected or hmac.compare_digest(actual, payload_expected)
        markdown = payload.get("markdown")
        expected_markdown = compact_text(manifest.get("markdown_sha256"), 128)
        actual_markdown = hashlib.sha256(markdown.encode("utf-8")).hexdigest() if isinstance(markdown, str) else ""
        try:
            expected_markdown_bytes = int(manifest.get("markdown_bytes"))
        except (TypeError, ValueError):
            expected_markdown_bytes = None
        markdown_bytes_valid = isinstance(markdown, str) and (
            expected_markdown_bytes is None or expected_markdown_bytes == len(markdown.encode("utf-8"))
        )
        markdown_hash_valid = bool(expected_markdown and actual_markdown and hmac.compare_digest(actual_markdown, expected_markdown))
        schema_valid = str(manifest.get("schema_version", "")) == str(PROVENANCE_BUNDLE_VERSION)
        bundle_type_valid = (
            manifest.get("bundle_type") == "research_atlas_provenance"
            and bundle.get("bundle_type") == "research_atlas_provenance"
        )
        algorithm_valid = manifest.get("algorithm") == "sha256"
        canonicalization_valid = manifest.get("canonicalization") == "json-sort-keys-compact-utf8"
        manifest_valid = all((schema_valid, bundle_type_valid, algorithm_valid, canonicalization_valid, content_bytes_valid))
        markdown_valid = bool(markdown_hash_valid and markdown_bytes_valid)
        return {
            "valid": bool(manifest_valid and bundle_hash_valid and payload_hash_valid and markdown_valid),
            "manifest_valid": manifest_valid,
            "bundle_valid": bool(bundle_hash_valid and payload_hash_valid and content_bytes_valid),
            "markdown_valid": markdown_valid,
            "schema_valid": schema_valid,
            "bundle_type_valid": bundle_type_valid,
            "algorithm_valid": algorithm_valid,
            "canonicalization_valid": canonicalization_valid,
            "expected_sha256": expected,
            "actual_sha256": actual,
            "content_bytes": len(canonical),
            "expected_content_bytes": expected_content_bytes,
            "expected_markdown_sha256": expected_markdown,
            "actual_markdown_sha256": actual_markdown,
            "markdown_bytes": len(markdown.encode("utf-8")) if isinstance(markdown, str) else 0,
            "expected_markdown_bytes": expected_markdown_bytes,
        }

    def private_radar(self, owner_id: str = "local", limit: int = 40) -> dict[str, Any]:
        focus = self.get_focus_profile(owner_id)
        if not any(
            focus.get(key)
            for key in ("domains", "keywords", "source_keys", "method_ids", "problem_ids", "thread_ids")
        ):
            return {
                "scope": focus,
                "items": [],
                "empty": True,
                "empty_reason": "先显式设置领域、关键词、方法、问题、线程或来源关注范围。浏览行为不会自动创建关注。",
            }
        radar = self.frontier_radar(domains=focus["domains"], sources=focus["source_keys"], limit=limit)
        keywords = {item.casefold() for item in focus["keywords"]}
        if keywords:
            for key in ("signals", "candidates", "updates"):
                radar[key] = [
                    item
                    for item in radar[key]
                    if keywords.intersection(
                        set(str(item.get("title", "")).casefold().split())
                        | set(str(item.get("change_summary", "")).casefold().split())
                        | set(str(item.get("summary", "")).casefold().split())
                    )
                ]
        radar["scope"] = focus
        radar["empty"] = not any(radar[key] for key in ("signals", "candidates", "updates"))
        radar["empty_reason"] = "当前关注范围尚无已发布信号或来源候选。" if radar["empty"] else ""
        return radar

    def _digest_content(self, signals: list[dict[str, Any]], focus: dict[str, Any], as_of: str) -> tuple[dict[str, Any], str]:
        content = {
            "as_of": as_of,
            "signal_revisions": [
                {"id": item["id"], "revision": item.get("revision", 1), "title": item.get("title", ""),
                 "domain": item.get("domain", ""), "maturity": item.get("maturity", ""),
                 "evidence_count": item.get("independent_paper_count", 0)}
                for item in signals
            ],
            "focus": focus,
            "empty": not signals,
        }
        lines = [f"# Research Atlas {'private' if focus.get('owner_id') == 'local' else 'public'} digest", "",
                 f"As of: {as_of}", ""]
        if not signals:
            lines.append("No published signals matched this frozen scope.")
        else:
            for item in signals:
                lines.append(f"- {item.get('title', 'Untitled')} ({item.get('domain', 'cross')}, {item.get('maturity', 'candidate')})")
                lines.append(f"  Evidence papers: {item.get('independent_paper_count', 0)}; revision: {item.get('revision', 1)}")
        return content, "\n".join(lines) + "\n"

    def create_research_digest(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
        digest_type: str = "private",
    ) -> dict[str, Any]:
        if digest_type not in DIGEST_TYPES:
            raise AtlasError("周报类型无效")
        period_start = compact_text(payload.get("periodStart") or payload.get("period_start"), 20)
        period_end = compact_text(payload.get("periodEnd") or payload.get("period_end"), 20)
        as_of = compact_text(payload.get("asOf") or payload.get("as_of") or utc_now(), 80)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_start) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_end):
            raise AtlasError("周报周期必须使用 YYYY-MM-DD")
        focus = self.get_focus_profile(owner_id) if digest_type == "private" else self._focus_from_row(None)
        radar = self.private_radar(owner_id) if digest_type == "private" else self.frontier_radar(limit=200)
        signals = [item for item in radar.get("signals", []) if str(item.get("as_of_date", "") or "")[:10] <= as_of[:10]]
        content, markdown = self._digest_content(signals, focus, as_of)
        source_snapshot = {
            "signal_revisions": [{"id": item["id"], "revision": item.get("revision", 1)} for item in signals],
            "source_runs": [
                run.get("id")
                for source in (radar.get("sources", {}).values() if isinstance(radar.get("sources"), dict) else [])
                for run in [source.get("latest_run") if isinstance(source, dict) else None]
                if isinstance(run, dict) and run.get("id")
            ],
        }
        source_sha = hashlib.sha256(
            json.dumps({"content": content, "source": source_snapshot}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        owner = compact_text(owner_id, 120) or "local"
        with self._lock, self.connect() as db:
            existing = db.execute(
                """SELECT * FROM research_digests
                   WHERE owner_id=? AND digest_type=? AND period_start=? AND period_end=? AND as_of=? AND source_sha256=?""",
                (owner, digest_type, period_start, period_end, as_of, source_sha),
            ).fetchone()
            if existing:
                return self._digest_from_row(existing)
            previous = db.execute(
                "SELECT id FROM research_digests WHERE owner_id=? AND digest_type=? ORDER BY period_end DESC LIMIT 1",
                (owner, digest_type),
            ).fetchone()
            digest_id = str(uuid.uuid4())
            now = utc_now()
            db.execute(
                """
                INSERT INTO research_digests(
                    id, owner_id, digest_type, period_start, period_end, as_of,
                    scope_json, source_snapshot_json, content_json, markdown,
                    source_sha256, previous_digest_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (digest_id, owner, digest_type, period_start, period_end, as_of,
                 json.dumps(focus, ensure_ascii=False), json.dumps(source_snapshot, ensure_ascii=False),
                 json.dumps(content, ensure_ascii=False), markdown, source_sha,
                 previous["id"] if previous else None, now, now),
            )
            row = db.execute("SELECT * FROM research_digests WHERE id=?", (digest_id,)).fetchone()
            assert row is not None
            self._record_editor_audit(
                db,
                "digest_created",
                self._editor_actor(payload, required=False),
                entity_kind="digest",
                entity_id=digest_id,
                after=self._digest_from_row(row),
                reason=self._editor_reason(payload, required=False),
            )
            return self._digest_from_row(row)

    @staticmethod
    def _digest_from_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        for field in ("scope", "source_snapshot", "content"):
            result[field] = json.loads(result.pop(f"{field}_json") or "{}")
        result["digest_type"] = result.get("digest_type") or "private"
        return result

    def list_research_digests(self, owner_id: str = "local", digest_type: str = "private", limit: int = 20) -> list[dict[str, Any]]:
        safe_limit = max(1, min(100, int(limit)))
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM research_digests WHERE owner_id=? AND digest_type=? ORDER BY period_end DESC, created_at DESC LIMIT ?",
                (compact_text(owner_id, 120) or "local", digest_type, safe_limit),
            ).fetchall()
            return [self._digest_from_row(row) for row in rows]

    @staticmethod
    def _editor_actor(payload: dict[str, Any], required: bool = True) -> str:
        actor = compact_text(payload.get("editorName") or payload.get("editor_name") or payload.get("actor"), 120)
        if required and not actor:
            raise AtlasError("编辑操作必须记录操作者")
        return actor or "本机编辑"

    @staticmethod
    def _editor_reason(payload: dict[str, Any], required: bool = False) -> str:
        reason = clean_multiline_text(payload.get("reason") or payload.get("reviewReason") or payload.get("review_reason"), 4000)
        if required and len(reason) < 10:
            raise AtlasError("编辑操作理由至少需要 10 个字符")
        return reason

    @staticmethod
    def _idempotency_key(payload: dict[str, Any]) -> str:
        """Normalize an optional retry key without accepting control bytes."""
        raw = payload.get("idempotencyKey", payload.get("idempotency_key"))
        if raw is None:
            return ""
        if not isinstance(raw, str):
            raise AtlasError("idempotencyKey must be a string")
        key = raw.strip()
        if not key:
            return ""
        if len(key) > IDEMPOTENCY_KEY_MAX_LENGTH:
            raise AtlasError("idempotencyKey is too long")
        if any(ord(char) < 0x21 or ord(char) > 0x7E for char in key):
            raise AtlasError("idempotencyKey must contain visible ASCII characters")
        return key

    @staticmethod
    def _operation_request_hash(operation_kind: str, request: dict[str, Any]) -> str:
        if operation_kind not in IDEMPOTENCY_OPERATION_KINDS:
            raise AtlasError("idempotency operation kind is invalid")
        canonical = json.dumps(
            {"operation_kind": operation_kind, "request": request},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _deterministic_operation_id(operation_kind: str, owner_id: str, key: str) -> str:
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"research-atlas:{operation_kind}:{owner_id}:{key}"))

    @classmethod
    def _lookup_operation_idempotency(
        cls,
        db: sqlite3.Connection,
        owner_id: str,
        operation_kind: str,
        key: str,
        request_hash: str,
    ) -> sqlite3.Row | None:
        if not key:
            return None
        row = db.execute(
            "SELECT * FROM operation_idempotency WHERE owner_id=? AND operation_kind=? AND idempotency_key=?",
            (owner_id, operation_kind, key),
        ).fetchone()
        if row is not None and not hmac.compare_digest(str(row["request_sha256"]), request_hash):
            raise ConflictError("idempotencyKey was already used for a different request")
        return row

    def _idempotent_run_response(
        self,
        db: sqlite3.Connection,
        row: sqlite3.Row,
        owner_id: str,
        key: str,
    ) -> dict[str, Any]:
        run = db.execute(
            "SELECT * FROM research_view_runs WHERE id=? AND owner_id=?",
            (row["resource_id"], owner_id),
        ).fetchone()
        if run is None:
            raise AtlasError("idempotency record points to a missing research view run")
        run_payload = self._research_view_run_from_row(run)
        try:
            view = self.get_research_view(run_payload["view_id"], owner_id)
        except NotFoundError:
            view = {
                "id": run_payload.get("view_id", ""),
                "owner_id": owner_id,
                "name": run_payload.get("view_name", ""),
                "description": "",
                "view_kind": run_payload.get("view_kind", ""),
                "revision": run_payload.get("view_revision", 0),
                "created_at": run_payload.get("run_at", ""),
                "updated_at": run_payload.get("run_at", ""),
                "definition": run_payload.get("definition", {}),
                "evidence_boundary": run_payload.get("evidence_boundary", {}),
                "deleted": True,
            }
        return {
            "view": view,
            "run": run_payload,
            "result": run_payload.get("result", {}),
            "idempotent_replay": True,
            "idempotency_key": key,
        }

    @staticmethod
    def _bundle_response_from_row(row: sqlite3.Row, *, replay: bool = False, key: str = "") -> dict[str, Any]:
        result = {
            "id": row["id"],
            "view_run_id": row["view_run_id"],
            "manifest": json.loads(row["manifest_json"] or "{}"),
            "bundle": json.loads(row["bundle_json"] or "{}"),
            "markdown": row["markdown"],
            "bundle_sha256": row["bundle_sha256"],
            "created_at": row["created_at"],
        }
        if replay:
            result["idempotent_replay"] = True
            result["idempotency_key"] = key
        return result

    @staticmethod
    def _normalize_entity_kind(value: Any) -> str:
        kind = compact_text(value, 40).lower()
        if kind not in EDITOR_ENTITY_KINDS:
            raise AtlasError("实体类型无效")
        return kind

    @staticmethod
    def _normalize_entity_status(value: Any, default: str = "candidate") -> str:
        status = compact_text(value, 30).lower() or default
        if status not in EDITOR_ENTITY_STATUS:
            raise AtlasError("实体状态无效")
        return status

    @staticmethod
    def _normalize_relation_type(value: Any) -> str:
        relation = compact_text(value, 40).lower()
        if relation not in EDITOR_RELATION_TYPES:
            raise AtlasError("关系类型无效")
        return relation

    @staticmethod
    def _normalize_relation_status(value: Any, default: str = "candidate") -> str:
        status = compact_text(value, 30).lower() or default
        if status not in EDITOR_RELATION_STATUS:
            raise AtlasError("关系状态无效")
        return status

    @staticmethod
    def _diff_values(before: Any, after: Any, path: str = "") -> list[dict[str, Any]]:
        if isinstance(before, dict) and isinstance(after, dict):
            changes: list[dict[str, Any]] = []
            for key in sorted(set(before) | set(after)):
                child = f"{path}.{key}" if path else key
                changes.extend(AtlasStore._diff_values(before.get(key), after.get(key), child))
            return changes
        if isinstance(before, list) and isinstance(after, list):
            if before == after:
                return []
            return [{"path": path or "$", "before": before, "after": after, "kind": "changed"}]
        if before == after:
            return []
        return [{"path": path or "$", "before": before, "after": after, "kind": "changed"}]

    @staticmethod
    def _editor_scope(payload: dict[str, Any]) -> dict[str, Any]:
        raw = payload.get("scope")
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise AtlasError("批量范围必须是对象")
        scope = dict(raw)
        for key in ("paperIds", "paper_ids", "entityIds", "entity_ids", "termIds", "term_ids"):
            if key in scope and not isinstance(scope[key], list):
                raise AtlasError("批量范围 ID 列表格式无效")
        try:
            scope["limit"] = max(1, min(EDITOR_BATCH_MAX_ITEMS, int(scope.get("limit") or EDITOR_BATCH_MAX_ITEMS)))
        except (TypeError, ValueError) as error:
            raise AtlasError("批量范围 limit 必须是整数") from error
        return scope

    def _record_editor_audit(
        self,
        db: sqlite3.Connection,
        action: str,
        actor: str,
        *,
        entity_kind: str = "",
        entity_id: str = "",
        batch_id: str = "",
        before: Any = None,
        after: Any = None,
        reason: str = "",
        model: str = "",
        prompt_version: str = "",
        work_units: float = 0,
    ) -> dict[str, Any]:
        if action not in EDITOR_AUDIT_ACTIONS:
            raise AtlasError("未知编辑审计动作")
        now = utc_now()
        db.execute(
            """
            INSERT INTO editor_audit_events(
                action, actor, entity_kind, entity_id, batch_id, before_json, after_json,
                reason, model, prompt_version, work_units, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action,
                actor,
                compact_text(entity_kind, 40),
                compact_text(entity_id, 160),
                compact_text(batch_id, 80),
                json.dumps(before if before is not None else {}, ensure_ascii=False, sort_keys=True),
                json.dumps(after if after is not None else {}, ensure_ascii=False, sort_keys=True),
                reason,
                compact_text(model, 240),
                compact_text(prompt_version, 120),
                float(work_units or 0),
                now,
            ),
        )
        row = db.execute("SELECT * FROM editor_audit_events ORDER BY id DESC LIMIT 1").fetchone()
        assert row is not None
        return self._audit_from_row(row)

    def list_editor_audit(self, limit: int = 100, action: str = "") -> list[dict[str, Any]]:
        safe_limit = max(1, min(500, int(limit)))
        normalized_action = compact_text(action, 60)
        with self.connect() as db:
            if normalized_action:
                rows = db.execute(
                    "SELECT * FROM editor_audit_events WHERE action=? ORDER BY id DESC LIMIT ?",
                    (normalized_action, safe_limit),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT * FROM editor_audit_events ORDER BY id DESC LIMIT ?",
                    (safe_limit,),
                ).fetchall()
            return [self._audit_from_row(row) for row in rows]

    def _recount_editor_batch_with_db(self, db: sqlite3.Connection, batch_id: str) -> sqlite3.Row:
        batch = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
        if batch is None:
            raise NotFoundError("批量作业不存在")
        counts = {
            "pending": db.execute(
                "SELECT COUNT(*) FROM editor_batch_items WHERE batch_id=? AND status IN ('pending','running')",
                (batch_id,),
            ).fetchone()[0],
            "proposed": db.execute(
                "SELECT COUNT(*) FROM editor_batch_items WHERE batch_id=? AND status IN ('proposed','approved')",
                (batch_id,),
            ).fetchone()[0],
            "completed": db.execute(
                "SELECT COUNT(*) FROM editor_batch_items WHERE batch_id=? AND status='completed'",
                (batch_id,),
            ).fetchone()[0],
            "failed": db.execute(
                "SELECT COUNT(*) FROM editor_batch_items WHERE batch_id=? AND status='failed'",
                (batch_id,),
            ).fetchone()[0],
            "rejected": db.execute(
                "SELECT COUNT(*) FROM editor_batch_items WHERE batch_id=? AND status IN ('rejected','skipped')",
                (batch_id,),
            ).fetchone()[0],
        }
        status = batch["status"]
        if status not in {"paused", "cancelled"}:
            if counts["pending"]:
                status = "queued" if not counts["completed"] and not counts["proposed"] else "partial"
            elif counts["failed"]:
                status = "partial" if counts["completed"] or counts["rejected"] else "failed"
            elif counts["proposed"]:
                status = "previewed"
            else:
                status = "completed"
        now = utc_now()
        db.execute(
            """
            UPDATE editor_batches
            SET status=?, pending_items=?, proposed_items=?, completed_items=?, failed_items=?, rejected_items=?,
                actual_work=(SELECT COALESCE(SUM(actual_work), 0) FROM editor_batch_items WHERE batch_id=?),
                updated_at=?, finished_at=CASE WHEN ? IN ('completed','failed','cancelled') THEN COALESCE(finished_at, ?) ELSE finished_at END
            WHERE id=?
            """,
            (
                status,
                counts["pending"],
                counts["proposed"],
                counts["completed"],
                counts["failed"],
                counts["rejected"],
                batch_id,
                now,
                status,
                now,
                batch_id,
            ),
        )
        refreshed = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
        assert refreshed is not None
        return refreshed

    def _batch_items_for_scope(
        self,
        db: sqlite3.Connection,
        batch_kind: str,
        scope: dict[str, Any],
    ) -> list[tuple[str, str]]:
        limit = int(scope.get("limit") or EDITOR_BATCH_MAX_ITEMS)
        paper_ids = scope.get("paperIds") or scope.get("paper_ids") or []
        entity_ids = scope.get("entityIds") or scope.get("entity_ids") or []
        term_ids = scope.get("termIds") or scope.get("term_ids") or []
        if batch_kind in {"l1_structure", "l2_anchor"}:
            if paper_ids:
                normalized = []
                for value in paper_ids[:limit]:
                    try:
                        normalized.append(int(value))
                    except (TypeError, ValueError) as error:
                        raise AtlasError("论文 ID 列表包含无效值") from error
                placeholders = ",".join("?" for _ in normalized)
                rows = db.execute(
                    f"SELECT id FROM canonical_papers WHERE id IN ({placeholders}) ORDER BY id",
                    normalized,
                ).fetchall()
            elif batch_kind == "l2_anchor":
                rows = db.execute(
                    """
                    SELECT DISTINCT canonical_paper_id AS id
                    FROM paper_analyses
                    WHERE status IN ('partial','completed')
                    ORDER BY updated_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT id FROM canonical_papers ORDER BY updated_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [("paper", str(row["id"])) for row in rows]
        if batch_kind == "recompute":
            if entity_ids:
                normalized = [compact_text(value, 160) for value in entity_ids[:limit] if compact_text(value, 160)]
                placeholders = ",".join("?" for _ in normalized)
                if not placeholders:
                    return []
                rows = db.execute(
                    f"SELECT id FROM knowledge_entities WHERE id IN ({placeholders}) ORDER BY updated_at DESC",
                    normalized,
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT id FROM knowledge_entities WHERE status<>'merged' ORDER BY updated_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [("entity", str(row["id"])) for row in rows]
        domains = clean_string_list(scope.get("domains") or ["embodied", "llm"], 40, 3)
        layers = clean_string_list(scope.get("layers") or ["candidate_ingest", "anchor_depth", "relationship_review"], 80, 4)
        return [("coverage", f"{domain}:{layer}") for domain in domains for layer in layers][:limit]

    def _upsert_editor_entity_with_db(
        self,
        db: sqlite3.Connection,
        payload: dict[str, Any],
        *,
        actor: str,
        reason: str,
        batch_id: str = "",
        allow_reviewed_overwrite: bool = False,
        audit_action: str = "entity_updated",
    ) -> dict[str, Any]:
        entity_kind = self._normalize_entity_kind(payload.get("entityKind") or payload.get("entity_kind"))
        canonical_name = compact_text(payload.get("canonicalName") or payload.get("canonical_name") or payload.get("name"), 500)
        if not canonical_name:
            raise AtlasError("实体名称不能为空")
        normalized_name = normalized_title(canonical_name)
        if not normalized_name:
            raise AtlasError("实体名称无法规范化")
        description = clean_multiline_text(payload.get("description"), 12000)
        status = self._normalize_entity_status(payload.get("status"), "candidate")
        source_kind = compact_text(payload.get("sourceKind") or payload.get("source_kind") or "editor", 80)
        source_ref = compact_text(payload.get("sourceRef") or payload.get("source_ref"), 500)
        metadata = payload.get("metadata") or {}
        if not isinstance(metadata, dict):
            raise AtlasError("实体 metadata 必须是对象")
        entity_id = compact_text(payload.get("id") or payload.get("entityId") or payload.get("entity_id"), 160)
        existing = None
        if entity_id:
            existing = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (entity_id,)).fetchone()
        if existing is None:
            existing = db.execute(
                "SELECT * FROM knowledge_entities WHERE entity_kind=? AND normalized_name=?",
                (entity_kind, normalized_name),
            ).fetchone()
        name_conflict = db.execute(
            "SELECT id FROM knowledge_entities WHERE entity_kind=? AND normalized_name=?",
            (entity_kind, normalized_name),
        ).fetchone()
        if name_conflict and (existing is None or name_conflict["id"] != existing["id"]):
            raise ConflictError("同类型实体已经使用该规范名称")
        before = self._entity_snapshot(existing)
        now = utc_now()
        reviewed_at = payload.get("reviewedAt") or payload.get("reviewed_at")
        if status == "active" and not reviewed_at:
            reviewed_at = now
        if existing:
            if existing["status"] == "merged":
                raise ConflictError("已合并实体不能直接覆盖")
            proposed_core = {
                "canonical_name": canonical_name,
                "description": description,
                "status": status,
                "source_kind": source_kind,
                "source_ref": source_ref,
                "metadata": metadata,
            }
            current_core = {
                "canonical_name": existing["canonical_name"],
                "description": existing["description"],
                "status": existing["status"],
                "source_kind": existing["source_kind"],
                "source_ref": existing["source_ref"],
                "metadata": self._editor_json(existing["metadata_json"], {}),
            }
            if existing["reviewed_at"] and current_core != proposed_core and not allow_reviewed_overwrite:
                raise ConflictError("已审核实体禁止被批量任务静默覆盖；请显式批准并记录理由")
            entity_id = existing["id"]
            db.execute(
                """
                UPDATE knowledge_entities
                SET canonical_name=?, normalized_name=?, description=?, status=?, source_kind=?, source_ref=?,
                    metadata_json=?, revision=revision+1, updated_at=?, reviewed_at=COALESCE(?, reviewed_at)
                WHERE id=?
                """,
                (
                    canonical_name,
                    normalized_name,
                    description,
                    status,
                    source_kind,
                    source_ref,
                    json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                    now,
                    reviewed_at,
                    entity_id,
                ),
            )
        else:
            entity_id = entity_id or str(uuid.uuid4())
            db.execute(
                """
                INSERT INTO knowledge_entities(
                    id, entity_kind, canonical_name, normalized_name, description, status,
                    source_kind, source_ref, metadata_json, revision, created_at, updated_at, reviewed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    entity_id,
                    entity_kind,
                    canonical_name,
                    normalized_name,
                    description,
                    status,
                    source_kind,
                    source_ref,
                    json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                    now,
                    now,
                    reviewed_at,
                ),
            )
            audit_action = "entity_created"
        aliases = payload.get("aliases") or []
        if aliases and not isinstance(aliases, list):
            raise AtlasError("实体 aliases 必须是数组")
        for alias in aliases[:100]:
            if isinstance(alias, dict):
                alias_value = alias.get("alias") or alias.get("name")
                alias_kind = alias.get("aliasKind") or alias.get("alias_kind") or "batch"
                alias_source = alias.get("sourceRef") or alias.get("source_ref") or source_ref
            else:
                alias_value = alias
                alias_kind = "batch"
                alias_source = source_ref
            self._add_entity_alias_with_db(
                db,
                entity_id,
                alias_value,
                alias_kind=alias_kind,
                source_kind=source_kind,
                source_ref=alias_source,
            )
        row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (entity_id,)).fetchone()
        assert row is not None
        result = self._entity_from_row(db, row)
        self._record_editor_audit(
            db,
            audit_action,
            actor,
            entity_kind=entity_kind,
            entity_id=entity_id,
            batch_id=batch_id,
            before=before,
            after=result,
            reason=reason,
        )
        return result

    def _add_entity_alias_with_db(
        self,
        db: sqlite3.Connection,
        entity_id: str,
        alias: Any,
        *,
        alias_kind: Any = "editor",
        source_kind: Any = "editor",
        source_ref: Any = "",
    ) -> dict[str, Any]:
        row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (entity_id,)).fetchone()
        if row is None:
            raise NotFoundError("实体不存在")
        alias_value = compact_text(alias, 500)
        normalized_alias = normalized_title(alias_value)
        if not alias_value or not normalized_alias:
            raise AtlasError("别名不能为空")
        conflict = db.execute(
            """
            SELECT alias.entity_id, entity.canonical_name
            FROM knowledge_entity_aliases alias
            JOIN knowledge_entities entity ON entity.id=alias.entity_id
            WHERE alias.entity_kind=? AND alias.normalized_alias=? AND alias.status='active'
              AND alias.entity_id<>? AND entity.status<>'merged'
            LIMIT 1
            """,
            (row["entity_kind"], normalized_alias, entity_id),
        ).fetchone()
        if conflict:
            raise ConflictError(f"该别名已属于实体“{conflict['canonical_name']}”")
        now = utc_now()
        db.execute(
            """
            INSERT INTO knowledge_entity_aliases(
                entity_id, entity_kind, alias, normalized_alias, alias_kind,
                source_kind, source_ref, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            ON CONFLICT(entity_id, normalized_alias) DO UPDATE SET
                alias=excluded.alias, alias_kind=excluded.alias_kind, source_kind=excluded.source_kind,
                source_ref=excluded.source_ref, status='active', updated_at=excluded.updated_at
            """,
            (
                entity_id,
                row["entity_kind"],
                alias_value,
                normalized_alias,
                compact_text(alias_kind, 80) or "editor",
                compact_text(source_kind, 80) or "editor",
                compact_text(source_ref, 500),
                now,
                now,
            ),
        )
        alias_row = db.execute(
            "SELECT * FROM knowledge_entity_aliases WHERE entity_id=? AND normalized_alias=?",
            (entity_id, normalized_alias),
        ).fetchone()
        assert alias_row is not None
        return dict(alias_row)

    def create_editor_entity(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        with self._lock, self.connect() as db:
            return self._upsert_editor_entity_with_db(db, payload, actor=actor, reason=reason)

    def update_editor_entity(self, entity_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        with self._lock, self.connect() as db:
            current = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (entity_id,)).fetchone()
            if current is None:
                raise NotFoundError("实体不存在")
            merged = {
                **self._entity_snapshot(current),
                **payload,
                "id": entity_id,
                "entityKind": payload.get("entityKind") or payload.get("entity_kind") or current["entity_kind"],
                "canonicalName": payload.get("canonicalName") or payload.get("canonical_name") or current["canonical_name"],
                "description": payload.get("description", current["description"]),
                "status": payload.get("status") or current["status"],
                "sourceKind": payload.get("sourceKind") or payload.get("source_kind") or current["source_kind"],
                "sourceRef": payload.get("sourceRef") or payload.get("source_ref") or current["source_ref"],
                "metadata": payload.get("metadata") or self._editor_json(current["metadata_json"], {}),
            }
            return self._upsert_editor_entity_with_db(
                db,
                merged,
                actor=actor,
                reason=reason,
                allow_reviewed_overwrite=True,
            )

    def add_editor_entity_alias(self, entity_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        with self._lock, self.connect() as db:
            before_row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (entity_id,)).fetchone()
            if before_row is None:
                raise NotFoundError("实体不存在")
            alias = self._add_entity_alias_with_db(
                db,
                entity_id,
                payload.get("alias"),
                alias_kind=payload.get("aliasKind") or payload.get("alias_kind") or "editor",
                source_kind="editor",
                source_ref=payload.get("sourceRef") or payload.get("source_ref"),
            )
            self._record_editor_audit(
                db,
                "alias_added",
                actor,
                entity_kind=before_row["entity_kind"],
                entity_id=entity_id,
                before={},
                after=alias,
                reason=reason,
            )
            return alias

    def list_editor_entities(
        self,
        limit: int = 100,
        entity_kind: str = "",
        status: str = "",
        query: str = "",
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(500, int(limit)))
        filters: list[str] = []
        values: list[Any] = []
        if entity_kind:
            filters.append("entity_kind=?")
            values.append(self._normalize_entity_kind(entity_kind))
        if status:
            filters.append("status=?")
            values.append(self._normalize_entity_status(status))
        normalized_query = normalized_title(query)
        if normalized_query:
            filters.append("(normalized_name LIKE ? OR id IN (SELECT entity_id FROM knowledge_entity_aliases WHERE normalized_alias LIKE ?))")
            values.extend([f"%{normalized_query}%", f"%{normalized_query}%"])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        values.append(safe_limit)
        with self.connect() as db:
            rows = db.execute(
                f"SELECT * FROM knowledge_entities {where} ORDER BY updated_at DESC LIMIT ?",
                values,
            ).fetchall()
            return [self._entity_from_row(db, row) for row in rows]

    def get_editor_entity(self, entity_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (compact_text(entity_id, 160),)).fetchone()
            if row is None:
                raise NotFoundError("实体不存在")
            result = self._entity_from_row(db, row)
            relation_rows = db.execute(
                """
                SELECT * FROM knowledge_relationships
                WHERE from_entity_id=? OR to_entity_id=?
                ORDER BY updated_at DESC
                """,
                (entity_id, entity_id),
            ).fetchall()
            result["relationships"] = [self._relationship_from_row(db, item) for item in relation_rows]
            return result

    def _upsert_relationship_with_db(
        self,
        db: sqlite3.Connection,
        payload: dict[str, Any],
        *,
        actor: str,
        reason: str,
        batch_id: str = "",
        allow_reviewed_overwrite: bool = False,
    ) -> dict[str, Any]:
        relation_id = compact_text(payload.get("id") or payload.get("relationshipId") or payload.get("relationship_id"), 160)
        from_id = compact_text(payload.get("fromEntityId") or payload.get("from_entity_id"), 160)
        to_id = compact_text(payload.get("toEntityId") or payload.get("to_entity_id"), 160)
        relation_type = self._normalize_relation_type(payload.get("relationType") or payload.get("relation_type"))
        status = self._normalize_relation_status(payload.get("status"), "candidate")
        if not from_id or not to_id or from_id == to_id:
            raise AtlasError("关系必须连接两个不同实体")
        for entity_id in (from_id, to_id):
            entity = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (entity_id,)).fetchone()
            if entity is None or entity["status"] == "merged":
                raise NotFoundError("关系引用的实体不存在或已合并")
        evidence = payload.get("evidence") or []
        if not isinstance(evidence, list):
            raise AtlasError("关系 evidence 必须是数组")
        normalized_evidence: list[dict[str, Any]] = []
        for item in evidence[:50]:
            if not isinstance(item, dict):
                raise AtlasError("关系证据条目必须是对象")
            normalized_item = {
                "label": compact_text(item.get("label"), 300),
                "source_url": clean_http_url(item.get("sourceUrl") or item.get("source_url")),
                "quote": clean_multiline_text(item.get("quote"), 3000),
                "source_ref": compact_text(item.get("sourceRef") or item.get("source_ref"), 500),
                "direction": compact_text(item.get("direction") or "supports", 30),
                # Keep bounded provenance fields so timeline consumers can
                # distinguish publication time from the edit timestamp.
                "section": compact_text(item.get("section"), 300),
                "figure": compact_text(item.get("figure"), 120),
                "published_at": compact_text(item.get("publishedAt") or item.get("published_at"), 80),
                "source_date": compact_text(item.get("sourceDate") or item.get("source_date"), 80),
            }
            raw_page = item.get("page")
            try:
                page_number = int(raw_page)
            except (TypeError, ValueError):
                page_number = 0
            if 0 < page_number <= 100_000:
                normalized_item["page"] = page_number
            normalized_evidence.append(normalized_item)
        source_kind = compact_text(payload.get("sourceKind") or payload.get("source_kind") or "editor", 80)
        source_ref = compact_text(payload.get("sourceRef") or payload.get("source_ref"), 500)
        existing = None
        if relation_id:
            existing = db.execute("SELECT * FROM knowledge_relationships WHERE id=?", (relation_id,)).fetchone()
        if existing is None:
            existing = db.execute(
                """
                SELECT * FROM knowledge_relationships
                WHERE from_entity_id=? AND to_entity_id=? AND relation_type=?
                """,
                (from_id, to_id, relation_type),
            ).fetchone()
        before = self._relationship_from_row(db, existing) if existing else {}
        now = utc_now()
        reviewed_at = payload.get("reviewedAt") or payload.get("reviewed_at")
        if status == "active" and not reviewed_at:
            reviewed_at = now
        if existing:
            if existing["reviewed_at"] and not allow_reviewed_overwrite:
                current = {
                    "from": existing["from_entity_id"],
                    "to": existing["to_entity_id"],
                    "type": existing["relation_type"],
                    "status": existing["status"],
                    "evidence": self._editor_json(existing["evidence_json"], []),
                }
                proposed = {"from": from_id, "to": to_id, "type": relation_type, "status": status, "evidence": normalized_evidence}
                if current != proposed:
                    raise ConflictError("已审核关系禁止被批量任务静默覆盖；请显式修正并记录理由")
            relation_id = existing["id"]
            db.execute(
                """
                UPDATE knowledge_relationships
                SET from_entity_id=?, to_entity_id=?, relation_type=?, status=?, evidence_json=?,
                    source_kind=?, source_ref=?, revision=revision+1, updated_at=?,
                    reviewed_at=COALESCE(?, reviewed_at)
                WHERE id=?
                """,
                (
                    from_id,
                    to_id,
                    relation_type,
                    status,
                    json.dumps(normalized_evidence, ensure_ascii=False, sort_keys=True),
                    source_kind,
                    source_ref,
                    now,
                    reviewed_at,
                    relation_id,
                ),
            )
            action = "relationship_retired" if status == "retired" else "relationship_updated"
        else:
            relation_id = relation_id or str(uuid.uuid4())
            db.execute(
                """
                INSERT INTO knowledge_relationships(
                    id, from_entity_id, to_entity_id, relation_type, status, evidence_json,
                    source_kind, source_ref, revision, created_at, updated_at, reviewed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    relation_id,
                    from_id,
                    to_id,
                    relation_type,
                    status,
                    json.dumps(normalized_evidence, ensure_ascii=False, sort_keys=True),
                    source_kind,
                    source_ref,
                    now,
                    now,
                    reviewed_at,
                ),
            )
            action = "relationship_created"
        row = db.execute("SELECT * FROM knowledge_relationships WHERE id=?", (relation_id,)).fetchone()
        assert row is not None
        result = self._relationship_from_row(db, row)
        self._record_editor_audit(
            db,
            action,
            actor,
            entity_kind="relationship",
            entity_id=relation_id,
            batch_id=batch_id,
            before=before,
            after=result,
            reason=reason,
        )
        return result

    def create_editor_relationship(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        with self._lock, self.connect() as db:
            return self._upsert_relationship_with_db(db, payload, actor=actor, reason=reason)

    def update_editor_relationship(self, relationship_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        with self._lock, self.connect() as db:
            current = db.execute("SELECT * FROM knowledge_relationships WHERE id=?", (relationship_id,)).fetchone()
            if current is None:
                raise NotFoundError("关系不存在")
            merged = {
                "id": relationship_id,
                "fromEntityId": payload.get("fromEntityId") or payload.get("from_entity_id") or current["from_entity_id"],
                "toEntityId": payload.get("toEntityId") or payload.get("to_entity_id") or current["to_entity_id"],
                "relationType": payload.get("relationType") or payload.get("relation_type") or current["relation_type"],
                "status": payload.get("status") or current["status"],
                "evidence": payload.get("evidence") if "evidence" in payload else self._editor_json(current["evidence_json"], []),
                "sourceKind": payload.get("sourceKind") or payload.get("source_kind") or current["source_kind"],
                "sourceRef": payload.get("sourceRef") or payload.get("source_ref") or current["source_ref"],
            }
            return self._upsert_relationship_with_db(
                db,
                merged,
                actor=actor,
                reason=reason,
                allow_reviewed_overwrite=True,
            )

    def list_editor_relationships(
        self,
        limit: int = 100,
        status: str = "",
        entity_id: str = "",
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(500, int(limit)))
        filters: list[str] = []
        values: list[Any] = []
        if status:
            filters.append("status=?")
            values.append(self._normalize_relation_status(status))
        normalized_entity = compact_text(entity_id, 160)
        if normalized_entity:
            filters.append("(from_entity_id=? OR to_entity_id=?)")
            values.extend([normalized_entity, normalized_entity])
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        values.append(safe_limit)
        with self.connect() as db:
            rows = db.execute(
                f"SELECT * FROM knowledge_relationships {where} ORDER BY updated_at DESC LIMIT ?",
                values,
            ).fetchall()
            return [self._relationship_from_row(db, row) for row in rows]

    @staticmethod
    def _public_entity_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        if row is None:
            raise NotFoundError("公共知识实体不存在")
        result = AtlasStore._entity_snapshot(row)
        result["aliases"] = [
            dict(item)
            for item in db.execute(
                """
                SELECT id, alias, alias_kind, source_kind, source_ref, status, created_at, updated_at
                FROM knowledge_entity_aliases
                WHERE entity_id=? AND status='active'
                ORDER BY normalized_alias
                """,
                (row["id"],),
            ).fetchall()
        ]
        metadata = result.get("metadata") if isinstance(result.get("metadata"), dict) else {}
        result["limitations"] = clean_string_list(metadata.get("limitations"), 1000, 20) or ["尚未记录明确限制；请查看关联证据和反证关系。"]
        if row["entity_kind"] in {"paper", "project"}:
            result["paperfield_ref"] = row["source_ref"] or row["canonical_name"]
            result["paperfield_link_state"] = "available" if result["paperfield_ref"] else "unresolved"
        return result

    @staticmethod
    def _public_relation_from_row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        result = AtlasStore._relationship_from_row(db, row)
        result["evidence"] = [
            item for item in result.get("evidence", [])
            if isinstance(item, dict)
        ]
        return result

    def public_knowledge(
        self,
        *,
        entity_kind: str = "",
        query: str = "",
        limit: int = 100,
    ) -> dict[str, Any]:
        safe_limit = max(1, min(500, int(limit)))
        filters = ["status='active'"]
        values: list[Any] = []
        if entity_kind:
            normalized_kind = self._normalize_entity_kind(entity_kind)
            filters.append("entity_kind=?")
            values.append(normalized_kind)
        normalized_query = normalized_title(query)
        if normalized_query:
            filters.append("(normalized_name LIKE ? OR id IN (SELECT entity_id FROM knowledge_entity_aliases WHERE normalized_alias LIKE ?))")
            values.extend([f"%{normalized_query}%", f"%{normalized_query}%"])
        values.append(safe_limit)
        with self.connect() as db:
            rows = db.execute(
                f"SELECT * FROM knowledge_entities WHERE {' AND '.join(filters)} ORDER BY updated_at DESC, id LIMIT ?",
                values,
            ).fetchall()
            items = [self._public_entity_from_row(db, row) for row in rows]
            # A filtered entity list should never be accompanied by an
            # unrelated slice of the global graph. Keep edges incident to
            # selected entities; the opposite endpoint remains in the edge
            # snapshot for navigation.
            selected_ids = [item["id"] for item in items]
            if selected_ids:
                selected_json = json.dumps(selected_ids, ensure_ascii=False)
                relation_rows = db.execute(
                    """
                    SELECT relation.* FROM knowledge_relationships relation
                    JOIN knowledge_entities source ON source.id=relation.from_entity_id AND source.status='active'
                    JOIN knowledge_entities target ON target.id=relation.to_entity_id AND target.status='active'
                    WHERE relation.status='active'
                      AND (
                        relation.from_entity_id IN (SELECT value FROM json_each(?))
                        OR relation.to_entity_id IN (SELECT value FROM json_each(?))
                      )
                    ORDER BY relation.updated_at DESC, relation.id
                    LIMIT ?
                    """,
                    (selected_json, selected_json, max(1, min(1000, safe_limit * 4))),
                ).fetchall()
            else:
                relation_rows = []
            relationships = [self._public_relation_from_row(db, row) for row in relation_rows]
            return {
                "items": items,
                "relationships": relationships,
                "total": len(items),
                "relationship_total": len(relationships),
                "visibility": "reviewed_entities_and_active_relationships_only",
            }

    def public_knowledge_entity(
        self,
        entity_id: str,
        *,
        depth: int = 2,
        max_nodes: int = 80,
        max_edges: int | None = None,
    ) -> dict[str, Any]:
        normalized_id = compact_text(entity_id, 160)
        safe_depth = max(0, min(8, int(depth)))
        safe_nodes = max(1, min(200, int(max_nodes)))
        safe_edges = max(1, min(800, int(max_edges) if max_edges is not None else safe_nodes * 4))
        with self.connect() as db:
            row = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (normalized_id,)).fetchone()
            if row is None or row["status"] != "active":
                raise NotFoundError("公共知识实体不存在或尚未审核")
            detail = self._public_entity_from_row(db, row)
            relation_rows = db.execute(
                """
                SELECT relation.* FROM knowledge_relationships relation
                JOIN knowledge_entities source ON source.id=relation.from_entity_id AND source.status='active'
                JOIN knowledge_entities target ON target.id=relation.to_entity_id AND target.status='active'
                WHERE relation.status='active' AND (relation.from_entity_id=? OR relation.to_entity_id=?)
                ORDER BY relation.updated_at DESC, relation.id
                LIMIT ?
                """,
                (normalized_id, normalized_id, safe_edges),
            ).fetchall()
            all_relations = [self._public_relation_from_row(db, item) for item in relation_rows[:safe_edges]]
            detail["incoming"] = [item for item in all_relations if item["to_entity_id"] == normalized_id]
            detail["outgoing"] = [item for item in all_relations if item["from_entity_id"] == normalized_id]
            visited = {normalized_id}
            frontier = [normalized_id]
            nodes: list[dict[str, Any]] = [detail]
            graph_relations: list[dict[str, Any]] = []
            for current_depth in range(safe_depth):
                next_frontier: list[str] = []
                for current_id in frontier:
                    edge_rows = db.execute(
                        """
                        SELECT relation.* FROM knowledge_relationships relation
                        JOIN knowledge_entities source ON source.id=relation.from_entity_id AND source.status='active'
                        JOIN knowledge_entities target ON target.id=relation.to_entity_id AND target.status='active'
                        WHERE relation.status='active' AND (relation.from_entity_id=? OR relation.to_entity_id=?)
                        ORDER BY relation.id
                        LIMIT ?
                        """,
                        (current_id, current_id, safe_nodes),
                    ).fetchall()
                    for edge_row in edge_rows:
                        if len(graph_relations) >= safe_edges:
                            break
                        edge = self._public_relation_from_row(db, edge_row)
                        if edge["id"] not in {item["id"] for item in graph_relations}:
                            graph_relations.append(edge)
                        neighbor_id = edge["to_entity_id"] if edge["from_entity_id"] == current_id else edge["from_entity_id"]
                        if neighbor_id in visited or len(nodes) >= safe_nodes:
                            continue
                        neighbor = db.execute("SELECT * FROM knowledge_entities WHERE id=? AND status='active'", (neighbor_id,)).fetchone()
                        if neighbor is None:
                            continue
                        visited.add(neighbor_id)
                        nodes.append(self._public_entity_from_row(db, neighbor))
                        next_frontier.append(neighbor_id)
                frontier = next_frontier
                if not frontier or len(graph_relations) >= safe_edges:
                    break
            detail["graph"] = {
                "root": normalized_id,
                "depth": safe_depth,
                "max_nodes": safe_nodes,
                "max_edges": safe_edges,
                "nodes": nodes[:safe_nodes],
                "relationships": graph_relations[:safe_edges],
                "cycle_safe": True,
            }
            detail["timeline"] = sorted(
                [
                    {
                        "relationship_id": item["id"],
                        "relation_type": item["relation_type"],
                        "status": item["status"],
                        "source_date": next(
                            (
                                evidence.get("published_at") or evidence.get("source_date")
                                for evidence in item.get("evidence", [])
                                if isinstance(evidence, dict)
                            ),
                            item.get("updated_at", ""),
                        ),
                        "updated_at": item.get("updated_at", ""),
                        "contradictory": item["relation_type"] in {"contradicts", "qualifies"},
                    }
                    for item in graph_relations
                ],
                key=lambda item: (str(item.get("source_date") or ""), str(item.get("relationship_id") or "")),
            )
            return detail

    def merge_editor_entities(self, source_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        target_id = compact_text(payload.get("targetEntityId") or payload.get("target_entity_id"), 160)
        source_id = compact_text(source_id, 160)
        if not target_id or source_id == target_id:
            raise AtlasError("合并目标必须是另一个实体")
        with self._lock, self.connect() as db:
            source = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (source_id,)).fetchone()
            target = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (target_id,)).fetchone()
            if source is None or target is None:
                raise NotFoundError("待合并实体不存在")
            if source["status"] == "merged" or target["status"] == "merged":
                raise ConflictError("已合并实体不能再次作为合并端点")
            if source["entity_kind"] != target["entity_kind"]:
                raise ConflictError("只能合并相同类型的实体")
            before = {
                "source": self._entity_from_row(db, source),
                "target": self._entity_from_row(db, target),
            }
            now = utc_now()
            source_aliases = db.execute(
                "SELECT * FROM knowledge_entity_aliases WHERE entity_id=?",
                (source_id,),
            ).fetchall()
            aliases_to_move = [dict(item) for item in source_aliases]
            aliases_to_move.append(
                {
                    "alias": source["canonical_name"],
                    "alias_kind": "merged_entity",
                    "source_kind": source["source_kind"],
                    "source_ref": source["source_ref"],
                }
            )
            for alias in aliases_to_move:
                # Retire the source-side alias before inserting it on the target;
                # otherwise the global alias conflict check sees its old owner.
                if alias.get("id"):
                    db.execute(
                        "UPDATE knowledge_entity_aliases SET status='retired', updated_at=? WHERE id=?",
                        (now, alias["id"]),
                    )
                try:
                    self._add_entity_alias_with_db(
                        db,
                        target_id,
                        alias["alias"],
                        alias_kind=alias.get("alias_kind") or "merged_entity",
                        source_kind=alias.get("source_kind") or "editor",
                        source_ref=alias.get("source_ref") or "",
                    )
                except ConflictError:
                    continue
            relationships = db.execute(
                """
                SELECT * FROM knowledge_relationships
                WHERE from_entity_id=? OR to_entity_id=?
                """,
                (source_id, source_id),
            ).fetchall()
            for relationship in relationships:
                new_from = target_id if relationship["from_entity_id"] == source_id else relationship["from_entity_id"]
                new_to = target_id if relationship["to_entity_id"] == source_id else relationship["to_entity_id"]
                if new_from == new_to:
                    db.execute(
                        "UPDATE knowledge_relationships SET status='retired', revision=revision+1, updated_at=? WHERE id=?",
                        (now, relationship["id"]),
                    )
                    continue
                duplicate = db.execute(
                    """
                    SELECT id FROM knowledge_relationships
                    WHERE from_entity_id=? AND to_entity_id=? AND relation_type=? AND id<>?
                    """,
                    (new_from, new_to, relationship["relation_type"], relationship["id"]),
                ).fetchone()
                if duplicate:
                    db.execute(
                        "UPDATE knowledge_relationships SET status='retired', revision=revision+1, updated_at=? WHERE id=?",
                        (now, relationship["id"]),
                    )
                else:
                    db.execute(
                        """
                        UPDATE knowledge_relationships
                        SET from_entity_id=?, to_entity_id=?, revision=revision+1, updated_at=?
                        WHERE id=?
                        """,
                        (new_from, new_to, now, relationship["id"]),
                    )
            db.execute(
                """
                UPDATE knowledge_entities
                SET status='merged', merged_into_id=?, revision=revision+1, updated_at=?
                WHERE id=?
                """,
                (target_id, now, source_id),
            )
            source_after = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (source_id,)).fetchone()
            target_after = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (target_id,)).fetchone()
            assert source_after is not None and target_after is not None
            after = {
                "source": self._entity_from_row(db, source_after),
                "target": self._entity_from_row(db, target_after),
            }
            self._record_editor_audit(
                db,
                "entity_merged",
                actor,
                entity_kind=source["entity_kind"],
                entity_id=source_id,
                before=before,
                after=after,
                reason=reason,
            )
            return after

    @staticmethod
    def _paper_domains_from_row(row: sqlite3.Row) -> list[str]:
        topics = AtlasStore._editor_json(row["topics_json"], [])
        text = " ".join(str(item) for item in topics).casefold()
        domains: list[str] = []
        if any(token in text for token in ("robot", "embodied", "vla", "manipulation", "locomotion", "navigation")):
            domains.append("embodied")
        if any(token in text for token in ("llm", "language", "multimodal", "agent", "reasoning", "foundation")):
            domains.append("llm")
        return domains or ["cross"]

    def _paper_entity_snapshot_with_db(self, db: sqlite3.Connection, paper_id: int) -> tuple[dict[str, Any], dict[str, Any]]:
        paper = db.execute("SELECT * FROM canonical_papers WHERE id=?", (paper_id,)).fetchone()
        if paper is None:
            raise NotFoundError("批量作业引用的论文不存在")
        existing = db.execute(
            "SELECT * FROM knowledge_entities WHERE entity_kind='paper' AND source_ref=? LIMIT 1",
            (paper["canonical_ref"],),
        ).fetchone()
        current = self._entity_snapshot(existing)
        snapshot = {
            "id": existing["id"] if existing else "",
            "entityKind": "paper",
            "canonicalName": paper["title"] or paper["canonical_ref"],
            "description": compact_text(paper["abstract"], 1600),
            "status": "candidate",
            "sourceKind": "paper_metadata",
            "sourceRef": paper["canonical_ref"],
            "metadata": {
                "canonical_paper_id": paper["id"],
                "canonical_ref": paper["canonical_ref"],
                "published": paper["published"],
                "venue": paper["venue"],
                "current_version": paper["current_version"],
                "topics": self._editor_json(paper["topics_json"], []),
                "domains": self._paper_domains_from_row(paper),
                "source_url": paper["source_url"],
            },
        }
        return current, snapshot

    def _term_operations_for_paper_with_db(
        self,
        db: sqlite3.Connection,
        paper_id: int,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        rows = db.execute(
            """
            SELECT DISTINCT term.*, candidate.source_identifier, candidate.source_updated_at
            FROM frontier_term_candidates term
            JOIN frontier_term_evidence evidence ON evidence.term_id=term.id
            JOIN frontier_candidates candidate ON candidate.id=evidence.frontier_candidate_id
            WHERE candidate.canonical_paper_id=?
            ORDER BY term.normalized_term
            """,
            (paper_id,),
        ).fetchall()
        operations: list[dict[str, Any]] = []
        current: list[dict[str, Any]] = []
        for row in rows:
            existing = db.execute(
                "SELECT * FROM knowledge_entities WHERE entity_kind='term' AND source_ref=? LIMIT 1",
                (f"frontier-term:{row['id']}",),
            ).fetchone()
            current.append(self._entity_snapshot(existing) if existing else {})
            operations.append(
                {
                    "operation": "upsert_entity",
                    "ref_key": f"term:{row['id']}",
                    "entity": {
                        "id": existing["id"] if existing else "",
                        "entityKind": "term",
                        "canonicalName": row["display_term"],
                        "description": row["canonical_expansion"] or "作者命名证据，尚未等同于新概念共识。",
                        "status": "candidate",
                        "sourceKind": "frontier_term_evidence",
                        "sourceRef": f"frontier-term:{row['id']}",
                        "metadata": {
                            "term_id": row["id"],
                            "canonical_expansion": row["canonical_expansion"],
                            "term_kind": row["term_kind"],
                            "independent_paper_count": self._term_paper_count_with_db(db, row["id"]),
                        },
                        "aliases": [row["canonical_expansion"]] if row["canonical_expansion"] else [],
                    },
                }
            )
        return operations, current

    @staticmethod
    def _term_paper_count_with_db(db: sqlite3.Connection, term_id: int) -> int:
        return int(
            db.execute(
                """
                SELECT COUNT(DISTINCT candidate.canonical_paper_id)
                FROM frontier_term_evidence evidence
                JOIN frontier_candidates candidate ON candidate.id=evidence.frontier_candidate_id
                WHERE evidence.term_id=?
                """,
                (term_id,),
            ).fetchone()[0]
        )

    def _build_coverage_gap_specs_with_db(
        self,
        db: sqlite3.Connection,
        domain: str,
        layer: str,
        batch_id: str = "",
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        candidates = db.execute("SELECT domains_json FROM frontier_candidates").fetchall()
        candidate_count = sum(domain in self._editor_json(row["domains_json"], []) for row in candidates)
        paper_rows = db.execute("SELECT * FROM canonical_papers").fetchall()
        domain_paper_ids = {row["id"] for row in paper_rows if domain in self._paper_domains_from_row(row)}
        anchor_count = int(
            db.execute(
                """
                SELECT COUNT(DISTINCT canonical_paper_id) FROM paper_analyses
                WHERE status IN ('partial','completed')
                """,
            ).fetchone()[0]
        )
        if domain != "cross":
            anchor_count = len(
                {
                    row["canonical_paper_id"]
                    for row in db.execute(
                        "SELECT canonical_paper_id FROM paper_analyses WHERE status IN ('partial','completed')"
                    ).fetchall()
                    if row["canonical_paper_id"] in domain_paper_ids
                }
            )
        entity_count = int(
            db.execute(
                """
                SELECT COUNT(*) FROM knowledge_entities
                WHERE status<>'merged' AND json_extract(metadata_json, '$.domains') LIKE ?
                """,
                (f"%{domain}%",),
            ).fetchone()[0]
        )
        relationship_count = int(
            db.execute("SELECT COUNT(*) FROM knowledge_relationships WHERE status='active'").fetchone()[0]
        )
        metrics = {
            "candidate_count": candidate_count,
            "paper_count": len(domain_paper_ids),
            "anchor_count": anchor_count,
            "entity_count": entity_count,
            "relationship_count": relationship_count,
        }
        if layer == "candidate_ingest":
            missing = candidate_count == 0
            label = f"{domain} 来源候选覆盖"
            description = "该方向尚无扫描候选；请检查公开来源配置或扩大查询范围。" if missing else "来源候选已进入 Atlas，但仍需编辑筛选。"
            severity = "high" if missing else "low"
        elif layer == "anchor_depth":
            missing = anchor_count == 0
            label = f"{domain} 深度锚点覆盖"
            description = "该方向没有已完成或部分完成的深度档案，无法支撑方法层综合。" if missing else "已有深度档案，可从锚点继续扩展。"
            severity = "high" if missing else "medium" if anchor_count < 3 else "low"
        else:
            missing = relationship_count == 0
            label = f"{domain} 关系审核覆盖"
            description = "尚无已激活的实体关系；需要编辑确认方法、问题与论文之间的关系。" if missing else "已有关系记录，但仍需检查候选关系和反证。"
            severity = "high" if missing else "medium"
        status = "open" if missing or severity in {"medium", "high"} else "resolved"
        gap = {
            "id": "",
            "domain": domain,
            "layer": layer,
            "label": label,
            "description": description,
            "severity": severity,
            "status": status,
            "metrics": metrics,
            "sourceBatchId": batch_id,
        }
        current_row = db.execute(
            "SELECT * FROM coverage_gaps WHERE domain=? AND layer=? AND label=?",
            (domain, layer, label),
        ).fetchone()
        return self._coverage_gap_from_row(current_row) if current_row else {}, gap

    def _upsert_coverage_gap_with_db(
        self,
        db: sqlite3.Connection,
        gap: dict[str, Any],
        *,
        batch_id: str = "",
    ) -> dict[str, Any]:
        domain = compact_text(gap.get("domain"), 40)
        layer = compact_text(gap.get("layer"), 80)
        label = compact_text(gap.get("label"), 240)
        if not domain or not layer or not label:
            raise AtlasError("覆盖缺口缺少 domain、layer 或 label")
        now = utc_now()
        db.execute(
            """
            INSERT INTO coverage_gaps(
                id, domain, layer, label, description, severity, status, metrics_json,
                source_batch_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(domain, layer, label) DO UPDATE SET
                description=excluded.description, severity=excluded.severity, status=excluded.status,
                metrics_json=excluded.metrics_json, source_batch_id=excluded.source_batch_id,
                updated_at=excluded.updated_at
            """,
            (
                compact_text(gap.get("id"), 160) or str(uuid.uuid4()),
                domain,
                layer,
                label,
                clean_multiline_text(gap.get("description"), 3000),
                compact_text(gap.get("severity") or "medium", 20),
                compact_text(gap.get("status") or "open", 20),
                json.dumps(gap.get("metrics") or {}, ensure_ascii=False, sort_keys=True),
                compact_text(batch_id or gap.get("sourceBatchId"), 80) or None,
                now,
                now,
            ),
        )
        row = db.execute(
            "SELECT * FROM coverage_gaps WHERE domain=? AND layer=? AND label=?",
            (domain, layer, label),
        ).fetchone()
        assert row is not None
        return self._coverage_gap_from_row(row)

    def _build_batch_proposal_with_db(
        self,
        db: sqlite3.Connection,
        batch: sqlite3.Row,
        item: sqlite3.Row,
    ) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
        batch_kind = batch["batch_kind"]
        if item["item_kind"] == "paper":
            paper_id = int(item["item_ref"])
            current_paper_entity, paper_entity = self._paper_entity_snapshot_with_db(db, paper_id)
            if batch_kind == "l1_structure":
                proposed = {
                    "operation": "upsert_entity",
                    "ref_key": "paper",
                    "entity": paper_entity,
                }
                current = {"entity": current_paper_entity}
                comparison = {"entity": paper_entity}
                return current, proposed, self._diff_values(current, comparison)
            if batch_kind == "l2_anchor":
                paper_row = db.execute("SELECT * FROM canonical_papers WHERE id=?", (paper_id,)).fetchone()
                assert paper_row is not None
                analysis = db.execute(
                    """
                    SELECT * FROM paper_analyses
                    WHERE canonical_paper_id=? AND status IN ('partial','completed')
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (paper_id,),
                ).fetchone()
                term_operations, current_terms = self._term_operations_for_paper_with_db(db, paper_id)
                operations: list[dict[str, Any]] = [
                    {"operation": "upsert_entity", "ref_key": "paper", "entity": paper_entity},
                    *term_operations,
                ]
                for operation in term_operations:
                    operations.append(
                        {
                            "operation": "upsert_relationship",
                            "from_ref_key": "paper",
                            "to_ref_key": operation["ref_key"],
                            "relationship": {
                                "relationType": "uses",
                                "status": "candidate",
                                "evidence": [
                                    {
                                        "label": "作者术语语境",
                                        "sourceRef": operation["entity"]["sourceRef"],
                                        "direction": "supports",
                                    }
                                ],
                                "sourceKind": "frontier_term_evidence",
                                "sourceRef": paper_row["canonical_ref"],
                            },
                        }
                    )
                if analysis is None:
                    domain = self._paper_domains_from_row(paper_row)[0]
                    current_gap, gap = self._build_coverage_gap_specs_with_db(db, domain, "anchor_depth", batch["id"])
                    gap["description"] = f"论文“{paper_row['title'] or paper_row['canonical_ref']}”尚无可读深度档案，不能自动提升为方法锚点。"
                    operations.append({"operation": "upsert_gap", "gap": gap})
                proposed = {
                    "operation": "operations",
                    "anchor": {
                        "paper_id": paper_id,
                        "canonical_ref": paper_row["canonical_ref"],
                        "analysis_status": analysis["status"] if analysis else "missing",
                    },
                    "operations": operations,
                }
                current = {
                    "paper_entity": current_paper_entity,
                    "term_entities": current_terms,
                    "analysis_status": analysis["status"] if analysis else "missing",
                }
                comparison = {
                    "paper_entity": paper_entity,
                    "term_entities": [operation["entity"] for operation in term_operations],
                    "analysis_status": analysis["status"] if analysis else "missing",
                }
                return current, proposed, self._diff_values(current, comparison)
        if item["item_kind"] == "entity" and batch_kind == "recompute":
            entity = db.execute("SELECT * FROM knowledge_entities WHERE id=?", (item["item_ref"],)).fetchone()
            if entity is None:
                raise NotFoundError("重算目标实体不存在")
            current = self._entity_snapshot(entity)
            proposed_entity = {
                **current,
                "entityKind": current["entity_kind"],
                "canonicalName": current["canonical_name"],
                "sourceKind": current["source_kind"],
                "sourceRef": current["source_ref"],
                "metadata": {
                    **current["metadata"],
                    "recompute": {
                        "model": batch["model"],
                        "prompt_version": batch["prompt_version"],
                        "requested_at": utc_now(),
                    },
                },
            }
            proposed = {
                "operation": "recompute_entity",
                "review_guard": bool(entity["reviewed_at"]),
                "entity": proposed_entity,
            }
            return current, proposed, self._diff_values(current, self._entity_snapshot_for_diff(proposed_entity))
        if item["item_kind"] == "coverage" and batch_kind == "coverage_scan":
            domain, separator, layer = item["item_ref"].partition(":")
            if not separator:
                raise AtlasError("覆盖缺口批量项格式无效")
            current, gap = self._build_coverage_gap_specs_with_db(db, domain, layer, batch["id"])
            proposed = {"operation": "upsert_gap", "gap": gap}
            return current, proposed, self._diff_values(current, gap)
        raise AtlasError("批量类型与目标不匹配")

    @staticmethod
    def _entity_snapshot_for_diff(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": payload.get("id") or "",
            "entity_kind": payload.get("entityKind") or payload.get("entity_kind") or "",
            "canonical_name": payload.get("canonicalName") or payload.get("canonical_name") or "",
            "description": payload.get("description") or "",
            "status": payload.get("status") or "candidate",
            "source_kind": payload.get("sourceKind") or payload.get("source_kind") or "editor",
            "source_ref": payload.get("sourceRef") or payload.get("source_ref") or "",
            "metadata": payload.get("metadata") or {},
            "revision": payload.get("revision") or 1,
            "reviewed_at": payload.get("reviewed_at") or payload.get("reviewedAt"),
            "merged_into_id": payload.get("merged_into_id") or payload.get("mergedIntoId"),
        }

    def create_editor_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        batch_kind = compact_text(payload.get("batchKind") or payload.get("batch_kind"), 40)
        if batch_kind not in BATCH_KINDS:
            raise AtlasError("批量作业类型无效")
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        scope = self._editor_scope(payload)
        dry_run = payload.get("dryRun", payload.get("dry_run", True))
        if not isinstance(dry_run, bool):
            raise AtlasError("dryRun 必须是布尔值")
        model = compact_text(payload.get("model"), 240)
        prompt_version = compact_text(payload.get("promptVersion") or payload.get("prompt_version"), 120)
        if batch_kind == "recompute" and (not model or not prompt_version):
            raise AtlasError("重算作业必须记录 model 和 promptVersion")
        with self._lock, self.connect() as db:
            targets = self._batch_items_for_scope(db, batch_kind, scope)
            batch_id = str(uuid.uuid4())
            now = utc_now()
            status = "queued" if targets else "completed"
            db.execute(
                """
                INSERT INTO editor_batches(
                    id, batch_kind, scope_json, status, dry_run, requested_by, reason,
                    model, prompt_version, total_items, pending_items, estimated_work,
                    created_at, finished_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    batch_kind,
                    json.dumps(scope, ensure_ascii=False, sort_keys=True),
                    status,
                    int(dry_run),
                    actor,
                    reason,
                    model,
                    prompt_version,
                    len(targets),
                    len(targets),
                    float(len(targets)),
                    now,
                    now if not targets else None,
                    now,
                ),
            )
            for item_kind, item_ref in targets:
                db.execute(
                    """
                    INSERT INTO editor_batch_items(
                        id, batch_id, item_kind, item_ref, status, attempt, model,
                        prompt_version, estimated_work, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, 1, ?, ?)
                    """,
                    (str(uuid.uuid4()), batch_id, item_kind, item_ref, model, prompt_version, now, now),
                )
            row = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
            assert row is not None
            result = self._batch_from_row(db, row, include_items=True)
            self._record_editor_audit(
                db,
                "batch_created",
                actor,
                entity_kind="batch",
                entity_id=batch_id,
                batch_id=batch_id,
                after=result,
                reason=reason,
                model=model,
                prompt_version=prompt_version,
            )
            return result

    def list_editor_batches(self, limit: int = 50, status: str = "") -> list[dict[str, Any]]:
        safe_limit = max(1, min(200, int(limit)))
        normalized_status = compact_text(status, 30)
        if normalized_status and normalized_status not in BATCH_STATUS:
            raise AtlasError("批量作业状态无效")
        with self.connect() as db:
            if normalized_status:
                rows = db.execute(
                    "SELECT * FROM editor_batches WHERE status=? ORDER BY updated_at DESC LIMIT ?",
                    (normalized_status, safe_limit),
                ).fetchall()
            else:
                rows = db.execute(
                    "SELECT * FROM editor_batches ORDER BY updated_at DESC LIMIT ?",
                    (safe_limit,),
                ).fetchall()
            return [self._batch_from_row(db, row) for row in rows]

    def get_editor_batch(self, batch_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM editor_batches WHERE id=?", (compact_text(batch_id, 80),)).fetchone()
            if row is None:
                raise NotFoundError("批量作业不存在")
            return self._batch_from_row(db, row, include_items=True)

    @staticmethod
    def _batch_item_ids(payload: dict[str, Any]) -> list[str]:
        raw = payload.get("itemIds") if "itemIds" in payload else payload.get("item_ids")
        if raw is None:
            return []
        if not isinstance(raw, list):
            raise AtlasError("itemIds must be an array")
        result: list[str] = []
        seen: set[str] = set()
        for value in raw[:EDITOR_BATCH_MAX_ITEMS]:
            item_id = compact_text(value, 80)
            if item_id and item_id not in seen:
                result.append(item_id)
                seen.add(item_id)
        return result

    @staticmethod
    def _batch_item_rows_with_status(
        db: sqlite3.Connection,
        batch_id: str,
        statuses: tuple[str, ...],
        item_ids: list[str] | None = None,
    ) -> list[sqlite3.Row]:
        values: list[Any] = [batch_id, *statuses]
        status_placeholders = ",".join("?" for _ in statuses)
        filters = [f"status IN ({status_placeholders})"]
        selected = item_ids or []
        if selected:
            filters.append(f"id IN ({','.join('?' for _ in selected)})")
            values.extend(selected)
        return db.execute(
            f"""
            SELECT * FROM editor_batch_items
            WHERE batch_id=? AND {' AND '.join(filters)}
            ORDER BY created_at, id
            """,
            values,
        ).fetchall()

    def preview_editor_batch(self, batch_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = payload or {}
        actor = self._editor_actor(payload)
        requested_items = self._batch_item_ids(payload)
        batch_id = compact_text(batch_id, 80)
        started_clock = time.perf_counter()
        with self._lock, self.connect() as db:
            batch = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
            if batch is None:
                raise NotFoundError("Batch does not exist")
            if batch["status"] in {"paused", "cancelled"}:
                raise ConflictError(f"A {batch['status']} batch cannot be previewed")
            if batch["status"] in {"running", "previewing"}:
                raise ConflictError("Batch is already being processed")
            reason = self._editor_reason(payload) or batch["reason"]
            before = self._batch_from_row(db, batch, include_items=True)
            items = self._batch_item_rows_with_status(db, batch_id, ("pending",), requested_items)
            if requested_items and len(items) != len(requested_items):
                found = {item["id"] for item in items}
                missing = [item_id for item_id in requested_items if item_id not in found]
                raise ConflictError(f"Items are not pending in this batch: {', '.join(missing)}")
            if not items:
                if batch["status"] in {"previewed", "partial", "completed", "failed"}:
                    return before
                raise ConflictError("Batch has no pending items to preview")
            now = utc_now()
            db.execute(
                """
                UPDATE editor_batches
                SET status='previewing', started_at=COALESCE(started_at, ?), finished_at=NULL,
                    updated_at=?, error_text=''
                WHERE id=?
                """,
                (now, now, batch_id),
            )
            for item in items:
                item_before = self._batch_item_from_row(item)
                item_started = utc_now()
                db.execute(
                    """
                    UPDATE editor_batch_items
                    SET status='running', started_at=COALESCE(started_at, ?), finished_at=NULL,
                        updated_at=?, error_text=''
                    WHERE id=?
                    """,
                    (item_started, item_started, item["id"]),
                )
                running_item = db.execute(
                    "SELECT * FROM editor_batch_items WHERE id=?",
                    (item["id"],),
                ).fetchone()
                assert running_item is not None
                try:
                    current, proposed, diff = self._build_batch_proposal_with_db(db, batch, running_item)
                    current_json = json.dumps(current, ensure_ascii=False, sort_keys=True)
                    proposed_json = json.dumps(proposed, ensure_ascii=False, sort_keys=True)
                    source_hash = hashlib.sha256(
                        json.dumps(
                            {"current": current, "proposed": proposed},
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                        ).encode("utf-8")
                    ).hexdigest()
                    item_status = "proposed" if diff else "skipped"
                    decision = "" if diff else "no_change"
                    finished_at = None if diff else utc_now()
                    db.execute(
                        """
                        UPDATE editor_batch_items
                        SET status=?, current_json=?, proposed_json=?, diff_json=?, decision=?,
                            decision_reason=?, source_sha256=?, actual_work=actual_work+estimated_work,
                            finished_at=?, updated_at=?, error_text=''
                        WHERE id=?
                        """,
                        (
                            item_status,
                            current_json,
                            proposed_json,
                            json.dumps(diff, ensure_ascii=False, sort_keys=True),
                            decision,
                            "No material change" if not diff else "",
                            source_hash,
                            finished_at,
                            utc_now(),
                            item["id"],
                        ),
                    )
                    item_after_row = db.execute(
                        "SELECT * FROM editor_batch_items WHERE id=?",
                        (item["id"],),
                    ).fetchone()
                    assert item_after_row is not None
                    self._record_editor_audit(
                        db,
                        "batch_item_proposed",
                        actor,
                        entity_kind=item["item_kind"],
                        entity_id=item["item_ref"],
                        batch_id=batch_id,
                        before=item_before,
                        after=self._batch_item_from_row(item_after_row),
                        reason=reason,
                        model=batch["model"],
                        prompt_version=batch["prompt_version"],
                        work_units=float(item["estimated_work"] or 0),
                    )
                except Exception as error:
                    error_text = compact_text(str(error), 4000) or error.__class__.__name__
                    failed_at = utc_now()
                    db.execute(
                        """
                        UPDATE editor_batch_items
                        SET status='failed', actual_work=actual_work+estimated_work,
                            finished_at=?, updated_at=?, error_text=?
                        WHERE id=?
                        """,
                        (failed_at, failed_at, error_text, item["id"]),
                    )
                    failed_row = db.execute(
                        "SELECT * FROM editor_batch_items WHERE id=?",
                        (item["id"],),
                    ).fetchone()
                    assert failed_row is not None
                    self._record_editor_audit(
                        db,
                        "batch_item_failed",
                        actor,
                        entity_kind=item["item_kind"],
                        entity_id=item["item_ref"],
                        batch_id=batch_id,
                        before=item_before,
                        after=self._batch_item_from_row(failed_row),
                        reason=error_text,
                        model=batch["model"],
                        prompt_version=batch["prompt_version"],
                        work_units=float(item["estimated_work"] or 0),
                    )
            elapsed_ms = max(0, int((time.perf_counter() - started_clock) * 1000))
            db.execute(
                "UPDATE editor_batches SET duration_ms=duration_ms+?, updated_at=? WHERE id=?",
                (elapsed_ms, utc_now(), batch_id),
            )
            refreshed = self._recount_editor_batch_with_db(db, batch_id)
            result = self._batch_from_row(db, refreshed, include_items=True)
            self._record_editor_audit(
                db,
                "batch_previewed",
                actor,
                entity_kind="batch",
                entity_id=batch_id,
                batch_id=batch_id,
                before=before,
                after=result,
                reason=reason,
                model=batch["model"],
                prompt_version=batch["prompt_version"],
                work_units=sum(float(item["estimated_work"] or 0) for item in items),
            )
            return result

    def decide_editor_batch_item(
        self,
        batch_id: str,
        item_id: str,
        decision: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        normalized_decision = compact_text(decision, 20).lower()
        if normalized_decision not in {"approve", "reject"}:
            raise AtlasError("Batch item decision must be approve or reject")
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        batch_id = compact_text(batch_id, 80)
        item_id = compact_text(item_id, 80)
        target_status = "approved" if normalized_decision == "approve" else "rejected"
        audit_action = "batch_item_approved" if normalized_decision == "approve" else "batch_item_rejected"
        with self._lock, self.connect() as db:
            batch = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
            if batch is None:
                raise NotFoundError("Batch does not exist")
            if batch["status"] in {"paused", "cancelled", "completed"}:
                raise ConflictError(f"Items in a {batch['status']} batch cannot be reviewed")
            item = db.execute(
                "SELECT * FROM editor_batch_items WHERE id=? AND batch_id=?",
                (item_id, batch_id),
            ).fetchone()
            if item is None:
                raise NotFoundError("Batch item does not exist")
            if item["status"] == target_status:
                return self._batch_item_from_row(item)
            allowed = {"proposed"} if target_status == "approved" else {"proposed", "approved"}
            if item["status"] not in allowed:
                raise ConflictError(f"A {item['status']} item cannot be {target_status}")
            before = self._batch_item_from_row(item)
            now = utc_now()
            db.execute(
                """
                UPDATE editor_batch_items
                SET status=?, decision=?, decision_reason=?, finished_at=?, updated_at=?
                WHERE id=?
                """,
                (
                    target_status,
                    target_status,
                    reason,
                    now if target_status == "rejected" else None,
                    now,
                    item_id,
                ),
            )
            updated = db.execute("SELECT * FROM editor_batch_items WHERE id=?", (item_id,)).fetchone()
            assert updated is not None
            result = self._batch_item_from_row(updated)
            self._record_editor_audit(
                db,
                audit_action,
                actor,
                entity_kind=item["item_kind"],
                entity_id=item["item_ref"],
                batch_id=batch_id,
                before=before,
                after=result,
                reason=reason,
                model=batch["model"],
                prompt_version=batch["prompt_version"],
            )
            self._recount_editor_batch_with_db(db, batch_id)
            return result

    def _apply_batch_proposal_with_db(
        self,
        db: sqlite3.Connection,
        batch: sqlite3.Row,
        item: sqlite3.Row,
        *,
        actor: str,
        reason: str,
    ) -> dict[str, Any]:
        proposed = self._editor_json(item["proposed_json"], {})
        if not isinstance(proposed, dict) or not proposed.get("operation"):
            raise AtlasError("Batch item does not contain an applicable proposal")
        references: dict[str, str] = {}
        applied: list[dict[str, Any]] = []

        def apply_operation(operation: dict[str, Any]) -> None:
            operation_kind = compact_text(operation.get("operation"), 40)
            if operation_kind in {"upsert_entity", "recompute_entity"}:
                entity_payload = operation.get("entity")
                if not isinstance(entity_payload, dict):
                    raise AtlasError("Entity proposal is invalid")
                entity = self._upsert_editor_entity_with_db(
                    db,
                    entity_payload,
                    actor=actor,
                    reason=reason,
                    batch_id=batch["id"],
                    allow_reviewed_overwrite=True,
                )
                ref_key = compact_text(operation.get("ref_key"), 160)
                if ref_key:
                    references[ref_key] = entity["id"]
                applied.append({"operation": operation_kind, "entity": entity})
                return
            if operation_kind == "upsert_relationship":
                relationship_payload = operation.get("relationship")
                if not isinstance(relationship_payload, dict):
                    raise AtlasError("Relationship proposal is invalid")
                relationship_payload = dict(relationship_payload)
                from_ref = compact_text(operation.get("from_ref_key"), 160)
                to_ref = compact_text(operation.get("to_ref_key"), 160)
                if from_ref:
                    if from_ref not in references:
                        raise AtlasError(f"Unresolved relationship source reference: {from_ref}")
                    relationship_payload["fromEntityId"] = references[from_ref]
                if to_ref:
                    if to_ref not in references:
                        raise AtlasError(f"Unresolved relationship target reference: {to_ref}")
                    relationship_payload["toEntityId"] = references[to_ref]
                relationship = self._upsert_relationship_with_db(
                    db,
                    relationship_payload,
                    actor=actor,
                    reason=reason,
                    batch_id=batch["id"],
                    allow_reviewed_overwrite=True,
                )
                applied.append({"operation": operation_kind, "relationship": relationship})
                return
            if operation_kind == "upsert_gap":
                gap_payload = operation.get("gap")
                if not isinstance(gap_payload, dict):
                    raise AtlasError("Coverage proposal is invalid")
                gap = self._upsert_coverage_gap_with_db(db, gap_payload, batch_id=batch["id"])
                applied.append({"operation": operation_kind, "gap": gap})
                return
            raise AtlasError(f"Unsupported batch proposal operation: {operation_kind}")

        if proposed["operation"] == "operations":
            operations = proposed.get("operations")
            if not isinstance(operations, list):
                raise AtlasError("Batch proposal operations must be an array")
            for operation in operations:
                if not isinstance(operation, dict):
                    raise AtlasError("Batch proposal operation must be an object")
                apply_operation(operation)
        else:
            apply_operation(proposed)
        return {"references": references, "applied": applied}

    def apply_editor_batch(self, batch_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = payload or {}
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        requested_items = self._batch_item_ids(payload)
        batch_id = compact_text(batch_id, 80)
        started_clock = time.perf_counter()
        with self._lock, self.connect() as db:
            batch = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
            if batch is None:
                raise NotFoundError("Batch does not exist")
            if batch["status"] in {"paused", "cancelled", "completed", "previewing", "running"}:
                raise ConflictError(f"A {batch['status']} batch cannot be applied")
            items = self._batch_item_rows_with_status(db, batch_id, ("approved",), requested_items)
            if requested_items and len(items) != len(requested_items):
                found = {item["id"] for item in items}
                missing = [item_id for item_id in requested_items if item_id not in found]
                raise ConflictError(f"Items are not approved in this batch: {', '.join(missing)}")
            if not items:
                raise ConflictError("Batch has no approved items to apply")
            before = self._batch_from_row(db, batch, include_items=True)
            now = utc_now()
            db.execute(
                """
                UPDATE editor_batches
                SET status='running', dry_run=0, started_at=COALESCE(started_at, ?),
                    finished_at=NULL, updated_at=?, error_text=''
                WHERE id=?
                """,
                (now, now, batch_id),
            )
            applied_work = 0.0
            for item in items:
                item_before = self._batch_item_from_row(item)
                item_reason = item["decision_reason"] or reason
                db.execute("SAVEPOINT editor_batch_item_apply")
                try:
                    item_started = utc_now()
                    db.execute(
                        """
                        UPDATE editor_batch_items
                        SET status='running', started_at=COALESCE(started_at, ?),
                            finished_at=NULL, updated_at=?, error_text=''
                        WHERE id=?
                        """,
                        (item_started, item_started, item["id"]),
                    )
                    running_item = db.execute(
                        "SELECT * FROM editor_batch_items WHERE id=?",
                        (item["id"],),
                    ).fetchone()
                    assert running_item is not None
                    self._apply_batch_proposal_with_db(
                        db,
                        batch,
                        running_item,
                        actor=actor,
                        reason=item_reason,
                    )
                    completed_at = utc_now()
                    db.execute(
                        """
                        UPDATE editor_batch_items
                        SET status='completed', decision='applied', finished_at=?, updated_at=?, error_text=''
                        WHERE id=?
                        """,
                        (completed_at, completed_at, item["id"]),
                    )
                    db.execute("RELEASE SAVEPOINT editor_batch_item_apply")
                    applied_work += float(item["estimated_work"] or 0)
                except Exception as error:
                    db.execute("ROLLBACK TO SAVEPOINT editor_batch_item_apply")
                    db.execute("RELEASE SAVEPOINT editor_batch_item_apply")
                    error_text = compact_text(str(error), 4000) or error.__class__.__name__
                    failed_at = utc_now()
                    db.execute(
                        """
                        UPDATE editor_batch_items
                        SET status='failed', finished_at=?, updated_at=?, error_text=?
                        WHERE id=?
                        """,
                        (failed_at, failed_at, error_text, item["id"]),
                    )
                    failed_row = db.execute(
                        "SELECT * FROM editor_batch_items WHERE id=?",
                        (item["id"],),
                    ).fetchone()
                    assert failed_row is not None
                    self._record_editor_audit(
                        db,
                        "batch_item_failed",
                        actor,
                        entity_kind=item["item_kind"],
                        entity_id=item["item_ref"],
                        batch_id=batch_id,
                        before=item_before,
                        after=self._batch_item_from_row(failed_row),
                        reason=error_text,
                        model=batch["model"],
                        prompt_version=batch["prompt_version"],
                    )
            elapsed_ms = max(0, int((time.perf_counter() - started_clock) * 1000))
            db.execute(
                "UPDATE editor_batches SET duration_ms=duration_ms+?, updated_at=? WHERE id=?",
                (elapsed_ms, utc_now(), batch_id),
            )
            refreshed = self._recount_editor_batch_with_db(db, batch_id)
            result = self._batch_from_row(db, refreshed, include_items=True)
            self._record_editor_audit(
                db,
                "batch_applied",
                actor,
                entity_kind="batch",
                entity_id=batch_id,
                batch_id=batch_id,
                before=before,
                after=result,
                reason=reason,
                model=batch["model"],
                prompt_version=batch["prompt_version"],
                work_units=applied_work,
            )
            return result

    def transition_editor_batch(
        self,
        batch_id: str,
        action: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = payload or {}
        normalized_action = compact_text(action, 20).lower()
        if normalized_action not in {"pause", "resume", "cancel", "retry"}:
            raise AtlasError("Unknown batch transition")
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        requested_items = self._batch_item_ids(payload)
        batch_id = compact_text(batch_id, 80)
        with self._lock, self.connect() as db:
            batch = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
            if batch is None:
                raise NotFoundError("Batch does not exist")
            before = self._batch_from_row(db, batch, include_items=True)
            now = utc_now()
            if normalized_action == "pause":
                if batch["status"] in {"paused", "cancelled", "completed", "failed"}:
                    if batch["status"] == "paused":
                        return before
                    raise ConflictError(f"A {batch['status']} batch cannot be paused")
                db.execute(
                    """
                    UPDATE editor_batch_items
                    SET status=CASE WHEN proposed_json<>'{}' THEN 'proposed' ELSE 'pending' END,
                        updated_at=?
                    WHERE batch_id=? AND status='running'
                    """,
                    (now, batch_id),
                )
                db.execute(
                    "UPDATE editor_batches SET status='paused', paused_at=?, updated_at=? WHERE id=?",
                    (now, now, batch_id),
                )
            elif normalized_action == "resume":
                if batch["status"] != "paused":
                    raise ConflictError("Only a paused batch can be resumed")
                db.execute(
                    """
                    UPDATE editor_batches
                    SET status='queued', paused_at=NULL, finished_at=NULL, updated_at=?, error_text=''
                    WHERE id=?
                    """,
                    (now, batch_id),
                )
                self._recount_editor_batch_with_db(db, batch_id)
            elif normalized_action == "cancel":
                if batch["status"] == "cancelled":
                    return before
                if batch["status"] == "completed":
                    raise ConflictError("A completed batch cannot be cancelled")
                db.execute(
                    """
                    UPDATE editor_batch_items
                    SET status='skipped', decision='cancelled', decision_reason=?,
                        finished_at=COALESCE(finished_at, ?), updated_at=?
                    WHERE batch_id=? AND status IN ('pending','running','proposed','approved')
                    """,
                    (reason, now, now, batch_id),
                )
                db.execute(
                    """
                    UPDATE editor_batches
                    SET status='cancelled', finished_at=COALESCE(finished_at, ?), updated_at=?
                    WHERE id=?
                    """,
                    (now, now, batch_id),
                )
                self._recount_editor_batch_with_db(db, batch_id)
            else:
                if batch["status"] in {"paused", "cancelled"}:
                    raise ConflictError(f"A {batch['status']} batch cannot be retried")
                failed_items = self._batch_item_rows_with_status(db, batch_id, ("failed",), requested_items)
                if requested_items and len(failed_items) != len(requested_items):
                    found = {item["id"] for item in failed_items}
                    missing = [item_id for item_id in requested_items if item_id not in found]
                    raise ConflictError(f"Items are not failed in this batch: {', '.join(missing)}")
                if not failed_items:
                    raise ConflictError("Batch has no failed items to retry")
                item_ids = [item["id"] for item in failed_items]
                placeholders = ",".join("?" for _ in item_ids)
                db.execute(
                    f"""
                    UPDATE editor_batch_items
                    SET status='pending', attempt=attempt+1, current_json='{{}}', proposed_json='{{}}',
                        diff_json='[]', decision='', decision_reason='', source_sha256='',
                        started_at=NULL, finished_at=NULL, updated_at=?, error_text=''
                    WHERE batch_id=? AND id IN ({placeholders})
                    """,
                    (now, batch_id, *item_ids),
                )
                db.execute(
                    """
                    UPDATE editor_batches
                    SET status='queued', finished_at=NULL, paused_at=NULL, updated_at=?, error_text=''
                    WHERE id=?
                    """,
                    (now, batch_id),
                )
                self._recount_editor_batch_with_db(db, batch_id)
            refreshed = db.execute("SELECT * FROM editor_batches WHERE id=?", (batch_id,)).fetchone()
            assert refreshed is not None
            result = self._batch_from_row(db, refreshed, include_items=True)
            self._record_editor_audit(
                db,
                {
                    "pause": "batch_paused",
                    "resume": "batch_resumed",
                    "cancel": "batch_cancelled",
                    "retry": "batch_retried",
                }[normalized_action],
                actor,
                entity_kind="batch",
                entity_id=batch_id,
                batch_id=batch_id,
                before=before,
                after=result,
                reason=reason,
                model=batch["model"],
                prompt_version=batch["prompt_version"],
            )
            return result

    def list_editor_coverage(
        self,
        limit: int = 100,
        status: str = "",
        domain: str = "",
        severity: str = "",
    ) -> list[dict[str, Any]]:
        safe_limit = max(1, min(500, int(limit)))
        filters: list[str] = []
        values: list[Any] = []
        for column, value, maximum in (
            ("status", status, 20),
            ("domain", domain, 40),
            ("severity", severity, 20),
        ):
            normalized = compact_text(value, maximum).lower()
            if normalized:
                filters.append(f"{column}=?")
                values.append(normalized)
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        values.append(safe_limit)
        with self.connect() as db:
            rows = db.execute(
                f"""
                SELECT * FROM coverage_gaps {where}
                ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                         updated_at DESC
                LIMIT ?
                """,
                values,
            ).fetchall()
            return [self._coverage_gap_from_row(row) for row in rows]

    def recompute_editor_coverage(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        scope = self._editor_scope(payload)
        domains = clean_string_list(scope.get("domains") or ["embodied", "llm"], 40, 3)
        layers = clean_string_list(
            scope.get("layers") or ["candidate_ingest", "anchor_depth", "relationship_review"],
            80,
            4,
        )
        valid_domains = {"embodied", "llm", "cross"}
        valid_layers = {"candidate_ingest", "anchor_depth", "relationship_review"}
        if not domains or any(domain not in valid_domains for domain in domains):
            raise AtlasError("Coverage scope contains an invalid domain")
        if not layers or any(layer not in valid_layers for layer in layers):
            raise AtlasError("Coverage scope contains an invalid layer")
        with self._lock, self.connect() as db:
            before = [
                self._coverage_gap_from_row(row)
                for row in db.execute("SELECT * FROM coverage_gaps ORDER BY domain, layer").fetchall()
            ]
            result: list[dict[str, Any]] = []
            for domain in domains:
                for layer in layers:
                    _current, gap = self._build_coverage_gap_specs_with_db(db, domain, layer)
                    result.append(self._upsert_coverage_gap_with_db(db, gap))
            self._record_editor_audit(
                db,
                "coverage_recomputed",
                actor,
                entity_kind="coverage",
                before=before,
                after={"gap_count": len(result), "items": result},
                reason=reason,
                work_units=float(len(result)),
            )
            return result

    @staticmethod
    def _phase8_json_sha(value: Any) -> str:
        canonical = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _phase8_score(value: Any, field: str) -> float | None:
        if value is None or value == "":
            return None
        try:
            score = float(value)
        except (TypeError, ValueError) as error:
            raise AtlasError(f"{field} must be a number between 0 and 1") from error
        if score < 0 or score > 1:
            raise AtlasError(f"{field} must be a number between 0 and 1")
        return score

    @staticmethod
    def _phase8_exact_locator(evidence: dict[str, Any]) -> bool:
        return any(
            evidence.get(key)
            for key in EVIDENCE_LOCATOR_FIELDS
        )

    @staticmethod
    def _phase8_locator_fields(value: Any, field: str) -> list[str]:
        if not isinstance(value, list):
            raise AtlasError(f"{field} must be an array")
        normalized: list[str] = []
        seen: set[str] = set()
        for raw in value:
            key = compact_text(raw, 40)
            if key not in EVIDENCE_LOCATOR_FIELDS:
                raise AtlasError(f"{field} contains an invalid locator field")
            if key not in seen:
                seen.add(key)
                normalized.append(key)
        return normalized

    @staticmethod
    def _phase8_operation_response(
        result: dict[str, Any], key: str, replay: bool
    ) -> dict[str, Any]:
        return {
            **result,
            "idempotent_replay": replay,
            "idempotency_key": key,
        }

    def _claim_from_row(
        self,
        db: sqlite3.Connection,
        row: sqlite3.Row,
        *,
        public: bool = False,
    ) -> dict[str, Any]:
        paper_row = db.execute(
            "SELECT * FROM canonical_papers WHERE id=?",
            (row["canonical_paper_id"],),
        ).fetchone()
        if paper_row is None:
            raise AtlasError("scientific claim points to a missing paper")
        paper = self._paper_from_row(db, paper_row)
        evidence_items: list[dict[str, Any]] = []
        for raw in json.loads(row["evidence_json"] or "[]"):
            if not isinstance(raw, dict):
                continue
            locator = {
                "kind": "paper",
                "canonical_paper_ref": paper["canonical_ref"],
                "paperfield_id": paper.get("paperfield_id", ""),
                "url": raw.get("source_url") or paper.get("source_url", ""),
                "page": raw.get("page"),
                "section": raw.get("section", ""),
                "figure": raw.get("figure", ""),
                "table": raw.get("table", ""),
                "equation": raw.get("equation", ""),
                "quote": raw.get("quote", ""),
                "content_sha256": raw.get("source_sha256") or row["source_sha256"],
            }
            locator = {key: value for key, value in locator.items() if value not in (None, "")}
            evidence_items.append(
                {
                    "evidence_id": raw.get("evidence_id", ""),
                    "label": raw.get("label", ""),
                    "direction": raw.get("direction", "supports"),
                    "source_locator": locator,
                    "paperfield_path": self._paperfield_path(
                        paper, raw.get("page"), raw
                    ),
                }
            )
        result = {
            "id": row["id"],
            "title": row["title"],
            "statement": row["statement"],
            "source_kind": row["source_kind"],
            "source_basis": row["source_basis"],
            "source_sha256": row["source_sha256"],
            "paper_version": row["paper_version"],
            "dossier_claim_id": row["dossier_claim_id"],
            "paper": {
                "id": paper["id"],
                "canonical_ref": paper["canonical_ref"],
                "paperfield_id": paper.get("paperfield_id", ""),
                "title": paper["title"],
                "published": paper.get("published", ""),
                "paperfield_path": self._paperfield_path(paper),
            },
            "evidence": evidence_items,
            "insufficient_information": json.loads(
                row["insufficient_information_json"] or "[]"
            ),
            "created_at": row["created_at"],
        }
        if not public:
            result.update(
                {
                    "owner_id": row["owner_id"],
                    "analysis_request_id": row["analysis_request_id"],
                    "stage_key": row["stage_key"],
                    "stage_attempt": int(row["stage_attempt"]),
                    "model": row["model"],
                    "prompt_version": row["prompt_version"],
                    "claim_sha256": row["claim_sha256"],
                }
            )
        return result

    def import_dossier_claims(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        task_id = compact_text(
            payload.get("analysisRequestId") or payload.get("analysis_request_id"),
            160,
        )
        try:
            paper_id = int(payload.get("paperId") or payload.get("paper_id") or 0)
        except (TypeError, ValueError) as error:
            raise AtlasError("paperId must be an integer") from error
        if not task_id and paper_id <= 0:
            raise AtlasError("analysisRequestId or paperId is required")

        with self._lock, self.connect() as db:
            if task_id:
                task = db.execute(
                    "SELECT * FROM analysis_requests WHERE id=? AND owner_id=?",
                    (task_id, owner_id),
                ).fetchone()
            else:
                task = db.execute(
                    """
                    SELECT * FROM analysis_requests
                    WHERE canonical_paper_id=? AND owner_id=?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (paper_id, owner_id),
                ).fetchone()
            if task is None:
                raise NotFoundError("analysis request does not exist")
            analysis = db.execute(
                "SELECT * FROM paper_analyses WHERE analysis_request_id=? AND owner_id=?",
                (task["id"], owner_id),
            ).fetchone()
            if analysis is None:
                raise NotFoundError("the analysis request has no dossier to import")

            request_identity = {
                "analysis_request_id": task["id"],
                "dossier_id": analysis["id"],
                "dossier_updated_at": analysis["updated_at"],
            }
            request_hash = self._operation_request_hash("claim_import", request_identity)
            prior = self._lookup_operation_idempotency(
                db, owner_id, "claim_import", key, request_hash
            )
            if prior is not None:
                run = db.execute(
                    "SELECT response_json FROM claim_import_runs WHERE id=? AND owner_id=?",
                    (prior["resource_id"], owner_id),
                ).fetchone()
                if run is None:
                    raise AtlasError("claim import idempotency record is incomplete")
                return self._phase8_operation_response(
                    json.loads(run["response_json"]), key, True
                )

            content = json.loads(analysis["content_json"] or "{}")
            paper_row = db.execute(
                "SELECT * FROM canonical_papers WHERE id=?",
                (task["canonical_paper_id"],),
            ).fetchone()
            if paper_row is None:
                raise AtlasError("dossier points to a missing paper")
            paper_version = compact_text(
                task["source_version"] or paper_row["current_version"] or "unversioned",
                160,
            )
            prepared: list[dict[str, Any]] = []
            for stage_key, stage in content.items():
                if not isinstance(stage, dict):
                    continue
                source_basis = compact_text(stage.get("source_basis"), 40)
                source_sha256 = compact_text(stage.get("source_sha256"), 64).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
                    raise AtlasError(
                        f"stage {stage_key} has no valid source SHA-256; claims were not imported"
                    )
                try:
                    attempt = max(1, int(stage.get("attempt") or 1))
                except (TypeError, ValueError) as error:
                    raise AtlasError(f"stage {stage_key} has an invalid attempt") from error
                for section in stage.get("sections") or []:
                    if not isinstance(section, dict):
                        continue
                    source_kind = compact_text(section.get("source_kind"), 40)
                    if source_kind not in {
                        "paper_claim",
                        "platform_derivation",
                        "insufficient_information",
                    }:
                        continue
                    statement = clean_multiline_text(section.get("body"), 30000)
                    dossier_claim_id = compact_text(section.get("claim_id"), 160)
                    if not statement or not dossier_claim_id:
                        raise AtlasError(f"stage {stage_key} contains an incomplete claim")
                    raw_evidence = section.get("evidence") or []
                    if not isinstance(raw_evidence, list):
                        raise AtlasError(f"claim {dossier_claim_id} evidence must be an array")
                    normalized_evidence: list[dict[str, Any]] = []
                    for raw in raw_evidence:
                        if not isinstance(raw, dict):
                            raise AtlasError(f"claim {dossier_claim_id} has invalid evidence")
                        evidence = dict(raw)
                        evidence_hash = compact_text(
                            evidence.get("source_sha256") or source_sha256, 64
                        ).lower()
                        if not re.fullmatch(r"[a-f0-9]{64}", evidence_hash):
                            raise AtlasError(
                                f"claim {dossier_claim_id} has evidence without a source SHA-256"
                            )
                        evidence["source_sha256"] = evidence_hash
                        if not self._phase8_exact_locator(evidence):
                            raise AtlasError(
                                f"claim {dossier_claim_id} has evidence without an exact locator"
                            )
                        normalized_evidence.append(evidence)
                    if source_kind != "insufficient_information" and not normalized_evidence:
                        raise AtlasError(
                            f"claim {dossier_claim_id} has no exact evidence locator"
                        )
                    insufficient = (
                        [{"statement": statement, "stage": stage_key}]
                        if source_kind == "insufficient_information"
                        else []
                    )
                    immutable = {
                        "canonical_paper_id": int(task["canonical_paper_id"]),
                        "paper_version": paper_version,
                        "analysis_request_id": task["id"],
                        "stage_key": stage_key,
                        "stage_attempt": attempt,
                        "dossier_claim_id": dossier_claim_id,
                        "title": compact_text(section.get("title"), 300),
                        "statement": statement,
                        "source_kind": source_kind,
                        "source_basis": source_basis,
                        "evidence": normalized_evidence,
                        "insufficient_information": insufficient,
                        "source_sha256": source_sha256,
                        "model": compact_text(stage.get("model"), 240),
                        "prompt_version": compact_text(stage.get("prompt_version"), 120),
                    }
                    claim_hash = self._phase8_json_sha(immutable)
                    prepared.append(
                        {
                            **immutable,
                            "claim_sha256": claim_hash,
                            "id": str(
                                uuid.uuid5(
                                    uuid.NAMESPACE_URL,
                                    f"research-atlas:scientific-claim:{owner_id}:{claim_hash}",
                                )
                            ),
                        }
                    )
            if not prepared:
                raise AtlasError("the dossier has no source-bounded claims to import")

            created = 0
            claim_ids: list[str] = []
            now = utc_now()
            for item in prepared:
                cursor = db.execute(
                    """
                    INSERT OR IGNORE INTO scientific_claims(
                        id, owner_id, canonical_paper_id, paper_version, analysis_request_id,
                        stage_key, stage_attempt, dossier_claim_id, title, statement,
                        source_kind, source_basis, evidence_json,
                        insufficient_information_json, source_sha256, model,
                        prompt_version, claim_sha256, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item["id"], owner_id, item["canonical_paper_id"], item["paper_version"],
                        item["analysis_request_id"], item["stage_key"],
                        item["stage_attempt"], item["dossier_claim_id"], item["title"],
                        item["statement"], item["source_kind"], item["source_basis"],
                        json.dumps(item["evidence"], ensure_ascii=False, sort_keys=True),
                        json.dumps(
                            item["insufficient_information"],
                            ensure_ascii=False,
                            sort_keys=True,
                        ),
                        item["source_sha256"], item["model"], item["prompt_version"],
                        item["claim_sha256"], now,
                    ),
                )
                created += int(cursor.rowcount > 0)
                stored = db.execute(
                    "SELECT id FROM scientific_claims WHERE claim_sha256=? AND owner_id=?",
                    (item["claim_sha256"], owner_id),
                ).fetchone()
                assert stored is not None
                claim_ids.append(stored["id"])

            rows = [
                db.execute(
                    "SELECT * FROM scientific_claims WHERE id=? AND owner_id=?",
                    (claim_id, owner_id),
                ).fetchone()
                for claim_id in claim_ids
            ]
            result = {
                "analysis_request_id": task["id"],
                "dossier_id": analysis["id"],
                "created": created,
                "reused": len(rows) - created,
                "claims": [
                    self._claim_from_row(db, row)
                    for row in rows
                    if row is not None
                ],
            }
            run_id = str(uuid.uuid4())
            db.execute(
                """
                INSERT INTO claim_import_runs(
                    id, owner_id, analysis_request_id, request_sha256,
                    response_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id, owner_id, task["id"], request_hash,
                    json.dumps(result, ensure_ascii=False, sort_keys=True), now,
                ),
            )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'claim_import', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, run_id, now),
                )
            self._record_editor_audit(
                db,
                "claims_imported",
                actor,
                entity_kind="claim_import",
                entity_id=run_id,
                after={
                    "analysis_request_id": task["id"],
                    "created": created,
                    "reused": len(rows) - created,
                    "claim_ids": claim_ids,
                },
                reason=reason,
            )
            return self._phase8_operation_response(result, key, False)

    def list_scientific_claims(
        self,
        *,
        owner_id: str = "local",
        paper_id: int = 0,
        source_kind: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        filters: list[str] = ["owner_id=?"]
        values: list[Any] = [compact_text(owner_id, 120) or "local"]
        if paper_id > 0:
            filters.append("canonical_paper_id=?")
            values.append(paper_id)
        normalized_kind = compact_text(source_kind, 40)
        if normalized_kind:
            if normalized_kind not in CLAIM_SOURCE_KINDS:
                raise AtlasError("invalid claim source kind")
            filters.append("source_kind=?")
            values.append(normalized_kind)
        values.append(max(1, min(500, int(limit))))
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        with self.connect() as db:
            rows = db.execute(
                f"SELECT * FROM scientific_claims {where} ORDER BY created_at DESC LIMIT ?",
                values,
            ).fetchall()
            return [self._claim_from_row(db, row) for row in rows]

    @staticmethod
    def _candidate_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "owner_id": row["owner_id"],
            "left_claim_id": row["left_claim_id"],
            "right_claim_id": row["right_claim_id"],
            "proposed_relation": row["proposed_relation"],
            "reviewed_relation": row["reviewed_relation"],
            "retrieval_score": row["retrieval_score"],
            "model_score": row["model_score"],
            "generator": row["generator"],
            "model": row["model"],
            "prompt_version": row["prompt_version"],
            "request_sha256": row["request_sha256"],
            "status": row["status"],
            "reviewer": row["reviewer"],
            "review_reason": row["review_reason"],
            "reviewed_at": row["reviewed_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "score_boundary": "operational_hint_not_scientific_confidence",
        }

    def create_claim_candidate(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        left_id = compact_text(payload.get("leftClaimId") or payload.get("left_claim_id"), 160)
        right_id = compact_text(payload.get("rightClaimId") or payload.get("right_claim_id"), 160)
        relation = compact_text(
            payload.get("proposedRelation") or payload.get("proposed_relation"), 40
        )
        if not left_id or not right_id or left_id == right_id:
            raise AtlasError("candidate requires two different claim IDs")
        if relation not in CLAIM_RELATION_TYPES:
            raise AtlasError("invalid proposed claim relation")
        request_identity = {
            "left_claim_id": left_id,
            "right_claim_id": right_id,
            "proposed_relation": relation,
            "retrieval_score": self._phase8_score(
                payload.get("retrievalScore", payload.get("retrieval_score")),
                "retrievalScore",
            ),
            "model_score": self._phase8_score(
                payload.get("modelScore", payload.get("model_score")),
                "modelScore",
            ),
            "generator": compact_text(payload.get("generator"), 160),
            "model": compact_text(payload.get("model"), 240),
            "prompt_version": compact_text(
                payload.get("promptVersion") or payload.get("prompt_version"), 120
            ),
        }
        request_hash = self._operation_request_hash("claim_candidate", request_identity)
        now = utc_now()
        with self._lock, self.connect() as db:
            prior = self._lookup_operation_idempotency(
                db, owner_id, "claim_candidate", key, request_hash
            )
            if prior is not None:
                row = db.execute(
                    "SELECT * FROM claim_candidates WHERE id=? AND owner_id=?",
                    (prior["resource_id"], owner_id),
                ).fetchone()
                if row is None:
                    raise AtlasError("candidate idempotency record is incomplete")
                return self._phase8_operation_response(
                    self._candidate_from_row(row), key, True
                )
            claim_count = db.execute(
                """
                SELECT COUNT(*) AS count FROM scientific_claims
                WHERE owner_id=? AND id IN (?, ?)
                """,
                (owner_id, left_id, right_id),
            ).fetchone()["count"]
            if int(claim_count) != 2:
                raise NotFoundError("one or both scientific claims do not exist")
            existing = db.execute(
                """
                SELECT * FROM claim_candidates
                WHERE owner_id=? AND left_claim_id=? AND right_claim_id=?
                  AND proposed_relation=? AND request_sha256=?
                """,
                (owner_id, left_id, right_id, relation, request_hash),
            ).fetchone()
            if existing is not None:
                return self._phase8_operation_response(
                    self._candidate_from_row(existing), key, True
                )
            candidate_id = (
                self._deterministic_operation_id("claim_candidate", owner_id, key)
                if key
                else str(uuid.uuid4())
            )
            db.execute(
                """
                INSERT INTO claim_candidates(
                    id, owner_id, left_claim_id, right_claim_id,
                    proposed_relation, retrieval_score, model_score, generator,
                    model, prompt_version, request_sha256, status,
                    reviewed_relation, reviewer, review_reason, reviewed_at,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '', NULL, ?, ?)
                """,
                (
                    candidate_id, owner_id, left_id, right_id, relation,
                    request_identity["retrieval_score"], request_identity["model_score"],
                    request_identity["generator"], request_identity["model"],
                    request_identity["prompt_version"], request_hash, now, now,
                ),
            )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'claim_candidate', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, candidate_id, now),
                )
            row = db.execute(
                "SELECT * FROM claim_candidates WHERE id=?", (candidate_id,)
            ).fetchone()
            assert row is not None
            result = self._candidate_from_row(row)
            self._record_editor_audit(
                db,
                "claim_candidate_created",
                actor,
                entity_kind="claim_candidate",
                entity_id=candidate_id,
                after={
                    "left_claim_id": left_id,
                    "right_claim_id": right_id,
                    "proposed_relation": relation,
                    "score_boundary": result["score_boundary"],
                },
                reason=reason,
                model=request_identity["model"],
                prompt_version=request_identity["prompt_version"],
            )
            return self._phase8_operation_response(result, key, False)

    def review_claim_candidate(
        self,
        candidate_id: str,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        raw_decision = compact_text(payload.get("decision") or payload.get("status"), 20)
        decision = {"approve": "approved", "reject": "rejected"}.get(
            raw_decision, raw_decision
        )
        if decision not in {"approved", "rejected"}:
            raise AtlasError("candidate decision must be approved or rejected")
        relation = compact_text(
            payload.get("relationType")
            or payload.get("relation_type")
            or payload.get("reviewedRelation")
            or payload.get("reviewed_relation"),
            40,
        )
        if decision == "approved" and relation not in CLAIM_RELATION_TYPES:
            raise AtlasError("approved candidate requires a reviewed relation type")
        if decision == "rejected":
            relation = ""
        now = utc_now()
        with self._lock, self.connect() as db:
            row = db.execute(
                "SELECT * FROM claim_candidates WHERE id=? AND owner_id=?",
                (candidate_id, owner_id),
            ).fetchone()
            if row is None:
                raise NotFoundError("claim candidate does not exist")
            if row["status"] != "pending":
                if (
                    row["status"] == decision
                    and row["reviewer"] == actor
                    and row["review_reason"] == reason
                    and row["reviewed_relation"] == relation
                ):
                    return self._candidate_from_row(row)
                raise ConflictError("claim candidate has already been reviewed")
            before = self._candidate_from_row(row)
            db.execute(
                """
                UPDATE claim_candidates
                SET status=?, reviewed_relation=?, reviewer=?, review_reason=?,
                    reviewed_at=?, updated_at=?
                WHERE id=?
                """,
                (decision, relation, actor, reason, now, now, candidate_id),
            )
            updated = db.execute(
                "SELECT * FROM claim_candidates WHERE id=?", (candidate_id,)
            ).fetchone()
            assert updated is not None
            result = self._candidate_from_row(updated)
            self._record_editor_audit(
                db,
                "claim_candidate_reviewed",
                actor,
                entity_kind="claim_candidate",
                entity_id=candidate_id,
                before=before,
                after={
                    "status": decision,
                    "reviewed_relation": relation,
                    "scores_used_as": "operational_hints_only",
                },
                reason=reason,
            )
            return result

    def list_claim_candidates(
        self,
        owner_id: str = "local",
        status: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        normalized = compact_text(status, 20)
        if normalized and normalized not in CLAIM_REVIEW_STATUS:
            raise AtlasError("invalid claim candidate status")
        with self.connect() as db:
            if normalized:
                rows = db.execute(
                    """
                    SELECT * FROM claim_candidates
                    WHERE owner_id=? AND status=?
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (owner_id, normalized, max(1, min(500, int(limit)))),
                ).fetchall()
            else:
                rows = db.execute(
                    """
                    SELECT * FROM claim_candidates
                    WHERE owner_id=? ORDER BY created_at DESC LIMIT ?
                    """,
                    (owner_id, max(1, min(500, int(limit)))),
                ).fetchall()
            return [self._candidate_from_row(row) for row in rows]

    @staticmethod
    def _cluster_from_row(
        db: sqlite3.Connection,
        row: sqlite3.Row,
        *,
        include_memberships: bool = True,
    ) -> dict[str, Any]:
        result = {
            "id": row["id"],
            "owner_id": row["owner_id"],
            "label": row["label"],
            "description": row["description"],
            "status": row["status"],
            "created_by": row["created_by"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        if include_memberships:
            memberships = db.execute(
                """
                SELECT * FROM claim_cluster_memberships
                WHERE cluster_id=? ORDER BY created_at, id
                """,
                (row["id"],),
            ).fetchall()
            result["memberships"] = [
                {
                    "id": item["id"],
                    "cluster_id": item["cluster_id"],
                    "claim_id": item["claim_id"],
                    "candidate_id": item["candidate_id"],
                    "relation_type": item["relation_type"],
                    "status": item["status"],
                    "reviewer": item["reviewer"],
                    "review_reason": item["review_reason"],
                    "reviewed_at": item["reviewed_at"],
                    "created_at": item["created_at"],
                    "updated_at": item["updated_at"],
                }
                for item in memberships
            ]
        return result

    def create_claim_cluster(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        label = compact_text(payload.get("label") or payload.get("name"), 300)
        description = clean_multiline_text(payload.get("description"), 8000)
        if not label:
            raise AtlasError("claim cluster label is required")
        identity = {"label": label, "description": description}
        request_hash = self._operation_request_hash("claim_cluster", identity)
        now = utc_now()
        with self._lock, self.connect() as db:
            prior = self._lookup_operation_idempotency(
                db, owner_id, "claim_cluster", key, request_hash
            )
            if prior is not None:
                row = db.execute(
                    "SELECT * FROM claim_clusters WHERE id=? AND owner_id=?",
                    (prior["resource_id"], owner_id),
                ).fetchone()
                if row is None:
                    raise AtlasError("claim cluster idempotency record is incomplete")
                return self._phase8_operation_response(
                    self._cluster_from_row(db, row), key, True
                )
            cluster_id = (
                self._deterministic_operation_id("claim_cluster", owner_id, key)
                if key
                else str(uuid.uuid4())
            )
            db.execute(
                """
                INSERT INTO claim_clusters(
                    id, owner_id, label, description, status,
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'candidate', ?, ?, ?)
                """,
                (cluster_id, owner_id, label, description, actor, now, now),
            )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'claim_cluster', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, cluster_id, now),
                )
            row = db.execute(
                "SELECT * FROM claim_clusters WHERE id=?", (cluster_id,)
            ).fetchone()
            assert row is not None
            result = self._cluster_from_row(db, row)
            self._record_editor_audit(
                db,
                "claim_cluster_created",
                actor,
                entity_kind="claim_cluster",
                entity_id=cluster_id,
                after={"label": label, "status": "candidate"},
                reason=reason,
            )
            return self._phase8_operation_response(result, key, False)

    def list_claim_clusters(
        self,
        owner_id: str = "local",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT * FROM claim_clusters WHERE owner_id=?
                ORDER BY updated_at DESC LIMIT ?
                """,
                (owner_id, max(1, min(500, int(limit)))),
            ).fetchall()
            return [self._cluster_from_row(db, row) for row in rows]

    def create_claim_membership(
        self,
        cluster_id: str,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        claim_id = compact_text(payload.get("claimId") or payload.get("claim_id"), 160)
        candidate_id = compact_text(
            payload.get("candidateId") or payload.get("candidate_id"), 160
        )
        relation = compact_text(
            payload.get("relationType") or payload.get("relation_type"), 40
        )
        if relation not in CLAIM_RELATION_TYPES:
            raise AtlasError("invalid claim membership relation type")
        identity = {
            "cluster_id": cluster_id,
            "claim_id": claim_id,
            "candidate_id": candidate_id,
            "relation_type": relation,
        }
        request_hash = self._operation_request_hash("claim_membership", identity)
        now = utc_now()
        with self._lock, self.connect() as db:
            prior = self._lookup_operation_idempotency(
                db, owner_id, "claim_membership", key, request_hash
            )
            if prior is not None:
                row = db.execute(
                    "SELECT * FROM claim_cluster_memberships WHERE id=?",
                    (prior["resource_id"],),
                ).fetchone()
                if row is None:
                    raise AtlasError("claim membership idempotency record is incomplete")
                return self._phase8_operation_response(dict(row), key, True)
            cluster = db.execute(
                "SELECT * FROM claim_clusters WHERE id=? AND owner_id=?",
                (cluster_id, owner_id),
            ).fetchone()
            if cluster is None:
                raise NotFoundError("claim cluster does not exist")
            if cluster["status"] == "retired":
                raise ConflictError("retired claim cluster cannot gain memberships")
            candidate = db.execute(
                "SELECT * FROM claim_candidates WHERE id=? AND owner_id=?",
                (candidate_id, owner_id),
            ).fetchone()
            if candidate is None:
                raise NotFoundError("claim candidate does not exist")
            if claim_id not in {candidate["left_claim_id"], candidate["right_claim_id"]}:
                raise AtlasError("membership claim is not part of the candidate relation")
            claim = db.execute(
                "SELECT 1 FROM scientific_claims WHERE id=? AND owner_id=?",
                (claim_id, owner_id),
            ).fetchone()
            if claim is None:
                raise NotFoundError("membership claim does not exist for this owner")
            existing = db.execute(
                """
                SELECT * FROM claim_cluster_memberships
                WHERE cluster_id=? AND claim_id=? AND candidate_id=?
                """,
                (cluster_id, claim_id, candidate_id),
            ).fetchone()
            if existing is not None:
                return self._phase8_operation_response(dict(existing), key, True)
            membership_id = (
                self._deterministic_operation_id("claim_membership", owner_id, key)
                if key
                else str(uuid.uuid4())
            )
            db.execute(
                """
                INSERT INTO claim_cluster_memberships(
                    id, cluster_id, claim_id, candidate_id, relation_type,
                    status, reviewer, review_reason, reviewed_at,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'pending', '', '', NULL, ?, ?)
                """,
                (membership_id, cluster_id, claim_id, candidate_id, relation, now, now),
            )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'claim_membership', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, membership_id, now),
                )
            row = db.execute(
                "SELECT * FROM claim_cluster_memberships WHERE id=?",
                (membership_id,),
            ).fetchone()
            assert row is not None
            result = dict(row)
            self._record_editor_audit(
                db,
                "claim_membership_created",
                actor,
                entity_kind="claim_membership",
                entity_id=membership_id,
                after={**identity, "status": "pending"},
                reason=reason,
            )
            return self._phase8_operation_response(result, key, False)

    def review_claim_membership(
        self,
        membership_id: str,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        raw_decision = compact_text(payload.get("decision") or payload.get("status"), 20)
        decision = {"approve": "approved", "reject": "rejected"}.get(
            raw_decision, raw_decision
        )
        if decision not in {"approved", "rejected"}:
            raise AtlasError("membership decision must be approved or rejected")
        now = utc_now()
        with self._lock, self.connect() as db:
            row = db.execute(
                """
                SELECT m.*, c.owner_id FROM claim_cluster_memberships m
                JOIN claim_clusters c ON c.id=m.cluster_id
                WHERE m.id=? AND c.owner_id=?
                """,
                (membership_id, owner_id),
            ).fetchone()
            if row is None:
                raise NotFoundError("claim membership does not exist")
            if row["status"] != "pending":
                if (
                    row["status"] == decision
                    and row["reviewer"] == actor
                    and row["review_reason"] == reason
                ):
                    return dict(row)
                raise ConflictError("claim membership has already been reviewed")
            candidate = db.execute(
                "SELECT * FROM claim_candidates WHERE id=? AND owner_id=?",
                (row["candidate_id"], owner_id),
            ).fetchone()
            if decision == "approved":
                if candidate is None or candidate["status"] != "approved":
                    raise ConflictError(
                        "membership cannot be approved before its candidate relation"
                    )
                if row["relation_type"] != candidate["reviewed_relation"]:
                    raise ConflictError(
                        "membership relation does not match the human-reviewed relation"
                    )
            db.execute(
                """
                UPDATE claim_cluster_memberships
                SET status=?, reviewer=?, review_reason=?, reviewed_at=?, updated_at=?
                WHERE id=?
                """,
                (decision, actor, reason, now, now, membership_id),
            )
            if decision == "approved":
                db.execute(
                    "UPDATE claim_clusters SET status='active', updated_at=? WHERE id=?",
                    (now, row["cluster_id"]),
                )
            updated = db.execute(
                "SELECT * FROM claim_cluster_memberships WHERE id=?",
                (membership_id,),
            ).fetchone()
            assert updated is not None
            result = dict(updated)
            self._record_editor_audit(
                db,
                "claim_membership_reviewed",
                actor,
                entity_kind="claim_membership",
                entity_id=membership_id,
                before={"status": "pending"},
                after={"status": decision, "relation_type": row["relation_type"]},
                reason=reason,
            )
            return result

    @staticmethod
    def _thread_slug(value: Any) -> str:
        slug = compact_text(value, 120).casefold().strip("-")
        slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
        if not slug or len(slug) < 3:
            raise AtlasError("thread slug must contain at least three ASCII letters or digits")
        return slug

    def _thread_claim_rows(
        self,
        db: sqlite3.Connection,
        thread_id: str,
        revision: int,
    ) -> list[sqlite3.Row]:
        return db.execute(
            """
            SELECT tc.*, c.*, tc.position AS thread_position,
                   tc.role AS thread_role, tc.cluster_id AS thread_cluster_id,
                   tc.membership_id AS thread_membership_id
            FROM research_thread_claims tc
            JOIN scientific_claims c ON c.id=tc.claim_id
            WHERE tc.thread_id=? AND tc.revision=?
            ORDER BY tc.position
            """,
            (thread_id, revision),
        ).fetchall()

    def _thread_relation_rows(
        self,
        db: sqlite3.Connection,
        thread_id: str,
        revision: int,
    ) -> list[sqlite3.Row]:
        return db.execute(
            """
            SELECT tr.*, cc.status AS candidate_status,
                   cc.reviewer AS candidate_reviewer,
                   cc.review_reason AS candidate_review_reason,
                   cc.retrieval_score, cc.model_score, cc.generator,
                   cc.model, cc.prompt_version
            FROM research_thread_relations tr
            JOIN claim_candidates cc ON cc.id=tr.candidate_id
            WHERE tr.thread_id=? AND tr.revision=?
            ORDER BY tr.position
            """,
            (thread_id, revision),
        ).fetchall()

    def _thread_revision_from_row(
        self,
        db: sqlite3.Connection,
        thread: sqlite3.Row,
        revision_row: sqlite3.Row,
        *,
        public: bool = False,
    ) -> dict[str, Any]:
        revision = int(revision_row["revision"])
        revision_id = f"{thread['id']}:{revision}"
        competing_routes = self._validate_thread_public_array(
            revision_id, "competing_routes_json", revision_row["competing_routes_json"], 30, 2000
        )
        counter_evidence = self._validate_thread_public_array(
            revision_id, "counter_evidence_json", revision_row["counter_evidence_json"], 50, 4000
        )
        known_unknowns = self._validate_thread_public_array(
            revision_id, "known_unknowns_json", revision_row["known_unknowns_json"], 50, 4000
        )
        representative_papers = self._validate_thread_public_array(
            revision_id, "representative_papers_json", revision_row["representative_papers_json"], 100, 500
        )
        try:
            delta = json.loads(revision_row["delta_json"] or "{}")
        except (TypeError, ValueError, json.JSONDecodeError) as error:
            raise AtlasError(f"thread revision {revision_id} has invalid delta JSON") from error
        if not isinstance(delta, dict):
            raise AtlasError(f"thread revision {revision_id} delta must be a JSON object")
        claim_rows = self._thread_claim_rows(db, thread["id"], revision)
        relation_rows = self._thread_relation_rows(db, thread["id"], revision)
        claims: list[dict[str, Any]] = []
        for row in claim_rows:
            claim = self._claim_from_row(db, row, public=public)
            claims.append(
                {
                    "position": int(row["thread_position"]),
                    "role": row["thread_role"],
                    "cluster_id": row["thread_cluster_id"],
                    "membership_id": row["thread_membership_id"],
                    "claim": claim,
                }
            )
        relations = [
            {
                "position": int(row["position"]),
                "relation_id": row["candidate_id"],
                "left_claim_id": row["left_claim_id"],
                "right_claim_id": row["right_claim_id"],
                "relation_type": row["relation_type"],
                **(
                    {}
                    if public
                    else {
                        "reviewer": row["candidate_reviewer"],
                        "review_reason": row["candidate_review_reason"],
                        "operational_hints": {
                            "retrieval_score": row["retrieval_score"],
                            "model_score": row["model_score"],
                            "generator": row["generator"],
                            "model": row["model"],
                            "prompt_version": row["prompt_version"],
                            "boundary": "not_scientific_confidence",
                        },
                    }
                ),
            }
            for row in relation_rows
        ]
        result = {
            "id": thread["id"],
            "slug": thread["slug"],
            "revision": revision,
            "title": revision_row["title"],
            "problem_statement": revision_row["problem_statement"],
            "change_summary": revision_row["change_summary"],
            "why_it_matters": revision_row["why_it_matters"],
            "competing_routes": competing_routes,
            "counter_evidence": counter_evidence,
            "known_unknowns": known_unknowns,
            "representative_papers": representative_papers,
            "delta": delta,
            "content_sha256": revision_row["content_sha256"],
            "status": revision_row["status"],
            "created_at": revision_row["created_at"],
            "published_at": revision_row["published_at"],
            "retracted_at": revision_row["retracted_at"],
            "claims": claims,
            "relations": relations,
            "evidence_boundary": {
                "claims": "exact_paper_locators_and_source_hashes",
                "relations": "human_reviewed_only",
                "priority_or_consensus_claimed": False,
            },
        }
        if not public:
            result.update(
                {
                    "owner_id": thread["owner_id"],
                    "created_by": thread["created_by"],
                    "reviewer": revision_row["reviewer"],
                    "review_reason": revision_row["review_reason"],
                    "current_published_revision": thread["current_published_revision"],
                }
            )
        return result

    def create_research_thread(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        slug = self._thread_slug(payload.get("slug"))
        identity = {"slug": slug}
        request_hash = self._operation_request_hash("research_thread", identity)
        now = utc_now()
        with self._lock, self.connect() as db:
            prior = self._lookup_operation_idempotency(
                db, owner_id, "research_thread", key, request_hash
            )
            if prior is not None:
                row = db.execute(
                    "SELECT * FROM research_threads WHERE id=? AND owner_id=?",
                    (prior["resource_id"], owner_id),
                ).fetchone()
                if row is None:
                    raise AtlasError("research thread idempotency record is incomplete")
                return self._phase8_operation_response(
                    {
                        "id": row["id"],
                        "slug": row["slug"],
                        "owner_id": row["owner_id"],
                        "current_published_revision": row["current_published_revision"],
                        "created_by": row["created_by"],
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"],
                    },
                    key,
                    True,
                )
            duplicate = db.execute(
                "SELECT id FROM research_threads WHERE slug=?", (slug,)
            ).fetchone()
            if duplicate is not None:
                raise ConflictError("research thread slug already exists")
            thread_id = (
                self._deterministic_operation_id("research_thread", owner_id, key)
                if key
                else str(uuid.uuid4())
            )
            db.execute(
                """
                INSERT INTO research_threads(
                    id, slug, owner_id, current_published_revision,
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, NULL, ?, ?, ?)
                """,
                (thread_id, slug, owner_id, actor, now, now),
            )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'research_thread', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, thread_id, now),
                )
            result = {
                "id": thread_id,
                "slug": slug,
                "owner_id": owner_id,
                "current_published_revision": None,
                "created_by": actor,
                "created_at": now,
                "updated_at": now,
            }
            self._record_editor_audit(
                db,
                "research_thread_created",
                actor,
                entity_kind="research_thread",
                entity_id=thread_id,
                after={"slug": slug},
                reason=reason,
            )
            return self._phase8_operation_response(result, key, False)

    def list_research_threads(
        self,
        owner_id: str = "local",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT * FROM research_threads WHERE owner_id=?
                ORDER BY updated_at DESC LIMIT ?
                """,
                (owner_id, max(1, min(500, int(limit)))),
            ).fetchall()
            result: list[dict[str, Any]] = []
            for row in rows:
                revisions = db.execute(
                    """
                    SELECT revision, title, status, content_sha256, created_at,
                           published_at, retracted_at
                    FROM research_thread_revisions
                    WHERE thread_id=? ORDER BY revision DESC
                    """,
                    (row["id"],),
                ).fetchall()
                result.append(
                    {
                        "id": row["id"],
                        "slug": row["slug"],
                        "owner_id": row["owner_id"],
                        "current_published_revision": row["current_published_revision"],
                        "created_by": row["created_by"],
                        "created_at": row["created_at"],
                        "updated_at": row["updated_at"],
                        "revisions": [dict(item) for item in revisions],
                    }
                )
            return result

    def _resolve_thread(
        self,
        db: sqlite3.Connection,
        reference: str,
        owner_id: str | None = None,
    ) -> sqlite3.Row:
        if owner_id is None:
            row = db.execute(
                "SELECT * FROM research_threads WHERE id=? OR slug=?",
                (reference, reference),
            ).fetchone()
        else:
            row = db.execute(
                """
                SELECT * FROM research_threads
                WHERE owner_id=? AND (id=? OR slug=?)
                """,
                (owner_id, reference, reference),
            ).fetchone()
        if row is None:
            raise NotFoundError("research thread does not exist")
        return row

    def get_research_thread(
        self,
        reference: str,
        owner_id: str = "local",
        revision: int = 0,
    ) -> dict[str, Any]:
        with self.connect() as db:
            thread = self._resolve_thread(db, reference, owner_id)
            if revision > 0:
                revision_row = db.execute(
                    """
                    SELECT * FROM research_thread_revisions
                    WHERE thread_id=? AND revision=?
                    """,
                    (thread["id"], revision),
                ).fetchone()
            else:
                revision_row = db.execute(
                    """
                    SELECT * FROM research_thread_revisions
                    WHERE thread_id=? ORDER BY revision DESC LIMIT 1
                    """,
                    (thread["id"],),
                ).fetchone()
            if revision_row is None:
                return {
                    "id": thread["id"],
                    "slug": thread["slug"],
                    "owner_id": thread["owner_id"],
                    "current_published_revision": thread["current_published_revision"],
                    "created_by": thread["created_by"],
                    "created_at": thread["created_at"],
                    "updated_at": thread["updated_at"],
                    "revision": None,
                }
            return self._thread_revision_from_row(db, thread, revision_row)

    def _normalize_thread_revision(
        self,
        db: sqlite3.Connection,
        thread: sqlite3.Row,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
        title = compact_text(payload.get("title"), 500)
        problem_statement = clean_multiline_text(
            payload.get("problemStatement") or payload.get("problem_statement"), 20000
        )
        change_summary = clean_multiline_text(
            payload.get("changeSummary") or payload.get("change_summary"), 12000
        )
        why_it_matters = clean_multiline_text(
            payload.get("whyItMatters") or payload.get("why_it_matters"), 20000
        )
        if not all((title, problem_statement, change_summary, why_it_matters)):
            raise AtlasError(
                "thread revision requires title, problemStatement, changeSummary, and whyItMatters"
            )
        arrays = {}
        for camel, snake, maximum, item_maximum in (
            ("competingRoutes", "competing_routes", 30, 2000),
            ("counterEvidence", "counter_evidence", 50, 4000),
            ("knownUnknowns", "known_unknowns", 50, 4000),
            ("representativePapers", "representative_papers", 100, 500),
        ):
            raw = payload.get(camel, payload.get(snake, []))
            if not isinstance(raw, list):
                raise AtlasError(f"{camel} must be an array")
            normalized: list[str] = []
            seen: set[str] = set()
            for item in raw:
                if not isinstance(item, str):
                    raise AtlasError(f"{camel} entries must be strings")
                value = compact_text(item, item_maximum)
                key = value.casefold()
                if value and key not in seen:
                    normalized.append(value)
                    seen.add(key)
                if len(normalized) >= maximum:
                    break
            arrays[snake] = normalized

        raw_claims = payload.get("claims")
        if not isinstance(raw_claims, list) or not raw_claims:
            raise AtlasError("thread revision requires at least one reviewed claim")
        claims: list[dict[str, Any]] = []
        seen_claims: set[tuple[str, str]] = set()
        for position, raw in enumerate(raw_claims[:200], start=1):
            if not isinstance(raw, dict):
                raise AtlasError("thread claim entries must be objects")
            claim_id = compact_text(raw.get("claimId") or raw.get("claim_id"), 160)
            cluster_id = compact_text(raw.get("clusterId") or raw.get("cluster_id"), 160)
            membership_id = compact_text(
                raw.get("membershipId") or raw.get("membership_id"), 160
            )
            role = compact_text(raw.get("role"), 40)
            if role not in THREAD_CLAIM_ROLES:
                raise AtlasError("thread claim has an invalid role")
            if (claim_id, role) in seen_claims:
                raise AtlasError("thread revision contains a duplicate claim role")
            membership = db.execute(
                """
                SELECT m.*, c.owner_id, c.status AS cluster_status
                FROM claim_cluster_memberships m
                JOIN claim_clusters c ON c.id=m.cluster_id
                WHERE m.id=? AND m.cluster_id=? AND m.claim_id=? AND c.owner_id=?
                """,
                (
                    membership_id,
                    cluster_id,
                    claim_id,
                    thread["owner_id"],
                ),
            ).fetchone()
            if membership is None or membership["status"] != "approved":
                raise ConflictError(
                    "thread claims must reference approved cluster memberships"
                )
            claim = db.execute(
                "SELECT * FROM scientific_claims WHERE id=? AND owner_id=?",
                (claim_id, thread["owner_id"]),
            ).fetchone()
            if claim is None:
                raise NotFoundError("thread claim does not exist")
            if claim["source_kind"] == "insufficient_information":
                raise ConflictError(
                    "insufficient-information records cannot be published as claims"
                )
            evidence = json.loads(claim["evidence_json"] or "[]")
            if not evidence or not all(
                isinstance(item, dict)
                and self._phase8_exact_locator(item)
                and re.fullmatch(
                    r"[a-f0-9]{64}",
                    compact_text(item.get("source_sha256"), 64).lower(),
                )
                for item in evidence
            ):
                raise ConflictError(
                    "thread claims require exact locators and source hashes"
                )
            seen_claims.add((claim_id, role))
            claims.append(
                {
                    "position": position,
                    "claim_id": claim_id,
                    "cluster_id": cluster_id,
                    "membership_id": membership_id,
                    "role": role,
                }
            )

        raw_relations = payload.get("relations", [])
        if not isinstance(raw_relations, list):
            raise AtlasError("thread relations must be an array")
        relations: list[dict[str, Any]] = []
        seen_candidates: set[str] = set()
        claim_ids = {item["claim_id"] for item in claims}
        for position, raw in enumerate(raw_relations[:400], start=1):
            if not isinstance(raw, dict):
                raise AtlasError("thread relation entries must be objects")
            candidate_id = compact_text(
                raw.get("candidateId") or raw.get("candidate_id"), 160
            )
            if not candidate_id or candidate_id in seen_candidates:
                raise AtlasError("thread relation candidate IDs must be unique")
            candidate = db.execute(
                "SELECT * FROM claim_candidates WHERE id=? AND owner_id=?",
                (candidate_id, thread["owner_id"]),
            ).fetchone()
            if candidate is None or candidate["status"] != "approved":
                raise ConflictError(
                    "thread relations must reference approved candidates"
                )
            if (
                candidate["left_claim_id"] not in claim_ids
                or candidate["right_claim_id"] not in claim_ids
            ):
                raise ConflictError(
                    "thread relation endpoints must both be included as thread claims"
                )
            relation = candidate["reviewed_relation"]
            if relation not in CLAIM_RELATION_TYPES:
                raise ConflictError("thread relation has no valid human-reviewed type")
            requested_relation = compact_text(
                raw.get("relationType") or raw.get("relation_type"), 40
            )
            if requested_relation and requested_relation != relation:
                raise ConflictError(
                    "thread relation type differs from the human-reviewed candidate"
                )
            seen_candidates.add(candidate_id)
            relations.append(
                {
                    "position": position,
                    "candidate_id": candidate_id,
                    "left_claim_id": candidate["left_claim_id"],
                    "right_claim_id": candidate["right_claim_id"],
                    "relation_type": relation,
                }
            )

        previous = db.execute(
            """
            SELECT revision, content_sha256, status
            FROM research_thread_revisions
            WHERE thread_id=? ORDER BY revision DESC LIMIT 1
            """,
            (thread["id"],),
        ).fetchone()
        delta = {
            "previous_revision": int(previous["revision"]) if previous else None,
            "previous_content_sha256": previous["content_sha256"] if previous else "",
            "claim_count": len(claims),
            "relation_count": len(relations),
        }
        content = {
            "title": title,
            "problem_statement": problem_statement,
            "change_summary": change_summary,
            "why_it_matters": why_it_matters,
            **arrays,
            "delta": delta,
        }
        return content, claims, relations

    def create_thread_revision(
        self,
        reference: str,
        payload: dict[str, Any],
        owner_id: str = "local",
        *,
        _db: sqlite3.Connection | None = None,
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        lock_scope = contextlib.nullcontext() if _db is not None else self._lock
        connection_scope = (
            contextlib.nullcontext(_db) if _db is not None else self.connect()
        )
        with lock_scope, connection_scope as db:
            thread = self._resolve_thread(db, reference, owner_id)
            content, claims, relations = self._normalize_thread_revision(
                db, thread, payload
            )
            immutable = {
                "thread_id": thread["id"],
                **content,
                "claims": claims,
                "relations": relations,
            }
            content_hash = self._phase8_json_sha(immutable)
            request_hash = self._operation_request_hash("thread_revision", immutable)
            prior = self._lookup_operation_idempotency(
                db, owner_id, "thread_revision", key, request_hash
            )
            if prior is not None:
                try:
                    stored_thread_id, stored_revision = prior["resource_id"].rsplit(":", 1)
                    stored_revision_int = int(stored_revision)
                except (ValueError, AttributeError) as error:
                    raise AtlasError("thread revision idempotency record is invalid") from error
                revision_row = db.execute(
                    """
                    SELECT * FROM research_thread_revisions
                    WHERE thread_id=? AND revision=?
                    """,
                    (stored_thread_id, stored_revision_int),
                ).fetchone()
                if revision_row is None:
                    raise AtlasError("thread revision idempotency record is incomplete")
                return self._phase8_operation_response(
                    self._thread_revision_from_row(db, thread, revision_row), key, True
                )
            duplicate = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND content_sha256=?
                """,
                (thread["id"], content_hash),
            ).fetchone()
            if duplicate is not None:
                return self._phase8_operation_response(
                    self._thread_revision_from_row(db, thread, duplicate), key, True
                )
            revision = int(
                db.execute(
                    """
                    SELECT COALESCE(MAX(revision), 0) + 1 AS revision
                    FROM research_thread_revisions WHERE thread_id=?
                    """,
                    (thread["id"],),
                ).fetchone()["revision"]
            )
            now = utc_now()
            db.execute(
                """
                INSERT INTO research_thread_revisions(
                    thread_id, revision, title, problem_statement, change_summary,
                    why_it_matters, competing_routes_json, counter_evidence_json,
                    known_unknowns_json, representative_papers_json, delta_json,
                    reviewer, review_reason, content_sha256, status, created_at,
                    published_at, retracted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, 'draft', ?, NULL, NULL)
                """,
                (
                    thread["id"], revision, content["title"],
                    content["problem_statement"], content["change_summary"],
                    content["why_it_matters"],
                    json.dumps(content["competing_routes"], ensure_ascii=False, sort_keys=True),
                    json.dumps(content["counter_evidence"], ensure_ascii=False, sort_keys=True),
                    json.dumps(content["known_unknowns"], ensure_ascii=False, sort_keys=True),
                    json.dumps(
                        content["representative_papers"],
                        ensure_ascii=False,
                        sort_keys=True,
                    ),
                    json.dumps(content["delta"], ensure_ascii=False, sort_keys=True),
                    content_hash,
                    now,
                ),
            )
            for item in claims:
                db.execute(
                    """
                    INSERT INTO research_thread_claims(
                        thread_id, revision, position, claim_id,
                        cluster_id, membership_id, role
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        thread["id"], revision, item["position"], item["claim_id"],
                        item["cluster_id"], item["membership_id"], item["role"],
                    ),
                )
            for item in relations:
                db.execute(
                    """
                    INSERT INTO research_thread_relations(
                        thread_id, revision, position, candidate_id,
                        left_claim_id, right_claim_id, relation_type
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        thread["id"], revision, item["position"],
                        item["candidate_id"], item["left_claim_id"],
                        item["right_claim_id"], item["relation_type"],
                    ),
                )
            db.execute(
                "UPDATE research_threads SET updated_at=? WHERE id=?",
                (now, thread["id"]),
            )
            resource_id = f"{thread['id']}:{revision}"
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'thread_revision', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, resource_id, now),
                )
            thread = self._resolve_thread(db, thread["id"], owner_id)
            revision_row = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND revision=?
                """,
                (thread["id"], revision),
            ).fetchone()
            assert revision_row is not None
            result = self._thread_revision_from_row(db, thread, revision_row)
            self._record_editor_audit(
                db,
                "thread_revision_created",
                actor,
                entity_kind="research_thread_revision",
                entity_id=resource_id,
                after={
                    "content_sha256": content_hash,
                    "claim_ids": [item["claim_id"] for item in claims],
                    "relation_ids": [item["candidate_id"] for item in relations],
                },
                reason=reason,
            )
            return self._phase8_operation_response(result, key, False)

    def transition_thread_revision(
        self,
        reference: str,
        revision: int,
        action: str,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        normalized_action = compact_text(action, 20)
        if normalized_action not in {"publish", "retract"}:
            raise AtlasError("thread revision action must be publish or retract")
        now = utc_now()
        with self._lock, self.connect() as db:
            thread = self._resolve_thread(db, reference, owner_id)
            row = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND revision=?
                """,
                (thread["id"], int(revision)),
            ).fetchone()
            if row is None:
                raise NotFoundError("thread revision does not exist")
            if normalized_action == "publish":
                if row["status"] == "published":
                    return self._thread_revision_from_row(db, thread, row)
                if row["status"] != "draft":
                    raise ConflictError("only draft thread revisions can be published")
                claims = self._thread_claim_rows(db, thread["id"], int(revision))
                if not claims:
                    raise ConflictError("empty thread revision cannot be published")
                relations = self._thread_relation_rows(db, thread["id"], int(revision))
                claim_ids = {item["id"] for item in claims}
                for relation in relations:
                    if relation["candidate_status"] != "approved":
                        raise ConflictError("thread contains an unreviewed relation")
                    if (
                        relation["left_claim_id"] not in claim_ids
                        or relation["right_claim_id"] not in claim_ids
                    ):
                        raise ConflictError("thread relation endpoint is missing")
                with self._allow_thread_transition(db):
                    db.execute(
                        """
                        UPDATE research_thread_revisions
                        SET status='published', reviewer=?, review_reason=?, published_at=?
                        WHERE thread_id=? AND revision=?
                        """,
                        (actor, reason, now, thread["id"], int(revision)),
                    )
                db.execute(
                    """
                    UPDATE research_threads
                    SET current_published_revision=?, updated_at=? WHERE id=?
                    """,
                    (int(revision), now, thread["id"]),
                )
                audit_action = "thread_revision_published"
            else:
                if row["status"] == "retracted":
                    return self._thread_revision_from_row(db, thread, row)
                if row["status"] != "published":
                    raise ConflictError("only published thread revisions can be retracted")
                replacement = db.execute(
                    """
                    SELECT revision FROM research_thread_revisions
                    WHERE thread_id=? AND status='published' AND revision<>?
                    ORDER BY revision DESC LIMIT 1
                    """,
                    (thread["id"], int(revision)),
                ).fetchone()
                db.execute(
                    """
                    UPDATE research_threads
                    SET current_published_revision=?, updated_at=? WHERE id=?
                    """,
                    (
                        int(replacement["revision"]) if replacement else None,
                        now,
                        thread["id"],
                    ),
                )
                with self._allow_thread_transition(db):
                    db.execute(
                        """
                        UPDATE research_thread_revisions
                        SET status='retracted', retracted_at=?
                        WHERE thread_id=? AND revision=?
                        """,
                        (now, thread["id"], int(revision)),
                    )
                audit_action = "thread_revision_retracted"
            thread = self._resolve_thread(db, thread["id"], owner_id)
            updated = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND revision=?
                """,
                (thread["id"], int(revision)),
            ).fetchone()
            assert updated is not None
            result = self._thread_revision_from_row(db, thread, updated)
            self._record_editor_audit(
                db,
                audit_action,
                actor,
                entity_kind="research_thread_revision",
                entity_id=f"{thread['id']}:{revision}",
                before={"status": row["status"]},
                after={
                    "status": result["status"],
                    "current_published_revision": thread["current_published_revision"],
                },
                reason=reason,
            )
            return result

    def rollback_thread_revision(
        self,
        reference: str,
        source_revision: int,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        with self._lock, self.connect() as db:
            thread = self._resolve_thread(db, reference, owner_id)
            source = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND revision=?
                """,
                (thread["id"], int(source_revision)),
            ).fetchone()
            if source is None:
                raise NotFoundError("rollback source revision does not exist")
            claims = self._thread_claim_rows(db, thread["id"], int(source_revision))
            relations = self._thread_relation_rows(db, thread["id"], int(source_revision))
            clone_payload = {
                "title": source["title"],
                "problemStatement": source["problem_statement"],
                "changeSummary": f"Rollback from revision {source_revision}: {reason}",
                "whyItMatters": source["why_it_matters"],
                "competingRoutes": json.loads(source["competing_routes_json"] or "[]"),
                "counterEvidence": json.loads(source["counter_evidence_json"] or "[]"),
                "knownUnknowns": json.loads(source["known_unknowns_json"] or "[]"),
                "representativePapers": json.loads(
                    source["representative_papers_json"] or "[]"
                ),
                "claims": [
                    {
                        "claimId": row["id"],
                        "clusterId": row["thread_cluster_id"],
                        "membershipId": row["thread_membership_id"],
                        "role": row["thread_role"],
                    }
                    for row in claims
                ],
                "relations": [
                    {
                        "candidateId": row["candidate_id"],
                        "relationType": row["relation_type"],
                    }
                    for row in relations
                ],
                "editorName": actor,
                "reason": reason,
                "idempotencyKey": self._idempotency_key(payload),
            }
            result = self.create_thread_revision(
                reference, clone_payload, owner_id, _db=db
            )
            self._record_editor_audit(
                db,
                "thread_revision_rolled_back",
                actor,
                entity_kind="research_thread_revision",
                entity_id=f"{result['id']}:{result['revision']}",
                before={"source_revision": int(source_revision)},
                after={
                    "new_revision": result["revision"],
                    "content_sha256": result["content_sha256"],
                },
                reason=reason,
            )
            return result

    def list_public_threads(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT t.*, r.*,
                       t.id AS public_thread_id,
                       t.slug AS public_thread_slug,
                       t.owner_id AS public_thread_owner,
                       t.created_by AS public_thread_creator,
                       t.created_at AS public_thread_created,
                       t.updated_at AS public_thread_updated
                FROM research_threads t
                JOIN research_thread_revisions r
                  ON r.thread_id=t.id AND r.revision=t.current_published_revision
                WHERE r.status='published'
                ORDER BY r.published_at DESC, t.slug
                LIMIT ?
                """,
                (max(1, min(500, int(limit))),),
            ).fetchall()
            items: list[dict[str, Any]] = []
            for row in rows:
                thread = {
                    "id": row["public_thread_id"],
                    "slug": row["public_thread_slug"],
                    "owner_id": row["public_thread_owner"],
                    "current_published_revision": row["revision"],
                    "created_by": row["public_thread_creator"],
                    "created_at": row["public_thread_created"],
                    "updated_at": row["public_thread_updated"],
                }
                items.append(
                    self._thread_revision_from_row(db, thread, row, public=True)
                )
            return items

    def public_research_thread(self, reference: str) -> dict[str, Any]:
        with self.connect() as db:
            thread = self._resolve_thread(db, reference)
            revision = thread["current_published_revision"]
            if revision is None:
                raise NotFoundError("research thread has no published revision")
            row = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND revision=? AND status='published'
                """,
                (thread["id"], int(revision)),
            ).fetchone()
            if row is None:
                raise NotFoundError("published research thread does not exist")
            return self._thread_revision_from_row(db, thread, row, public=True)

    def public_scientific_claim(self, claim_id: str) -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                """
                SELECT DISTINCT c.* FROM scientific_claims c
                JOIN research_thread_claims tc ON tc.claim_id=c.id
                JOIN research_thread_revisions tr
                  ON tr.thread_id=tc.thread_id AND tr.revision=tc.revision
                JOIN research_threads t
                  ON t.id=tr.thread_id AND t.current_published_revision=tr.revision
                WHERE c.id=? AND tr.status='published'
                """,
                (claim_id,),
            ).fetchone()
            if row is None:
                raise NotFoundError("public scientific claim does not exist")
            return self._claim_from_row(db, row, public=True)

    def export_thread_context(
        self,
        reference: str,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        confirmed = payload.get("confirmed")
        if confirmed is not True:
            raise AtlasError("Flowloom thread export requires explicit confirmation")
        requested_revision = payload.get("revision")
        try:
            revision = int(requested_revision or 0)
        except (TypeError, ValueError) as error:
            raise AtlasError("thread export revision must be an integer") from error
        with self.connect() as db:
            thread = self._resolve_thread(db, reference, owner_id)
            selected_revision = revision or int(thread["current_published_revision"] or 0)
            row = db.execute(
                """
                SELECT * FROM research_thread_revisions
                WHERE thread_id=? AND revision=? AND status='published'
                """,
                (thread["id"], selected_revision),
            ).fetchone()
            if row is None:
                raise ConflictError(
                    "only an explicitly selected published thread revision can be exported"
                )
            public_thread = self._thread_revision_from_row(
                db, thread, row, public=True
            )
            context = {
                "schema_version": 1,
                "thread_id": thread["id"],
                "thread_slug": thread["slug"],
                "title": public_thread["title"],
                "revision": selected_revision,
                "content_sha256": public_thread["content_sha256"],
                "published_at": public_thread["published_at"],
                "claims": [
                    {
                        "position": item["position"],
                        "role": item["role"],
                        "claim_id": item["claim"]["id"],
                        "title": item["claim"]["title"],
                        "statement": item["claim"]["statement"],
                        "paper": item["claim"]["paper"],
                        "evidence": item["claim"]["evidence"],
                        "source_sha256": item["claim"]["source_sha256"],
                    }
                    for item in public_thread["claims"]
                ],
                "relations": public_thread["relations"],
                "provenance": {
                    "producer": "research-atlas",
                    "produced_at": utc_now(),
                    "reviewed_revision_only": True,
                },
            }
            self._record_editor_audit(
                db,
                "research_thread_exported",
                actor,
                entity_kind="research_thread_revision",
                entity_id=f"{thread['id']}:{selected_revision}",
                after={
                    "content_sha256": public_thread["content_sha256"],
                    "claim_count": len(context["claims"]),
                    "relation_count": len(context["relations"]),
                    "target": "flowloom",
                },
                reason=reason,
            )
            return context

    def create_claim_golden_item(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        domain = compact_text(payload.get("domain"), 40)
        left_id = compact_text(payload.get("leftClaimId") or payload.get("left_claim_id"), 160)
        right_id = compact_text(payload.get("rightClaimId") or payload.get("right_claim_id"), 160)
        expected_relation = compact_text(
            payload.get("expectedRelation") or payload.get("expected_relation"), 40
        )
        expected_cluster = payload.get("expectedCluster", payload.get("expected_cluster"))
        if domain not in CLAIM_EVAL_DOMAINS:
            raise AtlasError("golden item domain must be llm or embodied")
        if not isinstance(expected_cluster, bool):
            raise AtlasError("expectedCluster must be a boolean")
        if expected_relation not in CLAIM_RELATION_TYPES:
            raise AtlasError("golden item has an invalid expected relation")
        if not left_id or not right_id or left_id == right_id:
            raise AtlasError("golden item requires two different claims")
        locators = self._phase8_locator_fields(
            payload.get("expectedLocators", payload.get("expected_locators", [])),
            "expectedLocators",
        )
        with self._lock, self.connect() as db:
            count = db.execute(
                """
                SELECT COUNT(*) AS count FROM scientific_claims
                WHERE owner_id=? AND id IN (?, ?)
                """,
                (owner_id, left_id, right_id),
            ).fetchone()["count"]
            if int(count) != 2:
                raise NotFoundError("one or both golden claims do not exist")
            identity = {
                "owner_id": owner_id,
                "domain": domain,
                "left_claim_id": left_id,
                "right_claim_id": right_id,
                "expected_cluster": expected_cluster,
                "expected_relation": expected_relation,
                "expected_locators": locators,
            }
            item_id = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"research-atlas:claim-golden:{self._phase8_json_sha(identity)}",
                )
            )
            now = utc_now()
            existing = db.execute(
                "SELECT * FROM claim_golden_items WHERE id=?", (item_id,)
            ).fetchone()
            if existing is None:
                db.execute(
                    """
                    INSERT INTO claim_golden_items(
                        id, owner_id, domain, left_claim_id, right_claim_id,
                        expected_cluster, expected_relation, expected_locators_json,
                        reviewer, review_reason, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item_id, owner_id, domain, left_id, right_id,
                        int(expected_cluster), expected_relation,
                        json.dumps(locators, ensure_ascii=False, sort_keys=True),
                        actor, reason, now,
                    ),
                )
                self._record_editor_audit(
                    db,
                    "claim_golden_item_created",
                    actor,
                    entity_kind="claim_golden_item",
                    entity_id=item_id,
                    after=identity,
                    reason=reason,
                )
            row = db.execute(
                "SELECT * FROM claim_golden_items WHERE id=?", (item_id,)
            ).fetchone()
            assert row is not None
            return {
                "id": row["id"],
                "owner_id": row["owner_id"],
                "domain": row["domain"],
                "left_claim_id": row["left_claim_id"],
                "right_claim_id": row["right_claim_id"],
                "expected_cluster": bool(row["expected_cluster"]),
                "expected_relation": row["expected_relation"],
                "expected_locators": json.loads(row["expected_locators_json"] or "[]"),
                "reviewer": row["reviewer"],
                "review_reason": row["review_reason"],
                "created_at": row["created_at"],
            }

    def list_claim_golden_items(
        self, limit: int = 200, owner_id: str = "local"
    ) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT * FROM claim_golden_items
                WHERE owner_id=? ORDER BY created_at DESC LIMIT ?
                """,
                (owner_id, max(1, min(1000, int(limit)))),
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "owner_id": row["owner_id"],
                    "domain": row["domain"],
                    "left_claim_id": row["left_claim_id"],
                    "right_claim_id": row["right_claim_id"],
                    "expected_cluster": bool(row["expected_cluster"]),
                    "expected_relation": row["expected_relation"],
                    "expected_locators": json.loads(row["expected_locators_json"] or "[]"),
                    "reviewer": row["reviewer"],
                    "review_reason": row["review_reason"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ]

    def create_claim_evaluation(
        self,
        payload: dict[str, Any],
        owner_id: str = "local",
    ) -> dict[str, Any]:
        actor = self._editor_actor(payload)
        reason = self._editor_reason(payload, required=True)
        key = self._idempotency_key(payload)
        raw_results = payload.get("results")
        if not isinstance(raw_results, list) or not raw_results:
            raise AtlasError("claim evaluation requires at least one result")
        normalized: list[dict[str, Any]] = []
        seen: set[str] = set()
        for raw in raw_results[:5000]:
            if not isinstance(raw, dict):
                raise AtlasError("claim evaluation results must be objects")
            forbidden = {
                "locatorComplete",
                "locator_complete",
                "reviewerAgreement",
                "reviewer_agreement",
            }.intersection(raw)
            if forbidden:
                raise AtlasError(
                    "locatorComplete and reviewerAgreement are server-derived and must not be submitted"
                )
            item_id = compact_text(
                raw.get("goldenItemId") or raw.get("golden_item_id"), 160
            )
            if not item_id or item_id in seen:
                raise AtlasError("goldenItemId values must be unique")
            predicted_cluster = raw.get(
                "predictedCluster", raw.get("predicted_cluster")
            )
            if predicted_cluster is not None and not isinstance(predicted_cluster, bool):
                raise AtlasError("predictedCluster must be boolean or null")
            predicted_relation = compact_text(
                raw.get("predictedRelation") or raw.get("predicted_relation"), 40
            )
            abstained = raw.get("abstained", False)
            if not isinstance(abstained, bool):
                raise AtlasError("abstained must be boolean")
            if not abstained and predicted_relation not in CLAIM_RELATION_TYPES:
                raise AtlasError(
                    "non-abstained evaluation result requires a relation prediction"
                )
            predicted_locators = self._phase8_locator_fields(
                raw.get("predictedLocators", raw.get("predicted_locators", [])),
                "predictedLocators",
            )
            seen.add(item_id)
            normalized.append(
                {
                    "golden_item_id": item_id,
                    "predicted_cluster": predicted_cluster,
                    "predicted_relation": predicted_relation,
                    "predicted_locators": predicted_locators,
                    "locator_complete": False,
                    "abstained": abstained,
                    "reviewer_agreement": None,
                }
            )
        identity = {
            "model": compact_text(payload.get("model"), 240),
            "prompt_version": compact_text(
                payload.get("promptVersion") or payload.get("prompt_version"), 120
            ),
            "code_version": compact_text(
                payload.get("codeVersion") or payload.get("code_version"), 160
            ),
            "results": normalized,
        }
        request_hash = self._operation_request_hash("claim_evaluation", identity)
        with self._lock, self.connect() as db:
            prior = self._lookup_operation_idempotency(
                db, owner_id, "claim_evaluation", key, request_hash
            )
            if prior is not None:
                return self._phase8_operation_response(
                    self._claim_evaluation_with_db(
                        db, prior["resource_id"], owner_id
                    ),
                    key,
                    True,
                )
            placeholders = ",".join("?" for _ in normalized)
            golden_rows = db.execute(
                f"""
                SELECT * FROM claim_golden_items
                WHERE owner_id=? AND id IN ({placeholders})
                """,
                [owner_id, *[item["golden_item_id"] for item in normalized]],
            ).fetchall()
            golden = {row["id"]: row for row in golden_rows}
            if len(golden) != len(normalized):
                missing = sorted(
                    item["golden_item_id"]
                    for item in normalized
                    if item["golden_item_id"] not in golden
                )
                raise NotFoundError(
                    f"claim evaluation references missing golden items: {', '.join(missing)}"
                )
            for item in normalized:
                expected_locators = self._phase8_locator_fields(
                    json.loads(
                        golden[item["golden_item_id"]]["expected_locators_json"] or "[]"
                    ),
                    "stored expectedLocators",
                )
                item["locator_complete"] = set(expected_locators).issubset(
                    item["predicted_locators"]
                )
            item_count = len(normalized)
            abstention_count = sum(item["abstained"] for item in normalized)
            non_abstained = [item for item in normalized if not item["abstained"]]
            positives = [row for row in golden.values() if row["expected_cluster"]]
            true_positive = sum(
                1
                for item in non_abstained
                if bool(golden[item["golden_item_id"]]["expected_cluster"])
                and item["predicted_cluster"] is True
            )
            false_merge = sum(
                1
                for item in non_abstained
                if not bool(golden[item["golden_item_id"]]["expected_cluster"])
                and item["predicted_cluster"] is True
            )
            predicted_merges = sum(
                item["predicted_cluster"] is True for item in non_abstained
            )
            relation_correct = sum(
                1
                for item in non_abstained
                if item["predicted_relation"]
                == golden[item["golden_item_id"]]["expected_relation"]
            )
            relation_labels = sorted(CLAIM_RELATION_TYPES)
            relation_confusion = {
                expected: {**{predicted: 0 for predicted in relation_labels}, "__abstain__": 0}
                for expected in relation_labels
            }
            for item in normalized:
                expected = golden[item["golden_item_id"]]["expected_relation"]
                predicted = (
                    "__abstain__" if item["abstained"] else item["predicted_relation"]
                )
                relation_confusion[expected][predicted] += 1
            locator_complete_count = sum(
                item["locator_complete"] for item in normalized
            )
            metrics = {
                "candidate_recall": true_positive / len(positives) if positives else None,
                "false_merge_rate": (
                    false_merge / predicted_merges if predicted_merges else 0.0
                ),
                "relation_accuracy": (
                    relation_correct / len(non_abstained) if non_abstained else None
                ),
                "relation_confusion_matrix": {
                    "labels": relation_labels,
                    "abstention_label": "__abstain__",
                    "counts": relation_confusion,
                },
                "locator_completeness": locator_complete_count / item_count,
                "reviewer_agreement": None,
                "abstention_rate": abstention_count / item_count,
                "item_count": item_count,
                "metric_boundary": "evaluation_only_not_public_scientific_confidence",
            }
            try:
                cost = max(0.0, float(payload.get("cost") or 0))
                latency_ms = max(
                    0,
                    int(payload.get("latencyMs") or payload.get("latency_ms") or 0),
                )
            except (TypeError, ValueError) as error:
                raise AtlasError("evaluation cost and latency must be numeric") from error
            run_id = (
                self._deterministic_operation_id("claim_evaluation", owner_id, key)
                if key
                else str(uuid.uuid4())
            )
            now = utc_now()
            db.execute(
                """
                INSERT INTO claim_eval_runs(
                    id, owner_id, model, prompt_version, code_version,
                    input_sha256, cost, latency_ms, abstention_count,
                    item_count, metrics_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id, owner_id, identity["model"], identity["prompt_version"],
                    identity["code_version"], self._phase8_json_sha(normalized), cost,
                    latency_ms, abstention_count, item_count,
                    json.dumps(metrics, ensure_ascii=False, sort_keys=True), now,
                ),
            )
            for item in normalized:
                db.execute(
                    """
                    INSERT INTO claim_eval_results(
                        run_id, golden_item_id, predicted_cluster,
                        predicted_relation, predicted_locators_json,
                        locator_complete, abstained, reviewer_agreement
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id, item["golden_item_id"],
                        None
                        if item["predicted_cluster"] is None
                        else int(item["predicted_cluster"]),
                        item["predicted_relation"],
                        json.dumps(item["predicted_locators"], ensure_ascii=False),
                        int(item["locator_complete"]), int(item["abstained"]),
                        item["reviewer_agreement"],
                    ),
                )
            if key:
                db.execute(
                    """
                    INSERT INTO operation_idempotency(
                        owner_id, operation_kind, idempotency_key,
                        request_sha256, resource_id, created_at
                    ) VALUES (?, 'claim_evaluation', ?, ?, ?, ?)
                    """,
                    (owner_id, key, request_hash, run_id, now),
                )
            self._record_editor_audit(
                db,
                "claim_evaluation_created",
                actor,
                entity_kind="claim_evaluation",
                entity_id=run_id,
                after={"metrics": metrics, "input_sha256": self._phase8_json_sha(normalized)},
                reason=reason,
                model=identity["model"],
                prompt_version=identity["prompt_version"],
                work_units=cost,
            )
            result = self._claim_evaluation_with_db(db, run_id, owner_id)
            return self._phase8_operation_response(result, key, False)

    @staticmethod
    def _claim_evaluation_with_db(
        db: sqlite3.Connection,
        run_id: str,
        owner_id: str = "local",
    ) -> dict[str, Any]:
        row = db.execute(
            "SELECT * FROM claim_eval_runs WHERE id=? AND owner_id=?",
            (run_id, owner_id),
        ).fetchone()
        if row is None:
            raise NotFoundError("claim evaluation does not exist")
        results = db.execute(
            """
            SELECT * FROM claim_eval_results
            WHERE run_id=? ORDER BY golden_item_id
            """,
            (run_id,),
        ).fetchall()
        return {
            "id": row["id"],
            "owner_id": row["owner_id"],
            "model": row["model"],
            "prompt_version": row["prompt_version"],
            "code_version": row["code_version"],
            "input_sha256": row["input_sha256"],
            "cost": row["cost"],
            "latency_ms": row["latency_ms"],
            "abstention_count": row["abstention_count"],
            "item_count": row["item_count"],
            "metrics": json.loads(row["metrics_json"] or "{}"),
            "created_at": row["created_at"],
            "results": [
                {
                    "golden_item_id": item["golden_item_id"],
                    "predicted_cluster": (
                        None
                        if item["predicted_cluster"] is None
                        else bool(item["predicted_cluster"])
                    ),
                    "predicted_relation": item["predicted_relation"],
                    "predicted_locators": json.loads(
                        item["predicted_locators_json"] or "[]"
                    ),
                    "locator_complete": bool(item["locator_complete"]),
                    "abstained": bool(item["abstained"]),
                    "reviewer_agreement": item["reviewer_agreement"],
                }
                for item in results
            ],
        }

    def get_claim_evaluation(
        self,
        run_id: str,
        owner_id: str = "local",
    ) -> dict[str, Any]:
        with self.connect() as db:
            return self._claim_evaluation_with_db(db, run_id, owner_id)

    def list_claim_evaluations(
        self,
        owner_id: str = "local",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                """
                SELECT id FROM claim_eval_runs WHERE owner_id=?
                ORDER BY created_at DESC LIMIT ?
                """,
                (owner_id, max(1, min(500, int(limit)))),
            ).fetchall()
        return [self.get_claim_evaluation(row["id"], owner_id) for row in rows]

    def catalog_counts(self) -> dict[str, int]:
        with self.connect() as db:
            return {
                "papers": db.execute("SELECT COUNT(*) FROM canonical_papers").fetchone()[0],
                "projects": db.execute("SELECT COUNT(*) FROM research_projects").fetchone()[0],
                "frontier_candidates": db.execute("SELECT COUNT(*) FROM frontier_candidates").fetchone()[0],
                "frontier_updates": db.execute("SELECT COUNT(*) FROM frontier_updates").fetchone()[0],
                "frontier_terms": db.execute("SELECT COUNT(*) FROM frontier_term_candidates").fetchone()[0],
                "frontier_signals": db.execute(
                    "SELECT COUNT(*) FROM frontier_signals WHERE status='published'"
                ).fetchone()[0],
                "frontier_signal_drafts": db.execute(
                    "SELECT COUNT(*) FROM frontier_signals WHERE status='draft'"
                ).fetchone()[0],
                "editor_batches": db.execute("SELECT COUNT(*) FROM editor_batches").fetchone()[0],
                "editor_active_batches": db.execute(
                    "SELECT COUNT(*) FROM editor_batches WHERE status IN ('queued','previewing','previewed','running','paused','partial')"
                ).fetchone()[0],
                "editor_failed_batches": db.execute(
                    "SELECT COUNT(*) FROM editor_batches WHERE status='failed'"
                ).fetchone()[0],
                "editor_total_items": db.execute("SELECT COUNT(*) FROM editor_batch_items").fetchone()[0],
                "editor_failed_items": db.execute(
                    "SELECT COUNT(*) FROM editor_batch_items WHERE status='failed'"
                ).fetchone()[0],
                "editor_work_units": db.execute(
                    "SELECT COALESCE(SUM(actual_work), 0) FROM editor_batch_items"
                ).fetchone()[0],
                "editor_duration_ms": db.execute(
                    "SELECT COALESCE(SUM(duration_ms), 0) FROM editor_batches"
                ).fetchone()[0],
                "knowledge_entities": db.execute(
                    "SELECT COUNT(*) FROM knowledge_entities WHERE status<>'merged'"
                ).fetchone()[0],
                "knowledge_reviewed_entities": db.execute(
                    "SELECT COUNT(*) FROM knowledge_entities WHERE reviewed_at IS NOT NULL AND status<>'merged'"
                ).fetchone()[0],
                "knowledge_relationships": db.execute(
                    "SELECT COUNT(*) FROM knowledge_relationships WHERE status<>'retired'"
                ).fetchone()[0],
                "knowledge_reviewed_relationships": db.execute(
                    "SELECT COUNT(*) FROM knowledge_relationships WHERE reviewed_at IS NOT NULL AND status<>'retired'"
                ).fetchone()[0],
                "coverage_gaps": db.execute("SELECT COUNT(*) FROM coverage_gaps").fetchone()[0],
                "coverage_open_gaps": db.execute(
                    "SELECT COUNT(*) FROM coverage_gaps WHERE status='open'"
                ).fetchone()[0],
                "editor_audit_events": db.execute("SELECT COUNT(*) FROM editor_audit_events").fetchone()[0],
            }

    @staticmethod
    def _legacy_sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()

    def _legacy_create_backup(self, destination: Path, editor_payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(editor_payload, required=False)
        reason = self._editor_reason(editor_payload, required=True)
        directory = Path(destination).expanduser().resolve()
        directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = directory / f"atlas-{stamp}-{uuid.uuid4().hex[:8]}.db"
        with self._lock:
            with self.connect() as source, sqlite3.connect(backup_path) as target:
                source.backup(target)
                integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
                schema_row = target.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()
            if integrity != "ok":
                backup_path.unlink(missing_ok=True)
                raise AtlasError("SQLite backup integrity_check 失败")
            database_sha256 = self._legacy_sha256_file(backup_path)
            manifest = {
                "manifest_version": 1,
                "app_version": APP_VERSION,
                "schema_version": int(schema_row[0]) if schema_row else 0,
                "created_at": utc_now(),
                "file": backup_path.name,
                "byte_size": backup_path.stat().st_size,
                "database_sha256": database_sha256,
                "integrity": "ok",
            }
            manifest_path = backup_path.with_suffix(".manifest.json")
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
                encoding="utf-8",
            )
            run_id = str(uuid.uuid4())
            with self.connect() as db:
                db.execute(
                    """
                    INSERT INTO atlas_backup_runs(id, path, manifest_json, database_sha256, actor, reason, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (run_id, str(backup_path), json.dumps(manifest, ensure_ascii=False), database_sha256,
                     actor, reason, manifest["created_at"]),
                )
                self._record_editor_audit(
                    db,
                    "atlas_backup_created",
                    actor,
                    entity_kind="backup",
                    entity_id=run_id,
                    after=manifest,
                    reason=reason,
                )
        return {
            "id": run_id,
            "path": str(backup_path),
            "manifest_path": str(manifest_path),
            "database_sha256": database_sha256,
            "manifest": manifest,
        }

    def _legacy_validate_backup(self, path: Path, manifest: dict[str, Any] | None = None) -> dict[str, Any]:
        backup_path = Path(path).expanduser().resolve()
        if not backup_path.is_file():
            raise NotFoundError("备份文件不存在")
        expected = manifest
        if expected is None:
            manifest_path = backup_path.with_suffix(".manifest.json")
            if not manifest_path.is_file():
                raise AtlasError("备份缺少 manifest")
            try:
                expected = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise AtlasError("备份 manifest 无法解析") from error
        if not isinstance(expected, dict):
            raise AtlasError("备份 manifest 格式无效")
        actual_hash = self._legacy_sha256_file(backup_path)
        declared_hash = compact_text(expected.get("database_sha256"), 64).lower()
        if not re.fullmatch(r"[a-f0-9]{64}", declared_hash) or not hmac.compare_digest(actual_hash, declared_hash):
            raise AtlasError("备份 SHA-256 校验失败")
        uri = backup_path.as_uri() + "?mode=ro"
        try:
            with sqlite3.connect(uri, uri=True) as db:
                integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
                row = db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()
                schema_version = int(row[0]) if row else 0
                tables = {
                    item[0]
                    for item in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
                }
        except (sqlite3.Error, TypeError, ValueError) as error:
            raise AtlasError("备份不是有效的 Atlas SQLite 数据库") from error
        if integrity != "ok":
            raise AtlasError("备份 integrity_check 失败")
        if schema_version > SCHEMA_VERSION:
            raise AtlasError("备份 schema 高于当前程序支持版本")
        if not {"app_metadata", "canonical_papers", "analysis_requests"}.issubset(tables):
            raise AtlasError("备份缺少 Atlas 核心数据表")
        return {
            "path": str(backup_path),
            "database_sha256": actual_hash,
            "schema_version": schema_version,
            "integrity": "ok",
            "byte_size": backup_path.stat().st_size,
        }

    def _legacy_restore_backup(self, path: Path, manifest: dict[str, Any] | None, editor_payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._editor_actor(editor_payload)
        reason = self._editor_reason(editor_payload, required=True)
        if editor_payload.get("confirm") is not True:
            raise AtlasError("恢复操作必须显式提供 confirm=true")
        validated = self._legacy_validate_backup(path, manifest)
        safety = self._legacy_create_backup(
            self.path.parent / "backups",
            {"editorName": actor, "reason": f"恢复前自动备份：{reason}"},
        )
        backup_path = Path(validated["path"])
        temporary_path = self.path.with_name(f".{self.path.name}.restore-{uuid.uuid4().hex}.tmp")
        with self._lock:
            try:
                with sqlite3.connect(backup_path) as source, sqlite3.connect(temporary_path) as target:
                    source.backup(target)
                    if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise AtlasError("恢复临时数据库 integrity_check 失败")
                with self.connect() as current:
                    current.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                for suffix in ("-wal", "-shm"):
                    self.path.with_name(self.path.name + suffix).unlink(missing_ok=True)
                os.replace(temporary_path, self.path)
                self.initialize()
                with self.connect() as db:
                    self._record_editor_audit(
                        db,
                        "atlas_imported",
                        actor,
                        entity_kind="database",
                        entity_id=validated["database_sha256"],
                        before={"safety_backup": safety["path"]},
                        after=validated,
                        reason=reason,
                    )
            finally:
                temporary_path.unlink(missing_ok=True)
        return {"restored": True, "backup": validated, "safety_backup": safety}

    def export_research_data(self, owner_id: str = "local") -> dict[str, Any]:
        """Export a consistent, owner-scoped copy of the private workspace."""
        owner = compact_text(owner_id, 120) or "local"

        def portable(value: dict[str, Any], *derived: str) -> dict[str, Any]:
            result = dict(value)
            result.pop("owner_id", None)
            for key in derived:
                result.pop(key, None)
            return result

        with self._lock, self.connect() as db:
            db.execute("BEGIN")
            focus_row = db.execute(
                "SELECT * FROM focus_profiles WHERE owner_id=?", (owner,)
            ).fetchone()
            focus = portable(self._focus_from_row(focus_row)) if focus_row else None
            saved_items = [
                portable(self._saved_item_from_row(row), "saved")
                for row in db.execute(
                    "SELECT * FROM saved_items WHERE owner_id=? ORDER BY created_at, id",
                    (owner,),
                ).fetchall()
            ]
            private_digests = [
                portable(self._digest_from_row(row))
                for row in db.execute(
                    """
                    SELECT * FROM research_digests
                    WHERE owner_id=? AND digest_type='private'
                    ORDER BY created_at, id
                    """,
                    (owner,),
                ).fetchall()
            ]
            research_views = [
                portable(self._research_view_from_row(row))
                for row in db.execute(
                    "SELECT * FROM research_views WHERE owner_id=? ORDER BY created_at, id",
                    (owner,),
                ).fetchall()
            ]
            research_view_runs = [
                portable(self._research_view_run_from_row(row))
                for row in db.execute(
                    "SELECT * FROM research_view_runs WHERE owner_id=? ORDER BY view_id, run_sequence",
                    (owner,),
                ).fetchall()
            ]
            notifications = [
                portable(self._notification_from_row(row), "read")
                for row in db.execute(
                    "SELECT * FROM research_notifications WHERE owner_id=? ORDER BY created_at, id",
                    (owner,),
                ).fetchall()
            ]
            provenance_bundles = [
                portable(self._bundle_response_from_row(row))
                for row in db.execute(
                    "SELECT * FROM provenance_bundles WHERE owner_id=? ORDER BY created_at, id",
                    (owner,),
                ).fetchall()
            ]
            learning_progress = [
                portable(self._learning_row_from_row(row))
                for row in db.execute(
                    "SELECT * FROM learning_progress WHERE owner_id=? ORDER BY chapter_id",
                    (owner,),
                ).fetchall()
            ]
        public = self.public_knowledge(limit=500)
        return {
            "schema_version": RESEARCH_DATA_SCHEMA_VERSION,
            "app_version": APP_VERSION,
            "exported_at": utc_now(),
            "focus_profile": focus,
            "saved_items": saved_items,
            "private_digests": private_digests,
            "research_views": research_views,
            "research_view_runs": research_view_runs,
            "notifications": notifications,
            "provenance_bundles": provenance_bundles,
            "learning_progress": learning_progress,
            "public_knowledge": public,
        }

    def _legacy_import_research_data(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        if int(payload.get("schema_version") or 0) != 1:
            raise AtlasError("研究数据导入 schema 不受支持")
        focus = payload.get("focus_profile")
        saved = payload.get("saved_items")
        if not isinstance(focus, dict) or not isinstance(saved, list) or len(saved) > 500:
            raise AtlasError("研究数据导入内容无效")
        dry_run = payload.get("dryRun", payload.get("dry_run", True)) is not False
        preview = {"focus_profile": True, "saved_items": len(saved), "dry_run": dry_run}
        if dry_run:
            return preview
        self.update_focus_profile(focus, owner_id)
        imported = 0
        for item in saved:
            if not isinstance(item, dict):
                raise AtlasError("保存对象导入条目无效")
            self.save_item(item, owner_id)
            imported += 1
        with self.connect() as db:
            self._record_editor_audit(
                db,
                "atlas_imported",
                "本地编辑",
                entity_kind="research_data",
                entity_id=owner_id,
                after={"saved_items": imported},
                reason="经显式确认导入版本化研究数据",
            )
        return {**preview, "saved_items": imported, "imported": True}

    def _import_research_data_v2(self, payload: dict[str, Any], owner_id: str) -> dict[str, Any]:
        """Validate and merge a complete private workspace without importing retry secrets."""
        owner = compact_text(owner_id, 120) or "local"
        dry_value = payload.get("dryRun", payload.get("dry_run", True))
        if not isinstance(dry_value, bool):
            raise AtlasError("dryRun must be a boolean")
        if "operation_idempotency" in payload or "idempotency_keys" in payload:
            raise AtlasError("research data imports must not contain idempotency records")
        if "public_knowledge" in payload and not isinstance(payload["public_knowledge"], dict):
            raise AtlasError("public_knowledge must be an object when present")

        def object_value(value: Any, label: str) -> dict[str, Any]:
            if not isinstance(value, dict):
                raise AtlasError(f"{label} must be an object")
            return value

        def list_value(field: str, maximum: int) -> list[dict[str, Any]]:
            value = payload.get(field)
            if not isinstance(value, list) or len(value) > maximum:
                raise AtlasError(f"{field} must be an array with at most {maximum} entries")
            if any(not isinstance(item, dict) for item in value):
                raise AtlasError(f"{field} entries must be objects")
            return value

        def optional_list_value(field: str, maximum: int) -> list[dict[str, Any]]:
            # learning_progress was added to the existing v2 export contract.
            # Treating an absent field as an empty list keeps earlier v2 files
            # portable without weakening validation when the field is present.
            if field not in payload:
                return []
            return list_value(field, maximum)

        def portable_guard(value: dict[str, Any], label: str) -> None:
            if "owner_id" in value or "ownerId" in value:
                raise AtlasError(f"{label} must not override owner_id")
            if "idempotency_key" in value or "idempotencyKey" in value:
                raise AtlasError(f"{label} must not contain an idempotency key")

        def identifier(value: Any, label: str, *, optional: bool = False) -> str:
            text = compact_text(value, 80).lower()
            if optional and not text:
                return ""
            try:
                parsed = str(uuid.UUID(text))
            except (ValueError, AttributeError) as error:
                raise AtlasError(f"{label} must be a UUID") from error
            if parsed != text:
                raise AtlasError(f"{label} must be a canonical UUID")
            return text

        def timestamp(value: Any, label: str, *, optional: bool = False) -> str | None:
            if value is None and optional:
                return None
            text = compact_text(value, 80)
            if optional and not text:
                return None
            if parse_utc(text) is None:
                raise AtlasError(f"{label} must be an ISO-8601 timestamp")
            return text

        def sha256_value(value: Any, label: str) -> str:
            text = compact_text(value, 64).lower()
            if not re.fullmatch(r"[a-f0-9]{64}", text):
                raise AtlasError(f"{label} must be a SHA-256 digest")
            return text

        def string_list(
            value: Any,
            label: str,
            item_maximum: int,
            maximum: int,
        ) -> list[str]:
            if not isinstance(value, list) or len(value) > maximum:
                raise AtlasError(f"{label} must be an array with at most {maximum} entries")
            if any(not isinstance(item, str) for item in value):
                raise AtlasError(f"{label} entries must be strings")
            normalized = clean_string_list(value, item_maximum, maximum)
            if len(normalized) != len(value):
                raise AtlasError(f"{label} contains empty or duplicate entries")
            return normalized

        def multiline(value: Any, label: str, maximum: int) -> str:
            if value is None:
                return ""
            if not isinstance(value, str) or len(value) > maximum:
                raise AtlasError(f"{label} must be a string no longer than {maximum} characters")
            return clean_multiline_text(value, maximum)

        def exact_string(value: Any, label: str, maximum: int) -> str:
            if not isinstance(value, str) or len(value) > maximum:
                raise AtlasError(f"{label} must be a string no longer than {maximum} characters")
            return value

        def canonical(value: Any) -> str:
            return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

        def unique(items: list[dict[str, Any]], keys: tuple[str, ...], label: str) -> None:
            seen: set[tuple[Any, ...]] = set()
            for item in items:
                marker = tuple(item.get(key) for key in keys)
                if marker in seen:
                    raise ConflictError(f"research data import contains duplicate {label}")
                seen.add(marker)

        raw_focus = payload.get("focus_profile")
        if raw_focus is not None and not isinstance(raw_focus, dict):
            raise AtlasError("focus_profile must be an object or null")
        normalized_focus: dict[str, Any] | None = None
        if raw_focus is not None:
            portable_guard(raw_focus, "focus_profile")
            aliases = {
                "source_keys": raw_focus.get("source_keys", raw_focus.get("sourceKeys", [])),
                "method_ids": raw_focus.get("method_ids", raw_focus.get("methodIds", [])),
                "problem_ids": raw_focus.get("problem_ids", raw_focus.get("problemIds", [])),
                "thread_ids": raw_focus.get("thread_ids", raw_focus.get("threadIds", [])),
            }
            normalized_focus = {
                "domains": string_list(raw_focus.get("domains", []), "focus domains", 80, 20),
                "keywords": string_list(raw_focus.get("keywords", []), "focus keywords", 160, 50),
                "source_keys": string_list(aliases["source_keys"], "focus source_keys", 120, 30),
                "method_ids": string_list(aliases["method_ids"], "focus method_ids", 160, 50),
                "problem_ids": string_list(aliases["problem_ids"], "focus problem_ids", 160, 50),
                "thread_ids": string_list(aliases["thread_ids"], "focus thread_ids", 160, 50),
                "created_at": timestamp(raw_focus.get("created_at"), "focus created_at"),
                "updated_at": timestamp(raw_focus.get("updated_at"), "focus updated_at"),
            }

        normalized_items: list[dict[str, Any]] = []
        for raw in list_value("saved_items", 500):
            portable_guard(raw, "saved item")
            item_kind = compact_text(raw.get("item_kind", raw.get("itemKind")), 40).lower()
            item_ref = compact_text(raw.get("item_ref", raw.get("itemRef")), 500)
            if item_kind not in SAVED_ITEM_KINDS or not item_ref:
                raise AtlasError("saved item type or reference is invalid")
            normalized_items.append(
                {
                    "id": identifier(raw.get("id"), "saved item id"),
                    "item_kind": item_kind,
                    "item_ref": item_ref,
                    "title": compact_text(raw.get("title"), 500),
                    "tags": string_list(raw.get("tags", []), "saved item tags", 120, 20),
                    "note": multiline(raw.get("note", ""), "saved item note", 4000),
                    "created_at": timestamp(raw.get("created_at"), "saved item created_at"),
                    "updated_at": timestamp(raw.get("updated_at"), "saved item updated_at"),
                }
            )

        normalized_digests: list[dict[str, Any]] = []
        for raw in list_value("private_digests", 1000):
            portable_guard(raw, "private digest")
            if compact_text(raw.get("digest_type"), 20).lower() != "private":
                raise AtlasError("private digest type must be private")
            period_start = compact_text(raw.get("period_start"), 20)
            period_end = compact_text(raw.get("period_end"), 20)
            if (
                not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_start)
                or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_end)
                or period_start > period_end
            ):
                raise AtlasError("private digest period is invalid")
            scope = object_value(raw.get("scope"), "private digest scope")
            source_snapshot = object_value(raw.get("source_snapshot"), "private digest source_snapshot")
            content = object_value(raw.get("content"), "private digest content")
            source_sha = sha256_value(raw.get("source_sha256"), "private digest source_sha256")
            actual_source_sha = hashlib.sha256(
                canonical({"content": content, "source": source_snapshot}).encode("utf-8")
            ).hexdigest()
            if not hmac.compare_digest(source_sha, actual_source_sha):
                raise AtlasError("private digest source SHA-256 does not match its content")
            normalized_digests.append(
                {
                    "id": identifier(raw.get("id"), "private digest id"),
                    "digest_type": "private",
                    "period_start": period_start,
                    "period_end": period_end,
                    "as_of": timestamp(raw.get("as_of"), "private digest as_of"),
                    "scope": scope,
                    "source_snapshot": source_snapshot,
                    "content": content,
                    "markdown": exact_string(
                        raw.get("markdown", ""), "private digest markdown", 2_000_000
                    ),
                    "source_sha256": source_sha,
                    "previous_digest_id": identifier(
                        raw.get("previous_digest_id"), "private digest previous_digest_id", optional=True
                    ) or None,
                    "created_at": timestamp(raw.get("created_at"), "private digest created_at"),
                    "updated_at": timestamp(raw.get("updated_at"), "private digest updated_at"),
                }
            )

        normalized_views: list[dict[str, Any]] = []
        for raw in list_value("research_views", RESEARCH_VIEW_MAX_PER_OWNER):
            portable_guard(raw, "research view")
            name = compact_text(raw.get("name"), 200)
            if not name:
                raise AtlasError("research view name is required")
            kind, definition, boundary = self._normalize_research_view(
                raw.get("view_kind", raw.get("viewKind")), raw.get("definition")
            )
            if raw.get("definition") != definition or raw.get("evidence_boundary") != boundary:
                raise AtlasError("research view definition or evidence boundary is not canonical")
            revision = raw.get("revision")
            if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
                raise AtlasError("research view revision must be a positive integer")
            normalized_views.append(
                {
                    "id": identifier(raw.get("id"), "research view id"),
                    "name": name,
                    "description": multiline(raw.get("description", ""), "research view description", 2000),
                    "view_kind": kind,
                    "definition": definition,
                    "evidence_boundary": boundary,
                    "revision": revision,
                    "created_at": timestamp(raw.get("created_at"), "research view created_at"),
                    "updated_at": timestamp(raw.get("updated_at"), "research view updated_at"),
                }
            )

        normalized_runs: list[dict[str, Any]] = []
        for raw in list_value("research_view_runs", 10_000):
            portable_guard(raw, "research view run")
            kind, definition, boundary = self._normalize_research_view(
                raw.get("view_kind"), raw.get("definition")
            )
            if raw.get("definition") != definition or raw.get("evidence_boundary") != boundary:
                raise AtlasError("research view run definition or evidence boundary is not canonical")
            revision = raw.get("view_revision")
            if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
                raise AtlasError("research view run revision must be a positive integer")
            raw_sequence = raw.get("run_sequence")
            if raw_sequence is None:
                run_sequence: int | None = None
            elif (
                isinstance(raw_sequence, bool)
                or not isinstance(raw_sequence, int)
                or raw_sequence < 1
            ):
                raise AtlasError("research view run sequence must be a positive integer")
            else:
                run_sequence = raw_sequence
            result = object_value(raw.get("result"), "research view run result")
            result_sha = sha256_value(raw.get("result_sha256"), "research view run result_sha256")
            if not hmac.compare_digest(
                result_sha, hashlib.sha256(canonical(result).encode("utf-8")).hexdigest()
            ):
                raise AtlasError("research view run result SHA-256 does not match its content")
            previous_run_id = identifier(
                raw.get("previous_run_id"), "research view run previous_run_id", optional=True
            )
            delta = object_value(raw.get("delta"), "research view run delta")
            delta_sha = sha256_value(raw.get("delta_sha256"), "research view run delta_sha256")
            if not hmac.compare_digest(
                delta_sha, hashlib.sha256(canonical(delta).encode("utf-8")).hexdigest()
            ):
                raise AtlasError("research view run delta SHA-256 does not match its content")
            if compact_text(delta.get("previous_run_id"), 80) != previous_run_id:
                raise AtlasError("research view run delta points to a different previous run")
            normalized_runs.append(
                {
                    "id": identifier(raw.get("id"), "research view run id"),
                    "view_id": identifier(raw.get("view_id"), "research view run view_id"),
                    "view_name": compact_text(raw.get("view_name"), 200),
                    "view_kind": kind,
                    "view_revision": revision,
                    "definition": definition,
                    "evidence_boundary": boundary,
                    "search_snapshot_id": identifier(
                        raw.get("search_snapshot_id"), "research view run search_snapshot_id", optional=True
                    ),
                    "result": result,
                    "result_sha256": result_sha,
                    "run_sequence": run_sequence,
                    "previous_run_id": previous_run_id,
                    "delta": delta,
                    "delta_sha256": delta_sha,
                    "run_at": timestamp(raw.get("run_at"), "research view run run_at"),
                }
            )
            if not normalized_runs[-1]["view_name"]:
                raise AtlasError("research view run view_name is required")

        normalized_notifications: list[dict[str, Any]] = []
        for raw in list_value("notifications", 20_000):
            portable_guard(raw, "notification")
            kind = compact_text(raw.get("notification_kind"), 40)
            if kind not in NOTIFICATION_KINDS:
                raise AtlasError("notification kind is invalid")
            evidence_level = compact_text(raw.get("evidence_level"), 120)
            source_kind = compact_text(raw.get("source_kind"), 80)
            source_ref = compact_text(raw.get("source_ref"), 500)
            source_revision = compact_text(raw.get("source_revision"), 160)
            if not evidence_level or not source_kind or not source_ref or not source_revision:
                raise AtlasError("notification evidence and source fields are required")
            dedupe_seed = f"{kind}\0{source_kind}\0{source_ref}\0{source_revision}"
            expected_dedupe = hashlib.sha256(dedupe_seed.encode("utf-8")).hexdigest()
            dedupe_key = sha256_value(raw.get("dedupe_key"), "notification dedupe_key")
            if not hmac.compare_digest(dedupe_key, expected_dedupe):
                raise AtlasError("notification dedupe key does not match its source")
            normalized_notifications.append(
                {
                    "id": identifier(raw.get("id"), "notification id"),
                    "dedupe_key": dedupe_key,
                    "notification_kind": kind,
                    "evidence_level": evidence_level,
                    "title": compact_text(raw.get("title"), 500),
                    "body": multiline(raw.get("body", ""), "notification body", 4000),
                    "source_kind": source_kind,
                    "source_ref": source_ref,
                    "source_revision": source_revision,
                    "payload": object_value(raw.get("payload"), "notification payload"),
                    "first_seen_at": timestamp(raw.get("first_seen_at"), "notification first_seen_at"),
                    "last_seen_at": timestamp(raw.get("last_seen_at"), "notification last_seen_at"),
                    "read_at": timestamp(raw.get("read_at"), "notification read_at", optional=True),
                    "created_at": timestamp(raw.get("created_at"), "notification created_at"),
                    "updated_at": timestamp(raw.get("updated_at"), "notification updated_at"),
                }
            )

        normalized_bundles: list[dict[str, Any]] = []
        for raw in list_value("provenance_bundles", 2000):
            portable_guard(raw, "provenance bundle")
            manifest = object_value(raw.get("manifest"), "provenance bundle manifest")
            bundle = object_value(raw.get("bundle"), "provenance bundle content")
            markdown = exact_string(
                raw.get("markdown", ""), "provenance bundle markdown", 20_000_000
            )
            bundle_sha = sha256_value(raw.get("bundle_sha256"), "provenance bundle SHA-256")
            checked = self.verify_provenance_bundle(
                {
                    "manifest": manifest,
                    "bundle": bundle,
                    "markdown": markdown,
                    "bundle_sha256": bundle_sha,
                }
            )
            if not checked["valid"]:
                raise AtlasError("provenance bundle verification failed")
            view_run_id = identifier(raw.get("view_run_id"), "provenance bundle view_run_id")
            bundle_run = bundle.get("run")
            if not isinstance(bundle_run, dict) or compact_text(bundle_run.get("id"), 80) != view_run_id:
                raise AtlasError("provenance bundle points to a different research view run")
            normalized_bundles.append(
                {
                    "id": identifier(raw.get("id"), "provenance bundle id"),
                    "view_run_id": view_run_id,
                    "manifest": manifest,
                    "bundle": bundle,
                    "markdown": markdown,
                    "bundle_sha256": bundle_sha,
                    "created_at": timestamp(raw.get("created_at"), "provenance bundle created_at"),
                }
            )

        normalized_learning: list[dict[str, Any]] = []
        curriculum_chapters = _curriculum_chapter_index()
        for raw in optional_list_value("learning_progress", 500):
            portable_guard(raw, "learning progress")
            chapter_id = compact_text(raw.get("chapter_id", raw.get("chapterId")), 160)
            if chapter_id not in curriculum_chapters:
                raise AtlasError("learning progress chapter does not exist in this curriculum version")
            status = compact_text(raw.get("status"), 30).lower()
            if status not in LEARNING_STATUSES:
                raise AtlasError("learning progress status is invalid")
            confidence_value = raw.get("confidence")
            if confidence_value is None:
                confidence = None
            elif isinstance(confidence_value, bool) or not isinstance(confidence_value, int):
                raise AtlasError("learning progress confidence must be an integer from 0 to 100 or null")
            elif confidence_value < 0 or confidence_value > 100:
                raise AtlasError("learning progress confidence must be an integer from 0 to 100 or null")
            else:
                confidence = confidence_value
            source = compact_text(raw.get("source"), 80) or "explicit_user_action"
            if source != "explicit_user_action":
                raise AtlasError("learning progress source must record an explicit user action")
            normalized_learning.append(
                {
                    "chapter_id": chapter_id,
                    "status": status,
                    "confidence": confidence,
                    "note": multiline(raw.get("note", ""), "learning progress note", 2000),
                    "source": source,
                    "started_at": timestamp(
                        raw.get("started_at"), "learning progress started_at", optional=True
                    ),
                    "last_reviewed_at": timestamp(
                        raw.get("last_reviewed_at"), "learning progress last_reviewed_at", optional=True
                    ),
                    "updated_at": timestamp(raw.get("updated_at"), "learning progress updated_at"),
                }
            )

        for items, keys, label in (
            (normalized_items, ("id",), "saved item id"),
            (normalized_items, ("item_kind", "item_ref"), "saved item reference"),
            (normalized_digests, ("id",), "private digest id"),
            (
                normalized_digests,
                ("digest_type", "period_start", "period_end", "as_of", "source_sha256"),
                "private digest identity",
            ),
            (normalized_views, ("id",), "research view id"),
            (normalized_views, ("name",), "research view name"),
            (normalized_runs, ("id",), "research view run id"),
            (normalized_notifications, ("id",), "notification id"),
            (normalized_notifications, ("dedupe_key",), "notification source"),
            (normalized_bundles, ("id",), "provenance bundle id"),
            (normalized_learning, ("chapter_id",), "learning progress chapter"),
        ):
            unique(items, keys, label)

        view_by_id = {item["id"]: item for item in normalized_views}
        run_by_id = {item["id"]: item for item in normalized_runs}
        digest_by_id = {item["id"]: item for item in normalized_digests}
        for digest in normalized_digests:
            previous_id = digest["previous_digest_id"]
            if previous_id and previous_id in digest_by_id:
                previous = digest_by_id[previous_id]
                if previous["created_at"] > digest["created_at"]:
                    raise AtlasError("private digest predecessor is newer than its successor")
        for run in normalized_runs:
            view = view_by_id.get(run["view_id"])
            if view is not None and (
                run["view_name"] != view["name"]
                or run["view_kind"] != view["view_kind"]
                or run["view_revision"] > view["revision"]
            ):
                raise AtlasError("research view run does not match its imported view")
            previous_id = run["previous_run_id"]
            if previous_id and previous_id in run_by_id:
                previous = run_by_id[previous_id]
                if previous["view_id"] != run["view_id"] or previous["run_at"] > run["run_at"]:
                    raise AtlasError("research view run predecessor is invalid")
        complete_run_chains: set[str] = set()
        for run in normalized_runs:
            path: set[str] = set()
            cursor = run["id"]
            while cursor in run_by_id and cursor not in complete_run_chains:
                if cursor in path:
                    raise AtlasError("research view run predecessor chain contains a cycle")
                path.add(cursor)
                cursor = run_by_id[cursor]["previous_run_id"]
            complete_run_chains.update(path)
        for bundle in normalized_bundles:
            run = run_by_id.get(bundle["view_run_id"])
            if run is None:
                continue
            bundle_run = bundle["bundle"]["run"]
            bundle_delta = bundle_run.get("delta")
            bundle_delta_sha = compact_text(bundle_run.get("delta_sha256"), 64)
            bundle_previous_run_id = compact_text(bundle_run.get("previous_run_id"), 80)
            delta_fields = {"previous_run_id", "delta", "delta_sha256"}
            present_delta_fields = delta_fields.intersection(bundle_run)
            legacy_run_summary = not present_delta_fields
            if not legacy_run_summary and present_delta_fields != delta_fields:
                raise AtlasError("provenance bundle has a partial research run delta")
            run_mismatch = (
                compact_text(bundle_run.get("result_sha256"), 64) != run["result_sha256"]
            )
            if not legacy_run_summary:
                run_mismatch = run_mismatch or (
                    bundle_delta_sha != run["delta_sha256"]
                    or bundle_previous_run_id != run["previous_run_id"]
                    or bundle_delta != run["delta"]
                )
            if run_mismatch:
                raise AtlasError("provenance bundle does not match its imported research view run")

        preview = {
            "focus_profile": normalized_focus is not None,
            "saved_items": len(normalized_items),
            "private_digests": len(normalized_digests),
            "research_views": len(normalized_views),
            "research_view_runs": len(normalized_runs),
            "notifications": len(normalized_notifications),
            "provenance_bundles": len(normalized_bundles),
            "learning_progress": len(normalized_learning),
            "dry_run": dry_value,
        }

        def without_owner(value: dict[str, Any], *derived: str) -> dict[str, Any]:
            result = dict(value)
            result.pop("owner_id", None)
            for key in derived:
                result.pop(key, None)
            return result

        with self._lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for field, kind in (
                ("method_ids", "method"),
                ("problem_ids", "problem"),
                ("thread_ids", "thread"),
            ):
                for entity_id in (normalized_focus or {}).get(field, []):
                    entity = db.execute(
                        "SELECT status FROM knowledge_entities WHERE id=? AND entity_kind=?",
                        (entity_id, kind),
                    ).fetchone()
                    if entity is None or entity["status"] == "merged":
                        raise NotFoundError(f"关注的{kind}实体不存在")
            for item in normalized_items:
                if item["item_kind"] not in {"method", "problem", "thread", "term"}:
                    continue
                entity = db.execute(
                    "SELECT status FROM knowledge_entities WHERE id=? AND entity_kind=?",
                    (item["item_ref"], item["item_kind"]),
                ).fetchone()
                if entity is None or entity["status"] == "merged":
                    raise NotFoundError(f"保存的{item['item_kind']}实体不存在")
            for view in normalized_views:
                self._validate_research_view_entities(db, view["definition"])

            imported_ids = {
                "digest": {item["id"] for item in normalized_digests},
                "view": {item["id"] for item in normalized_views},
                "run": {item["id"] for item in normalized_runs},
            }

            def require_owner_reference(
                table: str,
                reference_id: str | None,
                imported: set[str],
                label: str,
                *,
                allow_missing: bool = False,
            ) -> None:
                if not reference_id or reference_id in imported:
                    return
                row = db.execute(f"SELECT owner_id FROM {table} WHERE id=?", (reference_id,)).fetchone()
                if row is None:
                    if allow_missing:
                        return
                    raise NotFoundError(f"{label} does not exist in the import or target workspace")
                if row["owner_id"] != owner:
                    raise ConflictError(f"{label} belongs to a different owner")

            for digest in normalized_digests:
                require_owner_reference(
                    "research_digests",
                    digest["previous_digest_id"],
                    imported_ids["digest"],
                    "previous private digest",
                )
            for run in normalized_runs:
                require_owner_reference(
                    "research_views",
                    run["view_id"],
                    imported_ids["view"],
                    "research view",
                    allow_missing=True,
                )
                require_owner_reference(
                    "research_view_runs",
                    run["previous_run_id"],
                    imported_ids["run"],
                    "previous research view run",
                )
            for bundle in normalized_bundles:
                require_owner_reference(
                    "research_view_runs",
                    bundle["view_run_id"],
                    imported_ids["run"],
                    "provenance bundle research view run",
                )

            affected_view_ids = {run["view_id"] for run in normalized_runs}
            existing_runs: dict[str, dict[str, Any]] = {}
            for view_id in affected_view_ids:
                rows = db.execute(
                    """
                    SELECT * FROM research_view_runs
                    WHERE owner_id=? AND view_id=?
                    ORDER BY run_sequence
                    """,
                    (owner, view_id),
                ).fetchall()
                existing_runs.update(
                    (row["id"], self._research_view_run_from_row(row)) for row in rows
                )

            combined_by_view: dict[str, dict[str, dict[str, Any]]] = {}
            for run in existing_runs.values():
                combined_by_view.setdefault(run["view_id"], {})[run["id"]] = run
            for run in normalized_runs:
                combined_by_view.setdefault(run["view_id"], {})[run["id"]] = run

            for view_id, nodes in combined_by_view.items():
                if not nodes:
                    continue
                baselines = [run for run in nodes.values() if not run["previous_run_id"]]
                if len(baselines) != 1:
                    raise AtlasError(
                        "research view run chain must contain exactly one baseline"
                    )
                successor_by_previous: dict[str, dict[str, Any]] = {}
                for run in nodes.values():
                    previous_id = run["previous_run_id"]
                    if not previous_id:
                        continue
                    previous = nodes.get(previous_id)
                    if previous is None:
                        raise NotFoundError(
                            "previous research view run does not exist in the import or target workspace"
                        )
                    if previous["view_id"] != view_id:
                        raise AtlasError("research view run predecessor is invalid")
                    if previous_id in successor_by_previous:
                        raise AtlasError("research view run chain contains a fork")
                    successor_by_previous[previous_id] = run

                ordered: list[dict[str, Any]] = []
                cursor: dict[str, Any] | None = baselines[0]
                while cursor is not None:
                    if cursor in ordered:
                        raise AtlasError("research view run predecessor chain contains a cycle")
                    ordered.append(cursor)
                    cursor = successor_by_previous.get(cursor["id"])
                if len(ordered) != len(nodes):
                    raise AtlasError("research view run chain is disconnected")

                previous: dict[str, Any] | None = None
                for sequence, run in enumerate(ordered, start=1):
                    declared_sequence = run.get("run_sequence")
                    if declared_sequence is not None and declared_sequence != sequence:
                        raise AtlasError("research view run sequence is not contiguous")
                    if run["id"] in run_by_id:
                        run["run_sequence"] = sequence
                    if previous is not None and parse_utc(previous["run_at"]) > parse_utc(run["run_at"]):
                        raise AtlasError("research view run time moves backwards")
                    expected_previous_id = previous["id"] if previous is not None else ""
                    if run["previous_run_id"] != expected_previous_id:
                        raise AtlasError("research view run predecessor is not adjacent")
                    expected_delta = self._research_run_delta(
                        run["view_kind"],
                        run["result"],
                        previous["result"] if previous is not None else None,
                        expected_previous_id,
                    )
                    if run["delta"] != expected_delta:
                        raise AtlasError(
                            "research view run delta does not match its predecessor result"
                        )
                    previous = run

            for bundle in normalized_bundles:
                run = run_by_id.get(bundle["view_run_id"])
                if run is None:
                    continue
                bundle_run = bundle["bundle"]["run"]
                bundle_sequence = bundle_run.get("run_sequence")
                if bundle_sequence is not None and bundle_sequence != run["run_sequence"]:
                    raise AtlasError(
                        "provenance bundle does not match its imported research view run"
                    )

            learning_actions: list[str] = []
            for item in normalized_learning:
                existing_learning = db.execute(
                    "SELECT * FROM learning_progress WHERE owner_id=? AND chapter_id=?",
                    (owner, item["chapter_id"]),
                ).fetchone()
                if existing_learning is None:
                    learning_actions.append("create")
                elif canonical(without_owner(self._learning_row_from_row(existing_learning))) == canonical(item):
                    learning_actions.append("reuse")
                else:
                    learning_actions.append("update")

            converters = {
                "saved_items": lambda row: without_owner(self._saved_item_from_row(row), "saved"),
                "research_digests": lambda row: without_owner(self._digest_from_row(row)),
                "research_views": lambda row: without_owner(self._research_view_from_row(row)),
                "research_view_runs": lambda row: without_owner(self._research_view_run_from_row(row)),
                "research_notifications": lambda row: without_owner(self._notification_from_row(row), "read"),
                "provenance_bundles": lambda row: without_owner(self._bundle_response_from_row(row)),
            }

            def classify(table: str, item: dict[str, Any], natural_sql: str = "", natural: tuple[Any, ...] = ()) -> bool:
                existing = db.execute(f"SELECT * FROM {table} WHERE id=?", (item["id"],)).fetchone()
                if existing is not None:
                    if existing["owner_id"] != owner:
                        raise ConflictError(f"{table} id belongs to a different owner")
                    if canonical(converters[table](existing)) != canonical(item):
                        raise ConflictError(f"{table} id already exists with different content")
                    return False
                if natural_sql:
                    collision = db.execute(natural_sql, natural).fetchone()
                    if collision is not None:
                        raise ConflictError(f"{table} natural identity already uses a different id")
                return True

            create_flags = {
                "saved_items": [
                    classify(
                        "saved_items",
                        item,
                        "SELECT id FROM saved_items WHERE owner_id=? AND item_kind=? AND item_ref=?",
                        (owner, item["item_kind"], item["item_ref"]),
                    )
                    for item in normalized_items
                ],
                "private_digests": [
                    classify(
                        "research_digests",
                        item,
                        """
                        SELECT id FROM research_digests
                        WHERE owner_id=? AND digest_type=? AND period_start=? AND period_end=?
                          AND as_of=? AND source_sha256=?
                        """,
                        (
                            owner,
                            item["digest_type"],
                            item["period_start"],
                            item["period_end"],
                            item["as_of"],
                            item["source_sha256"],
                        ),
                    )
                    for item in normalized_digests
                ],
                "research_views": [
                    classify(
                        "research_views",
                        item,
                        "SELECT id FROM research_views WHERE owner_id=? AND name=?",
                        (owner, item["name"]),
                    )
                    for item in normalized_views
                ],
                "research_view_runs": [
                    classify("research_view_runs", item) for item in normalized_runs
                ],
                "notifications": [
                    classify(
                        "research_notifications",
                        item,
                        "SELECT id FROM research_notifications WHERE owner_id=? AND dedupe_key=?",
                        (owner, item["dedupe_key"]),
                    )
                    for item in normalized_notifications
                ],
                "provenance_bundles": [
                    classify("provenance_bundles", item) for item in normalized_bundles
                ],
            }
            existing_view_count = int(
                db.execute("SELECT COUNT(*) FROM research_views WHERE owner_id=?", (owner,)).fetchone()[0]
            )
            if existing_view_count + sum(create_flags["research_views"]) > RESEARCH_VIEW_MAX_PER_OWNER:
                raise ConflictError("research view owner limit reached")

            if dry_value:
                created = {key: sum(flags) for key, flags in create_flags.items()}
                created["learning_progress"] = learning_actions.count("create")
                reused = {
                    key: len(flags) - created[key] for key, flags in create_flags.items()
                }
                reused["learning_progress"] = learning_actions.count("reuse")
                return {
                    **preview,
                    "created": created,
                    "updated": {"learning_progress": learning_actions.count("update")},
                    "reused": reused,
                }

            focus_changed = False
            if normalized_focus is not None:
                existing_focus = db.execute(
                    "SELECT * FROM focus_profiles WHERE owner_id=?", (owner,)
                ).fetchone()
                semantic_fields = (
                    "domains",
                    "keywords",
                    "source_keys",
                    "method_ids",
                    "problem_ids",
                    "thread_ids",
                )
                existing_payload = self._focus_from_row(existing_focus) if existing_focus else None
                focus_changed = existing_payload is None or any(
                    existing_payload[field] != normalized_focus[field] for field in semantic_fields
                )
                db.execute(
                    """
                    INSERT INTO focus_profiles(
                        owner_id, domains_json, keywords_json, source_keys_json,
                        method_ids_json, problem_ids_json, thread_ids_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(owner_id) DO UPDATE SET
                        domains_json=excluded.domains_json,
                        keywords_json=excluded.keywords_json,
                        source_keys_json=excluded.source_keys_json,
                        method_ids_json=excluded.method_ids_json,
                        problem_ids_json=excluded.problem_ids_json,
                        thread_ids_json=excluded.thread_ids_json,
                        updated_at=excluded.updated_at
                    """,
                    (
                        owner,
                        canonical(normalized_focus["domains"]),
                        canonical(normalized_focus["keywords"]),
                        canonical(normalized_focus["source_keys"]),
                        canonical(normalized_focus["method_ids"]),
                        canonical(normalized_focus["problem_ids"]),
                        canonical(normalized_focus["thread_ids"]),
                        existing_focus["created_at"] if existing_focus else normalized_focus["created_at"],
                        normalized_focus["updated_at"],
                    ),
                )

            for item, action in zip(normalized_learning, learning_actions):
                if action == "reuse":
                    continue
                db.execute(
                    """
                    INSERT INTO learning_progress(
                        owner_id, chapter_id, status, confidence, note, source,
                        started_at, last_reviewed_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(owner_id, chapter_id) DO UPDATE SET
                        status=excluded.status,
                        confidence=excluded.confidence,
                        note=excluded.note,
                        source=excluded.source,
                        started_at=excluded.started_at,
                        last_reviewed_at=excluded.last_reviewed_at,
                        updated_at=excluded.updated_at
                    """,
                    (
                        owner,
                        item["chapter_id"],
                        item["status"],
                        item["confidence"],
                        item["note"],
                        item["source"],
                        item["started_at"],
                        item["last_reviewed_at"],
                        item["updated_at"],
                    ),
                )

            for item, create in zip(normalized_items, create_flags["saved_items"]):
                if create:
                    db.execute(
                        """
                        INSERT INTO saved_items(
                            id, owner_id, item_kind, item_ref, title, tags_json, note, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["id"], owner, item["item_kind"], item["item_ref"], item["title"],
                            canonical(item["tags"]), item["note"], item["created_at"], item["updated_at"],
                        ),
                    )

            for item, create in zip(normalized_digests, create_flags["private_digests"]):
                if create:
                    db.execute(
                        """
                        INSERT INTO research_digests(
                            id, owner_id, digest_type, period_start, period_end, as_of,
                            scope_json, source_snapshot_json, content_json, markdown,
                            source_sha256, previous_digest_id, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                        """,
                        (
                            item["id"], owner, item["digest_type"], item["period_start"], item["period_end"],
                            item["as_of"], canonical(item["scope"]), canonical(item["source_snapshot"]),
                            canonical(item["content"]), item["markdown"], item["source_sha256"],
                            item["created_at"], item["updated_at"],
                        ),
                    )
            for item, create in zip(normalized_digests, create_flags["private_digests"]):
                if create and item["previous_digest_id"]:
                    db.execute(
                        "UPDATE research_digests SET previous_digest_id=? WHERE id=? AND owner_id=?",
                        (item["previous_digest_id"], item["id"], owner),
                    )

            for item, create in zip(normalized_views, create_flags["research_views"]):
                if create:
                    db.execute(
                        """
                        INSERT INTO research_views(
                            id, owner_id, name, description, view_kind, definition_json,
                            evidence_boundary_json, revision, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["id"], owner, item["name"], item["description"], item["view_kind"],
                            canonical(item["definition"]), canonical(item["evidence_boundary"]),
                            item["revision"], item["created_at"], item["updated_at"],
                        ),
                    )

            for item, create in zip(normalized_runs, create_flags["research_view_runs"]):
                if create:
                    db.execute(
                        """
                        INSERT INTO research_view_runs(
                            id, owner_id, view_id, view_name, view_kind, view_revision,
                            definition_json, evidence_boundary_json, search_snapshot_id,
                            result_json, result_sha256, run_sequence, previous_run_id, delta_json,
                            delta_sha256, run_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["id"], owner, item["view_id"], item["view_name"], item["view_kind"],
                            item["view_revision"], canonical(item["definition"]),
                            canonical(item["evidence_boundary"]), item["search_snapshot_id"],
                            canonical(item["result"]), item["result_sha256"], item["run_sequence"],
                            item["previous_run_id"],
                            canonical(item["delta"]), item["delta_sha256"], item["run_at"],
                        ),
                    )

            for item, create in zip(normalized_notifications, create_flags["notifications"]):
                if create:
                    db.execute(
                        """
                        INSERT INTO research_notifications(
                            id, owner_id, dedupe_key, notification_kind, evidence_level,
                            title, body, source_kind, source_ref, source_revision, payload_json,
                            first_seen_at, last_seen_at, read_at, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["id"], owner, item["dedupe_key"], item["notification_kind"],
                            item["evidence_level"], item["title"], item["body"], item["source_kind"],
                            item["source_ref"], item["source_revision"], canonical(item["payload"]),
                            item["first_seen_at"], item["last_seen_at"], item["read_at"],
                            item["created_at"], item["updated_at"],
                        ),
                    )

            for item, create in zip(normalized_bundles, create_flags["provenance_bundles"]):
                if create:
                    db.execute(
                        """
                        INSERT INTO provenance_bundles(
                            id, owner_id, view_run_id, manifest_json, bundle_json, markdown,
                            bundle_sha256, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item["id"], owner, item["view_run_id"], canonical(item["manifest"]),
                            canonical(item["bundle"]), item["markdown"], item["bundle_sha256"],
                            item["created_at"],
                        ),
                    )

            created = {key: sum(flags) for key, flags in create_flags.items()}
            created["learning_progress"] = learning_actions.count("create")
            reused = {key: len(flags) - created[key] for key, flags in create_flags.items()}
            reused["learning_progress"] = learning_actions.count("reuse")
            summary = {
                **preview,
                "imported": True,
                "focus_profile_updated": focus_changed,
                "created": created,
                "updated": {"learning_progress": learning_actions.count("update")},
                "reused": reused,
            }
            self._record_editor_audit(
                db,
                "atlas_imported",
                self._editor_actor(payload, required=False),
                entity_kind="research_data",
                entity_id=owner,
                after=summary,
                reason=self._editor_reason(payload, required=False)
                or "explicitly imported a versioned private research workspace",
            )
            return summary

    def import_research_data(self, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        """Validate a research export completely, then import it atomically."""
        if not isinstance(payload, dict):
            raise AtlasError("research data import payload must be an object")
        raw_schema_version = payload.get("schema_version")
        if isinstance(raw_schema_version, bool):
            raise AtlasError("research data import schema is invalid")
        try:
            schema_version = int(raw_schema_version or 0)
        except (TypeError, ValueError) as error:
            raise AtlasError("research data import schema is invalid") from error
        if isinstance(raw_schema_version, float) and raw_schema_version != schema_version:
            raise AtlasError("research data import schema is invalid")
        if schema_version == RESEARCH_DATA_SCHEMA_VERSION:
            return self._import_research_data_v2(payload, owner_id)
        if schema_version != 1:
            raise AtlasError("research data import schema is unsupported")
        focus = payload.get("focus_profile")
        saved = payload.get("saved_items")
        if not isinstance(focus, dict) or not isinstance(saved, list) or len(saved) > 500:
            raise AtlasError("research data import shape is invalid")
        dry_value = payload.get("dryRun", payload.get("dry_run", True))
        if not isinstance(dry_value, bool):
            raise AtlasError("dryRun must be a boolean")
        owner = compact_text(owner_id, 120) or "local"

        aliases = {
            "sourceKeys": "source_keys",
            "methodIds": "method_ids",
            "problemIds": "problem_ids",
            "threadIds": "thread_ids",
        }
        for key in ("domains", "keywords", *aliases.keys()):
            alternate = aliases.get(key, key)
            for candidate in {key, alternate}:
                if candidate in focus and focus[candidate] is not None and not isinstance(focus[candidate], list):
                    raise AtlasError(f"focus profile field {candidate} must be an array")
        normalized_focus = {
            "domains": clean_string_list(focus.get("domains"), 80, 20),
            "keywords": clean_string_list(focus.get("keywords"), 160, 50),
            "source_keys": clean_string_list(focus.get("sourceKeys") or focus.get("source_keys"), 120, 30),
            "method_ids": clean_string_list(focus.get("methodIds") or focus.get("method_ids"), 160, 50),
            "problem_ids": clean_string_list(focus.get("problemIds") or focus.get("problem_ids"), 160, 50),
            "thread_ids": clean_string_list(focus.get("threadIds") or focus.get("thread_ids"), 160, 50),
        }

        normalized_items: list[dict[str, Any]] = []
        for item in saved:
            if not isinstance(item, dict):
                raise AtlasError("saved item import entries must be objects")
            item_kind = compact_text(item.get("itemKind") or item.get("item_kind"), 40).lower()
            item_ref = compact_text(item.get("itemRef") or item.get("item_ref"), 500)
            if item_kind not in SAVED_ITEM_KINDS or not item_ref:
                raise AtlasError("saved item type or reference is invalid")
            if "tags" in item and item["tags"] is not None and not isinstance(item["tags"], list):
                raise AtlasError("saved item tags must be an array")
            normalized_items.append(
                {
                    "item_kind": item_kind,
                    "item_ref": item_ref,
                    "title": compact_text(item.get("title"), 500),
                    "tags": clean_string_list(item.get("tags"), 120, 20),
                    "note": clean_multiline_text(item.get("note"), 4000),
                }
            )

        preview = {"focus_profile": True, "saved_items": len(normalized_items), "dry_run": dry_value}
        with self._lock, self.connect() as db:
            for field, kind in (("method_ids", "method"), ("problem_ids", "problem"), ("thread_ids", "thread")):
                for entity_id in normalized_focus[field]:
                    entity = db.execute(
                        "SELECT status FROM knowledge_entities WHERE id=? AND entity_kind=?",
                        (entity_id, kind),
                    ).fetchone()
                    if entity is None or entity["status"] == "merged":
                        raise NotFoundError(f"关注的{kind}实体不存在")
            # Saved knowledge entities must resolve before the focus profile or
            # any saved item is written.  Paper/project references may point to
            # an as-yet-unimported Paperfield object, so those remain portable
            # external references and are intentionally not required here.
            knowledge_item_kinds = {"method", "problem", "thread", "term"}
            for item in normalized_items:
                if item["item_kind"] not in knowledge_item_kinds:
                    continue
                entity = db.execute(
                    "SELECT status FROM knowledge_entities WHERE id=? AND entity_kind=?",
                    (item["item_ref"], item["item_kind"]),
                ).fetchone()
                if entity is None or entity["status"] == "merged":
                    raise NotFoundError(f"保存的{item['item_kind']}实体不存在")
            if dry_value:
                return preview

            now = utc_now()
            existing_focus = db.execute("SELECT created_at FROM focus_profiles WHERE owner_id=?", (owner,)).fetchone()
            db.execute(
                """
                INSERT INTO focus_profiles(
                    owner_id, domains_json, keywords_json, source_keys_json,
                    method_ids_json, problem_ids_json, thread_ids_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(owner_id) DO UPDATE SET
                    domains_json=excluded.domains_json,
                    keywords_json=excluded.keywords_json,
                    source_keys_json=excluded.source_keys_json,
                    method_ids_json=excluded.method_ids_json,
                    problem_ids_json=excluded.problem_ids_json,
                    thread_ids_json=excluded.thread_ids_json,
                    updated_at=excluded.updated_at
                """,
                (
                    owner,
                    json.dumps(normalized_focus["domains"], ensure_ascii=False),
                    json.dumps(normalized_focus["keywords"], ensure_ascii=False),
                    json.dumps(normalized_focus["source_keys"], ensure_ascii=False),
                    json.dumps(normalized_focus["method_ids"], ensure_ascii=False),
                    json.dumps(normalized_focus["problem_ids"], ensure_ascii=False),
                    json.dumps(normalized_focus["thread_ids"], ensure_ascii=False),
                    existing_focus["created_at"] if existing_focus else now,
                    now,
                ),
            )
            focus_row = db.execute("SELECT * FROM focus_profiles WHERE owner_id=?", (owner,)).fetchone()
            assert focus_row is not None
            self._record_editor_audit(
                db,
                "focus_profile_updated",
                self._editor_actor(payload, required=False),
                entity_kind="focus_profile",
                entity_id=owner,
                after=self._focus_from_row(focus_row),
                reason=self._editor_reason(payload, required=False),
            )
            imported = 0
            for item in normalized_items:
                existing = db.execute(
                    "SELECT * FROM saved_items WHERE owner_id=? AND item_kind=? AND item_ref=?",
                    (owner, item["item_kind"], item["item_ref"]),
                ).fetchone()
                item_id = existing["id"] if existing else str(uuid.uuid4())
                db.execute(
                    """
                    INSERT INTO saved_items(id, owner_id, item_kind, item_ref, title, tags_json, note, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(owner_id, item_kind, item_ref) DO UPDATE SET
                        title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE saved_items.title END,
                        tags_json=excluded.tags_json,
                        note=excluded.note,
                        updated_at=excluded.updated_at
                    """,
                    (
                        item_id, owner, item["item_kind"], item["item_ref"], item["title"],
                        json.dumps(item["tags"], ensure_ascii=False), item["note"],
                        existing["created_at"] if existing else now, now,
                    ),
                )
                imported += 1
            self._record_editor_audit(
                db,
                "atlas_imported",
                "本地编辑",
                entity_kind="research_data",
                entity_id=owner,
                after={"saved_items": imported},
                reason="经显式确认导入版本化研究数据",
            )
            return {**preview, "saved_items": imported, "imported": True}

    def runtime_diagnostics(self) -> dict[str, Any]:
        with self.connect() as db:
            schema_row = db.execute("SELECT value FROM app_metadata WHERE key='schema_version'").fetchone()
            migrations = [
                {"version": row["version"], "name": row["name"], "checksum": row["checksum"], "applied_at": row["applied_at"]}
                for row in db.execute("SELECT * FROM schema_migrations ORDER BY version").fetchall()
            ]
            running_tasks = int(db.execute("SELECT COUNT(*) FROM analysis_requests WHERE status='running'").fetchone()[0])
            leased_tasks = int(db.execute("SELECT COUNT(*) FROM analysis_requests WHERE lease_token_sha256<>''").fetchone()[0])
        return {
            "generated_at": utc_now(),
            "database": {
                "schema_version": int(schema_row["value"]) if schema_row else 0,
                "byte_size": self.path.stat().st_size if self.path.exists() else 0,
                "journal_mode": "WAL",
                "migrations": migrations,
            },
            "worker": {**self.worker_activity(), "running_tasks": running_tasks, "leased_tasks": leased_tasks},
            "scanner": {
                "paper_source": self.frontier_source_state(),
                "update_source": self.frontier_update_source_state(),
            },
            "paperfield_sync": {
                "checkpoint": self.paperfield_sync_checkpoint(),
                "recent_runs": self.list_paperfield_sync_runs(10),
            },
        }

    @staticmethod
    def _requested_sections(value: Any) -> list[str]:
        requested = value if isinstance(value, list) else []
        result = [key for key, _label in ANALYSIS_STAGES if key in requested]
        return result or ["method", "math", "experiments", "code", "lineage"]

    @staticmethod
    def _material_authorization_payload(payload: dict[str, Any]) -> tuple[bool, bool] | None:
        if "materialAuthorization" in payload:
            raw = payload["materialAuthorization"]
        elif "material_authorization" in payload:
            raw = payload["material_authorization"]
        else:
            raw = None
        if raw is None:
            return None
        if not isinstance(raw, dict):
            raise AtlasError("materialAuthorization 必须是对象")
        download = raw.get("allowPublicPdfDownload", raw.get("allow_public_pdf_download"))
        external = raw.get("allowExternalModelProcessing", raw.get("allow_external_model_processing"))
        if not isinstance(download, bool) or not isinstance(external, bool):
            raise AtlasError("材料授权必须明确提供两个布尔选项")
        if external and not download:
            raise AtlasError("外部模型处理授权依赖公开 PDF 下载授权")
        return download, external

    @staticmethod
    def _authorization_mode(download: bool, external: bool) -> str:
        if download and external:
            return "public_pdf_external"
        if download:
            return "public_pdf_local"
        return "none"

    def _set_material_authorization_with_db(
        self,
        db: sqlite3.Connection,
        task_id: str,
        download: bool,
        external: bool,
    ) -> dict[str, Any]:
        task = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
        if not task:
            raise NotFoundError("分析任务不存在")
        material = db.execute(
            "SELECT * FROM analysis_materials WHERE analysis_request_id=?",
            (task_id,),
        ).fetchone()
        if not material:
            raise NotFoundError("分析材料记录不存在")
        now = utc_now()
        if task["lease_token_sha256"] and (not task["lease_expires_at"] or task["lease_expires_at"] > now):
            raise ConflictError("执行器已领取任务，当前不能修改材料授权")
        if task["status"] in {"cancelled", "completed"}:
            raise ConflictError(f"任务处于 {task['status']}，不能修改材料授权")
        if external and not download:
            raise AtlasError("外部模型处理授权依赖公开 PDF 下载授权")
        source_url = material["source_url"]
        if download and not source_url:
            raise ConflictError("论文没有可授权下载的公开 PDF URL")
        if not download and material["status"] in {"downloaded", "parsing", "ready"}:
            raise ConflictError("公开 PDF 已进入 Atlas 材料目录，不能通过取消勾选删除；请先保留本地授权")
        completed_or_running = db.execute(
            """
            SELECT 1 FROM analysis_stage_runs
            WHERE analysis_request_id=? AND status IN ('running', 'completed')
            LIMIT 1
            """,
            (task_id,),
        ).fetchone()
        if completed_or_running and not external and material["external_processing_authorized"]:
            raise ConflictError("任务已经调用模型，不能追溯撤销外部处理授权")
        if not source_url:
            status = "unavailable"
        elif not download:
            status = "awaiting_authorization"
        elif material["status"] == "ready":
            status = "ready"
        else:
            status = "authorized"
        mode = self._authorization_mode(download, external)
        db.execute(
            """
            UPDATE analysis_materials
            SET authorization_mode=?, download_authorized=?, external_processing_authorized=?,
                status=?, authorized_at=?, updated_at=?, error_text=''
            WHERE analysis_request_id=?
            """,
            (mode, int(download), int(external), status, now if download else None, now, task_id),
        )
        updated = db.execute(
            "SELECT * FROM analysis_materials WHERE analysis_request_id=?",
            (task_id,),
        ).fetchone()
        return self._material_from_row(updated) or {}

    def authorize_analysis_material(self, task_id: str, payload: dict[str, Any], owner_id: str = "local") -> dict[str, Any]:
        authorization = self._material_authorization_payload({"materialAuthorization": payload})
        assert authorization is not None
        with self._lock, self.connect() as db:
            self._expire_worker_leases_with_db(db)
            material = self._set_material_authorization_with_db(db, task_id, *authorization)
            task = db.execute(
                "SELECT * FROM analysis_requests WHERE id=? AND owner_id=?",
                (task_id, compact_text(owner_id, 120) or "local"),
            ).fetchone()
            if task is None:
                raise NotFoundError("分析任务不存在")
            return {"material": material, "task": self._task_from_row(db, task)}

    def _create_analysis_with_db(
        self,
        db: sqlite3.Connection,
        payload: dict[str, Any],
        paper: dict[str, Any] | None = None,
        allow_material_authorization: bool = True,
        owner_id: str = "local",
    ) -> tuple[dict[str, Any], bool]:
        owner = compact_text(owner_id, 120) or "local"
        paper = paper or self._upsert_paper_with_db(db, payload.get("paper") or payload)
        sections = self._requested_sections(payload.get("sections") or payload.get("requested_sections"))
        version = compact_text(payload.get("sourceVersion") or payload.get("source_version") or paper.get("current_version"), 40)
        active = db.execute(
            """
            SELECT * FROM analysis_requests
            WHERE canonical_paper_id=? AND source_version=? AND owner_id=?
              AND status IN ('queued', 'running', 'paused', 'partial', 'completed')
            ORDER BY created_at DESC
            """,
            (paper["id"], version, owner),
        ).fetchall()
        for row in active:
            if json.loads(row["requested_sections_json"] or "[]") == sections:
                authorization = self._material_authorization_payload(payload) if allow_material_authorization else None
                if authorization is not None:
                    self._set_material_authorization_with_db(db, row["id"], *authorization)
                return self._task_from_row(db, row), True

        now = utc_now()
        task_id = str(uuid.uuid4())
        progress = [
            {"key": key, "label": label, "status": "pending", "percent": 0}
            for key, label in ANALYSIS_STAGES
            if key in sections or key in {"structure", "claims", "citations"}
        ]
        trigger = compact_text(payload.get("trigger") or "explicit_button", 80)
        if trigger not in {"explicit_button", "reading_status", "editorial_queue"}:
            trigger = "explicit_button"
        sha256 = compact_text(payload.get("sourceSha256") or payload.get("source_sha256"), 128).lower()
        if sha256 and not re.fullmatch(r"[a-f0-9]{64}", sha256):
            raise AtlasError("source SHA-256 格式无效")
        db.execute(
            """
            INSERT INTO analysis_requests(
                id, canonical_paper_id, owner_id, trigger, requested_sections_json,
                source_version, source_sha256, status, progress_json,
                created_at, updated_at, error_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, '')
            """,
            (
                task_id, paper["id"], owner, trigger, json.dumps(sections, ensure_ascii=False),
                version, sha256, json.dumps(progress, ensure_ascii=False), now, now,
            ),
        )
        for position, item in enumerate(progress):
            db.execute(
                """
                INSERT INTO analysis_stage_runs(
                    analysis_request_id, stage_key, stage_label, position, attempt,
                    status, percent, updated_at
                ) VALUES (?, ?, ?, ?, 1, 'pending', 0, ?)
                """,
                (task_id, item["key"], item["label"], position, now),
            )
        source_url = clean_http_url(paper.get("pdf_url"))
        db.execute(
            """
            INSERT INTO analysis_materials(
                id, analysis_request_id, canonical_paper_id, authorization_mode,
                source_url, download_authorized, external_processing_authorized,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, 'none', ?, 0, 0, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                task_id,
                paper["id"],
                source_url,
                "awaiting_authorization" if source_url else "unavailable",
                now,
                now,
            ),
        )
        authorization = self._material_authorization_payload(payload) if allow_material_authorization else None
        if authorization is not None:
            self._set_material_authorization_with_db(db, task_id, *authorization)
        row = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
        assert row is not None
        return self._task_from_row(db, row), False

    def create_analysis_request(self, payload: dict[str, Any], owner_id: str = "local") -> tuple[dict[str, Any], bool]:
        with self._lock, self.connect() as db:
            return self._create_analysis_with_db(db, payload, owner_id=owner_id)

    def get_analysis_request(self, task_id: str, owner_id: str = "local") -> dict[str, Any]:
        with self.connect() as db:
            row = db.execute(
                "SELECT * FROM analysis_requests WHERE id=? AND owner_id=?",
                (task_id, compact_text(owner_id, 120) or "local"),
            ).fetchone()
            if not row:
                raise NotFoundError("分析任务不存在")
            return self._task_from_row(db, row)

    def list_analysis_requests(self, limit: int = 100, owner_id: str = "local") -> list[dict[str, Any]]:
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM analysis_requests WHERE owner_id=? ORDER BY created_at DESC LIMIT ?",
                (compact_text(owner_id, 120) or "local", limit),
            ).fetchall()
            return [self._task_from_row(db, row) for row in rows]

    @staticmethod
    def _touch_worker_with_db(db: sqlite3.Connection, worker_id: str) -> None:
        now = utc_now()
        db.execute(
            "INSERT INTO app_metadata(key, value) VALUES('worker_last_seen', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (now,),
        )
        db.execute(
            "INSERT INTO app_metadata(key, value) VALUES('worker_last_id', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (worker_id,),
        )

    def worker_activity(self) -> dict[str, Any]:
        with self.connect() as db:
            values = {
                row["key"]: row["value"]
                for row in db.execute(
                    "SELECT key, value FROM app_metadata WHERE key IN ('worker_last_seen', 'worker_last_id')"
                ).fetchall()
            }
        last_seen = values.get("worker_last_seen", "")
        parsed = parse_utc(last_seen)
        recent = bool(parsed and datetime.now(timezone.utc) - parsed <= timedelta(seconds=120))
        return {"connected": recent, "last_seen": last_seen, "worker_id": values.get("worker_last_id", "")}

    def worker_claim_diagnostics(self) -> dict[str, Any]:
        """Return a read-only worker queue snapshot.

        This intentionally does not expire leases or touch ``app_metadata``;
        callers can use it for a dry-run without changing task state.
        """
        now = utc_now()
        with self.connect() as db:
            status_rows = db.execute(
                "SELECT status, COUNT(*) AS count FROM analysis_requests GROUP BY status"
            ).fetchall()
            status_counts = {str(row["status"]): int(row["count"]) for row in status_rows}
            claimable = db.execute(
                """
                SELECT request.id, request.status, material.status AS material_status,
                       material.external_processing_authorized,
                       COUNT(*) OVER() AS claimable_count
                FROM analysis_requests request
                JOIN analysis_materials material ON material.analysis_request_id=request.id
                WHERE request.status IN ('queued', 'running')
                  AND request.lease_token_sha256=''
                  AND material.download_authorized=1
                  AND material.source_url<>''
                  AND (material.status='authorized' OR
                       (material.status='ready' AND material.external_processing_authorized=1))
                ORDER BY request.created_at, request.id
                LIMIT 1
                """
            ).fetchone()
            active_leases = int(
                db.execute(
                    "SELECT COUNT(*) FROM analysis_requests WHERE lease_token_sha256<>'' AND lease_expires_at> ?",
                    (now,),
                ).fetchone()[0]
            )
            expired_leases = int(
                db.execute(
                    "SELECT COUNT(*) FROM analysis_requests WHERE lease_token_sha256<>'' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?",
                    (now,),
                ).fetchone()[0]
            )
        activity = self.worker_activity()
        return {
            "claimable": bool(claimable),
            "claimable_count": int(claimable["claimable_count"]) if claimable else 0,
            "next_task_id": str(claimable["id"]) if claimable else "",
            "next_purpose": (
                "analyze" if claimable and claimable["external_processing_authorized"] else "prepare"
                if claimable else ""
            ),
            "active_leases": active_leases,
            "expired_leases": expired_leases,
            "status_counts": status_counts,
            "worker_id": activity["worker_id"],
            "last_seen": activity["last_seen"],
            "connected": activity["connected"],
            "dry_run": True,
            "writes_performed": False,
        }

    def scanner_diagnostics(self) -> dict[str, Any]:
        """Return bounded scanner state without changing source-run rows."""
        with self.connect() as db:
            latest_rows = db.execute(
                """
                SELECT id, source_name, status, started_at, finished_at,
                       fetched_count, accepted_count, new_count, updated_count,
                       unchanged_count, error_text
                FROM frontier_source_runs
                ORDER BY started_at DESC
                LIMIT 10
                """
            ).fetchall()
            running = int(
                db.execute("SELECT COUNT(*) FROM frontier_source_runs WHERE status='running'").fetchone()[0]
            )
            candidates = int(db.execute("SELECT COUNT(*) FROM frontier_candidates").fetchone()[0])
            updates = int(db.execute("SELECT COUNT(*) FROM frontier_updates").fetchone()[0])
        runs = []
        for row in latest_rows:
            runs.append(
                {
                    "id": row["id"],
                    "source_name": row["source_name"],
                    "status": row["status"],
                    "started_at": row["started_at"],
                    "finished_at": row["finished_at"],
                    "fetched_count": row["fetched_count"],
                    "accepted_count": row["accepted_count"],
                    "new_count": row["new_count"],
                    "updated_count": row["updated_count"],
                    "unchanged_count": row["unchanged_count"],
                    "error": compact_text(row["error_text"], 500),
                }
            )
        return {
            "running_count": running,
            "candidate_count": candidates,
            "update_count": updates,
            "latest_runs": runs,
            "dry_run": True,
            "writes_performed": False,
        }

    def runtime_diagnostics(self, worker_configured: bool = False) -> dict[str, Any]:
        with self.connect() as db:
            version_row = db.execute(
                "SELECT value FROM app_metadata WHERE key='schema_version'"
            ).fetchone()
            try:
                schema_version = int(version_row["value"]) if version_row else 0
            except (TypeError, ValueError):
                schema_version = 0
        try:
            size = self.path.stat().st_size
        except OSError:
            size = 0
        return {
            "database": {
                "schema_version": schema_version,
                "supported_schema_version": SCHEMA_VERSION,
                "size_bytes": size,
                "integrity": "ok",
            },
            "worker": {
                "configured": bool(worker_configured),
                **self.worker_claim_diagnostics(),
            },
            "scanner": self.scanner_diagnostics(),
            "dry_run": True,
            "writes_performed": False,
        }

    def _expire_worker_leases_with_db(self, db: sqlite3.Connection) -> int:
        now = utc_now()
        expired = db.execute(
            """
            SELECT * FROM analysis_requests
            WHERE lease_token_sha256<>'' AND lease_expires_at IS NOT NULL AND lease_expires_at<=?
            ORDER BY lease_expires_at
            """,
            (now,),
        ).fetchall()
        for task in expired:
            latest_stages = self._latest_stage_rows(db, task["id"])
            for stage in latest_stages:
                if stage["status"] != "running":
                    continue
                error_text = "worker lease 已过期；该 attempt 未完成"
                db.execute(
                    """
                    UPDATE analysis_stage_runs
                    SET status='failed', finished_at=?, updated_at=?, error_text=?
                    WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                    """,
                    (now, now, error_text, task["id"], stage["stage_key"], stage["attempt"]),
                )
                db.execute(
                    """
                    INSERT INTO analysis_stage_runs(
                        analysis_request_id, stage_key, stage_label, position, attempt,
                        status, percent, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
                    """,
                    (
                        task["id"],
                        stage["stage_key"],
                        stage["stage_label"],
                        stage["position"],
                        stage["attempt"] + 1,
                        now,
                    ),
                )
            material = db.execute(
                "SELECT * FROM analysis_materials WHERE analysis_request_id=?",
                (task["id"],),
            ).fetchone()
            if material and material["status"] in MATERIAL_ACTIVE_STATUS:
                db.execute(
                    """
                    UPDATE analysis_materials
                    SET status='authorized', updated_at=?, error_text='worker lease 已过期，材料处理可安全重试'
                    WHERE analysis_request_id=?
                    """,
                    (now, task["id"]),
                )
            db.execute(
                """
                UPDATE analysis_requests
                SET lease_owner='', lease_token_sha256='', lease_expires_at=NULL, lease_heartbeat_at=NULL,
                    updated_at=?
                WHERE id=?
                """,
                (now, task["id"]),
            )
            self._refresh_task_state(db, task["id"])
        return len(expired)

    def claim_analysis_request(
        self,
        worker_id: str,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> dict[str, Any] | None:
        normalized_worker_id = compact_text(worker_id, 120)
        if not re.fullmatch(r"[A-Za-z0-9._:-]{3,120}", normalized_worker_id):
            raise AtlasError("workerId 格式无效")
        try:
            duration = int(lease_seconds)
        except (TypeError, ValueError) as error:
            raise AtlasError("leaseSeconds 必须是整数") from error
        duration = max(MIN_LEASE_SECONDS, min(MAX_LEASE_SECONDS, duration))
        with self._lock, self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._expire_worker_leases_with_db(db)
            task = db.execute(
                """
                SELECT request.*
                FROM analysis_requests request
                JOIN analysis_materials material ON material.analysis_request_id=request.id
                WHERE request.status IN ('queued', 'running')
                  AND request.lease_token_sha256=''
                  AND material.download_authorized=1
                  AND material.source_url<>''
                  AND (
                    material.status='authorized'
                    OR (material.status='ready' AND material.external_processing_authorized=1)
                  )
                ORDER BY request.created_at, request.id
                LIMIT 1
                """
            ).fetchone()
            self._touch_worker_with_db(db, normalized_worker_id)
            if not task:
                return None
            token = f"{uuid.uuid4().hex}{uuid.uuid4().hex}"
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            expires_at = utc_after(duration)
            now = utc_now()
            changed = db.execute(
                """
                UPDATE analysis_requests
                SET lease_owner=?, lease_token_sha256=?, lease_expires_at=?, lease_heartbeat_at=?,
                    worker_claim_count=worker_claim_count+1, updated_at=?
                WHERE id=? AND lease_token_sha256=''
                """,
                (normalized_worker_id, token_hash, expires_at, now, now, task["id"]),
            ).rowcount
            if changed != 1:
                raise ConflictError("分析任务已被其他执行器领取")
            updated = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task["id"],)).fetchone()
            assert updated is not None
            task_payload = self._task_from_row(db, updated)
            purpose = "analyze" if task_payload["material"]["external_processing_authorized"] else "prepare"
            return {
                "task": task_payload,
                "leaseToken": token,
                "leaseExpiresAt": expires_at,
                "purpose": purpose,
            }

    def _validate_worker_lease_with_db(
        self,
        db: sqlite3.Connection,
        task_id: str,
        lease_token: str,
        allow_never_claimed: bool = False,
    ) -> sqlite3.Row:
        task = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
        if not task:
            raise NotFoundError("分析任务不存在")
        if not task["lease_token_sha256"]:
            if allow_never_claimed and not task["worker_claim_count"]:
                return task
            raise ConflictError("任务当前没有有效的 worker lease")
        if not task["lease_expires_at"] or task["lease_expires_at"] <= utc_now():
            raise ConflictError("worker lease 已过期")
        provided_hash = hashlib.sha256(str(lease_token or "").encode("utf-8")).hexdigest()
        if not hmac.compare_digest(provided_hash, task["lease_token_sha256"]):
            raise UnauthorizedError("worker lease token 无效")
        return task

    def validate_worker_lease(self, task_id: str, lease_token: str, allow_never_claimed: bool = False) -> None:
        with self.connect() as db:
            self._validate_worker_lease_with_db(db, task_id, lease_token, allow_never_claimed)

    def heartbeat_worker_lease(
        self,
        task_id: str,
        lease_token: str,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> dict[str, Any]:
        try:
            duration = max(MIN_LEASE_SECONDS, min(MAX_LEASE_SECONDS, int(lease_seconds)))
        except (TypeError, ValueError) as error:
            raise AtlasError("leaseSeconds 必须是整数") from error
        with self._lock, self.connect() as db:
            task = self._validate_worker_lease_with_db(db, task_id, lease_token)
            now = utc_now()
            expires_at = utc_after(duration)
            db.execute(
                """
                UPDATE analysis_requests SET lease_expires_at=?, lease_heartbeat_at=?, updated_at=? WHERE id=?
                """,
                (expires_at, now, now, task_id),
            )
            self._touch_worker_with_db(db, task["lease_owner"])
            return {"taskId": task_id, "leaseExpiresAt": expires_at}

    def release_worker_lease(self, task_id: str, lease_token: str) -> dict[str, Any]:
        with self._lock, self.connect() as db:
            task = self._validate_worker_lease_with_db(db, task_id, lease_token)
            now = utc_now()
            db.execute(
                """
                UPDATE analysis_requests
                SET lease_owner='', lease_token_sha256='', lease_expires_at=NULL, lease_heartbeat_at=NULL,
                    updated_at=?
                WHERE id=?
                """,
                (now, task_id),
            )
            self._touch_worker_with_db(db, task["lease_owner"])
            updated = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
            assert updated is not None
            return self._task_from_row(db, updated)

    def get_analysis_stage(self, task_id: str, stage_key: str) -> dict[str, Any]:
        if stage_key not in ANALYSIS_STAGE_KEYS:
            raise AtlasError("未知分析阶段")
        with self.connect() as db:
            task = db.execute("SELECT 1 FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
            if not task:
                raise NotFoundError("分析任务不存在")
            rows = db.execute(
                """
                SELECT * FROM analysis_stage_runs
                WHERE analysis_request_id=? AND stage_key=?
                ORDER BY attempt DESC
                """,
                (task_id, stage_key),
            ).fetchall()
            if not rows:
                raise NotFoundError("任务不包含该分析阶段")
            attempts = [self._stage_from_row(row, include_content=True) for row in rows]
            return {"current": attempts[0], "attempts": attempts}

    def update_analysis_material(
        self,
        task_id: str,
        action: str,
        payload: dict[str, Any],
        lease_token: str,
    ) -> dict[str, Any]:
        if action not in {"download-start", "downloaded", "parse-start", "ready", "fail"}:
            raise AtlasError("未知材料操作")
        with self._lock, self.connect() as db:
            task = self._validate_worker_lease_with_db(db, task_id, lease_token)
            material = db.execute(
                "SELECT * FROM analysis_materials WHERE analysis_request_id=?",
                (task_id,),
            ).fetchone()
            if not material:
                raise NotFoundError("分析材料记录不存在")
            if not material["download_authorized"]:
                raise ConflictError("公开 PDF 下载尚未获得用户授权")
            now = utc_now()
            if action == "download-start":
                if material["status"] not in {"authorized", "ready"}:
                    raise ConflictError(f"材料处于 {material['status']}，不能开始下载")
                db.execute(
                    """
                    UPDATE analysis_materials
                    SET status='downloading', download_started_at=?, updated_at=?, error_text=''
                    WHERE analysis_request_id=?
                    """,
                    (now, now, task_id),
                )
            elif action == "downloaded":
                if material["status"] != "downloading":
                    raise ConflictError(f"材料处于 {material['status']}，不能标记下载完成")
                source_sha256 = compact_text(payload.get("sourceSha256") or payload.get("source_sha256"), 128).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
                    raise AtlasError("下载完成必须记录有效的 source SHA-256")
                if task["source_sha256"] and task["source_sha256"] != source_sha256:
                    raise ConflictError("下载材料的 SHA-256 与任务已记录材料不一致")
                try:
                    byte_size = int(payload.get("byteSize") or payload.get("byte_size"))
                except (TypeError, ValueError) as error:
                    raise AtlasError("下载材料必须记录字节数") from error
                if byte_size < 5 or byte_size > 1024 * 1024 * 1024:
                    raise AtlasError("下载材料字节数超出有效范围")
                media_type = compact_text(payload.get("mediaType") or payload.get("media_type"), 160)
                db.execute(
                    """
                    UPDATE analysis_materials
                    SET status='downloaded', media_type=?, source_sha256=?, byte_size=?,
                        downloaded_at=?, updated_at=?, error_text=''
                    WHERE analysis_request_id=?
                    """,
                    (media_type, source_sha256, byte_size, now, now, task_id),
                )
            elif action == "parse-start":
                if material["status"] != "downloaded":
                    raise ConflictError(f"材料处于 {material['status']}，不能开始解析")
                db.execute(
                    "UPDATE analysis_materials SET status='parsing', updated_at=? WHERE analysis_request_id=?",
                    (now, task_id),
                )
            elif action == "ready":
                if material["status"] not in {"downloaded", "parsing"}:
                    raise ConflictError(f"材料处于 {material['status']}，不能标记解析完成")
                source_sha256 = compact_text(
                    payload.get("sourceSha256") or payload.get("source_sha256") or material["source_sha256"],
                    128,
                ).lower()
                if not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
                    raise AtlasError("解析完成必须记录有效的 source SHA-256")
                if task["source_sha256"] and task["source_sha256"] != source_sha256:
                    raise ConflictError("解析材料的 SHA-256 与任务已记录材料不一致")
                try:
                    page_count = int(payload.get("pageCount") or payload.get("page_count"))
                    extracted_characters = int(
                        payload.get("extractedCharacters") or payload.get("extracted_characters")
                    )
                except (TypeError, ValueError) as error:
                    raise AtlasError("解析完成必须记录页数和提取字符数") from error
                if page_count < 1 or page_count > 10000 or extracted_characters < 1:
                    raise AtlasError("解析统计超出有效范围")
                db.execute(
                    """
                    UPDATE analysis_materials
                    SET status='ready', source_sha256=?, page_count=?, extracted_characters=?,
                        parsed_at=?, updated_at=?, error_text=''
                    WHERE analysis_request_id=?
                    """,
                    (source_sha256, page_count, extracted_characters, now, now, task_id),
                )
                db.execute(
                    "UPDATE analysis_requests SET source_sha256=?, updated_at=? WHERE id=?",
                    (source_sha256, now, task_id),
                )
            else:
                error_text = clean_multiline_text(payload.get("error") or payload.get("errorText"), 4000)
                if not error_text:
                    raise AtlasError("材料失败必须记录错误原因")
                db.execute(
                    """
                    UPDATE analysis_materials SET status='failed', updated_at=?, error_text=?
                    WHERE analysis_request_id=?
                    """,
                    (now, error_text, task_id),
                )
            updated_material = db.execute(
                "SELECT * FROM analysis_materials WHERE analysis_request_id=?",
                (task_id,),
            ).fetchone()
            updated_task = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
            assert updated_task is not None
            return {
                "material": self._material_from_row(updated_material),
                "task": self._task_from_row(db, updated_task),
            }

    @staticmethod
    def _combined_value(values: list[str], empty: str = "") -> str:
        unique = list(dict.fromkeys(value for value in values if value))
        if not unique:
            return empty
        return unique[0] if len(unique) == 1 else "mixed"

    @staticmethod
    def _combined_hash(values: list[str]) -> str:
        unique = list(dict.fromkeys(value for value in values if value))
        return unique[0] if len(unique) == 1 else ""

    def _refresh_task_state(self, db: sqlite3.Connection, task_id: str) -> str:
        task = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
        if not task:
            raise NotFoundError("分析任务不存在")
        stages = self._latest_stage_rows(db, task_id)
        statuses = [row["status"] for row in stages]
        if statuses and all(status == "completed" for status in statuses):
            status = "completed"
        elif any(item == "failed" for item in statuses):
            status = "partial" if any(item == "completed" for item in statuses) else "failed"
        elif any(item == "running" for item in statuses):
            status = "running"
        elif any(item == "pending" for item in statuses):
            status = "running" if any(item == "completed" for item in statuses) else "queued"
        elif any(item == "paused" for item in statuses):
            status = "paused"
        elif any(item == "cancelled" for item in statuses):
            status = "partial" if any(item == "completed" for item in statuses) else "cancelled"
        else:
            status = "queued"
        progress = [self._stage_from_row(row) for row in stages]
        errors = [row["error_text"] for row in stages if row["status"] == "failed" and row["error_text"]]
        started_at = task["started_at"]
        if status in {"running", "partial", "failed", "completed"} and not started_at:
            started_at = utc_now()
        finished_at = utc_now() if status in {"partial", "failed", "completed", "cancelled"} else None
        db.execute(
            """
            UPDATE analysis_requests
            SET status=?, progress_json=?, started_at=?, finished_at=?, updated_at=?, error_text=?
            WHERE id=?
            """,
            (
                status,
                json.dumps(progress, ensure_ascii=False),
                started_at,
                finished_at,
                utc_now(),
                "；".join(errors)[:4000],
                task_id,
            ),
        )
        db.execute(
            "UPDATE paper_analyses SET status=?, updated_at=? WHERE analysis_request_id=?",
            ("completed" if status == "completed" else "partial", utc_now(), task_id),
        )
        return status

    def _upsert_paper_analysis(
        self,
        db: sqlite3.Connection,
        task: sqlite3.Row,
        stage: sqlite3.Row,
        content: dict[str, Any],
    ) -> None:
        existing = db.execute(
            "SELECT * FROM paper_analyses WHERE analysis_request_id=?",
            (task["id"],),
        ).fetchone()
        previous_content = json.loads(existing["content_json"] or "{}") if existing else {}
        now = utc_now()
        previous_content[stage["stage_key"]] = {
            **content,
            "source_basis": stage["source_basis"],
            "source_sha256": stage["source_sha256"],
            "model": stage["model"],
            "prompt_version": stage["prompt_version"],
            "generated_at": stage["finished_at"] or now,
            "attempt": stage["attempt"],
        }
        ordered_sections = [
            key for key, _label in ANALYSIS_STAGES
            if key in previous_content
        ]
        source_bases = [previous_content[key].get("source_basis", "") for key in ordered_sections]
        models = [previous_content[key].get("model", "") for key in ordered_sections]
        prompts = [previous_content[key].get("prompt_version", "") for key in ordered_sections]
        hashes = [previous_content[key].get("source_sha256", "") for key in ordered_sections]
        combined_basis = self._combined_value(source_bases, "metadata")
        analysis_level = "abstract" if all(value in {"metadata", "abstract"} for value in source_bases) else "fulltext"
        if existing:
            db.execute(
                """
                UPDATE paper_analyses
                SET analysis_level=?, sections_json=?, content_json=?, source_basis=?,
                    source_sha256=?, model=?, prompt_version=?, generated_at=?, updated_at=?
                WHERE id=?
                """,
                (
                    analysis_level,
                    json.dumps(ordered_sections, ensure_ascii=False),
                    json.dumps(previous_content, ensure_ascii=False),
                    combined_basis,
                    self._combined_hash(hashes),
                    self._combined_value(models),
                    self._combined_value(prompts),
                    now,
                    now,
                    existing["id"],
                ),
            )
            return
        supersedes = db.execute(
            "SELECT id FROM paper_analyses WHERE canonical_paper_id=? ORDER BY updated_at DESC LIMIT 1",
            (task["canonical_paper_id"],),
        ).fetchone()
        db.execute(
            """
            INSERT INTO paper_analyses(
                id, canonical_paper_id, analysis_request_id, owner_id, visibility,
                analysis_level, sections_json, content_json, source_basis, source_sha256,
                model, prompt_version, status, generated_at, supersedes_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'private', ?, ?, ?, ?, ?, ?, ?, 'partial', ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                task["canonical_paper_id"],
                task["id"],
                task["owner_id"],
                analysis_level,
                json.dumps(ordered_sections, ensure_ascii=False),
                json.dumps(previous_content, ensure_ascii=False),
                combined_basis,
                self._combined_hash(hashes),
                self._combined_value(models),
                self._combined_value(prompts),
                now,
                supersedes["id"] if supersedes else None,
                now,
                now,
            ),
        )

    def update_analysis_stage(
        self,
        task_id: str,
        stage_key: str,
        action: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if stage_key not in ANALYSIS_STAGE_KEYS:
            raise AtlasError("未知分析阶段")
        if action not in {"start", "progress", "complete", "fail"}:
            raise AtlasError("未知阶段操作")
        with self._lock, self.connect() as db:
            task = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
            if not task:
                raise NotFoundError("分析任务不存在")
            if task["status"] in {"paused", "cancelled", "completed"}:
                raise ConflictError(f"任务处于 {task['status']}，不能更新阶段")
            stage = db.execute(
                """
                SELECT * FROM analysis_stage_runs
                WHERE analysis_request_id=? AND stage_key=?
                ORDER BY attempt DESC LIMIT 1
                """,
                (task_id, stage_key),
            ).fetchone()
            if not stage:
                raise NotFoundError("任务不包含该分析阶段")
            now = utc_now()
            if action == "start":
                if stage["status"] != "pending":
                    raise ConflictError(f"阶段处于 {stage['status']}，不能开始")
                percent = max(1, min(99, int(payload.get("percent") or 1)))
                db.execute(
                    """
                    UPDATE analysis_stage_runs
                    SET status='running', percent=?, model=?, prompt_version=?,
                        started_at=?, updated_at=?, error_text=''
                    WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                    """,
                    (
                        percent,
                        compact_text(payload.get("model"), 240),
                        compact_text(payload.get("promptVersion") or payload.get("prompt_version"), 120),
                        now,
                        now,
                        task_id,
                        stage_key,
                        stage["attempt"],
                    ),
                )
            elif action == "progress":
                if stage["status"] != "running":
                    raise ConflictError(f"阶段处于 {stage['status']}，不能更新进度")
                try:
                    requested_percent = int(payload.get("percent"))
                except (TypeError, ValueError) as error:
                    raise AtlasError("阶段进度必须是整数") from error
                percent = max(stage["percent"], min(99, max(1, requested_percent)))
                db.execute(
                    """
                    UPDATE analysis_stage_runs SET percent=?, updated_at=?
                    WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                    """,
                    (percent, now, task_id, stage_key, stage["attempt"]),
                )
            elif action == "fail":
                if stage["status"] not in {"pending", "running"}:
                    raise ConflictError(f"阶段处于 {stage['status']}，不能标记失败")
                error_text = clean_multiline_text(payload.get("error") or payload.get("errorText"), 4000)
                if not error_text:
                    raise AtlasError("失败阶段必须记录错误原因")
                db.execute(
                    """
                    UPDATE analysis_stage_runs
                    SET status='failed', finished_at=?, updated_at=?, error_text=?
                    WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                    """,
                    (now, now, error_text, task_id, stage_key, stage["attempt"]),
                )
            else:
                if stage["status"] not in {"pending", "running"}:
                    raise ConflictError(f"阶段处于 {stage['status']}，不能完成")
                source_basis = compact_text(payload.get("sourceBasis") or payload.get("source_basis"), 40)
                if source_basis not in SOURCE_BASIS:
                    raise AtlasError("阶段结果必须声明有效的 sourceBasis")
                source_sha256 = compact_text(
                    payload.get("sourceSha256") or payload.get("source_sha256") or task["source_sha256"],
                    128,
                ).lower()
                if source_sha256 and not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
                    raise AtlasError("source SHA-256 格式无效")
                if source_basis in {"fulltext", "supplementary", "mixed"} and not source_sha256:
                    raise AtlasError("全文、补充材料或混合分析必须记录 source SHA-256")
                content = normalize_stage_content(
                    stage_key,
                    payload.get("content"),
                    source_basis,
                    source_sha256,
                )
                try:
                    validate_json_schema(payload, ANALYSIS_STAGE_SCHEMA)
                except SchemaValidationError as error:
                    raise AtlasError(f"阶段结果未通过 JSON Schema：{error}") from error
                db.execute(
                    """
                    UPDATE analysis_stage_runs
                    SET status='completed', percent=100, content_json=?, source_basis=?,
                        source_sha256=?, model=?, prompt_version=?, started_at=COALESCE(started_at, ?),
                        finished_at=?, updated_at=?, error_text=''
                    WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                    """,
                    (
                        json.dumps(content, ensure_ascii=False),
                        source_basis,
                        source_sha256,
                        compact_text(payload.get("model") or stage["model"], 240),
                        compact_text(
                            payload.get("promptVersion") or payload.get("prompt_version") or stage["prompt_version"],
                            120,
                        ),
                        now,
                        now,
                        now,
                        task_id,
                        stage_key,
                        stage["attempt"],
                    ),
                )
                completed_stage = db.execute(
                    """
                    SELECT * FROM analysis_stage_runs
                    WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                    """,
                    (task_id, stage_key, stage["attempt"]),
                ).fetchone()
                assert completed_stage is not None
                self._upsert_paper_analysis(db, task, completed_stage, content)
            self._refresh_task_state(db, task_id)
            updated = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
            assert updated is not None
            return self._task_from_row(db, updated)

    def transition_analysis_request(self, task_id: str, action: str, stage_key: str = "", owner_id: str = "local") -> dict[str, Any]:
        transitions = {
            "pause": ({"queued", "running"}, "paused"),
            "resume": ({"paused"}, "queued"),
            "cancel": ({"queued", "running", "paused", "partial", "failed"}, "cancelled"),
            "retry": ({"failed", "partial", "cancelled"}, "queued"),
        }
        if action not in transitions:
            raise AtlasError("未知任务操作")
        allowed, target = transitions[action]
        with self._lock, self.connect() as db:
            row = db.execute(
                "SELECT * FROM analysis_requests WHERE id=? AND owner_id=?",
                (task_id, compact_text(owner_id, 120) or "local"),
            ).fetchone()
            if not row:
                raise NotFoundError("分析任务不存在")
            if row["status"] not in allowed:
                raise ConflictError(f"任务处于 {row['status']}，不能执行 {action}")
            now = utc_now()
            latest_stages = self._latest_stage_rows(db, task_id)
            if action == "pause":
                for stage in latest_stages:
                    if stage["status"] == "running":
                        db.execute(
                            """
                            UPDATE analysis_stage_runs SET status='paused', updated_at=?
                            WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                            """,
                            (now, task_id, stage["stage_key"], stage["attempt"]),
                        )
            elif action == "resume":
                for stage in latest_stages:
                    if stage["status"] == "paused":
                        db.execute(
                            """
                            UPDATE analysis_stage_runs SET status='pending', updated_at=?
                            WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                            """,
                            (now, task_id, stage["stage_key"], stage["attempt"]),
                        )
            elif action == "cancel":
                for stage in latest_stages:
                    if stage["status"] != "completed":
                        db.execute(
                            """
                            UPDATE analysis_stage_runs
                            SET status='cancelled', finished_at=?, updated_at=?
                            WHERE analysis_request_id=? AND stage_key=? AND attempt=?
                            """,
                            (now, now, task_id, stage["stage_key"], stage["attempt"]),
                        )
            else:
                if stage_key and stage_key not in ANALYSIS_STAGE_KEYS:
                    raise AtlasError("未知分析阶段")
                retryable = [
                    stage for stage in latest_stages
                    if stage["status"] in {"failed", "cancelled"}
                    and (not stage_key or stage["stage_key"] == stage_key)
                ]
                if not retryable:
                    raise ConflictError("没有符合条件的失败或已取消阶段")
                for stage in retryable:
                    db.execute(
                        """
                        INSERT INTO analysis_stage_runs(
                            analysis_request_id, stage_key, stage_label, position, attempt,
                            status, percent, updated_at
                        ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
                        """,
                        (
                            task_id,
                            stage["stage_key"],
                            stage["stage_label"],
                            stage["position"],
                            stage["attempt"] + 1,
                            now,
                        ),
                    )
                db.execute(
                    """
                    UPDATE analysis_materials
                    SET status=CASE
                        WHEN status='failed' AND download_authorized=1 THEN 'authorized'
                        ELSE status
                    END,
                    updated_at=?, error_text=CASE WHEN status='failed' THEN '' ELSE error_text END
                    WHERE analysis_request_id=?
                    """,
                    (now, task_id),
                )
            refreshed_stages = self._latest_stage_rows(db, task_id)
            progress = [self._stage_from_row(stage) for stage in refreshed_stages]
            finished_at = now if target == "cancelled" else None
            db.execute(
                """
                UPDATE analysis_requests
                SET status=?, progress_json=?, updated_at=?, finished_at=?, error_text=?
                WHERE id=?
                """,
                (
                    target,
                    json.dumps(progress, ensure_ascii=False),
                    now,
                    finished_at,
                    "" if target == "queued" else row["error_text"],
                    task_id,
                ),
            )
            if action in {"pause", "cancel"}:
                db.execute(
                    """
                    UPDATE analysis_requests
                    SET lease_owner='', lease_token_sha256='', lease_expires_at=NULL, lease_heartbeat_at=NULL
                    WHERE id=?
                    """,
                    (task_id,),
                )
            if target != "completed":
                db.execute(
                    "UPDATE paper_analyses SET status='partial', updated_at=? WHERE analysis_request_id=?",
                    (now, task_id),
                )
            updated = db.execute("SELECT * FROM analysis_requests WHERE id=?", (task_id,)).fetchone()
            assert updated is not None
            return self._task_from_row(db, updated)

    def process_bridge(self, envelope: dict[str, Any], allowed_origins: set[str]) -> dict[str, Any]:
        message_id = compact_text(envelope.get("messageId"), 160)
        message_type = compact_text(envelope.get("type"), 120)
        bridge_token = compact_text(envelope.get("bridgeToken"), 500)
        source_origin = compact_text(envelope.get("sourceOrigin"), 500)
        if int(envelope.get("version") or 0) != 1:
            raise AtlasError("不支持的消息协议版本")
        if not re.fullmatch(r"[A-Za-z0-9._:-]{8,160}", message_id):
            raise AtlasError("messageId 格式无效")
        if len(bridge_token) < 16:
            raise AtlasError("bridge token 无效")
        try:
            normalized_origin = origin_for_url(source_origin)
        except ValueError as error:
            raise AtlasError("source origin 无效") from error
        if normalized_origin not in allowed_origins:
            raise AtlasError("source origin 不在允许列表")

        with self._lock, self.connect() as db:
            previous = db.execute("SELECT result_json FROM bridge_messages WHERE message_id=?", (message_id,)).fetchone()
            if previous:
                result = json.loads(previous["result_json"])
                result["duplicate"] = True
                return result

            if message_type == "paperfield:paper-context":
                paper = self._upsert_paper_with_db(db, envelope.get("paper") or {})
                result = {"type": "atlas:context-accepted", "version": 1, "messageId": message_id, "paper": paper}
            elif message_type == "paperfield:analysis-request":
                paper = self._upsert_paper_with_db(db, envelope.get("paper") or {})
                request = envelope.get("request") if isinstance(envelope.get("request"), dict) else {}
                task, reused = self._create_analysis_with_db(
                    db,
                    {
                        **request,
                        "paper": paper,
                        "sections": request.get("sections"),
                        "sourceVersion": (envelope.get("paper") or {}).get("version"),
                        "sourceSha256": (envelope.get("paper") or {}).get("sourceSha256"),
                        "trigger": "explicit_button",
                    },
                    paper=paper,
                    allow_material_authorization=False,
                )
                result = {
                    "type": "atlas:analysis-accepted",
                    "version": 1,
                    "messageId": message_id,
                    "task": task,
                    "reused": reused,
                }
            elif message_type == "paperfield:project-context":
                project = self._upsert_project_with_db(db, envelope.get("project") or {})
                result = {"type": "atlas:project-accepted", "version": 1, "messageId": message_id, "project": project}
            else:
                raise AtlasError("不支持的桥接消息类型")

            db.execute(
                "INSERT INTO bridge_messages(message_id, message_type, result_json, received_at) VALUES (?, ?, ?, ?)",
                (message_id, message_type, json.dumps(result, ensure_ascii=False), utc_now()),
            )
            return result

    def bootstrap(self) -> dict[str, Any]:
        papers = self.list_papers()
        projects = self.list_projects()
        frontier_candidates = self.list_frontier_candidates()
        frontier_updates = self.list_frontier_updates()
        frontier_terms = self.list_frontier_terms()
        frontier_signals = self.list_frontier_signals("published")
        frontier_source = self.frontier_source_state()
        frontier_update_source = self.frontier_update_source_state()
        knowledge = self.public_knowledge(limit=80)
        catalog_counts = self.catalog_counts()
        frontier_status = {
            "not_connected": "source_pipeline_not_connected",
            "scanning": "candidate_source_scanning",
            "connected": "candidate_source_connected",
            "degraded": "candidate_source_degraded",
        }[frontier_source["status"]]
        threads = [
            item for item in knowledge["items"]
            if item.get("entity_kind") == "thread"
        ]
        return {
            "version": APP_VERSION,
            "as_of_date": datetime.now().date().isoformat(),
            "scope": "global",
            "frontier_status": frontier_status,
            "frontier_source": frontier_source,
            "frontier_update_source": frontier_update_source,
            "frontier_candidates": frontier_candidates,
            "frontier_updates": frontier_updates,
            "signals": frontier_signals,
            "terms": frontier_terms,
            "threads": threads,
            "knowledge_entities": knowledge["items"],
            "knowledge_relationships": knowledge["relationships"],
            "papers": papers,
            "projects": projects,
            "stats": {
                "papers": catalog_counts["papers"],
                "projects": catalog_counts["projects"],
                "frontier_candidates": catalog_counts["frontier_candidates"],
                "frontier_updates": catalog_counts["frontier_updates"],
                "frontier_terms": catalog_counts["frontier_terms"],
                "frontier_signals": catalog_counts["frontier_signals"],
                "knowledge_reviewed_entities": catalog_counts["knowledge_reviewed_entities"],
                "knowledge_reviewed_relationships": catalog_counts["knowledge_reviewed_relationships"],
                # Keep aggregate counts useful to the local operator while
                # the entity/relationship payloads above remain reviewed-only.
                "knowledge_entities": catalog_counts["knowledge_entities"],
                "knowledge_relationships": catalog_counts["knowledge_relationships"],
                "knowledge_public_entities": len(knowledge["items"]),
                "knowledge_public_relationships": len(knowledge["relationships"]),
            },
        }

    def private_bootstrap(self, owner_id: str = "local") -> dict[str, Any]:
        owner = self._learning_owner(owner_id)
        tasks = self.list_analysis_requests(owner_id=owner)
        drafts = self.list_frontier_signals("draft")
        counts = {status: 0 for status in TASK_STATUS}
        for task in tasks:
            counts[task["status"]] = counts.get(task["status"], 0) + 1
        with self.connect() as db:
            dossier_counts = {
                row["status"]: int(row["count"])
                for row in db.execute(
                    "SELECT status, COUNT(*) AS count FROM paper_analyses WHERE owner_id=? GROUP BY status",
                    (owner,),
                ).fetchall()
            }
            material_counts = {
                row["status"]: int(row["count"])
                for row in db.execute(
                    """SELECT material.status, COUNT(*) AS count
                       FROM analysis_materials material
                       JOIN analysis_requests request ON request.id=material.analysis_request_id
                       WHERE request.owner_id=? GROUP BY material.status""",
                    (owner,),
                ).fetchall()
            }
        completed_dossiers = dossier_counts.get("completed", 0)
        partial_dossiers = dossier_counts.get("partial", 0)
        return {
            "analysis_requests": tasks,
            "signal_drafts": drafts,
            "focus_profile": self.get_focus_profile(owner),
            "saved_items": self.list_saved_items(owner),
            "research_digests": self.list_research_digests(owner, "private", 20),
            "private_radar": self.private_radar(owner),
            "learning": self.learning_projection(owner),
            "stats": {
                "tasks": len(tasks),
                "active_tasks": sum(counts.get(status, 0) for status in {"queued", "running", "paused", "partial"}),
                "task_status": counts,
                "dossiers": completed_dossiers + partial_dossiers,
                "completed_dossiers": completed_dossiers,
                "partial_dossiers": partial_dossiers,
                "awaiting_authorization": material_counts.get("awaiting_authorization", 0),
                "material_status": material_counts,
                "frontier_signal_drafts": len(drafts),
            },
        }


def fetch_paperfield_catalog_page(
    paperfield_base_url: str,
    cursor: int,
    limit: int,
    paperfield_sync_token: str = "",
) -> tuple[dict[str, Any], str]:
    """Fetch one immutable, compact Paperfield catalog page.

    This helper is shared by the manual editor endpoint and the background
    synchronizer so both paths use the same cursor contract and security
    headers.  ``compact=1`` is intentional for every page: omitting it on a
    later page would silently switch from the compact snapshot to the full
    historical event log.
    """
    base = clean_http_url(paperfield_base_url)
    if not base:
        raise ServiceUnavailableError("Paperfield catalog 地址无效")
    url = urllib.parse.urljoin(base.rstrip("/") + "/", "api/atlas/catalog")
    query = urllib.parse.urlencode(
        {
            "cursor": max(0, int(cursor)),
            "limit": max(1, min(PAPERFIELD_SYNC_PAGE_LIMIT, int(limit))),
            "compact": "1",
        }
    )
    source_url = f"{url}?{query}"
    headers = {"Accept": "application/json", "User-Agent": f"ResearchAtlas/{APP_VERSION}"}
    if paperfield_sync_token:
        headers["X-Paperfield-Atlas-Token"] = paperfield_sync_token
    request = urllib.request.Request(source_url, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=30) as response:
            body = response.read(8 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            payload = json.loads(error.read().decode("utf-8"))
            detail = compact_text(payload.get("error"), 1000) if isinstance(payload, dict) else ""
        except (UnicodeDecodeError, json.JSONDecodeError):
            detail = ""
        raise ServiceUnavailableError(
            f"Paperfield catalog 返回 HTTP {error.code}{f'：{detail}' if detail else ''}"
        ) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ServiceUnavailableError(
            f"无法连接 Paperfield catalog：{compact_text(error, 1000)}"
        ) from error
    if len(body) > 8 * 1024 * 1024:
        raise AtlasError("Paperfield catalog 响应超过 8 MB")
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AtlasError("Paperfield catalog 返回了无效 JSON") from error
    if not isinstance(payload, dict):
        raise AtlasError("Paperfield catalog 返回值必须是对象")
    return payload, source_url


class PaperfieldCatalogSynchronizer:
    """Bounded, retrying Paperfield -> Atlas catalog synchronizer."""

    def __init__(
        self,
        store: AtlasStore,
        paperfield_base_url: str,
        paperfield_sync_token: str = "",
        *,
        interval_seconds: float = PAPERFIELD_SYNC_DEFAULT_INTERVAL_SECONDS,
        max_pages: int = PAPERFIELD_SYNC_DEFAULT_MAX_PAGES,
        page_limit: int = PAPERFIELD_SYNC_PAGE_LIMIT,
        actor: str = "atlas-paperfield-sync",
        reason: str = "自动同步 Paperfield 论文与项目目录，保持 Atlas 研究地图可回链",
    ) -> None:
        self.store = store
        self.paperfield_base_url = paperfield_base_url
        self.paperfield_sync_token = paperfield_sync_token
        self.interval_seconds = max(0.2, float(interval_seconds))
        self.max_pages = max(1, min(100, int(max_pages)))
        self.page_limit = max(1, min(PAPERFIELD_SYNC_PAGE_LIMIT, int(page_limit)))
        self.actor = compact_text(actor, 120) or "atlas-paperfield-sync"
        self.reason = clean_multiline_text(reason, 4000)
        if len(self.reason) < 10:
            self.reason = "自动同步 Paperfield 目录以保持 Atlas 目录一致"
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.last_result: dict[str, Any] = {}

    def sync_once(self) -> dict[str, Any]:
        checkpoint = self.store.paperfield_sync_checkpoint()
        cursor = int(checkpoint.get("cursor_value") or 0)
        pages = 0
        runs: list[dict[str, Any]] = []
        has_more = False
        while pages < self.max_pages and not self.stop_event.is_set():
            page, source_url = fetch_paperfield_catalog_page(
                self.paperfield_base_url,
                cursor,
                self.page_limit,
                self.paperfield_sync_token,
            )
            # An empty page at the current watermark is a healthy no-op, not
            # a catalog event.  Avoid producing an audit row every interval.
            if (
                not page.get("items")
                and int(page.get("cursor") or cursor) == int(page.get("nextCursor") or cursor)
                and not bool(page.get("hasMore"))
            ):
                has_more = False
                break
            run = self.store.apply_paperfield_sync_page(
                page,
                source_url=source_url,
                editor_payload={"actor": self.actor, "reason": self.reason},
            )
            runs.append(run)
            pages += 1
            cursor = int(page.get("nextCursor") or cursor)
            has_more = bool(page.get("hasMore"))
            if not has_more:
                break
        result = {
            "pages": pages,
            "runs": runs,
            "checkpoint": self.store.paperfield_sync_checkpoint(),
            "hasMore": has_more,
        }
        self.last_result = result
        return result

    def _run(self) -> None:
        while not self.stop_event.is_set():
            try:
                self.sync_once()
            except Exception as error:  # retry after startup/network failures
                self.last_result = {
                    "pages": 0,
                    "runs": [],
                    "checkpoint": self.store.paperfield_sync_checkpoint(),
                    "hasMore": False,
                    "error": compact_text(str(error), 2000),
                }
            self.stop_event.wait(self.interval_seconds)

    def start(self) -> "PaperfieldCatalogSynchronizer":
        if self.thread and self.thread.is_alive():
            return self
        self.stop_event.clear()
        self.thread = threading.Thread(
            target=self._run,
            name="atlas-paperfield-sync",
            daemon=True,
        )
        self.thread.start()
        return self

    def stop(self, timeout: float = 5.0) -> None:
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=max(0.1, float(timeout)))


class AtlasHandler(SimpleHTTPRequestHandler):
    server_version = f"ResearchAtlas/{APP_VERSION}"
    store: AtlasStore
    paperfield_base_url = "http://127.0.0.1:8765/"
    flowloom_base_url = "http://127.0.0.1:4178/"
    allowed_paperfield_origins: set[str] = {"http://127.0.0.1:8765", "http://localhost:8765"}
    worker_token = ""
    paperfield_sync_token = ""
    proxy_token = ""
    # Test/embedded-only compatibility switch. Production main() leaves this
    # disabled so forwarded identity and origin headers require a shared token.
    insecure_proxy_headers = False

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._request_body_consumed = False
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )
        if urllib.parse.urlparse(self.path).path in {"/", "/index.html", "/app.js", "/styles.css"}:
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def send_course_asset(self, requested_path: str) -> None:
        relative = urllib.parse.unquote(str(requested_path or "")).replace("\\", "/").strip("/")
        parts = relative.split("/") if relative else []
        if (
            not parts
            or parts[0] not in {"mathjax-3.2.2", "mermaid-11.16.1"}
            or any(part in {"", ".", ".."} or part.startswith(".") for part in parts)
        ):
            raise NotFoundError("课程渲染资源不存在")
        root = COURSE_VENDOR_ROOT.resolve()
        source = root.joinpath(*parts).resolve()
        if not source.is_relative_to(root) or not source.is_file():
            raise NotFoundError("课程渲染资源不存在")
        body = source.read_bytes()
        content_type = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def send_course_content_asset(self, requested_path: str) -> None:
        try:
            source = resolve_course_asset_path(requested_path)
        except (OSError, ValueError) as error:
            raise NotFoundError("课程媒体不存在") from error
        body = source.read_bytes()
        content_type = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise AtlasError("Content-Length 无效") from error
        if length <= 0:
            return {}
        request_path = urllib.parse.urlparse(self.path).path
        maximum = RESEARCH_IMPORT_MAX_JSON_BYTES if request_path == "/api/private/import" else MAX_JSON_BYTES
        if length > maximum:
            limit_mb = maximum // (1024 * 1024)
            raise AtlasError(f"请求内容超过 {limit_mb} MB 限制")
        try:
            content = self.rfile.read(length)
            self._request_body_consumed = True
            value = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise AtlasError("JSON 请求格式无效") from error
        if not isinstance(value, dict):
            raise AtlasError("JSON 请求必须是对象")
        return value

    def discard_small_request_body(self, maximum: int = 64 * 1024) -> None:
        """Drain rejected small POST bodies so Windows can return the HTTP error."""
        if self._request_body_consumed:
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.close_connection = True
            return
        if length <= 0:
            self._request_body_consumed = True
            return
        if length > maximum:
            self.close_connection = True
            return
        previous_timeout = self.connection.gettimeout()
        try:
            self.connection.settimeout(0.5)
            consumed = self.rfile.read(length)
            self._request_body_consumed = len(consumed) == length
            if not self._request_body_consumed:
                self.close_connection = True
        except (OSError, TimeoutError):
            self.close_connection = True
        finally:
            self.connection.settimeout(previous_timeout)

    def require_worker(self) -> None:
        if not self.worker_token:
            raise ServiceUnavailableError("Atlas 分析执行器尚未配置")
        provided = self.headers.get("X-Atlas-Worker-Token", "")
        if not provided or not hmac.compare_digest(provided, self.worker_token):
            raise ForbiddenError("分析执行器凭据无效")

    def require_local_editor(self) -> None:
        try:
            client = ipaddress.ip_address(str(self.client_address[0]).split("%", 1)[0])
        except ValueError as error:
            raise ForbiddenError("编辑接口只允许本机访问") from error
        if not client.is_loopback:
            raise ForbiddenError("编辑接口只允许本机访问")
        proxy_marked = any(
            self.headers.get(name)
            for name in (
                "X-Atlas-Proxy-Token",
                "X-Paperfield-User",
                "X-Paperfield-Role",
                "X-Forwarded-Prefix",
                "X-Atlas-Trusted-Host",
            )
        )
        if proxy_marked:
            provided = compact_text(self.headers.get("X-Atlas-Proxy-Token"), 500)
            if not self.insecure_proxy_headers and (
                not self.proxy_token or not provided or not hmac.compare_digest(provided, self.proxy_token)
            ):
                raise ForbiddenError("Atlas proxy token is invalid")
            request_path = urllib.parse.urlparse(self.path).path
            if re.fullmatch(r"/api/(?:private|editor)/backups(?:/.*)?", request_path):
                raise ForbiddenError("Atlas 平台备份只允许本机直接访问")
            user = compact_text(self.headers.get("X-Paperfield-User"), 120)
            role = compact_text(self.headers.get("X-Paperfield-Role"), 40).casefold()
            if not user or role not in EDITOR_ACCOUNT_ROLES:
                raise ForbiddenError("当前 Paperfield 账户没有 Atlas 编辑权限")
            source_url = compact_text(self.headers.get("Origin") or self.headers.get("Referer"), 1000)
            expected_origin = self.forwarded_public_origin()
            if not source_url or not expected_origin:
                raise ForbiddenError("编辑请求缺少可信网页来源")
            try:
                source_origin = origin_for_url(source_url)
            except ValueError as error:
                raise ForbiddenError("编辑请求来源无效") from error
            if source_origin != expected_origin:
                raise ForbiddenError("编辑请求来源与 Paperfield 公网来源不匹配")
            return
        expected_host = compact_text(self.headers.get("X-Atlas-Trusted-Host"), 255)
        expected_proto = compact_text(self.headers.get("X-Atlas-Trusted-Proto"), 20).lower()
        if expected_host and expected_host != compact_text(self.headers.get("Host"), 255):
            raise ForbiddenError("编辑请求可信主机不匹配")
        if expected_proto and expected_proto not in {"http", "https"}:
            raise ForbiddenError("编辑请求可信协议无效")
        origin = compact_text(self.headers.get("Origin"), 500)
        if origin:
            parsed_origin = urllib.parse.urlparse(origin)
            if parsed_origin.scheme not in {"http", "https"} or parsed_origin.netloc != self.headers.get("Host", ""):
                raise ForbiddenError("编辑请求来源无效")

    def request_owner_id(self) -> str:
        """Resolve the private owner forwarded by Paperfield's auth layer."""
        forwarded = compact_text(self.headers.get("X-Paperfield-User"), 120)
        proxy_marked = bool(
            forwarded
            or self.headers.get("X-Forwarded-Prefix")
            or self.headers.get("X-Atlas-Trusted-Host")
            or self.headers.get("X-Atlas-Trusted-Proto")
        )
        if self.proxy_token and proxy_marked:
            provided = compact_text(self.headers.get("X-Atlas-Proxy-Token"), 500)
            if not provided or not hmac.compare_digest(provided, self.proxy_token):
                raise ForbiddenError("Atlas proxy token is invalid")
        elif proxy_marked and not self.proxy_token and not self.insecure_proxy_headers:
            raise ForbiddenError("Atlas proxy token is not configured")
        return AtlasStore._learning_owner(forwarded or "local")

    def require_private_origin(self) -> None:
        """Validate browser origins before serving account-scoped routes.

        Direct Atlas requests must be same-origin with the listener. Requests
        forwarded by Paperfield may use the public reverse-proxy origin, but
        only after the shared proxy token has authenticated the forwarded
        host/protocol headers.
        """
        origin = compact_text(self.headers.get("Origin"), 500)
        if not origin:
            # Non-browser clients (workers, CLI tools, and same-process calls)
            # do not send Origin; authentication and route policy still apply.
            return
        try:
            normalized_origin = origin_for_url(origin)
        except ValueError as error:
            raise ForbiddenError("request origin is invalid") from error

        proxy_marked = any(
            self.headers.get(name)
            for name in (
                "X-Atlas-Proxy-Token",
                "X-Paperfield-User",
                "X-Paperfield-Role",
                "X-Forwarded-Prefix",
                "X-Atlas-Trusted-Host",
                "X-Atlas-Trusted-Proto",
            )
        )
        if proxy_marked:
            # request_owner_id performs the constant-time token check and
            # rejects unconfigured proxy headers in production mode.
            self.request_owner_id()
            expected_origin = self.forwarded_public_origin()
            if not expected_origin or normalized_origin != expected_origin:
                raise ForbiddenError("request origin is not trusted")
            return

        host = compact_text(self.headers.get("Host"), 255)
        try:
            expected_origin = origin_for_url(f"http://{host}")
        except ValueError as error:
            raise ForbiddenError("request host is invalid") from error
        if normalized_origin != expected_origin:
            raise ForbiddenError("request origin is not same-origin")

    def worker_runtime_status(self) -> dict[str, Any]:
        activity = self.store.worker_activity()
        return {
            "worker_configured": bool(self.worker_token),
            "worker_connected": bool(self.worker_token and activity["connected"]),
            "worker_last_seen": activity["last_seen"],
        }

    def fetch_paperfield_catalog(self, cursor: int, limit: int) -> tuple[dict[str, Any], str]:
        return fetch_paperfield_catalog_page(
            self.paperfield_base_url,
            cursor,
            limit,
            self.paperfield_sync_token,
        )

    def forwarded_public_origin(self) -> str:
        """Return a validated public origin supplied by the Paperfield proxy.

        Atlas is normally loopback-only, but under the unified Paperfield
        route the browser's origin is the ngrok (or other reverse-proxy)
        origin.  The proxy forwards Host/Proto explicitly; only that origin is
        accepted, and it is never inferred from an arbitrary URL parameter.
        """
        if self.proxy_token:
            provided = compact_text(self.headers.get("X-Atlas-Proxy-Token"), 500)
            if not provided or not hmac.compare_digest(provided, self.proxy_token):
                return ""
        elif not self.insecure_proxy_headers:
            # A loopback request without an explicit shared secret is not a
            # trusted reverse-proxy request. Keep the direct Atlas service
            # configuration private instead of accepting spoofed Host headers.
            return ""
        forwarded_host = compact_text(self.headers.get("X-Atlas-Trusted-Host") or self.headers.get("Host"), 255)
        forwarded_proto = compact_text(
            self.headers.get("X-Atlas-Trusted-Proto") or self.headers.get("X-Forwarded-Proto") or self.headers.get("Forwarded", "").split("proto=", 1)[-1],
            20,
        ).split(",", 1)[0].strip().lower()
        if forwarded_proto not in {"http", "https"} or not forwarded_host:
            return ""
        try:
            return origin_for_url(f"{forwarded_proto}://{forwarded_host}")
        except ValueError:
            return ""

    def public_same_origin_config(self) -> tuple[str, str]:
        """Use mounted same-origin paths when Atlas is behind Paperfield."""
        forwarded_prefix = compact_text(self.headers.get("X-Forwarded-Prefix"), 80).rstrip("/")
        public_origin = self.forwarded_public_origin()
        if forwarded_prefix == "/atlas" and public_origin:
            # Relative URLs preserve the browser's public origin (ngrok,
            # reverse proxy, or localhost) without exposing internal hosts.
            return "/", "/flowloom/"
        return self.paperfield_base_url, self.flowloom_base_url

    def bridge_origins(self) -> set[str]:
        origins = set(self.allowed_paperfield_origins)
        public_origin = self.forwarded_public_origin()
        if public_origin and compact_text(self.headers.get("X-Forwarded-Prefix"), 80).rstrip("/") == "/atlas":
            origins.add(public_origin)
        return origins

    @staticmethod
    def _limit(params: dict[str, list[str]], default: int = 80) -> int:
        try:
            return max(1, min(200, int((params.get("limit") or [str(default)])[0])))
        except ValueError as error:
            raise AtlasError("limit 必须是整数") from error

    @staticmethod
    def _search_values(params: dict[str, list[str]], *names: str) -> list[str]:
        values: list[str] = []
        for name in names:
            for raw in params.get(name, []):
                values.extend(part.strip() for part in str(raw).split(","))
        return [value for value in values if value]

    def _search_request(
        self,
        params: dict[str, list[str]],
        fixed_kind: str = "",
        owner_id: str = "catalog",
    ) -> dict[str, Any]:
        requested_kinds = self._search_values(params, "kind", "kinds")
        if fixed_kind:
            if requested_kinds and any(item.casefold() not in {fixed_kind, f"{fixed_kind}s"} for item in requested_kinds):
                raise AtlasError(f"{fixed_kind} 接口不能搜索其他 kind")
            requested_kinds = [fixed_kind]
        normalized_kinds = [] if any(item.casefold() == "all" for item in requested_kinds) else [
            item.rstrip("s").casefold() for item in requested_kinds
        ]
        query = next(
            (str((params.get(name) or [""])[0]) for name in ("q", "query", "filter") if params.get(name)),
            "",
        )
        cursor = str((params.get("cursor") or [""])[0])
        try:
            limit = int((params.get("limit") or ["40"])[0])
        except (TypeError, ValueError) as error:
            raise AtlasError("搜索 limit 必须是整数") from error
        return self.store.search_catalog(
            query=query,
            kinds=normalized_kinds,
            domains=self._search_values(params, "domain", "domains"),
            statuses=self._search_values(params, "status", "statuses"),
            limit=limit,
            cursor=cursor,
            owner_id=owner_id,
        )

    def _handle_error(self, error: Exception) -> None:
        if isinstance(error, AtlasError):
            self.send_json({"error": str(error)}, int(error.status))
            return
        print(f"Atlas request failed: {error!r}")
        self.send_json({"error": "Atlas 服务处理请求失败"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/course-assets/"):
            try:
                self.send_course_asset(parsed.path[len("/course-assets/") :])
            except Exception as error:
                self._handle_error(error)
            return
        if not parsed.path.startswith("/api/"):
            if parsed.path not in {"/", "/index.html"} and not (STATIC_DIR / parsed.path.lstrip("/")).exists():
                self.path = "/index.html"
            return super().do_GET()
        params = urllib.parse.parse_qs(parsed.query)
        try:
            if parsed.path.startswith("/api/editor/"):
                self.require_local_editor()
            if parsed.path.startswith("/api/private/"):
                self.require_private_origin()
            # A database backup contains every owner's Atlas data.  Keep the
            # legacy private aliases for local clients, but never expose these
            # platform-wide operations through Paperfield's account proxy.
            if parsed.path == "/api/private/backups" or parsed.path.startswith("/api/private/backups/"):
                self.require_local_editor()
            if parsed.path == "/api/health":
                provided_proxy_token = compact_text(self.headers.get("X-Atlas-Proxy-Token"), 500)
                self.send_json(
                    {
                        "status": "ok",
                        "version": APP_VERSION,
                        "database": str(self.store.path),
                        "proxy_token_match": bool(
                            self.proxy_token
                            and provided_proxy_token
                            and hmac.compare_digest(provided_proxy_token, self.proxy_token)
                        ),
                        **self.worker_runtime_status(),
                    }
                )
                return
            if parsed.path == "/api/config":
                paperfield_url, flowloom_url = self.public_same_origin_config()
                self.send_json(
                    {
                        "paperfield_base_url": paperfield_url,
                        "flowloom_base_url": flowloom_url,
                        "allowed_paperfield_origins": sorted(self.bridge_origins()),
                        "mounted_via_proxy": paperfield_url != self.paperfield_base_url,
                        "editor_mode": "local_or_privileged_account",
                        "paperfield_sync_protocol": 1,
                        "paperfield_sync_token_configured": bool(self.paperfield_sync_token),
                        **self.worker_runtime_status(),
                    }
                )
                return
            if parsed.path == "/api/bootstrap":
                self.send_json(self.store.bootstrap())
                return
            if parsed.path == "/api/curriculum":
                track_id = compact_text((params.get("track") or [""])[0], 40).casefold()
                try:
                    curriculum = build_curriculum(track_id)
                except ValueError as error:
                    raise NotFoundError("课程路线不存在") from error
                self.send_json(curriculum)
                return
            if parsed.path == "/api/curriculum/lesson":
                lesson_path = compact_text((params.get("path") or [""])[0], 800)
                try:
                    lesson = load_course_lesson(lesson_path)
                except (OSError, UnicodeError, ValueError) as error:
                    raise NotFoundError("课程正文不存在") from error
                self.send_json(lesson)
                return
            if parsed.path == "/api/curriculum/asset":
                asset_path = compact_text((params.get("path") or [""])[0], 800)
                self.send_course_content_asset(asset_path)
                return
            if parsed.path == "/api/private/bootstrap":
                self.send_json(self.store.private_bootstrap(self.request_owner_id()))
                return
            if parsed.path == "/api/private/learning-progress":
                self.send_json(self.store.learning_projection(self.request_owner_id()))
                return
            if parsed.path in {"/api/private/diagnostics", "/api/editor/diagnostics"}:
                self.send_json(self.store.runtime_diagnostics(bool(self.worker_token)))
                return
            if parsed.path in {"/api/private/backups", "/api/editor/backups"}:
                self.send_json({"items": self.store.list_backups(self._limit(params, 50))})
                return
            backup_match = re.fullmatch(r"/api/(?:private|editor)/backups/([^/]+)/manifest", parsed.path)
            if backup_match:
                backup_id = urllib.parse.unquote(backup_match.group(1))
                backup = next(
                    (item for item in self.store.list_backups(100) if item.get("id") == backup_id),
                    None,
                )
                if backup is None:
                    raise NotFoundError("备份记录不存在")
                self.send_json(backup)
                return
            if parsed.path == "/api/private/diagnostics":
                self.send_json(self.store.runtime_diagnostics())
                return
            if parsed.path == "/api/private/export":
                self.send_json(self.store.export_research_data(self.request_owner_id()))
                return
            if parsed.path == "/api/private/search":
                self.send_json(self._search_request(params, owner_id=self.request_owner_id()))
                return
            if parsed.path == "/api/private/search-snapshots":
                items = self.store.list_search_snapshots(self.request_owner_id(), self._limit(params, 50))
                self.send_json({"items": items, "total": len(items)})
                return
            snapshot_match = re.fullmatch(r"/api/private/search-snapshots/([0-9a-f-]{36})", parsed.path)
            if snapshot_match:
                include_items = compact_text((params.get("includeItems") or params.get("include_items") or [""])[0], 10).casefold() in {"1", "true", "yes"}
                self.send_json(
                    self.store.get_search_snapshot(
                        snapshot_match.group(1),
                        self.request_owner_id(),
                        include_items=include_items,
                        item_limit=self._limit(params, 200),
                    )
                )
                return
            if parsed.path in {"/api/private/views", "/api/private/research-views"}:
                kind = compact_text((params.get("kind") or params.get("viewKind") or [""])[0], 30)
                items = self.store.list_research_views(self.request_owner_id(), kind, self._limit(params, 100))
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path in {"/api/private/view-runs", "/api/private/research-view-runs"}:
                view_id = compact_text((params.get("viewId") or params.get("view_id") or [""])[0], 80)
                items = self.store.list_research_view_runs(self.request_owner_id(), view_id, self._limit(params, 50))
                self.send_json({"items": items, "total": len(items), "view_id": view_id})
                return
            view_run_match = re.fullmatch(r"/api/private/(?:view-runs|research-view-runs)/([0-9a-f-]{36})", parsed.path)
            if view_run_match:
                self.send_json(
                    self.store.get_research_view_run(
                        view_run_match.group(1),
                        self.request_owner_id(),
                    )
                )
                return
            view_match = re.fullmatch(r"/api/private/(?:views|research-views)/([0-9a-f-]{36})", parsed.path)
            if view_match:
                self.send_json(
                    self.store.get_research_view(
                        view_match.group(1),
                        self.request_owner_id(),
                    )
                )
                return
            if parsed.path == "/api/private/notifications":
                unread = compact_text((params.get("unread") or [""])[0], 10).casefold() in {"1", "true", "yes"}
                kind = compact_text((params.get("kind") or [""])[0], 40)
                items = self.store.list_notifications(
                    self.request_owner_id(), unread_only=unread, notification_kind=kind, limit=self._limit(params, 100)
                )
                self.send_json({"items": items, "total": len(items), "unread_only": unread})
                return
            if parsed.path == "/api/private/provenance-bundles":
                items = self.store.list_provenance_bundles(self.request_owner_id(), self._limit(params, 50))
                self.send_json({"items": items, "total": len(items)})
                return
            bundle_match = re.fullmatch(r"/api/private/provenance-bundles/([0-9a-f-]{36})", parsed.path)
            if bundle_match:
                bundle = self.store.get_provenance_bundle(
                    bundle_match.group(1),
                    self.request_owner_id(),
                )
                requested_format = compact_text((params.get("format") or ["json"])[0], 20).casefold()
                if requested_format == "markdown":
                    self.send_json({"id": bundle["id"], "format": "markdown", "content": bundle["markdown"], "markdown": bundle["markdown"], "bundle_sha256": bundle["bundle_sha256"]})
                elif requested_format == "json":
                    self.send_json(bundle)
                else:
                    raise AtlasError("provenance bundle format must be json or markdown")
                return
            if parsed.path == "/api/search":
                self.send_json(self._search_request(params))
                return
            if parsed.path == "/api/frontier/radar":
                self.send_json(
                    self.store.frontier_radar(
                        domains=self._search_values(params, "domain", "domains"),
                        sources=self._search_values(params, "source", "sources"),
                        date_from=(params.get("from") or [""])[0],
                        date_to=(params.get("to") or [""])[0],
                        maturity=self._search_values(params, "maturity"),
                        query=(params.get("q") or params.get("query") or [""])[0],
                        review_status=self._search_values(params, "review_status", "reviewStatus"),
                        limit=self._limit(params, 40),
                    )
                )
                return
            term_match = re.fullmatch(r"/api/terms/(\d+)", parsed.path)
            if term_match:
                self.send_json(self.store.get_frontier_term(int(term_match.group(1))))
                return
            if parsed.path == "/api/knowledge":
                self.send_json(
                    self.store.public_knowledge(
                        entity_kind=(params.get("kind") or [""])[0],
                        query=(params.get("q") or [""])[0],
                        limit=self._limit(params, 100),
                    )
                )
                return
            if parsed.path == "/api/threads":
                items = self.store.list_public_threads(self._limit(params, 100))
                self.send_json({"items": items, "total": len(items)})
                return
            public_thread_match = re.fullmatch(r"/api/threads/([^/]+)", parsed.path)
            if public_thread_match:
                self.send_json(
                    self.store.public_research_thread(
                        urllib.parse.unquote(public_thread_match.group(1))
                    )
                )
                return
            public_claim_match = re.fullmatch(r"/api/claims/([^/]+)", parsed.path)
            if public_claim_match:
                self.send_json(
                    self.store.public_scientific_claim(
                        urllib.parse.unquote(public_claim_match.group(1))
                    )
                )
                return
            knowledge_match = re.fullmatch(r"/api/knowledge/([^/]+)", parsed.path)
            if knowledge_match:
                self.send_json(
                    self.store.public_knowledge_entity(
                        urllib.parse.unquote(knowledge_match.group(1)),
                        depth=int((params.get("depth") or ["2"])[0]),
                        max_nodes=int((params.get("max_nodes") or params.get("maxNodes") or ["80"])[0]),
                        max_edges=int((params.get("max_edges") or params.get("maxEdges") or ["320"])[0]),
                    )
                )
                return
            if parsed.path == "/api/private/focus":
                self.send_json(self.store.get_focus_profile(self.request_owner_id()))
                return
            if parsed.path == "/api/private/saved":
                items = self.store.list_saved_items(self.request_owner_id())
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/private/digests":
                items = self.store.list_research_digests(self.request_owner_id(), "private", self._limit(params, 20))
                self.send_json({"items": items, "total": len(items), "digest_type": "private"})
                return
            if parsed.path == "/api/digests":
                items = self.store.list_research_digests("public", "public", self._limit(params, 20))
                self.send_json({"items": items, "total": len(items), "digest_type": "public"})
                return
            if parsed.path == "/api/editor/sync/paperfield":
                self.send_json(
                    {
                        "checkpoint": self.store.paperfield_sync_checkpoint(),
                        "runs": self.store.list_paperfield_sync_runs(self._limit(params, 30)),
                    }
                )
                return
            if parsed.path == "/api/papers":
                self.send_json(self._search_request(params, "paper"))
                return
            if parsed.path == "/api/papers/resolve":
                reference = (params.get("ref") or [""])[0]
                paper = self.store.resolve_paper(reference)
                self.send_json({"paper": paper, "found": bool(paper)})
                return
            dossier_export_match = re.fullmatch(r"/api/papers/(\d+)/dossier/export", parsed.path)
            if dossier_export_match:
                self.send_json(
                    self.store.export_dossier(
                        int(dossier_export_match.group(1)),
                        (params.get("format") or ["json"])[0],
                        self.request_owner_id(),
                    )
                )
                return
            paper_match = re.fullmatch(r"/api/papers/(\d+)/dossier", parsed.path)
            if paper_match:
                self.send_json(self.store.get_paper(int(paper_match.group(1)), self.request_owner_id()))
                return
            if parsed.path == "/api/analysis-requests":
                items = self.store.list_analysis_requests(self._limit(params, 100), self.request_owner_id())
                self.send_json({"items": items, "total": len(items)})
                return
            task_match = re.fullmatch(r"/api/analysis-requests/([A-Za-z0-9-]+)", parsed.path)
            if task_match:
                self.send_json(self.store.get_analysis_request(task_match.group(1), self.request_owner_id()))
                return
            stage_match = re.fullmatch(
                r"/api/analysis-requests/([A-Za-z0-9-]+)/stages/([a-z]+)",
                parsed.path,
            )
            if stage_match:
                task = self.store.get_analysis_request(stage_match.group(1), self.request_owner_id())
                self.send_json(self.store.get_analysis_stage(task["id"], stage_match.group(2)))
                return
            if parsed.path == "/api/projects":
                self.send_json(self._search_request(params, "project"))
                return
            if parsed.path == "/api/projects/relations":
                full_name = (params.get("repo") or [""])[0]
                self.send_json(self.store.get_project(full_name))
                return
            if parsed.path == "/api/frontier/candidates":
                items = self.store.list_frontier_candidates(self._limit(params, 40))
                state = self.store.frontier_source_state()
                self.send_json({"items": items, "total": state["candidate_count"], "source": state})
                return
            if parsed.path == "/api/frontier/updates":
                items = self.store.list_frontier_updates(self._limit(params, 30))
                state = self.store.frontier_update_source_state()
                self.send_json({"items": items, "total": state["candidate_count"], "source": state})
                return
            if parsed.path == "/api/frontier/sources":
                self.send_json(
                    {
                        "state": self.store.frontier_source_state(),
                        "update_state": self.store.frontier_update_source_state(),
                        "runs": self.store.list_frontier_source_runs(self._limit(params, 20)),
                    }
                )
                return
            if parsed.path == "/api/frontier/signals":
                requested_status = compact_text((params.get("status") or ["published"])[0], 20)
                if requested_status != "published":
                    self.require_local_editor()
                items = self.store.list_frontier_signals(requested_status, self._limit(params, 40))
                self.send_json({"items": items, "total": len(items), "status": requested_status})
                return
            signal_match = re.fullmatch(r"/api/frontier/signals/([A-Za-z0-9-]+)", parsed.path)
            if signal_match:
                signal = self.store.get_frontier_signal(signal_match.group(1))
                if signal["status"] != "published":
                    self.require_local_editor()
                self.send_json(signal)
                return
            if parsed.path == "/api/trends":
                source_state = self.store.frontier_source_state()
                update_state = self.store.frontier_update_source_state()
                items = self.store.list_frontier_signals("published", self._limit(params, 40))
                self.send_json(
                    {
                        "items": items,
                        "total": len(items),
                        "as_of_date": datetime.now().date().isoformat(),
                        "status": (
                            "published_signals_available"
                            if items
                            else "candidate_review_pending"
                            if source_state["candidate_count"] or update_state["candidate_count"]
                            else "source_pipeline_not_connected"
                        ),
                    }
                )
                return
            if parsed.path == "/api/editor/signals":
                self.require_local_editor()
                requested_status = compact_text((params.get("status") or ["draft"])[0], 20)
                items = self.store.list_frontier_signals(requested_status, self._limit(params, 80))
                self.send_json({"items": items, "total": len(items), "status": requested_status})
                return
            editor_signal_match = re.fullmatch(r"/api/editor/signals/([A-Za-z0-9-]+)", parsed.path)
            if editor_signal_match:
                self.require_local_editor()
                self.send_json(self.store.get_frontier_signal(editor_signal_match.group(1)))
                return
            if parsed.path == "/api/editor/batches":
                status = compact_text((params.get("status") or [""])[0], 30)
                items = self.store.list_editor_batches(self._limit(params, 50), status)
                self.send_json({"items": items, "total": len(items), "status": status})
                return
            if parsed.path == "/api/editor/claims":
                try:
                    paper_id = int((params.get("paperId") or params.get("paper_id") or ["0"])[0])
                except ValueError as error:
                    raise AtlasError("paperId must be an integer") from error
                items = self.store.list_scientific_claims(
                    paper_id=paper_id,
                    source_kind=(params.get("sourceKind") or params.get("source_kind") or [""])[0],
                    limit=self._limit(params, 100),
                )
                self.send_json({"items": items, "total": len(items)})
                return
            editor_claim_match = re.fullmatch(r"/api/editor/claims/([^/]+)", parsed.path)
            if editor_claim_match:
                claim_id = urllib.parse.unquote(editor_claim_match.group(1))
                items = self.store.list_scientific_claims(limit=500)
                claim = next((item for item in items if item["id"] == claim_id), None)
                if claim is None:
                    raise NotFoundError("scientific claim does not exist")
                self.send_json(claim)
                return
            if parsed.path == "/api/editor/claim-candidates":
                status = compact_text((params.get("status") or [""])[0], 20)
                items = self.store.list_claim_candidates("local", status, self._limit(params, 100))
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/editor/claim-clusters":
                items = self.store.list_claim_clusters("local", self._limit(params, 100))
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/editor/threads":
                items = self.store.list_research_threads("local", self._limit(params, 100))
                self.send_json({"items": items, "total": len(items)})
                return
            editor_thread_match = re.fullmatch(r"/api/editor/threads/([^/]+)", parsed.path)
            if editor_thread_match:
                try:
                    revision = int((params.get("revision") or ["0"])[0])
                except ValueError as error:
                    raise AtlasError("revision must be an integer") from error
                self.send_json(
                    self.store.get_research_thread(
                        urllib.parse.unquote(editor_thread_match.group(1)),
                        "local",
                        revision,
                    )
                )
                return
            if parsed.path == "/api/editor/claim-golden-items":
                items = self.store.list_claim_golden_items(self._limit(params, 200))
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/editor/claim-evaluations":
                items = self.store.list_claim_evaluations("local", self._limit(params, 100))
                self.send_json({"items": items, "total": len(items)})
                return
            evaluation_match = re.fullmatch(r"/api/editor/claim-evaluations/([^/]+)", parsed.path)
            if evaluation_match:
                self.send_json(
                    self.store.get_claim_evaluation(
                        urllib.parse.unquote(evaluation_match.group(1)), "local"
                    )
                )
                return
            editor_batch_match = re.fullmatch(r"/api/editor/batches/([^/]+)", parsed.path)
            if editor_batch_match:
                batch_id = urllib.parse.unquote(editor_batch_match.group(1))
                self.send_json(self.store.get_editor_batch(batch_id))
                return
            if parsed.path == "/api/editor/entities":
                kind = compact_text((params.get("kind") or params.get("entityKind") or [""])[0], 40)
                status = compact_text((params.get("status") or [""])[0], 30)
                query = (params.get("q") or params.get("query") or [""])[0]
                items = self.store.list_editor_entities(self._limit(params, 100), kind, status, query)
                self.send_json({"items": items, "total": len(items)})
                return
            editor_entity_match = re.fullmatch(r"/api/editor/entities/([^/]+)", parsed.path)
            if editor_entity_match:
                entity_id = urllib.parse.unquote(editor_entity_match.group(1))
                self.send_json(self.store.get_editor_entity(entity_id))
                return
            if parsed.path == "/api/editor/relationships":
                status = compact_text((params.get("status") or [""])[0], 30)
                entity_id = compact_text((params.get("entityId") or params.get("entity_id") or [""])[0], 160)
                items = self.store.list_editor_relationships(self._limit(params, 100), status, entity_id)
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/editor/coverage":
                status = compact_text((params.get("status") or [""])[0], 20)
                domain = compact_text((params.get("domain") or [""])[0], 40)
                severity = compact_text((params.get("severity") or [""])[0], 20)
                items = self.store.list_editor_coverage(self._limit(params, 100), status, domain, severity)
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/editor/audit":
                action = compact_text((params.get("action") or [""])[0], 60)
                items = self.store.list_editor_audit(self._limit(params, 100), action)
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/terms":
                source_state = self.store.frontier_source_state()
                items = self.store.list_frontier_terms(self._limit(params, 80))
                total = self.store.catalog_counts()["frontier_terms"]
                self.send_json(
                    {
                        "items": items,
                        "total": total,
                        "status": (
                            "term_candidates_available"
                            if items
                            else "candidate_review_pending"
                            if source_state["candidate_count"]
                            else "source_pipeline_not_connected"
                        ),
                    }
                )
                return
            raise NotFoundError("接口不存在")
        except Exception as error:
            self._handle_error(error)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        self._request_body_consumed = False
        try:
            if parsed.path.startswith("/api/private/"):
                self.require_private_origin()
            if parsed.path.startswith("/api/editor/") or parsed.path in {"/api/papers/context", "/api/projects/context"}:
                self.require_local_editor()
            if re.fullmatch(r"/api/papers/\d+/flowloom-context", parsed.path):
                self.require_private_origin()
            if parsed.path == "/api/private/backups" or parsed.path.startswith("/api/private/backups/"):
                self.require_local_editor()
            diagnostic_match = re.fullmatch(
                r"/api/(?:private|editor)/diagnostics/(worker|scanner)",
                parsed.path,
            )
            if diagnostic_match:
                payload = self.read_json()
                dry_run = payload.get("dryRun", payload.get("dry_run", True))
                if dry_run is not True:
                    raise AtlasError("诊断端点只支持 dryRun=true")
                result = (
                    self.store.worker_claim_diagnostics()
                    if diagnostic_match.group(1) == "worker"
                    else self.store.scanner_diagnostics()
                )
                self.send_json(result)
                return
            backup_action_match = re.fullmatch(
                r"/api/(?:private|editor)/backups/(export|verify|restore|import)",
                parsed.path,
            )
            if backup_action_match:
                payload = self.read_json()
                action = backup_action_match.group(1)
                if action == "export":
                    self.send_json(self.store.create_backup(None, payload), HTTPStatus.CREATED)
                    return
                backup_id = compact_text(payload.get("backupId") or payload.get("backup_id"), 80)
                backup = None
                if backup_id:
                    backup = next(
                        (item for item in self.store.list_backups(100) if item.get("id") == backup_id),
                        None,
                    )
                    if backup is None:
                        raise NotFoundError("备份记录不存在")
                backup_path = payload.get("path") or payload.get("backupPath") or payload.get("backup_path")
                manifest = payload.get("manifest")
                if backup:
                    backup_path = backup["path"]
                    manifest = backup.get("manifest") or manifest
                if not backup_path:
                    raise AtlasError("备份操作必须提供 backupId 或 path")
                if manifest is not None and not isinstance(manifest, dict):
                    raise AtlasError("备份 manifest 必须是对象")
                if action == "verify":
                    self.send_json(self.store.validate_backup(backup_path, manifest))
                else:
                    self.send_json(self.store.restore_backup(backup_path, manifest, payload))
                return
            if parsed.path == "/api/bridge":
                result = self.store.process_bridge(self.read_json(), self.bridge_origins())
                self.send_json(result, HTTPStatus.ACCEPTED)
                return
            paper_flowloom_context_match = re.fullmatch(r"/api/papers/(\d+)/flowloom-context", parsed.path)
            if paper_flowloom_context_match:
                self.send_json(
                    self.store.export_paper_flowloom_context(
                        int(paper_flowloom_context_match.group(1)),
                        self.read_json(),
                        self.request_owner_id(),
                    )
                )
                return
            if parsed.path == "/api/papers/context":
                self.send_json(self.store.upsert_paper(self.read_json()), HTTPStatus.CREATED)
                return
            if parsed.path == "/api/projects/context":
                self.send_json(self.store.upsert_project(self.read_json()), HTTPStatus.CREATED)
                return
            if parsed.path == "/api/analysis-requests":
                task, reused = self.store.create_analysis_request(self.read_json(), self.request_owner_id())
                self.send_json({"task": task, "reused": reused}, HTTPStatus.OK if reused else HTTPStatus.CREATED)
                return
            if parsed.path == "/api/private/focus":
                self.send_json(self.store.update_focus_profile(self.read_json(), self.request_owner_id()))
                return
            if parsed.path == "/api/private/saved":
                self.send_json(self.store.save_item(self.read_json(), self.request_owner_id()), HTTPStatus.CREATED)
                return
            if parsed.path == "/api/private/learning-progress":
                self.send_json(self.store.update_learning_progress(self.read_json(), self.request_owner_id()))
                return
            if parsed.path == "/api/private/digests":
                self.send_json(
                    self.store.create_research_digest(self.read_json(), self.request_owner_id(), "private"),
                    HTTPStatus.CREATED,
                )
                return
            if parsed.path in {"/api/private/views", "/api/private/research-views"}:
                self.send_json(self.store.create_research_view(self.read_json(), self.request_owner_id()), HTTPStatus.CREATED)
                return
            view_update_match = re.fullmatch(r"/api/private/(?:views|research-views)/([0-9a-f-]{36})", parsed.path)
            if view_update_match:
                self.send_json(
                    self.store.update_research_view(view_update_match.group(1), self.read_json(), self.request_owner_id())
                )
                return
            view_run_match = re.fullmatch(r"/api/private/(?:views|research-views)/([0-9a-f-]{36})/run", parsed.path)
            if view_run_match:
                result = self.store.apply_research_view(
                    view_run_match.group(1), self.request_owner_id(), self.read_json()
                )
                self.send_json(result, HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED)
                return
            if parsed.path == "/api/private/notifications/refresh":
                self.send_json(self.store.refresh_notifications(self.request_owner_id()))
                return
            notification_read_match = re.fullmatch(r"/api/private/notifications/([0-9a-f-]{36})/read", parsed.path)
            if notification_read_match:
                payload = self.read_json()
                self.send_json(self.store.mark_notification_read(notification_read_match.group(1), True, self.request_owner_id()))
                return
            if parsed.path == "/api/private/notifications/read-all":
                owner = self.request_owner_id()
                items = self.store.list_notifications(owner, unread_only=True, limit=500)
                updated = [self.store.mark_notification_read(item["id"], True, owner) for item in items]
                self.send_json({"items": updated, "updated": len(updated)})
                return
            if parsed.path == "/api/private/provenance-bundles":
                result = self.store.create_provenance_bundle(self.read_json(), self.request_owner_id())
                self.send_json(result, HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED)
                return
            if parsed.path == "/api/editor/digests":
                self.send_json(
                    self.store.create_research_digest(self.read_json(), "public", "public"),
                    HTTPStatus.CREATED,
                )
                return
            if parsed.path == "/api/private/backups":
                payload = self.read_json()
                self.send_json(
                    self.store.create_backup(self.store.path.parent / "backups", payload),
                    HTTPStatus.CREATED,
                )
                return
            if parsed.path == "/api/private/backups/validate":
                payload = self.read_json()
                self.send_json(
                    self.store.validate_backup(
                        Path(compact_text(payload.get("path"), 2000)),
                        payload.get("manifest") if isinstance(payload.get("manifest"), dict) else None,
                    )
                )
                return
            if parsed.path == "/api/private/backups/restore":
                payload = self.read_json()
                self.send_json(
                    self.store.restore_backup(
                        Path(compact_text(payload.get("path"), 2000)),
                        payload.get("manifest") if isinstance(payload.get("manifest"), dict) else None,
                        payload,
                    )
                )
                return
            if parsed.path == "/api/private/import":
                self.send_json(self.store.import_research_data(self.read_json(), self.request_owner_id()))
                return
            if parsed.path == "/api/editor/sync/paperfield":
                payload = self.read_json()
                self.store._editor_actor(payload)
                self.store._editor_reason(payload, required=True)
                try:
                    limit = max(1, min(500, int(payload.get("limit") or 250)))
                except (TypeError, ValueError) as error:
                    raise AtlasError("同步 limit 必须是整数") from error
                reset = bool(payload.get("reset"))
                checkpoint = self.store.paperfield_sync_checkpoint()
                cursor = 0 if reset else int(checkpoint["cursor_value"])
                page, source_url = self.fetch_paperfield_catalog(cursor, limit)
                run = self.store.apply_paperfield_sync_page(
                    page,
                    source_url=source_url,
                    editor_payload=payload,
                    reset=reset,
                )
                self.send_json(
                    {
                        "run": run,
                        "checkpoint": self.store.paperfield_sync_checkpoint(),
                        "hasMore": bool(page.get("hasMore")),
                    }
                )
                return
            if parsed.path == "/api/editor/claims/import":
                result = self.store.import_dossier_claims(self.read_json(), "local")
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            if parsed.path == "/api/editor/claim-candidates":
                result = self.store.create_claim_candidate(self.read_json(), "local")
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            candidate_review_match = re.fullmatch(
                r"/api/editor/claim-candidates/([^/]+)/(approve|reject)", parsed.path
            )
            if candidate_review_match:
                payload = self.read_json()
                payload["decision"] = candidate_review_match.group(2)
                self.send_json(
                    self.store.review_claim_candidate(
                        urllib.parse.unquote(candidate_review_match.group(1)),
                        payload,
                        "local",
                    )
                )
                return
            if parsed.path == "/api/editor/claim-clusters":
                result = self.store.create_claim_cluster(self.read_json(), "local")
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            membership_create_match = re.fullmatch(
                r"/api/editor/claim-clusters/([^/]+)/memberships", parsed.path
            )
            if membership_create_match:
                result = self.store.create_claim_membership(
                    urllib.parse.unquote(membership_create_match.group(1)),
                    self.read_json(),
                    "local",
                )
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            membership_review_match = re.fullmatch(
                r"/api/editor/claim-memberships/([^/]+)/(approve|reject)", parsed.path
            )
            if membership_review_match:
                payload = self.read_json()
                payload["decision"] = membership_review_match.group(2)
                self.send_json(
                    self.store.review_claim_membership(
                        urllib.parse.unquote(membership_review_match.group(1)),
                        payload,
                        "local",
                    )
                )
                return
            if parsed.path == "/api/editor/threads":
                result = self.store.create_research_thread(self.read_json(), "local")
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            thread_revision_create_match = re.fullmatch(
                r"/api/editor/threads/([^/]+)/revisions", parsed.path
            )
            if thread_revision_create_match:
                result = self.store.create_thread_revision(
                    urllib.parse.unquote(thread_revision_create_match.group(1)),
                    self.read_json(),
                    "local",
                )
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            thread_revision_action_match = re.fullmatch(
                r"/api/editor/threads/([^/]+)/revisions/(\d+)/(publish|retract)",
                parsed.path,
            )
            if thread_revision_action_match:
                self.send_json(
                    self.store.transition_thread_revision(
                        urllib.parse.unquote(thread_revision_action_match.group(1)),
                        int(thread_revision_action_match.group(2)),
                        thread_revision_action_match.group(3),
                        self.read_json(),
                        "local",
                    )
                )
                return
            thread_rollback_match = re.fullmatch(
                r"/api/editor/threads/([^/]+)/revisions/(\d+)/rollback", parsed.path
            )
            if thread_rollback_match:
                result = self.store.rollback_thread_revision(
                    urllib.parse.unquote(thread_rollback_match.group(1)),
                    int(thread_rollback_match.group(2)),
                    self.read_json(),
                    "local",
                )
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            thread_export_match = re.fullmatch(
                r"/api/editor/threads/([^/]+)/flowloom-export", parsed.path
            )
            if thread_export_match:
                self.send_json(
                    self.store.export_thread_context(
                        urllib.parse.unquote(thread_export_match.group(1)),
                        self.read_json(),
                        "local",
                    )
                )
                return
            if parsed.path == "/api/editor/claim-golden-items":
                self.send_json(
                    self.store.create_claim_golden_item(self.read_json()),
                    HTTPStatus.CREATED,
                )
                return
            if parsed.path == "/api/editor/claim-evaluations":
                result = self.store.create_claim_evaluation(self.read_json(), "local")
                self.send_json(
                    result,
                    HTTPStatus.OK if result.get("idempotent_replay") else HTTPStatus.CREATED,
                )
                return
            if parsed.path == "/api/editor/batches":
                self.send_json(self.store.create_editor_batch(self.read_json()), HTTPStatus.CREATED)
                return
            editor_batch_preview_match = re.fullmatch(r"/api/editor/batches/([^/]+)/preview", parsed.path)
            if editor_batch_preview_match:
                self.send_json(
                    self.store.preview_editor_batch(
                        urllib.parse.unquote(editor_batch_preview_match.group(1)),
                        self.read_json(),
                    )
                )
                return
            editor_batch_apply_match = re.fullmatch(r"/api/editor/batches/([^/]+)/apply", parsed.path)
            if editor_batch_apply_match:
                self.send_json(
                    self.store.apply_editor_batch(
                        urllib.parse.unquote(editor_batch_apply_match.group(1)),
                        self.read_json(),
                    )
                )
                return
            editor_batch_transition_match = re.fullmatch(
                r"/api/editor/batches/([^/]+)/(pause|resume|cancel|retry)",
                parsed.path,
            )
            if editor_batch_transition_match:
                self.send_json(
                    self.store.transition_editor_batch(
                        urllib.parse.unquote(editor_batch_transition_match.group(1)),
                        editor_batch_transition_match.group(2),
                        self.read_json(),
                    )
                )
                return
            editor_batch_item_match = re.fullmatch(
                r"/api/editor/batches/([^/]+)/items/([^/]+)/(approve|reject)",
                parsed.path,
            )
            if editor_batch_item_match:
                self.send_json(
                    self.store.decide_editor_batch_item(
                        urllib.parse.unquote(editor_batch_item_match.group(1)),
                        urllib.parse.unquote(editor_batch_item_match.group(2)),
                        editor_batch_item_match.group(3),
                        self.read_json(),
                    )
                )
                return
            if parsed.path == "/api/editor/entities":
                self.send_json(self.store.create_editor_entity(self.read_json()), HTTPStatus.CREATED)
                return
            editor_entity_alias_match = re.fullmatch(r"/api/editor/entities/([^/]+)/aliases", parsed.path)
            if editor_entity_alias_match:
                self.send_json(
                    self.store.add_editor_entity_alias(
                        urllib.parse.unquote(editor_entity_alias_match.group(1)),
                        self.read_json(),
                    ),
                )
                return
            editor_entity_merge_match = re.fullmatch(r"/api/editor/entities/([^/]+)/merge", parsed.path)
            if editor_entity_merge_match:
                self.send_json(
                    self.store.merge_editor_entities(
                        urllib.parse.unquote(editor_entity_merge_match.group(1)),
                        self.read_json(),
                    ),
                )
                return
            editor_entity_update_match = re.fullmatch(r"/api/editor/entities/([^/]+)", parsed.path)
            if editor_entity_update_match:
                self.send_json(
                    self.store.update_editor_entity(
                        urllib.parse.unquote(editor_entity_update_match.group(1)),
                        self.read_json(),
                    ),
                )
                return
            if parsed.path == "/api/editor/relationships":
                self.send_json(self.store.create_editor_relationship(self.read_json()), HTTPStatus.CREATED)
                return
            editor_relationship_update_match = re.fullmatch(r"/api/editor/relationships/([^/]+)", parsed.path)
            if editor_relationship_update_match:
                self.send_json(
                    self.store.update_editor_relationship(
                        urllib.parse.unquote(editor_relationship_update_match.group(1)),
                        self.read_json(),
                    ),
                )
                return
            if parsed.path == "/api/editor/coverage/recompute":
                items = self.store.recompute_editor_coverage(self.read_json())
                self.send_json({"items": items, "total": len(items)})
                return
            if parsed.path == "/api/editor/signals":
                self.require_local_editor()
                self.send_json(
                    self.store.create_frontier_signal_from_term(self.read_json()),
                    HTTPStatus.CREATED,
                )
                return
            signal_action_match = re.fullmatch(
                r"/api/editor/signals/([A-Za-z0-9-]+)/(publish|retract)",
                parsed.path,
            )
            if signal_action_match:
                self.require_local_editor()
                payload = self.read_json()
                if signal_action_match.group(2) == "publish":
                    result = self.store.publish_frontier_signal(signal_action_match.group(1), payload)
                else:
                    result = self.store.retract_frontier_signal(signal_action_match.group(1), payload)
                self.send_json(result)
                return
            signal_update_match = re.fullmatch(r"/api/editor/signals/([A-Za-z0-9-]+)", parsed.path)
            if signal_update_match:
                self.require_local_editor()
                self.send_json(
                    self.store.update_frontier_signal(signal_update_match.group(1), self.read_json())
                )
                return
            if parsed.path == "/api/worker/claim":
                self.require_worker()
                payload = self.read_json()
                dry_run = payload.get("dryRun", payload.get("dry_run", False))
                if not isinstance(dry_run, bool):
                    raise AtlasError("dryRun 必须是布尔值")
                if dry_run:
                    self.send_json(
                        {
                            "claim": None,
                            "dry_run": True,
                            "diagnostics": self.store.worker_claim_diagnostics(),
                        }
                    )
                    return
                claim = self.store.claim_analysis_request(
                    payload.get("workerId") or payload.get("worker_id"),
                    payload.get("leaseSeconds") or payload.get("lease_seconds") or DEFAULT_LEASE_SECONDS,
                )
                self.send_json({"claim": claim})
                return
            lease_action_match = re.fullmatch(
                r"/api/worker/leases/([A-Za-z0-9-]+)/(heartbeat|release)",
                parsed.path,
            )
            if lease_action_match:
                self.require_worker()
                payload = self.read_json()
                lease_token = self.headers.get("X-Atlas-Lease-Token", "")
                if lease_action_match.group(2) == "heartbeat":
                    result = self.store.heartbeat_worker_lease(
                        lease_action_match.group(1),
                        lease_token,
                        payload.get("leaseSeconds") or payload.get("lease_seconds") or DEFAULT_LEASE_SECONDS,
                    )
                else:
                    result = self.store.release_worker_lease(lease_action_match.group(1), lease_token)
                self.send_json(result)
                return
            material_authorization_match = re.fullmatch(
                r"/api/analysis-requests/([A-Za-z0-9-]+)/material-authorization",
                parsed.path,
            )
            if material_authorization_match:
                self.send_json(
                    self.store.authorize_analysis_material(
                        material_authorization_match.group(1),
                        self.read_json(),
                        self.request_owner_id(),
                    )
                )
                return
            material_action_match = re.fullmatch(
                r"/api/analysis-requests/([A-Za-z0-9-]+)/material/(download-start|downloaded|parse-start|ready|fail)",
                parsed.path,
            )
            if material_action_match:
                self.require_worker()
                self.send_json(
                    self.store.update_analysis_material(
                        material_action_match.group(1),
                        material_action_match.group(2),
                        self.read_json(),
                        self.headers.get("X-Atlas-Lease-Token", ""),
                    )
                )
                return
            action_match = re.fullmatch(
                r"/api/analysis-requests/([A-Za-z0-9-]+)/(pause|resume|cancel|retry)",
                parsed.path,
            )
            if action_match:
                payload = self.read_json()
                stage_key = compact_text(payload.get("stage"), 40) if action_match.group(2) == "retry" else ""
                self.send_json(
                    self.store.transition_analysis_request(
                        action_match.group(1),
                        action_match.group(2),
                        stage_key,
                        self.request_owner_id(),
                    )
                )
                return
            stage_action_match = re.fullmatch(
                r"/api/analysis-requests/([A-Za-z0-9-]+)/stages/([a-z]+)/(start|progress|complete|fail)",
                parsed.path,
            )
            if stage_action_match:
                self.require_worker()
                self.store.validate_worker_lease(
                    stage_action_match.group(1),
                    self.headers.get("X-Atlas-Lease-Token", ""),
                    allow_never_claimed=True,
                )
                self.send_json(
                    self.store.update_analysis_stage(
                        stage_action_match.group(1),
                        stage_action_match.group(2),
                        stage_action_match.group(3),
                        self.read_json(),
                    )
                )
                return
            raise NotFoundError("接口不存在")
        except Exception as error:
            self.discard_small_request_body()
            self._handle_error(error)

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path.startswith("/api/private/"):
                self.require_private_origin()
            if parsed.path.startswith("/api/editor/"):
                self.require_local_editor()
            saved_match = re.fullmatch(r"/api/private/saved/([A-Za-z0-9-]+)", parsed.path)
            if saved_match:
                self.send_json(self.store.delete_saved_item(saved_match.group(1), self.request_owner_id()))
                return
            view_match = re.fullmatch(r"/api/private/(?:views|research-views)/([0-9a-f-]{36})", parsed.path)
            if view_match:
                self.send_json(self.store.delete_research_view(view_match.group(1), self.request_owner_id()))
                return
            raise NotFoundError("接口不存在")
        except Exception as error:
            self._handle_error(error)


def create_server(
    host: str,
    port: int,
    store: AtlasStore,
    paperfield_base_url: str,
    flowloom_base_url: str,
    extra_allowed_origins: set[str] | None = None,
    worker_token: str = "",
    paperfield_sync_token: str = "",
    proxy_token: str = "",
    insecure_proxy_headers: bool = False,
) -> ThreadingHTTPServer:
    paperfield_origin = origin_for_url(paperfield_base_url)
    allowed_origins = {paperfield_origin, *set(extra_allowed_origins or set())}
    if "127.0.0.1" in paperfield_origin:
        allowed_origins.add(paperfield_origin.replace("127.0.0.1", "localhost"))
    handler = type(
        "ConfiguredAtlasHandler",
        (AtlasHandler,),
        {
            "store": store,
            "paperfield_base_url": paperfield_base_url,
            "flowloom_base_url": flowloom_base_url,
            "allowed_paperfield_origins": allowed_origins,
            "worker_token": worker_token,
            "paperfield_sync_token": paperfield_sync_token,
            "proxy_token": proxy_token,
            "insecure_proxy_headers": bool(insecure_proxy_headers),
        },
    )
    server = ThreadingHTTPServer((host, port), handler)
    # The synchronizer is attached only when main() explicitly starts it;
    # create_server remains side-effect free for tests and embedding callers.
    server.paperfield_synchronizer = None  # type: ignore[attr-defined]
    return server


def main() -> None:
    load_env_file(ROOT / "local" / ".env")
    load_env_file(ROOT / ".env")
    parser = argparse.ArgumentParser(description="Research Atlas companion")
    parser.add_argument("--host", default=os.environ.get("RESEARCH_ATLAS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("RESEARCH_ATLAS_PORT", "8795")))
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(os.environ.get("RESEARCH_ATLAS_DB_PATH", DEFAULT_DB_PATH)),
    )
    parser.add_argument(
        "--paperfield-url",
        default=os.environ.get("RESEARCH_ATLAS_PAPERFIELD_URL", "http://127.0.0.1:8765/"),
    )
    parser.add_argument(
        "--flowloom-url",
        default=os.environ.get("RESEARCH_ATLAS_FLOWLOOM_URL", "http://127.0.0.1:4178/"),
    )
    args = parser.parse_args()
    store = AtlasStore(args.db)
    worker_token = os.environ.get("RESEARCH_ATLAS_WORKER_TOKEN", "").strip()
    paperfield_sync_token = os.environ.get("RESEARCH_ATLAS_PAPERFIELD_SYNC_TOKEN", "").strip()
    proxy_token = os.environ.get("RESEARCH_ATLAS_PAPERFIELD_PROXY_TOKEN", "").strip()
    sync_enabled = os.environ.get("RESEARCH_ATLAS_PAPERFIELD_SYNC_ENABLED", "1").strip().casefold() in {
        "1", "true", "yes", "on"
    }
    try:
        sync_interval = float(
            os.environ.get(
                "RESEARCH_ATLAS_PAPERFIELD_SYNC_INTERVAL_SECONDS",
                str(PAPERFIELD_SYNC_DEFAULT_INTERVAL_SECONDS),
            )
        )
    except ValueError:
        sync_interval = float(PAPERFIELD_SYNC_DEFAULT_INTERVAL_SECONDS)
    try:
        sync_max_pages = int(
            os.environ.get(
                "RESEARCH_ATLAS_PAPERFIELD_SYNC_MAX_PAGES",
                str(PAPERFIELD_SYNC_DEFAULT_MAX_PAGES),
            )
        )
    except ValueError:
        sync_max_pages = PAPERFIELD_SYNC_DEFAULT_MAX_PAGES
    server = create_server(
        args.host,
        args.port,
        store,
        args.paperfield_url,
        args.flowloom_url,
        worker_token=worker_token,
        paperfield_sync_token=paperfield_sync_token,
        proxy_token=proxy_token,
    )
    synchronizer = None
    if sync_enabled:
        synchronizer = PaperfieldCatalogSynchronizer(
            store,
            args.paperfield_url,
            paperfield_sync_token,
            interval_seconds=sync_interval,
            max_pages=sync_max_pages,
        ).start()
        server.paperfield_synchronizer = synchronizer  # type: ignore[attr-defined]
    print(f"Research Atlas is running at http://{args.host}:{args.port}")
    print(f"Atlas database: {store.path}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if synchronizer:
            synchronizer.stop()
        server.server_close()


if __name__ == "__main__":
    main()
