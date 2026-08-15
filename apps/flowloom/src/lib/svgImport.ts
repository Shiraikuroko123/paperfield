import { svgPathBbox } from 'svg-path-bbox';
import type { FlowEdge, FlowNode, SvgPrimitiveTag, SvgVectorElement } from '../types';
import { createFlowNode, estimateSvgTextWidth, normalizeGraph } from './diagram';
import { createId } from './id';

type Matrix = [number, number, number, number, number, number];
type Bounds = { x: number; y: number; width: number; height: number };

export interface EditableSvgResult {
  nodes: FlowNode[];
  edges: FlowEdge[];
  warnings: string[];
  unsupportedCount: number;
  sourceBounds: Bounds;
}

const SVG_TAGS = new Set<SvgPrimitiveTag>([
  'rect',
  'ellipse',
  'circle',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
]);

const INHERITED_ATTRIBUTES = [
  'fill',
  'stroke',
  'color',
  'fill-opacity',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'fill-rule',
  'clip-rule',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
] as const;

const UNSUPPORTED_SELECTORS = [
  'foreignObject',
  'filter',
  'mask',
  'pattern',
  'linearGradient',
  'radialGradient',
  'animate',
  'animateTransform',
  'set',
  'script',
  'style',
  'use',
  'symbol',
  'marker',
  'clipPath',
  'video',
  'audio',
] as const;

const DEFINITION_CONTAINERS = new Set(['defs', 'symbol', 'clippath', 'mask', 'marker', 'pattern']);
const GEOMETRY_ATTRIBUTES = new Set([
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'dx', 'dy',
]);

const identity = (): Matrix => [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

function scale(x: number, y = x): Matrix {
  return [x, 0, 0, y, 0, 0];
}

function rotate(degrees: number): Matrix {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [cosine, sine, -sine, cosine, 0, 0];
}

function parseNumbers(value: string): number[] {
  return value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);
}

function parseTransform(value: string | null): Matrix {
  if (!value?.trim()) return identity();
  let result = identity();
  for (const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const name = match[1].toLowerCase();
    const values = parseNumbers(match[2]);
    let next = identity();
    if (name === 'matrix' && values.length >= 6) {
      next = values.slice(0, 6) as Matrix;
    } else if (name === 'translate') {
      next = translate(values[0] ?? 0, values[1] ?? 0);
    } else if (name === 'scale') {
      next = scale(values[0] ?? 1, values[1] ?? values[0] ?? 1);
    } else if (name === 'rotate') {
      const angle = values[0] ?? 0;
      if (values.length >= 3) {
        next = multiply(
          multiply(translate(values[1], values[2]), rotate(angle)),
          translate(-values[1], -values[2]),
        );
      } else {
        next = rotate(angle);
      }
    } else if (name === 'skewx') {
      next = [1, 0, Math.tan((values[0] ?? 0) * Math.PI / 180), 1, 0, 0];
    } else if (name === 'skewy') {
      next = [1, Math.tan((values[0] ?? 0) * Math.PI / 180), 0, 1, 0, 0];
    }
    result = multiply(result, next);
  }
  return result;
}

function point(matrix: Matrix, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function transformedBounds(bounds: Bounds, matrix: Matrix, padding = 0): Bounds {
  const corners = [
    point(matrix, bounds.x - padding, bounds.y - padding),
    point(matrix, bounds.x + bounds.width + padding, bounds.y - padding),
    point(matrix, bounds.x + bounds.width + padding, bounds.y + bounds.height + padding),
    point(matrix, bounds.x - padding, bounds.y + bounds.height + padding),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
}

function numberAttribute(element: Element, name: string, fallback = 0): number {
  const value = Number.parseFloat(element.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function parsePoints(value: string | null): Array<{ x: number; y: number }> {
  const values = parseNumbers(value ?? '');
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }
  return points;
}

function localBounds(element: Element, tag: SvgPrimitiveTag, fontSize: number): Bounds | null {
  if (tag === 'rect') {
    return {
      x: numberAttribute(element, 'x'),
      y: numberAttribute(element, 'y'),
      width: Math.max(0, numberAttribute(element, 'width')),
      height: Math.max(0, numberAttribute(element, 'height')),
    };
  }
  if (tag === 'circle') {
    const radius = Math.max(0, numberAttribute(element, 'r'));
    const cx = numberAttribute(element, 'cx');
    const cy = numberAttribute(element, 'cy');
    return { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 };
  }
  if (tag === 'ellipse') {
    const radiusX = Math.max(0, numberAttribute(element, 'rx'));
    const radiusY = Math.max(0, numberAttribute(element, 'ry'));
    const cx = numberAttribute(element, 'cx');
    const cy = numberAttribute(element, 'cy');
    return { x: cx - radiusX, y: cy - radiusY, width: radiusX * 2, height: radiusY * 2 };
  }
  if (tag === 'line') {
    const x1 = numberAttribute(element, 'x1');
    const y1 = numberAttribute(element, 'y1');
    const x2 = numberAttribute(element, 'x2');
    const y2 = numberAttribute(element, 'y2');
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const points = parsePoints(element.getAttribute('points'));
    if (points.length === 0) return null;
    const xs = points.map((entry) => entry.x);
    const ys = points.map((entry) => entry.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  if (tag === 'path') {
    const path = element.getAttribute('d');
    if (!path?.trim()) return null;
    try {
      const [x1, y1, x2, y2] = svgPathBbox(path);
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    } catch {
      return null;
    }
  }
  const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return null;
  const x = numberAttribute(element, 'x');
  const y = numberAttribute(element, 'y');
  const anchor = resolvedAttribute(element, 'text-anchor', 'start');
  const baseline = resolvedAttribute(element, 'dominant-baseline', 'auto').toLowerCase();
  const width = estimateSvgTextWidth(text, fontSize);
  const adjustedX = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const height = fontSize * 1.25;
  const adjustedY = ['hanging', 'text-before-edge'].includes(baseline)
    ? y
    : ['middle', 'central'].includes(baseline)
      ? y - height / 2
      : y - fontSize;
  return { x: adjustedX, y: adjustedY, width, height };
}

function textAlignValue(anchor: string): FlowNode['data']['textAlign'] {
  return anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
}

function verticalAlignValue(baseline: string): FlowNode['data']['verticalAlign'] {
  if (['hanging', 'text-before-edge'].includes(baseline)) return 'top';
  if (['middle', 'central'].includes(baseline)) return 'middle';
  return 'bottom';
}

function fontWeightValue(value: string): number {
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) return numeric;
  if (value === 'bold' || value === 'bolder') return 700;
  if (value === 'lighter') return 300;
  return 400;
}

function styleDeclarations(element: Element): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const declaration of (element.getAttribute('style') ?? '').split(';')) {
    const separator = declaration.indexOf(':');
    if (separator <= 0) continue;
    declarations.set(declaration.slice(0, separator).trim().toLowerCase(), declaration.slice(separator + 1).trim());
  }
  return declarations;
}

function resolvedAttribute(element: Element | null, name: string, fallback = ''): string {
  let current = element;
  while (current) {
    const direct = current.getAttribute(name);
    if (direct !== null && direct !== 'inherit') return direct;
    const styled = styleDeclarations(current).get(name);
    if (styled && styled !== 'inherit') return styled;
    current = current.parentElement;
  }
  return fallback;
}

function lengthToPixels(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const match = value.trim().match(/^(-?\d*\.?\d+)(px|pt|pc|in|cm|mm)?$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? 'px';
  const factor = unit === 'pt' ? 96 / 72
    : unit === 'pc' ? 16
      : unit === 'in' ? 96
        : unit === 'cm' ? 96 / 2.54
          : unit === 'mm' ? 96 / 25.4
            : 1;
  return amount * factor;
}

function viewportMatrix(svg: Element, isRoot: boolean): Matrix {
  const viewBox = parseNumbers(svg.getAttribute('viewBox') ?? '');
  const fallbackWidth = viewBox.length === 4 ? viewBox[2] : 800;
  const fallbackHeight = viewBox.length === 4 ? viewBox[3] : 600;
  const width = lengthToPixels(svg.getAttribute('width'), fallbackWidth);
  const height = lengthToPixels(svg.getAttribute('height'), fallbackHeight);
  const x = isRoot ? 0 : numberAttribute(svg, 'x');
  const y = isRoot ? 0 : numberAttribute(svg, 'y');
  if (viewBox.length !== 4 || viewBox[2] <= 0 || viewBox[3] <= 0) return translate(x, y);

  const scaleX = width / viewBox[2];
  const scaleY = height / viewBox[3];
  const preserve = svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
  if (/none/i.test(preserve)) {
    return multiply(translate(x, y), multiply(scale(scaleX, scaleY), translate(-viewBox[0], -viewBox[1])));
  }
  const uniform = /slice/i.test(preserve) ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const spareX = width - viewBox[2] * uniform;
  const spareY = height - viewBox[3] * uniform;
  const alignX = /xMax/i.test(preserve) ? spareX : /xMid/i.test(preserve) ? spareX / 2 : 0;
  const alignY = /YMax/i.test(preserve) ? spareY : /YMid/i.test(preserve) ? spareY / 2 : 0;
  return multiply(
    translate(x + alignX, y + alignY),
    multiply(scale(uniform), translate(-viewBox[0], -viewBox[1])),
  );
}

function sourceViewportBounds(root: Element): Bounds {
  const viewBox = parseNumbers(root.getAttribute('viewBox') ?? '');
  const fallbackWidth = viewBox.length === 4 ? viewBox[2] : 800;
  const fallbackHeight = viewBox.length === 4 ? viewBox[3] : 600;
  return {
    x: 0,
    y: 0,
    width: Math.max(1, lengthToPixels(root.getAttribute('width'), fallbackWidth)),
    height: Math.max(1, lengthToPixels(root.getAttribute('height'), fallbackHeight)),
  };
}

function combinedTransform(element: Element, root: Element): Matrix {
  const chain: Element[] = [];
  let current: Element | null = element;
  while (current) {
    chain.unshift(current);
    if (current === root) break;
    current = current.parentElement;
  }
  let matrix = identity();
  for (const item of chain) {
    if (item.localName === 'svg') matrix = multiply(matrix, viewportMatrix(item, item === root));
    matrix = multiply(matrix, parseTransform(item.getAttribute('transform')));
  }
  return matrix;
}

function geometryAttributes(element: Element, tag: SvgPrimitiveTag, matrix: Matrix): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};
  const geometryByTag: Record<SvgPrimitiveTag, readonly string[]> = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
    path: ['d'],
    text: ['x', 'y', 'dx', 'dy'],
  };
  for (const name of geometryByTag[tag]) {
    const value = element.getAttribute(name);
    if (value !== null) attributes[name] = value;
  }
  for (const name of INHERITED_ATTRIBUTES) {
    if (name === 'fill' || name === 'stroke' || name === 'stroke-width' || name === 'color') continue;
    const value = resolvedAttribute(element, name);
    if (value) attributes[name] = value;
  }
  attributes.transform = `matrix(${matrix.map((value) => Number(value.toFixed(6))).join(' ')})`;
  return attributes;
}

function hasUnsupportedContext(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute('filter') || current.hasAttribute('mask') || current.hasAttribute('clip-path')) return true;
    const style = current.getAttribute('style') ?? '';
    if (/(?:filter|mask|clip-path)\s*:/i.test(style)) return true;
    current = current.parentElement;
  }
  return false;
}

function safePaint(value: string, fallback: string): string {
  const normalized = value.trim();
  if (!normalized) return fallback;
  if (/^url\s*\(/i.test(normalized)) return fallback;
  if (normalized === 'currentColor') return fallback;
  return normalized;
}

function resolvedPaint(element: Element, name: 'fill' | 'stroke', fallback: string, color: string): string {
  const value = resolvedAttribute(element, name, fallback).trim();
  if (value === 'currentColor') return color;
  const paintServer = value.match(/^url\s*\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/i);
  if (!paintServer) return safePaint(value, fallback);
  const definition = element.ownerDocument.getElementById(paintServer[1]);
  const stop = definition?.querySelector('stop');
  const stopColor = stop?.getAttribute('stop-color') ?? (stop ? styleDeclarations(stop).get('stop-color') : undefined);
  return stopColor ? safePaint(stopColor, fallback) : fallback;
}

function opacityValue(element: Element): number {
  let opacity = 1;
  let current: Element | null = element;
  while (current) {
    const value = current.getAttribute('opacity') ?? styleDeclarations(current).get('opacity');
    if (value !== null && value !== undefined && value !== '') opacity *= Number(value) || 0;
    current = current.parentElement;
  }
  return Math.max(0, Math.min(1, opacity));
}

function isInsideDefinition(element: Element): boolean {
  let current = element.parentElement;
  while (current) {
    if (DEFINITION_CONTAINERS.has(current.localName.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

function vectorNode(element: Element, tag: SvgPrimitiveTag, root: Element, sourceName: string): FlowNode | null {
  const color = safePaint(resolvedAttribute(element, 'color', '#1f2937'), '#1f2937');
  const fontSize = lengthToPixels(resolvedAttribute(element, 'font-size', '16'), 16);
  const local = localBounds(element, tag, fontSize);
  if (!local || local.width < 0 || local.height < 0) return null;
  const matrix = combinedTransform(element, root);
  const strokeWidth = Math.max(0, lengthToPixels(resolvedAttribute(element, 'stroke-width', '1'), 1));
  const bounds = transformedBounds(local, matrix, strokeWidth / 2);
  const fillDefault = tag === 'line' || tag === 'polyline' ? 'none' : tag === 'text' ? color : '#000000';
  const fill = resolvedPaint(element, 'fill', fillDefault, color);
  const strokeDefault = tag === 'line' || tag === 'polyline' ? color : 'none';
  const stroke = resolvedPaint(element, 'stroke', strokeDefault, color);
  const text = tag === 'text' ? element.textContent?.replace(/\s+/g, ' ').trim() ?? '' : undefined;
  const textAnchor = resolvedAttribute(element, 'text-anchor', 'start').toLowerCase();
  const dominantBaseline = resolvedAttribute(element, 'dominant-baseline', 'auto').toLowerCase();
  const hidden = resolvedAttribute(element, 'display') === 'none'
    || ['hidden', 'collapse'].includes(resolvedAttribute(element, 'visibility'));
  const vector: SvgVectorElement = {
    tag,
    viewBox: [bounds.x, bounds.y, bounds.width, bounds.height],
    attributes: geometryAttributes(element, tag, matrix),
    text,
    sourceElementId: element.getAttribute('id') ?? undefined,
  };
  const label = text || element.getAttribute('aria-label') || element.getAttribute('id') || `${tag} 图元`;
  const node = createFlowNode('vector', { x: bounds.x, y: bounds.y }, label, {
    id: element.getAttribute('id') || createId(`svg-${tag}`),
    style: { width: Math.max(4, bounds.width), height: Math.max(4, bounds.height) },
  });
  node.data = {
    ...node.data,
    fill,
    stroke,
    textColor: tag === 'text' ? fill : color,
    borderWidth: strokeWidth,
    fontSize,
    fontWeight: fontWeightValue(resolvedAttribute(element, 'font-weight', '400').toLowerCase()),
    textAlign: textAlignValue(textAnchor),
    verticalAlign: verticalAlignValue(dominantBaseline),
    opacity: opacityValue(element),
    vector,
    sourceRef: sourceName,
    hidden,
  };
  node.hidden = hidden;
  return node;
}

function uniqueNodeIds(nodes: FlowNode[]): FlowNode[] {
  const ids = new Set<string>();
  return nodes.map((node) => {
    let id = node.id;
    while (ids.has(id)) id = `${node.id}-${ids.size + 1}`;
    ids.add(id);
    return id === node.id ? node : { ...node, id };
  });
}

export function parseEditableSvg(source: string, sourceName: string): EditableSvgResult {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror')) throw new Error('SVG 文件无法解析。');
  const root = document.documentElement;
  if (root.localName !== 'svg') throw new Error('文件不包含有效的 SVG 根元素。');

  const warnings: string[] = [];
  const metadataText = Array.from(document.getElementsByTagName('metadata'))
    .map((element) => element.textContent?.trim() ?? '')
    .find(Boolean);
  if (metadataText) {
    try {
      const metadata = JSON.parse(metadataText) as {
        flowloom?: { version?: unknown; nodes?: unknown; edges?: unknown };
      };
      if (metadata.flowloom?.version === 2
        && Array.isArray(metadata.flowloom.nodes)
        && Array.isArray(metadata.flowloom.edges)) {
        const graph = normalizeGraph(
          metadata.flowloom.nodes as FlowNode[],
          metadata.flowloom.edges as FlowEdge[],
        );
        if (graph.nodes.length > 0) {
          return {
            ...graph,
            warnings: [`已从 Flowloom SVG 元数据恢复 ${graph.nodes.length} 个原生节点和 ${graph.edges.length} 条连接。`],
            unsupportedCount: 0,
            sourceBounds: sourceViewportBounds(root),
          };
        }
      }
    } catch {
      warnings.push('Flowloom SVG 元数据损坏，已回退到基础矢量图元解析。');
    }
  }
  let unsupportedCount = 0;
  for (const selector of UNSUPPORTED_SELECTORS) {
    const count = document.getElementsByTagName(selector).length;
    unsupportedCount += count;
  }
  const unsupportedElements = Array.from(document.getElementsByTagName('*')).filter((element) => (
    hasUnsupportedContext(element)
    || /^url\s*\(/i.test(resolvedAttribute(element, 'fill'))
    || /^url\s*\(/i.test(resolvedAttribute(element, 'stroke'))
    || element.hasAttribute('marker-start')
    || element.hasAttribute('marker-mid')
    || element.hasAttribute('marker-end')
    || Array.from(element.attributes).some((attribute) => GEOMETRY_ATTRIBUTES.has(attribute.name) && attribute.value.includes('%'))
  ));
  unsupportedCount += unsupportedElements.length;

  const nodes = uniqueNodeIds(
    Array.from(document.getElementsByTagName('*')).flatMap((element) => {
      const tag = element.localName as SvgPrimitiveTag;
      if (!SVG_TAGS.has(tag) || isInsideDefinition(element)) return [];
      const node = vectorNode(element, tag, root, sourceName);
      if (!node) {
        unsupportedCount += 1;
        return [];
      }
      return [node];
    }),
  );

  if (nodes.length === 0) {
    warnings.push('SVG 中没有识别出可独立编辑的基础图元。');
  } else {
    warnings.push(`已将 ${nodes.length} 个 SVG 图元转换为可编辑矢量对象。`);
  }
  if (unsupportedCount > 0) {
    warnings.push(`检测到 ${unsupportedCount} 个滤镜、蒙版、渐变、动画、样式表或其他高级特性；已保留隐藏的原图参考层。`);
  }
  return { nodes, edges: [], warnings, unsupportedCount, sourceBounds: sourceViewportBounds(root) };
}
