# Atlas News Workspace

Atlas News is an internal workspace for high-signal updates in embodied AI,
robotics, VLA, large language models, multimodal models and agents.

The feed layer stores RSS/Atom metadata and keeps a provenance record for each
source. Article pages are fetched only from the source's HTTPS host allowlist,
sanitised into a small safe HTML vocabulary, and cached in `news_items`. A
failed article fetch never becomes invented text: the reader falls back to the
feed summary and labels the content as unavailable.

The public read API is:

- `GET /api/news` for filtered list results and owner-scoped read statistics;
- `GET /api/news/:id` for the in-app reader (the default hydrates a missing body);
- `GET /api/news/sources`, `/api/news/runs`, `/api/news/monitor`, and `/api/news/stats` for source health;
- `POST /api/news/refresh` for an explicit source refresh;
- `POST /api/news/:id/read` and `/save` for private state.

The default source set includes official lab/research feeds from OpenAI, Google
DeepMind, Hugging Face, Microsoft Research, Berkeley AI Research and Google
Research, plus first-party GitHub release/commit feeds for OpenAI Codex,
Hugging Face LeRobot, NVIDIA Isaac GR00T and Physical Intelligence openpi.
GitHub sources are classified as `code_release` or `code_change`, so a new
release or harness/runtime commit is visible separately from a general blog
post. Two secondary newsroom feeds are included for company and funding
signals and are visibly labelled as secondary; broad secondary entries without
an embodied/LLM match are discarded. Source metadata is seeded during schema
migration v17 and reconciled at every startup without deleting cached articles.

When Atlas runs through the unified launcher, an in-process monitor polls the
allowlisted feeds using ETag/Last-Modified conditional requests. GitHub
release/commit feeds are checked every minute by default, while the remaining
official and secondary feeds are checked every five minutes. Set
`RESEARCH_ATLAS_NEWS_SYNC_PRIORITY_INTERVAL_SECONDS` to a value between 60 and
the general interval to change the code-feed cadence, and set
`RESEARCH_ATLAS_NEWS_SYNC_INTERVAL_SECONDS` to a value between 60 and 86400 to
change the general cadence. Set `RESEARCH_ATLAS_NEWS_SYNC_ENABLED=0` to disable
automatic polling. The current monitor state and per-source run summary are
available at `GET /api/news/monitor`; the UI displays the latest check and both
polling cadences.

The workspace is intentionally separate from the published frontier signal
layer. A news item can link to an arXiv/DOI reference for Paperfield reading,
but a news headline is never promoted into a scientific conclusion without the
existing Atlas evidence and review workflow.
