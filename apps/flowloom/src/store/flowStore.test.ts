import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultLayer, createFlowEdge, createFlowNode } from '../lib/diagram';
import { useFlowStore } from './flowStore';

describe('flow store safety', () => {
  beforeEach(() => {
    const layer = createDefaultLayer();
    useFlowStore.setState({
      title: 'test',
      nodes: [],
      edges: [],
      layers: [layer],
      pages: [{ id: 'page-test', name: '页面 1', nodes: [], edges: [], layers: [layer] }],
      activePageId: 'page-test',
      activeLayerId: layer.id,
      past: [],
      future: [],
      transactionStart: null,
      dirty: false,
      lastSavedAt: null,
    });
  });

  it('keeps unselected locked nodes when deleting a selection', () => {
    const locked = createFlowNode('process', { x: 0, y: 0 }, '受保护', { id: 'locked' });
    locked.data = { ...locked.data, locked: true };
    locked.draggable = false;
    const selected = createFlowNode('process', { x: 200, y: 0 }, '待删除', { id: 'selected', selected: true });
    useFlowStore.setState({ nodes: [locked, selected], edges: [createFlowEdge('locked', 'selected')] });

    useFlowStore.getState().deleteSelection();

    expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['locked']);
    expect(useFlowStore.getState().edges).toHaveLength(0);
  });

  it('updates React Flow drag behavior when a node is locked or unlocked', () => {
    const node = createFlowNode('process', { x: 0, y: 0 }, '可编辑', { id: 'node' });
    useFlowStore.setState({ nodes: [node] });

    useFlowStore.getState().updateNodeData('node', { locked: true });
    expect(useFlowStore.getState().nodes[0].draggable).toBe(false);

    useFlowStore.getState().updateNodeData('node', { locked: false });
    expect(useFlowStore.getState().nodes[0].draggable).toBe(true);
  });

  it('reverses connector endpoints and arrowheads as one undoable change', () => {
    const source = createFlowNode('process', { x: 0, y: 0 }, 'A', { id: 'a' });
    const target = createFlowNode('process', { x: 200, y: 0 }, 'B', { id: 'b' });
    const edge = createFlowEdge('a', 'b');
    edge.id = 'edge';
    edge.data = { ...edge.data!, arrowStart: 'open', arrowEnd: 'closed' };
    useFlowStore.setState({ nodes: [source, target], edges: [edge] });

    useFlowStore.getState().reverseEdge('edge');

    expect(useFlowStore.getState().edges[0]).toMatchObject({
      source: 'b',
      target: 'a',
      data: { arrowStart: 'closed', arrowEnd: 'open' },
    });
    expect(useFlowStore.getState().past).toHaveLength(1);
  });

  it('updates exact position and stacking order', () => {
    const first = createFlowNode('process', { x: 0, y: 0 }, 'A', { id: 'a', zIndex: 0 });
    const second = createFlowNode('process', { x: 200, y: 0 }, 'B', { id: 'b', zIndex: 2 });
    useFlowStore.setState({ nodes: [first, second] });

    useFlowStore.getState().updateNodePosition('a', { x: 48, y: 96 });
    useFlowStore.getState().arrangeNode('a', 'front');

    expect(useFlowStore.getState().nodes.find((node) => node.id === 'a')).toMatchObject({
      position: { x: 48, y: 96 },
      zIndex: 3,
    });
  });

  it('selects a newly added shape and clears the previous selection', () => {
    const existing = createFlowNode('process', { x: 0, y: 0 }, 'A', { id: 'a', selected: true });
    const added = createFlowNode('document', { x: 200, y: 0 }, 'B', { id: 'b' });
    useFlowStore.setState({ nodes: [existing] });

    useFlowStore.getState().addNode(added);

    expect(useFlowStore.getState().nodes.map((node) => [node.id, node.selected])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('preserves explicit selection state when inserting a generated graph', () => {
    const first = createFlowNode('process', { x: 0, y: 0 }, 'A', { id: 'a', selected: false });
    const second = createFlowNode('process', { x: 200, y: 0 }, 'B', { id: 'b', selected: false });
    const edge = createFlowEdge('a', 'b');
    edge.selected = false;

    useFlowStore.getState().insertGraph([first, second], [edge], 0);

    expect(useFlowStore.getState().nodes.every((node) => node.selected === false)).toBe(true);
    expect(useFlowStore.getState().edges.every((item) => item.selected === false)).toBe(true);
  });

  it('groups and ungroups selected nodes without changing absolute positions', () => {
    const first = createFlowNode('process', { x: 100, y: 80 }, 'A', { id: 'a', selected: true });
    const second = createFlowNode('decision', { x: 340, y: 180 }, 'B', { id: 'b', selected: true });
    useFlowStore.setState({ nodes: [first, second] });

    useFlowStore.getState().groupSelection();
    const grouped = useFlowStore.getState().nodes;
    const group = grouped.find((node) => node.data.kind === 'group');
    expect(group).toBeDefined();
    expect(grouped.filter((node) => node.parentId === group?.id)).toHaveLength(2);

    useFlowStore.getState().ungroupSelection();
    const restored = useFlowStore.getState().nodes;
    expect(restored.find((node) => node.id === 'a')?.position).toEqual({ x: 100, y: 80 });
    expect(restored.find((node) => node.id === 'b')?.position).toEqual({ x: 340, y: 180 });
    expect(restored.some((node) => node.data.kind === 'group')).toBe(false);
  });

  it('preserves each page graph when switching between pages', () => {
    const first = createFlowNode('process', { x: 0, y: 0 }, '第一页内容', { id: 'first' });
    useFlowStore.getState().addNode(first);
    useFlowStore.getState().addPage();
    const secondPageId = useFlowStore.getState().activePageId;
    useFlowStore.getState().addNode(createFlowNode('document', { x: 20, y: 20 }, '第二页内容', { id: 'second' }));

    useFlowStore.getState().switchPage('page-test');
    expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['first']);
    useFlowStore.getState().switchPage(secondPageId);
    expect(useFlowStore.getState().nodes.map((node) => node.id)).toEqual(['second']);
  });

  it('moves selected nodes between layers and restores the move with undo', () => {
    const node = createFlowNode('process', { x: 0, y: 0 }, '分层节点', { id: 'node', selected: true });
    useFlowStore.setState({ nodes: [node] });
    useFlowStore.getState().addLayer();
    const layerId = useFlowStore.getState().activeLayerId;
    useFlowStore.getState().moveSelectionToLayer(layerId);
    expect(useFlowStore.getState().nodes[0].data.layerId).toBe(layerId);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes[0].data.layerId).toBe('layer-default');
  });

  it('keeps page operations in the document-wide undo history', () => {
    const originalPageId = useFlowStore.getState().activePageId;
    useFlowStore.getState().addPage();
    const addedPageId = useFlowStore.getState().activePageId;
    expect(useFlowStore.getState().pages).toHaveLength(2);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().pages).toHaveLength(1);
    expect(useFlowStore.getState().activePageId).toBe(originalPageId);

    useFlowStore.getState().redo();
    expect(useFlowStore.getState().pages).toHaveLength(2);
    expect(useFlowStore.getState().activePageId).toBe(addedPageId);
  });

  it('does not clear document history when switching pages', () => {
    useFlowStore.getState().addNode(createFlowNode('process', { x: 0, y: 0 }, '第一页', { id: 'first' }));
    useFlowStore.getState().addPage();
    const historyLength = useFlowStore.getState().past.length;

    useFlowStore.getState().switchPage('page-test');

    expect(useFlowStore.getState().past).toHaveLength(historyLength);
  });

  it('records a layer rename transaction as one undoable change', () => {
    const store = useFlowStore.getState();
    store.beginTransaction();
    store.updateLayer('layer-default', { name: '业' });
    store.updateLayer('layer-default', { name: '业务' });
    store.updateLayer('layer-default', { name: '业务流程' });
    store.endTransaction();

    expect(useFlowStore.getState().past).toHaveLength(1);
    expect(useFlowStore.getState().layers[0].name).toBe('业务流程');
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().layers[0].name).toBe('默认图层');
  });

  it('distributes varying-size nodes with equal visual gaps', () => {
    const first = createFlowNode('process', { x: 0, y: 0 }, 'A', { id: 'a', selected: true, style: { width: 50, height: 50 } });
    const middle = createFlowNode('process', { x: 200, y: 0 }, 'B', { id: 'b', selected: true, style: { width: 100, height: 50 } });
    const last = createFlowNode('process', { x: 500, y: 0 }, 'C', { id: 'c', selected: true, style: { width: 50, height: 50 } });
    useFlowStore.setState({ nodes: [first, middle, last] });

    useFlowStore.getState().distributeSelection('horizontal');

    expect(useFlowStore.getState().nodes.map((node) => node.position.x)).toEqual([0, 225, 500]);
  });

  it('nudges selected nodes by exact keyboard deltas and supports undo', () => {
    const selected = createFlowNode('process', { x: 12, y: 24 }, 'A', { id: 'a', selected: true });
    useFlowStore.setState({ nodes: [selected] });

    useFlowStore.getState().nudgeSelection({ x: -1, y: 10 });
    expect(useFlowStore.getState().nodes[0].position).toEqual({ x: 11, y: 34 });
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes[0].position).toEqual({ x: 12, y: 24 });
  });

  it('renames the active page when loading a single imported graph', () => {
    useFlowStore.getState().loadGraph('导入的 SVG', [createFlowNode('vector', { x: 0, y: 0 }, 'path')], []);

    expect(useFlowStore.getState().title).toBe('导入的 SVG');
    expect(useFlowStore.getState().pages[0].name).toBe('导入的 SVG');
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().title).toBe('test');
    expect(useFlowStore.getState().pages[0].name).toBe('页面 1');
  });

  it('chooses a visible unlocked layer when loading a layered document', () => {
    const referenceLayer = { id: 'reference', name: '原图参考', visible: false, locked: true };
    const editableLayer = { id: 'editable', name: '可编辑图元', visible: true, locked: false };
    const reference = createFlowNode('image', { x: 0, y: 0 }, '原图');
    reference.data = { ...reference.data, layerId: referenceLayer.id, locked: true };
    const editable = createFlowNode('vector', { x: 20, y: 20 }, '图元');
    editable.data = { ...editable.data, layerId: editableLayer.id };

    useFlowStore.getState().loadDocument('SVG', [{
      id: 'svg-page',
      name: 'SVG',
      nodes: [reference, editable],
      edges: [],
      layers: [referenceLayer, editableLayer],
    }]);

    expect(useFlowStore.getState().activeLayerId).toBe('editable');
  });

  it('updates multiple selected nodes as one undoable style change', () => {
    const first = createFlowNode('process', { x: 0, y: 0 }, 'A', { id: 'a', selected: true });
    const second = createFlowNode('decision', { x: 200, y: 0 }, 'B', { id: 'b', selected: true });
    useFlowStore.setState({ nodes: [first, second] });

    useFlowStore.getState().updateSelectionData({ fill: '#ffcc00', opacity: 0.5 });

    expect(useFlowStore.getState().nodes.every((node) => node.data.fill === '#ffcc00' && node.data.opacity === 0.5)).toBe(true);
    expect(useFlowStore.getState().past).toHaveLength(1);
    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes.every((node) => node.data.opacity === 1)).toBe(true);
  });

  it('enforces layer locks across keyboard, inspector, delete, and layout actions', () => {
    const locked = createFlowNode('process', { x: 12, y: 24 }, '受保护', { id: 'locked', selected: true });
    useFlowStore.setState({ nodes: [locked] });
    useFlowStore.getState().updateLayer('layer-default', { locked: true });

    useFlowStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: true })),
    }));
    const historyLength = useFlowStore.getState().past.length;
    useFlowStore.getState().updateNodeData('locked', { label: '不应修改' });
    useFlowStore.getState().updateNodePosition('locked', { x: 200 });
    useFlowStore.getState().updateSelectionData({ fill: '#ff0000' });
    useFlowStore.getState().nudgeSelection({ x: 10, y: 10 });
    useFlowStore.getState().layout('LR');
    useFlowStore.getState().deleteSelection();

    const node = useFlowStore.getState().nodes[0];
    expect(node.data.label).toBe('受保护');
    expect(node.data.fill).not.toBe('#ff0000');
    expect(node.position).toEqual({ x: 12, y: 24 });
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(useFlowStore.getState().past).toHaveLength(historyLength);
  });

  it('keeps a locked node read-only while still allowing it to be unlocked', () => {
    const node = createFlowNode('process', { x: 0, y: 0 }, '锁定节点', { id: 'node', selected: true });
    node.data = { ...node.data, locked: true };
    useFlowStore.setState({ nodes: [node] });

    useFlowStore.getState().updateNodeData('node', { label: '不应修改' });
    expect(useFlowStore.getState().nodes[0].data.label).toBe('锁定节点');

    useFlowStore.getState().updateNodeData('node', { locked: false });
    useFlowStore.getState().updateNodeData('node', { label: '已经解锁' });
    expect(useFlowStore.getState().nodes[0].data).toMatchObject({ locked: false, label: '已经解锁' });
  });

  it('resizes editable SVG text around its anchor when CJK content changes', () => {
    const text = createFlowNode('vector', { x: 100, y: 80 }, '短文本', {
      id: 'svg-text',
      style: { width: 55, height: 23.5 },
    });
    text.data = {
      ...text.data,
      fontSize: 18,
      borderWidth: 1,
      textAlign: 'center',
      verticalAlign: 'bottom',
      vector: {
        tag: 'text',
        viewBox: [100, 80, 55, 23.5],
        attributes: { x: 127.5, y: 98, 'text-anchor': 'middle' },
        text: '短文本',
      },
    };
    useFlowStore.setState({ nodes: [text] });
    const oldAnchor = text.position.x + Number(text.style?.width) / 2;

    useFlowStore.getState().updateNodeData('svg-text', { label: '这是更长的中文文本' });

    const resized = useFlowStore.getState().nodes[0];
    const resizedWidth = Number(resized.style?.width);
    expect(resizedWidth).toBeGreaterThan(140);
    expect(resized.position.x + resizedWidth / 2).toBeCloseTo(oldAnchor, 5);
    expect(resized.data.vector?.viewBox[2]).toBeCloseTo(resizedWidth, 5);
  });
});
