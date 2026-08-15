import vlaApproach from '../assets/scientific/vla-approach.jpg?inline';
import vlaFront from '../assets/scientific/vla-front.jpg?inline';
import vlaGrasp from '../assets/scientific/vla-grasp.jpg?inline';
import vlaObserve from '../assets/scientific/vla-observe.jpg?inline';
import vlaPlace from '../assets/scientific/vla-place.jpg?inline';
import worldActual from '../assets/scientific/world-actual.webp?inline';
import worldCollision from '../assets/scientific/world-collision.webp?inline';
import worldCurrent from '../assets/scientific/world-current.webp?inline';
import worldSuccess from '../assets/scientific/world-success.webp?inline';
import worldUncertain from '../assets/scientific/world-uncertain.webp?inline';
import type {
  FlowEdge,
  FlowNode,
  ScientificConnectorSemantic,
  ScientificProvenance,
  ScientificRouteAnchorOffset,
  ScientificRouteSide,
  ScientificRouteWaypoint,
  ScientificSchematicDensity,
  ScientificSchematicLayout,
  ScientificSchematicOptions,
  ScientificSchematicRole,
  ScientificVisualVariant,
  ShapeKind,
} from '../types';
import { createEdgeMarker, createFlowEdge, createFlowNode } from './diagram';
import { SCIENTIFIC_CONNECTOR_STYLES } from './scientificRouting';

export interface PublicationFlagshipBlueprint {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
}

export type Box = readonly [x: number, y: number, width: number, height: number];
export type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'coral' | 'violet' | 'ink';

export interface FlagshipPalette {
  ink: string;
  panel: string;
  tones: Record<Tone, { fill: string; stroke: string; text: string }>;
  edge: Record<ScientificConnectorSemantic, string>;
}

export interface NodeSpec {
  id: string;
  role: ScientificSchematicRole;
  box: Box;
  label: string;
  description?: string;
  kind?: ShapeKind;
  tone?: Tone;
  detail?: ScientificSchematicDensity;
  variant?: ScientificVisualVariant;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  fill?: string;
  stroke?: string;
  borderWidth?: number;
  radius?: number;
  zIndex?: number;
  scientificRole?: FlowNode['data']['scientificRole'];
  provenance?: ScientificProvenance;
  imageUrl?: string;
  imageFit?: FlowNode['data']['imageFit'];
  rasterWidthPx?: number;
  rasterHeightPx?: number;
  sourceRef?: string;
  promptRef?: string;
  textPaddingX?: number;
  textPaddingY?: number;
}

export interface EdgeSpec {
  id?: string;
  source: string;
  target: string;
  semantic?: ScientificConnectorSemantic;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  labelFontSize?: number;
  routing?: 'smoothstep' | 'straight' | 'bezier';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  arrowEnd?: 'none' | 'open' | 'closed';
  routeSide?: ScientificRouteSide;
  routeOffset?: number;
  routeWaypoints?: ScientificRouteWaypoint[];
  sourceAnchorOffset?: ScientificRouteAnchorOffset;
  targetAnchorOffset?: ScientificRouteAnchorOffset;
  labelOffsetX?: number;
  labelOffsetY?: number;
  width?: number;
}

const COLOR_PALETTE: FlagshipPalette = {
  ink: '#17232D',
  panel: '#B9C5CE',
  tones: {
    neutral: { fill: '#FFFFFF', stroke: '#8797A3', text: '#17232D' },
    blue: { fill: '#EDF7FC', stroke: '#1D6F98', text: '#113D55' },
    green: { fill: '#EEF8F2', stroke: '#2E7658', text: '#16442F' },
    amber: { fill: '#FFF7E6', stroke: '#A66A0A', text: '#573705' },
    coral: { fill: '#FFF0ED', stroke: '#B64036', text: '#63221D' },
    violet: { fill: '#F4F0F9', stroke: '#6E5198', text: '#3C2A60' },
    ink: { fill: '#22313B', stroke: '#17232D', text: '#FFFFFF' },
  },
  edge: {
    data: '#40515D',
    control: '#176D98',
    gradient: '#A43D50',
    feedback: '#A43D50',
    optional: '#68727A',
    broadcast: '#2E7658',
    temporal: '#8A5C0D',
  },
};

const MONO_PALETTE: FlagshipPalette = {
  ink: '#111111',
  panel: '#A8A8A8',
  tones: {
    neutral: { fill: '#FFFFFF', stroke: '#707070', text: '#111111' },
    blue: { fill: '#F5F5F5', stroke: '#333333', text: '#111111' },
    green: { fill: '#FAFAFA', stroke: '#4A4A4A', text: '#111111' },
    amber: { fill: '#FFFFFF', stroke: '#5A5A5A', text: '#111111' },
    coral: { fill: '#ECECEC', stroke: '#292929', text: '#111111' },
    violet: { fill: '#F2F2F2', stroke: '#404040', text: '#111111' },
    ink: { fill: '#242424', stroke: '#111111', text: '#FFFFFF' },
  },
  edge: {
    data: '#2F2F2F',
    control: '#111111',
    gradient: '#444444',
    feedback: '#111111',
    optional: '#666666',
    broadcast: '#333333',
    temporal: '#454545',
  },
};

const VLA_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#vla-storyboard';
const WORLD_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#world-model-counterfactuals';

export function paletteFor(options: ScientificSchematicOptions): FlagshipPalette {
  return options.style === 'monochrome' ? MONO_PALETTE : COLOR_PALETTE;
}

export function dimensionsFor(layout: ScientificSchematicLayout): { width: number; height: number } {
  if (layout === 'single-column') return { width: 770, height: 600 };
  if (layout === 'presentation') return { width: 1660, height: 860 };
  return { width: 1660, height: 1020 };
}

export function makeNode(palette: FlagshipPalette, spec: NodeSpec): FlowNode {
  const [x, y, width, height] = spec.box;
  const tone = palette.tones[spec.tone ?? 'neutral'];
  const kind = spec.kind ?? 'rounded-rectangle';
  const node = createFlowNode(kind, { x, y }, spec.label, {
    id: spec.id,
    selected: false,
    zIndex: spec.zIndex ?? (spec.role === 'frame' ? -30 : spec.role === 'phase' ? -20 : 10),
    style: { width, height },
  });
  const frame = spec.role === 'frame';
  const phase = spec.role === 'phase';
  const annotation = spec.role === 'annotation';
  node.data = {
    ...node.data,
    label: spec.label,
    description: spec.description,
    fill: spec.fill ?? (frame || phase ? 'transparent' : tone.fill),
    stroke: spec.stroke ?? (frame || phase ? 'none' : tone.stroke),
    textColor: frame || phase ? palette.ink : tone.text,
    borderWidth: spec.borderWidth ?? (frame || phase ? 0 : 1.8),
    radius: spec.radius ?? (frame || phase ? 0 : 4),
    fontSize: spec.fontSize ?? (phase ? 32 : annotation ? 24 : 28),
    fontWeight: spec.fontWeight ?? (phase ? 700 : annotation ? 560 : 600),
    textAlign: spec.textAlign ?? (frame || phase || annotation ? 'left' : 'center'),
    verticalAlign: spec.verticalAlign ?? (phase ? 'top' : 'middle'),
    schematicRole: spec.role,
    schematicDetail: spec.detail ?? 'compact',
    scientificRole: spec.scientificRole,
    provenance: spec.provenance,
    scientificVariant: spec.variant,
    scientificEvidence: 'schematic',
    scientificTextPaddingX: spec.textPaddingX ?? (phase ? 3 : undefined),
    scientificTextPaddingY: spec.textPaddingY ?? (phase ? 0 : undefined),
    imageUrl: spec.imageUrl,
    imageFit: spec.imageFit,
    rasterWidthPx: spec.rasterWidthPx,
    rasterHeightPx: spec.rasterHeightPx,
    sourceRef: spec.sourceRef,
    scientificAssetState: spec.imageUrl ? 'synthetic-placeholder' : undefined,
    scientificAssetGenerator: spec.imageUrl ? 'gpt-image-2 via local CCSwitch endpoint' : undefined,
    scientificAssetPromptRef: spec.promptRef,
    scientificAssetLicense: spec.imageUrl
      ? 'Project-generated illustrative asset; replace with experiment media when used as evidence.'
      : undefined,
  };
  return node;
}

export function makeImage(
  palette: FlagshipPalette,
  spec: Omit<NodeSpec, 'kind' | 'role'> & { role?: ScientificSchematicRole },
): FlowNode {
  return makeNode(palette, {
    ...spec,
    kind: 'image',
    role: spec.role ?? 'modality',
    imageFit: spec.imageFit ?? 'cover',
    fill: '#FFFFFF',
    stroke: spec.stroke ?? palette.edge.data,
    borderWidth: spec.borderWidth ?? 1.3,
    radius: 2,
  });
}

export function makeEdge(palette: FlagshipPalette, spec: EdgeSpec): FlowEdge {
  const semantic = spec.semantic ?? 'data';
  const baseStyle = SCIENTIFIC_CONNECTOR_STYLES[semantic];
  const color = palette.edge[semantic];
  const routing = spec.routing ?? 'smoothstep';
  const width = spec.width ?? baseStyle.width;
  const edge = createFlowEdge(spec.source, spec.target, spec.label, routing);
  const arrowEnd = spec.arrowEnd ?? baseStyle.arrowEnd;
  const lineStyle = spec.lineStyle ?? baseStyle.lineStyle;
  edge.id = spec.id ?? `edge-${spec.source}-${spec.target}`;
  edge.type = 'scientific';
  edge.sourceHandle = spec.sourceHandle;
  edge.targetHandle = spec.targetHandle;
  edge.label = spec.label;
  edge.data = {
    ...edge.data!,
    label: spec.label,
    color,
    width,
    routing,
    lineStyle,
    arrowEnd,
    scientificSemantic: semantic,
    routeSide: spec.routeSide,
    routeOffset: spec.routeOffset,
    routeWaypoints: spec.routeWaypoints,
    sourceAnchorOffset: spec.sourceAnchorOffset,
    targetAnchorOffset: spec.targetAnchorOffset,
    labelFontSize: spec.labelFontSize ?? 22,
    labelOffsetX: spec.labelOffsetX,
    labelOffsetY: spec.labelOffsetY,
  };
  edge.style = {
    ...edge.style,
    stroke: color,
    strokeWidth: width,
    strokeDasharray: lineStyle === 'dashed' ? '8 6' : lineStyle === 'dotted' ? '2 5' : undefined,
  };
  edge.markerEnd = createEdgeMarker(arrowEnd, color);
  return edge;
}

export function makeRoot(
  palette: FlagshipPalette,
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  width: number,
  height: number,
): FlowNode {
  return makeNode(palette, {
    id: `${options.templateId}-publication-root`,
    kind: 'group',
    role: 'frame',
    box: [0, 0, width, height],
    label: '',
    scientificRole: 'schematic-root',
    provenance,
  });
}

export function makeStage(palette: FlagshipPalette, id: string, box: Box, label: string, fontSize: number): FlowNode {
  return makeNode(palette, {
    id,
    kind: 'group',
    role: 'phase',
    box,
    label,
    fontSize,
    zIndex: -10,
  });
}

export function makePanel(palette: FlagshipPalette, id: string, box: Box, tone: Tone): FlowNode {
  const colors = palette.tones[tone];
  return makeNode(palette, {
    id,
    kind: 'rounded-rectangle',
    role: 'frame',
    box,
    label: '',
    fill: colors.fill,
    stroke: colors.stroke,
    borderWidth: 1.3,
    radius: 7,
    zIndex: -15,
  });
}

export function makeCaption(
  palette: FlagshipPalette,
  id: string,
  box: Box,
  label: string,
  fontSize: number,
  description?: string,
  textAlign: 'left' | 'center' | 'right' = 'center',
): FlowNode {
  return makeNode(palette, {
    id,
    role: 'annotation',
    box,
    label,
    description,
    fill: 'transparent',
    stroke: 'none',
    borderWidth: 0,
    fontSize,
    fontWeight: 620,
    textAlign,
    textPaddingX: 1,
    textPaddingY: 0,
  });
}

function vlaSingle(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [18, 10, 160, 32], 'A  Grounded task', 25),
    makeStage(palette, 'vla-stage-policy', [202, 10, 280, 32], 'B  Object identity', 25),
    makeStage(palette, 'vla-stage-action', [510, 10, 240, 32], 'C  Flow action', 25),
    makePanel(palette, 'vla-method-panel', [500, 45, 250, 360], 'green'),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [20, 52, 145, 108], label: 'Observed task', imageUrl: vlaObserve,
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'vla-observe.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', box: [20, 185, 145, 150], label: 'Task ℓ + state sₜ',
      description: 'place cube → tray\nsₜ∈ℝ¹⁵', tone: 'amber', variant: 'state-vector', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [205, 58, 105, 108],
      label: 'Tokens X₀', tone: 'amber', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [335, 52, 143, 125],
      label: options.backbone, tone: 'violet', variant: 'vlm', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'vla-grounding', role: 'token', kind: 'scientific-attention-map', box: [205, 210, 273, 140],
      label: 'Grounding zobj → hₜ', tone: 'neutral', variant: 'multiview', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'vla-baseline', role: 'policy', box: [205, 365, 273, 42], label: 'BASELINE · autoregressive head',
      tone: 'violet', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [510, 55, 105, 125],
      label: 'Flow field vθ', tone: 'coral', variant: 'diffusion-action', fontSize: 22, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [640, 55, 100, 100], label: 'ODE solver',
      description: 'NFE=10', tone: 'coral', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [510, 205, 105, 54], label: 'Seed A₀=ε',
      tone: 'amber', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [635, 185, 105, 82],
      label: 'H×7 chunk', tone: 'blue', variant: 'action-horizon', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [510, 285, 105, 62], label: 'Flow loss',
      description: 'Aτ ; u=A−ε', tone: 'coral', fontSize: 19,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [635, 290, 105, 57], label: 'Limits + contact',
      tone: 'neutral', fontSize: 19,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [510, 365, 105, 40], label: 'Safety Πsafe',
      tone: 'neutral', fontSize: 19,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [635, 365, 105, 40], label: 'MPC · K=4',
      tone: 'blue', fontSize: 19,
    }),
    makeStage(palette, 'vla-stage-execution', [18, 425, 732, 32], 'D  Execute and re-observe', 25),
  );
  const frames = [
    ['vla-exec-observe', vlaObserve, 't', 20, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 't+4', 140, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 't+8', 260, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 't+12', 380, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [x, 465, 90, 70], label, imageUrl: image, imageFit: 'cover', rasterWidthPx: 400,
        rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-caption`, [x, 538, 90, 30], label, 19),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [515, 465, 215, 100],
      label: 'Executed path', tone: 'blue', fontSize: 21,
    }),
    makeCaption(
      palette,
      'vla-contribution',
      [20, 570, 470, 28],
      'METHOD · zobj → flow → ODE → re-observe',
      19,
    ),
    makeCaption(palette, 'vla-media-note', [515, 570, 215, 28], 'Synthetic · mechanism only', 18),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-grounding', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control', label: 'zobj' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-baseline', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 13 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 12 }),
  ];
  return { nodes, edges, width, height };
}

function vlaDouble(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [25, 18, 285, 42], 'A  Task evidence', 32),
    makeStage(palette, 'vla-stage-policy', [345, 18, 405, 42], 'B  Object grounding', 32),
    makeStage(palette, 'vla-stage-method', [790, 18, 410, 42], 'C  METHOD · grounded flow', 32),
    makeStage(palette, 'vla-stage-control', [1235, 18, 400, 42], 'D  Project + control', 32),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [35, 82, 260, 185], label: 'Observed task', imageUrl: vlaObserve,
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'vla-observe.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'vla-instruction', role: 'modality', box: [35, 300, 260, 78], label: 'Instruction l',
      description: 'red cube -> tray', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-token-strip', box: [35, 410, 260, 88],
      label: 'Robot state sₜ', tone: 'blue',
      variant: 'state-vector', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [365, 92, 145, 110],
      label: 'Tokens X₀', tone: 'amber', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [550, 82, 180, 135],
      label: options.backbone, tone: 'violet',
      variant: 'vlm', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-grounding', role: 'token', kind: 'scientific-attention-map', box: [365, 270, 365, 128],
      label: 'Object grounding zobj → hₜ',
      tone: 'neutral', variant: 'multiview', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [805, 88, 380, 150],
      label: 'Grounded flow field vθ', description: 'vθ(Aτ | zobj,sₜ,τ)',
      tone: 'coral', variant: 'diffusion-action', fontSize: 29, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [805, 280, 105, 90], label: 'Seed A₀=ε',
      tone: 'amber', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [930, 280, 120, 90], label: 'ODE solver',
      description: 'NFE=10', tone: 'coral', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1070, 280, 115, 90],
      label: 'H×7 chunk', tone: 'blue', variant: 'action-horizon', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [805, 420, 380, 82], label: 'Flow training',
      description: 'Aτ=(1−τ)ε+τA · u=A−ε · LFM=𝔼‖vθ−u‖²', tone: 'coral', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [1250, 88, 170, 100], label: 'Safety projection',
      description: 'Πsafe(Â,ĉcontact)', tone: 'neutral', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1450, 88, 170, 100], label: 'MPC controller',
      description: 'execute K=4', tone: 'blue', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [1250, 245, 170, 90], label: 'Constraint source',
      description: 'limits(sₜ) · ĉcontact(hₜ)', tone: 'neutral', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'vla-baseline', role: 'policy', box: [1450, 245, 170, 90], label: 'BASELINE · AR head',
      description: 'independent tokens', tone: 'violet', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'vla-method-contrast', role: 'annotation', box: [1250, 390, 370, 110],
      label: 'METHOD IDENTITY', description: 'zobj → flow → ODE → coherent horizon',
      tone: 'green', detail: 'detailed', fontSize: 25, fontWeight: 720,
    }),
    makeStage(palette, 'vla-stage-execution', [25, 620, 1610, 42], 'E  Same-scene execution evidence', 32),
  );
  const frames = [
    ['vla-exec-observe', vlaObserve, 't observe', 35, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 't+4 approach', 260, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 't+8 lift', 485, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 't+12 place', 710, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [x, 695, 190, 155], label, imageUrl: image, imageFit: 'cover', rasterWidthPx: 400,
        rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-caption`, [x, 860, 190, 34], label, 24),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [965, 700, 280, 185],
      label: 'Executed tool path', description: 'Tbase→tool(t:t+12)', tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-contribution', role: 'annotation', box: [1300, 700, 320, 185],
      label: 'CLOSED LOOP', description: 'same-camera re-observation',
      tone: 'green', fontSize: 28, fontWeight: 740,
    }),
    makeCaption(palette, 'vla-media-note', [35, 945, 1585, 38], 'Synthetic task media; replace with experiment frames before empirical use.', 23),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-instruction', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-grounding', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'top', targetHandle: 'bottom' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-baseline', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'vla-baseline', target: 'vla-decision', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 20 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 18 }),
  ];
  return { nodes, edges, width, height };
}

function vlaPresentation(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [35, 20, 280, 54], 'A  Observe', 40),
    makeStage(palette, 'vla-stage-ground', [350, 20, 390, 54], 'B  Ground objects', 40),
    makeStage(palette, 'vla-stage-method', [790, 20, 350, 54], 'C  Grounded flow', 40),
    makeStage(palette, 'vla-stage-control', [1185, 20, 440, 54], 'D  Execute + re-observe', 40),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [40, 105, 270, 205], label: 'Observed task', imageUrl: vlaObserve,
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'vla-observe.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', box: [40, 350, 270, 100], label: 'Instruction + robot state',
      description: 'ℓ ; sₜ=[qₜ,q̇ₜ,gₜ]', tone: 'amber', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [370, 120, 165, 120],
      label: 'Tokens X₀', tone: 'amber', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [570, 105, 190, 150],
      label: options.backbone, tone: 'violet', variant: 'vlm', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'vla-grounding', role: 'token', kind: 'scientific-attention-map', box: [370, 300, 390, 125],
      label: 'Object grounding zobj → hₜ',
      tone: 'neutral', variant: 'multiview', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [810, 100, 320, 135],
      label: 'Grounded flow field vθ', description: 'vθ(Aτ | zobj,sₜ,τ)',
      tone: 'coral', variant: 'diffusion-action', fontSize: 33, borderWidth: 3.2,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [810, 275, 90, 80], label: 'A₀=ε',
      tone: 'amber', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [920, 275, 100, 80], label: 'ODE',
      description: 'NFE=10', tone: 'coral', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1040, 260, 90, 105],
      label: 'H×7 chunk', tone: 'blue', variant: 'action-horizon', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [810, 400, 320, 90], label: 'Flow training',
      description: 'Aτ=(1−τ)ε+τA · u=A−ε', tone: 'coral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [1200, 115, 185, 105], label: 'Safety filter',
      description: 'Πsafe(Â,ĉcontact)', tone: 'neutral', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1425, 115, 185, 105], label: 'Execute K=4',
      description: 'MPC · replan', tone: 'blue', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [1200, 300, 185, 90], label: 'Constraint source',
      description: 'limits(sₜ) · ĉcontact(hₜ)', tone: 'neutral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-baseline', role: 'policy', box: [1425, 300, 185, 90], label: 'BASELINE · AR head',
      description: 'independent tokens', tone: 'violet', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-contribution', role: 'annotation', box: [40, 535, 270, 180], label: 'METHOD IDENTITY',
      description: 'zobj → flow → ODE → re-observe', tone: 'green',
      fontSize: 32, fontWeight: 740,
    }),
  );
  const frames = [
    ['vla-exec-observe', vlaObserve, 't', 370, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 't+4', 590, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 't+8', 810, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 't+12', 1030, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [x, 540, 180, 135], label, imageUrl: image, imageFit: 'cover', rasterWidthPx: 400,
        rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-caption`, [x, 685, 180, 38], label, 27),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [1270, 540, 340, 180],
      label: 'Executed tool path', description: 'Tbase→tool(t:t+12)', tone: 'blue', fontSize: 31,
    }),
    makeCaption(palette, 'vla-media-note', [40, 790, 1570, 38], 'Synthetic storyboard; replace with experiment media before empirical use.', 26),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-grounding', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'top', targetHandle: 'bottom' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-baseline', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'vla-baseline', target: 'vla-decision', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 18 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'bottom-left', routeOffset: 18 }),
  ];
  return { nodes, edges, width, height };
}

function worldSingle(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-context', [18, 10, 170, 32], 'A  Context', 25),
    makeStage(palette, 'wm-stage-model', [210, 10, 190, 32], 'B  Imagine', 25),
    makeStage(palette, 'wm-stage-rollout', [425, 10, 325, 32], 'C  Compare M actions', 25),
    makeImage(palette, {
      id: 'wm-context', role: 'environment', box: [20, 55, 170, 42], label: 'Observed scene', imageUrl: worldCurrent, imageFit: 'contain',
      rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [20, 120, 170, 65], label: 'Goal + geometry',
      description: 'g ; Oₜ ; H fixed', tone: 'amber', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'modality', kind: 'scientific-voxel-grid', box: [20, 210, 170, 95],
      label: 'Latent scene zₜ', tone: 'blue',
      variant: 'world-model', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [225, 55, 165, 120],
      label: options.backbone, tone: 'violet',
      variant: 'world-model', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'wm-action-set', role: 'action', kind: 'scientific-action-chunk', box: [225, 190, 165, 82],
      label: 'M plans a¹:ᴹ', tone: 'blue',
      variant: 'action-horizon', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'wm-decoder', role: 'policy', box: [225, 300, 75, 65], label: 'Dψ',
      description: 'decode', tone: 'green', fontSize: 19,
    }),
    makeNode(palette, {
      id: 'wm-uncertainty', role: 'policy', box: [315, 300, 75, 65], label: 'Uepi',
      description: 'ensemble', tone: 'amber', fontSize: 19,
    }),
    makeCaption(palette, 'wm-shared-context', [425, 50, 325, 32], 'Hold zₜ,g,Oₜ,H fixed · vary aᵐ', 19),
    makeNode(palette, { id: 'wm-rollout-fanout', role: 'token', kind: 'or-junction', box: [400, 122, 24, 24], label: '', tone: 'neutral' }),
  );
  const rollouts = [
    ['wm-rollout-a', worldSuccess, 'aᴬ', 'goal', 'wm-cost-a', 'Jᴬ · goal', 'green', 425, 'world-success.webp'],
    ['wm-rollout-b', worldCollision, 'aᴮ', 'collision', 'wm-cost-b', 'Jᴮ · contact', 'coral', 535, 'world-collision.webp'],
    ['wm-rollout-c', worldUncertain, 'aᶜ', 'occluded', 'wm-cost-c', 'Jᶜ · Uepi', 'amber', 645, 'world-uncertain.webp'],
  ] as const;
  for (const [id, image, action, outcome, costId, cost, tone, x, sourceRef] of rollouts) {
    nodes.push(
      makeImage(palette, {
        id, box: [x, 112, 100, 40], label: outcome, imageUrl: image, imageFit: 'contain',
        rasterWidthPx: 960, rasterHeightPx: 160, sourceRef, promptRef: WORLD_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-action`, [x, 82, 100, 30], action, 18),
      makeCaption(palette, `${id}-caption`, [x, 155, 100, 30], outcome, 18),
      makeNode(palette, {
        id: costId, role: 'loss', box: [x, 195, 100, 65], label: cost,
        description: '', tone, fontSize: 19,
      }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [425, 275, 320, 70], label: 'a*=arg minₘ Jₘ',
      description: 'Cgoal+λCcontact+μUepi', tone: 'coral', fontSize: 22, borderWidth: 2.6,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', box: [425, 365, 140, 50], label: 'Execute K',
      tone: 'blue', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', box: [585, 365, 160, 50], label: 'Physical world',
      tone: 'green', fontSize: 21,
    }),
    makeStage(palette, 'wm-stage-feedback', [18, 420, 732, 32], 'D  Observe residual', 25),
    makeImage(palette, {
      id: 'wm-predicted', box: [20, 465, 150, 42], label: 'Predicted next view', imageUrl: worldSuccess,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-success.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [195, 460, 185, 78], label: 'Residual rₜ₊₁',
      description: 'oₜ₊₁−Dψ(ẑₜ₊₁)', tone: 'coral', fontSize: 21,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [405, 465, 150, 42], label: 'Observed next view', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-update', role: 'policy', box: [580, 460, 165, 78], label: 'Belief update',
      description: 'update(ẑ,r)', tone: 'green', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'wm-identity', role: 'annotation', box: [195, 550, 360, 45], label: 'METHOD · residual-calibrated belief',
      tone: 'green', fontSize: 19, fontWeight: 740,
    }),
    makeNode(palette, {
      id: 'wm-baseline', role: 'annotation', box: [580, 550, 165, 45], label: 'BASELINE · open loop',
      tone: 'violet', fontSize: 18,
    }),
    makeCaption(palette, 'wm-media-note', [20, 550, 150, 45], 'Synthetic futures', 17),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-context', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-set', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-decoder', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-uncertainty', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-decoder', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-cost-b', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'wm-cost-c', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'wm-uncertainty', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast', label: 'Uepi' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 12 }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-predicted', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'left', routeOffset: 12 }),
    makeEdge(palette, { source: 'wm-predicted', target: 'wm-error', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-update', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-update', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'solid', routeSide: 'bottom-left', routeOffset: 12 }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-baseline', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'right', routeOffset: 12 }),
  ];
  return { nodes, edges, width, height };
}

function worldDouble(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-context', [25, 18, 300, 42], 'A  Fixed scene context', 32),
    makeStage(palette, 'wm-stage-model', [365, 18, 390, 42], 'B  Latent imagination', 32),
    makeStage(palette, 'wm-stage-rollout', [800, 18, 520, 42], 'C  Action-only futures', 32),
    makeStage(palette, 'wm-stage-control', [1360, 18, 275, 42], 'D  Plan + act', 32),
    makeImage(palette, {
      id: 'wm-context', role: 'environment', box: [35, 90, 285, 62], label: 'Observed RGB oₜ', imageUrl: worldCurrent, imageFit: 'contain',
      rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [35, 195, 285, 82], label: 'Goal + obstacle geometry',
      description: 'g ; Oₜ ; horizon H', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'modality', kind: 'scientific-voxel-grid', box: [35, 320, 285, 92],
      label: 'Latent scene zₜ', tone: 'blue',
      variant: 'world-model', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-context-contract', role: 'annotation', box: [35, 460, 285, 92], label: 'CONTROLLED COMPARISON',
      description: 'hold zₜ, g, Oₜ, H fixed', tone: 'neutral', fontSize: 25, fontWeight: 720,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [385, 90, 190, 135],
      label: options.backbone, description: 'ẑᵐ=Fθ(zₜ,aᵐ)', tone: 'violet',
      variant: 'world-model', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-action-set', role: 'action', kind: 'scientific-action-chunk', box: [610, 90, 130, 135],
      label: 'M plans a¹:ᴹ', tone: 'blue',
      variant: 'action-horizon', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'wm-decoder', role: 'policy', box: [385, 290, 155, 105], label: 'Decoder D_psi',
      description: 'ôᵐ=Dψ(ẑᵐ)', tone: 'green', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'wm-uncertainty', role: 'policy', box: [580, 290, 160, 105], label: 'Ensemble U_epi',
      description: 'Uepi=Varω[ẑᵐ]', tone: 'amber', fontSize: 26,
    }),
    makeCaption(palette, 'wm-model-contract', [385, 450, 355, 72], 'Same dynamics; only a^m changes.', 25),
    makeNode(palette, { id: 'wm-rollout-fanout', role: 'token', kind: 'or-junction', box: [770, 180, 30, 30], label: '', tone: 'neutral' }),
  );
  const rollouts = [
    ['wm-rollout-a', worldSuccess, 'a^A', 'goal', 'wm-cost-a', 'J_A: goal', 'green', 815, 'world-success.webp'],
    ['wm-rollout-b', worldCollision, 'a^B', 'collision', 'wm-cost-b', 'J_B: contact', 'coral', 980, 'world-collision.webp'],
    ['wm-rollout-c', worldUncertain, 'a^C', 'hidden', 'wm-cost-c', 'J_C: risk', 'amber', 1145, 'world-uncertain.webp'],
  ] as const;
  for (const [id, image, action, outcome, costId, cost, tone, x, sourceRef] of rollouts) {
    nodes.push(
      makeImage(palette, {
        id, box: [x, 110, 145, 45], label: outcome, imageUrl: image, imageFit: 'contain',
        rasterWidthPx: 960, rasterHeightPx: 160, sourceRef, promptRef: WORLD_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-action`, [x, 75, 145, 30], action, 23),
      makeCaption(palette, `${id}-caption`, [x, 160, 145, 30], outcome, 23),
      makeNode(palette, {
        id: costId, role: 'loss', box: [x, 215, 145, 82], label: cost,
        description: tone === 'green' ? 'lowest' : 'reject', tone, fontSize: 25,
      }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [815, 350, 475, 112], label: 'Select a* = arg min_m J_m',
      description: 'J=Cgoal+λCcontact+μUepi', tone: 'coral', fontSize: 29, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'wm-identity', role: 'annotation', box: [815, 500, 475, 78], label: 'PROPOSED residual calibration',
      description: 'selected prediction ↔ physical view', tone: 'green',
      fontSize: 25, fontWeight: 740,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', box: [1370, 90, 250, 105], label: 'Execute selected plan',
      description: 'a*ₜ:ₜ₊ᴷ ; K<H', tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', kind: 'scientific-robot-arm', box: [1370, 255, 250, 140],
      label: 'Robot + physical world', tone: 'green', fontSize: 26,
    }),
    makeStage(palette, 'wm-stage-feedback', [25, 620, 1610, 42], 'E  Physical observation -> residual calibration', 32),
    makeImage(palette, {
      id: 'wm-predicted', box: [35, 705, 310, 58], label: 'Predicted next view', imageUrl: worldSuccess,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-success.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [385, 680, 295, 108], label: 'Residual r[t+1]',
      description: 'o[t+1]-D_psi(z_hat)', tone: 'coral', fontSize: 26,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [720, 705, 310, 58], label: 'Observed next view', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-update', role: 'policy', box: [1070, 680, 300, 108], label: 'Belief update',
      description: 'z[t+1]=calibrate(z_hat,r)', tone: 'green', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'wm-baseline', role: 'annotation', box: [1410, 690, 210, 88], label: 'BASELINE open loop',
      description: 'no update', tone: 'violet', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'wm-residual-belief', role: 'policy', box: [385, 860, 985, 82],
      label: 'Residual-calibrated latent belief', description: 'zₜ₊₁=update(ẑₜ₊₁,rₜ₊₁)',
      tone: 'green', fontSize: 28,
    }),
    makeCaption(palette, 'wm-media-note', [35, 970, 1585, 34], 'Synthetic counterfactual media; hypotheses only, no measured result claims.', 23),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-context', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-set', target: 'wm-model', sourceHandle: 'left', targetHandle: 'right', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-decoder', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-uncertainty', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-decoder', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-cost-b', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'wm-cost-c', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'wm-uncertainty', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast', label: 'Uepi' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 18 }),
    makeEdge(palette, { source: 'wm-predicted', target: 'wm-error', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-update', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-update', target: 'wm-residual-belief', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-residual-belief', target: 'wm-voxel', sourceHandle: 'left', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'solid', routeSide: 'bottom-left', routeOffset: 18 }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-baseline', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'right', routeOffset: 16 }),
  ];
  return { nodes, edges, width, height };
}

function worldPresentation(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-context', [35, 20, 280, 54], 'A  Context', 40),
    makeStage(palette, 'wm-stage-model', [350, 20, 330, 54], 'B  Imagine', 40),
    makeStage(palette, 'wm-stage-rollout', [720, 20, 510, 54], 'C  Compare actions', 40),
    makeStage(palette, 'wm-stage-feedback', [1270, 20, 350, 54], 'D  Verify', 40),
    makeImage(palette, {
      id: 'wm-context', role: 'environment', box: [40, 110, 270, 55], label: 'Observed scene', imageUrl: worldCurrent, imageFit: 'contain',
      rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [40, 210, 270, 85], label: 'Goal + obstacle geometry',
      description: 'g ; Oₜ ; horizon H', tone: 'amber', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'modality', kind: 'scientific-voxel-grid', box: [40, 345, 270, 95],
      label: 'Latent scene zₜ', tone: 'blue',
      variant: 'world-model', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [370, 105, 190, 145],
      label: options.backbone, description: 'ẑᵐ=Fθ(zₜ,aᵐ)', tone: 'violet',
      variant: 'world-model', fontSize: 33,
    }),
    makeNode(palette, {
      id: 'wm-action-set', role: 'action', kind: 'scientific-action-chunk', box: [590, 105, 110, 145],
      label: 'M plans a¹:ᴹ', tone: 'blue', variant: 'action-horizon', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'wm-decoder', role: 'policy', box: [370, 300, 145, 90], label: 'Decoder Dψ',
      description: 'ôᵐ=Dψ(ẑᵐ)', tone: 'green', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-uncertainty', role: 'policy', box: [555, 300, 145, 90], label: 'Ensemble Uepi',
      description: 'Varω[ẑᵐ]', tone: 'amber', fontSize: 28,
    }),
    makeCaption(palette, 'wm-shared-context', [370, 420, 330, 55], 'Hold zₜ,g,Oₜ,H fixed; vary aᵐ.', 27),
    makeNode(palette, { id: 'wm-rollout-fanout', role: 'token', kind: 'or-junction', box: [700, 190, 32, 32], label: '', tone: 'neutral' }),
  );
  const rollouts = [
    ['wm-rollout-a', worldSuccess, 'a^A', 'goal', 'wm-cost-a', 'J_A goal', 'green', 735, 'world-success.webp'],
    ['wm-rollout-b', worldCollision, 'a^B', 'collision', 'wm-cost-b', 'J_B contact', 'coral', 900, 'world-collision.webp'],
    ['wm-rollout-c', worldUncertain, 'a^C', 'hidden', 'wm-cost-c', 'J_C risk', 'amber', 1065, 'world-uncertain.webp'],
  ] as const;
  for (const [id, image, action, outcome, costId, cost, tone, x, sourceRef] of rollouts) {
    nodes.push(
      makeImage(palette, {
        id, box: [x, 120, 145, 45], label: outcome, imageUrl: image, imageFit: 'contain',
        rasterWidthPx: 960, rasterHeightPx: 160, sourceRef, promptRef: WORLD_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-action`, [x, 82, 145, 32], action, 25),
      makeCaption(palette, `${id}-caption`, [x, 170, 145, 32], outcome, 25),
      makeNode(palette, {
        id: costId, role: 'loss', box: [x, 225, 145, 82], label: cost,
        description: tone === 'green' ? 'lowest' : 'reject', tone, fontSize: 27,
      }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [735, 360, 475, 105], label: 'a* = arg min_m J_m',
      description: 'Cgoal+λCcontact+μUepi', tone: 'coral', fontSize: 32, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', box: [820, 505, 180, 80], label: 'Execute K',
      description: 'K<H', tone: 'blue', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', box: [1030, 505, 180, 80], label: 'Physical world',
      description: 'sₜ→sₜ₊₁', tone: 'green', fontSize: 29,
    }),
    makeImage(palette, {
      id: 'wm-predicted', box: [1285, 110, 320, 58], label: 'Predicted next view', imageUrl: worldSuccess,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-success.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [1285, 230, 320, 58], label: 'Observed next view', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [1285, 345, 320, 100], label: 'Residual r[t+1]',
      description: 'observed - decoded', tone: 'coral', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'wm-update', role: 'policy', box: [1285, 505, 320, 90], label: 'Update z[t+1]',
      description: 'calibrate(z_hat,r)', tone: 'green', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'wm-identity', role: 'annotation', box: [40, 650, 1180, 125],
      label: 'RESIDUAL-CALIBRATED LATENT PLANNING',
      description: 'shared context · parallel futures · independent observation',
      tone: 'green', fontSize: 34, fontWeight: 740,
    }),
    makeNode(palette, {
      id: 'wm-baseline', role: 'annotation', box: [1285, 665, 320, 95], label: 'BASELINE open loop',
      description: 'no residual calibration', tone: 'violet', fontSize: 30,
    }),
    makeCaption(palette, 'wm-media-note', [40, 810, 1565, 34], 'Synthetic counterfactuals; hypotheses only, no measured score claims.', 25),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-context', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-set', target: 'wm-model', sourceHandle: 'left', targetHandle: 'right', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-decoder', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-uncertainty', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-decoder', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-cost-b', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'wm-cost-c', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'wm-uncertainty', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast', label: 'Uepi' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routeSide: 'bottom-right', routeOffset: 14 }),
    makeEdge(palette, { source: 'wm-predicted', target: 'wm-error', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-update', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-update', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'solid', routeSide: 'bottom-left', routeOffset: 18 }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-baseline', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'right', routeOffset: 16 }),
  ];
  return { nodes, edges, width, height };
}

function llmSingle(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [18, 10, 515, 32], 'A  Shared reference policy', 25),
    makeStage(palette, 'lt-stage-evidence', [555, 10, 195, 32], 'B  Preferences', 25),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', kind: 'scientific-transformer', box: [20, 55, 105, 100],
      label: `${options.backbone} π₀`, tone: 'violet', variant: 'base-model', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [145, 65, 105, 80], label: 'Data',
      description: '(x, y*)', tone: 'amber', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [270, 65, 105, 80], label: 'SFT',
      description: '−log π(y*|x)', tone: 'coral', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [395, 55, 130, 100],
      label: 'Frozen πref', tone: 'blue',
      variant: 'checkpoint', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-preference-pair', box: [565, 52, 175, 108],
      label: 'Dpref + qᵢ', tone: 'amber',
      variant: 'preference-objective', fontSize: 21,
    }),
    makePanel(palette, 'lt-dpo-panel', [20, 200, 405, 230], 'green'),
    makePanel(palette, 'lt-rlhf-panel', [445, 200, 305, 230], 'violet'),
    makeStage(palette, 'lt-stage-dpo', [35, 215, 375, 30], 'C  METHOD · weighted DPO', 24),
    makeStage(palette, 'lt-stage-rlhf', [460, 215, 275, 30], 'D  BASELINE · RM + PPO', 24),
    makeNode(palette, {
      id: 'lt-confidence-gate', role: 'token', box: [40, 270, 110, 95], label: 'Gate w_i',
      description: 'qᵢ I[mᵢ>δ]', tone: 'amber', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-equation', box: [170, 260, 145, 115],
      label: 'LCW-DPO', description: '−wᵢ logσ{β(Δθ−Δref)}', tone: 'coral',
      variant: 'preference-objective', fontSize: 20, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', kind: 'scientific-transformer', box: [335, 260, 75, 115],
      label: 'πθ', tone: 'green', variant: 'checkpoint', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [460, 265, 75, 75], label: 'RM loss',
      tone: 'coral', fontSize: 18,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [550, 265, 75, 75], label: 'Reward rφ',
      tone: 'violet', fontSize: 18,
    }),
    makeNode(palette, {
      id: 'lt-rollout', role: 'token', box: [640, 265, 90, 75], label: 'Rollout y∼πθ',
      tone: 'blue', fontSize: 18,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [460, 360, 75, 55], label: 'PPO',
      description: 'rφ−βKL', tone: 'blue', fontSize: 18,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [550, 360, 180, 55], label: 'RLHF policy πθ',
      tone: 'violet', fontSize: 18,
    }),
    makeCaption(palette, 'lt-implicit-reward', [40, 390, 180, 30], 'derived only: r̂θ=βlog(πθ/πref)', 17),
    makeCaption(palette, 'lt-dpo-contract', [235, 390, 175, 30], 'no RM · no rollout', 17),
    makeStage(palette, 'lt-stage-deploy', [18, 460, 732, 32], 'E  DPO deployment only', 25),
    makeNode(palette, {
      id: 'lt-inference-prompt', role: 'modality', box: [70, 515, 130, 62], label: "Prompt x'",
      tone: 'blue', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [250, 505, 180, 78], label: 'Frozen CW-DPO',
      description: 'πθ', tone: 'ink', variant: 'aligned-model', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-response', role: 'action', box: [480, 515, 90, 62], label: 'Response y',
      tone: 'green', fontSize: 19,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [620, 515, 100, 62], label: 'Release gate',
      tone: 'green', fontSize: 21,
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-confidence-gate', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-confidence-gate', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-dpo-objective', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'right', routeOffset: 10 }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', label: 'x' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', label: 'KL ref' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-rollout', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

function llmDouble(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [25, 18, 790, 42], 'A  Shared SFT reference policy', 32),
    makeStage(palette, 'lt-stage-evidence', [855, 18, 780, 42], 'B  Preference evidence + confidence', 32),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', kind: 'scientific-transformer', box: [35, 90, 160, 130],
      label: options.backbone, description: 'pi_0', tone: 'violet', variant: 'base-model', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [235, 105, 150, 100], label: 'SFT data',
      description: '(x, y*)', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [425, 105, 160, 100], label: 'SFT loss',
      description: '-log pi(y*|x)', tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [625, 90, 180, 130],
      label: 'pi_ref (frozen)', description: 'shared reference', tone: 'blue',
      variant: 'checkpoint', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [865, 85, 250, 75], label: 'Prompt x',
      description: 'Why does ice float?', tone: 'blue', fontSize: 26, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-chosen-response', role: 'modality', box: [865, 195, 115, 85], label: 'y_win',
      description: 'preferred', tone: 'green', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-rejected-response', role: 'modality', box: [1000, 195, 115, 85], label: 'y_lose',
      description: 'rejected', tone: 'coral', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-loss-target', box: [1170, 85, 260, 140],
      label: 'Pair + q_i', description: 'D_pref=(x,y_win,y_lose)', tone: 'amber',
      variant: 'preference-objective', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'lt-confidence-source', role: 'annotation', box: [1470, 95, 145, 120], label: 'q_i source',
      description: 'agreement or verifier', tone: 'neutral', fontSize: 23,
    }),
    makePanel(palette, 'lt-dpo-panel', [25, 340, 850, 430], 'green'),
    makePanel(palette, 'lt-rlhf-panel', [915, 340, 720, 430], 'violet'),
    makeStage(palette, 'lt-stage-dpo', [50, 360, 800, 42], 'C  PROPOSED: confidence-weighted DPO', 30),
    makeStage(palette, 'lt-stage-rlhf', [940, 360, 670, 42], 'D  BASELINE: reward model + PPO', 30),
    makeNode(palette, {
      id: 'lt-confidence-gate', role: 'token', box: [60, 445, 190, 130], label: 'Margin gate w_i',
      description: 'q_i I[m_i>delta]', tone: 'amber', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-loss-target', box: [290, 425, 330, 170],
      label: 'CW-DPO loss',
      description: '-w_i log sigma(beta Delta_i)\nDelta_i=Delta_theta-Delta_ref', tone: 'coral',
      variant: 'preference-objective', fontSize: 25, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', kind: 'scientific-transformer', box: [660, 435, 180, 150],
      label: 'pi_theta', description: 'trainable from pi_ref', tone: 'green',
      variant: 'checkpoint', fontSize: 27, borderWidth: 2.8,
    }),
    makeCaption(palette, 'lt-dpo-contract', [60, 645, 780, 75], 'Confidence weights each pair; direct update, no RM or rollout.', 25),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [945, 445, 150, 120], label: 'Reward fit',
      description: '-log sigma(r_win-r_lose)', tone: 'coral', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [1120, 445, 140, 120], label: 'r_phi',
      description: 'reward model', tone: 'violet', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-rollout', role: 'token', box: [1285, 445, 140, 120], label: 'Rollout',
      description: 'y~pi_theta', tone: 'blue', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [1450, 445, 150, 120], label: 'PPO',
      description: 'r_phi-KL', tone: 'blue', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [1190, 635, 250, 78], label: 'RLHF baseline',
      description: 'sample -> score -> PPO', tone: 'violet', fontSize: 24,
    }),
    makeStage(palette, 'lt-stage-deploy', [430, 805, 1205, 42], 'E  Deploy proposed policy only', 30),
    makeNode(palette, {
      id: 'lt-inference-prompt', role: 'modality', box: [470, 880, 190, 82], label: "Prompt x'",
      tone: 'blue', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [725, 870, 260, 102], label: 'CW-DPO pi_theta',
      description: 'pi_theta', tone: 'ink', variant: 'aligned-model', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-response', role: 'action', box: [1050, 880, 190, 82], label: 'Response y',
      description: 'inference only', tone: 'green', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [1305, 880, 260, 82], label: 'Release gate',
      description: 'capability + safety', tone: 'green', fontSize: 25,
    }),
    makeCaption(palette, 'lt-method-note', [35, 975, 1580, 32], 'Illustrative method structure; no empirical performance claim. Solid: data/inference. Dotted: baseline. Dashed: optimization.', 22),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-chosen-response', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-rejected-response', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-confidence-source', target: 'lt-preference-data', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-confidence-gate', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-confidence-gate', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-dpo-objective', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'right', routeOffset: 18 }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-rollout', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

function llmPresentation(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [35, 20, 300, 54], 'A  Reference', 40),
    makeStage(palette, 'lt-stage-evidence', [380, 20, 330, 54], 'B  Preferences', 40),
    makeStage(palette, 'lt-stage-dpo', [750, 20, 390, 54], 'C  Proposed CW-DPO', 40),
    makeStage(palette, 'lt-stage-deploy', [1180, 20, 445, 54], 'D  Deploy + evaluate', 40),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [40, 110, 125, 100], label: 'SFT data',
      description: '(x, y*)', tone: 'amber', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [40, 260, 125, 100], label: 'SFT loss',
      description: '-log pi(y*|x)', tone: 'coral', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [200, 150, 150, 155],
      label: 'pi_ref', description: 'frozen reference', tone: 'blue',
      variant: 'checkpoint', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', box: [200, 350, 150, 70], label: options.backbone,
      description: 'pi_0', tone: 'violet', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [390, 105, 300, 78], label: 'Prompt x',
      description: 'Why does ice float?', tone: 'blue', fontSize: 29, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-chosen-response', role: 'modality', box: [390, 225, 140, 95], label: 'y_win',
      description: 'preferred', tone: 'green', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-rejected-response', role: 'modality', box: [550, 225, 140, 95], label: 'y_lose',
      description: 'rejected', tone: 'coral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', box: [390, 365, 300, 95], label: 'Synthetic pair + q_i',
      description: 'shared evidence', tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-confidence-gate', role: 'token', box: [770, 105, 155, 125], label: 'Gate w_i',
      description: 'q_i I[m_i>delta]', tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-loss-target', box: [955, 100, 165, 140],
      label: 'CW-DPO loss', description: '-w_i log sigma(beta Delta_i)', tone: 'coral',
      variant: 'preference-objective', fontSize: 27, borderWidth: 3.2,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', kind: 'scientific-transformer', box: [830, 300, 230, 135],
      label: 'pi_theta', description: 'trainable; no RM/rollout', tone: 'green',
      variant: 'checkpoint', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'lt-inference-prompt', role: 'modality', box: [1200, 110, 170, 90], label: "Prompt x'",
      tone: 'blue', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1410, 100, 190, 110], label: 'CW-DPO pi_theta',
      description: 'pi_theta', tone: 'ink', variant: 'aligned-model', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'lt-response', role: 'action', box: [1200, 285, 170, 90], label: 'Response y',
      description: 'inference', tone: 'green', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [1410, 275, 190, 110], label: 'Release gate',
      description: 'capability + safety', tone: 'green', fontSize: 30,
    }),
    makePanel(palette, 'lt-rlhf-panel', [385, 535, 735, 170], 'violet'),
    makeStage(palette, 'lt-stage-rlhf', [410, 555, 685, 42], 'BASELINE RM + PPO (structure only)', 31),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [420, 620, 140, 65], label: 'Reward fit',
      tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [590, 620, 140, 65], label: 'r_phi',
      tone: 'violet', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-rollout', role: 'token', box: [760, 620, 140, 65], label: 'Rollout',
      tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [930, 620, 140, 65], label: 'PPO',
      tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [1145, 585, 210, 95], label: 'RLHF baseline',
      description: 'not deployed', tone: 'violet', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-method-identity', role: 'annotation', box: [40, 735, 1560, 82],
      label: 'METHOD IDENTITY: confidence and margin gate each preference pair before direct policy optimization.',
      description: 'Illustrative method structure; no empirical performance claim.', tone: 'green',
      fontSize: 31, fontWeight: 740, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'left', targetHandle: 'bottom' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-chosen-response', target: 'lt-preference-data', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-rejected-response', target: 'lt-preference-data', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-confidence-gate', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-confidence-gate', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-dpo-objective', sourceHandle: 'top', targetHandle: 'bottom' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'bottom-left', routeOffset: 16 }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-rollout', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

export function buildTopVenueFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: ScientificSchematicLayout,
): PublicationFlagshipBlueprint | undefined {
  const effectiveLayout = layout === 'freeform' ? 'double-column' : layout;
  if (options.templateId === 'vla-policy') {
    if (effectiveLayout === 'single-column') return vlaSingle(options, provenance);
    if (effectiveLayout === 'presentation') return vlaPresentation(options, provenance);
    return vlaDouble(options, provenance);
  }
  if (options.templateId === 'world-model-rollout') {
    if (effectiveLayout === 'single-column') return worldSingle(options, provenance);
    if (effectiveLayout === 'presentation') return worldPresentation(options, provenance);
    return worldDouble(options, provenance);
  }
  if (options.templateId === 'llm-training-pipeline') {
    if (effectiveLayout === 'single-column') return llmSingle(options, provenance);
    if (effectiveLayout === 'presentation') return llmPresentation(options, provenance);
    return llmDouble(options, provenance);
  }
  return undefined;
}
