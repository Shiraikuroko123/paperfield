import { describe, expect, it } from 'vitest';
import { createFlowNode } from './diagram';
import { layoutScientificImageLabel } from './scientificNodeLayout';

function schematicImage(label: string, fontSize: number) {
  const node = createFlowNode('image', { x: 0, y: 0 }, label);
  node.data.scientificEvidence = 'schematic';
  node.data.fontSize = fontSize;
  return node.data;
}

describe('scientific image label layout', () => {
  it('wraps semantic candidate labels without dropping below paper type size', () => {
    const layout = layoutScientificImageLabel(schematicImage('k=3 occluded', 26.458), 134, 82);

    expect(layout?.lines).toEqual(['k=3', 'occluded']);
    expect(layout?.fontSize).toBeGreaterThanOrEqual(26.45);
    expect(layout && layout.y + layout.height).toBeLessThanOrEqual(79);
  });

  it('keeps presentation candidate labels above the nine-point export floor', () => {
    const layout = layoutScientificImageLabel(schematicImage('k=3 occluded', 38.806), 166, 108);

    expect(layout?.lines).toEqual(['k=3', 'occluded']);
    expect(layout?.fontSize).toBeGreaterThanOrEqual(31.75);
    expect(layout && layout.y + layout.height).toBeLessThanOrEqual(105);
  });
});
