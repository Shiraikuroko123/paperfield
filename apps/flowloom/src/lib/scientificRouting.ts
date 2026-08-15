import type {
  ArrowHead,
  FlowEdge,
  LineStyle,
  ScientificConnectorSemantic,
  ScientificRouteAnchorOffset,
  ScientificRouteSide,
} from '../types';

export interface ScientificRoutePoint {
  x: number;
  y: number;
}

export interface ScientificRouteBox extends ScientificRoutePoint {
  width: number;
  height: number;
}

export interface ScientificEdgeRoute {
  path: string;
  label: ScientificRoutePoint;
  points: ScientificRoutePoint[];
}

export const SCIENTIFIC_CONNECTOR_LABELS: Record<ScientificConnectorSemantic, string> = {
  data: '数据流',
  control: '控制流',
  gradient: '梯度 / 监督',
  feedback: '反馈回路',
  optional: '可选路径',
  broadcast: '广播 / 分发',
  temporal: '时序推进',
};

export const SCIENTIFIC_CONNECTOR_STYLES: Record<ScientificConnectorSemantic, {
  color: string;
  width: number;
  lineStyle: LineStyle;
  arrowEnd: ArrowHead;
}> = {
  data: { color: '#4B5864', width: 2.4, lineStyle: 'solid', arrowEnd: 'closed' },
  control: { color: '#1F6680', width: 3.6, lineStyle: 'solid', arrowEnd: 'closed' },
  gradient: { color: '#7A4D86', width: 2.4, lineStyle: 'dashed', arrowEnd: 'open' },
  feedback: { color: '#A34F3C', width: 3.6, lineStyle: 'dashed', arrowEnd: 'closed' },
  optional: { color: '#6C737A', width: 2.4, lineStyle: 'dotted', arrowEnd: 'open' },
  broadcast: { color: '#2F6F5E', width: 3.2, lineStyle: 'solid', arrowEnd: 'closed' },
  temporal: { color: '#7A5A23', width: 3.2, lineStyle: 'solid', arrowEnd: 'closed' },
};

export function isFeedbackEdge(edge: FlowEdge): boolean {
  return edge.data?.scientificSemantic === 'feedback';
}

export function inferScientificRouteSide(
  source: ScientificRouteBox,
  target: ScientificRouteBox,
): ScientificRouteSide {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) < Math.abs(dy) * 0.55) return dx <= 0 ? 'left' : 'right';
  return dx <= 0 ? 'bottom-left' : 'bottom-right';
}

export function feedbackHandles(side: ScientificRouteSide): { sourceHandle: string; targetHandle: string } {
  if (side === 'left') return { sourceHandle: 'left', targetHandle: 'left' };
  if (side === 'right') return { sourceHandle: 'right', targetHandle: 'right' };
  if (side === 'bottom-right') return { sourceHandle: 'bottom', targetHandle: 'right' };
  return { sourceHandle: 'bottom', targetHandle: 'left' };
}

export function scientificConnectionPoint(
  box: ScientificRouteBox,
  handle: string | null | undefined,
  other: ScientificRouteBox,
): ScientificRoutePoint {
  const normalized = handle?.toLowerCase();
  if (normalized === 'top') return { x: box.x + box.width / 2, y: box.y };
  if (normalized === 'right') return { x: box.x + box.width, y: box.y + box.height / 2 };
  if (normalized === 'bottom') return { x: box.x + box.width / 2, y: box.y + box.height };
  if (normalized === 'left') return { x: box.x, y: box.y + box.height / 2 };
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const otherCenter = { x: other.x + other.width / 2, y: other.y + other.height / 2 };
  const dx = otherCenter.x - center.x;
  const dy = otherCenter.y - center.y;
  if (Math.abs(dx) > Math.abs(dy)) return { x: dx >= 0 ? box.x + box.width : box.x, y: center.y };
  return { x: center.x, y: dy >= 0 ? box.y + box.height : box.y };
}

function distance(left: ScientificRoutePoint, right: ScientificRoutePoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function roundedOrthogonalPath(points: ScientificRoutePoint[], radius = 10): string {
  if (points.length < 2) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = Math.min(radius, distance(previous, current) / 2);
    const outgoing = Math.min(radius, distance(current, next) / 2);
    const before = {
      x: current.x + (previous.x - current.x) * (incoming / Math.max(1, distance(previous, current))),
      y: current.y + (previous.y - current.y) * (incoming / Math.max(1, distance(previous, current))),
    };
    const after = {
      x: current.x + (next.x - current.x) * (outgoing / Math.max(1, distance(current, next))),
      y: current.y + (next.y - current.y) * (outgoing / Math.max(1, distance(current, next))),
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x} ${last.y}`;
}

function pointAtCubic(
  start: ScientificRoutePoint,
  controlOne: ScientificRoutePoint,
  controlTwo: ScientificRoutePoint,
  end: ScientificRoutePoint,
  t: number,
): ScientificRoutePoint {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlOne.x + 3 * inverse * t ** 2 * controlTwo.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlOne.y + 3 * inverse * t ** 2 * controlTwo.y + t ** 3 * end.y,
  };
}

function handleVector(handle: string | null | undefined, fallback: ScientificRoutePoint): ScientificRoutePoint {
  if (handle === 'top') return { x: 0, y: -1 };
  if (handle === 'right') return { x: 1, y: 0 };
  if (handle === 'bottom') return { x: 0, y: 1 };
  if (handle === 'left') return { x: -1, y: 0 };
  return fallback;
}

export function routeScientificEdge(
  edge: FlowEdge,
  source: ScientificRoutePoint,
  target: ScientificRoutePoint,
): ScientificEdgeRoute {
  const offsetPoint = (
    point: ScientificRoutePoint,
    offset: ScientificRouteAnchorOffset | undefined,
  ): ScientificRoutePoint => {
    const dx = Number(offset?.dx);
    const dy = Number(offset?.dy);
    return {
      x: point.x + (Number.isFinite(dx) ? dx : 0),
      y: point.y + (Number.isFinite(dy) ? dy : 0),
    };
  };
  const routedSource = offsetPoint(source, edge.data?.sourceAnchorOffset);
  const routedTarget = offsetPoint(target, edge.data?.targetAnchorOffset);
  source = routedSource;
  target = routedTarget;
  const midpoint = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  const configuredWaypoints = edge.data?.routeWaypoints;
  if (Array.isArray(configuredWaypoints) && configuredWaypoints.length) {
    const waypoints = configuredWaypoints.flatMap((waypoint) => {
      if (!waypoint || (waypoint.origin !== 'source' && waypoint.origin !== 'target')) return [];
      const dx = Number(waypoint.dx);
      const dy = Number(waypoint.dy);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [];
      const origin = waypoint.origin === 'source' ? source : target;
      return [{ x: origin.x + dx, y: origin.y + dy }];
    });
    if (waypoints.length) {
      const points = [source, ...waypoints, target];
      return { path: roundedOrthogonalPath(points), label: midpoint, points };
    }
  }
  if (isFeedbackEdge(edge)) {
    const side = edge.data?.routeSide ?? (target.x <= source.x ? 'bottom-left' : 'bottom-right');
    const offset = Math.max(12, Number(edge.data?.routeOffset ?? 36));
    let points: ScientificRoutePoint[];
    let label: ScientificRoutePoint;
    if (side === 'left' || side === 'right') {
      const gutterX = side === 'left' ? Math.min(source.x, target.x) - offset : Math.max(source.x, target.x) + offset;
      points = [source, { x: gutterX, y: source.y }, { x: gutterX, y: target.y }, target];
      label = { x: gutterX, y: (source.y + target.y) / 2 };
    } else {
      const gutterY = Math.max(source.y, target.y) + offset;
      // A deep bottom lane must not push the return lane outside the figure's
      // side margin. Keep the lateral gutter compact while allowing the
      // vertical offset to clear low-lying modules.
      const lateralOffset = Math.min(offset, 44);
      const gutterX = side === 'bottom-left'
        ? Math.min(source.x, target.x) - lateralOffset
        : Math.max(source.x, target.x) + lateralOffset;
      points = [source, { x: source.x, y: gutterY }, { x: gutterX, y: gutterY }, { x: gutterX, y: target.y }, target];
      label = { x: (source.x + gutterX) / 2, y: gutterY };
    }
    return { path: roundedOrthogonalPath(points, Math.min(12, offset / 3)), label, points };
  }

  if (edge.data?.routing === 'straight') {
    return { path: `M ${source.x} ${source.y} L ${target.x} ${target.y}`, label: midpoint, points: [source, target] };
  }
  if (edge.data?.routing === 'bezier') {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const controlDistance = Math.max(36, Math.hypot(dx, dy) * 0.34);
    const sourceDirection = handleVector(edge.sourceHandle, Math.abs(dx) >= Math.abs(dy)
      ? { x: Math.sign(dx) || 1, y: 0 }
      : { x: 0, y: Math.sign(dy) || 1 });
    const targetDirection = handleVector(edge.targetHandle, Math.abs(dx) >= Math.abs(dy)
      ? { x: -(Math.sign(dx) || 1), y: 0 }
      : { x: 0, y: -(Math.sign(dy) || 1) });
    const controlOne = { x: source.x + sourceDirection.x * controlDistance, y: source.y + sourceDirection.y * controlDistance };
    const controlTwo = { x: target.x + targetDirection.x * controlDistance, y: target.y + targetDirection.y * controlDistance };
    const points = Array.from({ length: 13 }, (_, index) => pointAtCubic(source, controlOne, controlTwo, target, index / 12));
    return {
      path: `M ${source.x} ${source.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${target.x} ${target.y}`,
      label: pointAtCubic(source, controlOne, controlTwo, target, 0.5),
      points,
    };
  }

  const sourceHandle = edge.sourceHandle?.toLowerCase();
  const targetHandle = edge.targetHandle?.toLowerCase();
  const verticalHandles = ['top', 'bottom'].includes(sourceHandle ?? '')
    && ['top', 'bottom'].includes(targetHandle ?? '');
  const horizontalHandles = ['left', 'right'].includes(sourceHandle ?? '')
    && ['left', 'right'].includes(targetHandle ?? '');
  const vertical = verticalHandles
    ? true
    : horizontalHandles
      ? false
      : Math.abs(target.y - source.y) >= Math.abs(target.x - source.x);
  const points = vertical
    ? [source, { x: source.x, y: midpoint.y }, { x: target.x, y: midpoint.y }, target]
    : [source, { x: midpoint.x, y: source.y }, { x: midpoint.x, y: target.y }, target];
  return { path: roundedOrthogonalPath(points), label: midpoint, points };
}
