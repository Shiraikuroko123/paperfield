# Frontier Sources

Research Atlas 0.8 has three public discovery layers: paper candidates, first-party update candidates, and terminology candidates. All three remain separate from reviewed research signals. An editor can turn a cross-paper term candidate into a private draft and explicitly publish it after local review; the Phase 4 workbench can then structure reviewed knowledge without changing these discovery boundaries.

Phase 5 adds a dated ranking projection around those candidates. Ranking is a prioritisation aid only: it records the source run, `as_of` time, filter scope, maturity and ranking components so a later refresh can explain why an item moved. It never changes an item's evidence level or turns a first-party announcement into paper evidence.

## Paper candidates

The scanner first reads the public arXiv Atom API at `https://export.arxiv.org/api/query`. When that endpoint is rate limited or unavailable, it falls back to the official category RSS feeds at `https://rss.arxiv.org/rss/`. API scans use bounded queries; RSS results are locally keyword-filtered.

Both paths enforce a recent-date window, a per-domain result limit, response-size limits, fixed hosts, and request throttling. Each query result records its actual transport and any fallback reason. Stored fields include title, authors, public abstract, arXiv categories, DOI when supplied, source and PDF URLs, submitted and updated timestamps, version, matched query labels, and a SHA-256 of the normalized source entry.

## First-party updates

The same scanner reads RSS or Atom feeds from a fixed code allowlist:

- OpenAI News
- Google DeepMind
- Hugging Face Blog
- Microsoft Research
- Berkeley AI Research
- Google Research

An entry is accepted only when its final article URL uses HTTPS, belongs to the corresponding institution's allowlisted host, falls inside the configured date window, and matches an enabled large-model or embodied-intelligence query. Tracking query parameters are removed before identity hashing. The scanner stores source label, title, public feed summary, article URL, timestamps, matched domains, explicit arXiv or DOI references found in the feed text, and normalized-entry SHA-256.

These entries are `first_party` announcements, not independent scientific evidence. They can reveal releases, project pages, models, datasets, or organization claims, but they never raise a paper's evidence level.

## Terminology candidates

Terminology extraction is deterministic and local. It recognizes:

- an acronym explicitly expanded by the authors and also used in the paper's title naming, such as `world action models (WAMs)` in a `*-WAM` title;
- a compact method name used in the paper title, such as `JEPA-WAM`.

Every term keeps the exact source context, extraction rule, paper identity, source date, and content hash. Multiple papers using the same normalized name are counted as cross-paper occurrences. This count means only that the name appears in multiple Atlas paper candidates; it does not establish novelty, equivalence, independent adoption, or field consensus.

Each refresh synchronizes unreviewed deterministic evidence with the current extraction rules, so parser false positives do not accumulate forever. A term promoted through a published research signal is excluded from this automatic cleanup.

## Editorial research signals

A research-signal draft can only be created from a term with at least two independent paper records. The editor must select the paper evidence and write a title plus a concrete change summary. Drafts stay out of `GET /api/trends` and the public radar.

Publication is a separate operation. It requires a named reviewer, a review reason, why the change matters, and explicit unknowns or counter-evidence boundaries. The source term is marked `promoted` only after publication. Creation, edits, publication, and retraction each produce an immutable revision snapshot; retraction removes the signal from the radar but does not erase history.

Editor endpoints accept loopback clients only. Browser requests must also be same-origin. This boundary prevents a remote page from publishing through a locally running Atlas instance.

## Status boundary

- `frontier_candidates.review_status=unreviewed` means arXiv metadata matched a configured query.
- `frontier_updates.review_status=unreviewed` means a first-party feed item matched a configured query.
- `frontier_term_candidates.review_status=unreviewed` means a naming pattern has traceable paper context.
- `frontier_signals.status=draft` means a local editor is still reviewing a term-backed change; drafts never enter `/api/trends`.
- `frontier_signals.status=published` means the evidence and required review fields passed the explicit publication boundary.
- `threads` remain empty until a separate cross-paper scientific-claim clustering and editorial workflow is implemented.
- Completed, partial, and failed source runs are retained as provenance. Previously fetched candidates remain visible when a later source run degrades.
- Only one active run per source family is allowed. Runs active for more than one hour are marked failed when the next run begins.

## Commands

```powershell
.\scripts\run-atlas-scanner.ps1
.\scripts\run-atlas-scanner.ps1 --watch
.\scripts\run-atlas-scanner.ps1 --skip-official-updates
```

Configuration is read from `local/.env`:

```dotenv
RESEARCH_ATLAS_ARXIV_DOMAINS=embodied,llm
RESEARCH_ATLAS_SCAN_DAYS_BACK=14
RESEARCH_ATLAS_ARXIV_MAX_RESULTS_PER_DOMAIN=25
RESEARCH_ATLAS_OFFICIAL_FEEDS=all
RESEARCH_ATLAS_OFFICIAL_MAX_RESULTS_PER_SOURCE=12
RESEARCH_ATLAS_SOURCE_TIMEOUT_SECONDS=45
RESEARCH_ATLAS_SCAN_INTERVAL_SECONDS=86400
```

## Read APIs

```text
GET /api/frontier/candidates?limit=40
GET /api/frontier/updates?limit=30
GET /api/frontier/sources?limit=20
GET /api/frontier/signals?limit=40
GET /api/terms?limit=80
GET /api/trends?limit=40
GET /api/frontier/radar?domain=embodied&source=arxiv&maturity=emerging&from=2026-08-01&to=2026-08-12
```

The radar response is a dated projection. It includes source diagnostics, ranking components and an `as_of` timestamp; callers should store that timestamp when producing a digest rather than treating the live endpoint as a reproducible historical feed.

## Paperfield catalog bridge

Atlas does not open Paperfield's SQLite file. Paperfield exposes a loopback-only, token-protected incremental catalog at `/api/atlas/catalog`. Each event contains an immutable payload snapshot and SHA-256 hash. Upserts and tombstones are ordered by a monotonic sequence; a page also returns a watermark so a consumer can finish the current snapshot while later writes continue. Atlas validates the sequence, payload shape and hash before applying a page in one transaction. A retried page is idempotent, and a deleted Paperfield object is excluded from the active discovery catalog while its historical dossier remains addressable.

The bridge carries public metadata only. It never carries Paperfield notes, chat history, API keys, local paths or private reading content.

## Private loop and frozen digests

`focus_profile`, saved items, private radar projections, private digests and analysis requests are owner-scoped. They are returned by `/api/private/bootstrap` only after the loopback/same-origin check. Public `/api/bootstrap` contains reviewed projections and aggregate counts, but no task payloads, drafts, focus terms or saved objects. A digest stores its period, `as_of`, source-run/revision snapshot and content hash; identical inputs are deterministic and can be audited later.

`GET /api/bootstrap` keeps `frontier_candidates`, `frontier_updates`, `terms`, published `signals`, and local `signal_drafts` as distinct fields. `GET /api/trends` returns only published signals and continues to return `candidate_review_pending` while evidence awaits review.

Local editor endpoints:

```text
GET  /api/editor/signals?status=draft
POST /api/editor/signals
POST /api/editor/signals/{id}
POST /api/editor/signals/{id}/publish
POST /api/editor/signals/{id}/retract
```

The scanner does not download PDFs, call a model, read Paperfield SQLite, or read private notes.
