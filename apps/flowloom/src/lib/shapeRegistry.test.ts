import { describe, expect, it } from 'vitest';
import { SHAPE_KINDS } from '../types';
import { createFlowNode, findOpenGraphPosition, findOpenNodePosition, getFlowNodesBounds } from './diagram';
import {
  SHAPE_CATEGORY_LABELS,
  SHAPE_REGISTRY,
  VISIBLE_SHAPES,
  getShapeDefinition,
} from './shapeRegistry';

describe('shape registry', () => {
  it('defines every serialized shape kind exactly once', () => {
    const registeredKinds = SHAPE_REGISTRY.map((definition) => definition.kind);

    expect(new Set(registeredKinds).size).toBe(registeredKinds.length);
    expect(new Set(registeredKinds)).toEqual(new Set(SHAPE_KINDS));
    expect(VISIBLE_SHAPES).toHaveLength(135);
    expect(VISIBLE_SHAPES.filter((definition) => definition.category === 'scientific')).toHaveLength(38);
    expect(new Set(VISIBLE_SHAPES.map((definition) => definition.category))).toEqual(
      new Set(Object.keys(SHAPE_CATEGORY_LABELS)),
    );
  });

  it('provides usable geometry metadata and defaults for every shape', () => {
    for (const kind of SHAPE_KINDS) {
      const definition = getShapeDefinition(kind);
      const node = createFlowNode(kind, { x: 0, y: 0 });

      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.standardName.length).toBeGreaterThan(0);
      expect(definition.width).toBeGreaterThanOrEqual(definition.minWidth);
      expect(definition.height).toBeGreaterThanOrEqual(definition.minHeight);
      expect(node.data.kind).toBe(kind);
      expect(node.data.textAlign).toBe('center');
      expect(node.data.verticalAlign).toBe('middle');
    }
  });

  it('avoids stacking repeated click-created shapes on top of existing nodes', () => {
    const existing = createFlowNode('process', { x: 0, y: 0 });
    const position = findOpenNodePosition([existing], 'process', { x: 88, y: 36 });

    expect(position).not.toEqual({ x: 0, y: 0 });
  });

  it('places an inserted graph as one block outside occupied canvas bounds', () => {
    const existing = createFlowNode('process', { x: 0, y: 0 }, 'Existing', {
      id: 'existing',
      style: { width: 176, height: 72 },
    });
    const position = findOpenGraphPosition([existing], { width: 640, height: 360 }, { x: 88, y: 36 });

    const separated = position.x >= 224
      || position.x + 640 <= -48
      || position.y >= 120
      || position.y + 360 <= -48;
    expect(separated).toBe(true);
  });

  it('computes bounds for child nodes in absolute canvas coordinates', () => {
    const parent = createFlowNode('group', { x: 100, y: 80 }, 'Group', {
      id: 'group',
      style: { width: 300, height: 220 },
    });
    const child = createFlowNode('process', { x: 260, y: 190 }, 'Child', {
      id: 'child',
      parentId: 'group',
      style: { width: 100, height: 60 },
    });

    expect(getFlowNodesBounds([parent, child])).toEqual({ x: 100, y: 80, width: 360, height: 250 });
  });
});
