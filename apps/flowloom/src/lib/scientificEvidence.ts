import type { FlowNodeData, ScientificVisualVariant, ShapeKind } from '../types';

const RESULT_SHAPES = new Set<ShapeKind>([
  'scientific-mini-plot',
  'scientific-probability-bars',
  'scientific-uncertainty-band',
  'scientific-metric-panel',
  'scientific-ablation-table',
]);

const RESULT_VARIANTS = new Set<ScientificVisualVariant>([
  'success',
  'collision',
  'uncertain',
  'telemetry',
  'capability-safety',
  'prediction-error',
]);

export function isResultLikeScientificNode(data: FlowNodeData): boolean {
  return RESULT_SHAPES.has(data.kind)
    || (data.scientificVariant !== undefined && RESULT_VARIANTS.has(data.scientificVariant));
}

export function containsUnsupportedLiteralResult(data: FlowNodeData): boolean {
  if (!isResultLikeScientificNode(data)) return false;
  const text = `${data.label}\n${data.description ?? ''}`;
  return /(?:^|\s)(?:p|prob(?:ability)?|risk|uncertainty|u|accuracy|acc|score|error|loss)\s*[:=]\s*[+-]?(?:\d*\.\d+|\d+(?:\.\d+)?%)(?:\s|$)/i.test(text)
    || /(?:^|\s)(?:\d*\.\d+|\d+(?:\.\d+)?%)(?:\s|$)/.test(text);
}

export function hasCompleteScientificDataContract(data: FlowNodeData): boolean {
  const contract = data.scientificDataContract;
  const provenance = data.provenance;
  return data.scientificEvidence === 'data-bound'
    && Boolean(contract?.sourceName.trim())
    && Boolean(contract?.fields.length)
    && Boolean(provenance?.sourceData)
    && Boolean(provenance?.fields)
    && Boolean(provenance?.units && Object.keys(provenance.units).length);
}
