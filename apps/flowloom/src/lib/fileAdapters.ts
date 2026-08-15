import JSZip from 'jszip';
import pako from 'pako';
import { parse as parseYaml } from 'yaml';
import type {
  ArrowHead,
  DiagramProvenance,
  DiagramPage,
  FlowEdge,
  FlowNode,
  ImportResult,
  PdfExtractionSummary,
  ShapeKind,
} from '../types';
import {
  createDefaultLayer,
  createFlowEdge,
  createFlowNode,
  layoutGraph,
  normalizeGraph,
  sanitizeKind,
  SHAPE_DIMENSIONS,
} from './diagram';
import { createId } from './id';
import { getShapeDefinition, isShapeKind } from './shapeRegistry';
import { parseEditableSvg } from './svgImport';
import { pdfOperatorListToSvg, type PdfTextItemLike } from './pdfVectorExtraction';

const STRUCTURED_EXTENSIONS = new Set([
  'json',
  'flow',
  'drawio',
  'xml',
  'mmd',
  'mermaid',
  'dot',
  'gv',
  'bpmn',
  'excalidraw',
  'svg',
  'csv',
  'yaml',
  'yml',
  'puml',
  'plantuml',
]);

function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('无法读取 ' + file.name));
    reader.readAsText(file);
  });
}

async function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('无法读取 ' + file.name));
    reader.readAsArrayBuffer(file);
  });
}

function textContent(value: string): string {
  const document = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
  return (document.body.textContent ?? '').trim();
}

function parseStyle(style: string | null): Record<string, string> {
  return Object.fromEntries(
    (style ?? '')
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split('=');
        return [key, rest.join('=')];
      }),
  );
}

function decodeStyleValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeStyleJson<T>(value: string | undefined): T | undefined {
  const decoded = decodeStyleValue(value);
  if (!decoded) return undefined;
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return undefined;
  }
}

function mapMxShape(style: Record<string, string>): ShapeKind {
  if (isShapeKind(style.flowloomKind)) return style.flowloomKind;
  const shape = `${style.shape ?? ''} ${Object.keys(style).join(' ')}`.toLowerCase();
  if (shape.includes('multidocument')) return 'multiple-documents';
  if (shape.includes('offpageconnector')) return 'off-page-connector';
  if (shape.includes('manualinput')) return 'manual';
  if (shape.includes('internalstorage')) return 'internal-storage';
  if (shape.includes('stored_data')) return 'stored-data';
  if (shape.includes('direct_data')) return 'direct-storage';
  if (shape.includes('sequential_data')) return 'sequential-storage';
  if (shape.includes('paper_tape')) return 'paper-tape';
  if (shape.includes('loop_limit')) return 'loop-limit';
  if (shape.includes('collate')) return 'collate';
  if (shape.includes('display')) return 'display';
  if (shape.includes('delay')) return 'delay';
  if (shape.includes('hexagon')) return 'preparation';
  if (shape.includes('umlactor')) return 'uml-actor';
  if (shape.includes('component')) return 'uml-component';
  if (shape.includes('folder')) return 'uml-package';
  if (shape.includes('rhombus') || shape.includes('diamond')) return 'decision';
  if (shape.includes('cylinder') || shape.includes('database')) return 'database';
  if (shape.includes('document')) return 'document';
  if (shape.includes('parallelogram') || shape.includes('data')) return 'data';
  if (shape.includes('trapezoid') || shape.includes('manual')) return 'manual-operation';
  if (shape.includes('note')) return 'note';
  if (shape.includes('swimlane') || shape.includes('group')) return 'group';
  if (style.ellipse === '1' || shape.includes('ellipse') || shape.includes('terminator')) return 'start';
  return 'process';
}

function mapMxArrow(value: string | undefined): 'none' | 'open' | 'closed' {
  if (!value || value === 'none') return 'none';
  return value.toLowerCase().includes('open') ? 'open' : 'closed';
}

function decodeDrawioPayload(payload: string): string {
  const compact = payload.trim();
  if (compact.startsWith('<mxGraphModel')) return compact;
  const binary = atob(compact);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const inflated = pako.inflateRaw(bytes, { to: 'string' });
  try {
    return decodeURIComponent(inflated);
  } catch {
    return inflated;
  }
}

function parseDrawioModel(graphDocument: ParentNode): { nodes: FlowNode[]; edges: FlowEdge[]; layers: DiagramPage['layers']; warnings: string[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const warnings: string[] = [];
  const cells = Array.from(graphDocument.querySelectorAll('mxCell'));
  const vertexIds = new Set(cells.filter((cell) => cell.getAttribute('vertex') === '1').map((cell) => cell.getAttribute('id')).filter(Boolean) as string[]);
  const layerCells = cells.filter((cell) => cell.getAttribute('parent') === '0' && cell.getAttribute('id') !== '0');
  const layers = layerCells.length
    ? layerCells.map((cell, index) => ({
      id: cell.getAttribute('id') ?? `layer-${index + 1}`,
      name: textContent(cell.getAttribute('value') ?? '') || (index === 0 ? '默认图层' : `图层 ${index + 1}`),
      visible: cell.getAttribute('visible') !== '0',
      locked: cell.getAttribute('locked') === '1',
    }))
    : [createDefaultLayer()];
  const layerIds = new Set(layers.map((layer) => layer.id));

  for (const cell of cells) {
    const id = cell.getAttribute('id') ?? createId('node');
    const geometry = cell.querySelector(':scope > mxGeometry') ?? cell.querySelector('mxGeometry');
    if (cell.getAttribute('vertex') === '1' && geometry) {
      const style = parseStyle(cell.getAttribute('style'));
      const kind = mapMxShape(style);
      const width = Number(geometry.getAttribute('width')) || SHAPE_DIMENSIONS[kind].width;
      const height = Number(geometry.getAttribute('height')) || SHAPE_DIMENSIONS[kind].height;
      const node = createFlowNode(
        kind,
        {
          x: Number(geometry.getAttribute('x')) || 0,
          y: Number(geometry.getAttribute('y')) || 0,
        },
        textContent(cell.getAttribute('value') ?? '') || '未命名',
        { id, style: { width, height } },
      );
      node.data = {
        ...node.data,
        fill: style.fillColor && style.fillColor !== 'none' ? style.fillColor : node.data.fill,
        stroke: style.strokeColor && style.strokeColor !== 'none' ? style.strokeColor : node.data.stroke,
        textColor: style.fontColor ?? node.data.textColor,
        borderWidth: Number(style.strokeWidth) || node.data.borderWidth,
        fontSize: Number(style.fontSize) || node.data.fontSize,
        radius: style.flowloomRadius ? Number(style.flowloomRadius) : style.rounded === '1' ? 10 : node.data.radius,
        fontWeight: style.flowloomFontWeight ? Number(style.flowloomFontWeight) : style.fontStyle === '1' ? 700 : node.data.fontWeight,
        textAlign: style.flowloomTextAlign === 'left' || style.flowloomTextAlign === 'right'
          ? style.flowloomTextAlign
          : style.align === 'left' || style.align === 'right' ? style.align : 'center',
        verticalAlign: style.flowloomVerticalAlign === 'top' || style.flowloomVerticalAlign === 'bottom'
          ? style.flowloomVerticalAlign
          : style.verticalAlign === 'top' || style.verticalAlign === 'bottom' ? style.verticalAlign : 'middle',
        opacity: style.opacity ? Math.max(0.1, Math.min(1, Number(style.opacity) / 100)) : node.data.opacity,
        description: decodeStyleValue(style.flowloomDescription),
        locked: style.flowloomLocked === '1',
        rotation: Number(style.flowloomRotation) || 0,
        vector: decodeStyleJson(style.flowloomVector) ?? node.data.vector,
        layerId: layerIds.has(cell.getAttribute('parent') ?? '') ? cell.getAttribute('parent')! : layers[0].id,
        hidden: cell.getAttribute('visible') === '0',
      };
      const parent = cell.getAttribute('parent');
      if (parent && vertexIds.has(parent)) {
        node.parentId = parent;
        node.extent = 'parent';
        node.expandParent = true;
      }
      node.hidden = Boolean(node.data.hidden);
      node.draggable = !node.data.locked;
      nodes.push(node);
    }

    if (cell.getAttribute('edge') === '1') {
      const source = cell.getAttribute('source');
      const target = cell.getAttribute('target');
      if (!source || !target) {
        warnings.push(`跳过了未绑定两端的连接线 ${id}。`);
        continue;
      }
      const style = parseStyle(cell.getAttribute('style'));
      const routing = style.edgeStyle?.includes('orthogonal') ? 'smoothstep' : style.curved === '1' ? 'bezier' : 'straight';
      const edge = createFlowEdge(source, target, textContent(cell.getAttribute('value') ?? ''), routing);
      edge.id = id;
      if (style.strokeColor) {
        edge.data = { ...edge.data!, color: style.strokeColor };
        edge.style = { ...edge.style, stroke: style.strokeColor };
      }
      edge.data = {
        ...edge.data!,
        width: Number(style.strokeWidth) || edge.data!.width,
        lineStyle: style.dashed === '1' ? style.dashPattern?.startsWith('1 ') ? 'dotted' : 'dashed' : edge.data!.lineStyle,
        arrowStart: mapMxArrow(style.startArrow),
        arrowEnd: style.endArrow === undefined ? 'closed' : mapMxArrow(style.endArrow),
      };
      edges.push(edge);
    }
  }

  const graph = normalizeGraph(nodes, edges);
  if (graph.nodes.length === 0) throw new Error('draw.io 文件中没有找到可编辑图元。');
  return { ...graph, layers, warnings };
}

function importDrawio(source: string, title: string): ImportResult {
  const outer = new DOMParser().parseFromString(source, 'application/xml');
  if (outer.querySelector('parsererror')) throw new Error('draw.io XML 无法解析。');
  const diagrams = Array.from(outer.querySelectorAll('diagram'));
  const pages: DiagramPage[] = [];
  const warnings: string[] = [];

  if (diagrams.length === 0 && outer.querySelector('mxGraphModel')) {
    const graph = parseDrawioModel(outer);
    pages.push({ id: 'drawio-page-1', name: '页面 1', nodes: graph.nodes, edges: graph.edges, layers: graph.layers });
    warnings.push(...graph.warnings);
  } else {
    for (const [index, diagram] of diagrams.entries()) {
      let model: ParentNode | null = diagram.querySelector('mxGraphModel');
      if (!model && diagram.textContent?.trim()) {
        const decoded = new DOMParser().parseFromString(decodeDrawioPayload(diagram.textContent), 'application/xml');
        if (!decoded.querySelector('parsererror')) model = decoded;
      }
      if (!model) {
        warnings.push(`跳过了无法解析的 draw.io 页面 ${index + 1}。`);
        continue;
      }
      const graph = parseDrawioModel(model);
      pages.push({
        id: diagram.getAttribute('id') || `drawio-page-${index + 1}`,
        name: diagram.getAttribute('name') || `页面 ${index + 1}`,
        nodes: graph.nodes,
        edges: graph.edges,
        layers: graph.layers,
      });
      warnings.push(...graph.warnings.map((warning) => `${diagram.getAttribute('name') || `页面 ${index + 1}`}：${warning}`));
    }
  }

  if (pages.length === 0) throw new Error('文件中没有可读取的 draw.io 图页。');
  const active = pages[0];
  return {
    title,
    nodes: active.nodes,
    edges: active.edges,
    pages,
    activePageId: active.id,
    fidelity: warnings.length ? 'hybrid' : 'structural',
    sourceFormat: 'draw.io',
    warnings,
  };
}

interface ParsedTextGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  direction: 'TB' | 'LR';
  warnings: string[];
}

export type CodeDiagramFormat = 'mermaid' | 'dot' | 'plantuml';

function addTextNode(map: Map<string, FlowNode>, id: string, label = id, kind: ShapeKind = 'process') {
  if (map.has(id)) {
    const current = map.get(id)!;
    const isPlainReference = label === id && kind === 'process';
    current.data = {
      ...current.data,
      label: isPlainReference ? current.data.label : label || current.data.label,
      kind: isPlainReference ? current.data.kind : kind,
    };
    return;
  }
  map.set(id, createFlowNode(kind, { x: 0, y: 0 }, label || id, { id }));
}

function mermaidNode(rawId: string, rawShape?: string, rawLabel?: string) {
  let kind: ShapeKind = 'process';
  const shape = rawShape ?? '';
  if (shape.startsWith('{')) kind = 'decision';
  else if (shape.startsWith('((') || shape.startsWith('([') || shape.startsWith('>')) kind = 'start';
  else if (shape.startsWith('[(')) kind = 'database';
  else if (shape.startsWith('[/')) kind = 'data';
  const label = (rawLabel ?? rawId).replace(/^['"]|['"]$/g, '').trim();
  return { id: rawId.trim(), label, kind };
}

function parseMermaid(source: string): ParsedTextGraph {
  const map = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const warnings: string[] = [];
  const direction: 'TB' | 'LR' = /(?:flowchart|graph)\s+(LR|RL)/i.test(source) ? 'LR' : 'TB';
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const definition = /^([\w.-]+)\s*(\(\(|\(\[|\[\(|\[\/|\{|\[|\()(.+?)(\)\)|\]\)|\)\]|\/\]|\}|\]|\))$/;
  const reference = /^([\w.-]+)(?:\s*(\(\(|\(\[|\[\(|\[\/|\{|\[|\()(.+?)(\)\)|\]\)|\)\]|\/\]|\}|\]|\)))?$/;
  const edgePattern = /^(.*?)\s*(-->|---|-.->|==>)\s*(?:\|([^|]+)\|\s*)?(.*?)$/;

  for (const line of lines) {
    if (/^(flowchart|graph|subgraph|end|%%)/i.test(line)) continue;
    const edgeMatch = line.match(edgePattern);
    if (edgeMatch) {
      const left = edgeMatch[1].trim().match(reference);
      const right = edgeMatch[4].trim().match(reference);
      if (!left || !right) {
        warnings.push(`未识别 Mermaid 语句：${line}`);
        continue;
      }
      const leftNode = mermaidNode(left[1], left[2], left[3]);
      const rightNode = mermaidNode(right[1], right[2], right[3]);
      addTextNode(map, leftNode.id, leftNode.label, leftNode.kind);
      addTextNode(map, rightNode.id, rightNode.label, rightNode.kind);
      const edge = createFlowEdge(leftNode.id, rightNode.id, edgeMatch[3]?.trim());
      if (edgeMatch[2] === '-.->') edge.data = { ...edge.data!, lineStyle: 'dashed' };
      if (edgeMatch[2] === '==>') edge.data = { ...edge.data!, width: 3 };
      edges.push(edge);
      continue;
    }
    const nodeMatch = line.match(definition);
    if (nodeMatch) {
      const parsed = mermaidNode(nodeMatch[1], nodeMatch[2], nodeMatch[3]);
      addTextNode(map, parsed.id, parsed.label, parsed.kind);
      continue;
    }
    warnings.push(`未识别 Mermaid 语句：${line}`);
  }

  return { nodes: [...map.values()], edges, direction, warnings };
}

function parseDot(source: string): ParsedTextGraph {
  const map = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const warnings: string[] = [];
  const direction: 'TB' | 'LR' = /rankdir\s*=\s*(LR|RL)/i.test(source) ? 'LR' : 'TB';
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const nodePattern = /(?:^|[;{}\n])\s*([\w.-]+)\s*\[([^\]]*)\]/g;
  for (const match of body.matchAll(nodePattern)) {
    const attrs = match[2];
    const label = attrs.match(/label\s*=\s*"([^"]*)"/i)?.[1] ?? match[1];
    const shape = attrs.match(/shape\s*=\s*([\w]+)/i)?.[1]?.toLowerCase();
    const kind: ShapeKind = shape === 'diamond' ? 'decision' : shape === 'ellipse' || shape === 'oval' ? 'start' : shape === 'cylinder' ? 'database' : 'process';
    addTextNode(map, match[1], label, kind);
  }

  const edgePattern = /([\w.-]+)\s*->\s*([\w.-]+)(?:\s*\[([^\]]*)\])?/g;
  for (const match of body.matchAll(edgePattern)) {
    addTextNode(map, match[1]);
    addTextNode(map, match[2]);
    const label = match[3]?.match(/label\s*=\s*"([^"]*)"/i)?.[1];
    edges.push(createFlowEdge(match[1], match[2], label));
  }

  if (map.size === 0) warnings.push('DOT 文件中没有识别出节点。');
  return { nodes: [...map.values()], edges, direction, warnings };
}

function localElements(document: Document, name: string): Element[] {
  return Array.from(document.getElementsByTagName('*')).filter((element) => element.localName === name);
}

function parseBpmn(source: string): ParsedTextGraph {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('BPMN XML 无法解析。');
  const nodeTypes: Record<string, ShapeKind> = {
    startEvent: 'bpmn-start-event',
    intermediateCatchEvent: 'bpmn-intermediate-event',
    intermediateThrowEvent: 'bpmn-intermediate-event',
    boundaryEvent: 'bpmn-intermediate-event',
    endEvent: 'bpmn-end-event',
    task: 'bpmn-task',
    userTask: 'bpmn-user-task',
    manualTask: 'manual-operation',
    serviceTask: 'bpmn-service-task',
    scriptTask: 'bpmn-task',
    sendTask: 'bpmn-task',
    receiveTask: 'bpmn-task',
    exclusiveGateway: 'bpmn-exclusive-gateway',
    parallelGateway: 'bpmn-parallel-gateway',
    inclusiveGateway: 'bpmn-inclusive-gateway',
    dataObjectReference: 'bpmn-data-object',
    dataStoreReference: 'bpmn-data-store',
    textAnnotation: 'note',
    subProcess: 'group',
    participant: 'bpmn-pool',
    lane: 'swimlane',
  };
  const bounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const shape of localElements(document, 'BPMNShape')) {
    const id = shape.getAttribute('bpmnElement');
    const box = Array.from(shape.children).find((child) => child.localName === 'Bounds');
    if (id && box) {
      bounds.set(id, {
        x: Number(box.getAttribute('x')) || 0,
        y: Number(box.getAttribute('y')) || 0,
        width: Number(box.getAttribute('width')) || 176,
        height: Number(box.getAttribute('height')) || 72,
      });
    }
  }
  const nodes: FlowNode[] = [];
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    const kind = nodeTypes[element.localName];
    const id = element.getAttribute('id');
    if (!kind || !id) continue;
    const box = bounds.get(id);
    const node = createFlowNode(kind, box ? { x: box.x, y: box.y } : { x: 0, y: 0 }, element.getAttribute('name') || element.textContent?.trim() || element.localName, { id });
    if (box) node.style = { width: box.width, height: box.height };
    nodes.push(node);
  }
  const edges = localElements(document, 'sequenceFlow')
    .map((element) => {
      const sourceId = element.getAttribute('sourceRef');
      const targetId = element.getAttribute('targetRef');
      return sourceId && targetId
        ? createFlowEdge(sourceId, targetId, element.getAttribute('name') || undefined)
        : null;
    })
    .filter((edge): edge is FlowEdge => Boolean(edge));

  return {
    nodes,
    edges,
    direction: 'LR',
    warnings: bounds.size < nodes.length ? ['部分 BPMN 图元缺少 DI 坐标，已为其自动布局。'] : [],
  };
}

function parsePlantUml(source: string): ParsedTextGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const warnings: string[] = [];
  type PendingConnection = { node: FlowNode; label?: string };
  interface DecisionFrame {
    decision: FlowNode;
    branchEnds: PendingConnection[];
  }
  let previous: PendingConnection[] = [];
  const decisionStack: DecisionFrame[] = [];

  const appendNode = (kind: ShapeKind, label: string) => {
    const current = createFlowNode(kind, { x: 0, y: 0 }, label, { id: `plantuml-${nodes.length + 1}` });
    nodes.push(current);
    for (const connection of previous) {
      edges.push(createFlowEdge(connection.node.id, current.id, connection.label));
    }
    previous = [{ node: current }];
    return current;
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^@(?:start|end)uml/i.test(line) || /^skinparam/i.test(line)) continue;
    if (/^start$/i.test(line)) {
      appendNode('start', '开始');
    } else if (/^(stop|end)$/i.test(line)) {
      appendNode('start', '结束');
    } else if (/^:[\s\S]*;$/i.test(line)) {
      appendNode('process', line.slice(1, -1).trim());
    } else if (/^if\s*\((.+)\)/i.test(line)) {
      const match = line.match(/^if\s*\((.+)\)\s*then(?:\s*\((.+)\))?/i);
      const current = appendNode('decision', match?.[1] ?? '判断');
      decisionStack.push({ decision: current, branchEnds: [] });
      previous = [{ node: current, label: match?.[2]?.trim() || undefined }];
    } else if (/^else\b/i.test(line)) {
      const frame = decisionStack.at(-1);
      if (!frame) {
        warnings.push(`未匹配的 PlantUML else：${line}`);
        continue;
      }
      frame.branchEnds.push(...previous);
      const label = line.match(/^else(?:\s*\((.+)\))?/i)?.[1]?.trim();
      previous = [{ node: frame.decision, label: label || undefined }];
    } else if (/^elseif\b/i.test(line)) {
      warnings.push(`暂不支持 PlantUML elseif，请改用嵌套 if：${line}`);
    } else if (/^endif/i.test(line)) {
      const frame = decisionStack.pop();
      if (!frame) {
        warnings.push(`未匹配的 PlantUML endif：${line}`);
        continue;
      }
      frame.branchEnds.push(...previous);
      previous = frame.branchEnds;
    } else if (/^note\s+/i.test(line)) {
      appendNode('note', line.replace(/^note\s+(?:left|right|top|bottom)?\s*/i, '') || '注释');
    } else {
      warnings.push(`未识别 PlantUML 语句：${line}`);
    }
  }
  if (decisionStack.length > 0) warnings.push('PlantUML 中存在未闭合的 if 块。');
  return { nodes, edges, direction: 'TB', warnings };
}

function parseCsv(source: string): ParsedTextGraph {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index] ?? '\n';
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field.trim());
      field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  const headers = rows.shift()?.map((value) => value.toLowerCase()) ?? [];
  const sourceIndex = headers.findIndex((value) => ['source', 'from', '起点'].includes(value));
  const targetIndex = headers.findIndex((value) => ['target', 'to', '终点'].includes(value));
  const labelIndex = headers.findIndex((value) => ['label', 'name', '标签'].includes(value));
  if (sourceIndex < 0 || targetIndex < 0) throw new Error('CSV 需要 source 和 target 两列。');
  const map = new Map<string, FlowNode>();
  const edges = rows.flatMap((values) => {
    const sourceId = values[sourceIndex];
    const targetId = values[targetIndex];
    if (!sourceId || !targetId) return [];
    addTextNode(map, sourceId);
    addTextNode(map, targetId);
    return [createFlowEdge(sourceId, targetId, labelIndex >= 0 ? values[labelIndex] : undefined)];
  });
  return { nodes: [...map.values()], edges, direction: 'LR', warnings: [] };
}

function parseExcalidraw(value: Record<string, unknown>): ParsedTextGraph {
  const elements = Array.isArray(value.elements) ? (value.elements as Array<Record<string, unknown>>) : [];
  const textByContainer = new Map<string, string>();
  for (const element of elements) {
    if (element.type === 'text' && typeof element.containerId === 'string') {
      textByContainer.set(element.containerId, String(element.text ?? ''));
    }
  }
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const warnings: string[] = [];
  for (const element of elements) {
    if (element.isDeleted) continue;
    const id = String(element.id ?? createId('node'));
    if (['rectangle', 'diamond', 'ellipse'].includes(String(element.type))) {
      const kind: ShapeKind = element.type === 'diamond' ? 'decision' : element.type === 'ellipse' ? 'start' : 'process';
      const node = createFlowNode(kind, { x: Number(element.x) || 0, y: Number(element.y) || 0 }, textByContainer.get(id) || '未命名', {
        id,
        style: { width: Math.max(48, Number(element.width) || 176), height: Math.max(36, Number(element.height) || 72) },
      });
      node.data = {
        ...node.data,
        fill: String(element.backgroundColor || node.data.fill),
        stroke: String(element.strokeColor || node.data.stroke),
        borderWidth: Number(element.strokeWidth) || node.data.borderWidth,
        opacity: Math.max(0, Math.min(1, Number(element.opacity ?? 100) / 100)),
      };
      nodes.push(node);
    }
    if (element.type === 'arrow') {
      const source = (element.startBinding as Record<string, unknown> | null)?.elementId;
      const target = (element.endBinding as Record<string, unknown> | null)?.elementId;
      if (typeof source === 'string' && typeof target === 'string') {
        const edge = createFlowEdge(source, target, undefined, 'straight');
        edge.id = id;
        edges.push(edge);
      } else {
        warnings.push(`跳过了未绑定图元的箭头 ${id}。`);
      }
    }
  }
  return { nodes, edges, direction: 'TB', warnings };
}

function parseNative(value: Record<string, unknown>, title: string): ImportResult {
  if (Array.isArray(value.elements)) {
    const parsed = parseExcalidraw(value);
    const graph = normalizeGraph(parsed.nodes, parsed.edges);
    return { title, ...graph, fidelity: parsed.warnings.length ? 'hybrid' : 'structural', sourceFormat: 'Excalidraw', warnings: parsed.warnings };
  }
  if (Array.isArray(value.pages)) {
    const pages = (value.pages as Array<Record<string, unknown>>).map((page, index): DiagramPage => {
      const nodes = Array.isArray(page.nodes) ? page.nodes as FlowNode[] : [];
      const edges = Array.isArray(page.edges) ? page.edges as FlowEdge[] : [];
      const graph = normalizeGraph(nodes, edges);
      return {
        id: typeof page.id === 'string' ? page.id : `page-${index + 1}`,
        name: typeof page.name === 'string' ? page.name : `页面 ${index + 1}`,
        ...graph,
        layers: Array.isArray(page.layers) && page.layers.length
          ? page.layers as DiagramPage['layers']
          : [createDefaultLayer()],
        scientific: page.scientific && typeof page.scientific === 'object'
          ? page.scientific as DiagramPage['scientific']
          : undefined,
      };
    });
    if (pages.length === 0) throw new Error('Flowloom JSON 中没有可识别的页面。');
    const requestedPageId = typeof value.activePageId === 'string' ? value.activePageId : pages[0].id;
    const active = pages.find((page) => page.id === requestedPageId) ?? pages[0];
    return {
      title: typeof value.title === 'string' ? value.title : title,
      nodes: active.nodes,
      edges: active.edges,
      pages,
      activePageId: active.id,
      fidelity: 'structural',
      sourceFormat: 'Flowloom JSON v2',
      warnings: [],
    };
  }
  const nodes = Array.isArray(value.nodes) ? (value.nodes as FlowNode[]) : [];
  const edges = Array.isArray(value.edges) ? (value.edges as FlowEdge[]) : [];
  if (nodes.length === 0) throw new Error('JSON 中没有可识别的 nodes 数组。');
  const graph = normalizeGraph(nodes, edges);
  return {
    title: typeof value.title === 'string' ? value.title : title,
    ...graph,
    fidelity: 'structural',
    sourceFormat: 'Flowloom JSON',
    warnings: [],
  };
}

function importTextGraph(parsed: ParsedTextGraph, title: string, sourceFormat: string): ImportResult {
  if (parsed.nodes.length === 0) throw new Error(`${sourceFormat} 中没有识别出可编辑节点。`);
  const hasPositions = parsed.nodes.some((node) => node.position.x !== 0 || node.position.y !== 0);
  const graph = hasPositions ? { nodes: parsed.nodes, edges: parsed.edges } : layoutGraph(parsed.nodes, parsed.edges, parsed.direction);
  return {
    title,
    ...normalizeGraph(graph.nodes, graph.edges),
    fidelity: parsed.warnings.length ? 'hybrid' : 'structural',
    sourceFormat,
    warnings: parsed.warnings,
  };
}

export function importDiagramSource(
  source: string,
  format: CodeDiagramFormat,
  title = '代码流程图',
): ImportResult {
  if (!source.trim()) throw new Error('请输入流程图代码。');
  if (format === 'mermaid') return importTextGraph(parseMermaid(source), title, 'Mermaid');
  if (format === 'dot') return importTextGraph(parseDot(source), title, 'Graphviz DOT');
  return importTextGraph(parsePlantUml(source), title, 'PlantUML');
}

async function importVsdx(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(await readFileBuffer(file));
  const pageFiles = Object.values(zip.files).filter((entry) => /visio\/pages\/page\d+\.xml$/i.test(entry.name));
  if (pageFiles.length === 0) throw new Error('VSDX 中没有找到 Visio 页面数据。');
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const warnings = ['Visio 母版、复杂几何和主题效果将近似转换；原文件不会被修改。'];

  for (let pageIndex = 0; pageIndex < pageFiles.length; pageIndex += 1) {
    const source = await pageFiles[pageIndex].async('text');
    const document = new DOMParser().parseFromString(source, 'application/xml');
    const shapeIds = new Map<string, string>();
    const connectorIds = new Set<string>();
    for (const shape of localElements(document, 'Shape')) {
      const originalId = shape.getAttribute('ID');
      if (!originalId) continue;
      const cells = new Map(
        Array.from(shape.children)
          .filter((child) => child.localName === 'Cell')
          .map((cell) => [cell.getAttribute('N') ?? '', Number(cell.getAttribute('V')) || 0]),
      );
      const width = Math.max(48, (cells.get('Width') || 2) * 96);
      const height = Math.max(36, (cells.get('Height') || 0.75) * 96);
      const pinX = (cells.get('PinX') || 1) * 96;
      const pinY = (cells.get('PinY') || 1) * 96;
      const text = localElements(shape.ownerDocument, 'Text').find((element) => element.parentElement === shape)?.textContent?.trim();
      const isConnector = shape.getAttribute('NameU')?.toLowerCase().includes('connector') || shape.getAttribute('Type') === 'Foreign';
      if (isConnector) {
        connectorIds.add(originalId);
        continue;
      }
      const id = `p${pageIndex + 1}-${originalId}`;
      shapeIds.set(originalId, id);
      const name = shape.getAttribute('NameU')?.toLowerCase() ?? '';
      const kind: ShapeKind = name.includes('decision') || name.includes('diamond') ? 'decision' : name.includes('database') ? 'database' : name.includes('document') ? 'document' : name.includes('terminator') ? 'start' : 'process';
      nodes.push(createFlowNode(kind, { x: pinX - width / 2 + pageIndex * 80, y: Math.max(0, 900 - pinY - height / 2) }, text || shape.getAttribute('Name') || '未命名', { id, style: { width, height } }));
    }
    const connects = localElements(document, 'Connect');
    const byConnector = new Map<string, string[]>();
    for (const connect of connects) {
      const from = connect.getAttribute('FromSheet');
      const to = connect.getAttribute('ToSheet');
      if (!from || !to || !connectorIds.has(from) || !shapeIds.has(to)) continue;
      byConnector.set(from, [...(byConnector.get(from) ?? []), shapeIds.get(to)!]);
    }
    for (const targets of byConnector.values()) {
      if (targets.length >= 2) edges.push(createFlowEdge(targets[0], targets[1]));
    }
  }
  if (nodes.length === 0) throw new Error('VSDX 页面中没有识别出可编辑图元。');
  return { title: file.name.replace(/\.vsdx$/i, ''), nodes, edges, fidelity: 'hybrid', sourceFormat: 'Visio VSDX', warnings };
}

async function visualReference(file: File): Promise<ImportResult> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  let width = 720;
  let height = 480;
  if (file.type.startsWith('image/')) {
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = dataUrl;
      });
      const scale = Math.min(1, 960 / Math.max(dimensions.width, dimensions.height));
      width = Math.max(240, dimensions.width * scale);
      height = Math.max(160, dimensions.height * scale);
    } catch {
      // The generic dimensions still preserve the source object.
    }
  }
  const node = createFlowNode('image', { x: 80, y: 80 }, file.name, {
    style: { width, height },
  });
  node.data = { ...node.data, imageUrl: dataUrl, sourceRef: file.name, locked: false };
  return {
    title: file.name.replace(/\.[^.]+$/, ''),
    nodes: [node],
    edges: [],
    fidelity: 'visual',
    sourceFormat: file.type || extensionOf(file.name).toUpperCase(),
    warnings: ['已按原貌导入为视觉参考对象。若要拆分为独立图元，请在 AI 面板中选择“重建当前参考图”。'],
  };
}

export interface PdfImportContext {
  paperRef?: string;
  paperfieldId?: string;
  sourceHash?: string;
  url?: string;
}

export interface PdfImportOptions {
  /** Import every page when omitted; Paperfield uses this to request only the active page. */
  pageNumbers?: readonly number[];
  /** Bound the browser graph size while retaining the locked original page for comparison. */
  maxEditableNodesPerPage?: number;
}

function createPdfProvenance(
  sourceName: string,
  page: number,
  context: PdfImportContext | undefined,
  fidelity: ImportResult['fidelity'],
  warnings: string[],
): DiagramProvenance {
  return {
    schemaVersion: 1,
    sourceType: 'pdf-extraction',
    paperRef: context?.paperRef,
    paperfieldId: context?.paperfieldId,
    page,
    sourceHash: context?.sourceHash,
    quote: `Extracted from ${sourceName}, page ${page}`,
    libraryElements: ['pdf-vector-primitives', 'pdf-text-layer'],
    confidence: fidelity === 'structural' ? 0.96 : fidelity === 'hybrid' ? 0.78 : 0.35,
    warnings,
  };
}

function decoratePdfVectors(
  nodes: FlowNode[],
  layerId: string,
  sourceName: string,
  page: number,
  provenance: DiagramProvenance,
  context?: PdfImportContext,
): FlowNode[] {
  return nodes.map((node) => ({
    ...node,
    zIndex: node.zIndex ?? 2,
    draggable: true,
    data: {
      ...node.data,
      layerId,
      locked: false,
      sourceRef: `${sourceName}#page=${page}`,
      provenanceRef: `pdf:p${page}`,
      diagramProvenance: provenance,
      scientificEvidence: 'schematic',
      researchSourceLocator: {
        kind: 'figure',
        canonicalPaperRef: context?.paperRef,
        paperfieldId: context?.paperfieldId,
        url: context?.url,
        page,
        figure: node.data.label,
        contentSha256: context?.sourceHash,
      },
    },
  }));
}

function createPdfReference(
  imageUrl: string,
  sourceName: string,
  page: number,
  width: number,
  height: number,
  layerId: string,
  provenance: DiagramProvenance,
  context?: PdfImportContext,
): FlowNode {
  const node = createFlowNode('image', { x: 0, y: 0 }, `${sourceName} · p.${page}`, {
    id: createId(`pdf-reference-${page}`),
    style: { width, height },
  });
  node.zIndex = -1000;
  node.draggable = false;
  node.data = {
    ...node.data,
    imageUrl,
    imageFit: 'contain',
    sourceRef: `${sourceName}#page=${page}`,
    layerId,
    hidden: false,
    locked: true,
    provenance: {
      id: createId(`pdf-provenance-${page}`),
      kind: 'imported-asset',
      sourceName,
      sourceFormat: 'PDF / editable SVG',
      sourceData: JSON.stringify(provenance),
      generatedAt: new Date().toISOString(),
    },
    diagramProvenance: provenance,
    researchSourceLocator: {
      kind: 'figure',
      canonicalPaperRef: context?.paperRef,
      paperfieldId: context?.paperfieldId,
      url: context?.url,
      page,
      contentSha256: context?.sourceHash,
    },
    researchFigureContext: {
      schemaVersion: 1,
      figureId: `${sourceName}-page-${page}`,
      assetKind: 'raster-page',
      assetSha256: context?.sourceHash,
      producer: 'flowloom',
      producedAt: new Date().toISOString(),
    },
  };
  return node;
}

/**
 * Import PDF bytes as separate Flowloom pages. Every page contains a locked
 * raster reference layer and an editable layer made from PDF.js vectors/text.
 */
export async function importPdfBuffer(
  bytes: ArrayBuffer | Uint8Array,
  title = 'PDF',
  sourceName = `${title}.pdf`,
  context?: PdfImportContext,
  options: PdfImportOptions = {},
): Promise<ImportResult> {
  const [{ getDocument, GlobalWorkerOptions, OPS }, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = getDocument({ data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;
  const pages: DiagramPage[] = [];
  const warnings: string[] = [];
  let editablePages = 0;
  let editablePrimitives = 0;
  let textPrimitives = 0;
  let rasterOperations = 0;
  let unsupportedOperations = 0;
  let omittedPrimitives = 0;
  const requestedPages = options.pageNumbers?.length
    ? [...new Set(options.pageNumbers.filter((page) => Number.isInteger(page) && page >= 1 && page <= pdf.numPages))]
    : Array.from({ length: pdf.numPages }, (_value, index) => index + 1);
  if (requestedPages.length === 0) {
    await loadingTask.destroy();
    throw new Error('The requested PDF page does not exist.');
  }
  const maxEditableNodesPerPage = Math.max(100, Math.floor(options.maxEditableNodesPerPage ?? 2400));

  try {
    for (const pageNumber of requestedPages) {
      const page = await pdf.getPage(pageNumber);
      const naturalViewport = page.getViewport({ scale: 1 });
      const displayScale = Math.min(1, 960 / Math.max(naturalViewport.width, naturalViewport.height));
      const displayViewport = page.getViewport({ scale: displayScale });
      const rasterScale = Math.min(2, 2400 / Math.max(displayViewport.width, displayViewport.height));
      const renderViewport = page.getViewport({ scale: displayScale * rasterScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));
      const context2d = canvas.getContext('2d', { alpha: false });
      if (!context2d) throw new Error(`Unable to create a canvas for PDF page ${pageNumber}.`);
      await page.render({ canvas, canvasContext: context2d, viewport: renderViewport, background: '#ffffff' }).promise;

      const textContent = await page.getTextContent({ includeMarkedContent: false });
      const operatorList = await page.getOperatorList();
      const extraction = pdfOperatorListToSvg({
        width: naturalViewport.width,
        height: naturalViewport.height,
        fnArray: operatorList.fnArray,
        argsArray: operatorList.argsArray as readonly unknown[][],
        ops: OPS as unknown as Record<string, number>,
        textItems: textContent.items as PdfTextItemLike[],
      });
      const pageFidelity: ImportResult['fidelity'] = extraction.vectorCount + extraction.textCount === 0
        ? 'visual'
        : extraction.imageCount > 0 || extraction.unsupportedCount > 0 ? 'hybrid' : 'structural';
      const pageWarnings = [...extraction.warnings];
      if (pageFidelity !== 'structural') pageWarnings.push('The rendered page is retained in a locked reference layer.');
      const provenance = createPdfProvenance(sourceName, pageNumber, context, pageFidelity, pageWarnings);
      let parsed = { nodes: [] as FlowNode[], edges: [] as FlowEdge[], warnings: [] as string[] };
      if (extraction.vectorCount + extraction.textCount > 0) {
        try {
          parsed = parseEditableSvg(extraction.svg, `${sourceName}#page=${pageNumber}`);
        } catch (error) {
          pageWarnings.push(error instanceof Error ? error.message : 'Generated SVG could not be parsed.');
        }
      }
      pageWarnings.push(...parsed.warnings);
      const vectorLayerId = createId(`pdf-vector-layer-${pageNumber}`);
      const textLayerId = createId(`pdf-text-layer-${pageNumber}`);
      const referenceLayerId = createId(`pdf-reference-layer-${pageNumber}`);
      const parsedVectorNodes = parsed.nodes.filter((node) => node.data.vector?.tag !== 'text');
      const parsedTextNodes = parsed.nodes.filter((node) => node.data.vector?.tag === 'text');
      const reservedTextNodes = Math.min(parsedTextNodes.length, Math.max(120, Math.floor(maxEditableNodesPerPage * 0.25)));
      const selectedVectorNodes = parsedVectorNodes.slice(0, Math.max(0, maxEditableNodesPerPage - reservedTextNodes));
      const selectedTextNodes = parsedTextNodes.slice(0, Math.max(0, maxEditableNodesPerPage - selectedVectorNodes.length));
      const omittedOnPage = parsed.nodes.length - selectedVectorNodes.length - selectedTextNodes.length;
      if (omittedOnPage > 0) {
        pageWarnings.push(`${omittedOnPage} low-priority primitives exceeded the per-page editing limit and remain visible in the original reference layer.`);
      }
      const editableVectorNodes = decoratePdfVectors(selectedVectorNodes, vectorLayerId, sourceName, pageNumber, provenance, context);
      const editableTextNodes = decoratePdfVectors(selectedTextNodes, textLayerId, sourceName, pageNumber, provenance, context);
      const editableNodes = [...editableVectorNodes, ...editableTextNodes];
      const reference = createPdfReference(
        canvas.toDataURL('image/png'),
        sourceName,
        pageNumber,
        naturalViewport.width,
        naturalViewport.height,
        referenceLayerId,
        provenance,
        context,
      );
      const pageNodes = [reference, ...editableNodes];
      const pageId = createId(`pdf-page-${pageNumber}`);
      pages.push({
        id: pageId,
        name: pdf.numPages === 1 ? title : `${title} · p.${pageNumber}`,
        nodes: pageNodes,
        edges: parsed.edges,
        layers: [
          { id: referenceLayerId, name: '原始 PDF 参考', visible: editableNodes.length === 0, locked: true },
          { id: vectorLayerId, name: '可编辑矢量几何', visible: true, locked: false },
          { id: textLayerId, name: '可编辑文字', visible: true, locked: false },
        ],
      });
      if (editableNodes.length > 0) editablePages += 1;
      editablePrimitives += editableVectorNodes.length;
      textPrimitives += editableTextNodes.length;
      rasterOperations += extraction.imageCount;
      unsupportedOperations += extraction.unsupportedCount;
      omittedPrimitives += omittedOnPage;
      warnings.push(...pageWarnings.map((warning) => `p.${pageNumber}: ${warning}`));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  const active = pages[0] ?? { id: 'pdf-page-1', name: title, nodes: [], edges: [], layers: [createDefaultLayer()] };
  const fidelity: ImportResult['fidelity'] = editablePrimitives + textPrimitives === 0
    ? 'visual'
    : rasterOperations > 0 || unsupportedOperations > 0 ? 'hybrid' : 'structural';
  const pdfExtraction: PdfExtractionSummary = {
    sourcePageCount: pdf.numPages,
    pageCount: pages.length,
    editablePages,
    editablePrimitives,
    textPrimitives,
    rasterOperations,
    unsupportedOperations,
    omittedPrimitives,
    fidelity,
  };
  if (pages.length !== pdf.numPages) warnings.unshift(`${pages.length} selected ${pages.length === 1 ? 'page was' : 'pages were'} imported from the ${pdf.numPages}-page PDF.`);
  else if (pages.length > 1) warnings.unshift(`${pages.length} PDF pages were imported as separate Flowloom pages.`);
  warnings.unshift(`${editablePrimitives + textPrimitives} editable SVG primitives were extracted; raster and unsupported effects stay in hidden reference layers.`);
  return {
    title,
    nodes: active.nodes,
    edges: active.edges,
    pages,
    activePageId: active.id,
    fidelity,
    sourceFormat: 'PDF / editable SVG',
    warnings,
    pdfExtraction,
  };
}

async function importPdf(file: File): Promise<ImportResult> {
  return importPdfBuffer(await readFileBuffer(file), file.name.replace(/\.pdf$/i, ''), file.name);
}

export async function importDiagramFile(file: File): Promise<ImportResult> {
  const extension = extensionOf(file.name);
  const title = file.name.replace(/\.[^.]+$/, '');
  if (extension === 'vsdx') return importVsdx(file);
  if (extension === 'pdf') return importPdf(file);
  if (!STRUCTURED_EXTENSIONS.has(extension)) return visualReference(file);
  const source = await readFileText(file);

  if (extension === 'drawio') return importDrawio(source, title);
  if (extension === 'bpmn') return importTextGraph(parseBpmn(source), title, 'BPMN 2.0');
  if (extension === 'mmd' || extension === 'mermaid') return importDiagramSource(source, 'mermaid', title);
  if (extension === 'dot' || extension === 'gv') return importDiagramSource(source, 'dot', title);
  if (extension === 'puml' || extension === 'plantuml') return importDiagramSource(source, 'plantuml', title);
  if (extension === 'csv') return importTextGraph(parseCsv(source), title, 'CSV edge list');
  if (extension === 'svg') {
    const blob = new File([source], file.name, { type: 'image/svg+xml' });
    const parsed = parseEditableSvg(source, file.name);
    if (parsed.nodes.length === 0) return visualReference(blob);
    const editableLayerId = createId('svg-editable-layer');
    const nodes: FlowNode[] = parsed.nodes.map((node) => ({
      ...node,
      data: { ...node.data, layerId: editableLayerId },
    }));
    const edges = parsed.edges;
    let layers: DiagramPage['layers'] = [{ id: editableLayerId, name: '可编辑图元', visible: true, locked: false }];
    if (parsed.unsupportedCount > 0) {
      const referenceLayerId = createId('svg-reference-layer');
      const reference = createFlowNode('image', { x: parsed.sourceBounds.x, y: parsed.sourceBounds.y }, `${file.name} 原图参考`, {
        id: createId('svg-reference'),
        style: { width: parsed.sourceBounds.width, height: parsed.sourceBounds.height },
      });
      reference.zIndex = -1000;
      reference.hidden = true;
      reference.draggable = false;
      reference.data = {
        ...reference.data,
        imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`,
        sourceRef: file.name,
        layerId: referenceLayerId,
        hidden: false,
        locked: true,
      };
      nodes.unshift(reference);
      layers = [
        { id: referenceLayerId, name: '原图参考', visible: false, locked: true },
        ...layers,
      ];
    }
    const pageId = createId('svg-page');
    return {
      title,
      nodes,
      edges,
      pages: [{ id: pageId, name: title, nodes, edges, layers }],
      activePageId: pageId,
      fidelity: parsed.unsupportedCount > 0 ? 'hybrid' : 'structural',
      sourceFormat: 'SVG',
      warnings: parsed.warnings,
    };
  }
  if (extension === 'yaml' || extension === 'yml') {
    const parsed = parseYaml(source) as Record<string, unknown>;
    return parseNative(parsed, title);
  }
  if (extension === 'json' || extension === 'flow' || extension === 'excalidraw') {
    return parseNative(JSON.parse(source) as Record<string, unknown>, title);
  }
  if (extension === 'xml') {
    if (/<(?:\w+:)?definitions\b/i.test(source) && /bpmn/i.test(source)) return importTextGraph(parseBpmn(source), title, 'BPMN 2.0');
    if (/<mx(?:file|GraphModel)\b/i.test(source)) return importDrawio(source, title);
  }

  return visualReference(file);
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function mxStyle(node: FlowNode): string {
  const shape = getShapeDefinition(node.data.kind).drawioStyle;
  const description = node.data.description ? encodeURIComponent(node.data.description) : '';
  const vector = node.data.vector ? encodeURIComponent(JSON.stringify(node.data.vector)) : '';
  return `${shape};flowloomKind=${node.data.kind};flowloomFontWeight=${node.data.fontWeight};flowloomRadius=${node.data.radius};flowloomRotation=${node.data.rotation ?? 0};flowloomVector=${vector};flowloomTextAlign=${node.data.textAlign};flowloomVerticalAlign=${node.data.verticalAlign};flowloomDescription=${description};flowloomLocked=${node.data.locked ? 1 : 0};whiteSpace=wrap;html=1;fillColor=${node.data.fill};strokeColor=${node.data.stroke};fontColor=${node.data.textColor};strokeWidth=${node.data.borderWidth};fontSize=${node.data.fontSize};fontStyle=${node.data.fontWeight >= 700 ? 1 : 0};align=${node.data.textAlign};verticalAlign=${node.data.verticalAlign};opacity=${Math.round(node.data.opacity * 100)};`;
}

function mxArrow(kind: ArrowHead | undefined): string {
  return kind === 'none' ? 'none' : kind === 'open' ? 'open' : 'block';
}

function serializeDrawioModel(nodes: FlowNode[], edges: FlowEdge[], layers: DiagramPage['layers']): string {
  const safeLayers = layers.length ? layers : [createDefaultLayer()];
  const layerIds = new Set(safeLayers.map((layer) => layer.id));
  const layerCells = safeLayers.map((layer) => `<mxCell id="${xmlEscape(layer.id)}" value="${xmlEscape(layer.name)}" parent="0"${layer.visible ? '' : ' visible="0"'}${layer.locked ? ' locked="1"' : ''}/>`).join('');
  const nodeCells = nodes.map((node) => {
    const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? SHAPE_DIMENSIONS[node.data.kind].width);
    const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? SHAPE_DIMENSIONS[node.data.kind].height);
    const parent = node.parentId ?? (layerIds.has(node.data.layerId ?? '') ? node.data.layerId : safeLayers[0].id);
    return `<mxCell id="${xmlEscape(node.id)}" value="${xmlEscape(node.data.label)}" style="${xmlEscape(mxStyle(node))}" vertex="1" parent="${xmlEscape(parent)}"${node.data.hidden ? ' visible="0"' : ''}${node.data.locked ? ' locked="1"' : ''}><mxGeometry x="${node.position.x}" y="${node.position.y}" width="${width}" height="${height}" as="geometry"/></mxCell>`;
  }).join('');
  const edgeCells = edges.map((edge) => {
    const routing = edge.data?.routing ?? 'smoothstep';
    const routeStyle = routing === 'smoothstep' ? 'edgeStyle=orthogonalEdgeStyle;rounded=0' : routing === 'bezier' ? 'curved=1' : 'edgeStyle=none';
    const style = `${routeStyle};html=1;strokeColor=${edge.data?.color ?? '#555555'};strokeWidth=${edge.data?.width ?? 1.75};dashed=${edge.data?.lineStyle === 'solid' ? 0 : 1};dashPattern=${edge.data?.lineStyle === 'dotted' ? '1 4' : '8 6'};startArrow=${mxArrow(edge.data?.arrowStart)};endArrow=${mxArrow(edge.data?.arrowEnd)};`;
    return `<mxCell id="${xmlEscape(edge.id)}" value="${xmlEscape(edge.data?.label ?? edge.label ?? '')}" style="${xmlEscape(style)}" edge="1" parent="${xmlEscape(safeLayers[0].id)}" source="${xmlEscape(edge.source)}" target="${xmlEscape(edge.target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
  }).join('');
  return `<mxGraphModel grid="1" gridSize="10" page="1" pageScale="1" pageWidth="1169" pageHeight="827"><root><mxCell id="0"/>${layerCells}${nodeCells}${edgeCells}</root></mxGraphModel>`;
}

export function serializeDrawio(
  title: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  pages?: DiagramPage[],
  activePageId?: string,
): string {
  const documentPages = pages?.length
    ? pages.map((page) => page.id === activePageId ? { ...page, nodes, edges } : page)
    : [{ id: 'flowloom', name: title, nodes, edges, layers: [createDefaultLayer()] }];
  const diagrams = documentPages.map((page) => `<diagram id="${xmlEscape(page.id)}" name="${xmlEscape(page.name)}">${serializeDrawioModel(page.nodes, page.edges, page.layers)}</diagram>`).join('');
  return `<mxfile host="Flowloom" modified="${new Date().toISOString()}">${diagrams}</mxfile>`;
}

function mermaidShape(node: FlowNode): string {
  const label = node.data.label.replaceAll('"', '&quot;');
  if (node.data.kind === 'start' || node.data.kind === 'bpmn-start-event' || node.data.kind === 'bpmn-end-event') return `(["${label}"])`;
  if (node.data.kind === 'decision' || node.data.kind.includes('gateway')) return `{\"${label}\"}`;
  if (node.data.kind === 'database' || node.data.kind === 'bpmn-data-store') return `[(\"${label}\")]`;
  if (node.data.kind === 'data' || node.data.kind === 'stored-data') return `[/\"${label}\"/]`;
  if (node.data.kind === 'ellipse' || node.data.kind === 'uml-use-case') return `(["${label}"])`;
  return `["${label}"]`;
}

function safeDiagramId(id: string): string {
  return `n_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

export function serializeMermaid(nodes: FlowNode[], edges: FlowEdge[], direction: 'TB' | 'LR' = 'TB'): string {
  const lines = [`flowchart ${direction}`];
  nodes.forEach((node) => lines.push(`  ${safeDiagramId(node.id)}${mermaidShape(node)}`));
  edges.forEach((edge) => {
    const label = String(edge.data?.label ?? edge.label ?? '').replaceAll('|', '/');
    lines.push(`  ${safeDiagramId(edge.source)} -->${label ? `|${label}|` : ''} ${safeDiagramId(edge.target)}`);
  });
  return `${lines.join('\n')}\n`;
}

export function serializeDot(title: string, nodes: FlowNode[], edges: FlowEdge[]): string {
  const lines = [`digraph "${title.replaceAll('"', '\\"')}" {`, '  rankdir=TB;'];
  for (const node of nodes) {
    const shape = node.data.kind === 'decision' || node.data.kind.includes('gateway')
      ? 'diamond'
      : node.data.kind === 'start' || node.data.kind === 'ellipse' || node.data.kind.includes('event') || node.data.kind === 'uml-use-case'
        ? 'ellipse'
        : node.data.kind === 'database' || node.data.kind === 'bpmn-data-store'
          ? 'cylinder'
          : node.data.kind === 'triangle' || node.data.kind === 'extract'
            ? 'triangle'
            : node.data.kind === 'hexagon' || node.data.kind === 'preparation'
              ? 'hexagon'
              : 'box';
    lines.push(`  "${node.id}" [label="${node.data.label.replaceAll('"', '\\"')}", shape=${shape}];`);
  }
  for (const edge of edges) {
    const label = edge.data?.label ?? edge.label;
    lines.push(`  "${edge.source}" -> "${edge.target}"${label ? ` [label="${String(label).replaceAll('"', '\\"')}"]` : ''};`);
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function serializeCsv(nodes: FlowNode[], edges: FlowEdge[]): string {
  const labels = new Map(nodes.map((node) => [node.id, node.data.label]));
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return ['source,target,label,source_name,target_name', ...edges.map((edge) => [edge.source, edge.target, edge.data?.label ?? edge.label ?? '', labels.get(edge.source) ?? '', labels.get(edge.target) ?? ''].map(quote).join(','))].join('\n');
}

export function serializeDocument(
  title: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  pages?: DiagramPage[],
  activePageId?: string,
): string {
  const now = new Date().toISOString();
  const documentPages = pages?.length
    ? pages.map((page) => page.id === activePageId ? { ...page, nodes, edges } : page)
    : [{ id: 'page-1', name: '页面 1', nodes, edges, layers: [createDefaultLayer()] }];
  return JSON.stringify({
    version: 2,
    title,
    activePageId: activePageId ?? documentPages[0].id,
    pages: documentPages,
    meta: { createdAt: now, updatedAt: now, sourceFormat: 'Flowloom', fidelity: 'structural' },
  }, null, 2);
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function supportedImportSummary(): string[] {
  return [
    'Flowloom JSON / YAML',
    'draw.io / diagrams.net XML',
    'Mermaid / Graphviz DOT / PlantUML',
    'BPMN 2.0 / Excalidraw / CSV edge list',
    'Visio VSDX（基础结构）',
    'SVG（基础图元可编辑，复杂效果混合保真）',
    'PNG / JPG / WebP（视觉参考）',
    'PDF（可编辑 SVG 图元 + 原图参考层）',
  ];
}

export function detectReferenceNode(nodes: FlowNode[]): FlowNode | undefined {
  return nodes.find((node) => node.data.kind === 'image' && node.data.imageUrl);
}

const AI_SCHEMATIC_ROLES = new Set([
  'frame',
  'phase',
  'modality',
  'token',
  'encoder',
  'bridge',
  'backbone',
  'policy',
  'action',
  'environment',
  'memory',
  'dataset',
  'loss',
  'annotation',
]);

const AI_ROLE_KINDS: Record<string, ShapeKind> = {
  frame: 'group',
  phase: 'group',
  modality: 'rounded-rectangle',
  token: 'rounded-rectangle',
  encoder: 'process',
  bridge: 'hexagon',
  backbone: 'rounded-rectangle',
  policy: 'rounded-rectangle',
  action: 'rounded-rectangle',
  environment: 'ellipse',
  memory: 'database',
  dataset: 'database',
  loss: 'note',
  annotation: 'note',
};

function boundedAiNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function safeAiColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length > 80) return fallback;
  const color = value.trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|transparent)$/i.test(color) ? color : fallback;
}

export function aiPayloadToGraph(
  value: unknown,
  diagramProvenance?: DiagramProvenance,
): { title: string; nodes: FlowNode[]; edges: FlowEdge[]; direction: 'TB' | 'LR' } {
  if (!value || typeof value !== 'object') throw new Error('AI 返回内容不是有效对象。');
  const payload = value as Record<string, unknown>;
  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes as Array<Record<string, unknown>> : [];
  const rawEdges = Array.isArray(payload.edges) ? payload.edges as Array<Record<string, unknown>> : [];
  if (rawNodes.length === 0) throw new Error('AI 返回内容没有 nodes。');
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  const nodes = rawNodes.map((raw, index) => {
    const sourceId = String(raw.id ?? `node-${index + 1}`);
    const baseId = sourceId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `node-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    idMap.set(sourceId, id);
    const role = typeof raw.role === 'string' && AI_SCHEMATIC_ROLES.has(raw.role) ? raw.role : undefined;
    const kind = isShapeKind(raw.kind) ? raw.kind : sanitizeKind(role ? AI_ROLE_KINDS[role] : raw.kind);
    const rawPosition = raw.position as Record<string, unknown> | undefined;
    const node = createFlowNode(kind, {
      x: boundedAiNumber(rawPosition?.x, 0, -5000, 5000),
      y: boundedAiNumber(rawPosition?.y, 0, -5000, 5000),
    }, String(raw.label ?? `步骤 ${index + 1}`), { id });
    const width = boundedAiNumber(raw.width, Number(node.style?.width ?? SHAPE_DIMENSIONS[kind].width), 24, 2400);
    const height = boundedAiNumber(raw.height, Number(node.style?.height ?? SHAPE_DIMENSIONS[kind].height), 24, 1800);
    node.style = { ...node.style, width, height };
    node.zIndex = boundedAiNumber(raw.zIndex, role === 'frame' ? -30 : role === 'phase' ? -20 : 10, -100, 1000);
    node.selected = false;
    node.data = {
      ...node.data,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      fill: safeAiColor(raw.fill, node.data.fill),
      stroke: safeAiColor(raw.stroke, node.data.stroke),
      textColor: safeAiColor(raw.textColor, node.data.textColor),
      fontSize: boundedAiNumber(raw.fontSize, node.data.fontSize, 7, 72),
      fontWeight: boundedAiNumber(raw.fontWeight, node.data.fontWeight, 300, 900),
      borderWidth: boundedAiNumber(raw.borderWidth, node.data.borderWidth, 0, 12),
      radius: boundedAiNumber(raw.radius, node.data.radius, 0, 40),
      opacity: boundedAiNumber(raw.opacity, node.data.opacity, 0.1, 1),
      rotation: boundedAiNumber(raw.rotation, node.data.rotation, -360, 360),
      schematicRole: role as FlowNode['data']['schematicRole'],
      schematicDetail: role ? 'compact' : undefined,
      scientificRole: role === 'frame' && index === 0 ? 'schematic-root' : undefined,
      diagramProvenance: diagramProvenance ? {
        ...diagramProvenance,
        quote: typeof raw.sourceQuote === 'string' ? raw.sourceQuote : diagramProvenance.quote,
        confidence: boundedAiNumber(raw.confidence, diagramProvenance.confidence ?? 0.72, 0, 1),
        warnings: raw.inferred === true
          ? [...diagramProvenance.warnings, 'This node was marked as a model inference and needs human review.']
          : diagramProvenance.warnings,
      } : undefined,
    };
    return node;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = rawEdges.flatMap((raw) => {
    const source = idMap.get(String(raw.source)) ?? String(raw.source ?? '');
    const target = idMap.get(String(raw.target)) ?? String(raw.target ?? '');
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return [];
    const routing = raw.routing === 'straight' || raw.routing === 'bezier' ? raw.routing : 'smoothstep';
    const edge = createFlowEdge(source, target, typeof raw.label === 'string' ? raw.label : undefined, routing);
    if (typeof raw.id === 'string') edge.id = raw.id;
    const lineStyle = raw.lineStyle === 'dashed' || raw.lineStyle === 'dotted' ? raw.lineStyle : 'solid';
    const arrowStart = raw.arrowStart === 'open' || raw.arrowStart === 'closed' ? raw.arrowStart : 'none';
    const arrowEnd = raw.arrowEnd === 'none' || raw.arrowEnd === 'open' ? raw.arrowEnd : 'closed';
    edge.data = {
      ...edge.data!,
      label: typeof raw.label === 'string' ? raw.label : undefined,
      routing,
      lineStyle,
      color: safeAiColor(raw.color, edge.data?.color ?? '#4B5864'),
      width: boundedAiNumber(raw.width, edge.data?.width ?? 1.75, 0.5, 12),
      arrowStart,
      arrowEnd,
      diagramProvenance: diagramProvenance ? {
        ...diagramProvenance,
        quote: typeof raw.sourceQuote === 'string' ? raw.sourceQuote : diagramProvenance.quote,
        confidence: boundedAiNumber(raw.confidence, diagramProvenance.confidence ?? 0.72, 0, 1),
        warnings: raw.inferred === true
          ? [...diagramProvenance.warnings, 'This relation was marked as a model inference and needs human review.']
          : diagramProvenance.warnings,
      } : undefined,
    };
    edge.selected = false;
    return [edge];
  });
  return {
    title: typeof payload.title === 'string' ? payload.title : 'AI 生成流程图',
    nodes,
    edges,
    direction: payload.direction === 'LR' ? 'LR' : 'TB',
  };
}
