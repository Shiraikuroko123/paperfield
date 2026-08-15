import type { ScientificVisualVariant, ShapeKind } from '../types';

export interface ScientificVisualVariantOption {
  value: ScientificVisualVariant;
  label: string;
}

export const SCIENTIFIC_VISUAL_VARIANTS: Partial<Record<ShapeKind, ScientificVisualVariantOption[]>> = {
  'scientific-scene-frame': [
    { value: 'default', label: '单帧场景' },
    { value: 'multiview', label: '多视角观察' },
    { value: 'success', label: '成功展开' },
    { value: 'collision', label: '碰撞展开' },
    { value: 'uncertain', label: '不确定展开' },
    { value: 'execution', label: '闭环执行' },
  ],
  'scientific-token-strip': [
    { value: 'default', label: 'Token 序列' },
    { value: 'state-vector', label: '状态向量' },
    { value: 'telemetry', label: '监测序列' },
  ],
  'scientific-transformer': [
    { value: 'default', label: '通用 Transformer' },
    { value: 'vlm', label: 'VLM 融合主干' },
    { value: 'world-model', label: '世界模型转移' },
    { value: 'base-model', label: '基础模型' },
    { value: 'aligned-model', label: '对齐模型' },
    { value: 'checkpoint', label: '发布检查点' },
  ],
  'scientific-layer-stack': [
    { value: 'default', label: '网络层堆叠' },
    { value: 'diffusion-action', label: '扩散动作头' },
  ],
  'scientific-action-chunk': [
    { value: 'default', label: '动作块' },
    { value: 'action-horizon', label: '连续动作时域' },
  ],
  'scientific-loss-target': [
    { value: 'default', label: '通用目标' },
    { value: 'next-token', label: '下一 Token 目标' },
    { value: 'preference-objective', label: '偏好目标' },
  ],
  'scientific-decision-gate': [
    { value: 'default', label: '候选选择' },
    { value: 'risk-ranking', label: '风险排序' },
  ],
  'scientific-equation': [
    { value: 'default', label: '通用公式' },
    { value: 'score-bracket', label: '紧凑评分括号' },
  ],
  'scientific-metric-panel': [
    { value: 'default', label: '通用指标' },
    { value: 'capability-safety', label: '能力与安全' },
    { value: 'prediction-error', label: '预测误差' },
  ],
  'scientific-task-object': [
    { value: 'object-cube', label: '立方体物体' },
    { value: 'object-cylinder', label: '圆柱物体' },
  ],
  'scientific-goal-region': [
    { value: 'goal-bin', label: '放置目标区域' },
  ],
  'scientific-contact-point': [
    { value: 'force-contact', label: '力 / 接触点' },
  ],
  'scientific-release-gate': [
    { value: 'release-gate', label: '能力与安全发布门' },
  ],
};

export function getScientificVisualVariants(kind: ShapeKind): ScientificVisualVariantOption[] {
  return SCIENTIFIC_VISUAL_VARIANTS[kind] ?? [];
}
