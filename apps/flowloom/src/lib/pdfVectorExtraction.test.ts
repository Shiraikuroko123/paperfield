import { describe, expect, it } from 'vitest';
import { pdfOperatorListToSvg } from './pdfVectorExtraction';

const ops = {
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  fillStroke: 24,
  endPath: 28,
  beginText: 31,
  endText: 32,
  setFont: 37,
  setTextMatrix: 42,
  showText: 44,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  paintImageXObject: 85,
  constructPath: 91,
};

describe('PDF vector extraction', () => {
  it('maps constructPath coordinates from PDF space into editable SVG paths', () => {
    const result = pdfOperatorListToSvg({
      width: 200,
      height: 100,
      ops,
      fnArray: [ops.setFillRGBColor, ops.constructPath, ops.paintImageXObject],
      argsArray: [
        [1, 0.5, 0],
        [ops.fillStroke, [new Float32Array([0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 4])], null],
        ['image-1'],
      ],
    });

    expect(result.vectorCount).toBe(1);
    expect(result.imageCount).toBe(1);
    expect(result.svg).toContain('M0 100 L1 100 L1 99 L0 99 Z');
    expect(result.svg).toContain('rgb(255,128,0)');
    expect(result.warnings.some((warning) => warning.includes('raster'))).toBe(true);
  });

  it('adds text-layer items as editable SVG text primitives', () => {
    const result = pdfOperatorListToSvg({
      width: 400,
      height: 200,
      ops,
      fnArray: [ops.beginText, ops.showText, ops.endText],
      argsArray: [[], ['ignored-by-text-layer'], []],
      textItems: [{ str: 'Vision encoder', transform: [12, 0, 0, 12, 40, 80], height: 12 }],
    });

    expect(result.textCount).toBe(1);
    expect(result.svg).toContain('Vision encoder');
    expect(result.svg).toContain('y="120"');
  });

  it('reports visual-only pages when no vector or text primitive is available', () => {
    const result = pdfOperatorListToSvg({
      width: 100,
      height: 100,
      ops,
      fnArray: [ops.paintImageXObject],
      argsArray: [['bitmap']],
    });

    expect(result.vectorCount).toBe(0);
    expect(result.textCount).toBe(0);
    expect(result.warnings.join(' ')).toContain('No editable');
  });
});
