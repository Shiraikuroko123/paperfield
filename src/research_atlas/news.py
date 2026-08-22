"""Allowlisted feeds and article sanitisation for the Atlas news workspace."""

from __future__ import annotations

import hashlib
import html
import ipaddress
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any

try:
    import markdown as _markdown
except ImportError:  # pragma: no cover - deploy requirements include Markdown
    _markdown = None


MAX_FEED_BYTES = 4 * 1024 * 1024
MAX_ARTICLE_BYTES = 8 * 1024 * 1024
MAX_BODY_CHARS = 300_000
USER_AGENT = "ResearchAtlasNews/1.0 (local research client)"
GITHUB_API_HOSTS = ("api.github.com",)


@dataclass(frozen=True)
class NewsSource:
    key: str
    label: str
    source_kind: str
    feed_url: str
    article_hosts: tuple[str, ...]
    domains: tuple[str, ...]
    trust_tier: str = "first_party"


DEFAULT_NEWS_SOURCES = (
    NewsSource("openai", "OpenAI News", "official_lab", "https://openai.com/news/rss.xml", ("openai.com",), ("llm",)),
    NewsSource("codex_releases", "OpenAI Codex GitHub Releases", "github_release", "https://github.com/openai/codex/releases.atom", ("github.com",), ("llm",)),
    NewsSource("codex_commits", "OpenAI Codex GitHub Commits", "github_commit", "https://github.com/openai/codex/commits/main.atom", ("github.com",), ("llm",)),
    NewsSource("deepmind", "Google DeepMind", "official_lab", "https://deepmind.google/blog/rss.xml", ("deepmind.google",), ("embodied", "llm")),
    NewsSource("huggingface", "Hugging Face Blog", "company", "https://huggingface.co/blog/feed.xml", ("huggingface.co",), ("llm",)),
    NewsSource("lerobot_releases", "Hugging Face LeRobot GitHub Releases", "github_release", "https://github.com/huggingface/lerobot/releases.atom", ("github.com",), ("embodied", "llm")),
    NewsSource("microsoft_research", "Microsoft Research", "research_org", "https://www.microsoft.com/en-us/research/feed/", ("microsoft.com",), ("embodied", "llm")),
    NewsSource("bair", "Berkeley AI Research", "research_org", "https://bair.berkeley.edu/blog/feed.xml", ("bair.berkeley.edu", "berkeley.edu"), ("embodied", "llm")),
    NewsSource("google_research", "Google Research", "research_org", "https://research.google/blog/rss/", ("research.google",), ("embodied", "llm")),
    NewsSource("groot_releases", "NVIDIA Isaac GR00T GitHub Releases", "github_release", "https://github.com/NVIDIA/Isaac-GR00T/releases.atom", ("github.com",), ("embodied", "llm")),
    NewsSource("openpi_releases", "Physical Intelligence openpi GitHub Releases", "github_release", "https://github.com/Physical-Intelligence/openpi/releases.atom", ("github.com",), ("embodied", "llm")),
    NewsSource("techcrunch_ai", "TechCrunch AI", "newsroom", "https://techcrunch.com/category/artificial-intelligence/feed/", ("techcrunch.com",), ("embodied", "llm"), "secondary"),
    NewsSource("ieee_robotics", "IEEE Spectrum Robotics", "newsroom", "https://spectrum.ieee.org/feeds/topic/robotics", ("spectrum.ieee.org",), ("embodied",), "secondary"),
)


def source_to_dict(source: NewsSource) -> dict[str, Any]:
    return {
        "key": source.key,
        "label": source.label,
        "source_kind": source.source_kind,
        "feed_url": source.feed_url,
        "article_hosts": list(source.article_hosts),
        "domains": list(source.domains),
        "trust_tier": source.trust_tier,
    }


class _TextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_text(value: Any, maximum: int = 30_000) -> str:
    parser = _TextParser()
    parser.feed(html.unescape(str(value or "")))
    parser.close()
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()[:maximum]


def normalize_time(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError):
            return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _local_name(tag: str) -> str:
    return str(tag).rsplit("}", 1)[-1].lower()


def _child_text(node: ET.Element, names: set[str]) -> str:
    for child in list(node):
        if _local_name(child.tag) in names:
            return " ".join(part for part in child.itertext() if part)
    return ""


def _safe_url(value: Any, hosts: tuple[str, ...]) -> str:
    parsed = urllib.parse.urlparse(str(value or "").strip())
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return ""
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host or not any(host == allowed or host.endswith(f".{allowed}") for allowed in hosts):
        return ""
    query = urllib.parse.urlencode(
        [(key, item) for key, item in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
         if not key.casefold().startswith("utm_") and key.casefold() not in {"ref", "source"}],
        doseq=True,
    )
    return urllib.parse.urlunparse(parsed._replace(query=query, fragment=""))


def _entry_link(entry: ET.Element, source: NewsSource) -> str:
    alternatives: list[str] = []
    for child in list(entry):
        if _local_name(child.tag) != "link":
            continue
        url = _safe_url(child.attrib.get("href") or child.text or "", source.article_hosts)
        if not url:
            continue
        if child.attrib.get("rel", "alternate") == "alternate":
            return url
        alternatives.append(url)
    return alternatives[0] if alternatives else ""


def _stable_id(source_key: str, raw: str) -> str:
    return hashlib.sha256(f"{source_key}\n{raw}".encode("utf-8")).hexdigest()


def _unique(values: list[str], maximum: int = 30) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = re.sub(r"\s+", " ", str(value or "")).strip()[:240]
        if text and text.casefold() not in seen:
            result.append(text)
            seen.add(text.casefold())
    return result[:maximum]


EMBODIED_TERMS = (
    "embodied ai", "physical ai", "robot", "robotics", "manipulation", "humanoid", "vla",
    "vision-language-action", "world model", "locomotion", "navigation", "tactile", "sim-to-real",
    "diffusion policy", "robot learning", "dexterous", "foundation model for robotics", "robot foundation model",
)
LLM_TERMS = (
    "large language model", "llm", "language model", "multimodal", "vision-language model", "vlm",
    "reasoning model", "agent", "tool use", "foundation model", "transformer", "inference", "language models",
    "anthropic", "claude", "openai", "chatgpt", "gpt-", "gemini", "llama", "mistral", "qwen", "deepseek",
)


def _contains(text: str, term: str) -> bool:
    haystack = text.casefold()
    needle = term.casefold()
    if re.fullmatch(r"[a-z0-9 -]+", needle):
        pattern = re.escape(needle).replace(r"\ ", r"\s+")
        return bool(re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", haystack))
    return needle in haystack


def classify_item(title: str, summary: str, source: NewsSource) -> tuple[list[str], list[str], str, str]:
    text = f"{title} {summary}"
    domains = [domain for domain, terms in (("embodied", EMBODIED_TERMS), ("llm", LLM_TERMS)) if any(_contains(text, term) for term in terms)]
    if not domains and source.trust_tier != "secondary":
        domains = list(source.domains)
    if len(domains) > 1:
        domains = ["cross", *domains]
    topic_terms = {
        "models": ("model", "release", "checkpoint", "foundation model"),
        "datasets": ("dataset", "benchmark", "corpus"),
        "agents": ("agent", "tool use", "computer use"),
        "robot-learning": ("robot learning", "manipulation", "policy", "sim-to-real"),
        "multimodal": ("multimodal", "vision-language", "vlm"),
        "companies": ("company", "startup", "founded", "launches"),
        "funding": ("funding", "investment", "raises", "series a", "series b", "acquisition"),
        "code": ("github", "commit", "release", "repository", "source code", "open source"),
        "architecture": ("architecture", "harness", "runtime", "mcp", "orchestration", "tooling"),
    }
    topics = [topic for topic, terms in topic_terms.items() if any(_contains(text, term) for term in terms)]
    lower = text.casefold()
    if source.source_kind == "github_release":
        article_type = "code_release"
    elif source.source_kind == "github_commit":
        article_type = "code_change"
    elif any(word in lower for word in ("funding", "investment", "raises", "series a", "series b", "acquisition")):
        article_type = "funding" if "acquisition" not in lower else "acquisition"
    elif any(word in lower for word in ("dataset", "benchmark", "corpus")):
        article_type = "dataset_release"
    elif any(word in lower for word in ("launch", "release", "introducing", "available", "checkpoint")):
        article_type = "model_release" if any(_contains(text, term) for term in LLM_TERMS) else "project_release"
    elif any(word in lower for word in ("founded", "startup", "company")):
        article_type = "company"
    elif any(word in lower for word in ("event", "conference", "workshop")):
        article_type = "event"
    elif any(word in lower for word in ("policy", "regulation", "safety")):
        article_type = "policy"
    else:
        article_type = "research"
    importance = "major" if article_type in {"model_release", "dataset_release", "code_release", "company", "funding", "acquisition"} else "notable" if source.trust_tier == "first_party" else "routine"
    return _unique(domains, 4), _unique(topics, 12), article_type, importance


def extract_related_refs(value: str) -> list[str]:
    refs: list[str] = []
    for match in re.finditer(r"(?:arxiv\s*:\s*|arxiv\.org/(?:abs|pdf)/)(\d{4}\.\d{4,5})(?:v\d+)?", value, flags=re.IGNORECASE):
        refs.append(f"arxiv:{match.group(1).lower()}")
    for match in re.finditer(r"\b10\.\d{4,9}/[-._;()/:a-z0-9]+", value, flags=re.IGNORECASE):
        refs.append(f"doi:{match.group(0).rstrip('.,;)').lower()}")
    return _unique(refs)


def parse_feed(payload: bytes, source: NewsSource) -> list[dict[str, Any]]:
    if len(payload) > MAX_FEED_BYTES:
        raise ValueError("news feed exceeds size limit")
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as error:
        raise ValueError("news feed XML is invalid") from error
    entry_name = "entry" if _local_name(root.tag) == "feed" else "item"
    candidates: list[dict[str, Any]] = []
    for entry in [node for node in root.iter() if _local_name(node.tag) == entry_name]:
        title = _plain_text(_child_text(entry, {"title"}), 1000)
        source_url = _entry_link(entry, source)
        if not title or not source_url:
            continue
        raw_summary = _child_text(entry, {"summary", "description", "content", "encoded"})
        summary = _plain_text(raw_summary, 20_000)
        published = normalize_time(_child_text(entry, {"published", "pubdate", "date", "created"}))
        updated = normalize_time(_child_text(entry, {"updated", "modified"})) or published
        author = _plain_text(_child_text(entry, {"author", "creator", "name"}), 240)
        raw_id = _plain_text(_child_text(entry, {"id", "guid"}), 2000) or source_url
        domains, topics, article_type, importance = classify_item(title, summary, source)
        # Broad newsroom feeds are useful for context, but they must not turn
        # Atlas into a generic AI news reader. Official and GitHub sources are
        # scoped by their publisher; secondary sources require an explicit
        # embodied/LLM match in the title or summary.
        if source.trust_tier == "secondary" and not domains:
            continue
        # Some first-party feeds put the full article in content:encoded. Keep
        # that content locally so opening a news item does not collapse into a
        # one-line feed excerpt. Plain long descriptions still become a safe
        # paragraph, while short descriptions remain feed-only metadata.
        body_html = ""
        body_text = ""
        if raw_summary and re.search(r"<\s*[a-z][^>]*>", raw_summary, flags=re.IGNORECASE):
            body_html, body_text = sanitize_article_html(raw_summary, source)
        if len(body_text.strip()) < 120 and len(summary.strip()) >= 120:
            body_text = summary
            body_html = f"<p>{html.escape(summary, quote=False)}</p>"
        content_status = "cached" if len(body_text.strip()) >= 120 else "feed_only"
        normalized = {"title": title, "summary": summary, "source_url": source_url, "published": published, "updated": updated}
        candidates.append({
            "source_key": source.key,
            "source_label": source.label,
            "source_kind": source.source_kind,
            "source_identifier": _stable_id(source.key, raw_id),
            "canonical_url": source_url,
            "source_url": source_url,
            "title": title,
            "dek": summary[:1000],
            "summary": summary,
            "author": author,
            "published_at": published,
            "updated_at": updated,
            "domains": domains,
            "topics": topics,
            "article_type": article_type,
            "importance": importance,
            "related_paper_refs": extract_related_refs(f"{source_url} {summary}"),
            "payload_sha256": hashlib.sha256(repr(normalized).encode("utf-8")).hexdigest(),
            "content_status": content_status,
            "body_html": body_html,
            "body_text": body_text,
        })
    return candidates


class _Sanitizer(HTMLParser):
    allowed = {"p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code", "strong", "em", "b", "i", "a", "table", "thead", "tbody", "tr", "th", "td"}
    blocked = {"script", "style", "iframe", "object", "embed", "form", "svg", "canvas", "nav", "header", "footer", "aside"}

    def __init__(self, hosts: tuple[str, ...]) -> None:
        super().__init__(convert_charrefs=True)
        self.hosts = hosts
        self.parts: list[str] = []
        self.blocked_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in self.blocked:
            self.blocked_depth += 1
            return
        if self.blocked_depth or tag not in self.allowed:
            return
        safe_attrs: list[str] = []
        for key, value in attrs:
            key = key.lower()
            if key == "href" and value:
                url = _safe_url(value, self.hosts)
                if url:
                    safe_attrs.append(f' href="{html.escape(url, quote=True)}" rel="noreferrer"')
            elif key == "title" and value:
                safe_attrs.append(f' title="{html.escape(value[:240], quote=True)}"')
        self.parts.append(f"<{tag}{''.join(safe_attrs)}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.blocked:
            self.blocked_depth = max(0, self.blocked_depth - 1)
            return
        if not self.blocked_depth and tag in self.allowed and tag != "br":
            self.parts.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if not self.blocked_depth:
            self.parts.append(html.escape(data, quote=False))


def sanitize_article_html(raw_html: Any, source: NewsSource) -> tuple[str, str]:
    parser = _Sanitizer(source.article_hosts)
    parser.feed(str(raw_html or "")[:MAX_ARTICLE_BYTES])
    parser.close()
    body = "".join(parser.parts)
    return body[:MAX_BODY_CHARS], _plain_text(body, MAX_BODY_CHARS)


def extract_article_html(raw_html: bytes, source: NewsSource) -> tuple[str, str]:
    if len(raw_html) > MAX_ARTICLE_BYTES:
        raise ValueError("news article exceeds size limit")
    decoded = raw_html.decode("utf-8", errors="replace")
    candidates = re.findall(r"(?is)<(?:article|main)\b[^>]*>(.*?)</(?:article|main)>", decoded)
    return sanitize_article_html(max(candidates, key=len, default=decoded), source)


def _validate_public_host(url: str) -> None:
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return
    if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
        raise ValueError("private news host is not allowed")


class _AllowlistedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, hosts: tuple[str, ...]) -> None:
        super().__init__()
        self.hosts = hosts

    def redirect_request(self, req: urllib.request.Request, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> urllib.request.Request | None:
        if not _safe_url(newurl, self.hosts):
            raise ValueError("news redirect target is not allowlisted")
        _validate_public_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _open_allowlisted(source: NewsSource, request: urllib.request.Request, timeout: int) -> Any:
    opener = urllib.request.build_opener(_AllowlistedRedirectHandler(source.article_hosts))
    response = opener.open(request, timeout=timeout)
    final_url = _safe_url(response.geturl(), source.article_hosts)
    if not final_url:
        response.close()
        raise ValueError("news response URL is not allowlisted")
    _validate_public_host(final_url)
    return response


def _open_github_api(request: urllib.request.Request, timeout: int) -> Any:
    """Open a GitHub API request with a separate, strict host allowlist."""
    opener = urllib.request.build_opener(_AllowlistedRedirectHandler(GITHUB_API_HOSTS))
    response = opener.open(request, timeout=timeout)
    final_url = _safe_url(response.geturl(), GITHUB_API_HOSTS)
    if not final_url:
        response.close()
        raise ValueError("GitHub API response URL is not allowlisted")
    _validate_public_host(final_url)
    return response


def _github_reference(url: str) -> tuple[str, str, str, str] | None:
    parsed = urllib.parse.urlparse(url)
    if (parsed.hostname or "").lower().rstrip(".") != "github.com":
        return None
    parts = [urllib.parse.unquote(part) for part in parsed.path.split("/") if part]
    if len(parts) < 4 or parts[0] in {"orgs", "topics", "features"}:
        return None
    owner, repo, kind = parts[0], parts[1], parts[2]
    if kind == "releases" and len(parts) >= 5 and parts[3] == "tag":
        return "release", owner, repo, "/".join(parts[4:])
    if kind in {"commit", "commits"} and len(parts) >= 4:
        return "commit", owner, repo, parts[3]
    return None


def _github_markdown_html(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if _markdown is None:
        return f"<pre>{html.escape(text, quote=False)}</pre>"
    rendered = _markdown.markdown(text, extensions=["fenced_code", "tables", "sane_lists"])
    return rendered[:MAX_BODY_CHARS]


def _fetch_github_article(source: NewsSource, url: str, *, timeout: int) -> tuple[str, str]:
    reference = _github_reference(url)
    if reference is None:
        raise ValueError("GitHub article reference is not supported")
    kind, owner, repo, ref = reference
    if kind == "release":
        endpoint = f"https://api.github.com/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/releases/tags/{urllib.parse.quote(ref, safe='')}"
    else:
        endpoint = f"https://api.github.com/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/commits/{urllib.parse.quote(ref, safe='')}"
    request = urllib.request.Request(
        endpoint,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with _open_github_api(request, max(5, min(60, int(timeout)))) as response:
            payload = response.read(MAX_ARTICLE_BYTES + 1)
            if len(payload) > MAX_ARTICLE_BYTES:
                raise ValueError("GitHub API response exceeds size limit")
    except urllib.error.HTTPError as error:
        raise ValueError(f"GitHub API HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ValueError("GitHub API request failed") from error
    try:
        data = json.loads(payload.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as error:
        raise ValueError("GitHub API response is invalid") from error
    if not isinstance(data, dict):
        raise ValueError("GitHub API response is not an object")

    if kind == "release":
        tag = html.escape(str(data.get("tag_name") or ref), quote=False)
        name = html.escape(str(data.get("name") or ""), quote=False)
        published = html.escape(str(data.get("published_at") or data.get("created_at") or ""), quote=False)
        body = _github_markdown_html(data.get("body"))
        parts = [f"<p><strong>版本</strong> {tag}</p>"]
        if name and name != tag:
            parts.append(f"<p><strong>发布标题</strong> {name}</p>")
        if published:
            parts.append(f"<p><strong>发布时间</strong> {published}</p>")
        if body:
            parts.append(body)
        assets = data.get("assets") if isinstance(data.get("assets"), list) else []
        asset_names = [str(item.get("name")) for item in assets if isinstance(item, dict) and item.get("name")]
        if asset_names:
            parts.append("<h3>发布资产</h3><ul>" + "".join(f"<li>{html.escape(name, quote=False)}</li>" for name in asset_names[:30]) + "</ul>")
    else:
        commit = data.get("commit") if isinstance(data.get("commit"), dict) else {}
        message = str(commit.get("message") or data.get("message") or "").strip()
        author = commit.get("author") if isinstance(commit.get("author"), dict) else {}
        author_name = html.escape(str(author.get("name") or data.get("author", {}).get("login") if isinstance(data.get("author"), dict) else ""), quote=False)
        sha = html.escape(str(data.get("sha") or ref)[:12], quote=False)
        parts = [f"<p><strong>提交</strong> <code>{sha}</code></p>"]
        if author_name:
            parts.append(f"<p><strong>作者</strong> {author_name}</p>")
        if message:
            parts.append(_github_markdown_html(message))
        files = data.get("files") if isinstance(data.get("files"), list) else []
        file_rows = []
        additions = deletions = 0
        for item in files[:50]:
            if not isinstance(item, dict):
                continue
            filename = html.escape(str(item.get("filename") or ""), quote=False)
            status = html.escape(str(item.get("status") or "modified"), quote=False)
            additions += int(item.get("additions") or 0)
            deletions += int(item.get("deletions") or 0)
            if filename:
                file_rows.append(f"<li><code>{filename}</code> · {status}</li>")
        parts.append(f"<p><strong>变更统计</strong> +{additions} / -{deletions}，涉及 {len(files)} 个文件</p>")
        if file_rows:
            parts.append("<h3>变更文件</h3><ul>" + "".join(file_rows) + "</ul>")
    body_html, body_text = sanitize_article_html("".join(parts), source)
    if len(body_text.strip()) < 120:
        raise ValueError("GitHub API article body is unavailable")
    return body_html, body_text

def _source_object(source: NewsSource | dict[str, Any]) -> NewsSource:
    if isinstance(source, NewsSource):
        return source
    return NewsSource(
        str(source["key"]), str(source.get("label") or source["key"]), str(source.get("source_kind") or "official_lab"), str(source["feed_url"]), tuple(source.get("article_hosts") or ()), tuple(source.get("domains") or ()), str(source.get("trust_tier") or "first_party")
    )


def fetch_feed(source: NewsSource | dict[str, Any], *, timeout: int = 20, etag: str = "", last_modified: str = "") -> tuple[bytes, dict[str, str]]:
    source_obj = _source_object(source)
    url = _safe_url(source_obj.feed_url, source_obj.article_hosts)
    if not url:
        raise ValueError("news feed URL is not allowlisted")
    _validate_public_host(url)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9"}
    if etag:
        headers["If-None-Match"] = etag[:500]
    if last_modified:
        headers["If-Modified-Since"] = last_modified[:500]
    try:
        with _open_allowlisted(source_obj, urllib.request.Request(url, headers=headers), max(5, min(60, int(timeout)))) as response:
            payload = response.read(MAX_FEED_BYTES + 1)
            if len(payload) > MAX_FEED_BYTES:
                raise ValueError("news feed exceeds size limit")
            return payload, {"etag": str(response.headers.get("ETag") or "")[:500], "last_modified": str(response.headers.get("Last-Modified") or "")[:500], "status": "fetched"}
    except urllib.error.HTTPError as error:
        if error.code == 304:
            return b"", {"etag": etag[:500], "last_modified": last_modified[:500], "status": "not_modified"}
        raise ValueError(f"news feed HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ValueError("news feed request failed") from error


def fetch_article(source: NewsSource | dict[str, Any], url: str, *, timeout: int = 20) -> tuple[str, str]:
    source_obj = _source_object(source)
    safe_url = _safe_url(url, source_obj.article_hosts)
    if not safe_url:
        raise ValueError("article URL is not allowlisted")
    _validate_public_host(safe_url)
    if source_obj.source_kind in {"github_release", "github_commit"}:
        return _fetch_github_article(source_obj, safe_url, timeout=timeout)
    request = urllib.request.Request(safe_url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml;q=0.9"})
    try:
        with _open_allowlisted(source_obj, request, max(5, min(60, int(timeout)))) as response:
            payload = response.read(MAX_ARTICLE_BYTES + 1)
            if len(payload) > MAX_ARTICLE_BYTES:
                raise ValueError("news article exceeds size limit")
    except urllib.error.HTTPError as error:
        raise ValueError(f"news article HTTP {error.code}") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise ValueError("news article request failed") from error
    body_html, body_text = extract_article_html(payload, source_obj)
    if len(body_text.strip()) < 120:
        raise ValueError("news article body is unavailable")
    return body_html, body_text
