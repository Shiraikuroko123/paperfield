# Changelog

## 0.8.0

- Added persistent local/cloud/hybrid PDF targets, a configurable PDF folder, and a configurable cache limit.
- Added Cloudflare R2 bucket inventory, billing-cycle Class A/Class B counters, free-tier percentages, and estimated overage.
- Added date-stable daily paper rotation so high-quality recommendations change between days.
- Grouped repository files into logical reading sections and rendered sanitized README Markdown.

All notable changes to Paperfield are documented here.

## Unreleased

- No unreleased changes yet.

## 0.7.0 - 2026-07-11

- Added a daily list of up to four recommended GitHub projects with explainable scores and topic diversity.
- Added safe public-repository source caching without executing downloaded code.
- Added a project code workspace with file tree, source viewer, README, AI explanation, and grounded chat.
- Added repository branch and size metadata to improve source retrieval and recommendation quality.

## 0.6.0 - 2026-07-11

- Added explicit primary and secondary sorting for papers and GitHub projects.
- Added a DOI, title, and arXiv paper connector with metadata import.
- Added local PDF upload, page-aware extraction, and immediate full-text analysis.
- Added optional S3-compatible cloud archiving with on-demand restore and bounded local caching.

## 0.5.0 - 2026-07-11

- Expanded venue collection with dedicated ACM MM and IEEE T-RO collectors, targeted Crossref queries, and selected DBLP archives.
- Added an auditable coverage endpoint and venue states for available, scheduled, pending, failed, and access-blocked sources.
- Added representative institution markers and filters without changing recommendation scores.
- Hid non-research front matter and kept future-dated records out of the current reading list.

## 0.4.0 - 2026-07-11

- Reworked the main workflow around a small, high-quality daily reading list.
- Added open-access PDF discovery across scholarly repositories without bypassing access controls.
- Added local full-text extraction, PDF reading, detailed Chinese analysis, page-grounded chat, and free translation fallbacks.
- Prepared the repository for GitHub collaboration and Docker deployment.
- Added environment-driven runtime settings, `/api/health`, GitHub Actions CI, and collaboration documentation.

## 0.3.0 - 2026-07-11

- Added GitHub project discovery and high-confidence paper-project links.
- Added CC Switch Responses and Chat Completions support.
- Added official PMLR and CVF paper collection, venue tiers, and pagination.
