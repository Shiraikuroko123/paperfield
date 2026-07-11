# Open-source paper reader research

Paperfield 0.4 reviewed several active open-source projects before implementing its reading workflow.

## Projects reviewed

### [Future-House/paper-qa](https://github.com/Future-House/paper-qa)

PaperQA2 parses and caches scientific documents, retrieves document chunks, reranks evidence, and produces grounded answers with inline citations. It also supports local embedding models.

Paperfield adopts page-aware caching, bounded chunks, reusable reading notes, and evidence citations. It defers embeddings and agentic retrieval until the local library needs them; a lightweight personal workstation should not require a vector database on day one.

### [MuiseDestiny/zotero-gpt](https://github.com/MuiseDestiny/zotero-gpt)

Zotero GPT places questions and reusable commands inside the active PDF workflow. It can use the current PDF, selected text, or paper metadata as context.

Paperfield adopts the same core interaction: the question belongs beside the current paper, not on a separate chatbot page. Selected-text actions and reusable study commands remain future work.

### [windingwind/zotero-pdf-translate](https://github.com/windingwind/zotero-pdf-translate)

This plugin separates translation from LLM chat and supports many providers, including no-key services. It can translate selections, annotations, metadata, and reader content.

Paperfield similarly keeps translation independent from GPT. It prefers the browser's local Translator API, supports LibreTranslate, and uses a no-key Google endpoint as a best-effort fallback.

### [PDFMathTranslate/PDFMathTranslate](https://github.com/PDFMathTranslate/PDFMathTranslate)

PDFMathTranslate focuses on full-document bilingual translation while preserving scientific layout, equations, and formatting.

Paperfield currently translates extracted pages inside the reader. Layout-preserving bilingual PDF generation is intentionally deferred to an optional plugin because it adds heavier models, longer jobs, and different licensing/deployment concerns.

### [infiniflow/ragflow](https://github.com/infiniflow/ragflow)

RAGFlow emphasizes document parsing, visible chunking, human intervention, and traceable citations across complex documents.

Paperfield adopts cached chunks and traceable page evidence. It does not adopt RAGFlow's enterprise services, agent orchestration, or deployment footprint for the local single-user release.

## Current design rule

The product keeps discovery broad but reading narrow:

1. Collect a large candidate pool from public scholarly metadata.
2. Rank papers with visible, configurable criteria.
3. Recommend only a small number per field.
4. Resolve and cache a legal open-access PDF when the user opens a paper.
5. Separate source text, generated explanation, and unsupported inference.
6. Keep every detailed answer traceable to pages or clearly label the missing evidence.
