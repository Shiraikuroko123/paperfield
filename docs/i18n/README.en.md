# Paperfield

[中文](../../README.md) | [English](README.en.md) | [日本語](README.ja.md)

Paperfield is a desktop research workstation for embodied intelligence, large language models, and open-source project tracking. It maintains a broad candidate pool, selects a small weekly reading list, resolves legal open-access PDFs, and keeps papers, source code, explanations, and conversations in one continuous workflow.

## Highlights

- Weekly paper recommendations by research field, capped at five papers per field with explainable scores.
- Coverage of top conferences, journals, preprints, and public scholarly metadata, with formal publications separated from unconfirmed preprints.
- A split PDF reader with full-text analysis, page translation, and source-grounded questions.
- Up to four weekly GitHub project recommendations linked to papers, README documents, and curated source-reading routes, stable throughout the natural week.
- Local, Cloudflare R2, or hybrid PDF storage with backups for explanations and chat history.
- Password-protected beta sharing for up to four trusted testers.

## Trilingual Markdown

Paperfield's main README has three maintained static versions:

- Chinese: [README.md](../../README.md)
- English: [README.en.md](README.en.md)
- Japanese: [README.ja.md](README.ja.md)

Inside Paperfield's GitHub project reader, every `.md` file is marked `中/英/日`. The English view displays the repository source. Chinese and Japanese are generated on demand through a free translation endpoint, consume no GPT tokens, and are cached locally and optionally in R2.

Other maintenance documents are not presented as hand-maintained translations. Their locations and language status are listed in the [documentation map](../README.md).

## Run locally

```powershell
cd G:\ps\paper-scout
python app.py
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). Paperfield refreshes while running and catches up after the computer has been offline.

The database, PDFs, source cache, explanations, chats, and secrets live under the Git-ignored `local/` directory. See [Public source and local files](PUBLIC_AND_LOCAL.en.md). Testers should normally download the clean archive from GitHub Releases.

## Share with testers

Follow the [beta-sharing guide](../BETA_SHARING.md) to configure ngrok and beta accounts. On Windows, install the desktop shortcuts once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

Use **Paperfield Share** to start in the background and **Stop Paperfield Share** to stop. Testers only need a browser.

## Documentation

- [Documentation map](../README.md)
- [Architecture](../ARCHITECTURE.md)
- [Deployment](../DEPLOYMENT.md)
- [Public source and local files](PUBLIC_AND_LOCAL.en.md)
- [Roadmap](../ROADMAP.md)
- [Changelog](../CHANGELOG.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Security](../../.github/SECURITY.md)
