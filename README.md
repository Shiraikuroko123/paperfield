# Paperfield

一个面向具身智能、大模型和开源项目追踪的个人研究工作台。

Paperfield is a local research client for daily embodied-intelligence and large-model paper discovery. It combines official proceedings with public scholarly metadata, classifies papers by topic and venue level, stores reading state locally, and provides Chinese explanations through an optional OpenAI API key.

## Coverage

- Official proceedings: PMLR (ICML, CoRL, AISTATS) and CVF Open Access (CVPR, ICCV, WACV)
- Discovery and metadata: arXiv, OpenAlex, and Crossref
- Curated catalog: 62 top or important conferences and journals across robotics, vision, language, machine learning, retrieval, agents, and ML systems
- Optional DBLP supplement: set `PAPERFIELD_ENABLE_DBLP=1` when the DBLP API is reachable
- GitHub project radar: tracks recently pushed embodied-AI and LLM repositories, with language/topic filters and high-confidence paper links

Formal publications, important specialist venues, and unconfirmed arXiv preprints are labeled separately. The first full import is larger; later updates use indexed batch writes and normally finish much faster.

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

## Optional AI explanations

Paperfield automatically detects the active CC Switch/Codex provider from `~/.codex/config.toml` and its key from `~/.codex/auth.json`. This supports Responses-compatible custom providers without copying the key into the project.
The active provider's `wire_api` is respected; both Responses API and Chat Completions-compatible providers are supported.

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENAI_MODEL="gpt-5-mini"
python app.py
```

Without a key, Paperfield generates a clearly labeled abstract-based Chinese reading guide.

For an explicit Paperfield-only override, use `PAPERFIELD_OPENAI_API_KEY`, `PAPERFIELD_OPENAI_BASE_URL`, and `PAPERFIELD_OPENAI_MODEL`.

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

当前版本仍是单用户本地应用。实现认证和 PostgreSQL 迁移前，不应直接暴露到公网。
