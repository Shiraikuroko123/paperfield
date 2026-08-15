import type {
  ScientificSchematicLayout,
  ScientificSchematicOptions,
  ScientificSchematicTemplateId,
} from '../types';
import {
  defaultScientificSchematicBackbone,
  defaultScientificSchematicTitle,
} from './scientificSchematics';

export const FLAGSHIP_QUALITY_THRESHOLD = 95;
export const FLAGSHIP_MINIMUM_DIMENSION_RATIO = 0.7;
export const FLAGSHIP_QUALITY_RUBRIC_VERSION = 'independent-six-axis-2026.07.30';
// Signed against the immutable publication-evidence batch recorded below.
export const FLAGSHIP_REVIEW_IS_CURRENT = true;

export const FLAGSHIP_TEMPLATE_IDS = [
  'vla-policy',
  'world-model-rollout',
  'llm-training-pipeline',
] as const satisfies readonly ScientificSchematicTemplateId[];

export type FlagshipTemplateId = typeof FLAGSHIP_TEMPLATE_IDS[number];
export type FlagshipReviewLayout = Extract<
  ScientificSchematicLayout,
  'single-column' | 'double-column' | 'presentation'
>;

export const FLAGSHIP_QUALITY_DIMENSIONS = [
  { id: 'scientificNarrative', label: 'Scientific narrative', labelZh: '科学叙事', maxScore: 100 },
  { id: 'visualHierarchy', label: 'Visual hierarchy', labelZh: '视觉层级', maxScore: 100 },
  { id: 'routingCollision', label: 'Routing and collision control', labelZh: '线路与碰撞控制', maxScore: 100 },
  { id: 'compositionBalance', label: 'Composition balance', labelZh: '版面平衡', maxScore: 100 },
  { id: 'physicalReadability', label: 'Physical-scale readability', labelZh: '物理缩放可读性', maxScore: 100 },
  { id: 'crossFormatConsistency', label: 'Cross-format consistency', labelZh: '跨规格一致性', maxScore: 100 },
] as const;

export type FlagshipQualityDimensionId = typeof FLAGSHIP_QUALITY_DIMENSIONS[number]['id'];

export interface FlagshipQualityDimensionScore {
  id: FlagshipQualityDimensionId;
  label: string;
  labelZh: string;
  maxScore: number;
  score: number;
  evidence: string;
}

export interface FlagshipLayoutReview {
  layout: FlagshipReviewLayout;
  dimensions: FlagshipQualityDimensionScore[];
  totalScore: number;
  passed: boolean;
}

export interface FlagshipQualityScorecard {
  templateId: FlagshipTemplateId;
  name: string;
  rubricVersion: string;
  reviewedAt: string;
  reviewer: string;
  reviewedRevision: string;
  scope: string;
  layoutReviews: FlagshipLayoutReview[];
  dimensions: FlagshipQualityDimensionScore[];
  totalScore: number;
  threshold: number;
  criticalFindings: number;
  majorFindings: number;
  passed: boolean;
  superseded: boolean;
}

type SixAxisScores = readonly [number, number, number, number, number, number];

interface RawLayoutReview {
  layout: FlagshipReviewLayout;
  scores: SixAxisScores;
}

const REVIEWED_FLAGSHIPS: Record<FlagshipTemplateId, {
  name: string;
  layouts: readonly RawLayoutReview[];
}> = {
  'vla-policy': {
    name: 'Vision-Language-Action Policy',
    layouts: [
      { layout: 'single-column', scores: [97, 96, 95, 95, 95, 94] },
      { layout: 'double-column', scores: [98, 97, 96, 97, 96, 94] },
      { layout: 'presentation', scores: [98, 97, 96, 97, 97, 93] },
    ],
  },
  'world-model-rollout': {
    name: 'World-Model Rollout',
    layouts: [
      { layout: 'single-column', scores: [97, 95, 95, 95, 95, 94] },
      { layout: 'double-column', scores: [98, 96, 96, 96, 96, 94] },
      { layout: 'presentation', scores: [98, 97, 96, 96, 97, 94] },
    ],
  },
  'llm-training-pipeline': {
    name: 'LLM Alignment: DPO vs RLHF',
    layouts: [
      { layout: 'single-column', scores: [97, 96, 95, 95, 95, 96] },
      { layout: 'double-column', scores: [98, 97, 96, 97, 96, 96] },
      { layout: 'presentation', scores: [98, 98, 96, 97, 97, 96] },
    ],
  },
};

const DIMENSION_EVIDENCE: Record<FlagshipQualityDimensionId, string> = {
  scientificNarrative: 'The method contribution, mechanism, comparison, and outcome remain traceable without relying on body text.',
  visualHierarchy: 'Stage headings and the dominant method spine preserve a clear first-read order.',
  routingCollision: 'Independent pixel review found no connector-to-label collision or ambiguous endpoint in the signed-off exports.',
  compositionBalance: 'Information density, whitespace, and emphasis remain balanced at the target aspect ratio.',
  physicalReadability: 'The reviewed exports preserve the required 7.5/11 pt text and 0.8/1 pt strokes at 300 DPI.',
  crossFormatConsistency: 'Single-column, double-column, and presentation layouts preserve the same scientific semantics.',
};

function roundedMean(scores: readonly number[]): number {
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
}

function buildLayoutReview(raw: RawLayoutReview): FlagshipLayoutReview {
  const dimensions = FLAGSHIP_QUALITY_DIMENSIONS.map((dimension, index) => ({
    ...dimension,
    score: raw.scores[index],
    evidence: `${DIMENSION_EVIDENCE[dimension.id]} Independent blind-review score for ${raw.layout}.`,
  }));
  const totalScore = roundedMean(raw.scores);
  return {
    layout: raw.layout,
    dimensions,
    totalScore,
    passed: totalScore >= FLAGSHIP_QUALITY_THRESHOLD,
  };
}

function buildReviewedScorecard(templateId: FlagshipTemplateId): FlagshipQualityScorecard {
  const reviewed = REVIEWED_FLAGSHIPS[templateId];
  const layoutReviews = reviewed.layouts.map(buildLayoutReview);
  const dimensions = FLAGSHIP_QUALITY_DIMENSIONS.map((dimension) => {
    const scores = layoutReviews.map((review) => (
      review.dimensions.find((candidate) => candidate.id === dimension.id)!.score
    ));
    const score = Math.min(...scores);
    const weakestLayouts = layoutReviews
      .filter((review) => review.dimensions.some((candidate) => candidate.id === dimension.id && candidate.score === score))
      .map((review) => review.layout)
      .join(', ');
    return {
      ...dimension,
      score,
      evidence: `${DIMENSION_EVIDENCE[dimension.id]} Lowest observed score: ${score}/100 (${weakestLayouts}).`,
    };
  });
  const totalScore = FLAGSHIP_REVIEW_IS_CURRENT
    ? Math.min(...layoutReviews.map((review) => review.totalScore))
    : 0;
  const dimensionsMeetFloor = dimensions.every((dimension) => (
    dimension.score / dimension.maxScore >= FLAGSHIP_MINIMUM_DIMENSION_RATIO
  ));
  const passed = FLAGSHIP_REVIEW_IS_CURRENT && layoutReviews.every((review) => review.passed) && dimensionsMeetFloor;
  return {
    templateId,
    name: reviewed.name,
    rubricVersion: FLAGSHIP_QUALITY_RUBRIC_VERSION,
    reviewedAt: FLAGSHIP_REVIEW_IS_CURRENT ? '2026-08-02' : '',
    reviewer: FLAGSHIP_REVIEW_IS_CURRENT ? 'Bacon, independent read-only reviewer agent' : 'Awaiting independent read-only review',
    reviewedRevision: FLAGSHIP_REVIEW_IS_CURRENT ? 'publication-evidence-2026-08-02T01:38:12.765Z' : 'V5 composition refresh',
    scope: FLAGSHIP_REVIEW_IS_CURRENT
      ? 'Blind read-only review of 18 PNG exports, 18 PDF renders, and both contact sheets from the recorded evidence batch. Scores cover the default English detailed conference export in single-column, double-column, and presentation layouts. Total score is the weakest layout mean.'
      : 'The V4 scorecard is superseded. The V5 default English detailed conference matrix is awaiting independent review.',
    layoutReviews,
    dimensions,
    totalScore,
    threshold: FLAGSHIP_QUALITY_THRESHOLD,
    criticalFindings: 0,
    majorFindings: 0,
    passed,
    superseded: !FLAGSHIP_REVIEW_IS_CURRENT,
  };
}

export const FLAGSHIP_QUALITY_SCORECARDS = Object.fromEntries(
  FLAGSHIP_TEMPLATE_IDS.map((templateId) => [templateId, buildReviewedScorecard(templateId)]),
) as Record<FlagshipTemplateId, FlagshipQualityScorecard>;

export function isFlagshipTemplate(templateId: ScientificSchematicTemplateId): templateId is FlagshipTemplateId {
  return FLAGSHIP_TEMPLATE_IDS.some((candidate) => candidate === templateId);
}

export function getFlagshipQualityScorecard(
  templateId: ScientificSchematicTemplateId,
): FlagshipQualityScorecard | undefined {
  return isFlagshipTemplate(templateId) ? FLAGSHIP_QUALITY_SCORECARDS[templateId] : undefined;
}

export interface FlagshipQualityScopeAssessment {
  status: 'reviewed' | 'requires-review' | 'not-flagship';
  scorecard?: FlagshipQualityScorecard;
  reasons: string[];
}

const benchmarkLayouts = new Set<ScientificSchematicLayout>([
  'single-column',
  'double-column',
  'presentation',
]);

export function assessFlagshipQualityScope(
  options: ScientificSchematicOptions,
  layout: ScientificSchematicLayout,
): FlagshipQualityScopeAssessment {
  const scorecard = getFlagshipQualityScorecard(options.templateId);
  if (!scorecard) return { status: 'not-flagship', reasons: [] };

  const reasons: string[] = [];
  if (options.density !== 'detailed') reasons.push('结构密度不是已复评的详细版');
  if (options.language !== 'en') reasons.push('图中文字不是已复评的英文版');
  if (options.style !== 'conference') reasons.push('视觉风格不是已复评的会议版');
  if (!benchmarkLayouts.has(layout)) reasons.push('画布尺寸不在复评矩阵中');
  if (options.title.trim() !== defaultScientificSchematicTitle(options.templateId, options.language)) reasons.push('图题已自定义');
  if (options.backbone.trim() !== defaultScientificSchematicBackbone(options.templateId, options.language)) reasons.push('核心主干名称已自定义');
  if (!scorecard.passed) reasons.push('旗舰质量门禁尚未通过');

  return {
    status: reasons.length ? 'requires-review' : 'reviewed',
    scorecard,
    reasons: reasons.length
      ? reasons
      : [`三种规格独立盲评全部通过；最低 ${scorecard.totalScore.toFixed(1)}/100`],
  };
}
