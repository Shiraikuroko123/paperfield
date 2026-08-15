import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  CheckCircle2,
  Code2,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { FlowNode, ImportResult } from '../types';
import { importDiagramSource, type CodeDiagramFormat } from '../lib/fileAdapters';
import { getShapeDefinition } from '../lib/shapeRegistry';
import { IconButton } from './IconButton';

interface CodeDialogProps {
  open: boolean;
  documentTitle: string;
  onClose: () => void;
  onApply: (result: ImportResult) => void;
}

interface FormatOption {
  id: CodeDiagramFormat;
  label: string;
  scope: string;
  example: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'mermaid',
    label: 'Mermaid',
    scope: 'flowchart / graph',
    example: `flowchart LR
  start([开始]) --> check{资料完整？}
  check -->|是| publish[发布]
  check -->|否| revise[补充资料]
  revise --> check`,
  },
  {
    id: 'dot',
    label: 'Graphviz DOT',
    scope: 'digraph',
    example: `digraph flow {
  rankdir=LR;
  start [label="开始", shape=oval];
  check [label="资料完整？", shape=diamond];
  publish [label="发布"];
  revise [label="补充资料"];
  start -> check;
  check -> publish [label="是"];
  check -> revise [label="否"];
  revise -> check;
}`,
  },
  {
    id: 'plantuml',
    label: 'PlantUML',
    scope: 'activity diagram',
    example: `@startuml
start
:提交申请;
if (资料完整？) then (是)
  :发布;
else (否)
  :补充资料;
endif
stop
@enduml`,
  },
];

const INITIAL_DRAFTS = Object.fromEntries(
  FORMAT_OPTIONS.map((option) => [option.id, option.example]),
) as Record<CodeDiagramFormat, string>;

interface PreviewBox {
  node: FlowNode;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

function dimension(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function boundaryPoint(box: PreviewBox, towardX: number, towardY: number) {
  const deltaX = towardX - box.centerX;
  const deltaY = towardY - box.centerY;
  if (deltaX === 0 && deltaY === 0) return { x: box.centerX, y: box.centerY };
  const horizontal = deltaX === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(deltaX);
  const vertical = deltaY === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(deltaY);
  const scale = Math.min(horizontal, vertical);
  return { x: box.centerX + deltaX * scale, y: box.centerY + deltaY * scale };
}

function previewPath(source: PreviewBox, target: PreviewBox) {
  const start = boundaryPoint(source, target.centerX, target.centerY);
  const end = boundaryPoint(target, source.centerX, source.centerY);
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    const middleX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`;
  }
  const middleY = (start.y + end.y) / 2;
  return `M ${start.x} ${start.y} C ${start.x} ${middleY}, ${end.x} ${middleY}, ${end.x} ${end.y}`;
}

function PreviewNode({ box }: { box: PreviewBox }) {
  const { node, x, y, width, height, centerX, centerY } = box;
  const isDecision = node.data.kind === 'decision' || node.data.kind.includes('gateway');
  const isRound = node.data.kind === 'start' || node.data.kind.includes('event');
  const label = node.data.label.length > 18 ? `${node.data.label.slice(0, 17)}…` : node.data.label;
  const common = {
    fill: node.data.fill,
    stroke: node.data.stroke,
    strokeWidth: Math.max(1.5, node.data.borderWidth),
  };

  return (
    <g>
      {isDecision ? (
        <polygon
          points={`${centerX},${y} ${x + width},${centerY} ${centerX},${y + height} ${x},${centerY}`}
          {...common}
        />
      ) : isRound ? (
        <ellipse cx={centerX} cy={centerY} rx={width / 2} ry={height / 2} {...common} />
      ) : (
        <rect x={x} y={y} width={width} height={height} rx={Math.min(10, node.data.radius)} {...common} />
      )}
      <text
        x={centerX}
        y={centerY}
        className="code-preview__node-label"
        fill={node.data.textColor}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

function DiagramPreview({ result }: { result: ImportResult }) {
  const markerId = `code-preview-arrow-${useId().replace(/:/g, '')}`;
  const boxes = useMemo(() => result.nodes.map((node) => {
    const definition = getShapeDefinition(node.data.kind);
    const width = dimension(node.style?.width ?? node.width, definition.width);
    const height = dimension(node.style?.height ?? node.height, definition.height);
    return {
      node,
      x: node.position.x,
      y: node.position.y,
      width,
      height,
      centerX: node.position.x + width / 2,
      centerY: node.position.y + height / 2,
    };
  }), [result.nodes]);
  const boxById = useMemo(() => new Map(boxes.map((box) => [box.node.id, box])), [boxes]);
  const bounds = useMemo(() => {
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const padding = 38;
    return {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2),
    };
  }, [boxes]);

  return (
    <svg
      className="code-preview__diagram"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      role="img"
      aria-label={`${result.nodes.length} 个节点、${result.edges.length} 条连线的代码流程图预览`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--muted-strong)" />
        </marker>
      </defs>
      <g className="code-preview__edges">
        {result.edges.map((edge) => {
          const source = boxById.get(edge.source);
          const target = boxById.get(edge.target);
          if (!source || !target) return null;
          const label = edge.data?.label ?? (typeof edge.label === 'string' ? edge.label : '');
          return (
            <g key={edge.id}>
              <path d={previewPath(source, target)} markerEnd={`url(#${markerId})`} />
              {label && (
                <text
                  x={(source.centerX + target.centerX) / 2}
                  y={(source.centerY + target.centerY) / 2 - 6}
                  className="code-preview__edge-label"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <g>{boxes.map((box) => <PreviewNode key={box.node.id} box={box} />)}</g>
    </svg>
  );
}

export function CodeDialog({ open, documentTitle, onClose, onApply }: CodeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editorId = useId();
  const statusId = useId();
  const titleId = useId();
  const [format, setFormat] = useState<CodeDiagramFormat>('mermaid');
  const [drafts, setDrafts] = useState<Record<CodeDiagramFormat, string>>(() => ({ ...INITIAL_DRAFTS }));
  const [parseState, setParseState] = useState<'parsing' | 'ready' | 'error'>('parsing');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const option = FORMAT_OPTIONS.find((item) => item.id === format) ?? FORMAT_OPTIONS[0];
  const source = drafts[format];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setParseState('parsing');
    setError('');
    const timer = window.setTimeout(() => {
      try {
        const parsed = importDiagramSource(source, format, documentTitle.trim() || `${option.label} 流程图`);
        setResult(parsed);
        setParseState('ready');
      } catch (parseError) {
        setResult(null);
        setError(parseError instanceof Error ? parseError.message : '代码无法解析。');
        setParseState('error');
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [documentTitle, format, open, option.label, source]);

  const apply = () => {
    if (!result || parseState !== 'ready') return;
    onApply(result);
    onClose();
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
  };

  const hasWarnings = Boolean(result?.warnings.length);
  const status = parseState === 'parsing'
    ? { className: 'is-parsing', icon: <LoaderCircle className="spin" size={15} />, label: '解析中' }
    : parseState === 'error'
      ? { className: 'is-error', icon: <TriangleAlert size={15} />, label: '语法错误' }
      : hasWarnings
        ? { className: 'is-warning', icon: <TriangleAlert size={15} />, label: '有兼容提示' }
        : { className: 'is-ready', icon: <CheckCircle2 size={15} />, label: '可编辑结构' };

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog code-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="dialog-header">
        <div className="dialog-title">
          <span className="dialog-title__icon"><Code2 size={18} /></span>
          <div><h2 id={titleId}>代码绘图</h2><p>代码转可编辑图形</p></div>
        </div>
        <IconButton label="关闭" icon={<X size={18} />} onClick={onClose} />
      </div>

      <div className="code-dialog__body">
        <section className="code-editor-pane" aria-label="流程图代码编辑器">
          <div className="code-format-tabs" role="group" aria-label="代码格式">
            {FORMAT_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={format === item.id}
                className={format === item.id ? 'is-active' : ''}
                onClick={() => setFormat(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="code-editor-toolbar">
            <label htmlFor={editorId}>源代码</label>
            <button
              type="button"
              className="code-reset-button"
              onClick={() => setDrafts((current) => ({ ...current, [format]: option.example }))}
            >
              <RotateCcw size={14} />恢复示例
            </button>
          </div>
          <textarea
            id={editorId}
            className="code-source-editor"
            value={source}
            onChange={(event) => setDrafts((current) => ({ ...current, [format]: event.target.value }))}
            onKeyDown={handleEditorKeyDown}
            aria-describedby={statusId}
            aria-invalid={parseState === 'error'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <div className="code-editor-meta">
            <span>{option.scope}</span>
            <span>{source ? source.split(/\r?\n/).length : 0} 行</span>
          </div>
        </section>

        <aside className="code-preview-pane" aria-label="解析预览">
          <div className="code-preview-header">
            <strong>结构预览</strong>
            <span id={statusId} className={`code-parse-status ${status.className}`} role="status" aria-live="polite">
              {status.icon}{status.label}
            </span>
          </div>
          <div className={`code-preview-canvas ${parseState !== 'ready' ? 'is-empty' : ''}`}>
            {result && parseState === 'ready' ? (
              <DiagramPreview result={result} />
            ) : (
              <div className="code-preview-empty" aria-hidden="true">
                {parseState === 'parsing' ? <LoaderCircle className="spin" size={24} /> : <TriangleAlert size={24} />}
              </div>
            )}
          </div>
          {(error || hasWarnings) && (
            <div className={`code-diagnostics ${error ? 'is-error' : 'is-warning'}`} role={error ? 'alert' : 'status'}>
              <strong>{error ? '无法解析' : '兼容提示'}</strong>
              {error ? <p>{error}</p> : <ul>{result?.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            </div>
          )}
        </aside>
      </div>

      <div className="dialog-footer code-dialog__footer">
        <span className="code-dialog__summary">
          {result && parseState === 'ready' ? `${result.nodes.length} 节点 · ${result.edges.length} 连线` : '画布保持不变'}
        </span>
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button className="primary-button" onClick={apply} disabled={!result || parseState !== 'ready'}>
          <Code2 size={16} />生成到画布
        </button>
      </div>
    </dialog>
  );
}
