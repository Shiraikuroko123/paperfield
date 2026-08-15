import { BaseEdge, type EdgeProps } from '@xyflow/react';
import type { FlowEdge } from '../types';
import { routeScientificEdge } from '../lib/scientificRouting';

export function ScientificEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceHandleId,
  targetHandleId,
  data,
  label,
  markerStart,
  markerEnd,
  selected,
  style,
}: EdgeProps<FlowEdge>) {
  const edge = {
    id,
    source,
    target,
    sourceHandle: sourceHandleId,
    targetHandle: targetHandleId,
    data,
  } as FlowEdge;
  const route = routeScientificEdge(edge, { x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  const color = data?.color ?? '#4B5864';
  const width = data?.width ?? 2.4;
  const dash = data?.lineStyle === 'dashed' ? '8 6' : data?.lineStyle === 'dotted' ? '2 5' : undefined;
  const edgeLabel = String(data?.label ?? label ?? '').trim();
  const labelFontSize = Number(data?.labelFontSize ?? 22);
  const labelX = route.label.x + Number(data?.labelOffsetX ?? 0);
  const labelY = route.label.y + Number(data?.labelOffsetY ?? 0);

  return (
    <BaseEdge
      id={id}
      path={route.path}
      label={edgeLabel || undefined}
      labelX={labelX}
      labelY={labelY - labelFontSize * 0.35}
      labelStyle={{
        fill: color,
        fontSize: labelFontSize,
        fontWeight: 650,
      }}
      labelShowBg={Boolean(edgeLabel)}
      labelBgPadding={[6, 3]}
      labelBgBorderRadius={3}
      labelBgStyle={{ fill: '#ffffff', fillOpacity: 0.94 }}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={Math.max(20, width * 5)}
      style={{
        ...style,
        stroke: color,
        strokeWidth: selected ? width + 0.7 : width,
        strokeDasharray: dash,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    />
  );
}
