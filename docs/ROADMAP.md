# Roadmap

## Near term

- Split the monolithic backend into importable modules.
- Add parser fixtures for PMLR, CVF, Crossref and GitHub.
- Add HTTP integration tests and browser workflow tests.
- Add saved searches and configurable research profiles.

## Multi-user foundation

- Add schema migrations.
- Introduce users, workspaces and per-user paper state.
- Add OpenID Connect login and secure server-side sessions.
- Add role-based workspace membership.

## Cloud deployment

- Replace SQLite with PostgreSQL.
- Add a background queue for refresh and AI explanation jobs.
- Add object storage for downloaded PDFs and generated study documents.
- Add observability, rate limits, backups and deployment secrets.

## Collaboration

- Publish a versioned API contract.
- Add release tags and automated release notes.
- Add a license after the repository owner chooses the intended reuse policy.
