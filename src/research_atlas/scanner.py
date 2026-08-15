from __future__ import annotations

import argparse
import hashlib
import html
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable

try:
    from . import app as atlas
except ImportError:
    import app as atlas


USER_AGENT = "ResearchAtlasScanner/0.8 (local research client)"
ARXIV_API_URL = "https://export.arxiv.org/api/query"
MAX_FEED_BYTES = 8 * 1024 * 1024
MAX_OFFICIAL_FEED_BYTES = 4 * 1024 * 1024
ARXIV_NAMESPACES = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}


class SourceError(RuntimeError):
    pass


@dataclass(frozen=True)
class QuerySpec:
    key: str
    label: str
    domain: str
    topic: str
    categories: tuple[str, ...]
    focus_query: str
    rss_category: str
    keywords: tuple[str, ...]


@dataclass(frozen=True)
class OfficialFeedSpec:
    key: str
    label: str
    url: str
    article_hosts: tuple[str, ...]
    domains: tuple[str, ...]


DEFAULT_QUERY_SPECS = (
    QuerySpec(
        key="embodied",
        label="具身智能与机器人学习",
        domain="embodied",
        topic="具身智能",
        categories=("cs.RO", "cs.AI", "cs.CV", "cs.LG"),
        focus_query=(
            'all:"vision language action" OR all:"vision-language-action" OR '
            'all:"robot learning" OR all:"embodied ai" OR all:"robot manipulation" OR '
            'all:"robot policy" OR all:"world model"'
        ),
        rss_category="cs.RO",
        keywords=(
            "robot learning",
            "reinforcement learning",
            "imitation learning",
            "vision-language",
            "vision language",
            "manipulation",
            "robot policy",
            "world model",
            "embodied",
            "locomotion",
            "navigation",
            "humanoid",
            "dexterous",
            "tactile",
            "sim-to-real",
            "foundation model",
            "diffusion policy",
        ),
    ),
    QuerySpec(
        key="llm",
        label="大模型、推理与智能体",
        domain="llm",
        topic="大语言模型",
        categories=("cs.CL", "cs.AI", "cs.LG"),
        focus_query=(
            'all:"large language model" OR all:"language model agent" OR '
            'all:"reasoning model" OR all:"multimodal large language model" OR '
            'all:"foundation model"'
        ),
        rss_category="cs.CL",
        keywords=(
            "large language model",
            "language model",
            "llm",
            "reasoning",
            "agent",
            "multimodal",
            "foundation model",
            "retrieval augmented",
            "tool use",
        ),
    ),
)


DEFAULT_OFFICIAL_FEEDS = (
    OfficialFeedSpec(
        key="openai",
        label="OpenAI News",
        url="https://openai.com/news/rss.xml",
        article_hosts=("openai.com",),
        domains=("llm",),
    ),
    OfficialFeedSpec(
        key="deepmind",
        label="Google DeepMind",
        url="https://deepmind.google/blog/rss.xml",
        article_hosts=("deepmind.google",),
        domains=("embodied", "llm"),
    ),
    OfficialFeedSpec(
        key="huggingface",
        label="Hugging Face Blog",
        url="https://huggingface.co/blog/feed.xml",
        article_hosts=("huggingface.co",),
        domains=("llm",),
    ),
    OfficialFeedSpec(
        key="microsoft_research",
        label="Microsoft Research",
        url="https://www.microsoft.com/en-us/research/feed/",
        article_hosts=("microsoft.com",),
        domains=("embodied", "llm"),
    ),
    OfficialFeedSpec(
        key="bair",
        label="Berkeley AI Research",
        url="https://bair.berkeley.edu/blog/feed.xml",
        article_hosts=("berkeley.edu",),
        domains=("embodied", "llm"),
    ),
    OfficialFeedSpec(
        key="google_research",
        label="Google Research",
        url="https://research.google/blog/rss/",
        article_hosts=("research.google",),
        domains=("embodied", "llm"),
    ),
)


@dataclass(frozen=True)
class ScannerConfig:
    database: Path
    query_specs: tuple[QuerySpec, ...]
    days_back: int
    max_results: int
    timeout_seconds: int
    request_delay_seconds: float
    interval_seconds: int
    official_feeds: tuple[OfficialFeedSpec, ...] = DEFAULT_OFFICIAL_FEEDS
    official_max_results: int = 12


def scanner_diagnostics(
    config: ScannerConfig,
    include_official_updates: bool = True,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Return a bounded scanner snapshot without opening or mutating SQLite.

    The scanner constructor initializes the Atlas schema when no store is
    supplied.  Keeping this helper pure lets operators inspect a fresh or
    incomplete installation safely from the command line.
    """
    database = Path(config.database).expanduser().resolve()
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    start = now - timedelta(days=max(1, min(60, int(config.days_back))))
    query_items = [
        {
            "key": spec.key,
            "label": spec.label,
            "domain": spec.domain,
            "categories": list(spec.categories),
            "rss_category": spec.rss_category,
            "max_results": max(1, min(100, int(config.max_results))),
        }
        for spec in config.query_specs
    ]
    selected_domains = {spec.domain for spec in config.query_specs}
    feed_items = [
        {
            "key": feed.key,
            "label": feed.label,
            "url": feed.url,
            "domains": list(feed.domains),
            "max_results": max(1, min(50, int(config.official_max_results))),
        }
        for feed in config.official_feeds
        if selected_domains.intersection(feed.domains)
    ]
    exists = database.is_file()
    try:
        size_bytes = database.stat().st_size if exists else 0
    except OSError:
        size_bytes = 0
    return {
        "database": {
            "path": str(database),
            "exists": exists,
            "size_bytes": size_bytes,
            "parent_exists": database.parent.is_dir(),
        },
        "window": {
            "start": start.isoformat(),
            "end": now.isoformat(),
            "days_back": max(1, min(60, int(config.days_back))),
        },
        "queries": query_items,
        "query_count": len(query_items),
        "official_updates": {
            "enabled": bool(include_official_updates),
            "feeds": feed_items if include_official_updates else [],
            "feed_count": len(feed_items) if include_official_updates else 0,
        },
        "limits": {
            "max_results_per_query": max(1, min(100, int(config.max_results))),
            "max_results_per_official_feed": max(1, min(50, int(config.official_max_results))),
            "timeout_seconds": max(5, min(180, int(config.timeout_seconds))),
            "request_delay_seconds": max(0.0, float(config.request_delay_seconds)),
            "interval_seconds": max(900, min(604800, int(config.interval_seconds))),
        },
        "dry_run": bool(dry_run),
        "writes_performed": False,
        "network_requests_performed": False,
    }


@dataclass(frozen=True)
class QueryBatch:
    request_url: str
    candidates: list[dict[str, Any]]
    transport: str = "api"
    fallback_reason: str = ""


@dataclass(frozen=True)
class OfficialBatch:
    request_url: str
    candidates: list[dict[str, Any]]
    fetched_count: int


class _PlainTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_text(value: Any) -> str:
    parser = _PlainTextParser()
    parser.feed(html.unescape(str(value or "")))
    parser.close()
    return atlas.compact_text(" ".join(parser.parts), 30_000)


def _parse_source_time(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _entry_identifier(value: str) -> tuple[str, str] | None:
    raw = urllib.parse.unquote(str(value or "").strip()).rsplit("/", 1)[-1]
    raw = raw.removesuffix(".pdf")
    match = re.fullmatch(r"((?:\d{4}\.\d{4,5}|[a-z.-]+/\d{7}))(v\d+)?", raw, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(1).lower(), (match.group(2) or "").lower()


def _stable_source_hash(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _unique_strings(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = atlas.compact_text(value, 240)
        key = text.casefold()
        if text and key not in seen:
            result.append(text)
            seen.add(key)
    return result


TERM_STOPLIST = {
    "ai",
    "api",
    "cnn",
    "cv",
    "dnn",
    "dof",
    "dpo",
    "drl",
    "gpu",
    "llm",
    "mdp",
    "ml",
    "nlp",
    "rl",
    "rnn",
    "uav",
    "vla",
    "vlm",
}
ACRONYM_STOPWORDS = {"a", "an", "and", "for", "from", "in", "of", "on", "the", "to", "via", "with"}


def _local_name(tag: str) -> str:
    return str(tag).rsplit("}", 1)[-1].lower()


def _first_child_text(node: ET.Element, names: set[str]) -> str:
    for child in list(node):
        if _local_name(child.tag) in names:
            return " ".join(part for part in child.itertext() if part)
    return ""


def _normalize_feed_time(value: Any) -> str:
    text = atlas.compact_text(value, 160)
    if not text:
        return ""
    parsed = _parse_source_time(text)
    if parsed is None:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError):
            return ""
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        parsed = parsed.astimezone(timezone.utc)
    return parsed.replace(microsecond=0).isoformat()


def _keyword_matches(text: str, keyword: str) -> bool:
    haystack = text.casefold()
    needle = keyword.casefold().strip()
    if not needle:
        return False
    if re.fullmatch(r"[a-z0-9 -]+", needle):
        pattern = re.escape(needle).replace(r"\ ", r"\s+")
        return bool(re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", haystack))
    return needle in haystack


def _matched_news_domains(
    text: str,
    feed: OfficialFeedSpec,
    query_specs: tuple[QuerySpec, ...],
) -> tuple[list[str], list[str], list[str]]:
    domains: list[str] = []
    labels: list[str] = []
    keywords: list[str] = []
    for spec in query_specs:
        if spec.domain not in feed.domains:
            continue
        hits = [keyword for keyword in spec.keywords if _keyword_matches(text, keyword)]
        if hits:
            domains.append(spec.domain)
            labels.append(spec.label)
            keywords.extend(hits[:5])
    return _unique_strings(domains), _unique_strings(labels), _unique_strings(keywords)


def _official_article_url(value: Any, feed: OfficialFeedSpec) -> str:
    url = atlas.clean_http_url(value)
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not any(host == allowed or host.endswith(f".{allowed}") for allowed in feed.article_hosts):
        return ""
    query = urllib.parse.urlencode(
        [
            (key, item)
            for key, item in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            if not key.casefold().startswith("utm_") and key.casefold() not in {"source", "ref"}
        ],
        doseq=True,
    )
    return urllib.parse.urlunparse(parsed._replace(query=query, fragment=""))


def _entry_link(entry: ET.Element, feed: OfficialFeedSpec) -> str:
    alternatives: list[str] = []
    for child in list(entry):
        if _local_name(child.tag) != "link":
            continue
        candidate = child.attrib.get("href") or child.text or ""
        url = _official_article_url(candidate, feed)
        if not url:
            continue
        if child.attrib.get("rel", "alternate") == "alternate":
            return url
        alternatives.append(url)
    return alternatives[0] if alternatives else ""


def _related_paper_refs(value: str) -> list[str]:
    refs: list[str] = []
    for match in re.finditer(
        r"(?:arxiv\s*:\s*|arxiv\.org/(?:abs|pdf)/)(\d{4}\.\d{4,5})(?:v\d+)?",
        value,
        flags=re.IGNORECASE,
    ):
        refs.append(f"arxiv:{match.group(1).lower()}")
    for match in re.finditer(r"\b10\.\d{4,9}/[-._;()/:a-z0-9]+", value, flags=re.IGNORECASE):
        refs.append(f"doi:{match.group(0).rstrip('.,;)').lower()}")
    return _unique_strings(refs)[:30]


def parse_official_feed(
    payload: bytes,
    feed: OfficialFeedSpec,
    query_specs: tuple[QuerySpec, ...],
) -> OfficialBatch:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as error:
        raise SourceError(f"{feed.label} 返回了无法解析的 XML") from error
    entry_name = "entry" if _local_name(root.tag) == "feed" else "item"
    entries = [node for node in root.iter() if _local_name(node.tag) == entry_name]
    candidates: list[dict[str, Any]] = []
    for entry in entries:
        title = _plain_text(_first_child_text(entry, {"title"}))
        source_url = _entry_link(entry, feed)
        if not title or not source_url:
            continue
        summary = _plain_text(_first_child_text(entry, {"summary", "description", "content", "encoded"}))
        published = _normalize_feed_time(_first_child_text(entry, {"published", "pubdate", "date"}))
        updated = _normalize_feed_time(_first_child_text(entry, {"updated", "modified"})) or published
        searchable = f"{title} {summary}"
        domains, labels, matched_keywords = _matched_news_domains(searchable, feed, query_specs)
        if not domains:
            continue
        raw_identifier = atlas.compact_text(_first_child_text(entry, {"id", "guid"}), 2000) or source_url
        identifier = hashlib.sha256(f"{feed.key}\n{raw_identifier}".encode("utf-8")).hexdigest()
        normalized_entry = {
            "source_key": feed.key,
            "source_label": feed.label,
            "title": title,
            "summary": summary,
            "source_url": source_url,
            "published": published,
            "updated": updated,
            "domains": domains,
            "matched_queries": labels,
            "matched_keywords": matched_keywords,
        }
        candidates.append(
            {
                "sourceKey": feed.key,
                "sourceLabel": feed.label,
                "sourceKind": "first_party",
                "sourceIdentifier": identifier,
                "title": title,
                "summary": summary,
                "sourceUrl": source_url,
                "domains": domains,
                "matchedQueries": labels,
                "matchedKeywords": matched_keywords,
                "relatedPaperRefs": _related_paper_refs(f"{source_url} {summary}"),
                "publishedAt": published,
                "sourceUpdatedAt": updated,
                "payloadSha256": _stable_source_hash(normalized_entry),
            }
        )
    return OfficialBatch(feed.url, candidates, len(entries))


def _acronym_letters(value: str) -> str:
    letters = re.sub(r"[^A-Za-z0-9]", "", value)
    if len(letters) > 2 and letters.endswith("s") and any(char.isupper() for char in letters[:-1]):
        letters = letters[:-1]
    return letters.upper()


def _expansion_initials(value: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", value)
    return "".join(word[0] for word in words if word.casefold() not in ACRONYM_STOPWORDS).upper()


def _matching_expansion(value: str, acronym: str) -> str:
    words = value.split()
    target = _acronym_letters(acronym)
    for length in range(min(9, len(words)), 1, -1):
        candidate = " ".join(words[-length:]).strip(" ,;:-")
        initials = _expansion_initials(candidate)
        if initials == target or (len(target) >= 3 and initials.startswith(target)):
            return candidate
    return ""


def _term_context(title: str, abstract: str, term: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", abstract)
    source_sentence = next((sentence for sentence in sentences if term.casefold() in sentence.casefold()), "")
    if source_sentence:
        return atlas.compact_text(source_sentence, 1200)
    return atlas.compact_text(title, 1000)


def _looks_coined_token(value: str) -> bool:
    normalized = re.sub(r"[^A-Za-z0-9]", "", value)
    if len(normalized) < 3 or len(normalized) > 40 or normalized.casefold() in TERM_STOPLIST:
        return False
    upper_count = sum(char.isupper() for char in normalized)
    if "-" in value:
        segments = [segment for segment in value.split("-") if segment]
        if segments and all(re.fullmatch(r"[A-Z][a-z]+", segment) for segment in segments):
            return False
        return bool(
            any(char.isdigit() for char in value)
            or any(segment.isupper() and len(segment) >= 2 for segment in segments)
            or any(re.search(r"[a-z][A-Z]", segment) for segment in segments)
        )
    return bool(
        (upper_count >= 2 and any(char.isdigit() for char in value))
        or re.search(r"[a-z][A-Z]", normalized)
        or (upper_count == len(normalized) and 3 <= len(normalized) <= 14)
    )


def _acronym_supported_by_title(title: str, acronym: str) -> bool:
    target = _acronym_letters(acronym)
    if re.search(rf"(?<![A-Za-z0-9]){re.escape(target)}s?(?![A-Za-z0-9])", title, flags=re.IGNORECASE):
        return True
    for token in re.findall(r"\b[A-Za-z][A-Za-z0-9-]{2,39}\b", title):
        normalized = re.sub(r"[^A-Za-z0-9]", "", token).upper()
        if _looks_coined_token(token) and len(normalized) > len(target) and normalized.endswith(target):
            return True
    return False


def extract_term_candidates(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    paper = candidate.get("paper") or {}
    title = atlas.compact_text(paper.get("title"), 1000)
    abstract = atlas.clean_multiline_text(paper.get("abstract"), 30_000)
    source_identifier = atlas.compact_text(
        candidate.get("sourceIdentifier") or candidate.get("source_identifier"),
        300,
    ).lower()
    if not title or not source_identifier:
        return []
    found: list[dict[str, Any]] = []
    seen: set[str] = set()

    def append_term(display: str, kind: str, expansion: str, context: str, rule: str) -> None:
        cleaned = atlas.compact_text(display, 120)
        normalized = re.sub(r"[^a-z0-9]+", "", cleaned.casefold())[:120]
        if len(normalized) < 2 or normalized in seen or normalized in TERM_STOPLIST:
            return
        seen.add(normalized)
        payload = {
            "source_identifier": source_identifier,
            "display_term": cleaned,
            "term_kind": kind,
            "expansion": atlas.compact_text(expansion, 500),
            "context": atlas.compact_text(context, 3000),
            "rule": rule,
        }
        found.append(
            {
                "sourceIdentifier": source_identifier,
                "displayTerm": cleaned,
                "normalizedTerm": normalized,
                "termKind": kind,
                "expansion": payload["expansion"],
                "contextText": payload["context"],
                "extractionRule": rule,
                "payloadSha256": _stable_source_hash(payload),
            }
        )

    combined = f"{title}. {abstract}"
    acronym_pattern = re.compile(
        r"((?:[A-Za-z][A-Za-z0-9-]*\s+){1,9}[A-Za-z][A-Za-z0-9-]*)\s*\(([A-Z][A-Za-z0-9-]{1,15})\)"
    )
    for match in acronym_pattern.finditer(combined):
        acronym = _acronym_letters(match.group(2))
        expansion = _matching_expansion(match.group(1), acronym)
        if not expansion or acronym.casefold() in TERM_STOPLIST or not _acronym_supported_by_title(title, acronym):
            continue
        append_term(acronym, "defined_acronym", expansion, atlas.compact_text(match.group(0), 1200), "explicit_acronym")

    title_prefix = title.split(":", 1)[0].strip()
    prefix_words = title_prefix.split()
    if 1 <= len(prefix_words) <= 3 and any(_looks_coined_token(word) for word in prefix_words):
        append_term(title_prefix, "coined_name", "", _term_context(title, abstract, title_prefix), "title_prefix")
    return found


def parse_arxiv_feed(payload: bytes, spec: QuerySpec) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as error:
        raise SourceError("arXiv 返回了无法解析的 Atom XML") from error
    candidates: list[dict[str, Any]] = []
    for entry in root.findall("atom:entry", ARXIV_NAMESPACES):
        entry_url = atlas.compact_text(entry.findtext("atom:id", default="", namespaces=ARXIV_NAMESPACES), 2000)
        identity = _entry_identifier(entry_url)
        if identity is None:
            continue
        arxiv_id, version = identity
        title = atlas.compact_text(
            entry.findtext("atom:title", default="", namespaces=ARXIV_NAMESPACES),
            1000,
        )
        abstract = atlas.clean_multiline_text(
            entry.findtext("atom:summary", default="", namespaces=ARXIV_NAMESPACES),
            30_000,
        )
        authors = [
            atlas.compact_text(node.findtext("atom:name", default="", namespaces=ARXIV_NAMESPACES), 240)
            for node in entry.findall("atom:author", ARXIV_NAMESPACES)
        ]
        authors = [author for author in authors if author]
        published = atlas.compact_text(
            entry.findtext("atom:published", default="", namespaces=ARXIV_NAMESPACES),
            80,
        )
        updated = atlas.compact_text(
            entry.findtext("atom:updated", default="", namespaces=ARXIV_NAMESPACES),
            80,
        )
        doi = atlas.normalize_doi(
            entry.findtext("arxiv:doi", default="", namespaces=ARXIV_NAMESPACES)
        )
        journal_ref = atlas.compact_text(
            entry.findtext("arxiv:journal_ref", default="", namespaces=ARXIV_NAMESPACES),
            300,
        )
        categories = _unique_strings(
            [node.attrib.get("term", "") for node in entry.findall("atom:category", ARXIV_NAMESPACES)]
        )
        primary_node = entry.find("arxiv:primary_category", ARXIV_NAMESPACES)
        primary_category = atlas.compact_text(primary_node.attrib.get("term", "") if primary_node is not None else "", 80)
        if primary_category:
            categories = _unique_strings([primary_category, *categories])
        normalized_entry = {
            "arxiv_id": arxiv_id,
            "version": version,
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "published": published,
            "updated": updated,
            "doi": doi,
            "journal_ref": journal_ref,
            "categories": categories,
            "primary_category": primary_category,
        }
        candidates.append(
            {
                "sourceIdentifier": arxiv_id,
                "sourceBasis": "abstract" if abstract else "metadata",
                "domains": [spec.domain],
                "matchedQueries": [spec.label],
                "categories": categories,
                "publishedAt": published,
                "sourceUpdatedAt": updated or published,
                "payloadSha256": _stable_source_hash(normalized_entry),
                "paper": {
                    "canonicalRef": f"arxiv:{arxiv_id}",
                    "arxivId": arxiv_id,
                    "title": title,
                    "abstract": abstract,
                    "authors": authors,
                    "venue": journal_ref or "arXiv",
                    "published": published,
                    "version": version,
                    "sourceUrl": f"https://arxiv.org/abs/{arxiv_id}{version}",
                    "pdfUrl": f"https://arxiv.org/pdf/{arxiv_id}{version}",
                    "doi": doi,
                    "topics": [spec.topic],
                },
            }
        )
    return candidates


def parse_arxiv_rss(payload: bytes, spec: QuerySpec) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as error:
        raise SourceError("arXiv RSS 返回了无法解析的 XML") from error
    candidates: list[dict[str, Any]] = []
    for item in root.findall("./channel/item"):
        link = atlas.compact_text(item.findtext("link", default=""), 2000)
        guid = atlas.compact_text(item.findtext("guid", default=""), 500)
        description = _plain_text(item.findtext("description", default=""))
        identity = _entry_identifier(guid.removeprefix("oai:arXiv.org:")) or _entry_identifier(link)
        if identity is None:
            continue
        arxiv_id, version = identity
        title = atlas.compact_text(item.findtext("title", default=""), 1000)
        abstract = re.sub(
            r"^arXiv:\S+\s+Announce Type:\s*\S+\s+Abstract:\s*",
            "",
            description,
            flags=re.IGNORECASE,
        ).strip()
        searchable = f"{title} {abstract}".casefold()
        if spec.keywords and not any(keyword.casefold() in searchable for keyword in spec.keywords):
            continue
        creator = atlas.compact_text(
            item.findtext("{http://purl.org/dc/elements/1.1/}creator", default=""),
            4000,
        )
        categories = _unique_strings([node.text or "" for node in item.findall("category")])
        raw_published = atlas.compact_text(item.findtext("pubDate", default=""), 120)
        try:
            published = parsedate_to_datetime(raw_published).astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError, OverflowError):
            published = raw_published
        normalized_entry = {
            "arxiv_id": arxiv_id,
            "version": version,
            "title": title,
            "abstract": abstract,
            "creator": creator,
            "published": published,
            "categories": categories,
            "transport": "rss",
        }
        candidates.append(
            {
                "sourceIdentifier": arxiv_id,
                "sourceBasis": "abstract" if abstract else "metadata",
                "domains": [spec.domain],
                "matchedQueries": [spec.label],
                "categories": categories,
                "publishedAt": published,
                "sourceUpdatedAt": published,
                "payloadSha256": _stable_source_hash(normalized_entry),
                "paper": {
                    "canonicalRef": f"arxiv:{arxiv_id}",
                    "arxivId": arxiv_id,
                    "title": title,
                    "abstract": abstract,
                    "authors": [creator] if creator else [],
                    "venue": "arXiv",
                    "published": published,
                    "version": version,
                    "sourceUrl": f"https://arxiv.org/abs/{arxiv_id}{version}",
                    "pdfUrl": f"https://arxiv.org/pdf/{arxiv_id}{version}",
                    "topics": [spec.topic],
                },
            }
        )
    return candidates


def merge_candidate(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    current_time = _parse_source_time(current.get("sourceUpdatedAt")) or datetime.min.replace(tzinfo=timezone.utc)
    incoming_time = _parse_source_time(incoming.get("sourceUpdatedAt")) or datetime.min.replace(tzinfo=timezone.utc)
    result = dict(incoming if incoming_time >= current_time else current)
    result["domains"] = _unique_strings([*(current.get("domains") or []), *(incoming.get("domains") or [])])
    result["matchedQueries"] = _unique_strings(
        [*(current.get("matchedQueries") or []), *(incoming.get("matchedQueries") or [])]
    )
    result["categories"] = _unique_strings(
        [*(current.get("categories") or []), *(incoming.get("categories") or [])]
    )
    paper = dict(result.get("paper") or {})
    paper["topics"] = _unique_strings(
        [
            *((current.get("paper") or {}).get("topics") or []),
            *((incoming.get("paper") or {}).get("topics") or []),
        ]
    )
    result["paper"] = paper
    return result


class ArxivClient:
    def __init__(
        self,
        fetcher: Callable[[str, int], bytes] | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.fetcher = fetcher
        self.sleeper = sleeper

    @staticmethod
    def request_url(spec: QuerySpec, start: datetime, end: datetime, max_results: int) -> str:
        category_query = " OR ".join(f"cat:{category}" for category in spec.categories)
        submitted_window = f"submittedDate:[{start:%Y%m%d%H%M} TO {end:%Y%m%d%H%M}]"
        search_query = f"({category_query}) AND ({spec.focus_query}) AND {submitted_window}"
        params = urllib.parse.urlencode(
            {
                "search_query": search_query,
                "start": 0,
                "max_results": max_results,
                "sortBy": "lastUpdatedDate",
                "sortOrder": "descending",
            }
        )
        return f"{ARXIV_API_URL}?{params}"

    def _request(self, url: str, timeout_seconds: int, attempts: int = 3) -> bytes:
        if self.fetcher is not None:
            return self.fetcher(url, timeout_seconds)
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/atom+xml,application/xml;q=0.9"},
        )
        safe_attempts = max(1, min(3, attempts))
        for attempt in range(safe_attempts):
            try:
                with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                    final = urllib.parse.urlparse(response.geturl())
                    expected_host = (urllib.parse.urlparse(url).hostname or "").lower()
                    if (
                        final.scheme != "https"
                        or expected_host not in {"export.arxiv.org", "rss.arxiv.org"}
                        or (final.hostname or "").lower() != expected_host
                    ):
                        raise SourceError("arXiv 请求被重定向到非预期主机")
                    declared = response.headers.get("Content-Length", "")
                    if declared:
                        try:
                            if int(declared) > MAX_FEED_BYTES:
                                raise SourceError("arXiv Atom 响应超过大小限制")
                        except ValueError as error:
                            raise SourceError("arXiv Content-Length 无效") from error
                    payload = response.read(MAX_FEED_BYTES + 1)
                    if len(payload) > MAX_FEED_BYTES:
                        raise SourceError("arXiv Atom 响应超过大小限制")
                    return payload
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    raise SourceError("arXiv API 返回 HTTP 429") from error
                if error.code not in {502, 503, 504} or attempt == safe_attempts - 1:
                    raise SourceError(f"arXiv API 返回 HTTP {error.code}") from error
                retry_after = error.headers.get("Retry-After", "")
                try:
                    delay = max(float(retry_after), 2 ** (attempt + 1))
                except ValueError:
                    delay = 2 ** (attempt + 1)
                self.sleeper(min(delay, 30))
            except SourceError:
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
                if attempt == safe_attempts - 1:
                    raise SourceError("无法连接 arXiv API") from error
                self.sleeper(2 ** (attempt + 1))
        raise SourceError("arXiv API 请求失败")

    def fetch(
        self,
        spec: QuerySpec,
        start: datetime,
        end: datetime,
        max_results: int,
        timeout_seconds: int,
    ) -> QueryBatch:
        url = self.request_url(spec, start, end, max_results)
        try:
            payload = self._request(url, min(timeout_seconds, 12), attempts=1)
            return QueryBatch(url, parse_arxiv_feed(payload, spec))
        except SourceError as error:
            rss_url = f"https://rss.arxiv.org/rss/{urllib.parse.quote(spec.rss_category, safe='.')}"
            rss_payload = self._request(rss_url, timeout_seconds, attempts=3)
            candidates = parse_arxiv_rss(rss_payload, spec)[:max_results]
            return QueryBatch(rss_url, candidates, "rss", str(error)[:1000])


class OfficialUpdatesClient:
    def __init__(
        self,
        fetcher: Callable[[str, int], bytes] | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.fetcher = fetcher
        self.sleeper = sleeper

    def _request(self, feed: OfficialFeedSpec, timeout_seconds: int) -> bytes:
        if self.fetcher is not None:
            return self.fetcher(feed.url, timeout_seconds)
        request = urllib.request.Request(
            feed.url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/atom+xml,application/rss+xml,application/xml;q=0.9"},
        )
        expected_host = (urllib.parse.urlparse(feed.url).hostname or "").lower()
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                    final = urllib.parse.urlparse(response.geturl())
                    if final.scheme != "https" or (final.hostname or "").lower() != expected_host:
                        raise SourceError(f"{feed.label} 请求被重定向到非预期主机")
                    declared = response.headers.get("Content-Length", "")
                    if declared:
                        try:
                            if int(declared) > MAX_OFFICIAL_FEED_BYTES:
                                raise SourceError(f"{feed.label} 响应超过大小限制")
                        except ValueError as error:
                            raise SourceError(f"{feed.label} Content-Length 无效") from error
                    payload = response.read(MAX_OFFICIAL_FEED_BYTES + 1)
                    if len(payload) > MAX_OFFICIAL_FEED_BYTES:
                        raise SourceError(f"{feed.label} 响应超过大小限制")
                    return payload
            except urllib.error.HTTPError as error:
                if error.code not in {429, 502, 503, 504} or attempt == 2:
                    raise SourceError(f"{feed.label} 返回 HTTP {error.code}") from error
                self.sleeper(min(2 ** (attempt + 1), 15))
            except SourceError:
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException) as error:
                if attempt == 2:
                    raise SourceError(f"无法连接 {feed.label}") from error
                self.sleeper(2 ** (attempt + 1))
        raise SourceError(f"{feed.label} 请求失败")

    def fetch(
        self,
        feed: OfficialFeedSpec,
        query_specs: tuple[QuerySpec, ...],
        timeout_seconds: int,
    ) -> OfficialBatch:
        return parse_official_feed(self._request(feed, timeout_seconds), feed, query_specs)


class FrontierScanner:
    def __init__(
        self,
        config: ScannerConfig,
        store: atlas.AtlasStore | None = None,
        client: ArxivClient | None = None,
        updates_client: OfficialUpdatesClient | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config = config
        self.store = store or atlas.AtlasStore(config.database)
        self.client = client or ArxivClient(sleeper=sleeper)
        self.updates_client = updates_client or OfficialUpdatesClient(sleeper=sleeper)
        self.sleeper = sleeper

    def refresh_term_candidates(self) -> dict[str, int]:
        extractions: list[dict[str, Any]] = []
        for candidate in self.store.list_frontier_candidates(1000):
            extractions.extend(extract_term_candidates(candidate))
        return self.store.record_frontier_term_candidates(extractions, "arxiv", synchronize=True)

    def scan_once(self, now: datetime | None = None) -> dict[str, Any]:
        end = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(second=0, microsecond=0)
        start = end - timedelta(days=self.config.days_back)
        query_spec = [
            {
                "key": spec.key,
                "label": spec.label,
                "domain": spec.domain,
                "categories": list(spec.categories),
                "focus_query": spec.focus_query,
                "rss_category": spec.rss_category,
                "keywords": list(spec.keywords),
                "window_start": start.isoformat(),
                "window_end": end.isoformat(),
                "max_results": self.config.max_results,
            }
            for spec in self.config.query_specs
        ]
        run = self.store.start_frontier_source_run("arxiv", query_spec)
        combined: dict[str, dict[str, Any]] = {}
        query_results: list[dict[str, Any]] = []
        errors: list[str] = []
        fetched_count = 0
        successful_queries = 0
        try:
            for index, spec in enumerate(self.config.query_specs):
                if index:
                    self.sleeper(self.config.request_delay_seconds)
                try:
                    batch = self.client.fetch(
                        spec,
                        start,
                        end,
                        self.config.max_results,
                        self.config.timeout_seconds,
                    )
                    fetched_count += len(batch.candidates)
                    accepted_for_query = 0
                    for candidate in batch.candidates:
                        source_time = (
                            _parse_source_time(candidate.get("sourceUpdatedAt"))
                            or _parse_source_time(candidate.get("publishedAt"))
                        )
                        if source_time is None or source_time < start or source_time > end + timedelta(days=1):
                            continue
                        identifier = str(candidate["sourceIdentifier"])
                        combined[identifier] = (
                            merge_candidate(combined[identifier], candidate)
                            if identifier in combined
                            else candidate
                        )
                        accepted_for_query += 1
                    query_results.append(
                        {
                            "key": spec.key,
                            "label": spec.label,
                            "status": "completed",
                            "transport": batch.transport,
                            "fallback_reason": batch.fallback_reason,
                            "request_url": batch.request_url,
                            "fetched": len(batch.candidates),
                            "accepted": accepted_for_query,
                        }
                    )
                    successful_queries += 1
                except Exception as error:
                    message = (str(error) or error.__class__.__name__)[:1000]
                    errors.append(f"{spec.label}: {message}")
                    query_results.append(
                        {
                            "key": spec.key,
                            "label": spec.label,
                            "status": "failed",
                            "fetched": 0,
                            "accepted": 0,
                            "error": message,
                        }
                    )
            candidates = sorted(
                combined.values(),
                key=lambda item: str(item.get("sourceUpdatedAt") or item.get("publishedAt") or ""),
                reverse=True,
            )
            stored = self.store.record_frontier_candidates(run["id"], "arxiv", candidates)
            term_counts = self.refresh_term_candidates()
            status = "completed" if not errors else "partial" if successful_queries else "failed"
            metrics = {"fetched": fetched_count, **stored}
            finished = self.store.finish_frontier_source_run(
                run["id"],
                status,
                query_results,
                metrics,
                "；".join(errors),
            )
            finished["term_candidates"] = term_counts
            return finished
        except Exception as error:
            message = (str(error) or error.__class__.__name__)[:4000]
            try:
                self.store.finish_frontier_source_run(
                    run["id"],
                    "failed",
                    query_results,
                    {"fetched": fetched_count},
                    message,
                )
            except atlas.AtlasError:
                pass
            raise

    def scan_official_updates_once(self, now: datetime | None = None) -> dict[str, Any]:
        end = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(second=0, microsecond=0)
        start = end - timedelta(days=self.config.days_back)
        selected_domains = {spec.domain for spec in self.config.query_specs}
        feeds = tuple(
            feed for feed in self.config.official_feeds if selected_domains.intersection(feed.domains)
        )
        query_spec = [
            {
                "key": feed.key,
                "label": feed.label,
                "url": feed.url,
                "source_kind": "first_party",
                "domains": list(feed.domains),
                "article_hosts": list(feed.article_hosts),
                "window_start": start.isoformat(),
                "window_end": end.isoformat(),
                "max_results": self.config.official_max_results,
            }
            for feed in feeds
        ]
        run = self.store.start_frontier_source_run("official_updates", query_spec)
        combined: dict[str, dict[str, Any]] = {}
        query_results: list[dict[str, Any]] = []
        errors: list[str] = []
        fetched_count = 0
        successful_queries = 0
        try:
            for index, feed in enumerate(feeds):
                if index:
                    self.sleeper(self.config.request_delay_seconds)
                try:
                    batch = self.updates_client.fetch(
                        feed,
                        self.config.query_specs,
                        self.config.timeout_seconds,
                    )
                    fetched_count += batch.fetched_count
                    accepted_for_feed = 0
                    for candidate in batch.candidates[: self.config.official_max_results]:
                        source_time = (
                            _parse_source_time(candidate.get("sourceUpdatedAt"))
                            or _parse_source_time(candidate.get("publishedAt"))
                        )
                        if source_time is None or source_time < start or source_time > end + timedelta(days=1):
                            continue
                        key = f"{candidate['sourceKey']}:{candidate['sourceIdentifier']}"
                        combined[key] = candidate
                        accepted_for_feed += 1
                    query_results.append(
                        {
                            "key": feed.key,
                            "label": feed.label,
                            "status": "completed",
                            "transport": "rss_atom",
                            "request_url": batch.request_url,
                            "fetched": batch.fetched_count,
                            "accepted": accepted_for_feed,
                        }
                    )
                    successful_queries += 1
                except Exception as error:
                    message = (str(error) or error.__class__.__name__)[:1000]
                    errors.append(f"{feed.label}: {message}")
                    query_results.append(
                        {
                            "key": feed.key,
                            "label": feed.label,
                            "status": "failed",
                            "transport": "rss_atom",
                            "request_url": feed.url,
                            "fetched": 0,
                            "accepted": 0,
                            "error": message,
                        }
                    )
            candidates = sorted(
                combined.values(),
                key=lambda item: str(item.get("sourceUpdatedAt") or item.get("publishedAt") or ""),
                reverse=True,
            )
            stored = self.store.record_frontier_updates(run["id"], candidates)
            status = "completed" if not errors else "partial" if successful_queries else "failed"
            return self.store.finish_frontier_source_run(
                run["id"],
                status,
                query_results,
                {"fetched": fetched_count, **stored},
                "；".join(errors),
            )
        except Exception as error:
            message = (str(error) or error.__class__.__name__)[:4000]
            try:
                self.store.finish_frontier_source_run(
                    run["id"],
                    "failed",
                    query_results,
                    {"fetched": fetched_count},
                    message,
                )
            except atlas.AtlasError:
                pass
            raise


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, str(default)).strip()
    try:
        return max(minimum, min(maximum, int(raw)))
    except ValueError as error:
        raise SourceError(f"{name} 必须是整数") from error


def _selected_specs(value: str) -> tuple[QuerySpec, ...]:
    requested = {item.strip().lower() for item in value.split(",") if item.strip()}
    available = {spec.key: spec for spec in DEFAULT_QUERY_SPECS}
    unknown = sorted(requested - available.keys())
    if unknown:
        raise SourceError(f"未知扫描领域：{', '.join(unknown)}")
    selected = tuple(spec for spec in DEFAULT_QUERY_SPECS if spec.key in requested)
    if not selected:
        raise SourceError("至少选择一个扫描领域")
    return selected


def _selected_official_feeds(value: str) -> tuple[OfficialFeedSpec, ...]:
    requested = {item.strip().lower() for item in value.split(",") if item.strip()}
    available = {feed.key: feed for feed in DEFAULT_OFFICIAL_FEEDS}
    if not requested or requested == {"all"}:
        return DEFAULT_OFFICIAL_FEEDS
    unknown = sorted(requested - available.keys())
    if unknown:
        raise SourceError(f"未知官方动态来源：{', '.join(unknown)}")
    return tuple(feed for feed in DEFAULT_OFFICIAL_FEEDS if feed.key in requested)


def _print_run(run: dict[str, Any]) -> None:
    summary = {
        "run_id": run["id"],
        "source": run["source_name"],
        "status": run["status"],
        "fetched": run["fetched_count"],
        "accepted": run["accepted_count"],
        "new": run["new_count"],
        "updated": run["updated_count"],
        "unchanged": run["unchanged_count"],
        "finished_at": run["finished_at"],
        "error": run["error_text"],
    }
    print(json.dumps(summary, ensure_ascii=False), flush=True)


def _run_cycle(scanner: FrontierScanner, include_official_updates: bool) -> int:
    exit_codes: list[int] = []
    actions: list[Callable[[], dict[str, Any]]] = [scanner.scan_once]
    if include_official_updates:
        actions.append(scanner.scan_official_updates_once)
    for action in actions:
        try:
            run = action()
            _print_run(run)
            exit_codes.append(0 if run["status"] == "completed" else 2 if run["status"] == "partial" else 1)
        except Exception as error:
            print(f"Frontier scan failed: {error}", file=sys.stderr, flush=True)
            exit_codes.append(1)
    return max(exit_codes, default=0)


def main() -> int:
    atlas.load_env_file(atlas.ROOT / "local" / ".env")
    atlas.load_env_file(atlas.ROOT / ".env")
    parser = argparse.ArgumentParser(description="Research Atlas public frontier source scanner")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path(os.environ.get("RESEARCH_ATLAS_DB_PATH", atlas.DEFAULT_DB_PATH)),
    )
    parser.add_argument(
        "--domains",
        default=os.environ.get("RESEARCH_ATLAS_ARXIV_DOMAINS", "embodied,llm"),
        help="Comma-separated keys: embodied,llm",
    )
    parser.add_argument(
        "--days-back",
        type=int,
        default=_env_int("RESEARCH_ATLAS_SCAN_DAYS_BACK", 14, 1, 60),
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=_env_int("RESEARCH_ATLAS_ARXIV_MAX_RESULTS_PER_DOMAIN", 25, 1, 100),
    )
    parser.add_argument(
        "--official-feeds",
        default=os.environ.get("RESEARCH_ATLAS_OFFICIAL_FEEDS", "all"),
        help="Comma-separated official feed keys or all",
    )
    parser.add_argument(
        "--official-max-results",
        type=int,
        default=_env_int("RESEARCH_ATLAS_OFFICIAL_MAX_RESULTS_PER_SOURCE", 12, 1, 50),
    )
    parser.add_argument(
        "--skip-official-updates",
        action="store_true",
        help="Scan arXiv and term candidates without first-party update feeds",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=_env_int("RESEARCH_ATLAS_SOURCE_TIMEOUT_SECONDS", 45, 5, 180),
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=_env_int("RESEARCH_ATLAS_SCAN_INTERVAL_SECONDS", 86400, 900, 604800),
    )
    parser.add_argument("--watch", action="store_true", help="Repeat scans at the configured interval")
    parser.add_argument(
        "--delay-first",
        action="store_true",
        help="With --watch, wait one interval before the first scan",
    )
    parser.add_argument(
        "--diagnostics",
        action="store_true",
        help="print scanner configuration and database diagnostics, then exit",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="preview scanner inputs without network requests or database writes",
    )
    args = parser.parse_args()
    try:
        config = ScannerConfig(
            database=args.db.expanduser().resolve(),
            query_specs=_selected_specs(args.domains),
            days_back=max(1, min(60, args.days_back)),
            max_results=max(1, min(100, args.max_results)),
            timeout_seconds=max(5, min(180, args.timeout)),
            request_delay_seconds=3.1,
            interval_seconds=max(900, min(604800, args.interval)),
            official_feeds=_selected_official_feeds(args.official_feeds),
            official_max_results=max(1, min(50, args.official_max_results)),
        )
        if args.diagnostics or args.dry_run:
            if args.watch:
                raise SourceError("--watch 不能与 --dry-run/--diagnostics 同时使用")
            snapshot = scanner_diagnostics(
                config,
                include_official_updates=not args.skip_official_updates,
                dry_run=True,
            )
            print(json.dumps(snapshot, ensure_ascii=False, sort_keys=True), flush=True)
            return 0
        scanner = FrontierScanner(config)
        if not args.watch:
            return _run_cycle(scanner, not args.skip_official_updates)
        if args.delay_first:
            time.sleep(config.interval_seconds)
        while True:
            _run_cycle(scanner, not args.skip_official_updates)
            time.sleep(config.interval_seconds)
    except KeyboardInterrupt:
        return 0
    except (SourceError, atlas.AtlasError, OSError) as error:
        print(f"Frontier scanner configuration error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
