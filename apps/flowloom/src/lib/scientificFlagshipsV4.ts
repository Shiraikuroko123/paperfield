import vlaApproach from '../assets/scientific/vla-approach.jpg?inline';
import vlaApproachPrint from '../assets/scientific/vla-approach-print.jpg?inline';
import vlaFront from '../assets/scientific/vla-front.jpg?inline';
import vlaGrasp from '../assets/scientific/vla-grasp.jpg?inline';
import vlaGraspPrint from '../assets/scientific/vla-grasp-print.jpg?inline';
import vlaObserve from '../assets/scientific/vla-observe.jpg?inline';
import vlaObservePrint from '../assets/scientific/vla-observe-print.jpg?inline';
import vlaPlace from '../assets/scientific/vla-place.jpg?inline';
import vlaPlacePrint from '../assets/scientific/vla-place-print.jpg?inline';
import worldActual from '../assets/scientific/world-success.jpg?inline';
import worldCollision from '../assets/scientific/world-collision.jpg?inline';
import worldCollisionPrint from '../assets/scientific/world-collision-print.jpg?inline';
import worldCurrent from '../assets/scientific/world-observed.jpg?inline';
import worldCurrentPrint from '../assets/scientific/world-observed-print.jpg?inline';
import worldSuccess from '../assets/scientific/world-success.jpg?inline';
import worldSuccessPrint from '../assets/scientific/world-success-print.jpg?inline';
import worldUncertain from '../assets/scientific/world-occluded.jpg?inline';
import worldUncertainPrint from '../assets/scientific/world-occluded-print.jpg?inline';
import type {
  FlowEdge,
  FlowNode,
  ScientificProvenance,
  ScientificSchematicLayout,
  ScientificSchematicOptions,
} from '../types';
import {
  buildTopVenueFlagship as buildV3Flagship,
  dimensionsFor,
  makeCaption,
  makeEdge,
  makeImage,
  makeNode,
  makePanel,
  makeRoot,
  makeStage,
  paletteFor,
  type PublicationFlagshipBlueprint,
} from './scientificFlagshipsV3';

const VLA_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#vla-storyboard';
const WORLD_PROMPT_REF = 'docs/research/SYNTHETIC_ASSET_PROVENANCE.md#world-model-counterfactuals';

function makePresentationStage(
  palette: Parameters<typeof makeStage>[0],
  id: string,
  box: Parameters<typeof makeStage>[2],
  label: string,
  fontSize: number,
): FlowNode {
  const stage = makeStage(palette, id, box, label, fontSize);
  return {
    ...stage,
    data: {
      ...stage.data,
      scientificTextPaddingX: 13,
      scientificTextPaddingY: 8.25,
    },
    style: {
      ...stage.style,
      height: Number(stage.style?.height ?? 0) + 0.5,
    },
  };
}

function vlaSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [18, 10, 575, 34], 'A  Ground task state', 27),
    makeStage(palette, 'vla-stage-method', [600, 10, 150, 34], 'B  Flow', 27),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [20, 55, 115, 100], label: 'oₜ', imageUrl: vlaFront,
      rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-front.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', box: [20, 175, 115, 70], label: 'ℓ, sₜ', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-input-join', role: 'bridge', kind: 'summing-junction', box: [155, 95, 20, 20], label: '', tone: 'neutral',
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [195, 65, 100, 80],
      label: 'Task tokens', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [310, 55, 135, 100],
      label: 'VLM', tone: 'violet', variant: 'vlm', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-grounding', role: 'token', kind: 'scientific-attention-map', box: [470, 55, 125, 100],
      label: 'Object zₒᵦⱼ', tone: 'neutral', variant: 'multiview', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [620, 55, 130, 100],
      label: 'Flow v(θ)', tone: 'coral', variant: 'diffusion-action', fontSize: 28, borderWidth: 3,
    }),
    makeNode(palette, {
      id: 'vla-baseline', role: 'policy', box: [465, 180, 130, 80], label: 'AR head', description: 'baseline', tone: 'violet', fontSize: 25,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [620, 185, 130, 55], label: 'LFM',
      tone: 'coral', fontSize: 28,
    }),
    makeStage(palette, 'vla-stage-control', [20, 285, 730, 34], 'C  Control', 27),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [150, 330, 115, 90], label: 'MPC K=4', tone: 'blue', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [300, 330, 120, 90], label: 'Project Π', tone: 'neutral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [300, 250, 120, 55], label: 'C(sₜ)',
      tone: 'neutral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [465, 325, 135, 100],
      label: 'Aₜ:ₜ₊H', description: '∈ ℝᴴ×⁷', tone: 'blue', variant: 'action-horizon', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [620, 330, 130, 90], label: 'ODE', description: 'NFE=10', tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [650, 245, 70, 55], label: 'ε', tone: 'amber', fontSize: 27,
    }),
    makeStage(palette, 'vla-stage-execution', [180, 435, 570, 34], 'D  Illustrative rollout', 27),
  );

  const frames = [
    ['vla-exec-observe', vlaObserve, 'τ₀', 20, 'vla-observe.jpg'],
    ['vla-robot', vlaApproach, 'τ₄', 145, 'vla-approach.jpg'],
    ['vla-contact', vlaGrasp, 'τ₈', 270, 'vla-grasp.jpg'],
    ['vla-reobserve', vlaPlace, 'oₜ₊₁', 395, 'vla-place.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(makeImage(palette, {
      id, role: 'environment', box: [x, 480, 110, 70], label, imageUrl: image, imageFit: 'cover',
      rasterWidthPx: 400, rasterHeightPx: 600, sourceRef, promptRef: VLA_PROMPT_REF,
    }));
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [535, 480, 215, 70],
      label: 'xₑₑ(t:t+12)', tone: 'blue', fontSize: 27,
    }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-input-join', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', arrowEnd: 'none' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-input-join', sourceHandle: 'right', targetHandle: 'bottom', routing: 'straight', arrowEnd: 'none' }),
    makeEdge(palette, { source: 'vla-input-join', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-grounding', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control', label: 'zₒᵦⱼ' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-baseline', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, {
      source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'right', semantic: 'control',
      routeWaypoints: [{ origin: 'source', dx: 12, dy: 0 }, { origin: 'target', dx: 12, dy: 0 }],
    }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'vla-baseline', target: 'vla-action-chunk', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional', lineStyle: 'dotted',
      routing: 'straight',
    }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-decision', target: 'vla-controller', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: -67.5, dy: 0 },
        { origin: 'target', dx: 65, dy: -10 },
        { origin: 'target', dx: 0, dy: -10 },
      ],
    }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, {
      source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'right', targetHandle: 'left', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 15, dy: 0 },
        { origin: 'source', dx: 15, dy: 65 },
        { origin: 'target', dx: -8, dy: 475 },
        { origin: 'target', dx: -8, dy: 0 },
      ],
      label: 'reobserve → next oₜ', labelFontSize: 18, labelOffsetY: 270,
    }),
  ];
  return { nodes, edges, width, height };
}

function vlaDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'vla-stage-input', [25, 18, 285, 42], 'A  Task state', 32),
    makeStage(palette, 'vla-stage-policy', [350, 18, 405, 42], 'B  Object grounding', 32),
    makeStage(palette, 'vla-stage-method', [790, 18, 475, 42], 'C  Grounded action flow', 32),
    makeStage(palette, 'vla-stage-control', [1300, 18, 335, 42], 'D  Project + control', 32),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [40, 85, 190, 190], label: 'oₜ', imageUrl: vlaFront,
      rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-front.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', box: [40, 315, 260, 100], label: 'ℓ + sₜ',
      description: 'red cube → tray', tone: 'amber', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-input-join', role: 'bridge', kind: 'summing-junction', box: [325, 142, 24, 24], label: '', tone: 'neutral',
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [370, 95, 145, 115],
      label: 'Tokens X₀', tone: 'amber', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [550, 85, 180, 140],
      label: options.backbone, tone: 'violet', variant: 'vlm', fontSize: 30,
    }),
    makeNode(palette, {
      id: 'vla-grounding', role: 'token', kind: 'scientific-attention-map', box: [370, 275, 360, 155],
      label: 'Object tokens zₒᵦⱼ', description: 'cross-view identity', tone: 'neutral', variant: 'multiview', fontSize: 29,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [805, 85, 440, 150],
      label: 'Grounded action flow v(θ)', description: 'v(θ)(Aτ | zₒᵦⱼ, sₜ, τ)', tone: 'coral',
      variant: 'diffusion-action', fontSize: 31, borderWidth: 3.2,
    }),
    makeNode(palette, {
      id: 'vla-flow-objective', role: 'loss', box: [805, 275, 440, 85], label: 'Flow matching',
      description: 'LFM=E||vθ−uτ||²', tone: 'coral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-action-condition', role: 'token', box: [805, 430, 90, 90], label: 'A₀=ε', tone: 'amber', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-ode-solver', role: 'policy', box: [930, 420, 130, 105], label: 'ODE', description: 'NFE=10', tone: 'coral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1100, 415, 145, 115],
      label: 'Aₜ:ₜ₊H', description: '∈ ℝᴴ×⁷', tone: 'blue', variant: 'action-horizon', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-constraints', role: 'token', box: [1315, 285, 135, 100], label: 'C(sₜ)',
      tone: 'neutral', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-decision', role: 'policy', box: [1315, 425, 135, 115], label: 'Project Π', tone: 'neutral', fontSize: 28,
    }),
    makeNode(palette, {
      id: 'vla-baseline', role: 'policy', box: [550, 470, 180, 80], label: 'AR head', description: 'baseline',
      tone: 'violet', fontSize: 27,
    }),
    makeNode(palette, {
      id: 'vla-controller', role: 'action', box: [1475, 425, 150, 115], label: 'MPC · K=4', tone: 'blue', fontSize: 29,
    }),
    makeStage(palette, 'vla-stage-execution', [25, 610, 1600, 42], 'E  Illustrative rollout', 32),
  );

  const frames = [
    ['vla-exec-observe', vlaObservePrint, 'τ₀', 735, 'vla-observe-print.jpg'],
    ['vla-robot', vlaApproachPrint, 'τ₄', 915, 'vla-approach-print.jpg'],
    ['vla-contact', vlaGraspPrint, 'τ₈', 1095, 'vla-grasp-print.jpg'],
    ['vla-reobserve', vlaPlacePrint, 'oₜ₊₁', 1275, 'vla-place-print.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(makeImage(palette, {
      id, role: 'environment', box: [x, 680, 150, 180], label, imageUrl: image, imageFit: 'cover',
      rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef, promptRef: VLA_PROMPT_REF,
    }));
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [40, 680, 635, 180],
      label: 'End-effector path', description: 'xₑₑ(t:t+12)', tone: 'blue', fontSize: 30,
    }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-input-join', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', arrowEnd: 'none' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-input-join', sourceHandle: 'right', targetHandle: 'bottom', routing: 'straight', arrowEnd: 'none' }),
    makeEdge(palette, { source: 'vla-input-join', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-grounding', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control', label: 'zₒᵦⱼ' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 30, dy: 0 },
        { origin: 'target', dx: 280, dy: -20 },
        { origin: 'target', dx: 0, dy: -20 },
      ],
    }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, {
      source: 'vla-decision', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control',
    }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-baseline', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, {
      source: 'vla-baseline', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted',
      routeWaypoints: [
        { origin: 'source', dx: 35, dy: 0 },
        { origin: 'target', dx: -280, dy: 35 },
        { origin: 'target', dx: 0, dy: 35 },
      ],
    }),
    makeEdge(palette, {
      source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 125 },
        { origin: 'target', dx: 0, dy: -15 },
      ],
    }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, {
      source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 90 },
        { origin: 'target', dx: -20, dy: 770 },
        { origin: 'target', dx: -20, dy: 0 },
      ],
      label: 'reobserve · next oₜ', labelFontSize: 24, labelOffsetY: 405,
    }),
  ];
  return { nodes, edges, width, height };
}

function vlaPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makePresentationStage(palette, 'vla-stage-input', [35, 20, 280, 70], 'A  Task state', 40),
    makePresentationStage(palette, 'vla-stage-ground', [350, 20, 390, 70], 'B  Ground objects', 40),
    makePresentationStage(palette, 'vla-stage-method', [790, 20, 350, 70], 'C  Grounded flow', 40),
    makePresentationStage(palette, 'vla-stage-control', [1145, 20, 480, 70], 'D  Receding-horizon MPC', 36),
    makeImage(palette, {
      id: 'vla-camera-front', role: 'environment', box: [40, 105, 190, 190], label: 'oₜ', imageUrl: vlaFront,
      rasterWidthPx: 600, rasterHeightPx: 600, sourceRef: 'vla-front.jpg', promptRef: VLA_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'vla-state', role: 'modality', box: [40, 340, 270, 110], label: 'ℓ + sₜ', tone: 'amber', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-input-join', role: 'bridge', kind: 'summing-junction', box: [330, 158, 26, 26], label: '', tone: 'neutral',
    }),
    makeNode(palette, {
      id: 'vla-fusion', role: 'token', kind: 'scientific-token-strip', box: [370, 120, 160, 120], label: 'Tokens X₀', tone: 'amber', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-backbone', role: 'backbone', kind: 'scientific-transformer', box: [570, 100, 190, 160],
      label: 'VLM', tone: 'violet', variant: 'vlm', fontSize: 41,
    }),
    makeNode(palette, {
      id: 'vla-grounding', role: 'token', kind: 'scientific-attention-map', box: [370, 310, 390, 140],
      label: 'Object tokens zₒᵦⱼ', tone: 'neutral', variant: 'multiview', fontSize: 40,
    }),
    makeNode(palette, {
      id: 'vla-action-expert', role: 'policy', kind: 'scientific-layer-stack', box: [810, 100, 320, 180],
      label: 'Flow v(θ)', description: 'Aτ | zₒᵦⱼ, sₜ, τ', tone: 'coral', variant: 'diffusion-action',
      fontSize: 41, borderWidth: 3.2,
    }),
    makeNode(palette, { id: 'vla-flow-objective', role: 'loss', box: [810, 285, 320, 110], label: 'LFM', description: 'E||vθ−uτ||²', tone: 'coral', fontSize: 39 }),
    makeNode(palette, { id: 'vla-action-condition', role: 'token', box: [810, 440, 85, 85], label: 'ε', tone: 'amber', fontSize: 39 }),
    makeNode(palette, { id: 'vla-ode-solver', role: 'policy', box: [915, 430, 110, 105], label: 'ODE', tone: 'coral', fontSize: 40 }),
    makeNode(palette, {
      id: 'vla-action-chunk', role: 'action', kind: 'scientific-action-chunk', box: [1025, 410, 175, 140],
      label: 'Aₜ:ₜ₊H', description: '∈ ℝᴴ×⁷', tone: 'blue', variant: 'action-horizon', fontSize: 34,
    }),
    makeNode(palette, { id: 'vla-constraints', role: 'token', box: [1225, 295, 175, 105], label: 'C(sₜ)', tone: 'neutral', fontSize: 39 }),
    makeNode(palette, { id: 'vla-decision', role: 'policy', box: [1225, 430, 175, 110], label: 'Project Π', tone: 'neutral', fontSize: 39 }),
    makeNode(palette, { id: 'vla-baseline', role: 'policy', box: [462, 455, 205, 100], label: 'AR head', description: 'baseline', tone: 'violet', fontSize: 35 }),
    makePresentationStage(palette, 'vla-stage-execution', [35, 590, 1590, 70], 'E  Illustrative rollout', 40),
    makeNode(palette, { id: 'vla-controller', role: 'action', box: [1430, 415, 180, 135], label: 'MPC · K=4', tone: 'blue', fontSize: 40 }),
  );

  const frames = [
    ['vla-exec-observe', vlaObservePrint, 'τ₀', 635, 'vla-observe-print.jpg'],
    ['vla-robot', vlaApproachPrint, 'τ₄', 830, 'vla-approach-print.jpg'],
    ['vla-contact', vlaGraspPrint, 'τ₈', 1025, 'vla-grasp-print.jpg'],
    ['vla-reobserve', vlaPlacePrint, 'oₜ₊₁', 1220, 'vla-place-print.jpg'],
  ] as const;
  for (const [id, image, label, x, sourceRef] of frames) {
    nodes.push(makeImage(palette, {
      id, role: 'environment', box: [x, 660, 170, 150], label, imageUrl: image, imageFit: 'cover',
      rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef, promptRef: VLA_PROMPT_REF,
    }));
  }
  nodes.push(
    makeNode(palette, {
      id: 'vla-trajectory', role: 'action', kind: 'scientific-trajectory', box: [35, 660, 565, 150],
      label: 'End-effector path', description: 'xₑₑ(t:t+12)', tone: 'blue', fontSize: 40,
    }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'vla-camera-front', target: 'vla-input-join', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', arrowEnd: 'none' }),
    makeEdge(palette, { source: 'vla-state', target: 'vla-input-join', sourceHandle: 'right', targetHandle: 'bottom', routing: 'straight', arrowEnd: 'none' }),
    makeEdge(palette, { source: 'vla-input-join', target: 'vla-fusion', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-fusion', target: 'vla-backbone', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'vla-backbone', target: 'vla-grounding', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-action-expert', sourceHandle: 'right', targetHandle: 'left', semantic: 'control', label: 'zₒᵦⱼ' }),
    makeEdge(palette, { source: 'vla-flow-objective', target: 'vla-action-expert', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'vla-action-condition', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'vla-action-expert', target: 'vla-ode-solver', sourceHandle: 'right', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 30, dy: 0 },
        { origin: 'target', dx: 195, dy: -25 },
        { origin: 'target', dx: 0, dy: -25 },
      ],
    }),
    makeEdge(palette, { source: 'vla-ode-solver', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-action-chunk', target: 'vla-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
    makeEdge(palette, { source: 'vla-constraints', target: 'vla-decision', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, {
      source: 'vla-decision', target: 'vla-controller', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control',
    }),
    makeEdge(palette, { source: 'vla-grounding', target: 'vla-baseline', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, {
      source: 'vla-baseline', target: 'vla-action-chunk', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional', lineStyle: 'dotted',
      targetAnchorOffset: { dx: -84, dy: -76 },
      routeWaypoints: [
        { origin: 'source', dx: 35, dy: 0 },
        { origin: 'source', dx: 35, dy: 65 },
        { origin: 'target', dx: 0, dy: 96 },
      ],
    }),
    makeEdge(palette, {
      source: 'vla-controller', target: 'vla-exec-observe', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 80 },
        { origin: 'target', dx: 0, dy: -10 },
      ],
    }),
    makeEdge(palette, { source: 'vla-exec-observe', target: 'vla-robot', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'vla-robot', target: 'vla-contact', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'vla-contact', target: 'vla-reobserve', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, {
      source: 'vla-reobserve', target: 'vla-camera-front', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 30 },
        { origin: 'target', dx: -20, dy: 640 },
        { origin: 'target', dx: -20, dy: 0 },
      ],
      label: 'reobserve · next oₜ', labelFontSize: 30, labelOffsetY: 335,
    }),
  ];
  return { nodes, edges, width, height };
}

function worldSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-context', [35, 5, 293, 34], 'A  Scene + belief', 27),
    makeStage(palette, 'wm-stage-model', [360, 5, 390, 34], 'B  Model + plans', 27),
    makeImage(palette, {
      id: 'wm-context', role: 'environment', box: [20, 55, 125, 125], label: 'oₜ', imageUrl: worldCurrent,
      imageFit: 'cover', rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'world-observed.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, { id: 'wm-goal', role: 'token', box: [20, 190, 125, 55], label: 'Goal g', tone: 'amber', fontSize: 26 }),
    makeNode(palette, {
      id: 'wm-encoder', role: 'backbone', kind: 'scientific-feature-map', box: [175, 55, 150, 115],
      label: 'Belief E(φ)', description: 'bₜ ← o≤t', tone: 'blue', variant: 'world-model', fontSize: 24,
    }),
    makeNode(palette, { id: 'wm-baseline', role: 'policy', box: [175, 190, 150, 50], label: 'Baseline', tone: 'violet', fontSize: 24 }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-layer-stack', box: [370, 55, 200, 115],
      label: 'World F(θ)', description: 'ẑᵐ=F(θ; bₜ,aᵐ)', tone: 'green', variant: 'world-model', fontSize: 27, borderWidth: 3,
    }),
    makeNode(palette, { id: 'wm-action-set', role: 'action', kind: 'scientific-action-chunk', box: [600, 70, 150, 100], label: 'Plans a¹:ᴹ', tone: 'blue', fontSize: 26 }),
    makeStage(palette, 'wm-stage-rollout', [35, 250, 300, 34], 'C  Illustrative rollouts', 25),
    makeStage(palette, 'wm-stage-select', [510, 250, 240, 34], 'D  Select + act', 27),
    makeNode(palette, {
      id: 'wm-rollout-fanout', role: 'bridge', kind: 'on-page-connector', box: [304, 288, 14, 14], label: '',
      fill: palette.edge.broadcast, stroke: palette.tones.neutral.fill, borderWidth: 0.35, tone: 'neutral',
    }),
    makeImage(palette, {
      id: 'wm-rollout-a', role: 'environment', box: [20, 305, 120, 90], label: 'A', imageUrl: worldSuccess,
      imageFit: 'cover', rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'world-success.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeImage(palette, {
      id: 'wm-rollout-b', role: 'environment', box: [180, 305, 120, 90], label: 'B', imageUrl: worldCollision,
      imageFit: 'cover', rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'world-collision.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeImage(palette, {
      id: 'wm-rollout-c', role: 'environment', box: [340, 305, 120, 90], label: 'C', imageUrl: worldUncertain,
      imageFit: 'cover', rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'world-occluded.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, {
      id: 'wm-score-vector', role: 'loss', box: [150, 435, 350, 50],
      label: 'Jₘ=J₁+λ₁J₂+λ₂U₃', tone: 'neutral', fontSize: 23,
    }),
    makeCaption(palette, 'wm-cost-a', [20, 398, 120, 35], 'J₁ goal', 23),
    makeCaption(palette, 'wm-cost-b', [160, 398, 160, 35], 'J₂ contact', 23),
    makeCaption(palette, 'wm-cost-c', [330, 398, 180, 35], 'U₃ epistemic', 23),
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', kind: 'scientific-decision-gate', box: [530, 315, 220, 100],
      label: 'm⁎=argminₘ Jₘ', tone: 'coral', fontSize: 26,
    }),
    makeNode(palette, { id: 'wm-action', role: 'action', box: [530, 435, 95, 55], label: 'aᵐ⁎', tone: 'blue', fontSize: 24 }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [655, 425, 95, 65], label: 'oₜ₊₁', imageUrl: worldActual,
      imageFit: 'cover', rasterWidthPx: 400, rasterHeightPx: 600, sourceRef: 'world-success.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeStage(palette, 'wm-stage-feedback', [35, 495, 430, 40], 'E  Belief update → next cycle', 23),
    makeNode(palette, { id: 'wm-error', role: 'loss', box: [540, 540, 130, 60], label: 'rₜ₊₁', tone: 'coral', fontSize: 23 }),
    makeNode(palette, { id: 'wm-update', role: 'policy', box: [270, 540, 240, 60], label: 'G(φ) · θ fixed', tone: 'green', fontSize: 23 }),
    makeNode(palette, { id: 'wm-next-belief', role: 'policy', box: [60, 540, 190, 60], label: 'bₜ₊₁', tone: 'blue', fontSize: 23 }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-context', target: 'wm-encoder', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-encoder', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'wm-encoder', target: 'wm-baseline', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted',
    }),
    makeEdge(palette, { source: 'wm-action-set', target: 'wm-model', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-fanout', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, {
      source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'left', targetHandle: 'top', semantic: 'broadcast',
      routeWaypoints: [
        { origin: 'source', dx: -5, dy: 0 },
        { origin: 'source', dx: -5, dy: 8 },
        { origin: 'target', dx: 0, dy: -5 },
      ],
    }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, {
      source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'top', semantic: 'broadcast',
      routeWaypoints: [
        { origin: 'source', dx: 5, dy: 0 },
        { origin: 'source', dx: 5, dy: 8 },
        { origin: 'target', dx: 0, dy: -5 },
      ],
    }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-cost-a', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-cost-b', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-cost-c', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-score-vector', sourceHandle: 'bottom', targetHandle: 'left', semantic: 'control', routeWaypoints: [{ origin: 'source', dx: 0, dy: 1 }, { origin: 'target', dx: -8, dy: -24 }, { origin: 'target', dx: -8, dy: 0 }] }),
    makeEdge(palette, { source: 'wm-cost-b', target: 'wm-score-vector', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-cost-c', target: 'wm-score-vector', sourceHandle: 'bottom', targetHandle: 'right', semantic: 'control', routeWaypoints: [{ origin: 'source', dx: 0, dy: 1 }, { origin: 'target', dx: 8, dy: -24 }, { origin: 'target', dx: 8, dy: 0 }] }),
    makeEdge(palette, {
      source: 'wm-score-vector', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 15, dy: 0 },
        { origin: 'target', dx: -15, dy: 0 },
      ],
    }),
    makeEdge(palette, {
      source: 'wm-goal', target: 'wm-encoder', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control',
      routeWaypoints: [{ origin: 'source', dx: 15, dy: 0 }, { origin: 'target', dx: -15, dy: 112.5 }, { origin: 'target', dx: -15, dy: 0 }],
    }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-reobserve', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'bottom', targetHandle: 'right', semantic: 'data', lineStyle: 'solid', routeWaypoints: [{ origin: 'source', dx: 0, dy: 35 }, { origin: 'target', dx: 15, dy: 0 }] }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-update', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid', routeWaypoints: [{ origin: 'source', dx: -8, dy: 0 }, { origin: 'target', dx: 8, dy: 0 }] }),
    makeEdge(palette, {
      source: 'wm-update', target: 'wm-next-belief', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [{ origin: 'source', dx: -10, dy: 0 }, { origin: 'target', dx: 10, dy: 0 }],
    }),
    makeEdge(palette, {
      source: 'wm-next-belief', target: 'wm-encoder', sourceHandle: 'left', targetHandle: 'top', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: -38, dy: 0 },
        { origin: 'target', dx: -228, dy: -5 },
        { origin: 'target', dx: 0, dy: -5 },
      ],
    }),
  ];
  return { nodes, edges, width, height };
}

function worldDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'wm-stage-context', [35, 18, 290, 42], 'A  Scene + goal', 32),
    makeStage(palette, 'wm-stage-belief', [360, 18, 420, 42], 'B  Belief + world model', 32),
    makeStage(palette, 'wm-stage-rollout', [815, 18, 450, 42], 'C  Illustrative rollouts', 32),
    makeStage(palette, 'wm-stage-select', [1320, 18, 305, 42], 'D  Select + act', 32),
    makeImage(palette, {
      id: 'wm-context', role: 'environment', box: [40, 90, 200, 220], label: 'oₜ', imageUrl: worldCurrentPrint,
      imageFit: 'cover', rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef: 'world-observed-print.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, { id: 'wm-goal', role: 'token', box: [40, 350, 280, 90], label: 'Goal g', description: 'cube → tray', tone: 'amber', fontSize: 28 }),
    makeNode(palette, {
      id: 'wm-encoder', role: 'backbone', kind: 'scientific-feature-map', box: [370, 95, 170, 140],
      label: 'Encoder E(φ)', tone: 'blue', variant: 'world-model', fontSize: 29,
    }),
    makeNode(palette, { id: 'wm-belief', role: 'token', kind: 'scientific-tensor', box: [580, 95, 180, 140], label: 'Latent belief bₜ', tone: 'blue', fontSize: 29 }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-layer-stack', box: [535, 300, 245, 180],
      label: 'World model F(θ)', description: 'ẑᵐ=F(θ; bₜ,aᵐ)', tone: 'green', variant: 'world-model', fontSize: 30, borderWidth: 3.2,
    }),
    makeNode(palette, { id: 'wm-action-set', role: 'action', kind: 'scientific-action-chunk', box: [370, 300, 130, 110], label: 'Plans a¹:ᴹ', tone: 'blue', fontSize: 28 }),
    makeNode(palette, { id: 'wm-baseline', role: 'policy', box: [580, 245, 180, 40], label: 'Baseline', tone: 'violet', fontSize: 26 }),
    makeNode(palette, {
      id: 'wm-rollout-fanout', role: 'bridge', kind: 'on-page-connector', box: [790, 382, 14, 14], label: '',
      fill: palette.edge.broadcast, stroke: palette.tones.neutral.fill, borderWidth: 0.35, tone: 'neutral',
    }),
  );
  const futures = [
    ['wm-rollout-a', worldSuccessPrint, 'A', 'wm-cost-a', 'J₁ goal', 'green', 90, 'world-success-print.jpg'],
    ['wm-rollout-b', worldCollisionPrint, 'B', 'wm-cost-b', 'J₂ contact', 'coral', 245, 'world-collision-print.jpg'],
    ['wm-rollout-c', worldUncertainPrint, 'C', 'wm-cost-c', 'U₃ epistemic', 'amber', 400, 'world-occluded-print.jpg'],
  ] as const;
  for (const [id, image, label, costId, costLabel, tone, y, sourceRef] of futures) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [815, y, 140, 130], label, imageUrl: image, imageFit: 'cover',
        rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef, promptRef: WORLD_PROMPT_REF,
      }),
      makeNode(palette, { id: costId, role: 'loss', box: [980, y, 285, 130], label: costLabel, tone, fontSize: 28 }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', kind: 'scientific-decision-gate', box: [1320, 200, 305, 160],
      label: 'm⁎=argminₘ Jₘ', description: 'Jₘ = J₁ + λ₁J₂ + λ₂U₃', tone: 'coral', fontSize: 30,
    }),
    makeNode(palette, { id: 'wm-score-vector', role: 'bridge', kind: 'summing-junction', box: [1285, 270, 20, 20], label: '', tone: 'neutral' }),
    makeNode(palette, { id: 'wm-action', role: 'action', kind: 'scientific-trajectory', box: [1320, 410, 305, 110], label: 'Execute aᵐ⁎', description: 'receding horizon', tone: 'blue', fontSize: 29 }),
    makeStage(palette, 'wm-stage-feedback', [40, 590, 1585, 42], 'E  Execute, observe, correct belief → next cycle', 32),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [1370, 680, 200, 190], label: 'oₜ₊₁', imageUrl: worldSuccessPrint,
      imageFit: 'cover', rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef: 'world-success-print.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, { id: 'wm-error', role: 'loss', box: [1060, 710, 240, 120], label: 'Latent residual rₜ₊₁', tone: 'coral', fontSize: 28 }),
    makeNode(palette, { id: 'wm-update', role: 'policy', box: [720, 710, 280, 120], label: 'Correct belief', description: 'G(φ); θ fixed', tone: 'green', fontSize: 28 }),
    makeNode(palette, { id: 'wm-next-belief', role: 'policy', kind: 'scientific-tensor', box: [380, 710, 270, 120], label: 'bₜ₊₁', tone: 'blue', fontSize: 28 }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-context', target: 'wm-encoder', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'wm-goal', target: 'wm-encoder', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 15, dy: 0 },
        { origin: 'target', dx: -120, dy: 25 },
        { origin: 'target', dx: 0, dy: 25 },
      ],
    }),
    makeEdge(palette, { source: 'wm-encoder', target: 'wm-belief', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'wm-belief', target: 'wm-model', sourceHandle: 'right', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 30, dy: 0 },
        { origin: 'target', dx: 132.5, dy: -10 },
        { origin: 'target', dx: 0, dy: -10 },
      ],
    }),
    makeEdge(palette, {
      source: 'wm-belief', target: 'wm-baseline', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted',
    }),
    makeEdge(palette, { source: 'wm-action-set', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-fanout', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-rollout-fanout', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-cost-a', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-cost-b', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-cost-c', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-score-vector', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-cost-b', target: 'wm-score-vector', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-cost-c', target: 'wm-score-vector', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-score-vector', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-decision', target: 'wm-action', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, {
      source: 'wm-action', target: 'wm-reobserve', sourceHandle: 'right', targetHandle: 'top', semantic: 'temporal', lineStyle: 'solid',
      routeWaypoints: [{ origin: 'source', dx: 20, dy: 0 }, { origin: 'target', dx: 75, dy: -20 }, { origin: 'target', dx: 0, dy: -20 }],
    }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-update', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid', routeWaypoints: [{ origin: 'source', dx: -12, dy: 0 }, { origin: 'target', dx: 12, dy: 0 }] }),
    makeEdge(palette, {
      source: 'wm-update', target: 'wm-next-belief', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [{ origin: 'source', dx: -12, dy: 0 }, { origin: 'target', dx: 12, dy: 0 }],
    }),
    makeEdge(palette, {
      source: 'wm-next-belief', target: 'wm-encoder', sourceHandle: 'left', targetHandle: 'top', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: -360, dy: 0 },
        { origin: 'target', dx: -435, dy: -20 },
        { origin: 'target', dx: 0, dy: -20 },
      ],
      label: 'next cycle', labelFontSize: 24, labelOffsetX: -220, labelOffsetY: 338,
    }),
  ];
  return { nodes, edges, width, height };
}

function worldPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makePresentationStage(palette, 'wm-stage-context', [35, 20, 280, 70], 'A  Scene', 40),
    makePresentationStage(palette, 'wm-stage-model', [350, 20, 400, 70], 'B  Belief + model', 40),
    makePresentationStage(palette, 'wm-stage-rollout', [790, 20, 455, 70], 'C  Illustrative rollouts', 40),
    makePresentationStage(palette, 'wm-stage-select', [1300, 20, 325, 70], 'D  Select', 40),
    makeImage(palette, {
      id: 'wm-context', role: 'environment', box: [40, 105, 220, 220], label: 'oₜ', imageUrl: worldCurrentPrint,
      imageFit: 'cover', rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef: 'world-observed-print.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, { id: 'wm-goal', role: 'token', box: [40, 360, 280, 100], label: 'Goal g', description: 'cube → tray', tone: 'amber', fontSize: 39 }),
    makeNode(palette, { id: 'wm-encoder', role: 'backbone', kind: 'scientific-feature-map', box: [370, 105, 170, 140], label: 'E(φ)', description: 'belief bₜ', tone: 'blue', fontSize: 40 }),
    makeNode(palette, {
      id: 'wm-model', role: 'backbone', kind: 'scientific-layer-stack', box: [570, 105, 180, 160],
      label: 'F(θ)', description: 'world model', tone: 'green', variant: 'world-model', fontSize: 40, borderWidth: 3.2,
    }),
    makeNode(palette, { id: 'wm-baseline', role: 'policy', box: [370, 310, 170, 95], label: 'Baseline', tone: 'violet', fontSize: 39 }),
    makeNode(palette, { id: 'wm-action-set', role: 'action', kind: 'scientific-action-chunk', box: [570, 310, 180, 95], label: 'a¹:ᴹ', description: 'plans', tone: 'blue', fontSize: 39 }),
  );
  const rows = [
    ['wm-rollout-a', worldSuccessPrint, 'A', 'wm-cost-a', 'J₁ goal', 'green', 105, 'world-success-print.jpg'],
    ['wm-rollout-b', worldCollisionPrint, 'B', 'wm-cost-b', 'J₂ contact', 'coral', 255, 'world-collision-print.jpg'],
    ['wm-rollout-c', worldUncertainPrint, 'C', 'wm-cost-c', 'U₃ epistemic', 'amber', 405, 'world-occluded-print.jpg'],
  ] as const;
  for (const [id, image, label, costId, costLabel, tone, y, sourceRef] of rows) {
    nodes.push(
      makeImage(palette, {
        id, role: 'environment', box: [790, y, 145, 120], label, imageUrl: image, imageFit: 'cover',
        rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef, promptRef: WORLD_PROMPT_REF,
      }),
      makeNode(palette, { id: costId, role: 'loss', box: [965, y, 280, 120], label: costLabel, tone, fontSize: 39 }),
    );
  }
  nodes.push(
    makeNode(palette, {
      id: 'wm-decision', role: 'policy', kind: 'scientific-decision-gate', box: [1300, 210, 325, 150],
      label: 'm⁎=argminₘ Jₘ', description: 'Jₘ = J₁ + λ₁J₂ + λ₂U₃', tone: 'coral', fontSize: 37,
    }),
    makeNode(palette, { id: 'wm-score-vector', role: 'bridge', kind: 'summing-junction', box: [1265, 275, 20, 20], label: '', tone: 'neutral' }),
    makePresentationStage(palette, 'wm-stage-feedback', [350, 570, 1275, 70], 'E  Execute + belief correction → next cycle · θ fixed', 37),
    makeNode(palette, { id: 'wm-action', role: 'action', box: [1450, 655, 175, 100], label: 'Act aᵐ⁎', tone: 'blue', fontSize: 39 }),
    makeImage(palette, {
      id: 'wm-reobserve', role: 'environment', box: [1240, 640, 170, 130], label: 'oₜ₊₁', imageUrl: worldSuccessPrint,
      imageFit: 'cover', rasterWidthPx: 800, rasterHeightPx: 1200, sourceRef: 'world-success-print.jpg', promptRef: WORLD_PROMPT_REF,
    }),
    makeNode(palette, { id: 'wm-error', role: 'loss', box: [980, 655, 210, 100], label: 'rₜ₊₁', tone: 'coral', fontSize: 39 }),
    makeNode(palette, { id: 'wm-update', role: 'policy', box: [665, 640, 280, 130], label: 'Correct belief', description: 'G(φ); θ fixed', tone: 'green', fontSize: 37 }),
    makeNode(palette, { id: 'wm-next-belief', role: 'policy', kind: 'scientific-tensor', box: [380, 640, 250, 130], label: 'bₜ₊₁', tone: 'blue', fontSize: 39 }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'wm-context', target: 'wm-encoder', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-goal', target: 'wm-encoder', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-encoder', target: 'wm-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'wm-encoder', target: 'wm-baseline', sourceHandle: 'right', targetHandle: 'right', semantic: 'optional', lineStyle: 'dotted',
      routeWaypoints: [{ origin: 'source', dx: 20, dy: 0 }, { origin: 'target', dx: 20, dy: 0 }],
    }),
    makeEdge(palette, { source: 'wm-action-set', target: 'wm-model', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-a', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-b', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-model', target: 'wm-rollout-c', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'broadcast' }),
    makeEdge(palette, { source: 'wm-rollout-a', target: 'wm-cost-a', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-rollout-b', target: 'wm-cost-b', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-rollout-c', target: 'wm-cost-c', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'wm-cost-a', target: 'wm-score-vector', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-cost-b', target: 'wm-score-vector', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-cost-c', target: 'wm-score-vector', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'wm-score-vector', target: 'wm-decision', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'wm-decision', target: 'wm-action', sourceHandle: 'right', targetHandle: 'top', semantic: 'temporal', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'target', dx: 107.5, dy: -20 },
        { origin: 'target', dx: 0, dy: -20 },
      ],
    }),
    makeEdge(palette, { source: 'wm-action', target: 'wm-reobserve', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', semantic: 'temporal', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-reobserve', target: 'wm-error', sourceHandle: 'left', targetHandle: 'right', routing: 'straight', lineStyle: 'solid' }),
    makeEdge(palette, { source: 'wm-error', target: 'wm-update', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid', routeWaypoints: [{ origin: 'source', dx: -10, dy: 0 }, { origin: 'target', dx: 10, dy: 0 }] }),
    makeEdge(palette, {
      source: 'wm-update', target: 'wm-next-belief', sourceHandle: 'left', targetHandle: 'right', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [{ origin: 'source', dx: -12, dy: 0 }, { origin: 'target', dx: 12, dy: 0 }],
    }),
    makeEdge(palette, {
      source: 'wm-next-belief', target: 'wm-encoder', sourceHandle: 'left', targetHandle: 'top', semantic: 'feedback', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: -360, dy: 0 },
        { origin: 'target', dx: -435, dy: -20 },
        { origin: 'target', dx: 0, dy: -20 },
      ],
      label: 'next cycle', labelFontSize: 30, labelOffsetX: -220, labelOffsetY: 300,
    }),
  ];
  return { nodes, edges, width, height };
}

function llmSingle(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('single-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [18, 8, 242, 34], 'A  Shared SFT', 27),
    makeStage(palette, 'lt-stage-evidence', [285, 8, 465, 34], 'B  Preference evidence', 27),
    makeNode(palette, { id: 'lt-base-model', role: 'backbone', kind: 'scientific-frozen', box: [20, 58, 100, 70], label: 'Base π₀', tone: 'violet', fontSize: 24 }),
    makeNode(palette, { id: 'lt-sft-model', role: 'backbone', kind: 'scientific-frozen', box: [140, 58, 110, 72], label: 'Frozen πₛ', tone: 'blue', fontSize: 24 }),
    makeNode(palette, { id: 'lt-instruction-data', role: 'token', kind: 'scientific-dataset-stack', box: [20, 145, 100, 75], label: 'SFT data', tone: 'amber', fontSize: 24 }),
    makeNode(palette, { id: 'lt-sft-objective', role: 'loss', box: [140, 145, 110, 75], label: 'SFT', description: 'NLL', tone: 'coral', fontSize: 23 }),
    makeNode(palette, { id: 'lt-prompt-sample', role: 'token', kind: 'scientific-prompt-card', box: [285, 58, 130, 95], label: 'Prompt x', description: 'Why does ice float?', tone: 'blue', fontSize: 24 }),
    makeNode(palette, { id: 'lt-preference-data', role: 'token', kind: 'scientific-preference-pair', box: [440, 58, 135, 100], label: 'Chosen ≻ reject', tone: 'green', fontSize: 24 }),
    makeNode(palette, { id: 'lt-confidence', role: 'token', kind: 'scientific-probability-bars', box: [590, 58, 140, 85], label: 'Confidence cᵢ', tone: 'neutral', fontSize: 24 }),
    makeNode(palette, { id: 'lt-confidence-gate', role: 'policy', box: [590, 165, 140, 55], label: 'wᵢ', tone: 'amber', fontSize: 24 }),
    makeStage(palette, 'lt-stage-method', [18, 235, 502, 34], 'C  CW-DPO', 27),
    makePanel(palette, 'lt-method-panel', [285, 270, 230, 225], 'green'),
    makeNode(palette, {
      id: 'lt-reference-port', role: 'bridge', kind: 'on-page-connector', box: [325, 266, 14, 14], label: '',
      fill: palette.edge.control, stroke: palette.tones.neutral.fill, borderWidth: 0.35, tone: 'neutral',
    }),
    makeNode(palette, {
      id: 'lt-preference-port', role: 'bridge', kind: 'on-page-connector', box: [393, 266, 14, 14], label: '',
      fill: palette.edge.control, stroke: palette.tones.neutral.fill, borderWidth: 0.35, tone: 'neutral',
    }),
    makeNode(palette, {
      id: 'lt-weight-port', role: 'bridge', kind: 'on-page-connector', box: [461, 266, 14, 14], label: '',
      fill: palette.edge.control, stroke: palette.tones.neutral.fill, borderWidth: 0.35, tone: 'neutral',
    }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-equation', box: [300, 280, 200, 95],
      label: 'CW-DPO', description: '−Σ wᵢ log σ {\nβ[Δθ−Δs]}', tone: 'coral', fontSize: 23, borderWidth: 3,
    }),
    makeNode(palette, { id: 'lt-dpo-checkpoint', role: 'backbone', kind: 'scientific-trainable', box: [300, 425, 205, 65], label: 'Trainable π(θ)', tone: 'green', fontSize: 23 }),
    makeCaption(palette, 'lt-implicit-reward', [25, 300, 225, 120], 'r̂(θ)=β log\n[π(θ)/πₛ]', 23, 'diagnostic only', 'left'),
    makeStage(palette, 'lt-stage-baseline', [540, 235, 210, 34], 'D  RM + PPO', 25),
    makePanel(palette, 'lt-baseline-panel', [540, 315, 210, 180], 'violet'),
    makeNode(palette, { id: 'lt-rlhf-objective', role: 'loss', box: [550, 335, 85, 55], label: 'RM', tone: 'coral', fontSize: 23 }),
    makeNode(palette, { id: 'lt-reward-model', role: 'policy', box: [650, 335, 85, 55], label: 'r(φ)', tone: 'violet', fontSize: 23 }),
    makeNode(palette, { id: 'lt-rollout', role: 'token', box: [550, 420, 85, 50], label: 'y~π', tone: 'blue', fontSize: 23 }),
    makeNode(palette, { id: 'lt-ppo-loop', role: 'policy', box: [650, 420, 85, 50], label: 'PPO', tone: 'violet', fontSize: 23 }),
    makeStage(palette, 'lt-stage-deploy', [18, 495, 732, 34], 'E  Proposed-policy inference', 25),
    makeNode(palette, { id: 'lt-inference-prompt', role: 'token', box: [25, 540, 170, 60], label: 'Held-out x', tone: 'blue', fontSize: 23 }),
    makeNode(palette, { id: 'lt-deploy-model', role: 'backbone', box: [285, 540, 200, 60], label: 'Frozen π(θ)', tone: 'green', fontSize: 23 }),
    makeNode(palette, { id: 'lt-response', role: 'token', box: [520, 540, 80, 60], label: 'y', tone: 'blue', fontSize: 23 }),
    makeNode(palette, { id: 'lt-release-gate', role: 'policy', kind: 'scientific-release-gate', box: [625, 540, 120, 60], label: 'Gate', tone: 'green', fontSize: 23 }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-confidence', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-confidence', target: 'lt-confidence-gate', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, {
      source: 'lt-sft-model', target: 'lt-reference-port', sourceHandle: 'right', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'target', dx: -62, dy: -18 },
        { origin: 'target', dx: 0, dy: -18 },
      ],
      label: 'ref. πₛ', labelFontSize: 18, labelOffsetX: 6, labelOffsetY: 8,
    }),
    makeEdge(palette, {
      source: 'lt-preference-data', target: 'lt-preference-port', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control',
    }),
    makeEdge(palette, {
      source: 'lt-confidence-gate', target: 'lt-weight-port', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 8 },
        { origin: 'target', dx: 62, dy: -38 },
        { origin: 'target', dx: 62, dy: -8 },
        { origin: 'target', dx: 0, dy: -8 },
      ],
    }),
    makeEdge(palette, { source: 'lt-reference-port', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-preference-port', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-weight-port', target: 'lt-dpo-objective', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed',
      label: 'optimize', labelFontSize: 18, labelOffsetY: 12,
    }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, {
      source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'temporal', lineStyle: 'solid',
      label: 'freeze', labelFontSize: 20, labelOffsetX: 65,
    }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

function llmDouble(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('double-column');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makeStage(palette, 'lt-stage-reference', [25, 18, 335, 42], 'A  Shared SFT', 32),
    makeStage(palette, 'lt-stage-evidence', [400, 18, 340, 42], 'B  Preferences', 32),
    makeStage(palette, 'lt-stage-method', [780, 18, 455, 42], 'C  CW-DPO', 32),
    makeStage(palette, 'lt-stage-baseline', [1270, 18, 355, 42], 'D  RM + PPO baseline', 32),
    makeNode(palette, { id: 'lt-base-model', role: 'backbone', kind: 'scientific-frozen', box: [40, 115, 145, 110], label: 'Base π₀', tone: 'violet', fontSize: 28 }),
    makeNode(palette, { id: 'lt-sft-model', role: 'backbone', kind: 'scientific-frozen', box: [215, 110, 155, 125], label: 'Frozen πₛ', tone: 'blue', fontSize: 28 }),
    makeNode(palette, { id: 'lt-instruction-data', role: 'token', kind: 'scientific-dataset-stack', box: [40, 345, 145, 120], label: 'SFT data', tone: 'amber', fontSize: 28 }),
    makeNode(palette, { id: 'lt-sft-objective', role: 'loss', box: [215, 350, 155, 110], label: 'SFT loss', description: '−log πₛ(y*|x)', tone: 'coral', fontSize: 28 }),
    makeNode(palette, { id: 'lt-prompt-sample', role: 'token', kind: 'scientific-prompt-card', box: [400, 115, 160, 125], label: 'Prompt x', description: 'Why does ice float?', tone: 'blue', fontSize: 28 }),
    makeNode(palette, { id: 'lt-preference-data', role: 'token', kind: 'scientific-preference-pair', box: [590, 110, 150, 140], label: 'Preferred ≻ rejected', tone: 'green', fontSize: 27 }),
    makeNode(palette, { id: 'lt-confidence', role: 'token', kind: 'scientific-probability-bars', box: [400, 360, 160, 105], label: 'Confidence cᵢ', tone: 'neutral', fontSize: 27 }),
    makeNode(palette, { id: 'lt-confidence-gate', role: 'policy', box: [590, 355, 150, 115], label: 'Weight wᵢ', description: 'gradient scale', tone: 'amber', fontSize: 27 }),
    makePanel(palette, 'lt-method-panel', [780, 105, 455, 505], 'green'),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-equation', box: [805, 125, 405, 155],
      label: 'CW-DPO objective', description: '−Σ wᵢ log σ { β [Δ(θ) − Δ(s)] }', tone: 'coral', fontSize: 30, borderWidth: 3.2,
    }),
    makeNode(palette, { id: 'lt-dpo-checkpoint', role: 'backbone', kind: 'scientific-trainable', box: [850, 350, 275, 140], label: 'Trainable policy π(θ)', description: 'initialized from πₛ', tone: 'green', fontSize: 29 }),
    makeCaption(palette, 'lt-implicit-reward', [1020, 505, 190, 95], 'r̂(θ)=β log\n[π(θ)/πₛ]', 22, 'diagnostic only', 'left'),
    makePanel(palette, 'lt-baseline-panel', [1270, 105, 355, 505], 'violet'),
    makeNode(palette, { id: 'lt-rlhf-objective', role: 'loss', box: [1290, 135, 140, 105], label: 'RM loss', tone: 'coral', fontSize: 26 }),
    makeNode(palette, { id: 'lt-reward-model', role: 'policy', box: [1460, 135, 140, 105], label: 'Reward r(φ)', tone: 'violet', fontSize: 26 }),
    makeNode(palette, { id: 'lt-rollout', role: 'token', box: [1290, 300, 140, 105], label: 'Rollout', tone: 'blue', fontSize: 26 }),
    makeNode(palette, { id: 'lt-ppo-loop', role: 'policy', box: [1460, 300, 140, 105], label: 'PPO update', tone: 'violet', fontSize: 26 }),
    makeNode(palette, { id: 'lt-rlhf-checkpoint', role: 'backbone', box: [1370, 465, 155, 100], label: 'RLHF baseline', tone: 'violet', fontSize: 26 }),
    makeStage(palette, 'lt-stage-deploy', [430, 675, 1195, 42], 'E  Proposed-policy inference', 32),
    makeNode(palette, { id: 'lt-inference-prompt', role: 'token', kind: 'scientific-prompt-card', box: [430, 760, 220, 125], label: 'Held-out prompt x', tone: 'blue', fontSize: 28 }),
    makeNode(palette, { id: 'lt-deploy-model', role: 'backbone', kind: 'scientific-frozen', box: [850, 750, 275, 135], label: 'Frozen CW-DPO π(θ)', tone: 'green', fontSize: 28 }),
    makeNode(palette, { id: 'lt-response', role: 'token', box: [1190, 760, 190, 125], label: 'Response y', tone: 'blue', fontSize: 28 }),
    makeNode(palette, { id: 'lt-release-gate', role: 'policy', kind: 'scientific-release-gate', box: [1435, 750, 190, 135], label: 'Release gate', description: 'capability + safety', tone: 'green', fontSize: 27 }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'lt-preference-data', target: 'lt-confidence', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight',
    }),
    makeEdge(palette, { source: 'lt-confidence', target: 'lt-confidence-gate', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'source', dx: 20, dy: -97.5 },
        { origin: 'target', dx: 0, dy: -47.5 },
      ],
      label: 'reference πₛ', labelFontSize: 22, labelOffsetX: 10, labelOffsetY: -76,
    }),
    makeEdge(palette, { source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, {
      source: 'lt-confidence-gate', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'source', dx: 20, dy: -127.5 },
        { origin: 'target', dx: 0, dy: 5 },
      ],
    }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed', label: 'optimize', labelFontSize: 24 }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-rollout', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-ppo-loop', target: 'lt-rlhf-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, {
      source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'temporal', lineStyle: 'solid',
      label: 'freeze', labelFontSize: 23, labelOffsetX: -70, labelOffsetY: 20,
    }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
  ];
  return { nodes, edges, width, height };
}

function llmPresentation(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): PublicationFlagshipBlueprint {
  const palette = paletteFor(options);
  const { width, height } = dimensionsFor('presentation');
  const nodes: FlowNode[] = [makeRoot(palette, options, provenance, width, height)];
  nodes.push(
    makePresentationStage(palette, 'lt-stage-reference', [35, 20, 280, 70], 'A  Shared SFT', 40),
    makePresentationStage(palette, 'lt-stage-evidence', [350, 20, 400, 70], 'B  Preferences', 40),
    makePresentationStage(palette, 'lt-stage-method', [790, 20, 455, 70], 'C  CW-DPO', 40),
    makePresentationStage(palette, 'lt-stage-deploy', [1300, 20, 325, 70], 'D  Deploy', 40),
    makeNode(palette, { id: 'lt-base-model', role: 'backbone', kind: 'scientific-frozen', box: [40, 135, 120, 110], label: 'Base π₀', tone: 'violet', fontSize: 39 }),
    makeNode(palette, { id: 'lt-sft-model', role: 'backbone', kind: 'scientific-frozen', box: [190, 135, 120, 120], label: 'πₛ', description: 'frozen', tone: 'blue', fontSize: 39 }),
    makeNode(palette, { id: 'lt-instruction-data', role: 'token', kind: 'scientific-dataset-stack', box: [40, 290, 120, 110], label: 'SFT data', tone: 'amber', fontSize: 39 }),
    makeNode(palette, { id: 'lt-sft-objective', role: 'loss', box: [190, 290, 120, 110], label: 'SFT loss', tone: 'coral', fontSize: 38 }),
    makeNode(palette, { id: 'lt-prompt-sample', role: 'token', kind: 'scientific-prompt-card', box: [370, 135, 170, 130], label: 'Prompt x', tone: 'blue', fontSize: 40 }),
    makeNode(palette, { id: 'lt-preference-data', role: 'token', kind: 'scientific-preference-pair', box: [570, 135, 170, 145], label: 'Chosen ≻ reject', tone: 'green', fontSize: 38 }),
    makeNode(palette, { id: 'lt-confidence', role: 'token', kind: 'scientific-probability-bars', box: [350, 315, 210, 100], label: 'Confidence cᵢ', tone: 'neutral', fontSize: 39 }),
    makeNode(palette, { id: 'lt-confidence-gate', role: 'policy', box: [590, 315, 160, 100], label: 'wᵢ', tone: 'amber', fontSize: 39 }),
    makeNode(palette, {
      id: 'lt-dpo-objective', role: 'loss', kind: 'scientific-equation', box: [790, 135, 455, 160],
      label: 'CW-DPO objective', description: '−Σ wᵢ log σ { β [Δ(θ) − Δ(s)] }', tone: 'coral', fontSize: 40, borderWidth: 3.2,
    }),
    makeNode(palette, { id: 'lt-dpo-checkpoint', role: 'backbone', kind: 'scientific-trainable', box: [900, 380, 300, 130], label: 'Trainable π(θ)', tone: 'green', fontSize: 40 }),
    makeCaption(palette, 'lt-implicit-reward', [790, 520, 455, 85], 'r̂θ = β log[πθ/πₛ]\ndiagnostic only', 24, undefined, 'left'),
    makeNode(palette, { id: 'lt-inference-prompt', role: 'token', kind: 'scientific-prompt-card', box: [1300, 100, 325, 100], label: 'Held-out x', tone: 'blue', fontSize: 39 }),
    makeNode(palette, { id: 'lt-deploy-model', role: 'backbone', kind: 'scientific-frozen', box: [1300, 225, 325, 105], label: 'Frozen CW-DPO π(θ)', tone: 'green', fontSize: 39 }),
    makeNode(palette, { id: 'lt-response', role: 'token', box: [1300, 365, 145, 100], label: 'y', tone: 'blue', fontSize: 38 }),
    makeNode(palette, { id: 'lt-release-gate', role: 'policy', kind: 'scientific-release-gate', box: [1480, 350, 145, 115], label: 'Release gate', tone: 'green', fontSize: 38 }),
    makePresentationStage(palette, 'lt-stage-baseline', [35, 620, 1210, 70], 'E  RM + PPO baseline', 40),
    makePanel(palette, 'lt-baseline-panel', [35, 690, 1210, 135], 'violet'),
    makeNode(palette, { id: 'lt-rlhf-objective', role: 'loss', box: [60, 710, 180, 90], label: 'RM loss', tone: 'coral', fontSize: 38 }),
    makeNode(palette, { id: 'lt-reward-model', role: 'policy', box: [330, 710, 180, 90], label: 'r(φ)', tone: 'violet', fontSize: 38 }),
    makeNode(palette, { id: 'lt-rollout', role: 'token', box: [600, 710, 180, 90], label: 'Rollout', tone: 'blue', fontSize: 38 }),
    makeNode(palette, { id: 'lt-ppo-loop', role: 'policy', box: [870, 710, 330, 90], label: 'PPO', tone: 'violet', fontSize: 38 }),
  );

  const edges: FlowEdge[] = [
    makeEdge(palette, { source: 'lt-base-model', target: 'lt-sft-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-instruction-data', target: 'lt-sft-objective', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-sft-objective', target: 'lt-sft-model', sourceHandle: 'top', targetHandle: 'bottom', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed' }),
    makeEdge(palette, { source: 'lt-prompt-sample', target: 'lt-preference-data', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'lt-preference-data', target: 'lt-confidence', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight',
    }),
    makeEdge(palette, { source: 'lt-confidence', target: 'lt-confidence-gate', sourceHandle: 'right', targetHandle: 'left', routing: 'straight' }),
    makeEdge(palette, {
      source: 'lt-sft-model', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'top', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'source', dx: 20, dy: -85 },
        { origin: 'target', dx: 0, dy: -25 },
      ],
      label: 'reference πₛ', labelFontSize: 30, labelOffsetX: -14, labelOffsetY: -55,
    }),
    makeEdge(palette, {
      source: 'lt-preference-data', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control',
    }),
    makeEdge(palette, {
      source: 'lt-confidence-gate', target: 'lt-dpo-objective', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'control',
      routeWaypoints: [
        { origin: 'source', dx: 20, dy: 0 },
        { origin: 'source', dx: 20, dy: -65 },
        { origin: 'target', dx: 0, dy: 5 },
      ],
    }),
    makeEdge(palette, { source: 'lt-dpo-objective', target: 'lt-dpo-checkpoint', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight', semantic: 'gradient', lineStyle: 'dashed', label: 'optimize', labelFontSize: 28 }),
    makeEdge(palette, {
      source: 'lt-dpo-checkpoint', target: 'lt-deploy-model', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal', lineStyle: 'solid',
      routeWaypoints: [
        { origin: 'source', dx: 70, dy: 0 },
        { origin: 'target', dx: -30, dy: 0 },
      ],
      label: 'freeze', labelFontSize: 28, labelOffsetX: 20, labelOffsetY: 10,
    }),
    makeEdge(palette, { source: 'lt-inference-prompt', target: 'lt-deploy-model', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-deploy-model', target: 'lt-response', sourceHandle: 'bottom', targetHandle: 'top', routing: 'straight' }),
    makeEdge(palette, { source: 'lt-response', target: 'lt-release-gate', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'control' }),
    makeEdge(palette, { source: 'lt-rlhf-objective', target: 'lt-reward-model', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-reward-model', target: 'lt-rollout', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
    makeEdge(palette, { source: 'lt-rollout', target: 'lt-ppo-loop', sourceHandle: 'right', targetHandle: 'left', routing: 'straight', semantic: 'optional', lineStyle: 'dotted' }),
  ];
  return { nodes, edges, width, height };
}

export function buildTopVenueFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  layout: ScientificSchematicLayout,
): PublicationFlagshipBlueprint | undefined {
  if (options.templateId === 'vla-policy') {
    if (layout === 'single-column') return vlaSingle(options, provenance);
    if (layout === 'double-column') return vlaDouble(options, provenance);
    if (layout === 'presentation') return vlaPresentation(options, provenance);
  }
  if (options.templateId === 'world-model-rollout') {
    if (layout === 'single-column') return worldSingle(options, provenance);
    if (layout === 'double-column') return worldDouble(options, provenance);
    if (layout === 'presentation') return worldPresentation(options, provenance);
  }
  if (options.templateId === 'llm-training-pipeline') {
    if (layout === 'single-column') return llmSingle(options, provenance);
    if (layout === 'double-column') return llmDouble(options, provenance);
    if (layout === 'presentation') return llmPresentation(options, provenance);
  }
  if (layout === 'freeform') return buildV3Flagship(options, provenance, layout);
  return undefined;
}
