import vlaApproach from '../assets/scientific/vla-approach.jpg?inline';
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

type Box = readonly [x: number, y: number, width: number, height: number];
type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'coral' | 'violet' | 'ink';

interface FlagshipPalette {
  ink: string;
  panel: string;
  tones: Record<Tone, { fill: string; stroke: string; text: string }>;
  edge: Record<ScientificConnectorSemantic, string>;
}

interface NodeSpec {
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
}

interface EdgeSpec {
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
}

const COLOR_PALETTE: FlagshipPalette = {
  ink: '#1E2933',
  panel: '#D1D9E0',
  tones: {
    neutral: { fill: '#FFFFFF', stroke: '#9CAAB5', text: '#1E2933' },
    blue: { fill: '#EFF7FC', stroke: '#28729C', text: '#123F58' },
    green: { fill: '#EFF8F3', stroke: '#377A5C', text: '#174734' },
    amber: { fill: '#FFF8E8', stroke: '#A86C0F', text: '#5B3905' },
    coral: { fill: '#FFF1EE', stroke: '#B8493E', text: '#64251F' },
    violet: { fill: '#F5F1FA', stroke: '#71549E', text: '#3F2C64' },
    ink: { fill: '#25323B', stroke: '#1E2933', text: '#FFFFFF' },
  },
  edge: {
    data: '#43525E',
    control: '#1F6F95',
    gradient: '#A43D50',
    feedback: '#A43D50',
    optional: '#6C747B',
    broadcast: '#2E7658',
    temporal: '#8B5F13',
  },
};

const MONO_PALETTE: FlagshipPalette = {
  ink: '#151515',
  panel: '#B8B8B8',
  tones: {
    neutral: { fill: '#FFFFFF', stroke: '#777777', text: '#151515' },
    blue: { fill: '#F4F4F4', stroke: '#444444', text: '#111111' },
    green: { fill: '#F8F8F8', stroke: '#555555', text: '#111111' },
    amber: { fill: '#FFFFFF', stroke: '#666666', text: '#111111' },
    coral: { fill: '#ECECEC', stroke: '#333333', text: '#111111' },
    violet: { fill: '#F2F2F2', stroke: '#4A4A4A', text: '#111111' },
    ink: { fill: '#282828', stroke: '#111111', text: '#FFFFFF' },
  },
  edge: {
    data: '#333333',
    control: '#111111',
    gradient: '#444444',
    feedback: '#111111',
    optional: '#666666',
    broadcast: '#333333',
    temporal: '#444444',
  },
};

function paletteFor(options: ScientificSchematicOptions): FlagshipPalette {
  return options.style === 'monochrome' ? MONO_PALETTE : COLOR_PALETTE;
}

function localized(options: ScientificSchematicOptions, en: string, zh: string): string {
  return options.language === 'zh' ? zh : en;
}

function dimensionsFor(layout: ScientificSchematicLayout): { width: number; height: number } {
  if (layout === 'single-column') return { width: 770, height: 600 };
  if (layout === 'presentation') return { width: 1660, height: 860 };
  return { width: 1660, height: 1020 };
}

function makeNode(palette: FlagshipPalette, spec: NodeSpec): FlowNode {
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
    fontWeight: spec.fontWeight ?? (phase ? 740 : annotation ? 560 : 650),
    textAlign: spec.textAlign ?? (frame || phase || annotation ? 'left' : 'center'),
    verticalAlign: spec.verticalAlign ?? (phase ? 'top' : 'middle'),
    schematicRole: spec.role,
    schematicDetail: spec.detail ?? 'compact',
    scientificRole: spec.scientificRole,
    provenance: spec.provenance,
    scientificVariant: spec.variant,
    scientificEvidence: 'schematic',
    scientificTextPaddingX: phase ? 3 : undefined,
    scientificTextPaddingY: phase ? 3 : undefined,
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

function makeImage(
  palette: FlagshipPalette,
  spec: Omit<NodeSpec, 'kind' | 'role'> & { role?: ScientificSchematicRole },
): FlowNode {
  return makeNode(palette, {
    ...spec,
    kind: 'image',
    role: spec.role ?? 'modality',
    imageFit: spec.imageFit ?? 'cover',
    fill: '#FFFFFF',
    stroke: spec.stroke ?? palette.panel,
    borderWidth: spec.borderWidth ?? 1.4,
    radius: 2,
  });
}

function makeEdge(palette: FlagshipPalette, spec: EdgeSpec): FlowEdge {
  const semantic = spec.semantic ?? 'data';
  const baseStyle = SCIENTIFIC_CONNECTOR_STYLES[semantic];
  const color = palette.edge[semantic];
  const routing = spec.routing ?? 'smoothstep';
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
    width: baseStyle.width,
    routing,
    lineStyle,
    arrowEnd,
    scientificSemantic: semantic,
    routeSide: spec.routeSide,
    routeOffset: spec.routeOffset,
    routeWaypoints: spec.routeWaypoints,
    labelFontSize: spec.labelFontSize ?? 22,
  };
  edge.style = {
    ...edge.style,
    stroke: color,
    strokeWidth: baseStyle.width,
    strokeDasharray: lineStyle === 'dashed' ? '8 6' : lineStyle === 'dotted' ? '2 5' : undefined,
  };
  edge.markerEnd = createEdgeMarker(arrowEnd, color);
  return edge;
}

function makeRoot(
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

function makeStage(palette: FlagshipPalette, id: string, box: Box, label: string, fontSize: number): FlowNode {
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

function makePanel(palette: FlagshipPalette, id: string, box: Box, tone: Tone): FlowNode {
  const colors = palette.tones[tone];
  return makeNode(palette, {
    id,
    kind: 'rounded-rectangle',
    role: 'frame',
    box,
    label: '',
    fill: colors.fill,
    stroke: colors.stroke,
    borderWidth: 1.25,
    radius: 7,
    zIndex: -15,
  });
}

function makeCaption(
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
  });
}

const VLA_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#vla-storyboard';
const WORLD_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#world-model-counterfactuals';

function vlaSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [14, 9, 150, 30], t('A  Grounded task', 'A  接地任务'), 25),
    makeStage(palette, 'vla-stage-policy', [185, 9, 280, 30], t('B  Ground object identity', 'B  接地物体身份'), 25),
    makeStage(palette, 'vla-stage-action', [490, 9, 265, 30], t('C  Flow action policy', 'C  流动作策略'), 25),
    makeStage(palette, 'vla-stage-execution', [14, 405, 740, 30], t('D  Execute K steps and re-observe', 'D  执行 K 步并再观测'), 25),
    makePanel(palette, 'vla-proposed-panel', [485, 44, 270, 355], 'green'),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [18, 52, 142, 106], label: 'Observed task scene', imageUrl: vlaObserve,
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'vla-observe.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeCaption(palette, 'vla-camera-caption', [18, 163, 142, 28], 'oₜ · front RGB', 21),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-token-strip', box: [18, 210, 142, 142],
      label: t('Task ℓ + state sₜ', '任务 ℓ + 状态 sₜ'), tone: 'amber',
      variant: 'state-vector', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [190, 65, 105, 100],
      label: t('Tokens X₀', 'Token X₀'), tone: 'amber', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [320, 52, 145, 120],
      label: options.backbone,
      tone: 'violet', variant: 'vlm', fontSize: 24, borderWidth: 2.4,
    }),
    makeNode(palette, {
      id: 'vla-attention', role: 'annotation', kind: 'scientific-attention-map', box: [190, 210, 275, 142],
      label: t('Object grounding  zobj → hₜ', '物体接地  zobj → hₜ'),
      tone: 'neutral', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [500, 58, 105, 112],
      label: t('Flow field vθ', '流场 vθ'), tone: 'coral',
      variant: 'diffusion-action', fontSize: 22, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [630, 58, 110, 112],
      label: 'ODE · NFE=10', description: 'dA/dτ=vθ', tone: 'coral', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [500, 195, 105, 58],
      label: 'Seed  A₀=ε', tone: 'amber', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [630, 188, 110, 72],
      label: 'H×7 · 20 Hz', tone: 'blue', variant: 'action-horizon', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [500, 278, 105, 62],
      label: 'Flow loss', description: 'Aτ ; u=A−ε', tone: 'coral', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [630, 278, 110, 62],
      label: t('Constraints', '约束源'), description: 'limits(sₜ) · ĉcontact', tone: 'neutral', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [500, 355, 105, 40], label: t('Safety Πsafe', '安全 Πsafe'),
      tone: 'neutral', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [630, 355, 110, 40], label: 'MPC · K=4',
      tone: 'blue', fontSize: 20,
    }),
  );
  const frames = [
    ['vla-exec-observe', vlaObserve, 't  observe', 18, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 't+4  approach', 120, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 't+8  lift', 222, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 't+12  place', 324, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [x, 438, 90, 74], label, imageUrl: image, imageFit: 'cover', rasterWidthPx: 400,
        rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-caption`, [x, 516, 90, 24], label, 19),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [430, 438, 125, 102],
      label: t('Executed path', '执行轨迹'), tone: 'blue', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'vla-baseline-head', role: 'policy', box: [575, 438, 160, 70],
      label: t('BASELINE · token head', '基线 · Token 头'), description: t('no ODE integration', '无 ODE 积分'),
      tone: 'violet', fontSize: 21,
    }),
    makeCaption(
      palette,
      'vla-contribution',
      [575, 518, 160, 52],
      t('METHOD', '方法'),
      20,
      'zobj → flow → ODE → re-observe',
    ),
    makeCaption(palette, 'vla-grounding-note', [18, 563, 537, 24], t('Synthetic same-camera storyboard · mechanism only', '合成同机位故事板 · 仅表示机制'), 18),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-attention', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-attention', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control', label: 'zobj' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 15 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 13 }),
    makeEdge(palette, { source: 'vla-attention', target: 'vla-baseline-head', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'bottom-right', routeOffset: 14 }),
  ];
  return { nodes, edges, width, height };
}

function llmSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [14, 9, 465, 30], t('A  Shared SFT reference policy', 'A  共享 SFT 参考策略'), 25),
    makeStage(palette, 'lt-stage-evidence', [505, 9, 250, 30], t('B  Preference evidence', 'B  偏好证据'), 25),
    makePanel(palette, 'lt-rlhf-panel', [14, 205, 350, 270], 'violet'),
    makePanel(palette, 'lt-dpo-panel', [390, 205, 365, 270], 'green'),
    makeStage(palette, 'lt-stage-rlhf', [28, 220, 320, 28], t('C  BASELINE · RM + PPO', 'C  基线 · RM + PPO'), 23),
    makeStage(palette, 'lt-stage-dpo', [405, 220, 335, 28], t('D  DPO · direct policy update', 'D  DPO · 直接策略更新'), 23),
    makeStage(palette, 'lt-stage-deploy', [390, 500, 365, 28], t('E  DPO deployment only', 'E  仅 DPO 部署'), 23),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', kind: 'scientific-transformer', box: [18, 52, 100, 115],
      label: options.backbone, description: 'π₀', tone: 'violet', variant: 'base-model', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [135, 65, 95, 80], label: t('SFT data', 'SFT 数据'),
      description: '(x,y*)', tone: 'amber', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [247, 65, 105, 80], label: 'LSFT=−logπ(y*|x)',
      tone: 'coral', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [370, 52, 110, 115],
      label: t('Frozen πref', '冻结 πref'), tone: 'blue',
      variant: 'checkpoint', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-preference-pair', box: [525, 50, 205, 125],
      label: 'Dpref: yw ≻ yl', tone: 'amber',
      variant: 'preference-objective', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [32, 285, 105, 90], label: t('Fit reward rφ', '拟合奖励 rφ'),
      description: 'LRM=−logσ(rw−rl)', tone: 'coral', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [155, 285, 85, 90], label: t('Reward model', '奖励模型'),
      description: 'rφ(x,y)', tone: 'violet', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-rollout', role: 'token', kind: 'scientific-token-strip', box: [258, 278, 88, 105],
      label: t('Samples', '采样'), description: 'yᵢ∼πθ(·|x)', tone: 'blue', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [32, 405, 105, 50], label: 'PPO update',
      description: 'rφ−βKL(πθ‖πref)', tone: 'blue', fontSize: 19,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [155, 405, 191, 50], label: t('RLHF policy πθ', 'RLHF 策略 πθ'),
      description: t('sample → score → update', '采样 → 评分 → 更新'), tone: 'violet', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-equation', box: [410, 280, 175, 115],
      label: 'DPO loss  LDPO', description: '−𝔼logσ{β(Δθ−Δref)}',
      tone: 'coral', variant: 'preference-objective', fontSize: 20, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', kind: 'scientific-transformer', box: [610, 278, 125, 115],
      label: t('Trainable πθ', '可训练 πθ'), tone: 'green',
      variant: 'checkpoint', fontSize: 21, borderWidth: 2.6,
    }),
    makeCaption(palette, 'lt-implicit-reward', [410, 414, 175, 42], 'derived diagnostic', 18, 'r̂θ=βlog(πθ/πref)'),
    makeCaption(palette, 'lt-dpo-contract', [610, 414, 125, 42], t('no RM · no rollout', '无 RM · 无采样'), 18),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [500, 535, 130, 50], label: t('Frozen DPO policy', '冻结 DPO 策略'),
      description: 'πθ', tone: 'ink', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [650, 535, 95, 50], label: t('Held-out gate', '留出评测门'),
      tone: 'green', fontSize: 19,
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'left', routeOffset: 10 }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', label: 'x' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'right', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', label: 'KL ref' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-rollout', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control', label: 'init' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-dpo-objective', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed', label: '∇θ' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
  ];
  return { nodes, edges, width, height };
}

function llmDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [25, 18, 780, 42], t('A  Shared SFT reference policy', 'A  共享 SFT 参考策略'), 32),
    makeStage(palette, 'lt-stage-evidence', [835, 18, 795, 42], t('B  Preference evidence', 'B  偏好证据'), 32),
    makePanel(palette, 'lt-rlhf-panel', [25, 330, 755, 485], 'violet'),
    makePanel(palette, 'lt-dpo-panel', [820, 330, 815, 485], 'green'),
    makeStage(palette, 'lt-stage-rlhf', [50, 350, 705, 42], t('C  BASELINE · reward model + on-policy PPO', 'C  基线 · 奖励模型 + 在线 PPO'), 30),
    makeStage(palette, 'lt-stage-dpo', [850, 350, 755, 42], t('D  DPO · direct offline preference update', 'D  DPO · 离线直接偏好更新'), 30),
    makeStage(palette, 'lt-stage-deploy', [820, 840, 815, 38], t('E  DPO inference and release path only', 'E  仅 DPO 推理与发布路径'), 29),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', kind: 'scientific-transformer', box: [35, 90, 165, 145],
      label: options.backbone, description: 'π₀', tone: 'violet', variant: 'base-model', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [240, 105, 150, 100], label: t('Instruction data', '指令数据'),
      description: '(x,y*)', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [435, 110, 165, 90], label: 'LSFT=−logπ(y*|x)',
      tone: 'coral', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [645, 90, 160, 145],
      label: t('Reference πref', '参考 πref'), description: t('frozen copy', '冻结副本'), tone: 'blue',
      variant: 'checkpoint', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [850, 82, 260, 78], label: 'Prompt x',
      description: t('“Why does ice float?”', '“冰为什么会浮？”'), tone: 'blue', fontSize: 27, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-chosen-response', role: 'modality', box: [850, 190, 120, 90], label: t('Chosen yw', '优选 yw'),
      description: t('clear + correct', '清晰 + 正确'), tone: 'green', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'lt-rejected-response', role: 'modality', box: [990, 190, 120, 90], label: t('Rejected yl', '拒选 yl'),
      description: t('vague', '含糊'), tone: 'coral', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-loss-target', box: [1170, 90, 260, 145],
      label: t('Preference pair', '偏好对'), description: 'Dpref=(x,yw,yl) · yw≻yl', tone: 'amber',
      variant: 'preference-objective', fontSize: 27,
    }),
    makeCaption(palette, 'lt-evidence-contract', [1460, 100, 155, 125], t('Same Dpref; only DPO deploys.', '同一 Dpref；仅 DPO 部署。'), 23),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', kind: 'scientific-loss-target', box: [60, 430, 180, 135],
      label: t('Fit reward rφ', '拟合奖励 rφ'), description: 'LRM=−logσ[rφ(x,yw)−rφ(x,yl)]', tone: 'coral',
      variant: 'preference-objective', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', kind: 'scientific-transformer', box: [275, 440, 145, 120],
      label: t('Reward model', '奖励模型'), description: 'rφ(x,y)', tone: 'violet', variant: 'checkpoint', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-rollout', role: 'token', kind: 'scientific-token-strip', box: [460, 430, 145, 135],
      label: t('Policy samples', '策略采样'), description: 'yᵢ∼πθ(·|x)', tone: 'blue', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [640, 435, 120, 125], label: 'PPO',
      description: 'rφ−βKL(πθ‖πref)', tone: 'blue', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [460, 655, 300, 90], label: t('RLHF policy πθ', 'RLHF 策略 πθ'),
      description: t('sample → score → PPO → resample', '采样 → 评分 → PPO → 再采样'), tone: 'violet', fontSize: 26,
    }),
    makeCaption(palette, 'lt-baseline-note', [60, 660, 340, 78], t('Separate reward fit and on-policy rollout', '独立奖励拟合与在线采样'), 25, t('Dotted connectors denote baseline only', '点线仅表示基线')),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-loss-target', box: [865, 420, 340, 175],
      label: 'DPO loss  LDPO', description: '−𝔼logσ{β[Δlogπθ−Δlogπref]}', tone: 'coral',
      variant: 'preference-objective', fontSize: 27, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', kind: 'scientific-transformer', box: [1290, 425, 285, 165],
      label: t('Trainable DPO policy πθ', '可训练 DPO 策略 πθ'),
      description: t('initialized from πref', '由 πref 初始化'), tone: 'green', variant: 'checkpoint', fontSize: 28,
      borderWidth: 2.8,
    }),
    makeCaption(palette, 'lt-implicit-reward', [865, 655, 340, 82], 'derived diagnostic only', 25, 'r̂θ(x,y)=β log[πθ(y|x)/πref(y|x)]'),
    makeNode(palette, {
      id: 'lt-dpo-contract', role: 'annotation', box: [1290, 655, 285, 82],
      label: t('DIRECT UPDATE', '直接更新'), description: t('no reward model · no rollout', '无奖励模型 · 无在线采样'),
      tone: 'green', fontSize: 26, fontWeight: 720,
    }),
    makeNode(palette, { id: 'lt-inference-prompt', role: 'modality', box: [850, 895, 145, 80], label: "Prompt x'", description: t('held out', '留出'), tone: 'blue', fontSize: 25 }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1040, 885, 220, 95], label: t('Frozen DPO policy', '冻结 DPO 策略'),
      description: 'πθ', tone: 'ink', variant: 'aligned-model', fontSize: 26,
    }),
    makeNode(palette, { id: 'lt-response', role: 'action', box: [1305, 895, 130, 80], label: "y∼πθ(·|x')", description: t('inference', '推理'), tone: 'green', fontSize: 24 }),
    makeNode(palette, { id: 'lt-release-gate', role: 'action', box: [1480, 895, 130, 80], label: t('Release gate', '发布门'), description: t('capability + safety', '能力 + 安全'), tone: 'green', fontSize: 24 }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-chosen-response', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-rejected-response', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'left', routeOffset: 20 }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', label: 'KL ref' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'bottom', targetHandle: 'right', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-rollout', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control', label: 'init' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-dpo-objective', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed', label: '∇θ' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

function worldSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-input', [14, 9, 155, 30], t('A  Fixed context', 'A  固定上下文'), 25),
    makeStage(palette, 'wm-stage-model', [190, 9, 180, 30], t('B  Latent imagination', 'B  潜在想象'), 25),
    makeStage(palette, 'wm-stage-futures', [390, 9, 365, 30], t('C  Action-only counterfactuals', 'C  仅动作变化的反事实'), 25),
    makeStage(palette, 'wm-stage-verify', [14, 402, 740, 30], t('D  Act → observe → residual update', 'D  执行 → 观测 → 残差更新'), 25),
    makeImage(palette, {
      id: 'wm-observation', role: 'environment', box: [18, 58, 150, 52], label: 'observed scene', imageUrl: worldCurrent,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeCaption(palette, 'wm-observation-caption', [18, 115, 150, 26], 'observed oₜ', 21),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [18, 153, 150, 62], label: t('Goal + obstacles', '目标 + 障碍'),
      description: 'g · O · H fixed', tone: 'amber', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'token', kind: 'scientific-voxel-grid', box: [18, 240, 150, 115],
      label: t('Latent scene zₜ', '潜在场景 zₜ'), tone: 'blue', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [205, 55, 165, 155],
      label: options.backbone, tone: 'violet',
      variant: 'world-model', fontSize: 23, borderWidth: 2.7,
    }),
    makeNode(palette, {
      id: 'wm-action-candidates', role: 'action', box: [205, 240, 165, 72],
      label: t('M action sequences', 'M 组动作序列'), description: '{aᵐ∈ℝᴴˣ⁷}ᵐ₌₁ᴹ', tone: 'blue', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'wm-uncertainty', role: 'loss', box: [205, 335, 165, 52],
      label: 'Dψ decode · Uω ensemble', tone: 'neutral', fontSize: 21,
    }),
    makeCaption(palette, 'wm-shared-context', [395, 52, 355, 33], t('shared zₜ, g, O, H · only aᵐ varies', '共享 zₜ、g、O、H · 仅 aᵐ 变化'), 21),
    makeNode(palette, { id: 'wm-rollout-fanout', role: 'token', kind: 'or-junction', box: [378, 177, 24, 24], label: '', tone: 'neutral' }),
  );
  const candidates = [
    ['wm-rollout-a', worldSuccess, 'aᴬ', t('goal reached', '达成目标'), 'JA · lowest', 'green', 400, 'world-success.webp'],
    ['wm-rollout-b', worldCollision, 'aᴮ', t('collision', '碰撞'), 'JB · Ccontact↑', 'coral', 520, 'world-collision.webp'],
    ['wm-rollout-c', worldUncertain, 'aᶜ', t('occluded', '遮挡'), 'JC · Uepi↑', 'amber', 640, 'world-uncertain.webp'],
  ] as const;
  for (const [id, image, action, outcome, score, tone, x, sourceRef] of candidates) {
    nodes.push(
      makeCaption(palette, `${id}-action`, [x, 92, 105, 25], action, 21),
      makeImage(palette, {
        id, box: [x, 122, 105, 48], label: outcome, imageUrl: image, imageFit: 'contain', rasterWidthPx: 960,
        rasterHeightPx: 160, sourceRef, promptRef: WORLD_PROMPT_REF, stroke: palette.tones[tone].stroke,
        borderWidth: tone === 'green' ? 2.3 : 1.5,
      }),
      makeCaption(palette, `${id}-outcome`, [x, 174, 105, 27], outcome, 20),
      makeNode(palette, {
        id: `${id}-score`, role: 'loss', box: [x, 215, 105, 58], label: score,
        description: id === 'wm-rollout-a' ? 'Cgoal↓ · Uepi↓' : undefined, tone, fontSize: 20,
      }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [425, 300, 285, 68], label: t('Select a* = arg minₘ Jₘ', '选择 a* = arg minₘ Jₘ'),
      description: 'J=Cgoal+λCcontact+μUepi', tone: 'coral', fontSize: 22, borderWidth: 2.6,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', box: [505, 375, 95, 42], label: t('Execute K', '执行 K 步'),
      tone: 'blue', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', box: [615, 375, 95, 42], label: t('World step', '物理转移'),
      tone: 'green', fontSize: 21,
    }),
    makeImage(palette, {
      id: 'wm-predicted-next', box: [18, 456, 150, 52], label: 'predicted next scene', imageUrl: worldSuccess,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-success.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeCaption(palette, 'wm-predicted-caption', [18, 513, 150, 26], 'predicted Dψ(ẑₜ₊₁)', 20),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [200, 456, 165, 80], label: 'rₜ₊₁=oₜ₊₁−Dψ(ẑₜ₊₁)',
      description: t('verification residual', '验证残差'), tone: 'coral', fontSize: 21,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [397, 456, 150, 52], label: 'observed next scene', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke,
    }),
    makeCaption(palette, 'wm-reobserve-caption', [397, 513, 150, 26], 'observed oₜ₊₁', 20),
    makeNode(palette, {
      id: 'wm-belief-update', role: 'policy', box: [200, 548, 347, 37],
      label: t('Residual-calibrated belief + uncertainty update', '残差校准的信念 + 不确定性更新'), tone: 'green', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'wm-contribution', role: 'annotation', box: [580, 455, 170, 60],
      label: t('CLOSED-LOOP VARIANT', '闭环变体'), description: t('residual updates belief; baseline is open loop', '残差更新信念；基线为开环'),
      tone: 'green', fontSize: 21, fontWeight: 700,
    }),
    makeNode(palette, {
      id: 'wm-baseline', role: 'policy', box: [580, 525, 170, 38], label: t('BASELINE · open loop', '基线 · 开环'),
      tone: 'violet', fontSize: 19,
    }),
    makeCaption(palette, 'wm-synthetic-note', [580, 568, 170, 20], t('Synthetic · no scores', '合成图 · 无实测分数'), 17),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-observation', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-candidates', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-rollout-a-score', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-rollout-b-score', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-rollout-c-score', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-a-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 12 }),
    makeEdge(palette, { source: 'wm-rollout-a-score', target: 'wm-predicted-next', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'left', routeOffset: 12 }),
    makeEdge(palette, { source: 'wm-predicted-next', target: 'wm-error', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-belief-update', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-belief-update', target: 'wm-voxel', sourceHandle: 'left', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 13 }),
  ];
  return { nodes, edges, width, height };
}

function worldDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-input', [25, 18, 305, 42], t('A  Fixed scene context', 'A  固定场景上下文'), 32),
    makeStage(palette, 'wm-stage-model', [365, 18, 355, 42], t('B  Latent imagination model', 'B  潜在想象模型'), 32),
    makeStage(palette, 'wm-stage-futures', [755, 18, 540, 42], t('C  Parallel counterfactual futures', 'C  并行反事实未来'), 32),
    makeStage(palette, 'wm-stage-decision', [1330, 18, 300, 42], t('D  Select and act', 'D  选择与执行'), 32),
    makeStage(palette, 'wm-stage-verify', [25, 600, 1600, 42], t('E  Physical observation → residual calibration', 'E  物理观测 → 残差校准'), 32),
    makePanel(palette, 'wm-model-panel', [365, 72, 355, 480], 'blue'),
    makeImage(palette, {
      id: 'wm-observation', role: 'environment', box: [35, 100, 295, 68], label: 'observed scene', imageUrl: worldCurrent,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeCaption(palette, 'wm-observation-caption', [35, 176, 295, 40], 'observed RGB  oₜ', 26),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [35, 245, 295, 88], label: t('Goal g + obstacle set O', '目标 g + 障碍集合 O'),
      description: t('red cube → blue tray · horizon H', '红方块 → 蓝托盘 · 时域 H'), tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'wm-fixed-context', role: 'annotation', box: [35, 375, 295, 120], label: t('CONTROLLED COMPARISON', '受控比较'),
      description: t('hold oₜ, zₜ, g, O, H fixed', '固定 oₜ、zₜ、g、O、H'), tone: 'neutral', fontSize: 27,
      fontWeight: 700,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'token', kind: 'scientific-voxel-grid', box: [390, 100, 140, 135],
      label: t('Latent scene zₜ', '潜在场景 zₜ'), description: 'Eφ(oₜ,g,O)', tone: 'blue', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [555, 100, 140, 135],
      label: options.backbone, description: 'Fθ(zₜ,aᵐ)', tone: 'violet', variant: 'world-model',
      fontSize: 25, borderWidth: 2.7,
    }),
    makeNode(palette, {
      id: 'wm-action-candidates', role: 'action', box: [390, 285, 305, 90],
      label: t('M candidate action sequences', 'M 组候选动作序列'), description: '{aᵐ∈ℝᴴˣ⁷}ᵐ₌₁ᴹ', tone: 'blue', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'wm-decoder', role: 'backbone', box: [390, 425, 140, 88], label: t('Decoder Dψ', '解码器 Dψ'),
      description: 'ôᵐ=Dψ(ẑᵐ)', tone: 'green', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-uncertainty', role: 'loss', box: [555, 425, 140, 88], label: t('Ensemble Uω', '集成 Uω'),
      description: 'Uepi=Varω[ẑᵐ]', tone: 'amber', fontSize: 24,
    }),
    makeCaption(palette, 'wm-shared-context', [765, 78, 520, 48], t('shared zₜ, g, O, H · only candidate action aᵐ changes', '共享 zₜ、g、O、H · 仅候选动作 aᵐ 改变'), 25),
    makeNode(palette, { id: 'wm-rollout-fanout', role: 'token', kind: 'or-junction', box: [735, 212, 30, 30], label: '', tone: 'neutral' }),
  );
  const candidates = [
    ['wm-rollout-a', worldSuccess, 'aᴬₜ:ₜ₊ᴴ', t('goal reached', '达成目标'), 'JA · lowest', 'Cgoal↓ · Ccontact=0 · Uepi↓', 'green', 785, 'world-success.webp'],
    ['wm-rollout-b', worldCollision, 'aᴮₜ:ₜ₊ᴴ', t('collision', '碰撞'), 'JB · rejected', 'Ccontact↑', 'coral', 960, 'world-collision.webp'],
    ['wm-rollout-c', worldUncertain, 'aᶜₜ:ₜ₊ᴴ', t('occluded', '遮挡'), 'JC · rejected', 'Uepi↑', 'amber', 1135, 'world-uncertain.webp'],
  ] as const;
  for (const [id, image, action, outcome, score, scoreDetail, tone, x, sourceRef] of candidates) {
    nodes.push(
      makeCaption(palette, `${id}-action`, [x, 145, 150, 36], action, 24),
      makeImage(palette, {
        id, box: [x, 195, 150, 62], label: outcome, imageUrl: image, imageFit: 'contain', rasterWidthPx: 960,
        rasterHeightPx: 160, sourceRef, promptRef: WORLD_PROMPT_REF, stroke: palette.tones[tone].stroke,
        borderWidth: tone === 'green' ? 2.6 : 1.6,
      }),
      makeCaption(palette, `${id}-outcome`, [x, 265, 150, 36], outcome, 24),
      makeNode(palette, {
        id: `${id}-score`, role: 'loss', box: [x, 325, 150, 105], label: score, description: scoreDetail,
        tone, fontSize: 24,
      }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [800, 470, 475, 82], label: 'a* = arg minₘ [Cgoal + λCcontact + μUepi]',
      description: t('constraint-aware selection', '约束感知选择'), tone: 'coral', fontSize: 26, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', kind: 'scientific-action-chunk', box: [1360, 100, 250, 145],
      label: t('Execute selected plan', '执行选定计划'), description: 'a*ₜ:ₜ₊ᴴ · first K steps', tone: 'blue',
      variant: 'action-horizon', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', kind: 'scientific-robot-arm', box: [1360, 300, 250, 210],
      label: t('Physical robot + world', '物理机器人 + 世界'), description: 'sₜ → sₜ₊₁', tone: 'green',
      variant: 'execution', fontSize: 27,
    }),
    makeImage(palette, {
      id: 'wm-predicted-next', box: [75, 700, 310, 72], label: 'predicted next scene', imageUrl: worldSuccess,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-success.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeCaption(palette, 'wm-predicted-caption', [75, 780, 310, 42], 'predicted  Dψ(ẑₜ₊₁)', 25),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [485, 690, 285, 115], label: 'rₜ₊₁=oₜ₊₁−Dψ(ẑₜ₊₁)',
      description: t('verification residual · not a metric result', '验证残差 · 非指标结果'), tone: 'coral', fontSize: 26,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [875, 700, 310, 72], label: 'observed next scene', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, borderWidth: 2.2,
    }),
    makeCaption(palette, 'wm-reobserve-caption', [875, 780, 310, 42], 'observed  oₜ₊₁', 25),
    makeNode(palette, {
      id: 'wm-belief-update', role: 'policy', box: [485, 845, 700, 78],
      label: t('Residual-calibrated belief update', '残差校准的信念更新'),
      description: 'zₜ₊₁ ← update(ẑₜ₊₁,rₜ₊₁)  ·  Uω ← calibrate(rₜ₊₁)', tone: 'green', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'wm-contribution', role: 'annotation', box: [1260, 675, 350, 150],
      label: t('RESIDUAL-CALIBRATED PLANNING', '残差校准规划'),
      description: t('selected prediction is checked against an independent physical observation', '选定预测与独立物理观测进行核验'),
      tone: 'green', fontSize: 27, fontWeight: 720,
    }),
    makeNode(palette, {
      id: 'wm-baseline', role: 'policy', box: [1260, 855, 350, 70], label: t('BASELINE · open-loop ranking', '基线 · 开环排序'),
      description: t('no residual update', '无残差更新'), tone: 'violet', fontSize: 25,
    }),
    makeCaption(palette, 'wm-synthetic-note', [75, 950, 1110, 38], t('Synthetic counterfactual media · hypotheses only · no measured scores', '合成反事实媒体 · 仅表示假设 · 无实测分数'), 23),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-observation', target: 'wm-voxel', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-candidates', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-decoder', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-uncertainty', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-decoder', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-rollout-a-score', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-rollout-b-score', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-rollout-c-score', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-a-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-uncertainty', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast', label: 'Uepi' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 23 }),
    makeEdge(palette, { source: 'wm-rollout-a-score', target: 'wm-predicted-next', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'left', routeOffset: 22 }),
    makeEdge(palette, { source: 'wm-predicted-next', target: 'wm-error', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-belief-update', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-belief-update', target: 'wm-voxel', sourceHandle: 'left', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 24 }),
  ];
  return { nodes, edges, width, height };
}

function worldPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-input', [35, 22, 300, 54], t('A  Fixed context', 'A  固定上下文'), 42),
    makeStage(palette, 'wm-stage-model', [390, 22, 320, 54], t('B  Imagine', 'B  想象'), 42),
    makeStage(palette, 'wm-stage-futures', [765, 22, 610, 54], t('C  Compare action-only futures', 'C  比较仅动作变化的未来'), 42),
    makeStage(palette, 'wm-stage-verify', [1410, 22, 215, 54], t('D  Verify', 'D  验证'), 42),
    makeImage(palette, {
      id: 'wm-observation', role: 'environment', box: [45, 110, 295, 72], label: 'observed scene', imageUrl: worldCurrent,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeCaption(palette, 'wm-observation-caption', [45, 190, 295, 42], 'observed oₜ', 32),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [45, 265, 295, 100], label: t('Goal g + obstacles O', '目标 g + 障碍 O'),
      description: t('same across all candidates', '所有候选共享'), tone: 'amber', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'token', kind: 'scientific-voxel-grid', box: [45, 410, 295, 140],
      label: t('Latent scene zₜ', '潜在场景 zₜ'), description: 'Eφ(oₜ,g,O)', tone: 'blue', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [410, 110, 280, 235],
      label: options.backbone, description: 'ẑᵐ=Fθ(zₜ,aᵐ)', tone: 'violet',
      variant: 'world-model', fontSize: 37, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'wm-action-candidates', role: 'action', kind: 'scientific-action-chunk', box: [410, 395, 280, 155],
      label: t('M candidate sequences', 'M 组候选序列'), description: '{aᵐ∈ℝᴴˣ⁷}ᵐ₌₁ᴹ', tone: 'blue',
      variant: 'action-horizon', fontSize: 34,
    }),
    makeCaption(palette, 'wm-shared-context', [780, 85, 590, 45], t('shared zₜ, g, O, H · only aᵐ changes', '共享 zₜ、g、O、H · 仅 aᵐ 改变'), 30),
    makeNode(palette, { id: 'wm-rollout-fanout', role: 'token', kind: 'or-junction', box: [730, 245, 34, 34], label: '', tone: 'neutral' }),
  );
  const candidates = [
    ['wm-rollout-a', worldSuccess, 'aᴬ', t('goal', '目标'), 'JA · lowest', 'green', 790, 'world-success.webp'],
    ['wm-rollout-b', worldCollision, 'aᴮ', t('collision', '碰撞'), 'JB · Ccontact↑', 'coral', 995, 'world-collision.webp'],
    ['wm-rollout-c', worldUncertain, 'aᶜ', t('occluded', '遮挡'), 'JC · Uepi↑', 'amber', 1200, 'world-uncertain.webp'],
  ] as const;
  for (const [id, image, action, outcome, score, tone, x, sourceRef] of candidates) {
    nodes.push(
      makeCaption(palette, `${id}-action`, [x, 145, 185, 35], action, 31),
      makeImage(palette, {
        id, box: [x, 195, 185, 70], label: outcome, imageUrl: image, imageFit: 'contain', rasterWidthPx: 960,
        rasterHeightPx: 160, sourceRef, promptRef: WORLD_PROMPT_REF, stroke: palette.tones[tone].stroke,
        borderWidth: tone === 'green' ? 2.8 : 1.8,
      }),
      makeCaption(palette, `${id}-outcome`, [x, 275, 185, 40], outcome, 31),
      makeNode(palette, {
        id: `${id}-score`, role: 'loss', box: [x, 345, 185, 105], label: score,
        description: id === 'wm-rollout-a' ? 'Cgoal↓ · Uepi↓' : undefined, tone, fontSize: 30,
      }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [835, 495, 500, 90], label: 'a*=arg minₘ [Cgoal+λCcontact+μUepi]',
      description: t('ensemble uncertainty Uω informs selection', '集成不确定性 Uω 参与选择'), tone: 'coral', fontSize: 32,
      borderWidth: 3,
    }),
    makeImage(palette, {
      id: 'wm-predicted-next', box: [1415, 110, 210, 65], label: 'predicted scene', imageUrl: worldSuccess,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-success.webp', promptRef: WORLD_PROMPT_REF,
    }),
    makeCaption(palette, 'wm-predicted-caption', [1415, 183, 210, 36], 'predicted ôₜ₊₁', 29),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [1415, 270, 210, 65], label: 'observed scene', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, borderWidth: 2.2,
    }),
    makeCaption(palette, 'wm-reobserve-caption', [1415, 343, 210, 36], 'observed oₜ₊₁', 29),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [1415, 425, 210, 110], label: 'rₜ₊₁=oₜ₊₁−ôₜ₊₁',
      description: t('independent residual', '独立残差'), tone: 'coral', fontSize: 30,
    }),
    makeNode(palette, { id: 'wm-action', role: 'action', box: [800, 620, 190, 70], label: t('Execute K steps', '执行 K 步'), tone: 'blue', fontSize: 31 }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', box: [1025, 620, 210, 70], label: t('Physical world step', '物理世界转移'),
      description: 'sₜ → sₜ₊₁', tone: 'green', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'wm-belief-update', role: 'policy', box: [1415, 620, 210, 100], label: t('Update belief + Uω', '更新信念 + Uω'),
      description: 'update(ẑ,r) · calibrate(U)', tone: 'green', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'wm-contribution', role: 'annotation', box: [45, 650, 690, 145], label: t('RESIDUAL-CALIBRATED PLANNING', '残差校准规划'),
      description: t('shared context · parallel futures · independent observation', '共享上下文 · 并行未来 · 独立观测'),
      tone: 'green', fontSize: 35, fontWeight: 720, textAlign: 'center',
    }),
    makeNode(palette, {
      id: 'wm-baseline', role: 'policy', box: [800, 735, 435, 70], label: t('BASELINE · open-loop ranking', '基线 · 开环排序'),
      description: t('no residual belief update', '无残差信念更新'), tone: 'violet', fontSize: 29,
    }),
    makeCaption(palette, 'wm-synthetic-note', [45, 808, 690, 35], t('Synthetic counterfactuals · no measured scores', '合成反事实 · 无实测分数'), 27),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-observation', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-candidates', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-rollout-a-score', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-rollout-b-score', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-rollout-c-score', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-a-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c-score', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'temporal' }),
    makeEdge(palette, { source: 'wm-rollout-a-score', target: 'wm-predicted-next', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routeSide: 'right', routeOffset: 24 }),
    makeEdge(palette, { source: 'wm-predicted-next', target: 'wm-error', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-belief-update', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-belief-update', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'bottom-left', routeOffset: 24 }),
  ];
  return { nodes, edges, width, height };
}

function vlaDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [25, 18, 300, 42], t('A  Grounded task evidence', 'A  接地任务证据'), 32),
    makeStage(palette, 'vla-stage-policy', [365, 18, 540, 42], t('B  Vision-language policy', 'B  视觉语言策略'), 32),
    makeStage(palette, 'vla-stage-action', [945, 18, 680, 42], t('C  METHOD · grounded flow action', 'C  方法 · 接地流动作'), 32),
    makeStage(palette, 'vla-stage-execution', [25, 620, 1600, 42], t('D  Same-scene closed-loop evidence', 'D  同场景闭环证据'), 32),
    makePanel(palette, 'vla-proposed-panel', [940, 70, 690, 515], 'green'),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [35, 88, 285, 210], label: 'Observed task scene', imageUrl: vlaObserve,
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'vla-observe.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeCaption(palette, 'vla-camera-caption', [35, 305, 285, 45], 'oₜ  ·  front RGB', 26),
    makeNode(palette, {
      id: 'vla-language', role: 'modality', box: [35, 365, 285, 82], label: t('Instruction ℓ', '任务指令 ℓ'),
      description: t('“place the red cube in the teal tray”', '“将红方块放入青色托盘”'), tone: 'amber', fontSize: 27,
      textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-token-strip', box: [35, 470, 285, 105],
      label: t('Proprioception sₜ', '本体状态 sₜ'), description: '[qₜ, q̇ₜ, gₜ] ∈ ℝ¹⁵', tone: 'blue',
      variant: 'state-vector', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [390, 110, 180, 145],
      label: t('Multimodal tokens', '多模态 Token'), description: 'X₀=[vₜ; eℓ; e(sₜ)]', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [625, 88, 250, 210],
      label: options.backbone, description: t('causal multimodal attention', '因果多模态注意力'),
      tone: 'violet', variant: 'vlm', fontSize: 29, borderWidth: 2.5,
    }),
    makeNode(palette, {
      id: 'vla-attention', role: 'annotation', kind: 'scientific-attention-map', box: [405, 350, 455, 175],
      label: t('Object grounding zobj → hₜ', '物体接地 zobj → hₜ'),
      description: t('same identity across views', '跨视图保持同一身份'),
      tone: 'neutral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [965, 105, 225, 220],
      label: t('Flow field vθ', '流场 vθ'), description: t('grounded · trainable θact', '接地 · 可训练 θact'),
      tone: 'coral', variant: 'diffusion-action', fontSize: 29, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [965, 355, 225, 82],
      label: 'Inference seed  A₀=ε', description: 'c=[zobj,hₜ,sₜ]', tone: 'amber', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [965, 465, 225, 90],
      label: 'Aτ=(1−τ)ε+τA', description: 'u=A−ε · LFM=𝔼‖vθ−u‖²',
      tone: 'coral', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [1230, 110, 145, 145],
      label: t('ODE solver', 'ODE 求解器'), description: 'dA/dτ=vθ · NFE=10', tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1410, 100, 180, 165],
      label: t('Action chunk', '动作块'), description: 'Â∈ℝ¹⁶×⁷ · 20 Hz', tone: 'blue',
      variant: 'action-horizon', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [1230, 310, 145, 95], label: t('Constraint source', '约束源'),
      description: 'limits(sₜ) · ĉcontact(hₜ)', tone: 'neutral', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [1410, 310, 180, 95], label: t('Safety projection', '安全投影'),
      description: 'Πsafe(Â, ĉcontact)', tone: 'neutral', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1305, 455, 285, 80], label: t('MPC controller', 'MPC 控制器'),
      description: t('execute K=4, then replan', '执行 K=4，随后重规划'), tone: 'blue', fontSize: 28,
    }),
  );
  const frames = [
    ['vla-exec-observe', vlaObserve, 't  observe', 35, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 't+4  approach', 250, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 't+8  lift', 465, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 't+12  place', 680, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [x, 690, 175, 170], label, imageUrl: image, imageFit: 'cover', rasterWidthPx: 400,
        rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-caption`, [x, 867, 175, 38], label, 25),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [930, 700, 270, 180],
      label: t('Executed tool path', '执行工具轨迹'), description: 'Tbase→tool(t:t+12)', tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-baseline-head', role: 'policy', box: [1245, 690, 350, 90],
      label: t('BASELINE · token action head', '基线 · Token 动作头'),
      description: t('independent action tokens · no ODE integration', '独立动作 Token · 无 ODE 积分'),
      tone: 'violet', fontSize: 27,
    }),
    makeCaption(
      palette,
      'vla-contribution',
      [1245, 800, 350, 82],
      t('METHOD IDENTITY', '方法身份'),
      27,
      t('zobj-grounded flow → ODE chunk → re-observation', 'zobj 接地流 → ODE 动作块 → 再观测'),
    ),
    makeCaption(
      palette,
      'vla-grounding-note',
      [930, 930, 665, 45],
      t('Synthetic storyboard · structural illustration, not empirical evidence', '合成故事板 · 结构示意，并非实证证据'),
      23,
    ),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-language', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-attention', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-attention', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control', label: 'zobj,hₜ' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 22 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 22 }),
    makeEdge(palette, { source: 'vla-attention', target: 'vla-baseline-head', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'bottom-right', routeOffset: 20 }),
  ];
  return { nodes, edges, width, height };
}

function vlaPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [35, 22, 300, 54], t('A  Grounded task', 'A  接地任务'), 42),
    makeStage(palette, 'vla-stage-policy', [390, 22, 510, 54], t('B  Vision-language policy', 'B  视觉语言策略'), 42),
    makeStage(palette, 'vla-stage-action', [940, 22, 685, 54], t('C  PROPOSED · grounded flow action', 'C  提出方法 · 接地流动作'), 42),
    makeStage(palette, 'vla-stage-execution', [35, 552, 1590, 48], t('D  Observe → approach → lift → place → re-observe', 'D  观测 → 接近 → 抬起 → 放置 → 再观测'), 39),
    makePanel(palette, 'vla-proposed-panel', [930, 82, 695, 440], 'green'),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [45, 105, 290, 225], label: 'Observed task scene', imageUrl: vlaObserve,
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'vla-observe.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeCaption(palette, 'vla-camera-caption', [45, 338, 290, 40], 'oₜ  ·  front RGB', 32),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-token-strip', box: [45, 405, 290, 120],
      label: t('Instruction + robot state', '指令 + 机器人状态'), description: 'ℓ ; sₜ=[qₜ,q̇ₜ,gₜ]', tone: 'amber',
      variant: 'state-vector', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [410, 125, 180, 155],
      label: t('Multimodal tokens', '多模态 Token'), description: '[vₜ; eℓ; e(sₜ)]', tone: 'amber', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [640, 105, 240, 205],
      label: options.backbone, description: t('object context hₜ', '物体上下文 hₜ'), tone: 'violet',
      variant: 'vlm', fontSize: 36, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'vla-attention', role: 'annotation', kind: 'scientific-attention-map', box: [410, 365, 470, 150],
      label: t('Object grounding  zobj → hₜ', '物体接地  zobj → hₜ'), description: t('same identity across views', '跨视图保持同一身份'),
      tone: 'neutral', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [960, 105, 220, 180],
      label: t('Flow field vθ', '流场 vθ'), description: 'c=[zobj,hₜ,sₜ]', tone: 'coral',
      variant: 'diffusion-action', fontSize: 36, borderWidth: 3.1,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [960, 320, 220, 75],
      label: 'Inference seed  A₀=ε', tone: 'amber', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [960, 425, 220, 75],
      label: 'Flow loss', description: 'Aτ=(1−τ)ε+τA  ·  u=A−ε', tone: 'coral', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [1215, 105, 150, 130],
      label: 'ODE solver', description: 'dA/dτ=vθ · NFE=10', tone: 'coral', fontSize: 33,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1400, 105, 180, 130],
      label: 'H×7 chunk', description: 'Âₜ:ₜ₊₁₅ · 20 Hz', tone: 'blue', variant: 'action-horizon', fontSize: 33,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [1215, 275, 150, 95], label: t('Constraints', '约束源'),
      description: 'limits(sₜ) · ĉcontact(hₜ)', tone: 'neutral', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [1400, 275, 180, 95], label: t('Safety projection', '安全投影'),
      description: 'Πsafe(Â,ĉcontact)', tone: 'neutral', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1265, 410, 315, 80], label: t('MPC · execute K=4 · replan', 'MPC · 执行 K=4 · 重规划'),
      tone: 'blue', fontSize: 32,
    }),
  );
  const frames = [
    ['vla-exec-observe', vlaObserve, 't  observe', 45, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 't+4  approach', 270, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 't+8  lift', 495, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 't+12  place', 720, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [x, 625, 185, 150], label, imageUrl: image, imageFit: 'cover', rasterWidthPx: 400,
        rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
      }),
      makeCaption(palette, `${id}-caption`, [x, 783, 185, 35], label, 29),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [970, 625, 260, 185],
      label: t('Executed tool path', '执行工具轨迹'), description: 'Tbase→tool(t:t+12)', tone: 'blue', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'vla-baseline-head', role: 'policy', box: [1280, 620, 310, 82],
      label: t('BASELINE · token action head', '基线 · Token 动作头'), description: t('no ODE integration', '无 ODE 积分'),
      tone: 'violet', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'vla-contribution', role: 'annotation', box: [1280, 720, 310, 90],
      label: t('METHOD IDENTITY', '方法身份'), description: 'zobj → flow → ODE → re-observe',
      tone: 'green', fontSize: 31, fontWeight: 720,
    }),
    makeCaption(palette, 'vla-grounding-note', [970, 820, 620, 30], t('Synthetic same-camera storyboard · mechanism only', '合成同机位故事板 · 仅表示机制'), 26),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-attention', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-attention', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control', label: 'zobj,hₜ', labelFontSize: 27 }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 24 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 20 }),
    makeEdge(palette, { source: 'vla-attention', target: 'vla-baseline-head', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'bottom-right', routeOffset: 18 }),
  ];
  return { nodes, edges, width, height };
}

function llmPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [35, 22, 795, 52], t('A  Shared SFT reference', 'A  共享 SFT 参考'), 41),
    makeStage(palette, 'lt-stage-evidence', [850, 22, 775, 52], t('B  Preference evidence', 'B  偏好证据'), 41),
    makePanel(palette, 'lt-rlhf-panel', [35, 300, 760, 365], 'violet'),
    makePanel(palette, 'lt-dpo-panel', [830, 300, 795, 365], 'green'),
    makeStage(palette, 'lt-stage-rlhf', [65, 320, 700, 48], t('C  BASELINE · RM + PPO', 'C  基线 · RM + PPO'), 36),
    makeStage(palette, 'lt-stage-dpo', [860, 320, 735, 48], t('D  DPO · direct preference update', 'D  DPO · 直接偏好更新'), 36),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', kind: 'scientific-transformer', box: [45, 95, 170, 145],
      label: options.backbone, description: 'π₀', tone: 'violet', variant: 'base-model', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [255, 110, 150, 100], label: t('SFT data', 'SFT 数据'),
      description: '(x,y*)', tone: 'amber', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [445, 115, 170, 90], label: 'LSFT=−logπ(y*|x)',
      tone: 'coral', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [660, 95, 170, 145],
      label: t('Frozen πref', '冻结 πref'), description: t('shared reference', '共享参考'), tone: 'blue',
      variant: 'checkpoint', fontSize: 32,
    }),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [870, 90, 245, 75], label: 'Prompt x',
      description: t('“Why does ice float?”', '“冰为什么会浮？”'), tone: 'blue', fontSize: 31, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-chosen-response', role: 'modality', box: [870, 190, 115, 80], label: t('Chosen yw', '优选 yw'),
      description: t('correct', '正确'), tone: 'green', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-rejected-response', role: 'modality', box: [1000, 190, 115, 80], label: t('Rejected yl', '拒选 yl'),
      description: t('vague', '含糊'), tone: 'coral', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-loss-target', box: [1180, 95, 270, 145],
      label: t('Preference pair', '偏好对'), description: 'Dpref=(x,yw,yl) · yw≻yl', tone: 'amber',
      variant: 'preference-objective', fontSize: 31,
    }),
    makeCaption(palette, 'lt-evidence-contract', [1480, 100, 130, 125], t('Same data; only DPO deploys.', '同一数据；仅 DPO 部署。'), 25),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', kind: 'scientific-loss-target', box: [75, 400, 200, 140],
      label: t('Fit reward rφ', '拟合奖励 rφ'), description: 'LRM=−logσ(rw−rl)', tone: 'coral',
      variant: 'preference-objective', fontSize: 31,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', kind: 'scientific-transformer', box: [315, 405, 145, 130],
      label: t('Reward model', '奖励模型'), description: 'rφ(x,y)', tone: 'violet', variant: 'checkpoint', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'lt-rollout', role: 'token', kind: 'scientific-token-strip', box: [500, 400, 145, 140],
      label: t('Policy samples', '策略采样'), description: 'yᵢ∼πθ(·|x)', tone: 'blue', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [680, 405, 95, 130], label: 'PPO',
      description: 'rφ−βKL(πθ‖πref)', tone: 'blue', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [315, 575, 460, 62], label: t('RLHF policy πθ · sample → score → update → resample', 'RLHF 策略 πθ · 采样 → 评分 → 更新 → 再采样'),
      tone: 'violet', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-loss-target', box: [875, 390, 350, 170],
      label: 'DPO loss  LDPO', description: '−𝔼logσ{β[Δlogπθ−Δlogπref]}', tone: 'coral',
      variant: 'preference-objective', fontSize: 31, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', kind: 'scientific-transformer', box: [1300, 395, 275, 160],
      label: t('Trainable DPO policy πθ', '可训练 DPO 策略 πθ'), description: t('initialized from πref', '由 πref 初始化'),
      tone: 'green', variant: 'checkpoint', fontSize: 32, borderWidth: 2.8,
    }),
    makeCaption(palette, 'lt-implicit-reward', [875, 595, 350, 48], 'derived only: r̂θ=β log(πθ/πref)', 27),
    makeCaption(palette, 'lt-dpo-contract', [1300, 595, 275, 48], t('no reward model · no rollout', '无奖励模型 · 无在线采样'), 27),
    makeStage(palette, 'lt-stage-deploy', [830, 695, 795, 40], t('E  DPO deployment path only', 'E  仅 DPO 部署路径'), 34),
    makeNode(palette, { id: 'lt-inference-prompt', role: 'modality', box: [860, 755, 150, 75], label: "Prompt x'", tone: 'blue', fontSize: 29 }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1060, 745, 220, 90], label: t('Frozen DPO policy', '冻结 DPO 策略'),
      description: 'πθ', tone: 'ink', variant: 'aligned-model', fontSize: 30,
    }),
    makeNode(palette, { id: 'lt-response', role: 'action', box: [1330, 755, 120, 75], label: "y∼πθ(·|x')", tone: 'green', fontSize: 27 }),
    makeNode(palette, { id: 'lt-release-gate', role: 'action', box: [1495, 755, 120, 75], label: t('Release gate', '发布门'), description: t('eval', '评测'), tone: 'green', fontSize: 27 }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-chosen-response', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-rejected-response', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', routeSide: 'left', routeOffset: 20 }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted', label: 'KL ref' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'bottom', targetHandle: 'right', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-rollout', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control', label: 'init' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-dpo-objective', sourceHandle: 'left', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed', label: '∇θ' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
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

function legacyLlmSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-evidence', [14, 9, 150, 30], t('A  Preference evidence', 'A  偏好证据'), 25),
    makeStage(palette, 'lt-stage-reference', [185, 9, 170, 30], t('B  Shared reference', 'B  共享参考策略'), 25),
    makeStage(palette, 'lt-stage-alignment', [380, 9, 375, 30], t('C  DPO vs RM+PPO', 'C  DPO 对比 RM+PPO'), 25),
    makeStage(palette, 'lt-stage-deploy', [14, 420, 740, 30], t('D  Select and deploy', 'D  选择与部署'), 25),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [18, 52, 145, 72], label: 'Prompt x',
      description: t('“Why does ice float?”', '“冰为什么会浮？”'), tone: 'blue', fontSize: 23, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'token', kind: 'scientific-token-strip', box: [18, 150, 145, 145],
      label: t('Preference pair', '偏好对'), description: 'y_w: clear physics\ny_l: vague claim', tone: 'amber', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', box: [198, 52, 150, 76], label: options.backbone,
      description: 'π₀', tone: 'violet', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [198, 150, 150, 64], label: t('SFT pairs (x,y*)', 'SFT 对 (x,y*)'),
      tone: 'amber', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [198, 238, 150, 72], label: 'L_SFT=−log π(y*|x)',
      tone: 'coral', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', box: [198, 334, 150, 72], label: t('Reference policy', '参考策略'),
      description: 'π_ref · frozen', tone: 'blue', variant: 'checkpoint', fontSize: 23,
    }),
    makePanel(palette, 'lt-dpo-panel', [390, 48, 165, 340], 'green'),
    makePanel(palette, 'lt-rlhf-panel', [575, 48, 165, 340], 'violet'),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', box: [402, 68, 141, 145], label: t('PROPOSED · DPO', '提出 · DPO'),
      description: '−𝔼 log σ{β(Δlogπθ−Δlogπref)}', tone: 'coral', fontSize: 22, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'lt-implicit-reward', role: 'annotation', box: [402, 235, 141, 66], label: 'r̂θ=β log(πθ/π_ref)',
      tone: 'neutral', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', box: [402, 320, 141, 55], label: t('DPO policy πθ', 'DPO 策略 πθ'),
      tone: 'green', variant: 'checkpoint', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [587, 68, 141, 145], label: t('BASELINE · RLHF', '基线 · RLHF'),
      description: 'fit rφ → rollout → score → PPO', tone: 'violet', fontSize: 22,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [587, 235, 141, 66], label: t('Reward model rφ', '奖励模型 rφ'),
      tone: 'violet', fontSize: 21,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [587, 320, 141, 55], label: t('RLHF policy πθ', 'RLHF 策略 πθ'),
      tone: 'violet', variant: 'checkpoint', fontSize: 22,
    }),
    makeNode(palette, { id: 'lt-alignment-merge', role: 'token', kind: 'or-junction', box: [370, 475, 28, 28], label: '', tone: 'neutral' }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [425, 455, 165, 82], label: t('Selected policy π*', '选定策略 π*'),
      description: t('paper states chosen path', '论文声明所选路线'), tone: 'ink', variant: 'aligned-model', fontSize: 23,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [620, 455, 110, 82], label: t('Release gate', '发布门'),
      description: t('held-out eval', '留出评测'), tone: 'green', fontSize: 22,
    }),
    makeCaption(
      palette,
      'lt-mechanism-contract',
      [18, 552, 712, 34],
      t('DPO: offline direct update     RM+PPO: fitted reward + on-policy rollout', 'DPO：离线直接更新     RM+PPO：拟合奖励 + 在线采样'),
      21,
    ),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-implicit-reward', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-implicit-reward', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-rlhf-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-alignment-merge', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-alignment-merge', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-alignment-merge', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
  ];
  return { nodes, edges, width, height };
}

function legacyLlmDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-evidence', [25, 18, 300, 42], t('A  Preference evidence', 'A  偏好证据'), 32),
    makeStage(palette, 'lt-stage-reference', [365, 18, 300, 42], t('B  Shared reference policy', 'B  共享参考策略'), 32),
    makeStage(palette, 'lt-stage-dpo', [705, 18, 470, 42], t('C  PROPOSED · direct preference update', 'C  提出 · 直接偏好更新'), 32),
    makeStage(palette, 'lt-stage-rlhf', [705, 520, 470, 42], t('D  BASELINE · reward model + PPO', 'D  基线 · 奖励模型 + PPO'), 32),
    makeStage(palette, 'lt-stage-deploy', [1215, 18, 415, 42], t('E  Contract and inference', 'E  契约与推理'), 32),
    makePanel(palette, 'lt-dpo-panel', [700, 70, 480, 410], 'green'),
    makePanel(palette, 'lt-rlhf-panel', [700, 570, 480, 365], 'violet'),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [35, 90, 285, 82], label: 'Prompt x',
      description: t('“Why does ice float?”', '“冰为什么会浮？”'), tone: 'blue', fontSize: 28, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-chosen-response', role: 'modality', box: [35, 220, 135, 118], label: t('Chosen y_w', '优选 y_w'),
      description: t('density explanation', '密度解释'), tone: 'green', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-rejected-response', role: 'modality', box: [185, 220, 135, 118], label: t('Rejected y_l', '拒选 y_l'),
      description: t('vague claim', '含糊陈述'), tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'token', kind: 'scientific-token-strip', box: [70, 390, 250, 115],
      label: t('Preference dataset', '偏好数据集'), description: 'D_pref={(x,y_w,y_l)}', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', box: [395, 90, 240, 100], label: options.backbone,
      description: 'π₀', tone: 'violet', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [395, 235, 240, 88], label: t('Instruction pairs', '指令对'),
      description: '(x,y*)', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [395, 365, 240, 88], label: 'L_SFT=−log π(y*|x)',
      tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', box: [395, 500, 240, 110], label: t('Reference policy', '参考策略'),
      description: 'π_ref · frozen in alignment', tone: 'blue', variant: 'checkpoint', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', box: [730, 100, 420, 145],
      label: 'L_DPO=−𝔼 log σ{β[Δlogπθ−Δlogπref]}',
      description: t('offline pair · direct policy gradient', '离线偏好对 · 直接策略梯度'), tone: 'coral', fontSize: 28, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'lt-implicit-reward', role: 'annotation', box: [730, 290, 200, 105],
      label: 'r̂θ(x,y)=β log[πθ(y|x)/π_ref(y|x)]', tone: 'neutral', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', box: [955, 290, 195, 105], label: t('DPO policy πθ', 'DPO 策略 πθ'),
      description: t('no RM · no rollout', '无 RM · 无在线采样'), tone: 'green', variant: 'checkpoint', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [730, 600, 200, 105], label: 'L_RM=−log σ[rφ(y_w)−rφ(y_l)]',
      tone: 'coral', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [955, 600, 195, 105], label: t('Reward model rφ', '奖励模型 rφ'),
      description: t('separate fit', '独立拟合'), tone: 'violet', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [730, 770, 200, 105], label: t('Sample → score → PPO', '采样 → 评分 → PPO'),
      description: 'KL(πθ‖π_ref)', tone: 'blue', fontSize: 26,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [955, 770, 195, 105], label: t('RLHF policy πθ', 'RLHF 策略 πθ'),
      description: t('on-policy rollout', '在线采样'), tone: 'violet', variant: 'checkpoint', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-mechanism-contract', role: 'annotation', box: [1235, 90, 375, 175], label: t('MECHANISM CONTRACT', '机制契约'),
      description: t('DPO: offline · direct · no RM\nRLHF: reward model · rollout · PPO', 'DPO：离线 · 直接 · 无 RM\nRLHF：奖励模型 · 在线采样 · PPO'),
      tone: 'neutral', fontSize: 28, fontWeight: 700,
    }),
    makeNode(palette, { id: 'lt-alignment-merge', role: 'token', kind: 'or-junction', box: [1395, 315, 48, 48], label: '', tone: 'neutral' }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1300, 405, 270, 135], label: t('Selected aligned policy π*', '选定对齐策略 π*'),
      description: t('paper states chosen path', '论文声明所选路线'), tone: 'ink', variant: 'aligned-model', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-inference-prompt', role: 'modality', box: [1235, 620, 160, 100], label: "Prompt x'",
      description: t('held-out', '留出输入'), tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-response', role: 'action', box: [1450, 620, 160, 100], label: "y∼π*(·|x')",
      description: t('inference only', '仅推理'), tone: 'green', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [1300, 790, 270, 95], label: t('Release gate', '发布门'),
      description: t('held-out capability + safety', '留出能力 + 安全评测'), tone: 'green', fontSize: 27,
    }),
    makeCaption(
      palette,
      'lt-caption-contract',
      [1225, 930, 400, 45],
      t('Solid: data/inference   Dashed: optimization   Dotted: baseline', '实线：数据/推理   虚线：优化   点线：基线'),
      23,
    ),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-chosen-response', target: 'lt-preference-data', sourceHandle: 'bottom', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-rejected-response', target: 'lt-preference-data', sourceHandle: 'bottom', targetHandle: 'right' }),
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-implicit-reward', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-implicit-reward', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-ppo-loop', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-alignment-merge', sourceHandle: 'right', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-alignment-merge', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-alignment-merge', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'top', targetHandle: 'bottom' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-release-gate', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

function legacyLlmPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-evidence', [35, 22, 300, 54], t('A  Preference pair', 'A  偏好对'), 42),
    makeStage(palette, 'lt-stage-reference', [390, 22, 320, 54], t('B  Reference policy', 'B  参考策略'), 42),
    makeStage(palette, 'lt-stage-alignment', [765, 22, 440, 54], t('C  DPO vs RM+PPO', 'C  DPO 对比 RM+PPO'), 42),
    makeStage(palette, 'lt-stage-deploy', [1245, 22, 380, 54], t('D  Select and deploy', 'D  选择与部署'), 42),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-token-strip', box: [45, 120, 290, 230],
      label: t('Prompt + preference', 'Prompt + 偏好'), description: 'x: “Why does ice float?”\ny_w ≻ y_l', tone: 'amber', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [45, 395, 290, 115], label: t('SFT pairs (x,y*)', 'SFT 对 (x,y*)'),
      description: t('shared training evidence', '共享训练证据'), tone: 'blue', fontSize: 34,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [410, 120, 280, 230],
      label: t('SFT reference π_ref', 'SFT 参考策略 π_ref'), description: 'L_SFT=−log π(y*|x)\nπ_ref frozen in alignment',
      tone: 'blue', variant: 'checkpoint', fontSize: 35,
    }),
    makePanel(palette, 'lt-dpo-panel', [755, 88, 450, 275], 'green'),
    makePanel(palette, 'lt-rlhf-panel', [755, 390, 450, 250], 'violet'),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', box: [785, 115, 390, 215], label: t('PROPOSED · DPO', '提出 · DPO'),
      description: t('offline pair → direct update\nno reward model · no rollout', '离线偏好对 → 直接更新\n无奖励模型 · 无在线采样'),
      tone: 'coral', fontSize: 36, borderWidth: 3.2,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [785, 420, 390, 185], label: t('BASELINE · RM + PPO', '基线 · RM + PPO'),
      description: t('fit reward → sample → score → PPO', '拟合奖励 → 采样 → 评分 → PPO'), tone: 'violet', fontSize: 36,
    }),
    makeNode(palette, { id: 'lt-alignment-merge', role: 'token', kind: 'or-junction', box: [1215, 335, 54, 54], label: '', tone: 'neutral' }),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1300, 160, 280, 195], label: t('Selected policy π*', '选定策略 π*'),
      description: t('paper states chosen path', '论文声明所选路线'), tone: 'ink', variant: 'aligned-model', fontSize: 38,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [1300, 445, 280, 170], label: t('Inference + release gate', '推理 + 发布门'),
      description: t('held-out capability and safety', '留出能力与安全评测'), tone: 'green', fontSize: 36,
    }),
    makeNode(palette, {
      id: 'lt-mechanism-contract', role: 'annotation', box: [45, 700, 1535, 110],
      label: t('DPO removes the separate reward-model fit and on-policy rollout used by RM+PPO.', 'DPO 移除了 RM+PPO 所需的独立奖励模型拟合与在线采样。'),
      description: t('Solid: data/inference     Dashed: optimization     Dotted: baseline', '实线：数据/推理     虚线：优化     点线：基线'),
      tone: 'green', fontSize: 33, fontWeight: 700, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-alignment-merge', sourceHandle: 'right', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-alignment-merge', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-alignment-merge', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-release-gate', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
  ];
  return { nodes, edges, width, height };
}

export function legacyBuildTopVenueFlagship(
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
