import { describe, expect, it } from 'vitest';
import type { ScientificSchematicLayout, ScientificSchematicOptions } from '../types';
import {
  FLAGSHIP_MINIMUM_DIMENSION_RATIO,
  FLAGSHIP_QUALITY_DIMENSIONS,
  FLAGSHIP_QUALITY_SCORECARDS,
  FLAGSHIP_QUALITY_THRESHOLD,
  FLAGSHIP_REVIEW_IS_CURRENT,
  FLAGSHIP_TEMPLATE_IDS,
  assessFlagshipQualityScope,
} from './flagshipQuality';
import {
  defaultScientificSchematicBackbone,
  defaultScientificSchematicTitle,
} from './scientificSchematics';

function auditedOptions(templateId: typeof FLAGSHIP_TEMPLATE_IDS[number]): ScientificSchematicOptions {
  return {
    templateId,
    title: defaultScientificSchematicTitle(templateId, 'en'),
    backbone: defaultScientificSchematicBackbone(templateId, 'en'),
    style: 'conference',
    density: 'detailed',
    language: 'en',
  };
}

const EXPECTED_LAYOUT_TOTALS = {
  'vla-policy': [95.3, 96.3, 96.3],
  'world-model-rollout': [95.2, 96.0, 96.3],
  'llm-training-pipeline': [95.7, 96.7, 97.0],
} as const;

describe('flagship quality gate', () => {
  it('publishes only the latest independently reviewed composition', () => {
    expect(FLAGSHIP_REVIEW_IS_CURRENT).toBe(true);
    expect(Object.keys(FLAGSHIP_QUALITY_SCORECARDS)).toEqual([...FLAGSHIP_TEMPLATE_IDS]);
    for (const templateId of FLAGSHIP_TEMPLATE_IDS) {
      const scorecard = FLAGSHIP_QUALITY_SCORECARDS[templateId];
      expect(scorecard.dimensions.map((item) => item.id), templateId).toEqual(
        FLAGSHIP_QUALITY_DIMENSIONS.map((item) => item.id),
      );
      expect(scorecard.layoutReviews.map((review) => review.layout), templateId).toEqual([
        'single-column',
        'double-column',
        'presentation',
      ]);
      expect(scorecard.layoutReviews.map((review) => review.totalScore), templateId).toEqual(
        [...EXPECTED_LAYOUT_TOTALS[templateId]],
      );
      for (const review of scorecard.layoutReviews) {
        const mean = Number((review.dimensions.reduce((sum, item) => sum + item.score, 0) / review.dimensions.length).toFixed(1));
        expect(review.totalScore, `${templateId}:${review.layout}:mean`).toBe(mean);
        expect(review.totalScore, `${templateId}:${review.layout}:threshold`).toBeGreaterThanOrEqual(FLAGSHIP_QUALITY_THRESHOLD);
        expect(review.passed, `${templateId}:${review.layout}:passed`).toBe(true);
      }
      expect(scorecard.totalScore, `${templateId}:weakest-layout-score`).toBe(
        Math.min(...EXPECTED_LAYOUT_TOTALS[templateId]),
      );
      expect(scorecard.dimensions.every((item) => item.maxScore === 100), templateId).toBe(true);
      expect(scorecard.dimensions.every((item) => (
        item.score / item.maxScore >= FLAGSHIP_MINIMUM_DIMENSION_RATIO
      )), templateId).toBe(true);
      expect(scorecard.dimensions.every((item) => item.evidence.trim().length > 0), templateId).toBe(true);
      expect(scorecard.criticalFindings, templateId).toBe(0);
      expect(scorecard.majorFindings, templateId).toBe(0);
      expect(scorecard.reviewer).toContain('Bacon');
      expect(scorecard.reviewedRevision).toBe('publication-evidence-2026-08-02T01:38:12.765Z');
      expect(scorecard.passed, templateId).toBe(true);
      expect(scorecard.superseded, templateId).toBe(false);
    }
    expect(FLAGSHIP_MINIMUM_DIMENSION_RATIO).toBe(0.7);
  });

  it('marks the exact reviewed conference matrix as reviewed', () => {
    const layouts: ScientificSchematicLayout[] = ['single-column', 'double-column', 'presentation'];
    for (const templateId of FLAGSHIP_TEMPLATE_IDS) {
      for (const layout of layouts) {
        const result = assessFlagshipQualityScope(auditedOptions(templateId), layout);
        expect(result.status, `${templateId}:${layout}`).toBe('reviewed');
        expect(result.scorecard?.passed, `${templateId}:${layout}:scorecard`).toBe(true);
      }
    }
  });

  it('does not let edited or unaudited variants inherit the flagship review', () => {
    const base = auditedOptions('vla-policy');
    const variants: Array<[string, ScientificSchematicOptions, ScientificSchematicLayout]> = [
      ['title', { ...base, title: 'Custom policy' }, 'double-column'],
      ['backbone', { ...base, backbone: 'Custom VLM' }, 'double-column'],
      ['density', { ...base, density: 'standard' }, 'double-column'],
      ['language', {
        ...base,
        language: 'zh',
        title: defaultScientificSchematicTitle(base.templateId, 'zh'),
        backbone: defaultScientificSchematicBackbone(base.templateId, 'zh'),
      }, 'double-column'],
      ['style', { ...base, style: 'technical' }, 'double-column'],
      ['monochrome', { ...base, style: 'monochrome' }, 'double-column'],
      ['layout', base, 'freeform'],
    ];

    for (const [name, options, layout] of variants) {
      const result = assessFlagshipQualityScope(options, layout);
      expect(result.status, name).toBe('requires-review');
      expect(result.reasons.length, name).toBeGreaterThan(0);
    }

    const nonFlagship = assessFlagshipQualityScope({
      ...base,
      templateId: 'moe-routing',
      title: defaultScientificSchematicTitle('moe-routing', 'en'),
      backbone: defaultScientificSchematicBackbone('moe-routing', 'en'),
    }, 'double-column');
    expect(nonFlagship).toEqual({ status: 'not-flagship', reasons: [] });
  });
});
