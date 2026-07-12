# Paperfield

<p align="center">
  <strong>Language / 言語 / 语言:</strong>
  <a href="../../README.md">中文</a> |
  <a href="README.en.md">English</a> |
  <a href="README.ja.md">日本語</a>
</p>

Paperfield is a local-first research workspace for embodied intelligence, large language models, multimodal research, and open-source project tracking. It aggregates papers and GitHub projects, finds lawful public PDFs for weekly selections in advance, and keeps close reading, translation, Q&A, source-code guidance, and reading history in one continuous interface.

This is the English project guide. The Chinese guide is the root `README.md`; the Japanese guide is in the same `docs/i18n/` folder. Historical roadmaps, duplicate documentation, and backup copies are not maintained.

## Core Capabilities

- Aggregates public sources including arXiv, OpenAlex, Crossref, PMLR, CVF Open Access, and DBLP for embodied AI, robotics, vision, multimodal models, LLMs, and agents.
- Ranks weekly papers with five adjustable weights and prioritizes entries with a lawful public PDF already located.
- Shows PDFs, close reading, mathematical formulas, translation, and source-grounded chat side by side in the reader.
- Recommends a small number of related GitHub projects each week and organizes their README, entry points, dependencies, and source-reading path.
- Supports local storage, Cloudflare R2, and other S3-compatible object storage; close readings and Q&A can be synchronized to shared cloud storage.
- Supports login-protected beta sharing. Standard users can configure their own OpenAI-compatible API, and keys and model lists are never shared between users.

## Official Layout

```text
paper-scout/
├─ README.md                         Chinese primary guide
├─ src/
│  └─ paperfield/                    Application source package
│     ├─ __init__.py                 Python package marker
│     ├─ app.py                      HTTP service, collection, ranking, PDF, AI, storage, and accounts
│     ├─ catalog/                    Public domain catalog and collection policies
│     │  ├─ config.json              Topics, queries, and recommendation policy
│     │  ├─ venues.json              Venue and publication knowledge base
│     │  └─ institutions.json        University and research-institution marker catalog
│     └─ static/                     Browser client
│        ├─ index.html               Main workspace
│        ├─ app.js                   Paper, project, reader, and settings interactions
│        ├─ styles.css               Tsinghua-purple theme and responsive UI
│        ├─ login.html               Beta-login page
│        ├─ login.js                 Login interaction
│        ├─ login.css                Login-page styling
│        └─ vendor/                  Pinned PDF.js and KaTeX frontend assets
├─ deploy/                           Deployment configuration
│  ├─ .env.example                  Environment-variable example without secrets
│  ├─ requirements.txt              Python runtime dependencies
│  ├─ compose.yaml                  Docker Compose service definition
│  └─ docker/
│     ├─ Dockerfile                 Container build file
│     └─ Dockerfile.dockerignore    Docker build-context filter
├─ scripts/                          Windows run, check, refresh, share, and package scripts
│  ├─ run.cmd / run.ps1             Start the local workspace
│  ├─ refresh.cmd / refresh.ps1     Refresh paper and project sources manually
│  ├─ check.cmd / check.ps1         Run unit tests and JavaScript syntax checks
│  ├─ manage-beta-users.py          Create, reset, or disable beta accounts
│  ├─ start-beta-*.ps1              Start the protected ngrok sharing service
│  ├─ stop-beta-share.ps1           Stop the sharing service
│  ├─ install-beta-*.ps1            Create desktop shortcuts or an auto-start task
│  └─ build-release.py              Create a Windows release package without personal data
├─ tests/
│  └─ test_core.py                  Backend behavior regression tests
├─ docs/i18n/                       English and Japanese guides
│  ├─ README.en.md                  This guide
│  └─ README.ja.md                  Japanese guide
├─ .github/                         CI, release workflow, and Issue templates
├─ .gitignore                       Excludes personal data, cache, secrets, and build artifacts
├─ .gitattributes                   Git text attributes
├─ local/                           Private local runtime data, never committed
├─ data/                            Legacy compatibility data, never committed
└─ dist/                            Locally generated release archives, never committed
```

`local/`, `data/`, and `dist/` are runtime directories, not public source code. They may appear at the local project root but are never uploaded to GitHub. Do not move them into `src/` or commit them.

## Local Use

### First Run

```powershell
cd G:\ps\paper-scout
python -m pip install -r deploy\requirements.txt
python src\paperfield\app.py
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The first run initializes the local database and cache. Afterwards, refresh manually in the UI or let the background scheduler update on its configured interval.

Common commands:

```powershell
.\scripts\run.cmd
.\scripts\refresh.cmd
.\scripts\check.cmd
```

## Private Data and AI Configuration

By default, the database, PDFs, parsed full text, project cache, close readings, chat history, accounts, and local secrets live under `local/data/`. An existing legacy `data/` directory remains readable for compatibility, so migration does not discard data.

Copy the environment example to a private location before entering real values:

```powershell
Copy-Item deploy\.env.example local\.env
```

Set `PAPERFIELD_OPENAI_API_KEY`, `PAPERFIELD_OPENAI_BASE_URL`, `PAPERFIELD_OPENAI_MODEL`, and reasoning effort in `local/.env`. When no explicit configuration is present, Paperfield attempts to use the OpenAI-compatible settings provided by local CC Switch. A CC Switch API change affects new close readings and chats, but never changes saved readings or history.

When a standard user connects an API in the web settings, they only see models available to their own key. A beta account uses server-side configuration and quota. Never commit `local/.env`, `deploy/.env`, databases, or PDFs to GitHub.

## Cloud and Sharing

Cloudflare R2 and other S3-compatible storage can synchronize PDFs, close readings, and Q&A history. Settings are documented in `deploy/.env.example` under `PAPERFIELD_S3_*`, `PAPERFIELD_CLOUD_PREFIX`, and `PAPERFIELD_SHARED_STORAGE_MAX_MB`. The shared-library size is controlled by `PAPERFIELD_SHARED_STORAGE_MAX_MB`, and the app displays storage usage and operation statistics.

To share through a browser, create a beta account and install desktop shortcuts:

```powershell
python scripts\manage-beta-users.py add <username> --role beta
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

The `Paperfield Share` desktop shortcut starts the local service and an ngrok tunnel, then copies the URL. `Stop Paperfield Share` stops it. The source computer must remain online and powered on while sharing. Set `PAPERFIELD_NGROK_URL` in `local/.env` to use a reserved ngrok domain.

## Docker Deployment

Docker keeps deployment configuration in its own directory while using the repository root as the build context:

```powershell
Copy-Item deploy\.env.example deploy\.env
docker compose --env-file deploy\.env -f deploy\compose.yaml up --build -d
```

To stop the service:

```powershell
docker compose --env-file deploy\.env -f deploy\compose.yaml down
```

The container uses a named volume for data. Back up the `.env` file and the volume to a controlled location in production.

## Development and Verification

```powershell
python -m py_compile src\paperfield\app.py
node --check src\paperfield\static\app.js
node --check src\paperfield\static\login.js
python -m unittest discover -s tests -p test_core.py
python scripts\build-release.py
docker build -f deploy\docker\Dockerfile -t paperfield:test .
docker compose -f deploy\compose.yaml config --quiet
```

`scripts/build-release.py` packages only Git-tracked public files and additionally creates an empty `local/.env.example`. It refuses to put databases, logs, secrets, `local/`, or `data/` in a release package.

## Official Release Policy

`v0.12.7` is the only retained official release tag and its GitHub Release title is `Paperfield 首个发布版本`. Future changes are merged to `main`, fully verified, and then used to update this one official release. Old tags, historical Releases, backup documents, and temporary design artifacts are not retained.
