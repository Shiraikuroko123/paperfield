import type { FlowNodeData, ShapeKind } from '../types';
import { estimateSvgTextWidth } from './diagram';
import { SCIENTIFIC_DESCRIPTION_MIN_FONT_SIZE } from './scientific';
import { getShapeDefinition } from './shapeRegistry';

export interface ScientificNodeTextLayout {
  descriptionFontSize: number;
  descriptionLineHeight: number;
  descriptionLines: string[];
  descriptionStartY: number;
  labelLineHeight: number;
  labelLines: string[];
  labelStartY: number;
  visualHeight: number;
}

export interface ScientificImageLabelLayout {
  baseline: number;
  fontSize: number;
  height: number;
  lineHeight: number;
  lines: string[];
  paddingX: number;
  paddingY: number;
  width: number;
  x: number;
  y: number;
}

export const SCIENTIFIC_NODE_TEXT_PADDING_X = 10;
export const SCIENTIFIC_FRAME_TEXT_PADDING_X = 13;
export const SCIENTIFIC_FRAME_TEXT_PADDING_Y = 8;

export function isScientificShapeKind(kind: ShapeKind): boolean {
  return kind.startsWith('scientific-');
}

export function scientificNodeTextPaddingX(data: FlowNodeData): number {
  const configured = Number(data.scientificTextPaddingX);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return data.schematicRole === 'frame' || data.schematicRole === 'phase'
    ? SCIENTIFIC_FRAME_TEXT_PADDING_X
    : SCIENTIFIC_NODE_TEXT_PADDING_X;
}

export function scientificNodeTextMaxWidth(data: FlowNodeData, width: number): number {
  return Math.max(1, width - scientificNodeTextPaddingX(data) * 2);
}

export function scientificNodeTextPaddingY(data: FlowNodeData): number {
  const configured = Number(data.scientificTextPaddingY);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : SCIENTIFIC_FRAME_TEXT_PADDING_Y;
}

function scientificDescriptionFontSize(data: FlowNodeData): number {
  const configured = Number(data.scientificDescriptionFontSize);
  return Math.max(
    SCIENTIFIC_DESCRIPTION_MIN_FONT_SIZE,
    Number.isFinite(configured) && configured > 0 ? configured : data.fontSize * 0.86,
  );
}

export function wrapScientificText(
  value: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const pushCharacterWrapped = (valueToWrap: string) => {
    let line = '';
    for (const character of Array.from(valueToWrap)) {
      const candidate = line + character;
      if (line && estimateSvgTextWidth(candidate, fontSize) > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line.trimEnd());
  };
  for (const paragraph of value.split(/\r?\n/)) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    if (/\s/u.test(paragraph.trim())) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && estimateSvgTextWidth(candidate, fontSize) > maxWidth) {
          lines.push(line);
          if (estimateSvgTextWidth(word, fontSize) > maxWidth) {
            pushCharacterWrapped(word);
            line = '';
          } else {
            line = word;
          }
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    } else {
      pushCharacterWrapped(paragraph);
    }
  }
  const visible = (lines.length ? lines : ['']).slice(0, Math.max(1, maxLines));
  if (lines.length > visible.length) {
    const lastIndex = visible.length - 1;
    let last = visible[lastIndex];
    while (last && estimateSvgTextWidth(`${last}...`, fontSize) > maxWidth) last = last.slice(0, -1);
    visible[lastIndex] = `${last.trimEnd()}...`;
  }
  return visible;
}

export function layoutScientificImageLabel(
  data: FlowNodeData,
  width: number,
  height: number,
): ScientificImageLabelLayout | undefined {
  const label = data.label.trim();
  if (data.kind !== 'image' || data.scientificEvidence !== 'schematic' || !label) return undefined;

  const inset = 3;
  const requestedFontSize = Math.max(1, data.fontSize);
  const requestedPaddingX = Math.max(3, requestedFontSize * 0.11);
  const maximumWidth = Math.max(1, width - inset * 2);
  const availableTextWidth = Math.max(1, maximumWidth - requestedPaddingX * 2);
  const paragraphs = label.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const words = paragraphs.length > 1 ? paragraphs : label.split(/\s+/).filter(Boolean);
  let lines = [label.replace(/\s+/g, ' ').trim()];
  if (estimateSvgTextWidth(lines[0], requestedFontSize) * 1.1 > availableTextWidth && words.length > 1) {
    let bestSplit = 1;
    let bestWidth = Number.POSITIVE_INFINITY;
    for (let split = 1; split < words.length; split += 1) {
      const candidate = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
      const widest = Math.max(...candidate.map((line) => estimateSvgTextWidth(line, requestedFontSize)));
      if (widest < bestWidth) {
        bestWidth = widest;
        bestSplit = split;
      }
    }
    lines = [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
  }
  const estimatedAtRequestedSize = Math.max(
    ...lines.map((line) => estimateSvgTextWidth(line, requestedFontSize) * 1.1),
  );
  const fontSize = Math.min(
    requestedFontSize,
    requestedFontSize * availableTextWidth / Math.max(1, estimatedAtRequestedSize),
  );
  const paddingX = Math.min(requestedPaddingX, Math.max(1.5, maximumWidth * 0.12));
  const paddingY = Math.max(1.5, fontSize * 0.1);
  const lineHeight = fontSize * 1.18;
  const textWidth = Math.max(...lines.map((line) => estimateSvgTextWidth(line, fontSize) * 1.1));
  const labelWidth = Math.min(maximumWidth, textWidth + paddingX * 2);
  const labelHeight = Math.min(
    Math.max(1, height - inset * 2),
    fontSize * 1.24 + Math.max(0, lines.length - 1) * lineHeight + paddingY * 2,
  );
  const x = inset;
  const y = Math.max(inset, height - labelHeight - inset);

  return {
    baseline: y + paddingY + fontSize * 1.03,
    fontSize,
    height: labelHeight,
    lineHeight,
    lines,
    paddingX,
    paddingY,
    width: labelWidth,
    x,
    y,
  };
}

export function layoutScientificNodeContent(
  data: FlowNodeData,
  width: number,
  height: number,
): ScientificNodeTextLayout {
  const definition = getShapeDefinition(data.kind);
  const maxWidth = scientificNodeTextMaxWidth(data, width);
  const labelLines = wrapScientificText(data.label, maxWidth, data.fontSize, 2);
  const descriptionFontSize = scientificDescriptionFontSize(data);
  const descriptionLines = data.description?.trim()
    ? wrapScientificText(data.description, maxWidth, descriptionFontSize, 2)
    : [];
  const labelLineHeight = data.fontSize * 1.18;
  const descriptionLineHeight = descriptionFontSize * 1.18;
  const gap = descriptionLines.length ? Math.max(3, data.fontSize * 0.16) : 0;
  const labelAscent = data.fontSize * 0.86;
  const labelDescent = data.fontSize * 0.24;
  const labelHeight = labelAscent
    + (labelLines.length - 1) * labelLineHeight
    + labelDescent;
  const descriptionAscent = descriptionFontSize * 0.86;
  const descriptionDescent = descriptionFontSize * 0.24;
  const descriptionHeight = descriptionLines.length
    ? descriptionAscent
      + (descriptionLines.length - 1) * descriptionLineHeight
      + descriptionDescent
    : 0;
  const textHeight = labelHeight + gap + descriptionHeight;

  if (definition.textPlacement !== 'footer') {
    const top = Math.max(0, (height - textHeight) / 2);
    const labelStartY = top + labelAscent;
    return {
      descriptionFontSize,
      descriptionLineHeight,
      descriptionLines,
      descriptionStartY: top + labelHeight + gap + descriptionAscent,
      labelLineHeight,
      labelLines,
      labelStartY,
      visualHeight: height,
    };
  }

  const footerPadding = Math.max(4, data.fontSize * 0.18);
  const desiredVisualHeight = height - textHeight - footerPadding * 2;
  const minimumVisualHeight = height * (descriptionLines.length ? 0.46 : 0.52);
  const maximumVisualHeight = height * (descriptionLines.length ? 0.7 : 0.74);
  const idealVisualHeight = Math.max(minimumVisualHeight, Math.min(maximumVisualHeight, desiredVisualHeight));
  const maximumWithoutTextOverlap = Math.max(0, height - textHeight);
  const visualHeight = Math.min(idealVisualHeight, maximumWithoutTextOverlap);
  const footerHeight = Math.max(0, height - visualHeight);
  const top = visualHeight + Math.max(0, (footerHeight - textHeight) / 2);
  const labelStartY = top + labelAscent;

  return {
    descriptionFontSize,
    descriptionLineHeight,
    descriptionLines,
    descriptionStartY: top + labelHeight + gap + descriptionAscent,
    labelLineHeight,
    labelLines,
    labelStartY,
    visualHeight,
  };
}

export function layoutSchematicNodeContent(
  data: FlowNodeData,
  width: number,
  height: number,
): ScientificNodeTextLayout {
  if (isScientificShapeKind(data.kind)) return layoutScientificNodeContent(data, width, height);

  const definition = getShapeDefinition(data.kind);
  const maxWidth = scientificNodeTextMaxWidth(data, width);
  const descriptionFontSize = scientificDescriptionFontSize(data);
  const labelLineHeight = data.fontSize * 1.2;
  const descriptionLineHeight = descriptionFontSize * 1.2;
  const isFrame = data.schematicRole === 'frame' || data.schematicRole === 'phase';
  const paddingY = scientificNodeTextPaddingY(data);
  const availableHeight = Math.max(data.fontSize, height - paddingY * 2);
  const hasDescription = Boolean(data.description?.trim());
  const maxLabelLines = isFrame ? 2 : Math.max(1, Math.min(2, Math.floor(availableHeight / labelLineHeight)));
  const labelLines = wrapScientificText(data.label, maxWidth, data.fontSize, maxLabelLines);
  // Browser SVG text boxes for the UI font are taller than the canvas text
  // estimate. Phase headings use these measured metrics so preview and export
  // remain inside the same logical heading band.
  const usesMeasuredFrameMetrics = isFrame && paddingY >= SCIENTIFIC_FRAME_TEXT_PADDING_Y;
  const labelAscentFactor = usesMeasuredFrameMetrics ? 1.08 : 0.86;
  const labelDescentFactor = usesMeasuredFrameMetrics ? 0.27 : 0.24;
  const labelHeight = data.fontSize * labelAscentFactor
    + Math.max(0, labelLines.length - 1) * labelLineHeight
    + data.fontSize * labelDescentFactor;
  const gap = hasDescription ? Math.max(3, data.fontSize * 0.16) : 0;
  const remainingHeight = Math.max(0, availableHeight - labelHeight - gap);
  const maxDescriptionLines = Math.max(1, Math.min(2, Math.floor(remainingHeight / descriptionLineHeight)));
  const descriptionLines = hasDescription
    ? wrapScientificText(data.description!, maxWidth, descriptionFontSize, maxDescriptionLines)
    : [];
  const descriptionHeight = descriptionLines.length
    ? descriptionFontSize * 0.86
      + Math.max(0, descriptionLines.length - 1) * descriptionLineHeight
      + descriptionFontSize * 0.24
    : 0;
  const textHeight = labelHeight + gap + descriptionHeight;
  const topAligned = isFrame
    || definition.textPlacement === 'header'
    || definition.textPlacement === 'lane'
    || data.verticalAlign === 'top';
  const bottomAligned = definition.textPlacement === 'footer' || data.verticalAlign === 'bottom';
  const top = topAligned
    ? paddingY
    : bottomAligned
      ? Math.max(paddingY, height - paddingY - textHeight)
      : Math.max(paddingY, (height - textHeight) / 2);
  const labelStartY = top + data.fontSize * labelAscentFactor;
  const descriptionStartY = top + labelHeight + gap + descriptionFontSize * 0.86;

  return {
    descriptionFontSize,
    descriptionLineHeight,
    descriptionLines,
    descriptionStartY,
    labelLineHeight,
    labelLines,
    labelStartY,
    visualHeight: height,
  };
}
