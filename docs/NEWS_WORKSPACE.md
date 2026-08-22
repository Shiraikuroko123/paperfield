# Atlas News Workspace

Atlas News is an internal workspace for high-signal updates in embodied AI,
robotics, VLA, large language models, multimodal models and agents.

The feed layer stores RSS/Atom metadata and keeps a provenance record for each
source. Long `content:encoded`/description fields are cached as safe in-app
HTML when available. Article pages are fetched only from the source's HTTPS
host allowlist, sanitised into a small safe HTML vocabulary, and cached in
`news_items`. A failed article fetch never becomes invented text: the reader
keeps the feed summary, labels the limitation, and leaves a retry action plus
the external source link.

The public read API is:

- `GET /api/news` for filtered list results and owner-scoped read statistics;
- `GET /api/news/:id` for the in-app reader (the default hydrates a missing body);
- `GET /api/news/sources`, `/api/news/runs`, `/api/news/monitor`, and `/api/news/stats` for source health;
- `POST /api/news/refresh` for an explicit source refresh;
- `POST /api/news/:id/read` and `/save` for private state.

The default source set includes official lab/research feeds from OpenAI, Google
DeepMind, Hugging Face, Microsoft Research, Berkeley AI Research and Google
Research. Two secondary newsroom feeds are included for company and funding
signals and are visibly labelled as secondary; broad secondary entries without
an embodied/LLM match are discarded. GitHub release and commit sources are
disabled and excluded from source counts, refresh jobs, and the active news
workspace. Source metadata is seeded during schema migration v17 and reconciled
at every startup without deleting cached articles.
The synchronizer keeps up to 30 entries per source by default; an explicit
refresh accepts up to 50. The UI requests up to 200 matching items from the
API but initially renders 24, with a load-more control and a bounded desktop
list so a growing archive does not force a long page scroll.

When Atlas runs through the unified launcher, one in-process refresh controller
polls the allowlisted feeds using ETag/Last-Modified conditional requests and
runs the arXiv/official-update frontier scanner. Open **刷新设置** in either the
frontier radar or news header to change both schedules, enable or disable either
job, inspect last/next run times, or refresh both immediately. The persisted
defaults are five minutes for news and six hours for the frontier scanner; the
allowed ranges are 1 minute to 24 hours and 15 minutes to 7 days respectively.
The controller is deterministic and does not invoke an AI model.

The unified control API is `GET /api/refresh/status`,
`GET/POST /api/refresh/settings`, and `POST /api/refresh/news`, `/frontier`, or
`/all`.
The existing `GET /api/news/monitor` endpoint still exposes per-source run
details. `RESEARCH_ATLAS_NEWS_SYNC_ENABLED=0` remains a startup escape hatch for
automatic news polling.

The workspace is intentionally separate from the published frontier signal
layer. A news item can link to an arXiv/DOI reference for Paperfield reading,
but a news headline is never promoted into a scientific conclusion without the
existing Atlas evidence and review workflow.
