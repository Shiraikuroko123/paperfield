import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type DragEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  type Viewport,
} from '@xyflow/react';
import {
  Bot,
  ChartSpline,
  Check,
  ChevronDown,
  Code2,
  Command,
  Download,
  FileDown,
  FileJson,
  FilePlus2,
  FileUp,
  Focus,
  GitBranch,
  Grid3X3,
  Hand,
  ImageDown,
  Layers3,
  Map as MapIcon,
  Menu,
  Moon,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Rows3,
  Save,
  Sparkles,
  Sun,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AiPaperContext,
  DiagramDocument,
  FidelityLevel,
  FlowEdge,
  FlowNode,
  ImportResult,
  ScientificFigureSpec,
  ShapeKind,
  ToastMessage,
} from './types';
import { FlowNode as FlowNodeComponent } from './components/FlowNode';
import { ScientificEdge } from './components/ScientificEdge';
import { IconButton } from './components/IconButton';
import { LibraryPanel } from './components/LibraryPanel';
import { Inspector } from './components/Inspector';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette';
import { ToastRegion } from './components/ToastRegion';
import { PageBar } from './components/PageBar';
import { useFlowStore } from './store/flowStore';
import { createFlowNode, findOpenGraphPosition, findOpenNodePosition, getFlowNodesBounds } from './lib/diagram';
import { buildAtlasThreadGraph } from './lib/atlasThreadGraph';
import { createId } from './lib/id';
import { getShapeDefinition, isShapeKind } from './lib/shapeRegistry';
import { auditScientificFigure, type EditableScientificChart } from './lib/scientific';
import type { EditableScientificSchematic } from './lib/scientificSchematics';
import {
  classifyPaperfieldBridgeEvent,
  parsePaperfieldBridgeContext,
  resolvePaperfieldPdfUrl,
  resolvePaperfieldOrigin,
  type AtlasPaperSemanticContext,
} from './lib/paperfieldBridge';

const DRAFT_KEY = 'flowloom.document.v2';
const LEGACY_DRAFT_KEY = 'flowloom.document.v1';
const MOBILE_VIEWPORT_QUERY = '(max-width: 900px)';
const GOLD_BENCHMARK_PATH = 'benchmarks/compiled/imitation-diffusion-policy.html';
const nodeTypes = { flowNode: FlowNodeComponent };
const edgeTypes = { scientific: ScientificEdge };
const AiDialog = lazy(() => import('./components/AiDialog').then((module) => ({ default: module.AiDialog })));
const ImportDialog = lazy(() => import('./components/ImportDialog').then((module) => ({ default: module.ImportDialog })));
const CodeDialog = lazy(() => import('./components/CodeDialog').then((module) => ({ default: module.CodeDialog })));
const ScientificDialog = lazy(() => import('./components/ScientificDialog').then((module) => ({ default: module.ScientificDialog })));

interface ClipboardGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface ExportMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  exporting: boolean;
  onClose: () => void;
  onExportText: (format: 'json' | 'drawio' | 'mermaid' | 'dot' | 'csv') => void;
  onExportImage: (format: 'svg' | 'png' | 'pdf') => void;
}

function downloadContent(
  content: string,
  filename: string,
  type: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ExportMenu({ open, anchorRef, exporting, onClose, onExportText, onExportImage }: ExportMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(window.innerWidth - 236, rect.right - 228)),
    });
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const resize = () => onClose();
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;
  const textItems = [
    ['json', 'Flowloom JSON', '可完整重新编辑', FileJson],
    ['drawio', 'draw.io XML', 'diagrams.net 兼容', GitBranch],
    ['mermaid', 'Mermaid', '流程图文本', Rows3],
    ['dot', 'Graphviz DOT', '图结构文本', GitBranch],
    ['csv', 'CSV', '节点关系表', FileDown],
  ] as const;
  const imageItems = [
    ['svg', 'SVG', '矢量图', ImageDown],
    ['png', 'PNG', '高清位图', ImageDown],
    ['pdf', 'PDF', '单页文档', FileDown],
  ] as const;

  return createPortal(
    <div ref={menuRef} className="floating-menu export-menu" style={position} role="menu" aria-label="导出格式">
      <span className="floating-menu__label">可编辑格式</span>
      {textItems.map(([format, label, detail, ItemIcon]) => (
        <button key={format} role="menuitem" disabled={exporting} onClick={() => { onExportText(format); onClose(); }}>
          <ItemIcon size={16} /><span><strong>{label}</strong><small>{detail}</small></span>
        </button>
      ))}
      <span className="floating-menu__label">发布格式</span>
      {imageItems.map(([format, label, detail, ItemIcon]) => (
        <button key={format} role="menuitem" disabled={exporting} onClick={() => { onExportImage(format); onClose(); }}>
          <ItemIcon size={16} /><span><strong>{label}</strong><small>{detail}</small></span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

function CanvasControls({
  zoom,
  snap,
  minimap,
  onToggleSnap,
  onToggleMinimap,
}: {
  zoom: number;
  snap: boolean;
  minimap: boolean;
  onToggleSnap: () => void;
  onToggleMinimap: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow<FlowNode, FlowEdge>();
  return (
    <div className="canvas-controls" aria-label="画布控制">
      <IconButton label="缩小" icon={<ZoomOut size={17} />} onClick={() => zoomOut({ duration: 180 })} />
      <button className="zoom-value" onClick={() => fitView({ padding: 0.16, duration: 260 })} aria-label="适合画布">{Math.round(zoom * 100)}%</button>
      <IconButton label="放大" icon={<ZoomIn size={17} />} onClick={() => zoomIn({ duration: 180 })} />
      <span className="control-divider" />
      <IconButton label="适合画布" icon={<Focus size={17} />} onClick={() => fitView({ padding: 0.16, duration: 260 })} />
      <IconButton label="对齐网格" icon={<Grid3X3 size={17} />} active={snap} onClick={onToggleSnap} />
      <IconButton label="缩略图" icon={<MapIcon size={17} />} active={minimap} onClick={onToggleMinimap} />
    </div>
  );
}

function resolveResearchLink(value: string | undefined, sourceOrigin: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, sourceOrigin);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function atlasPaperContextToAi(
  context: AtlasPaperSemanticContext,
  sourceOrigin: string,
): AiPaperContext {
  const evidence = context.claims.flatMap((claim) => claim.evidence).find((item) => item.source_locator);
  return {
    paperRef: context.canonical_paper_ref,
    paperfieldId: context.paperfield_id,
    title: context.title,
    abstract: context.abstract,
    authors: context.authors,
    venue: context.venue,
    published: context.published,
    version: context.version,
    sourceUrl: resolveResearchLink(context.source_url, sourceOrigin),
    pdfUrl: resolveResearchLink(context.pdf_url, sourceOrigin),
    paperfieldPath: resolveResearchLink(context.paperfield_path, sourceOrigin),
    page: evidence?.source_locator.page,
    figure: evidence?.source_locator.figure,
    section: evidence?.source_locator.section,
    quote: evidence?.source_locator.quote,
    sourceHash: context.source_sha256 || context.dossier.source_sha256,
    dossierStatus: context.dossier.status,
    analysisLevel: context.dossier.analysis_level,
    sourceBasis: context.dossier.source_basis,
    coverage: context.dossier.coverage,
    claims: context.claims.map((claim) => ({
      claimId: claim.claim_id,
      stage: claim.stage,
      title: claim.title,
      statement: claim.statement,
      sourceKind: claim.source_kind,
      confidence: claim.confidence,
      sourceSha256: claim.source_sha256,
      evidence: claim.evidence.map((item) => ({
        evidenceId: item.evidence_id,
        paperfieldPath: resolveResearchLink(item.paperfield_path, sourceOrigin) || item.paperfield_path,
        page: item.source_locator.page,
        section: item.source_locator.section,
        figure: item.source_locator.figure,
        table: item.source_locator.table,
        equation: item.source_locator.equation,
        quote: item.source_locator.quote,
      })),
    })),
    terms: context.terms,
    curriculum: context.curriculum,
    insufficientInformation: context.insufficient_information,
    templateIds: context.template_ids,
    libraryElements: context.library_elements,
  };
}

function EditorApp() {
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const clipboardRef = useRef<ClipboardGraph | null>(null);
  const restoredRef = useRef(false);
  const quotaWarningRef = useRef(false);
  const receivedBridgeMessagesRef = useRef(new Set<string>());
  const activeBridgeJobsRef = useRef(new Set<string>());

  const title = useFlowStore((state) => state.title);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const layers = useFlowStore((state) => state.layers);
  const pages = useFlowStore((state) => state.pages);
  const activePageId = useFlowStore((state) => state.activePageId);
  const past = useFlowStore((state) => state.past);
  const future = useFlowStore((state) => state.future);
  const dirty = useFlowStore((state) => state.dirty);
  const lastSavedAt = useFlowStore((state) => state.lastSavedAt);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const reconnect = useFlowStore((state) => state.reconnect);
  const setTitle = useFlowStore((state) => state.setTitle);
  const beginTransaction = useFlowStore((state) => state.beginTransaction);
  const endTransaction = useFlowStore((state) => state.endTransaction);
  const addNode = useFlowStore((state) => state.addNode);
  const deleteSelection = useFlowStore((state) => state.deleteSelection);
  const duplicateSelection = useFlowStore((state) => state.duplicateSelection);
  const nudgeSelection = useFlowStore((state) => state.nudgeSelection);
  const groupSelection = useFlowStore((state) => state.groupSelection);
  const ungroupSelection = useFlowStore((state) => state.ungroupSelection);
  const selectAll = useFlowStore((state) => state.selectAll);
  const clearSelection = useFlowStore((state) => state.clearSelection);
  const insertGraph = useFlowStore((state) => state.insertGraph);
  const loadGraph = useFlowStore((state) => state.loadGraph);
  const loadDocument = useFlowStore((state) => state.loadDocument);
  const configureScientificFigure = useFlowStore((state) => state.configureScientificFigure);
  const loadTemplate = useFlowStore((state) => state.loadTemplate);
  const restoreDraft = useFlowStore((state) => state.restoreDraft);
  const newDocument = useFlowStore((state) => state.newDocument);
  const undo = useFlowStore((state) => state.undo);
  const redo = useFlowStore((state) => state.redo);
  const markSaved = useFlowStore((state) => state.markSaved);

  const [leftOpen, setLeftOpen] = useState(() => !window.matchMedia(MOBILE_VIEWPORT_QUERY).matches);
  const [rightOpen, setRightOpen] = useState(() => !window.matchMedia(MOBILE_VIEWPORT_QUERY).matches);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [snap, setSnap] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('flowloom.theme') === 'dark' ? 'dark' : 'light');
  const [zoom, setZoom] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'general' | 'paper'>('paper');
  const [incomingPaperContext, setIncomingPaperContext] = useState<AiPaperContext>();
  const [codeOpen, setCodeOpen] = useState(false);
  const [scientificOpen, setScientificOpen] = useState(false);
  const [scientificInitialTab, setScientificInitialTab] = useState<'figure' | 'chart' | 'schematic' | 'quality'>('figure');
  const [commandOpen, setCommandOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [fidelity, setFidelity] = useState<FidelityLevel>('structural');
  const [sourceFormat, setSourceFormat] = useState('Flowloom');
  const activeScientificFigure = pages.find((page) => page.id === activePageId)?.scientific;
  const bridgeContext = useMemo(() => parsePaperfieldBridgeContext(window.location), []);
  const goldBenchmarkUrl = useMemo(() => new URL(GOLD_BENCHMARK_PATH, document.baseURI).toString(), []);

  const closeAi = useCallback(() => {
    setAiOpen(false);
    // A dossier is a one-dialog handoff. Never let it silently become the
    // source for a later, manually opened request.
    setIncomingPaperContext(undefined);
  }, []);

  const openAi = useCallback((mode: 'general' | 'paper' = 'paper') => {
    setIncomingPaperContext(undefined);
    setAiMode(mode);
    setAiOpen(true);
  }, []);

  const openScientific = useCallback((tab: 'figure' | 'chart' | 'schematic' | 'quality' = 'figure') => {
    setScientificInitialTab(tab);
    setScientificOpen(true);
  }, []);

  const openGoldBenchmark = useCallback(() => {
    window.open(goldBenchmarkUrl, '_blank', 'noopener,noreferrer');
  }, [goldBenchmarkUrl]);

  const renderedNodes = useMemo(() => {
    const layerIndex = new Map(layers.map((layer, index) => [layer.id, index]));
    const layerById = new Map(layers.map((layer) => [layer.id, layer]));
    return nodes.map((node) => {
      const layer = layerById.get(node.data.layerId ?? layers[0]?.id);
      const effectiveLocked = Boolean(node.data.locked || layer?.locked);
      const hidden = Boolean(node.data.hidden || layer?.visible === false);
      return {
        ...node,
        hidden,
        draggable: !effectiveLocked,
        selectable: !effectiveLocked,
        zIndex: (layerIndex.get(layer?.id ?? '') ?? 0) * 10_000 + (node.zIndex ?? 0),
        data: effectiveLocked === node.data.locked ? node.data : { ...node.data, locked: effectiveLocked },
      };
    });
  }, [layers, nodes]);

  const renderedEdges = useMemo(() => {
    const hiddenIds = new Set(renderedNodes.filter((node) => node.hidden).map((node) => node.id));
    return edges.map((edge) => ({ ...edge, hidden: hiddenIds.has(edge.source) || hiddenIds.has(edge.target) }));
  }, [edges, renderedNodes]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = createId('toast');
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), toast.tone === 'error' ? 7200 : 4200);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('flowloom.theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171615' : '#ffffff');
  }, [theme]);

  useEffect(() => {
    const viewport = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const syncPanels = ({ matches }: Pick<MediaQueryList, 'matches'>) => {
      setLeftOpen(!matches);
      setRightOpen(!matches);
    };

    syncPanels(viewport);
    viewport.addEventListener('change', syncPanels);
    return () => viewport.removeEventListener('change', syncPanels);
  }, []);

  const toggleLibrary = useCallback(() => {
    const nextOpen = !leftOpen;
    setLeftOpen(nextOpen);
    if (nextOpen && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) setRightOpen(false);
  }, [leftOpen]);

  const toggleInspector = useCallback(() => {
    const nextOpen = !rightOpen;
    setRightOpen(nextOpen);
    if (nextOpen && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) setLeftOpen(false);
  }, [rightOpen]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const value = localStorage.getItem(DRAFT_KEY) ?? localStorage.getItem(LEGACY_DRAFT_KEY);
      if (!value) return;
      const draft = JSON.parse(value) as DiagramDocument | { title: string; nodes: FlowNode[]; edges: FlowEdge[]; meta?: DiagramDocument['meta'] };
      if (('pages' in draft && Array.isArray(draft.pages)) || ('nodes' in draft && Array.isArray(draft.nodes) && Array.isArray(draft.edges))) {
        restoreDraft(draft);
        setSourceFormat(draft.meta?.sourceFormat ?? '本地草稿');
        setFidelity(draft.meta?.fidelity ?? 'structural');
        addToast({ tone: 'info', title: '已恢复本地草稿' });
        window.setTimeout(() => flow.fitView({ padding: 0.16, duration: 0 }), 80);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    }
  }, [addToast, flow, restoreDraft]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      const documentValue: DiagramDocument = {
        version: 2,
        title,
        activePageId,
        pages,
        meta: { createdAt: now, updatedAt: now, sourceFormat, fidelity },
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(documentValue));
        markSaved();
        quotaWarningRef.current = false;
      } catch {
        if (!quotaWarningRef.current) {
          quotaWarningRef.current = true;
          addToast({ tone: 'warning', title: '本地草稿空间不足', detail: '大型图片仍保留在当前画布，请导出 JSON 备份。' });
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activePageId, addToast, fidelity, markSaved, pages, sourceFormat, title]);

  const addShape = useCallback((kind: ShapeKind) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const point = flow.screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    });
    addNode(createFlowNode(kind, findOpenNodePosition(nodes, kind, point)));
  }, [addNode, flow, nodes]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const value = event.dataTransfer.getData('application/flowloom-shape');
    if (!isShapeKind(value)) return;
    const kind = value;
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const definition = getShapeDefinition(kind);
    addNode(createFlowNode(kind, { x: point.x - definition.width / 2, y: point.y - definition.height / 2 }));
  };

  const applyImport = useCallback((result: ImportResult) => {
    if (result.pages?.length) loadDocument(result.title, result.pages, result.activePageId);
    else loadGraph(result.title, result.nodes, result.edges);
    setFidelity(result.fidelity);
    setSourceFormat(result.sourceFormat);
    addToast({
      tone: result.fidelity === 'structural' ? 'success' : 'warning',
      title: `已导入 ${result.sourceFormat}`,
      detail: result.warnings[0],
    });
    window.setTimeout(() => flow.fitView({ padding: 0.16, duration: 280 }), 80);
  }, [addToast, flow, loadDocument, loadGraph]);

  useEffect(() => {
    const opener = window.opener;
    const allowedOrigin = resolvePaperfieldOrigin(bridgeContext);
    if (!opener || !allowedOrigin) return undefined;

    const reply = (type: string, extra: Record<string, unknown> = {}) => {
      try {
        opener.postMessage({
          type,
          version: 1,
          messageId: bridgeContext.session,
          bridgeToken: bridgeContext.token,
          ...extra,
        }, allowedOrigin);
      } catch {
        // The source window may have been closed after opening Flowloom.
      }
    };
    const receive = async (event: MessageEvent) => {
      const decision = classifyPaperfieldBridgeEvent(
        event,
        opener,
        allowedOrigin,
        bridgeContext,
        receivedBridgeMessagesRef.current,
      );
      if (decision.kind === 'reject') return;
      const message = decision.message;
      if (decision.kind === 'replay') {
        if (message.type === 'atlas:claim-thread') {
          reply('flowloom:thread-accepted', {
            threadId: message.threadContext.thread_id,
            revision: message.threadContext.revision,
            contentSha256: message.threadContext.content_sha256,
          });
        } else if (message.type === 'atlas:paper-context') {
          reply('flowloom:paper-context-accepted', {
            paperRef: message.paperContext.canonical_paper_ref,
            claimCount: message.paperContext.claims.length,
          });
        } else {
          reply('flowloom:figure-accepted', { figureId: message.figureContext?.figure_id });
        }
        return;
      }
      if (activeBridgeJobsRef.current.has(message.messageId)) {
        reply(
          message.type === 'atlas:claim-thread'
            ? 'flowloom:thread-processing'
            : message.type === 'atlas:paper-context'
              ? 'flowloom:paper-context-processing'
              : 'flowloom:figure-processing',
        );
        return;
      }
      activeBridgeJobsRef.current.add(message.messageId);
      try {
        if (message.type === 'atlas:paper-context') {
          const paperContext = atlasPaperContextToAi(message.paperContext, allowedOrigin);
          receivedBridgeMessagesRef.current.add(message.messageId);
          setIncomingPaperContext(paperContext);
          setAiMode('paper');
          setAiOpen(true);
          setSourceFormat('Research Atlas paper context');
          addToast({
            tone: 'success',
            title: 'Atlas paper context loaded',
            detail: `${message.paperContext.claims.length} source-bounded claims are ready for review. Generation still requires your confirmation.`,
          });
          reply('flowloom:paper-context-accepted', {
            paperRef: message.paperContext.canonical_paper_ref,
            paperfieldId: message.paperContext.paperfield_id,
            claimCount: message.paperContext.claims.length,
            stageCount: Object.keys(message.paperContext.dossier.stages || {}).length,
          });
          return;
        }
        if (message.type === 'atlas:claim-thread') {
          const graph = buildAtlasThreadGraph(message);
          receivedBridgeMessagesRef.current.add(message.messageId);
          loadGraph(graph.title, graph.nodes, graph.edges);
          setFidelity('structural');
          setSourceFormat('Research Atlas 研究线程');
          addToast({
            tone: 'success',
            title: '已接收 Research Atlas 研究线程',
            detail: `${graph.nodes.length} 条已审核主张和 ${graph.edges.length} 条关系已载入，来源定位保留在节点中。`,
          });
          window.setTimeout(() => flow.fitView({ padding: 0.16, duration: 320 }), 80);
          reply('flowloom:thread-accepted', {
            threadId: message.threadContext.thread_id,
            revision: message.threadContext.revision,
            contentSha256: message.threadContext.content_sha256,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
          });
          return;
        }
        const locator = message.figureContext?.source_locator;
        const pageNumber = Number(locator?.page || message.page) || 1;
        const paperfieldPdfUrl = resolvePaperfieldPdfUrl(message, allowedOrigin);
        let vectorExtractionError = '';
        if (paperfieldPdfUrl) {
          try {
            reply('flowloom:figure-processing', { page: pageNumber, mode: 'pdf-vector-extraction' });
            const response = await fetch(paperfieldPdfUrl, {
              credentials: 'include',
              headers: { 'ngrok-skip-browser-warning': 'flowloom' },
            });
            if (!response.ok) throw new Error(`Paperfield PDF endpoint returned ${response.status}.`);
            const declaredBytes = Number(response.headers.get('content-length') || 0);
            if (declaredBytes > 128 * 1024 * 1024) throw new Error('PDF exceeds the 128 MB browser extraction limit.');
            const pdfBytes = await response.arrayBuffer();
            if (pdfBytes.byteLength > 128 * 1024 * 1024) throw new Error('PDF exceeds the 128 MB browser extraction limit.');
            const { importPdfBuffer } = await import('./lib/fileAdapters');
            const imported = await importPdfBuffer(
              pdfBytes,
              message.paperTitle || message.title || 'Paperfield PDF',
              message.pdfFileName || `${message.paperTitle || message.paperId || 'paper'}.pdf`,
              {
                paperRef: locator?.canonical_paper_ref,
                paperfieldId: locator?.paperfield_id || message.paperId,
                sourceHash: locator?.content_sha256 || message.sourceSha256,
                url: locator?.url || message.citation || paperfieldPdfUrl,
              },
              { pageNumbers: [pageNumber], maxEditableNodesPerPage: 2400 },
            );
            const bridgedImport = { ...imported, sourceFormat: 'Paperfield PDF / editable SVG' };
            receivedBridgeMessagesRef.current.add(message.messageId);
            applyImport(bridgedImport);
            reply('flowloom:figure-accepted', {
              figureId: message.figureContext?.figure_id,
              page: pageNumber,
              mode: imported.pdfExtraction?.editablePrimitives || imported.pdfExtraction?.textPrimitives
                ? 'editable-svg'
                : 'visual-reference',
              fidelity: imported.fidelity,
              editablePrimitives: imported.pdfExtraction?.editablePrimitives ?? 0,
              textPrimitives: imported.pdfExtraction?.textPrimitives ?? 0,
            });
            return;
          } catch (error) {
            vectorExtractionError = error instanceof Error ? error.message : 'PDF vector extraction failed.';
          }
        }
        const sourceWidth = Math.max(1, Number(message.pageWidth || message.rasterWidthPx || 960));
        const sourceHeight = Math.max(1, Number(message.pageHeight || message.rasterHeightPx || 720));
        const scale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
        const node = createFlowNode('image', { x: 80, y: 80 }, message.title || 'Paperfield PDF 页面', {
          style: {
            width: Math.max(240, Math.round(sourceWidth * scale)),
            height: Math.max(160, Math.round(sourceHeight * scale)),
          },
        });
        node.data = {
          ...node.data,
          imageUrl: message.imageDataUrl,
          sourceRef: message.sourceRef || `${message.paperId || 'paper'}#page=${message.page || 1}`,
          rasterWidthPx: Number(message.rasterWidthPx) || undefined,
          rasterHeightPx: Number(message.rasterHeightPx) || undefined,
          scientificAssetState: 'user-provided',
          locked: false,
          researchSourceLocator: {
            kind: 'paper',
            canonicalPaperRef: locator?.canonical_paper_ref,
            paperfieldId: locator?.paperfield_id || message.paperId,
            url: locator?.url || message.citation,
            page: pageNumber,
            section: locator?.section,
            figure: locator?.figure,
            table: locator?.table,
            quote: locator?.quote,
            contentSha256: locator?.content_sha256 || message.sourceSha256,
          },
          researchFigureContext: {
            schemaVersion: 1,
            figureId: message.figureContext?.figure_id || `figure-${message.messageId}`,
            assetKind: 'raster-page',
            assetSha256: message.figureContext?.asset_sha256 || message.sourceSha256,
            producer: 'paperfield',
            producedAt: message.figureContext?.provenance?.produced_at || new Date().toISOString(),
          },
        };
        receivedBridgeMessagesRef.current.add(message.messageId);
        loadGraph(message.title || 'Paperfield PDF 页面', [node], []);
        setFidelity('visual');
        setSourceFormat('Paperfield PDF 页面');
        addToast({
          tone: vectorExtractionError ? 'warning' : 'success',
          title: vectorExtractionError ? '已载入 PDF 视觉回退' : '已接收 Paperfield 页面',
          detail: vectorExtractionError
            ? `第 ${pageNumber} 页的矢量拆解失败，已保留 PNG 参考：${vectorExtractionError}`
            : `第 ${pageNumber} 页已作为带来源定位的视觉参考载入。`,
        });
        window.setTimeout(() => flow.fitView({ padding: 0.12, duration: 280 }), 80);
        reply('flowloom:figure-accepted', {
          figureId: node.data.researchFigureContext?.figureId,
          page: pageNumber,
          mode: 'raster-fallback',
          fidelity: 'visual',
          warning: vectorExtractionError || undefined,
        });
      } catch (error) {
        reply('flowloom:error', { error: error instanceof Error ? error.message : '无法载入页面' });
      } finally {
        activeBridgeJobsRef.current.delete(message.messageId);
      }
    };

    window.addEventListener('message', receive);
    reply('flowloom:ready');
    return () => window.removeEventListener('message', receive);
  }, [addToast, applyImport, bridgeContext, flow, loadGraph]);

  const applyAi = useCallback((nextTitle: string, nextNodes: FlowNode[], nextEdges: FlowEdge[]) => {
    const scientific = nextNodes.some((node) => node.data.scientificRole === 'schematic-root');
    loadGraph(nextTitle, nextNodes, nextEdges);
    setFidelity('structural');
    setSourceFormat(scientific ? 'AI 论文示意图' : 'AI');
    addToast({
      tone: 'success',
      title: scientific ? 'AI 论文示意图已生成' : 'AI 流程图已生成',
      detail: `${nextNodes.length} 个可编辑节点、${nextEdges.length} 条连接`,
    });
    window.setTimeout(() => flow.fitView({ padding: 0.16, duration: 320 }), 80);
  }, [addToast, flow, loadGraph]);

  const applyScientificFigure = useCallback((spec: ScientificFigureSpec, layoutNodes: FlowNode[]) => {
    configureScientificFigure(spec, layoutNodes);
    setSourceFormat('科研图版');
    setFidelity('structural');
    addToast({
      tone: 'success',
      title: '科研图版已应用',
      detail: `${spec.widthMm} × ${spec.heightMm} mm · ${spec.rows} × ${spec.columns} 面板`,
    });
    window.setTimeout(() => flow.fitView({ padding: 0.08, duration: 300 }), 80);
  }, [addToast, configureScientificFigure, flow]);

  const applyScientificChart = useCallback((chart: EditableScientificChart) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const viewportCenter = flow.screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    });
    const figureNode = nodes.find((node) => node.data.scientificRole === 'figure-background');
    const figureWidth = Number.parseFloat(String(figureNode?.style?.width ?? figureNode?.measured?.width ?? ''));
    const figureHeight = Number.parseFloat(String(figureNode?.style?.height ?? figureNode?.measured?.height ?? ''));
    const figureCenter = figureNode && Number.isFinite(figureWidth) && Number.isFinite(figureHeight)
      ? { x: figureNode.position.x + figureWidth / 2, y: figureNode.position.y + figureHeight / 2 }
      : undefined;
    const origin = figureCenter
      ? { x: figureCenter.x - chart.width / 2, y: figureCenter.y - chart.height / 2 }
      : findOpenGraphPosition(nodes, { width: chart.width, height: chart.height }, viewportCenter);
    const positioned = chart.nodes.map((node) => node.parentId ? node : {
      ...node,
      position: {
        x: origin.x + node.position.x,
        y: origin.y + node.position.y,
      },
    });
    insertGraph(positioned, [], 0);
    setSourceFormat('科研数据图表');
    setFidelity('structural');
    addToast({
      tone: 'success',
      title: '已插入可编辑科研图表',
      detail: `${chart.nodes.length - 1} 个 SVG 图元，原始数据已随图表保存。`,
    });
  }, [addToast, flow, insertGraph, nodes]);

  const applyScientificSchematic = useCallback((schematic: EditableScientificSchematic) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const viewportCenter = flow.screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    });
    const figureNode = nodes.find((node) => node.data.scientificRole === 'figure-background');
    const figureWidth = Number.parseFloat(String(figureNode?.style?.width ?? figureNode?.measured?.width ?? ''));
    const figureHeight = Number.parseFloat(String(figureNode?.style?.height ?? figureNode?.measured?.height ?? ''));
    const figureCenter = figureNode && Number.isFinite(figureWidth) && Number.isFinite(figureHeight)
      ? { x: figureNode.position.x + figureWidth / 2, y: figureNode.position.y + figureHeight / 2 }
      : undefined;
    const origin = figureCenter
      ? { x: figureCenter.x - schematic.width / 2, y: figureCenter.y - schematic.height / 2 }
      : findOpenGraphPosition(nodes, { width: schematic.width, height: schematic.height }, viewportCenter);
    const positioned = schematic.nodes.map((node) => ({
      ...node,
      position: {
        x: origin.x + node.position.x,
        y: origin.y + node.position.y,
      },
    }));
    insertGraph(positioned, schematic.edges, 0);
    setSourceFormat('论文示意图');
    setFidelity('structural');
    addToast({
      tone: 'success',
      title: '已插入可编辑论文示意图',
      detail: `${schematic.nodes.length} 个对象、${schematic.edges.length} 条连接；构图来源已写入图形元数据。`,
    });
    window.setTimeout(() => flow.fitView({ padding: 0.1, duration: 320 }), 80);
  }, [addToast, flow, insertGraph, nodes]);

  const fileName = useCallback((extension: string) => `${(title.trim() || 'flowchart').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}.${extension}`, [title]);

  const exportText = useCallback(async (format: 'json' | 'drawio' | 'mermaid' | 'dot' | 'csv') => {
    const {
      downloadText,
      serializeCsv,
      serializeDocument,
      serializeDot,
      serializeDrawio,
      serializeMermaid,
    } = await import('./lib/fileAdapters');
    const serializers = {
      json: () => serializeDocument(title, nodes, edges, pages, activePageId),
      drawio: () => serializeDrawio(title, nodes, edges, pages, activePageId),
      mermaid: () => serializeMermaid(nodes, edges),
      dot: () => serializeDot(title, nodes, edges),
      csv: () => serializeCsv(nodes, edges),
    };
    const extensions = { json: 'flow.json', drawio: 'drawio', mermaid: 'mmd', dot: 'dot', csv: 'csv' };
    const mime = format === 'json' ? 'application/json;charset=utf-8' : format === 'drawio' ? 'application/xml;charset=utf-8' : 'text/plain;charset=utf-8';
    downloadText(fileName(extensions[format]), serializers[format](), mime);
    addToast({ tone: 'success', title: `已导出 ${extensions[format]}` });
  }, [activePageId, addToast, edges, fileName, nodes, pages, title]);

  const exportImage = useCallback(async (format: 'svg' | 'png' | 'pdf') => {
    if (nodes.length === 0) {
      addToast({ tone: 'warning', title: '画布为空，无法导出' });
      return;
    }
    if (activeScientificFigure) {
      const blockers = auditScientificFigure(nodes, activeScientificFigure, edges)
        .filter((issue) => issue.severity === 'error');
      if (blockers.length) {
        addToast({
          tone: 'error',
          title: '科研图版未通过导出检查',
          detail: `${blockers.length} 项关键问题：${blockers.slice(0, 2).map((issue) => issue.title).join('；')}`,
        });
        openScientific('figure');
        return;
      }
    }
    const viewportElement = canvasRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewportElement) return;
    setExporting(true);
    canvasRef.current?.classList.add('is-exporting');
    try {
      const { toPng, toSvg } = await import('html-to-image');
      const figureNode = activeScientificFigure
        ? nodes.find((node) => node.data.scientificRole === 'figure-background')
        : undefined;
      const scientificBounds = figureNode && activeScientificFigure ? {
        x: figureNode.position.x,
        y: figureNode.position.y,
        width: Number.parseFloat(String(figureNode.style?.width ?? figureNode.measured?.width ?? 1)),
        height: Number.parseFloat(String(figureNode.style?.height ?? figureNode.measured?.height ?? 1)),
      } : undefined;
      const contentNodes = nodes.filter((node) => !node.data.exportExcluded);
      const bounds = scientificBounds ?? getFlowNodesBounds(contentNodes);
      const hasNativeScientificContent = contentNodes.some((node) => (
        node.data.scientificRole === 'schematic-root'
        || node.data.scientificRole === 'chart-root'
      ));
      const naturalWidth = scientificBounds ? Math.ceil(bounds.width) : Math.max(480, Math.ceil(bounds.width + 128));
      const naturalHeight = scientificBounds ? Math.ceil(bounds.height) : Math.max(320, Math.ceil(bounds.height + 128));
      const scale = scientificBounds ? 1 : Math.min(1, 4096 / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const exportViewport = scientificBounds
        ? { x: -bounds.x, y: -bounds.y, zoom: 1 }
        : getViewportForBounds(bounds, width, height, 0.05, 2, 0.08);
      const backgroundColor = scientificBounds
        ? activeScientificFigure?.background === 'transparent' && format !== 'pdf' ? undefined : '#ffffff'
        : theme === 'dark' ? '#171615' : '#ffffff';
      const excludedNodeIds = new Set(nodes.filter((node) => node.data.exportExcluded).map((node) => node.id));
      const filter = (domNode: HTMLElement) => {
        if (domNode.classList?.contains('react-flow__handle')
          || domNode.classList?.contains('react-flow__resize-control')
          || domNode.classList?.contains('flow-node__lock')) return false;
        if (domNode.classList?.contains('react-flow__node')) {
          const id = domNode.getAttribute('data-id');
          if (id && excludedNodeIds.has(id)) return false;
        }
        return true;
      };
      const targetWidth = activeScientificFigure && scientificBounds
        ? Math.round(activeScientificFigure.widthMm / 25.4 * activeScientificFigure.dpi)
        : undefined;
      const targetHeight = activeScientificFigure && scientificBounds
        ? Math.round(activeScientificFigure.heightMm / 25.4 * activeScientificFigure.dpi)
        : undefined;
      const options = {
        backgroundColor,
        width,
        height,
        canvasWidth: format !== 'svg' ? targetWidth : undefined,
        canvasHeight: format !== 'svg' ? targetHeight : undefined,
        pixelRatio: scientificBounds ? 1 : format === 'png' || format === 'pdf' ? 2 : 1,
        filter,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${exportViewport.x}px, ${exportViewport.y}px) scale(${exportViewport.zoom})`,
        },
      };
      if (format === 'svg') {
        if ((activeScientificFigure && scientificBounds) || hasNativeScientificContent) {
          const { serializePublicationSvg } = await import('./lib/scientificExport');
          let exportSpec: ScientificFigureSpec;
          let exportOrigin: { x: number; y: number } | undefined;
          if (activeScientificFigure && scientificBounds) {
            exportSpec = activeScientificFigure;
          } else {
            const padding = 48;
            const paddedWidth = Math.max(1, bounds.width + padding * 2);
            const paddedHeight = Math.max(1, bounds.height + padding * 2);
            const { pxToMm } = await import('./lib/scientific');
            exportOrigin = { x: bounds.x - padding, y: bounds.y - padding };
            exportSpec = {
              widthMm: pxToMm(paddedWidth),
              heightMm: pxToMm(paddedHeight),
              dpi: 96,
              rows: 1,
              columns: 1,
              marginMm: 0,
              gapMm: 0,
              panelLabels: false,
              labelStyle: 'uppercase',
              background: '#ffffff',
              updatedAt: new Date().toISOString(),
            };
          }
          downloadContent(
            serializePublicationSvg(title, renderedNodes, renderedEdges, exportSpec, { origin: exportOrigin }),
            fileName('svg'),
            'image/svg+xml;charset=utf-8',
          );
        } else {
          const dataUrl = await toSvg(viewportElement, options);
          const anchor = document.createElement('a');
          anchor.href = dataUrl;
          anchor.download = fileName('svg');
          anchor.click();
        }
      } else if (format === 'pdf' && activeScientificFigure && scientificBounds) {
        const [{ jsPDF }] = await Promise.all([
          import('jspdf'),
          import('svg2pdf.js'),
        ]);
        const {
          preparePublicationSvgForPdf,
          registerPublicationPdfFonts,
          serializePublicationSvg,
        } = await import('./lib/scientificExport');
        const pdfSpec: ScientificFigureSpec = { ...activeScientificFigure, background: '#ffffff' };
        const svgSource = serializePublicationSvg(title, renderedNodes, renderedEdges, pdfSpec);
        const svgDocument = new DOMParser().parseFromString(svgSource, 'image/svg+xml');
        const parserError = svgDocument.querySelector('parsererror');
        if (parserError) throw new Error('原生 SVG 无法转换为矢量 PDF。');
        const pdfWidth = activeScientificFigure.widthMm;
        const pdfHeight = activeScientificFigure.heightMm;
        const pdf = new jsPDF({
          orientation: pdfWidth >= pdfHeight ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [pdfWidth, pdfHeight],
          putOnlyUsedFonts: true,
        });
        pdf.setProperties({ title, creator: 'Flowloom', subject: 'Editable scientific figure export' });
        await registerPublicationPdfFonts(pdf);
        preparePublicationSvgForPdf(svgDocument.documentElement as unknown as SVGSVGElement, pdfSpec);
        await pdf.svg(svgDocument.documentElement as unknown as SVGElement, {
          x: 0,
          y: 0,
          width: pdfWidth,
          height: pdfHeight,
        });
        pdf.save(fileName('pdf'));
      } else {
        const dataUrl = await toPng(viewportElement, options);
        if (format === 'png') {
          const publicationDataUrl = activeScientificFigure && scientificBounds
            ? (await import('./lib/pngMetadata')).withPngDpiMetadata(dataUrl, activeScientificFigure.dpi)
            : dataUrl;
          const anchor = document.createElement('a');
          anchor.href = publicationDataUrl;
          anchor.download = fileName('png');
          anchor.click();
        } else {
          const { jsPDF } = await import('jspdf');
          const pdfWidth = activeScientificFigure && scientificBounds ? activeScientificFigure.widthMm : width;
          const pdfHeight = activeScientificFigure && scientificBounds ? activeScientificFigure.heightMm : height;
          const unit = activeScientificFigure && scientificBounds ? 'mm' : 'px';
          const orientation = pdfWidth >= pdfHeight ? 'landscape' : 'portrait';
          const pdf = new jsPDF({ orientation, unit, format: [pdfWidth, pdfHeight], hotfixes: unit === 'px' ? ['px_scaling'] : [] });
          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          pdf.save(fileName('pdf'));
        }
      }
      addToast({
        tone: 'success',
        title: `已导出 ${format.toUpperCase()}`,
        detail: activeScientificFigure && scientificBounds
          ? `${activeScientificFigure.widthMm} × ${activeScientificFigure.heightMm} mm${format === 'svg' ? '，已写入物理尺寸' : ` · ${targetWidth} × ${targetHeight} px`}`
          : format === 'svg' && hasNativeScientificContent
            ? '已导出原生矢量图元并写入构图来源元数据'
            : undefined,
      });
    } catch (error) {
      addToast({ tone: 'error', title: '导出失败', detail: error instanceof Error ? error.message : '浏览器无法生成文件。' });
    } finally {
      setExporting(false);
      canvasRef.current?.classList.remove('is-exporting');
    }
  }, [activeScientificFigure, addToast, edges, fileName, nodes, openScientific, renderedEdges, renderedNodes, theme, title]);

  const copySelection = useCallback(async () => {
    const selectedNodes = nodes.filter((node) => node.selected);
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    const selectedEdges = edges.filter((edge) => edge.selected || (selectedIds.has(edge.source) && selectedIds.has(edge.target)));
    if (selectedNodes.length === 0) return;
    clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
    try {
      await navigator.clipboard.writeText(`FLOWLOOM:${JSON.stringify(clipboardRef.current)}`);
    } catch {
      // The in-memory clipboard still supports paste in restricted contexts.
    }
    addToast({ tone: 'info', title: `已复制 ${selectedNodes.length} 个节点` });
  }, [addToast, edges, nodes]);

  const pasteSelection = useCallback(async () => {
    let graph = clipboardRef.current;
    try {
      const value = await navigator.clipboard.readText();
      if (value.startsWith('FLOWLOOM:')) graph = JSON.parse(value.slice(9)) as ClipboardGraph;
    } catch {
      // Fall back to the in-memory clipboard.
    }
    if (!graph) return;
    insertGraph(graph.nodes, graph.edges);
    addToast({ tone: 'info', title: `已粘贴 ${graph.nodes.length} 个节点` });
  }, [addToast, insertGraph]);

  const startNewDocument = useCallback(() => {
    newDocument();
    setFidelity('structural');
    setSourceFormat('Flowloom');
    addToast({ tone: 'info', title: '已新建空白流程图', detail: '可使用撤销恢复之前内容。' });
  }, [addToast, newDocument]);

  const commands = useMemo<PaletteCommand[]>(() => [
    { id: 'new', label: '新建空白流程图', group: '文件', shortcut: 'Ctrl N', keywords: 'new blank', run: startNewDocument },
    { id: 'import', label: 'PDF 拆为可编辑 SVG', group: '论文工作流', shortcut: 'Ctrl O', keywords: 'pdf svg vector extract import', run: () => setImportOpen(true) },
    { id: 'export', label: '导出 Flowloom JSON', group: '文件', shortcut: 'Ctrl S', keywords: 'save json', run: () => exportText('json') },
    { id: 'paper-ai', label: '从论文语义生成科研图', group: '论文工作流', shortcut: 'Ctrl J', keywords: 'paper semantic gold ccswitch model', run: () => openAi('paper') },
    { id: 'ai', label: '生成通用流程图', group: '创建', keywords: 'ccswitch model prompt', run: () => openAi('general') },
    { id: 'scientific', label: '打开科研绘图工作台', group: '创建', keywords: 'science paper figure chart csv journal panel', run: () => openScientific('figure') },
    { id: 'code', label: '使用代码绘制流程图', group: '创建', keywords: 'mermaid graphviz dot plantuml code', run: () => setCodeOpen(true) },
    { id: 'process', label: '添加处理步骤', group: '创建', keywords: 'node rectangle', run: () => addShape('process') },
    { id: 'decision', label: '添加判断节点', group: '创建', keywords: 'diamond condition', run: () => addShape('decision') },
    { id: 'undo', label: '撤销', group: '编辑', shortcut: 'Ctrl Z', run: undo },
    { id: 'redo', label: '重做', group: '编辑', shortcut: 'Ctrl Y', run: redo },
    { id: 'duplicate', label: '复制所选图形', group: '编辑', shortcut: 'Ctrl D', run: duplicateSelection },
    { id: 'group', label: '分组所选图形', group: '编辑', shortcut: 'Ctrl G', keywords: 'group container', run: groupSelection },
    { id: 'ungroup', label: '取消分组', group: '编辑', shortcut: 'Ctrl Shift G', keywords: 'ungroup', run: ungroupSelection },
    { id: 'fit', label: '适合全部内容', group: '视图', shortcut: 'F', run: () => flow.fitView({ padding: 0.16, duration: 260 }) },
    { id: 'theme', label: theme === 'light' ? '切换到深色模式' : '切换到浅色模式', group: '视图', run: () => setTheme((value) => value === 'light' ? 'dark' : 'light') },
  ], [addShape, duplicateSelection, exportText, flow, groupSelection, openAi, openGoldBenchmark, openScientific, redo, startNewDocument, theme, undo, ungroupSelection]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); return; }
      if (modifier && event.key.toLowerCase() === 'j') { event.preventDefault(); openAi('paper'); return; }
      if (typing) return;
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      else if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); }
      else if (modifier && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroupSelection() : groupSelection(); }
      else if (modifier && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); }
      else if (modifier && event.key.toLowerCase() === 'c') { event.preventDefault(); void copySelection(); }
      else if (modifier && event.key.toLowerCase() === 'v') { event.preventDefault(); void pasteSelection(); }
      else if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); exportText('json'); }
      else if (modifier && event.key.toLowerCase() === 'o') { event.preventDefault(); setImportOpen(true); }
      else if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); startNewDocument(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
      else if (!modifier && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudgeSelection({
          x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
        });
      }
      else if (event.key.toLowerCase() === 'f') flow.fitView({ padding: 0.16, duration: 260 });
      else if (event.key === '1') setTool('select');
      else if (event.key === '2') setTool('pan');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copySelection, deleteSelection, duplicateSelection, exportText, flow, groupSelection, nudgeSelection, openAi, pasteSelection, redo, selectAll, startNewDocument, undo, ungroupSelection]);

  const savedLabel = dirty
    ? '保存中…'
    : lastSavedAt
      ? `已保存 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(lastSavedAt)}`
      : '本地保存';

  const referenceNode = nodes.find((node) => node.data.kind === 'image' && node.data.imageUrl);

  return (
    <div className={`app-shell ${leftOpen ? 'has-library' : ''} ${rightOpen ? 'has-inspector' : ''}`}>
      <a className="skip-link" href="#flow-canvas">跳到画布</a>
      <header className="topbar">
        <div className="topbar__left">
          <nav className="platform-nav" aria-label="平台工作区">
            <a href="/" title="论文阅读">P</a>
            <a href="/atlas/" title="前沿研究">A</a>
            <a href="/courses/" title="系统课程">C</a>
            <span aria-current="page" title="科研绘图">F</span>
          </nav>
          <button className="brand" onClick={() => setCommandOpen(true)} aria-label="Flowloom 命令">
            <span className="brand__mark"><GitBranch size={18} /></span>
            <span className="brand__name">Flowloom</span>
          </button>
          <span className="topbar__divider" />
          <IconButton label={leftOpen ? '收起图形库' : '展开图形库'} icon={leftOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />} onClick={toggleLibrary} />
          <div className="document-title">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onFocus={beginTransaction}
              onBlur={endTransaction}
              aria-label="流程图标题"
              spellCheck={false}
            />
            <span className={dirty ? 'is-dirty' : ''}><Save size={12} />{savedLabel}</span>
          </div>
        </div>

        <div className="topbar__center" role="toolbar" aria-label="编辑工具">
          <div className="tool-segment">
            <IconButton label="选择工具 (1)" icon={<MousePointer2 size={17} />} active={tool === 'select'} onClick={() => setTool('select')} />
            <IconButton label="抓手工具 (2)" icon={<Hand size={17} />} active={tool === 'pan'} onClick={() => setTool('pan')} />
          </div>
          <span className="topbar__divider" />
          <IconButton label="撤销" icon={<Undo2 size={17} />} disabled={past.length === 0} onClick={undo} />
          <IconButton label="重做" icon={<Redo2 size={17} />} disabled={future.length === 0} onClick={redo} />
        </div>

        <div className="topbar__right">
          <button className="topbar-command topbar-command--compact scientific-button" aria-label="打开科研绘图工作台" onClick={() => openScientific('figure')}><ChartSpline size={16} /><span>科研</span></button>
          <button className="topbar-command topbar-command--compact" aria-label="使用代码绘制流程图" onClick={() => setCodeOpen(true)}><Code2 size={16} /><span>代码</span></button>
          <button className="topbar-command topbar-command--compact pdf-vector-button" aria-label="把 PDF 拆为可编辑 SVG" onClick={() => setImportOpen(true)}><FileUp size={16} /><span>PDF 拆图</span></button>
          <button ref={exportButtonRef} className="topbar-command topbar-command--compact" aria-label="导出流程图" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen((value) => !value)}><Download size={16} /><span>导出</span><ChevronDown size={13} /></button>
          <button className="primary-button ai-button paper-generate-button" aria-label="从论文语义生成科研图" onClick={() => openAi('paper')}><Sparkles size={16} /><span>论文绘图</span></button>
          <IconButton label={theme === 'light' ? '深色模式' : '浅色模式'} icon={theme === 'light' ? <Moon size={17} /> : <Sun size={17} />} onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} />
          <IconButton label="命令面板" icon={<Command size={17} />} onClick={() => setCommandOpen(true)} />
          <IconButton label={rightOpen ? '收起属性面板' : '展开属性面板'} icon={rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />} className="inspector-toggle" onClick={toggleInspector} />
          <IconButton label="菜单" icon={<Menu size={18} />} className="mobile-menu-button" onClick={() => setCommandOpen(true)} />
        </div>
      </header>

      <LibraryPanel open={leftOpen} onAddShape={addShape} onLoadTemplate={(id) => { loadTemplate(id); setFidelity('structural'); setSourceFormat('模板'); window.setTimeout(() => flow.fitView({ padding: 0.16, duration: 260 }), 80); }} />

      <main
        id="flow-canvas"
        ref={canvasRef}
        className={`canvas-area canvas-area--${tool}`}
        onDrop={handleDrop}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
      >
        <ReactFlow<FlowNode, FlowEdge>
          nodes={renderedNodes}
          edges={renderedEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={reconnect}
          onNodeDragStart={beginTransaction}
          onNodeDragStop={endTransaction}
          onSelectionDragStart={beginTransaction}
          onSelectionDragStop={endTransaction}
          onPaneClick={clearSelection}
          onMove={(_event, viewport: Viewport) => setZoom(viewport.zoom)}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.12}
          maxZoom={4}
          snapToGrid={snap}
          snapGrid={[12, 12]}
          panActivationKeyCode="Space"
          panOnDrag={tool === 'pan' ? true : [1, 2]}
          selectionOnDrag={tool === 'select'}
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          elevateNodesOnSelect={false}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          connectionLineStyle={{ stroke: 'oklch(0.560 0.155 72)', strokeWidth: 2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--canvas-grid)" />
          {minimap && (
            <MiniMap
              className="flow-minimap"
              pannable
              zoomable
              nodeColor={(node) => String((node.data as FlowNode['data']).fill)}
              nodeStrokeColor={(node) => String((node.data as FlowNode['data']).stroke)}
              maskColor="var(--minimap-mask)"
            />
          )}
          <CanvasControls zoom={zoom} snap={snap} minimap={minimap} onToggleSnap={() => setSnap((value) => !value)} onToggleMinimap={() => setMinimap((value) => !value)} />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="empty-canvas">
            <span><Layers3 size={23} /></span>
            <h1>Flowloom 科研图工作台</h1>
            <div className="empty-canvas__primary-actions">
              <button className="primary-button" onClick={() => setImportOpen(true)}><FileUp size={16} /> PDF 拆为 SVG</button>
              <button className="primary-button" onClick={() => openAi('paper')}><Sparkles size={16} /> 从论文生成科研图</button>
            </div>
            <div className="empty-canvas__secondary-actions">
              <button className="secondary-button" onClick={() => openAi('general')}><Bot size={16} /> 通用 AI</button>
              <button className="secondary-button" onClick={() => openScientific('figure')}><ChartSpline size={16} /> 科研图版</button>
              <button className="secondary-button" onClick={() => setCodeOpen(true)}><Code2 size={16} /> 代码绘图</button>
              <button className="secondary-button" onClick={() => addShape('process')}><FilePlus2 size={16} /> 添加节点</button>
            </div>
          </div>
        )}
      </main>

      <Inspector open={rightOpen} nodes={nodes} edges={edges} onOpenAi={() => openAi('paper')} />

      <PageBar onPageChange={() => flow.fitView({ padding: 0.16, duration: 220 })} />

      <footer className="statusbar">
        <span className={`fidelity-status fidelity-status--${fidelity}`}><Check size={12} />{fidelity === 'structural' ? '结构保真' : fidelity === 'hybrid' ? '混合保真' : '视觉保真'}</span>
        <span>{sourceFormat}</span>
        <span>{nodes.length} 节点</span>
        <span>{edges.length} 连线</span>
        <span>{pages.length} 页面</span>
        <span>{layers.length} 图层</span>
        {activeScientificFigure && <span>{activeScientificFigure.widthMm} × {activeScientificFigure.heightMm} mm</span>}
        <span className="statusbar__spacer" />
        <span>本地优先</span>
      </footer>

      <ExportMenu open={exportOpen} anchorRef={exportButtonRef} exporting={exporting} onClose={() => setExportOpen(false)} onExportText={exportText} onExportImage={(format) => void exportImage(format)} />
      <Suspense fallback={null}>
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={applyImport} />
        <AiDialog
          open={aiOpen}
          initialMode={aiMode}
          initialPaperContext={incomingPaperContext}
          referenceNode={referenceNode}
          onClose={closeAi}
          onApply={applyAi}
        />
        <CodeDialog open={codeOpen} documentTitle={title} onClose={() => setCodeOpen(false)} onApply={applyImport} />
        <ScientificDialog
          open={scientificOpen}
          initialTab={scientificInitialTab}
          nodes={nodes}
          edges={edges}
          figure={activeScientificFigure}
          onClose={() => setScientificOpen(false)}
          onOpenGoldBenchmark={openGoldBenchmark}
          onConfigureFigure={applyScientificFigure}
          onInsertChart={applyScientificChart}
          onInsertSchematic={applyScientificSchematic}
        />
      </Suspense>
      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <ToastRegion toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <EditorApp />
    </ReactFlowProvider>
  );
}
