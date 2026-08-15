import type { AiAttachment, AiDiagramRequest } from '../types';
import type { PDFPageProxy } from 'pdfjs-dist';
import { VISIBLE_SHAPES } from './shapeRegistry';
import { pdfTextItemsToPlainText, type PdfTextItemLike } from './pdfVectorExtraction';

const SHAPE_CATALOG = VISIBLE_SHAPES
  .map((definition) => `${definition.kind}=${definition.label}`)
  .join(', ');

const FLOWCHART_SYSTEM_PROMPT = `You are a senior process architect. Convert the user's context into one precise editable flowchart.
Return only a JSON object with this schema:
{
  "title": "short diagram title",
  "direction": "TB or LR",
  "nodes": [{"id":"stable-ascii-id","label":"concise visible label","description":"optional detail","kind":"a supported shape id"}],
  "edges": [{"source":"node-id","target":"node-id","label":"optional branch condition"}]
}
Rules:
- Include explicit start and end nodes.
- Every non-terminal node must connect forward; avoid orphan nodes.
- Decision nodes should usually have labeled outgoing branches.
- Use 5-18 nodes unless the source requires more.
- Preserve concrete roles, constraints, exception paths, and terminology from the source.
- Choose the most semantically accurate standard shape. Supported shape ids: ${SHAPE_CATALOG}.
- Prefer standard flowchart shapes unless the user explicitly requests BPMN or UML notation.
- Do not wrap JSON in markdown fences and do not add commentary.`;

const SCIENTIFIC_SCHEMATIC_SYSTEM_PROMPT = `You are a senior scientific figure designer specializing in LLM, VLM, VLA, robotics, and embodied-intelligence papers. Convert the user's material into an original, publication-ready system schematic made only from editable nodes and edges. Do not copy a paper figure pixel-for-pixel and do not return a bitmap.
Return only one JSON object with this schema:
{
  "title": "short paper-figure title",
  "direction": "LR",
  "nodes": [{
    "id": "stable-ascii-id",
    "label": "concise visible label",
    "description": "optional short secondary line",
    "role": "frame|phase|modality|token|encoder|bridge|backbone|policy|action|environment|memory|dataset|loss|annotation",
    "kind": "supported shape id",
    "position": {"x": 0, "y": 0},
    "width": 180,
    "height": 76,
    "fill": "#RRGGBB",
    "stroke": "#RRGGBB",
    "textColor": "#RRGGBB",
    "fontSize": 13,
    "fontWeight": 650,
    "borderWidth": 1.5,
    "radius": 6,
    "zIndex": 10,
    "sourceQuote": "verbatim supporting phrase from the supplied paper, or empty",
    "confidence": 0.0,
    "inferred": false
  }],
  "edges": [{
    "source": "node-id",
    "target": "node-id",
    "label": "optional information flow",
    "routing": "smoothstep|straight|bezier",
    "lineStyle": "solid|dashed|dotted",
    "color": "#RRGGBB",
    "width": 1.7,
    "arrowEnd": "closed|open|none",
    "sourceQuote": "verbatim support for this relation, or empty",
    "confidence": 0.0,
    "inferred": false
  }]
}
Scientific-figure rules:
- Use an explicit coordinate system around 0..1320 x 0..700. Every node needs position, width, and height.
- The first node must be a large role=frame, kind=group background with zIndex=-30. Add 2-4 role=phase kind=group regions with zIndex=-20 when the architecture has stages. Foreground modules use zIndex=10.
- Keep all foreground modules inside the frame and avoid overlaps. Leave at least 24 px between adjacent modules and enough whitespace for edge labels.
- Use 12-30 foreground modules. Labels should be short enough for their boxes; use description for the second line.
- Prefer a strong reading order, usually left-to-right: inputs -> encoding -> backbone/reasoning -> policy/output -> environment. Use a loop only when feedback is semantically real.
- Show modality roles, token or feature flow, trainable versus frozen modules, training versus inference, losses, memory/world model, action chunks, and robot feedback only when supported by the source.
- Use solid arrows for forward computation, dashed arrows for training/control dependencies, dotted arrows for auxiliary signals, and bezier dashed arrows for feedback loops.
- Use a restrained print-safe role palette: blue modalities, green encoders, amber tokens/data, violet backbones, rose policies, blue actions, pale green environments, neutral phase regions. Never use gradients, shadows, transparency, decorative blobs, or tiny text.
- One color must have one semantic role. Maintain dark text and visible borders. For black-and-white requests, use white/gray fills plus line-style redundancy.
- Supported shape ids: ${SHAPE_CATALOG}. Prefer group for regions, rounded-rectangle for modules, database for datasets/memory, ellipse for robot/environment, note for annotations, and hexagon for planning/bridges.
- Preserve concrete model names, modalities, datasets, losses, action spaces, time horizons, robot embodiments, and training stages from the source. Do not invent benchmark results.
- Ground every paper-specific node and relation in a supplied quote or locator. If the source does not support a module or relation, omit it or set inferred=true and confidence below 0.6.
- Use only the supplied paper-library templates and element vocabulary when those constraints are present. Templates are layout priors, not factual evidence.
- Never fabricate model names, datasets, equations, ablations, numerical results, or causal claims.
- Do not wrap JSON in markdown fences and do not add commentary.`;

export function isScientificAiScenario(scenario: string): boolean {
  return /论文|大模型|多模态|VLM|VLA|具身|训练.*推理|scientific|paper|embodied/i.test(scenario);
}

function systemPrompt(request: AiDiagramRequest): string {
  return isScientificAiScenario(request.scenario) ? SCIENTIFIC_SCHEMATIC_SYSTEM_PROMPT : FLOWCHART_SYSTEM_PROMPT;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function endpoint(baseUrl: string): string {
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(clean)) return clean;
  return `${clean}/chat/completions`;
}

export function isLocalAiEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertAttachmentTransferAllowed(request: AiDiagramRequest) {
  if ((request.attachments.length === 0 && !request.paperContext) || isLocalAiEndpoint(request.config.baseUrl)) return;
  if (!request.attachmentTransferConfirmed) {
    throw new Error('Sending paper attachments or dossier context to a non-local model endpoint requires explicit confirmation for this request.');
  }
}

function buildUserContent(request: AiDiagramRequest): unknown {
  const scientific = isScientificAiScenario(request.scenario);
  const paperContext = request.paperContext
    ? `Trusted paper context and drawing constraints:\n${JSON.stringify(request.paperContext, null, 2)}`
    : '';
  const context = [
    request.scenario ? `Scenario: ${request.scenario}` : '',
    request.prompt,
    paperContext,
    ...request.attachments
      .filter((item) => item.kind === 'text' || item.kind === 'pdf')
      .map((item) => `\n--- ${item.name}${item.kind === 'pdf' ? ` (${item.pageCount ?? '?'} PDF pages)` : ''} ---\n${item.content}`),
  ].filter(Boolean).join('\n\n');
  const images = request.attachments.flatMap((item) => {
    if (item.kind === 'image') return [{ name: item.name, content: item.content }];
    if (item.kind !== 'pdf') return [];
    const previews = item.previews?.length ? item.previews : item.preview ? [item.preview] : [];
    return previews.map((content, index) => ({ name: `${item.name} page preview ${index + 1}`, content }));
  });
  if (images.length === 0) return context;
  return [
    {
      type: 'text',
      text: scientific
        ? `${context}\n\nAnalyze the supplied paper/reference image for semantic structure and visual hierarchy, then create an original editable scientific schematic with the same factual content. Do not trace pixels or return a bitmap.`
        : `${context}\n\nReconstruct the supplied diagram/reference images as structured nodes and edges.`,
    },
    ...images.map((item) => ({ type: 'image_url', image_url: { url: item.content, detail: 'high' } })),
  ];
}

async function requestCompletion(request: AiDiagramRequest, useResponseFormat: boolean) {
  const response = await fetch(endpoint(request.config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.config.apiKey ? { Authorization: `Bearer ${request.config.apiKey}` } : {}),
    },
    signal: request.signal,
    body: JSON.stringify({
      model: request.config.model,
      temperature: 0.15,
      messages: [
        { role: 'system', content: systemPrompt(request) },
        { role: 'user', content: buildUserContent(request) },
      ],
      ...(useResponseFormat ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`AI 接口返回 ${response.status}: ${detail.slice(0, 360)}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function generateDiagram(request: AiDiagramRequest): Promise<unknown> {
  assertAttachmentTransferAllowed(request);
  if (!request.config.baseUrl.trim()) throw new Error('请先填写 OpenAI 兼容接口地址。');
  if (!request.config.model.trim()) throw new Error('请先填写模型名称。');
  let response: Record<string, unknown>;
  try {
    response = await requestCompletion(request, true);
  } catch (error) {
    if (![400, 422].includes((error as { status?: number }).status ?? 0)) throw error;
    response = await requestCompletion(request, false);
  }
  const choices = response.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return JSON.parse(stripCodeFence(content));
  if (Array.isArray(content)) {
    const text = content
      .map((part) => typeof part === 'object' && part && 'text' in part ? String((part as { text: unknown }).text) : '')
      .join('');
    return JSON.parse(stripCodeFence(text));
  }
  throw new Error('AI 接口没有返回可解析的内容。');
}

async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

async function renderPdfPreview(page: PDFPageProxy): Promise<string | undefined> {
  try {
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 1280 / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return undefined;
    await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise;
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

async function readPdfAttachment(file: File): Promise<AiAttachment> {
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = getDocument({ data: new Uint8Array(await readFileArrayBuffer(file)) });
  const pdf = await loadingTask.promise;
  const pageText: Array<{ page: number; text: string }> = [];
  const previews: string[] = [];
  try {
    const textLimitPages = Math.min(pdf.numPages, 48);
    for (let pageNumber = 1; pageNumber <= textLimitPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      pageText.push({ page: pageNumber, text: pdfTextItemsToPlainText(content.items as PdfTextItemLike[]) });
      page.cleanup();
      if (pageText.reduce((total, item) => total + item.text.length, 0) > 135_000) break;
    }
    const candidatePages = pageText
      .filter((entry) => /figure\s*[0-3]|architecture|overview|method|pipeline|framework|系统|架构|方法|流程|框架/i.test(entry.text))
      .map((entry) => entry.page);
    const previewPages = [...new Set([...candidatePages, 1, 2, 3])].slice(0, 3);
    for (const pageNumber of previewPages) {
      if (pageNumber > pdf.numPages) continue;
      const page = await pdf.getPage(pageNumber);
      const preview = await renderPdfPreview(page);
      if (preview) previews.push(preview);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  const truncated = pageText.at(-1)?.page !== pdf.numPages;
  const content = [
    `PDF: ${file.name}`,
    `Pages: ${pdf.numPages}${truncated ? ' (text extraction truncated by the local context limit)' : ''}`,
    ...pageText.map((entry) => `\n[Page ${entry.page}]\n${entry.text}`),
  ].join('\n').slice(0, 120_000);
  return {
    name: file.name,
    mimeType: 'application/pdf',
    content,
    kind: 'pdf',
    preview: previews[0],
    previews,
    pageCount: pdf.numPages,
  };
}

export async function readAiAttachment(file: File): Promise<AiAttachment> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return readPdfAttachment(file);
  }
  if (file.type.startsWith('image/')) {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
      reader.readAsDataURL(file);
    });
    return { name: file.name, mimeType: file.type, content, kind: 'image' };
  }
  const content = typeof file.text === 'function'
    ? await file.text()
    : await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('无法读取 ' + file.name));
        reader.readAsText(file);
      });
  return { name: file.name, mimeType: file.type || 'text/plain', content: content.slice(0, 120_000), kind: 'text' };
}
