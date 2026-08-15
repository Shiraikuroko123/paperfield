#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'output', 'publication-evidence');
const generatedAt = new Date().toISOString();
const sourceFiles = [
  'src/types.ts',
  'src/lib/flagshipQuality.ts',
  'src/lib/scientificFlagshipsV3.ts',
  'src/lib/scientificFlagshipsV4.ts',
  'src/lib/scientificFlagshipsV5.ts',
  'src/lib/scientificSchematics.ts',
  'src/lib/scientific.ts',
  'src/lib/scientificEvidence.ts',
  'src/lib/scientificExport.tsx',
  'src/lib/scientificFigureRecipes.ts',
  'src/lib/scientificNodeLayout.ts',
  'src/lib/scientificRouting.ts',
  'src/lib/scientificVisualVariants.ts',
  'src/lib/publicationEvidenceBrowser.ts',
  'public/fonts/NotoSansMath-Regular.ttf',
  'public/fonts/NotoSansMath-LICENSE.txt',
  'src/assets/scientific/vla-approach.jpg',
  'src/assets/scientific/vla-approach-print.jpg',
  'src/assets/scientific/vla-front.jpg',
  'src/assets/scientific/vla-grasp.jpg',
  'src/assets/scientific/vla-grasp-print.jpg',
  'src/assets/scientific/vla-observe.jpg',
  'src/assets/scientific/vla-observe-print.jpg',
  'src/assets/scientific/vla-place.jpg',
  'src/assets/scientific/vla-place-print.jpg',
  'src/assets/scientific/world-collision.jpg',
  'src/assets/scientific/world-collision-print.jpg',
  'src/assets/scientific/world-observed.jpg',
  'src/assets/scientific/world-observed-print.jpg',
  'src/assets/scientific/world-occluded.jpg',
  'src/assets/scientific/world-occluded-print.jpg',
  'src/assets/scientific/world-success.jpg',
  'src/assets/scientific/world-success-print.jpg',
  'docs/research/SYNTHETIC_ASSET_PROVENANCE.md',
  'src/components/ScientificDialog.tsx',
  'src/components/ShapeVisual.tsx',
];
const templates = [
  { id: 'vla-policy', slug: 'vla-policy', qaSlug: 'vla', uiName: 'VLA 机器人策略' },
  { id: 'world-model-rollout', slug: 'world-model-rollout', qaSlug: 'world', uiName: '世界模型与未来展开' },
  { id: 'llm-training-pipeline', slug: 'llm-training-alignment', qaSlug: 'llm', uiName: 'LLM 全阶段训练流水线' },
];
const formats = [
  { id: 'single-column', qaSlug: 'single', widthMm: 89, heightMm: 70, uiName: '单栏图' },
  { id: 'double-column', qaSlug: 'double', widthMm: 180, heightMm: 120, uiName: '双栏图' },
  { id: 'presentation', qaSlug: 'presentation', widthMm: 180, heightMm: 101.25, uiName: '16:9 图版' },
];
const styles = ['conference', 'monochrome'];
const requiredPdfGlyphs = {
  'vla-policy': ['ℝ', '×'],
  'world-model-rollout': ['θ', '×'],
  'llm-training-pipeline': ['θ', 'π', 'τ'],
};
const requiredPdfTextPatterns = {
  'vla-policy': [{ id: 'action-tensor-horizon', expression: 'ℝ\\s*H\\s*×\\s*7' }],
  'world-model-rollout': [
    { id: 'action-tensor-horizon', expression: 'ℝ\\s*H\\s*×\\s*7' },
    { id: 'predicted-belief-accent', expression: 'b\\s*(?:\\u0302|\\u02C6)\\s*\\(\\s*k\\s*\\)' },
  ],
};
const previewViewports = [
  { id: 'qa-1920x1200', width: 1920, height: 1200 },
  { id: 'full-hd-1920x1080', width: 1920, height: 1080 },
  { id: 'laptop-1366x768', width: 1366, height: 768 },
];
const previewThresholds = {
  adjacentPhaseTextGapUnits: 12,
  phaseTextInsetUnits: 1.5,
  phaseTextTopOverflowUnits: 8,
  overflowTolerancePx: 0.75,
};

function parseArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildArtifactInFreshPage(browser, url, request, stem) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  try {
    await withTimeout(page.goto(url, { waitUntil: 'networkidle' }), 30_000, `Loading ${stem}`);
    return await withTimeout(page.evaluate(async (payload) => {
      const module = await import('/src/lib/publicationEvidenceBrowser.ts');
      const artifact = await module.buildPublicationEvidenceArtifact(payload);
      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '-10000px';
      host.style.top = '0';
      host.style.visibility = 'hidden';
      host.innerHTML = artifact.svg;
      document.body.appendChild(host);
      try {
        await document.fonts.ready;
        const svg = host.querySelector('svg');
        if (!svg) throw new Error('Generated publication SVG is missing.');
        const round = (value) => Math.round(value * 1000) / 1000;
        const boxFor = (element) => {
          const value = element.getBBox();
          return {
            left: value.x,
            top: value.y,
            right: value.x + value.width,
            bottom: value.y + value.height,
            width: value.width,
            height: value.height,
          };
        };
        const contained = (inner, outer, tolerance = 1) => (
          inner.left >= outer.left - tolerance
          && inner.top >= outer.top - tolerance
          && inner.right <= outer.right + tolerance
          && inner.bottom <= outer.bottom + tolerance
        );
        const measurements = [];
        const failures = [];
        for (const label of svg.querySelectorAll('[data-flowloom-image-label="true"]')) {
          const node = label.closest('[data-flowloom-node-id]');
          const background = label.querySelector('[data-flowloom-image-label-bg="true"]');
          const text = label.querySelector('[data-flowloom-image-label-text="true"]');
          const nodeId = node?.getAttribute('data-flowloom-node-id') ?? 'unknown';
          if (!node || !background || !text) {
            failures.push({ code: 'image-label-structure', nodeId });
            continue;
          }
          const nodeBox = {
            left: Number(node.getAttribute('data-flowloom-node-x')),
            top: Number(node.getAttribute('data-flowloom-node-y')),
            width: Number(node.getAttribute('data-flowloom-node-width')),
            height: Number(node.getAttribute('data-flowloom-node-height')),
          };
          nodeBox.right = nodeBox.left + nodeBox.width;
          nodeBox.bottom = nodeBox.top + nodeBox.height;
          const backgroundBox = boxFor(background);
          const textBox = boxFor(text);
          const textInsideBackground = contained(textBox, backgroundBox);
          const backgroundInsideNode = contained(backgroundBox, nodeBox, 0.01);
          if (!textInsideBackground) failures.push({ code: 'image-label-text-outside-background', nodeId });
          if (!backgroundInsideNode) failures.push({ code: 'image-label-background-outside-node', nodeId });
          measurements.push({
            nodeId,
            textInsideBackground,
            backgroundInsideNode,
            node: Object.fromEntries(Object.entries(nodeBox).map(([key, value]) => [key, round(value)])),
            background: Object.fromEntries(Object.entries(backgroundBox).map(([key, value]) => [key, round(value)])),
            text: Object.fromEntries(Object.entries(textBox).map(([key, value]) => [key, round(value)])),
          });
        }
        const minimumTextPt = Number(payload.minimumTextPt);
        const textMeasurements = [];
        const textFailures = [];
        const textElements = [...svg.querySelectorAll('text, tspan')].filter((element) => (
          element.textContent?.trim()
          && (element.tagName.toLowerCase() === 'tspan' || !element.querySelector('tspan'))
        ));
        for (const element of textElements) {
          const style = getComputedStyle(element);
          const fontSize = Number.parseFloat(style.fontSize);
          const matrix = element.getScreenCTM();
          const box = element.getBBox();
          if (!Number.isFinite(fontSize) || !matrix || box.width <= 0 || box.height <= 0) continue;
          const verticalScale = Math.hypot(matrix.c, matrix.d);
          const physicalFontPt = fontSize * verticalScale * 72 / 96;
          const ownerNode = element.closest('[data-flowloom-node-id]');
          const ownerEdge = element.closest('[data-flowloom-edge-id]');
          const measurement = {
            ownerType: ownerNode ? 'node' : ownerEdge ? 'edge' : 'svg',
            ownerId: ownerNode?.getAttribute('data-flowloom-node-id')
              ?? ownerEdge?.getAttribute('data-flowloom-edge-id')
              ?? 'root',
            element: element.tagName.toLowerCase(),
            text: element.textContent.trim(),
            fontSize: round(fontSize),
            verticalScale: round(verticalScale),
            physicalFontPt: round(physicalFontPt),
          };
          textMeasurements.push(measurement);
          if (Number.isFinite(minimumTextPt) && physicalFontPt + 0.005 < minimumTextPt) {
            textFailures.push({
              code: 'text-below-physical-minimum',
              ...measurement,
              minimumTextPt,
            });
          }
        }
        return {
          ...artifact,
          svgLabelValidation: {
            labelCount: measurements.length,
            checkCount: measurements.length * 2,
            failures,
            measurements,
          },
          svgTextValidation: {
            textCount: textMeasurements.length,
            checkCount: textMeasurements.length,
            minimumTextPt,
            minimumRenderedFontPt: textMeasurements.length
              ? Math.min(...textMeasurements.map((item) => item.physicalFontPt))
              : null,
            failures: textFailures,
            measurements: textMeasurements,
          },
        };
      } finally {
        host.remove();
      }
    }, request), 90_000, `Generating ${stem}`);
  } finally {
    await withTimeout(page.close(), 10_000, `Closing ${stem} page`);
  }
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 4177;
      server.close(() => resolve(port));
    });
  });
}

async function responds(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await responds(url)) return;
    if (child.exitCode !== null) throw new Error(`Vite exited with code ${child.exitCode}.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function ensureServer() {
  const requestedUrl = parseArgument('--url') ?? process.env.FLOWLOOM_BASE_URL;
  if (requestedUrl) {
    if (!(await responds(requestedUrl))) throw new Error(`Flowloom is not reachable at ${requestedUrl}.`);
    return { url: requestedUrl, child: undefined };
  }
  const existingUrl = 'http://127.0.0.1:5173';
  if (await responds(existingUrl)) return { url: existingUrl, child: undefined };
  const port = await availablePort();
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url, child);
  return { url, child };
}

function specFor(format) {
  return {
    widthMm: format.widthMm,
    heightMm: format.heightMm,
    dpi: 300,
    rows: 1,
    columns: 1,
    marginMm: 6,
    gapMm: 0,
    panelLabels: false,
    labelStyle: 'uppercase',
    background: '#ffffff',
    updatedAt: generatedAt,
  };
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function commandPath(name) {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(command, [name], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : undefined;
}

async function walkFiles(directory) {
  const values = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walkFiles(target));
    else values.push(target);
  }
  return values;
}

function parseFontEmbedding(output) {
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.slice(lines.findIndex((line) => /^-+/.test(line.trim())) + 1);
  const requiredFamilies = ['Flowloom Publication Sans', 'Flowloom Publication Math'];
  const families = Object.fromEntries(requiredFamilies.map((family) => {
    const familyRows = rows.filter((line) => line.includes(family));
    const embedded = familyRows.length >= 1
      && familyRows.every((line) => /\byes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/i.test(line.trim()));
    return [family, { rowCount: familyRows.length, embedded }];
  }));
  return {
    raw: output.trim(),
    families,
    allEmbedded: requiredFamilies.every((family) => families[family].embedded),
  };
}

async function openScientificWorkbench(page, url, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '打开科研绘图工作台' }).first().click();
  await page.getByRole('dialog', { name: '科研绘图工作台' }).waitFor({ state: 'visible' });
}

async function selectPreviewFormat(page, format) {
  await page.getByRole('tab', { name: '图版', exact: true }).click();
  const group = page.getByRole('group', { name: '常用图版尺寸' });
  await group.getByRole('button', { name: new RegExp(`^${format.uiName}`) }).click();
  await page.getByRole('tab', { name: '论文示意图', exact: true }).click();
  await page.locator(`svg[data-flowloom-preview-layout="${format.id}"]`).waitFor({ state: 'visible' });
}

async function selectPreviewTemplate(page, template, formatId) {
  const group = page.getByRole('group', { name: '论文示意图原型' });
  await group.getByRole('button', { name: new RegExp(`^${template.uiName}`) }).click();
  await page.locator(
    `svg[data-flowloom-preview-layout="${formatId}"][data-flowloom-preview-template-id="${template.id}"]`,
  ).waitFor({ state: 'visible' });
}

async function captureFinalArtifactQaFiles(artifacts) {
  const screenshotRoot = path.join(root, 'output', 'playwright');
  await mkdir(screenshotRoot, { recursive: true });
  const records = [];
  for (const artifact of artifacts.filter((item) => item.style === 'conference')) {
    const template = templates.find((item) => item.id === artifact.templateId);
    const format = formats.find((item) => item.id === artifact.format);
    if (!template || !format || !artifact.files.pdfRender) continue;
    const nativeFile = path.join(screenshotRoot, `final-qa-${template.qaSlug}-${format.qaSlug}.png`);
    const pdfFile = path.join(screenshotRoot, `final-qa-${template.qaSlug}-${format.qaSlug}-pdf.png`);
    await Promise.all([
      copyFile(path.join(root, artifact.files.png), nativeFile),
      copyFile(path.join(root, artifact.files.pdfRender), pdfFile),
    ]);
    records.push(
      { kind: 'native-300dpi-png', templateId: artifact.templateId, format: artifact.format, file: nativeFile },
      { kind: 'poppler-300dpi-pdf-render', templateId: artifact.templateId, format: artifact.format, file: pdfFile },
    );
  }
  return Promise.all(records.map(async (record) => ({
    ...record,
    file: path.relative(root, record.file).replaceAll('\\', '/'),
    sha256: await sha256(record.file),
  })));
}

async function measurePresentationPreview(page, exportSvg, viewport, template) {
  return page.evaluate(({ exportSource, expectedViewport, expectedTemplate, thresholds }) => {
    const round = (value) => Math.round(value * 1000) / 1000;
    const toRect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const union = (elements) => {
      const rectangles = elements
        .map(toRect)
        .filter((rect) => rect.width > 0 && rect.height > 0);
      if (!rectangles.length) return undefined;
      return {
        left: Math.min(...rectangles.map((rect) => rect.left)),
        top: Math.min(...rectangles.map((rect) => rect.top)),
        right: Math.max(...rectangles.map((rect) => rect.right)),
        bottom: Math.max(...rectangles.map((rect) => rect.bottom)),
      };
    };
    const insets = (outer, inner) => ({
      left: round(inner.left - outer.left),
      top: round(inner.top - outer.top),
      right: round(outer.right - inner.right),
      bottom: round(outer.bottom - inner.bottom),
    });
    const visibleTextLines = (group, selector) => Array.from(group.querySelectorAll(selector))
      .filter((element) => {
        if (!element.textContent?.trim()) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0'
          && style.fill !== 'transparent';
      });
    const failures = [];
    let checkCount = 0;
    const check = (code, pass, detail) => {
      checkCount += 1;
      if (!pass) failures.push({ code, ...detail });
    };
    const svg = document.querySelector(
      `svg[data-flowloom-preview-layout="presentation"][data-flowloom-preview-template-id="${expectedTemplate}"]`,
    );
    if (!svg) throw new Error(`Presentation preview is missing for ${expectedTemplate}.`);
    const matrix = svg.getScreenCTM();
    if (!matrix) throw new Error(`Presentation preview transform is missing for ${expectedTemplate}.`);
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    const insetsInUnits = (outer, inner) => {
      const measured = insets(outer, inner);
      return {
        left: round(measured.left / scaleX),
        top: round(measured.top / scaleY),
        right: round(measured.right / scaleX),
        bottom: round(measured.bottom / scaleY),
      };
    };

    const exportDocument = new DOMParser().parseFromString(exportSource, 'image/svg+xml');
    const exportPhaseLines = Object.fromEntries(Array.from(
      exportDocument.querySelectorAll('[data-schematic-role="phase"]'),
    ).map((group) => [
      group.getAttribute('data-flowloom-node-id'),
      Array.from(group.querySelectorAll('text:first-of-type tspan')).map((line) => line.textContent ?? ''),
    ]));
    const nodeMeasurements = [];
    const phaseMeasurements = [];

    for (const group of svg.querySelectorAll('[data-flowloom-preview-node-id]')) {
      const nodeId = group.getAttribute('data-flowloom-preview-node-id');
      const role = group.getAttribute('data-flowloom-preview-role');
      const boxElement = group.querySelector(`[data-flowloom-preview-node-box="${nodeId}"]`);
      if (!nodeId || !boxElement) continue;
      const box = toRect(boxElement);
      const labelLines = visibleTextLines(group, '[data-flowloom-preview-label-line]');
      const descriptionLines = visibleTextLines(group, '[data-flowloom-preview-description-line]');
      const allText = union([...labelLines, ...descriptionLines]);
      const label = union(labelLines);
      const lines = labelLines.map((line) => line.textContent ?? '');
      if (allText && role !== 'phase') {
        const tolerance = thresholds.overflowTolerancePx;
        const inside = allText.left >= box.left - tolerance
          && allText.top >= box.top - tolerance
          && allText.right <= box.right + tolerance
          && allText.bottom <= box.bottom + tolerance;
        check('node-label-contained', inside, {
          nodeId,
          role,
          box: Object.fromEntries(Object.entries(box).map(([key, value]) => [key, round(value)])),
          text: Object.fromEntries(Object.entries(allText).map(([key, value]) => [key, round(value)])),
        });
      }
      const measurement = {
        nodeId,
        role,
        lines,
        insets: label ? insetsInUnits(box, label) : undefined,
      };
      nodeMeasurements.push(measurement);

      if (role === 'phase' && label) {
        const phaseInsets = insetsInUnits(box, label);
        const insetPass = phaseInsets.left >= thresholds.phaseTextInsetUnits
          && phaseInsets.right >= thresholds.phaseTextInsetUnits
          && phaseInsets.bottom >= thresholds.phaseTextInsetUnits
          && phaseInsets.top >= -thresholds.phaseTextTopOverflowUnits;
        check('phase-label-inset', insetPass, {
          nodeId,
          actual: phaseInsets,
          unit: 'schematic-unit',
          minimum: thresholds.phaseTextInsetUnits,
        });
        const exportedLines = exportPhaseLines[nodeId] ?? [];
        check('phase-preview-export-line-parity', JSON.stringify(lines) === JSON.stringify(exportedLines), {
          nodeId,
          previewLines: lines,
          exportLines: exportedLines,
        });
        phaseMeasurements.push({ nodeId, box, label, lines, exportedLines, insets: phaseInsets });
      }
    }

    phaseMeasurements.sort((left, right) => left.box.left - right.box.left);
    const adjacentPhaseGaps = [];
    for (const left of phaseMeasurements) {
      const right = phaseMeasurements
        .filter((candidate) => {
          if (candidate.box.left < left.box.right - thresholds.overflowTolerancePx) return false;
          const overlap = Math.min(left.box.bottom, candidate.box.bottom) - Math.max(left.box.top, candidate.box.top);
          return overlap >= Math.min(left.box.height, candidate.box.height) * 0.5;
        })
        .sort((first, second) => first.box.left - second.box.left)[0];
      if (!right) continue;
      const gap = round((right.label.left - left.label.right) / scaleX);
      adjacentPhaseGaps.push({ left: left.nodeId, right: right.nodeId, gap, unit: 'schematic-unit' });
      check('adjacent-phase-label-gap', gap >= thresholds.adjacentPhaseTextGapUnits, {
        left: left.nodeId,
        right: right.nodeId,
        actual: gap,
        unit: 'schematic-unit',
        minimum: thresholds.adjacentPhaseTextGapUnits,
      });
    }

    return {
      viewport: expectedViewport,
      templateId: expectedTemplate,
      layout: svg.getAttribute('data-flowloom-preview-layout'),
      thresholds,
      checkCount,
      failures,
      adjacentPhaseGaps,
      phases: phaseMeasurements.map((phase) => ({
        nodeId: phase.nodeId,
        lines: phase.lines,
        exportLines: phase.exportedLines,
        insets: phase.insets,
      })),
    };
  }, {
    exportSource: exportSvg,
    expectedViewport: viewport,
    expectedTemplate: template.id,
    thresholds: previewThresholds,
  });
}

async function collectPreviewLayoutValidation(page, url, presentationSvgs) {
  const results = [];
  for (const viewport of previewViewports) {
    await openScientificWorkbench(page, url, viewport);
    await selectPreviewFormat(page, formats.find((format) => format.id === 'presentation'));
    for (const template of templates) {
      await selectPreviewTemplate(page, template, 'presentation');
      const exportSvg = presentationSvgs.get(template.id);
      if (!exportSvg) throw new Error(`Presentation export SVG is missing for ${template.id}.`);
      results.push(await measurePresentationPreview(page, exportSvg, viewport, template));
    }
  }
  return results;
}

function baseMarkdownReport(manifest) {
  const rows = manifest.artifacts.map((item) => (
    `| ${item.templateId} | ${item.format} | ${item.style} | ${item.nodeCount}/${item.edgeCount} | ${item.minimumFontPt.toFixed(2)} | ${item.svgTextValidation.minimumRenderedFontPt?.toFixed(2) ?? 'n/a'} | ${item.minimumStrokePt.toFixed(2)} | ${item.audit.error}/${item.audit.warning}/${item.audit.info} | ${item.pdfFonts.allEmbedded ? 'yes' : 'no'} | ${item.pdfText.missingGlyphs.length || item.pdfText.missingPatterns.length ? `missing ${[...item.pdfText.missingGlyphs, ...item.pdfText.missingPatterns].join(', ')}` : 'yes'} | ${item.svgLabelValidation.failures.length ? 'no' : 'yes'} | ${item.svgTextValidation.failures.length ? 'no' : 'yes'} |`
  )).join('\n');
  const flagshipRows = manifest.flagships.map((item) => (
    `| ${item.templateId} | ${item.totalScore.toFixed(1)} | ${item.minimumDimensionScore.toFixed(1)} | ${item.variantCount}/${item.expectedVariantCount} | ${item.failureReasons.length ? item.failureReasons.join('; ') : 'none'} |`
  )).join('\n');
  const layoutReviewRows = manifest.flagships.flatMap((item) => item.layoutReviews.map((review) => (
    `| ${item.templateId} | ${review.layout} | ${review.dimensions.map((dimension) => dimension.score.toFixed(0)).join(' / ')} | ${review.totalScore.toFixed(1)} | ${review.passed ? 'PASS' : 'FAIL'} |`
  ))).join('\n');
  const dimensionSections = manifest.flagships.map((item) => (
    `### ${item.name}\n\n${item.dimensions.map((dimension) => `- ${dimension.label}: **${dimension.score.toFixed(1)} / ${dimension.maxScore}** - ${dimension.evidence}`).join('\n')}`
  )).join('\n\n');
  return `# Flowloom Publication Evidence\n\nGenerated: ${manifest.generatedAt}\n\nThis bundle is generated from the current source tree. Automated checks establish export readiness; they do not certify scientific claims or venue acceptance.\n\n## Coverage\n\n- 3 flagship figures\n- 3 physical layouts: 89 x 70 mm, 180 x 120 mm, 180 x 101.25 mm\n- conference color and monochrome\n- editable SVG, vector PDF, and 300 DPI PNG\n- grayscale plus protanopia, deuteranopia, and tritanopia review simulations\n- every PDF rerendered at 300 DPI with Poppler\n- final QA files copied directly from native 300 DPI PNG and Poppler PDF rerenders\n- both publication Sans and Math font families checked for PDF embedding\n- required mathematical glyphs verified with pdftotext\n- image-label text measured inside its exported background and node bounds\n- editor preview geometry measured at 1920 x 1200, 1920 x 1080, and 1366 x 768\n- preview phase wrapping compared line-for-line with exported SVG\n\n## Gate\n\n- Minimum flagship score: **${manifest.summary.minimumFlagshipScore.toFixed(1)} / 100**\n- Flagships below gate or with evidence failures: **${manifest.summary.flagshipFailures}**\n- Audit errors: **${manifest.summary.auditErrors}**\n- Raster failures: **${manifest.summary.rasterFailures}**\n- PDFs with unembedded fonts: **${manifest.summary.pdfFontFailures}**\n- PDFs missing required math text: **${manifest.summary.pdfTextFailures}**\n- Exported image-label containment failures: **${manifest.summary.svgLabelFailures}**\n- Preview geometry failures: **${manifest.summary.previewLayoutFailures}**\n- Preview geometry checks: **${manifest.summary.previewLayoutChecks}**\n- Core artifacts: **${manifest.summary.coreArtifactFiles}**\n- Direct final QA artifacts: **${manifest.finalQaArtifacts.length}**\n- Accessibility simulations: **${manifest.summary.accessibilityFiles}**\n- Poppler renders: **${manifest.summary.pdfRenderFiles}**\n\n| Flagship | Score / 100 | Lowest dimension / 100 | Variants | Failure reasons |\n| --- | ---: | ---: | ---: | --- |\n${flagshipRows}\n\n## Independent Layout Reviews\n\nSix-axis order: scientific narrative / visual hierarchy / routing and collision control / composition balance / physical-scale readability / cross-format consistency.\n\n| Flagship | Layout | Six-axis scores | Mean / 100 | Decision |\n| --- | --- | --- | ---: | --- |\n${layoutReviewRows}\n\n## Conservative Dimension Scorecards\n\n${dimensionSections}\n\n## Export Variants\n\n| Figure | Layout | Style | Nodes/edges | Min font pt | Min stroke pt | Audit E/W/I | PDF fonts embedded | Required PDF text | Image labels contained |\n| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |\n${rows}\n\n## Contact Sheets\n\n- \`contact-sheets/core-exports.jpg\`\n- \`contact-sheets/accessibility-simulations.jpg\`\n- \`contact-sheets/pdf-poppler-renders.jpg\`\n\nAll file hashes and source fingerprints are in \`manifest.json\`. CVD outputs are review simulations, not clinical vision models.\n`;
}

function markdownReport(manifest) {
  return baseMarkdownReport(manifest)
    .replace(
      '- image-label text measured inside its exported background and node bounds',
      '- image-label text measured inside its exported background and node bounds\n- every rendered SVG text leaf measured through its final transform at physical output size\n- paper text below 7.5 pt and presentation text below 9 pt blocks the gate',
    )
    .replace(
      `- Exported image-label containment failures: **${manifest.summary.svgLabelFailures}**`,
      `- Exported image-label containment failures: **${manifest.summary.svgLabelFailures}**\n- Exported physical-font failures: **${manifest.summary.svgTextFailures}**`,
    )
    .replace(
      '| Figure | Layout | Style | Nodes/edges | Min font pt | Min stroke pt | Audit E/W/I | PDF fonts embedded | Required PDF text | Image labels contained |\n| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
      '| Figure | Layout | Style | Nodes/edges | Declared min pt | Rendered min pt | Min stroke pt | Audit E/W/I | PDF fonts embedded | Required PDF text | Image labels contained | Physical text passed |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |',
    )
    .replace(
      '- every PDF rerendered at 300 DPI with Poppler',
      '- every PDF rerendered at 300 DPI with Poppler\n- all 18 native PNG / Poppler PDF pairs pass visual-equivalence regression',
    )
    .replace(
      `- Poppler renders: **${manifest.summary.pdfRenderFiles}**`,
      `- Poppler renders: **${manifest.summary.pdfRenderFiles}**\n- PNG/PDF visual-equivalence pairs: **${manifest.summary.visualEquivalencePassed}/${manifest.summary.visualEquivalencePairs}**`,
    );
}

async function main() {
  for (const directory of ['svg', 'pdf', 'png', 'pdf-renders', 'accessibility', 'contact-sheets']) {
    await mkdir(path.join(outputRoot, directory), { recursive: true });
  }
  const server = await ensureServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const qualityPage = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
    await qualityPage.goto(server.url, { waitUntil: 'networkidle' });
    const qualityGate = await qualityPage.evaluate(async () => {
      const module = await import('/src/lib/flagshipQuality.ts');
      return {
        threshold: module.FLAGSHIP_QUALITY_THRESHOLD,
        minimumDimensionRatio: module.FLAGSHIP_MINIMUM_DIMENSION_RATIO,
        rubricVersion: module.FLAGSHIP_QUALITY_RUBRIC_VERSION,
        scorecards: module.FLAGSHIP_QUALITY_SCORECARDS,
      };
    });
    await qualityPage.close();
    const artifacts = [];
    const presentationSvgs = new Map();
    for (const template of templates) {
      for (const format of formats) {
        for (const style of styles) {
          const request = {
            templateId: template.id,
            style,
            spec: specFor(format),
            minimumTextPt: format.id === 'presentation' ? 9 : 7.5,
          };
          const stem = `${template.slug}-${format.id}-${style}`;
          const artifact = await buildArtifactInFreshPage(browser, server.url, request, stem);
          if (format.id === 'presentation' && style === 'conference') {
            presentationSvgs.set(template.id, artifact.svg);
          }
          const svgPath = path.join(outputRoot, 'svg', `${stem}.svg`);
          const pdfPath = path.join(outputRoot, 'pdf', `${stem}.pdf`);
          const pngPath = path.join(outputRoot, 'png', `${stem}.png`);
          await Promise.all([
            writeFile(svgPath, artifact.svg, 'utf8'),
            writeFile(pdfPath, Buffer.from(artifact.pdfBase64, 'base64')),
            writeFile(pngPath, Buffer.from(artifact.pngBase64, 'base64')),
          ]);
          const audit = artifact.audit.reduce((counts, issue) => {
            counts[issue.severity] += 1;
            return counts;
          }, { error: 0, warning: 0, info: 0 });
          artifacts.push({
            stem,
            templateId: template.id,
            format: format.id,
            style,
            widthMm: format.widthMm,
            heightMm: format.heightMm,
            dpi: 300,
            pixelWidth: Math.round(format.widthMm / 25.4 * 300),
            pixelHeight: Math.round(format.heightMm / 25.4 * 300),
            layout: artifact.layout,
            nodeCount: artifact.nodeCount,
            edgeCount: artifact.edgeCount,
            minimumFontPt: artifact.minimumFontPt,
            minimumAnnotationFontPt: artifact.minimumAnnotationFontPt,
            minimumStrokePt: artifact.minimumStrokePt,
            bounds: artifact.bounds,
            audit,
            auditIssues: artifact.audit,
            svgLabelValidation: artifact.svgLabelValidation,
            svgTextValidation: artifact.svgTextValidation,
            files: {
              svg: path.relative(root, svgPath).replaceAll('\\', '/'),
              pdf: path.relative(root, pdfPath).replaceAll('\\', '/'),
              png: path.relative(root, pngPath).replaceAll('\\', '/'),
            },
          });
          process.stdout.write(`generated ${stem}\n`);
        }
      }
    }
    const qaPage = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
    const previewLayoutValidation = await collectPreviewLayoutValidation(qaPage, server.url, presentationSvgs);
    await qaPage.close();
    await browser.close();
    browser = undefined;

    const pdftocairo = commandPath('pdftocairo');
    const pdffonts = commandPath('pdffonts');
    const pdfinfo = commandPath('pdfinfo');
    const pdftotext = commandPath('pdftotext');
    if (!pdftocairo || !pdffonts || !pdfinfo || !pdftotext) {
      throw new Error('Poppler commands pdftocairo, pdffonts, pdfinfo, and pdftotext are required.');
    }
    for (const artifact of artifacts) {
      const pdfPath = path.join(root, artifact.files.pdf);
      const renderStem = path.join(outputRoot, 'pdf-renders', path.basename(pdfPath, '.pdf'));
      run(pdftocairo, ['-png', '-singlefile', '-r', '300', pdfPath, renderStem]);
      artifact.files.pdfRender = `${path.relative(root, renderStem).replaceAll('\\', '/')}.png`;
      artifact.pdfFonts = parseFontEmbedding(run(pdffonts, [pdfPath]));
      artifact.pdfInfo = run(pdfinfo, [pdfPath]).trim();
      const text = run(pdftotext, ['-layout', pdfPath, '-']).trim();
      const requiredGlyphs = requiredPdfGlyphs[artifact.templateId] ?? [];
      const requiredPatterns = requiredPdfTextPatterns[artifact.templateId] ?? [];
      artifact.pdfText = {
        requiredGlyphs,
        requiredPatterns,
        missingGlyphs: requiredGlyphs.filter((glyph) => !text.includes(glyph)),
        missingPatterns: requiredPatterns
          .filter(({ expression }) => !new RegExp(expression, 'u').test(text))
          .map(({ id }) => id),
        text,
      };
    }
    const finalQaArtifacts = await captureFinalArtifactQaFiles(artifacts);

    const python = commandPath(process.platform === 'win32' ? 'python.exe' : 'python3') ?? commandPath('python');
    if (!python) throw new Error('Python with Pillow and NumPy is required for accessibility simulations.');
    run(python, [path.join(root, 'scripts', 'create-accessibility-variants.py'), outputRoot], { stdio: 'inherit' });
    const rasterValidation = JSON.parse(await readFile(path.join(outputRoot, 'raster-validation.json'), 'utf8'));
    const expectedVariantCount = formats.length * styles.length;
    const visualEquivalence = Array.isArray(rasterValidation.visualEquivalence)
      ? rasterValidation.visualEquivalence
      : [];
    const rasterFailureRecords = Array.isArray(rasterValidation.failures)
      ? rasterValidation.failures
      : [];
    const flagships = templates.map((template) => {
      const scorecard = qualityGate.scorecards[template.id];
      if (!scorecard) throw new Error(`Missing flagship scorecard for ${template.id}.`);
      const minimumDimensionScore = Math.min(...scorecard.dimensions.map((dimension) => (
        dimension.score / dimension.maxScore * 100
      )));
      const minimumDimensionGate = qualityGate.minimumDimensionRatio * 100;
      const templateArtifacts = artifacts.filter((artifact) => artifact.templateId === template.id);
      const templatePreviewChecks = previewLayoutValidation.filter((item) => item.templateId === template.id);
      const failureReasons = [];
      if (templateArtifacts.length !== expectedVariantCount) {
        failureReasons.push(`expected ${expectedVariantCount} export variants, received ${templateArtifacts.length}`);
      }
      if (scorecard.totalScore < qualityGate.threshold) {
        failureReasons.push(`score ${scorecard.totalScore.toFixed(1)} is below ${qualityGate.threshold}`);
      }
      if (minimumDimensionScore < minimumDimensionGate) {
        failureReasons.push(`lowest dimension ${minimumDimensionScore.toFixed(1)} is below ${minimumDimensionGate.toFixed(1)}`);
      }
      const variants = templateArtifacts.map((artifact) => {
        const raster = visualEquivalence.find((item) => item.stem === artifact.stem);
        const failures = [];
        if (artifact.audit.error) failures.push(`${artifact.audit.error} audit error(s)`);
        if (!artifact.pdfFonts.allEmbedded) failures.push('PDF font embedding failed');
        if (artifact.pdfText.missingGlyphs.length || artifact.pdfText.missingPatterns.length) {
          failures.push(`PDF text missing ${[...artifact.pdfText.missingGlyphs, ...artifact.pdfText.missingPatterns].join(', ')}`);
        }
        if (artifact.svgLabelValidation.failures.length) {
          failures.push(`${artifact.svgLabelValidation.failures.length} image-label containment failure(s)`);
        }
        if (artifact.svgTextValidation.failures.length) {
          failures.push(`${artifact.svgTextValidation.failures.length} physical-font failure(s)`);
        }
        if (!raster) failures.push('PNG/PDF visual-equivalence result missing');
        else if (!raster.passed) failures.push(`PNG/PDF mismatch: ${raster.failures.join(', ') || 'unspecified'}`);
        if (failures.length) failureReasons.push(`${artifact.format}/${artifact.style}: ${failures.join(', ')}`);
        return {
          format: artifact.format,
          style: artifact.style,
          minimumFontPt: artifact.minimumFontPt,
          minimumAnnotationFontPt: artifact.minimumAnnotationFontPt,
          minimumStrokePt: artifact.minimumStrokePt,
          audit: artifact.audit,
          pdfFontsEmbedded: artifact.pdfFonts.allEmbedded,
          pdfTextPassed: artifact.pdfText.missingGlyphs.length === 0 && artifact.pdfText.missingPatterns.length === 0,
          imageLabelsPassed: artifact.svgLabelValidation.failures.length === 0,
          physicalTextPassed: artifact.svgTextValidation.failures.length === 0,
          rasterPassed: raster?.passed ?? false,
          failures,
        };
      });
      for (const preview of templatePreviewChecks) {
        if (preview.failures.length) {
          failureReasons.push(`${preview.viewport.id} preview: ${preview.failures.map((failure) => failure.code).join(', ')}`);
        }
      }
      for (const failure of rasterFailureRecords) {
        const serialized = JSON.stringify(failure);
        if (serialized.includes(template.id) || serialized.includes(template.slug)) {
          failureReasons.push(`raster validation: ${serialized}`);
        }
      }
      const uniqueFailures = [...new Set(failureReasons)];
      return {
        templateId: template.id,
        name: scorecard.name,
        rubricVersion: scorecard.rubricVersion,
        reviewedAt: scorecard.reviewedAt,
        reviewer: scorecard.reviewer,
        reviewedRevision: scorecard.reviewedRevision,
        scope: scorecard.scope,
        threshold: scorecard.threshold,
        totalScore: scorecard.totalScore,
        minimumDimensionScore,
        dimensions: scorecard.dimensions,
        layoutReviews: scorecard.layoutReviews,
        expectedVariantCount,
        variantCount: templateArtifacts.length,
        variants,
        previewCheckCount: templatePreviewChecks.reduce((sum, item) => sum + item.checkCount, 0),
        previewFailureCount: templatePreviewChecks.reduce((sum, item) => sum + item.failures.length, 0),
        failureReasons: uniqueFailures,
        passed: scorecard.passed && uniqueFailures.length === 0,
      };
    });
    const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, await sha256(path.join(root, file))])));
    const artifactFiles = (await walkFiles(outputRoot)).filter((file) => !file.endsWith('manifest.json') && !file.endsWith('REPORT.md'));
    const hashes = Object.fromEntries(await Promise.all(artifactFiles.map(async (file) => [
      path.relative(root, file).replaceAll('\\', '/'),
      await sha256(file),
    ])));
    const gitCommit = run('git', ['rev-parse', 'HEAD']).trim();
    const gitStatus = run('git', ['status', '--short']).trim();
    const manifest = {
      schemaVersion: 5,
      generatedAt,
      source: {
        gitCommit,
        dirty: Boolean(gitStatus),
        sourceHashes,
      },
      benchmark: {
        llmVlmPapers: 50,
        embodiedVlaPapers: 50,
        extractedFigures: 1289,
        corpus: 'docs/research/arxiv-figure-corpus.json',
      },
      acceptanceGate: {
        reviewerScore: qualityGate.threshold,
        minimumDimensionRatio: qualityGate.minimumDimensionRatio,
        minimumDimensionScore: qualityGate.minimumDimensionRatio * 10,
        rubricVersion: qualityGate.rubricVersion,
        critical: 0,
        previewThresholds,
        minimumTextPt: { paper: 7.5, presentation: 9 },
        requiredPdfGlyphs,
        requiredPdfTextPatterns,
        disclaimer: 'Export readiness is not venue acceptance or scientific validation.',
      },
      flagships,
      artifacts,
      finalQaArtifacts,
      previewLayoutValidation,
      rasterValidation,
      hashes,
      summary: {
        minimumFlagshipScore: Math.min(...flagships.map((item) => item.totalScore)),
        flagshipFailures: flagships.filter((item) => !item.passed).length,
        auditErrors: artifacts.reduce((sum, item) => sum + item.audit.error, 0),
        auditWarnings: artifacts.reduce((sum, item) => sum + item.audit.warning, 0),
        rasterFailures: rasterValidation.failures.length,
        pdfFontFailures: artifacts.filter((item) => !item.pdfFonts.allEmbedded).length,
        pdfTextFailures: artifacts.filter((item) => item.pdfText.missingGlyphs.length || item.pdfText.missingPatterns.length).length,
        svgLabelFailures: artifacts.reduce((sum, item) => sum + item.svgLabelValidation.failures.length, 0),
        svgTextFailures: artifacts.reduce((sum, item) => sum + item.svgTextValidation.failures.length, 0),
        previewLayoutChecks: previewLayoutValidation.reduce((sum, item) => sum + item.checkCount, 0),
        previewLayoutFailures: previewLayoutValidation.reduce((sum, item) => sum + item.failures.length, 0),
        coreArtifactFiles: artifacts.length * 3,
        accessibilityFiles: rasterValidation.accessibilityVariantCount,
        pdfRenderFiles: rasterValidation.pdfRenderCount,
        visualEquivalencePairs: rasterValidation.visualEquivalencePairCount,
        visualEquivalencePassed: rasterValidation.visualEquivalencePassedCount,
      },
    };
    await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(path.join(outputRoot, 'REPORT.md'), markdownReport(manifest), 'utf8');
    if (
      manifest.summary.flagshipFailures
      || manifest.summary.minimumFlagshipScore < manifest.acceptanceGate.reviewerScore
      || manifest.summary.auditErrors
      || manifest.summary.rasterFailures
      || manifest.summary.pdfFontFailures
      || manifest.summary.pdfTextFailures
      || manifest.summary.svgLabelFailures
      || manifest.summary.svgTextFailures
      || manifest.summary.previewLayoutFailures
    ) {
      throw new Error(`Evidence gate failed: ${JSON.stringify(manifest.summary)}`);
    }
    process.stdout.write(`publication evidence complete: ${path.relative(root, outputRoot)}\n`);
  } finally {
    if (browser) await browser.close();
    if (server.child && server.child.exitCode === null) server.child.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
