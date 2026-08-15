import { describe, expect, it } from 'vitest';
import { createFlowEdge, createFlowNode } from './diagram';
import { preparePublicationSvgForPdf, serializePublicationSvg } from './scientificExport';
import {
  auditScientificFigure,
  buildScientificChartSpec,
  createEditableScientificChart,
  createScientificFigureLayout,
  mmToPx,
  parseScientificTable,
  type ScientificChartOptions,
} from './scientific';
import type { ScientificFigureSpec } from '../types';

const figure: ScientificFigureSpec = {
  widthMm: 180,
  heightMm: 120,
  dpi: 300,
  rows: 2,
  columns: 2,
  marginMm: 6,
  gapMm: 5,
  panelLabels: true,
  labelStyle: 'uppercase',
  background: '#ffffff',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

describe('scientific data tables', () => {
  it('parses quoted CSV, missing values, and numeric columns', () => {
    const table = parseScientificTable('group,label,value\nA,"alpha, beta",1.5\nB,gamma,');
    expect(table.headers).toEqual(['group', 'label', 'value']);
    expect(table.numericFields).toEqual(['value']);
    expect(table.rows[0]).toMatchObject({ group: 'A', label: 'alpha, beta', value: 1.5 });
    expect(table.rows[1].value).toBeNull();
  });

  it('builds a colorblind-friendly spec with redundant group encoding', () => {
    const sourceData = 'group,time,value\nA,0,1\nB,0,2\nA,1,3\nB,1,4';
    const table = parseScientificTable(sourceData);
    const options = {
      title: 'Response',
      sourceName: 'response.csv',
      sourceData,
      chartType: 'line' as const,
      fields: { x: 'time', y: 'value', color: 'group' },
      units: { time: 'h', value: 'a.u.' },
      uncertaintyDefinition: '',
    };
    const spec = buildScientificChartSpec(table, options);
    const encoding = spec.encoding as Record<string, unknown>;
    expect(encoding.color).toBeTruthy();
    expect(encoding.strokeDash).toBeTruthy();
    expect(JSON.stringify(spec)).toContain('a.u.');
  });
});

describe('scientific figure layout', () => {
  it('converts millimeters and creates export-safe panel guides', () => {
    const layout = createScientificFigureLayout(figure);
    expect(mmToPx(25.4)).toBeCloseTo(254, 6);
    expect(layout.nodes).toHaveLength(9);
    const background = layout.nodes.find((node) => node.data.scientificRole === 'figure-background');
    const guides = layout.nodes.filter((node) => node.data.scientificRole === 'panel-guide');
    const labels = layout.nodes.filter((node) => node.data.scientificRole === 'panel-label');
    expect(Number(background?.style?.width)).toBeCloseTo(mmToPx(180), 5);
    expect(guides).toHaveLength(4);
    expect(guides.every((node) => node.data.exportExcluded && node.data.locked)).toBe(true);
    expect(labels.map((node) => node.data.label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('wraps SVG primitives as an editable chart with provenance', () => {
    const sourceData = 'x,y\n1,2';
    const options: ScientificChartOptions = {
      title: 'Test chart',
      sourceName: 'test.csv',
      sourceData,
      chartType: 'scatter',
      fields: { x: 'x', y: 'y' },
      units: { x: 's', y: 'm' },
      uncertaintyDefinition: '',
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="10" y="10" width="180" height="80" fill="#fff"/><circle cx="50" cy="50" r="5" fill="#0072B2"/><text x="70" y="55">value</text></svg>';
    const chart = createEditableScientificChart(svg, { mark: 'point' }, options);
    const root = chart.nodes[0];
    expect(root.data.scientificRole).toBe('chart-root');
    expect(root.data.provenance?.sourceData).toBe(sourceData);
    expect(chart.nodes.slice(1).every((node) => node.parentId === root.id)).toBe(true);
    expect(chart.nodes.slice(1).every((node) => node.data.provenanceRef === root.data.provenance?.id)).toBe(true);
  });
});

describe('scientific quality checks', () => {
  it('reports small text, thin strokes, raster uncertainty, and overflow', () => {
    const small = createFlowNode('process', { x: 1750, y: 20 }, 'Small text', { style: { width: 100, height: 60 } });
    small.data = { ...small.data, fontSize: 8, borderWidth: 0.4 };
    const image = createFlowNode('image', { x: 20, y: 20 }, 'Raster');
    const issues = auditScientificFigure([small, image], figure);
    expect(issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      'text-below-publication-minimum',
      'stroke-below-0.6pt',
      'raster-resolution',
      'outside-figure',
    ]));
  });

  it('blocks sub-0.6 pt connectors and missing endpoints', () => {
    const source = createFlowNode('process', { x: 40, y: 180 }, 'Source', { id: 'source' });
    const target = createFlowNode('process', { x: 480, y: 180 }, 'Target', { id: 'target' });
    const thin = createFlowEdge(source.id, target.id, undefined, 'straight');
    thin.id = 'thin-edge';
    thin.data = { ...thin.data!, width: 0.5 };
    const dangling = createFlowEdge(source.id, 'missing', undefined, 'straight');
    dangling.id = 'dangling-edge';

    const issues = auditScientificFigure([source, target], figure, [thin, dangling]);
    expect(issues.find((issue) => issue.id === 'edge-stroke-below-0.6pt')?.edgeIds).toContain(thin.id);
    expect(issues.find((issue) => issue.id === 'invalid-edge-endpoint')?.edgeIds).toContain(dangling.id);
  });

  it('detects connectors that pass through an unrelated module', () => {
    const source = createFlowNode('process', { x: 40, y: 220 }, 'Source', { id: 'source' });
    const obstacle = createFlowNode('process', { x: 260, y: 200 }, 'Obstacle', { id: 'obstacle' });
    const target = createFlowNode('process', { x: 500, y: 220 }, 'Target', { id: 'target' });
    const edge = createFlowEdge(source.id, target.id, undefined, 'straight');
    edge.id = 'through-edge';
    edge.sourceHandle = 'right';
    edge.targetHandle = 'left';

    const issue = auditScientificFigure([source, obstacle, target], figure, [edge])
      .find((candidate) => candidate.id === 'edge-through-node');
    expect(issue?.edgeIds).toContain(edge.id);
    expect(issue?.nodeIds).toContain(obstacle.id);
  });

  it('blocks nodes and connectors from entering a phase heading safe zone', () => {
    const phase = createFlowNode('group', { x: 40, y: 80 }, 'A  Multimodal reasoning', {
      id: 'phase',
      style: { width: 420, height: 260 },
    });
    phase.data = {
      ...phase.data,
      schematicRole: 'phase',
      fontSize: 32,
      textAlign: 'left',
      verticalAlign: 'top',
    };
    const source = createFlowNode('process', { x: 70, y: 96 }, 'Overlapping module', { id: 'phase-source' });
    const target = createFlowNode('process', { x: 520, y: 96 }, 'Target', { id: 'phase-target' });
    const edge = createFlowEdge(source.id, target.id, undefined, 'straight');
    edge.id = 'heading-edge';
    edge.sourceHandle = 'right';
    edge.targetHandle = 'left';

    const issue = auditScientificFigure([phase, source, target], figure, [edge])
      .find((candidate) => candidate.id === 'phase-heading-collision');
    expect(issue?.nodeIds).toEqual(expect.arrayContaining([phase.id, source.id]));
    expect(issue?.edgeIds).toContain(edge.id);
  });

  it('reports independent connector crossings', () => {
    const left = createFlowNode('process', { x: 40, y: 260 }, 'Left', { id: 'left' });
    const right = createFlowNode('process', { x: 520, y: 260 }, 'Right', { id: 'right' });
    const top = createFlowNode('process', { x: 290, y: 60 }, 'Top', { id: 'top' });
    const bottom = createFlowNode('process', { x: 290, y: 480 }, 'Bottom', { id: 'bottom' });
    const horizontal = createFlowEdge(left.id, right.id, undefined, 'straight');
    horizontal.id = 'horizontal-edge';
    horizontal.sourceHandle = 'right';
    horizontal.targetHandle = 'left';
    const vertical = createFlowEdge(top.id, bottom.id, undefined, 'straight');
    vertical.id = 'vertical-edge';
    vertical.sourceHandle = 'bottom';
    vertical.targetHandle = 'top';

    const issue = auditScientificFigure([left, right, top, bottom], figure, [horizontal, vertical])
      .find((candidate) => candidate.id === 'edge-crossings');
    expect(issue?.edgeIds).toEqual(expect.arrayContaining([horizontal.id, vertical.id]));
  });

  it('rejects long collinear overlap even when edges share a target', () => {
    const upper = createFlowNode('process', { x: 40, y: 100 }, 'Upper', { id: 'upper' });
    const lower = createFlowNode('process', { x: 40, y: 300 }, 'Lower', { id: 'lower' });
    const target = createFlowNode('process', { x: 520, y: 200 }, 'Shared target', { id: 'shared-target' });
    const first = createFlowEdge(upper.id, target.id);
    const second = createFlowEdge(lower.id, target.id);
    first.id = 'overlap-a';
    second.id = 'overlap-b';
    first.sourceHandle = second.sourceHandle = 'right';
    first.targetHandle = second.targetHandle = 'left';

    const issue = auditScientificFigure([upper, lower, target], figure, [first, second])
      .find((candidate) => candidate.id === 'edge-collinear-overlap');
    expect(issue?.edgeIds).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it('rejects a same-side route that approaches a target from inside', () => {
    const source = createFlowNode('process', { x: 420, y: 100 }, 'SFT', { id: 'sft' });
    const target = createFlowNode('process', { x: 300, y: 300 }, 'DPO', { id: 'dpo' });
    const edge = createFlowEdge(source.id, target.id);
    edge.id = 'inside-target';
    edge.sourceHandle = 'left';
    edge.targetHandle = 'left';

    const issue = auditScientificFigure([source, target], figure, [edge])
      .find((candidate) => candidate.id === 'edge-port-direction');
    expect(issue?.edgeIds).toContain(edge.id);
  });

  it('blocks unclassified, literal schematic, and incomplete data-bound result glyphs', () => {
    const unclassified = createFlowNode('scientific-mini-plot', { x: 40, y: 80 }, 'Metric');
    const literal = createFlowNode('scientific-metric-panel', { x: 260, y: 80 }, 'p = .86');
    literal.data = { ...literal.data, scientificEvidence: 'schematic' };
    const incomplete = createFlowNode('scientific-probability-bars', { x: 480, y: 80 }, 'Measured');
    incomplete.data = { ...incomplete.data, scientificEvidence: 'data-bound' };

    const ids = auditScientificFigure([unclassified, literal, incomplete], figure).map((issue) => issue.id);
    expect(ids).toEqual(expect.arrayContaining([
      'unclassified-scientific-evidence',
      'schematic-literal-result',
      'incomplete-data-contract',
    ]));
  });

  it('keeps a deep feedback route outside intervening modules', () => {
    const scene = createFlowNode('process', { x: 100, y: 80 }, 'Scene', { id: 'scene' });
    const state = createFlowNode('process', { x: 100, y: 300 }, 'State', { id: 'state' });
    const robot = createFlowNode('process', { x: 520, y: 300 }, 'Robot', { id: 'robot' });
    const feedback = createFlowEdge(robot.id, scene.id, 't+1', 'bezier');
    feedback.id = 'feedback-edge';
    feedback.sourceHandle = 'bottom';
    feedback.targetHandle = 'left';
    feedback.data = {
      ...feedback.data!,
      scientificSemantic: 'feedback',
      routeSide: 'bottom-left',
      routeOffset: 110,
    };

    const issues = auditScientificFigure([scene, state, robot], figure, [feedback]);
    expect(issues.find((issue) => issue.id === 'edge-through-node')).toBeUndefined();
  });

  it('blocks connector labels that extend beyond the physical figure', () => {
    const source = createFlowNode('process', { x: 20, y: 160 }, 'Source', { id: 'source' });
    const target = createFlowNode('process', { x: 20, y: 460 }, 'Target', { id: 'target' });
    const feedback = createFlowEdge(source.id, target.id, 'feedback', 'bezier');
    feedback.id = 'outside-label';
    feedback.sourceHandle = 'left';
    feedback.targetHandle = 'left';
    feedback.data = {
      ...feedback.data!,
      scientificSemantic: 'feedback',
      routeSide: 'left',
      routeOffset: 80,
    };

    const issue = auditScientificFigure([source, target], figure, [feedback])
      .find((candidate) => candidate.id === 'edge-label-outside-figure');
    expect(issue?.edgeIds).toContain(feedback.id);
  });
});

describe('publication SVG export', () => {
  it('writes physical dimensions with native SVG primitives and no foreignObject', () => {
    const layout = createScientificFigureLayout({ ...figure, rows: 1, columns: 1 });
    const first = createFlowNode('process', { x: 40, y: 60 }, 'Collect', { id: 'collect' });
    const second = createFlowNode('decision', { x: 280, y: 60 }, 'Valid?', { id: 'valid' });
    const edge = createFlowEdge(first.id, second.id, 'yes');
    const svg = serializePublicationSvg('Methods', [...layout.nodes, first, second], [edge], figure);
    expect(svg).toContain('width="180mm"');
    expect(svg).toContain('height="120mm"');
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('<path');
    expect(svg).toContain('<text');
    expect(svg).not.toContain('foreignObject');
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.querySelector('[data-flowloom-edge-label-bg="true"]')).not.toBeNull();
    expect(document.querySelector('[data-flowloom-edge-label="true"] text')?.hasAttribute('stroke')).toBe(false);
    expect(document.querySelector('[data-flowloom-edge-label="true"] text')?.hasAttribute('paint-order')).toBe(false);
  });

  it('preserves editable scientific shape and visual-variant metadata in SVG', () => {
    const model = createFlowNode('scientific-transformer', { x: 80, y: 90 }, 'Latent World Model', {
      id: 'world-model',
      style: { width: 310, height: 150 },
    });
    model.data = {
      ...model.data,
      description: 'p(zₜ₊₁ | zₜ, aₜ)',
      scientificVariant: 'world-model',
    };
    const svg = serializePublicationSvg('World model', [model], [], { ...figure, rows: 1, columns: 1 });
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const shape = document.querySelector('[data-shape-kind="scientific-transformer"]');

    expect(shape).not.toBeNull();
    expect(shape?.getAttribute('data-scientific-variant')).toBe('world-model');
    expect(document.querySelector('[data-flowloom-node-id="world-model"]')).not.toBeNull();
  });

  it('prepares Unicode text while preserving SVG stroke widths for vector PDF scaling', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 1200">'
      + '<path vector-effect="non-scaling-stroke" stroke-width="3.6"/>'
      + '<text font-family="Segoe UI" font-weight="650">世界模型 b̂⁽ᵏ⁾ p(zₜ₊₁ | zₜ, aₜ) θ π τ Δ σ β ℝᴴˣ⁷ →</text>'
      + '<text font-family="Segoe UI">ôₜ₊₁</text>'
      + '</svg>';
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = document.documentElement as unknown as SVGSVGElement;

    preparePublicationSvgForPdf(svg, figure);

    expect(svg.querySelector('path')?.getAttribute('stroke-width')).toBe('3.6');
    expect(svg.querySelector('path')?.hasAttribute('vector-effect')).toBe(false);
    expect(svg.querySelector('text')?.getAttribute('font-family')).toBe('Flowloom Publication Sans');
    expect(svg.querySelector('text')?.getAttribute('font-weight')).toBe('700');
    expect(svg.querySelector('text')?.textContent).toContain('p(zt+1 | zt, at)');
    expect(svg.querySelector('text')?.textContent).toContain('bˆ(k)');
    expect(svg.querySelector('text')?.textContent).not.toContain('\u0302');
    expect(svg.querySelector('text')?.textContent).toContain('ℝH×7');
    const subscriptRuns = Array.from(svg.querySelectorAll('[data-flowloom-script="subscript"]'));
    expect(subscriptRuns).toHaveLength(4);
    expect(subscriptRuns.map((span) => span.textContent)).toEqual(['t+1', 't', 't', 't+1']);
    expect(subscriptRuns.every((span) => Number(span.getAttribute('dx')) < 0)).toBe(true);
    expect(Array.from(svg.querySelectorAll('[data-flowloom-script="superscript"]')).map((span) => span.textContent))
      .toContain('H×7');
    const dimensionSuperscript = Array.from(svg.querySelectorAll('[data-flowloom-script="superscript"]'))
      .find((span) => span.textContent === 'H×7');
    expect(Number(dimensionSuperscript?.getAttribute('dx'))).toBeLessThan(0);
    const circumflex = svg.querySelector('[data-flowloom-math-accent="circumflex"]');
    expect(circumflex?.textContent).toBe('ˆ');
    expect(circumflex?.getAttribute('font-family')).toBe('Flowloom Publication Math');
    expect(circumflex?.getAttribute('dx')).not.toBeNull();
    expect(circumflex?.getAttribute('dy')).not.toBeNull();
    expect(svg.querySelector('[data-flowloom-script="subscript"]')?.getAttribute('dy')).not.toBeNull();
    const mathRuns = Array.from(svg.querySelectorAll('[data-flowloom-math="true"]'));
    expect(mathRuns.length).toBeGreaterThan(0);
    expect(mathRuns.every((span) => span.getAttribute('font-family') === 'Flowloom Publication Math')).toBe(true);
    expect(mathRuns.map((span) => span.textContent).join('')).toContain('θπτΔσβℝ→');
    expect(svg.textContent).toContain('ℝ');
  });
});
