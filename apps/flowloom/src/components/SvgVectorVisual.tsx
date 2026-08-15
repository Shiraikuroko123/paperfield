import { createElement, memo } from 'react';
import type { FlowNodeData } from '../types';

const attributeNames: Record<string, string> = {
  'clip-rule': 'clipRule',
  'dominant-baseline': 'dominantBaseline',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-opacity': 'strokeOpacity',
  'text-anchor': 'textAnchor',
};

function SvgVectorVisualComponent({ data }: { data: FlowNodeData }) {
  const vector = data.vector;
  if (!vector) return null;
  const attributes = Object.fromEntries(
    Object.entries(vector.attributes).map(([name, value]) => [attributeNames[name] ?? name, value]),
  );
  const paint = vector.tag === 'text'
    ? { fill: data.textColor, stroke: data.stroke === 'none' ? undefined : data.stroke }
    : { fill: data.fill, stroke: data.stroke };
  const typography = vector.tag === 'text' ? {
    fontSize: data.fontSize,
    fontWeight: data.fontWeight,
    textAnchor: data.textAlign === 'center' ? 'middle' : data.textAlign === 'right' ? 'end' : 'start',
    dominantBaseline: data.verticalAlign === 'middle' ? 'central' : data.verticalAlign === 'top' ? 'hanging' : 'auto',
  } : {};
  const content = vector.tag === 'text' ? data.label : undefined;
  return (
    <svg
      className="flow-node__vector"
      viewBox={vector.viewBox.join(' ')}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {createElement(vector.tag, {
        ...attributes,
        ...paint,
        ...typography,
        strokeWidth: data.borderWidth,
        vectorEffect: 'non-scaling-stroke',
      }, content)}
    </svg>
  );
}

export const SvgVectorVisual = memo(SvgVectorVisualComponent);
