import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightToLine,
  ArrowUp,
  Blocks,
  BookOpenCheck,
  BringToFront,
  Database,
  Download,
  FileJson,
  Group,
  LockKeyhole,
  RotateCw,
  SendToBack,
  Sparkles,
  Ungroup,
} from 'lucide-react';
import { useState } from 'react';
import type {
  ArrowHead,
  FlowEdge,
  FlowNode,
  LineStyle,
  ScientificConnectorSemantic,
  ScientificEvidenceState,
  ScientificVisualVariant,
  ShapeKind,
  TextAlign,
  VerticalAlign,
} from '../types';
import {
  SHAPE_CATEGORY_LABELS,
  VISIBLE_SHAPES,
  getShapeDefinition,
  type ShapeCategory,
} from '../lib/shapeRegistry';
import { SCIENTIFIC_CONNECTOR_LABELS } from '../lib/scientificRouting';
import { getScientificVisualVariants } from '../lib/scientificVisualVariants';
import { useFlowStore } from '../store/flowStore';
import { IconButton } from './IconButton';
import { LayerPanel } from './LayerPanel';

const swatches = [
  'oklch(1 0 0)',
  'oklch(0.955 0.045 76)',
  'oklch(0.935 0.050 172)',
  'oklch(0.955 0.025 245)',
  'oklch(0.955 0.026 300)',
  'oklch(0.965 0.030 36)',
  'oklch(0.965 0.065 95)',
  'oklch(0.220 0.018 70)',
];

const categoryOrder = Object.keys(SHAPE_CATEGORY_LABELS) as Exclude<ShapeCategory, 'internal'>[];
const arrowLabels: Record<ArrowHead, string> = { none: '无', open: '开放', closed: '实心' };

function downloadInspectorData(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[\\/:*?"<>|]+/g, '-');
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

function ColorControl({
  label,
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <fieldset className="color-control">
      <legend>{label}</legend>
      <div className="swatch-row">
        {swatches.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch ${value === color ? 'is-active' : ''}`}
            style={{ background: color }}
            aria-label={`${label} ${color}`}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
      <input value={value} onChange={(event) => onChange(event.target.value)} onFocus={onFocus} onBlur={onBlur} aria-label={`${label} CSS 颜色值`} />
    </fieldset>
  );
}

interface InspectorProps {
  open: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  onOpenAi: () => void;
}

export function Inspector({ open, nodes, edges, onOpenAi }: InspectorProps) {
  const [panelTab, setPanelTab] = useState<'properties' | 'layers'>('properties');
  const layers = useFlowStore((state) => state.layers);
  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const isEffectivelyLocked = (node: FlowNode) => Boolean(
    node.data.locked || layerById.get(node.data.layerId ?? layers[0]?.id)?.locked,
  );
  const editableSelectedNodes = selectedNodes.filter((node) => !isEffectivelyLocked(node));
  const lockedSelectedCount = selectedNodes.length - editableSelectedNodes.length;
  const beginTransaction = useFlowStore((state) => state.beginTransaction);
  const endTransaction = useFlowStore((state) => state.endTransaction);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const updateSelectionData = useFlowStore((state) => state.updateSelectionData);
  const updateNodeStyle = useFlowStore((state) => state.updateNodeStyle);
  const updateNodePosition = useFlowStore((state) => state.updateNodePosition);
  const arrangeNode = useFlowStore((state) => state.arrangeNode);
  const updateEdge = useFlowStore((state) => state.updateEdge);
  const reverseEdge = useFlowStore((state) => state.reverseEdge);
  const alignSelection = useFlowStore((state) => state.alignSelection);
  const distributeSelection = useFlowStore((state) => state.distributeSelection);
  const groupSelection = useFlowStore((state) => state.groupSelection);
  const ungroupSelection = useFlowStore((state) => state.ungroupSelection);
  const layout = useFlowStore((state) => state.layout);
  const selectionCount = selectedNodes.length + selectedEdges.length;

  const transactionProps = { onFocus: beginTransaction, onBlur: endTransaction };

  return (
    <aside
      className={open ? 'inspector is-open' : 'inspector'}
      aria-label="属性检查器"
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="inspector__header">
        <div>
          <strong>属性</strong>
          <span className="inspector__selection">{selectionCount ? `已选择 ${selectionCount} 项` : '未选择图形'}</span>
        </div>
        <IconButton label="使用 AI 生成" icon={<Sparkles size={17} />} onClick={onOpenAi} />
      </div>

      <div className="inspector-tabs" role="tablist" aria-label="检查器视图">
        <button role="tab" aria-selected={panelTab === 'properties'} className={panelTab === 'properties' ? 'is-active' : ''} onClick={() => setPanelTab('properties')}>属性</button>
        <button role="tab" aria-selected={panelTab === 'layers'} className={panelTab === 'layers' ? 'is-active' : ''} onClick={() => setPanelTab('layers')}>图层</button>
      </div>

      {panelTab === 'layers' ? <LayerPanel nodes={nodes} /> : <div className="inspector__body">
        {selectedNodes.length > 1 && (
          <>
            {lockedSelectedCount > 0 && (
              <div className="inspector-readonly" role="status">
                已跳过 {lockedSelectedCount} 个锁定对象；可在“图层”中解锁。
              </div>
            )}
            <section className="inspector-section">
              <h2>对齐与分布</h2>
              <div className="icon-control-grid">
                <IconButton label="左对齐" icon={<AlignStartVertical size={16} />} disabled={editableSelectedNodes.length < 2} onClick={() => alignSelection('left')} />
                <IconButton label="水平居中" icon={<AlignCenterVertical size={16} />} disabled={editableSelectedNodes.length < 2} onClick={() => alignSelection('center-x')} />
                <IconButton label="右对齐" icon={<AlignEndVertical size={16} />} disabled={editableSelectedNodes.length < 2} onClick={() => alignSelection('right')} />
                <IconButton label="顶部对齐" icon={<AlignStartHorizontal size={16} />} disabled={editableSelectedNodes.length < 2} onClick={() => alignSelection('top')} />
                <IconButton label="垂直居中" icon={<AlignCenterHorizontal size={16} />} disabled={editableSelectedNodes.length < 2} onClick={() => alignSelection('center-y')} />
                <IconButton label="底部对齐" icon={<AlignEndHorizontal size={16} />} disabled={editableSelectedNodes.length < 2} onClick={() => alignSelection('bottom')} />
                <IconButton label="水平等距" icon={<AlignHorizontalDistributeCenter size={16} />} disabled={editableSelectedNodes.length < 3} onClick={() => distributeSelection('horizontal')} />
                <IconButton label="垂直等距" icon={<AlignVerticalDistributeCenter size={16} />} disabled={editableSelectedNodes.length < 3} onClick={() => distributeSelection('vertical')} />
              </div>
              <button className="secondary-button inspector-full-button" disabled={editableSelectedNodes.length < 2} onClick={groupSelection}><Group size={16} /> 分组所选图形</button>
            </section>
            {editableSelectedNodes[0] && <section className="inspector-section">
              <h2>批量外观</h2>
              <ColorControl label="填充" value={editableSelectedNodes[0].data.fill} onChange={(fill) => updateSelectionData({ fill })} onFocus={beginTransaction} onBlur={endTransaction} />
              <ColorControl label="边框" value={editableSelectedNodes[0].data.stroke} onChange={(stroke) => updateSelectionData({ stroke })} onFocus={beginTransaction} onBlur={endTransaction} />
              <ColorControl label="文字" value={editableSelectedNodes[0].data.textColor} onChange={(textColor) => updateSelectionData({ textColor })} onFocus={beginTransaction} onBlur={endTransaction} />
              <label className="field-stack inspector-spacing-top">
                <FieldLabel>透明度 {Math.round(editableSelectedNodes[0].data.opacity * 100)}%</FieldLabel>
                <input type="range" min="0" max="1" step="0.05" value={editableSelectedNodes[0].data.opacity} onChange={(event) => updateSelectionData({ opacity: Number(event.target.value) })} {...transactionProps} />
              </label>
            </section>}
          </>
        )}

        {selectedNodes.length === 1 && selectedEdges.length === 0 && (() => {
          const node = selectedNodes[0];
          const lockedByLayer = Boolean(layerById.get(node.data.layerId ?? layers[0]?.id)?.locked);
          const effectivelyLocked = Boolean(node.data.locked || lockedByLayer);
          const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? 176);
          const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? 72);
          const currentShapeDefinition = getShapeDefinition(node.data.kind);
          const scientificVariants = getScientificVisualVariants(node.data.kind);
          return (
            <>
              {effectivelyLocked && (
                <div className="inspector-readonly" role="status">
                  {lockedByLayer ? '所在图层已锁定；请先在“图层”中解锁。' : '图形已锁定；解锁后才能编辑。'}
                </div>
              )}
              <div className="inspector-edit-fields" inert={effectivelyLocked ? true : undefined} aria-disabled={effectivelyLocked}>
              <section className="inspector-section">
                <h2>内容</h2>
                <label className="field-stack">
                  <FieldLabel>文字</FieldLabel>
                  <textarea value={node.data.label} onChange={(event) => updateNodeData(node.id, { label: event.target.value })} rows={2} {...transactionProps} />
                </label>
                <label className="field-stack">
                  <FieldLabel>说明</FieldLabel>
                  <textarea value={node.data.description ?? ''} onChange={(event) => updateNodeData(node.id, { description: event.target.value })} rows={3} placeholder="可选" {...transactionProps} />
                </label>
                <label className="field-stack">
                  <FieldLabel>图形</FieldLabel>
                  <select value={node.data.kind} onChange={(event) => updateNodeData(node.id, { kind: event.target.value as ShapeKind })} {...transactionProps}>
                    {!currentShapeDefinition.visible && <option value={node.data.kind}>{currentShapeDefinition.label}</option>}
                    {categoryOrder.map((category) => (
                      <optgroup key={category} label={SHAPE_CATEGORY_LABELS[category]}>
                        {VISIBLE_SHAPES.filter((definition) => definition.category === category).map((definition) => (
                          <option key={definition.kind} value={definition.kind}>{definition.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {scientificVariants.length > 0 && (
                  <label className="field-stack">
                    <FieldLabel>科研视觉语义</FieldLabel>
                    <select
                      value={node.data.scientificVariant ?? 'default'}
                      onChange={(event) => updateNodeData(node.id, { scientificVariant: event.target.value as ScientificVisualVariant })}
                      {...transactionProps}
                    >
                      {scientificVariants.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                )}
                {(node.data.kind.startsWith('scientific-') || node.data.scientificEvidence) && (
                  <label className="field-stack">
                    <FieldLabel>证据状态</FieldLabel>
                    <select
                      value={node.data.scientificEvidence ?? ''}
                      onChange={(event) => updateNodeData(node.id, {
                        scientificEvidence: (event.target.value || undefined) as ScientificEvidenceState | undefined,
                      })}
                      {...transactionProps}
                    >
                      <option value="">未声明</option>
                      <option value="schematic">示意结构</option>
                      <option value="data-bound">数据绑定</option>
                    </select>
                  </label>
                )}
              </section>

              <section className="inspector-section">
                <h2>位置与尺寸</h2>
                <div className="field-pair">
                  <label><FieldLabel>X</FieldLabel><input type="number" value={Math.round(node.position.x)} onChange={(event) => updateNodePosition(node.id, { x: Number(event.target.value) })} {...transactionProps} /></label>
                  <label><FieldLabel>Y</FieldLabel><input type="number" value={Math.round(node.position.y)} onChange={(event) => updateNodePosition(node.id, { y: Number(event.target.value) })} {...transactionProps} /></label>
                </div>
                <label className="field-stack">
                  <FieldLabel>旋转角度</FieldLabel>
                  <span className="rotation-field"><RotateCw size={15} aria-hidden="true" /><input type="number" min="-360" max="360" step="1" value={node.data.rotation ?? 0} onChange={(event) => updateNodeData(node.id, { rotation: Number(event.target.value) })} {...transactionProps} /></span>
                </label>
                <div className="field-pair">
                  <label><FieldLabel>宽度</FieldLabel><input type="number" min="40" value={Math.round(width)} onChange={(event) => updateNodeStyle(node.id, { width: Number(event.target.value) })} {...transactionProps} /></label>
                  <label><FieldLabel>高度</FieldLabel><input type="number" min="36" value={Math.round(height)} onChange={(event) => updateNodeStyle(node.id, { height: Number(event.target.value) })} {...transactionProps} /></label>
                </div>
              </section>

              <section className="inspector-section">
                <h2>文字</h2>
                <div className="field-pair">
                  <label><FieldLabel>字号</FieldLabel><input type="number" min="10" max="48" value={node.data.fontSize} onChange={(event) => updateNodeData(node.id, { fontSize: Number(event.target.value) })} {...transactionProps} /></label>
                  <label><FieldLabel>字重</FieldLabel><select value={node.data.fontWeight} onChange={(event) => updateNodeData(node.id, { fontWeight: Number(event.target.value) })} {...transactionProps}><option value="400">常规</option><option value="600">半粗</option><option value="700">粗体</option></select></label>
                </div>
                <fieldset className="segmented-field segmented-field--icons">
                  <legend>水平对齐</legend>
                  {([
                    ['left', '左对齐', <AlignLeft key="left" size={15} />],
                    ['center', '居中', <AlignCenter key="center" size={15} />],
                    ['right', '右对齐', <AlignRight key="right" size={15} />],
                  ] as [TextAlign, string, React.ReactNode][]).map(([value, label, icon]) => (
                    <button key={value} type="button" title={label} aria-label={label} className={node.data.textAlign === value ? 'is-active' : ''} onClick={() => updateNodeData(node.id, { textAlign: value })}>{icon}</button>
                  ))}
                </fieldset>
                <fieldset className="segmented-field">
                  <legend>垂直对齐</legend>
                  {([['top', '顶部'], ['middle', '居中'], ['bottom', '底部']] as [VerticalAlign, string][]).map(([value, label]) => (
                    <button key={value} type="button" className={node.data.verticalAlign === value ? 'is-active' : ''} onClick={() => updateNodeData(node.id, { verticalAlign: value })}>{label}</button>
                  ))}
                </fieldset>
              </section>

              <section className="inspector-section">
                <h2>外观</h2>
                <ColorControl label="填充" value={node.data.fill} onChange={(fill) => updateNodeData(node.id, { fill })} onFocus={beginTransaction} onBlur={endTransaction} />
                <ColorControl label="边框" value={node.data.stroke} onChange={(stroke) => updateNodeData(node.id, { stroke })} onFocus={beginTransaction} onBlur={endTransaction} />
                <ColorControl label="文字" value={node.data.textColor} onChange={(textColor) => updateNodeData(node.id, { textColor })} onFocus={beginTransaction} onBlur={endTransaction} />
                <div className="field-pair inspector-spacing-top">
                  <label><FieldLabel>边框宽度</FieldLabel><input type="number" min="0" max="12" step="0.25" value={node.data.borderWidth} onChange={(event) => updateNodeData(node.id, { borderWidth: Number(event.target.value) })} {...transactionProps} /></label>
                  <label><FieldLabel>圆角</FieldLabel><input type="number" min="0" max="48" value={node.data.radius} onChange={(event) => updateNodeData(node.id, { radius: Number(event.target.value) })} {...transactionProps} /></label>
                </div>
                <label className="field-stack">
                  <FieldLabel>透明度 {Math.round(node.data.opacity * 100)}%</FieldLabel>
                  <input type="range" min="0" max="1" step="0.05" value={node.data.opacity} onChange={(event) => updateNodeData(node.id, { opacity: Number(event.target.value) })} {...transactionProps} />
                </label>
              </section>
              </div>

              {node.data.provenance && (
                <section className="inspector-section scientific-provenance">
                  <h2>
                    {node.data.provenance.kind === 'scientific-schematic' ? <Blocks size={15} /> : <Database size={15} />}
                    {node.data.provenance.kind === 'scientific-schematic' ? '论文构图来源' : '科研数据来源'}
                  </h2>
                  <dl>
                    <div><dt>来源</dt><dd>{node.data.provenance.sourceName}</dd></div>
                    {node.data.provenance.chartType && <div><dt>图表</dt><dd>{node.data.provenance.chartType}</dd></div>}
                    {node.data.provenance.schematic && <div><dt>方式</dt><dd>{node.data.provenance.schematic.generatedBy === 'ai' ? 'AI 结构生成' : '原生模板'}</dd></div>}
                    {node.data.provenance.schematic && <div><dt>样式</dt><dd>{node.data.provenance.schematic.style} · {node.data.provenance.schematic.density}</dd></div>}
                    {node.data.provenance.schematic?.references?.length && <div><dt>论文</dt><dd>{node.data.provenance.schematic.references.map((id) => `arXiv:${id}`).join(' · ')}</dd></div>}
                    {node.data.provenance.fields && (
                      <div><dt>映射</dt><dd>{Object.entries(node.data.provenance.fields).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ')}</dd></div>
                    )}
                    {node.data.provenance.engine && <div><dt>引擎</dt><dd>{node.data.provenance.engine}</dd></div>}
                    <div><dt>生成时间</dt><dd>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(node.data.provenance.generatedAt))}</dd></div>
                  </dl>
                  {node.data.provenance.uncertainty?.definition && <p><strong>误差定义：</strong>{node.data.provenance.uncertainty.definition}</p>}
                  <div className="provenance-actions">
                    {node.data.provenance.sourceData && (
                      <button
                        className="secondary-button"
                        onClick={() => {
                          const schematic = node.data.provenance!.kind === 'scientific-schematic';
                          downloadInspectorData(
                            schematic ? `${node.data.provenance!.sourceName || 'schematic'}.json` : node.data.provenance!.sourceName || 'source.csv',
                            node.data.provenance!.sourceData!,
                            schematic ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
                          );
                        }}
                      ><Download size={15} />{node.data.provenance.kind === 'scientific-schematic' ? '构图元数据' : '原始数据'}</button>
                    )}
                    {node.data.provenance.chartSpec && (
                      <button className="secondary-button" onClick={() => downloadInspectorData(`${node.data.provenance!.sourceName || 'chart'}.vl.json`, JSON.stringify(node.data.provenance!.chartSpec, null, 2), 'application/json;charset=utf-8')}><FileJson size={15} />图表规范</button>
                    )}
                  </div>
                </section>
              )}

              {node.data.diagramProvenance && (
                <section className="inspector-section scientific-provenance diagram-provenance">
                  <h2><BookOpenCheck size={15} />{node.data.diagramProvenance.sourceType === 'pdf-extraction' ? 'PDF 提取来源' : '论文语义来源'}</h2>
                  <dl>
                    {node.data.diagramProvenance.paperRef && <div><dt>论文</dt><dd>{node.data.diagramProvenance.paperRef}</dd></div>}
                    {node.data.diagramProvenance.page && <div><dt>定位</dt><dd>p.{node.data.diagramProvenance.page}{node.data.diagramProvenance.figure ? ` · ${node.data.diagramProvenance.figure}` : ''}</dd></div>}
                    {node.data.diagramProvenance.model && <div><dt>模型</dt><dd>{node.data.diagramProvenance.model}</dd></div>}
                    {node.data.diagramProvenance.templateIds?.length && <div><dt>模板</dt><dd>{node.data.diagramProvenance.templateIds.join(' · ')}</dd></div>}
                    {typeof node.data.diagramProvenance.confidence === 'number' && <div><dt>置信度</dt><dd>{Math.round(node.data.diagramProvenance.confidence * 100)}%</dd></div>}
                  </dl>
                  {node.data.diagramProvenance.quote && <p><strong>证据：</strong>{node.data.diagramProvenance.quote}</p>}
                  {node.data.diagramProvenance.warnings.length > 0 && <ul>{node.data.diagramProvenance.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                </section>
              )}

              <section className="inspector-section">
                <h2>排列</h2>
                <div className="icon-control-grid icon-control-grid--arrange">
                  <IconButton label="置于顶层" icon={<BringToFront size={16} />} disabled={effectivelyLocked} onClick={() => arrangeNode(node.id, 'front')} />
                  <IconButton label="上移一层" icon={<ArrowUp size={16} />} disabled={effectivelyLocked} onClick={() => arrangeNode(node.id, 'forward')} />
                  <IconButton label="下移一层" icon={<ArrowDown size={16} />} disabled={effectivelyLocked} onClick={() => arrangeNode(node.id, 'backward')} />
                  <IconButton label="置于底层" icon={<SendToBack size={16} />} disabled={effectivelyLocked} onClick={() => arrangeNode(node.id, 'back')} />
                </div>
                <label className="toggle-row">
                  <input type="checkbox" checked={Boolean(node.data.locked)} disabled={lockedByLayer} onChange={(event) => updateNodeData(node.id, { locked: event.target.checked })} />
                  <LockKeyhole size={15} aria-hidden="true" /> 锁定图形
                </label>
                {node.data.kind === 'group' && <button className="secondary-button inspector-full-button" disabled={effectivelyLocked} onClick={ungroupSelection}><Ungroup size={16} /> 取消分组</button>}
              </section>
            </>
          );
        })()}

        {selectedEdges.length === 1 && selectedNodes.length === 0 && (() => {
          const edge = selectedEdges[0];
          return (
            <section className="inspector-section">
              <h2>连接线</h2>
              <label className="field-stack">
                <FieldLabel>标签</FieldLabel>
                <input value={String(edge.data?.label ?? edge.label ?? '')} onChange={(event) => updateEdge(edge.id, { label: event.target.value })} {...transactionProps} />
              </label>
              <label className="field-stack">
                <FieldLabel>科研语义</FieldLabel>
                <select
                  value={edge.data?.scientificSemantic ?? ''}
                  onChange={(event) => updateEdge(edge.id, {
                    scientificSemantic: (event.target.value || undefined) as ScientificConnectorSemantic | undefined,
                  })}
                >
                  <option value="">普通连接线</option>
                  {(Object.keys(SCIENTIFIC_CONNECTOR_LABELS) as ScientificConnectorSemantic[]).map((semantic) => (
                    <option key={semantic} value={semantic}>{SCIENTIFIC_CONNECTOR_LABELS[semantic]}</option>
                  ))}
                </select>
              </label>
              <fieldset className="segmented-field">
                <legend>路径</legend>
                {(['smoothstep', 'straight', 'bezier'] as const).map((routing) => (
                  <button key={routing} type="button" className={edge.data?.routing === routing ? 'is-active' : ''} onClick={() => updateEdge(edge.id, { routing })}>
                    {routing === 'smoothstep' ? '折线' : routing === 'straight' ? '直线' : '曲线'}
                  </button>
                ))}
              </fieldset>
              <fieldset className="segmented-field">
                <legend>线型</legend>
                {(['solid', 'dashed', 'dotted'] as LineStyle[]).map((lineStyle) => (
                  <button key={lineStyle} type="button" className={edge.data?.lineStyle === lineStyle ? 'is-active' : ''} onClick={() => updateEdge(edge.id, { lineStyle })}>
                    {lineStyle === 'solid' ? '实线' : lineStyle === 'dashed' ? '虚线' : '点线'}
                  </button>
                ))}
              </fieldset>
              {(['arrowStart', 'arrowEnd'] as const).map((field) => (
                <fieldset key={field} className="segmented-field">
                  <legend>{field === 'arrowStart' ? '起点箭头' : '终点箭头'}</legend>
                  {(Object.keys(arrowLabels) as ArrowHead[]).map((arrow) => (
                    <button key={arrow} type="button" className={edge.data?.[field] === arrow ? 'is-active' : ''} onClick={() => updateEdge(edge.id, { [field]: arrow })}>{arrowLabels[arrow]}</button>
                  ))}
                </fieldset>
              ))}
              <label className="field-stack">
                <FieldLabel>线宽 {edge.data?.width ?? 1.75}px</FieldLabel>
                <input type="range" min="1" max="6" step="0.25" value={edge.data?.width ?? 1.75} onChange={(event) => updateEdge(edge.id, { width: Number(event.target.value) })} {...transactionProps} />
              </label>
              <ColorControl label="线条" value={edge.data?.color ?? 'oklch(0.430 0.025 70)'} onChange={(color) => updateEdge(edge.id, { color })} onFocus={beginTransaction} onBlur={endTransaction} />
              <button className="secondary-button inspector-full-button" onClick={() => reverseEdge(edge.id)}><ArrowLeftRight size={16} /> 反转连接线</button>
            </section>
          );
        })()}

        {selectionCount === 0 && (
          <>
            <section className="inspector-section inspector-section--summary">
              <div><span>节点</span><strong>{nodes.length}</strong></div>
              <div><span>连线</span><strong>{edges.length}</strong></div>
            </section>
            <section className="inspector-section">
              <h2>自动布局</h2>
              <div className="layout-actions">
                <button className="secondary-button" onClick={() => layout('TB')}><ArrowDownToLine size={16} /> 纵向</button>
                <button className="secondary-button" onClick={() => layout('LR')}><ArrowRightToLine size={16} /> 横向</button>
              </div>
            </section>
          </>
        )}
      </div>}
    </aside>
  );
}
