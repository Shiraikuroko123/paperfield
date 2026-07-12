# Changelog

## 0.10.3

- Added focused arXiv update-date searches with bounded pagination so recently revised papers are not hidden by the latest-submission window.
- Normalized versioned arXiv identifiers to prevent duplicate records across revisions and connector imports.
- Expanded GitHub discovery for robotic-manipulation repositories and verified TwinRL paper-to-code linking.

## 0.10.2

- Merged project recommendations into the weekly picks page below the selected papers.
- Replaced the daily project label with a natural-week rotation of up to four projects.
- Kept legacy project-recommendation URLs compatible by redirecting them to weekly picks.

## 0.10.1

- Added an isolated `community-beta` R2 namespace for connector imports and shared PDFs.
- Added a locally configurable shared-library capacity limit and scoped usage meter.
- Required a sharing-rights confirmation before manually uploaded PDFs enter the shared cloud library.
- Made the Chinese/English/Japanese Markdown language control easier to locate.
- Replaced Cloudflare Quick Tunnel beta sharing with ngrok so testers only need a browser.
- Added one-click desktop shortcuts for starting and stopping protected sharing in the background.

## 0.10.0

- Added password-protected beta accounts with PBKDF2 password hashing, seven-day sessions, login throttling, and a four-account limit.
- Added beta/standard account roles so only explicitly trusted beta accounts can consume the host GPT provider.
- Added an isolated beta profile that copies the public paper/project catalog while removing personal reading state, chats, PDFs, project caches, and cloud records.
- Added free Cloudflare Quick Tunnel start/stop scripts and an explicit cloud-disable switch for shared instances.
- Added a responsive beta login screen, current-account indicator, and logout action.

## 0.9.0

- Replaced repeated repository trees with a curated reading route and a separate flat all-files view.
- Added file reasons, language and line metadata, stable line numbers, wrapping, and copy controls.
- Rendered any selected Markdown file in the document pane with a one-click return to the root README.
- Renamed the default paper list to weekly picks and kept each natural week's selection stable.
- Added automatic R2 backup and restore for paper/project explanations, reading state, notes, and complete chats.
- Restored complete paper and project conversations in the reader instead of showing only the latest messages.
- Added Chinese, English, and Japanese views for important project Markdown documents with local and R2 translation caches.

## 0.8.1

- Added a local interactive R2 configuration script with hidden Secret Access Key input.
- Made the reader's R2 connection and immediate archive actions visible and unambiguous.
- Added staged full-text analysis feedback and bounded S3 connection timeouts.

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
