# Deployment

## Local Windows

```powershell
./scripts/run.cmd
```

The default address is `http://127.0.0.1:8765` and the database is stored in `data/papers.db`.

## Docker

```powershell
docker compose up --build -d
docker compose logs -f
```

Open `http://127.0.0.1:8765`. Data is stored in the `paperfield-data` Docker volume.

Stop the service without deleting data:

```powershell
docker compose down
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PAPERFIELD_HOST` | Bind address |
| `PAPERFIELD_PORT` | HTTP port |
| `PAPERFIELD_DATA_DIR` | Persistent data directory |
| `PAPERFIELD_DB_PATH` | Optional explicit SQLite path |
| `PAPERFIELD_AUTO_REFRESH` | Set to `0` to disable the in-process scheduler |
| `PAPERFIELD_AUTH_REQUIRED` | Set to `1` to require an account from the auth users file |
| `PAPERFIELD_AUTH_USERS_PATH` | JSON account registry; passwords are stored as PBKDF2 hashes |
| `PAPERFIELD_OPENAI_API_KEY` | AI key for container/cloud deployment |
| `PAPERFIELD_OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `PAPERFIELD_OPENAI_MODEL` | Explanation model |
| `PAPERFIELD_DISABLE_CLOUD` | Set to `1` to ignore all S3/R2 credentials for an isolated instance |
| `PAPERFIELD_CLOUD_PREFIX` | Optional object-key namespace for an isolated/shared library |
| `PAPERFIELD_SHARED_STORAGE_MAX_MB` | Capacity limit applied when a cloud prefix is configured |
| `PAPERFIELD_S3_PROVIDER` | Display name for an optional S3-compatible archive |
| `PAPERFIELD_S3_ENDPOINT` | S3-compatible endpoint; blank for AWS S3 |
| `PAPERFIELD_S3_REGION` | Object-storage region |
| `PAPERFIELD_S3_BUCKET` | Private PDF archive bucket |
| `PAPERFIELD_S3_ACCESS_KEY_ID` | Server-side object-storage access key |
| `PAPERFIELD_S3_SECRET_ACCESS_KEY` | Server-side object-storage secret |
| `PAPERFIELD_LOCAL_CACHE_MAX_MB` | Maximum local PDF cache before old files are pruned |
| `PAPERFIELD_PROJECT_ZIP_MAX_MB` | Maximum compressed public repository download |
| `PAPERFIELD_PROJECT_TEXT_MAX_MB` | Maximum extracted text source cache per repository |
| `GITHUB_TOKEN` | Optional GitHub rate-limit increase |

## Cloud constraints

The current release should run as one application instance with one persistent volume. Multiple instances must not share SQLite over a network filesystem.

The beta ngrok workflow provides an authenticated single-instance preview without requiring testers to install tunnel software. Before a permanent multi-user internet deployment:

1. Replace the beta account registry with an established OIDC provider.
2. Put TLS and a reverse proxy in front of the application.
3. Move to PostgreSQL.
4. Move scheduled work to a single worker or managed scheduler.
5. Configure backups and secret management.

## Backup

Stop writes or use SQLite's backup API before copying the database. At minimum, preserve:

```text
data/papers.db
config.json
venues.json
```

Do not store `.env` or API keys inside backups committed to GitHub.

When cloud archiving is enabled, back up the SQLite database as well as the private object-storage bucket. The database contains the object keys used to restore each PDF.
