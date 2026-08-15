import type {
  FlowEdge,
  FlowNode,
  ScientificConnectorSemantic,
  ScientificProvenance,
  ScientificFigureSpec,
  ScientificSchematicDensity,
  ScientificSchematicLanguage,
  ScientificSchematicLayout,
  ScientificSchematicOptions,
  ScientificSchematicRole,
  ScientificSchematicStyle,
  ScientificSchematicTemplateId,
  ScientificVisualVariant,
  ScientificRouteSide,
  ScientificRouteWaypoint,
  ShapeKind,
} from '../types';
import {
  createEdgeMarker,
  createFlowEdge,
  createFlowNode,
  estimateSvgTextWidth,
  normalizeGraph,
} from './diagram';
import { createId } from './id';
import {
  PUBLICATION_STROKES,
  PUBLICATION_TYPOGRAPHY,
  mmToPx,
  pointsToScientificUnits,
} from './scientific';
import {
  SCIENTIFIC_CONNECTOR_STYLES,
  feedbackHandles,
  inferScientificRouteSide,
} from './scientificRouting';
import {
  layoutSchematicNodeContent,
  scientificNodeTextMaxWidth,
  scientificNodeTextPaddingX,
  scientificNodeTextPaddingY,
} from './scientificNodeLayout';
import { buildTopVenueFlagship } from './scientificFlagshipsV5';

export interface ScientificSchematicReference {
  arxivId: string;
  title: string;
  figure: string;
  pattern: string;
}

export interface ScientificSchematicTemplate {
  id: ScientificSchematicTemplateId;
  name: string;
  nameEn: string;
  description: string;
  focus: string;
  references: ScientificSchematicReference[];
}

export interface EditableScientificSchematic {
  title: string;
  templateId: ScientificSchematicTemplateId;
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
  references: ScientificSchematicReference[];
  layout: ScientificSchematicLayout;
  targetWidthMm?: number;
  targetHeightMm?: number;
}

export const SCIENTIFIC_SCHEMATIC_TEMPLATES: ScientificSchematicTemplate[] = [
  {
    id: 'multimodal-foundation',
    name: '多模态基础模型',
    nameEn: 'Multimodal foundation model',
    description: '图像、文本、音频与机器人状态交错成 token 流，进入统一主干并分发到多种任务。',
    focus: '模态输入 · token 流 · 统一主干',
    references: [
      { arxivId: '2303.03378', title: 'PaLM-E', figure: 'Figure 1', pattern: 'Interleaved multimodal tokens enter one language-model backbone.' },
      { arxivId: '2204.14198', title: 'Flamingo', figure: 'Architecture figures', pattern: 'Visual conditioning is interleaved with language processing.' },
    ],
  },
  {
    id: 'vision-language-bridge',
    name: '视觉语言桥接',
    nameEn: 'Vision-language bridge',
    description: '冻结视觉编码器、轻量桥接模块与语言模型的两阶段训练和推理路径。',
    focus: '视觉编码 · 桥接器 · 两阶段训练',
    references: [
      { arxivId: '2301.12597', title: 'BLIP-2', figure: 'Figures 1-3', pattern: 'A lightweight querying transformer bridges frozen vision and language models.' },
      { arxivId: '2406.09246', title: 'OpenVLA', figure: 'Figure 1', pattern: 'Vision encoder, projector, language backbone, and action output form a clear modular chain.' },
    ],
  },
  {
    id: 'vla-policy',
    name: 'VLA 机器人策略',
    nameEn: 'Vision-language-action policy',
    description: '观察、语言和本体状态经编码与融合后，由 VLM 主干和动作专家输出动作块。',
    focus: '多源观察 · VLM · 动作专家 · 闭环',
    references: [
      { arxivId: '2406.09246', title: 'OpenVLA', figure: 'Figure 1', pattern: 'Image and instruction are encoded into a language backbone that predicts robot actions.' },
      { arxivId: '2410.24164', title: 'pi0', figure: 'Figure 3', pattern: 'A VLM backbone and action expert serve multiple robot embodiments.' },
      { arxivId: '2307.15818', title: 'RT-2', figure: 'System overview', pattern: 'Robot actions are represented in a vision-language model output space.' },
    ],
  },
  {
    id: 'prompt-conditioned-agent',
    name: '多模态提示智能体',
    nameEn: 'Prompt-conditioned embodied agent',
    description: '多模态任务提示与交互历史通过交叉注意力共同条件化因果控制器。',
    focus: '提示编码 · 交叉注意力 · 交互历史',
    references: [
      { arxivId: '2210.03094', title: 'VIMA', figure: 'Figures 1 and 3', pattern: 'Multimodal prompts and interaction history condition a causal robot controller.' },
    ],
  },
  {
    id: 'embodied-loop',
    name: '具身智能闭环',
    nameEn: 'Embodied intelligence loop',
    description: '感知、世界模型、规划、策略、执行与环境反馈形成可解释的控制闭环。',
    focus: '感知 · 世界模型 · 规划 · 反馈',
    references: [
      { arxivId: '2303.03378', title: 'PaLM-E', figure: 'Figures 1 and 5', pattern: 'Embodied reasoning connects multimodal perception, planning, and low-level policies.' },
      { arxivId: '2212.06817', title: 'RT-1', figure: 'Architecture overview', pattern: 'Observations and language condition closed-loop robot actions.' },
    ],
  },
  {
    id: 'train-deploy',
    name: '训练与部署全景',
    nameEn: 'Training and deployment system',
    description: '数据混合、预训练、适配、检查点与在线机器人推理被组织成训练和部署双区。',
    focus: '数据混合 · 训练阶段 · 多机器人部署',
    references: [
      { arxivId: '2410.24164', title: 'pi0', figure: 'Figures 3-5', pattern: 'A heterogeneous data mixture trains one policy for multiple robot embodiments.' },
      { arxivId: '2405.12213', title: 'Octo', figure: 'System overview', pattern: 'A generalist policy is pretrained on diverse robot data and adapted downstream.' },
    ],
  },
  {
    id: 'llm-training-pipeline',
    name: 'LLM 全阶段训练流水线',
    nameEn: 'LLM training pipeline',
    description: '语料策展、预训练、指令微调、偏好对齐与评测沿 checkpoint 主路径展开。',
    focus: '数据策展 · SFT · 偏好对齐 · 评测',
    references: [
      { arxivId: '2203.02155', title: 'InstructGPT', figure: 'Figure 2', pattern: 'Demonstrations, comparisons, and PPO training form a staged alignment pipeline.' },
      { arxivId: '2305.18290', title: 'DPO', figure: 'Figure 1', pattern: 'Preference optimization is contrasted with reward-model-based RLHF.' },
    ],
  },
  {
    id: 'moe-routing',
    name: '稀疏 MoE 路由',
    nameEn: 'Sparse mixture-of-experts routing',
    description: 'token 经门控选择 top-k 专家，专家输出按权重合并，并标出其在 Transformer 层内的位置。',
    focus: 'Token · Router · Top-k 专家 · 汇流',
    references: [
      { arxivId: '2401.04088', title: 'Mixtral of Experts', figure: 'Figure 1', pattern: 'A router sends each token to a sparse subset of experts.' },
      { arxivId: '2101.03961', title: 'Switch Transformers', figure: 'Figure 2', pattern: 'Sparse expert routing replaces a dense feed-forward sublayer.' },
    ],
  },
  {
    id: 'rag-tool-agent',
    name: 'RAG 与工具智能体',
    nameEn: 'Retrieval and tool-using agent',
    description: '问题路由到知识检索或外部工具，证据和 observation 回流 LLM 后生成带引用答案。',
    focus: '路由 · 检索 · 工具 · 证据回流',
    references: [
      { arxivId: '2005.11401', title: 'RAG', figure: 'Figure 1', pattern: 'A query retrieves documents that condition a generator.' },
      { arxivId: '2210.03629', title: 'ReAct', figure: 'Figure 1', pattern: 'Reasoning, actions, and observations alternate in an agent trace.' },
      { arxivId: '2302.04761', title: 'Toolformer', figure: 'Figure 1', pattern: 'Tool calls and returned values are inserted into language-model context.' },
    ],
  },
  {
    id: 'reasoning-trace',
    name: '推理轨迹与校验',
    nameEn: 'Reasoning trace and verification',
    description: '问题、思考、工具动作、观察、校验和最终答案沿可读时间轴组织。',
    focus: 'Thought · Action · Observation · Verify',
    references: [
      { arxivId: '2201.11903', title: 'Chain-of-Thought Prompting', figure: 'Figure 1', pattern: 'Standard and chain-of-thought prompting are compared with readable examples.' },
      { arxivId: '2210.03629', title: 'ReAct', figure: 'Figure 1', pattern: 'Correct and failed reasoning-action traces are shown side by side.' },
    ],
  },
  {
    id: 'robot-data-collection',
    name: '机器人数据采集与策展',
    nameEn: 'Robot data collection and curation',
    description: '相机、机体和示教生成多视角 episode，经过同步、切分、过滤与标注进入数据集。',
    focus: '传感器 · Episode · 过滤 · 数据混合',
    references: [
      { arxivId: '2403.12945', title: 'DROID', figure: 'Figures 1 and 6', pattern: 'In-the-wild collection hardware and dataset distributions are presented together.' },
      { arxivId: '2308.12952', title: 'BridgeData V2', figure: 'Figure 2', pattern: 'Robot hardware and randomized camera viewpoints explain dataset coverage.' },
      { arxivId: '2310.08864', title: 'Open X-Embodiment', figure: 'Figure 1', pattern: 'Many embodiments and datasets are normalized into one training mixture.' },
    ],
  },
  {
    id: 'world-model-rollout',
    name: '世界模型与未来展开',
    nameEn: 'World-model rollout',
    description: '当前观察编码为空间状态，模型并行展开候选未来，评分后选择动作轨迹并闭环执行。',
    focus: '空间状态 · 未来帧 · 候选轨迹 · 反馈',
    references: [
      { arxivId: '2403.09631', title: '3D-VLA', figure: 'Figure 2', pattern: 'A 3D world representation connects goal imagination and robot control.' },
      { arxivId: '2412.14803', title: 'Video Prediction Policy', figure: 'Figure 2', pattern: 'Future visual representations are predicted before action selection.' },
    ],
  },
  {
    id: 'sim-to-real',
    name: '仿真到真实迁移',
    nameEn: 'Simulation-to-real transfer',
    description: '仿真 rollout、域随机化、共享策略、真实适配器与部署评测形成清晰迁移桥梁。',
    focus: '仿真 · 域随机化 · 适配 · 真机',
    references: [
      { arxivId: '2406.10454', title: 'HumanPlus', figure: 'Figure 2', pattern: 'Human motion, simulation, and real humanoids are visually aligned.' },
      { arxivId: '2303.03381', title: 'Real-World Humanoid Locomotion', figure: 'Figure 7', pattern: 'Simulation training and real-robot transfer are separated into panels.' },
    ],
  },
  {
    id: 'multi-embodiment-policy',
    name: '多机体通用策略',
    nameEn: 'Multi-embodiment generalist policy',
    description: '多种机器人数据先统一表示，再进入共享主干和机体专用动作专家。',
    focus: '多机体数据 · 统一表示 · 共享主干 · 专家头',
    references: [
      { arxivId: '2410.24164', title: 'pi0', figure: 'Figure 3', pattern: 'A shared VLM and action expert operate across multiple robot platforms.' },
      { arxivId: '2310.08864', title: 'Open X-Embodiment', figure: 'Figure 1', pattern: 'Cross-embodiment data is mapped into common model inputs and outputs.' },
      { arxivId: '2405.12213', title: 'Octo', figure: 'Figure 0', pattern: 'A shared transformer is pretrained and adapted across robot datasets.' },
    ],
  },
];

export const DEFAULT_SCIENTIFIC_SCHEMATIC_OPTIONS: ScientificSchematicOptions = {
  templateId: 'vla-policy',
  title: 'Vision-Language-Action Policy',
  backbone: 'VLM Backbone',
  style: 'conference',
  density: 'detailed',
  language: 'en',
};

const SCIENTIFIC_BACKBONE_DEFAULTS: Record<ScientificSchematicTemplateId, { en: string; zh: string }> = {
  'multimodal-foundation': { en: 'Multimodal LLM', zh: '多模态大模型' },
  'vision-language-bridge': { en: 'Frozen LLM', zh: '冻结大模型' },
  'vla-policy': { en: 'VLM Backbone', zh: 'VLM 主干' },
  'prompt-conditioned-agent': { en: 'Causal Transformer', zh: '因果 Transformer' },
  'embodied-loop': { en: 'Policy', zh: '策略模型' },
  'train-deploy': { en: 'Generalist Policy', zh: '通用策略模型' },
  'llm-training-pipeline': { en: 'Base Model', zh: '基础模型' },
  'moe-routing': { en: 'Sparse MoE', zh: '稀疏专家模型' },
  'rag-tool-agent': { en: 'Grounded LLM', zh: '证据增强 LLM' },
  'reasoning-trace': { en: 'Reasoner', zh: '推理模型' },
  'robot-data-collection': { en: 'Policy Learner', zh: '策略学习器' },
  'world-model-rollout': { en: 'Latent World Model', zh: '潜在世界模型' },
  'sim-to-real': { en: 'Shared Policy', zh: '共享策略' },
  'multi-embodiment-policy': { en: 'Shared Policy Backbone', zh: '共享策略主干' },
};

interface RoleColors {
  fill: string;
  stroke: string;
  text: string;
}

type SchematicPalette = Record<ScientificSchematicRole, RoleColors> & {
  edge: string;
  feedback: string;
};

const PALETTES: Record<ScientificSchematicStyle, SchematicPalette> = {
  conference: {
    frame: { fill: '#FFFFFF', stroke: '#9AA6B2', text: '#1E2933' },
    phase: { fill: '#F7F8FA', stroke: '#C8D0D8', text: '#46515C' },
    modality: { fill: '#E8F2FB', stroke: '#4C7DA5', text: '#173C5A' },
    token: { fill: '#FFF3D8', stroke: '#B67B19', text: '#5D3D08' },
    encoder: { fill: '#E7F4EE', stroke: '#3E8064', text: '#1C4C39' },
    bridge: { fill: '#FFF0E8', stroke: '#B95D3D', text: '#67311F' },
    backbone: { fill: '#EEEAF8', stroke: '#725BA5', text: '#3C2E65' },
    policy: { fill: '#FCEBED', stroke: '#B64E63', text: '#692638' },
    action: { fill: '#E8F3FC', stroke: '#3979AA', text: '#173F5F' },
    environment: { fill: '#EDF6E9', stroke: '#56814A', text: '#294D22' },
    memory: { fill: '#F1EDF7', stroke: '#6D5C8B', text: '#3D3156' },
    dataset: { fill: '#F9F0DE', stroke: '#98722F', text: '#584114' },
    loss: { fill: '#FBE9E7', stroke: '#A84D45', text: '#642B26' },
    annotation: { fill: '#F3F5F6', stroke: '#7B838C', text: '#42484E' },
    edge: '#4B5864',
    feedback: '#A34F3C',
  },
  technical: {
    frame: { fill: '#FFFFFF', stroke: '#82909D', text: '#16212B' },
    phase: { fill: '#F4F7F8', stroke: '#B8C3CB', text: '#36434D' },
    modality: { fill: '#E4F1F6', stroke: '#28708B', text: '#134253' },
    token: { fill: '#F8EDCF', stroke: '#9B7420', text: '#533D08' },
    encoder: { fill: '#E5F1EA', stroke: '#2F7555', text: '#17432F' },
    bridge: { fill: '#F4EAE0', stroke: '#99603A', text: '#55311B' },
    backbone: { fill: '#E8EDF4', stroke: '#496B8E', text: '#233F5B' },
    policy: { fill: '#F3E6EA', stroke: '#945368', text: '#55283A' },
    action: { fill: '#E3EEF6', stroke: '#346E98', text: '#193D58' },
    environment: { fill: '#E9F1E7', stroke: '#557A4C', text: '#2B4B26' },
    memory: { fill: '#EBE9F0', stroke: '#655E79', text: '#393446' },
    dataset: { fill: '#F2EBD9', stroke: '#866D35', text: '#4C3C17' },
    loss: { fill: '#F5E5E2', stroke: '#97504A', text: '#572B27' },
    annotation: { fill: '#F0F2F3', stroke: '#747E86', text: '#3B4349' },
    edge: '#3F4D58',
    feedback: '#8F493D',
  },
  monochrome: {
    frame: { fill: '#FFFFFF', stroke: '#727272', text: '#111111' },
    phase: { fill: '#F7F7F7', stroke: '#A5A5A5', text: '#333333' },
    modality: { fill: '#F1F1F1', stroke: '#555555', text: '#151515' },
    token: { fill: '#FFFFFF', stroke: '#777777', text: '#202020' },
    encoder: { fill: '#E9E9E9', stroke: '#4D4D4D', text: '#151515' },
    bridge: { fill: '#F5F5F5', stroke: '#626262', text: '#1A1A1A' },
    backbone: { fill: '#DDDDDD', stroke: '#333333', text: '#101010' },
    policy: { fill: '#E6E6E6', stroke: '#444444', text: '#121212' },
    action: { fill: '#F0F0F0', stroke: '#555555', text: '#151515' },
    environment: { fill: '#FFFFFF', stroke: '#333333', text: '#111111' },
    memory: { fill: '#EFEFEF', stroke: '#555555', text: '#151515' },
    dataset: { fill: '#F5F5F5', stroke: '#666666', text: '#202020' },
    loss: { fill: '#E8E8E8', stroke: '#444444', text: '#151515' },
    annotation: { fill: '#FFFFFF', stroke: '#777777', text: '#333333' },
    edge: '#333333',
    feedback: '#111111',
  },
};

interface NodeOptions {
  id: string;
  kind?: ShapeKind;
  role: ScientificSchematicRole;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  description?: string;
  detail?: ScientificSchematicDensity;
  fontSize?: number;
  fontWeight?: number;
  zIndex?: number;
  scientificRole?: FlowNode['data']['scientificRole'];
  provenance?: ScientificProvenance;
  variant?: ScientificVisualVariant;
  evidence?: FlowNode['data']['scientificEvidence'];
  fill?: string;
  stroke?: string;
  borderWidth?: number;
  radius?: number;
  textPaddingX?: number;
  textPaddingY?: number;
}

function densityRank(value: ScientificSchematicDensity): number {
  return value === 'compact' ? 0 : value === 'standard' ? 1 : 2;
}

function text(language: ScientificSchematicLanguage, english: string, chinese: string): string {
  return language === 'zh' ? chinese : english;
}

function moduleNode(palette: SchematicPalette, input: NodeOptions): FlowNode {
  const colors = palette[input.role];
  const node = createFlowNode(input.kind ?? 'rounded-rectangle', { x: input.x, y: input.y }, input.label, {
    id: input.id,
    selected: false,
    zIndex: input.zIndex ?? (input.role === 'frame' ? -30 : input.role === 'phase' ? -20 : 10),
    style: { width: input.width, height: input.height },
  });
  node.data = {
    ...node.data,
    label: input.label,
    description: input.description,
    fill: input.fill ?? colors.fill,
    stroke: input.stroke ?? colors.stroke,
    textColor: colors.text,
    borderWidth: input.borderWidth ?? (input.role === 'frame'
      ? PUBLICATION_STROKES.frame
      : input.role === 'phase'
        ? PUBLICATION_STROKES.secondary
        : PUBLICATION_STROKES.primary),
    radius: input.radius ?? (input.role === 'frame' || input.role === 'phase' ? 7 : 6),
    fontSize: Math.max(
      input.fontSize ?? 0,
      input.role === 'frame'
        ? PUBLICATION_TYPOGRAPHY.figureTitle
        : input.role === 'phase'
          ? PUBLICATION_TYPOGRAPHY.stageTitle
          : input.role === 'annotation'
            ? PUBLICATION_TYPOGRAPHY.annotation
            : PUBLICATION_TYPOGRAPHY.moduleLabel,
    ),
    fontWeight: input.fontWeight ?? (input.role === 'frame' ? 700 : input.role === 'phase' ? 650 : 650),
    textAlign: input.role === 'frame' || input.role === 'phase' ? 'left' : node.data.textAlign,
    schematicRole: input.role,
    schematicDetail: input.detail ?? 'compact',
    scientificTextPaddingX: input.textPaddingX,
    scientificTextPaddingY: input.textPaddingY,
    scientificRole: input.scientificRole,
    provenance: input.provenance,
    scientificVariant: input.variant,
    scientificEvidence: input.evidence ?? 'schematic',
  };
  return node;
}

interface EdgeOptions {
  label?: string;
  routing?: 'smoothstep' | 'straight' | 'bezier';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  feedback?: boolean;
  semantic?: ScientificConnectorSemantic;
  routeSide?: ScientificRouteSide;
  routeOffset?: number;
  routeWaypoints?: ScientificRouteWaypoint[];
  sourceHandle?: string;
  targetHandle?: string;
  width?: number;
  arrowEnd?: 'none' | 'open' | 'closed';
}

function moduleEdge(palette: SchematicPalette, source: string, target: string, options: EdgeOptions = {}): FlowEdge {
  const routing = options.routing ?? 'smoothstep';
  const semantic = options.semantic
    ?? (options.feedback
      ? 'feedback'
      : options.lineStyle === 'dotted'
        ? 'optional'
        : options.lineStyle === 'dashed' && options.arrowEnd === 'open'
          ? 'gradient'
          : 'data');
  const semanticStyle = SCIENTIFIC_CONNECTOR_STYLES[semantic];
  const monochrome = palette === PALETTES.monochrome;
  const color = monochrome
    ? (semantic === 'feedback' ? palette.feedback : palette.edge)
    : semantic === 'feedback'
      ? palette.feedback
      : semantic === 'gradient'
        ? palette.loss.stroke
        : semantic === 'optional'
          ? palette.annotation.stroke
          : semantic === 'broadcast'
            ? palette.encoder.stroke
            : semantic === 'temporal'
              ? palette.dataset.stroke
              : semantic === 'control'
                ? palette.action.stroke
                : palette.edge;
  const width = Math.max(
    options.width ?? 0,
    semanticStyle.width,
    semantic === 'feedback' ? PUBLICATION_STROKES.primary : PUBLICATION_STROKES.secondary,
  );
  const arrowEnd = options.arrowEnd ?? semanticStyle.arrowEnd;
  const edge = createFlowEdge(source, target, options.label, routing);
  edge.sourceHandle = options.sourceHandle;
  edge.targetHandle = options.targetHandle;
  edge.selected = false;
  edge.data = {
    ...edge.data!,
    label: options.label,
    color,
    width,
    routing,
    lineStyle: options.lineStyle ?? semanticStyle.lineStyle,
    arrowEnd,
    scientificSemantic: semantic,
    routeSide: options.routeSide,
    routeOffset: options.routeOffset,
    routeWaypoints: options.routeWaypoints,
  };
  edge.style = {
    ...edge.style,
    stroke: color,
    strokeWidth: width,
    strokeDasharray: edge.data.lineStyle === 'dashed' ? '8 6' : edge.data.lineStyle === 'dotted' ? '2 5' : undefined,
  };
  edge.markerEnd = createEdgeMarker(arrowEnd, color);
  return edge;
}

function finalizeScientificEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const boxes = new Map(nodes.map((node) => [node.id, {
    x: node.position.x,
    y: node.position.y,
    width: Number(node.style?.width ?? node.measured?.width ?? node.width ?? 1),
    height: Number(node.style?.height ?? node.measured?.height ?? node.height ?? 1),
  }]));
  return edges.map((edge) => {
    const source = boxes.get(edge.source);
    const target = boxes.get(edge.target);
    if (!source || !target) return edge;
    if (edge.data?.scientificSemantic === 'feedback') {
      const routeSide = edge.data.routeSide ?? inferScientificRouteSide(source, target);
      const handles = feedbackHandles(routeSide);
      return {
        ...edge,
        type: 'scientific',
        sourceHandle: edge.sourceHandle ?? handles.sourceHandle,
        targetHandle: edge.targetHandle ?? handles.targetHandle,
        data: { ...edge.data, routeSide },
      };
    }
    if (edge.sourceHandle && edge.targetHandle) return { ...edge, type: 'scientific' };
    const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const verticalGap = Math.max(
      target.y - (source.y + source.height),
      source.y - (target.y + target.height),
    );
    const horizontalGap = Math.max(
      target.x - (source.x + source.width),
      source.x - (target.x + target.width),
    );
    const horizontal = horizontalGap >= 16 && verticalGap < 16
      ? true
      : verticalGap >= 16
        ? false
        : Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);
    const forward = horizontal ? targetCenter.x >= sourceCenter.x : targetCenter.y >= sourceCenter.y;
    return {
      ...edge,
      type: 'scientific',
      sourceHandle: horizontal ? (forward ? 'right' : 'left') : (forward ? 'bottom' : 'top'),
      targetHandle: horizontal ? (forward ? 'left' : 'right') : (forward ? 'top' : 'bottom'),
    };
  });
}

interface Blueprint {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
}

function buildMultimodal(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'mm-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1280, height: 660, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'mm-input-phase', kind: 'group', role: 'phase', x: 30, y: 68, width: 235, height: 550, label: t('Multimodal inputs', '多模态输入') }),
    moduleNode(palette, { id: 'mm-token-phase', kind: 'group', role: 'phase', x: 290, y: 68, width: 250, height: 550, label: t('Encoding and tokens', '编码与 Token') }),
    moduleNode(palette, { id: 'mm-model-phase', kind: 'group', role: 'phase', x: 565, y: 68, width: 410, height: 550, label: t('Unified foundation model', '统一基础模型') }),
    moduleNode(palette, { id: 'mm-output-phase', kind: 'group', role: 'phase', x: 1000, y: 68, width: 250, height: 550, label: t('Task outputs', '任务输出') }),
    moduleNode(palette, { id: 'mm-image', kind: 'scientific-image-frame', role: 'modality', x: 66, y: 118, width: 160, height: 92, label: t('Images / video', '图像 / 视频'), description: t('spatial observations', '空间观察') }),
    moduleNode(palette, { id: 'mm-text', role: 'modality', x: 66, y: 238, width: 160, height: 70, label: t('Language', '语言'), description: t('instruction + context', '指令 + 上下文') }),
    moduleNode(palette, { id: 'mm-audio', role: 'modality', x: 66, y: 348, width: 160, height: 70, label: t('Audio', '音频'), description: t('events + speech', '事件 + 语音'), detail: 'standard' }),
    moduleNode(palette, { id: 'mm-state', role: 'modality', x: 66, y: 458, width: 160, height: 70, label: t('Robot state', '机器人状态'), description: t('joints + sensors', '关节 + 传感器') }),
    moduleNode(palette, { id: 'mm-vision-encoder', role: 'encoder', x: 325, y: 128, width: 180, height: 70, label: t('Vision encoder', '视觉编码器') }),
    moduleNode(palette, { id: 'mm-tokenizer', role: 'encoder', x: 325, y: 238, width: 180, height: 70, label: t('Tokenizer', '文本分词器') }),
    moduleNode(palette, { id: 'mm-audio-encoder', role: 'encoder', x: 325, y: 348, width: 180, height: 70, label: t('Audio encoder', '音频编码器'), detail: 'standard' }),
    moduleNode(palette, { id: 'mm-state-projector', role: 'bridge', x: 325, y: 458, width: 180, height: 70, label: t('State projector', '状态投影器') }),
    moduleNode(palette, { id: 'mm-token-stream', kind: 'scientific-token-strip', role: 'token', x: 610, y: 125, width: 320, height: 84, label: t('[IMG]  text  [STATE]  text  [AUDIO]', '[图像] 文本 [状态] 文本 [音频]'), description: t('interleaved token sequence', '交错 Token 序列') }),
    moduleNode(palette, { id: 'mm-backbone', kind: 'scientific-transformer', role: 'backbone', x: 615, y: 245, width: 310, height: 220, label: options.backbone || t('Multimodal LLM', '多模态大模型'), description: t('shared attention and reasoning', '共享注意力与推理'), fontSize: 18 }),
    moduleNode(palette, { id: 'mm-alignment', role: 'loss', x: 670, y: 510, width: 200, height: 62, label: t('Alignment objectives', '对齐训练目标'), description: t('caption + QA + control', '描述 + 问答 + 控制'), detail: 'detailed' }),
    moduleNode(palette, { id: 'mm-language-output', role: 'action', x: 1040, y: 132, width: 170, height: 72, label: t('Language output', '语言输出'), description: t('answer + caption', '回答 + 描述') }),
    moduleNode(palette, { id: 'mm-reasoning-output', role: 'policy', x: 1040, y: 258, width: 170, height: 72, label: t('Embodied plan', '具身规划'), description: t('steps + constraints', '步骤 + 约束') }),
    moduleNode(palette, { id: 'mm-action-output', role: 'action', x: 1040, y: 384, width: 170, height: 72, label: t('Action tokens', '动作 Token'), description: t('policy command', '策略指令') }),
    moduleNode(palette, { id: 'mm-transfer-note', kind: 'note', role: 'annotation', x: 1030, y: 508, width: 190, height: 68, label: t('One shared model transfers across tasks.', '同一主干在不同任务间迁移。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'mm-image', 'mm-vision-encoder'),
    moduleEdge(palette, 'mm-text', 'mm-tokenizer'),
    moduleEdge(palette, 'mm-audio', 'mm-audio-encoder'),
    moduleEdge(palette, 'mm-state', 'mm-state-projector'),
    moduleEdge(palette, 'mm-vision-encoder', 'mm-token-stream'),
    moduleEdge(palette, 'mm-tokenizer', 'mm-token-stream'),
    moduleEdge(palette, 'mm-audio-encoder', 'mm-token-stream'),
    moduleEdge(palette, 'mm-state-projector', 'mm-token-stream'),
    moduleEdge(palette, 'mm-token-stream', 'mm-backbone'),
    moduleEdge(palette, 'mm-backbone', 'mm-language-output'),
    moduleEdge(palette, 'mm-backbone', 'mm-reasoning-output'),
    moduleEdge(palette, 'mm-backbone', 'mm-action-output'),
    moduleEdge(palette, 'mm-alignment', 'mm-backbone', { lineStyle: 'dashed', arrowEnd: 'open' }),
  ];
  return { nodes, edges, width: 1280, height: 660 };
}

function buildVisionLanguageBridge(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'vl-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1320, height: 660, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'vl-stage-one', kind: 'group', role: 'phase', x: 30, y: 72, width: 610, height: 540, label: t('Stage 1 · representation alignment', '阶段一 · 表征对齐') }),
    moduleNode(palette, { id: 'vl-stage-two', kind: 'group', role: 'phase', x: 665, y: 72, width: 625, height: 540, label: t('Stage 2 · generative bootstrapping', '阶段二 · 生成式桥接') }),
    moduleNode(palette, { id: 'vl-images', kind: 'scientific-image-frame', role: 'modality', x: 68, y: 150, width: 150, height: 100, label: t('Image batch', '图像批次') }),
    moduleNode(palette, { id: 'vl-frozen-vision', kind: 'scientific-frozen', role: 'encoder', x: 270, y: 145, width: 190, height: 116, label: t('Frozen vision encoder', '冻结视觉编码器'), description: t('patch features', '图像块特征') }),
    moduleNode(palette, { id: 'vl-queries', kind: 'scientific-token-strip', role: 'token', x: 270, y: 312, width: 190, height: 76, label: t('Learnable queries', '可学习查询 Token') }),
    moduleNode(palette, { id: 'vl-qformer', kind: 'scientific-transformer', role: 'bridge', x: 500, y: 192, width: 110, height: 190, label: t('Querying\nTransformer', '查询\nTransformer'), description: t('cross attention', '交叉注意力'), fontSize: 14 }),
    moduleNode(palette, { id: 'vl-text', role: 'modality', x: 68, y: 410, width: 150, height: 76, label: t('Paired text', '配对文本') }),
    moduleNode(palette, { id: 'vl-objectives', role: 'loss', x: 278, y: 438, width: 260, height: 94, label: t('ITC · ITM · image-grounded text', '图文对比 · 匹配 · 生成'), description: t('joint representation objectives', '联合表征目标'), detail: 'standard' }),
    moduleNode(palette, { id: 'vl-image-two', kind: 'scientific-image-frame', role: 'modality', x: 700, y: 140, width: 145, height: 96, label: t('Image', '图像') }),
    moduleNode(palette, { id: 'vl-frozen-two', kind: 'scientific-frozen', role: 'encoder', x: 885, y: 132, width: 185, height: 112, label: t('Frozen vision encoder', '冻结视觉编码器') }),
    moduleNode(palette, { id: 'vl-qformer-two', role: 'bridge', x: 885, y: 296, width: 185, height: 96, label: t('Query bridge', '查询桥接器') }),
    moduleNode(palette, { id: 'vl-projection', role: 'token', x: 700, y: 318, width: 145, height: 70, label: t('Projection', '线性投影'), description: t('language space', '语言空间') }),
    moduleNode(palette, { id: 'vl-llm', kind: 'scientific-frozen', role: 'backbone', x: 1110, y: 196, width: 145, height: 220, label: options.backbone || t('Frozen LLM', '冻结大模型'), description: t('decoder or encoder-decoder', '解码器或编解码器'), fontSize: 16 }),
    moduleNode(palette, { id: 'vl-prompt', role: 'modality', x: 700, y: 450, width: 145, height: 72, label: t('Instruction', '文本指令') }),
    moduleNode(palette, { id: 'vl-output', role: 'action', x: 1102, y: 476, width: 162, height: 78, label: t('Generated response', '生成式输出') }),
    moduleNode(palette, { id: 'vl-freeze-note', kind: 'note', role: 'annotation', x: 878, y: 470, width: 194, height: 82, label: t('Frozen towers keep training efficient; only the bridge learns.', '冻结两端主干，仅训练桥接模块。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'vl-images', 'vl-frozen-vision'),
    moduleEdge(palette, 'vl-frozen-vision', 'vl-qformer'),
    moduleEdge(palette, 'vl-queries', 'vl-qformer'),
    moduleEdge(palette, 'vl-text', 'vl-qformer'),
    moduleEdge(palette, 'vl-qformer', 'vl-objectives', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'vl-image-two', 'vl-frozen-two'),
    moduleEdge(palette, 'vl-frozen-two', 'vl-qformer-two'),
    moduleEdge(palette, 'vl-qformer-two', 'vl-projection'),
    moduleEdge(palette, 'vl-projection', 'vl-llm'),
    moduleEdge(palette, 'vl-prompt', 'vl-llm'),
    moduleEdge(palette, 'vl-llm', 'vl-output'),
  ];
  return { nodes, edges, width: 1320, height: 660 };
}

function buildVlaPolicy(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'vla-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1720, height: 820, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'vla-perception', kind: 'group', role: 'phase', x: 28, y: 76, width: 324, height: 684, label: t('A  Observe', 'A  观察') }),
    moduleNode(palette, { id: 'vla-representation', kind: 'group', role: 'phase', x: 374, y: 76, width: 374, height: 684, label: t('B  Encode and align', 'B  编码与对齐') }),
    moduleNode(palette, { id: 'vla-reasoning', kind: 'group', role: 'phase', x: 770, y: 76, width: 438, height: 684, label: t('C  Reason and predict', 'C  推理与预测') }),
    moduleNode(palette, { id: 'vla-control', kind: 'group', role: 'phase', x: 1230, y: 76, width: 462, height: 684, label: t('D  Select and execute', 'D  选择与执行') }),
    moduleNode(palette, { id: 'vla-scene', kind: 'scientific-scene-frame', role: 'modality', x: 62, y: 120, width: 256, height: 174, label: t('RGB-D workspace', 'RGB-D 操作场景'), description: t('objects + robot + camera', '物体 + 机器人 + 相机') }),
    moduleNode(palette, { id: 'vla-language', kind: 'scientific-prompt-card', role: 'modality', x: 62, y: 332, width: 256, height: 122, label: t('Language instruction', '语言指令'), description: t('"place the blue cup on the tray"', '“把蓝色杯子放到托盘上”') }),
    moduleNode(palette, { id: 'vla-state', kind: 'scientific-token-strip', role: 'modality', x: 62, y: 492, width: 256, height: 90, label: t('Proprioceptive state', '本体状态'), description: t('q, dq, gripper, base', '关节、速度、夹爪、底盘') }),
    moduleNode(palette, { id: 'vla-sensor-meta', kind: 'scientific-metric-panel', role: 'annotation', x: 92, y: 626, width: 196, height: 102, label: t('Sensor cadence', '传感器节奏'), description: t('20 Hz · 7 DoF · 2 views', '20 Hz · 7 自由度 · 2 视角'), detail: 'standard' }),
    moduleNode(palette, { id: 'vla-vision', kind: 'scientific-transformer', role: 'encoder', x: 410, y: 126, width: 142, height: 150, label: t('Vision encoder', '视觉编码器'), description: t('global + local features', '全局 + 局部特征') }),
    moduleNode(palette, { id: 'vla-feature-map', kind: 'scientific-feature-map', role: 'encoder', x: 580, y: 138, width: 132, height: 132, label: t('Visual tokens', '视觉 Token'), description: t('multi-scale patches', '多尺度图块') }),
    moduleNode(palette, { id: 'vla-tokenizer', role: 'encoder', x: 410, y: 344, width: 142, height: 86, label: t('Text tokenizer', '文本分词器'), description: t('instruction tokens', '指令 Token') }),
    moduleNode(palette, { id: 'vla-language-token', kind: 'scientific-token-strip', role: 'token', x: 580, y: 342, width: 132, height: 90, label: t('Text tokens', '文本 Token') }),
    moduleNode(palette, { id: 'vla-state-projector', role: 'bridge', x: 410, y: 500, width: 142, height: 86, label: t('State projector', '状态投影器'), description: t('shared latent space', '统一潜在空间') }),
    moduleNode(palette, { id: 'vla-state-space', kind: 'scientific-embedding-space', role: 'bridge', x: 580, y: 486, width: 132, height: 118, label: t('State embedding', '状态嵌入') }),
    moduleNode(palette, { id: 'vla-fusion', kind: 'scientific-token-strip', role: 'token', x: 410, y: 638, width: 302, height: 88, label: t('[VIS] instruction [STATE] action queries', '[视觉] 指令 [状态] 动作查询'), description: t('ordered multimodal sequence', '有序多模态序列') }),
    moduleNode(palette, { id: 'vla-token-sequence', kind: 'scientific-token-strip', role: 'token', x: 808, y: 122, width: 360, height: 88, label: t('Shared causal context', '共享因果上下文'), description: t('observation window + action queries', '观察窗口 + 动作查询') }),
    moduleNode(palette, { id: 'vla-backbone', kind: 'scientific-transformer', role: 'backbone', x: 812, y: 254, width: 224, height: 214, label: options.backbone || t('VLM backbone', 'VLM 主干'), description: t('language-conditioned visual reasoning', '语言条件视觉推理'), fontSize: 18 }),
    moduleNode(palette, { id: 'vla-attention', kind: 'scientific-attention-map', role: 'annotation', x: 1062, y: 266, width: 112, height: 124, label: t('Cross-modal attention', '跨模态注意力'), detail: 'standard' }),
    moduleNode(palette, { id: 'vla-policy-latent', kind: 'scientific-feature-map', role: 'policy', x: 1062, y: 414, width: 112, height: 112, label: t('Policy latent', '策略潜变量'), detail: 'standard' }),
    moduleNode(palette, { id: 'vla-action-expert', kind: 'scientific-layer-stack', role: 'policy', x: 812, y: 530, width: 192, height: 142, label: t('Action expert', '动作专家'), description: t('flow / diffusion head', '流匹配 / 扩散头'), fontSize: 15 }),
    moduleNode(palette, { id: 'vla-uncertainty', kind: 'scientific-uncertainty-band', role: 'loss', x: 1032, y: 538, width: 144, height: 126, label: t('Trajectory uncertainty', '轨迹不确定性'), detail: 'standard' }),
    moduleNode(palette, { id: 'vla-training-loss', kind: 'scientific-loss-target', role: 'loss', x: 1002, y: 674, width: 150, height: 72, label: t('Action + language objective', '动作 + 语言目标'), detail: 'detailed' }),
    moduleNode(palette, { id: 'vla-decision', kind: 'scientific-decision-gate', role: 'policy', x: 1268, y: 122, width: 198, height: 132, label: t('Candidate ranking', '候选动作排序'), description: t('feasibility · value · risk', '可行性 · 价值 · 风险') }),
    moduleNode(palette, { id: 'vla-control-metrics', kind: 'scientific-metric-panel', role: 'annotation', x: 1490, y: 128, width: 166, height: 118, label: t('Control profile', '控制规格'), description: t('20 Hz · H=16 · 7 DoF', '20 Hz · H=16 · 7 自由度'), detail: 'standard' }),
    moduleNode(palette, { id: 'vla-action-chunk', kind: 'scientific-action-chunk', role: 'action', x: 1268, y: 302, width: 388, height: 98, label: t('Selected action chunk', '已选动作块'), description: t('T x {pose, gripper, base}', 'T × {位姿, 夹爪, 底盘}') }),
    moduleNode(palette, { id: 'vla-safety', role: 'policy', x: 1268, y: 446, width: 176, height: 80, label: t('Safety constraints', '安全约束'), description: t('workspace + collision', '工作空间 + 碰撞') }),
    moduleNode(palette, { id: 'vla-controller', role: 'action', x: 1480, y: 446, width: 176, height: 80, label: t('Low-level controller', '底层控制器'), description: t('joint targets + impedance', '关节目标 + 阻抗') }),
    moduleNode(palette, { id: 'vla-robot', kind: 'scientific-scene-frame', role: 'environment', x: 1322, y: 566, width: 280, height: 164, label: t('Robot in environment', '环境中的机器人'), description: t('closed-loop execution', '闭环执行') }),
    moduleNode(palette, { id: 'vla-feedback', kind: 'note', role: 'annotation', x: 1258, y: 738, width: 408, height: 42, label: t('Dashed return: next observation and proprioceptive state', '虚线回流：下一观察与本体状态'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'vla-scene', 'vla-vision'),
    moduleEdge(palette, 'vla-vision', 'vla-feature-map'),
    moduleEdge(palette, 'vla-language', 'vla-tokenizer'),
    moduleEdge(palette, 'vla-tokenizer', 'vla-language-token'),
    moduleEdge(palette, 'vla-state', 'vla-state-projector'),
    moduleEdge(palette, 'vla-state-projector', 'vla-state-space'),
    moduleEdge(palette, 'vla-feature-map', 'vla-fusion'),
    moduleEdge(palette, 'vla-language-token', 'vla-fusion'),
    moduleEdge(palette, 'vla-state-space', 'vla-fusion'),
    moduleEdge(palette, 'vla-fusion', 'vla-token-sequence', { width: 2.4 }),
    moduleEdge(palette, 'vla-token-sequence', 'vla-backbone', { width: 2.4 }),
    moduleEdge(palette, 'vla-backbone', 'vla-attention', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'vla-backbone', 'vla-policy-latent'),
    moduleEdge(palette, 'vla-backbone', 'vla-action-expert'),
    moduleEdge(palette, 'vla-policy-latent', 'vla-action-expert'),
    moduleEdge(palette, 'vla-uncertainty', 'vla-action-expert', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'vla-action-expert', 'vla-decision', { width: 2.2 }),
    moduleEdge(palette, 'vla-decision', 'vla-action-chunk', { width: 2.4, label: t('select', '选择') }),
    moduleEdge(palette, 'vla-action-chunk', 'vla-safety'),
    moduleEdge(palette, 'vla-action-chunk', 'vla-controller'),
    moduleEdge(palette, 'vla-safety', 'vla-robot'),
    moduleEdge(palette, 'vla-controller', 'vla-robot'),
    moduleEdge(palette, 'vla-training-loss', 'vla-action-expert', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'vla-robot', 'vla-scene', { routing: 'bezier', feedback: true, label: t('next observation', '下一观察') }),
    moduleEdge(palette, 'vla-robot', 'vla-state', { routing: 'bezier', feedback: true }),
  ];
  return { nodes, edges, width: 1720, height: 820 };
}

function buildPromptAgent(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'pa-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1280, height: 660, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'pa-prompt-phase', kind: 'group', role: 'phase', x: 30, y: 72, width: 330, height: 540, label: t('Multimodal task prompt', '多模态任务提示') }),
    moduleNode(palette, { id: 'pa-agent-phase', kind: 'group', role: 'phase', x: 385, y: 72, width: 520, height: 540, label: t('Prompt-conditioned controller', '提示条件控制器') }),
    moduleNode(palette, { id: 'pa-world-phase', kind: 'group', role: 'phase', x: 930, y: 72, width: 320, height: 540, label: t('Embodied interaction', '具身交互') }),
    moduleNode(palette, { id: 'pa-text-prompt', role: 'modality', x: 65, y: 128, width: 120, height: 70, label: t('Text goal', '文本目标') }),
    moduleNode(palette, { id: 'pa-image-prompt', kind: 'scientific-image-frame', role: 'modality', x: 205, y: 116, width: 120, height: 94, label: t('Image prompt', '图像提示') }),
    moduleNode(palette, { id: 'pa-demo-prompt', kind: 'scientific-timeline', role: 'modality', x: 65, y: 230, width: 260, height: 92, label: t('Video / demonstration frames', '视频 / 示范帧'), detail: 'standard' }),
    moduleNode(palette, { id: 'pa-prompt-encoder', role: 'encoder', x: 86, y: 360, width: 218, height: 100, label: t('Prompt encoder', '提示编码器'), description: t('language + object tokens', '语言 + 对象 Token') }),
    moduleNode(palette, { id: 'pa-prompt-tokens', kind: 'scientific-token-strip', role: 'token', x: 86, y: 496, width: 218, height: 74, label: t('Prompt tokens', '提示 Token') }),
    moduleNode(palette, { id: 'pa-history', kind: 'scientific-timeline', role: 'memory', x: 425, y: 126, width: 180, height: 98, label: t('Interaction history', '交互历史'), description: t('observations + actions', '观察 + 动作') }),
    moduleNode(palette, { id: 'pa-controller', kind: 'scientific-transformer', role: 'backbone', x: 626, y: 176, width: 235, height: 250, label: options.backbone || t('Causal transformer', '因果 Transformer'), description: t('alternating self-attention', '交替自注意力'), fontSize: 17 }),
    moduleNode(palette, { id: 'pa-cross-attn', role: 'bridge', x: 425, y: 296, width: 180, height: 96, label: t('Cross-attention', '交叉注意力'), description: t('prompt conditioning', '提示条件化') }),
    moduleNode(palette, { id: 'pa-action-token', kind: 'scientific-action-chunk', role: 'action', x: 664, y: 480, width: 160, height: 80, label: t('Motor command token', '运动指令 Token') }),
    moduleNode(palette, { id: 'pa-observation', kind: 'scientific-image-frame', role: 'modality', x: 972, y: 124, width: 230, height: 98, label: t('Current observation', '当前观察') }),
    moduleNode(palette, { id: 'pa-robot', kind: 'scientific-robot-arm', role: 'environment', x: 1000, y: 288, width: 174, height: 148, label: t('Robot workspace', '机器人工作空间') }),
    moduleNode(palette, { id: 'pa-result', role: 'action', x: 972, y: 500, width: 230, height: 64, label: t('Task progress', '任务进展'), description: t('next interaction step', '下一交互步') }),
    moduleNode(palette, { id: 'pa-generalization', kind: 'note', role: 'annotation', x: 430, y: 488, width: 190, height: 70, label: t('Prompt structure enables compositional task reuse.', '提示结构支持组合式任务复用。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'pa-text-prompt', 'pa-prompt-encoder'),
    moduleEdge(palette, 'pa-image-prompt', 'pa-prompt-encoder'),
    moduleEdge(palette, 'pa-demo-prompt', 'pa-prompt-encoder'),
    moduleEdge(palette, 'pa-prompt-encoder', 'pa-prompt-tokens'),
    moduleEdge(palette, 'pa-prompt-tokens', 'pa-cross-attn'),
    moduleEdge(palette, 'pa-history', 'pa-controller'),
    moduleEdge(palette, 'pa-cross-attn', 'pa-controller'),
    moduleEdge(palette, 'pa-controller', 'pa-action-token'),
    moduleEdge(palette, 'pa-action-token', 'pa-robot'),
    moduleEdge(palette, 'pa-robot', 'pa-result'),
    moduleEdge(palette, 'pa-result', 'pa-observation', { routing: 'bezier', feedback: true }),
    moduleEdge(palette, 'pa-observation', 'pa-history', { routing: 'bezier', feedback: true }),
  ];
  return { nodes, edges, width: 1280, height: 660 };
}

function buildEmbodiedLoop(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'el-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1200, height: 700, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'el-perception', kind: 'scientific-camera', role: 'encoder', x: 100, y: 144, width: 190, height: 116, label: t('Multimodal perception', '多模态感知'), description: t('vision · audio · touch', '视觉 · 听觉 · 触觉') }),
    moduleNode(palette, { id: 'el-state-estimate', kind: 'scientific-voxel-grid', role: 'token', x: 320, y: 238, width: 190, height: 100, label: t('State estimate', '状态估计'), description: t('objects + relations', '对象 + 关系') }),
    moduleNode(palette, { id: 'el-world-model', kind: 'scientific-transformer', role: 'backbone', x: 390, y: 94, width: 230, height: 126, label: t('World model', '世界模型'), description: t('latent state + dynamics', '潜在状态 + 动力学'), fontSize: 17 }),
    moduleNode(palette, { id: 'el-goal', role: 'modality', x: 760, y: 54, width: 220, height: 50, label: t('Task goal + constraints', '任务目标 + 约束') }),
    moduleNode(palette, { id: 'el-planner', kind: 'hexagon', role: 'policy', x: 760, y: 130, width: 220, height: 112, label: t('Reasoning and planning', '推理与规划'), description: t('goals · constraints · substeps', '目标 · 约束 · 子任务') }),
    moduleNode(palette, { id: 'el-policy', kind: 'scientific-action-chunk', role: 'policy', x: 890, y: 340, width: 196, height: 104, label: options.backbone || t('Policy', '策略模型'), description: t('select action chunk', '选择动作块') }),
    moduleNode(palette, { id: 'el-actuation', kind: 'scientific-trajectory', role: 'action', x: 650, y: 522, width: 210, height: 94, label: t('Control and actuation', '控制与执行'), description: t('trajectory · gripper · base', '轨迹 · 夹爪 · 底盘') }),
    moduleNode(palette, { id: 'el-environment', kind: 'scientific-robot-arm', role: 'environment', x: 420, y: 410, width: 190, height: 162, label: t('Robot in environment', '环境中的机器人'), description: t('physical state changes', '物理状态变化'), fontSize: 16 }),
    moduleNode(palette, { id: 'el-memory', kind: 'database', role: 'memory', x: 112, y: 390, width: 170, height: 112, label: t('Episodic memory', '情景记忆'), description: t('experience + retrieval', '经验 + 检索'), detail: 'standard' }),
    moduleNode(palette, { id: 'el-safety', role: 'loss', x: 908, y: 520, width: 156, height: 74, label: t('Safety guard', '安全约束'), description: t('monitor + veto', '监控 + 否决'), detail: 'standard' }),
    moduleNode(palette, { id: 'el-imagination', kind: 'note', role: 'annotation', x: 410, y: 274, width: 200, height: 70, label: t('Imagine candidate futures before acting.', '行动前预测候选未来。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
    moduleNode(palette, { id: 'el-feedback-label', kind: 'note', role: 'annotation', x: 104, y: 566, width: 190, height: 62, label: t('Continuous sensing closes the loop.', '持续感知闭合控制回路。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'el-perception', 'el-state-estimate'),
    moduleEdge(palette, 'el-state-estimate', 'el-world-model'),
    moduleEdge(palette, 'el-world-model', 'el-planner'),
    moduleEdge(palette, 'el-goal', 'el-planner'),
    moduleEdge(palette, 'el-planner', 'el-policy'),
    moduleEdge(palette, 'el-policy', 'el-actuation'),
    moduleEdge(palette, 'el-actuation', 'el-environment'),
    moduleEdge(palette, 'el-environment', 'el-perception', { routing: 'bezier', feedback: true, label: t('new observation', '新观察') }),
    moduleEdge(palette, 'el-perception', 'el-memory', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'el-memory', 'el-world-model', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'el-world-model', 'el-imagination', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'el-safety', 'el-policy', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'el-safety', 'el-actuation', { lineStyle: 'dashed', arrowEnd: 'open' }),
  ];
  return { nodes, edges, width: 1200, height: 700 };
}

function buildTrainDeploy(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'td-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1360, height: 700, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'td-train', kind: 'group', role: 'phase', x: 28, y: 70, width: 775, height: 580, label: t('Offline training', '离线训练') }),
    moduleNode(palette, { id: 'td-deploy', kind: 'group', role: 'phase', x: 828, y: 70, width: 504, height: 580, label: t('Online deployment', '在线部署') }),
    moduleNode(palette, { id: 'td-internet', kind: 'scientific-dataset-stack', role: 'dataset', x: 66, y: 118, width: 170, height: 108, label: t('Image-text data', '图文数据') }),
    moduleNode(palette, { id: 'td-oxe', kind: 'scientific-dataset-stack', role: 'dataset', x: 66, y: 266, width: 170, height: 108, label: t('Open robot data', '开放机器人数据') }),
    moduleNode(palette, { id: 'td-private', kind: 'scientific-dataset-stack', role: 'dataset', x: 66, y: 414, width: 170, height: 108, label: t('Target robot data', '目标机器人数据'), detail: 'standard' }),
    moduleNode(palette, { id: 'td-mixture', role: 'bridge', x: 282, y: 246, width: 174, height: 130, label: t('Data mixture', '数据混合'), description: t('sampling + normalization', '采样 + 归一化') }),
    moduleNode(palette, { id: 'td-pretrain', kind: 'scientific-transformer', role: 'backbone', x: 500, y: 148, width: 190, height: 130, label: t('VLM pretraining', 'VLM 预训练'), description: t('visual-language priors', '视觉语言先验') }),
    moduleNode(palette, { id: 'td-policy-train', kind: 'scientific-trainable', role: 'policy', x: 500, y: 348, width: 190, height: 130, label: t('Policy adaptation', '策略适配'), description: t('action expert + embodiment', '动作专家 + 机体适配') }),
    moduleNode(palette, { id: 'td-loss', role: 'loss', x: 300, y: 462, width: 160, height: 72, label: t('Training objectives', '训练目标'), description: t('language + action', '语言 + 动作'), detail: 'detailed' }),
    moduleNode(palette, { id: 'td-checkpoint', kind: 'document', role: 'memory', x: 716, y: 258, width: 62, height: 128, label: t('Model\ncheckpoint', '模型\n检查点'), fontSize: 11 }),
    moduleNode(palette, { id: 'td-observation', role: 'modality', x: 866, y: 134, width: 150, height: 72, label: t('Observation', '环境观察') }),
    moduleNode(palette, { id: 'td-instruction', role: 'modality', x: 866, y: 250, width: 150, height: 72, label: t('Instruction', '任务指令') }),
    moduleNode(palette, { id: 'td-model', kind: 'scientific-transformer', role: 'backbone', x: 1050, y: 166, width: 225, height: 168, label: options.backbone || t('Generalist policy', '通用策略模型'), description: t('shared weights, robot adapters', '共享权重 + 机器人适配'), fontSize: 17 }),
    moduleNode(palette, { id: 'td-action', kind: 'scientific-action-chunk', role: 'action', x: 1110, y: 382, width: 166, height: 84, label: t('Action chunk', '动作块') }),
    moduleNode(palette, { id: 'td-robot', kind: 'scientific-mobile-robot', role: 'environment', x: 892, y: 430, width: 162, height: 138, label: t('Robot embodiment', '机器人机体'), description: t('arm · mobile · dual-arm', '机械臂 · 移动 · 双臂') }),
    moduleNode(palette, { id: 'td-monitor', role: 'annotation', x: 1110, y: 516, width: 166, height: 66, label: t('Rollout metrics', '在线评估指标'), detail: 'standard' }),
    moduleNode(palette, { id: 'td-feedback-note', kind: 'note', role: 'annotation', x: 858, y: 574, width: 432, height: 48, label: t('Curated failures can return to the target-robot dataset.', '筛选后的失败样本可回流目标机器人数据。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'td-internet', 'td-mixture'),
    moduleEdge(palette, 'td-oxe', 'td-mixture'),
    moduleEdge(palette, 'td-private', 'td-mixture'),
    moduleEdge(palette, 'td-mixture', 'td-pretrain'),
    moduleEdge(palette, 'td-mixture', 'td-policy-train'),
    moduleEdge(palette, 'td-pretrain', 'td-policy-train'),
    moduleEdge(palette, 'td-loss', 'td-policy-train', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'td-policy-train', 'td-checkpoint'),
    moduleEdge(palette, 'td-checkpoint', 'td-model'),
    moduleEdge(palette, 'td-observation', 'td-model'),
    moduleEdge(palette, 'td-instruction', 'td-model'),
    moduleEdge(palette, 'td-model', 'td-action'),
    moduleEdge(palette, 'td-action', 'td-robot'),
    moduleEdge(palette, 'td-robot', 'td-observation', { routing: 'bezier', feedback: true }),
    moduleEdge(palette, 'td-robot', 'td-monitor'),
    moduleEdge(palette, 'td-monitor', 'td-private', { routing: 'bezier', feedback: true, label: t('curated failures', '失败回流') }),
  ];
  return { nodes, edges, width: 1360, height: 700 };
}

function buildLlmTrainingPipeline(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'lt-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1860, height: 840, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'lt-data-phase', kind: 'group', role: 'phase', x: 28, y: 76, width: 300, height: 700, label: t('1  Curate licensed data', '1  策展合规数据') }),
    moduleNode(palette, { id: 'lt-pretrain-phase', kind: 'group', role: 'phase', x: 348, y: 76, width: 300, height: 700, label: t('2  Pretrain', '2  预训练') }),
    moduleNode(palette, { id: 'lt-sft-phase', kind: 'group', role: 'phase', x: 668, y: 76, width: 312, height: 700, label: t('3  Instruction tune', '3  指令微调') }),
    moduleNode(palette, { id: 'lt-align-phase', kind: 'group', role: 'phase', x: 1000, y: 76, width: 410, height: 700, label: t('4  Align preferences', '4  偏好对齐') }),
    moduleNode(palette, { id: 'lt-eval-phase', kind: 'group', role: 'phase', x: 1430, y: 76, width: 402, height: 700, label: t('5  Evaluate and serve', '5  评测与服务') }),
    moduleNode(palette, { id: 'lt-raw-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 60, y: 124, width: 132, height: 116, label: t('Web · code · books', '网页 · 代码 · 书籍'), description: t('source + license tracked', '来源与许可可追踪') }),
    moduleNode(palette, { id: 'lt-curation', kind: 'scientific-data-funnel', role: 'bridge', x: 210, y: 122, width: 104, height: 122, label: t('Filter + deduplicate', '过滤 + 去重'), description: t('quality · privacy · safety', '质量 · 隐私 · 安全') }),
    moduleNode(palette, { id: 'lt-mixture', kind: 'scientific-dataset-stack', role: 'dataset', x: 78, y: 294, width: 206, height: 120, label: t('Audited training mixture', '审计后的训练混合'), description: t('domain and language balance', '领域与语言平衡') }),
    moduleNode(palette, { id: 'lt-distribution', kind: 'scientific-probability-bars', role: 'dataset', x: 84, y: 466, width: 194, height: 124, label: t('Mixture distribution', '混合比例'), description: t('tokens by source family', '按来源统计 Token') , detail: 'standard' }),
    moduleNode(palette, { id: 'lt-license-note', kind: 'note', role: 'annotation', x: 62, y: 638, width: 232, height: 90, label: t('Attach provenance, opt-out policy, and contamination report.', '附带来源、退出策略与污染检查报告。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
    moduleNode(palette, { id: 'lt-pretrain-tokens', kind: 'scientific-token-strip', role: 'token', x: 378, y: 126, width: 240, height: 88, label: t('Packed token batches', '打包 Token 批次'), description: t('document boundaries retained', '保留文档边界') }),
    moduleNode(palette, { id: 'lt-base-model', kind: 'scientific-transformer', role: 'backbone', x: 406, y: 272, width: 184, height: 176, label: options.backbone || t('Base model', '基础模型'), description: t('causal language modeling', '因果语言建模'), fontSize: 16 }),
    moduleNode(palette, { id: 'lt-next-token', kind: 'scientific-loss-target', role: 'loss', x: 430, y: 506, width: 136, height: 118, label: t('Next-token objective', '下一 Token 目标'), description: t('masked loss + schedule', '掩码损失 + 调度') }),
    moduleNode(palette, { id: 'lt-pretrain-metrics', kind: 'scientific-metric-panel', role: 'annotation', x: 382, y: 652, width: 232, height: 94, label: t('Training telemetry', '训练遥测'), description: t('loss · tokens/s · compute', '损失 · 吞吐 · 计算量'), detail: 'standard' }),
    moduleNode(palette, { id: 'lt-instruction-data', kind: 'scientific-prompt-card', role: 'dataset', x: 700, y: 122, width: 248, height: 126, label: t('Instruction examples', '指令样本'), description: t('task · response · rationale', '任务 · 回答 · 理由') }),
    moduleNode(palette, { id: 'lt-sft-model', kind: 'scientific-trainable', role: 'backbone', x: 732, y: 310, width: 184, height: 154, label: t('SFT checkpoint', 'SFT 检查点'), description: t('supervised adaptation', '监督适配') }),
    moduleNode(palette, { id: 'lt-sft-loss', kind: 'scientific-loss-target', role: 'loss', x: 754, y: 518, width: 140, height: 112, label: t('Response-only loss', '仅回答区损失'), detail: 'standard' }),
    moduleNode(palette, { id: 'lt-sft-ablation', kind: 'scientific-ablation-table', role: 'annotation', x: 718, y: 652, width: 212, height: 94, label: t('Data scaling ablation', '数据规模消融'), detail: 'detailed' }),
    moduleNode(palette, { id: 'lt-preference-data', kind: 'scientific-preference-pair', role: 'dataset', x: 1032, y: 122, width: 216, height: 132, label: t('Chosen / rejected pairs', '偏好 / 拒绝样本对'), description: t('human + synthetic judges', '人工 + 合成评审') }),
    moduleNode(palette, { id: 'lt-red-team', kind: 'scientific-prompt-card', role: 'dataset', x: 1268, y: 130, width: 112, height: 118, label: t('Red-team prompts', '红队提示'), detail: 'standard' }),
    moduleNode(palette, { id: 'lt-reward', kind: 'scientific-decision-gate', role: 'loss', x: 1044, y: 326, width: 194, height: 132, label: t('Reward / DPO signal', '奖励 / DPO 信号'), description: t('rank · margin · confidence', '排序 · 间隔 · 置信度') }),
    moduleNode(palette, { id: 'lt-aligned-model', kind: 'scientific-trainable', role: 'policy', x: 1262, y: 314, width: 126, height: 154, label: t('Aligned checkpoint', '对齐检查点'), description: t('policy update', '策略更新') }),
    moduleNode(palette, { id: 'lt-safety-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 1046, y: 526, width: 190, height: 116, label: t('Safety + refusal set', '安全 + 拒答数据'), detail: 'standard' }),
    moduleNode(palette, { id: 'lt-alignment-objective', kind: 'scientific-loss-target', role: 'loss', x: 1270, y: 526, width: 110, height: 112, label: t('KL / margin', 'KL / 间隔'), detail: 'standard' }),
    moduleNode(palette, { id: 'lt-alignment-note', kind: 'note', role: 'annotation', x: 1064, y: 674, width: 294, height: 62, label: t('Report annotator mix, agreement, and preference uncertainty.', '报告标注者构成、一致性与偏好不确定性。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
    moduleNode(palette, { id: 'lt-capability-plot', kind: 'scientific-equation', role: 'action', x: 1458, y: 122, width: 174, height: 140, label: t('Evaluation contract', '评测协议'), description: t('tasks · baselines · seeds · CI', '任务 · 基线 · 随机种子 · 置信区间') }),
    moduleNode(palette, { id: 'lt-safety-plot', kind: 'scientific-equation', role: 'loss', x: 1650, y: 128, width: 154, height: 126, label: t('Safety contract', '安全协议'), description: t('risk · calibration · refusal', '风险 · 校准 · 拒答') }),
    moduleNode(palette, { id: 'lt-deploy-model', kind: 'scientific-transformer', role: 'backbone', x: 1510, y: 330, width: 210, height: 184, label: t('Release checkpoint', '发布检查点'), description: t('versioned + reproducible', '版本化 + 可复现'), fontSize: 16 }),
    moduleNode(palette, { id: 'lt-response', kind: 'scientific-token-strip', role: 'action', x: 1458, y: 564, width: 180, height: 94, label: t('Response + citations', '回答 + 引用'), description: t('served output', '服务输出') }),
    moduleNode(palette, { id: 'lt-uncertainty', kind: 'scientific-equation', role: 'annotation', x: 1650, y: 556, width: 154, height: 118, label: t('Drift checks', '漂移检查'), description: t('distribution · calibration', '分布 · 校准'), detail: 'standard' }),
    moduleNode(palette, { id: 'lt-release-note', kind: 'note', role: 'annotation', x: 1494, y: 700, width: 278, height: 48, label: t('Evaluation failures return to curation, never directly to training.', '评测失败回到数据策展，不直接进入训练。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
  ];
  const edges = [
    moduleEdge(palette, 'lt-raw-data', 'lt-curation'),
    moduleEdge(palette, 'lt-curation', 'lt-mixture'),
    moduleEdge(palette, 'lt-mixture', 'lt-distribution', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'lt-mixture', 'lt-pretrain-tokens', { width: 2.2 }),
    moduleEdge(palette, 'lt-pretrain-tokens', 'lt-base-model'),
    moduleEdge(palette, 'lt-next-token', 'lt-base-model', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'lt-base-model', 'lt-sft-model', { width: 2.4, label: t('base', '基础') }),
    moduleEdge(palette, 'lt-instruction-data', 'lt-sft-model'),
    moduleEdge(palette, 'lt-sft-loss', 'lt-sft-model', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'lt-sft-model', 'lt-aligned-model', { width: 2.4, label: t('instruct', '指令版') }),
    moduleEdge(palette, 'lt-preference-data', 'lt-reward'),
    moduleEdge(palette, 'lt-reward', 'lt-aligned-model'),
    moduleEdge(palette, 'lt-red-team', 'lt-safety-data'),
    moduleEdge(palette, 'lt-safety-data', 'lt-aligned-model', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'lt-alignment-objective', 'lt-aligned-model', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'lt-aligned-model', 'lt-deploy-model', { width: 2.4, label: t('aligned', '对齐版') }),
    moduleEdge(palette, 'lt-deploy-model', 'lt-capability-plot'),
    moduleEdge(palette, 'lt-deploy-model', 'lt-safety-plot'),
    moduleEdge(palette, 'lt-deploy-model', 'lt-response'),
    moduleEdge(palette, 'lt-deploy-model', 'lt-uncertainty', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'lt-capability-plot', 'lt-curation', { routing: 'bezier', feedback: true, label: t('failure slices', '失败切片') }),
  ];
  return { nodes, edges, width: 1860, height: 840 };
}

function buildMoeRouting(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'moe-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1320, height: 700, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'moe-input-phase', kind: 'group', role: 'phase', x: 28, y: 70, width: 230, height: 570, label: t('Token input', 'Token 输入') }),
    moduleNode(palette, { id: 'moe-router-phase', kind: 'group', role: 'phase', x: 280, y: 70, width: 240, height: 570, label: t('Sparse routing', '稀疏路由') }),
    moduleNode(palette, { id: 'moe-expert-phase', kind: 'group', role: 'phase', x: 542, y: 70, width: 450, height: 570, label: t('Expert bank', '专家阵列') }),
    moduleNode(palette, { id: 'moe-output-phase', kind: 'group', role: 'phase', x: 1014, y: 70, width: 278, height: 570, label: t('Weighted output', '加权输出') }),
    moduleNode(palette, { id: 'moe-input', kind: 'scientific-token-strip', role: 'token', x: 58, y: 142, width: 170, height: 82, label: t('Input tokens', '输入 Token') }),
    moduleNode(palette, { id: 'moe-layer-inset', kind: 'scientific-transformer', role: 'backbone', x: 72, y: 344, width: 144, height: 150, label: options.backbone || t('Sparse MoE', '稀疏专家模型') }),
    moduleNode(palette, { id: 'moe-router', role: 'bridge', x: 316, y: 150, width: 168, height: 86, label: t('Top-k router', 'Top-k 路由器'), description: t('token-wise gates', '逐 Token 门控') }),
    moduleNode(palette, { id: 'moe-gates', kind: 'scientific-mini-plot', role: 'token', x: 320, y: 330, width: 160, height: 130, label: t('Gate scores', '门控分数') }),
    moduleNode(palette, { id: 'moe-balance', kind: 'scientific-loss-target', role: 'loss', x: 342, y: 510, width: 116, height: 102, label: t('Load balance', '负载均衡'), detail: 'standard' }),
    moduleNode(palette, { id: 'moe-expert-1', kind: 'scientific-layer-stack', role: 'encoder', x: 580, y: 116, width: 150, height: 126, label: t('Expert 1 · selected', '专家 1 · 已选择') }),
    moduleNode(palette, { id: 'moe-expert-2', kind: 'scientific-layer-stack', role: 'encoder', x: 784, y: 116, width: 150, height: 126, label: t('Expert 2 · selected', '专家 2 · 已选择') }),
    moduleNode(palette, { id: 'moe-expert-3', kind: 'scientific-layer-stack', role: 'annotation', x: 580, y: 330, width: 150, height: 126, label: t('Expert 3 · inactive', '专家 3 · 未激活') }),
    moduleNode(palette, { id: 'moe-expert-4', kind: 'scientific-layer-stack', role: 'annotation', x: 784, y: 330, width: 150, height: 126, label: t('Expert 4 · inactive', '专家 4 · 未激活') }),
    moduleNode(palette, { id: 'moe-shared', kind: 'scientific-layer-stack', role: 'backbone', x: 682, y: 492, width: 150, height: 126, label: t('Shared expert', '共享专家'), detail: 'standard' }),
    moduleNode(palette, { id: 'moe-merge', kind: 'summing-junction', role: 'action', x: 1050, y: 194, width: 76, height: 76, label: 'Σ', fontSize: 20 }),
    moduleNode(palette, { id: 'moe-output', kind: 'scientific-token-strip', role: 'token', x: 1140, y: 192, width: 126, height: 82, label: t('Output tokens', '输出 Token') }),
    moduleNode(palette, { id: 'moe-throughput', kind: 'scientific-mini-plot', role: 'action', x: 1070, y: 396, width: 170, height: 138, label: t('Capacity / latency', '容量 / 延迟'), detail: 'standard' }),
  ];
  const edges = [
    moduleEdge(palette, 'moe-input', 'moe-router'),
    moduleEdge(palette, 'moe-router', 'moe-gates'),
    moduleEdge(palette, 'moe-router', 'moe-expert-1', { label: '0.62', width: 2.2 }),
    moduleEdge(palette, 'moe-router', 'moe-expert-2', { label: '0.31', width: 2.2 }),
    moduleEdge(palette, 'moe-router', 'moe-expert-3', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'moe-router', 'moe-expert-4', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'moe-router', 'moe-shared', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'moe-expert-1', 'moe-merge'),
    moduleEdge(palette, 'moe-expert-2', 'moe-merge'),
    moduleEdge(palette, 'moe-shared', 'moe-merge', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'moe-merge', 'moe-output'),
    moduleEdge(palette, 'moe-balance', 'moe-router', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'moe-layer-inset', 'moe-router', { lineStyle: 'dotted', arrowEnd: 'open', label: t('replaces FFN', '替换 FFN') }),
    moduleEdge(palette, 'moe-output', 'moe-throughput', { lineStyle: 'dashed', arrowEnd: 'open' }),
  ];
  return { nodes, edges, width: 1320, height: 700 };
}

function buildRagToolAgent(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'rag-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1420, height: 720, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'rag-input-phase', kind: 'group', role: 'phase', x: 28, y: 70, width: 250, height: 600, label: t('Question and plan', '问题与计划') }),
    moduleNode(palette, { id: 'rag-resource-phase', kind: 'group', role: 'phase', x: 300, y: 70, width: 430, height: 600, label: t('External resources', '外部资源') }),
    moduleNode(palette, { id: 'rag-context-phase', kind: 'group', role: 'phase', x: 752, y: 70, width: 370, height: 600, label: t('Evidence-grounded model', '证据增强模型') }),
    moduleNode(palette, { id: 'rag-answer-phase', kind: 'group', role: 'phase', x: 1144, y: 70, width: 248, height: 600, label: t('Answer and citation', '回答与引用') }),
    moduleNode(palette, { id: 'rag-question', kind: 'callout', role: 'modality', x: 62, y: 132, width: 180, height: 92, label: t('User question', '用户问题'), description: t('intent + constraints', '意图 + 约束') }),
    moduleNode(palette, { id: 'rag-planner', kind: 'decision', role: 'policy', x: 78, y: 292, width: 150, height: 126, label: t('Plan / route', '规划 / 路由') }),
    moduleNode(palette, { id: 'rag-memory', kind: 'scientific-dataset-stack', role: 'memory', x: 74, y: 504, width: 160, height: 116, label: t('Conversation memory', '对话记忆'), detail: 'standard' }),
    moduleNode(palette, { id: 'rag-query', kind: 'scientific-token-strip', role: 'token', x: 340, y: 120, width: 160, height: 78, label: t('Search query', '检索查询') }),
    moduleNode(palette, { id: 'rag-retriever', role: 'encoder', x: 528, y: 124, width: 160, height: 76, label: t('Retriever', '检索器'), description: t('dense + lexical', '稠密 + 词法') }),
    moduleNode(palette, { id: 'rag-knowledge', kind: 'scientific-dataset-stack', role: 'dataset', x: 420, y: 250, width: 182, height: 118, label: t('Vector + document store', '向量 + 文档库') }),
    moduleNode(palette, { id: 'rag-tool', kind: 'arch-api', role: 'environment', x: 338, y: 460, width: 150, height: 92, label: t('Search / API / code', '搜索 / API / 代码') }),
    moduleNode(palette, { id: 'rag-observation', kind: 'scientific-timeline', role: 'memory', x: 510, y: 454, width: 180, height: 96, label: t('Tool observation', '工具观察') }),
    moduleNode(palette, { id: 'rag-evidence', kind: 'scientific-token-strip', role: 'token', x: 794, y: 136, width: 284, height: 84, label: t('[Question] [Doc 1] [Doc 2] [Tool result]', '[问题] [文档1] [文档2] [工具结果]') }),
    moduleNode(palette, { id: 'rag-llm', kind: 'scientific-transformer', role: 'backbone', x: 842, y: 280, width: 190, height: 170, label: options.backbone || t('Grounded LLM', '证据增强 LLM') }),
    moduleNode(palette, { id: 'rag-verifier', kind: 'scientific-loss-target', role: 'loss', x: 874, y: 510, width: 130, height: 112, label: t('Evidence check', '证据校验'), detail: 'standard' }),
    moduleNode(palette, { id: 'rag-answer', kind: 'callout', role: 'action', x: 1180, y: 160, width: 178, height: 112, label: t('Grounded answer', '基于证据的回答') }),
    moduleNode(palette, { id: 'rag-citations', kind: 'multiple-documents', role: 'dataset', x: 1196, y: 346, width: 146, height: 112, label: t('Citations', '引用来源') }),
    moduleNode(palette, { id: 'rag-confidence', kind: 'scientific-mini-plot', role: 'annotation', x: 1190, y: 514, width: 160, height: 118, label: t('Confidence', '置信度'), detail: 'detailed' }),
  ];
  const edges = [
    moduleEdge(palette, 'rag-question', 'rag-planner'),
    moduleEdge(palette, 'rag-memory', 'rag-planner', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'rag-planner', 'rag-query', { label: t('retrieve', '检索') }),
    moduleEdge(palette, 'rag-query', 'rag-retriever'),
    moduleEdge(palette, 'rag-knowledge', 'rag-retriever'),
    moduleEdge(palette, 'rag-retriever', 'rag-evidence', { label: 'top-k' }),
    moduleEdge(palette, 'rag-planner', 'rag-tool', { label: t('call', '调用') }),
    moduleEdge(palette, 'rag-tool', 'rag-observation'),
    moduleEdge(palette, 'rag-observation', 'rag-planner', { routing: 'bezier', feedback: true }),
    moduleEdge(palette, 'rag-observation', 'rag-evidence'),
    moduleEdge(palette, 'rag-question', 'rag-evidence'),
    moduleEdge(palette, 'rag-evidence', 'rag-llm'),
    moduleEdge(palette, 'rag-llm', 'rag-verifier', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'rag-verifier', 'rag-llm', { routing: 'bezier', feedback: true }),
    moduleEdge(palette, 'rag-llm', 'rag-answer'),
    moduleEdge(palette, 'rag-answer', 'rag-citations'),
    moduleEdge(palette, 'rag-citations', 'rag-confidence', { lineStyle: 'dotted', arrowEnd: 'open' }),
  ];
  return { nodes, edges, width: 1420, height: 720 };
}

function buildReasoningTrace(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'rt-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1380, height: 720, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'rt-summary-phase', kind: 'group', role: 'phase', x: 28, y: 68, width: 1324, height: 236, label: t('Abstract reasoning path', '抽象推理路径') }),
    moduleNode(palette, { id: 'rt-trace-phase', kind: 'group', role: 'phase', x: 28, y: 326, width: 1324, height: 346, label: t('Readable example trace', '可读样例轨迹') }),
    moduleNode(palette, { id: 'rt-problem', kind: 'callout', role: 'modality', x: 68, y: 128, width: 190, height: 104, label: t('Problem + constraints', '问题 + 约束') }),
    moduleNode(palette, { id: 'rt-reasoner', kind: 'scientific-transformer', role: 'backbone', x: 344, y: 104, width: 180, height: 164, label: options.backbone || t('Reasoner', '推理模型') }),
    moduleNode(palette, { id: 'rt-timeline', kind: 'scientific-timeline', role: 'token', x: 610, y: 130, width: 260, height: 104, label: t('Thought · Action · Observation', '思考 · 动作 · 观察') }),
    moduleNode(palette, { id: 'rt-verifier', kind: 'scientific-loss-target', role: 'loss', x: 956, y: 112, width: 130, height: 138, label: t('Verifier', '校验器') }),
    moduleNode(palette, { id: 'rt-answer', kind: 'scientific-token-strip', role: 'action', x: 1164, y: 140, width: 150, height: 86, label: t('Final answer', '最终回答') }),
    moduleNode(palette, { id: 'rt-step-1', kind: 'callout', role: 'token', x: 64, y: 390, width: 220, height: 116, label: t('Thought 1', '思考 1'), description: t('decompose the task', '拆解任务') }),
    moduleNode(palette, { id: 'rt-step-2', kind: 'arch-api', role: 'environment', x: 330, y: 410, width: 176, height: 90, label: t('Action · search/tool', '动作 · 搜索/工具') }),
    moduleNode(palette, { id: 'rt-step-3', kind: 'callout', role: 'modality', x: 552, y: 390, width: 220, height: 116, label: t('Observation', '观察'), description: t('returned evidence', '返回的证据') }),
    moduleNode(palette, { id: 'rt-step-4', kind: 'callout', role: 'token', x: 818, y: 390, width: 220, height: 116, label: t('Thought 2', '思考 2'), description: t('revise the hypothesis', '修正假设') }),
    moduleNode(palette, { id: 'rt-candidate', kind: 'scientific-token-strip', role: 'action', x: 1088, y: 406, width: 210, height: 84, label: t('Candidate answer', '候选回答') }),
    moduleNode(palette, { id: 'rt-reject', kind: 'note', role: 'loss', x: 410, y: 554, width: 210, height: 72, label: t('Rejected: evidence conflict', '拒绝：与证据冲突'), detail: 'standard', fontSize: 11 }),
    moduleNode(palette, { id: 'rt-accept', kind: 'note', role: 'environment', x: 900, y: 554, width: 210, height: 72, label: t('Accepted: consistent trace', '接受：轨迹一致'), detail: 'standard', fontSize: 11 }),
  ];
  const edges = [
    moduleEdge(palette, 'rt-problem', 'rt-reasoner'),
    moduleEdge(palette, 'rt-reasoner', 'rt-timeline'),
    moduleEdge(palette, 'rt-timeline', 'rt-verifier'),
    moduleEdge(palette, 'rt-verifier', 'rt-answer'),
    moduleEdge(palette, 'rt-verifier', 'rt-reasoner', { routing: 'bezier', feedback: true, label: t('revise', '修正') }),
    moduleEdge(palette, 'rt-step-1', 'rt-step-2'),
    moduleEdge(palette, 'rt-step-2', 'rt-step-3'),
    moduleEdge(palette, 'rt-step-3', 'rt-step-4'),
    moduleEdge(palette, 'rt-step-4', 'rt-candidate'),
    moduleEdge(palette, 'rt-step-3', 'rt-reject', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'rt-candidate', 'rt-accept'),
    moduleEdge(palette, 'rt-reject', 'rt-step-1', { routing: 'bezier', feedback: true }),
  ];
  return { nodes, edges, width: 1380, height: 720 };
}

function buildRobotDataCollection(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'rd-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1500, height: 720, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'rd-acquire-phase', kind: 'group', role: 'phase', x: 28, y: 68, width: 342, height: 610, label: t('1 · Acquisition rig', '1 · 采集硬件') }),
    moduleNode(palette, { id: 'rd-episode-phase', kind: 'group', role: 'phase', x: 392, y: 68, width: 480, height: 610, label: t('2 · Multi-view episode', '2 · 多视角 Episode') }),
    moduleNode(palette, { id: 'rd-curate-phase', kind: 'group', role: 'phase', x: 894, y: 68, width: 270, height: 610, label: t('3 · Curate and label', '3 · 策展与标注') }),
    moduleNode(palette, { id: 'rd-data-phase', kind: 'group', role: 'phase', x: 1186, y: 68, width: 286, height: 610, label: t('4 · Dataset release', '4 · 数据集发布') }),
    moduleNode(palette, { id: 'rd-camera', kind: 'scientific-camera', role: 'modality', x: 68, y: 126, width: 112, height: 102, label: t('External RGB-D', '外部 RGB-D') }),
    moduleNode(palette, { id: 'rd-wrist-camera', kind: 'scientific-camera', role: 'modality', x: 218, y: 126, width: 112, height: 102, label: t('Wrist camera', '腕部相机') }),
    moduleNode(palette, { id: 'rd-robot', kind: 'scientific-robot-arm', role: 'environment', x: 96, y: 290, width: 152, height: 154, label: t('Collection robot', '采集机器人') }),
    moduleNode(palette, { id: 'rd-teleop', kind: 'scientific-trajectory', role: 'action', x: 76, y: 516, width: 222, height: 94, label: t('Teleoperation path', '遥操作轨迹') }),
    moduleNode(palette, { id: 'rd-view-1', kind: 'scientific-image-frame', role: 'modality', x: 430, y: 126, width: 126, height: 112, label: t('External view', '外部视角') }),
    moduleNode(palette, { id: 'rd-view-2', kind: 'scientific-image-frame', role: 'modality', x: 570, y: 126, width: 126, height: 112, label: t('Wrist view', '腕部视角') }),
    moduleNode(palette, { id: 'rd-view-3', kind: 'scientific-image-frame', role: 'modality', x: 710, y: 126, width: 126, height: 112, label: t('Depth / state', '深度 / 状态') }),
    moduleNode(palette, { id: 'rd-episode', kind: 'scientific-timeline', role: 'token', x: 450, y: 314, width: 360, height: 112, label: t('Episode t₀ … tT', 'Episode t₀ … tT') }),
    moduleNode(palette, { id: 'rd-actions', kind: 'scientific-action-chunk', role: 'action', x: 494, y: 502, width: 272, height: 86, label: t('Joint + gripper actions', '关节 + 夹爪动作') }),
    moduleNode(palette, { id: 'rd-sync', role: 'bridge', x: 934, y: 132, width: 190, height: 74, label: t('Synchronize + segment', '同步 + 切分') }),
    moduleNode(palette, { id: 'rd-filter', kind: 'scientific-loss-target', role: 'loss', x: 966, y: 266, width: 128, height: 116, label: t('Quality filter', '质量过滤') }),
    moduleNode(palette, { id: 'rd-label', kind: 'annotation', role: 'annotation', x: 934, y: 436, width: 190, height: 92, label: t('Task · success · language', '任务 · 成功 · 语言') }),
    moduleNode(palette, { id: 'rd-reject', kind: 'note', role: 'loss', x: 942, y: 566, width: 174, height: 64, label: t('Rejected / negative', '剔除 / 负例'), detail: 'standard', fontSize: 11 }),
    moduleNode(palette, { id: 'rd-dataset', kind: 'scientific-dataset-stack', role: 'dataset', x: 1238, y: 136, width: 178, height: 130, label: t('Robot dataset', '机器人数据集') }),
    moduleNode(palette, { id: 'rd-mixture', kind: 'scientific-dataset-stack', role: 'dataset', x: 1238, y: 330, width: 178, height: 130, label: t('Cross-task mixture', '跨任务数据混合') }),
    moduleNode(palette, { id: 'rd-stats', kind: 'scientific-mini-plot', role: 'action', x: 1242, y: 520, width: 170, height: 126, label: t('Task distribution', '任务分布'), detail: 'standard' }),
  ];
  const edges = [
    moduleEdge(palette, 'rd-camera', 'rd-view-1'),
    moduleEdge(palette, 'rd-wrist-camera', 'rd-view-2'),
    moduleEdge(palette, 'rd-robot', 'rd-view-3'),
    moduleEdge(palette, 'rd-teleop', 'rd-robot'),
    moduleEdge(palette, 'rd-view-1', 'rd-episode'),
    moduleEdge(palette, 'rd-view-2', 'rd-episode'),
    moduleEdge(palette, 'rd-view-3', 'rd-episode'),
    moduleEdge(palette, 'rd-episode', 'rd-actions'),
    moduleEdge(palette, 'rd-episode', 'rd-sync'),
    moduleEdge(palette, 'rd-actions', 'rd-sync'),
    moduleEdge(palette, 'rd-sync', 'rd-filter'),
    moduleEdge(palette, 'rd-filter', 'rd-label'),
    moduleEdge(palette, 'rd-filter', 'rd-reject', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'rd-label', 'rd-dataset'),
    moduleEdge(palette, 'rd-dataset', 'rd-mixture'),
    moduleEdge(palette, 'rd-mixture', 'rd-stats'),
  ];
  return { nodes, edges, width: 1500, height: 720 };
}

function buildWorldModelRollout(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'wm-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1760, height: 860, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'wm-observe-phase', kind: 'group', role: 'phase', x: 28, y: 76, width: 300, height: 720, label: t('A  Current evidence', 'A  当前证据') }),
    moduleNode(palette, { id: 'wm-state-phase', kind: 'group', role: 'phase', x: 350, y: 76, width: 300, height: 720, label: t('B  Latent world state', 'B  潜在世界状态') }),
    moduleNode(palette, { id: 'wm-rollout-phase', kind: 'group', role: 'phase', x: 672, y: 76, width: 650, height: 720, label: t('C  Counterfactual futures', 'C  反事实未来') }),
    moduleNode(palette, { id: 'wm-act-phase', kind: 'group', role: 'phase', x: 1344, y: 76, width: 388, height: 720, label: t('D  Decision and control', 'D  决策与控制') }),
    moduleNode(palette, { id: 'wm-observation', kind: 'scientific-scene-frame', role: 'modality', x: 62, y: 124, width: 232, height: 174, label: t('Current RGB-D scene', '当前 RGB-D 场景'), description: t('robot · objects · geometry', '机器人 · 物体 · 几何') }),
    moduleNode(palette, { id: 'wm-goal', kind: 'scientific-prompt-card', role: 'modality', x: 62, y: 340, width: 232, height: 120, label: t('Goal condition', '目标条件'), description: t('"put the cup on the tray"', '“把杯子放到托盘上”') }),
    moduleNode(palette, { id: 'wm-state-token', kind: 'scientific-token-strip', role: 'token', x: 62, y: 504, width: 232, height: 88, label: t('Robot state history', '机器人状态历史'), description: t('q0:t · actions0:t-1', '状态0:t · 动作0:t-1') }),
    moduleNode(palette, { id: 'wm-observation-meta', kind: 'scientific-metric-panel', role: 'annotation', x: 80, y: 646, width: 196, height: 108, label: t('Observation window', '观察窗口'), description: t('4 frames · 10 Hz · RGB-D', '4 帧 · 10 Hz · RGB-D'), detail: 'standard' }),
    moduleNode(palette, { id: 'wm-voxel', kind: 'scientific-voxel-grid', role: 'encoder', x: 392, y: 124, width: 216, height: 160, label: t('3D spatial state', '3D 空间状态'), description: t('occupancy + object slots', '占据 + 物体槽位') }),
    moduleNode(palette, { id: 'wm-feature-map', kind: 'scientific-feature-map', role: 'encoder', x: 392, y: 330, width: 216, height: 132, label: t('Latent feature volume', '潜在特征体'), description: t('multi-scale scene tokens', '多尺度场景 Token') }),
    moduleNode(palette, { id: 'wm-model', kind: 'scientific-transformer', role: 'backbone', x: 410, y: 510, width: 180, height: 170, label: options.backbone || t('Predictive world model', '预测世界模型'), description: t('p(z[t+1] | z[t], a[t])', 'p(z[t+1] | z[t], a[t])'), fontSize: 16 }),
    moduleNode(palette, { id: 'wm-coordinate', kind: 'scientific-coordinate-frame', role: 'annotation', x: 512, y: 684, width: 88, height: 88, label: t('Robot frame', '机器人坐标系'), detail: 'detailed' }),
    moduleNode(palette, { id: 'wm-rollout-a', kind: 'scientific-scene-frame', role: 'environment', x: 706, y: 120, width: 210, height: 134, label: t('Future A · goal reached', '未来 A · 达成目标'), description: t('collision free', '无碰撞') }),
    moduleNode(palette, { id: 'wm-trajectory-a', kind: 'scientific-trajectory', role: 'action', x: 938, y: 132, width: 202, height: 112, label: t('Candidate trajectory A', '候选轨迹 A'), description: t('smooth and feasible', '平滑且可行') }),
    moduleNode(palette, { id: 'wm-score-a', kind: 'scientific-equation', role: 'environment', x: 1160, y: 132, width: 132, height: 112, label: 'P(success | τA)', description: t('symbolic score', '符号评分') }),
    moduleNode(palette, { id: 'wm-rollout-b', kind: 'scientific-scene-frame', role: 'loss', x: 706, y: 334, width: 210, height: 134, label: t('Future B · collision', '未来 B · 发生碰撞'), description: t('workspace violation', '违反工作空间约束'), detail: 'standard' }),
    moduleNode(palette, { id: 'wm-trajectory-b', kind: 'scientific-trajectory', role: 'loss', x: 938, y: 346, width: 202, height: 112, label: t('Candidate trajectory B', '候选轨迹 B'), detail: 'standard' }),
    moduleNode(palette, { id: 'wm-score-b', kind: 'scientific-equation', role: 'loss', x: 1160, y: 346, width: 132, height: 112, label: 'R(contact | τB)', description: t('constraint cost', '约束代价'), detail: 'standard' }),
    moduleNode(palette, { id: 'wm-rollout-c', kind: 'scientific-scene-frame', role: 'annotation', x: 706, y: 548, width: 210, height: 134, label: t('Future C · uncertain', '未来 C · 不确定'), description: t('occluded contact', '接触状态被遮挡'), detail: 'detailed' }),
    moduleNode(palette, { id: 'wm-trajectory-c', kind: 'scientific-trajectory', role: 'annotation', x: 938, y: 560, width: 202, height: 112, label: t('Candidate trajectory C', '候选轨迹 C'), detail: 'detailed' }),
    moduleNode(palette, { id: 'wm-score-c', kind: 'scientific-equation', role: 'annotation', x: 1160, y: 560, width: 132, height: 112, label: 'U(τC)', description: t('model uncertainty', '模型不确定性'), detail: 'detailed' }),
    moduleNode(palette, { id: 'wm-rollout-note', kind: 'note', role: 'annotation', x: 760, y: 704, width: 478, height: 56, label: t('Every branch shares the same initial state; color denotes outcome, not method.', '所有分支共享同一初始状态；颜色表示结果，不表示方法。'), detail: 'detailed', fontSize: 11, fontWeight: 500 }),
    moduleNode(palette, { id: 'wm-decision', kind: 'scientific-decision-gate', role: 'policy', x: 1376, y: 126, width: 188, height: 142, label: t('Risk-aware selector', '风险感知选择器'), description: t('value · feasibility · uncertainty', '价值 · 可行性 · 不确定性') }),
    moduleNode(palette, { id: 'wm-decision-metrics', kind: 'scientific-metric-panel', role: 'annotation', x: 1580, y: 132, width: 124, height: 128, label: t('Decision profile', '决策规格'), description: t('H=12 · N=3', 'H=12 · N=3'), detail: 'standard' }),
    moduleNode(palette, { id: 'wm-action', kind: 'scientific-action-chunk', role: 'policy', x: 1378, y: 326, width: 326, height: 100, label: t('Selected action chunk', '已选动作块'), description: t('receding-horizon execution', '滚动时域执行') }),
    moduleNode(palette, { id: 'wm-robot', kind: 'scientific-scene-frame', role: 'environment', x: 1402, y: 490, width: 278, height: 174, label: t('Execute in environment', '在环境中执行'), description: t('observe after each action', '每个动作后重新观察') }),
    moduleNode(palette, { id: 'wm-trajectory', kind: 'scientific-trajectory', role: 'action', x: 1378, y: 690, width: 172, height: 96, label: t('Measured path', '实测轨迹') }),
    moduleNode(palette, { id: 'wm-control-metrics', kind: 'scientific-equation', role: 'annotation', x: 1570, y: 690, width: 134, height: 96, label: t('Control check', '控制检查'), description: 'e_track(t)', detail: 'detailed' }),
  ];
  const edges = [
    moduleEdge(palette, 'wm-observation', 'wm-voxel'),
    moduleEdge(palette, 'wm-goal', 'wm-model'),
    moduleEdge(palette, 'wm-state-token', 'wm-model'),
    moduleEdge(palette, 'wm-voxel', 'wm-feature-map'),
    moduleEdge(palette, 'wm-feature-map', 'wm-model'),
    moduleEdge(palette, 'wm-coordinate', 'wm-feature-map', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'wm-model', 'wm-rollout-a'),
    moduleEdge(palette, 'wm-model', 'wm-rollout-b'),
    moduleEdge(palette, 'wm-model', 'wm-rollout-c', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'wm-rollout-a', 'wm-trajectory-a'),
    moduleEdge(palette, 'wm-trajectory-a', 'wm-score-a'),
    moduleEdge(palette, 'wm-rollout-b', 'wm-trajectory-b'),
    moduleEdge(palette, 'wm-trajectory-b', 'wm-score-b'),
    moduleEdge(palette, 'wm-rollout-c', 'wm-trajectory-c', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'wm-trajectory-c', 'wm-score-c', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'wm-score-a', 'wm-decision', { width: 2.4, label: t('selected', '已选择') }),
    moduleEdge(palette, 'wm-score-b', 'wm-decision', { lineStyle: 'dotted', arrowEnd: 'open' }),
    moduleEdge(palette, 'wm-score-c', 'wm-decision', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'wm-decision', 'wm-action', { width: 2.4 }),
    moduleEdge(palette, 'wm-action', 'wm-trajectory'),
    moduleEdge(palette, 'wm-action', 'wm-robot'),
    moduleEdge(palette, 'wm-robot', 'wm-trajectory'),
    moduleEdge(palette, 'wm-robot', 'wm-observation', { routing: 'bezier', feedback: true, label: t('next observation', '新观察') }),
  ];
  return { nodes, edges, width: 1760, height: 860 };
}

function buildSimToReal(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'sr-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1400, height: 720, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'sr-sim-phase', kind: 'group', role: 'phase', x: 28, y: 68, width: 410, height: 610, label: t('Simulation domain', '仿真域') }),
    moduleNode(palette, { id: 'sr-bridge-phase', kind: 'group', role: 'phase', x: 462, y: 68, width: 446, height: 610, label: t('Domain bridge', '域桥接') }),
    moduleNode(palette, { id: 'sr-real-phase', kind: 'group', role: 'phase', x: 932, y: 68, width: 440, height: 610, label: t('Real deployment', '真实部署') }),
    moduleNode(palette, { id: 'sr-sim-world', kind: 'scientific-voxel-grid', role: 'modality', x: 76, y: 124, width: 158, height: 150, label: t('Randomized world', '随机化世界') }),
    moduleNode(palette, { id: 'sr-sim-robot', kind: 'scientific-humanoid', role: 'environment', x: 270, y: 122, width: 126, height: 158, label: t('Sim robot', '仿真机器人') }),
    moduleNode(palette, { id: 'sr-rollouts', kind: 'scientific-dataset-stack', role: 'dataset', x: 88, y: 356, width: 170, height: 128, label: t('Simulation rollouts', '仿真 Rollout') }),
    moduleNode(palette, { id: 'sr-sim-trajectory', kind: 'scientific-trajectory', role: 'action', x: 84, y: 536, width: 276, height: 92, label: t('Expert trajectories', '专家轨迹') }),
    moduleNode(palette, { id: 'sr-randomize', kind: 'scientific-trainable', role: 'bridge', x: 500, y: 124, width: 150, height: 120, label: t('Domain randomization', '域随机化') }),
    moduleNode(palette, { id: 'sr-policy', kind: 'scientific-transformer', role: 'backbone', x: 704, y: 112, width: 170, height: 154, label: options.backbone || t('Shared policy', '共享策略') }),
    moduleNode(palette, { id: 'sr-calibrate', kind: 'scientific-coordinate-frame', role: 'annotation', x: 512, y: 330, width: 120, height: 120, label: t('Sensor calibration', '传感器标定') }),
    moduleNode(palette, { id: 'sr-adapter', kind: 'scientific-trainable', role: 'policy', x: 704, y: 328, width: 164, height: 126, label: t('Real-world adapter', '真实域适配器') }),
    moduleNode(palette, { id: 'sr-gap', kind: 'scientific-mini-plot', role: 'loss', x: 572, y: 520, width: 190, height: 132, label: t('Sim / real gap', '仿真 / 真实差距'), detail: 'standard' }),
    moduleNode(palette, { id: 'sr-real-camera', kind: 'scientific-camera', role: 'modality', x: 974, y: 126, width: 118, height: 106, label: t('Real sensors', '真实传感器') }),
    moduleNode(palette, { id: 'sr-real-robot', kind: 'scientific-humanoid', role: 'environment', x: 1170, y: 108, width: 144, height: 180, label: t('Real humanoid', '真实人形机器人') }),
    moduleNode(palette, { id: 'sr-real-action', kind: 'scientific-action-chunk', role: 'action', x: 982, y: 350, width: 210, height: 84, label: t('Deployed actions', '部署动作') }),
    moduleNode(palette, { id: 'sr-real-trajectory', kind: 'scientific-trajectory', role: 'action', x: 1080, y: 500, width: 230, height: 96, label: t('Measured motion', '实测运动') }),
    moduleNode(palette, { id: 'sr-real-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 950, y: 522, width: 126, height: 112, label: t('Real demos', '真机示范'), detail: 'standard' }),
  ];
  const edges = [
    moduleEdge(palette, 'sr-sim-world', 'sr-rollouts'),
    moduleEdge(palette, 'sr-sim-robot', 'sr-rollouts'),
    moduleEdge(palette, 'sr-sim-trajectory', 'sr-rollouts'),
    moduleEdge(palette, 'sr-rollouts', 'sr-randomize'),
    moduleEdge(palette, 'sr-randomize', 'sr-policy'),
    moduleEdge(palette, 'sr-policy', 'sr-adapter'),
    moduleEdge(palette, 'sr-calibrate', 'sr-adapter', { lineStyle: 'dashed' }),
    moduleEdge(palette, 'sr-adapter', 'sr-real-action'),
    moduleEdge(palette, 'sr-real-camera', 'sr-adapter'),
    moduleEdge(palette, 'sr-real-action', 'sr-real-robot'),
    moduleEdge(palette, 'sr-real-robot', 'sr-real-trajectory'),
    moduleEdge(palette, 'sr-real-data', 'sr-adapter', { routing: 'bezier', feedback: true }),
    moduleEdge(palette, 'sr-real-trajectory', 'sr-gap', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'sr-rollouts', 'sr-gap', { lineStyle: 'dashed', arrowEnd: 'open' }),
  ];
  return { nodes, edges, width: 1400, height: 720 };
}

function buildMultiEmbodimentPolicy(options: ScientificSchematicOptions, provenance: ScientificProvenance): Blueprint {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const nodes = [
    moduleNode(palette, { id: 'me-root', kind: 'group', role: 'frame', x: 0, y: 0, width: 1500, height: 740, label: options.title, scientificRole: 'schematic-root', provenance }),
    moduleNode(palette, { id: 'me-data-phase', kind: 'group', role: 'phase', x: 28, y: 70, width: 392, height: 620, label: t('Multi-embodiment data', '多机体数据') }),
    moduleNode(palette, { id: 'me-common-phase', kind: 'group', role: 'phase', x: 442, y: 70, width: 360, height: 620, label: t('Unified representation', '统一表示') }),
    moduleNode(palette, { id: 'me-expert-phase', kind: 'group', role: 'phase', x: 824, y: 70, width: 292, height: 620, label: t('Embodiment experts', '机体专家') }),
    moduleNode(palette, { id: 'me-robot-phase', kind: 'group', role: 'phase', x: 1138, y: 70, width: 334, height: 620, label: t('Robot platforms', '机器人平台') }),
    moduleNode(palette, { id: 'me-arm-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 62, y: 118, width: 158, height: 116, label: t('Arm episodes', '机械臂 Episode') }),
    moduleNode(palette, { id: 'me-mobile-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 62, y: 300, width: 158, height: 116, label: t('Mobile episodes', '移动机器人 Episode') }),
    moduleNode(palette, { id: 'me-human-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 62, y: 482, width: 158, height: 116, label: t('Humanoid episodes', '人形机器人 Episode') }),
    moduleNode(palette, { id: 'me-arm-norm', kind: 'scientific-action-chunk', role: 'bridge', x: 246, y: 136, width: 142, height: 82, label: t('7-DoF normalize', '7-DoF 归一化') }),
    moduleNode(palette, { id: 'me-mobile-norm', kind: 'scientific-action-chunk', role: 'bridge', x: 246, y: 318, width: 142, height: 82, label: t('Base normalize', '底盘归一化') }),
    moduleNode(palette, { id: 'me-human-norm', kind: 'scientific-action-chunk', role: 'bridge', x: 246, y: 500, width: 142, height: 82, label: t('Whole-body normalize', '全身归一化') }),
    moduleNode(palette, { id: 'me-token', kind: 'scientific-token-strip', role: 'token', x: 482, y: 124, width: 280, height: 90, label: t('[vision] [language] [state] [action]', '[视觉] [语言] [状态] [动作]') }),
    moduleNode(palette, { id: 'me-backbone', kind: 'scientific-transformer', role: 'backbone', x: 526, y: 294, width: 192, height: 178, label: options.backbone || t('Shared policy backbone', '共享策略主干') }),
    moduleNode(palette, { id: 'me-mixture', kind: 'scientific-mini-plot', role: 'dataset', x: 536, y: 526, width: 172, height: 128, label: t('Data mixture', '数据占比'), detail: 'standard' }),
    moduleNode(palette, { id: 'me-arm-head', kind: 'scientific-action-chunk', role: 'policy', x: 862, y: 126, width: 216, height: 86, label: t('Arm action expert', '机械臂动作专家') }),
    moduleNode(palette, { id: 'me-mobile-head', kind: 'scientific-action-chunk', role: 'policy', x: 862, y: 308, width: 216, height: 86, label: t('Mobile action expert', '移动动作专家') }),
    moduleNode(palette, { id: 'me-human-head', kind: 'scientific-action-chunk', role: 'policy', x: 862, y: 490, width: 216, height: 86, label: t('Whole-body expert', '全身动作专家') }),
    moduleNode(palette, { id: 'me-arm', kind: 'scientific-robot-arm', role: 'environment', x: 1182, y: 106, width: 142, height: 152, label: t('Robot arm', '机械臂') }),
    moduleNode(palette, { id: 'me-arm-path', kind: 'scientific-trajectory', role: 'action', x: 1320, y: 142, width: 126, height: 86, label: t('Pick path', '抓取轨迹') }),
    moduleNode(palette, { id: 'me-mobile', kind: 'scientific-mobile-robot', role: 'environment', x: 1178, y: 296, width: 150, height: 128, label: t('Mobile robot', '移动机器人') }),
    moduleNode(palette, { id: 'me-mobile-path', kind: 'scientific-trajectory', role: 'action', x: 1320, y: 318, width: 126, height: 86, label: t('Nav path', '导航轨迹') }),
    moduleNode(palette, { id: 'me-human', kind: 'scientific-humanoid', role: 'environment', x: 1186, y: 468, width: 136, height: 158, label: t('Humanoid', '人形机器人') }),
    moduleNode(palette, { id: 'me-human-path', kind: 'scientific-trajectory', role: 'action', x: 1320, y: 506, width: 126, height: 86, label: t('Motion', '全身运动') }),
  ];
  const edges = [
    moduleEdge(palette, 'me-arm-data', 'me-arm-norm'),
    moduleEdge(palette, 'me-mobile-data', 'me-mobile-norm'),
    moduleEdge(palette, 'me-human-data', 'me-human-norm'),
    moduleEdge(palette, 'me-arm-norm', 'me-token'),
    moduleEdge(palette, 'me-mobile-norm', 'me-token'),
    moduleEdge(palette, 'me-human-norm', 'me-token'),
    moduleEdge(palette, 'me-token', 'me-backbone', { width: 2.4 }),
    moduleEdge(palette, 'me-mixture', 'me-backbone', { lineStyle: 'dashed', arrowEnd: 'open' }),
    moduleEdge(palette, 'me-backbone', 'me-arm-head'),
    moduleEdge(palette, 'me-backbone', 'me-mobile-head'),
    moduleEdge(palette, 'me-backbone', 'me-human-head'),
    moduleEdge(palette, 'me-arm-head', 'me-arm'),
    moduleEdge(palette, 'me-mobile-head', 'me-mobile'),
    moduleEdge(palette, 'me-human-head', 'me-human'),
    moduleEdge(palette, 'me-arm', 'me-arm-path'),
    moduleEdge(palette, 'me-mobile', 'me-mobile-path'),
    moduleEdge(palette, 'me-human', 'me-human-path'),
  ];
  return { nodes, edges, width: 1500, height: 740 };
}

interface FlagshipStage {
  id: string;
  label: string;
}

function washWithWhite(color: string, whiteAmount = 0.72): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff];
  return `#${channels.map((channel) => Math.round(channel + (255 - channel) * whiteAmount)
    .toString(16).padStart(2, '0')).join('')}`;
}

function flagshipFrame(
  palette: SchematicPalette,
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  width: number,
  height: number,
  stages: FlagshipStage[],
  layout: 'single-column' | 'presentation',
): FlowNode[] {
  const rootFontSize = layout === 'presentation' ? 48 : PUBLICATION_TYPOGRAPHY.figureTitle;
  const stageFontSize = layout === 'presentation' ? 38 : PUBLICATION_TYPOGRAPHY.stageTitle;
  const nodes = [moduleNode(palette, {
    id: `${options.templateId}-responsive-root`,
    kind: 'group',
    role: 'frame',
    x: 0,
    y: 0,
    width,
    height,
    label: options.title,
    fontSize: rootFontSize,
    scientificRole: 'schematic-root',
    provenance,
    fill: '#FFFFFF',
    stroke: 'none',
    borderWidth: 0,
    radius: 0,
  })];
  const stageFills = [
    washWithWhite(palette.modality.fill),
    washWithWhite(palette.backbone.fill),
    washWithWhite(palette.policy.fill),
    washWithWhite(palette.environment.fill),
  ];
  if (layout === 'single-column') {
    const stageY = [70, 212, 354, 496];
    stages.forEach((stage, index) => nodes.push(moduleNode(palette, {
      id: stage.id,
      kind: 'group',
      role: 'phase',
      x: 14,
      y: stageY[index],
      width: 732,
      height: 130,
      label: stage.label,
      fontSize: stageFontSize,
      fill: stageFills[index],
      stroke: 'none',
      borderWidth: 0,
      radius: 4,
    })));
  } else {
    const stageX = [24, 426, 828, 1230];
    stages.forEach((stage, index) => nodes.push(moduleNode(palette, {
      id: stage.id,
      kind: 'group',
      role: 'phase',
      x: stageX[index],
      y: 92,
      width: 380,
      height: 748,
      label: stage.label,
      fontSize: stageFontSize,
      fill: stageFills[index],
      stroke: 'none',
      borderWidth: 0,
      radius: 4,
    })));
  }
  return nodes;
}

function responsiveEdge(
  palette: SchematicPalette,
  source: string,
  target: string,
  options: EdgeOptions = {},
  labelFontSize?: number,
): FlowEdge {
  const edge = moduleEdge(palette, source, target, options);
  edge.data = { ...edge.data!, labelFontSize };
  return edge;
}

function buildSingleColumnFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): Blueprint | undefined {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const width = 760;
  const height = 640;
  const fontSize = PUBLICATION_TYPOGRAPHY.moduleLabel;

  if (options.templateId === 'vla-policy') {
    const nodes = flagshipFrame(palette, options, provenance, width, height, [
      { id: 'vla-sc-a', label: t('A  Observe', 'A  观察') },
      { id: 'vla-sc-b', label: t('B  Reason', 'B  推理') },
      { id: 'vla-sc-c', label: t('C  Act', 'C  动作') },
      { id: 'vla-sc-d', label: t('D  Execute', 'D  执行') },
    ], 'single-column');
    nodes.push(
      moduleNode(palette, { id: 'vla-scene', kind: 'scientific-scene-frame', role: 'modality', x: 100, y: 128, width: 180, height: 64, label: t('2× RGB-D', '双路 RGB-D'), fontSize, variant: 'multiview' }),
      moduleNode(palette, { id: 'vla-language', kind: 'scientific-prompt-card', role: 'modality', x: 300, y: 128, width: 180, height: 64, label: t('Task', '任务'), fontSize }),
      moduleNode(palette, { id: 'vla-state', kind: 'scientific-token-strip', role: 'modality', x: 500, y: 128, width: 220, height: 64, label: 'q · q̇ · g', fontSize, variant: 'state-vector' }),
      moduleNode(palette, { id: 'vla-fusion', kind: 'scientific-token-strip', role: 'token', x: 110, y: 270, width: 150, height: 64, label: t('Fusion', '融合'), fontSize }),
      moduleNode(palette, { id: 'vla-backbone', kind: 'scientific-transformer', role: 'backbone', x: 280, y: 270, width: 205, height: 64, label: t('VLM', 'VLM'), fontSize, variant: 'vlm' }),
      moduleNode(palette, { id: 'vla-action-expert', kind: 'scientific-layer-stack', role: 'policy', x: 505, y: 270, width: 215, height: 64, label: t('Flow head', '流匹配头'), fontSize, variant: 'diffusion-action' }),
      moduleNode(palette, { id: 'vla-decision', kind: 'scientific-decision-gate', role: 'policy', x: 50, y: 412, width: 180, height: 64, label: t('Risk rank', '风险排序'), fontSize, variant: 'risk-ranking' }),
      moduleNode(palette, { id: 'vla-action-chunk', kind: 'scientific-action-chunk', role: 'action', x: 250, y: 412, width: 250, height: 64, label: t('H=16 actions', 'H=16 动作'), fontSize, variant: 'action-horizon' }),
      moduleNode(palette, { id: 'vla-controller', role: 'action', x: 520, y: 412, width: 200, height: 64, label: t('Controller', '控制器'), fontSize }),
      moduleNode(palette, { id: 'vla-robot', kind: 'scientific-scene-frame', role: 'environment', x: 110, y: 554, width: 240, height: 64, label: t('Execute', '执行'), fontSize, variant: 'execution' }),
      moduleNode(palette, { id: 'vla-feedback', kind: 'scientific-legend', role: 'annotation', x: 370, y: 554, width: 350, height: 64, label: t('Visual encoding', '视觉编码'), fontSize: PUBLICATION_TYPOGRAPHY.annotation }),
    );
    const removeNode = (id: string) => {
      const index = nodes.findIndex((candidate) => candidate.id === id);
      if (index >= 0) nodes.splice(index, 1);
    };
    removeNode('vla-scene');
    removeNode('vla-robot');
    removeNode('vla-feedback');
    const languageNode = nodes.find((candidate) => candidate.id === 'vla-language');
    const stateNode = nodes.find((candidate) => candidate.id === 'vla-state');
    if (languageNode) {
      languageNode.position.x = 444;
      languageNode.style = { ...languageNode.style, width: 126 };
    }
    if (stateNode) {
      stateNode.position.x = 584;
      stateNode.style = { ...stateNode.style, width: 142 };
    }
    nodes.push(
      moduleNode(palette, { id: 'vla-camera-front', kind: 'scientific-camera', role: 'modality', x: 30, y: 128, width: 82, height: 64, label: t('F', '前'), fontSize }),
      moduleNode(palette, { id: 'vla-camera-wrist', kind: 'scientific-camera', role: 'modality', x: 122, y: 128, width: 82, height: 64, label: t('W', '腕'), fontSize }),
      moduleNode(palette, { id: 'vla-object-before', kind: 'scientific-task-object', role: 'loss', x: 216, y: 128, width: 92, height: 64, label: t('Cube', '方块'), fontSize, variant: 'object-cube' }),
      moduleNode(palette, { id: 'vla-goal-before', kind: 'scientific-goal-region', role: 'environment', x: 320, y: 128, width: 112, height: 64, label: t('Goal', '目标'), fontSize, variant: 'goal-bin' }),
      moduleNode(palette, { id: 'vla-input-merge', kind: 'on-page-connector', role: 'token', x: 177, y: 194, width: 16, height: 16, label: '', fontSize }),
      moduleNode(palette, { id: 'vla-robot', kind: 'scientific-robot-arm', role: 'environment', x: 620, y: 554, width: 104, height: 64, label: t('Arm', '机械臂'), fontSize }),
      moduleNode(palette, { id: 'vla-trajectory', kind: 'scientific-trajectory', role: 'action', x: 466, y: 554, width: 142, height: 64, label: '6-DoF', fontSize }),
      moduleNode(palette, { id: 'vla-contact', kind: 'scientific-contact-point', role: 'loss', x: 366, y: 554, width: 88, height: 64, label: t('Grip', '抓取'), fontSize, variant: 'force-contact' }),
      moduleNode(palette, { id: 'vla-object-after', kind: 'scientific-task-object', role: 'loss', x: 266, y: 554, width: 88, height: 64, label: t('Lift', '抬升'), fontSize, variant: 'object-cube' }),
      moduleNode(palette, { id: 'vla-goal-after', kind: 'scientific-goal-region', role: 'environment', x: 140, y: 554, width: 114, height: 64, label: t('Place', '放置'), fontSize, variant: 'goal-bin' }),
      moduleNode(palette, { id: 'vla-reobserve', kind: 'scientific-camera', role: 'modality', x: 28, y: 554, width: 100, height: 64, label: t('Obs.', '观测'), fontSize }),
    );
    const edges = [
      responsiveEdge(palette, 'vla-camera-front', 'vla-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', arrowEnd: 'none' }),
      responsiveEdge(palette, 'vla-camera-wrist', 'vla-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', arrowEnd: 'none' }),
      responsiveEdge(palette, 'vla-language', 'vla-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', arrowEnd: 'none' }),
      responsiveEdge(palette, 'vla-state', 'vla-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', arrowEnd: 'none' }),
      responsiveEdge(palette, 'vla-input-merge', 'vla-fusion', { sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'vla-fusion', 'vla-backbone', { width: PUBLICATION_STROKES.primary, sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'vla-backbone', 'vla-action-expert', { width: PUBLICATION_STROKES.primary, sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'vla-action-expert', 'vla-decision', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'vla-decision', 'vla-action-chunk', { sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
      responsiveEdge(palette, 'vla-action-chunk', 'vla-controller', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'vla-controller', 'vla-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'vla-robot', 'vla-trajectory', { sourceHandle: 'left', targetHandle: 'right', semantic: 'temporal' }),
      responsiveEdge(palette, 'vla-trajectory', 'vla-contact', { sourceHandle: 'left', targetHandle: 'right', semantic: 'control' }),
      responsiveEdge(palette, 'vla-contact', 'vla-object-after', { sourceHandle: 'left', targetHandle: 'right', semantic: 'control' }),
      responsiveEdge(palette, 'vla-object-after', 'vla-goal-after', { sourceHandle: 'left', targetHandle: 'right', semantic: 'temporal' }),
      responsiveEdge(palette, 'vla-goal-after', 'vla-reobserve', { sourceHandle: 'left', targetHandle: 'right' }),
      responsiveEdge(palette, 'vla-reobserve', 'vla-camera-front', { feedback: true, routeSide: 'bottom-left', routeOffset: 18, sourceHandle: 'bottom', targetHandle: 'left' }),
    ];
    return { nodes, edges, width, height };
  }

  if (options.templateId === 'world-model-rollout') {
    const nodes = flagshipFrame(palette, options, provenance, width, height, [
      { id: 'wm-sc-a', label: t('A  Input', 'A  输入') },
      { id: 'wm-sc-b', label: t('B  Model', 'B  建模') },
      { id: 'wm-sc-c', label: t('C  Futures', 'C  未来') },
      { id: 'wm-sc-d', label: t('D  Act', 'D  决策') },
    ], 'single-column');
    nodes.push(
      moduleNode(palette, { id: 'wm-observation', kind: 'scientific-scene-frame', role: 'modality', x: 32, y: 128, width: 210, height: 64, label: t('Views at t', 't 时刻视图'), fontSize, variant: 'multiview' }),
      moduleNode(palette, { id: 'wm-goal', kind: 'scientific-prompt-card', role: 'modality', x: 259, y: 128, width: 210, height: 64, label: t('Goal', '任务目标'), fontSize }),
      moduleNode(palette, { id: 'wm-state-token', kind: 'scientific-token-strip', role: 'token', x: 486, y: 128, width: 240, height: 64, label: t('State history', '状态历史'), fontSize, variant: 'state-vector' }),
      moduleNode(palette, { id: 'wm-voxel', kind: 'scientific-voxel-grid', role: 'encoder', x: 96, y: 270, width: 230, height: 64, label: t('3D state', '3D 状态'), fontSize }),
      moduleNode(palette, { id: 'wm-model', kind: 'scientific-transformer', role: 'backbone', x: 380, y: 270, width: 310, height: 64, label: options.backbone || t('World model', '世界模型'), fontSize, variant: 'world-model' }),
      moduleNode(palette, { id: 'wm-rollout-a', kind: 'scientific-scene-frame', role: 'environment', x: 110, y: 412, width: 180, height: 64, label: t('A · success', 'A · 成功'), fontSize, variant: 'success' }),
      moduleNode(palette, { id: 'wm-rollout-b', kind: 'scientific-scene-frame', role: 'loss', x: 310, y: 412, width: 180, height: 64, label: t('B · contact', 'B · 碰撞'), fontSize, variant: 'collision' }),
      moduleNode(palette, { id: 'wm-rollout-c', kind: 'scientific-scene-frame', role: 'annotation', x: 510, y: 412, width: 210, height: 64, label: t('C · uncertain', 'C · 不确定'), fontSize, variant: 'uncertain' }),
      moduleNode(palette, { id: 'wm-decision', kind: 'scientific-decision-gate', role: 'policy', x: 110, y: 554, width: 220, height: 64, label: t('Rank S(τ)', '排序 S(τ)'), fontSize, variant: 'risk-ranking' }),
      moduleNode(palette, { id: 'wm-action', kind: 'scientific-action-chunk', role: 'action', x: 350, y: 554, width: 170, height: 64, label: t('Action H', '动作 H'), fontSize, variant: 'action-horizon' }),
      moduleNode(palette, { id: 'wm-robot', kind: 'scientific-scene-frame', role: 'environment', x: 540, y: 554, width: 180, height: 64, label: t('Reobserve', '再观察'), fontSize, variant: 'execution' }),
    );
    const rolloutLayout = [
      { id: 'wm-rollout-a', x: 28, width: 164, scoreLabel: t('A success', 'A 成功') },
      { id: 'wm-rollout-b', x: 208, width: 164, scoreLabel: t('B collision', 'B 碰撞') },
      { id: 'wm-rollout-c', x: 388, width: 164, scoreLabel: t('C occluded', 'C 遮挡') },
    ];
    rolloutLayout.forEach(({ id, x, width: rolloutWidth, scoreLabel }) => {
      const rollout = nodes.find((candidate) => candidate.id === id);
      if (!rollout) return;
      rollout.position.x = x;
      rollout.style = { ...rollout.style, width: rolloutWidth, height: 64 };
      rollout.data = { ...rollout.data, label: scoreLabel, description: undefined };
    });
    const replaceNode = (id: string, replacement: FlowNode) => {
      const index = nodes.findIndex((candidate) => candidate.id === id);
      if (index >= 0) nodes.splice(index, 1, replacement);
      else nodes.push(replacement);
    };
    replaceNode('wm-decision', moduleNode(palette, { id: 'wm-decision', kind: 'scientific-decision-gate', role: 'policy', x: 592, y: 554, width: 134, height: 64, label: t('Select A', '选择 A'), fontSize, variant: 'risk-ranking' }));
    replaceNode('wm-action', moduleNode(palette, { id: 'wm-action', kind: 'scientific-action-chunk', role: 'action', x: 456, y: 554, width: 120, height: 64, label: t('Act H', '动作 H'), fontSize, variant: 'action-horizon' }));
    replaceNode('wm-robot', moduleNode(palette, { id: 'wm-robot', kind: 'scientific-robot-arm', role: 'environment', x: 340, y: 554, width: 100, height: 64, label: t('Arm', '机械臂'), fontSize }));
    nodes.push(
      moduleNode(palette, { id: 'wm-rollout-split', kind: 'on-page-connector', role: 'backbone', x: 568, y: 394, width: 16, height: 16, label: '', fontSize }),
      moduleNode(palette, { id: 'wm-score-merge', kind: 'on-page-connector', role: 'policy', x: 642, y: 480, width: 30, height: 30, label: '', fontSize }),
      moduleNode(palette, { id: 'wm-reobserve', kind: 'scientific-camera', role: 'modality', x: 210, y: 554, width: 114, height: 64, label: 't₊₁', fontSize }),
      moduleNode(palette, { id: 'wm-error', kind: 'scientific-metric-panel', role: 'loss', x: 28, y: 554, width: 166, height: 64, label: t('Pred. error', '预测误差'), fontSize, variant: 'prediction-error' }),
    );
    const edges = [
      responsiveEdge(palette, 'wm-observation', 'wm-voxel', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'wm-goal', 'wm-model', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'wm-state-token', 'wm-model', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'wm-voxel', 'wm-model', { sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'wm-model', 'wm-rollout-split', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-a', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-b', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-c', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dashed', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-a', 'wm-score-merge', { routing: 'straight', width: PUBLICATION_STROKES.primary, sourceHandle: 'bottom', targetHandle: 'left', semantic: 'control' }),
      responsiveEdge(palette, 'wm-rollout-b', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dotted', arrowEnd: 'open', semantic: 'optional' }),
      responsiveEdge(palette, 'wm-rollout-c', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'left', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'optional' }),
      responsiveEdge(palette, 'wm-score-merge', 'wm-decision', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'wm-decision', 'wm-action', { sourceHandle: 'left', targetHandle: 'right', semantic: 'control' }),
      responsiveEdge(palette, 'wm-action', 'wm-robot', { sourceHandle: 'left', targetHandle: 'right', semantic: 'temporal' }),
      responsiveEdge(palette, 'wm-robot', 'wm-reobserve', { sourceHandle: 'left', targetHandle: 'right', semantic: 'temporal' }),
      responsiveEdge(palette, 'wm-reobserve', 'wm-error', { sourceHandle: 'left', targetHandle: 'right', semantic: 'data' }),
      responsiveEdge(palette, 'wm-error', 'wm-observation', { routing: 'bezier', feedback: true, routeSide: 'bottom-left', routeOffset: 18 }),
    ];
    return { nodes, edges, width, height };
  }

  if (options.templateId === 'llm-training-pipeline') {
    const nodes = flagshipFrame(palette, options, provenance, width, height, [
      { id: 'lt-sc-a', label: t('A  Data', 'A  数据') },
      { id: 'lt-sc-b', label: t('B  Pretrain', 'B  预训练') },
      { id: 'lt-sc-c', label: t('C  Align', 'C  对齐') },
      { id: 'lt-sc-d', label: t('D  Evaluate', 'D  评测') },
    ], 'single-column');
    const alignmentPhase = nodes.find((node) => node.id === 'lt-sc-c');
    const evaluationPhase = nodes.find((node) => node.id === 'lt-sc-d');
    if (alignmentPhase) alignmentPhase.style = { ...alignmentPhase.style, height: 160 };
    if (evaluationPhase) {
      evaluationPhase.position.y = 526;
      evaluationPhase.style = { ...evaluationPhase.style, height: 114 };
    }
    nodes.push(
      moduleNode(palette, { id: 'lt-raw-data', kind: 'scientific-data-funnel', role: 'dataset', x: 50, y: 128, width: 280, height: 64, label: t('Data sources', '数据来源'), fontSize }),
      moduleNode(palette, { id: 'lt-curation', role: 'bridge', x: 430, y: 128, width: 280, height: 64, label: t('Curate', '策展'), fontSize }),
      moduleNode(palette, { id: 'lt-pretrain-tokens', kind: 'scientific-token-strip', role: 'token', x: 90, y: 270, width: 260, height: 64, label: t('Token batches', 'Token 批次'), fontSize }),
      moduleNode(palette, { id: 'lt-base-model', kind: 'scientific-transformer', role: 'backbone', x: 400, y: 270, width: 300, height: 64, label: options.backbone || t('Base model θ₀', '基础模型 θ₀'), fontSize, variant: 'base-model' }),
      moduleNode(palette, { id: 'lt-sft-model', kind: 'scientific-trainable', role: 'policy', x: 250, y: 364, width: 260, height: 44, label: 'SFT π(ref)', fontSize }),
      moduleNode(palette, { id: 'lt-dpo-objective', kind: 'scientific-loss-target', role: 'loss', x: 70, y: 412, width: 290, height: 64, label: 'DPO', description: 'prefs · π(ref) · β', fontSize, variant: 'preference-objective' }),
      moduleNode(palette, { id: 'lt-rlhf-objective', kind: 'scientific-loss-target', role: 'policy', x: 400, y: 412, width: 290, height: 64, label: 'RM → PPO', description: 'r(φ) · KL(π ‖ π(ref))', fontSize, variant: 'preference-objective' }),
      moduleNode(palette, { id: 'lt-deploy-model', kind: 'scientific-transformer', role: 'backbone', x: 120, y: 554, width: 210, height: 64, label: t('Aligned θ*', '对齐 θ*'), fontSize, variant: 'checkpoint' }),
      moduleNode(palette, { id: 'lt-capability-plot', role: 'action', x: 350, y: 554, width: 205, height: 64, label: t('Eval · seeds · CI', '评测 · 种子 · CI'), fontSize }),
      moduleNode(palette, { id: 'lt-response', kind: 'scientific-token-strip', role: 'action', x: 575, y: 554, width: 145, height: 64, label: t('Monitor', '监测'), fontSize, variant: 'telemetry' }),
    );
    const replaceNodes = new Set([
      'lt-sft-model',
      'lt-dpo-objective',
      'lt-rlhf-objective',
      'lt-deploy-model',
      'lt-capability-plot',
      'lt-response',
    ]);
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      if (replaceNodes.has(nodes[index].id)) nodes.splice(index, 1);
    }
    nodes.push(
      moduleNode(palette, { id: 'lt-instruction-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 148, y: 360, width: 76, height: 66, label: 'x→y', fontSize, textPaddingX: 3 }),
      moduleNode(palette, { id: 'lt-sft-objective', kind: 'scientific-loss-target', role: 'loss', x: 236, y: 360, width: 76, height: 66, label: 'Lₛᶠₜ', fontSize, textPaddingX: 2 }),
      moduleNode(palette, { id: 'lt-sft-model', kind: 'scientific-trainable', role: 'policy', x: 324, y: 360, width: 96, height: 66, label: 'θ(ref)', fontSize, variant: 'aligned-model', textPaddingX: 3 }),
      moduleNode(palette, { id: 'lt-alignment-split', kind: 'on-page-connector', role: 'policy', x: 444, y: 379, width: 28, height: 28, label: '', fontSize }),
      moduleNode(palette, { id: 'lt-preference-data', kind: 'scientific-preference-pair', role: 'dataset', x: 18, y: 444, width: 130, height: 64, label: 'y⁺/y⁻', fontSize, textPaddingX: 3 }),
      moduleNode(palette, { id: 'lt-preference-split', kind: 'on-page-connector', role: 'dataset', x: 444, y: 462, width: 28, height: 28, label: '', fontSize }),
      moduleNode(palette, { id: 'lt-dpo-objective', kind: 'scientific-loss-target', role: 'loss', x: 486, y: 360, width: 70, height: 66, label: 'DPO', fontSize, variant: 'preference-objective', textPaddingX: 4 }),
      moduleNode(palette, { id: 'lt-dpo-checkpoint', role: 'backbone', x: 570, y: 360, width: 90, height: 70, label: 'DPO\nckpt', fontSize, textPaddingX: 4 }),
      moduleNode(palette, { id: 'lt-rlhf-objective', kind: 'scientific-loss-target', role: 'policy', x: 486, y: 444, width: 78, height: 64, label: 'RLHF', fontSize, variant: 'preference-objective', textPaddingX: 2 }),
      moduleNode(palette, { id: 'lt-rlhf-checkpoint', role: 'backbone', x: 578, y: 444, width: 82, height: 70, label: 'RL\nckpt', fontSize, textPaddingX: 4 }),
      moduleNode(palette, { id: 'lt-alignment-merge', kind: 'or-junction', role: 'backbone', x: 664, y: 400, width: 28, height: 28, label: '', fontSize }),
      moduleNode(palette, { id: 'lt-deploy-model', kind: 'scientific-transformer', role: 'backbone', x: 692, y: 370, width: 46, height: 128, label: 'θ*', fontSize, variant: 'aligned-model', textPaddingX: 3 }),
      moduleNode(palette, { id: 'lt-capability-plot', kind: 'scientific-metric-panel', role: 'action', x: 56, y: 587, width: 160, height: 48, label: t('Eval suite', '能力安全评测'), fontSize, variant: 'capability-safety', textPaddingX: 6 }),
      moduleNode(palette, { id: 'lt-failure-slice', kind: 'scientific-ablation-table', role: 'loss', x: 226, y: 587, width: 170, height: 48, label: t('Slice', '切片'), fontSize, textPaddingX: 6 }),
      moduleNode(palette, { id: 'lt-release-gate', kind: 'scientific-release-gate', role: 'policy', x: 406, y: 587, width: 125, height: 48, label: t('Gate', '发布门'), fontSize, variant: 'release-gate', textPaddingX: 6 }),
      moduleNode(palette, { id: 'lt-response', kind: 'scientific-token-strip', role: 'action', x: 541, y: 587, width: 190, height: 48, label: t('Drift test', '漂移检测'), fontSize, variant: 'telemetry', textPaddingX: 6 }),
    );
    const edges = [
      responsiveEdge(palette, 'lt-raw-data', 'lt-curation', { sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-curation', 'lt-pretrain-tokens', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-pretrain-tokens', 'lt-base-model', { sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-base-model', 'lt-sft-model', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-instruction-data', 'lt-sft-objective', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-sft-objective', 'lt-sft-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-sft-model', 'lt-alignment-split', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-alignment-split', 'lt-dpo-objective', { sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-alignment-split', 'lt-rlhf-objective', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-preference-data', 'lt-preference-split', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-preference-split', 'lt-dpo-objective', { routing: 'straight', sourceHandle: 'top', targetHandle: 'bottom' }),
      responsiveEdge(palette, 'lt-preference-split', 'lt-rlhf-objective', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-dpo-objective', 'lt-dpo-checkpoint', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-rlhf-objective', 'lt-rlhf-checkpoint', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-dpo-checkpoint', 'lt-alignment-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'top', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-rlhf-checkpoint', 'lt-alignment-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-alignment-merge', 'lt-deploy-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-deploy-model', 'lt-capability-plot', {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        semantic: 'temporal',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 84.625 },
          { origin: 'target', dx: 0, dy: -4.375 },
        ],
      }),
      responsiveEdge(palette, 'lt-capability-plot', 'lt-failure-slice', { sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-failure-slice', 'lt-release-gate', { sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
      responsiveEdge(palette, 'lt-release-gate', 'lt-response', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-response', 'lt-curation', {
        feedback: true,
        sourceHandle: 'bottom',
        targetHandle: 'right',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 3 },
          { origin: 'source', dx: -632, dy: 3 },
          { origin: 'source', dx: -632, dy: -425 },
          { origin: 'target', dx: 20, dy: 50 },
          { origin: 'target', dx: 20, dy: 0 },
        ],
      }),
    ];
    return { nodes, edges, width, height };
  }
  return undefined;
}

function buildPresentationFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  compactStageLabels = true,
): Blueprint | undefined {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const width = 1680;
  const height = 880;
  const fontSize = 40;
  const descriptionFontSize = 34;
  const stagesByTemplate: Partial<Record<ScientificSchematicTemplateId, FlagshipStage[]>> = {
    'vla-policy': [
      { id: 'vla-pr-a', label: t('A  Observe', 'A  观察') },
      { id: 'vla-pr-b', label: compactStageLabels ? t('B  Reason', 'B  推理') : t('B  Multimodal reasoning', 'B  多模态推理') },
      { id: 'vla-pr-c', label: compactStageLabels ? t('C  Act', 'C  动作') : t('C  Action policy', 'C  动作策略') },
      { id: 'vla-pr-d', label: compactStageLabels ? t('D  Control', 'D  控制') : t('D  Closed-loop control', 'D  闭环控制') },
    ],
    'world-model-rollout': [
      { id: 'wm-pr-a', label: compactStageLabels ? t('A  Observe', 'A  观察') : t('A  Current evidence', 'A  当前证据') },
      { id: 'wm-pr-b', label: compactStageLabels ? t('B  Predict', 'B  预测') : t('B  Predictive state', 'B  预测状态') },
      { id: 'wm-pr-c', label: compactStageLabels ? t('C  Imagine', 'C  展开') : t('C  Counterfactual futures', 'C  反事实未来') },
      { id: 'wm-pr-d', label: compactStageLabels ? t('D  Control', 'D  控制') : t('D  Decision and control', 'D  决策控制') },
    ],
    'llm-training-pipeline': [
      { id: 'lt-pr-a', label: compactStageLabels ? t('A  Curate', 'A  策展') : t('A  Curate data', 'A  数据策展') },
      { id: 'lt-pr-b', label: t('B  Pretrain', 'B  预训练') },
      { id: 'lt-pr-c', label: compactStageLabels ? t('C  Align', 'C  对齐') : t('C  Align behavior', 'C  行为对齐') },
      { id: 'lt-pr-d', label: compactStageLabels ? t('D  Evaluate', 'D  评测') : t('D  Evaluate and release', 'D  评测发布') },
    ],
  };
  const stages = stagesByTemplate[options.templateId];
  if (!stages) return undefined;
  const nodes = flagshipFrame(palette, options, provenance, width, height, stages, 'presentation');
  const node = (input: NodeOptions) => moduleNode(palette, { ...input, fontSize: input.fontSize ?? fontSize });
  let edges: FlowEdge[] = [];

  if (options.templateId === 'vla-policy') {
    nodes.push(
      node({ id: 'vla-scene', kind: 'scientific-scene-frame', role: 'modality', x: 60, y: 166, width: 324, height: 180, label: t('2-view RGB-D', '双路 RGB-D'), description: t('depth · mask', '深度 · 掩码'), variant: 'multiview' }),
      node({ id: 'vla-language', kind: 'scientific-prompt-card', role: 'modality', x: 60, y: 398, width: 324, height: 132, label: t('Instruction', '任务指令') }),
      node({ id: 'vla-state', kind: 'scientific-token-strip', role: 'modality', x: 60, y: 584, width: 324, height: 128, label: t('State vector', '状态向量'), description: 'q · q̇ · g', variant: 'state-vector' }),
      node({ id: 'vla-input-merge', kind: 'on-page-connector', role: 'token', x: 404, y: 393, width: 22, height: 22, label: '', fontSize: 22 }),
      node({ id: 'vla-fusion', kind: 'scientific-token-strip', role: 'token', x: 446, y: 168, width: 340, height: 132, label: t('Aligned tokens', '对齐 Token') }),
      node({ id: 'vla-backbone', kind: 'scientific-transformer', role: 'backbone', x: 462, y: 356, width: 308, height: 230, label: options.backbone || t('VLM backbone', 'VLM 主干'), description: t('vision · text · state fusion', '视觉 · 文本 · 状态融合'), variant: 'vlm' }),
      node({ id: 'vla-attention', kind: 'scientific-attention-map', role: 'annotation', x: 510, y: 650, width: 212, height: 146, label: t('Attention', '注意力'), fontSize: descriptionFontSize }),
      node({ id: 'vla-action-expert', kind: 'scientific-layer-stack', role: 'policy', x: 848, y: 174, width: 340, height: 184, label: t('Action expert', '动作专家'), description: t('flow matching · diffusion', '流匹配 · 扩散去噪'), variant: 'diffusion-action' }),
      node({ id: 'vla-decision', kind: 'scientific-decision-gate', role: 'policy', x: 848, y: 420, width: 340, height: 154, label: t('Risk ranking', '风险排序'), description: t('risk · limits', '碰撞 / 限位'), variant: 'risk-ranking' }),
      node({ id: 'vla-action-chunk', kind: 'scientific-action-chunk', role: 'action', x: 864, y: 636, width: 308, height: 148, label: t('H=16 actions', 'H=16 动作'), variant: 'action-horizon' }),
      node({ id: 'vla-controller', role: 'action', x: 1266, y: 176, width: 308, height: 132, label: t('Safety + controller', '安全约束 + 控制器') }),
      node({ id: 'vla-robot', kind: 'scientific-scene-frame', role: 'environment', x: 1266, y: 366, width: 308, height: 220, label: t('Execute + contact', '执行 + 接触'), description: t('20 Hz · horizon H=16', '20 Hz · 时域 H=16'), variant: 'execution' }),
      node({ id: 'vla-feedback', kind: 'scientific-legend', role: 'annotation', x: 1242, y: 610, width: 300, height: 190, label: t('Encoding legend', '编码图例'), description: t('solid=data · dashed=optional', '实线=数据 · 虚线=可选'), fontSize: descriptionFontSize }),
    );
    edges = [
      responsiveEdge(palette, 'vla-scene', 'vla-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-language', 'vla-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-state', 'vla-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-input-merge', 'vla-fusion', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-fusion', 'vla-backbone', { width: 4.6, sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-backbone', 'vla-attention', { sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dotted', arrowEnd: 'open', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-backbone', 'vla-action-expert', { width: 4.6, sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-action-expert', 'vla-decision', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-decision', 'vla-action-chunk', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-action-chunk', 'vla-controller', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-controller', 'vla-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-robot', 'vla-scene', {
        routing: 'bezier',
        feedback: true,
        routeOffset: 350,
        sourceHandle: 'right',
        targetHandle: 'left',
      }, descriptionFontSize),
    ];
  } else if (options.templateId === 'world-model-rollout') {
    nodes.push(
      node({ id: 'wm-observation', kind: 'scientific-scene-frame', role: 'modality', x: 60, y: 166, width: 308, height: 190, label: t('Views at t', 't 时刻视图'), description: t('front · wrist', '前视 · 腕部'), variant: 'multiview' }),
      node({ id: 'wm-goal', kind: 'scientific-prompt-card', role: 'modality', x: 60, y: 414, width: 308, height: 132, label: t('Goal condition', '目标条件') }),
      node({ id: 'wm-state-token', kind: 'scientific-token-strip', role: 'token', x: 60, y: 606, width: 308, height: 130, label: t('History', '历史状态'), description: t('q / a sequence', '状态 / 动作序列'), variant: 'state-vector' }),
      node({ id: 'wm-input-merge', kind: 'on-page-connector', role: 'bridge', x: 404, y: 518, width: 22, height: 22, label: '', fontSize: 22 }),
      node({ id: 'wm-voxel', kind: 'scientific-voxel-grid', role: 'encoder', x: 462, y: 166, width: 308, height: 190, label: t('3D latent state', '3D 潜在状态') }),
      node({ id: 'wm-model', kind: 'scientific-transformer', role: 'backbone', x: 462, y: 414, width: 308, height: 230, label: options.backbone || t('Latent world model', '潜在世界模型'), description: 'p(zₜ₊₁ | zₜ, aₜ)', variant: 'world-model' }),
      node({ id: 'wm-coordinate', kind: 'scientific-equation', role: 'annotation', x: 438, y: 664, width: 336, height: 142, label: t('Prediction loss', '预测损失'), description: 'd(ẑₜ₊₁, zₜ₊₁)', fontSize: descriptionFontSize }),
      node({ id: 'wm-rollout-a', kind: 'scientific-scene-frame', role: 'environment', x: 840, y: 164, width: 324, height: 164, label: t('A · success', 'A · 成功'), description: 'P(success | τA)', variant: 'success' }),
      node({ id: 'wm-rollout-b', kind: 'scientific-scene-frame', role: 'loss', x: 840, y: 380, width: 324, height: 164, label: t('B · contact', 'B · 碰撞'), description: 'R(contact | τB)', variant: 'collision' }),
      node({ id: 'wm-rollout-c', kind: 'scientific-scene-frame', role: 'annotation', x: 840, y: 596, width: 324, height: 164, label: t('C · uncertain', 'C · 不确定'), description: 'U(τC)', variant: 'uncertain' }),
      node({ id: 'wm-score-merge', kind: 'on-page-connector', role: 'policy', x: 1168, y: 436, width: 60, height: 60, label: 'S', fontSize: 28 }),
      node({ id: 'wm-decision', kind: 'scientific-decision-gate', role: 'policy', x: 1266, y: 176, width: 308, height: 166, label: t('Rank S(τ)', '排序 S(τ)'), description: t('schematic scoring contract', '示意评分契约'), variant: 'risk-ranking' }),
      node({ id: 'wm-action', kind: 'scientific-action-chunk', role: 'action', x: 1266, y: 410, width: 308, height: 142, label: t('Action H=12', '动作 H=12'), variant: 'action-horizon' }),
      node({ id: 'wm-robot', kind: 'scientific-scene-frame', role: 'environment', x: 1266, y: 620, width: 308, height: 170, label: t('Execute at t', 't 时刻执行'), description: t('reobserve t₊₁', '再观察 t₊₁'), variant: 'execution' }),
    );
    edges = [
      responsiveEdge(palette, 'wm-observation', 'wm-voxel', { sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-goal', 'wm-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-state-token', 'wm-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-input-merge', 'wm-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-voxel', 'wm-model', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-model', 'wm-rollout-a', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-model', 'wm-rollout-b', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-model', 'wm-rollout-c', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', lineStyle: 'dashed', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-a', 'wm-score-merge', { routing: 'straight', width: 4.6, sourceHandle: 'right', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-b', 'wm-score-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', lineStyle: 'dotted', arrowEnd: 'open', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-c', 'wm-score-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'bottom', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-score-merge', 'wm-decision', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-decision', 'wm-action', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-action', 'wm-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-robot', 'wm-observation', { routing: 'bezier', feedback: true, routeOffset: 34 }, descriptionFontSize),
    ];
  } else {
    nodes.push(
      node({ id: 'lt-raw-data', kind: 'scientific-data-funnel', role: 'dataset', x: 60, y: 166, width: 308, height: 166, label: t('Web · code · domain', '网页 · 代码 · 领域数据') }),
      node({ id: 'lt-curation', role: 'bridge', x: 60, y: 398, width: 308, height: 148, label: t('Filter + dedupe', '过滤 + 去重') }),
      node({ id: 'lt-mixture', kind: 'scientific-dataset-stack', role: 'dataset', x: 60, y: 612, width: 308, height: 142, label: t('Versioned mixture', '版本化数据混合') }),
      node({ id: 'lt-pretrain-tokens', kind: 'scientific-token-strip', role: 'token', x: 462, y: 166, width: 308, height: 132, label: t('Next-token batches', '下一 Token 批次') }),
      node({ id: 'lt-base-model', kind: 'scientific-transformer', role: 'backbone', x: 462, y: 354, width: 308, height: 238, label: options.backbone || t('Base model θ₀', '基础模型 θ₀'), description: t('autoregressive pretraining', '自回归预训练'), variant: 'base-model' }),
      node({ id: 'lt-next-token', kind: 'scientific-equation', role: 'loss', x: 476, y: 630, width: 280, height: 160, label: 'Lₙₗₗ', description: '−log pθ(xᵢ | x₁…ᵢ₋₁)', fontSize: descriptionFontSize }),
      node({ id: 'lt-sft-model', kind: 'scientific-transformer', role: 'policy', x: 864, y: 164, width: 308, height: 132, label: 'SFT π(ref)', description: 'L(sup)', variant: 'aligned-model' }),
      node({ id: 'lt-dpo-objective', kind: 'scientific-loss-target', role: 'loss', x: 840, y: 350, width: 174, height: 190, label: 'DPO', description: 'prefs\nπ(ref) · β', fontSize: descriptionFontSize, variant: 'preference-objective' }),
      node({ id: 'lt-rlhf-objective', kind: 'scientific-loss-target', role: 'policy', x: 1022, y: 350, width: 174, height: 190, label: 'RM → PPO', description: 'r(φ) · KL\nπ ‖ π(ref)', fontSize: descriptionFontSize, variant: 'preference-objective' }),
      node({ id: 'lt-aligned-model', kind: 'scientific-transformer', role: 'backbone', x: 864, y: 680, width: 308, height: 112, label: t('Aligned θ*', '对齐 θ*'), variant: 'aligned-model' }),
      node({ id: 'lt-deploy-model', kind: 'scientific-transformer', role: 'backbone', x: 1266, y: 168, width: 308, height: 178, label: t('Release θ*', '发布 θ*'), description: t('versioned', '版本化'), variant: 'checkpoint' }),
      node({ id: 'lt-capability-plot', kind: 'scientific-equation', role: 'action', x: 1266, y: 390, width: 308, height: 190, label: t('Evaluation contract', '评测协议'), description: t('tasks · baselines · seeds · CI', '任务 · 基线 · 随机种子 · 置信区间') }),
      node({ id: 'lt-response', kind: 'scientific-token-strip', role: 'action', x: 1266, y: 612, width: 308, height: 148, label: t('Monitor', '监测'), description: t('drift · safety', '漂移 · 安全'), variant: 'telemetry' }),
    );
    edges = [
      responsiveEdge(palette, 'lt-raw-data', 'lt-curation', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-curation', 'lt-mixture', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-mixture', 'lt-pretrain-tokens', { sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-pretrain-tokens', 'lt-base-model', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-next-token', 'lt-base-model', { sourceHandle: 'top', targetHandle: 'bottom', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-base-model', 'lt-sft-model', { width: 4.6, sourceHandle: 'right', targetHandle: 'left', label: t('base', '基础'), semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-sft-model', 'lt-dpo-objective', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-sft-model', 'lt-rlhf-objective', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-dpo-objective', 'lt-aligned-model', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-rlhf-objective', 'lt-aligned-model', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-aligned-model', 'lt-deploy-model', { width: 4.6, sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-deploy-model', 'lt-capability-plot', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-capability-plot', 'lt-response', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-capability-plot', 'lt-curation', {
        routing: 'bezier',
        feedback: true,
        routeOffset: 340,
        sourceHandle: 'right',
        targetHandle: 'left',
      }, descriptionFontSize),
    ];
  }
  return { nodes, edges, width, height };
}

function buildDoubleColumnFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): Blueprint | undefined {
  const blueprint = buildPresentationFlagship(options, provenance, false);
  if (!blueprint) return undefined;
  const stageWidths = [350, 350, 510, 350];
  const oldStageX = [24, 426, 828, 1230];
  const oldStageWidth = 380;
  const oldStageY = 92;
  const oldStageHeight = 748;
  const doubleHeight = 1040;
  const doubleStageHeight = 908;
  const stageX = stageWidths.reduce<number[]>((values, width, index) => {
    if (index === 0) return [24];
    return [...values, values[index - 1] + stageWidths[index - 1] + 24];
  }, []);
  const stageNodes = blueprint.nodes.filter((node) => node.data.schematicRole === 'phase');
  const stageIndexById = new Map(stageNodes.map((node, index) => [node.id, index]));
  const nodes = blueprint.nodes.map((node) => {
    const role = node.data.schematicRole;
    const fontSize = role === 'frame'
      ? PUBLICATION_TYPOGRAPHY.figureTitle
      : role === 'phase'
        ? PUBLICATION_TYPOGRAPHY.stageTitle
        : role === 'annotation'
          ? PUBLICATION_TYPOGRAPHY.annotation
          : PUBLICATION_TYPOGRAPHY.moduleLabel;
    if (role === 'frame') {
      return {
        ...node,
        style: { ...node.style, height: doubleHeight },
        data: { ...node.data, fontSize },
      };
    }
    if (node.id === 'vla-input-merge' || node.id === 'wm-input-merge') {
      const width = Number(node.style?.width ?? 1);
      const height = Number(node.style?.height ?? 1);
      const relativeCenterY = (node.position.y + height / 2 - oldStageY) / oldStageHeight;
      const nextY = oldStageY + relativeCenterY * doubleStageHeight - height / 2;
      return {
        ...node,
        position: { x: stageX[1] - width, y: nextY },
        data: { ...node.data, fontSize },
      };
    }
    const explicitStageIndex = stageIndexById.get(node.id);
    if (explicitStageIndex !== undefined) {
      return {
        ...node,
        position: { ...node.position, x: stageX[explicitStageIndex] },
        style: { ...node.style, width: stageWidths[explicitStageIndex], height: doubleStageHeight },
        data: { ...node.data, fontSize },
      };
    }
    const width = Number(node.style?.width ?? 1);
    const center = node.position.x + width / 2;
    const stageIndex = oldStageX.findIndex((x) => center >= x && center <= x + oldStageWidth);
    if (stageIndex < 0) return { ...node, data: { ...node.data, fontSize } };
    const relativeCenter = (center - oldStageX[stageIndex]) / oldStageWidth;
    const availableWidth = Math.max(1, stageWidths[stageIndex] - 28);
    const nextWidth = Math.min(width, availableWidth);
    const unconstrainedX = stageX[stageIndex] + relativeCenter * stageWidths[stageIndex] - nextWidth / 2;
    const nextX = Math.max(
      stageX[stageIndex] + 14,
      Math.min(stageX[stageIndex] + stageWidths[stageIndex] - 14 - nextWidth, unconstrainedX),
    );
    const height = Number(node.style?.height ?? 1);
    const relativeCenterY = (node.position.y + height / 2 - oldStageY) / oldStageHeight;
    const nextY = oldStageY + relativeCenterY * doubleStageHeight - height / 2;
    return {
      ...node,
      position: { x: nextX, y: nextY },
      style: { ...node.style, width: nextWidth },
      data: { ...node.data, fontSize },
    };
  });
  const edges = blueprint.edges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data!,
      labelFontSize: PUBLICATION_TYPOGRAPHY.edgeLabel,
      routeOffset: options.templateId === 'vla-policy'
        && edge.source === 'vla-robot'
        && edge.target === 'vla-scene'
        ? 442
        : options.templateId === 'llm-training-pipeline'
          && edge.source === 'lt-capability-plot'
          && edge.target === 'lt-curation'
          ? 412
        : edge.data?.routeOffset,
    },
  }));
  return { ...blueprint, nodes, edges, height: doubleHeight };
}

interface PositionedFlagshipStage extends FlagshipStage {
  x: number;
  width: number;
  colorRole: 'modality' | 'backbone' | 'policy' | 'environment';
}

function positionedFlagshipFrame(
  palette: SchematicPalette,
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
  width: number,
  height: number,
  stages: PositionedFlagshipStage[],
  stageHeight: number,
  stageFontSize = 38,
  stageTextPaddingX = 13,
  stageTextPaddingY = 8,
): FlowNode[] {
  const nodes = [moduleNode(palette, {
    id: `${options.templateId}-responsive-root`,
    kind: 'group',
    role: 'frame',
    x: 0,
    y: 0,
    width,
    height,
    label: options.title,
    fontSize: 48,
    scientificRole: 'schematic-root',
    provenance,
    fill: '#FFFFFF',
    stroke: 'none',
    borderWidth: 0,
    radius: 0,
  })];
  stages.forEach((stage) => nodes.push(moduleNode(palette, {
    id: stage.id,
    kind: 'group',
    role: 'phase',
    x: stage.x,
    y: 92,
    width: stage.width,
    height: stageHeight,
    label: stage.label,
    fontSize: stageFontSize,
    fill: washWithWhite(palette[stage.colorRole].fill),
    stroke: 'none',
    borderWidth: 0,
    radius: 4,
    textPaddingX: stageTextPaddingX,
    textPaddingY: stageTextPaddingY,
  })));
  return nodes;
}

function buildPublicationDoubleFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): Blueprint | undefined {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const width = 1680;
  const height = 1040;
  const fontSize = PUBLICATION_TYPOGRAPHY.moduleLabel;
  const annotationFontSize = PUBLICATION_TYPOGRAPHY.annotation;
  const stagesByTemplate: Partial<Record<ScientificSchematicTemplateId, PositionedFlagshipStage[]>> = {
    'vla-policy': [
      { id: 'vla-dc-a', label: t('A  Task evidence', 'A  任务证据'), x: 24, width: 350, colorRole: 'modality' },
      { id: 'vla-dc-b', label: t('B  Multimodal policy', 'B  多模态策略'), x: 398, width: 350, colorRole: 'backbone' },
      { id: 'vla-dc-c', label: t('C  Contact-aware action', 'C  接触感知动作'), x: 772, width: 510, colorRole: 'policy' },
      { id: 'vla-dc-d', label: t('D  Physical execution', 'D  物理执行'), x: 1306, width: 350, colorRole: 'environment' },
    ],
    'world-model-rollout': [
      { id: 'wm-dc-a', label: t('A  Current evidence', 'A  当前证据'), x: 24, width: 350, colorRole: 'modality' },
      { id: 'wm-dc-b', label: t('B  Predictive state', 'B  预测状态'), x: 398, width: 350, colorRole: 'backbone' },
      { id: 'wm-pr-c', label: t('C  Counterfactual futures', 'C  反事实未来'), x: 772, width: 510, colorRole: 'policy' },
      { id: 'wm-dc-d', label: t('D  Act and verify', 'D  执行验证'), x: 1306, width: 350, colorRole: 'environment' },
    ],
    'llm-training-pipeline': [
      { id: 'lt-dc-a', label: t('A  Versioned data', 'A  版本化数据'), x: 24, width: 350, colorRole: 'modality' },
      { id: 'lt-dc-b', label: t('B  Pretraining', 'B  预训练'), x: 398, width: 350, colorRole: 'backbone' },
      { id: 'lt-dc-c', label: t('C  Alternative alignment', 'C  替代对齐路径'), x: 772, width: 510, colorRole: 'policy' },
      { id: 'lt-dc-d', label: t('D  Evidence gate', 'D  证据门'), x: 1306, width: 350, colorRole: 'environment' },
    ],
  };
  const stages = stagesByTemplate[options.templateId];
  if (!stages) return buildDoubleColumnFlagship(options, provenance);
  const stageFontSize = options.templateId === 'vla-policy' ? 32 : 38;
  const nodes = positionedFlagshipFrame(palette, options, provenance, width, height, stages, 908, stageFontSize);
  const node = (input: NodeOptions) => moduleNode(palette, { ...input, fontSize: input.fontSize ?? fontSize });
  let edges: FlowEdge[];

  if (options.templateId === 'vla-policy') {
    nodes.push(
      node({ id: 'vla-camera-front', kind: 'scientific-camera', role: 'modality', x: 48, y: 170, width: 138, height: 150, label: t('Front RGB-D', '前视 RGB-D') }),
      node({ id: 'vla-camera-wrist', kind: 'scientific-camera', role: 'modality', x: 210, y: 170, width: 138, height: 150, label: t('Wrist RGB-D', '腕部 RGB-D') }),
      node({ id: 'vla-language', kind: 'scientific-prompt-card', role: 'modality', x: 48, y: 365, width: 300, height: 120, label: t('Place cube in target', '将方块放入目标区') }),
      node({ id: 'vla-object-before', kind: 'scientific-task-object', role: 'loss', x: 48, y: 535, width: 120, height: 155, label: t('Object at t', 't 时刻物体'), variant: 'object-cube' }),
      node({ id: 'vla-goal-before', kind: 'scientific-goal-region', role: 'environment', x: 198, y: 535, width: 150, height: 155, label: t('Goal region', '目标区域'), variant: 'goal-bin' }),
      node({ id: 'vla-state', kind: 'scientific-tensor', role: 'modality', x: 48, y: 745, width: 300, height: 125, label: t('Robot state', '机器人状态'), description: 'qₜ · q̇ₜ · gₜ' }),
      node({ id: 'vla-view-merge', kind: 'summing-junction', role: 'token', x: 374, y: 232, width: 28, height: 28, label: '', fontSize: 20 }),
      node({ id: 'vla-fusion', kind: 'scientific-token-strip', role: 'token', x: 430, y: 170, width: 286, height: 120, label: t('Vision · text · state tokens', '视觉 · 文本 · 状态 token') }),
      node({ id: 'vla-input-merge', kind: 'summing-junction', role: 'token', x: 559, y: 310, width: 28, height: 28, label: '', fontSize: 20 }),
      node({ id: 'vla-backbone', kind: 'scientific-transformer', role: 'backbone', x: 430, y: 350, width: 286, height: 245, label: options.backbone || t('VLM backbone', 'VLM 主干'), description: t('shared causal attention', '共享因果注意力'), variant: 'vlm' }),
      node({ id: 'vla-state-frame', kind: 'scientific-coordinate-frame', role: 'annotation', x: 445, y: 680, width: 120, height: 160, label: t('Base frame', '基座坐标'), fontSize: annotationFontSize }),
      node({ id: 'vla-attention', kind: 'scientific-attention-map', role: 'annotation', x: 580, y: 680, width: 120, height: 160, label: t('Object focus', '物体注意'), fontSize: annotationFontSize }),
      node({ id: 'vla-action-expert', kind: 'scientific-layer-stack', role: 'policy', x: 820, y: 170, width: 414, height: 190, label: t('Flow-matching action expert', '流匹配动作专家'), variant: 'diffusion-action' }),
      node({ id: 'vla-decision', kind: 'scientific-decision-gate', role: 'policy', x: 800, y: 430, width: 200, height: 150, label: t('Risk and reachability', '风险与可达性'), variant: 'risk-ranking' }),
      node({ id: 'vla-action-chunk', kind: 'scientific-action-chunk', role: 'action', x: 1030, y: 430, width: 210, height: 150, label: t('H=16 · 6-DoF + gripper', 'H=16 · 6-DoF + 夹爪'), variant: 'action-horizon' }),
      node({ id: 'vla-coordinate', kind: 'scientific-coordinate-frame', role: 'annotation', x: 800, y: 650, width: 145, height: 160, label: t('Tool frame', '工具坐标'), fontSize: annotationFontSize }),
      node({ id: 'vla-trajectory-plan', kind: 'scientific-trajectory', role: 'action', x: 975, y: 650, width: 265, height: 160, label: t('Planned waypoint path', '规划路点轨迹') }),
      node({ id: 'vla-contact-plan', kind: 'scientific-contact-point', role: 'loss', x: 930, y: 845, width: 180, height: 125, label: t('Planned contact', '规划接触'), variant: 'force-contact' }),
      node({ id: 'vla-controller', role: 'action', x: 1332, y: 170, width: 298, height: 120, label: t('Safety + controller', '安全约束 + 控制器') }),
      node({ id: 'vla-robot', kind: 'scientific-robot-arm', role: 'environment', x: 1332, y: 350, width: 135, height: 220, label: t('Robot arm', '机械臂') }),
      node({ id: 'vla-trajectory', kind: 'scientific-trajectory', role: 'action', x: 1490, y: 350, width: 140, height: 220, label: t('Executed path', '执行轨迹') }),
      node({ id: 'vla-contact', kind: 'scientific-contact-point', role: 'loss', x: 1332, y: 630, width: 92, height: 145, label: t('Grip', '接触'), variant: 'force-contact' }),
      node({ id: 'vla-object-after', kind: 'scientific-task-object', role: 'loss', x: 1440, y: 630, width: 92, height: 145, label: t('Lift', '抬升'), variant: 'object-cube' }),
      node({ id: 'vla-goal-after', kind: 'scientific-goal-region', role: 'environment', x: 1548, y: 630, width: 82, height: 145, label: t('Goal', '放置'), variant: 'goal-bin' }),
      node({ id: 'vla-reobserve', kind: 'scientific-camera', role: 'modality', x: 1332, y: 835, width: 298, height: 125, label: t('Next observation oₜ₊₁', '下一观测 oₜ₊₁') }),
    );
    edges = [
      responsiveEdge(palette, 'vla-camera-front', 'vla-view-merge', {
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        arrowEnd: 'none',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 20 },
          { origin: 'target', dx: 0, dy: 80 },
        ],
      }),
      responsiveEdge(palette, 'vla-camera-wrist', 'vla-view-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }),
      responsiveEdge(palette, 'vla-view-merge', 'vla-fusion', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'vla-language', 'vla-input-merge', {
        sourceHandle: 'right',
        targetHandle: 'left',
        arrowEnd: 'none',
        routeWaypoints: [
          { origin: 'source', dx: 42, dy: 0 },
          { origin: 'target', dx: -169, dy: 0 },
        ],
      }),
      responsiveEdge(palette, 'vla-state', 'vla-state-frame', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'vla-state-frame', 'vla-input-merge', {
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        arrowEnd: 'none',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 20 },
          { origin: 'source', dx: -91, dy: 20 },
          { origin: 'target', dx: -159, dy: 8 },
        ],
      }),
      responsiveEdge(palette, 'vla-fusion', 'vla-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', arrowEnd: 'none' }),
      responsiveEdge(palette, 'vla-input-merge', 'vla-backbone', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'vla-backbone', 'vla-action-expert', { width: PUBLICATION_STROKES.primary, sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'vla-action-expert', 'vla-decision', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'vla-decision', 'vla-action-chunk', { sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
      responsiveEdge(palette, 'vla-action-chunk', 'vla-controller', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'vla-controller', 'vla-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'vla-robot', 'vla-trajectory', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'vla-trajectory', 'vla-contact', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'vla-contact', 'vla-object-after', { sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
      responsiveEdge(palette, 'vla-object-after', 'vla-goal-after', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'vla-goal-after', 'vla-reobserve', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'vla-reobserve', 'vla-camera-front', { feedback: true, routeSide: 'bottom-left', routeOffset: 24, sourceHandle: 'bottom', targetHandle: 'left' }),
    ];
  } else if (options.templateId === 'world-model-rollout') {
    nodes.push(
      node({ id: 'wm-camera-front', kind: 'scientific-camera', role: 'modality', x: 48, y: 170, width: 138, height: 150, label: t('Front view', '前视相机') }),
      node({ id: 'wm-camera-wrist', kind: 'scientific-camera', role: 'modality', x: 210, y: 170, width: 138, height: 150, label: t('Wrist view', '腕部相机') }),
      node({ id: 'wm-goal', kind: 'scientific-prompt-card', role: 'modality', x: 48, y: 370, width: 300, height: 120, label: t('Goal condition', '目标条件') }),
      node({ id: 'wm-state-token', kind: 'scientific-timeline', role: 'token', x: 48, y: 550, width: 300, height: 150, label: t('Observed history', '观测历史'), description: 'oₜ₋ₖ · aₜ₋ₖ · … · oₜ' }),
      node({ id: 'wm-object', kind: 'scientific-task-object', role: 'loss', x: 48, y: 770, width: 120, height: 150, label: t('Object state', '物体状态'), variant: 'object-cube' }),
      node({ id: 'wm-goal-region', kind: 'scientific-goal-region', role: 'environment', x: 198, y: 770, width: 150, height: 150, label: t('Target state', '目标状态'), variant: 'goal-bin' }),
      node({ id: 'wm-view-merge', kind: 'summing-junction', role: 'bridge', x: 374, y: 232, width: 28, height: 28, label: '', fontSize: 20 }),
      node({ id: 'wm-input-merge', kind: 'summing-junction', role: 'bridge', x: 374, y: 470, width: 28, height: 28, label: '', fontSize: 20 }),
      node({ id: 'wm-voxel', kind: 'scientific-voxel-grid', role: 'encoder', x: 430, y: 170, width: 286, height: 190, label: t('3D latent state zₜ', '3D 潜在状态 zₜ') }),
      node({ id: 'wm-model', kind: 'scientific-transformer', role: 'backbone', x: 430, y: 420, width: 286, height: 250, label: options.backbone || t('Latent world model', '潜在世界模型'), description: 'p(zₜ₊₁ | zₜ, aₜ)', variant: 'world-model' }),
      node({ id: 'wm-coordinate', kind: 'scientific-equation', role: 'annotation', x: 430, y: 750, width: 286, height: 150, label: t('Prediction objective', '预测目标'), description: 'd(ẑₜ₊₁, zₜ₊₁)', fontSize: annotationFontSize }),
      node({ id: 'wm-horizon', kind: 'scientific-timeline', role: 'annotation', x: 800, y: 150, width: 450, height: 105, label: t('Shared horizon t₀ → tH', '共享时域 t₀ → tH'), fontSize: annotationFontSize }),
      node({ id: 'wm-rollout-split', kind: 'on-page-connector', role: 'backbone', x: 1004, y: 275, width: 42, height: 42, label: '', fontSize: 20 }),
      node({ id: 'wm-rollout-a', kind: 'scientific-scene-frame', role: 'environment', x: 795, y: 345, width: 145, height: 190, label: t('A · goal reached', 'A · 达成目标'), description: 'S(A) ↑', variant: 'success' }),
      node({ id: 'wm-rollout-b', kind: 'scientific-scene-frame', role: 'loss', x: 955, y: 345, width: 145, height: 190, label: t('B · collision', 'B · 发生碰撞'), description: 'C(B) ↑', variant: 'collision' }),
      node({ id: 'wm-rollout-c', kind: 'scientific-scene-frame', role: 'annotation', x: 1115, y: 345, width: 145, height: 190, label: t('C · occluded', 'C · 遮挡不确定'), description: 'U(C) ↑', variant: 'uncertain' }),
      node({ id: 'wm-score-a', kind: 'scientific-probability-bars', role: 'environment', x: 795, y: 580, width: 145, height: 130, label: t('Success score', '成功评分') }),
      node({ id: 'wm-score-b', kind: 'scientific-probability-bars', role: 'loss', x: 955, y: 580, width: 145, height: 130, label: t('Contact cost', '接触代价') }),
      node({ id: 'wm-score-c', kind: 'scientific-uncertainty-band', role: 'annotation', x: 1115, y: 580, width: 145, height: 130, label: t('Uncertainty', '不确定性'), fontSize: annotationFontSize }),
      node({ id: 'wm-score-merge', kind: 'summing-junction', role: 'policy', x: 1190, y: 760, width: 60, height: 60, label: '', fontSize: 24 }),
      node({ id: 'wm-decision', kind: 'scientific-decision-gate', role: 'policy', x: 1332, y: 170, width: 298, height: 160, label: t('Select A under constraints', '约束下选择 A'), variant: 'risk-ranking' }),
      node({ id: 'wm-action', kind: 'scientific-action-chunk', role: 'action', x: 1332, y: 390, width: 298, height: 130, label: t('Execute action horizon H', '执行动作时域 H'), variant: 'action-horizon' }),
      node({ id: 'wm-robot', kind: 'scientific-robot-arm', role: 'environment', x: 1332, y: 580, width: 130, height: 190, label: t('Physical robot', '实体机器人') }),
      node({ id: 'wm-reobserve', kind: 'scientific-camera', role: 'modality', x: 1480, y: 580, width: 150, height: 190, label: t('Observed t₊₁', '实测 t₊₁') }),
      node({ id: 'wm-error', kind: 'scientific-metric-panel', role: 'loss', x: 1332, y: 830, width: 298, height: 130, label: t('Prediction error', '预测误差'), variant: 'prediction-error' }),
    );
    edges = [
      responsiveEdge(palette, 'wm-camera-front', 'wm-view-merge', {
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        arrowEnd: 'none',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 20 },
          { origin: 'target', dx: 0, dy: 80 },
        ],
      }),
      responsiveEdge(palette, 'wm-camera-wrist', 'wm-view-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }),
      responsiveEdge(palette, 'wm-view-merge', 'wm-voxel', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'wm-goal', 'wm-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }),
      responsiveEdge(palette, 'wm-state-token', 'wm-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }),
      responsiveEdge(palette, 'wm-voxel', 'wm-input-merge', {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        arrowEnd: 'none',
        routeWaypoints: [
          { origin: 'source', dx: -159, dy: 20 },
          { origin: 'target', dx: 26, dy: 0 },
        ],
      }),
      responsiveEdge(palette, 'wm-input-merge', 'wm-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'wm-model', 'wm-horizon', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-horizon', 'wm-rollout-split', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-a', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-b', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-c', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dashed', semantic: 'broadcast' }),
      responsiveEdge(palette, 'wm-rollout-a', 'wm-score-a', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'wm-rollout-b', 'wm-score-b', { sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dotted', arrowEnd: 'open', semantic: 'optional' }),
      responsiveEdge(palette, 'wm-rollout-c', 'wm-score-c', { sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'optional' }),
      responsiveEdge(palette, 'wm-score-a', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', width: PUBLICATION_STROKES.primary, semantic: 'control' }),
      responsiveEdge(palette, 'wm-score-b', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'left', lineStyle: 'dotted', arrowEnd: 'open', semantic: 'optional' }),
      responsiveEdge(palette, 'wm-score-c', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'optional' }),
      responsiveEdge(palette, 'wm-score-merge', 'wm-decision', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }),
      responsiveEdge(palette, 'wm-decision', 'wm-action', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'wm-action', 'wm-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
      responsiveEdge(palette, 'wm-robot', 'wm-reobserve', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'wm-reobserve', 'wm-error', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'data' }),
      responsiveEdge(palette, 'wm-error', 'wm-camera-front', { feedback: true, routeSide: 'bottom-left', routeOffset: 24, sourceHandle: 'bottom', targetHandle: 'left' }),
    ];
  } else {
    nodes.push(
      node({ id: 'lt-raw-data', kind: 'scientific-data-funnel', role: 'dataset', x: 48, y: 170, width: 300, height: 170, label: t('Web · code · domain', '网页 · 代码 · 领域数据') }),
      node({ id: 'lt-curation', role: 'bridge', x: 48, y: 400, width: 300, height: 120, label: t('Filter · dedupe · license', '过滤 · 去重 · 许可') }),
      node({ id: 'lt-mixture', kind: 'scientific-dataset-stack', role: 'dataset', x: 48, y: 580, width: 300, height: 160, label: t('Versioned data mixture', '版本化数据混合') }),
      node({ id: 'lt-mixture-contract', kind: 'scientific-probability-bars', role: 'annotation', x: 48, y: 800, width: 300, height: 130, label: t('Source mix contract', '来源混合契约'), fontSize: annotationFontSize }),
      node({ id: 'lt-pretrain-tokens', kind: 'scientific-token-strip', role: 'token', x: 430, y: 170, width: 286, height: 120, label: t('Next-token batches', '下一 token 批次') }),
      node({ id: 'lt-base-model', kind: 'scientific-transformer', role: 'backbone', x: 430, y: 350, width: 286, height: 250, label: options.backbone || t('Base model θ₀', '基础模型 θ₀'), description: t('autoregressive pretraining', '自回归预训练'), variant: 'base-model' }),
      node({ id: 'lt-next-token', kind: 'scientific-equation', role: 'loss', x: 430, y: 680, width: 286, height: 150, label: 'Lₙₗₗ', description: '−log pθ(xᵢ | x₁…ᵢ₋₁)', fontSize: annotationFontSize }),
      node({ id: 'lt-instruction-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 780, y: 170, width: 160, height: 100, label: t('Inst. data', '指令数据'), description: 'x → y' }),
      node({ id: 'lt-sft-objective', kind: 'scientific-loss-target', role: 'loss', x: 960, y: 170, width: 150, height: 100, label: t('SFT objective', 'SFT 目标'), description: 'Lₛᶠₜ' }),
      node({ id: 'lt-sft-model', kind: 'scientific-trainable', role: 'policy', x: 1120, y: 170, width: 120, height: 130, label: t('SFT ref.', 'SFT 参考'), description: 'θ(ref)' }),
      node({ id: 'lt-alignment-split', kind: 'on-page-connector', role: 'policy', x: 1165, y: 315, width: 30, height: 30, label: '', fontSize: 20 }),
      node({ id: 'lt-preference-data', kind: 'scientific-preference-pair', role: 'dataset', x: 780, y: 355, width: 180, height: 100, label: t('Preference pairs', '偏好样本对'), description: 'y⁺ ≻ y⁻' }),
      node({ id: 'lt-preference-split', kind: 'on-page-connector', role: 'dataset', x: 860, y: 465, width: 30, height: 25, label: '', fontSize: 20 }),
      node({ id: 'lt-dpo-objective', kind: 'scientific-loss-target', role: 'loss', x: 780, y: 510, width: 190, height: 120, label: 'DPO', description: 'θ(ref) · β', variant: 'preference-objective' }),
      node({ id: 'lt-dpo-checkpoint', kind: 'scientific-transformer', role: 'backbone', x: 1000, y: 510, width: 210, height: 120, label: 'DPO checkpoint', description: 'θ(DPO)', variant: 'checkpoint' }),
      node({ id: 'lt-rlhf-input-merge', kind: 'summing-junction', role: 'policy', x: 740, y: 650, width: 30, height: 30, label: '', fontSize: 20 }),
      node({ id: 'lt-rlhf-objective', kind: 'scientific-loss-target', role: 'policy', x: 780, y: 700, width: 190, height: 120, label: 'RM + PPO', description: 'r(φ) · KL', variant: 'preference-objective' }),
      node({ id: 'lt-rlhf-checkpoint', kind: 'scientific-transformer', role: 'backbone', x: 1000, y: 700, width: 210, height: 120, label: 'RL checkpoint', description: 'θ(RL)', variant: 'checkpoint' }),
      node({ id: 'lt-alignment-merge', kind: 'or-junction', role: 'backbone', x: 1240, y: 540, width: 60, height: 60, label: '', fontSize: 24 }),
      node({ id: 'lt-deploy-model', kind: 'scientific-transformer', role: 'backbone', x: 1332, y: 480, width: 298, height: 150, label: t('Aligned model', '对齐模型'), description: 'θ*', variant: 'aligned-model' }),
      node({ id: 'lt-capability-plot', kind: 'scientific-metric-panel', role: 'action', x: 1332, y: 670, width: 140, height: 120, label: t('Cap.', '能力'), description: t('tasks · CI', '任务 · 置信区间'), variant: 'capability-safety' }),
      node({ id: 'lt-failure-slice', kind: 'scientific-ablation-table', role: 'loss', x: 1490, y: 670, width: 140, height: 120, label: t('Worst cases', '最差案例') }),
      node({ id: 'lt-release-gate', kind: 'scientific-release-gate', role: 'policy', x: 1332, y: 830, width: 140, height: 120, label: t('Release gate', '发布门'), variant: 'release-gate' }),
      node({ id: 'lt-response', kind: 'scientific-token-strip', role: 'action', x: 1490, y: 830, width: 140, height: 120, label: t('Drift monitor', '漂移监测'), variant: 'telemetry' }),
    );
    edges = [
      responsiveEdge(palette, 'lt-raw-data', 'lt-curation', { sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'lt-curation', 'lt-mixture', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-mixture', 'lt-pretrain-tokens', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-pretrain-tokens', 'lt-base-model', { sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'lt-next-token', 'lt-base-model', { sourceHandle: 'top', targetHandle: 'bottom', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-base-model', 'lt-sft-model', {
        sourceHandle: 'right',
        targetHandle: 'left',
        width: PUBLICATION_STROKES.primary,
        label: t('base', '基础'),
        semantic: 'temporal',
        routeWaypoints: [
          { origin: 'source', dx: 4, dy: 0 },
          { origin: 'source', dx: 4, dy: -315 },
          { origin: 'target', dx: -4, dy: -75 },
          { origin: 'target', dx: -4, dy: 0 },
        ],
      }, annotationFontSize),
      responsiveEdge(palette, 'lt-instruction-data', 'lt-sft-objective', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-sft-objective', 'lt-sft-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }),
      responsiveEdge(palette, 'lt-sft-model', 'lt-alignment-split', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-alignment-split', 'lt-dpo-objective', {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        semantic: 'gradient',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 155 },
          { origin: 'target', dx: 0, dy: -10 },
        ],
      }),
      responsiveEdge(palette, 'lt-alignment-split', 'lt-rlhf-input-merge', {
        sourceHandle: 'left',
        targetHandle: 'top',
        semantic: 'gradient',
        routeWaypoints: [
          { origin: 'source', dx: -430, dy: 0 },
          { origin: 'target', dx: -20, dy: -15 },
          { origin: 'target', dx: 0, dy: -15 },
        ],
      }),
      responsiveEdge(palette, 'lt-preference-data', 'lt-preference-split', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'lt-preference-split', 'lt-dpo-objective', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'lt-preference-split', 'lt-rlhf-input-merge', {
        sourceHandle: 'left',
        targetHandle: 'right',
        routeWaypoints: [
          { origin: 'source', dx: -90, dy: 0 },
        ],
      }),
      responsiveEdge(palette, 'lt-rlhf-input-merge', 'lt-rlhf-objective', { sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'lt-dpo-objective', 'lt-dpo-checkpoint', { sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-rlhf-objective', 'lt-rlhf-checkpoint', { sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-dpo-checkpoint', 'lt-alignment-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }),
      responsiveEdge(palette, 'lt-rlhf-checkpoint', 'lt-alignment-merge', {
        sourceHandle: 'right',
        targetHandle: 'bottom',
        semantic: 'optional',
        routeWaypoints: [
          { origin: 'source', dx: 110, dy: 0 },
          { origin: 'source', dx: 110, dy: -150 },
          { origin: 'target', dx: 0, dy: 10 },
        ],
      }),
      responsiveEdge(palette, 'lt-alignment-merge', 'lt-deploy-model', { sourceHandle: 'right', targetHandle: 'left', width: PUBLICATION_STROKES.primary, semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-deploy-model', 'lt-capability-plot', { sourceHandle: 'bottom', targetHandle: 'top' }),
      responsiveEdge(palette, 'lt-capability-plot', 'lt-failure-slice', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }),
      responsiveEdge(palette, 'lt-failure-slice', 'lt-release-gate', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }),
      responsiveEdge(palette, 'lt-release-gate', 'lt-response', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }),
      responsiveEdge(palette, 'lt-response', 'lt-curation', { feedback: true, routeSide: 'bottom-left', routeOffset: 24, sourceHandle: 'bottom', targetHandle: 'left' }),
    ];
  }
  return { nodes, edges, width, height };
}

function buildTalkFlagship(
  options: ScientificSchematicOptions,
  provenance: ScientificProvenance,
): Blueprint | undefined {
  const palette = PALETTES[options.style];
  const t = (en: string, zh: string) => text(options.language, en, zh);
  const width = 1680;
  const height = 880;
  const fontSize = 40;
  const descriptionFontSize = 34;
  const stagesByTemplate: Partial<Record<ScientificSchematicTemplateId, PositionedFlagshipStage[]>> = {
    'vla-policy': [
      { id: 'vla-pr-a', label: t('A  Task state', 'A  任务状态'), x: 24, width: 420, colorRole: 'modality' },
      { id: 'vla-pr-b', label: t('B  Multimodal action policy', 'B  多模态动作策略'), x: 468, width: 570, colorRole: 'backbone' },
      { id: 'vla-pr-c', label: t('C  Grounded closed loop', 'C  接地闭环'), x: 1062, width: 594, colorRole: 'environment' },
    ],
    'world-model-rollout': [
      { id: 'wm-pr-a', label: t('A  Current evidence', 'A  当前证据'), x: 24, width: 400, colorRole: 'modality' },
      { id: 'wm-pr-b', label: t('B  Predictive state', 'B  预测状态'), x: 448, width: 280, colorRole: 'backbone' },
      { id: 'wm-pr-c', label: t('C  Future rollouts', 'C  未来展开'), x: 752, width: 508, colorRole: 'policy' },
      { id: 'wm-pr-d', label: t('D  Act and verify', 'D  执行与验证'), x: 1272, width: 384, colorRole: 'environment' },
    ],
    'llm-training-pipeline': [
      { id: 'lt-pr-a', label: t('A  Reference policy', 'A  参考策略'), x: 24, width: 460, colorRole: 'modality' },
      { id: 'lt-pr-b', label: t('B  Alignment alternatives', 'B  对齐分支'), x: 508, width: 720, colorRole: 'policy' },
      { id: 'lt-pr-c', label: t('C  Evidence gate', 'C  证据门'), x: 1252, width: 404, colorRole: 'environment' },
    ],
  };
  const stages = stagesByTemplate[options.templateId];
  if (!stages) return buildPresentationFlagship(options, provenance);
  const nodes = positionedFlagshipFrame(palette, options, provenance, width, height, stages, 748, 38, 27, 26);
  const node = (input: NodeOptions) => moduleNode(palette, { ...input, fontSize: input.fontSize ?? fontSize });
  let edges: FlowEdge[];

  if (options.templateId === 'vla-policy') {
    nodes.push(
      node({ id: 'vla-camera-front', kind: 'scientific-scene-frame', role: 'modality', x: 50, y: 150, width: 150, height: 190, label: t('Front scene', '前视场景'), description: t('cube · target', '方块 · 目标'), variant: 'multiview' }),
      node({ id: 'vla-camera-wrist', kind: 'scientific-scene-frame', role: 'modality', x: 225, y: 150, width: 160, height: 190, label: t('Wrist scene', '腕部场景'), description: t('gripper · cube', '夹爪 · 方块'), variant: 'execution' }),
      node({ id: 'vla-language', kind: 'scientific-prompt-card', role: 'modality', x: 50, y: 370, width: 335, height: 110, label: t('Place the cube in the target', '将方块放入目标区') }),
      node({ id: 'vla-object-before', kind: 'scientific-task-object', role: 'loss', x: 50, y: 530, width: 130, height: 130, label: t('Cube', '方块'), variant: 'object-cube' }),
      node({ id: 'vla-goal-before', kind: 'scientific-goal-region', role: 'environment', x: 220, y: 530, width: 165, height: 130, label: t('Target region', '目标区域'), variant: 'goal-bin' }),
      node({ id: 'vla-state', kind: 'scientific-token-strip', role: 'modality', x: 50, y: 700, width: 335, height: 120, label: t('Robot state', '机器人状态'), description: 'qₜ · q̇ₜ · gₜ', variant: 'state-vector' }),
      node({ id: 'vla-input-merge', kind: 'summing-junction', role: 'token', x: 438, y: 238, width: 30, height: 30, label: '', fontSize: 22 }),
      node({ id: 'vla-fusion', kind: 'scientific-token-strip', role: 'token', x: 500, y: 180, width: 500, height: 120, label: t('Vision · instruction · robot-state tokens', '视觉 · 指令 · 机器人状态 token') }),
      node({ id: 'vla-backbone', kind: 'scientific-transformer', role: 'backbone', x: 500, y: 360, width: 240, height: 250, label: options.backbone || t('VLM backbone', 'VLM 主干'), variant: 'vlm' }),
      node({ id: 'vla-action-expert', kind: 'scientific-layer-stack', role: 'policy', x: 760, y: 360, width: 240, height: 250, label: t('Flow action expert', '流动作专家'), variant: 'diffusion-action' }),
      node({ id: 'vla-decision', kind: 'scientific-decision-gate', role: 'policy', x: 500, y: 630, width: 180, height: 180, label: t('Risk', '风险'), description: t('collision · reach', '碰撞 · 可达性'), variant: 'risk-ranking' }),
      node({ id: 'vla-action-chunk', kind: 'scientific-action-chunk', role: 'action', x: 700, y: 630, width: 300, height: 180, label: t('H=16 · 6-DoF + gripper', 'H=16 · 6-DoF + 夹爪'), variant: 'action-horizon' }),
      node({ id: 'vla-control-bridge', kind: 'on-page-connector', role: 'action', x: 1038, y: 735, width: 30, height: 30, label: '', fontSize: 22 }),
      node({ id: 'vla-controller', role: 'action', x: 1090, y: 170, width: 530, height: 120, label: t('Closed-loop controller', '闭环控制器') }),
      node({ id: 'vla-robot', kind: 'scientific-robot-arm', role: 'environment', x: 1090, y: 360, width: 150, height: 230, label: t('Robot arm', '机械臂') }),
      node({ id: 'vla-trajectory', kind: 'scientific-trajectory', role: 'action', x: 1260, y: 360, width: 360, height: 180, label: t('Executed 6-DoF path', '执行 6-DoF 轨迹') }),
      node({ id: 'vla-contact', kind: 'scientific-contact-point', role: 'loss', x: 1260, y: 600, width: 110, height: 120, label: t('Grip', '接触'), variant: 'force-contact' }),
      node({ id: 'vla-object-after', kind: 'scientific-task-object', role: 'loss', x: 1390, y: 600, width: 110, height: 120, label: t('Lift', '抬升'), variant: 'object-cube' }),
      node({ id: 'vla-goal-after', kind: 'scientific-goal-region', role: 'environment', x: 1520, y: 600, width: 100, height: 120, label: t('Goal', '放置'), variant: 'goal-bin' }),
      node({ id: 'vla-reobserve', kind: 'scientific-camera', role: 'modality', x: 1490, y: 740, width: 140, height: 110, label: t('Next obs.', '下一观测') }),
    );
    edges = [
      responsiveEdge(palette, 'vla-camera-front', 'vla-input-merge', {
        sourceHandle: 'left',
        targetHandle: 'bottom',
        arrowEnd: 'none',
        routeWaypoints: [
          { origin: 'source', dx: -22, dy: 0 },
          { origin: 'source', dx: -22, dy: 255 },
          { origin: 'target', dx: 0, dy: 232 },
        ],
      }, descriptionFontSize),
      responsiveEdge(palette, 'vla-camera-wrist', 'vla-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-language', 'vla-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'bottom', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-state', 'vla-input-merge', { sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-input-merge', 'vla-fusion', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-fusion', 'vla-backbone', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-backbone', 'vla-action-expert', { width: 4.6, sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-action-expert', 'vla-decision', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-decision', 'vla-action-chunk', { sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-action-chunk', 'vla-control-bridge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-control-bridge', 'vla-controller', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-controller', 'vla-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-robot', 'vla-trajectory', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-trajectory', 'vla-contact', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-contact', 'vla-object-after', { sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-object-after', 'vla-goal-after', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-goal-after', 'vla-reobserve', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'vla-reobserve', 'vla-camera-front', {
        feedback: true,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 18 },
          { origin: 'source', dx: -1536, dy: 18 },
          { origin: 'target', dx: -101, dy: -2 },
          { origin: 'target', dx: 0, dy: -2 },
        ],
      }, descriptionFontSize),
    ];
  } else if (options.templateId === 'world-model-rollout') {
    nodes.push(
      node({ id: 'wm-observation', kind: 'scientific-scene-frame', role: 'modality', x: 50, y: 180, width: 340, height: 180, label: t('Observed scene at t', 't 时刻实测场景'), description: t('front + wrist views', '前视 + 腕部视角'), variant: 'multiview' }),
      node({ id: 'wm-goal', kind: 'scientific-prompt-card', role: 'modality', x: 50, y: 430, width: 340, height: 120, label: t('Goal condition', '目标条件') }),
      node({ id: 'wm-state-token', kind: 'scientific-timeline', role: 'token', x: 50, y: 610, width: 340, height: 190, label: t('State-action history', '状态动作历史'), description: 'oₜ₋ₖ · aₜ₋ₖ · … · oₜ' }),
      node({ id: 'wm-input-merge', kind: 'summing-junction', role: 'bridge', x: 410, y: 378, width: 30, height: 30, label: '', fontSize: 22 }),
      node({ id: 'wm-voxel', kind: 'scientific-voxel-grid', role: 'encoder', x: 463, y: 170, width: 250, height: 150, label: t('3D latent state zₜ', '3D 潜在状态 zₜ') }),
      node({ id: 'wm-model', kind: 'scientific-transformer', role: 'backbone', x: 463, y: 390, width: 250, height: 220, label: options.backbone || t('Latent world model', '潜在世界模型'), description: 'p(zₜ₊₁ | zₜ, aₜ)', variant: 'world-model' }),
      node({ id: 'wm-coordinate', kind: 'scientific-equation', role: 'annotation', x: 463, y: 660, width: 250, height: 150, label: t('Prediction loss', '预测损失'), description: 'd(ẑₜ₊₁, zₜ₊₁)', fontSize: descriptionFontSize }),
      node({ id: 'wm-horizon', kind: 'scientific-timeline', role: 'annotation', x: 770, y: 170, width: 450, height: 110, label: t('Shared horizon t₀ → tH', '共享时域 t₀ → tH'), fontSize: descriptionFontSize }),
      node({ id: 'wm-rollout-split', kind: 'on-page-connector', role: 'backbone', x: 970, y: 400, width: 42, height: 42, label: '', fontSize: 22 }),
      node({ id: 'wm-rollout-a', kind: 'scientific-scene-frame', role: 'environment', x: 756, y: 470, width: 162, height: 180, label: t('A · success', 'A · 成功'), description: t('goal reached', '目标达成'), variant: 'success', fontSize: 39, textPaddingX: 3 }),
      node({ id: 'wm-rollout-b', kind: 'scientific-scene-frame', role: 'loss', x: 925, y: 470, width: 162, height: 180, label: t('B · collision', 'B · 碰撞'), description: t('contact cost', '接触代价'), variant: 'collision', fontSize: 39, textPaddingX: 3 }),
      node({ id: 'wm-rollout-c', kind: 'scientific-scene-frame', role: 'annotation', x: 1094, y: 470, width: 164, height: 180, label: t('C · occluded', 'C · 遮挡'), description: t('uncertain', '不确定'), variant: 'uncertain', fontSize: 39, textPaddingX: 3 }),
      node({ id: 'wm-score-merge', kind: 'summing-junction', role: 'policy', x: 1190, y: 700, width: 70, height: 70, label: '', fontSize: 28 }),
      node({ id: 'wm-decision', kind: 'scientific-decision-gate', role: 'policy', x: 1300, y: 170, width: 330, height: 150, label: t('Select rollout A', '选择未来 A'), description: t('score + constraints', '评分 + 约束'), variant: 'risk-ranking' }),
      node({ id: 'wm-action', kind: 'scientific-action-chunk', role: 'action', x: 1300, y: 390, width: 330, height: 120, label: t('Execute horizon H', '执行时域 H'), variant: 'action-horizon' }),
      node({ id: 'wm-robot', kind: 'scientific-robot-arm', role: 'environment', x: 1300, y: 570, width: 140, height: 180, label: t('Robot', '机器人') }),
      node({ id: 'wm-reobserve', kind: 'scientific-camera', role: 'modality', x: 1490, y: 570, width: 140, height: 180, label: t('Obs. t₊₁', '实测 t₊₁') }),
      node({ id: 'wm-error', kind: 'scientific-metric-panel', role: 'loss', x: 1300, y: 770, width: 330, height: 90, label: t('Prediction error', '预测误差'), variant: 'prediction-error' }),
    );
    edges = [
      responsiveEdge(palette, 'wm-observation', 'wm-voxel', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-voxel', 'wm-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-goal', 'wm-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-state-token', 'wm-input-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'bottom', arrowEnd: 'none' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-input-merge', 'wm-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-model', 'wm-horizon', { sourceHandle: 'right', targetHandle: 'left', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-horizon', 'wm-rollout-split', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-a', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-b', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-split', 'wm-rollout-c', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dashed', semantic: 'broadcast' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-a', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', width: 4.6, semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-b', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'left', lineStyle: 'dotted', arrowEnd: 'open', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-rollout-c', 'wm-score-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', lineStyle: 'dashed', arrowEnd: 'open', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-score-merge', 'wm-decision', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-decision', 'wm-action', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-action', 'wm-robot', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-robot', 'wm-reobserve', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-reobserve', 'wm-error', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'wm-error', 'wm-observation', { feedback: true, routeSide: 'bottom-left', routeOffset: 12, sourceHandle: 'bottom', targetHandle: 'left' }, descriptionFontSize),
    ];
  } else {
    nodes.push(
      node({ id: 'lt-raw-data', kind: 'scientific-data-funnel', role: 'dataset', x: 50, y: 180, width: 170, height: 160, label: t('Source data', '源数据') }),
      node({ id: 'lt-curation', role: 'bridge', x: 270, y: 180, width: 190, height: 160, label: t('Filter + dedupe', '过滤 + 去重') }),
      node({ id: 'lt-pretrain-tokens', kind: 'scientific-token-strip', role: 'token', x: 50, y: 400, width: 170, height: 120, label: t('Token batches', 'Token 批次') }),
      node({ id: 'lt-base-model', kind: 'scientific-transformer', role: 'backbone', x: 250, y: 390, width: 200, height: 230, label: options.backbone || t('Base model', '基础模型'), description: 'θ₀', variant: 'base-model' }),
      node({ id: 'lt-instruction-data', kind: 'scientific-dataset-stack', role: 'dataset', x: 50, y: 650, width: 140, height: 130, label: t('Inst. data', '指令数据') }),
      node({ id: 'lt-sft-objective', kind: 'scientific-loss-target', role: 'loss', x: 210, y: 650, width: 108, height: 130, label: 'Lₛᶠₜ', fontSize: 39, textPaddingX: 4 }),
      node({ id: 'lt-sft-model', kind: 'scientific-trainable', role: 'policy', x: 338, y: 640, width: 126, height: 150, label: 'θ(ref)', fontSize: 39, textPaddingX: 4 }),
      node({ id: 'lt-alignment-split', kind: 'on-page-connector', role: 'policy', x: 480, y: 560, width: 30, height: 30, label: '', fontSize: 22 }),
      node({ id: 'lt-preference-data', kind: 'scientific-preference-pair', role: 'dataset', x: 540, y: 170, width: 260, height: 140, label: t('Preference pairs', '偏好样本') }),
      node({ id: 'lt-preference-split', kind: 'on-page-connector', role: 'dataset', x: 500, y: 340, width: 30, height: 30, label: '', fontSize: 22 }),
      node({ id: 'lt-dpo-objective', kind: 'scientific-loss-target', role: 'loss', x: 540, y: 400, width: 220, height: 150, label: 'DPO', description: 'prefs + β', variant: 'preference-objective' }),
      node({ id: 'lt-dpo-checkpoint', kind: 'scientific-transformer', role: 'backbone', x: 790, y: 400, width: 220, height: 150, label: 'DPO checkpoint', description: 'θ(DPO)', variant: 'checkpoint' }),
      node({ id: 'lt-rlhf-input-merge', kind: 'summing-junction', role: 'policy', x: 500, y: 630, width: 30, height: 30, label: '', fontSize: 22 }),
      node({ id: 'lt-rlhf-objective', kind: 'scientific-loss-target', role: 'policy', x: 540, y: 620, width: 220, height: 150, label: 'RM + PPO', description: 'r(φ) · KL', variant: 'preference-objective' }),
      node({ id: 'lt-rlhf-checkpoint', kind: 'scientific-transformer', role: 'backbone', x: 790, y: 620, width: 220, height: 150, label: 'RL checkpoint', description: 'θ(RL)', variant: 'checkpoint' }),
      node({ id: 'lt-alignment-merge', kind: 'or-junction', role: 'backbone', x: 1060, y: 500, width: 80, height: 80, label: '', fontSize: 26 }),
      node({ id: 'lt-deploy-model', kind: 'scientific-transformer', role: 'backbone', x: 1030, y: 690, width: 170, height: 150, label: t('Aligned model', '对齐模型'), description: 'θ*', variant: 'aligned-model' }),
      node({ id: 'lt-capability-plot', kind: 'scientific-metric-panel', role: 'action', x: 1280, y: 170, width: 350, height: 190, label: t('Capability + safety evidence', '能力 + 安全证据'), description: t('tasks · baselines · seeds · CI', '任务 · 基线 · 种子 · CI'), variant: 'capability-safety' }),
      node({ id: 'lt-failure-slice', kind: 'scientific-ablation-table', role: 'loss', x: 1280, y: 400, width: 350, height: 160, label: t('Worst-slice inspection', '最差切片检查') }),
      node({ id: 'lt-release-gate', kind: 'scientific-release-gate', role: 'policy', x: 1280, y: 620, width: 160, height: 170, label: t('Release gate', '发布门'), variant: 'release-gate' }),
      node({ id: 'lt-response', kind: 'scientific-token-strip', role: 'action', x: 1470, y: 620, width: 160, height: 170, label: t('Drift monitor', '漂移监测'), variant: 'telemetry' }),
    );
    edges = [
      responsiveEdge(palette, 'lt-raw-data', 'lt-curation', { sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-curation', 'lt-pretrain-tokens', {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        semantic: 'temporal',
        routeWaypoints: [
          { origin: 'source', dx: 0, dy: 30 },
          { origin: 'source', dx: 135, dy: 30 },
          { origin: 'source', dx: 135, dy: 40 },
          { origin: 'target', dx: 0, dy: -20 },
        ],
      }, descriptionFontSize),
      responsiveEdge(palette, 'lt-pretrain-tokens', 'lt-base-model', { sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-base-model', 'lt-sft-model', { sourceHandle: 'bottom', targetHandle: 'top', width: 4.6, semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-instruction-data', 'lt-sft-objective', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-sft-objective', 'lt-sft-model', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-sft-model', 'lt-alignment-split', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-alignment-split', 'lt-dpo-objective', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-alignment-split', 'lt-rlhf-input-merge', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top', semantic: 'gradient' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-preference-data', 'lt-preference-split', { routing: 'straight', sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-preference-split', 'lt-dpo-objective', { routing: 'straight', sourceHandle: 'right', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-preference-split', 'lt-rlhf-input-merge', {
        sourceHandle: 'bottom',
        targetHandle: 'top',
        routeWaypoints: [
          { origin: 'source', dx: -5, dy: 10 },
          { origin: 'source', dx: -5, dy: 250 },
          { origin: 'target', dx: 0, dy: -10 },
        ],
      }, descriptionFontSize),
      responsiveEdge(palette, 'lt-rlhf-input-merge', 'lt-rlhf-objective', { sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-dpo-objective', 'lt-dpo-checkpoint', { sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-rlhf-objective', 'lt-rlhf-checkpoint', { sourceHandle: 'right', targetHandle: 'left', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-dpo-checkpoint', 'lt-alignment-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'top', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-rlhf-checkpoint', 'lt-alignment-merge', { routing: 'straight', sourceHandle: 'right', targetHandle: 'bottom', semantic: 'optional' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-alignment-merge', 'lt-deploy-model', { sourceHandle: 'bottom', targetHandle: 'top', width: 4.6, semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-deploy-model', 'lt-capability-plot', { routing: 'straight', sourceHandle: 'right', targetHandle: 'left' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-capability-plot', 'lt-failure-slice', { sourceHandle: 'bottom', targetHandle: 'top' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-failure-slice', 'lt-release-gate', { sourceHandle: 'bottom', targetHandle: 'top', semantic: 'control' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-release-gate', 'lt-response', { sourceHandle: 'right', targetHandle: 'left', semantic: 'temporal' }, descriptionFontSize),
      responsiveEdge(palette, 'lt-response', 'lt-raw-data', { feedback: true, routeSide: 'bottom-left', routeOffset: 60, sourceHandle: 'bottom', targetHandle: 'left' }, descriptionFontSize),
    ];
  }
  return { nodes, edges, width, height };
}

function schematicLayoutForFigure(spec?: ScientificFigureSpec): ScientificSchematicLayout {
  if (!spec) return 'freeform';
  if (spec.widthMm <= 100) return 'single-column';
  if (spec.widthMm / spec.heightMm >= 1.65 && spec.heightMm <= 115) return 'presentation';
  return 'double-column';
}

function preservePhaseHeadingClearance(nodes: FlowNode[]): FlowNode[] {
  const phases = nodes.filter((node) => node.data.schematicRole === 'phase' && node.data.label.trim());
  if (!phases.length) return nodes;

  return nodes.map((node) => {
    if (['frame', 'phase'].includes(node.data.schematicRole ?? '')) return node;
    const width = Number(node.style?.width ?? 1);
    const height = Number(node.style?.height ?? 1);
    const center = { x: node.position.x + width / 2, y: node.position.y + height / 2 };
    const phase = phases.find((candidate) => {
      const phaseWidth = Number(candidate.style?.width ?? 1);
      const phaseHeight = Number(candidate.style?.height ?? 1);
      return center.x >= candidate.position.x
        && center.x <= candidate.position.x + phaseWidth
        && center.y >= candidate.position.y
        && center.y <= candidate.position.y + phaseHeight;
    });
    if (!phase) return node;

    const phaseWidth = Number(phase.style?.width ?? 1);
    const phaseHeight = Number(phase.style?.height ?? 1);
    const layout = layoutSchematicNodeContent(phase.data, phaseWidth, phaseHeight);
    const availableWidth = scientificNodeTextMaxWidth(phase.data, phaseWidth);
    const measuredWidth = Math.max(...phase.data.label.split(/\r?\n/).map((line) => (
      estimateSvgTextWidth(line.trim().split(/\s+/).filter(Boolean).join(' '), phase.data.fontSize)
    )));
    const heading = {
      x: phase.position.x + scientificNodeTextPaddingX(phase.data) - 6,
      y: phase.position.y + scientificNodeTextPaddingY(phase.data) - 6,
      width: Math.min(availableWidth, measuredWidth) + 12,
      height: layout.labelLines.length * phase.data.fontSize * 1.2 + 14,
    };
    const overlapsHorizontally = node.position.x < heading.x + heading.width
      && node.position.x + width > heading.x;
    const overlapsVertically = node.position.y < heading.y + heading.height
      && node.position.y + height > heading.y;
    if (!overlapsHorizontally || !overlapsVertically) return node;

    const desiredY = heading.y + heading.height + 4;
    const maximumY = phase.position.y + phaseHeight - height - 4;
    if (desiredY > maximumY) return node;
    return { ...node, position: { ...node.position, y: desiredY } };
  });
}

function fitBlueprintToFigure(blueprint: Blueprint, spec: ScientificFigureSpec, layout: ScientificSchematicLayout): Blueprint {
  const marginMm = Math.max(4, spec.marginMm);
  const availableWidth = Math.max(1, mmToPx(spec.widthMm - marginMm * 2));
  const availableHeight = Math.max(1, mmToPx(spec.heightMm - marginMm * 2));
  const scale = Math.min(1, availableWidth / blueprint.width, availableHeight / blueprint.height);
  const moduleMinimum = pointsToScientificUnits(layout === 'presentation' ? 11 : 7.5);
  const formulaMinimum = pointsToScientificUnits(layout === 'presentation' ? 11 : 8);
  const annotationMinimum = pointsToScientificUnits(layout === 'presentation' ? 9 : 7.5);
  const titleMinimum = pointsToScientificUnits(layout === 'presentation' ? 13 : 7.5);
  const readableTextMinimum = pointsToScientificUnits(layout === 'presentation' ? 9 : 7.5);
  const strokeMinimum = pointsToScientificUnits(layout === 'presentation' ? 1 : 0.8);
  const scaledNodes = blueprint.nodes.map((node) => {
    const role = node.data.schematicRole;
    const labelMinimum = role === 'frame'
      ? titleMinimum
      : role === 'annotation'
        ? annotationMinimum
        : role === 'loss'
          ? formulaMinimum
          : moduleMinimum;
    const scaledFontSize = Math.max(labelMinimum, node.data.fontSize * scale);
    const requestedDescriptionFontSize = Number(node.data.scientificDescriptionFontSize);
    const scaledDescriptionFontSize = Number.isFinite(requestedDescriptionFontSize) && requestedDescriptionFontSize > 0
      ? requestedDescriptionFontSize * scale
      : node.data.fontSize * scale * 0.86;
    const paddingX = scientificNodeTextPaddingX(node.data);
    const paddingY = scientificNodeTextPaddingY(node.data);
    return {
      ...node,
      position: { x: node.position.x * scale, y: node.position.y * scale },
      style: {
        ...node.style,
        width: Number(node.style?.width ?? 1) * scale,
        height: Number(node.style?.height ?? 1) * scale,
      },
      data: {
        ...node.data,
        fontSize: scaledFontSize,
        scientificDescriptionFontSize: node.data.description?.trim()
          ? Math.max(readableTextMinimum, scaledFontSize * 0.86, scaledDescriptionFontSize)
          : undefined,
        borderWidth: Math.max(strokeMinimum, node.data.borderWidth * scale),
        scientificTextPaddingX: Math.max(2.5, paddingX * scale),
        scientificTextPaddingY: Math.max(2, paddingY * scale),
      },
    };
  });
  const nodes = preservePhaseHeadingClearance(scaledNodes);
  const edges = blueprint.edges.map((edge) => {
    const width = Math.max(strokeMinimum, (edge.data?.width ?? PUBLICATION_STROKES.secondary) * scale);
    const labelFontSize = Math.max(annotationMinimum, Number(edge.data?.labelFontSize ?? PUBLICATION_TYPOGRAPHY.edgeLabel) * scale);
    return {
      ...edge,
      data: {
        ...edge.data!,
        width,
        labelFontSize,
        routeOffset: edge.data?.routeOffset === undefined ? undefined : Math.max(12, edge.data.routeOffset * scale),
        routeWaypoints: edge.data?.routeWaypoints?.map((waypoint) => ({
          ...waypoint,
          dx: waypoint.dx * scale,
          dy: waypoint.dy * scale,
        })),
        sourceAnchorOffset: edge.data?.sourceAnchorOffset
          ? {
              dx: edge.data.sourceAnchorOffset.dx * scale,
              dy: edge.data.sourceAnchorOffset.dy * scale,
            }
          : undefined,
        targetAnchorOffset: edge.data?.targetAnchorOffset
          ? {
              dx: edge.data.targetAnchorOffset.dx * scale,
              dy: edge.data.targetAnchorOffset.dy * scale,
            }
          : undefined,
        labelOffsetX: edge.data?.labelOffsetX === undefined ? undefined : edge.data.labelOffsetX * scale,
        labelOffsetY: edge.data?.labelOffsetY === undefined ? undefined : edge.data.labelOffsetY * scale,
      },
      style: { ...edge.style, strokeWidth: width },
    };
  });
  return { nodes, edges, width: blueprint.width * scale, height: blueprint.height * scale };
}

const BUILDERS: Record<ScientificSchematicTemplateId, (options: ScientificSchematicOptions, provenance: ScientificProvenance) => Blueprint> = {
  'multimodal-foundation': buildMultimodal,
  'vision-language-bridge': buildVisionLanguageBridge,
  'vla-policy': buildVlaPolicy,
  'prompt-conditioned-agent': buildPromptAgent,
  'embodied-loop': buildEmbodiedLoop,
  'train-deploy': buildTrainDeploy,
  'llm-training-pipeline': buildLlmTrainingPipeline,
  'moe-routing': buildMoeRouting,
  'rag-tool-agent': buildRagToolAgent,
  'reasoning-trace': buildReasoningTrace,
  'robot-data-collection': buildRobotDataCollection,
  'world-model-rollout': buildWorldModelRollout,
  'sim-to-real': buildSimToReal,
  'multi-embodiment-policy': buildMultiEmbodimentPolicy,
};

export function getScientificSchematicTemplate(id: ScientificSchematicTemplateId): ScientificSchematicTemplate {
  return SCIENTIFIC_SCHEMATIC_TEMPLATES.find((template) => template.id === id) ?? SCIENTIFIC_SCHEMATIC_TEMPLATES[0];
}

export function defaultScientificSchematicTitle(
  templateId: ScientificSchematicTemplateId,
  language: ScientificSchematicLanguage,
): string {
  const template = getScientificSchematicTemplate(templateId);
  return language === 'zh' ? template.name : template.nameEn.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function defaultScientificSchematicBackbone(
  templateId: ScientificSchematicTemplateId,
  language: ScientificSchematicLanguage,
): string {
  return SCIENTIFIC_BACKBONE_DEFAULTS[templateId][language];
}

function resolveScientificDefault(
  value: string,
  expected: string,
  knownDefaults: ReadonlySet<string>,
): string {
  const requested = value.trim();
  return !requested || (knownDefaults.has(requested) && requested !== expected) ? expected : requested;
}

export function createScientificSchematic(
  input: ScientificSchematicOptions,
  targetFigure?: ScientificFigureSpec,
): EditableScientificSchematic {
  const template = getScientificSchematicTemplate(input.templateId);
  const layout = schematicLayoutForFigure(targetFigure);
  const expectedTitle = defaultScientificSchematicTitle(input.templateId, input.language);
  const expectedBackbone = defaultScientificSchematicBackbone(input.templateId, input.language);
  const knownTitles = new Set(SCIENTIFIC_SCHEMATIC_TEMPLATES.flatMap((entry) => [
    entry.name,
    entry.nameEn.replace(/\b\w/g, (character) => character.toUpperCase()),
  ]));
  const knownBackbones = new Set(Object.values(SCIENTIFIC_BACKBONE_DEFAULTS).flatMap((entry) => [entry.en, entry.zh]));
  const options: ScientificSchematicOptions = {
    ...input,
    title: resolveScientificDefault(input.title, expectedTitle, knownTitles),
    backbone: resolveScientificDefault(input.backbone, expectedBackbone, knownBackbones),
  };
  const provenance: ScientificProvenance = {
    id: createId('provenance'),
    kind: 'scientific-schematic',
    sourceName: template.name,
    sourceFormat: 'Flowloom native schematic',
    sourceData: JSON.stringify({
      ...options,
      layout,
      targetWidthMm: targetFigure?.widthMm,
      targetHeightMm: targetFigure?.heightMm,
    }),
    engine: 'Flowloom schematic grammar 1',
    generatedAt: new Date().toISOString(),
    schematic: {
      templateId: options.templateId,
      style: options.style,
      density: options.density,
      language: options.language,
      backbone: options.backbone || undefined,
      references: template.references.map((reference) => reference.arxivId),
      generatedBy: 'template',
      layout,
      targetWidthMm: targetFigure?.widthMm,
      targetHeightMm: targetFigure?.heightMm,
    },
  };
  const responsiveBlueprint = buildTopVenueFlagship(options, provenance, layout)
    ?? (layout === 'single-column'
      ? buildSingleColumnFlagship(options, provenance)
      : layout === 'presentation'
        ? buildTalkFlagship(options, provenance)
        : layout === 'double-column'
          ? buildPublicationDoubleFlagship(options, provenance)
          : undefined);
  const sourceBlueprint = responsiveBlueprint ?? BUILDERS[options.templateId](options, provenance);
  const allowedRank = densityRank(options.density);
  const nodes = sourceBlueprint.nodes.filter((node) => densityRank(node.data.schematicDetail ?? 'compact') <= allowedRank);
  const ids = new Set(nodes.map((node) => node.id));
  const graph = normalizeGraph(nodes, sourceBlueprint.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)));
  const blueprint = targetFigure
    ? fitBlueprintToFigure({ ...sourceBlueprint, nodes: graph.nodes, edges: graph.edges }, targetFigure, layout)
    : { ...sourceBlueprint, nodes: graph.nodes, edges: graph.edges };
  const edges = finalizeScientificEdges(blueprint.nodes, blueprint.edges);
  return {
    title: options.title,
    templateId: options.templateId,
    nodes: blueprint.nodes.map((node) => ({ ...node, selected: false })),
    edges: edges.map((edge) => ({ ...edge, selected: false })),
    width: blueprint.width,
    height: blueprint.height,
    references: template.references,
    layout,
    targetWidthMm: targetFigure?.widthMm,
    targetHeightMm: targetFigure?.heightMm,
  };
}
