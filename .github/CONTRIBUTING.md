# Contributing to Paperfield

Paperfield is currently a personal research workstation, but changes should be prepared as if other people will review and operate them.

## Development setup

```powershell
git clone <your-repository-url>
cd paper-scout
python app.py
```

No third-party Python package is required for the current application.

## Before opening a pull request

```powershell
python -B -m unittest discover -s tests -v
node --check static\app.js
```

Also open `http://127.0.0.1:8765` and verify the affected desktop workflow.

## Branches and commits

- Create a short branch such as `feature/github-project-filters` or `fix/paper-deduplication`.
- Keep commits focused on one behavior.
- Do not commit `data/`, `.env`, API keys, CC Switch credentials, screenshots, or browser profiles.
- Explain behavior changes and verification in the pull request.

## Architecture expectations

- Keep data-source failures isolated so one provider cannot break a complete refresh.
- Prefer deterministic parsers and structured APIs.
- Preserve the distinction between source evidence and generated explanations.
- Add a migration before changing persistent database structures in a released version.
