import vlaApproach from '../assets/scientific/vla-approach-print.jpg?inline';
import vlaGrasp from '../assets/scientific/vla-grasp-print.jpg?inline';
import vlaObserve from '../assets/scientific/vla-observe-print.jpg?inline';
import vlaPlace from '../assets/scientific/vla-place-print.jpg?inline';
import worldCollision from '../assets/scientific/world-collision-print.jpg?inline';
import worldCurrent from '../assets/scientific/world-observed-print.jpg?inline';
import worldSuccess from '../assets/scientific/world-success-print.jpg?inline';
import worldUncertain from '../assets/scientific/world-occluded-print.jpg?inline';
import type {
  FlowEdge,
  FlowNode,
  ScientificProvenance,
  ScientificSchematicLayout,
  ScientificSchematicOptions,
  ScientificSchematicRole,
  ShapeKind,
} from '../types';
import {
  buildTopVenueFlagship as buildPreviousFlagship,
  dimensionsFor,
  makeEdge,
  makeImage,
  makeNode,
  makeRoot,
  makeStage,
  paletteFor,
  type Box,
  type FlagshipPalette,
  type PublicationFlagshipBlueprint,
  type Tone,
} from './scientificFlagshipsV3';

/*
 * Generation five deliberately treats whitespace as routing infrastructure.
 * Each flagship has one primary reading path, one reserved feedback lane, and
 * no labels attached to connectors. This keeps the SVG, canvas, and PDF in
 * agreement while leaving every component independently editable.
 */

const VLA_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#vla-storyboard';
const WORLD_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#world-model-counterfactuals';

interface ModuleInput {
  id: string;
  role: ScientificSchematicRole;
  box: Box;
  label: string;
  description?: string;
  tone?: Tone;
  kind?: ShapeKind;
  fontSize?: number;
  fontWeight?: number;
  borderWidth?: number;
  variant?: FlowNode['data']['scientificVariant'];
  detail?: FlowNode['data']['schematicDetail'];
  textPaddingX?: number;
  textPaddingY?: number;
  textAlign?: 'left' | 'center' | 'right';
}

type EdgeInput = Omit<Parameters<typeof makeEdge>[1], 'source' | 'target'>;

interface SemanticEdgeSpec extends EdgeInput {
  source: string;
  target: string;
}

function moduleNode(palette: FlagshipPalette, input: ModuleInput): FlowNode {
  return makeNode(palette, {
    ...input,
    tone: input.tone ?? 'neutral',
    kind: input.kind ?? 'rounded-rectangle',
    detail: input.detail ?? 'compact',
    fontSize: input.fontSize ?? 28,
    fontWeight: input.fontWeight,
    borderWidth: input.borderWidth ?? 2.2,
    textPaddingX: input.textPaddingX ?? 6,
    textPaddingY: input.textPaddingY ?? 5,
  });
}

function imageNode(
  palette: FlagshipPalette,
  input: Omit<ModuleInput, 'kind'> & {
    imageUrl: string;
    sourceRef: string;
    promptRef: string;
    imageFit?: FlowNode['data']['imageFit'];
    rasterWidthPx?: number;
    rasterHeightPx?: number;
  },
): FlowNode {
  return makeImage(palette, {
    ...input,
    imageUrl: input.imageUrl,
    imageFit: input.imageFit ?? 'cover',
    // These assets are the checked 800 x 1200 publication variants. Keep
    // their intrinsic dimensions with the editable image node for DPI audit.
    rasterWidthPx: input.rasterWidthPx ?? 800,
    rasterHeightPx: input.rasterHeightPx ?? 1200,
    sourceRef: input.sourceRef,
    promptRef: input.promptRef,
    fontSize: input.fontSize ?? 20,
    borderWidth: input.borderWidth ?? 2,
  });
}

function stageNode(palette: FlagshipPalette, id: string, box: Box, label: string, fontSize: number): FlowNode {
  return makeStage(palette, id, box, label, fontSize);
}

function formulaCaption(
  palette: FlagshipPalette,
  id: string,
  box: Box,
  label: string,
  fontSize: number,
  fontWeight = 520,
): FlowNode {
  return makeNode(palette, {
    id,
    role: 'annotation',
    box,
    label,
    fill: 'transparent',
    stroke: 'none',
    borderWidth: 0,
    fontSize,
    fontWeight,
    textAlign: 'center',
    textPaddingX: 1,
    textPaddingY: 0,
  });
}

function sectionPanel(palette: FlagshipPalette, id: string, box: Box, tone: Tone): FlowNode {
  const monochrome = palette.ink === '#111111';
  const fill = monochrome
    ? '#FAFAFA'
    : tone === 'coral'
      ? '#FFF8F6'
      : tone === 'violet'
        ? '#FAF8FC'
        : '#F7F9FA';
  return makeNode(palette, {
    id,
    role: 'frame',
    box,
    label: '',
    kind: 'rectangle',
    fill,
    stroke: 'none',
    borderWidth: 0,
    radius: 4,
    zIndex: -15,
  });
}

function edge(
  palette: FlagshipPalette,
  source: string,
  target: string,
  input: EdgeInput = {},
): FlowEdge {
  return makeEdge(palette, {
    source,
    target,
    routing: 'straight',
    ...input,
  });
}

function contractEdges(
  palette: FlagshipPalette,
  contract: readonly SemanticEdgeSpec[],
  overrides: Readonly<Record<string, EdgeInput>>,
): FlowEdge[] {
  return contract.map(({ source, target, ...base }) => edge(
    palette,
    source,
    target,
    { ...base, ...overrides[`${source}->${target}`] },
  ));
}

function root(
  palette: FlagshipPalette,
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: ScientificSchematicLayout,
): { nodes: FlowNode[]; width: number; height: number } {
  const { width, height } = dimensionsFor(layout);
  return { nodes: [makeRoot(palette, options, provenance, width, height)], width, height };
}

function wideMetrics(layout: Extract<ScientificSchematicLayout, 'double-column' | 'presentation'>) {
  const double = layout === 'double-column';
  return {
    double,
    stageY: double ? 42 : 24,
    panelY: double ? 124 : 100,
    contentY: double ? 174 : 150,
    panelHeight: double ? 590 : 450,
    feedbackY: double ? 808 : 620,
    footerY: double ? 920 : 766,
    stageSize: double ? 35 : 34,
    moduleSize: double ? 29 : 28,
  };
}

export const FLAGSHIP_SEMANTIC_NODE_IDS = {
  'vla-policy': [
    'vla-observation', 'vla-task', 'vla-state', 'vla-tokens', 'vla-backbone',
    'vla-object', 'vla-constraints', 'vla-policy', 'vla-action', 'vla-integrator',
    'vla-execution', 'vla-trajectory', 'vla-rollout-a', 'vla-rollout-b', 'vla-rollout-c',
    'vla-feedback-note',
  ],
  'world-model-rollout': [
    'wm-scene', 'wm-goal', 'wm-encode', 'wm-latent', 'wm-actions', 'wm-model', 'wm-rollout',
    'wm-rollout-hub', 'wm-rollout-safe', 'wm-rollout-contact', 'wm-rollout-uncertain', 'wm-score',
    'wm-action', 'wm-execute', 'wm-residual', 'wm-update',
  ],
  'llm-training-pipeline': [
    'llm-base', 'llm-data', 'llm-sft', 'llm-prompt', 'llm-pair', 'llm-objective',
    'llm-objective-title', 'llm-ratio-positive', 'llm-ratio-negative', 'llm-loss-formula',
    'llm-policy', 'llm-suite', 'llm-gate', 'llm-rm', 'llm-rollout', 'llm-ppo',
  ],
} as const;

const VLA_EDGE_CONTRACT = [
  { source: 'vla-observation', target: 'vla-tokens', semantic: 'data' },
  { source: 'vla-task', target: 'vla-tokens', semantic: 'data' },
  { source: 'vla-state', target: 'vla-tokens', semantic: 'data' },
  { source: 'vla-tokens', target: 'vla-backbone', semantic: 'data' },
  { source: 'vla-backbone', target: 'vla-object', semantic: 'control' },
  { source: 'vla-object', target: 'vla-policy', semantic: 'control' },
  { source: 'vla-constraints', target: 'vla-policy', semantic: 'data' },
  { source: 'vla-policy', target: 'vla-action', semantic: 'control' },
  { source: 'vla-action', target: 'vla-integrator', semantic: 'control' },
  { source: 'vla-integrator', target: 'vla-execution', semantic: 'temporal' },
  { source: 'vla-execution', target: 'vla-trajectory', semantic: 'temporal' },
  { source: 'vla-execution', target: 'vla-rollout-a', semantic: 'temporal' },
  { source: 'vla-rollout-a', target: 'vla-rollout-b', semantic: 'temporal' },
  { source: 'vla-rollout-b', target: 'vla-rollout-c', semantic: 'temporal' },
  { source: 'vla-rollout-c', target: 'vla-feedback-note', semantic: 'feedback', lineStyle: 'dashed' },
  { source: 'vla-feedback-note', target: 'vla-observation', semantic: 'feedback', lineStyle: 'dashed' },
] as const satisfies readonly SemanticEdgeSpec[];

const WORLD_EDGE_CONTRACT = [
  { source: 'wm-scene', target: 'wm-encode', semantic: 'data' },
  { source: 'wm-goal', target: 'wm-actions', semantic: 'control' },
  { source: 'wm-encode', target: 'wm-latent', semantic: 'data' },
  { source: 'wm-latent', target: 'wm-model', semantic: 'control' },
  { source: 'wm-actions', target: 'wm-model', semantic: 'control' },
  { source: 'wm-model', target: 'wm-rollout', semantic: 'control' },
  { source: 'wm-rollout', target: 'wm-rollout-hub', semantic: 'broadcast' },
  { source: 'wm-rollout-hub', target: 'wm-rollout-safe', semantic: 'broadcast' },
  { source: 'wm-rollout-hub', target: 'wm-rollout-contact', semantic: 'broadcast' },
  { source: 'wm-rollout-hub', target: 'wm-rollout-uncertain', semantic: 'broadcast' },
  { source: 'wm-rollout-safe', target: 'wm-score', semantic: 'control' },
  { source: 'wm-rollout-contact', target: 'wm-score', semantic: 'control' },
  { source: 'wm-rollout-uncertain', target: 'wm-score', semantic: 'control' },
  { source: 'wm-score', target: 'wm-action', semantic: 'control' },
  { source: 'wm-score', target: 'wm-residual', semantic: 'data' },
  { source: 'wm-action', target: 'wm-execute', semantic: 'temporal' },
  { source: 'wm-execute', target: 'wm-residual', semantic: 'feedback', lineStyle: 'dashed' },
  { source: 'wm-residual', target: 'wm-update', semantic: 'feedback', lineStyle: 'dashed' },
] as const satisfies readonly SemanticEdgeSpec[];

const LLM_EDGE_CONTRACT = [
  { source: 'llm-base', target: 'llm-sft', semantic: 'temporal' },
  { source: 'llm-data', target: 'llm-sft', semantic: 'data' },
  { source: 'llm-sft', target: 'llm-objective', semantic: 'control' },
  { source: 'llm-prompt', target: 'llm-pair', semantic: 'data' },
  { source: 'llm-pair', target: 'llm-objective', semantic: 'control' },
  { source: 'llm-objective', target: 'llm-policy', semantic: 'gradient' },
  { source: 'llm-policy', target: 'llm-suite', semantic: 'temporal' },
  { source: 'llm-suite', target: 'llm-gate', semantic: 'data' },
  { source: 'llm-sft', target: 'llm-rollout', semantic: 'optional', lineStyle: 'dotted' },
  { source: 'llm-rm', target: 'llm-ppo', semantic: 'optional', lineStyle: 'dotted' },
  { source: 'llm-rollout', target: 'llm-ppo', semantic: 'optional', lineStyle: 'dotted' },
  { source: 'llm-ppo', target: 'llm-policy', semantic: 'optional', lineStyle: 'dotted' },
] as const satisfies readonly SemanticEdgeSpec[];

export const FLAGSHIP_SEMANTIC_EDGE_PAIRS = {
  'vla-policy': VLA_EDGE_CONTRACT.map(({ source, target }) => `${source}->${target}`),
  'world-model-rollout': WORLD_EDGE_CONTRACT.map(({ source, target }) => `${source}->${target}`),
  'llm-training-pipeline': LLM_EDGE_CONTRACT.map(({ source, target }) => `${source}->${target}`),
} as const;

function vlaSingle(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { nodes, width, height } = root(palette, options, provenance, 'single-column');
  nodes.push(
    stageNode(palette, 'vla-01', [20, 14, 150, 44], 'A  Context', 27),
    stageNode(palette, 'vla-02', [205, 14, 165, 44], 'B  Encode', 27),
    stageNode(palette, 'vla-03', [380, 14, 200, 44], 'C  Policy', 27),
    stageNode(palette, 'vla-04', [600, 14, 150, 44], 'D  Execute', 24),
    sectionPanel(palette, 'vla-contribution-panel', [213, 68, 375, 298], 'neutral'),
    imageNode(palette, {
      id: 'vla-observation', role: 'environment', box: [20, 78, 150, 100], label: 'RGB-D oₜ',
      imageUrl: vlaObserve, sourceRef: 'vla-observe-print.jpg', promptRef: VLA_PROMPT_REF,
      fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-task', role: 'modality', box: [20, 190, 200, 76], label: 'Task', description: 'cube→tray', tone: 'amber', fontSize: 21, textPaddingX: 12,
    }),
    moduleNode(palette, {
      id: 'vla-state', role: 'modality', box: [20, 280, 150, 56], label: 'State sₜ', tone: 'neutral', fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-tokens', role: 'token', kind: 'scientific-token-strip', box: [225, 78, 150, 84], label: 'Tokens', tone: 'amber', fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [225, 178, 150, 94], label: 'VLM encoder', tone: 'violet', fontSize: 25,
    }),
    moduleNode(palette, {
      id: 'vla-object', role: 'token', kind: 'scientific-attention-map', box: [225, 288, 150, 68], label: 'Object zₜ', tone: 'neutral', fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-constraints', role: 'token', box: [395, 78, 185, 56], label: 'Safety', tone: 'neutral', fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-policy', role: 'policy', kind: 'scientific-layer-stack', box: [390, 140, 190, 108],
      label: 'Flow policy', description: 'vθ(aτ|cₜ,τ)', tone: 'coral', fontSize: 29, borderWidth: 3,
    }),
    moduleNode(palette, {
      id: 'vla-action', role: 'action', kind: 'scientific-action-chunk', box: [395, 256, 185, 110],
      label: 'Aₜ ∈ ℝᴴˣ⁷', description: 'H-step chunk', tone: 'blue', variant: 'action-horizon', fontSize: 25,
    }),
    moduleNode(palette, {
      id: 'vla-integrator', role: 'policy', box: [610, 78, 140, 56], label: 'MPC', tone: 'blue', fontSize: 27,
    }),
    imageNode(palette, {
      id: 'vla-execution', role: 'environment', box: [610, 150, 140, 108], label: 'Execute',
      imageUrl: vlaApproach, sourceRef: 'vla-approach-print.jpg', promptRef: VLA_PROMPT_REF,
      fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [610, 278, 140, 78], label: 'TCP path', tone: 'blue', fontSize: 27,
    }),
    stageNode(palette, 'vla-05', [20, 382, 210, 42], 'E  Closed loop', 27),
    imageNode(palette, {
      id: 'vla-rollout-a', role: 'environment', box: [570, 438, 130, 92], label: 't',
      imageUrl: vlaObserve, sourceRef: 'vla-observe-print.jpg', promptRef: VLA_PROMPT_REF,
      fontSize: 27,
    }),
    imageNode(palette, {
      id: 'vla-rollout-b', role: 'environment', box: [390, 438, 130, 92], label: 't + 4',
      imageUrl: vlaGrasp, sourceRef: 'vla-grasp-print.jpg', promptRef: VLA_PROMPT_REF,
      fontSize: 27,
    }),
    imageNode(palette, {
      id: 'vla-rollout-c', role: 'environment', box: [210, 438, 130, 92], label: 't + 8',
      imageUrl: vlaPlace, sourceRef: 'vla-place-print.jpg', promptRef: VLA_PROMPT_REF,
      fontSize: 27,
    }),
    moduleNode(palette, {
      id: 'vla-feedback-note', role: 'annotation', box: [20, 458, 160, 52], label: 'oₜ₊₁', tone: 'coral', fontSize: 27, textAlign: 'center',
    }),
  );

  const edges = contractEdges(palette, VLA_EDGE_CONTRACT, {
    'vla-observation->vla-tokens': { sourceHandle: 'right', targetHandle: 'left', targetAnchorOffset: { dx: 0, dy: -22 } },
    'vla-task->vla-tokens': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [
        { origin: 'source', dx: 4, dy: 0 },
        { origin: 'target', dx: -1, dy: 0 },
      ],
    },
    'vla-state->vla-tokens': {
      sourceHandle: 'right', targetHandle: 'left', targetAnchorOffset: { dx: 0, dy: 22 },
      routeWaypoints: [
        { origin: 'source', dx: 52, dy: 0 },
        { origin: 'target', dx: -3, dy: 0 },
      ],
    },
    'vla-tokens->vla-backbone': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-backbone->vla-object': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-object->vla-policy': {
      sourceHandle: 'right', targetHandle: 'left', targetAnchorOffset: { dx: 0, dy: -30 },
      routeWaypoints: [{ origin: 'source', dx: 6, dy: 0 }, { origin: 'target', dx: -14, dy: 0 }],
    },
    'vla-constraints->vla-policy': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-policy->vla-action': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-action->vla-integrator': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [{ origin: 'source', dx: 10, dy: 0 }, { origin: 'target', dx: -10, dy: 0 }],
    },
    'vla-integrator->vla-execution': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-execution->vla-trajectory': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-execution->vla-rollout-a': {
      sourceHandle: 'right', targetHandle: 'top',
      routeWaypoints: [
        { origin: 'source', dx: 10, dy: 0 },
        { origin: 'target', dx: 125, dy: -20 },
        { origin: 'target', dx: 0, dy: -20 },
      ],
    },
    'vla-rollout-a->vla-rollout-b': { sourceHandle: 'left', targetHandle: 'right' },
    'vla-rollout-b->vla-rollout-c': { sourceHandle: 'left', targetHandle: 'right' },
    'vla-rollout-c->vla-feedback-note': {
      sourceHandle: 'left', targetHandle: 'right', width: 1.8,
      routeWaypoints: [{ origin: 'source', dx: -10, dy: 0 }, { origin: 'target', dx: 10, dy: 0 }],
    },
    'vla-feedback-note->vla-observation': {
      sourceHandle: 'left', targetHandle: 'left', width: 1.8,
      routeWaypoints: [
        { origin: 'source', dx: -18, dy: 0 },
        { origin: 'target', dx: -18, dy: 350 },
        { origin: 'target', dx: -18, dy: 0 },
      ],
    },
  });
  return { nodes, edges, width, height };
}

function vlaWide(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: Extract<ScientificSchematicLayout, 'double-column' | 'presentation'>,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { nodes, width, height } = root(palette, options, provenance, layout);
  const m = wideMetrics(layout);
  const y = m.contentY;
  const tall = layout === 'double-column';
  const observationHeight = tall ? 176 : 154;
  const taskOffset = tall ? 214 : 184;
  const stateOffset = tall ? 330 : 286;
  const stateNodeOffset = tall ? stateOffset : stateOffset + 10;
  const backboneHeight = tall ? 180 : 160;
  const objectOffset = tall ? 220 : 190;
  const policyOffset = tall ? 122 : 110;
  const rolloutY = tall ? 730 : 620;
  const rolloutHeight = tall ? 110 : 88;
  const feedbackNoteHeight = tall ? 42 : 48;
  const feedbackNoteY = rolloutY + (rolloutHeight - feedbackNoteHeight) / 2;
  nodes.push(
    stageNode(palette, 'vla-01', [40, m.stageY, 250, 62], 'A  Context', m.stageSize),
    stageNode(palette, 'vla-02', [350, m.stageY, 380, 62], 'B  Encode', m.stageSize),
    stageNode(palette, 'vla-03', [760, m.stageY, 540, 62], 'C  Flow policy', m.stageSize),
    stageNode(palette, 'vla-04', [1320, m.stageY, 300, 62], 'D  Execute', m.stageSize),
    sectionPanel(palette, 'vla-contribution-panel', [330, y - 22, 970, tall ? 470 : 390], 'neutral'),
    imageNode(palette, {
      id: 'vla-observation', role: 'environment', box: [40, y, 250, observationHeight], label: 'RGB-D oₜ',
      imageUrl: vlaObserve, sourceRef: 'vla-observe-print.jpg', promptRef: VLA_PROMPT_REF, fontSize: 24,
    }),
    moduleNode(palette, {
      id: 'vla-task', role: 'modality', box: [40, y + taskOffset, 250, tall ? 90 : 102], label: 'Task', description: 'cube → tray', tone: 'amber', fontSize: 25,
    }),
    moduleNode(palette, {
      id: 'vla-state', role: 'modality', box: [40, y + stateNodeOffset, 250, tall ? 72 : 66], label: 'State sₜ', tone: 'neutral', fontSize: 24,
    }),
    moduleNode(palette, {
      id: 'vla-tokens', role: 'token', kind: 'scientific-token-strip', box: [360, y + 10, 180, tall ? 140 : 120], label: 'Tokens', tone: 'amber', fontSize: 24,
    }),
    moduleNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [570, y + 10, 230, backboneHeight], label: 'VLM encoder', tone: 'violet', fontSize: 26,
    }),
    moduleNode(palette, {
      id: 'vla-object', role: 'token', kind: 'scientific-attention-map', box: [570, y + objectOffset, 230, tall ? 112 : 96], label: 'Object zₜ', tone: 'neutral', fontSize: 24,
    }),
    moduleNode(palette, {
      id: 'vla-policy', role: 'policy', kind: 'scientific-layer-stack', box: [825, y + policyOffset, 215, tall ? 200 : 180],
      label: 'Flow policy', description: 'vθ(aτ|cₜ,τ)', tone: 'coral', fontSize: m.moduleSize, borderWidth: 3.4,
    }),
    moduleNode(palette, {
      id: 'vla-action', role: 'action', kind: 'scientific-action-chunk', box: [1055, y + policyOffset + 10, 235, tall ? 160 : 146],
      label: 'Plan Aₜ', description: 'Aₜ∈ℝᴴˣ⁷\nH-step chunk', tone: 'blue', variant: 'action-horizon', fontSize: 22,
    }),
    moduleNode(palette, {
      id: 'vla-constraints', role: 'token', box: [825, y + 10, 215, tall ? 76 : 70], label: 'Safety', tone: 'neutral', fontSize: 24,
    }),
    moduleNode(palette, {
      id: 'vla-integrator', role: 'policy', box: [1110, y + 10, 180, tall ? 76 : 70], label: 'MPC', tone: 'blue', fontSize: 24,
    }),
    imageNode(palette, {
      id: 'vla-execution', role: 'environment', box: [1360, y + 10, 240, tall ? 170 : 150], label: 'Execute',
      imageUrl: vlaApproach, sourceRef: 'vla-approach-print.jpg', promptRef: VLA_PROMPT_REF, fontSize: 23,
    }),
    moduleNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [1360, y + (tall ? 220 : 188), 240, tall ? 118 : 100], label: 'TCP path', tone: 'blue', fontSize: 24,
    }),
    stageNode(palette, 'vla-05', [520, rolloutY - 68, 700, 52], 'E  Closed-loop rollout', m.stageSize),
    imageNode(palette, {
      id: 'vla-rollout-a', role: 'environment', box: [1220, rolloutY, 150, rolloutHeight], label: 't',
      imageUrl: vlaObserve, sourceRef: 'vla-observe-print.jpg', promptRef: VLA_PROMPT_REF,
    }),
    imageNode(palette, {
      id: 'vla-rollout-b', role: 'environment', box: [920, rolloutY, 150, rolloutHeight], label: 't + 4',
      imageUrl: vlaGrasp, sourceRef: 'vla-grasp-print.jpg', promptRef: VLA_PROMPT_REF,
    }),
    imageNode(palette, {
      id: 'vla-rollout-c', role: 'environment', box: [620, rolloutY, 150, rolloutHeight], label: 't + 8',
      imageUrl: vlaPlace, sourceRef: 'vla-place-print.jpg', promptRef: VLA_PROMPT_REF,
    }),
    moduleNode(palette, {
      id: 'vla-feedback-note', role: 'annotation', box: [360, feedbackNoteY, 180, feedbackNoteHeight], label: 'oₜ₊₁', tone: 'coral', fontSize: 22, textAlign: 'center',
    }),
  );

  const edges = contractEdges(palette, VLA_EDGE_CONTRACT, {
    'vla-observation->vla-tokens': { sourceHandle: 'right', targetHandle: 'left', targetAnchorOffset: { dx: 0, dy: -35 } },
    'vla-task->vla-tokens': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [{ origin: 'source', dx: 25, dy: 0 }, { origin: 'target', dx: -45, dy: 0 }],
    },
    'vla-state->vla-tokens': {
      sourceHandle: 'right', targetHandle: 'left', targetAnchorOffset: { dx: 0, dy: 35 },
      routeWaypoints: [{ origin: 'source', dx: 40, dy: 0 }, { origin: 'target', dx: -30, dy: 0 }],
    },
    'vla-tokens->vla-backbone': { sourceHandle: 'right', targetHandle: 'left' },
    'vla-backbone->vla-object': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-object->vla-policy': { sourceHandle: 'right', targetHandle: 'left' },
    'vla-constraints->vla-policy': {
      sourceHandle: 'bottom', targetHandle: 'top',
      routeWaypoints: [{ origin: 'source', dx: 0, dy: 20 }, { origin: 'target', dx: 0, dy: -20 }],
    },
    'vla-policy->vla-action': { sourceHandle: 'right', targetHandle: 'left' },
    'vla-action->vla-integrator': {
      sourceHandle: 'top', targetHandle: 'bottom',
      routeWaypoints: [{ origin: 'source', dx: 0, dy: -24 }, { origin: 'target', dx: 0, dy: 20 }],
    },
    'vla-integrator->vla-execution': { sourceHandle: 'right', targetHandle: 'left' },
    'vla-execution->vla-trajectory': { sourceHandle: 'bottom', targetHandle: 'top' },
    'vla-execution->vla-rollout-a': {
      sourceHandle: 'left', targetHandle: 'top',
      routeWaypoints: [
        { origin: 'source', dx: -25, dy: 0 },
        { origin: 'target', dx: 40, dy: -20 },
        { origin: 'target', dx: 0, dy: -20 },
      ],
    },
    'vla-rollout-a->vla-rollout-b': { sourceHandle: 'left', targetHandle: 'right' },
    'vla-rollout-b->vla-rollout-c': { sourceHandle: 'left', targetHandle: 'right' },
    'vla-rollout-c->vla-feedback-note': {
      sourceHandle: 'left', targetHandle: 'right', width: 1.8,
      routeWaypoints: [{ origin: 'source', dx: -10, dy: 0 }, { origin: 'target', dx: 10, dy: 0 }],
    },
    'vla-feedback-note->vla-observation': {
      sourceHandle: 'left', targetHandle: 'left', width: 1.8,
      routeWaypoints: [
        { origin: 'source', dx: -340, dy: 0 },
        { origin: 'target', dx: -20, dy: 0 },
      ],
    },
  });
  return { nodes, edges, width, height };
}

function worldSingle(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { nodes, width, height } = root(palette, options, provenance, 'single-column');
  nodes.push(
    stageNode(palette, 'wm-01', [18, 6, 132, 46], 'A  Context', 21),
    stageNode(palette, 'wm-02', [155, 6, 140, 46], 'B  Encode', 21),
    stageNode(palette, 'wm-03', [300, 6, 145, 46], 'C  Imagine', 21),
    stageNode(palette, 'wm-04', [455, 6, 125, 46], 'D  Select', 21),
    stageNode(palette, 'wm-05', [585, 6, 165, 46], 'E  Act', 21),
    sectionPanel(palette, 'wm-panel-rollouts', [12, 320, 565, 270], 'coral'),
    imageNode(palette, {
      id: 'wm-scene', role: 'environment', box: [20, 135, 130, 90], label: 'oₜ',
      imageUrl: worldCurrent, sourceRef: 'world-observed-print.jpg', promptRef: WORLD_PROMPT_REF,
      fontSize: 24,
    }),
    moduleNode(palette, { id: 'wm-goal', role: 'modality', box: [20, 72, 130, 50], label: 'Goal g', tone: 'amber', fontSize: 23 }),
    moduleNode(palette, { id: 'wm-encode', role: 'token', kind: 'scientific-feature-map', box: [165, 85, 120, 76], label: 'Encode', tone: 'blue', fontSize: 22 }),
    moduleNode(palette, { id: 'wm-latent', role: 'token', kind: 'scientific-embedding-space', box: [165, 180, 120, 76], label: 'Belief bₜ', tone: 'neutral', fontSize: 22 }),
    moduleNode(palette, {
      id: 'wm-actions', role: 'action', kind: 'scientific-action-chunk', box: [300, 70, 175, 110],
      label: 'Plans Aₜ⁽ᵏ⁾', description: 'ℝᴴˣ⁷;k=1…K', tone: 'blue', variant: 'action-horizon', fontSize: 20,
    }),
    moduleNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [300, 192, 175, 120],
      label: 'Dynamics', description: 'b̂⁽ᵏ⁾ = fθ\n(bₜ, A⁽ᵏ⁾)', tone: 'violet', variant: 'world-model', fontSize: 20,
    }),
    moduleNode(palette, {
      id: 'wm-rollout', role: 'policy', kind: 'scientific-timeline', box: [20, 345, 140, 105],
      label: 'Futures', description: 'k=1…K', tone: 'neutral', fontSize: 20,
    }),
    makeNode(palette, {
      id: 'wm-rollout-hub', role: 'annotation', kind: 'ellipse', box: [362, 318, 14, 14],
      label: '', fill: palette.tones.green.fill, stroke: palette.tones.green.stroke,
      borderWidth: 1.5, radius: 7, zIndex: 20,
    }),
    imageNode(palette, {
      id: 'wm-rollout-safe', role: 'environment', box: [166, 350, 134, 82], label: 'k=1 safe',
      imageUrl: worldSuccess, sourceRef: 'world-success-print.jpg', promptRef: WORLD_PROMPT_REF,
      fontSize: 21,
    }),
    imageNode(palette, {
      id: 'wm-rollout-contact', role: 'environment', box: [302, 350, 134, 82], label: 'k=2 contact',
      imageUrl: worldCollision, sourceRef: 'world-collision-print.jpg', promptRef: WORLD_PROMPT_REF, fontSize: 21,
    }),
    imageNode(palette, {
      id: 'wm-rollout-uncertain', role: 'environment', box: [438, 350, 134, 82], label: 'k=3 occluded',
      imageUrl: worldUncertain, sourceRef: 'world-occluded-print.jpg', promptRef: WORLD_PROMPT_REF, fontSize: 21,
    }),
    moduleNode(palette, {
      id: 'wm-score', role: 'policy', kind: 'scientific-decision-gate', box: [166, 462, 406, 112],
      label: 'Select k*', description: 'k*=argminₖ Jₖ\nJ=(0.18, 1.42, 0.86)', tone: 'coral', variant: 'risk-ranking', fontSize: 24, borderWidth: 3,
    }),
    moduleNode(palette, {
      id: 'wm-action', role: 'action', kind: 'scientific-action-chunk', box: [585, 72, 165, 82],
      label: 'Aₜ⁽ᵏ*⁾', description: 'execute aₜ', tone: 'green', variant: 'action-horizon', fontSize: 20,
    }),
    imageNode(palette, {
      id: 'wm-execute', role: 'environment', box: [585, 168, 165, 100], label: 'Observed oₜ₊₁',
      imageUrl: worldSuccess, sourceRef: 'world-success-print.jpg', promptRef: WORLD_PROMPT_REF, fontSize: 21,
    }),
    moduleNode(palette, {
      id: 'wm-residual', role: 'loss', kind: 'scientific-metric-panel', box: [585, 282, 165, 112],
      label: 'Residual', description: 'rₜ₊₁=oₜ₊₁\n−ôₜ₊₁⁽ᵏ*⁾', tone: 'coral', variant: 'prediction-error', fontSize: 20, textPaddingX: 3,
    }),
    moduleNode(palette, {
      id: 'wm-update', role: 'token', kind: 'scientific-feature-map', box: [585, 408, 165, 90],
      label: 'Update bₜ₊₁', tone: 'blue', fontSize: 20, textPaddingX: 3,
    }),
  );
  const edges = contractEdges(palette, WORLD_EDGE_CONTRACT, {
    'wm-scene->wm-encode': { sourceHandle: 'right', targetHandle: 'left' },
    'wm-goal->wm-actions': {
      sourceHandle: 'right', targetHandle: 'top',
      routeWaypoints: [
        { origin: 'source', dx: 10, dy: 0 },
        { origin: 'source', dx: 10, dy: -31 },
        { origin: 'target', dx: 0, dy: -4 },
      ],
    },
    'wm-encode->wm-latent': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-latent->wm-model': { sourceHandle: 'right', targetHandle: 'left' },
    'wm-actions->wm-model': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-model->wm-rollout': {
      sourceHandle: 'bottom', targetHandle: 'top', sourceAnchorOffset: { dx: -85, dy: 0 },
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 18 },
        { origin: 'target', dx: 0, dy: -15 },
      ],
    },
    'wm-rollout->wm-rollout-hub': {
      sourceHandle: 'right', targetHandle: 'left', width: 2,
      routeWaypoints: [
        { origin: 'source', dx: 2, dy: 0 },
        { origin: 'source', dx: 2, dy: -68 },
        { origin: 'target', dx: -10, dy: -7 },
      ],
    },
    'wm-rollout-hub->wm-rollout-safe': {
      sourceHandle: 'left', targetHandle: 'top', width: 2,
    },
    'wm-rollout-hub->wm-rollout-contact': {
      sourceHandle: 'bottom', targetHandle: 'top', width: 2,
    },
    'wm-rollout-hub->wm-rollout-uncertain': {
      sourceHandle: 'right', targetHandle: 'top', width: 2,
    },
    'wm-rollout-safe->wm-score': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: -136, dy: 0 } },
    'wm-rollout-contact->wm-score': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-rollout-uncertain->wm-score': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: 136, dy: 0 } },
    'wm-score->wm-action': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: 0, dy: -20 },
      routeWaypoints: [{ origin: 'source', dx: 10, dy: 0 }, { origin: 'target', dx: -18, dy: 0 }],
    },
    'wm-score->wm-residual': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: 0, dy: 20 }, width: 2,
      routeWaypoints: [{ origin: 'source', dx: 8, dy: 0 }, { origin: 'target', dx: -5, dy: 0 }],
    },
    'wm-action->wm-execute': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-execute->wm-residual': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-residual->wm-update': { sourceHandle: 'bottom', targetHandle: 'top' },
  });
  return { nodes, edges, width, height };
}

function worldWide(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: Extract<ScientificSchematicLayout, 'double-column' | 'presentation'>,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { nodes, width, height } = root(palette, options, provenance, layout);
  const m = wideMetrics(layout);
  const y = m.contentY;
  const tall = layout === 'double-column';
  const futureHeight = tall ? 132 : 108;
  const modelOffset = tall ? 158 : 144;
  const rolloutHeight = tall ? 190 : 174;
  const futureOffset = tall ? 370 : 342;
  const executeOffset = tall ? 142 : 124;
  const residualOffset = tall ? 342 : 292;
  const updateOffset = tall ? 456 : 445;
  const updateHeight = tall ? 90 : 96;
  const scoreY = y + futureOffset + futureHeight + 48;
  const rolloutHubY = y + modelOffset + rolloutHeight + 4;
  nodes.push(
    stageNode(palette, 'wm-01', [40, m.stageY, 250, 56], 'A  Context', m.stageSize),
    stageNode(palette, 'wm-02', [330, m.stageY, 390, 56], 'B  Encode', m.stageSize),
    stageNode(palette, 'wm-03', [740, m.stageY, 300, 56], 'C  Imagine', m.stageSize),
    stageNode(palette, 'wm-04', [1060, m.stageY, 290, 56], 'D  Select', m.stageSize),
    stageNode(palette, 'wm-05', [1370, m.stageY, 250, 56], 'E  Act', m.stageSize),
    sectionPanel(palette, 'wm-panel-rollouts', [670, y - 22, 690, tall ? 740 : 680], 'coral'),
    imageNode(palette, {
      id: 'wm-scene', role: 'environment', box: [50, y + (tall ? 120 : 100), 240, tall ? 176 : 154], label: 'oₜ',
      imageUrl: worldCurrent, sourceRef: 'world-observed-print.jpg', promptRef: WORLD_PROMPT_REF, fontSize: 23,
    }),
    moduleNode(palette, { id: 'wm-goal', role: 'modality', box: [50, y, 240, tall ? 78 : 70], label: 'Goal g', tone: 'amber', fontSize: 25 }),
    moduleNode(palette, { id: 'wm-encode', role: 'token', kind: 'scientific-feature-map', box: [340, y + (tall ? 120 : 100), 140, tall ? 128 : 112], label: 'Encode', tone: 'blue', fontSize: 24 }),
    moduleNode(palette, { id: 'wm-latent', role: 'token', kind: 'scientific-embedding-space', box: [510, y + (tall ? 120 : 100), 150, tall ? 128 : 112], label: tall ? 'Belief bₜ' : 'bₜ', tone: 'neutral', fontSize: tall ? 25 : 24 }),
    moduleNode(palette, {
      id: 'wm-actions', role: 'action', kind: 'scientific-action-chunk', box: [690, y, 260, tall ? 132 : 140],
      label: 'Plans Aₜ⁽ᵏ⁾', description: 'ℝᴴˣ⁷ · k=1…K', tone: 'blue', variant: 'action-horizon', fontSize: tall ? 25 : 23,
    }),
    moduleNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-transformer', box: [690, y + modelOffset, 260, tall ? 190 : 186],
      label: 'World model', description: 'b̂⁽ᵏ⁾ = fθ(bₜ,\nAₜ⁽ᵏ⁾)', tone: 'violet', variant: 'world-model', fontSize: tall ? 25 : 23,
    }),
    moduleNode(palette, {
      id: 'wm-rollout', role: 'policy', kind: 'scientific-timeline', box: [980, y + modelOffset, 350, rolloutHeight],
      label: 'Predicted futures', description: 'ôₜ₊₁:ₜ₊H⁽ᵏ⁾', tone: 'neutral', fontSize: tall ? 26 : 23,
    }),
    makeNode(palette, {
      id: 'wm-rollout-hub', role: 'annotation', kind: 'ellipse', box: [1064, rolloutHubY, 14, 14],
      label: '', fill: palette.tones.green.fill, stroke: palette.tones.green.stroke,
      borderWidth: 1.5, radius: 7, zIndex: 20,
    }),
    imageNode(palette, {
      id: 'wm-rollout-safe', role: 'environment', box: [810, y + futureOffset, 166, futureHeight], label: 'k=1 safe',
      imageUrl: worldSuccess, sourceRef: 'world-success-print.jpg', promptRef: WORLD_PROMPT_REF,
      fontSize: 20,
    }),
    imageNode(palette, {
      id: 'wm-rollout-contact', role: 'environment', box: [988, y + futureOffset, 166, futureHeight], label: 'k=2 contact',
      imageUrl: worldCollision, sourceRef: 'world-collision-print.jpg', promptRef: WORLD_PROMPT_REF,
      fontSize: 20,
    }),
    imageNode(palette, {
      id: 'wm-rollout-uncertain', role: 'environment', box: [1166, y + futureOffset, 166, futureHeight], label: 'k=3 occluded',
      imageUrl: worldUncertain, sourceRef: 'world-occluded-print.jpg', promptRef: WORLD_PROMPT_REF,
      fontSize: 20,
    }),
    moduleNode(palette, {
      id: 'wm-score', role: 'policy', kind: 'scientific-decision-gate', box: [810, scoreY, 520, tall ? 150 : 140],
      label: 'Select k*', description: 'k*=argminₖ [Cg+λCc+μUk]\nJ=(0.18, 1.42, 0.86)', tone: 'coral', variant: 'risk-ranking', fontSize: tall ? 27 : 23, borderWidth: 3,
    }),
    moduleNode(palette, {
      id: 'wm-action', role: 'action', kind: 'scientific-action-chunk', box: [1360, y, 260, tall ? 96 : 104],
      label: 'Aₜ⁽ᵏ*⁾', description: 'execute aₜ', tone: 'green', variant: 'action-horizon', fontSize: 25,
    }),
    imageNode(palette, {
      id: 'wm-execute', role: 'environment', box: [1380, y + executeOffset, 240, tall ? 150 : 132], label: 'Observed oₜ₊₁',
      imageUrl: worldSuccess, sourceRef: 'world-success-print.jpg', promptRef: WORLD_PROMPT_REF, fontSize: 22,
    }),
    moduleNode(palette, {
      id: 'wm-residual', role: 'loss', kind: 'scientific-metric-panel', box: [1360, y + residualOffset, 260, tall ? 108 : 146],
      label: 'Residual', description: 'rₜ₊₁ = oₜ₊₁\n− ôₜ₊₁⁽ᵏ*⁾', tone: 'coral', variant: 'prediction-error', fontSize: 23,
    }),
    moduleNode(palette, {
      id: 'wm-update', role: 'token', kind: 'scientific-feature-map', box: [1360, y + updateOffset, 260, updateHeight],
      label: 'Update belief', description: 'bₜ₊₁', tone: 'blue', fontSize: 23,
    }),
  );
  const edges = contractEdges(palette, WORLD_EDGE_CONTRACT, {
    'wm-scene->wm-encode': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [{ origin: 'source', dx: 40, dy: 0 }, { origin: 'target', dx: -10, dy: 0 }],
    },
    'wm-goal->wm-actions': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'target', dx: -20, dy: -(tall ? 27 : 35) },
        { origin: 'target', dx: -20, dy: 0 },
      ],
    },
    'wm-encode->wm-latent': { sourceHandle: 'right', targetHandle: 'left' },
    'wm-latent->wm-model': {
      sourceHandle: 'right', targetHandle: 'left',
      targetAnchorOffset: { dx: 0, dy: tall ? -50 : -62 },
      routeWaypoints: [{ origin: 'source', dx: 12, dy: 0 }, { origin: 'target', dx: -28, dy: 0 }],
    },
    'wm-actions->wm-model': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-model->wm-rollout': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: 0, dy: -30 }, targetAnchorOffset: { dx: 0, dy: -30 },
      routeWaypoints: [{ origin: 'source', dx: 15, dy: 0 }, { origin: 'target', dx: -15, dy: 0 }],
    },
    'wm-rollout->wm-rollout-hub': { sourceHandle: 'bottom', targetHandle: 'top', width: 2 },
    'wm-rollout-hub->wm-rollout-safe': { sourceHandle: 'left', targetHandle: 'top', width: 2 },
    'wm-rollout-hub->wm-rollout-contact': { sourceHandle: 'bottom', targetHandle: 'top', width: 2 },
    'wm-rollout-hub->wm-rollout-uncertain': { sourceHandle: 'right', targetHandle: 'top', width: 2 },
    'wm-rollout-safe->wm-score': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: -177, dy: 0 } },
    'wm-rollout-contact->wm-score': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: 1, dy: 0 } },
    'wm-rollout-uncertain->wm-score': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: 179, dy: 0 } },
    'wm-score->wm-action': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: 0, dy: -24 },
      routeWaypoints: [{ origin: 'source', dx: 25, dy: 0 }, { origin: 'target', dx: -25, dy: 0 }],
    },
    'wm-score->wm-residual': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: 0, dy: 24 }, width: 2,
      routeWaypoints: [{ origin: 'source', dx: 10, dy: 0 }, { origin: 'target', dx: -20, dy: 0 }],
    },
    'wm-action->wm-execute': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-execute->wm-residual': { sourceHandle: 'bottom', targetHandle: 'top' },
    'wm-residual->wm-update': { sourceHandle: 'bottom', targetHandle: 'top' },
  });
  return { nodes, edges, width, height };
}

function llmSingle(options: ScientificSchematicOptions, provenance: ScientificProvenance): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { nodes, width, height } = root(palette, options, provenance, 'single-column');
  nodes.push(
    stageNode(palette, 'llm-01', [20, 14, 125, 42], 'A  Seed', 25),
    stageNode(palette, 'llm-02', [155, 14, 135, 42], 'B  SFT', 25),
    stageNode(palette, 'llm-03', [300, 14, 300, 42], 'C  DPO alignment', 25),
    stageNode(palette, 'llm-04', [625, 14, 125, 42], 'D  Verify', 25),
    sectionPanel(palette, 'llm-panel-align', [35, 65, 585, 400], 'coral'),
    moduleNode(palette, {
      id: 'llm-base', role: 'backbone', kind: 'scientific-frozen', box: [20, 80, 125, 110],
      label: 'Base π₀', tone: 'violet', fontSize: 24,
    }),
    moduleNode(palette, { id: 'llm-data', role: 'dataset', kind: 'scientific-dataset-stack', box: [160, 80, 130, 80], label: 'SFT data', tone: 'amber', fontSize: 24 }),
    moduleNode(palette, {
      id: 'llm-sft', role: 'policy', kind: 'scientific-trainable', box: [160, 180, 130, 90],
      label: 'SFT π₀', tone: 'blue', fontSize: 22,
    }),
    moduleNode(palette, { id: 'llm-prompt', role: 'token', kind: 'scientific-prompt-card', box: [310, 80, 75, 82], label: 'x', tone: 'blue', fontSize: 24 }),
    moduleNode(palette, {
      id: 'llm-pair', role: 'token', kind: 'scientific-preference-pair', box: [400, 75, 190, 100],
      label: 'y⁺ preferred', description: 'y⁻ rejected', tone: 'green', fontSize: 24,
    }),
    makeNode(palette, {
      id: 'llm-objective', role: 'frame', kind: 'scientific-equation', box: [20, 270, 650, 190],
      label: '', fill: 'transparent', stroke: palette.tones.coral.stroke,
      borderWidth: 3, radius: 0, zIndex: 5,
    }),
    formulaCaption(palette, 'llm-objective-title', [100, 278, 490, 38], 'DPO objective', 22, 700),
    formulaCaption(palette, 'llm-ratio-positive', [80, 322, 530, 38], 'rθ⁺ = ln[πθ(y⁺|x)/π₀(y⁺|x)]', 18),
    formulaCaption(palette, 'llm-ratio-negative', [80, 366, 530, 38], 'rθ⁻ = ln[πθ(y⁻|x)/π₀(y⁻|x)]', 18),
    formulaCaption(palette, 'llm-loss-formula', [100, 412, 490, 38], 'L = −ln σ[β(rθ⁺−rθ⁻)]', 20, 600),
    moduleNode(palette, {
      id: 'llm-policy', role: 'backbone', kind: 'scientific-trainable', box: [630, 190, 120, 90],
      label: 'πθ*', description: 'aligned', tone: 'green', fontSize: 21,
    }),
    moduleNode(palette, { id: 'llm-suite', role: 'token', kind: 'scientific-metric-panel', box: [630, 300, 120, 70], label: 'Eval', tone: 'blue', variant: 'capability-safety', fontSize: 24 }),
    moduleNode(palette, { id: 'llm-gate', role: 'policy', kind: 'scientific-release-gate', box: [630, 390, 120, 70], label: 'Release', tone: 'green', variant: 'release-gate', fontSize: 24 }),
    stageNode(palette, 'llm-05', [20, 488, 210, 40], 'E  Optional PPO', 24),
    sectionPanel(palette, 'llm-baseline-panel', [90, 534, 590, 62], 'violet'),
    moduleNode(palette, { id: 'llm-rollout', role: 'policy', box: [105, 540, 170, 54], label: 'Samples τ', tone: 'blue', fontSize: 22 }),
    moduleNode(palette, { id: 'llm-rm', role: 'loss', box: [295, 540, 170, 54], label: 'Reward rφ', tone: 'coral', fontSize: 22 }),
    moduleNode(palette, { id: 'llm-ppo', role: 'policy', box: [485, 540, 175, 54], label: 'PPO πₚₚₒ', tone: 'violet', fontSize: 22 }),
  );
  const edges = contractEdges(palette, LLM_EDGE_CONTRACT, {
    'llm-base->llm-sft': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [{ origin: 'source', dx: 5, dy: 0 }, { origin: 'target', dx: -10, dy: 0 }],
    },
    'llm-data->llm-sft': { sourceHandle: 'bottom', targetHandle: 'top' },
    'llm-sft->llm-objective': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: -100, dy: 0 } },
    'llm-prompt->llm-pair': { sourceHandle: 'right', targetHandle: 'left' },
    'llm-pair->llm-objective': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: 170, dy: 0 } },
    'llm-objective->llm-policy': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: -52, dy: -70 }, targetAnchorOffset: { dx: 0, dy: -30 },
    },
    'llm-policy->llm-suite': { sourceHandle: 'bottom', targetHandle: 'top' },
    'llm-suite->llm-gate': { sourceHandle: 'bottom', targetHandle: 'top' },
    'llm-sft->llm-rollout': {
      sourceHandle: 'left', targetHandle: 'right', width: 1.8,
      routeWaypoints: [
        { origin: 'source', dx: -135, dy: 0 },
        { origin: 'source', dx: -135, dy: 239 },
        { origin: 'target', dx: 10, dy: -103 },
        { origin: 'target', dx: 10, dy: 0 },
      ],
    },
    'llm-rm->llm-ppo': {
      sourceHandle: 'right', targetHandle: 'left', width: 1.8,
    },
    'llm-rollout->llm-ppo': {
      sourceHandle: 'bottom', targetHandle: 'bottom', targetAnchorOffset: { dx: -30, dy: 0 }, width: 1.8,
      routeWaypoints: [{ origin: 'source', dx: 0, dy: 15 }, { origin: 'target', dx: 0, dy: 15 }],
    },
    'llm-ppo->llm-policy': {
      sourceHandle: 'right', targetHandle: 'right', targetAnchorOffset: { dx: 0, dy: -30 }, width: 1.8,
      routeWaypoints: [
        { origin: 'source', dx: 96, dy: 0 },
        { origin: 'target', dx: 6, dy: 0 },
      ],
    },
  });
  return { nodes, edges, width, height };
}

function llmWide(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: Extract<ScientificSchematicLayout, 'double-column' | 'presentation'>,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { nodes, width, height } = root(palette, options, provenance, layout);
  const m = wideMetrics(layout);
  const y = m.contentY;
  const tall = layout === 'double-column';
  const baselineY = tall ? 640 : 570;
  const objectiveY = y + (tall ? 174 : 154);
  const objectiveHeight = tall ? 250 : 238;
  nodes.push(
    stageNode(palette, 'llm-01', [40, m.stageY, 250, 56], 'A  Seed', m.stageSize),
    stageNode(palette, 'llm-02', [340, m.stageY, 320, 56], 'B  SFT reference', m.stageSize),
    stageNode(palette, 'llm-03', [700, m.stageY, 580, 56], 'C  Preference alignment', m.stageSize),
    stageNode(palette, 'llm-04', [1300, m.stageY, 320, 56], 'D  Verify', m.stageSize),
    sectionPanel(palette, 'llm-panel-align', [590, y - 22, 710, tall ? 462 : 414], 'coral'),
    moduleNode(palette, {
      id: 'llm-base', role: 'backbone', kind: 'scientific-frozen', box: [50, y + 40, 250, tall ? 160 : 146],
      label: 'Base π₀', tone: 'violet', fontSize: 30, fontWeight: 680,
    }),
    moduleNode(palette, { id: 'llm-data', role: 'dataset', kind: 'scientific-dataset-stack', box: [360, y, 240, tall ? 116 : 104], label: 'SFT data', tone: 'amber', fontSize: 27 }),
    moduleNode(palette, {
      id: 'llm-sft', role: 'policy', kind: 'scientific-trainable', box: [360, y + (tall ? 174 : 154), 240, tall ? 146 : 150],
      label: 'SFT π₀', tone: 'blue', fontSize: 28, fontWeight: 680,
    }),
    moduleNode(palette, { id: 'llm-prompt', role: 'token', kind: 'scientific-prompt-card', box: [730, y + 20, 100, tall ? 116 : 104], label: 'x', tone: 'blue', fontSize: 24 }),
    moduleNode(palette, {
      id: 'llm-pair', role: 'token', kind: 'scientific-preference-pair', box: [860, y + 20, 370, tall ? 116 : 104],
      label: 'y⁺ preferred', description: 'y⁻ rejected', tone: 'green', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'llm-objective', role: 'frame', kind: 'scientific-equation', box: [600, objectiveY, 700, objectiveHeight],
      label: '', fill: 'transparent', stroke: palette.tones.coral.stroke,
      borderWidth: 3.2, radius: 0, zIndex: 5,
    }),
    formulaCaption(palette, 'llm-objective-title', [680, objectiveY + 12, 520, 46], 'DPO objective', 28, 700),
    formulaCaption(palette, 'llm-ratio-positive', [640, objectiveY + 64, 600, 46], 'rθ⁺ = ln[πθ(y⁺|x)/π₀(y⁺|x)]', 22),
    formulaCaption(palette, 'llm-ratio-negative', [640, objectiveY + 116, 600, 46], 'rθ⁻ = ln[πθ(y⁻|x)/π₀(y⁻|x)]', 22),
    formulaCaption(palette, 'llm-loss-formula', [660, objectiveY + 174, 560, 48], 'L = −ln σ[β(rθ⁺−rθ⁻)]', 25, 600),
    moduleNode(palette, {
      id: 'llm-policy', role: 'backbone', kind: 'scientific-trainable', box: [1300, y + 40, 320, 140],
      label: 'πθ*', description: 'aligned', tone: 'green', fontSize: 28, fontWeight: 680,
    }),
    moduleNode(palette, { id: 'llm-suite', role: 'token', kind: 'scientific-metric-panel', box: [1300, y + (tall ? 230 : 208), 150, tall ? 136 : 130], label: 'Eval', tone: 'blue', variant: 'capability-safety', fontSize: 24 }),
    moduleNode(palette, { id: 'llm-gate', role: 'policy', kind: 'scientific-release-gate', box: [1460, y + (tall ? 230 : 208), 160, tall ? 136 : 130], label: 'Release', tone: 'green', variant: 'release-gate', fontSize: 24 }),
    stageNode(palette, 'llm-05', [40, baselineY + 18, 340, 50], 'E  Optional PPO', 23),
    sectionPanel(palette, 'llm-baseline-panel', [390, baselineY, 910, 130], 'violet'),
    moduleNode(palette, { id: 'llm-rollout', role: 'policy', box: [420, baselineY + 25, 240, 80], label: 'Samples τ', tone: 'blue', fontSize: 23 }),
    moduleNode(palette, { id: 'llm-rm', role: 'loss', box: [720, baselineY + 25, 240, 80], label: 'Reward rφ', tone: 'coral', fontSize: 23 }),
    moduleNode(palette, { id: 'llm-ppo', role: 'policy', box: [1020, baselineY + 25, 240, 80], label: 'PPO πₚₚₒ', tone: 'violet', fontSize: 23 }),
  );
  const edges = contractEdges(palette, LLM_EDGE_CONTRACT, {
    'llm-base->llm-sft': {
      sourceHandle: 'right', targetHandle: 'left',
      routeWaypoints: [{ origin: 'source', dx: 20, dy: 0 }, { origin: 'target', dx: -20, dy: 0 }],
    },
    'llm-data->llm-sft': { sourceHandle: 'bottom', targetHandle: 'top' },
    'llm-sft->llm-objective': { sourceHandle: 'right', targetHandle: 'left' },
    'llm-prompt->llm-pair': { sourceHandle: 'right', targetHandle: 'left' },
    'llm-pair->llm-objective': { sourceHandle: 'bottom', targetHandle: 'top', targetAnchorOffset: { dx: 95, dy: 0 } },
    'llm-objective->llm-policy': {
      sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: -56, dy: 0 }, targetAnchorOffset: { dx: 0, dy: -20 },
      routeWaypoints: [
        { origin: 'source', dx: 45, dy: 0 },
        { origin: 'target', dx: -30, dy: 0 },
      ],
    },
    'llm-policy->llm-suite': { sourceHandle: 'bottom', targetHandle: 'top', sourceAnchorOffset: { dx: -85, dy: 0 } },
    'llm-suite->llm-gate': { sourceHandle: 'right', targetHandle: 'left', sourceAnchorOffset: { dx: 0, dy: 22 }, targetAnchorOffset: { dx: 0, dy: 22 } },
    'llm-sft->llm-rollout': {
      sourceHandle: 'bottom', targetHandle: 'top', width: 1.8,
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 34 },
        { origin: 'target', dx: -60, dy: -18 },
        { origin: 'target', dx: 0, dy: -18 },
      ],
    },
    'llm-rm->llm-ppo': {
      sourceHandle: 'right', targetHandle: 'left', width: 1.8,
    },
    'llm-rollout->llm-ppo': {
      sourceHandle: 'bottom', targetHandle: 'bottom', targetAnchorOffset: { dx: -35, dy: 0 }, width: 1.8,
      routeWaypoints: [{ origin: 'source', dx: 0, dy: 18 }, { origin: 'target', dx: 0, dy: 18 }],
    },
    'llm-ppo->llm-policy': {
      sourceHandle: 'right', targetHandle: 'right', targetAnchorOffset: { dx: 0, dy: -30 }, width: 1.8,
      routeWaypoints: [
        { origin: 'source', dx: 385, dy: 0 },
        { origin: 'target', dx: 25, dy: 0 },
      ],
    },
  });
  return { nodes, edges, width, height };
}

export function buildTopVenueFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: ScientificSchematicLayout,
): PublicationFlagshipBlueprint | undefined {
  if (layout === 'freeform') return buildPreviousFlagship(options, provenance, layout);
  if (options.templateId === 'vla-policy') {
    return layout === 'single-column'
      ? vlaSingle(options, provenance)
      : vlaWide(options, provenance, layout);
  }
  if (options.templateId === 'world-model-rollout') {
    return layout === 'single-column'
      ? worldSingle(options, provenance)
      : worldWide(options, provenance, layout);
  }
  if (options.templateId === 'llm-training-pipeline') {
    return layout === 'single-column'
      ? llmSingle(options, provenance)
      : llmWide(options, provenance, layout);
  }
  return buildPreviousFlagship(options, provenance, layout);
}
