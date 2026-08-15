import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import { FileImage, LockKeyhole } from 'lucide-react';
import type { FlowNode as FlowNodeType } from '../types';
import { getShapeDefinition } from '../lib/shapeRegistry';
import { isScientificShapeKind, layoutScientificNodeContent } from '../lib/scientificNodeLayout';
import { useFlowStore } from '../store/flowStore';
import { ShapeVisual } from './ShapeVisual';
import { SvgVectorVisual } from './SvgVectorVisual';

const positions = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function FlowNode({ id, data, selected, width, height }: NodeProps<FlowNodeType>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const beginTransaction = useFlowStore((state) => state.beginTransaction);
  const endTransaction = useFlowStore((state) => state.endTransaction);
  const updateNodeInternals = useUpdateNodeInternals();
  const definition = getShapeDefinition(data.kind);
  const nodeWidth = width ?? definition.width;
  const nodeHeight = height ?? definition.height;
  const scientificLayout = isScientificShapeKind(data.kind)
    ? layoutScientificNodeContent(data, nodeWidth, nodeHeight)
    : undefined;
  const supportsInlineTextEditing = data.kind !== 'image'
    && (data.kind !== 'vector' || data.vector?.tag === 'text');

  useEffect(() => setDraft(data.label), [data.label]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const finishEditing = () => {
    const next = draft.trim() || '未命名';
    updateNodeData(id, { label: next });
    endTransaction();
    setEditing(false);
    updateNodeInternals(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') finishEditing();
    if (event.key === 'Escape') {
      setDraft(data.label);
      endTransaction();
      setEditing(false);
    }
  };

  const variables = {
    '--node-fill': data.fill,
    '--node-stroke': data.stroke,
    '--node-text': data.textColor,
    '--node-border-width': `${data.borderWidth}px`,
    '--node-radius': `${data.radius}px`,
    '--node-font-size': `${data.fontSize}px`,
    '--node-description-font-size': `${Math.max(11, data.fontSize * 0.86)}px`,
    '--node-font-weight': data.fontWeight,
    '--node-text-align': data.textAlign,
    '--node-opacity': data.opacity,
    '--node-rotation': `${data.rotation ?? 0}deg`,
    '--node-visual-height': scientificLayout ? `${scientificLayout.visualHeight}px` : '100%',
  } as CSSProperties;

  const textEditor = (
    <input
      ref={inputRef}
      className="flow-node__editor nodrag"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finishEditing}
      onKeyDown={handleKeyDown}
      aria-label="图形文字"
    />
  );

  const visualContent = data.kind === 'image' ? (
    <div className="flow-node__image-wrap">
      {data.imageUrl?.startsWith('data:application/pdf') ? (
        <object className="flow-node__object" data={data.imageUrl} type="application/pdf" aria-label={data.label} />
      ) : data.imageUrl ? (
        <img
          className="flow-node__image"
          src={data.imageUrl}
          alt={data.label}
          draggable={false}
          style={{ objectFit: data.imageFit ?? 'contain' }}
        />
      ) : (
        <FileImage aria-hidden="true" />
      )}
      {data.imageUrl ? (
        data.scientificEvidence === 'schematic' && data.label.trim()
          ? <span className="flow-node__image-label flow-node__image-label--scientific">{data.label}</span>
          : <span className="sr-only">{data.label}</span>
      ) : <span className="flow-node__image-label">{data.label}</span>}
    </div>
  ) : editing ? textEditor : scientificLayout ? (
    <>
      <span className="flow-node__label">
        {scientificLayout.labelLines.map((line, index) => <span key={`${line}-${index}`}>{line || '\u00a0'}</span>)}
      </span>
      {scientificLayout.descriptionLines.length > 0 && (
        <span className="flow-node__description">
          {scientificLayout.descriptionLines.map((line, index) => <span key={`${line}-${index}`}>{line || '\u00a0'}</span>)}
        </span>
      )}
    </>
  ) : (
    <>
      <span className="flow-node__label">{data.label}</span>
      {data.description && <span className="flow-node__description">{data.description}</span>}
    </>
  );

  const verticalClass = definition.textPlacement === 'header'
    ? 'top'
    : definition.textPlacement === 'footer'
      ? 'bottom'
      : data.verticalAlign;

  return (
    <div
      className={`flow-node flow-node--${data.kind} ${selected ? 'is-selected' : ''} ${data.locked ? 'is-locked' : ''}`}
      data-scientific-layout={scientificLayout ? definition.textPlacement : undefined}
      data-schematic-role={data.schematicRole}
      style={variables}
      onDoubleClick={(event) => {
        if (data.locked || !supportsInlineTextEditing) return;
        event.stopPropagation();
        beginTransaction();
        setEditing(true);
      }}
      aria-label={`${data.label}，${definition.label}`}
    >
      <NodeResizer
        color="oklch(0.560 0.155 72)"
        isVisible={selected && !data.locked}
        minWidth={definition.minWidth}
        minHeight={definition.minHeight}
        onResizeStart={beginTransaction}
        onResizeEnd={endTransaction}
      />
      {positions.map((position) => (
        <Handle
          key={position}
          id={position.toLowerCase()}
          type="source"
          position={position}
          className="flow-node__handle"
          isConnectable={!data.locked}
        />
      ))}
      <div className="flow-node__rotatable">
      {data.kind === 'vector' ? (
        <>
          <SvgVectorVisual data={data} />
          {editing && <div className="flow-node__vector-editor">{textEditor}</div>}
        </>
      ) : data.kind !== 'image' && (
        <ShapeVisual
          className="flow-node__shape"
          kind={data.kind}
          fill={data.fill}
          stroke={data.stroke}
          strokeWidth={data.borderWidth}
          radius={data.radius}
          variant={data.scientificVariant}
        />
      )}
      {data.kind !== 'vector' && (
      <div
        className={`flow-node__content flow-node__content--${definition.textPlacement} flow-node__content--v-${verticalClass}`}
        style={{ padding: definition.contentPadding }}
      >
        {visualContent}
      </div>
      )}
      </div>
      {data.locked && !data.scientificRole && <LockKeyhole className="flow-node__lock" size={13} aria-hidden="true" />}
    </div>
  );
}
