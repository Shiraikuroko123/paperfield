import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FlowEdge, FlowNode, ScientificFigureSpec } from '../types';
import { ShapeVisual } from '../components/ShapeVisual';
import { estimateSvgTextWidth } from './diagram';
import { mmToPx, PUBLICATION_TYPOGRAPHY } from './scientific';
import { routeScientificEdge, scientificConnectionPoint } from './scientificRouting';
import {
  isScientificShapeKind,
  layoutScientificImageLabel,
  layoutScientificNodeContent,
  layoutSchematicNodeContent,
  scientificNodeTextPaddingX,
} from './scientificNodeLayout';

const PUBLICATION_PDF_FONT_FAMILY = 'Flowloom Publication Sans';
const PUBLICATION_MATH_FONT_FAMILY = 'Flowloom Publication Math';
const PUBLICATION_PDF_FONTS = [
  { family: PUBLICATION_PDF_FONT_FAMILY, fileName: 'NotoSansSC-Regular.ttf', weight: 400 },
  { family: PUBLICATION_PDF_FONT_FAMILY, fileName: 'NotoSansSC-Bold.ttf', weight: 700 },
  { family: PUBLICATION_MATH_FONT_FAMILY, fileName: 'NotoSansMath-Regular.ttf', weight: 400 },
] as const;
const PUBLICATION_RASTER_FONTS = [
  { family: PUBLICATION_PDF_FONT_FAMILY, fileName: 'NotoSansSC-Evidence-Regular.ttf', weight: 400 },
  { family: PUBLICATION_PDF_FONT_FAMILY, fileName: 'NotoSansSC-Evidence-Bold.ttf', weight: 700 },
  { family: PUBLICATION_MATH_FONT_FAMILY, fileName: 'NotoSansMath-Regular.ttf', weight: 400 },
] as const;

const PDF_SUBSCRIPT_GLYPHS: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
  'ₐ': 'a',
  'ₑ': 'e',
  'ₕ': 'h',
  'ᵢ': 'i',
  'ⱼ': 'j',
  'ₖ': 'k',
  'ₗ': 'l',
  'ₘ': 'm',
  'ₙ': 'n',
  'ₒ': 'o',
  'ₚ': 'p',
  'ᵣ': 'r',
  'ₛ': 's',
  'ₜ': 't',
  'ᵤ': 'u',
  'ᵥ': 'v',
  'ₓ': 'x',
};

const PDF_SUPERSCRIPT_GLYPHS: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
  'ᵃ': 'a',
  'ᵇ': 'b',
  'ᶜ': 'c',
  'ᵈ': 'd',
  'ᵉ': 'e',
  'ᶠ': 'f',
  'ᵍ': 'g',
  'ʰ': 'h',
  'ⁱ': 'i',
  'ʲ': 'j',
  'ᵏ': 'k',
  'ˡ': 'l',
  'ᵐ': 'm',
  'ⁿ': 'n',
  'ᵒ': 'o',
  'ᵖ': 'p',
  'ʳ': 'r',
  'ˢ': 's',
  'ᵗ': 't',
  'ᵘ': 'u',
  'ᵛ': 'v',
  'ʷ': 'w',
  'ˣ': '×',
  'ʸ': 'y',
  'ᶻ': 'z',
  'ᴴ': 'H',
};

let publicationFontData: Promise<Map<string, string>> | undefined;
let publicationRasterFontData: Promise<Map<string, string>> | undefined;

interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function numeric(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function linearSrgb(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function channelHex(value: number): string {
  return Math.round(linearSrgb(value) * 255).toString(16).padStart(2, '0');
}

function portableColor(value: string): string {
  const color = value.trim();
  if (!color || color === 'none' || color === 'transparent' || !color.toLowerCase().startsWith('oklch(')) return color || 'none';
  const match = color.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i);
  if (!match) return color;
  const lightness = Number(match[1]) > 1 ? Number(match[1]) / 100 : Number(match[1]);
  const chroma = Number(match[2]);
  const hue = Number(match[3]) * Math.PI / 180;
  const alphaValue = match[4]
    ? Number.parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1)
    : 1;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const hex = `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
  return alphaValue < 1 ? `${hex}${Math.round(Math.max(0, Math.min(1, alphaValue)) * 255).toString(16).padStart(2, '0')}` : hex;
}

function absolutePosition(node: FlowNode, byId: Map<string, FlowNode>): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

function effectiveZIndex(node: FlowNode, byId: Map<string, FlowNode>): number {
  let value = node.zIndex ?? 0;
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    value += parent.zIndex ?? 0;
    parentId = parent.parentId;
  }
  return value;
}

function nodeBox(node: FlowNode, byId: Map<string, FlowNode>, origin: { x: number; y: number }): NodeBox {
  const position = absolutePosition(node, byId);
  return {
    x: position.x - origin.x,
    y: position.y - origin.y,
    width: numeric(node.style?.width, node.measured?.width ?? node.width ?? 1),
    height: numeric(node.style?.height, node.measured?.height ?? node.height ?? 1),
  };
}

function transformForBox(box: NodeBox, rotation: number): string {
  return rotation
    ? ` transform="rotate(${rotation} ${box.x + box.width / 2} ${box.y + box.height / 2})"`
    : '';
}

function serializeAttributes(attributes: Record<string, string | number>): string {
  return Object.entries(attributes)
    .filter(([name]) => !name.toLowerCase().startsWith('on'))
    .map(([name, value]) => `${escapeXml(name)}="${escapeXml(value)}"`)
    .join(' ');
}

function fontDataUrl(fileName: string): string {
  return new URL(`fonts/${fileName}`, document.baseURI).href;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Publication font could not be read.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const separator = result.indexOf(',');
      if (separator < 0) reject(new Error('Publication font data is invalid.'));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function loadPublicationFontData(): Promise<Map<string, string>> {
  if (!publicationFontData) {
    publicationFontData = Promise.all(PUBLICATION_PDF_FONTS.map(async ({ fileName }) => {
      const response = await fetch(fontDataUrl(fileName));
      if (!response.ok) throw new Error(`Publication font failed to load (${response.status}).`);
      return [fileName, await blobToBase64(await response.blob())] as const;
    })).then((entries) => new Map(entries));
  }
  return publicationFontData;
}

async function loadPublicationRasterFontData(): Promise<Map<string, string>> {
  if (!publicationRasterFontData) {
    publicationRasterFontData = Promise.all(PUBLICATION_RASTER_FONTS.map(async ({ fileName }) => {
      const response = await fetch(fontDataUrl(fileName));
      if (!response.ok) throw new Error(`Publication raster font failed to load (${response.status}).`);
      return [fileName, await blobToBase64(await response.blob())] as const;
    })).then((entries) => new Map(entries));
  }
  return publicationRasterFontData;
}

export interface PublicationPdfFontTarget {
  addFileToVFS(fileName: string, data: string): unknown;
  addFont(
    postScriptName: string,
    id: string,
    fontStyle: string,
    fontWeight?: string | number,
    encoding?: 'Identity-H',
  ): unknown;
}

export async function registerPublicationPdfFonts(pdf: PublicationPdfFontTarget): Promise<void> {
  const fonts = await loadPublicationFontData();
  for (const { family, fileName, weight } of PUBLICATION_PDF_FONTS) {
    const data = fonts.get(fileName);
    if (!data) throw new Error(`Publication font is missing: ${fileName}`);
    pdf.addFileToVFS(fileName, data);
    pdf.addFont(fileName, family, 'normal', weight, 'Identity-H');
  }
}

function numericAttribute(element: Element, name: string): number | undefined {
  const value = Number.parseFloat(element.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : undefined;
}

type PdfScriptKind = 'normal' | 'subscript' | 'superscript';

interface PdfTextRun {
  kind: PdfScriptKind;
  value: string;
}

function pdfTextRuns(value: string): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (const character of Array.from(value)) {
    const subscript = PDF_SUBSCRIPT_GLYPHS[character];
    const superscript = PDF_SUPERSCRIPT_GLYPHS[character];
    const kind: PdfScriptKind = subscript !== undefined
      ? 'subscript'
      : superscript !== undefined
        ? 'superscript'
        : 'normal';
    const mapped = subscript ?? superscript ?? character;
    const current = runs.at(-1);
    if (current?.kind === kind) current.value += mapped;
    else runs.push({ kind, value: mapped });
  }
  return runs;
}

function replaceCombiningCircumflexForPublication(element: SVGTextElement): void {
  const textNodes: Text[] = [];
  const collectTextNodes = (parent: Node) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === 3) textNodes.push(child as Text);
      else collectTextNodes(child);
    });
  };
  collectTextNodes(element);

  const fontSize = numericAttribute(element, 'font-size') ?? PUBLICATION_TYPOGRAPHY.moduleLabel;
  const accentFontSize = fontSize * 0.58;
  const accentShift = fontSize * 0.28;
  for (const textNode of textNodes) {
    const accentIndex = textNode.data.indexOf('\u0302');
    if (accentIndex <= 0) continue;
    const beforeAccent = textNode.data.slice(0, accentIndex);
    const base = Array.from(beforeAccent).at(-1) ?? '';
    const remainder = textNode.data.slice(accentIndex + 1);
    const baseWidth = estimateSvgTextWidth(base, fontSize);
    const accentWidth = estimateSvgTextWidth('ˆ', accentFontSize);
    const fragment = textNode.ownerDocument.createDocumentFragment();
    fragment.appendChild(textNode.ownerDocument.createTextNode(beforeAccent));

    const accent = textNode.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    accent.textContent = 'ˆ';
    accent.setAttribute('data-flowloom-math-accent', 'circumflex');
    accent.setAttribute('font-family', PUBLICATION_MATH_FONT_FAMILY);
    accent.setAttribute('font-size', String(accentFontSize));
    accent.setAttribute('font-weight', '400');
    accent.setAttribute('dx', String(-(baseWidth + accentWidth) / 2));
    accent.setAttribute('dy', String(-accentShift));
    fragment.appendChild(accent);

    const restore = textNode.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    restore.textContent = remainder;
    restore.setAttribute('dx', String((baseWidth - accentWidth) / 2));
    restore.setAttribute('dy', String(accentShift));
    fragment.appendChild(restore);
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

function replaceUnicodeScriptsForPdf(element: SVGTextElement): void {
  const textNodes: Text[] = [];
  const collectTextNodes = (parent: Node) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === 3) textNodes.push(child as Text);
      else collectTextNodes(child);
    });
  };
  collectTextNodes(element);

  const fontSize = numericAttribute(element, 'font-size') ?? PUBLICATION_TYPOGRAPHY.moduleLabel;
  const scriptFontSize = fontSize * 0.72;
  const baselineOffset = fontSize * 0.22;
  for (const textNode of textNodes) {
    const runs = pdfTextRuns(textNode.data);
    if (runs.every((run) => run.kind === 'normal')) continue;
    const fragment = textNode.ownerDocument.createDocumentFragment();
    let baseline = 0;
    for (const [index, run] of runs.entries()) {
      const targetBaseline = run.kind === 'subscript'
        ? baselineOffset
        : run.kind === 'superscript'
          ? -baselineOffset
          : 0;
      const span = textNode.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.textContent = run.value;
      if (run.kind !== 'normal') {
        span.setAttribute('data-flowloom-script', run.kind);
        span.setAttribute('font-family', PUBLICATION_MATH_FONT_FAMILY);
        span.setAttribute('font-weight', '400');
        span.setAttribute('font-size', String(scriptFontSize));
      }
      const precedingElement = textNode.previousSibling instanceof Element
        ? textNode.previousSibling
        : textNode.parentElement?.previousSibling instanceof Element
          ? textNode.parentElement.previousSibling
          : undefined;
      const followsBaseGlyph = index > 0
        && runs[index - 1].kind === 'normal'
        && /[\p{L}\p{N})\]]$/u.test(runs[index - 1].value);
      const followsMathGlyph = index === 0
        && run.kind === 'superscript'
        && precedingElement?.getAttribute('data-flowloom-math') === 'true';
      const followsCircumflex = index === 0
        && precedingElement?.getAttribute('data-flowloom-math-accent') === 'circumflex';
      const horizontalTighten = followsMathGlyph
        ? fontSize * 0.18
        : followsBaseGlyph || followsCircumflex
          ? fontSize * 0.12
          : 0;
      if (horizontalTighten) span.setAttribute('dx', String(-horizontalTighten));
      if (targetBaseline !== baseline) span.setAttribute('dy', String(targetBaseline - baseline));
      fragment.appendChild(span);
      baseline = targetBaseline;
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

function isPublicationMathCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (codePoint >= 0x0370 && codePoint <= 0x03ff)
    || (codePoint >= 0x2100 && codePoint <= 0x214f)
    || (codePoint >= 0x2190 && codePoint <= 0x22ff);
}

function wrapPublicationMathGlyphs(element: SVGTextElement): void {
  const textNodes: Text[] = [];
  const collectTextNodes = (parent: Node) => {
    parent.childNodes.forEach((child) => {
      if (child.nodeType === 3) textNodes.push(child as Text);
      else collectTextNodes(child);
    });
  };
  collectTextNodes(element);

  for (const textNode of textNodes) {
    const runs: Array<{ math: boolean; value: string }> = [];
    for (const character of Array.from(textNode.data)) {
      const math = isPublicationMathCharacter(character);
      const current = runs.at(-1);
      if (current?.math === math) current.value += character;
      else runs.push({ math, value: character });
    }
    if (!runs.some((run) => run.math)) continue;

    const fragment = textNode.ownerDocument.createDocumentFragment();
    for (const run of runs) {
      if (!run.math) {
        fragment.appendChild(textNode.ownerDocument.createTextNode(run.value));
        continue;
      }
      const span = textNode.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.textContent = run.value;
      span.setAttribute('data-flowloom-math', 'true');
      span.setAttribute('font-family', PUBLICATION_MATH_FONT_FAMILY);
      span.setAttribute('font-weight', '400');
      fragment.appendChild(span);
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

export function preparePublicationSvgForPdf(
  svg: SVGSVGElement,
  _figure: ScientificFigureSpec,
): void {
  svg.querySelectorAll<SVGElement>('[vector-effect="non-scaling-stroke"]').forEach((element) => {
    element.removeAttribute('vector-effect');
  });
  svg.querySelectorAll<SVGTextElement>('text').forEach((element) => {
    const weight = numericAttribute(element, 'font-weight') ?? 400;
    element.setAttribute('font-family', PUBLICATION_PDF_FONT_FAMILY);
    element.setAttribute('font-weight', weight >= 600 ? '700' : '400');
    replaceCombiningCircumflexForPublication(element);
    wrapPublicationMathGlyphs(element);
    replaceUnicodeScriptsForPdf(element);
  });
}

export async function preparePublicationSvgForRaster(
  svg: SVGSVGElement,
  figure: ScientificFigureSpec,
): Promise<void> {
  preparePublicationSvgForPdf(svg, figure);
  const fontData = await loadPublicationRasterFontData();
  const rules = PUBLICATION_RASTER_FONTS.map(({ family, fileName, weight }) => {
    const data = fontData.get(fileName);
    if (!data) throw new Error(`Publication raster font is missing: ${fileName}`);
    return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${data}) format('truetype');font-style:normal;font-weight:${weight};}`;
  }).join('');
  const style = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.setAttribute('data-flowloom-publication-fonts', 'true');
  style.textContent = rules;
  svg.insertBefore(style, svg.firstChild);
}

function serializeNodeText(node: FlowNode, box: NodeBox): string {
  if (!node.data.label.trim() || node.data.kind === 'vector' || node.data.kind === 'image' || node.data.textColor === 'transparent') return '';
  const fontSize = node.data.fontSize;
  const textLayout = layoutSchematicNodeContent(node.data, box.width, box.height);
  const lines = textLayout.labelLines;
  const lineHeight = textLayout.labelLineHeight;
  const isSchematicFrame = node.data.schematicRole === 'frame' || node.data.schematicRole === 'phase';
  const textAnchor = isSchematicFrame || node.data.textAlign === 'left' ? 'start' : node.data.textAlign === 'right' ? 'end' : 'middle';
  const horizontalPadding = scientificNodeTextPaddingX(node.data);
  const x = isSchematicFrame || node.data.textAlign === 'left'
    ? box.x + horizontalPadding
    : node.data.textAlign === 'right'
      ? box.x + box.width - horizontalPadding
      : box.x + box.width / 2;
  const startY = box.y + textLayout.labelStartY;
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`).join('');
  const label = `<text fill="${escapeXml(portableColor(node.data.textColor))}" font-family="Segoe UI, Microsoft YaHei UI, Arial, sans-serif" font-size="${fontSize}" font-weight="${node.data.fontWeight}" text-anchor="${textAnchor}">${tspans}</text>`;
  if (!node.data.description?.trim()) return label;
  const descriptionFontSize = textLayout.descriptionFontSize;
  const descriptionLines = textLayout.descriptionLines;
  const descriptionLineHeight = textLayout.descriptionLineHeight;
  const descriptionY = box.y + textLayout.descriptionStartY;
  const descriptionTspans = descriptionLines.map((line, index) => `<tspan x="${x}" y="${descriptionY + index * descriptionLineHeight}">${escapeXml(line)}</tspan>`).join('');
  return `${label}<text fill="${escapeXml(portableColor(node.data.textColor))}" fill-opacity="0.82" font-family="Segoe UI, Microsoft YaHei UI, Arial, sans-serif" font-size="${descriptionFontSize}" text-anchor="${textAnchor}">${descriptionTspans}</text>`;
}

function serializeScientificImageLabel(node: FlowNode, box: NodeBox): string {
  const label = node.data.label.trim();
  const layout = layoutScientificImageLabel(node.data, box.width, box.height);
  if (!layout || !label) return '';
  const x = box.x + layout.x;
  const y = box.y + layout.y;
  const tspans = layout.lines.map((line, index) => (
    `<tspan x="${x + layout.paddingX}" y="${box.y + layout.baseline + index * layout.lineHeight}">${escapeXml(line)}</tspan>`
  )).join('');
  return `<g data-flowloom-image-label="true"><rect data-flowloom-image-label-bg="true" x="${x}" y="${y}" width="${layout.width}" height="${layout.height}" rx="2" fill="#17232d" fill-opacity="0.9"/><text data-flowloom-image-label-text="true" fill="#ffffff" font-family="Segoe UI, Microsoft YaHei UI, Arial, sans-serif" font-size="${layout.fontSize}" font-weight="${node.data.fontWeight}" text-anchor="start">${tspans}</text></g>`;
}

function serializeVectorNode(node: FlowNode, box: NodeBox): string {
  const vector = node.data.vector;
  if (!vector) return '';
  const attributes = { ...vector.attributes };
  attributes.fill = portableColor(vector.tag === 'text' ? node.data.textColor : node.data.fill);
  attributes.stroke = portableColor(node.data.stroke);
  attributes['stroke-width'] = node.data.borderWidth;
  attributes['vector-effect'] = 'non-scaling-stroke';
  if (vector.tag === 'text') {
    attributes['font-size'] = node.data.fontSize;
    attributes['font-weight'] = node.data.fontWeight;
    attributes['text-anchor'] = node.data.textAlign === 'center' ? 'middle' : node.data.textAlign === 'right' ? 'end' : 'start';
    attributes['dominant-baseline'] = node.data.verticalAlign === 'middle' ? 'central' : node.data.verticalAlign === 'top' ? 'hanging' : 'auto';
  }
  const content = vector.tag === 'text' ? escapeXml(node.data.label) : '';
  const primitive = `<${vector.tag} ${serializeAttributes(attributes)}>${content}</${vector.tag}>`;
  return `<g opacity="${node.data.opacity}"${transformForBox(box, node.data.rotation ?? 0)}><svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="${vector.viewBox.join(' ')}" preserveAspectRatio="none" overflow="visible">${primitive}</svg></g>`;
}

function serializeShapeNode(node: FlowNode, box: NodeBox): string {
  if (node.data.kind === 'image') {
    if (!node.data.imageUrl) return '';
    const clipId = `image-clip-${node.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const radius = Math.max(0, node.data.radius ?? 0);
    const stroke = portableColor(node.data.stroke);
    const preserveAspectRatio = node.data.imageFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet';
    const border = !['none', 'transparent'].includes(stroke) && node.data.borderWidth > 0
      ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${radius}" fill="none" stroke="${stroke}" stroke-width="${node.data.borderWidth}" vector-effect="non-scaling-stroke"/>`
      : '';
    const label = serializeScientificImageLabel(node, box);
    return `<g opacity="${node.data.opacity}"${transformForBox(box, node.data.rotation ?? 0)}><defs><clipPath id="${clipId}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${radius}"/></clipPath></defs><image x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" href="${escapeXml(node.data.imageUrl)}" preserveAspectRatio="${preserveAspectRatio}" clip-path="url(#${clipId})"/>${border}${label}</g>`;
  }
  const fill = portableColor(node.data.fill);
  const stroke = portableColor(node.data.stroke);
  const visibleGeometry = !['none', 'transparent'].includes(fill) || !['none', 'transparent'].includes(stroke);
  const scientificLayout = isScientificShapeKind(node.data.kind)
    ? layoutScientificNodeContent(node.data, box.width, box.height)
    : undefined;
  let shape = '';
  if (visibleGeometry) {
    const markup = renderToStaticMarkup(createElement(ShapeVisual, {
      kind: node.data.kind,
      fill,
      stroke,
      strokeWidth: node.data.borderWidth,
      radius: node.data.radius,
      variant: node.data.scientificVariant,
    }));
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const root = parsed.documentElement;
    if (!parsed.querySelector('parsererror')) {
      root.setAttribute('x', String(box.x));
      root.setAttribute('y', String(box.y));
      root.setAttribute('width', String(box.width));
      root.setAttribute('height', String(scientificLayout?.visualHeight ?? box.height));
      root.removeAttribute('class');
      root.removeAttribute('aria-hidden');
      root.removeAttribute('focusable');
      shape = new XMLSerializer().serializeToString(root);
    }
  }
  const text = serializeNodeText(node, box);
  if (!shape && !text) return '';
  return `<g opacity="${node.data.opacity}"${transformForBox(box, node.data.rotation ?? 0)}>${shape}${text}</g>`;
}

function serializeEdges(edges: FlowEdge[], boxes: Map<string, NodeBox>): string {
  const values: string[] = [];
  for (const edge of edges) {
    if (edge.hidden) continue;
    const sourceBox = boxes.get(edge.source);
    const targetBox = boxes.get(edge.target);
    if (!sourceBox || !targetBox) continue;
    const source = scientificConnectionPoint(sourceBox, edge.sourceHandle, targetBox);
    const target = scientificConnectionPoint(targetBox, edge.targetHandle, sourceBox);
    const color = portableColor(edge.data?.color ?? '#555555');
    const width = edge.data?.width ?? 1.75;
    const dash = edge.data?.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : edge.data?.lineStyle === 'dotted' ? ' stroke-dasharray="2 5"' : '';
    const id = edge.id.replace(/[^a-zA-Z0-9_-]/g, '-');
    const markerStart = edge.data?.arrowStart && edge.data.arrowStart !== 'none' ? ` marker-start="url(#marker-start-${id})"` : '';
    const markerEnd = edge.data?.arrowEnd && edge.data.arrowEnd !== 'none' ? ` marker-end="url(#marker-end-${id})"` : '';
    const markers = [
      edge.data?.arrowStart && edge.data.arrowStart !== 'none' ? `<marker id="marker-start-${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 10 1 L 1 5 L 10 9${edge.data.arrowStart === 'closed' ? ' Z' : ''}" fill="${edge.data.arrowStart === 'closed' ? color : 'none'}" stroke="${color}" stroke-width="1.2"/></marker>` : '',
      edge.data?.arrowEnd && edge.data.arrowEnd !== 'none' ? `<marker id="marker-end-${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9${edge.data.arrowEnd === 'closed' ? ' Z' : ''}" fill="${edge.data.arrowEnd === 'closed' ? color : 'none'}" stroke="${color}" stroke-width="1.2"/></marker>` : '',
    ].join('');
    const route = routeScientificEdge(edge, source, target);
    const label = String(edge.data?.label ?? edge.label ?? '').trim();
    const labelFontSize = numeric(edge.data?.labelFontSize, PUBLICATION_TYPOGRAPHY.edgeLabel);
    const labelX = route.label.x + numeric(edge.data?.labelOffsetX, 0);
    const labelY = route.label.y + numeric(edge.data?.labelOffsetY, 0);
    const labelBaseline = labelY - labelFontSize * 0.35;
    const labelPaddingX = Math.max(5, labelFontSize * 0.28);
    const labelPaddingY = Math.max(2, labelFontSize * 0.14);
    const labelWidth = estimateSvgTextWidth(label, labelFontSize) + labelPaddingX * 2;
    const labelHeight = labelFontSize * 1.08 + labelPaddingY * 2;
    const labelMarkup = label
      ? `<g data-flowloom-edge-label="true"><rect data-flowloom-edge-label-bg="true" x="${labelX - labelWidth / 2}" y="${labelBaseline - labelFontSize * 0.88 - labelPaddingY}" width="${labelWidth}" height="${labelHeight}" rx="3" fill="#ffffff" fill-opacity="0.96"/><text x="${labelX}" y="${labelBaseline}" text-anchor="middle" fill="${color}" font-family="Segoe UI, Microsoft YaHei UI, Arial, sans-serif" font-size="${labelFontSize}" font-weight="650">${escapeXml(label)}</text></g>`
      : '';
    const semantic = edge.data?.scientificSemantic ? ` data-connector-semantic="${escapeXml(edge.data.scientificSemantic)}"` : '';
    values.push(`<g data-flowloom-edge-id="${escapeXml(edge.id)}"${semantic}><defs>${markers}</defs><path d="${route.path}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash}${markerStart}${markerEnd}/>${labelMarkup}</g>`);
  }
  return values.join('');
}

export function serializePublicationSvg(
  title: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  spec: ScientificFigureSpec,
  options: { origin?: { x: number; y: number } } = {},
): string {
  const width = mmToPx(spec.widthMm);
  const height = mmToPx(spec.heightMm);
  const figureNode = nodes.find((node) => node.data.scientificRole === 'figure-background');
  const origin = options.origin ?? figureNode?.position ?? { x: 0, y: 0 };
  const visibleNodes = nodes.filter((node) => !node.hidden && !node.data.hidden && !node.data.exportExcluded);
  const byId = new Map(visibleNodes.map((node) => [node.id, node]));
  const boxes = new Map(visibleNodes.map((node) => [node.id, nodeBox(node, byId, origin)]));
  const sortedNodes = visibleNodes
    .filter((node) => node.data.scientificRole !== 'figure-background')
    .sort((left, right) => effectiveZIndex(left, byId) - effectiveZIndex(right, byId));
  const background = spec.background === 'transparent' ? '' : `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`;
  const serializeNodes = (values: FlowNode[]) => values.map((node) => {
    const box = boxes.get(node.id)!;
    const markup = node.data.kind === 'vector' ? serializeVectorNode(node, box) : serializeShapeNode(node, box);
    if (!markup) return '';
    const role = node.data.schematicRole ? ` data-schematic-role="${escapeXml(node.data.schematicRole)}"` : '';
    const variant = node.data.scientificVariant ? ` data-scientific-variant="${escapeXml(node.data.scientificVariant)}"` : '';
    const evidence = node.data.scientificEvidence ? ` data-scientific-evidence="${escapeXml(node.data.scientificEvidence)}"` : '';
    return `<g data-flowloom-node-id="${escapeXml(node.id)}" data-flowloom-kind="${escapeXml(node.data.kind)}" data-flowloom-node-x="${box.x}" data-flowloom-node-y="${box.y}" data-flowloom-node-width="${box.width}" data-flowloom-node-height="${box.height}"${role}${variant}${evidence}>${markup}</g>`;
  }).join('');
  const backgroundNodes = sortedNodes.filter((node) => node.data.schematicRole === 'frame' || node.data.schematicRole === 'phase');
  const foregroundNodes = sortedNodes.filter((node) => node.data.schematicRole !== 'frame' && node.data.schematicRole !== 'phase');
  const provenance = visibleNodes
    .filter((node) => node.data.provenance)
    .map((node) => ({
      id: node.data.provenance!.id,
      kind: node.data.provenance!.kind,
      sourceName: node.data.provenance!.sourceName,
      chartType: node.data.provenance!.chartType,
      fields: node.data.provenance!.fields,
      engine: node.data.provenance!.engine,
      schematic: node.data.provenance!.schematic,
      generatedAt: node.data.provenance!.generatedAt,
    }));
  const editableNodes = sortedNodes.map((node) => {
    const box = boxes.get(node.id)!;
    return {
      id: node.id,
      type: 'flowNode',
      position: { x: box.x, y: box.y },
      style: { ...node.style, width: box.width, height: box.height },
      zIndex: node.zIndex,
      hidden: node.hidden,
      selected: false,
      data: node.data,
    };
  });
  const editableIds = new Set(editableNodes.map((node) => node.id));
  const editableEdges = edges
    .filter((edge) => !edge.hidden && editableIds.has(edge.source) && editableIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: edge.type,
      label: typeof edge.label === 'string' ? edge.label : edge.data?.label,
      data: edge.data,
      style: edge.style,
      hidden: edge.hidden,
      selected: false,
    }));
  const metadata = escapeXml(JSON.stringify({
    title,
    figure: spec,
    provenance,
    flowloom: { version: 2, nodes: editableNodes, edges: editableEdges },
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${spec.widthMm}mm" height="${spec.heightMm}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-flowloom-editable="true"><title>${escapeXml(title)}</title><metadata>${metadata}</metadata>${background}${serializeNodes(backgroundNodes)}${serializeEdges(edges, boxes)}${serializeNodes(foregroundNodes)}</svg>\n`;
}
