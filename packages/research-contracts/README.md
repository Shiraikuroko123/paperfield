# Research object contracts

This package defines the stable object identities exchanged by Paperfield,
Research Atlas, the course corpus, and Flowloom. The applications may use
different databases and runtimes, but they must not invent incompatible paper,
chapter, figure, or source identifiers.

The normative schemas live in `schemas/`. All contracts use JSON Schema draft
2020-12 and an explicit `schema_version`.

## Ownership

- Paperfield owns the reading library, PDFs, notes, and reading history.
- Research Atlas owns private analysis tasks, dossiers, reviewed knowledge, and
  frontier signals.
- The course corpus owns authored Markdown, labs, and teaching order.
- Flowloom owns editable diagram documents and exported figure assets.

Combining the source repository does not combine these private stores. Objects
cross an application boundary through the contracts below and retain source
locators, content hashes, and provenance.

## Stable identifiers

- `canonical_paper_ref`: `doi:<normalized-doi>`, `arxiv:<base-id>`, or
  `openreview:<forum-id>` when available.
- `paperfield_id`: Paperfield's local library identifier. It is an alias, not a
  replacement for `canonical_paper_ref`.
- `course_chapter_id`: a stable authored identifier such as `embodied-vla`.
- `figure_id`: a UUID or other collision-resistant identifier owned by
  Flowloom.
- `claim_id`: an immutable source-bounded scientific statement imported from a
  specific dossier stage and source SHA-256.
- `thread_id` + `revision`: an immutable, human-published research-thread
  revision; rollback creates another revision instead of changing history.
- `source_locator`: a structured pointer to the exact page, section, figure,
  table, equation, code path, quote, or course heading that supports an object.

Unknown values stay absent or empty. They must never be guessed merely to make
a payload pass validation.

`claim-thread-context.schema.json` is the explicit Research Atlas to Flowloom
transfer contract. It contains only a published revision, reviewed relations,
canonical paper references, exact locators, and source hashes. Candidate/model
scores and evaluation metrics are deliberately excluded.
