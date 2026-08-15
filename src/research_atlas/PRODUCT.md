# Product

## Register

product

## Users

Research Atlas serves researchers and advanced learners tracking large language models, multimodal models, and embodied intelligence. They already use Paperfield to receive weekly paper and GitHub recommendations, read PDFs, take notes, and inspect source code. Their primary context is a long desktop research session, with mobile used for scanning status and opening saved material.

## Product Purpose

Research Atlas turns selected reading into durable research understanding. It maintains evidence-backed paper dossiers, method and concept relationships, emerging terms, research threads, and a dated frontier radar. It does not replace Paperfield's discovery, PDF reader, quick Q&A, personal notes, or source browser. Success means a user can identify what changed, inspect the evidence and uncertainty, and return to the exact paper or repository in Paperfield.

In version 0.8, the product also closes the maintenance loop: a Paperfield catalog watermark can be replayed safely, private attention scopes can be frozen into dated digests, and the local Atlas database can be verified and recovered without exposing private analysis data through public endpoints.

Version 0.9 extends that loop into a reproducible private workspace. Catalog searches can be pinned to materialized historical results, explicit filters can be saved as research views, reviewed changes can enter a deduplicated private inbox, and a view run can be exported as a hash-verifiable evidence bundle. These operations never infer attention from browsing and never trigger external model processing by themselves.

Version 0.9.2 hardens repeated research operations. A browser retry can use a durable idempotency key to recover the exact research-view run or evidence bundle instead of creating a second resource. Each owner/view history has a monotonic `run_sequence`, and each new run records a hash-verifiable delta against its immediately preceding run, so the workspace shows what entered, left, or changed without converting that comparison into a scientific claim. Private-workspace import accepts only one continuous, unbranched chain and recomputes every declared delta before writing. These comparisons still use only the saved view's existing metadata and reviewed frontier projections; they never invoke a model.

Version 0.17.3 makes Atlas the only course interface and allows trusted Paperfield editor accounts to use the controlled knowledge-maintenance surface remotely. It indexes every first-party LLM and embodied-intelligence Markdown lesson, places each lesson in the nearest knowledge chapter, renders formulas and method diagrams on demand, and keeps representative papers connected to Paperfield. Course-relative lesson links and images resolve inside Atlas, while the prerequisite diagnostic is an Atlas-controlled, labeled native form whose result is announced without running course-authored scripts. Platform-wide database backups remain direct-loopback only.

Version 0.17.4 makes Paperfield's reader the primary destination for paper titles, candidate actions, ranked-paper actions, and evidence locators shown in Atlas. Explicitly labeled external-source links remain available for provenance, but they are no longer presented as the default paper-reading path.

## Brand Personality

Rigorous, restrained, incisive. The interface should feel like a maintained research index: calm enough for daily work, precise about provenance, and willing to show uncertainty instead of manufacturing conclusions.

## Anti-references

- AI marketing pages with oversized claims, neon gradients, generic robot imagery, or decorative network graphics.
- Infinite news feeds ordered by attention rather than scientific change.
- Dashboard templates made from interchangeable rounded cards and context-free metrics.
- Force-directed knowledge graphs as the default navigation surface.
- Interfaces that merge paper claims, model inference, news coverage, and editorial judgment into one voice.

## Design Principles

1. Evidence before summary: every scientific statement exposes its source basis, date, and verification state.
2. Reading earns depth: broad scanning stays inexpensive; only explicit reading choices enter deep analysis.
3. Stable knowledge and frontier signals remain visibly distinct while linking to each other.
4. Bridge, do not duplicate: Paperfield owns reading and source inspection; Atlas owns shared structure and analysis.
5. Progressive disclosure preserves density: show the research decision first, then reveal derivations, provenance, and operations.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Support complete keyboard navigation, visible focus, reduced motion, semantic landmarks, non-color status labels, and 320px minimum width. Long Chinese and English paper titles must wrap without truncating the research meaning. Dense tables and formulas may scroll horizontally but must retain labels and text alternatives.
