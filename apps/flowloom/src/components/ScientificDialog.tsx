import {
  BadgeCheck,
  Blocks,
  BookOpenCheck,
  ChartSpline,
  CheckCircle2,
  Cpu,
  Database,
  FileUp,
  Grid2X2,
  Info,
  LoaderCircle,
  ListChecks,
  Maximize2,
  Minimize2,
  Palette,
  Route,
  ScanSearch,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type {
  FlowEdge,
  FlowNode,
  ScientificChartType,
  ScientificFieldMap,
  ScientificFigureSpec,
  ScientificSchematicOptions,
  ScientificSchematicTemplateId,
} from '../types';
import {
  SCIENTIFIC_FIGURE_PRESETS,
  auditScientificFigure,
  buildScientificChartSpec,
  createEditableScientificChart,
  createScientificFigureLayout,
  parseScientificTable,
  renderScientificChartSvg,
  type EditableScientificChart,
  type ScientificChartOptions,
} from '../lib/scientific';
import {
  DEFAULT_SCIENTIFIC_SCHEMATIC_OPTIONS,
  SCIENTIFIC_SCHEMATIC_TEMPLATES,
  createScientificSchematic,
  defaultScientificSchematicBackbone,
  defaultScientificSchematicTitle,
  type EditableScientificSchematic,
} from '../lib/scientificSchematics';
import {
  ARXIV_FIGURE_CORPUS_SUMMARY,
  getScientificFigureRecipe,
} from '../lib/scientificFigureRecipes';
import { assessFlagshipQualityScope, FLAGSHIP_TEMPLATE_IDS } from '../lib/flagshipQuality';
import { IconButton } from './IconButton';
import { ShapeVisual } from './ShapeVisual';
import { routeScientificEdge, scientificConnectionPoint } from '../lib/scientificRouting';
import {
  isScientificShapeKind,
  layoutScientificImageLabel,
  layoutSchematicNodeContent,
  scientificNodeTextPaddingX,
} from '../lib/scientificNodeLayout';
import { estimateSvgTextWidth } from '../lib/diagram';

type ScientificTab = 'figure' | 'chart' | 'schematic' | 'quality';

const SCIENTIFIC_TAB_ORDER: ScientificTab[] = ['figure', 'chart', 'schematic', 'quality'];
const FLAGSHIP_TEMPLATE_ID_SET: ReadonlySet<ScientificSchematicTemplateId> = new Set(FLAGSHIP_TEMPLATE_IDS);

interface ScientificDialogProps {
  open: boolean;
  initialTab?: ScientificTab;
  nodes: FlowNode[];
  edges: FlowEdge[];
  figure?: ScientificFigureSpec;
  onClose: () => void;
  onOpenGoldBenchmark: () => void;
  onConfigureFigure: (spec: ScientificFigureSpec, layoutNodes: FlowNode[]) => void;
  onInsertChart: (chart: EditableScientificChart) => void;
  onInsertSchematic: (schematic: EditableScientificSchematic) => void;
}

const DEFAULT_FIGURE: ScientificFigureSpec = {
  widthMm: 180,
  heightMm: 120,
  dpi: 300,
  rows: 1,
  columns: 1,
  marginMm: 6,
  gapMm: 5,
  panelLabels: false,
  labelStyle: 'uppercase',
  background: '#ffffff',
  updatedAt: new Date(0).toISOString(),
};

const SAMPLE_DATA = `condition,time,value,error
Control,0,1.2,0.18
Control,1,2.1,0.22
Control,2,3.0,0.25
Control,3,3.7,0.31
Treatment,0,1.1,0.16
Treatment,1,2.8,0.24
Treatment,2,4.4,0.29
Treatment,3,5.6,0.35`;

const CHART_TYPES: Array<{ id: ScientificChartType; label: string }> = [
  { id: 'scatter', label: '散点' },
  { id: 'line', label: '折线' },
  { id: 'bar', label: '柱状' },
  { id: 'boxplot', label: '箱线' },
  { id: 'heatmap', label: '热图' },
  { id: 'errorbar', label: '误差线' },
];

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="scientific-number-field">
      <span>{label}</span>
      <span className="scientific-input-with-suffix">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

function FieldSelect({
  label,
  value,
  fields,
  optional = false,
  onChange,
}: {
  label: string;
  value?: string;
  fields: string[];
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {optional && <option value="">不映射</option>}
        {fields.map((field) => <option key={field} value={field}>{field}</option>)}
      </select>
    </label>
  );
}

function formatPanelLabel(index: number, style: ScientificFigureSpec['labelStyle']) {
  if (style === 'numeric') return String(index + 1);
  const label = String.fromCharCode(65 + (index % 26));
  return style === 'lowercase' ? label.toLowerCase() : label;
}

function FigureEditor({ value, onChange }: { value: ScientificFigureSpec; onChange: (value: ScientificFigureSpec) => void }) {
  const update = <Key extends keyof ScientificFigureSpec>(key: Key, next: ScientificFigureSpec[Key]) => onChange({ ...value, [key]: next });
  return (
    <div className="scientific-figure-workspace">
      <section className="scientific-settings-pane" aria-label="科研图版规格">
        <div className="scientific-section-heading">
          <div><strong>物理尺寸</strong><span>最终导出的实际宽高，不是屏幕缩放比例</span></div>
        </div>
        <div className="figure-preset-list" role="group" aria-label="常用图版尺寸">
          {SCIENTIFIC_FIGURE_PRESETS.map((preset) => {
            const active = value.widthMm === preset.widthMm && value.heightMm === preset.heightMm;
            return (
              <button
                key={preset.id}
                className={active ? 'is-active' : ''}
                aria-pressed={active}
                onClick={() => onChange({ ...value, widthMm: preset.widthMm, heightMm: preset.heightMm })}
              >
                <strong>{preset.label}</strong><span>{preset.detail}</span>
              </button>
            );
          })}
        </div>
        <div className="scientific-field-grid scientific-field-grid--three">
          <NumberField label="宽度" value={value.widthMm} min={20} max={500} step={0.1} suffix="mm" onChange={(next) => update('widthMm', next)} />
          <NumberField label="高度" value={value.heightMm} min={20} max={500} step={0.1} suffix="mm" onChange={(next) => update('heightMm', next)} />
          <NumberField label="位图 DPI" value={value.dpi} min={72} max={1200} suffix="dpi" onChange={(next) => update('dpi', next)} />
        </div>

        <div className="scientific-section-heading scientific-section-heading--divided">
          <div><strong>多面板网格</strong><span>面板边界是编辑辅助线，导出时自动隐藏</span></div>
        </div>
        <div className="scientific-field-grid scientific-field-grid--four">
          <NumberField label="行" value={value.rows} min={1} max={8} onChange={(next) => update('rows', next)} />
          <NumberField label="列" value={value.columns} min={1} max={8} onChange={(next) => update('columns', next)} />
          <NumberField label="页边距" value={value.marginMm} min={0} max={50} step={0.5} suffix="mm" onChange={(next) => update('marginMm', next)} />
          <NumberField label="面板间距" value={value.gapMm} min={0} max={50} step={0.5} suffix="mm" onChange={(next) => update('gapMm', next)} />
        </div>
        <div className="scientific-inline-options">
          <label className="toggle-row">
            <input type="checkbox" checked={value.panelLabels} onChange={(event) => update('panelLabels', event.target.checked)} />
            <span><strong>生成面板标签</strong><small>A / B / C 标签是可编辑文字对象</small></span>
          </label>
          <label className="field-stack">
            <span className="field-label">标签样式</span>
            <select value={value.labelStyle} onChange={(event) => update('labelStyle', event.target.value as ScientificFigureSpec['labelStyle'])}>
              <option value="uppercase">A, B, C</option>
              <option value="lowercase">a, b, c</option>
              <option value="numeric">1, 2, 3</option>
            </select>
          </label>
          <label className="field-stack">
            <span className="field-label">背景</span>
            <select value={value.background} onChange={(event) => update('background', event.target.value as ScientificFigureSpec['background'])}>
              <option value="#ffffff">白色</option>
              <option value="transparent">透明</option>
            </select>
          </label>
        </div>
      </section>

      <section className="scientific-preview-pane" aria-label="图版预览">
        <div className="scientific-preview-header"><strong>图版预览</strong><span>{value.widthMm} × {value.heightMm} mm · {value.dpi} DPI</span></div>
        <div className="figure-preview-stage">
          <div
            className={`figure-sheet ${value.background === 'transparent' ? 'is-transparent' : ''}`}
            style={{ aspectRatio: `${Math.max(1, value.widthMm)} / ${Math.max(1, value.heightMm)}` }}
          >
            <div
              className="figure-panel-grid"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, value.columns)}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${Math.max(1, value.rows)}, minmax(0, 1fr))`,
                gap: `${Math.max(2, Math.min(18, value.gapMm * 1.6))}px`,
                padding: `${Math.max(4, Math.min(24, value.marginMm * 1.6))}px`,
              }}
            >
              {Array.from({ length: Math.max(1, value.rows * value.columns) }, (_, index) => (
                <div key={index} className="figure-panel-preview">
                  {value.panelLabels && <strong>{formatPanelLabel(index, value.labelStyle)}</strong>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="scientific-note"><Info size={15} /><span>尺寸预设是常见起点，不代表任何期刊的自动认证；投稿前仍需核对目标期刊当期指南。</span></div>
      </section>
    </div>
  );
}

function ChartEditor({
  sourceData,
  sourceName,
  chartType,
  fields,
  title,
  xUnit,
  yUnit,
  uncertainty,
  previewSvg,
  previewError,
  previewBusy,
  onSourceData,
  onSourceFile,
  onChartType,
  onFields,
  onTitle,
  onXUnit,
  onYUnit,
  onUncertainty,
}: {
  sourceData: string;
  sourceName: string;
  chartType: ScientificChartType;
  fields: ScientificFieldMap;
  title: string;
  xUnit: string;
  yUnit: string;
  uncertainty: string;
  previewSvg: string;
  previewError: string;
  previewBusy: boolean;
  onSourceData: (value: string) => void;
  onSourceFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onChartType: (value: ScientificChartType) => void;
  onFields: (value: ScientificFieldMap) => void;
  onTitle: (value: string) => void;
  onXUnit: (value: string) => void;
  onYUnit: (value: string) => void;
  onUncertainty: (value: string) => void;
}) {
  const parsed = useMemo(() => {
    try {
      return { table: parseScientificTable(sourceData), error: '' };
    } catch (error) {
      return { table: null, error: error instanceof Error ? error.message : '数据无法解析。' };
    }
  }, [sourceData]);
  const headers = parsed.table?.headers ?? [];
  const numericFields = parsed.table?.numericFields ?? [];
  return (
    <div className="scientific-chart-workspace">
      <section className="scientific-chart-config" aria-label="数据和图表映射">
        <div className="scientific-chart-source-header">
          <div><strong>CSV 数据</strong><span>{parsed.table ? `${parsed.table.rows.length} 行 · ${headers.length} 列` : parsed.error}</span></div>
          <label className="secondary-button compact-upload">
            <FileUp size={15} />上传
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={onSourceFile} />
          </label>
        </div>
        <textarea
          className="scientific-data-editor"
          value={sourceData}
          onChange={(event) => onSourceData(event.target.value)}
          aria-label="CSV 原始数据"
          spellCheck={false}
        />
        <span className="scientific-source-name"><Database size={13} />{sourceName}</span>

        <div className="scientific-section-heading scientific-section-heading--divided"><div><strong>图表类型</strong><span>使用色盲友好配色和冗余视觉编码</span></div></div>
        <div className="scientific-chart-types" role="group" aria-label="图表类型">
          {CHART_TYPES.map((type) => (
            <button key={type.id} className={chartType === type.id ? 'is-active' : ''} aria-pressed={chartType === type.id} onClick={() => onChartType(type.id)}>{type.label}</button>
          ))}
        </div>
        <label className="field-stack">
          <span className="field-label">图表标题</span>
          <input value={title} onChange={(event) => onTitle(event.target.value)} placeholder="可留空" />
        </label>
        <div className="scientific-field-grid scientific-field-grid--two">
          <FieldSelect label="X 字段" value={fields.x} fields={headers} onChange={(value) => onFields({ ...fields, x: value })} />
          <FieldSelect label="Y 字段" value={fields.y} fields={numericFields.length ? numericFields : headers} onChange={(value) => onFields({ ...fields, y: value })} />
          <FieldSelect label={chartType === 'heatmap' ? '颜色数值' : '分组 / 颜色'} value={fields.color} fields={chartType === 'heatmap' ? numericFields : headers} optional onChange={(value) => onFields({ ...fields, color: value || undefined })} />
          {chartType === 'errorbar' && <FieldSelect label="误差字段" value={fields.error} fields={numericFields} onChange={(value) => onFields({ ...fields, error: value || undefined })} />}
        </div>
        <div className="scientific-field-grid scientific-field-grid--two">
          <label className="field-stack"><span className="field-label">X 单位</span><input value={xUnit} onChange={(event) => onXUnit(event.target.value)} placeholder="例如 s" /></label>
          <label className="field-stack"><span className="field-label">Y 单位</span><input value={yUnit} onChange={(event) => onYUnit(event.target.value)} placeholder="例如 μm" /></label>
        </div>
        {chartType === 'errorbar' && (
          <label className="field-stack"><span className="field-label">误差含义</span><input value={uncertainty} onChange={(event) => onUncertainty(event.target.value)} placeholder="例如 mean ± SEM, n = 6" /></label>
        )}
      </section>

      <section className="scientific-preview-pane scientific-chart-preview" aria-label="科研图表预览">
        <div className="scientific-preview-header"><strong>矢量预览</strong><span>Vega-Lite · 插入后逐图元编辑</span></div>
        <div className={`scientific-chart-canvas ${previewError ? 'has-error' : ''}`}>
          {previewBusy && <div className="scientific-preview-state"><LoaderCircle className="spin" size={20} />生成预览</div>}
          {!previewBusy && previewError && <div className="scientific-preview-state is-error"><TriangleAlert size={20} /><strong>无法生成图表</strong><span>{previewError}</span></div>}
          {!previewBusy && !previewError && previewSvg && <div className="scientific-svg-preview" dangerouslySetInnerHTML={{ __html: previewSvg }} />}
        </div>
        <div className="scientific-note"><Info size={15} /><span>插入时会保存原始 CSV、字段映射、单位、图表规范和误差定义；数据不会上传到服务器。</span></div>
      </section>
    </div>
  );
}

function previewNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function SchematicPreview({ schematic }: { schematic: EditableScientificSchematic }) {
  const markerPrefix = useId().replaceAll(':', '');
  const boxes = new Map(schematic.nodes.map((node) => [node.id, {
    x: node.position.x,
    y: node.position.y,
    width: previewNumber(node.style?.width, 160),
    height: previewNumber(node.style?.height, 72),
  }]));
  const edgeRoute = (edge: EditableScientificSchematic['edges'][number]) => {
    const source = boxes.get(edge.source);
    const target = boxes.get(edge.target);
    if (!source || !target) return undefined;
    const from = scientificConnectionPoint(source, edge.sourceHandle, target);
    const to = scientificConnectionPoint(target, edge.targetHandle, source);
    return routeScientificEdge(edge, from, to);
  };
  const sortedNodes = [...schematic.nodes].sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
  const backgroundNodes = sortedNodes.filter((node) => node.data.schematicRole === 'frame' || node.data.schematicRole === 'phase');
  const foregroundNodes = sortedNodes.filter((node) => node.data.schematicRole !== 'frame' && node.data.schematicRole !== 'phase');
  const renderNode = (node: FlowNode) => {
    const box = boxes.get(node.id)!;
    const isFrame = node.data.schematicRole === 'frame' || node.data.schematicRole === 'phase';
    const isImage = node.data.kind === 'image' && Boolean(node.data.imageUrl);
    const imageLabel = isImage ? layoutScientificImageLabel(node.data, box.width, box.height) : undefined;
    const textLayout = layoutSchematicNodeContent(node.data, box.width, box.height);
    const lines = isImage ? [] : textLayout.labelLines;
    const fontSize = node.data.fontSize;
    const descriptionLines = isImage ? [] : textLayout.descriptionLines;
    const descriptionSize = textLayout.descriptionFontSize;
    const visualHeight = textLayout.visualHeight;
    const horizontalPadding = scientificNodeTextPaddingX(node.data);
    const textAnchor = isFrame || node.data.textAlign === 'left'
      ? 'start'
      : node.data.textAlign === 'right'
        ? 'end'
        : 'middle';
    const textX = isFrame || node.data.textAlign === 'left'
      ? box.x + horizontalPadding
      : node.data.textAlign === 'right'
        ? box.x + box.width - horizontalPadding
        : box.x + box.width / 2;
    return (
      <g
        key={node.id}
        data-flowloom-preview-node-id={node.id}
        data-flowloom-preview-role={node.data.schematicRole}
        data-flowloom-preview-kind={node.data.kind}
      >
        <rect
          data-flowloom-preview-node-box={node.id}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          fill="transparent"
          stroke="none"
          pointerEvents="none"
        />
        {isImage ? (
          <>
            <image
              href={node.data.imageUrl}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              preserveAspectRatio={node.data.imageFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
            />
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={node.data.radius}
              fill="none"
              stroke={node.data.stroke}
              strokeWidth={node.data.borderWidth}
            />
            {imageLabel && (
              <g data-flowloom-preview-image-label={node.id}>
                <rect
                  data-flowloom-preview-image-label-bg={node.id}
                  x={box.x + imageLabel.x}
                  y={box.y + imageLabel.y}
                  width={imageLabel.width}
                  height={imageLabel.height}
                  rx="2"
                  fill="#17232d"
                  fillOpacity="0.9"
                />
                <text
                  x={box.x + imageLabel.x + imageLabel.paddingX}
                  fill="#ffffff"
                  fontSize={imageLabel.fontSize}
                  fontWeight={node.data.fontWeight}
                  textAnchor="start"
                >
                  {imageLabel.lines.map((line, index) => (
                    <tspan
                      key={`${node.id}-image-label-${index}`}
                      data-flowloom-preview-image-label-line={node.id}
                      data-flowloom-preview-line-index={index}
                      x={box.x + imageLabel.x + imageLabel.paddingX}
                      y={box.y + imageLabel.baseline + index * imageLabel.lineHeight}
                    >{line}</tspan>
                  ))}
                </text>
              </g>
            )}
          </>
        ) : isFrame && !isScientificShapeKind(node.data.kind) ? (
          <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={node.data.radius} fill={node.data.fill} stroke={node.data.stroke} strokeWidth={node.data.borderWidth} />
        ) : node.data.kind === 'ellipse' ? (
          <ellipse cx={box.x + box.width / 2} cy={box.y + box.height / 2} rx={box.width / 2} ry={box.height / 2} fill={node.data.fill} stroke={node.data.stroke} strokeWidth={node.data.borderWidth} />
        ) : (
          <ShapeVisual
            kind={node.data.kind}
            x={box.x}
            y={box.y}
            width={box.width}
            height={visualHeight}
            fill={node.data.fill}
            stroke={node.data.stroke}
            strokeWidth={node.data.borderWidth}
            radius={node.data.radius}
            variant={node.data.scientificVariant}
          />
        )}
        <g data-flowloom-preview-label={node.id}>
          {lines.map((line, index) => (
            <text
              key={`${node.id}-${index}`}
              data-flowloom-preview-label-line={node.id}
              data-flowloom-preview-line-index={index}
              x={textX}
              y={box.y + textLayout.labelStartY + index * textLayout.labelLineHeight}
              fill={node.data.textColor}
              fontSize={fontSize}
              fontWeight={node.data.fontWeight}
              textAnchor={textAnchor}
            >{line}</text>
          ))}
        </g>
        <g data-flowloom-preview-description={node.id}>
          {descriptionLines.map((description, index) => (
            <text
              key={`${node.id}-description-${index}`}
              data-flowloom-preview-description-line={node.id}
              data-flowloom-preview-line-index={index}
              x={textX}
              y={box.y + textLayout.descriptionStartY + index * textLayout.descriptionLineHeight}
              fill={node.data.textColor}
              fillOpacity="0.82"
              fontSize={descriptionSize}
              fontWeight="500"
              textAnchor={textAnchor}
            >{description}</text>
          ))}
        </g>
      </g>
    );
  };
  return (
    <svg
      className="schematic-svg-preview"
      viewBox={`0 0 ${schematic.width} ${schematic.height}`}
      fontFamily="Segoe UI, Microsoft YaHei UI, Arial, sans-serif"
      data-flowloom-preview-layout={schematic.layout}
      data-flowloom-preview-template-id={schematic.templateId}
      role="img"
      aria-label={`${schematic.title} 结构预览`}
    >
      <defs>
        {schematic.edges.map((edge, index) => (
          <marker key={edge.id} id={`${markerPrefix}-arrow-${index}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path
              d={`M 1 1 L 9 5 L 1 9${edge.data?.arrowEnd === 'open' ? '' : ' Z'}`}
              fill={edge.data?.arrowEnd === 'open' ? 'none' : edge.data?.color ?? '#4B5864'}
              stroke={edge.data?.color ?? '#4B5864'}
              strokeWidth="1.2"
            />
          </marker>
        ))}
      </defs>
      {backgroundNodes.map(renderNode)}
      {schematic.edges.map((edge, index) => {
        const route = edgeRoute(edge);
        if (!route) return null;
        const edgeLabel = String(edge.data?.label ?? edge.label ?? '').trim();
        const labelFontSize = Number(edge.data?.labelFontSize ?? 22);
        const labelX = route.label.x + Number(edge.data?.labelOffsetX ?? 0);
        const labelY = route.label.y + Number(edge.data?.labelOffsetY ?? 0);
        const labelBaseline = labelY - labelFontSize * 0.35;
        const labelPaddingX = Math.max(5, labelFontSize * 0.28);
        const labelPaddingY = Math.max(2, labelFontSize * 0.14);
        const labelWidth = estimateSvgTextWidth(edgeLabel, labelFontSize) + labelPaddingX * 2;
        const labelHeight = labelFontSize * 1.08 + labelPaddingY * 2;
        return (
          <g key={edge.id} data-flowloom-preview-edge-id={edge.id}>
            <path
              d={route.path}
              fill="none"
              stroke={edge.data?.color ?? '#4B5864'}
              strokeWidth={edge.data?.width ?? 1.65}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={edge.data?.lineStyle === 'dashed' ? '8 6' : edge.data?.lineStyle === 'dotted' ? '2 5' : undefined}
              markerEnd={edge.data?.arrowEnd === 'none' ? undefined : `url(#${markerPrefix}-arrow-${index})`}
            />
            {edgeLabel && (
              <g data-flowloom-edge-label="true">
                <rect
                  data-flowloom-edge-label-bg="true"
                  x={labelX - labelWidth / 2}
                  y={labelBaseline - labelFontSize * 0.88 - labelPaddingY}
                  width={labelWidth}
                  height={labelHeight}
                  rx="3"
                  fill="#ffffff"
                  fillOpacity="0.96"
                />
                <text
                  x={labelX}
                  y={labelBaseline}
                  fill={edge.data?.color ?? '#4B5864'}
                  fontSize={labelFontSize}
                  fontWeight="650"
                  textAnchor="middle"
                >{edgeLabel}</text>
              </g>
            )}
          </g>
        );
      })}
      {foregroundNodes.map(renderNode)}
    </svg>
  );
}

function SchematicEditor({
  options,
  schematic,
  onChange,
}: {
  options: ScientificSchematicOptions;
  schematic: EditableScientificSchematic;
  onChange: (value: ScientificSchematicOptions) => void;
}) {
  const selectedTemplate = SCIENTIFIC_SCHEMATIC_TEMPLATES.find((template) => template.id === options.templateId) ?? SCIENTIFIC_SCHEMATIC_TEMPLATES[0];
  const figureRecipe = getScientificFigureRecipe(options.templateId);
  const flagshipQuality = assessFlagshipQualityScope(options, schematic.layout);
  const [previewZoomed, setPreviewZoomed] = useState(false);
  const layoutLabel = schematic.layout === 'single-column'
    ? '89 mm 单栏重排'
    : schematic.layout === 'presentation'
      ? '16:9 汇报重排'
      : schematic.layout === 'double-column'
        ? '180 mm 双栏排版'
        : '自由画布';
  const selectTemplate = (templateId: ScientificSchematicTemplateId) => onChange({
    ...options,
    templateId,
    title: defaultScientificSchematicTitle(templateId, options.language),
    backbone: defaultScientificSchematicBackbone(templateId, options.language),
  });
  const selectLanguage = (language: ScientificSchematicOptions['language']) => {
    const previousDefault = defaultScientificSchematicBackbone(options.templateId, options.language);
    onChange({
      ...options,
      language,
      title: defaultScientificSchematicTitle(options.templateId, language),
      backbone: options.backbone === previousDefault
        ? defaultScientificSchematicBackbone(options.templateId, language)
        : options.backbone,
    });
  };
  return (
    <div className="scientific-schematic-workspace">
      <section className="scientific-schematic-config" aria-label="论文示意图配置">
        <div className="scientific-section-heading">
          <div><strong>结构原型</strong><span>{ARXIV_FIGURE_CORPUS_SUMMARY.paperCount} 篇论文 · {ARXIV_FIGURE_CORPUS_SUMMARY.parsedFigureCount.toLocaleString()} 个 Figure 的构图语料</span></div>
        </div>
        <div className="schematic-template-list" role="group" aria-label="论文示意图原型">
          {SCIENTIFIC_SCHEMATIC_TEMPLATES.map((template) => {
            const active = template.id === options.templateId;
            const flagship = FLAGSHIP_TEMPLATE_ID_SET.has(template.id);
            return (
              <button
                key={template.id}
                className={active ? 'is-active' : ''}
                aria-pressed={active}
                aria-label={`${template.name}${flagship ? '，旗舰模板' : ''}`}
                data-flagship-template={flagship ? 'true' : undefined}
                onClick={() => selectTemplate(template.id)}
              >
                <span className={`schematic-template-glyph schematic-template-glyph--${template.id}`} aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <span className="schematic-template-copy">
                  <span className="schematic-template-title">
                    <strong>{template.name}</strong>
                    {flagship && <span className="schematic-flagship-label"><CheckCircle2 size={12} aria-hidden="true" />旗舰</span>}
                  </span>
                  <small>{template.focus}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="scientific-section-heading scientific-section-heading--divided">
          <div><strong>论文图样式</strong><span>颜色仅承担模块角色，不作为装饰</span></div>
        </div>
        <label className="field-stack">
          <span className="field-label">图题</span>
          <input value={options.title} onChange={(event) => onChange({ ...options, title: event.target.value })} />
        </label>
        <label className="field-stack">
          <span className="field-label">核心主干名称</span>
          <input value={options.backbone} onChange={(event) => onChange({ ...options, backbone: event.target.value })} placeholder="VLM Backbone" />
        </label>
        <div className="schematic-option-row">
          <div className="field-stack">
            <span className="field-label">视觉风格</span>
            <div className="scientific-segmented" role="group" aria-label="示意图视觉风格">
              {([
                ['conference', '论文彩色'],
                ['technical', '汇报增强'],
                ['monochrome', '黑白印刷'],
              ] as const).map(([value, label]) => <button key={value} className={options.style === value ? 'is-active' : ''} aria-pressed={options.style === value} onClick={() => onChange({ ...options, style: value })}>{label}</button>)}
            </div>
          </div>
          <div className="field-stack">
            <span className="field-label">结构密度</span>
            <div className="scientific-segmented" role="group" aria-label="示意图结构密度">
              {([
                ['compact', '精简'],
                ['standard', '标准'],
                ['detailed', '详细'],
              ] as const).map(([value, label]) => <button key={value} className={options.density === value ? 'is-active' : ''} aria-pressed={options.density === value} onClick={() => onChange({ ...options, density: value })}>{label}</button>)}
            </div>
          </div>
        </div>
        <div className="field-stack">
          <span className="field-label">图中文字</span>
          <div className="scientific-segmented scientific-segmented--short" role="group" aria-label="示意图文字语言">
            <button className={options.language === 'en' ? 'is-active' : ''} aria-pressed={options.language === 'en'} onClick={() => selectLanguage('en')}>English</button>
            <button className={options.language === 'zh' ? 'is-active' : ''} aria-pressed={options.language === 'zh'} onClick={() => selectLanguage('zh')}>中文</button>
          </div>
        </div>

        <div className="scientific-section-heading scientific-section-heading--divided">
          <div><strong>Figure 绘制配方</strong><span>{figureRecipe.aspectRatio} · {figureRecipe.elements.length} 类必要元素 · {figureRecipe.steps.length} 步</span></div>
        </div>
        <div className="schematic-recipe-overview">
          <div><span>阅读顺序</span><p>{figureRecipe.readingOrder}</p></div>
          <div><span>视觉中心</span><p>{figureRecipe.focalPoint}</p></div>
          <div><span>证据</span><p>{figureRecipe.evidence}</p></div>
        </div>
        <div className="schematic-recipe-zones" aria-label="版式区域">
          {figureRecipe.zones.map((zone) => <span key={zone}>{zone}</span>)}
        </div>
        <details className="schematic-recipe" open>
          <summary><BookOpenCheck size={14} />元素与视觉语义</summary>
          <div className="schematic-recipe-elements">
            {figureRecipe.elements.map((element) => (
              <div key={`${element.kind}-${element.label}`}>
                <span><ShapeVisual kind={element.kind} strokeWidth={1.3} /></span>
                <p><strong>{element.label}</strong><small>{element.purpose}</small></p>
              </div>
            ))}
          </div>
          <div className="schematic-recipe-rules">
            <div><strong><Route size={13} />箭头</strong>{figureRecipe.arrowRules.map((rule) => <p key={rule}>{rule}</p>)}</div>
            <div><strong><Palette size={13} />颜色</strong>{figureRecipe.colorRules.map((rule) => <p key={rule}>{rule}</p>)}</div>
          </div>
        </details>
        <details className="schematic-recipe" open>
          <summary><ListChecks size={14} />具体绘制步骤</summary>
          <ol>{figureRecipe.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </details>
        <details className="schematic-recipe">
          <summary><ScanSearch size={14} />投稿前检查</summary>
          <ul>{figureRecipe.checks.map((check) => <li key={check}>{check}</li>)}</ul>
        </details>
      </section>

      <details className="scientific-schematic-preview-dock" open>
        <summary>
          <span><Cpu size={14} aria-hidden="true" />投稿级预览</span>
          <span>{layoutLabel} · {schematic.nodes.length} 个对象</span>
        </summary>
        <section className="scientific-preview-pane scientific-schematic-preview" aria-label="论文示意图预览">
          <div className="scientific-preview-header">
            <strong>投稿级原生图元预览</strong>
            <span>{layoutLabel} · {schematic.nodes.length} 个对象 · {schematic.edges.length} 条连接</span>
            <IconButton
              label={previewZoomed ? '适合预览' : '放大预览'}
              icon={previewZoomed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              active={previewZoomed}
              className="schematic-preview-zoom"
              onClick={() => setPreviewZoomed((value) => !value)}
            />
          </div>
          {flagshipQuality.status !== 'not-flagship' && flagshipQuality.scorecard && (
            <div
              className={`flagship-quality-strip flagship-quality-strip--${flagshipQuality.status}`}
              role="status"
              data-flagship-quality-status={flagshipQuality.status}
              data-flagship-template-id={options.templateId}
            >
              {flagshipQuality.status === 'reviewed'
                ? <CheckCircle2 size={17} aria-hidden="true" />
                : <TriangleAlert size={17} aria-hidden="true" />}
              <span>
                <strong>{flagshipQuality.status === 'reviewed'
                  ? `独立盲评 ${flagshipQuality.scorecard.totalScore.toFixed(1)}/100`
                  : '当前变体需要独立复核'}</strong>
                <small>{flagshipQuality.reasons.join(' · ')} · 量表 {flagshipQuality.scorecard.rubricVersion}</small>
              </span>
            </div>
          )}
          <div className={`schematic-preview-stage ${previewZoomed ? 'is-zoomed' : ''}`}><SchematicPreview schematic={schematic} /></div>
          <div className="schematic-reference-strip">
            <span><Cpu size={14} />构图研究</span>
            <div>{selectedTemplate.references.map((reference) => (
              <a key={`${reference.arxivId}-${reference.figure}`} href={`https://arxiv.org/abs/${reference.arxivId}`} target="_blank" rel="noreferrer">{reference.title} · {reference.figure}</a>
            ))}</div>
          </div>
        </section>
      </details>
    </div>
  );
}

function QualityView({ nodes, edges, figure }: { nodes: FlowNode[]; edges: FlowEdge[]; figure?: ScientificFigureSpec }) {
  const issues = useMemo(() => auditScientificFigure(nodes, figure, edges), [edges, figure, nodes]);
  const counts = {
    error: issues.filter((issue) => issue.severity === 'error').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
  };
  return (
    <div className="scientific-quality-workspace">
      <section className="quality-summary">
        <div><strong>{counts.error}</strong><span>必须处理</span></div>
        <div><strong>{counts.warning}</strong><span>建议复核</span></div>
        <div><strong>{counts.info}</strong><span>信息提示</span></div>
        <p>{figure ? `${figure.widthMm} × ${figure.heightMm} mm · ${figure.dpi} DPI` : '当前页未设置科研图版尺寸'}</p>
      </section>
      <section className="quality-issues" aria-label="科研质量检查结果">
        {issues.length === 0 ? (
          <div className="quality-empty"><CheckCircle2 size={24} /><strong>未发现自动检查问题</strong><span>仍需依据目标期刊指南人工复核内容、统计方法和版式。</span></div>
        ) : issues.map((issue) => (
          <article key={issue.id} className={`quality-issue quality-issue--${issue.severity}`}>
            <span>{issue.severity === 'error' ? <TriangleAlert size={17} /> : issue.severity === 'warning' ? <TriangleAlert size={17} /> : <Info size={17} />}</span>
            <div><strong>{issue.title}</strong><p>{issue.detail}</p>{(issue.nodeIds || issue.edgeIds) && <small>{issue.nodeIds ? `${issue.nodeIds.length} 个对象` : ''}{issue.nodeIds && issue.edgeIds ? ' · ' : ''}{issue.edgeIds ? `${issue.edgeIds.length} 条连接` : ''}</small>}</div>
          </article>
        ))}
      </section>
      <div className="scientific-compliance-note"><ScanSearch size={18} /><p><strong>这是一组可解释的预检规则，不是期刊认证。</strong>期刊要求会更新，而且同一期刊的不同栏目也可能采用不同规格。</p></div>
    </div>
  );
}

export function ScientificDialog({ open, initialTab = 'figure', nodes, edges, figure, onClose, onOpenGoldBenchmark, onConfigureFigure, onInsertChart, onInsertSchematic }: ScientificDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<ScientificTab>(initialTab);
  const [figureDraft, setFigureDraft] = useState<ScientificFigureSpec>(figure ?? DEFAULT_FIGURE);
  const [sourceData, setSourceData] = useState(SAMPLE_DATA);
  const [sourceName, setSourceName] = useState('示例实验数据.csv');
  const [chartType, setChartType] = useState<ScientificChartType>('scatter');
  const [fields, setFields] = useState<ScientificFieldMap>({ x: 'time', y: 'value', color: 'condition', error: 'error' });
  const [chartTitle, setChartTitle] = useState('Response over time');
  const [xUnit, setXUnit] = useState('h');
  const [yUnit, setYUnit] = useState('a.u.');
  const [uncertainty, setUncertainty] = useState('mean ± SEM');
  const [previewSvg, setPreviewSvg] = useState('');
  const [previewSpec, setPreviewSpec] = useState<Record<string, unknown> | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [schematicOptions, setSchematicOptions] = useState<ScientificSchematicOptions>(DEFAULT_SCIENTIFIC_SCHEMATIC_OPTIONS);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open && figure) setFigureDraft(figure);
  }, [figure, open]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [initialTab, open]);

  const chartOptions = useMemo<ScientificChartOptions>(() => ({
    title: chartTitle,
    sourceName,
    sourceData,
    chartType,
    fields,
    units: { [fields.x]: xUnit, [fields.y]: yUnit },
    uncertaintyDefinition: uncertainty,
  }), [chartTitle, chartType, fields, sourceData, sourceName, uncertainty, xUnit, yUnit]);

  const schematic = useMemo(
    () => createScientificSchematic(schematicOptions, figureDraft),
    [figureDraft, schematicOptions],
  );

  useEffect(() => {
    if (!open || tab !== 'chart') return;
    let active = true;
    setPreviewBusy(true);
    setPreviewError('');
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const table = parseScientificTable(sourceData);
          const spec = buildScientificChartSpec(table, chartOptions);
          const svg = await renderScientificChartSvg(spec);
          if (!active) return;
          setPreviewSpec(spec);
          setPreviewSvg(svg);
        } catch (error) {
          if (!active) return;
          setPreviewSpec(null);
          setPreviewSvg('');
          setPreviewError(error instanceof Error ? error.message : '图表无法生成。');
        } finally {
          if (active) setPreviewBusy(false);
        }
      })();
    }, 260);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [chartOptions, open, sourceData, tab]);

  useEffect(() => {
    try {
      const table = parseScientificTable(sourceData);
      const firstNumeric = table.numericFields[0] ?? table.headers[1] ?? table.headers[0] ?? '';
      const secondNumeric = table.numericFields[1] ?? firstNumeric;
      setFields((current) => ({
        x: table.headers.includes(current.x) ? current.x : table.headers[0] ?? '',
        y: table.headers.includes(current.y) ? current.y : firstNumeric,
        color: current.color && table.headers.includes(current.color) ? current.color : undefined,
        error: current.error && table.numericFields.includes(current.error) ? current.error : secondNumeric,
      }));
    } catch {
      // Keep the current mapping while the user is editing an incomplete row.
    }
  }, [sourceData]);

  const handleSourceFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((value) => {
      setSourceName(file.name);
      setSourceData(value);
    }).finally(() => { event.target.value = ''; });
  };

  const applyFigure = () => {
    setApplying(true);
    try {
      const layout = createScientificFigureLayout(figureDraft);
      onConfigureFigure(layout.spec, layout.nodes);
      setFigureDraft(layout.spec);
      onClose();
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '图版无法创建。');
    } finally {
      setApplying(false);
    }
  };

  const insertChart = async () => {
    if (!previewSpec || !previewSvg || previewError) return;
    setApplying(true);
    try {
      const chart = createEditableScientificChart(previewSvg, previewSpec, chartOptions);
      onInsertChart(chart);
      onClose();
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '图表无法转换为可编辑图元。');
    } finally {
      setApplying(false);
    }
  };

  const insertSchematic = () => {
    setApplying(true);
    try {
      onInsertSchematic(schematic);
      onClose();
    } finally {
      setApplying(false);
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = SCIENTIFIC_TAB_ORDER.indexOf(tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % SCIENTIFIC_TAB_ORDER.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + SCIENTIFIC_TAB_ORDER.length) % SCIENTIFIC_TAB_ORDER.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = SCIENTIFIC_TAB_ORDER.length - 1;
    else return;
    event.preventDefault();
    const nextTab = SCIENTIFIC_TAB_ORDER[nextIndex];
    setTab(nextTab);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog scientific-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="dialog-header scientific-dialog__header">
        <div className="dialog-title">
          <span className="dialog-title__icon"><ChartSpline size={18} /></span>
          <div><h2 id={titleId}>科研绘图工作台</h2><p>论文示意图、数据可视化、多面板图版与投稿前检查</p></div>
        </div>
        <div className="scientific-dialog__actions">
          <button className="secondary-button scientific-gold-entry" type="button" onClick={onOpenGoldBenchmark}>
            <BadgeCheck size={16} /><span>Gold 基准</span>
          </button>
          <IconButton label="关闭" icon={<X size={18} />} onClick={onClose} />
        </div>
      </div>
      <div className="scientific-tabs" role="tablist" aria-label="科研绘图任务">
        <button id={`${titleId}-tab-figure`} role="tab" aria-controls={`${titleId}-panel`} aria-selected={tab === 'figure'} tabIndex={tab === 'figure' ? 0 : -1} className={tab === 'figure' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setTab('figure')}><Grid2X2 size={16} />图版</button>
        <button id={`${titleId}-tab-chart`} role="tab" aria-controls={`${titleId}-panel`} aria-selected={tab === 'chart'} tabIndex={tab === 'chart' ? 0 : -1} className={tab === 'chart' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setTab('chart')}><ChartSpline size={16} />数据图表</button>
        <button id={`${titleId}-tab-schematic`} role="tab" aria-controls={`${titleId}-panel`} aria-selected={tab === 'schematic'} tabIndex={tab === 'schematic' ? 0 : -1} className={tab === 'schematic' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setTab('schematic')}><Blocks size={16} />论文示意图</button>
        <button id={`${titleId}-tab-quality`} role="tab" aria-controls={`${titleId}-panel`} aria-selected={tab === 'quality'} tabIndex={tab === 'quality' ? 0 : -1} className={tab === 'quality' ? 'is-active' : ''} onKeyDown={handleTabKeyDown} onClick={() => setTab('quality')}><ScanSearch size={16} />质量检查</button>
      </div>
      <div
        id={`${titleId}-panel`}
        className="scientific-dialog__body"
        role="tabpanel"
        aria-labelledby={`${titleId}-tab-${tab}`}
      >
        {tab === 'figure' && <FigureEditor value={figureDraft} onChange={setFigureDraft} />}
        {tab === 'chart' && (
          <ChartEditor
            sourceData={sourceData}
            sourceName={sourceName}
            chartType={chartType}
            fields={fields}
            title={chartTitle}
            xUnit={xUnit}
            yUnit={yUnit}
            uncertainty={uncertainty}
            previewSvg={previewSvg}
            previewError={previewError}
            previewBusy={previewBusy}
            onSourceData={setSourceData}
            onSourceFile={handleSourceFile}
            onChartType={setChartType}
            onFields={setFields}
            onTitle={setChartTitle}
            onXUnit={setXUnit}
            onYUnit={setYUnit}
            onUncertainty={setUncertainty}
          />
        )}
        {tab === 'schematic' && <SchematicEditor options={schematicOptions} schematic={schematic} onChange={setSchematicOptions} />}
        {tab === 'quality' && <QualityView nodes={nodes} edges={edges} figure={figure} />}
      </div>
      <div className="dialog-footer scientific-dialog__footer">
        <span className="scientific-footer-status">
          {tab === 'chart' && (previewBusy ? <><LoaderCircle className="spin" size={14} />正在生成</> : previewError ? <><TriangleAlert size={14} />需要修正数据映射</> : <><CheckCircle2 size={14} />可转换为可编辑 SVG 图元</>)}
          {tab === 'schematic' && <><Blocks size={14} />{schematic.nodes.length} 个原生对象，插入后可逐项编辑</>}
        </span>
        <button className="secondary-button" onClick={onClose}>取消</button>
        {tab === 'figure' && <button className="primary-button" disabled={applying} onClick={applyFigure}>{applying && <LoaderCircle className="spin" size={15} />}应用图版</button>}
        {tab === 'chart' && <button className="primary-button" disabled={applying || previewBusy || Boolean(previewError) || !previewSvg} onClick={() => void insertChart()}>{applying && <LoaderCircle className="spin" size={15} />}插入可编辑图表</button>}
        {tab === 'schematic' && <button className="primary-button" disabled={applying} onClick={insertSchematic}>{applying && <LoaderCircle className="spin" size={15} />}插入可编辑示意图</button>}
      </div>
    </dialog>
  );
}
