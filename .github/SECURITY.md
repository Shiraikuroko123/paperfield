# Security Policy

## Secrets

Never commit API keys, GitHub tokens, `.env`, `~/.codex/auth.json`, CC Switch configuration backups, or production database files.

Paperfield reads local CC Switch credentials at runtime. Docker and cloud deployments should use platform secret managers or environment variables.

## Reporting

Until a public security contact is configured, report security issues privately to the repository owner. Do not publish credentials, exploit details, or private database contents in a public issue.

## Current scope

The default local instance has no authentication and must not be exposed directly to the public internet. The documented beta sharing mode uses a separate data profile, hashed beta accounts, login throttling, and a temporary HTTPS tunnel. It is intended only for a small trusted test group; permanent multi-user deployment still requires OIDC and account-scoped persistence as described in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
