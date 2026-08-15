import type { Edge, Node, XYPosition } from '@xyflow/react';

export const SHAPE_KINDS = [
  'start',
  'process',
  'decision',
  'document',
  'data',
  'database',
  'manual',
  'multiple-documents',
  'predefined-process',
  'preparation',
  'manual-operation',
  'stored-data',
  'internal-storage',
  'display',
  'delay',
  'on-page-connector',
  'off-page-connector',
  'merge',
  'extract',
  'sort',
  'collate',
  'summing-junction',
  'or-junction',
  'sequential-storage',
  'direct-storage',
  'paper-tape',
  'punched-card',
  'loop-limit',
  'annotation',
  'bpmn-start-event',
  'bpmn-intermediate-event',
  'bpmn-end-event',
  'bpmn-task',
  'bpmn-user-task',
  'bpmn-service-task',
  'bpmn-exclusive-gateway',
  'bpmn-parallel-gateway',
  'bpmn-inclusive-gateway',
  'bpmn-data-object',
  'bpmn-data-store',
  'bpmn-pool',
  'bpmn-message-event',
  'bpmn-timer-event',
  'bpmn-error-event',
  'bpmn-signal-event',
  'bpmn-send-task',
  'bpmn-receive-task',
  'bpmn-manual-task',
  'bpmn-business-rule-task',
  'bpmn-script-task',
  'bpmn-call-activity',
  'bpmn-event-gateway',
  'bpmn-complex-gateway',
  'bpmn-transaction',
  'uml-actor',
  'uml-use-case',
  'uml-class',
  'uml-package',
  'uml-component',
  'uml-state',
  'uml-note',
  'uml-interface',
  'uml-object',
  'uml-artifact',
  'uml-node',
  'uml-activity',
  'uml-decision',
  'uml-final-state',
  'uml-lifeline',
  'erd-entity',
  'erd-weak-entity',
  'erd-relationship',
  'erd-identifying-relationship',
  'erd-attribute',
  'erd-key-attribute',
  'erd-multivalued-attribute',
  'erd-table',
  'arch-service',
  'arch-api',
  'arch-server',
  'arch-database',
  'arch-cache',
  'arch-queue',
  'arch-storage',
  'arch-load-balancer',
  'arch-firewall',
  'arch-client',
  'rectangle',
  'rounded-rectangle',
  'ellipse',
  'triangle',
  'hexagon',
  'cloud',
  'callout',
  'note',
  'group',
  'swimlane',
  'scientific-image-frame',
  'scientific-token-strip',
  'scientific-transformer',
  'scientific-layer-stack',
  'scientific-dataset-stack',
  'scientific-frozen',
  'scientific-trainable',
  'scientific-camera',
  'scientific-robot-arm',
  'scientific-humanoid',
  'scientific-mobile-robot',
  'scientific-trajectory',
  'scientific-voxel-grid',
  'scientific-coordinate-frame',
  'scientific-timeline',
  'scientific-mini-plot',
  'scientific-action-chunk',
  'scientific-loss-target',
  'scientific-scene-frame',
  'scientific-feature-map',
  'scientific-attention-map',
  'scientific-embedding-space',
  'scientific-probability-bars',
  'scientific-uncertainty-band',
  'scientific-metric-panel',
  'scientific-ablation-table',
  'scientific-decision-gate',
  'scientific-prompt-card',
  'scientific-preference-pair',
  'scientific-data-funnel',
  'scientific-legend',
  'scientific-equation',
  'scientific-tensor',
  'scientific-zoom-inset',
  'scientific-task-object',
  'scientific-goal-region',
  'scientific-contact-point',
  'scientific-release-gate',
  'vector',
  'image',
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type EdgeRouting = 'smoothstep' | 'straight' | 'bezier';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowHead = 'none' | 'open' | 'closed';
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type FidelityLevel = 'structural' | 'hybrid' | 'visual';
export type SvgPrimitiveTag = 'rect' | 'ellipse' | 'circle' | 'line' | 'polyline' | 'polygon' | 'path' | 'text';
export type ScientificChartType = 'scatter' | 'line' | 'bar' | 'boxplot' | 'heatmap' | 'errorbar';
export type ScientificRole = 'figure-background' | 'panel-guide' | 'panel-label' | 'chart-root' | 'schematic-root';
export type ScientificSchematicRole =
  | 'frame'
  | 'phase'
  | 'modality'
  | 'token'
  | 'encoder'
  | 'bridge'
  | 'backbone'
  | 'policy'
  | 'action'
  | 'environment'
  | 'memory'
  | 'dataset'
  | 'loss'
  | 'annotation';

export type ScientificSchematicTemplateId =
  | 'multimodal-foundation'
  | 'vision-language-bridge'
  | 'vla-policy'
  | 'prompt-conditioned-agent'
  | 'embodied-loop'
  | 'train-deploy'
  | 'llm-training-pipeline'
  | 'moe-routing'
  | 'rag-tool-agent'
  | 'reasoning-trace'
  | 'robot-data-collection'
  | 'world-model-rollout'
  | 'sim-to-real'
  | 'multi-embodiment-policy';

export type ScientificSchematicStyle = 'conference' | 'technical' | 'monochrome';
export type ScientificSchematicDensity = 'compact' | 'standard' | 'detailed';
export type ScientificSchematicLanguage = 'en' | 'zh';
export type ScientificSchematicLayout = 'freeform' | 'single-column' | 'double-column' | 'presentation';
export type ScientificEvidenceState = 'schematic' | 'data-bound';
export type ScientificAssetState = 'synthetic-placeholder' | 'user-provided' | 'measured-evidence';
export type ImageFit = 'contain' | 'cover';
export type ScientificConnectorSemantic = 'data' | 'control' | 'gradient' | 'feedback' | 'optional' | 'broadcast' | 'temporal';
export type ScientificRouteSide = 'left' | 'right' | 'bottom-left' | 'bottom-right';
export type ScientificVisualVariant =
  | 'default'
  | 'multiview'
  | 'success'
  | 'collision'
  | 'uncertain'
  | 'execution'
  | 'state-vector'
  | 'telemetry'
  | 'vlm'
  | 'world-model'
  | 'base-model'
  | 'aligned-model'
  | 'checkpoint'
  | 'diffusion-action'
  | 'action-horizon'
  | 'next-token'
  | 'preference-objective'
  | 'risk-ranking'
  | 'capability-safety'
  | 'prediction-error'
  | 'score-bracket'
  | 'object-cube'
  | 'object-cylinder'
  | 'goal-bin'
  | 'force-contact'
  | 'release-gate';

export interface ScientificSchematicOptions {
  templateId: ScientificSchematicTemplateId;
  title: string;
  backbone: string;
  style: ScientificSchematicStyle;
  density: ScientificSchematicDensity;
  language: ScientificSchematicLanguage;
}

export interface ScientificFigureSpec {
  widthMm: number;
  heightMm: number;
  dpi: number;
  rows: number;
  columns: number;
  marginMm: number;
  gapMm: number;
  panelLabels: boolean;
  labelStyle: 'uppercase' | 'lowercase' | 'numeric';
  background: '#ffffff' | 'transparent';
  updatedAt: string;
}

export interface ScientificFieldMap {
  x: string;
  y: string;
  color?: string;
  error?: string;
}

export interface ScientificProvenance {
  id: string;
  kind: 'data-chart' | 'imported-asset' | 'scientific-schematic';
  sourceName: string;
  sourceFormat: string;
  sourceData?: string;
  chartType?: ScientificChartType;
  chartSpec?: Record<string, unknown>;
  fields?: ScientificFieldMap;
  units?: Record<string, string>;
  uncertainty?: {
    field?: string;
    definition?: string;
  };
  engine?: string;
  generatedAt: string;
  license?: {
    name: string;
    url?: string;
    author?: string;
    modified?: boolean;
  };
  schematic?: {
    templateId: ScientificSchematicTemplateId | 'ai-generated';
    style: ScientificSchematicStyle;
    density: ScientificSchematicDensity;
    language: ScientificSchematicLanguage;
    backbone?: string;
    references?: string[];
    generatedBy: 'template' | 'ai';
    prompt?: string;
    layout?: ScientificSchematicLayout;
    targetWidthMm?: number;
    targetHeightMm?: number;
  };
}

export interface ScientificDataContract {
  sourceName: string;
  fields: string[];
  units?: Record<string, string>;
  sampleSize?: number | string;
  metricDefinition?: string;
  uncertaintyDefinition?: string;
}

export interface ScientificAuditIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'layout' | 'typography' | 'stroke' | 'color' | 'data' | 'raster';
  title: string;
  detail: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

export interface SvgVectorElement {
  tag: SvgPrimitiveTag;
  viewBox: [number, number, number, number];
  attributes: Record<string, string | number>;
  text?: string;
  sourceElementId?: string;
}

export interface ResearchSourceLocator {
  kind: 'paper' | 'course' | 'code' | 'web' | 'dataset' | 'figure';
  canonicalPaperRef?: string;
  paperfieldId?: string;
  courseChapterId?: string;
  url?: string;
  page?: number;
  section?: string;
  figure?: string;
  table?: string;
  equation?: string;
  quote?: string;
  contentSha256?: string;
}

export interface ResearchEvidenceReference {
  evidenceId?: string;
  label?: string;
  direction?: string;
  paperfieldPath: string;
  sourceLocator: ResearchSourceLocator;
}

/** Provenance shared by imported figures and model-generated schematics. */
export interface DiagramProvenance {
  schemaVersion: 1;
  sourceType: 'pdf-extraction' | 'paper-semantic-generation';
  paperRef?: string;
  paperfieldId?: string;
  page?: number;
  figure?: string;
  section?: string;
  quote?: string;
  sourceHash?: string;
  model?: string;
  templateIds?: string[];
  libraryElements?: string[];
  confidence?: number;
  warnings: string[];
}

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  kind: ShapeKind;
  fill: string;
  stroke: string;
  textColor: string;
  borderWidth: number;
  radius: number;
  fontSize: number;
  fontWeight: number;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  opacity: number;
  rotation: number;
  layerId?: string;
  hidden?: boolean;
  vector?: SvgVectorElement;
  imageUrl?: string;
  imageFit?: ImageFit;
  sourceRef?: string;
  researchSourceLocator?: ResearchSourceLocator;
  researchFigureContext?: {
    schemaVersion: 1;
    figureId: string;
    assetKind: 'raster-page' | 'raster-crop' | 'svg' | 'flowloom-document';
    assetSha256?: string;
    producer: 'paperfield' | 'research-atlas' | 'courses' | 'flowloom';
    producedAt: string;
  };
  researchClaimContext?: {
    schemaVersion: 1;
    threadId: string;
    threadSlug: string;
    threadRevision: number;
    threadContentSha256: string;
    claimId: string;
    role: string;
    canonicalPaperRef: string;
    paperfieldPath: string;
    sourceSha256: string;
    evidenceIds: string[];
    evidence: ResearchEvidenceReference[];
  };
  rasterWidthPx?: number;
  rasterHeightPx?: number;
  scientificAssetState?: ScientificAssetState;
  scientificAssetGenerator?: string;
  scientificAssetPromptRef?: string;
  scientificAssetLicense?: string;
  provenance?: ScientificProvenance;
  provenanceRef?: string;
  diagramProvenance?: DiagramProvenance;
  scientificRole?: ScientificRole;
  schematicRole?: ScientificSchematicRole;
  schematicDetail?: ScientificSchematicDensity;
  scientificTextPaddingX?: number;
  scientificTextPaddingY?: number;
  scientificDescriptionFontSize?: number;
  scientificVariant?: ScientificVisualVariant;
  scientificEvidence?: ScientificEvidenceState;
  scientificDataContract?: ScientificDataContract;
  exportExcluded?: boolean;
  locked?: boolean;
}

export interface ScientificRouteWaypoint {
  origin: 'source' | 'target';
  dx: number;
  dy: number;
}

export interface ScientificRouteAnchorOffset {
  dx: number;
  dy: number;
}

export interface FlowEdgeData extends Record<string, unknown> {
  label?: string;
  color: string;
  width: number;
  lineStyle: LineStyle;
  routing: EdgeRouting;
  arrowStart: ArrowHead;
  arrowEnd: ArrowHead;
  scientificSemantic?: ScientificConnectorSemantic;
  routeSide?: ScientificRouteSide;
  routeOffset?: number;
  routeWaypoints?: ScientificRouteWaypoint[];
  sourceAnchorOffset?: ScientificRouteAnchorOffset;
  targetAnchorOffset?: ScientificRouteAnchorOffset;
  labelFontSize?: number;
  labelOffsetX?: number;
  labelOffsetY?: number;
  researchRelationContext?: {
    schemaVersion: 1;
    threadId: string;
    threadRevision: number;
    threadContentSha256: string;
    relationId: string;
    leftClaimId: string;
    rightClaimId: string;
    relationType: 'supports' | 'extends' | 'narrows' | 'reproduces' | 'contradicts' | 'unclear';
    leftEvidence: ResearchEvidenceReference[];
    rightEvidence: ResearchEvidenceReference[];
  };
  diagramProvenance?: DiagramProvenance;
}

export type FlowNode = Node<FlowNodeData, 'flowNode'>;
export type FlowEdge = Edge<FlowEdgeData>;

export interface DiagramLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface DiagramPage {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  layers: DiagramLayer[];
  scientific?: ScientificFigureSpec;
}

export interface DiagramDocument {
  version: 2;
  title: string;
  activePageId: string;
  pages: DiagramPage[];
  meta: {
    createdAt: string;
    updatedAt: string;
    sourceFormat?: string;
    fidelity?: FidelityLevel;
  };
}

export interface ImportResult {
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  pages?: DiagramPage[];
  activePageId?: string;
  fidelity: FidelityLevel;
  sourceFormat: string;
  warnings: string[];
  pdfExtraction?: PdfExtractionSummary;
}

export interface PdfExtractionSummary {
  sourcePageCount: number;
  pageCount: number;
  editablePages: number;
  editablePrimitives: number;
  textPrimitives: number;
  rasterOperations: number;
  unsupportedOperations: number;
  omittedPrimitives: number;
  fidelity: FidelityLevel;
}

export interface DiagramTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  rememberKey: boolean;
}

export interface AiAttachment {
  name: string;
  mimeType: string;
  content: string;
  kind: 'text' | 'image' | 'pdf';
  preview?: string;
  previews?: string[];
  pageCount?: number;
  paperContext?: DiagramProvenance;
}

export interface AiPaperContext {
  paperRef?: string;
  paperfieldId?: string;
  title?: string;
  abstract?: string;
  authors?: string[];
  venue?: string;
  published?: string;
  version?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  paperfieldPath?: string;
  page?: number;
  figure?: string;
  section?: string;
  quote?: string;
  sourceHash?: string;
  dossierStatus?: string;
  analysisLevel?: string;
  sourceBasis?: string;
  coverage?: Record<string, unknown>;
  claims?: Array<{
    claimId: string;
    stage: string;
    title: string;
    statement: string;
    sourceKind: string;
    confidence: string;
    sourceSha256?: string;
    evidence: Array<{
      evidenceId?: string;
      paperfieldPath: string;
      page?: number;
      section?: string;
      figure?: string;
      table?: string;
      equation?: string;
      quote?: string;
    }>;
  }>;
  terms?: string[];
  curriculum?: Record<string, unknown>;
  insufficientInformation?: string[];
  templateIds?: string[];
  libraryElements?: string[];
}

export interface AiDiagramRequest {
  prompt: string;
  scenario: string;
  attachments: AiAttachment[];
  config: AiConfig;
  paperContext?: AiPaperContext;
  attachmentTransferConfirmed?: boolean;
  signal?: AbortSignal;
}

export interface AiDiagramPayload {
  title?: string;
  direction?: 'TB' | 'LR';
  nodes: Array<{
    id?: string;
    label: string;
    description?: string;
    kind?: ShapeKind;
    position?: XYPosition;
    width?: number;
    height?: number;
    fill?: string;
    stroke?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: number;
    borderWidth?: number;
    radius?: number;
    opacity?: number;
    rotation?: number;
    zIndex?: number;
    role?: ScientificSchematicRole;
    sourceQuote?: string;
    confidence?: number;
    inferred?: boolean;
  }>;
  edges: Array<{
    id?: string;
    source: string;
    target: string;
    label?: string;
    routing?: EdgeRouting;
    lineStyle?: LineStyle;
    color?: string;
    width?: number;
    arrowStart?: ArrowHead;
    arrowEnd?: ArrowHead;
    sourceQuote?: string;
    confidence?: number;
    inferred?: boolean;
  }>;
}

export interface ToastMessage {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}
