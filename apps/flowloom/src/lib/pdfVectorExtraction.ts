/**
 * Small, dependency-free conversion layer for the subset of PDF.js drawing
 * operators that can be represented as editable SVG primitives.
 *
 * PDF.js deliberately exposes an operator list instead of an SVG exporter.
 * Keeping this adapter independent from PDF.js makes it possible to test the
 * geometry and the fidelity accounting with synthetic operator lists.
 */

export type PdfMatrix = [number, number, number, number, number, number];

export interface PdfTextItemLike {
  str?: unknown;
  transform?: ArrayLike<number>;
  width?: number;
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
}

export interface PdfOperatorExtractionInput {
  width: number;
  height: number;
  fnArray: readonly number[];
  argsArray: readonly unknown[][];
  ops: Record<string, number>;
  textItems?: readonly PdfTextItemLike[];
}

export interface PdfSvgExtraction {
  svg: string;
  vectorCount: number;
  textCount: number;
  imageCount: number;
  unsupportedCount: number;
  warnings: string[];
}

const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  closePath: 4,
} as const;

const IDENTITY: PdfMatrix = [1, 0, 0, 1, 0, 0];

function finite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function matrixMultiply(left: PdfMatrix, right: PdfMatrix): PdfMatrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function mapPoint(matrix: PdfMatrix, x: number, y: number): [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
}

function formatNumber(value: number): string {
  const rounded = Math.abs(value) < 0.00001 ? 0 : Number(value.toFixed(4));
  return String(rounded);
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function clampColor(value: unknown): number {
  const parsed = finite(value);
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 255 : parsed));
}

function rgb(red: unknown, green: unknown, blue: unknown): string {
  return `rgb(${Math.round(clampColor(red) * 255)},${Math.round(clampColor(green) * 255)},${Math.round(clampColor(blue) * 255)})`;
}

function gray(value: unknown): string {
  const channel = Math.round(clampColor(value) * 255);
  return `rgb(${channel},${channel},${channel})`;
}

function cmyk(cyan: unknown, magenta: unknown, yellow: unknown, black: unknown): string {
  const c = clampColor(cyan);
  const m = clampColor(magenta);
  const y = clampColor(yellow);
  const k = clampColor(black);
  return rgb(1 - Math.min(1, c + k), 1 - Math.min(1, m + k), 1 - Math.min(1, y + k));
}

function arrayValues(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((entry) => finite(entry));
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>, (entry) => finite(entry));
  return [];
}

function pathBufferValues(args: unknown[]): number[] {
  // PDF.js v4+ stores constructPath as [paintOp, [Float32Array], bbox].
  const nested = args[1];
  if (Array.isArray(nested)) return arrayValues(nested[0]);
  return arrayValues(nested);
}

function pathFromBuffer(buffer: readonly number[], matrix: PdfMatrix): string {
  const parts: string[] = [];
  let index = 0;
  while (index < buffer.length) {
    const opcode = buffer[index++];
    if (opcode === DRAW_OPS.moveTo || opcode === DRAW_OPS.lineTo) {
      if (index + 1 >= buffer.length) break;
      const [x, y] = mapPoint(matrix, buffer[index], buffer[index + 1]);
      index += 2;
      parts.push(`${opcode === DRAW_OPS.moveTo ? 'M' : 'L'}${formatNumber(x)} ${formatNumber(y)}`);
      continue;
    }
    if (opcode === DRAW_OPS.curveTo) {
      if (index + 5 >= buffer.length) break;
      const [x1, y1] = mapPoint(matrix, buffer[index], buffer[index + 1]);
      const [x2, y2] = mapPoint(matrix, buffer[index + 2], buffer[index + 3]);
      const [x, y] = mapPoint(matrix, buffer[index + 4], buffer[index + 5]);
      index += 6;
      parts.push(`C${formatNumber(x1)} ${formatNumber(y1)} ${formatNumber(x2)} ${formatNumber(y2)} ${formatNumber(x)} ${formatNumber(y)}`);
      continue;
    }
    if (opcode === DRAW_OPS.closePath) {
      parts.push('Z');
      continue;
    }
    // A malformed or future DrawOPS opcode should not stop the rest of the
    // page from being imported.
    break;
  }
  return parts.join(' ');
}

function pathPaint(paintOp: number, ops: Record<string, number>): { fill: string; stroke: string } {
  const stroke = new Set([
    ops.stroke,
    ops.closeStroke,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ].filter((value): value is number => Number.isFinite(value)));
  const fill = new Set([
    ops.fill,
    ops.eoFill,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
    ops.rawFillPath,
  ].filter((value): value is number => Number.isFinite(value)));
  return {
    fill: fill.has(paintOp) ? 'currentColor' : 'none',
    stroke: stroke.has(paintOp) ? 'currentColor' : 'none',
  };
}

function textSvg(item: PdfTextItemLike, width: number, height: number, fill: string, index: number): string | null {
  const text = String(item.str ?? '').replace(/\s+/g, ' ').trim();
  const transform = arrayValues(item.transform);
  if (!text || transform.length < 6) return null;
  const [a, b, , , e, f] = transform;
  const x = finite(e);
  const y = height - finite(f);
  const fontSize = Math.max(4, finite(item.height, Math.hypot(finite(a), finite(b)) || 10));
  const angle = Math.abs(finite(b)) > 0.01 || Math.abs(finite(a)) > 0.01
    ? -Math.atan2(finite(b), finite(a)) * 180 / Math.PI
    : 0;
  const rotate = Math.abs(angle) > 0.5 ? ` transform="rotate(${formatNumber(angle)} ${formatNumber(x)} ${formatNumber(y)})"` : '';
  const id = `pdf-text-${index + 1}`;
  return `<text id="${id}" x="${formatNumber(x)}" y="${formatNumber(y)}" font-family="sans-serif" font-size="${formatNumber(fontSize)}" fill="${escapeXml(fill)}" dominant-baseline="alphabetic"${rotate}>${escapeXml(text)}</text>`;
}

function isImageOperator(fn: number, ops: Record<string, number>): boolean {
  return [
    ops.paintImageXObject,
    ops.paintInlineImageXObject,
    ops.paintImageMaskXObject,
    ops.paintImageMaskXObjectGroup,
    ops.paintImageXObjectRepeat,
    ops.paintImageMaskXObjectRepeat,
    ops.paintSolidColorImageMask,
    ops.beginInlineImage,
  ].some((value) => Number.isFinite(value) && value === fn);
}

function makePathAttributes(
  style: { fill: string; stroke: string; lineWidth: number; lineCap: number; lineJoin: number; dash: string },
  paint: { fill: string; stroke: string },
): string {
  const fill = paint.fill === 'currentColor' ? style.fill : paint.fill;
  const stroke = paint.stroke === 'currentColor' ? style.stroke : paint.stroke;
  const attributes = [
    `fill="${escapeXml(fill)}"`,
    `stroke="${escapeXml(stroke)}"`,
    `stroke-width="${formatNumber(style.lineWidth)}"`,
    `stroke-linecap="${style.lineCap === 1 ? 'round' : style.lineCap === 2 ? 'square' : 'butt'}"`,
    `stroke-linejoin="${style.lineJoin === 1 ? 'round' : style.lineJoin === 2 ? 'bevel' : 'miter'}"`,
  ];
  if (style.dash) attributes.push(`stroke-dasharray="${style.dash}"`);
  return attributes.join(' ');
}

/** Convert a PDF.js operator list and text layer into a safe editable SVG. */
export function pdfOperatorListToSvg(input: PdfOperatorExtractionInput): PdfSvgExtraction {
  const width = Math.max(1, finite(input.width, 1));
  const height = Math.max(1, finite(input.height, 1));
  const flip: PdfMatrix = [1, 0, 0, -1, 0, height];
  let matrix: PdfMatrix = [...IDENTITY];
  const stack: Array<{ matrix: PdfMatrix; style: typeof style }> = [];
  const style = {
    fill: '#111827',
    stroke: '#111827',
    lineWidth: 1,
    lineCap: 0,
    lineJoin: 0,
    dash: '',
  };
  let pathParts: string[] = [];
  let vectorCount = 0;
  let imageCount = 0;
  let unsupportedCount = 0;
  const warnings: string[] = [];
  const body: string[] = [];

  const flushPath = (paintOp: number) => {
    if (pathParts.length === 0) return;
    const d = pathParts.join(' ');
    const paint = pathPaint(paintOp, input.ops);
    const svgMatrix = matrixMultiply(flip, matrix);
    // Path coordinates are transformed while parsing, so the matrix is only
    // used for the PDF-to-SVG Y-axis flip here.
    const transformed = pathFromBuffer([], svgMatrix);
    void transformed;
    body.push(`<path id="pdf-vector-${vectorCount + 1}" d="${escapeXml(d)}" ${makePathAttributes(style, paint)}/>`.replace('currentColor', style.fill));
    vectorCount += 1;
    pathParts = [];
  };

  // The path buffer is converted with the current PDF matrix and the page
  // flip. Keeping this in one helper avoids leaking PDF coordinates into SVG.
  const convertBuffer = (buffer: readonly number[]) => {
    const svgMatrix = matrixMultiply(flip, matrix);
    return pathFromBuffer(buffer, svgMatrix);
  };

  for (let index = 0; index < input.fnArray.length; index += 1) {
    const fn = input.fnArray[index];
    const args = input.argsArray[index] ?? [];
    if (fn === input.ops.save) {
      stack.push({ matrix: [...matrix], style: { ...style } });
      continue;
    }
    if (fn === input.ops.restore) {
      const previous = stack.pop();
      if (previous) {
        matrix = previous.matrix;
        Object.assign(style, previous.style);
      }
      continue;
    }
    if (fn === input.ops.transform) {
      const values = arrayValues(args[0]);
      if (values.length >= 6) matrix = matrixMultiply(matrix, values.slice(0, 6) as PdfMatrix);
      else unsupportedCount += 1;
      continue;
    }
    if (fn === input.ops.setLineWidth) {
      style.lineWidth = Math.max(0.1, finite(args[0], 1));
      continue;
    }
    if (fn === input.ops.setLineCap) {
      style.lineCap = Math.round(finite(args[0]));
      continue;
    }
    if (fn === input.ops.setLineJoin) {
      style.lineJoin = Math.round(finite(args[0]));
      continue;
    }
    if (fn === input.ops.setDash) {
      const dash = arrayValues(args[0]);
      style.dash = dash.length ? dash.map(formatNumber).join(' ') : '';
      continue;
    }
    if (fn === input.ops.setStrokeRGBColor || fn === input.ops.setStrokeColor) {
      const values = arrayValues(args[0]).length ? arrayValues(args[0]) : args.map(finite);
      if (values.length >= 3) style.stroke = rgb(values[0], values[1], values[2]);
      else unsupportedCount += 1;
      continue;
    }
    if (fn === input.ops.setFillRGBColor || fn === input.ops.setFillColor) {
      const values = arrayValues(args[0]).length ? arrayValues(args[0]) : args.map(finite);
      if (values.length >= 3) style.fill = rgb(values[0], values[1], values[2]);
      else unsupportedCount += 1;
      continue;
    }
    if (fn === input.ops.setStrokeGray) {
      style.stroke = gray(args[0]);
      continue;
    }
    if (fn === input.ops.setFillGray) {
      style.fill = gray(args[0]);
      continue;
    }
    if (fn === input.ops.setStrokeCMYKColor) {
      style.stroke = cmyk(args[0], args[1], args[2], args[3]);
      continue;
    }
    if (fn === input.ops.setFillCMYKColor) {
      style.fill = cmyk(args[0], args[1], args[2], args[3]);
      continue;
    }
    if (fn === input.ops.moveTo || fn === input.ops.lineTo) {
      const point = mapPoint(matrixMultiply(flip, matrix), finite(args[0]), finite(args[1]));
      pathParts.push(`${fn === input.ops.moveTo ? 'M' : 'L'}${formatNumber(point[0])} ${formatNumber(point[1])}`);
      continue;
    }
    if (fn === input.ops.curveTo) {
      const points = [
        mapPoint(matrixMultiply(flip, matrix), finite(args[0]), finite(args[1])),
        mapPoint(matrixMultiply(flip, matrix), finite(args[2]), finite(args[3])),
        mapPoint(matrixMultiply(flip, matrix), finite(args[4]), finite(args[5])),
      ];
      pathParts.push(`C${points.map((point) => `${formatNumber(point[0])} ${formatNumber(point[1])}`).join(' ')}`);
      continue;
    }
    if (fn === input.ops.closePath) {
      pathParts.push('Z');
      continue;
    }
    if (fn === input.ops.rectangle) {
      const x = finite(args[0]);
      const y = finite(args[1]);
      const w = finite(args[2]);
      const h = finite(args[3]);
      const points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        .map(([px, py]) => mapPoint(matrixMultiply(flip, matrix), px, py));
      pathParts.push(`M${formatNumber(points[0][0])} ${formatNumber(points[0][1])} L${formatNumber(points[1][0])} ${formatNumber(points[1][1])} L${formatNumber(points[2][0])} ${formatNumber(points[2][1])} L${formatNumber(points[3][0])} ${formatNumber(points[3][1])} Z`);
      continue;
    }
    if ([input.ops.stroke, input.ops.closeStroke, input.ops.fill, input.ops.eoFill, input.ops.fillStroke, input.ops.eoFillStroke, input.ops.closeFillStroke, input.ops.closeEOFillStroke, input.ops.endPath].includes(fn)) {
      flushPath(fn);
      continue;
    }
    if (fn === input.ops.constructPath) {
      const buffer = pathBufferValues(args);
      const paintOp = finite(args[0], input.ops.fill);
      const d = convertBuffer(buffer);
      if (d) {
        const paint = pathPaint(paintOp, input.ops);
        body.push(`<path id="pdf-vector-${vectorCount + 1}" d="${escapeXml(d)}" ${makePathAttributes(style, paint)}/>`);
        vectorCount += 1;
      }
      continue;
    }
    if (isImageOperator(fn, input.ops)) {
      imageCount += 1;
      continue;
    }
    if ([input.ops.clip, input.ops.eoClip, input.ops.shadingFill, input.ops.setGState, input.ops.paintFormXObjectBegin, input.ops.paintFormXObjectEnd].includes(fn)) {
      unsupportedCount += 1;
      continue;
    }
    // Text operators are represented by getTextContent below. Other operators
    // are retained in the fidelity report instead of being silently claimed.
    if (![input.ops.beginText, input.ops.endText, input.ops.setFont, input.ops.setTextMatrix, input.ops.showText, input.ops.showSpacedText, input.ops.nextLine, input.ops.moveText, input.ops.setLeading, input.ops.setLeadingMoveText, input.ops.setTextRise, input.ops.setHScale, input.ops.setCharSpacing, input.ops.setWordSpacing, input.ops.setTextRenderingMode].includes(fn)) {
      unsupportedCount += 1;
    }
  }
  flushPath(input.ops.stroke);

  const textItems = input.textItems ?? [];
  let textCount = 0;
  for (const [index, item] of textItems.entries()) {
    const element = textSvg(item, width, height, style.fill, index);
    if (!element) continue;
    body.push(element);
    textCount += 1;
  }

  if (imageCount > 0) warnings.push(`${imageCount} raster/image paint operations remain in the reference layer.`);
  if (unsupportedCount > 0) warnings.push(`${unsupportedCount} PDF operations use effects or constructs without a lossless SVG mapping.`);
  if (vectorCount === 0 && textCount === 0) warnings.push('No editable PDF vector or text primitives were found on this page.');
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}"><metadata>${escapeXml(JSON.stringify({ source: 'pdfjs-operator-list', version: 1 }))}</metadata>${body.join('')}</svg>`,
    vectorCount,
    textCount,
    imageCount,
    unsupportedCount,
    warnings,
  };
}

export function pdfTextItemsToPlainText(items: readonly PdfTextItemLike[]): string {
  return items
    .map((item) => String(item.str ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
