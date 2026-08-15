import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ScientificSchematicOptions } from '../types';
import { estimateSvgTextWidth } from './diagram';
import {
  DEFAULT_SCIENTIFIC_SCHEMATIC_OPTIONS,
  SCIENTIFIC_SCHEMATIC_TEMPLATES,
  createScientificSchematic,
  defaultScientificSchematicBackbone,
} from './scientificSchematics';
import {
  FLAGSHIP_SEMANTIC_EDGE_PAIRS,
  FLAGSHIP_SEMANTIC_NODE_IDS,
} from './scientificFlagshipsV5';
import { serializePublicationSvg } from './scientificExport';
import { parseEditableSvg } from './svgImport';
import {
  layoutScientificNodeContent,
  layoutSchematicNodeContent,
  scientificNodeTextMaxWidth,
} from './scientificNodeLayout';
import {
  ARXIV_FIGURE_CORPUS_SUMMARY,
  SCIENTIFIC_FIGURE_RECIPES,
} from './scientificFigureRecipes';
import { getShapeDefinition } from './shapeRegistry';
import { auditScientificFigure, createScientificFigureLayout, mmToPx, scientificUnitsToPoints } from './scientific';
import type { ScientificFigureSpec } from '../types';

function options(overrides: Partial<ScientificSchematicOptions> = {}): ScientificSchematicOptions {
  return { ...DEFAULT_SCIENTIFIC_SCHEMATIC_OPTIONS, ...overrides };
}

function hasDirectedPath(edges: Array<{ source: string; target: string }>, source: string, target: string): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  const queue = [source];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

describe('scientific schematic templates', () => {
  it('builds every research-paper template as a connected editable graph', () => {
    for (const template of SCIENTIFIC_SCHEMATIC_TEMPLATES) {
      const schematic = createScientificSchematic(options({ templateId: template.id }));
      const ids = new Set(schematic.nodes.map((node) => node.id));
      const root = schematic.nodes.find((node) => node.data.scientificRole === 'schematic-root');

      expect(schematic.nodes.length, template.id).toBeGreaterThan(10);
      expect(schematic.edges.length, template.id).toBeGreaterThan(7);
      expect(ids.size, template.id).toBe(schematic.nodes.length);
      expect(root?.data.kind, template.id).toBe('group');
      expect(root?.data.provenance?.kind, template.id).toBe('scientific-schematic');
      expect(root?.data.provenance?.schematic?.references?.length, template.id).toBeGreaterThan(0);
      expect(schematic.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)), template.id).toBe(true);
      expect(schematic.nodes.every((node) => node.selected === false), template.id).toBe(true);
    }
  });

  it('ships an evidence-backed drawing recipe for every schematic template', () => {
    const corpus = JSON.parse(readFileSync('docs/research/arxiv-figure-corpus.json', 'utf8')) as {
      domains: {
        llm: { summary: { representativeComposition: Record<string, number> } };
        embodied: { summary: { representativeComposition: Record<string, number>; representativeElements: Record<string, number> } };
      };
    };
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.paperCount).toBe(100);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.parsedFigureCount).toBe(1289);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.llmFigureCount).toBe(656);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.embodiedFigureCount).toBe(633);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.llm.trainingPipeline)
      .toBe(corpus.domains.llm.summary.representativeComposition['training-pipeline']);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.trainingPipeline)
      .toBe(corpus.domains.embodied.summary.representativeComposition['training-pipeline']);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.robotEmbodiment)
      .toBe(corpus.domains.embodied.summary.representativeElements['robot-embodiment']);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.actionTrajectory)
      .toBe(corpus.domains.embodied.summary.representativeElements['action-trajectory']);
    expect(ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.imageStrip)
      .toBe(corpus.domains.embodied.summary.representativeElements['image-strip']);

    for (const template of SCIENTIFIC_SCHEMATIC_TEMPLATES) {
      const recipe = SCIENTIFIC_FIGURE_RECIPES[template.id];
      expect(recipe.templateId).toBe(template.id);
      expect(recipe.zones.length, template.id).toBeGreaterThanOrEqual(4);
      expect(recipe.elements.length, template.id).toBeGreaterThanOrEqual(4);
      expect(recipe.steps.length, template.id).toBeGreaterThanOrEqual(6);
      expect(recipe.arrowRules.length, template.id).toBeGreaterThanOrEqual(1);
      expect(recipe.colorRules.length, template.id).toBeGreaterThanOrEqual(1);
      expect(recipe.checks.length, template.id).toBeGreaterThanOrEqual(4);
      recipe.elements.forEach((element) => expect(getShapeDefinition(element.kind).kind).toBe(element.kind));
    }
  });

  it('uses native scientific pictograms in every corpus-derived template', () => {
    const corpusDerivedIds = [
      'llm-training-pipeline',
      'moe-routing',
      'rag-tool-agent',
      'reasoning-trace',
      'robot-data-collection',
      'world-model-rollout',
      'sim-to-real',
      'multi-embodiment-policy',
    ] as const;

    for (const templateId of corpusDerivedIds) {
      const schematic = createScientificSchematic(options({ templateId, density: 'detailed' }));
      expect(schematic.nodes.some((node) => node.data.kind.startsWith('scientific-')), templateId).toBe(true);
    }
  });

  it('keeps foreground modules inside the declared canvas', () => {
    for (const template of SCIENTIFIC_SCHEMATIC_TEMPLATES) {
      const schematic = createScientificSchematic(options({ templateId: template.id, density: 'detailed' }));
      const foreground = schematic.nodes.filter((node) => !['frame', 'phase'].includes(node.data.schematicRole ?? ''));
      for (const node of foreground) {
        const width = Number(node.style?.width ?? 0);
        const height = Number(node.style?.height ?? 0);
        expect(node.position.x, node.id).toBeGreaterThanOrEqual(0);
        expect(node.position.y, node.id).toBeGreaterThanOrEqual(0);
        expect(node.position.x + width, node.id).toBeLessThanOrEqual(schematic.width);
        expect(node.position.y + height, node.id).toBeLessThanOrEqual(schematic.height);
      }
    }
  });

  it('changes density without removing the core computation path', () => {
    const compact = createScientificSchematic(options({ density: 'compact' }));
    const detailed = createScientificSchematic(options({ density: 'detailed' }));

    expect(detailed.nodes.length).toBeGreaterThan(compact.nodes.length);
    expect(detailed.edges.length).toBeGreaterThanOrEqual(compact.edges.length);
    expect(compact.nodes.some((node) => node.data.schematicRole === 'backbone')).toBe(true);
    expect(compact.nodes.some((node) => node.data.schematicRole === 'action')).toBe(true);
    expect(compact.nodes.some((node) => node.data.schematicRole === 'environment')).toBe(true);
  });

  it('supports Chinese labels and a print-friendly monochrome palette', () => {
    const schematic = createScientificSchematic(options({
      templateId: 'embodied-loop',
      language: 'zh',
      style: 'monochrome',
      title: '',
    }));

    expect(schematic.title).toContain('具身智能');
    expect(schematic.nodes.some((node) => node.data.label.includes('世界模型'))).toBe(true);
    expect(schematic.nodes.every((node) => /^#[0-9A-F]{6}$/i.test(node.data.fill))).toBe(true);
    expect(schematic.edges.some((edge) => edge.data?.lineStyle === 'dashed')).toBe(true);
  });

  it('resolves template-specific backbone defaults and preserves custom names', () => {
    expect(defaultScientificSchematicBackbone('vla-policy', 'en')).toBe('VLM Backbone');
    expect(defaultScientificSchematicBackbone('world-model-rollout', 'en')).toBe('Latent World Model');
    expect(defaultScientificSchematicBackbone('llm-training-pipeline', 'en')).toBe('Base Model');

    for (const templateId of ['vla-policy', 'world-model-rollout', 'llm-training-pipeline'] as const) {
      const expected = defaultScientificSchematicBackbone(templateId, 'en');
      const schematic = createScientificSchematic(options({ templateId }));
      expect(schematic.nodes.some((node) => node.data.label === expected), templateId).toBe(true);
    }

    for (const template of SCIENTIFIC_SCHEMATIC_TEMPLATES) {
      const expected = defaultScientificSchematicBackbone(template.id, 'en');
      const schematic = createScientificSchematic(options({ templateId: template.id }));
      const root = schematic.nodes.find((node) => node.data.scientificRole === 'schematic-root');
      expect(root?.data.provenance?.schematic?.backbone, template.id).toBe(expected);
    }

    const custom = createScientificSchematic(options({
      templateId: 'world-model-rollout',
      backbone: 'Custom Dynamics Backbone',
    }));
    const root = custom.nodes.find((node) => node.data.scientificRole === 'schematic-root');
    expect(root?.data.provenance?.schematic?.backbone).toBe('Custom Dynamics Backbone');
    expect(custom.nodes.some((node) => node.data.label === 'Custom Dynamics Backbone')).toBe(true);
  });

  it('reflows flagship figures for physical single-column, double-column, and presentation formats', () => {
    const templates = ['vla-policy', 'world-model-rollout', 'llm-training-pipeline'] as const;
    const splitLabelWords: string[] = [];
    const truncatedText: string[] = [];
    const auditBlockers: string[] = [];
    const textOverflows: string[] = [];
    const pictogramOverlaps: string[] = [];
    const formats: Array<{ expected: 'single-column' | 'double-column' | 'presentation'; spec: ScientificFigureSpec }> = [
      {
        expected: 'single-column',
        spec: { widthMm: 89, heightMm: 70, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-28T00:00:00.000Z' },
      },
      {
        expected: 'double-column',
        spec: { widthMm: 180, heightMm: 120, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-28T00:00:00.000Z' },
      },
      {
        expected: 'presentation',
        spec: { widthMm: 180, heightMm: 101.25, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-28T00:00:00.000Z' },
      },
    ];

    for (const templateId of templates) {
      for (const format of formats) {
        const schematic = createScientificSchematic(options({ templateId, density: 'detailed' }), format.spec);
        expect(schematic.layout, `${templateId}:${format.expected}`).toBe(format.expected);
        expect(schematic.width, `${templateId}:${format.expected}`).toBeLessThanOrEqual(mmToPx(format.spec.widthMm - format.spec.marginMm * 2) + 0.01);
        expect(schematic.height, `${templateId}:${format.expected}`).toBeLessThanOrEqual(mmToPx(format.spec.heightMm - format.spec.marginMm * 2) + 0.01);
        const minimumLabelPoints = Math.min(...schematic.nodes
          .filter((node) => node.data.label.trim() && node.data.schematicRole !== 'annotation')
          .map((node) => scientificUnitsToPoints(node.data.fontSize)));
        expect(minimumLabelPoints, `${templateId}:${format.expected}`).toBeGreaterThanOrEqual(format.expected === 'presentation' ? 11 : 7);
        expect(schematic.nodes
          .filter((node) => node.data.schematicRole === 'frame' || node.data.schematicRole === 'phase')
          .every((node) => node.data.textAlign === 'left'), `${templateId}:${format.expected}:frame-alignment`).toBe(true);

        for (const node of schematic.nodes.filter((candidate) => (
          candidate.data.label.trim()
          && candidate.data.kind !== 'image'
          && !['frame'].includes(candidate.data.schematicRole ?? '')
        ))) {
          const width = Number(node.style?.width ?? 0);
          const height = Number(node.style?.height ?? 0);
          const content = node.data.kind.startsWith('scientific-')
            ? layoutScientificNodeContent(node.data, width, height)
            : layoutSchematicNodeContent(node.data, width, height);
          if (content.labelLines.some((line) => line.endsWith('...'))) {
            truncatedText.push(`${templateId}:${format.expected}:${node.id}:label`);
          }
          if (content.descriptionLines.some((line) => line.endsWith('...'))) {
            truncatedText.push(`${templateId}:${format.expected}:${node.id}:description`);
          }
          for (const [field, value, lines] of [
            ['label', node.data.label, content.labelLines],
            ['description', node.data.description ?? '', content.descriptionLines],
          ] as const) {
            for (const word of value.split(/\s+/).filter((candidate) => candidate.length >= 4)) {
              if (!lines.some((line) => line.includes(word))) {
                splitLabelWords.push(`${templateId}:${format.expected}:${node.id}:${field}:${word}`);
              }
            }
          }
          if (node.data.kind.startsWith('scientific-')) {
            const definition = getShapeDefinition(node.data.kind);
            if (definition.textPlacement === 'footer') {
              const labelTop = content.labelStartY - node.data.fontSize * 0.86;
              if (content.visualHeight > labelTop + 0.01) {
                pictogramOverlaps.push(`${templateId}:${format.expected}:${node.id}`);
              }
            }
          }
          if (node.data.schematicRole !== 'phase') {
            const lastBaseline = content.descriptionLines.length
              ? content.descriptionStartY + (content.descriptionLines.length - 1) * content.descriptionLineHeight
              : content.labelStartY + (content.labelLines.length - 1) * content.labelLineHeight;
            const lastFontSize = content.descriptionLines.length ? content.descriptionFontSize : node.data.fontSize;
            if (lastBaseline + lastFontSize * 0.24 > height + 0.01) {
              textOverflows.push(`${templateId}:${format.expected}:${node.id}`);
            }
          }
        }

        const layout = createScientificFigureLayout(format.spec);
        const origin = {
          x: (mmToPx(format.spec.widthMm) - schematic.width) / 2,
          y: (mmToPx(format.spec.heightMm) - schematic.height) / 2,
        };
        const positioned = schematic.nodes.map((node) => ({
          ...node,
          position: { x: node.position.x + origin.x, y: node.position.y + origin.y },
        }));
        const blockers = auditScientificFigure([...layout.nodes, ...positioned], format.spec, schematic.edges)
          .filter((issue) => issue.severity === 'error');
        const blockerDetails = blockers.map((issue) => ({
          ...issue,
          edges: issue.edgeIds?.map((id) => {
            const edge = schematic.edges.find((candidate) => candidate.id === id);
            const source = edge ? schematic.nodes.find((node) => node.id === edge.source) : undefined;
            const target = edge ? schematic.nodes.find((node) => node.id === edge.target) : undefined;
            return edge
              ? `${edge.source}[${edge.sourceHandle ?? 'auto'}] ${source?.position.y}+${source?.style?.height}->${edge.target}[${edge.targetHandle ?? 'auto'}] ${target?.position.y}+${target?.style?.height} (${edge.data?.routing ?? 'smart'})`
              : id;
          }),
        }));
        auditBlockers.push(...blockerDetails.map((issue) => `${templateId}:${format.expected}:${JSON.stringify(issue)}`));
      }
    }
    expect({ truncatedText, splitLabelWords, textOverflows, pictogramOverlaps, auditBlockers }).toEqual({
      truncatedText: [],
      splitLabelWords: [],
      textOverflows: [],
      pictogramOverlaps: [],
      auditBlockers: [],
    });
  });

  it('preserves the V5 scientific dependency contract in every flagship layout', () => {
    const formats: ScientificFigureSpec[] = [
      { widthMm: 89, heightMm: 70, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-29T00:00:00.000Z' },
      { widthMm: 180, heightMm: 120, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-29T00:00:00.000Z' },
      { widthMm: 180, heightMm: 101.25, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-29T00:00:00.000Z' },
    ];

    for (const figure of formats) {
      for (const templateId of ['vla-policy', 'world-model-rollout', 'llm-training-pipeline'] as const) {
        const schematic = createScientificSchematic(options({ templateId, density: 'detailed' }), figure);
        const nodeIds = new Set(schematic.nodes.map((node) => node.id));
        const actualEdgePairs = schematic.edges.map((edge) => `${edge.source}->${edge.target}`).sort();

        for (const id of FLAGSHIP_SEMANTIC_NODE_IDS[templateId]) {
          expect(nodeIds.has(id), `${templateId}:${schematic.layout}:${id}`).toBe(true);
        }
        expect(actualEdgePairs, `${templateId}:${schematic.layout}:edge-contract`)
          .toEqual([...FLAGSHIP_SEMANTIC_EDGE_PAIRS[templateId]].sort());
        expect(
          schematic.edges.every((edge) => !String(edge.data?.label ?? edge.label ?? '').trim()),
          `${templateId}:${schematic.layout}:connector-labels`,
        ).toBe(true);
      }

      const vla = createScientificSchematic(options({ templateId: 'vla-policy', density: 'detailed' }), figure);
      expect(hasDirectedPath(vla.edges, 'vla-observation', 'vla-execution'), `${vla.layout}:observation-to-execution`).toBe(true);
      expect(hasDirectedPath(vla.edges, 'vla-state', 'vla-policy'), `${vla.layout}:state-to-policy`).toBe(true);
      const vlaFeedback = vla.edges.find((edge) => edge.source === 'vla-rollout-c' && edge.target === 'vla-feedback-note');
      expect(vlaFeedback?.data?.scientificSemantic, `${vla.layout}:observation-feedback-semantic`).toBe('feedback');
      expect(vlaFeedback?.data?.lineStyle, `${vla.layout}:observation-feedback-style`).toBe('dashed');
      const vlaFeedbackReturn = vla.edges.find((edge) => edge.source === 'vla-feedback-note' && edge.target === 'vla-observation');
      expect(vlaFeedbackReturn?.data?.scientificSemantic, `${vla.layout}:feedback-return-semantic`).toBe('feedback');
      expect(vlaFeedbackReturn?.data?.lineStyle, `${vla.layout}:feedback-return-style`).toBe('dashed');
      expect(hasDirectedPath(vla.edges, 'vla-rollout-c', 'vla-observation'), `${vla.layout}:closed-observation-loop`).toBe(true);

      const world = createScientificSchematic(options({ templateId: 'world-model-rollout', density: 'detailed' }), figure);
      for (const candidate of ['wm-rollout-safe', 'wm-rollout-contact', 'wm-rollout-uncertain']) {
        expect(hasDirectedPath(world.edges, 'wm-rollout', candidate), `${world.layout}:fan-out:${candidate}`).toBe(true);
        expect(hasDirectedPath(world.edges, candidate, 'wm-score'), `${world.layout}:risk-score:${candidate}`).toBe(true);
      }
      expect(hasDirectedPath(world.edges, 'wm-score', 'wm-residual'), `${world.layout}:decision-to-residual`).toBe(true);
      expect(
        world.edges.some((edge) => edge.source === 'wm-score' && edge.target === 'wm-residual'),
        `${world.layout}:selected-prediction-to-residual`,
      ).toBe(true);
      const beliefFeedback = world.edges.filter((edge) => edge.target === 'wm-update');
      expect(beliefFeedback.length, `${world.layout}:belief-update-inputs`).toBe(1);
      expect(beliefFeedback[0]?.data?.scientificSemantic, `${world.layout}:belief-feedback-semantic`).toBe('feedback');
      expect(beliefFeedback[0]?.data?.lineStyle, `${world.layout}:belief-feedback-style`).toBe('dashed');

      const llm = createScientificSchematic(options({ templateId: 'llm-training-pipeline', density: 'detailed' }), figure);
      expect(hasDirectedPath(llm.edges, 'llm-base', 'llm-gate'), `${llm.layout}:base-to-release`).toBe(true);
      expect(hasDirectedPath(llm.edges, 'llm-prompt', 'llm-objective'), `${llm.layout}:preference-to-objective`).toBe(true);
      const preferenceUpdate = llm.edges.find((edge) => edge.source === 'llm-objective' && edge.target === 'llm-policy');
      expect(preferenceUpdate?.data?.scientificSemantic, `${llm.layout}:objective-gradient-semantic`).toBe('gradient');
      const optionalBaseline = llm.edges.filter((edge) => edge.data?.scientificSemantic === 'optional');
      expect(optionalBaseline.length, `${llm.layout}:baseline-edges`).toBe(4);
      expect(optionalBaseline.every((edge) => edge.data?.lineStyle === 'dotted'), `${llm.layout}:baseline-style`).toBe(true);
      expect(hasDirectedPath(llm.edges, 'llm-ppo', 'llm-gate'), `${llm.layout}:optional-baseline-to-release`).toBe(true);
      expect(
        llm.edges.some((edge) => edge.source === 'llm-ppo' && edge.target === 'llm-policy'),
        `${llm.layout}:baseline-aligned-policy-input`,
      ).toBe(true);
      expect(
        llm.edges.some((edge) => edge.source === 'llm-ppo' && edge.target === 'llm-suite'),
        `${llm.layout}:no-evaluation-bypass`,
      ).toBe(false);
    }
  });

  it('exports V5 phase backgrounds before edges and foreground modules', () => {
    const figure: ScientificFigureSpec = {
      widthMm: 180,
      heightMm: 120,
      dpi: 300,
      rows: 1,
      columns: 1,
      marginMm: 6,
      gapMm: 0,
      panelLabels: false,
      labelStyle: 'uppercase',
      background: 'transparent',
      updatedAt: '2026-07-28T00:00:00.000Z',
    };
    for (const [templateId, phaseId, foregroundId] of [
      ['vla-policy', 'vla-01', 'vla-observation'],
      ['world-model-rollout', 'wm-01', 'wm-scene'],
      ['llm-training-pipeline', 'llm-01', 'llm-base'],
    ] as const) {
      const schematic = createScientificSchematic(options({ templateId }), figure);
      const svg = serializePublicationSvg(schematic.title, schematic.nodes, schematic.edges, figure);
      const phaseIndex = svg.indexOf(`data-flowloom-node-id="${phaseId}"`);
      const edgeIndex = svg.indexOf('data-flowloom-edge-id=');
      const foregroundIndex = svg.indexOf(`data-flowloom-node-id="${foregroundId}"`);

      expect(phaseIndex, `${templateId}:phase-index`).toBeGreaterThan(0);
      expect(edgeIndex, `${templateId}:edge-index`).toBeGreaterThan(phaseIndex);
      expect(foregroundIndex, `${templateId}:foreground-index`).toBeGreaterThan(edgeIndex);
      expect(svg, `${templateId}:editable-metadata`).toContain('data-flowloom-editable');
    }
  });

  it('keeps V5 presentation headings readable and export-parity exact', () => {
    const figure: ScientificFigureSpec = {
      widthMm: 180,
      heightMm: 101.25,
      dpi: 300,
      rows: 1,
      columns: 1,
      marginMm: 6,
      gapMm: 0,
      panelLabels: false,
      labelStyle: 'uppercase',
      background: '#ffffff',
      updatedAt: '2026-07-28T00:00:00.000Z',
    };
    const expectedPhases = {
      'vla-policy': ['vla-01', 'vla-02', 'vla-03', 'vla-04'],
      'world-model-rollout': ['wm-01', 'wm-02', 'wm-03', 'wm-04', 'wm-05'],
      'llm-training-pipeline': ['llm-01', 'llm-02', 'llm-03', 'llm-04', 'llm-05'],
    } as const;

    for (const templateId of ['vla-policy', 'world-model-rollout', 'llm-training-pipeline'] as const) {
      const schematic = createScientificSchematic(options({ templateId }), figure);
      const svg = serializePublicationSvg(schematic.title, schematic.nodes, schematic.edges, figure);
      const document = new DOMParser().parseFromString(svg, 'image/svg+xml');

      for (const phaseId of expectedPhases[templateId]) expect(schematic.nodes.some((node) => node.id === phaseId), `${templateId}:${phaseId}`).toBe(true);
      for (const phase of schematic.nodes.filter((node) => node.data.schematicRole === 'phase')) {
        const width = Number(phase.style?.width ?? 0);
        const height = Number(phase.style?.height ?? 0);
        const layout = layoutSchematicNodeContent(phase.data, width, height);
        const exportedLines = Array.from(
          document.querySelectorAll(`[data-flowloom-node-id="${phase.id}"] text:first-of-type tspan`),
        ).map((line) => line.textContent ?? '');

        expect(exportedLines, `${templateId}:${phase.id}:parity`).toEqual(layout.labelLines);
        expect(layout.labelLines.length, `${templateId}:${phase.id}:line-count`).toBeLessThanOrEqual(2);
        expect(layout.labelLines.some((line) => line.endsWith('...')), `${templateId}:${phase.id}:truncation`).toBe(false);
        for (const line of layout.labelLines) {
          expect(
            estimateSvgTextWidth(line, phase.data.fontSize),
            `${templateId}:${phase.id}:${line}`,
          ).toBeLessThanOrEqual(scientificNodeTextMaxWidth(phase.data, width));
        }
      }
    }
  });

  it('gives flagship contributions more visual weight than context and optional baselines', () => {
    const singleFigure: ScientificFigureSpec = {
      widthMm: 89,
      heightMm: 70,
      dpi: 300,
      rows: 1,
      columns: 1,
      marginMm: 6,
      gapMm: 0,
      panelLabels: false,
      labelStyle: 'uppercase',
      background: '#ffffff',
      updatedAt: '2026-07-28T00:00:00.000Z',
    };
    const talkFigure: ScientificFigureSpec = { ...singleFigure, widthMm: 180, heightMm: 101.25 };
    const doubleFigure: ScientificFigureSpec = { ...singleFigure, widthMm: 180, heightMm: 120 };
    const box = (schematic: ReturnType<typeof createScientificSchematic>, id: string) => {
      const node = schematic.nodes.find((candidate) => candidate.id === id);
      expect(node, id).toBeDefined();
      return {
        left: node!.position.x,
        right: node!.position.x + Number(node!.style?.width ?? 0),
        top: node!.position.y,
        bottom: node!.position.y + Number(node!.style?.height ?? 0),
      };
    };
    const area = (value: ReturnType<typeof box>) => (value.right - value.left) * (value.bottom - value.top);
    const envelope = (schematic: ReturnType<typeof createScientificSchematic>, ids: string[]) => {
      const boxes = ids.map((id) => box(schematic, id));
      return {
        left: Math.min(...boxes.map((value) => value.left)),
        right: Math.max(...boxes.map((value) => value.right)),
        top: Math.min(...boxes.map((value) => value.top)),
        bottom: Math.max(...boxes.map((value) => value.bottom)),
      };
    };
    const contains = (outer: ReturnType<typeof box>, inner: ReturnType<typeof box>) => (
      inner.left >= outer.left
      && inner.right <= outer.right
      && inner.top >= outer.top
      && inner.bottom <= outer.bottom
    );

    const vlaLayouts = [singleFigure, doubleFigure, talkFigure].map((figure) => (
      createScientificSchematic(options({ templateId: 'vla-policy' }), figure)
    ));
    for (const schematic of vlaLayouts) {
      const contribution = box(schematic, 'vla-contribution-panel');
      const context = envelope(schematic, ['vla-observation', 'vla-task', 'vla-state']);
      const act = envelope(schematic, ['vla-integrator', 'vla-execution', 'vla-trajectory']);
      const policyArea = area(box(schematic, 'vla-policy'));
      const supportingAreas = ['vla-tokens', 'vla-backbone', 'vla-object', 'vla-constraints', 'vla-action', 'vla-integrator']
        .map((id) => area(box(schematic, id)));

      expect(area(contribution), `${schematic.layout}:contribution-vs-context`).toBeGreaterThan(area(context) * 2);
      expect(area(contribution), `${schematic.layout}:contribution-vs-act`).toBeGreaterThan(area(act) * 2);
      expect(policyArea, `${schematic.layout}:policy-focus`).toBeGreaterThan(Math.max(...supportingAreas));
      for (const legacyId of ['vla-panel-input', 'vla-panel-model', 'vla-panel-action', 'vla-panel-world']) {
        expect(schematic.nodes.some((node) => node.id === legacyId), `${schematic.layout}:${legacyId}`).toBe(false);
      }
      for (const phase of schematic.nodes.filter((node) => node.data.schematicRole === 'phase')) {
        const width = Number(phase.style?.width ?? 0);
        expect(estimateSvgTextWidth(phase.data.label, phase.data.fontSize), phase.id).toBeLessThanOrEqual(width - 12);
      }
    }

    for (const figure of [singleFigure, doubleFigure, talkFigure]) {
      const llm = createScientificSchematic(options({ templateId: 'llm-training-pipeline' }), figure);
      const alignment = box(llm, 'llm-panel-align');
      const baseline = box(llm, 'llm-baseline-panel');
      expect(baseline.top, `${llm.layout}:baseline-position`).toBeGreaterThan(alignment.bottom);
      expect(area(alignment), `${llm.layout}:alignment-focus`).toBeGreaterThan(area(baseline) * 1.2);
      for (const id of ['llm-rm', 'llm-rollout', 'llm-ppo']) {
        expect(contains(baseline, box(llm, id)), `${llm.layout}:baseline-contains-${id}`).toBe(true);
      }
      for (const legacyId of ['llm-panel-seed', 'llm-panel-evidence', 'llm-panel-deploy']) {
        expect(llm.nodes.some((node) => node.id === legacyId), `${llm.layout}:${legacyId}`).toBe(false);
      }
      expect(hasDirectedPath(llm.edges, 'llm-ppo', 'llm-gate'), `${llm.layout}:baseline-to-gate`).toBe(true);
    }

    const worldDouble = createScientificSchematic(options({ templateId: 'world-model-rollout' }), doubleFigure);
    for (const schematic of [vlaLayouts[1], worldDouble]) {
      const printImages = schematic.nodes.filter((node) => node.data.kind === 'image');
      expect(printImages.length, `${schematic.templateId}:${schematic.layout}:print-images`).toBeGreaterThan(0);
      for (const image of printImages) {
        expect(image.data.rasterWidthPx, `${schematic.templateId}:${image.id}:raster-width`).toBe(800);
        expect(image.data.rasterHeightPx, `${schematic.templateId}:${image.id}:raster-height`).toBe(1200);
        expect(image.data.sourceRef, `${schematic.templateId}:${image.id}:source-ref`).toMatch(/-print\.jpg$/);
      }
    }
  });

  it('round-trips every flagship layout and palette without losing editable scientific semantics', () => {
    const templates = ['vla-policy', 'world-model-rollout', 'llm-training-pipeline'] as const;
    const styles = ['conference', 'monochrome'] as const;
    const figures: ScientificFigureSpec[] = [
      { widthMm: 89, heightMm: 70, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-28T00:00:00.000Z' },
      { widthMm: 180, heightMm: 120, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-28T00:00:00.000Z' },
      { widthMm: 180, heightMm: 101.25, dpi: 300, rows: 1, columns: 1, marginMm: 6, gapMm: 0, panelLabels: false, labelStyle: 'uppercase', background: '#ffffff', updatedAt: '2026-07-28T00:00:00.000Z' },
    ];

    for (const templateId of templates) {
      for (const style of styles) {
        for (const figure of figures) {
          const schematic = createScientificSchematic(options({ templateId, style }), figure);
          const svg = serializePublicationSvg(schematic.title, schematic.nodes, schematic.edges, figure);
          const restored = parseEditableSvg(svg, `${templateId}-${style}-${schematic.layout}.svg`);
          const originalById = new Map(schematic.nodes.map((node) => [node.id, node]));
          const originalEdgeById = new Map(schematic.edges.map((edge) => [edge.id, edge]));
          const context = `${templateId}:${style}:${schematic.layout}`;

          expect(restored.nodes, `${context}:nodes`).toHaveLength(schematic.nodes.length);
          expect(restored.edges, `${context}:edges`).toHaveLength(schematic.edges.length);
          for (const node of restored.nodes) {
            const original = originalById.get(node.id);
            expect(original, `${context}:${node.id}`).toBeDefined();
            expect(node.data.label, `${context}:${node.id}:label`).toBe(original?.data.label);
            expect(node.data.schematicRole, `${context}:${node.id}:role`).toBe(original?.data.schematicRole);
            expect(node.data.scientificVariant, `${context}:${node.id}:variant`).toBe(original?.data.scientificVariant);
            expect(node.data.scientificEvidence, `${context}:${node.id}:evidence`).toBe(original?.data.scientificEvidence);
            expect(node.position.x, `${context}:${node.id}:x`).toBeCloseTo(original?.position.x ?? 0, 5);
            expect(node.position.y, `${context}:${node.id}:y`).toBeCloseTo(original?.position.y ?? 0, 5);
            expect(Number(node.style?.width), `${context}:${node.id}:width`).toBeCloseTo(Number(original?.style?.width), 5);
            expect(Number(node.style?.height), `${context}:${node.id}:height`).toBeCloseTo(Number(original?.style?.height), 5);
          }
          for (const edge of restored.edges) {
            const original = originalEdgeById.get(edge.id);
            expect(original, `${context}:${edge.id}`).toBeDefined();
            expect(edge.source, `${context}:${edge.id}:source`).toBe(original?.source);
            expect(edge.target, `${context}:${edge.id}:target`).toBe(original?.target);
            expect(edge.sourceHandle, `${context}:${edge.id}:source-handle`).toBe(original?.sourceHandle);
            expect(edge.targetHandle, `${context}:${edge.id}:target-handle`).toBe(original?.targetHandle);
            expect(edge.data?.routing, `${context}:${edge.id}:routing`).toBe(original?.data?.routing);
            expect(edge.data?.scientificSemantic, `${context}:${edge.id}:semantic`).toBe(original?.data?.scientificSemantic);
            expect(edge.data?.routeSide, `${context}:${edge.id}:route-side`).toBe(original?.data?.routeSide);
            expect(edge.data?.routeWaypoints, `${context}:${edge.id}:route-waypoints`).toEqual(original?.data?.routeWaypoints);
          }
        }
      }
    }
  });
});
