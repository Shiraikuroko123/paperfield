# Security Policy

## Secrets

Never commit API keys, GitHub tokens, `.env`, `~/.codex/auth.json`, CC Switch configuration backups, or production database files.

Paperfield reads local CC Switch credentials at runtime. Docker and cloud deployments should use platform secret managers or environment variables.

## Reporting

Until a public security contact is configured, report security issues privately to the repository owner. Do not publish credentials, exploit details, or private database contents in a public issue.

## Current scope

The current release is a single-user local application without authentication. Do not expose it directly to the public internet. Use a firewall or private network until the authentication phase described in `docs/ARCHITECTURE.md` is implemented.
