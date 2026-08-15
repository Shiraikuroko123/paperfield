# Research Atlas Design System

## Intent

A researcher uses Atlas beside Paperfield during a well-lit desktop work session, repeatedly scanning dated evidence, opening a dossier, and returning to a source. The interface is therefore light, compact, and quiet; color identifies state and provenance rather than creating atmosphere.

## Visual Strategy

- Register: product.
- Color strategy: restrained neutrals with a cobalt action color and separate green, amber, and red semantic roles.
- Relationship to Paperfield: reuse its compact typography, square geometry, and manuscript discipline without copying its dark rail or paper-list composition.
- Primary surface: the operational frontier radar, never a marketing landing page.

## Tokens

Use OKLCH values in CSS.

```css
--canvas: oklch(0.965 0.006 230);
--surface: oklch(0.995 0 0);
--surface-muted: oklch(0.94 0.008 230);
--ink: oklch(0.25 0.025 248);
--ink-soft: oklch(0.39 0.025 245);
--muted: oklch(0.50 0.022 240);
--line: oklch(0.84 0.015 235);
--line-strong: oklch(0.67 0.025 238);
--primary: oklch(0.48 0.17 258);
--primary-hover: oklch(0.40 0.16 258);
--primary-soft: oklch(0.93 0.035 258);
--taxonomy: oklch(0.47 0.09 165);
--taxonomy-soft: oklch(0.93 0.025 165);
--warning: oklch(0.56 0.13 62);
--warning-soft: oklch(0.94 0.035 70);
--danger: oklch(0.48 0.15 25);
--danger-soft: oklch(0.94 0.035 25);
--success: oklch(0.45 0.11 155);
```

Radii remain 2px for panels and 4px for controls. Repeated paper, task, and thread rows may use a 6px radius. Shadows are reserved for transient overlays; structural panels use borders or surface contrast, not both border and wide shadow.

## Typography

- UI: `"Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif`.
- Research prose: `"Iowan Old Style", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif`.
- Identifiers and dates: `"Cascadia Mono", "SFMono-Regular", Consolas, monospace`.
- Fixed product scale from 11px metadata through 28px page titles. Letter spacing is always zero.
- Body prose uses 1.7 line height and a maximum measure of 72ch.

## Layout

- Desktop: 228px navigation rail, sticky 60px command bar, and a content rail capped at 1440px.
- Radar: a broad evidence stream plus a 320px operational queue. Sections are unframed; repeated signals and tasks are rows.
- Dossier: readable main column with a wider evidence rail for formulas, tables, and source mapping.
- Mobile: rail becomes an explicit drawer, the operational queue moves below the evidence stream, and all primary actions remain at least 44px tall.
- Fixed-format controls use stable heights so status changes never shift the surrounding layout.

## Components

- Navigation rail: current destination uses a filled neutral/primary-soft state, not a side stripe.
- Scope switch: segmented control for `全局前沿` and `与我的阅读相关`.
- Evidence state: label plus text (`已核查`, `候选`, `未知`, `存在反证`); color never carries meaning alone.
- Research signal row: change, linked thread, maturity, evidence basis, counter-evidence, and next source action.
- First-party update row: institution, publication date, matched domain, public feed summary, source hash, and official article action; never styled as a verified signal.
- Terminology candidate: author-provided expansion or title naming, exact source context, independent paper count, and a visible warning that Atlas-first-seen is not field-first-seen.
- Analysis task row: paper identity, requested stages, durable task ID, status, progress, and valid state actions.
- Dossier tabs: overview, method, math, evidence, critique, lineage, and artifacts. Unavailable stages explain why they are unavailable.
- Dossier provenance: every readable stage shows material basis, model, prompt version, attempt, and generation time.
- Content source label: `paper_claim`, `platform_derivation`, `editorial_judgment`, and `insufficient_information` remain visibly distinct.
- Evidence locator: page, section, figure, table, quote, and source URL are rendered as inspectable source actions rather than hidden metadata.
- Empty state: explains the next real action and shows the Paperfield -> Atlas -> Paperfield workflow. It never inserts demo research claims.
- Feedback: inline status plus a compact toast for completion or error.

## Motion

Use 160-220ms opacity and transform transitions only for drawers, view changes, and task feedback. Loading uses stable skeleton rows. Disable nonessential transitions and all pulsing under `prefers-reduced-motion: reduce`.

## Evidence And Media

Do not invent robot footage, benchmark values, paper conclusions, or news. Until verified media is attached to a dossier, use text evidence and a faithful system-flow diagram. Future embodied media must label real, simulation, teleoperation, or generated status and retain source and license metadata.

## Phase 5 operational surfaces

- The frontier console is a sortable evidence queue, not a popularity leaderboard. Domain, source, maturity and date filters are explicit, and each row shows the ranking basis and source run.
- The research loop keeps focus, saved objects, frozen digests, diagnostics and backups in a private workspace. Public projections expose only reviewed entities and active, reviewed relationships.
- Dossiers make provenance inspectable at claim/evidence level. A missing page, quote, source hash or counter-evidence boundary is shown as uncertainty, never silently filled by presentation copy.
- Paperfield remains the reading surface. Atlas links out for PDF/code inspection and accepts only public metadata through the incremental catalog bridge.

The release gate for these surfaces is 320px, 390px, tablet and 1440px browser checks, keyboard focus/Escape handling, reduced-motion behavior, no horizontal overflow, no console errors, and a passing integrity/performance test suite.

## Phase 6 operational surfaces

- The private research loop gains one workspace tab rather than another top-level application destination. It contains three unframed sections: saved research views, reviewed-change notifications, and evidence-bundle history.
- A research view row exposes its literal query or filter scope, revision, last run, result count, and expiry state. Run, export, edit, and delete use the existing button vocabulary; destructive actions require confirmation.
- Notifications are compact evidence rows. Unread state uses both text and semantic color, and each row names the reviewed signal revision or knowledge relation that caused it. Candidate papers and official updates remain visibly labeled as leads.
- Evidence bundles show the source view/run, created time, item count, manifest version, and SHA-256. Export never hides missing locators, counter-evidence, or insufficient-information markers.
- Empty and failure states explain the next real action. Loading keeps section dimensions stable, and no view preview, inbox refresh, or bundle export triggers a model request.

The Phase 6 release gate adds strict historical snapshot mutation tests, snapshot expiry and cleanup tests, public/private leakage tests, notification deduplication, bundle hash reproduction, and the same 320px through 1440px browser matrix.

## Phase 7 reliability surfaces

- A view row shows the latest run delta as literal added, removed, and changed counts. The first run is labeled as a baseline; the comparison is not styled as a trend or quality score.
- Runs carry an owner/view-local `run_sequence`. Delta, predecessor, and latest-run state always refer to adjacent sequence values, including when several runs share the same timestamp.
- Explicit run and bundle actions keep a retry key in the browser session until the server confirms success. A recovered response is named as recovery, while a new operation keeps the existing completion message.
- Retry keys are operational metadata only. They are owner-scoped, stored separately from public research content, represented in audit records only by SHA-256, and never included in evidence bundles.
- Snapshot capacity is counted only when a new snapshot will actually be inserted; diagnostics and cleanup do not evict a valid snapshot merely because capacity is exactly full.

The Phase 7 release gate adds duplicate-request replay, mismatched-key conflict, owner isolation, run-delta hash, same-second sequence ordering, v9-to-v10 and v10-to-v11 migration, forged skip/baseline/fork rejection, exact-capacity cleanup, HTTP 201/200 semantics, and the existing browser matrix. The v10-to-v11 migration linearizes historical runs by insertion order, rebuilds adjacent deltas, and re-signs Phase 7 bundles while preserving pre-delta Phase 6 bundle bytes.

## Integrated curriculum and privileged editor surface (0.17.3)

- Atlas is the sole runtime course surface. Historical `/courses/...` URLs resolve to the matching Atlas lesson; no separate course build or navigation shell is shipped.
- The knowledge tree remains the primary structure. Every source lesson is attached to its nearest knowledge chapter and selected through one native menu, so large systems and alignment modules remain scannable on desktop and mobile.
- Lesson Markdown is sanitized before insertion. Only allowlisted form semantics survive, course-authored scripts and event handlers never run, and Atlas owns prerequisite scoring, labels, keyboard behavior, and live result announcements.
- Relative lesson links stay inside the shared Atlas context. Relative images use a same-origin, image-only endpoint with traversal checks; code, labs, and non-lesson resources open their versioned Paperfield repository location.
- MathJax and Mermaid remain route-specific, lazy dependencies. Course images reserve intrinsic dimensions where supplied, scale within the reading rail, and never introduce horizontal page overflow.
- At intermediate and mobile widths the knowledge tree starts as a native disclosure while the active lesson remains first in the reading flow. The release gate covers the full source inventory, real README navigation, course media, diagnostic accessible names, and bare `/atlas` canonicalization.

## Paperfield-first paper navigation (0.17.4)

- Atlas owns discovery, synthesis, and research context; Paperfield owns the paper-reading workspace. Paper titles and primary paper actions therefore resolve a canonical reference through Paperfield and open its reader directly.
- Evidence locators preserve page, section, figure, table, equation, and quote parameters when returning to Paperfield so the reader can verify and highlight the cited source.
- arXiv, DOI, OpenReview, and publisher URLs remain available only as explicitly labeled external provenance actions. They never compete visually with the Paperfield reading action.
