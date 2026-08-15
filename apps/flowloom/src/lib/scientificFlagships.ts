import vlaApproach from '../assets/scientific/vla-wrist.webp?inline';
import vlaFront from '../assets/scientific/vla-front.webp?inline';
import vlaGrasp from '../assets/scientific/vla-lift.webp?inline';
import vlaPlace from '../assets/scientific/vla-placed.webp?inline';
import vlaWrist from '../assets/scientific/vla-wrist.webp?inline';
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
    borderWidth: spec.borderWidth ?? (frame || phase ? 0 : 1.9),
    radius: spec.radius ?? (frame || phase ? 0 : 4),
    fontSize: spec.fontSize ?? (phase ? 32 : annotation ? 24 : 28),
    fontWeight: spec.fontWeight ?? (phase ? 720 : annotation ? 560 : 650),
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
    borderWidth: spec.borderWidth ?? 1.5,
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
    labelFontSize: 22,
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
  });
}

function makeJunction(palette: FlagshipPalette, id: string, box: Box): FlowNode {
  return makeNode(palette, {
    id,
    kind: 'or-junction',
    role: 'token',
    box,
    label: '',
    tone: 'neutral',
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
    borderWidth: 1.35,
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
    fontWeight: 600,
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
    makeStage(palette, 'vla-stage-input', [15, 10, 170, 32], t('A  Task evidence', 'A  任务证据'), 27),
    makeStage(palette, 'vla-stage-policy', [205, 10, 320, 32], t('B  Grounded policy', 'B  接地策略'), 27),
    makeStage(palette, 'vla-stage-action', [545, 10, 210, 32], t('C  Safe action', 'C  安全动作'), 27),
    makeStage(palette, 'vla-stage-execution', [15, 365, 740, 30], t('D  Closed-loop evidence', 'D  闭环证据'), 26),
    makeImage(palette, {
      id: 'vla-camera-front', box: [18, 56, 150, 126], label: t('Scene at t', 't 时刻场景'),
      imageUrl: vlaFront, rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-front.webp', promptRef: VLA_PROMPT_REF,
      fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-tensor', box: [18, 205, 150, 118],
      label: t('Task + state', '任务 + 状态'), description: '"cube to tray"  ·  sₜ ∈ ℝ¹⁵', tone: 'amber',
      variant: 'state-vector', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [205, 62, 128, 112],
      label: t('Fuse tokens', '融合 Token'), description: '[vision; text; state]', tone: 'amber', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [360, 55, 150, 140],
      label: options.backbone, description: t('causal multimodal attention', '因果多模态注意力'),
      tone: 'violet', variant: 'vlm', fontSize: 25, borderWidth: 2.5,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', box: [205, 225, 305, 105],
      label: t('Grounded flow policy', '接地流策略'),
      description: 'L_FM = 𝔼‖vθ(Aτ,τ,c) − u‖²', tone: 'coral', variant: 'diffusion-action',
      fontSize: 25, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [548, 58, 190, 100],
      label: t('Action chunk', '动作块'), description: 'Âₜ:ₜ₊ᴴ₋₁  ·  H=16', tone: 'blue',
      variant: 'action-horizon', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [548, 182, 190, 70],
      label: t('Safety gate', '安全门'), description: t('joint + contact limits', '关节 + 接触约束'),
      tone: 'neutral', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [548, 276, 190, 70],
      label: t('Execute K=4', '执行 K=4'), description: t('then replan', '随后重规划'), tone: 'blue', fontSize: 25,
    }),
  );
  const frames = [
    ['vla-exec-observe', vlaFront, 'observe', 18],
    ['vla-robot', vlaApproach, 'approach', 130],
    ['vla-contact', vlaGrasp, 'grasp', 242],
    ['vla-reobserve', vlaPlace, 're-observe', 354],
  ] as const;
  for (const [id, image, label, x] of frames) {
    nodes.push(makeImage(palette, {
      id, box: [x, 410, 100, 100], label, imageUrl: image,
      rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: `${id}.webp`, promptRef: VLA_PROMPT_REF, fontSize: 25,
    }));
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [488, 410, 250, 100],
      label: t('Executed tool path', '执行工具轨迹'), description: 'T_base→tool(t:t+12)', tone: 'blue', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-contribution', role: 'annotation', box: [18, 535, 720, 48],
      label: t(
        'PROPOSED  grounded flow chunks + re-observation     BASELINE  independent token action head',
        '提出方法  接地流动作块 + 再观测     基线  独立 Token 动作头',
      ),
      tone: 'green', fontSize: 25, fontWeight: 650, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-action-expert', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 18 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 14 }),
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
    makeStage(palette, 'vla-stage-input', [25, 18, 320, 42], t('A  Task evidence', 'A  任务证据'), 32),
    makeStage(palette, 'vla-stage-policy', [380, 18, 560, 42], t('B  Multimodal policy', 'B  多模态策略'), 32),
    makeStage(palette, 'vla-stage-action', [970, 18, 660, 42], t('C  Grounded flow action', 'C  接地流动作'), 32),
    makeStage(palette, 'vla-stage-execution', [25, 610, 1600, 42], t('D  Closed-loop execution evidence', 'D  闭环执行证据'), 32),
    makeImage(palette, {
      id: 'vla-camera-front', box: [30, 82, 145, 155], label: 'front RGB  oᶠₜ', imageUrl: vlaFront,
      rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-front.webp', promptRef: VLA_PROMPT_REF, fontSize: 28,
    }),
    makeImage(palette, {
      id: 'vla-camera-wrist', box: [195, 82, 145, 155], label: 'wrist RGB  oʷₜ', imageUrl: vlaWrist,
      rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-wrist.webp', promptRef: VLA_PROMPT_REF, fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-language', role: 'modality', box: [30, 275, 310, 90], label: t('Instruction ℓ', '任务指令 ℓ'),
      description: t('"place red cube in teal tray"', '“将红方块放入青色托盘”'), tone: 'amber', fontSize: 28, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-tensor', box: [30, 405, 310, 105],
      label: t('Proprioception sₜ', '本体状态 sₜ'), description: '[qₜ, q̇ₜ, gₜ] ∈ ℝ¹⁵', tone: 'blue',
      variant: 'state-vector', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [395, 105, 180, 130],
      label: t('Token fusion', 'Token 融合'), description: 'X₀=[vᶠ; vʷ; eℓ; e(sₜ)]', tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [640, 82, 260, 210],
      label: options.backbone, description: t('causal multimodal attention', '因果多模态注意力'),
      tone: 'violet', variant: 'vlm', fontSize: 30, borderWidth: 2.5,
    }),
    makeNode(palette, {
      id: 'vla-attention', role: 'annotation', kind: 'scientific-attention-map', box: [395, 360, 505, 130],
      label: t('Object-token grounding', '物体 Token 接地'), description: t('cross-view identity is shared', '跨视图共享物体身份'),
      tone: 'neutral', detail: 'detailed', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', box: [975, 85, 335, 220],
      label: t('Flow-matching action expert', '流匹配动作专家'),
      description: t('object/state cross-attention · θ_act', '物体/状态交叉注意力 · θ_act'),
      tone: 'coral', variant: 'diffusion-action', fontSize: 30, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [975, 345, 335, 72],
      label: 'c = [τ, ε, z_obj, sₜ]', description: t('flow time · noise · grounded state', '流时间 · 噪声 · 接地状态'),
      tone: 'amber', detail: 'detailed', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [975, 455, 335, 105],
      label: 'L_FM = 𝔼‖vθ(Aτ,τ,c) − (A−ε)‖²', description: t('training only', '仅训练'),
      tone: 'coral', detail: 'detailed', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1370, 85, 250, 125],
      label: t('Action chunk', '动作块'), description: 'Âₜ:ₜ₊ᴴ₋₁ · H=16 · 20 Hz', tone: 'blue',
      variant: 'action-horizon', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [1370, 260, 250, 90], label: t('Safety projection', '安全投影'),
      description: t('joint · workspace · contact', '关节 · 工作区 · 接触'), tone: 'neutral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1370, 400, 250, 100], label: t('MPC controller', 'MPC 控制器'),
      description: t('execute K=4, then replan', '执行 K=4，随后重规划'), tone: 'blue', fontSize: 28,
    }),
  );
  const frames = [
    ['vla-exec-observe', vlaFront, 't  observe', 55],
    ['vla-robot', vlaApproach, 't+4  approach', 260],
    ['vla-contact', vlaGrasp, 't+8  grasp', 465],
    ['vla-reobserve', vlaPlace, 't+12  re-observe', 670],
  ] as const;
  for (const [id, image, label, x] of frames) {
    nodes.push(makeImage(palette, {
      id, box: [x, 690, 165, 185], label, imageUrl: image, rasterWidthPx: 600, rasterHeightPx: 600,
      sourceRef: `${id}.webp`, promptRef: VLA_PROMPT_REF, fontSize: 27,
    }));
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [910, 690, 290, 175],
      label: t('Executed tool path', '执行工具轨迹'), description: 'T_base→tool(t:t+12)', tone: 'blue', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-contribution', role: 'annotation', box: [1250, 685, 370, 180],
      label: t('METHOD CONTRAST', '方法对照'),
      description: t(
        'PROPOSED: grounded flow chunks + re-observation\nBASELINE: independent token action head',
        '提出方法：接地流动作块 + 再观测\n基线：独立 Token 动作头',
      ),
      tone: 'green', fontSize: 29, fontWeight: 700,
    }),
    makeNode(palette, {
      id: 'vla-grounding-note', role: 'annotation', box: [910, 910, 710, 60],
      label: t('Synthetic scene frames · replace with experiment media before empirical use', '合成场景帧 · 实证使用前替换为实验媒体'),
      borderWidth: 0, fontSize: 25, detail: 'detailed', textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-camera-wrist', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-language', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 24 }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 24 }),
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
    makeStage(palette, 'vla-stage-input', [35, 25, 330, 55], t('A  Task state', 'A  任务状态'), 45),
    makeStage(palette, 'vla-stage-policy', [410, 25, 670, 55], t('B  Grounded flow policy', 'B  接地流策略'), 45),
    makeStage(palette, 'vla-stage-action', [1125, 25, 500, 55], t('C  Receding-horizon action', 'C  滚动时域动作'), 45),
    makeStage(palette, 'vla-stage-execution', [35, 595, 1590, 50], t('D  Re-observe and replan', 'D  再观测与重规划'), 43),
    makeImage(palette, {
      id: 'vla-camera-front', box: [45, 110, 300, 245], label: t('Observed task scene', '观测任务场景'),
      imageUrl: vlaFront, rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-front.webp', promptRef: VLA_PROMPT_REF,
      fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', kind: 'scientific-tensor', box: [45, 400, 300, 150],
      label: t('Instruction + robot state', '指令 + 机器人状态'), description: 'ℓ ; sₜ=[qₜ,q̇ₜ,gₜ]', tone: 'amber',
      variant: 'state-vector', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [430, 130, 275, 250],
      label: options.backbone, description: t('vision · language · state tokens', '视觉 · 语言 · 状态 Token'),
      tone: 'violet', variant: 'vlm', fontSize: 42, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', box: [760, 115, 310, 280],
      label: t('Grounded flow expert', '接地流专家'), description: 'L_FM = 𝔼‖vθ − u‖²',
      tone: 'coral', variant: 'diffusion-action', fontSize: 42, borderWidth: 3.2,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1140, 115, 235, 190],
      label: t('Action chunk', '动作块'), description: 'Âₜ:ₜ₊₁₅ · 20 Hz', tone: 'blue', variant: 'action-horizon', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1420, 125, 205, 230],
      label: t('Safety + MPC', '安全 + MPC'), description: t('execute 4\nthen replan', '执行 4 步\n随后重规划'),
      tone: 'blue', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-contribution', role: 'annotation', box: [430, 455, 640, 105],
      label: t('PROPOSED  actions stay object-grounded across re-observation', '提出方法  动作在再观测中保持物体接地'),
      description: t('Baseline: independent token action head', '基线：独立 Token 动作头'),
      tone: 'green', fontSize: 35, fontWeight: 700, textAlign: 'center',
    }),
    makeImage(palette, {
      id: 'vla-reobserve', box: [1115, 655, 500, 165], label: t('Execute → contact → re-observe', '执行 → 接触 → 再观测'),
      imageUrl: vlaPlace, imageFit: 'contain', rasterWidthPx: 600, rasterHeightPx: 600,
      sourceRef: 'vla-placed.webp', promptRef: VLA_PROMPT_REF, fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [430, 665, 570, 145],
      label: t('Grounded closed loop', '接地闭环'), description: 'oₜ → Âₜ:ₜ₊ᴴ → oₜ₊ᴷ', tone: 'blue', fontSize: 40,
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-expert', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-controller', target: 'vla-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'vla-trajectory', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
    makeEdge(palette, { source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'right', routeOffset: 28 }),
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
    makeStage(palette, 'wm-stage-input', [15, 10, 170, 32], t('A  Observed state', 'A  观测状态'), 27),
    makeStage(palette, 'wm-stage-model', [205, 10, 170, 32], t('B  Imagine', 'B  想象'), 27),
    makeStage(palette, 'wm-stage-futures', [395, 10, 360, 32], t('C  Counterfactual futures', 'C  反事实未来'), 27),
    makeStage(palette, 'wm-stage-verify', [15, 405, 740, 30], t('D  Act, re-observe, verify', 'D  执行、再观测、验证'), 26),
    makeImage(palette, {
      id: 'wm-observation', box: [18, 58, 150, 115], label: 'observed oₜ', imageUrl: worldCurrent, imageFit: 'contain',
      rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF, fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'token', kind: 'scientific-voxel-grid', box: [18, 205, 150, 105],
      label: t('Latent state zₜ', '潜在状态 zₜ'), description: t('scene + goal', '场景 + 目标'), tone: 'blue',
      fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [205, 78, 165, 175],
      label: options.backbone, description: 'pψ(zₜ₊₁ | zₜ,aₜ)', tone: 'violet', variant: 'world-model',
      fontSize: 25, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'wm-action-candidates', role: 'action', box: [205, 285, 165, 80],
      label: t('Candidate actions', '候选动作'), description: 'a¹:H', tone: 'blue', fontSize: 25,
    }),
    makeImage(palette, {
      id: 'wm-rollout-a', box: [395, 60, 105, 120], label: t('A  goal', 'A  达成目标'), imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, borderWidth: 2.5, fontSize: 25,
    }),
    makeImage(palette, {
      id: 'wm-rollout-b', box: [520, 60, 105, 120], label: t('B  collision', 'B  碰撞'), imageUrl: worldCollision,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-collision.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.coral.stroke, fontSize: 25,
    }),
    makeImage(palette, {
      id: 'wm-rollout-c', box: [645, 60, 105, 120], label: t('C  uncertain', 'C  不确定'), imageUrl: worldUncertain,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-uncertain.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.amber.stroke, fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [430, 225, 285, 80],
      label: t('Constrained selection', '约束选择'), description: 'arg min [C_goal + C_contact + U_epi]',
      tone: 'coral', fontSize: 25, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', box: [485, 335, 230, 55], label: t('Execute a*ₜ:ₜ₊ᴴ', '执行 a*ₜ:ₜ₊ᴴ'),
      tone: 'blue', fontSize: 25,
    }),
    makeImage(palette, {
      id: 'wm-predicted-next', box: [18, 455, 155, 95], label: 'predicted ôₜ₊₁', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [198, 455, 170, 95], label: 'L_cons = ‖Dψ(ẑₜ₊₁) − oₜ₊₁‖₁',
      description: t('verification feedback', '验证反馈'), tone: 'coral', fontSize: 25,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', box: [393, 455, 155, 95], label: 'observed oₜ₊₁', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, fontSize: 25,
    }),
    makeNode(palette, {
      id: 'wm-contribution', role: 'annotation', box: [573, 450, 177, 105],
      label: t('PROPOSED', '提出方法'), description: t('re-observe + consistency\nBASELINE: open loop', '再观测 + 一致性\n基线：开环'),
      tone: 'green', fontSize: 25, fontWeight: 700, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-observation', target: 'wm-voxel', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-action-candidates', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'wm-predicted-next', target: 'wm-error', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 18 }),
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
    makeStage(palette, 'wm-stage-input', [25, 18, 310, 42], t('A  Observed evidence', 'A  观测证据'), 32),
    makeStage(palette, 'wm-stage-model', [380, 18, 330, 42], t('B  Latent dynamics', 'B  潜在动力学'), 32),
    makeStage(palette, 'wm-stage-futures', [750, 18, 540, 42], t('C  Counterfactual futures', 'C  反事实未来'), 32),
    makeStage(palette, 'wm-stage-decision', [1330, 18, 300, 42], t('D  Plan and act', 'D  规划与执行'), 32),
    makeStage(palette, 'wm-stage-verify', [25, 570, 1600, 42], t('E  Re-observe and verify', 'E  再观测与验证'), 32),
    makeImage(palette, {
      id: 'wm-observation', box: [35, 85, 285, 155], label: 'observed RGB  oₜ', imageUrl: worldCurrent, imageFit: 'contain',
      rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF, fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-goal', role: 'modality', box: [35, 285, 285, 95], label: t('Goal g', '目标 g'),
      description: t('cube → tray', '方块 → 托盘'), tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-voxel', role: 'token', kind: 'scientific-voxel-grid', box: [390, 90, 300, 160],
      label: t('3D latent state zₜ', '3D 潜在状态 zₜ'), description: 'Eφ(oₜ, g) ∈ ℝᴺˣᴰ', tone: 'blue',
      fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-action-candidates', role: 'action', box: [390, 300, 140, 100], label: t('Actions', '动作'),
      description: 'a¹:H', tone: 'blue', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [550, 285, 140, 210],
      label: options.backbone, description: 'pψ(zₜ₊₁|zₜ,aₜ)', tone: 'violet', variant: 'world-model',
      fontSize: 28, borderWidth: 2.8,
    }),
    makeImage(palette, {
      id: 'wm-rollout-a', box: [755, 85, 165, 170], label: t('A  goal reached', 'A  达成目标'), imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, borderWidth: 2.8, fontSize: 28,
    }),
    makeImage(palette, {
      id: 'wm-rollout-b', box: [940, 85, 165, 170], label: t('B  collision', 'B  碰撞'), imageUrl: worldCollision,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-collision.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.coral.stroke, fontSize: 28,
    }),
    makeImage(palette, {
      id: 'wm-rollout-c', box: [1125, 85, 165, 170], label: t('C  occluded', 'C  遮挡'), imageUrl: worldUncertain,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-uncertain.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.amber.stroke, fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [785, 335, 470, 115],
      label: t('Constraint-aware selection', '约束感知选择'), description: 'a* = arg min [C_goal + λC_contact + μU_epi]',
      tone: 'coral', fontSize: 28, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'wm-action', role: 'action', box: [1365, 105, 245, 120], label: t('Execute plan', '执行计划'),
      description: 'a*ₜ:ₜ₊ᴴ₋₁ · K ≤ H', tone: 'blue', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-controller', role: 'environment', kind: 'scientific-robot-arm', box: [1365, 300, 245, 190],
      label: t('Robot + world', '机器人 + 世界'), description: t('physical transition', '物理状态转移'), tone: 'green',
      variant: 'execution', fontSize: 28,
    }),
    makeImage(palette, {
      id: 'wm-predicted-next', box: [120, 660, 300, 155], label: 'predicted Dψ(ẑₜ₊₁)', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [515, 680, 290, 115], label: 'L_cons = ‖Dψ(ẑₜ₊₁) − oₜ₊₁‖₁',
      description: t('verification feedback', '验证反馈'), tone: 'coral', fontSize: 28, borderWidth: 2.8,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', box: [900, 660, 300, 155], label: 'observed oₜ₊₁', imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, fontSize: 28,
    }),
    makeNode(palette, {
      id: 'wm-contribution', role: 'annotation', box: [1280, 640, 350, 195], label: t('MECHANISM CONTRAST', '机制对照'),
      description: t(
        'PROPOSED: act → observe → consistency feedback\nBASELINE: open-loop rollout only',
        '提出方法：执行 → 观测 → 一致性反馈\n基线：仅开环展开',
      ),
      tone: 'green', fontSize: 29, fontWeight: 700,
    }),
    makeNode(palette, {
      id: 'wm-synthetic-note', role: 'annotation', box: [120, 880, 1080, 60],
      label: t('Synthetic counterfactual frames · symbolic costs, not empirical results', '合成反事实帧 · 符号代价，并非实证结果'),
      borderWidth: 0, fontSize: 25, detail: 'detailed', textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-observation', target: 'wm-voxel', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-voxel', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-voxel', target: 'wm-model', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-action-candidates', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-controller', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-controller', target: 'wm-reobserve', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', routeSide: 'right', routeOffset: 24 }),
    makeEdge(palette, { source: 'wm-predicted-next', target: 'wm-error', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'left', routeOffset: 26 }),
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
    makeStage(palette, 'wm-stage-input', [35, 25, 300, 55], t('A  Observe', 'A  观测'), 45),
    makeStage(palette, 'wm-stage-model', [395, 25, 330, 55], t('B  Imagine', 'B  想象'), 45),
    makeStage(palette, 'wm-stage-futures', [785, 25, 610, 55], t('C  Compare futures', 'C  比较未来'), 45),
    makeStage(palette, 'wm-stage-decision', [1415, 25, 210, 55], t('D  Verify', 'D  验证'), 45),
    makeImage(palette, {
      id: 'wm-observation', box: [45, 115, 295, 245], label: t('Observed state oₜ', '观测状态 oₜ'),
      imageUrl: worldCurrent, imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160,
      sourceRef: 'world-current.webp', promptRef: WORLD_PROMPT_REF, fontSize: 40,
    }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [410, 115, 300, 245],
      label: options.backbone, description: 'ẑₜ₊₁ ∼ pψ(·|zₜ,aₜ)', tone: 'violet', variant: 'world-model',
      fontSize: 42, borderWidth: 3,
    }),
    makeImage(palette, {
      id: 'wm-rollout-a', box: [790, 115, 185, 205], label: t('A  goal', 'A  目标'), imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, borderWidth: 3, fontSize: 40,
    }),
    makeImage(palette, {
      id: 'wm-rollout-b', box: [995, 115, 185, 205], label: t('B  collision', 'B  碰撞'), imageUrl: worldCollision,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-collision.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.coral.stroke, fontSize: 40,
    }),
    makeImage(palette, {
      id: 'wm-rollout-c', box: [1200, 115, 185, 205], label: t('C  uncertain', 'C  不确定'), imageUrl: worldUncertain,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-uncertain.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.amber.stroke, fontSize: 40,
    }),
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', box: [825, 390, 520, 150], label: t('Constraint-aware plan', '约束感知规划'),
      description: 'a* = arg min [C_goal + λC_contact + μU_epi]', tone: 'coral', fontSize: 40, borderWidth: 3,
    }),
    makeImage(palette, {
      id: 'wm-reobserve', box: [1420, 115, 205, 245], label: t('Re-observe oₜ₊₁', '再观测 oₜ₊₁'), imageUrl: worldActual,
      imageFit: 'contain', rasterWidthPx: 960, rasterHeightPx: 160, sourceRef: 'world-actual.webp', promptRef: WORLD_PROMPT_REF,
      stroke: palette.tones.green.stroke, fontSize: 40,
    }),
    makeNode(palette, {
      id: 'wm-error', role: 'loss', box: [1405, 410, 225, 130], label: t('Verify', '验证'),
      description: '‖ôₜ₊₁ − oₜ₊₁‖₁', tone: 'coral', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'wm-contribution', role: 'annotation', box: [45, 650, 1580, 150], label: t(
        'PROPOSED  act → re-observe → consistency feedback     BASELINE  open-loop rollout only',
        '提出方法  执行 → 再观测 → 一致性反馈     基线  仅开环展开',
      ),
      description: t('Synthetic futures are hypotheses, not empirical results.', '合成未来是方法假设，并非实证结果。'),
      tone: 'green', fontSize: 35, fontWeight: 700, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-observation', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-decision', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-reobserve', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'feedback' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-model', sourceHandle: 'left', targetHandle: 'bottom', semantic: 'feedback', lineStyle: 'dashed', routeSide: 'bottom-right', routeOffset: 30 }),
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
    makeStage(palette, 'lt-stage-evidence', [15, 10, 165, 32], t('A  Evidence', 'A  偏好证据'), 27),
    makeStage(palette, 'lt-stage-reference', [195, 10, 175, 32], t('B  Reference', 'B  参考策略'), 27),
    makeStage(palette, 'lt-stage-alignment', [395, 10, 360, 32], t('C  Alignment alternatives', 'C  对齐替代路线'), 27),
    makeStage(palette, 'lt-stage-deploy', [15, 410, 740, 30], t('D  Select and deploy', 'D  选择与部署'), 26),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-token-strip', box: [20, 60, 150, 125],
      label: t('Preference pair', '偏好对'), description: 'x ; y_w ≻ y_l', tone: 'amber', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [20, 220, 150, 90],
      label: t('SFT data', 'SFT 数据'), description: '(x, y*)', tone: 'blue', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', box: [205, 58, 150, 82], label: options.backbone,
      description: 'π₀', tone: 'violet', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [205, 175, 150, 72], label: 'L_SFT = −log π(y*|x)',
      tone: 'coral', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', box: [205, 280, 150, 88], label: t('Reference policy', '参考策略'),
      description: 'π_ref', tone: 'blue', variant: 'checkpoint', fontSize: 25,
    }),
    makeJunction(palette, 'lt-alignment-split', [375, 195, 28, 28]),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', box: [420, 58, 145, 120], label: t('PROPOSED DPO', '提出 DPO'),
      description: '−𝔼 log σ{β[Δlogπθ−Δlogπref]}', tone: 'coral', fontSize: 25, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', box: [595, 70, 140, 92], label: t('DPO policy', 'DPO 策略'),
      description: t('offline · no RM', '离线 · 无 RM'), tone: 'green', variant: 'checkpoint', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [420, 235, 145, 120], label: t('BASELINE RLHF', '基线 RLHF'),
      description: 'reward model + rollout + PPO', tone: 'violet', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [595, 247, 140, 92], label: t('RLHF policy', 'RLHF 策略'),
      description: t('on-policy', '在线采样'), tone: 'violet', variant: 'checkpoint', fontSize: 25,
    }),
    makeJunction(palette, 'lt-alignment-merge', [340, 475, 30, 30]),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [405, 450, 175, 90], label: t('Selected policy π*', '选定策略 π*'),
      description: t('paper states chosen path', '论文声明所选路线'), tone: 'ink', variant: 'aligned-model', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [610, 450, 130, 90], label: t('Release gate', '发布门'),
      description: t('held-out eval', '留出评测'), tone: 'green', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'lt-mechanism-contract', role: 'annotation', box: [20, 555, 720, 30],
      label: t('DPO: offline direct update     RM+PPO: fitted reward + on-policy rollout', 'DPO：离线直接更新     RM+PPO：拟合奖励 + 在线采样'),
      borderWidth: 0, fontSize: 25, fontWeight: 650, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-objective', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-alignment-split', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-sft-model', target: 'lt-alignment-split', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-alignment-split', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left' }),
    makeEdge(palette, { source: 'lt-alignment-split', target: 'lt-rlhf-objective', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-rlhf-checkpoint', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-dpo-checkpoint', target: 'lt-alignment-merge', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-rlhf-checkpoint', target: 'lt-alignment-merge', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-alignment-merge', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
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
    makeStage(palette, 'lt-stage-evidence', [25, 18, 300, 42], t('A  Preference evidence', 'A  偏好证据'), 32),
    makeStage(palette, 'lt-stage-reference', [365, 18, 290, 42], t('B  Shared reference', 'B  共享参考策略'), 32),
    makeStage(palette, 'lt-stage-dpo', [700, 18, 480, 42], t('C  PROPOSED · direct preference update', 'C  提出方法 · 直接偏好更新'), 32),
    makeStage(palette, 'lt-stage-rlhf', [700, 505, 480, 42], t('D  BASELINE · reward model + PPO', 'D  基线 · 奖励模型 + PPO'), 32),
    makeStage(palette, 'lt-stage-deploy', [1220, 18, 410, 42], t('E  Contract and inference', 'E  契约与推理'), 32),
    makeNode(palette, {
      id: 'lt-prompt-sample', role: 'modality', box: [35, 85, 270, 80], label: 'Prompt x',
      description: t('"Why does ice float?"', '“冰为什么会浮？”'), tone: 'blue', fontSize: 28, textAlign: 'left',
    }),
    makeNode(palette, {
      id: 'lt-chosen-response', role: 'modality', box: [35, 205, 125, 110], label: t('Chosen y_w', '优选 y_w'),
      description: t('clear + correct', '清晰 + 正确'), tone: 'green', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-rejected-response', role: 'modality', box: [180, 205, 125, 110], label: t('Rejected y_l', '拒选 y_l'),
      description: t('vague', '含糊'), tone: 'coral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'token', kind: 'scientific-token-strip', box: [65, 365, 240, 110],
      label: t('Preference pair', '偏好对'), description: 'D_pref={(x,y_w,y_l)}', tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-base-model', role: 'backbone', box: [390, 85, 240, 105], label: options.backbone,
      description: 'π₀', tone: 'violet', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'lt-instruction-data', role: 'modality', box: [390, 235, 240, 90], label: t('Instruction data', '指令数据'),
      description: '(x,y*)', tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-sft-objective', role: 'loss', box: [390, 370, 240, 85], label: 'L_SFT = −log π(y*|x)',
      tone: 'coral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', box: [390, 500, 240, 115], label: t('Reference policy', '参考策略'),
      description: 'π_ref · frozen in alignment', tone: 'blue', variant: 'checkpoint', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', box: [725, 90, 430, 145], label: 'L_DPO = −𝔼 log σ{β[Δlogπθ − Δlogπref]}',
      description: t('offline preference pair · direct policy gradient', '离线偏好对 · 直接策略梯度'), tone: 'coral', fontSize: 28, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'lt-implicit-reward', role: 'annotation', box: [725, 285, 205, 110],
      label: 'r̂θ(x,y)=β log[πθ(y|x)/π_ref(y|x)]', tone: 'neutral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-dpo-checkpoint', role: 'policy', box: [950, 285, 205, 110], label: t('DPO policy πθ', 'DPO 策略 πθ'),
      description: t('no RM · no rollout', '无 RM · 无在线采样'), tone: 'green', variant: 'checkpoint', fontSize: 28, borderWidth: 2.8,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [725, 570, 205, 110], label: 'L_RM = −log σ[rφ(y_w)−rφ(y_l)]',
      tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'lt-reward-model', role: 'policy', box: [950, 570, 205, 110], label: t('Reward model rφ', '奖励模型 rφ'),
      description: t('separate fit', '独立拟合'), tone: 'violet', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-ppo-loop', role: 'policy', box: [725, 735, 205, 110], label: t('Sample → score → PPO', '采样 → 评分 → PPO'),
      description: 'KL(πθ‖π_ref)', tone: 'blue', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-checkpoint', role: 'policy', box: [950, 735, 205, 110], label: t('RLHF policy πθ', 'RLHF 策略 πθ'),
      description: t('on-policy rollout', '在线采样'), tone: 'violet', variant: 'checkpoint', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-mechanism-contract', role: 'annotation', box: [1240, 85, 370, 180], label: t('MECHANISM CONTRACT', '机制契约'),
      description: t('DPO: offline · direct · no RM\nRLHF: reward model · rollout · PPO', 'DPO：离线 · 直接 · 无 RM\nRLHF：奖励模型 · 在线采样 · PPO'),
      tone: 'neutral', fontSize: 29, fontWeight: 700,
    }),
    makeJunction(palette, 'lt-alignment-merge', [1390, 315, 48, 48]),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1290, 405, 270, 135], label: t('Selected aligned policy π*', '选定对齐策略 π*'),
      description: t('paper states chosen path', '论文声明所选路线'), tone: 'ink', variant: 'aligned-model', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'lt-inference-prompt', role: 'modality', box: [1235, 610, 160, 105], label: "Prompt x'",
      description: t('held-out', '留出输入'), tone: 'blue', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-response', role: 'action', box: [1450, 610, 160, 105], label: "y∼π*(·|x')",
      description: t('inference only', '仅推理'), tone: 'green', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [1290, 790, 270, 95], label: t('Release gate', '发布门'),
      description: t('held-out capability + safety', '留出能力 + 安全评测'), tone: 'green', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'lt-caption-contract', role: 'annotation', box: [1225, 925, 400, 50],
      label: t('Solid: data/inference   Dashed: optimization   Dotted: baseline', '实线：数据/推理   虚线：优化   点线：基线'),
      borderWidth: 0, detail: 'detailed', fontSize: 25, textAlign: 'center',
    }),
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

function llmPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const t = (en: string, zh: string) => localized(options, en, zh);
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-evidence', [35, 25, 320, 55], t('A  Preference evidence', 'A  偏好证据'), 45),
    makeStage(palette, 'lt-stage-reference', [405, 25, 320, 55], t('B  Reference policy', 'B  参考策略'), 45),
    makeStage(palette, 'lt-stage-alignment', [775, 25, 430, 55], t('C  Alignment alternatives', 'C  对齐替代路线'), 45),
    makeStage(palette, 'lt-stage-deploy', [1245, 25, 380, 55], t('D  Select and deploy', 'D  选择与部署'), 45),
    makeNode(palette, {
      id: 'lt-preference-data', role: 'modality', kind: 'scientific-token-strip', box: [45, 120, 300, 225],
      label: t('Preference pair', '偏好对'), description: 'x ; y_w ≻ y_l', tone: 'amber', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'lt-sft-model', role: 'backbone', kind: 'scientific-transformer', box: [420, 120, 290, 225],
      label: t('SFT reference π_ref', 'SFT 参考策略 π_ref'), description: 'L_SFT = −log π(y*|x)', tone: 'blue',
      variant: 'checkpoint', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', box: [790, 105, 390, 210], label: t('PROPOSED · DPO', '提出方法 · DPO'),
      description: t('offline pair → direct policy update\nno reward model · no rollout', '离线偏好对 → 直接策略更新\n无奖励模型 · 无在线采样'),
      tone: 'coral', fontSize: 40, borderWidth: 3.2,
    }),
    makeNode(palette, {
      id: 'lt-rlhf-objective', role: 'loss', box: [790, 395, 390, 210], label: t('BASELINE · RM + PPO', '基线 · RM + PPO'),
      description: t('fit reward → sample → score → PPO', '拟合奖励 → 采样 → 评分 → PPO'),
      tone: 'violet', fontSize: 40,
    }),
    makeJunction(palette, 'lt-alignment-merge', [1210, 335, 54, 54]),
    makeNode(palette, {
      id: 'lt-deploy-model', role: 'backbone', box: [1300, 165, 280, 190], label: t('Selected policy π*', '选定策略 π*'),
      description: t('paper states chosen path', '论文声明所选路线'), tone: 'ink', variant: 'aligned-model', fontSize: 42,
    }),
    makeNode(palette, {
      id: 'lt-release-gate', role: 'action', box: [1300, 445, 280, 170], label: t('Inference + release gate', '推理 + 发布门'),
      description: t('held-out capability and safety', '留出能力与安全评测'), tone: 'green', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'lt-mechanism-contract', role: 'annotation', box: [45, 690, 1535, 120],
      label: t('DPO removes the separate reward-model fit and on-policy rollout used by RM+PPO.', 'DPO 移除了 RM+PPO 所需的独立奖励模型拟合与在线采样。'),
      description: t('Solid: data/inference     Dashed: optimization     Dotted: baseline', '实线：数据/推理     虚线：优化     点线：基线'),
      tone: 'green', fontSize: 35, fontWeight: 700, textAlign: 'center',
    }),
  );
  const edges: FlowEdge[] = [
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
