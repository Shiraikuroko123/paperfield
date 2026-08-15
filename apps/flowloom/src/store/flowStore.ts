import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  reconnectEdge,
} from '@xyflow/react';
import { create } from 'zustand';
import type {
  DiagramDocument,
  DiagramLayer,
  DiagramPage,
  FlowEdge,
  FlowEdgeData,
  FlowNode,
  FlowNodeData,
  ScientificFigureSpec,
} from '../types';
import {
  cloneGraph,
  createDefaultLayer,
  createDiagramPage,
  createEdgeMarker,
  createFlowEdge,
  createFlowNode,
  DEFAULT_LAYER_ID,
  estimateSvgTextWidth,
  layoutGraph,
  normalizeGraph,
  reactFlowEdgeType,
} from '../lib/diagram';
import { SCIENTIFIC_CONNECTOR_STYLES } from '../lib/scientificRouting';
import { createId } from '../lib/id';
import { getTemplate } from '../data/templates';

interface Snapshot {
  title: string;
  pages: DiagramPage[];
  activePageId: string;
  activeLayerId: string;
}

interface PageGraphSnapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
  layers: DiagramLayer[];
}

type RestorableDocument = DiagramDocument | {
  version?: 1;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

interface FlowState {
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  layers: DiagramLayer[];
  pages: DiagramPage[];
  activePageId: string;
  activeLayerId: string;
  past: Snapshot[];
  future: Snapshot[];
  transactionStart: Snapshot | null;
  dirty: boolean;
  lastSavedAt: number | null;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setTitle: (title: string) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  addNode: (node: FlowNode) => void;
  updateNodeData: (id: string, patch: Partial<FlowNodeData>) => void;
  updateSelectionData: (patch: Partial<FlowNodeData>) => void;
  updateNodeStyle: (id: string, patch: Record<string, string | number>) => void;
  updateNodePosition: (id: string, patch: Partial<FlowNode['position']>) => void;
  arrangeNode: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
  updateEdge: (id: string, patch: Partial<FlowEdgeData>) => void;
  reverseEdge: (id: string) => void;
  reconnect: (edge: FlowEdge, connection: Connection) => void;
  insertGraph: (nodes: FlowNode[], edges: FlowEdge[], offset?: number) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  nudgeSelection: (delta: { x: number; y: number }) => void;
  selectAll: () => void;
  clearSelection: () => void;
  alignSelection: (axis: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;
  distributeSelection: (axis: 'horizontal' | 'vertical') => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  layout: (direction: 'TB' | 'LR') => void;
  loadGraph: (title: string, nodes: FlowNode[], edges: FlowEdge[]) => void;
  loadDocument: (title: string, pages: DiagramPage[], activePageId?: string) => void;
  configureScientificFigure: (spec: ScientificFigureSpec, layoutNodes: FlowNode[]) => void;
  loadTemplate: (id: string) => void;
  restoreDraft: (draft: RestorableDocument) => void;
  newDocument: () => void;
  addPage: () => void;
  duplicatePage: (id?: string) => void;
  deletePage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  switchPage: (id: string) => void;
  addLayer: () => void;
  updateLayer: (id: string, patch: Partial<Omit<DiagramLayer, 'id'>>) => void;
  deleteLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
  moveSelectionToLayer: (id: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
}

const MAX_HISTORY = 100;
const initialTemplate = getTemplate('release-approval');

function normalizeLayers(layers: DiagramLayer[] | undefined): DiagramLayer[] {
  const seen = new Set<string>();
  const normalized = (layers ?? []).flatMap((layer, index) => {
    const id = String(layer.id || `layer-${index + 1}`);
    if (seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: String(layer.name || `图层 ${index + 1}`),
      visible: layer.visible !== false,
      locked: Boolean(layer.locked),
    }];
  });
  return normalized.length ? normalized : [createDefaultLayer()];
}

function normalizePage(page: DiagramPage, index: number): DiagramPage {
  const layers = normalizeLayers(page.layers);
  const layerIds = new Set(layers.map((layer) => layer.id));
  const graph = normalizeGraph(page.nodes ?? [], page.edges ?? []);
  const nodes = graph.nodes.map((node) => {
    const layerId = layerIds.has(node.data.layerId ?? '') ? node.data.layerId : layers[0].id;
    return {
      ...node,
      data: { ...node.data, rotation: Number(node.data.rotation) || 0, layerId },
      hidden: Boolean(node.data.hidden),
    };
  });
  return {
    id: String(page.id || createId('page')),
    name: String(page.name || `页面 ${index + 1}`),
    nodes,
    edges: graph.edges,
    layers,
    scientific: page.scientific,
  };
}

function snapshot(state: Pick<FlowState, 'title' | 'pages' | 'activePageId' | 'activeLayerId' | 'nodes' | 'edges' | 'layers'>): Snapshot {
  const pages = state.pages.map((page) => page.id === state.activePageId ? {
    ...page,
    nodes: state.nodes,
    edges: state.edges,
    layers: state.layers,
  } : page);
  return cloneGraph({
    title: state.title,
    pages,
    activePageId: state.activePageId,
    activeLayerId: state.activeLayerId,
  });
}

function restoreSnapshot(value: Snapshot) {
  const pages = cloneGraph(value.pages);
  const active = pages.find((page) => page.id === value.activePageId) ?? pages[0];
  const activeLayerId = active.layers.some((layer) => layer.id === value.activeLayerId)
    ? value.activeLayerId
    : active.layers[0]?.id ?? DEFAULT_LAYER_ID;
  return {
    title: value.title,
    pages,
    activePageId: active.id,
    activeLayerId,
    nodes: cloneGraph(active.nodes),
    edges: cloneGraph(active.edges),
    layers: cloneGraph(active.layers),
  };
}

function syncPage(
  state: FlowState,
  next: Pick<PageGraphSnapshot, 'nodes' | 'edges'> & { layers?: DiagramLayer[] },
): Pick<FlowState, 'nodes' | 'edges' | 'layers' | 'pages'> {
  const layers = next.layers ?? state.layers;
  const page = { nodes: next.nodes, edges: next.edges, layers };
  return {
    ...page,
    pages: state.pages.map((current) => current.id === state.activePageId ? { ...current, ...page } : current),
  };
}

function withCheckpoint(
  state: FlowState,
  next: Pick<PageGraphSnapshot, 'nodes' | 'edges'> & { layers?: DiagramLayer[] },
): Partial<FlowState> {
  return {
    ...syncPage(state, next),
    past: [...state.past.slice(-(MAX_HISTORY - 1)), snapshot(state)],
    future: [],
    dirty: true,
  };
}

function withDocumentCheckpoint(
  state: FlowState,
  next: Partial<FlowState>,
): Partial<FlowState> {
  return {
    ...next,
    past: [...state.past.slice(-(MAX_HISTORY - 1)), snapshot(state)],
    future: [],
    transactionStart: null,
    dirty: true,
  };
}

function nodeSize(node: FlowNode) {
  const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? 176);
  const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? 72);
  return { width, height };
}

function horizontalAnchorFactor(value: FlowNodeData['textAlign']): number {
  return value === 'center' ? 0.5 : value === 'right' ? 1 : 0;
}

function verticalAnchorFactor(value: FlowNodeData['verticalAlign']): number {
  return value === 'top' ? 0 : value === 'middle' ? 0.5 : 0.8;
}

function resizeVectorTextNode(node: FlowNode, data: FlowNodeData): FlowNode {
  const vector = node.data.vector;
  if (vector?.tag !== 'text') return { ...node, data };

  const oldFontSize = Math.max(1, Number(node.data.fontSize) || 16);
  const nextFontSize = Math.max(1, Number(data.fontSize) || oldFontSize);
  const oldBorder = Math.max(0, Number(node.data.borderWidth) || 0);
  const nextBorder = Math.max(0, Number(data.borderWidth) || 0);
  const oldIntrinsicWidth = estimateSvgTextWidth(node.data.label, oldFontSize) + oldBorder;
  const nextIntrinsicWidth = estimateSvgTextWidth(data.label, nextFontSize) + nextBorder;
  const oldIntrinsicHeight = oldFontSize * 1.25 + oldBorder;
  const nextIntrinsicHeight = nextFontSize * 1.25 + nextBorder;
  const widthRatio = nextIntrinsicWidth / Math.max(1, oldIntrinsicWidth);
  const heightRatio = nextIntrinsicHeight / Math.max(1, oldIntrinsicHeight);
  const currentWidth = Math.max(4, Number(node.style?.width ?? node.width ?? vector.viewBox[2]) || 4);
  const currentHeight = Math.max(4, Number(node.style?.height ?? node.height ?? vector.viewBox[3]) || 4);
  const nextWidth = Math.max(4, currentWidth * widthRatio);
  const nextHeight = Math.max(4, currentHeight * heightRatio);
  const oldHorizontal = horizontalAnchorFactor(node.data.textAlign);
  const nextHorizontal = horizontalAnchorFactor(data.textAlign);
  const oldVertical = verticalAnchorFactor(node.data.verticalAlign);
  const nextVertical = verticalAnchorFactor(data.verticalAlign);
  const viewWidth = Math.max(1, vector.viewBox[2] * widthRatio);
  const viewHeight = Math.max(1, vector.viewBox[3] * heightRatio);
  const anchorX = node.position.x + currentWidth * oldHorizontal;
  const anchorY = node.position.y + currentHeight * oldVertical;
  const viewAnchorX = vector.viewBox[0] + vector.viewBox[2] * oldHorizontal;
  const viewAnchorY = vector.viewBox[1] + vector.viewBox[3] * oldVertical;

  return {
    ...node,
    position: {
      x: anchorX - nextWidth * nextHorizontal,
      y: anchorY - nextHeight * nextVertical,
    },
    style: { ...node.style, width: nextWidth, height: nextHeight },
    data: {
      ...data,
      vector: {
        ...vector,
        viewBox: [
          viewAnchorX - viewWidth * nextHorizontal,
          viewAnchorY - viewHeight * nextVertical,
          viewWidth,
          viewHeight,
        ],
      },
    },
  };
}

function descendantIds(nodes: FlowNode[], roots: Set<string>): Set<string> {
  const result = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}

function preferredLayerId(layers: DiagramLayer[]): string {
  return layers.find((layer) => layer.visible && !layer.locked)?.id
    ?? layers.find((layer) => layer.visible)?.id
    ?? layers[0]?.id
    ?? DEFAULT_LAYER_ID;
}

function editableLayerId(layers: DiagramLayer[], requestedId?: string): string | null {
  const requested = layers.find((layer) => layer.id === requestedId);
  if (requested?.visible && !requested.locked) return requested.id;
  return layers.find((layer) => layer.visible && !layer.locked)?.id ?? null;
}

function isNodeEffectivelyLocked(state: Pick<FlowState, 'layers'>, node: FlowNode): boolean {
  const layerId = node.data.layerId ?? state.layers[0]?.id;
  return Boolean(node.data.locked || state.layers.find((layer) => layer.id === layerId)?.locked);
}

function isControlPatch(patch: Partial<FlowNodeData>): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((key) => key === 'locked' || key === 'hidden');
}

function activePageState(page: DiagramPage) {
  return {
    nodes: cloneGraph(page.nodes),
    edges: cloneGraph(page.edges),
    layers: cloneGraph(page.layers),
    activeLayerId: preferredLayerId(page.layers),
  };
}

const firstPage = normalizePage(createDiagramPage(initialTemplate.name, {
  id: 'page-1',
  nodes: cloneGraph(initialTemplate.nodes),
  edges: cloneGraph(initialTemplate.edges),
}), 0);

export const useFlowStore = create<FlowState>((set, get) => ({
  title: initialTemplate.name,
  nodes: cloneGraph(firstPage.nodes),
  edges: cloneGraph(firstPage.edges),
  layers: cloneGraph(firstPage.layers),
  pages: [cloneGraph(firstPage)],
  activePageId: firstPage.id,
  activeLayerId: firstPage.layers[0].id,
  past: [],
  future: [],
  transactionStart: null,
  dirty: false,
  lastSavedAt: null,

  onNodesChange: (changes) => {
    set((state) => {
      const lockedIds = new Set(state.nodes.filter((node) => isNodeEffectivelyLocked(state, node)).map((node) => node.id));
      const allowedChanges = changes.filter((change) => (
        change.type === 'select'
        || change.type === 'dimensions'
        || change.type === 'add'
        || !lockedIds.has(change.id)
      ));
      const nodes = applyNodeChanges(allowedChanges, state.nodes);
      return {
        ...syncPage(state, { nodes, edges: state.edges }),
        dirty: allowedChanges.some((change) => change.type !== 'select' && change.type !== 'dimensions') || state.dirty,
      };
    });
  },

  onEdgesChange: (changes) => {
    const structural = changes.some((change) => change.type !== 'select');
    set((state) => {
      const edges = applyEdgeChanges(changes, state.edges);
      return structural
        ? withCheckpoint(state, { nodes: state.nodes, edges })
        : syncPage(state, { nodes: state.nodes, edges });
    });
  },

  onConnect: (connection) => {
    set((state) => {
      const edge = createFlowEdge(connection.source, connection.target);
      edge.sourceHandle = connection.sourceHandle;
      edge.targetHandle = connection.targetHandle;
      return withCheckpoint(state, { nodes: state.nodes, edges: addEdge(edge, state.edges) });
    });
  },

  setTitle: (title) => set((state) => state.transactionStart
    ? { title, dirty: true }
    : withDocumentCheckpoint(state, { title })),

  beginTransaction: () => {
    if (!get().transactionStart) set({ transactionStart: snapshot(get()) });
  },

  endTransaction: () => {
    const state = get();
    if (!state.transactionStart) return;
    const changed = JSON.stringify(state.transactionStart) !== JSON.stringify(snapshot(state));
    set({
      transactionStart: null,
      past: changed ? [...state.past.slice(-(MAX_HISTORY - 1)), state.transactionStart] : state.past,
      future: changed ? [] : state.future,
      dirty: changed || state.dirty,
    });
  },

  addNode: (incoming) => {
    set((state) => {
      const layerId = editableLayerId(state.layers, incoming.data.layerId ?? state.activeLayerId);
      if (!layerId) return state;
      const layer = state.layers.find((item) => item.id === layerId);
      const node: FlowNode = {
        ...incoming,
        data: { ...incoming.data, layerId },
        draggable: !incoming.data.locked && !layer?.locked,
      };
      return withCheckpoint(state, {
        nodes: [...state.nodes.map((current) => ({ ...current, selected: false })), { ...node, selected: true }],
        edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      });
    });
  },

  updateNodeData: (id, patch) => {
    set((state) => {
      let changed = false;
      const nodes = state.nodes.map((node) => {
        if (node.id !== id) return node;
        if (isNodeEffectivelyLocked(state, node) && !isControlPatch(patch)) return node;
        if (!Object.entries(patch).some(([key, value]) => node.data[key] !== value)) return node;
        changed = true;
        const data = { ...node.data, ...patch };
        const layer = state.layers.find((item) => item.id === data.layerId);
        const nextNode = node.data.vector?.tag === 'text'
          && ['label', 'fontSize', 'borderWidth', 'textAlign', 'verticalAlign'].some((key) => key in patch)
          ? resizeVectorTextNode(node, data)
          : { ...node, data };
        return {
          ...nextNode,
          hidden: Boolean(data.hidden),
          draggable: !data.locked && !layer?.locked,
        };
      });
      if (!changed) return state;
      if (state.transactionStart) return { ...syncPage(state, { nodes, edges: state.edges }), dirty: true };
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  updateSelectionData: (patch) => {
    set((state) => {
      let changed = false;
      const nodes = state.nodes.map((node) => {
        if (!node.selected || isNodeEffectivelyLocked(state, node)) return node;
        changed = true;
        const data = { ...node.data, ...patch };
        const layer = state.layers.find((item) => item.id === data.layerId);
        return {
          ...node,
          data,
          hidden: Boolean(data.hidden),
          draggable: !data.locked && !layer?.locked,
        };
      });
      if (!changed) return state;
      if (state.transactionStart) return { ...syncPage(state, { nodes, edges: state.edges }), dirty: true };
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  updateNodeStyle: (id, patch) => {
    set((state) => {
      const target = state.nodes.find((node) => node.id === id);
      if (!target || isNodeEffectivelyLocked(state, target)) return state;
      const nodes = state.nodes.map((node) => node.id === id ? { ...node, style: { ...node.style, ...patch } } : node);
      if (state.transactionStart) return { ...syncPage(state, { nodes, edges: state.edges }), dirty: true };
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  updateNodePosition: (id, patch) => {
    set((state) => {
      const target = state.nodes.find((node) => node.id === id);
      if (!target || isNodeEffectivelyLocked(state, target)) return state;
      const nodes = state.nodes.map((node) => node.id === id ? { ...node, position: { ...node.position, ...patch } } : node);
      if (state.transactionStart) return { ...syncPage(state, { nodes, edges: state.edges }), dirty: true };
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  arrangeNode: (id, direction) => {
    set((state) => {
      const target = state.nodes.find((node) => node.id === id);
      if (!target || isNodeEffectivelyLocked(state, target)) return state;
      const peers = state.nodes.filter((node) => node.data.layerId === target.data.layerId);
      const values = peers.map((node) => node.zIndex ?? 0);
      const current = target.zIndex ?? 0;
      const nextZ = direction === 'front'
        ? Math.max(0, ...values) + 1
        : direction === 'back'
          ? Math.min(0, ...values) - 1
          : direction === 'forward'
            ? current + 1
            : current - 1;
      const nodes = state.nodes.map((node) => node.id === id ? { ...node, zIndex: nextZ } : node);
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  updateEdge: (id, patch) => {
    set((state) => {
      const edges = state.edges.map((edge) => {
        if (edge.id !== id) return edge;
        const scientificSemantic = Object.prototype.hasOwnProperty.call(patch, 'scientificSemantic')
          ? patch.scientificSemantic
          : edge.data?.scientificSemantic;
        const semanticStyle = patch.scientificSemantic
          ? SCIENTIFIC_CONNECTOR_STYLES[patch.scientificSemantic]
          : undefined;
        const data: FlowEdgeData = {
          ...edge.data,
          label: patch.label ?? edge.data?.label,
          color: patch.color ?? semanticStyle?.color ?? edge.data?.color ?? 'oklch(0.430 0.025 70)',
          width: patch.width ?? semanticStyle?.width ?? edge.data?.width ?? 1.75,
          lineStyle: patch.lineStyle ?? semanticStyle?.lineStyle ?? edge.data?.lineStyle ?? 'solid',
          routing: patch.routing ?? edge.data?.routing ?? 'smoothstep',
          arrowStart: patch.arrowStart ?? edge.data?.arrowStart ?? 'none',
          arrowEnd: patch.arrowEnd ?? semanticStyle?.arrowEnd ?? edge.data?.arrowEnd ?? 'closed',
          scientificSemantic,
          routeSide: patch.routeSide ?? edge.data?.routeSide,
          routeOffset: patch.routeOffset ?? edge.data?.routeOffset,
          labelFontSize: patch.labelFontSize ?? edge.data?.labelFontSize,
        };
        return {
          ...edge,
          type: data.scientificSemantic ? 'scientific' : reactFlowEdgeType(data.routing),
          label: data.label,
          data,
          markerStart: createEdgeMarker(data.arrowStart, data.color),
          markerEnd: createEdgeMarker(data.arrowEnd, data.color),
          style: {
            ...edge.style,
            stroke: data.color,
            strokeWidth: data.width,
            strokeDasharray: data.lineStyle === 'dashed' ? '8 6' : data.lineStyle === 'dotted' ? '2 5' : undefined,
          },
        };
      });
      if (state.transactionStart) return { ...syncPage(state, { nodes: state.nodes, edges }), dirty: true };
      return withCheckpoint(state, { nodes: state.nodes, edges });
    });
  },

  reverseEdge: (id) => {
    set((state) => {
      const edges = state.edges.map((edge) => {
        if (edge.id !== id) return edge;
        const color = edge.data?.color ?? 'oklch(0.430 0.025 70)';
        const arrowStart = edge.data?.arrowEnd ?? 'closed';
        const arrowEnd = edge.data?.arrowStart ?? 'none';
        return {
          ...edge,
          source: edge.target,
          target: edge.source,
          sourceHandle: edge.targetHandle,
          targetHandle: edge.sourceHandle,
          data: { ...edge.data!, arrowStart, arrowEnd },
          markerStart: createEdgeMarker(arrowStart, color),
          markerEnd: createEdgeMarker(arrowEnd, color),
        };
      });
      return withCheckpoint(state, { nodes: state.nodes, edges });
    });
  },

  reconnect: (edge, connection) => {
    set((state) => withCheckpoint(state, {
      nodes: state.nodes,
      edges: reconnectEdge(edge, connection, state.edges),
    }));
  },

  insertGraph: (incomingNodes, incomingEdges, offset = 36) => {
    set((state) => {
      if (incomingNodes.length === 0) return state;
      const fallbackLayerId = editableLayerId(state.layers, state.activeLayerId);
      if (!fallbackLayerId) return state;
      const idMap = new Map<string, string>();
      const stamp = Date.now().toString(36);
      for (const [index, node] of incomingNodes.entries()) idMap.set(node.id, `${node.id}-paste-${stamp}-${index}`);
      const nodes = incomingNodes.map((node) => {
        const parentId = node.parentId ? idMap.get(node.parentId) : undefined;
        const layerId = editableLayerId(state.layers, node.data.layerId) ?? fallbackLayerId;
        return {
          ...cloneGraph(node),
          id: idMap.get(node.id)!,
          parentId,
          position: parentId ? node.position : { x: node.position.x + offset, y: node.position.y + offset },
          data: { ...cloneGraph(node.data), layerId },
          selected: node.selected ?? true,
        };
      });
      const edges = incomingEdges.flatMap((edge, index) => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        return source && target ? [{
          ...cloneGraph(edge),
          id: `${edge.id}-paste-${stamp}-${index}`,
          source,
          target,
          selected: edge.selected ?? true,
        }] : [];
      });
      return withCheckpoint(state, {
        nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), ...nodes],
        edges: [...state.edges.map((edge) => ({ ...edge, selected: false })), ...edges],
      });
    });
  },

  deleteSelection: () => {
    set((state) => {
      const roots = new Set(state.nodes
        .filter((node) => node.selected && !isNodeEffectivelyLocked(state, node))
        .map((node) => node.id));
      const selectedIds = descendantIds(state.nodes, roots);
      const nodes = state.nodes.filter((node) => !selectedIds.has(node.id));
      const edges = state.edges.filter((edge) => !edge.selected && !selectedIds.has(edge.source) && !selectedIds.has(edge.target));
      if (nodes.length === state.nodes.length && edges.length === state.edges.length) return state;
      return withCheckpoint(state, { nodes, edges });
    });
  },

  duplicateSelection: () => {
    const state = get();
    const roots = new Set(state.nodes
      .filter((node) => node.selected && !isNodeEffectivelyLocked(state, node))
      .map((node) => node.id));
    if (roots.size === 0) return;
    const ids = descendantIds(state.nodes, roots);
    state.insertGraph(state.nodes.filter((node) => ids.has(node.id)), state.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)), 32);
  },

  nudgeSelection: (delta) => {
    set((state) => {
      if ((!delta.x && !delta.y) || !state.nodes.some((node) => node.selected && !isNodeEffectivelyLocked(state, node))) return state;
      const selectedIds = new Set(state.nodes.filter((node) => node.selected).map((node) => node.id));
      const movableIds = new Set(state.nodes.filter((node) => {
        if (!node.selected || isNodeEffectivelyLocked(state, node)) return false;
        let parentId = node.parentId;
        while (parentId) {
          if (selectedIds.has(parentId)) return false;
          parentId = state.nodes.find((candidate) => candidate.id === parentId)?.parentId;
        }
        return true;
      }).map((node) => node.id));
      if (movableIds.size === 0) return state;
      const nodes = state.nodes.map((node) => movableIds.has(node.id) ? {
        ...node,
        position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
      } : node);
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  selectAll: () => set((state) => {
    const hiddenLayers = new Set(state.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
    const selectableIds = new Set(state.nodes
      .filter((node) => !node.data.hidden
        && !hiddenLayers.has(node.data.layerId ?? '')
        && !isNodeEffectivelyLocked(state, node))
      .map((node) => node.id));
    const nodes = state.nodes.map((node) => ({ ...node, selected: selectableIds.has(node.id) }));
    const edges = state.edges.map((edge) => ({
      ...edge,
      selected: selectableIds.has(edge.source) && selectableIds.has(edge.target),
    }));
    return syncPage(state, { nodes, edges });
  }),

  clearSelection: () => set((state) => syncPage(state, {
    nodes: state.nodes.map((node) => ({ ...node, selected: false })),
    edges: state.edges.map((edge) => ({ ...edge, selected: false })),
  })),

  alignSelection: (axis) => {
    set((state) => {
      const candidates = state.nodes.filter((node) => node.selected && !isNodeEffectivelyLocked(state, node));
      if (candidates.length < 2) return state;
      const parentId = candidates[0].parentId;
      const selected = candidates.filter((node) => node.parentId === parentId);
      if (selected.length < 2) return state;
      const boxes = selected.map((node) => ({ node, ...nodeSize(node) }));
      const left = Math.min(...boxes.map(({ node }) => node.position.x));
      const right = Math.max(...boxes.map(({ node, width }) => node.position.x + width));
      const top = Math.min(...boxes.map(({ node }) => node.position.y));
      const bottom = Math.max(...boxes.map(({ node, height }) => node.position.y + height));
      const ids = new Set(selected.map((node) => node.id));
      const nodes = state.nodes.map((node) => {
        if (!ids.has(node.id)) return node;
        const { width, height } = nodeSize(node);
        const position = { ...node.position };
        if (axis === 'left') position.x = left;
        if (axis === 'center-x') position.x = (left + right - width) / 2;
        if (axis === 'right') position.x = right - width;
        if (axis === 'top') position.y = top;
        if (axis === 'center-y') position.y = (top + bottom - height) / 2;
        if (axis === 'bottom') position.y = bottom - height;
        return { ...node, position };
      });
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  distributeSelection: (axis) => {
    set((state) => {
      const candidates = state.nodes.filter((node) => node.selected && !isNodeEffectivelyLocked(state, node));
      if (candidates.length < 3) return state;
      const parentId = candidates[0].parentId;
      const selected = candidates.filter((node) => node.parentId === parentId);
      if (selected.length < 3) return state;
      const sorted = [...selected].sort((a, b) => axis === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y);
      const sizes = sorted.map(nodeSize);
      const start = axis === 'horizontal' ? sorted[0].position.x : sorted[0].position.y;
      const last = sorted.at(-1)!;
      const lastSize = sizes.at(-1)!;
      const end = axis === 'horizontal'
        ? last.position.x + lastSize.width
        : last.position.y + lastSize.height;
      const occupied = sizes.reduce((total, size) => total + (axis === 'horizontal' ? size.width : size.height), 0);
      const gap = (end - start - occupied) / (sorted.length - 1);
      let cursor = start;
      const positions = new Map<string, FlowNode['position']>();
      sorted.forEach((node, index) => {
        positions.set(node.id, axis === 'horizontal'
          ? { ...node.position, x: cursor }
          : { ...node.position, y: cursor });
        cursor += (axis === 'horizontal' ? sizes[index].width : sizes[index].height) + gap;
      });
      const nodes = state.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node);
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  groupSelection: () => {
    set((state) => {
      const candidates = state.nodes.filter((node) => (
        node.selected
        && !isNodeEffectivelyLocked(state, node)
        && node.data.kind !== 'group'
      ));
      if (candidates.length < 2) return state;
      const parentId = candidates[0].parentId;
      const selected = candidates.filter((node) => node.parentId === parentId);
      if (selected.length < 2) return state;
      const boxes = selected.map((node) => ({ node, ...nodeSize(node) }));
      const left = Math.min(...boxes.map(({ node }) => node.position.x));
      const top = Math.min(...boxes.map(({ node }) => node.position.y));
      const right = Math.max(...boxes.map(({ node, width }) => node.position.x + width));
      const bottom = Math.max(...boxes.map(({ node, height }) => node.position.y + height));
      const padding = 28;
      const group = createFlowNode('group', { x: left - padding, y: top - padding }, '分组', {
        id: createId('group'),
        parentId,
        extent: parentId ? 'parent' : undefined,
        expandParent: Boolean(parentId),
        selected: true,
        zIndex: Math.min(...selected.map((node) => node.zIndex ?? 0)) - 1,
        style: { width: right - left + padding * 2, height: bottom - top + padding * 2 },
      });
      group.data = { ...group.data, layerId: selected[0].data.layerId ?? state.activeLayerId };
      const selectedIds = new Set(selected.map((node) => node.id));
      const children = state.nodes.map((node) => selectedIds.has(node.id) ? {
        ...node,
        parentId: group.id,
        extent: 'parent' as const,
        expandParent: true,
        position: { x: node.position.x - group.position.x, y: node.position.y - group.position.y },
        selected: false,
      } : { ...node, selected: false });
      const insertAt = Math.max(0, children.findIndex((node) => selectedIds.has(node.id)));
      const nodes = [...children.slice(0, insertAt), group, ...children.slice(insertAt)];
      return withCheckpoint(state, { nodes, edges: state.edges.map((edge) => ({ ...edge, selected: false })) });
    });
  },

  ungroupSelection: () => {
    set((state) => {
      const groups = state.nodes.filter((node) => (
        node.selected
        && node.data.kind === 'group'
        && !isNodeEffectivelyLocked(state, node)
      ));
      if (groups.length === 0) return state;
      const groupMap = new Map(groups.map((group) => [group.id, group]));
      const nodes = state.nodes.flatMap((node) => {
        if (groupMap.has(node.id)) return [];
        const group = node.parentId ? groupMap.get(node.parentId) : undefined;
        if (!group) return [{ ...node, selected: false }];
        return [{
          ...node,
          parentId: group.parentId,
          extent: group.parentId ? 'parent' as const : undefined,
          expandParent: Boolean(group.parentId),
          position: { x: group.position.x + node.position.x, y: group.position.y + node.position.y },
          selected: true,
        }];
      });
      const removed = new Set(groups.map((group) => group.id));
      const edges = state.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
      return withCheckpoint(state, { nodes, edges });
    });
  },

  layout: (direction) => {
    set((state) => {
      const topLevel = state.nodes.filter((node) => !node.parentId && !isNodeEffectivelyLocked(state, node));
      if (topLevel.length === 0) return state;
      const topIds = new Set(topLevel.map((node) => node.id));
      const topEdges = state.edges.filter((edge) => topIds.has(edge.source) && topIds.has(edge.target));
      const laidOut = layoutGraph(topLevel, topEdges, direction);
      const positions = new Map(laidOut.nodes.map((node) => [node.id, node.position]));
      const nodes = state.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node);
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  loadGraph: (title, incomingNodes, incomingEdges) => {
    set((state) => {
      const graph = normalizeGraph(incomingNodes, incomingEdges);
      const layerIds = new Set(state.layers.map((layer) => layer.id));
      const fallbackLayerId = editableLayerId(state.layers, state.activeLayerId) ?? preferredLayerId(state.layers);
      const nodes = graph.nodes.map((node) => ({
        ...node,
        data: { ...node.data, layerId: layerIds.has(node.data.layerId ?? '') ? node.data.layerId : fallbackLayerId },
      }));
      const checkpoint = withCheckpoint(state, { nodes, edges: graph.edges });
      const pages = (checkpoint.pages ?? state.pages).map((page) => page.id === state.activePageId
        ? { ...page, name: title }
        : page);
      return { ...checkpoint, title, pages, transactionStart: null };
    });
  },

  loadDocument: (title, incomingPages, requestedPageId) => {
    const pages = incomingPages.length
      ? incomingPages.map(normalizePage)
      : [normalizePage(createDiagramPage('页面 1'), 0)];
    const active = pages.find((page) => page.id === requestedPageId) ?? pages[0];
    set((state) => withDocumentCheckpoint(state, {
      title,
      pages,
      activePageId: active.id,
      ...activePageState(active),
      lastSavedAt: null,
    }));
  },

  configureScientificFigure: (spec, layoutNodes) => {
    set((state) => {
      const fallbackLayerId = editableLayerId(state.layers, state.activeLayerId);
      if (!fallbackLayerId) return state;
      const removedIds = new Set(state.nodes
        .filter((node) => Boolean(node.data.scientificRole) && node.data.scientificRole !== 'chart-root')
        .map((node) => node.id));
      const retainedNodes = state.nodes
        .filter((node) => !removedIds.has(node.id))
        .map((node) => ({ ...node, selected: false }));
      const nodes = [
        ...retainedNodes,
        ...layoutNodes.map((node) => ({
          ...cloneGraph(node),
          selected: false,
          draggable: !node.data.locked,
          data: { ...cloneGraph(node.data), layerId: fallbackLayerId },
        })),
      ];
      const edges = state.edges
        .filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target))
        .map((edge) => ({ ...edge, selected: false }));
      const checkpoint = withCheckpoint(state, { nodes, edges });
      const pages = (checkpoint.pages ?? state.pages).map((page) => page.id === state.activePageId
        ? { ...page, scientific: cloneGraph(spec) }
        : page);
      return { ...checkpoint, pages };
    });
  },

  loadTemplate: (id) => {
    const template = getTemplate(id);
    get().loadGraph(template.name, cloneGraph(template.nodes), cloneGraph(template.edges));
  },

  restoreDraft: (draft) => {
    if ('pages' in draft && Array.isArray(draft.pages)) {
      const pages = draft.pages.map(normalizePage);
      const active = pages.find((page) => page.id === draft.activePageId) ?? pages[0];
      if (!active) return;
      set({
        title: draft.title,
        pages,
        activePageId: active.id,
        ...activePageState(active),
        past: [],
        future: [],
        transactionStart: null,
        dirty: false,
      });
      return;
    }
    const legacy = draft as RestorableDocument & { nodes: FlowNode[]; edges: FlowEdge[] };
    const page = normalizePage(createDiagramPage('页面 1', { id: 'page-1', nodes: legacy.nodes, edges: legacy.edges }), 0);
    set({
      title: legacy.title,
      pages: [page],
      activePageId: page.id,
      ...activePageState(page),
      past: [],
      future: [],
      transactionStart: null,
      dirty: false,
    });
  },

  newDocument: () => {
    const page = normalizePage(createDiagramPage('页面 1'), 0);
    set((state) => withDocumentCheckpoint(state, {
      title: '未命名流程图',
      pages: [page],
      activePageId: page.id,
      ...activePageState(page),
      lastSavedAt: null,
    }));
  },

  addPage: () => {
    set((state) => {
      const page = normalizePage(createDiagramPage(`页面 ${state.pages.length + 1}`), state.pages.length);
      return withDocumentCheckpoint(state, {
        pages: [...state.pages, page],
        activePageId: page.id,
        ...activePageState(page),
      });
    });
  },

  duplicatePage: (id) => {
    set((state) => {
      const source = state.pages.find((page) => page.id === (id ?? state.activePageId));
      if (!source) return state;
      const page = normalizePage({ ...cloneGraph(source), id: createId('page'), name: `${source.name} 副本` }, state.pages.length);
      const sourceIndex = state.pages.findIndex((current) => current.id === source.id);
      const pages = [...state.pages];
      pages.splice(sourceIndex + 1, 0, page);
      return withDocumentCheckpoint(state, { pages, activePageId: page.id, ...activePageState(page) });
    });
  },

  deletePage: (id) => {
    set((state) => {
      if (state.pages.length <= 1) return state;
      const index = state.pages.findIndex((page) => page.id === id);
      if (index < 0) return state;
      const pages = state.pages.filter((page) => page.id !== id);
      if (state.activePageId !== id) return withDocumentCheckpoint(state, { pages });
      const active = pages[Math.min(index, pages.length - 1)];
      return withDocumentCheckpoint(state, { pages, activePageId: active.id, ...activePageState(active) });
    });
  },

  renamePage: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => withDocumentCheckpoint(state, {
      pages: state.pages.map((page) => page.id === id ? { ...page, name: trimmed } : page),
    }));
  },

  switchPage: (id) => {
    set((state) => {
      if (id === state.activePageId) return state;
      const page = state.pages.find((current) => current.id === id);
      return page ? { activePageId: page.id, ...activePageState(page), transactionStart: null } : state;
    });
  },

  addLayer: () => {
    const id = createId('layer');
    set((state) => {
      const layers = [...state.layers, { id, name: `图层 ${state.layers.length + 1}`, visible: true, locked: false }];
      return { ...withCheckpoint(state, { nodes: state.nodes, edges: state.edges, layers }), activeLayerId: id };
    });
  },

  updateLayer: (id, patch) => {
    set((state) => {
      const layers = state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer);
      const changed = layers.find((layer) => layer.id === id);
      const nodes = state.nodes.map((node) => node.data.layerId === id ? {
        ...node,
        selected: changed?.visible === false || changed?.locked ? false : node.selected,
        draggable: !node.data.locked && !changed?.locked,
      } : node);
      if (state.transactionStart) return { ...syncPage(state, { nodes, edges: state.edges, layers }), dirty: true };
      return withCheckpoint(state, { nodes, edges: state.edges, layers });
    });
  },

  deleteLayer: (id) => {
    set((state) => {
      if (state.layers.length <= 1) return state;
      const index = state.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return state;
      const layers = state.layers.filter((layer) => layer.id !== id);
      const target = layers[Math.max(0, Math.min(index - 1, layers.length - 1))];
      const nodes = state.nodes.map((node) => node.data.layerId === id ? { ...node, data: { ...node.data, layerId: target.id } } : node);
      return {
        ...withCheckpoint(state, { nodes, edges: state.edges, layers }),
        activeLayerId: state.activeLayerId === id ? target.id : state.activeLayerId,
      };
    });
  },

  setActiveLayer: (id) => {
    if (get().layers.some((layer) => layer.id === id)) set({ activeLayerId: id });
  },

  moveSelectionToLayer: (id) => {
    set((state) => {
      const target = state.layers.find((layer) => layer.id === id);
      if (!target || target.locked) return state;
      let changed = false;
      const nodes = state.nodes.map((node) => {
        if (!node.selected || isNodeEffectivelyLocked(state, node) || node.data.layerId === id) return node;
        changed = true;
        return { ...node, data: { ...node.data, layerId: id } };
      });
      if (!changed) return state;
      return withCheckpoint(state, { nodes, edges: state.edges });
    });
  },

  moveLayer: (id, direction) => {
    set((state) => {
      const index = state.layers.findIndex((layer) => layer.id === id);
      const target = direction === 'up' ? index + 1 : index - 1;
      if (index < 0 || target < 0 || target >= state.layers.length) return state;
      const layers = [...state.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return withCheckpoint(state, { nodes: state.nodes, edges: state.edges, layers });
    });
  },

  undo: () => {
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...restoreSnapshot(previous),
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, MAX_HISTORY),
        transactionStart: null,
        dirty: true,
      };
    });
  },

  redo: () => {
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...restoreSnapshot(next),
        past: [...state.past, snapshot(state)].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        transactionStart: null,
        dirty: true,
      };
    });
  },

  markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),
}));
