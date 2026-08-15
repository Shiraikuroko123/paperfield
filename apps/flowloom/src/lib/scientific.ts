import type { TopLevelSpec } from 'vega-lite';
import type {
  FlowEdge,
  FlowNode,
  ScientificAuditIssue,
  ScientificChartType,
  ScientificFieldMap,
  ScientificFigureSpec,
  ScientificProvenance,
  SvgPrimitiveTag,
} from '../types';
import { createFlowNode, estimateSvgTextWidth } from './diagram';
import {
  containsUnsupportedLiteralResult,
  hasCompleteScientificDataContract,
  isResultLikeScientificNode,
} from './scientificEvidence';
import { createId } from './id';
import { getShapeDefinition } from './shapeRegistry';
import { parseEditableSvg } from './svgImport';
import { routeScientificEdge, scientificConnectionPoint, type ScientificRoutePoint } from './scientificRouting';

export const CSS_PIXELS_PER_INCH = 96;
export const MILLIMETERS_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const SCIENTIFIC_UNITS_PER_MM = 10;
export const PUBLICATION_TYPOGRAPHY = {
  figureTitle: 34,
  panelLabel: 32,
  stageTitle: 30,
  moduleLabel: 28,
  annotation: 24,
  edgeLabel: 22,
} as const;
export const SCIENTIFIC_DESCRIPTION_MIN_FONT_SIZE = 8;
export const PUBLICATION_STROKES = {
  primary: 3.6,
  secondary: 2.4,
  frame: 2.8,
} as const;
export const OKABE_ITO_PALETTE = [
  '#0072B2',
  '#E69F00',
  '#009E73',
  '#D55E00',
  '#CC79A7',
  '#56B4E9',
  '#F0E442',
  '#000000',
] as const;

export interface ScientificFigurePreset {
  id: string;
  label: string;
  detail: string;
  widthMm: number;
  heightMm: number;
}

export const SCIENTIFIC_FIGURE_PRESETS: ScientificFigurePreset[] = [
  { id: 'single-column', label: '单栏图', detail: '89 × 70 mm', widthMm: 89, heightMm: 70 },
  { id: 'double-column', label: '双栏图', detail: '180 × 120 mm', widthMm: 180, heightMm: 120 },
  { id: 'square', label: '方形图版', detail: '150 × 150 mm', widthMm: 150, heightMm: 150 },
  { id: 'a4-content', label: 'A4 内容区', detail: '180 × 247 mm', widthMm: 180, heightMm: 247 },
  { id: 'presentation', label: '16:9 图版', detail: '180 × 101.25 mm', widthMm: 180, heightMm: 101.25 },
];

export interface ScientificTable {
  headers: string[];
  rows: Array<Record<string, string | number | null>>;
  numericFields: string[];
  delimiter: ',' | '\t' | ';';
}

export interface ScientificChartOptions {
  title: string;
  sourceName: string;
  sourceData: string;
  chartType: ScientificChartType;
  fields: ScientificFieldMap;
  units: Record<string, string>;
  uncertaintyDefinition: string;
}

export interface EditableScientificChart {
  nodes: FlowNode[];
  warnings: string[];
  width: number;
  height: number;
}

export function mmToPx(value: number): number {
  return value * SCIENTIFIC_UNITS_PER_MM;
}

export function pxToMm(value: number): number {
  return value / SCIENTIFIC_UNITS_PER_MM;
}

export function scientificUnitsToPoints(value: number): number {
  return pxToMm(value) * POINTS_PER_INCH / MILLIMETERS_PER_INCH;
}

export function pointsToScientificUnits(value: number): number {
  return value * MILLIMETERS_PER_INCH / POINTS_PER_INCH * SCIENTIFIC_UNITS_PER_MM;
}

function detectDelimiter(source: string): ScientificTable['delimiter'] {
  const firstRecord = source.split(/\r?\n/, 1)[0] ?? '';
  const candidates: ScientificTable['delimiter'][] = [',', '\t', ';'];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstRecord.split(delimiter).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
}

function parseDelimitedRows(source: string, delimiter: ScientificTable['delimiter']): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      record.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field.trim());
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }
  record.push(field.trim());
  if (record.some((value) => value.length > 0)) records.push(record);
  return records;
}

export function parseScientificTable(source: string): ScientificTable {
  const delimiter = detectDelimiter(source);
  const records = parseDelimitedRows(source.replace(/^\uFEFF/, ''), delimiter);
  if (records.length < 2) throw new Error('数据至少需要一行表头和一行记录。');
  const headers = records[0].map((header, index) => header || `字段 ${index + 1}`);
  if (new Set(headers).size !== headers.length) throw new Error('CSV 表头不能包含重名字段。');
  const rawRows = records.slice(1).map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
  const numericFields = headers.filter((header) => {
    const values = rawRows.map((row) => row[header]).filter((value) => value !== '');
    return values.length > 0 && values.every((value) => Number.isFinite(Number(value)));
  });
  const numeric = new Set(numericFields);
  const rows = rawRows.map((row) => Object.fromEntries(headers.map((header) => {
    const value = row[header];
    if (value === '') return [header, null];
    return [header, numeric.has(header) ? Number(value) : value];
  })));
  return { headers, rows, numericFields, delimiter };
}

function fieldType(table: ScientificTable, field: string, categorical = false): 'quantitative' | 'nominal' {
  return !categorical && table.numericFields.includes(field) ? 'quantitative' : 'nominal';
}

function axisTitle(field: string, units: Record<string, string>): string {
  const unit = units[field]?.trim();
  return unit ? `${field} (${unit})` : field;
}

function tooltipEncoding(table: ScientificTable) {
  return table.headers.map((field) => ({ field, type: fieldType(table, field), title: field }));
}

export function buildScientificChartSpec(table: ScientificTable, options: ScientificChartOptions): Record<string, unknown> {
  const { chartType, fields, units } = options;
  if (!table.headers.includes(fields.x) || !table.headers.includes(fields.y)) throw new Error('请选择有效的 X 和 Y 字段。');
  if (['scatter', 'line', 'errorbar'].includes(chartType) && !table.numericFields.includes(fields.y)) {
    throw new Error('当前图表的 Y 字段必须是数值。');
  }
  if (chartType === 'heatmap' && (!fields.color || !table.numericFields.includes(fields.color))) {
    throw new Error('热图需要选择一个数值颜色字段。');
  }
  if (chartType === 'errorbar' && (!fields.error || !table.numericFields.includes(fields.error))) {
    throw new Error('误差线图需要选择一个数值误差字段。');
  }

  const x = { field: fields.x, type: fieldType(table, fields.x, ['bar', 'boxplot', 'heatmap'].includes(chartType)), title: axisTitle(fields.x, units) };
  const y = { field: fields.y, type: fieldType(table, fields.y, chartType === 'heatmap'), title: axisTitle(fields.y, units) };
  const group = fields.color && chartType !== 'heatmap'
    ? { field: fields.color, type: fieldType(table, fields.color), scale: { range: [...OKABE_ITO_PALETTE] }, title: fields.color }
    : undefined;
  const tooltip = tooltipEncoding(table);
  const shared = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    title: options.title.trim() || undefined,
    width: 760,
    height: 470,
    autosize: { type: 'pad', contains: 'padding' },
    data: { values: table.rows },
    config: {
      background: '#ffffff',
      font: 'Segoe UI, Microsoft YaHei UI, sans-serif',
      range: { category: [...OKABE_ITO_PALETTE] },
      view: { stroke: null },
      axis: {
        domainColor: '#333333',
        domainWidth: PUBLICATION_STROKES.secondary,
        gridColor: '#d8d8d8',
        gridOpacity: 0.55,
        gridWidth: pointsToScientificUnits(0.6),
        labelColor: '#202020',
        labelFontSize: PUBLICATION_TYPOGRAPHY.moduleLabel,
        labelLimit: 260,
        tickColor: '#555555',
        tickSize: 7,
        tickWidth: PUBLICATION_STROKES.secondary,
        titleColor: '#202020',
        titleFontSize: PUBLICATION_TYPOGRAPHY.moduleLabel,
        titleFontWeight: 600,
        titlePadding: 10,
      },
      legend: {
        labelFontSize: PUBLICATION_TYPOGRAPHY.moduleLabel,
        titleFontSize: PUBLICATION_TYPOGRAPHY.moduleLabel,
        symbolStrokeWidth: PUBLICATION_STROKES.primary,
      },
      title: { color: '#181818', fontSize: PUBLICATION_TYPOGRAPHY.figureTitle, fontWeight: 650, offset: 20 },
    },
  };

  if (chartType === 'scatter') {
    return {
      ...shared,
      mark: { type: 'point', filled: true, size: 132, opacity: 0.86, stroke: '#ffffff', strokeWidth: PUBLICATION_STROKES.secondary },
      encoding: {
        x,
        y,
        color: group ?? { value: OKABE_ITO_PALETTE[0] },
        shape: group ? { field: fields.color, type: 'nominal', title: fields.color } : undefined,
        tooltip,
      },
    };
  }
  if (chartType === 'line') {
    return {
      ...shared,
      mark: { type: 'line', point: { filled: true, size: 104 }, strokeWidth: PUBLICATION_STROKES.primary },
      encoding: {
        x,
        y,
        color: group ?? { value: OKABE_ITO_PALETTE[0] },
        strokeDash: group ? { field: fields.color, type: 'nominal', title: fields.color } : undefined,
        shape: group ? { field: fields.color, type: 'nominal', title: fields.color } : undefined,
        tooltip,
      },
    };
  }
  if (chartType === 'bar') {
    return {
      ...shared,
      mark: { type: 'bar', cornerRadiusEnd: 1, opacity: 0.9 },
      encoding: {
        x: { ...x, type: 'nominal', sort: null },
        y: { ...y, type: 'quantitative' },
        color: group ?? { value: OKABE_ITO_PALETTE[0] },
        xOffset: group ? { field: fields.color } : undefined,
        tooltip,
      },
    };
  }
  if (chartType === 'boxplot') {
    return {
      ...shared,
      mark: { type: 'boxplot', extent: 'min-max', median: { color: '#111111' }, size: 38 },
      encoding: {
        x: { ...x, type: 'nominal', sort: null },
        y: { ...y, type: 'quantitative' },
        color: group ?? { field: fields.x, type: 'nominal', scale: { range: [...OKABE_ITO_PALETTE] }, legend: null },
        tooltip,
      },
    };
  }
  if (chartType === 'heatmap') {
    return {
      ...shared,
      mark: { type: 'rect', stroke: '#ffffff', strokeWidth: PUBLICATION_STROKES.secondary },
      encoding: {
        x: { ...x, type: 'ordinal', sort: null },
        y: { ...y, type: 'ordinal', sort: null },
        color: { field: fields.color, type: 'quantitative', scale: { scheme: 'viridis' }, title: axisTitle(fields.color!, units) },
        tooltip,
      },
    };
  }
  return {
    ...shared,
    layer: [
      {
        mark: { type: 'errorbar', ticks: true, color: '#333333' },
        encoding: { x, y, yError: { field: fields.error }, color: group, tooltip },
      },
      {
        mark: { type: 'point', filled: true, size: 118, stroke: '#ffffff', strokeWidth: PUBLICATION_STROKES.secondary },
        encoding: {
          x,
          y,
          color: group ?? { value: OKABE_ITO_PALETTE[0] },
          shape: group ? { field: fields.color, type: 'nominal' } : undefined,
          tooltip,
        },
      },
    ],
  };
}

export async function renderScientificChartSvg(spec: Record<string, unknown>): Promise<string> {
  const [{ compile }, { parse, View }] = await Promise.all([import('vega-lite'), import('vega')]);
  const runtime = compile(spec as unknown as TopLevelSpec).spec;
  const view = new View(parse(runtime), { renderer: 'none' }).initialize();
  try {
    await view.runAsync();
    const svg = await view.toSVG();
    return svg.replace('<svg ', '<svg data-flowloom-scientific-chart="true" ');
  } finally {
    view.finalize();
  }
}

function vectorNode(
  tag: SvgPrimitiveTag,
  bounds: { x: number; y: number; width: number; height: number },
  attributes: Record<string, string | number>,
  label: string,
  patch: Partial<FlowNode['data']>,
  zIndex: number,
): FlowNode {
  const node = createFlowNode('vector', { x: bounds.x, y: bounds.y }, label, {
    style: { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) },
    zIndex,
  });
  node.data = {
    ...node.data,
    fill: 'transparent',
    stroke: 'none',
    borderWidth: 0,
    vector: { tag, viewBox: [bounds.x, bounds.y, bounds.width, bounds.height], attributes, text: tag === 'text' ? label : undefined },
    ...patch,
  };
  return node;
}

export function normalizeScientificFigureSpec(spec: ScientificFigureSpec): ScientificFigureSpec {
  return {
    ...spec,
    widthMm: Math.max(20, Math.min(500, Number(spec.widthMm) || 180)),
    heightMm: Math.max(20, Math.min(500, Number(spec.heightMm) || 120)),
    dpi: Math.max(72, Math.min(1200, Math.round(Number(spec.dpi) || 300))),
    rows: Math.max(1, Math.min(8, Math.round(Number(spec.rows) || 1))),
    columns: Math.max(1, Math.min(8, Math.round(Number(spec.columns) || 1))),
    marginMm: Math.max(0, Math.min(50, Number(spec.marginMm) || 0)),
    gapMm: Math.max(0, Math.min(50, Number(spec.gapMm) || 0)),
    updatedAt: new Date().toISOString(),
  };
}

function panelLabel(index: number, style: ScientificFigureSpec['labelStyle']): string {
  if (style === 'numeric') return String(index + 1);
  let value = index;
  let result = '';
  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return style === 'lowercase' ? result.toLowerCase() : result;
}

export function createScientificFigureLayout(specInput: ScientificFigureSpec): { spec: ScientificFigureSpec; nodes: FlowNode[] } {
  const spec = normalizeScientificFigureSpec(specInput);
  const width = mmToPx(spec.widthMm);
  const height = mmToPx(spec.heightMm);
  const margin = mmToPx(spec.marginMm);
  const gap = mmToPx(spec.gapMm);
  const panelWidth = (width - margin * 2 - gap * (spec.columns - 1)) / spec.columns;
  const panelHeight = (height - margin * 2 - gap * (spec.rows - 1)) / spec.rows;
  if (panelWidth < 12 || panelHeight < 12) throw new Error('边距和面板间距超过了图版可用尺寸。');

  const background = vectorNode(
    'rect',
    { x: 0, y: 0, width, height },
    { x: 0, y: 0, width, height },
    '科研图版背景',
    {
      fill: spec.background,
      stroke: 'none',
      scientificRole: 'figure-background',
      locked: true,
      sourceRef: `${spec.widthMm} × ${spec.heightMm} mm`,
    },
    -10_000,
  );
  const nodes: FlowNode[] = [background];
  for (let row = 0; row < spec.rows; row += 1) {
    for (let column = 0; column < spec.columns; column += 1) {
      const index = row * spec.columns + column;
      const x = margin + column * (panelWidth + gap);
      const y = margin + row * (panelHeight + gap);
      nodes.push(vectorNode(
        'rect',
        { x, y, width: panelWidth, height: panelHeight },
        { x, y, width: panelWidth, height: panelHeight, 'stroke-dasharray': '5 4' },
        `面板 ${panelLabel(index, spec.labelStyle)}`,
        {
          fill: 'transparent',
          stroke: '#8a8a8a',
          borderWidth: 1,
          opacity: 0.7,
          scientificRole: 'panel-guide',
          exportExcluded: true,
          locked: true,
        },
        -9_000,
      ));
      if (spec.panelLabels) {
        const label = panelLabel(index, spec.labelStyle);
        const fontSize = PUBLICATION_TYPOGRAPHY.panelLabel;
        const labelWidth = Math.max(20, label.length * fontSize * 0.72);
        const labelHeight = fontSize * 1.35;
        nodes.push(vectorNode(
          'text',
          { x: x + 4, y: y + 3, width: labelWidth, height: labelHeight },
          {
            x: x + 4,
            y: y + 3 + fontSize,
            'font-family': 'Arial, Helvetica, sans-serif',
            'font-size': fontSize,
            'font-weight': 700,
            'text-anchor': 'start',
          },
          label,
          {
            fill: '#111111',
            textColor: '#111111',
            fontSize,
            fontWeight: 700,
            textAlign: 'left',
            verticalAlign: 'bottom',
            scientificRole: 'panel-label',
          },
          9_000,
        ));
      }
    }
  }
  return { spec, nodes };
}

export function createEditableScientificChart(
  svg: string,
  spec: Record<string, unknown>,
  options: ScientificChartOptions,
): EditableScientificChart {
  const parsed = parseEditableSvg(svg, options.sourceName);
  if (parsed.nodes.length === 0) throw new Error('图表 SVG 中没有可编辑图元。');
  const provenanceId = createId('provenance');
  const groupId = createId('scientific-chart');
  const provenance: ScientificProvenance = {
    id: provenanceId,
    kind: 'data-chart',
    sourceName: options.sourceName,
    sourceFormat: 'CSV',
    sourceData: options.sourceData,
    chartType: options.chartType,
    chartSpec: spec,
    fields: options.fields,
    units: options.units,
    uncertainty: { field: options.fields.error, definition: options.uncertaintyDefinition.trim() || undefined },
    engine: 'Vega-Lite 6 / Vega 6',
    generatedAt: new Date().toISOString(),
  };
  const group = createFlowNode('group', { x: 0, y: 0 }, options.title.trim() || '科研数据图表', {
    id: groupId,
    selected: true,
    style: { width: parsed.sourceBounds.width, height: parsed.sourceBounds.height },
    zIndex: 100,
  });
  group.data = {
    ...group.data,
    fill: 'transparent',
    stroke: 'transparent',
    textColor: 'transparent',
    borderWidth: 0,
    scientificRole: 'chart-root',
    scientificEvidence: 'data-bound',
    scientificDataContract: {
      sourceName: options.sourceName,
      fields: Object.values(options.fields).filter((field): field is string => Boolean(field)),
      units: options.units,
      metricDefinition: options.chartType,
      uncertaintyDefinition: options.uncertaintyDefinition || undefined,
    },
    provenance,
    sourceRef: options.sourceName,
  };
  const children = parsed.nodes.map((node, index) => ({
    ...node,
    selected: false,
    parentId: groupId,
    extent: 'parent' as const,
    expandParent: true,
    position: {
      x: node.position.x - parsed.sourceBounds.x,
      y: node.position.y - parsed.sourceBounds.y,
    },
    zIndex: index + 1,
    data: {
      ...node.data,
      provenanceRef: provenanceId,
      sourceRef: options.sourceName,
    },
  }));
  return {
    nodes: [group, ...children],
    warnings: parsed.warnings,
    width: parsed.sourceBounds.width,
    height: parsed.sourceBounds.height,
  };
}

function numericStyle(value: unknown, fallback: number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function absolutePosition(node: FlowNode, byId: Map<string, FlowNode>): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

interface ScientificAuditBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function auditBox(node: FlowNode, byId: Map<string, FlowNode>): ScientificAuditBox {
  const position = absolutePosition(node, byId);
  return {
    id: node.id,
    x: position.x,
    y: position.y,
    width: numericStyle(node.style?.width, node.measured?.width ?? node.width ?? 1),
    height: numericStyle(node.style?.height, node.measured?.height ?? node.height ?? 1),
  };
}

function parseHexColor(value: string): [number, number, number] | undefined {
  const match = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})(?:[\da-f]{2})?$/i);
  if (!match) return undefined;
  const hex = match[1].length === 3
    ? match[1].split('').map((character) => character.repeat(2)).join('')
    : match[1];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function relativeLuminance(color: [number, number, number]): number {
  const [red, green, blue] = color.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number | undefined {
  const foregroundRgb = parseHexColor(foreground);
  const backgroundRgb = parseHexColor(background);
  if (!foregroundRgb || !backgroundRgb) return undefined;
  const foregroundLuminance = relativeLuminance(foregroundRgb);
  const backgroundLuminance = relativeLuminance(backgroundRgb);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function overlapArea(left: ScientificAuditBox, right: ScientificAuditBox): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function estimatedLineCount(value: string, width: number, fontSize: number): number {
  return value.split(/\r?\n/).reduce((count, line) => {
    const normalized = line.trim().split(/\s+/).filter(Boolean).join(' ');
    return count + Math.max(1, Math.ceil(estimateSvgTextWidth(normalized, fontSize) / Math.max(1, width)));
  }, 0);
}

function phaseHeadingBox(node: FlowNode, byId: Map<string, FlowNode>): ScientificAuditBox {
  const box = auditBox(node, byId);
  const configuredPadding = Number(node.data.scientificTextPaddingX);
  const horizontalPadding = Number.isFinite(configuredPadding) && configuredPadding >= 0 ? configuredPadding : 13;
  const configuredPaddingY = Number(node.data.scientificTextPaddingY);
  const verticalPadding = Number.isFinite(configuredPaddingY) && configuredPaddingY >= 0 ? configuredPaddingY : 8;
  const availableWidth = Math.max(1, box.width - horizontalPadding * 2);
  const lineCount = estimatedLineCount(node.data.label, availableWidth, node.data.fontSize);
  const measuredWidth = Math.max(...node.data.label.split(/\r?\n/).map((line) => (
    estimateSvgTextWidth(line.trim().split(/\s+/).filter(Boolean).join(' '), node.data.fontSize)
  )));
  return {
    id: node.id,
    x: box.x + horizontalPadding - 6,
    y: box.y + verticalPadding - 6,
    width: Math.min(availableWidth, measuredWidth) + 12,
    height: lineCount * node.data.fontSize * 1.2 + 14,
  };
}

function routeSegments(points: ScientificRoutePoint[]): Array<[ScientificRoutePoint, ScientificRoutePoint]> {
  return points.slice(1).map((point, index) => [points[index], point]);
}

function segmentIntersectsBox(
  start: ScientificRoutePoint,
  end: ScientificRoutePoint,
  box: ScientificAuditBox,
  padding = 3,
): boolean {
  const left = box.x + padding;
  const right = box.x + box.width - padding;
  const top = box.y + padding;
  const bottom = box.y + box.height - padding;
  if (left >= right || top >= bottom) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let minimum = 0;
  let maximum = 1;
  const constraints: Array<[number, number]> = [
    [-dx, start.x - left],
    [dx, right - start.x],
    [-dy, start.y - top],
    [dy, bottom - start.y],
  ];
  for (const [direction, distanceToBoundary] of constraints) {
    if (Math.abs(direction) < 1e-9) {
      if (distanceToBoundary < 0) return false;
      continue;
    }
    const ratio = distanceToBoundary / direction;
    if (direction < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return maximum >= 0.01 && minimum <= 0.99;
}

function segmentsCross(
  firstStart: ScientificRoutePoint,
  firstEnd: ScientificRoutePoint,
  secondStart: ScientificRoutePoint,
  secondEnd: ScientificRoutePoint,
): boolean {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const denominator = firstDx * secondDy - firstDy * secondDx;
  if (Math.abs(denominator) < 1e-7) return false;
  const deltaX = secondStart.x - firstStart.x;
  const deltaY = secondStart.y - firstStart.y;
  const firstT = (deltaX * secondDy - deltaY * secondDx) / denominator;
  const secondT = (deltaX * firstDy - deltaY * firstDx) / denominator;
  return firstT > 0.02 && firstT < 0.98 && secondT > 0.02 && secondT < 0.98;
}

function collinearOverlapLength(
  firstStart: ScientificRoutePoint,
  firstEnd: ScientificRoutePoint,
  secondStart: ScientificRoutePoint,
  secondEnd: ScientificRoutePoint,
): number {
  const dx = firstEnd.x - firstStart.x;
  const dy = firstEnd.y - firstStart.y;
  const length = Math.hypot(dx, dy);
  const secondLength = Math.hypot(secondEnd.x - secondStart.x, secondEnd.y - secondStart.y);
  if (length < 0.5 || secondLength < 0.5) return 0;
  const distanceFromLine = (point: ScientificRoutePoint) => (
    Math.abs(dx * (point.y - firstStart.y) - dy * (point.x - firstStart.x)) / length
  );
  if (distanceFromLine(secondStart) > 0.5 || distanceFromLine(secondEnd) > 0.5) return 0;
  const unit = { x: dx / length, y: dy / length };
  const project = (point: ScientificRoutePoint) => (
    (point.x - firstStart.x) * unit.x + (point.y - firstStart.y) * unit.y
  );
  const secondA = project(secondStart);
  const secondB = project(secondEnd);
  return Math.max(0, Math.min(length, Math.max(secondA, secondB)) - Math.max(0, Math.min(secondA, secondB)));
}

function firstDistinctPoint(points: ScientificRoutePoint[], fromEnd = false): ScientificRoutePoint | undefined {
  const values = fromEnd ? [...points].reverse() : points;
  const origin = values[0];
  return values.slice(1).find((point) => Math.hypot(point.x - origin.x, point.y - origin.y) > 0.5);
}

function exitsPortInDeclaredDirection(points: ScientificRoutePoint[], handle: string | null | undefined): boolean {
  const normalized = handle?.toLowerCase();
  if (!normalized || points.length < 2) return true;
  const start = points[0];
  const next = firstDistinctPoint(points);
  if (!next) return true;
  if (normalized === 'left') return next.x <= start.x + 0.5;
  if (normalized === 'right') return next.x >= start.x - 0.5;
  if (normalized === 'top') return next.y <= start.y + 0.5;
  if (normalized === 'bottom') return next.y >= start.y - 0.5;
  return true;
}

function entersPortFromOutside(points: ScientificRoutePoint[], handle: string | null | undefined): boolean {
  const normalized = handle?.toLowerCase();
  if (!normalized || points.length < 2) return true;
  const target = points.at(-1)!;
  const previous = firstDistinctPoint(points, true);
  if (!previous) return true;
  if (normalized === 'left') return previous.x <= target.x + 0.5;
  if (normalized === 'right') return previous.x >= target.x - 0.5;
  if (normalized === 'top') return previous.y <= target.y + 0.5;
  if (normalized === 'bottom') return previous.y >= target.y - 0.5;
  return true;
}

export function auditScientificFigure(
  nodes: FlowNode[],
  spec?: ScientificFigureSpec,
  edges: FlowEdge[] = [],
): ScientificAuditIssue[] {
  const issues: ScientificAuditIssue[] = [];
  if (!spec) {
    issues.push({
      id: 'missing-figure-spec',
      severity: 'warning',
      category: 'layout',
      title: '尚未设置物理图版尺寸',
      detail: '设置宽高和目标 DPI 后，才能计算输出像素、越界对象与有效字号。',
    });
  }
  const visibleNodes = nodes.filter((node) => !node.hidden && !node.data.hidden && !node.data.exportExcluded);
  const byId = new Map(visibleNodes.map((node) => [node.id, node]));
  const contentNodes = visibleNodes.filter((node) => node.data.scientificRole !== 'figure-background');
  const criticalText = contentNodes.filter((node) => {
    if (!node.data.label.trim()) return false;
    const labelPoints = scientificUnitsToPoints(node.data.fontSize);
    const descriptionPoints = node.data.description
      ? scientificUnitsToPoints(Math.max(SCIENTIFIC_DESCRIPTION_MIN_FONT_SIZE, node.data.fontSize * 0.86))
      : Number.POSITIVE_INFINITY;
    const labelMinimum = node.data.schematicRole === 'annotation' ? 6 : 7;
    return labelPoints < labelMinimum || descriptionPoints < 6;
  });
  if (criticalText.length) {
    issues.push({
      id: 'text-below-publication-minimum',
      severity: 'error',
      category: 'typography',
      title: `${criticalText.length} 个文字对象低于出版字号门槛`,
      detail: '正文不得低于 7 pt，次要注释不得低于 6 pt。请增大字号、精简内容或改用更宽的图版。',
      nodeIds: criticalText.map((node) => node.id),
    });
  }
  const smallText = contentNodes.filter((node) => (
    node.data.label.trim()
    && !criticalText.includes(node)
    && node.data.schematicRole === 'annotation'
    && scientificUnitsToPoints(node.data.fontSize) < 7
  ));
  if (smallText.length) {
    issues.push({
      id: 'small-text',
      severity: 'warning',
      category: 'typography',
      title: `${smallText.length} 个文字对象介于 6-7 pt`,
      detail: '达到最低可读线但低于正文目标；建议用于次要注释，不要承载主要方法信息。',
      nodeIds: smallText.map((node) => node.id),
    });
  }
  const strokedNodes = contentNodes.filter((node) => !['none', 'transparent'].includes(node.data.stroke));
  const criticalStroke = strokedNodes.filter((node) => scientificUnitsToPoints(node.data.borderWidth) < 0.6);
  if (criticalStroke.length) {
    issues.push({
      id: 'stroke-below-0.6pt',
      severity: 'error',
      category: 'stroke',
      title: `${criticalStroke.length} 个对象线宽小于 0.6 pt`,
      detail: '线条可能在缩印、PDF 栅格化或印刷中消失，已阻止科研图版导出。',
      nodeIds: criticalStroke.map((node) => node.id),
    });
  }
  const thinStroke = strokedNodes.filter((node) => (
    !criticalStroke.includes(node) && scientificUnitsToPoints(node.data.borderWidth) < 0.8
  ));
  if (thinStroke.length) issues.push({
    id: 'thin-stroke',
    severity: 'warning',
    category: 'stroke',
    title: `${thinStroke.length} 个对象线宽介于 0.6-0.8 pt`,
    detail: '满足最低线宽但低于主轮廓目标，建议仅用于辅助边界。',
    nodeIds: thinStroke.map((node) => node.id),
  });

  const visibleEdges = edges.filter((edge) => !edge.hidden);
  const invalidEdges = visibleEdges.filter((edge) => !byId.has(edge.source) || !byId.has(edge.target));
  if (invalidEdges.length) issues.push({
    id: 'invalid-edge-endpoint',
    severity: 'error',
    category: 'layout',
    title: `${invalidEdges.length} 条连接线缺少有效端点`,
    detail: '连接线指向已删除、隐藏或不可导出的对象，无法保证导出后的语义完整性。',
    edgeIds: invalidEdges.map((edge) => edge.id),
  });

  const connectedEdges = visibleEdges.filter((edge) => byId.has(edge.source) && byId.has(edge.target));
  const criticalEdgeStroke = connectedEdges.filter((edge) => scientificUnitsToPoints(edge.data?.width ?? 1.75) < 0.6);
  if (criticalEdgeStroke.length) issues.push({
    id: 'edge-stroke-below-0.6pt',
    severity: 'error',
    category: 'stroke',
    title: `${criticalEdgeStroke.length} 条连接线小于 0.6 pt`,
    detail: '连接线可能在缩印、灰度打印或 PDF 栅格化后消失，已阻止科研图版导出。',
    edgeIds: criticalEdgeStroke.map((edge) => edge.id),
  });
  const thinEdges = connectedEdges.filter((edge) => (
    !criticalEdgeStroke.includes(edge)
    && scientificUnitsToPoints(edge.data?.width ?? 1.75) < 0.8
  ));
  if (thinEdges.length) issues.push({
    id: 'thin-edge-stroke',
    severity: 'warning',
    category: 'stroke',
    title: `${thinEdges.length} 条连接线介于 0.6-0.8 pt`,
    detail: '这些线仅适合作为次要、可选或监督路径；主数据流和控制流应达到 0.8 pt。',
    edgeIds: thinEdges.map((edge) => edge.id),
  });

  const edgeRoutes = connectedEdges.map((edge) => {
    const sourceBox = auditBox(byId.get(edge.source)!, byId);
    const targetBox = auditBox(byId.get(edge.target)!, byId);
    const source = scientificConnectionPoint(sourceBox, edge.sourceHandle, targetBox);
    const target = scientificConnectionPoint(targetBox, edge.targetHandle, sourceBox);
    return { edge, route: routeScientificEdge(edge, source, target) };
  });
  const phaseNodes = contentNodes.filter((node) => node.data.schematicRole === 'phase' && node.data.label.trim());
  const phaseCollisionNodeIds = new Set<string>();
  const phaseCollisionEdgeIds = new Set<string>();
  for (const phase of phaseNodes) {
    const heading = phaseHeadingBox(phase, byId);
    for (const node of contentNodes) {
      if (node.id === phase.id || ['frame', 'phase'].includes(node.data.schematicRole ?? '')) continue;
      if (overlapArea(heading, auditBox(node, byId)) > 4) {
        phaseCollisionNodeIds.add(phase.id);
        phaseCollisionNodeIds.add(node.id);
      }
    }
    for (const { edge, route } of edgeRoutes) {
      if (routeSegments(route.points).some(([start, end]) => segmentIntersectsBox(start, end, heading, 0))) {
        phaseCollisionNodeIds.add(phase.id);
        phaseCollisionEdgeIds.add(edge.id);
      }
    }
  }
  if (phaseCollisionNodeIds.size) issues.push({
    id: 'phase-heading-collision',
    severity: 'error',
    category: 'layout',
    title: `${phaseCollisionNodeIds.size} 个对象或阶段标题发生碰撞`,
    detail: '阶段标题必须拥有独立安全区；节点和连接线不得穿过标题文字。请缩短标题、下移内容或调整跨阶段路由。',
    nodeIds: [...phaseCollisionNodeIds],
    edgeIds: [...phaseCollisionEdgeIds],
  });
  const invalidPortEdges = edgeRoutes.filter(({ edge, route }) => (
    !exitsPortInDeclaredDirection(route.points, edge.sourceHandle)
    || !entersPortFromOutside(route.points, edge.targetHandle)
  ));
  if (invalidPortEdges.length) issues.push({
    id: 'edge-port-direction',
    severity: 'error',
    category: 'layout',
    title: `${invalidPortEdges.length} 条连接线从错误方向进出端口`,
    detail: '连线必须沿声明端口的外侧进入或离开；从图形内部折返会遮挡内容并误导端口归属。',
    edgeIds: invalidPortEdges.map(({ edge }) => edge.id),
  });

  const collinearEdgeIds = new Set<string>();
  for (let leftIndex = 0; leftIndex < edgeRoutes.length; leftIndex += 1) {
    const left = edgeRoutes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < edgeRoutes.length; rightIndex += 1) {
      const right = edgeRoutes[rightIndex];
      const overlap = routeSegments(left.route.points).some(([leftStart, leftEnd]) => (
        routeSegments(right.route.points).some(([rightStart, rightEnd]) => (
          collinearOverlapLength(leftStart, leftEnd, rightStart, rightEnd) > 12
        ))
      ));
      if (overlap) {
        collinearEdgeIds.add(left.edge.id);
        collinearEdgeIds.add(right.edge.id);
      }
    }
  }
  if (collinearEdgeIds.size) issues.push({
    id: 'edge-collinear-overlap',
    severity: 'error',
    category: 'layout',
    title: `${collinearEdgeIds.size} 条连接线存在长距离共线重叠`,
    detail: '不同科学关系不能覆盖在同一线段上；请使用显式汇流点、总线或从端口立即分离的路径。',
    edgeIds: [...collinearEdgeIds],
  });
  const obstacleNodes = contentNodes.filter((node) => (
    !['frame', 'phase'].includes(node.data.schematicRole ?? '')
    && node.data.scientificRole !== 'panel-guide'
  ));
  const throughEdgeIds = new Set<string>();
  const throughNodeIds = new Set<string>();
  for (const { edge, route } of edgeRoutes) {
    for (const node of obstacleNodes) {
      if (node.id === edge.source || node.id === edge.target) continue;
      const box = auditBox(node, byId);
      if (routeSegments(route.points).some(([start, end]) => segmentIntersectsBox(start, end, box))) {
        throughEdgeIds.add(edge.id);
        throughNodeIds.add(node.id);
      }
    }
  }
  if (throughEdgeIds.size) issues.push({
    id: 'edge-through-node',
    severity: 'error',
    category: 'layout',
    title: `${throughEdgeIds.size} 条连接线穿过前景对象`,
    detail: '连线与非端点模块相交，会造成端口归属和阅读顺序歧义；请改用外围路由、汇流点或重新分区。',
    nodeIds: [...throughNodeIds],
    edgeIds: [...throughEdgeIds],
  });

  const crossingEdgeIds = new Set<string>();
  for (let leftIndex = 0; leftIndex < edgeRoutes.length; leftIndex += 1) {
    const left = edgeRoutes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < edgeRoutes.length; rightIndex += 1) {
      const right = edgeRoutes[rightIndex];
      if ([right.edge.source, right.edge.target].includes(left.edge.source)
        || [right.edge.source, right.edge.target].includes(left.edge.target)) continue;
      const crosses = routeSegments(left.route.points).some(([leftStart, leftEnd]) => (
        routeSegments(right.route.points).some(([rightStart, rightEnd]) => (
          segmentsCross(leftStart, leftEnd, rightStart, rightEnd)
        ))
      ));
      if (crosses) {
        crossingEdgeIds.add(left.edge.id);
        crossingEdgeIds.add(right.edge.id);
      }
    }
  }
  if (crossingEdgeIds.size) issues.push({
    id: 'edge-crossings',
    severity: 'warning',
    category: 'layout',
    title: `${crossingEdgeIds.size} 条连接线存在非必要交叉`,
    detail: '交叉不会阻止导出，但建议通过共享汇流点、端口调整或阶段重排消除。',
    edgeIds: [...crossingEdgeIds],
  });

  const lowTextContrast = contentNodes.filter((node) => {
    if (!node.data.label.trim() || ['transparent', 'none'].includes(node.data.textColor)) return false;
    const background = ['transparent', 'none'].includes(node.data.fill) ? '#ffffff' : node.data.fill;
    const ratio = contrastRatio(node.data.textColor, background);
    return ratio !== undefined && ratio < 4.5;
  });
  if (lowTextContrast.length) issues.push({
    id: 'low-text-contrast',
    severity: 'error',
    category: 'color',
    title: `${lowTextContrast.length} 个对象的文字对比度低于 4.5:1`,
    detail: '文字与填充色的对比不足，彩色屏幕、灰度打印和低视力阅读均可能失真。',
    nodeIds: lowTextContrast.map((node) => node.id),
  });

  const lowBoundaryContrast = contentNodes.filter((node) => {
    if (['frame', 'phase'].includes(node.data.schematicRole ?? '')) return false;
    if (['transparent', 'none'].includes(node.data.stroke) || ['transparent', 'none'].includes(node.data.fill)) return false;
    const ratio = contrastRatio(node.data.stroke, node.data.fill);
    return ratio !== undefined && ratio < 3;
  });
  if (lowBoundaryContrast.length) issues.push({
    id: 'low-boundary-contrast',
    severity: 'warning',
    category: 'color',
    title: `${lowBoundaryContrast.length} 个图形边界对比度低于 3:1`,
    detail: '非文字边界在投影、灰度或色觉缺陷条件下可能不够清晰。',
    nodeIds: lowBoundaryContrast.map((node) => node.id),
  });

  const textOverflow = contentNodes.filter((node) => {
    if (!node.data.label.trim() || node.data.kind === 'vector' || node.data.kind === 'image') return false;
    const box = auditBox(node, byId);
    const definition = getShapeDefinition(node.data.kind);
    const configuredPadding = Number(node.data.scientificTextPaddingX);
    const horizontalPadding = Number.isFinite(configuredPadding) && configuredPadding >= 0 ? configuredPadding : 10;
    const width = Math.max(1, definition.textPlacement === 'lane'
      ? box.width * 0.13
      : box.width - horizontalPadding * 2);
    const rawLabelLines = estimatedLineCount(node.data.label, width, node.data.fontSize);
    const labelLines = Math.min(2, rawLabelLines);
    const descriptionFontSize = Math.max(SCIENTIFIC_DESCRIPTION_MIN_FONT_SIZE, node.data.fontSize * 0.86);
    const rawDescriptionLines = node.data.description
      ? estimatedLineCount(node.data.description, width, descriptionFontSize)
      : 0;
    const descriptionLines = Math.min(2, rawDescriptionLines);
    const labelHeight = node.data.fontSize * 1.1
      + Math.max(0, labelLines - 1) * node.data.fontSize * 1.18;
    const descriptionHeight = descriptionLines
      ? descriptionFontSize * 1.1
        + Math.max(0, descriptionLines - 1) * descriptionFontSize * 1.18
      : 0;
    const requiredHeight = labelHeight
      + descriptionHeight
      + (descriptionLines ? Math.max(3, node.data.fontSize * 0.16) : 0);
    const impossibleWidth = estimateSvgTextWidth(node.data.label.replace(/\s+/g, ''), node.data.fontSize) > width * 3.2;
    return impossibleWidth || rawLabelLines > 2 || rawDescriptionLines > 2 || requiredHeight > box.height;
  });
  if (textOverflow.length) issues.push({
    id: 'text-overflow',
    severity: 'error',
    category: 'typography',
    title: `${textOverflow.length} 个对象无法容纳当前文字`,
    detail: '标签或注释会被裁切或与相邻内容碰撞。请增大对象、缩短文字或改用更宽的布局。',
    nodeIds: textOverflow.map((node) => node.id),
  });

  const overlapCandidates = contentNodes.filter((node) => (
    !node.parentId
    && !['frame', 'phase'].includes(node.data.schematicRole ?? '')
    && node.data.scientificRole !== 'panel-guide'
  ));
  const overlapIds = new Set<string>();
  for (let leftIndex = 0; leftIndex < overlapCandidates.length; leftIndex += 1) {
    const left = auditBox(overlapCandidates[leftIndex], byId);
    for (let rightIndex = leftIndex + 1; rightIndex < overlapCandidates.length; rightIndex += 1) {
      const right = auditBox(overlapCandidates[rightIndex], byId);
      const intersection = overlapArea(left, right);
      const threshold = Math.max(36, Math.min(left.width * left.height, right.width * right.height) * 0.04);
      if (intersection > threshold) {
        overlapIds.add(left.id);
        overlapIds.add(right.id);
      }
    }
  }
  if (overlapIds.size) issues.push({
    id: 'object-overlap',
    severity: 'error',
    category: 'layout',
    title: `${overlapIds.size} 个前景对象发生实质重叠`,
    detail: '前景对象的边界相交，可能造成遮挡或标签碰撞。阶段背景和分组框不计入此规则。',
    nodeIds: [...overlapIds],
  });
  const translucent = contentNodes.filter((node) => node.data.opacity < 1);
  if (translucent.length) {
    issues.push({
      id: 'transparency',
      severity: 'info',
      category: 'color',
      title: `${translucent.length} 个对象使用透明度`,
      detail: '部分出版流程会改变透明混合结果；导出后应在目标 PDF 查看器中复核。',
      nodeIds: translucent.map((node) => node.id),
    });
  }
  const raster = contentNodes.filter((node) => node.data.kind === 'image');
  const rasterWithoutDimensions = raster.filter((node) => (
    !Number.isFinite(Number(node.data.rasterWidthPx))
    || !Number.isFinite(Number(node.data.rasterHeightPx))
    || Number(node.data.rasterWidthPx) <= 0
    || Number(node.data.rasterHeightPx) <= 0
  ));
  if (rasterWithoutDimensions.length) {
    issues.push({
      id: 'raster-resolution',
      severity: 'error',
      category: 'raster',
      title: `${rasterWithoutDimensions.length} 个位图对象缺少原始像素尺寸`,
      detail: '当前文件未记录全部原始像素尺寸，无法证明有效 DPI，已阻止科研图版导出。',
      nodeIds: rasterWithoutDimensions.map((node) => node.id),
    });
  }
  if (spec) {
    const lowResolutionRaster = raster.filter((node) => {
      if (rasterWithoutDimensions.includes(node)) return false;
      const width = Number(node.style?.width ?? node.measured?.width ?? node.width ?? 1);
      const height = Number(node.style?.height ?? node.measured?.height ?? node.height ?? 1);
      const effectiveDpiX = Number(node.data.rasterWidthPx) * 96 / Math.max(1, width);
      const effectiveDpiY = Number(node.data.rasterHeightPx) * 96 / Math.max(1, height);
      return Math.min(effectiveDpiX, effectiveDpiY) + 0.5 < spec.dpi;
    });
    if (lowResolutionRaster.length) issues.push({
      id: 'raster-effective-dpi',
      severity: 'error',
      category: 'raster',
      title: `${lowResolutionRaster.length} 个位图对象低于目标 ${spec.dpi} DPI`,
      detail: '请缩小图片的物理尺寸或替换为更高分辨率素材；有效 DPI 按原始像素和当前图版尺寸计算。',
      nodeIds: lowResolutionRaster.map((node) => node.id),
    });
  }
  const unclassifiedRaster = raster.filter((node) => !node.data.scientificAssetState);
  if (unclassifiedRaster.length) issues.push({
    id: 'raster-asset-state',
    severity: 'warning',
    category: 'data',
    title: `${unclassifiedRaster.length} 个位图对象未声明资产状态`,
    detail: '论文图片应标明为合成占位、用户素材或测量证据，避免示意场景被误读为实验观测。',
    nodeIds: unclassifiedRaster.map((node) => node.id),
  });
  const resultLikeNodes = contentNodes.filter((node) => isResultLikeScientificNode(node.data));
  const unclassifiedResults = resultLikeNodes.filter((node) => !node.data.scientificEvidence);
  if (unclassifiedResults.length) issues.push({
    id: 'unclassified-scientific-evidence',
    severity: 'error',
    category: 'data',
    title: `${unclassifiedResults.length} 个结果型图元未声明证据状态`,
    detail: '结果型图元必须明确标记为 schematic 或 data-bound，避免装饰性曲线被误读为实验结果。',
    nodeIds: unclassifiedResults.map((node) => node.id),
  });
  const literalSchematicResults = resultLikeNodes.filter((node) => (
    node.data.scientificEvidence === 'schematic' && containsUnsupportedLiteralResult(node.data)
  ));
  if (literalSchematicResults.length) issues.push({
    id: 'schematic-literal-result',
    severity: 'error',
    category: 'data',
    title: `${literalSchematicResults.length} 个示意图元包含无来源数值`,
    detail: '示意状态只能使用符号变量或方法契约；绑定原始数据、单位和统计定义后才能显示数值。',
    nodeIds: literalSchematicResults.map((node) => node.id),
  });
  const incompleteBoundResults = resultLikeNodes.filter((node) => (
    node.data.scientificEvidence === 'data-bound' && !hasCompleteScientificDataContract(node.data)
  ));
  if (incompleteBoundResults.length) issues.push({
    id: 'incomplete-data-contract',
    severity: 'error',
    category: 'data',
    title: `${incompleteBoundResults.length} 个数据绑定图元缺少完整契约`,
    detail: '数据绑定结果必须保留原始数据、字段映射、单位、指标定义以及适用的不确定性定义。',
    nodeIds: incompleteBoundResults.map((node) => node.id),
  });
  const charts = nodes.filter((node) => node.data.scientificRole === 'chart-root');
  const missingSource = charts.filter((node) => !node.data.provenance?.sourceData);
  if (missingSource.length) {
    issues.push({
      id: 'missing-source-data',
      severity: 'error',
      category: 'data',
      title: `${missingSource.length} 个图表缺少原始数据`,
      detail: '无法从图形追溯到生成数据；请重新从科研图表工作台插入。',
      nodeIds: missingSource.map((node) => node.id),
    });
  }
  const undefinedError = charts.filter((node) => node.data.provenance?.chartType === 'errorbar' && !node.data.provenance.uncertainty?.definition);
  if (undefinedError.length) {
    issues.push({
      id: 'undefined-error',
      severity: 'error',
      category: 'data',
      title: `${undefinedError.length} 个误差线图未定义误差含义`,
      detail: '请说明误差值表示 SD、SEM、置信区间或其他统计量。',
      nodeIds: undefinedError.map((node) => node.id),
    });
  }
  const schematics = nodes.filter((node) => node.data.scientificRole === 'schematic-root');
  const missingSchematicProvenance = schematics.filter((node) => !node.data.provenance?.schematic?.references?.length);
  if (missingSchematicProvenance.length) issues.push({
    id: 'missing-schematic-provenance',
    severity: 'error',
    category: 'data',
    title: `${missingSchematicProvenance.length} 个示意图缺少构图来源`,
    detail: '科研示意图必须保留模板、版式和参考论文元数据，才能追踪其构图依据。',
    nodeIds: missingSchematicProvenance.map((node) => node.id),
  });
  if (charts.length === 0) {
    issues.push({
      id: 'no-provenance-chart',
      severity: 'info',
      category: 'data',
      title: '当前页没有带数据溯源的图表',
      detail: '手工示意图不受影响；数据图建议从科研工作台生成以保留 CSV 和字段映射。',
    });
  }
  if (spec) {
    const width = mmToPx(spec.widthMm);
    const height = mmToPx(spec.heightMm);
    const figureOrigin = visibleNodes.find((node) => node.data.scientificRole === 'figure-background')?.position ?? { x: 0, y: 0 };
    const outside = contentNodes.filter((node) => {
      if (node.parentId) return false;
      const position = absolutePosition(node, byId);
      const nodeWidth = numericStyle(node.style?.width, node.measured?.width ?? 1);
      const nodeHeight = numericStyle(node.style?.height, node.measured?.height ?? 1);
      return position.x < figureOrigin.x - 0.5
        || position.y < figureOrigin.y - 0.5
        || position.x + nodeWidth > figureOrigin.x + width + 0.5
        || position.y + nodeHeight > figureOrigin.y + height + 0.5;
    });
    if (outside.length) {
      issues.push({
        id: 'outside-figure',
        severity: 'error',
        category: 'layout',
        title: `${outside.length} 个顶层对象超出图版`,
        detail: '科研尺寸导出会裁掉图版边界之外的内容。',
        nodeIds: outside.map((node) => node.id),
      });
    }
    const outsideEdgeLabels = edgeRoutes.filter(({ edge, route }) => {
      const label = String(edge.data?.label ?? edge.label ?? '').trim();
      if (!label) return false;
      const fontSize = Number(edge.data?.labelFontSize ?? PUBLICATION_TYPOGRAPHY.edgeLabel);
      const labelWidth = estimateSvgTextWidth(label, fontSize) + 12;
      const baseline = route.label.y - fontSize * 0.35;
      const left = route.label.x - labelWidth / 2;
      const right = route.label.x + labelWidth / 2;
      const top = baseline - fontSize * 0.86 - 3;
      const bottom = baseline + fontSize * 0.24 + 3;
      return left < figureOrigin.x - 0.5
        || top < figureOrigin.y - 0.5
        || right > figureOrigin.x + width + 0.5
        || bottom > figureOrigin.y + height + 0.5;
    });
    if (outsideEdgeLabels.length) {
      issues.push({
        id: 'edge-label-outside-figure',
        severity: 'error',
        category: 'layout',
        title: `${outsideEdgeLabels.length} 个连接标签超出图版`,
        detail: '连接标签会在 SVG、PNG 或 PDF 导出时被裁切；请调整回路方向、标签位置或删去重复标签。',
        edgeIds: outsideEdgeLabels.map(({ edge }) => edge.id),
      });
    }
    const pixelWidth = Math.round(spec.widthMm / MILLIMETERS_PER_INCH * spec.dpi);
    const pixelHeight = Math.round(spec.heightMm / MILLIMETERS_PER_INCH * spec.dpi);
    if (Math.max(pixelWidth, pixelHeight) > 8192) {
      issues.push({
        id: 'large-raster-export',
        severity: 'warning',
        category: 'raster',
        title: `目标位图为 ${pixelWidth} × ${pixelHeight} px`,
        detail: '尺寸可能超过部分浏览器的稳定画布上限；优先导出 SVG，或降低 DPI 后分面导出。',
      });
    }
  }
  return issues;
}
