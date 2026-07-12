# Public Source and Local Files

[中文](../PUBLIC_AND_LOCAL.md) | [日本語](PUBLIC_AND_LOCAL.ja.md)

Paperfield separates GitHub-publishable source from data that belongs only to the current computer.

## Public GitHub content

- `app.py` and `static/`: application and interface code.
- `config.json`, `venues.json`, and `institutions.json`: public catalogs without secrets.
- `scripts/`: reusable launch, validation, sharing, and release tools.
- `docs/`, `README.md`, Docker files, and GitHub automation.

## Local-only content

New installations write private state under the Git-ignored `local/` directory:

```text
local/
  .env                 API, translation, and object-storage credentials
  data/                database, PDFs, full text, source cache, explanations, and chats
    profiles/beta/     beta accounts and shared-instance data
  logs/                local process logs
```

Legacy root `.env` and `data/` paths remain supported. Never force-add these paths, databases, PDFs, or logs to Git.

## Releases and Packages

Pushing a tag that matches `APP_VERSION`, such as `v0.10.4`, runs tests and creates a clean Windows Release archive. GitHub Packages can later host a Docker image; it is not storage for papers or private user data.
