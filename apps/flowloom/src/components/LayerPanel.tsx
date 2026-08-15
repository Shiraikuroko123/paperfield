import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Layers3,
  LockKeyhole,
  MousePointer2,
  Plus,
  Trash2,
  UnlockKeyhole,
} from 'lucide-react';
import type { FlowNode } from '../types';
import { getShapeDefinition } from '../lib/shapeRegistry';
import { useFlowStore } from '../store/flowStore';
import { IconButton } from './IconButton';

export function LayerPanel({ nodes }: { nodes: FlowNode[] }) {
  const layers = useFlowStore((state) => state.layers);
  const activeLayerId = useFlowStore((state) => state.activeLayerId);
  const addLayer = useFlowStore((state) => state.addLayer);
  const updateLayer = useFlowStore((state) => state.updateLayer);
  const deleteLayer = useFlowStore((state) => state.deleteLayer);
  const setActiveLayer = useFlowStore((state) => state.setActiveLayer);
  const moveSelectionToLayer = useFlowStore((state) => state.moveSelectionToLayer);
  const moveLayer = useFlowStore((state) => state.moveLayer);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const beginTransaction = useFlowStore((state) => state.beginTransaction);
  const endTransaction = useFlowStore((state) => state.endTransaction);
  const lockedLayerIds = new Set(layers.filter((layer) => layer.locked).map((layer) => layer.id));
  const selectedCount = nodes.filter((node) => (
    node.selected
    && !node.data.locked
    && !lockedLayerIds.has(node.data.layerId ?? layers[0]?.id)
  )).length;
  const ordered = [...layers].reverse();

  const selectNode = (id: string) => {
    onNodesChange(nodes.map((node) => ({ type: 'select' as const, id: node.id, selected: node.id === id })));
  };

  return (
    <div className="layer-panel">
      <div className="layer-panel__toolbar">
        <div><strong>图层</strong><span>{layers.length} 层 · {nodes.length} 个对象</span></div>
        <IconButton label="新建图层" size="sm" icon={<Plus size={15} />} onClick={addLayer} />
      </div>
      <div className="layer-list">
        {ordered.map((layer) => {
          const layerNodes = nodes.filter((node) => (node.data.layerId ?? layers[0]?.id) === layer.id);
          const active = layer.id === activeLayerId;
          return (
            <section key={layer.id} className={`layer-item ${active ? 'is-active' : ''}`}>
              <div className="layer-item__row">
                <button className="layer-item__name" onClick={() => setActiveLayer(layer.id)} aria-pressed={active}>
                  <Layers3 size={15} aria-hidden="true" />
                  <span>{layer.name}</span>
                  <small>{layerNodes.length}</small>
                </button>
                <IconButton label={layer.visible ? '隐藏图层' : '显示图层'} size="sm" icon={layer.visible ? <Eye size={14} /> : <EyeOff size={14} />} onClick={() => updateLayer(layer.id, { visible: !layer.visible })} />
                <IconButton label={layer.locked ? '解锁图层' : '锁定图层'} size="sm" icon={layer.locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />} onClick={() => updateLayer(layer.id, { locked: !layer.locked })} />
              </div>
              {active && (
                <>
                  <div className="layer-item__controls">
                    <input
                      value={layer.name}
                      onChange={(event) => updateLayer(layer.id, { name: event.target.value })}
                      onFocus={beginTransaction}
                      onBlur={endTransaction}
                      aria-label="图层名称"
                    />
                    <IconButton label="图层上移" size="sm" icon={<ArrowUp size={14} />} onClick={() => moveLayer(layer.id, 'up')} />
                    <IconButton label="图层下移" size="sm" icon={<ArrowDown size={14} />} onClick={() => moveLayer(layer.id, 'down')} />
                    <IconButton
                      label="删除图层"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      disabled={layers.length <= 1}
                      onClick={() => {
                        if (window.confirm(`删除“${layer.name}”？其中对象会移到相邻图层。`)) deleteLayer(layer.id);
                      }}
                    />
                  </div>
                  {selectedCount > 0 && (
                    <button className="layer-item__move secondary-button" disabled={layer.locked} onClick={() => moveSelectionToLayer(layer.id)}>
                      <MousePointer2 size={14} /> 将所选 {selectedCount} 项移到此层
                    </button>
                  )}
                  <div className="layer-node-list">
                    {layerNodes.length === 0 ? <span className="layer-node-list__empty">空图层</span> : layerNodes.map((node) => (
                      <div key={node.id} className={`layer-node ${node.selected ? 'is-selected' : ''}`}>
                        <button className="layer-node__name" onClick={() => selectNode(node.id)}>
                          <span>{getShapeDefinition(node.data.kind).label}</span>
                          <strong>{node.data.label}</strong>
                        </button>
                        <IconButton label={node.data.hidden ? '显示对象' : '隐藏对象'} size="sm" icon={node.data.hidden ? <EyeOff size={13} /> : <Eye size={13} />} onClick={() => updateNodeData(node.id, { hidden: !node.data.hidden })} />
                        <IconButton label={node.data.locked ? '解锁对象' : '锁定对象'} size="sm" icon={node.data.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />} onClick={() => updateNodeData(node.id, { locked: !node.data.locked })} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
