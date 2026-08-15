from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


CORPUS_DIR = Path(__file__).resolve().parent / "golden"
CORPUS_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
DOMAINS = {"llm", "embodied"}
RELATIONS = {
    "supports",
    "extends",
    "narrows",
    "reproduces",
    "contradicts",
    "unclear",
}
LOCATORS = {"page", "section", "figure", "table", "equation", "quote"}


class GoldenCorpusError(ValueError):
    pass


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _nonempty_text(value: Any, field: str, maximum: int = 4000) -> str:
    if not isinstance(value, str):
        raise GoldenCorpusError(f"{field} must be a string")
    text = " ".join(value.split()).strip()
    if not text or len(text) > maximum:
        raise GoldenCorpusError(f"{field} must contain 1-{maximum} characters")
    return text


def _validate_locator(value: Any, field: str) -> dict[str, str | int]:
    if not isinstance(value, dict):
        raise GoldenCorpusError(f"{field} must be an object")
    allowed = LOCATORS | {"url"}
    extras = sorted(set(value) - allowed)
    if extras:
        raise GoldenCorpusError(f"{field} contains unsupported fields: {extras}")
    result: dict[str, str | int] = {}
    for key, raw in value.items():
        if key == "page":
            if isinstance(raw, bool) or not isinstance(raw, int) or raw < 1:
                raise GoldenCorpusError(f"{field}.page must be a positive integer")
            result[key] = raw
        else:
            result[key] = _nonempty_text(raw, f"{field}.{key}", 2000)
    if not any(key in result for key in LOCATORS):
        raise GoldenCorpusError(f"{field} needs an exact source locator")
    if "url" not in result or not str(result["url"]).startswith("https://"):
        raise GoldenCorpusError(f"{field}.url must be an HTTPS source")
    return result


def _validate_claim(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise GoldenCorpusError(f"{field} must be an object")
    expected = {"canonical_ref", "title", "claim", "source_locator"}
    if set(value) != expected:
        raise GoldenCorpusError(f"{field} must contain exactly {sorted(expected)}")
    canonical_ref = _nonempty_text(value["canonical_ref"], f"{field}.canonical_ref", 240)
    if not canonical_ref.startswith(("arxiv:", "doi:", "openreview:")):
        raise GoldenCorpusError(f"{field}.canonical_ref is unsupported")
    return {
        "canonical_ref": canonical_ref,
        "title": _nonempty_text(value["title"], f"{field}.title", 500),
        "claim": _nonempty_text(value["claim"], f"{field}.claim", 4000),
        "source_locator": _validate_locator(
            value["source_locator"], f"{field}.source_locator"
        ),
    }


def validate_claim_lineage_corpus(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise GoldenCorpusError("corpus must be an object")
    expected_root = {
        "schema_version",
        "corpus_id",
        "version",
        "status",
        "source_snapshot",
        "review_policy",
        "items",
    }
    if set(value) != expected_root:
        raise GoldenCorpusError(f"corpus must contain exactly {sorted(expected_root)}")
    if value["schema_version"] != 1:
        raise GoldenCorpusError("unsupported claim-lineage corpus schema")
    corpus_id = _nonempty_text(value["corpus_id"], "corpus_id", 120)
    if not CORPUS_ID_PATTERN.fullmatch(corpus_id):
        raise GoldenCorpusError("corpus_id must be a lowercase slug")
    version = _nonempty_text(value["version"], "version", 120)
    if value["status"] not in {"candidate", "released", "retired"}:
        raise GoldenCorpusError("corpus status is invalid")

    snapshot = value["source_snapshot"]
    if not isinstance(snapshot, dict) or set(snapshot) != {
        "path",
        "sha256",
        "assembled_at",
    }:
        raise GoldenCorpusError("source_snapshot shape is invalid")
    source_sha = _nonempty_text(snapshot["sha256"], "source_snapshot.sha256", 64)
    if not SHA256_PATTERN.fullmatch(source_sha):
        raise GoldenCorpusError("source_snapshot.sha256 is invalid")

    policy = value["review_policy"]
    if not isinstance(policy, dict) or set(policy) != {
        "minimum_distinct_reviewers",
        "required_domains",
        "required_locator_fields",
    }:
        raise GoldenCorpusError("review_policy shape is invalid")
    minimum_reviewers = policy["minimum_distinct_reviewers"]
    if isinstance(minimum_reviewers, bool) or not isinstance(minimum_reviewers, int):
        raise GoldenCorpusError("minimum_distinct_reviewers must be an integer")
    if minimum_reviewers < 2:
        raise GoldenCorpusError("release corpora require at least two reviewers")
    required_domains = policy["required_domains"]
    if not isinstance(required_domains, list) or set(required_domains) != DOMAINS:
        raise GoldenCorpusError("review_policy must require llm and embodied")
    required_locator_fields = policy["required_locator_fields"]
    if not isinstance(required_locator_fields, list) or not required_locator_fields:
        raise GoldenCorpusError("required_locator_fields must be a non-empty array")
    if any(field not in LOCATORS for field in required_locator_fields):
        raise GoldenCorpusError("review_policy contains an invalid locator field")

    raw_items = value["items"]
    if not isinstance(raw_items, list) or not raw_items:
        raise GoldenCorpusError("corpus items must be a non-empty array")
    items: list[dict[str, Any]] = []
    ids: set[str] = set()
    domains: set[str] = set()
    review_counts: dict[str, int] = {}
    positive_count = 0
    negative_count = 0
    for index, raw in enumerate(raw_items):
        field = f"items[{index}]"
        expected_item = {
            "id",
            "domain",
            "left",
            "right",
            "expected_cluster",
            "expected_relation",
            "expected_locators",
            "rationale",
            "reviews",
        }
        if not isinstance(raw, dict) or set(raw) != expected_item:
            raise GoldenCorpusError(f"{field} shape is invalid")
        item_id = _nonempty_text(raw["id"], f"{field}.id", 160)
        if not CORPUS_ID_PATTERN.fullmatch(item_id) or item_id in ids:
            raise GoldenCorpusError(f"{field}.id is invalid or duplicated")
        ids.add(item_id)
        domain = raw["domain"]
        if domain not in DOMAINS:
            raise GoldenCorpusError(f"{field}.domain is invalid")
        domains.add(domain)
        if not isinstance(raw["expected_cluster"], bool):
            raise GoldenCorpusError(f"{field}.expected_cluster must be boolean")
        if raw["expected_cluster"]:
            positive_count += 1
        else:
            negative_count += 1
        relation = raw["expected_relation"]
        if relation not in RELATIONS:
            raise GoldenCorpusError(f"{field}.expected_relation is invalid")
        locators = raw["expected_locators"]
        if (
            not isinstance(locators, list)
            or not locators
            or len(set(locators)) != len(locators)
            or any(locator not in LOCATORS for locator in locators)
        ):
            raise GoldenCorpusError(f"{field}.expected_locators is invalid")
        reviews = raw["reviews"]
        if not isinstance(reviews, list) or not reviews:
            raise GoldenCorpusError(f"{field}.reviews must be a non-empty array")
        reviewer_ids: set[str] = set()
        normalized_reviews: list[dict[str, str]] = []
        for review_index, review in enumerate(reviews):
            review_field = f"{field}.reviews[{review_index}]"
            if not isinstance(review, dict) or set(review) != {
                "reviewer_id",
                "decision",
                "reviewed_at",
                "note",
            }:
                raise GoldenCorpusError(f"{review_field} shape is invalid")
            reviewer_id = _nonempty_text(
                review["reviewer_id"], f"{review_field}.reviewer_id", 160
            )
            if reviewer_id in reviewer_ids:
                raise GoldenCorpusError(f"{field} repeats a reviewer")
            reviewer_ids.add(reviewer_id)
            if review["decision"] not in {"accepted", "rejected"}:
                raise GoldenCorpusError(f"{review_field}.decision is invalid")
            normalized_reviews.append(
                {
                    "reviewer_id": reviewer_id,
                    "decision": review["decision"],
                    "reviewed_at": _nonempty_text(
                        review["reviewed_at"], f"{review_field}.reviewed_at", 40
                    ),
                    "note": _nonempty_text(
                        review["note"], f"{review_field}.note", 2000
                    ),
                }
            )
        review_counts[item_id] = sum(
            review["decision"] == "accepted" for review in normalized_reviews
        )
        items.append(
            {
                "id": item_id,
                "domain": domain,
                "left": _validate_claim(raw["left"], f"{field}.left"),
                "right": _validate_claim(raw["right"], f"{field}.right"),
                "expected_cluster": raw["expected_cluster"],
                "expected_relation": relation,
                "expected_locators": list(locators),
                "rationale": _nonempty_text(
                    raw["rationale"], f"{field}.rationale", 4000
                ),
                "reviews": normalized_reviews,
            }
        )

    corpus = {
        "schema_version": 1,
        "corpus_id": corpus_id,
        "version": version,
        "status": value["status"],
        "source_snapshot": {
            "path": _nonempty_text(snapshot["path"], "source_snapshot.path", 500),
            "sha256": source_sha,
            "assembled_at": _nonempty_text(
                snapshot["assembled_at"], "source_snapshot.assembled_at", 40
            ),
        },
        "review_policy": {
            "minimum_distinct_reviewers": minimum_reviewers,
            "required_domains": list(required_domains),
            "required_locator_fields": list(required_locator_fields),
        },
        "items": items,
    }
    release_issues: list[str] = []
    if corpus["status"] != "released":
        release_issues.append("corpus status is not released")
    missing_domains = sorted(set(required_domains) - domains)
    if missing_domains:
        release_issues.append(f"missing domains: {', '.join(missing_domains)}")
    if not positive_count:
        release_issues.append("missing positive cluster examples")
    if not negative_count:
        release_issues.append("missing negative cluster examples")
    under_reviewed = sorted(
        item_id
        for item_id, count in review_counts.items()
        if count < minimum_reviewers
    )
    if under_reviewed:
        release_issues.append(
            "items below reviewer threshold: " + ", ".join(under_reviewed)
        )
    corpus["corpus_sha256"] = hashlib.sha256(_canonical_bytes(corpus)).hexdigest()
    corpus["release_ready"] = not release_issues
    corpus["release_issues"] = release_issues
    corpus["stats"] = {
        "item_count": len(items),
        "domains": sorted(domains),
        "positive_count": positive_count,
        "negative_count": negative_count,
        "fully_reviewed_count": len(items) - len(under_reviewed),
    }
    return corpus


def load_claim_lineage_corpus(version: str = "2026.08-release.1") -> dict[str, Any]:
    normalized_version = _nonempty_text(version, "version", 120)
    candidates = sorted(CORPUS_DIR.glob("claim-lineage-*.json"))
    for path in candidates:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if raw.get("version") == normalized_version:
            return validate_claim_lineage_corpus(raw)
    raise GoldenCorpusError(f"unknown claim-lineage corpus version: {normalized_version}")
