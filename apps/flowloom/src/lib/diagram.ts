import dagre from '@dagrejs/dagre';
import { MarkerType, type XYPosition } from '@xyflow/react';
import type {
  ArrowHead,
  EdgeRouting,
  FlowEdge,
  FlowEdgeData,
  FlowNode,
  FlowNodeData,
  DiagramLayer,
  DiagramPage,
  ShapeKind,
} from '../types';
import { SHAPE_KINDS } from '../types';
import { createId } from './id';
import { getShapeDefinition, isShapeKind } from './shapeRegistry';

export const DEFAULT_LAYER_ID = 'layer-default';

export function estimateSvgTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const character of Array.from(text)) {
    if (/\p{Mark}/u.test(character)) continue;
    if (/\s/u.test(character)) units += 0.33;
    else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(character)) units += 1;
    else if (/[ilIjtfr1'`.,:;!|]/u.test(character)) units += 0.3;
    else if (/[MW@%&QO]/u.test(character)) units += 0.82;
    else if (/[A-Z]/u.test(character)) units += 0.64;
    else if (/[0-9]/u.test(character)) units += 0.56;
    else if (/[a-z]/u.test(character)) units += 0.52;
    else units += 0.62;
  }
  return Math.max(fontSize * 0.5, units * fontSize);
}

export function createDefaultLayer(): DiagramLayer {
  return { id: DEFAULT_LAYER_ID, name: '默认图层', visible: true, locked: false };
}

export function createDiagramPage(name = '页面 1', overrides: Partial<DiagramPage> = {}): DiagramPage {
  return {
    id: createId('page'),
    name,
    nodes: [],
    edges: [],
    layers: [createDefaultLayer()],
    ...overrides,
  };
}

export const SHAPE_DIMENSIONS = Object.fromEntries(
  SHAPE_KINDS.map((kind) => {
    const definition = getShapeDefinition(kind);
    return [kind, { width: definition.width, height: definition.height }];
  }),
) as Record<ShapeKind, { width: number; height: number }>;

export const SHAPE_LABELS = Object.fromEntries(
  SHAPE_KINDS.map((kind) => [kind, getShapeDefinition(kind).label]),
) as Record<ShapeKind, string>;

function defaultNodeColors(kind: ShapeKind): Pick<FlowNodeData, 'fill' | 'stroke' | 'textColor'> {
  if (kind === 'vector') {
    return { fill: 'transparent', stroke: 'oklch(0.220 0.018 70)', textColor: 'oklch(0.220 0.018 70)' };
  }
  const category = getShapeDefinition(kind).category;
  if (kind === 'start' || kind === 'bpmn-start-event') {
    return { fill: 'oklch(0.935 0.050 172)', stroke: 'oklch(0.430 0.105 172)', textColor: 'oklch(0.240 0.055 172)' };
  }
  if (kind === 'decision' || kind.includes('gateway')) {
    return { fill: 'oklch(0.955 0.045 76)', stroke: 'oklch(0.560 0.155 72)', textColor: 'oklch(0.290 0.055 70)' };
  }
  if (kind === 'document' || kind === 'multiple-documents' || kind === 'bpmn-data-object') {
    return { fill: 'oklch(0.955 0.025 245)', stroke: 'oklch(0.500 0.110 245)', textColor: 'oklch(0.260 0.055 245)' };
  }
  if (kind === 'data' || kind.includes('storage') || kind === 'database') {
    return { fill: 'oklch(0.940 0.036 172)', stroke: 'oklch(0.430 0.105 172)', textColor: 'oklch(0.240 0.055 172)' };
  }
  if (kind === 'manual' || kind === 'manual-operation' || kind === 'bpmn-user-task') {
    return { fill: 'oklch(0.965 0.030 36)', stroke: 'oklch(0.560 0.135 36)', textColor: 'oklch(0.300 0.060 36)' };
  }
  if (kind === 'note' || kind === 'uml-note' || kind === 'annotation') {
    return { fill: 'oklch(0.965 0.065 95)', stroke: 'oklch(0.620 0.115 88)', textColor: 'oklch(0.300 0.050 82)' };
  }
  if (category === 'container' || kind === 'bpmn-pool') {
    return { fill: 'oklch(0.975 0.004 76)', stroke: 'oklch(0.700 0.018 70)', textColor: 'oklch(0.330 0.018 70)' };
  }
  return { fill: 'oklch(1 0 0)', stroke: 'oklch(0.540 0.018 70)', textColor: 'oklch(0.220 0.018 70)' };
}

export const DEFAULT_NODE_COLORS = Object.fromEntries(
  SHAPE_KINDS.map((kind) => [kind, defaultNodeColors(kind)]),
) as Record<ShapeKind, Pick<FlowNodeData, 'fill' | 'stroke' | 'textColor'>>;

export function createNodeData(kind: ShapeKind, label?: string): FlowNodeData {
  const colors = DEFAULT_NODE_COLORS[kind];
  const category = getShapeDefinition(kind).category;
  return {
    label: label ?? SHAPE_LABELS[kind],
    kind,
    ...colors,
    borderWidth: category === 'container' ? 1 : kind === 'bpmn-end-event' ? 2.5 : 1.5,
    radius: kind === 'start' ? 28 : kind === 'rounded-rectangle' || kind.startsWith('bpmn-') || kind === 'uml-state' ? 10 : 0,
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'center',
    verticalAlign: 'middle',
    opacity: 1,
    rotation: 0,
    layerId: DEFAULT_LAYER_ID,
  };
}

export function createFlowNode(
  kind: ShapeKind,
  position: XYPosition,
  label?: string,
  overrides: Partial<FlowNode> = {},
): FlowNode {
  const dimensions = SHAPE_DIMENSIONS[kind];
  return {
    id: createId('node'),
    type: 'flowNode',
    position,
    data: createNodeData(kind, label),
    style: { width: dimensions.width, height: dimensions.height },
    ...overrides,
  };
}

export function createFlowEdge(
  source: string,
  target: string,
  label?: string,
  routing: EdgeRouting = 'smoothstep',
): FlowEdge {
  const color = 'oklch(0.430 0.025 70)';
  const data: FlowEdgeData = {
    label,
    color,
    width: 1.75,
    lineStyle: 'solid',
    routing,
    arrowStart: 'none',
    arrowEnd: 'closed',
  };

  return {
    id: createId('edge'),
    source,
    target,
    type: reactFlowEdgeType(routing),
    label,
    data,
    markerStart: createEdgeMarker(data.arrowStart, color),
    markerEnd: createEdgeMarker(data.arrowEnd, color),
    style: { stroke: color, strokeWidth: data.width },
  };
}

export function sanitizeKind(value: unknown): ShapeKind {
  return isShapeKind(value) ? value : 'process';
}

export function createEdgeMarker(kind: ArrowHead, color: string) {
  if (kind === 'none') return undefined;
  return {
    type: kind === 'closed' ? MarkerType.ArrowClosed : MarkerType.Arrow,
    color,
    width: 18,
    height: 18,
  };
}

export function reactFlowEdgeType(routing: EdgeRouting): 'smoothstep' | 'straight' | 'default' {
  return routing === 'bezier' ? 'default' : routing;
}

export function normalizeEdgeRouting(value: unknown): EdgeRouting {
  if (value === 'straight' || value === 'smoothstep' || value === 'bezier') return value;
  return value === 'default' ? 'bezier' : 'smoothstep';
}

export function normalizeNodes(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node, index) => {
    const kind = sanitizeKind(node.data?.kind);
    const dimensions = SHAPE_DIMENSIONS[kind];
    const data = {
      ...createNodeData(kind, String(node.data?.label ?? SHAPE_LABELS[kind])),
      ...node.data,
      kind,
    };
    return {
      ...node,
      id: String(node.id || createId('node')),
      type: 'flowNode',
      position: node.position ?? { x: (index % 4) * 220, y: Math.floor(index / 4) * 140 },
      data,
      draggable: !data.locked,
      hidden: Boolean(data.hidden),
      style: {
        width: dimensions.width,
        height: dimensions.height,
        ...node.style,
      },
    };
  });
}

export function normalizeEdges(edges: FlowEdge[], nodeIds: Set<string>): FlowEdge[] {
  return edges
    .filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)))
    .map((edge) => {
      const routing = normalizeEdgeRouting(edge.data?.routing ?? edge.type);
      const color = edge.data?.color ?? 'oklch(0.430 0.025 70)';
      const width = edge.data?.width ?? 1.75;
      const arrowStart = edge.data?.arrowStart ?? 'none';
      const arrowEnd = edge.data?.arrowEnd ?? 'closed';
      const scientificSemantic = edge.data?.scientificSemantic;
      return {
        ...edge,
        id: String(edge.id || createId('edge')),
        source: String(edge.source),
        target: String(edge.target),
        type: scientificSemantic ? 'scientific' : reactFlowEdgeType(routing),
        label: edge.data?.label ?? (typeof edge.label === 'string' ? edge.label : undefined),
        data: {
          ...edge.data,
          label: edge.data?.label ?? (typeof edge.label === 'string' ? edge.label : undefined),
          color,
          width,
          lineStyle: edge.data?.lineStyle ?? 'solid',
          routing,
          arrowStart,
          arrowEnd,
          scientificSemantic,
        },
        markerStart: createEdgeMarker(arrowStart, color),
        markerEnd: createEdgeMarker(arrowEnd, color),
        style: {
          ...edge.style,
          stroke: color,
          strokeWidth: width,
          strokeDasharray:
            edge.data?.lineStyle === 'dashed'
              ? '8 6'
              : edge.data?.lineStyle === 'dotted'
                ? '2 5'
                : undefined,
        },
      };
    });
}

export function normalizeGraph(nodes: FlowNode[], edges: FlowEdge[]) {
  const normalizedNodes = normalizeNodes(nodes);
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  return { nodes: normalizedNodes, edges: normalizeEdges(edges, nodeIds) };
}

export function layoutGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, ranksep: 78, nodesep: 44, marginx: 32, marginy: 32 });

  nodes.forEach((node) => {
    const dimensions = SHAPE_DIMENSIONS[node.data.kind];
    const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? dimensions.width);
    const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? dimensions.height);
    graph.setNode(node.id, { width, height });
  });
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  const laidOutNodes = nodes.map((node) => {
    const point = graph.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    if (!point) return node;
    return {
      ...node,
      position: { x: point.x - point.width / 2, y: point.y - point.height / 2 },
    };
  });

  return { nodes: laidOutNodes, edges };
}

export function findOpenNodePosition(nodes: FlowNode[], kind: ShapeKind, center: XYPosition): XYPosition {
  const dimensions = SHAPE_DIMENSIONS[kind];
  const origin = {
    x: center.x - dimensions.width / 2,
    y: center.y - dimensions.height / 2,
  };
  const margin = 20;
  const step = 44;
  const collides = (position: XYPosition) => nodes.some((node) => {
    const nodeDimensions = SHAPE_DIMENSIONS[node.data.kind];
    const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? nodeDimensions.width);
    const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? nodeDimensions.height);
    return position.x < node.position.x + width + margin
      && position.x + dimensions.width + margin > node.position.x
      && position.y < node.position.y + height + margin
      && position.y + dimensions.height + margin > node.position.y;
  });

  if (!collides(origin)) return origin;
  for (let ring = 1; ring <= 8; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) {
      for (const y of [-ring, ring]) {
        const candidate = { x: origin.x + x * step, y: origin.y + y * step };
        if (!collides(candidate)) return candidate;
      }
    }
    for (let y = -ring + 1; y < ring; y += 1) {
      for (const x of [-ring, ring]) {
        const candidate = { x: origin.x + x * step, y: origin.y + y * step };
        if (!collides(candidate)) return candidate;
      }
    }
  }
  return { x: origin.x + step * 9, y: origin.y + step * 9 };
}

interface FlowNodeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function resolvedNodeRects(nodes: FlowNode[]): FlowNodeRect[] {
  const visibleNodes = nodes.filter((node) => !node.hidden && !node.data.hidden);
  const byId = new Map(visibleNodes.map((node) => [node.id, node]));
  const absolutePositions = new Map<string, XYPosition>();
  const absolutePosition = (node: FlowNode, visiting = new Set<string>()): XYPosition => {
    const cached = absolutePositions.get(node.id);
    if (cached) return cached;
    if (!node.parentId || visiting.has(node.id)) {
      absolutePositions.set(node.id, node.position);
      return node.position;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      absolutePositions.set(node.id, node.position);
      return node.position;
    }
    const parentPosition = absolutePosition(parent, new Set(visiting).add(node.id));
    const position = { x: parentPosition.x + node.position.x, y: parentPosition.y + node.position.y };
    absolutePositions.set(node.id, position);
    return position;
  };
  const dimension = (value: unknown, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return visibleNodes.map((node) => {
    const fallback = SHAPE_DIMENSIONS[node.data.kind];
    const position = absolutePosition(node);
    const width = dimension(node.measured?.width ?? node.width ?? node.style?.width, fallback.width);
    const height = dimension(node.measured?.height ?? node.height ?? node.style?.height, fallback.height);
    return {
      left: position.x,
      top: position.y,
      right: position.x + width,
      bottom: position.y + height,
    };
  });
}

export function getFlowNodesBounds(nodes: FlowNode[]): { x: number; y: number; width: number; height: number } {
  const rectangles = resolvedNodeRects(nodes);
  if (rectangles.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const bounds = rectangles.reduce((current, rectangle) => ({
    left: Math.min(current.left, rectangle.left),
    top: Math.min(current.top, rectangle.top),
    right: Math.max(current.right, rectangle.right),
    bottom: Math.max(current.bottom, rectangle.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

export function findOpenGraphPosition(
  nodes: FlowNode[],
  size: { width: number; height: number },
  center: XYPosition,
  margin = 48,
): XYPosition {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const preferred = { x: center.x - width / 2, y: center.y - height / 2 };
  const obstacles = resolvedNodeRects(nodes);
  if (obstacles.length === 0) return preferred;
  const collides = (position: XYPosition) => obstacles.some((obstacle) => (
    position.x < obstacle.right + margin
    && position.x + width + margin > obstacle.left
    && position.y < obstacle.bottom + margin
    && position.y + height + margin > obstacle.top
  ));
  if (!collides(preferred)) return preferred;

  const occupied = getFlowNodesBounds(nodes);
  const candidates = [
    { x: occupied.x + occupied.width + margin, y: preferred.y },
    { x: preferred.x, y: occupied.y + occupied.height + margin },
    { x: occupied.x - width - margin, y: preferred.y },
    { x: preferred.x, y: occupied.y - height - margin },
  ];
  return candidates.sort((left, right) => {
    const leftDistance = (left.x - preferred.x) ** 2 + (left.y - preferred.y) ** 2;
    const rightDistance = (right.x - preferred.x) ** 2 + (right.y - preferred.y) ** 2;
    return leftDistance - rightDistance;
  })[0];
}

export function cloneGraph<T>(value: T): T {
  return structuredClone(value);
}
