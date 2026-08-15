# Paperfield unified research workspace

## Product boundary

The repository is the source of one product with three internal workspaces:

| Route | Owner | Primary job |
| --- | --- | --- |
| `/` | Paperfield | Discover, select, read, annotate, and inspect code |
| `/atlas/` | Research Atlas | Track frontier evidence, study authored lessons, navigate knowledge relations, and build deep dossiers |
| `/flowloom/` | Flowloom | Crop, reconstruct, edit, and export scientific figures |

The user moves between workspaces by stable object identity. A paper is not
re-found by title; it carries `canonical_paper_ref` and `paperfield_id`. A course
chapter carries `course_chapter_id`. A figure carries `figure_id` plus an exact
`source_locator`.

## Repository layout

```text
apps/
  flowloom/                 React/Vite scientific figure editor
content/
  courses/                  Atlas lesson source, Markdown chapters, labs, and authoring config
packages/
  research-contracts/       Shared JSON contracts and examples
src/
  paperfield/               Reading and discovery service
  research_atlas/           Frontier and deep-analysis service
```

Paperfield and Atlas stay in `src/` during the compatibility stage so existing
commands, deployments, imports, and private data paths keep working. Moving
their files is a later mechanical cleanup after consumers no longer depend on
the old Python module paths.

## Runtime topology

`scripts/run-platform.ps1` starts Paperfield, Atlas, and the built Flowloom
client. Atlas renders the versioned course Markdown on demand; `/courses/...`
exists only as a compatibility redirect into Atlas. Browser navigation uses
Paperfield's origin and mounted routes. Private storage remains separated:

- `local/data/` for Paperfield reading data;
- `local/atlas/` for Atlas analysis and reviewed knowledge;
- browser-local Flowloom drafts and explicit exported files;
- versioned Atlas lesson source under `content/courses/`.

No migration combines SQLite files. Cross-workspace data is exchanged through
`packages/research-contracts` and explicit user actions.

Background service ownership is stored under `local/platform/` with the PID,
process start time, Python executable, and absolute service script path captured
directly from the launcher. `scripts/stop-platform.ps1` validates this metadata
with `Get-Process` before it terminates a PID; CIM command-line and TCP listener
inspection are only compatibility evidence because restricted Windows sessions
may deny both. Start and stop share one lifecycle lock, and a failed ownership
check retains its metadata and returns an error instead of deleting evidence.

## Source provenance

The imported sources are recorded in `provenance.json`. Flowloom and the course
repository did not expose a root license file at import time. Their source is
included because all three repositories have the same owner, but no public
redistribution license is inferred. Add explicit licenses before distributing
the combined repository to third parties.

Paperfield is the canonical repository for all three workspaces. The merge
started from an active Paperfield worktree, so Flowloom and the course sources
were imported as audited snapshots instead of rewriting the destination
history. Their exact source commits are pinned in `provenance.json`, and every
tracked upstream file was checked against its monorepo destination. The old
repositories are historical references only; new code, releases, issues, and
deployment changes belong in this repository.
