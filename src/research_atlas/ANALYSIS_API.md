# Analysis Worker API

Research Atlas 0.8 retains the explicitly authorized, page-addressable dossier workflow introduced in 0.4. The worker is a separate process. It communicates with Atlas only through this API and never reads Paperfield SQLite, its PDF cache, private notes, or chat history. The research-signal and Phase 4 knowledge editors are separate local-only workflows and never start this worker.

## Explicit authorization

Creating a task does not grant material access. Paperfield bridge messages always create an unprivileged task, even if a forged bridge payload includes permission fields.

The Atlas browser may set two independent permissions:

```http
POST /api/analysis-requests/{task_id}/material-authorization
Content-Type: application/json

{
  "allowPublicPdfDownload": true,
  "allowExternalModelProcessing": true
}
```

The second permission requires the first. With only public-PDF permission, a worker may download and parse the PDF locally, then stops at `ready`. No model request is made. Atlas takes the source URL from the canonical paper record; this endpoint cannot replace it with a browser-supplied URL.

## Worker configuration

Set a dedicated token and dedicated OpenAI-compatible connection in `local/.env`. The worker intentionally ignores `PAPERFIELD_OPENAI_*`, generic `OPENAI_*`, and Codex/CC Switch credentials.

```dotenv
RESEARCH_ATLAS_WORKER_TOKEN=replace-with-the-same-long-random-value-used-by-atlas
RESEARCH_ATLAS_OPENAI_API_KEY=
RESEARCH_ATLAS_OPENAI_BASE_URL=https://api.openai.com/v1
RESEARCH_ATLAS_OPENAI_MODEL=
RESEARCH_ATLAS_OPENAI_WIRE_API=responses
```

The unified launcher starts the worker automatically when the dedicated
configuration above is complete, and records verified lifecycle metadata for
it alongside Paperfield and Atlas:

```powershell
.\scripts\run-platform.ps1
```

For standalone debugging, start Atlas and the worker in separate terminals:

```powershell
.\scripts\run-atlas.ps1
.\scripts\run-atlas-worker.ps1
```

Use `--once` to claim at most one task. Opening a paper, dossier, or task page never starts a model call.

## Claim and lease

All worker requests send `X-Atlas-Worker-Token`. After an atomic claim, task-scoped writes also send the returned value as `X-Atlas-Lease-Token`.

```text
POST /api/worker/claim
POST /api/worker/leases/{task_id}/heartbeat
POST /api/worker/leases/{task_id}/release
```

Claim body:

```json
{"workerId":"local-workstation","leaseSeconds":900}
```

The claim returns `purpose: "prepare"` for local-only parsing or `purpose: "analyze"` when external processing is also authorized. A second worker cannot claim the same live lease. If a lease expires, a running stage is retained as a failed attempt and Atlas appends a new pending attempt before allowing another claim.

## Material lifecycle

```text
authorized -> downloading -> downloaded -> parsing -> ready
                    \------------------------------> failed
```

```text
POST /api/analysis-requests/{task_id}/material/download-start
POST /api/analysis-requests/{task_id}/material/downloaded
POST /api/analysis-requests/{task_id}/material/parse-start
POST /api/analysis-requests/{task_id}/material/ready
POST /api/analysis-requests/{task_id}/material/fail
```

The included worker validates every initial and redirect URL against DNS-resolved public IPs, rejects local/private/reserved targets and embedded credentials, caps download size, verifies a PDF signature, computes SHA-256 over the exact parsed bytes, and extracts text with PyMuPDF while retaining `--- 第 N 页 ---` markers. Parsed PDFs and text are stored only under `local/atlas/materials/` by default.

`downloaded` records `sourceSha256`, `byteSize`, and `mediaType`. `ready` records the same hash plus `pageCount` and `extractedCharacters`. If Paperfield supplied an expected hash, a mismatch is rejected and persisted as a material failure.

## Stage lifecycle

The stage keys are `structure`, `claims`, `method`, `math`, `experiments`, `code`, `lineage`, `critique`, and `citations`.

```text
pending -> running -> completed
                  \-> failed -> retry creates attempt N+1
```

```text
GET  /api/analysis-requests/{task_id}
GET  /api/analysis-requests/{task_id}/stages/{stage}
POST /api/analysis-requests/{task_id}/stages/{stage}/start
POST /api/analysis-requests/{task_id}/stages/{stage}/progress
POST /api/analysis-requests/{task_id}/stages/{stage}/complete
POST /api/analysis-requests/{task_id}/stages/{stage}/fail
POST /api/analysis-requests/{task_id}/retry   {"stage":"math"}
```

Long papers are split on page boundaries. Each page range is analyzed, and intermediate results are reduced without inventing new claims or locators. The worker uses strict structured output and validates the final object locally against [analysis-stage-complete.schema.json](schemas/analysis-stage-complete.schema.json).

For full-text results, every `paper_claim` and `platform_derivation` evidence item must point to a valid page in the parsed PDF. A supplied quote must occur on that page, and an evidence URL cannot point outside the authorized PDF. Atlas overwrites model-reported provenance fields with the actual material hash, configured model, and prompt version before publishing the stage.

Completed stages are merged into a private, versioned `paper_analyses` dossier. Abstract-only output is never promoted to a full-text conclusion.

## Phase 5 provenance and maintenance

Every readable claim is assigned a deterministic `claim_id`; every evidence item carries an `evidence_id`, source basis, source SHA-256 and locator completeness. Dossier exports are available as JSON or Markdown and include a Paperfield deep link for the exact paper or page when known. A source version or material hash change creates a new analysis version rather than overwriting the previous dossier silently.

The maintenance surface exposes worker/scanner readiness without returning credentials, and provides SQLite backup manifests, SHA-256 verification, integrity checks and an explicit, audited restore operation. Research-data imports validate the complete payload before entering one database transaction; a malformed later item cannot leave a partial focus profile or saved-item set behind.

The worker remains opt-in. Opening a radar item, dossier or Paperfield link does not download a PDF or call a model. Both external material processing and model use require separate explicit authorizations.
