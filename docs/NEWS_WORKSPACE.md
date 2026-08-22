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
- `GET /api/news/sources`, `/api/news/runs`, and `/api/news/stats` for source health;
- `POST /api/news/refresh` for an explicit source refresh;
- `POST /api/news/:id/read` and `/save` for private state.

The default source set includes official lab/research feeds from OpenAI, Google
DeepMind, Hugging Face, Microsoft Research, Berkeley AI Research and Google
Research. Two secondary newsroom feeds are included for company and funding
signals and are visibly labelled as secondary sources. Source metadata is
seeded during schema migration v17 and can be disabled without deleting cached
articles.

The workspace is intentionally separate from the published frontier signal
layer. A news item can link to an arXiv/DOI reference for Paperfield reading,
but a news headline is never promoted into a scientific conclusion without the
existing Atlas evidence and review workflow.
