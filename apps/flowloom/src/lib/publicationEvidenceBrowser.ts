import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import type {
  FlowEdge,
  FlowNode,
  ScientificAuditIssue,
  ScientificFigureSpec,
  ScientificSchematicStyle,
  ScientificSchematicTemplateId,
} from '../types';
import {
  auditScientificFigure,
  createScientificFigureLayout,
  mmToPx,
  scientificUnitsToPoints,
} from './scientific';
import {
  createScientificSchematic,
  defaultScientificSchematicBackbone,
  defaultScientificSchematicTitle,
} from './scientificSchematics';
import {
  preparePublicationSvgForPdf,
  preparePublicationSvgForRaster,
  registerPublicationPdfFonts,
  serializePublicationSvg,
} from './scientificExport';
import { withPngDpiMetadata } from './pngMetadata';

export interface PublicationEvidenceRequest {
  templateId: ScientificSchematicTemplateId;
  style: ScientificSchematicStyle;
  spec: ScientificFigureSpec;
}

export interface PublicationEvidenceArtifact {
  title: string;
  svg: string;
  pdfBase64: string;
  pngBase64: string;
  layout: string;
  nodeCount: number;
  edgeCount: number;
  minimumFontPt: number;
  minimumAnnotationFontPt: number | null;
  minimumStrokePt: number;
  bounds: { x: number; y: number; width: number; height: number };
  audit: ScientificAuditIssue[];
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function numeric(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function centerSchematic(
  nodes: FlowNode[],
  schematicWidth: number,
  schematicHeight: number,
  spec: ScientificFigureSpec,
): { nodes: FlowNode[]; bounds: PublicationEvidenceArtifact['bounds'] } {
  const x = (mmToPx(spec.widthMm) - schematicWidth) / 2;
  const y = (mmToPx(spec.heightMm) - schematicHeight) / 2;
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { x: node.position.x + x, y: node.position.y + y },
    })),
    bounds: { x, y, width: schematicWidth, height: schematicHeight },
  };
}

function minimumFontPoints(nodes: FlowNode[], annotationOnly = false): number | null {
  const values = nodes
    .filter((node) => node.data.label.trim())
    .filter((node) => !annotationOnly || node.data.schematicRole === 'annotation')
    .map((node) => scientificUnitsToPoints(node.data.fontSize))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function minimumStrokePoints(nodes: FlowNode[], edges: FlowEdge[]): number {
  const widths = [
    ...nodes.map((node) => node.data.borderWidth),
    ...edges.map((edge) => numeric(edge.data?.width, 0)),
  ].filter((value) => Number.isFinite(value) && value > 0);
  return widths.length ? scientificUnitsToPoints(Math.min(...widths)) : 0;
}

async function renderPngBase64(svg: string, spec: ScientificFigureSpec): Promise<string> {
  const width = Math.round(spec.widthMm / 25.4 * spec.dpi);
  const height = Math.round(spec.heightMm / 25.4 * spec.dpi);
  const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentNode.querySelector('parsererror')) throw new Error('Publication SVG is invalid XML.');
  await preparePublicationSvgForRaster(documentNode.documentElement as unknown as SVGSVGElement, spec);
  const rasterSvg = new XMLSerializer().serializeToString(documentNode.documentElement);
  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([rasterSvg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Publication SVG could not be rasterized.'));
      image.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const publicationPng = withPngDpiMetadata(canvas.toDataURL('image/png'), spec.dpi);
    return publicationPng.slice(publicationPng.indexOf(',') + 1);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderPdfBase64(svg: string, title: string, spec: ScientificFigureSpec): Promise<string> {
  const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (documentNode.querySelector('parsererror')) throw new Error('Publication SVG is invalid XML.');
  const pdf = new jsPDF({
    orientation: spec.widthMm >= spec.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [spec.widthMm, spec.heightMm],
    putOnlyUsedFonts: true,
  });
  pdf.setProperties({ title, creator: 'Flowloom', subject: 'Publication evidence artifact' });
  await registerPublicationPdfFonts(pdf);
  preparePublicationSvgForPdf(documentNode.documentElement as unknown as SVGSVGElement, spec);
  await pdf.svg(documentNode.documentElement as unknown as SVGElement, {
    x: 0,
    y: 0,
    width: spec.widthMm,
    height: spec.heightMm,
  });
  return encodeBase64(new Uint8Array(pdf.output('arraybuffer')));
}

export async function buildPublicationEvidenceArtifact(
  request: PublicationEvidenceRequest,
): Promise<PublicationEvidenceArtifact> {
  const title = defaultScientificSchematicTitle(request.templateId, 'en');
  const schematic = createScientificSchematic({
    templateId: request.templateId,
    title,
    backbone: defaultScientificSchematicBackbone(request.templateId, 'en'),
    style: request.style,
    density: 'detailed',
    language: 'en',
  }, request.spec);
  const centered = centerSchematic(schematic.nodes, schematic.width, schematic.height, request.spec);
  const figureNodes = createScientificFigureLayout(request.spec).nodes;
  const nodes = [...figureNodes, ...centered.nodes];
  const svg = serializePublicationSvg(title, nodes, schematic.edges, request.spec);

  return {
    title,
    svg,
    pdfBase64: await renderPdfBase64(svg, title, request.spec),
    pngBase64: await renderPngBase64(svg, request.spec),
    layout: schematic.layout,
    nodeCount: schematic.nodes.length,
    edgeCount: schematic.edges.length,
    minimumFontPt: minimumFontPoints(schematic.nodes) ?? 0,
    minimumAnnotationFontPt: minimumFontPoints(schematic.nodes, true),
    minimumStrokePt: minimumStrokePoints(schematic.nodes, schematic.edges),
    bounds: centered.bounds,
    audit: auditScientificFigure(nodes, request.spec, schematic.edges),
  };
}
