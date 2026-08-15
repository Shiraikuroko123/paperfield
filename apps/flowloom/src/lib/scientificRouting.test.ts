import { describe, expect, it } from 'vitest';
import { createFlowEdge } from './diagram';
import { routeScientificEdge } from './scientificRouting';

describe('scientific connector routing', () => {
  it('resolves explicit waypoints relative to the live source and target ports', () => {
    const edge = createFlowEdge('source', 'target');
    edge.sourceHandle = 'bottom';
    edge.targetHandle = 'bottom';
    edge.data = {
      ...edge.data!,
      routeWaypoints: [
        { origin: 'source', dx: 0, dy: 12 },
        { origin: 'target', dx: -72, dy: 90 },
        { origin: 'target', dx: -72, dy: 8 },
      ],
    };

    const first = routeScientificEdge(edge, { x: 84, y: 510 }, { x: 412, y: 432 });
    expect(first.points).toEqual([
      { x: 84, y: 510 },
      { x: 84, y: 522 },
      { x: 340, y: 522 },
      { x: 340, y: 440 },
      { x: 412, y: 432 },
    ]);

    const moved = routeScientificEdge(edge, { x: 104, y: 530 }, { x: 452, y: 462 });
    expect(moved.points).toEqual([
      { x: 104, y: 530 },
      { x: 104, y: 542 },
      { x: 380, y: 552 },
      { x: 380, y: 470 },
      { x: 452, y: 462 },
    ]);
  });

  it('offsets a precision anchor before resolving its relative waypoints', () => {
    const edge = createFlowEdge('baseline', 'tensor');
    edge.sourceHandle = 'right';
    edge.targetHandle = 'bottom';
    edge.data = {
      ...edge.data!,
      targetAnchorOffset: { dx: -84, dy: -76 },
      routeWaypoints: [
        { origin: 'source', dx: 35, dy: 0 },
        { origin: 'source', dx: 35, dy: 65 },
        { origin: 'target', dx: 0, dy: 96 },
      ],
    };

    const route = routeScientificEdge(edge, { x: 667, y: 505 }, { x: 1112.5, y: 550 });
    expect(route.points).toEqual([
      { x: 667, y: 505 },
      { x: 702, y: 505 },
      { x: 702, y: 570 },
      { x: 1028.5, y: 570 },
      { x: 1028.5, y: 474 },
    ]);
  });
});
