# Paperfield

一个面向具身智能、大模型和开源项目追踪的个人研究工作台。

Paperfield is a local research client for daily embodied-intelligence and large-model paper discovery. It keeps a broad candidate pool, selects a small daily reading list, resolves legal open-access PDF copies, caches full text locally, and provides page-grounded Chinese explanations and paper chat.

## Daily reading workflow

- `每周精选` is the default view: 5 papers per configured research field, selected from the full local collection and kept stable for the natural week.
- The score is transparent and editable in `config.json`: academic quality 30, topic relevance 25, freshness 20, evidence completeness 15, impact and reproducibility 10.
- Clicking a recommended paper opens a focused workstation with PDF on the left and explanation, chat, and translation on the right.
- GitHub projects open with a curated code-reading route, a separate complete file index, rendered Markdown documents, and a line-numbered source viewer.
- Recommended PDFs are resolved from existing source links, OpenAlex, Semantic Scholar, arXiv, OpenReview, and Europe PMC, then cached under ignored `data/` paths.
- Paperfield never bypasses a paywall or institutional login. When no public copy exists, it keeps the publisher/source page available and labels the PDF as unavailable.

## Coverage

- Official proceedings: PMLR (ICML, CoRL, AISTATS) and CVF Open Access (CVPR, ICCV, WACV)
- Dedicated collectors: ACM MM and IEEE Transactions on Robotics (IEEE T-RO)
- Discovery and metadata: arXiv, OpenAlex, Crossref, and targeted Crossref venue queries
- Fixed DBLP archives: selected conference proceedings and journal volumes that broad search misses
- Curated catalog: 62 top or important conferences and journals across robotics, vision, language, machine learning, retrieval, agents, and ML systems
- Optional DBLP supplement: set `PAPERFIELD_ENABLE_DBLP=1` when the DBLP API is reachable
- GitHub project radar: tracks recently pushed embodied-AI and LLM repositories, with language/topic filters and high-confidence paper links
- Daily project selection: recommends up to four active repositories using topic relevance, freshness, Stars, paper links, and repository completeness

Formal publications, important specialist venues, and unconfirmed arXiv preprints are labeled separately. The first full import is larger; later updates use indexed batch writes and normally finish much faster.
The venue selector distinguishes papers available now, records with future publication dates, sources waiting for collection, and sources blocked by platform verification. See [`docs/COVERAGE_AUDIT.md`](docs/COVERAGE_AUDIT.md) for the latest audit and source limitations.

Representative institutions and laboratories are marked from public affiliation metadata. These markers are informational and do not affect recommendation scores.

Recommended GitHub projects open in a dedicated code workspace. Paperfield downloads only public text source files, ignores dependency/build/data directories, never executes repository code, and presents a file tree, README, Chinese code explanation, and source-grounded project chat.

## Run

```powershell
cd G:\ps\paper-scout
python app.py
```

Open `http://127.0.0.1:8765`.

也可以使用项目脚本：

```powershell
./scripts/run.cmd
./scripts/check.cmd
./scripts/refresh.cmd
```

The first launch seeds a small offline dataset so the interface is usable immediately. Click `更新论文` to fetch current public metadata.

## Full-text explanations and paper chat

Paperfield automatically detects the active CC Switch/Codex provider from `~/.codex/config.toml` and its key from `~/.codex/auth.json`. This supports Responses-compatible custom providers without copying the key into the project.
The active provider's `wire_api` is respected; both Responses API and Chat Completions-compatible providers are supported.

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENAI_MODEL="gpt-5-mini"
python app.py
```

When a public PDF is available, Paperfield extracts page-aware full text, builds cached reading notes in bounded chunks, and asks the model to produce method, derivation, experiment, conclusion, limitation, and evidence sections. Answers cite page numbers where the source material supports them.

Without a key, Paperfield generates a clearly labeled abstract-based Chinese reading guide. PDF reading and translation still work without GPT.

You can also add a paper by DOI, arXiv identifier, URL, or title through the built-in connector. Any selected paper accepts a local PDF upload; Paperfield validates the file, extracts page-aware text, opens it in the reader, and can immediately generate a full-text Chinese analysis.

For an explicit Paperfield-only override, use `PAPERFIELD_OPENAI_API_KEY`, `PAPERFIELD_OPENAI_BASE_URL`, and `PAPERFIELD_OPENAI_MODEL`.

## Translation without GPT tokens

The reader translates extracted pages without calling the GPT provider:

1. Chrome/Edge built-in Translator API when available.
2. A configured LibreTranslate-compatible endpoint.
3. A best-effort no-key Google Translate endpoint.

Configure a private LibreTranslate service with `PAPERFIELD_TRANSLATE_ENDPOINT` and optional `PAPERFIELD_TRANSLATE_API_KEY`. Free endpoints can rate-limit or change behavior, so local browser translation or a self-hosted service is more reliable.

## Refresh from the command line

```powershell
python app.py --refresh
```

The running server also refreshes automatically according to `config.json`.
It refreshes every 24 hours while running and catches up on the next launch after the computer has been off.

GitHub works without a token and automatically respects the anonymous search rate limit. Setting `GITHUB_TOKEN` is optional and only speeds up project refreshes. `OPENAI_API_KEY` is separate and is used only for Chinese paper explanations.

## Docker

```powershell
docker compose up --build -d
```

容器使用持久化数据卷，并通过 `/api/health` 提供健康检查。云端环境需要通过环境变量配置 AI Key，不能依赖本机 CC Switch 文件。

## Optional cloud PDF archive

Paperfield supports private S3-compatible storage for long-term PDF copies. Files can be saved locally, in Cloudflare R2, or in both places and downloaded again when opened. Explanations, reading state, notes, and complete paper/project chats are backed up independently so local PDF mode still preserves the learning history in R2. The in-app storage panel controls the local PDF directory and cache limit, inventories the private bucket daily, tracks Paperfield's Class A/Class B requests by billing cycle, and estimates R2 free-tier overage. Operation counts exclude requests made outside Paperfield; current bucket capacity is a point-in-time estimate rather than Cloudflare's average GB-month bill.

Configuration and current price comparison: [`docs/CLOUD_STORAGE.md`](docs/CLOUD_STORAGE.md)

On Windows, run `powershell -ExecutionPolicy Bypass -File .\scripts\configure-r2.ps1` to create the ignored local `.env` without echoing the Secret Access Key.

## GitHub project workflow

这个仓库已包含：

- GitHub Actions 自动测试和 Docker 构建。
- Bug 与功能需求 Issue 模板。
- Pull Request 模板。
- Dockerfile、Compose 和环境变量示例。
- 贡献、安全和版本变更文档。

学习 Git 和 GitHub：[`docs/GITHUB_GUIDE.md`](docs/GITHUB_GUIDE.md)

## Architecture and future deployment

- 当前架构与多用户演进：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Docker 和云端部署：[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- 后续路线：[`docs/ROADMAP.md`](docs/ROADMAP.md)
- 同类开源项目调研：[`docs/READER_RESEARCH.md`](docs/READER_RESEARCH.md)

当前版本仍是单用户本地应用。实现认证和 PostgreSQL 迁移前，不应直接暴露到公网。
