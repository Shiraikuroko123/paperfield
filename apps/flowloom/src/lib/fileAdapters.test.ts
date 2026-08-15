import { describe, expect, it } from 'vitest';
import {
  aiPayloadToGraph,
  importDiagramFile,
  importDiagramSource,
  serializeDocument,
  serializeDrawio,
  serializeMermaid,
} from './fileAdapters';
import { createFlowEdge, createFlowNode } from './diagram';
import { VISIBLE_SHAPES } from './shapeRegistry';

describe('diagram file adapters', () => {
  it('registers 135 unique, user-visible standard and scientific shapes', () => {
    expect(VISIBLE_SHAPES).toHaveLength(135);
    expect(new Set(VISIBLE_SHAPES.map((definition) => definition.kind))).toHaveLength(135);
  });

  it('imports Mermaid nodes, decisions, labels, and edges', async () => {
    const source = `flowchart LR
      start([开始]) --> check{资料完整？}
      check -->|是| done([完成])
      check -->|否| retry[补充资料]
      retry --> check`;
    const result = await importDiagramFile(new File([source], 'approval.mmd', { type: 'text/plain' }));

    expect(result.sourceFormat).toBe('Mermaid');
    expect(result.fidelity).toBe('structural');
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.find((node) => node.id === 'check')?.data.kind).toBe('decision');
    expect(result.edges).toHaveLength(4);
    expect(result.edges.some((edge) => edge.data?.label === '是')).toBe(true);
    expect(result.nodes.some((node) => node.position.x !== 0)).toBe(true);
  });

  it('converts Graphviz DOT source directly into editable nodes', () => {
    const result = importDiagramSource(`digraph flow {
      rankdir=LR;
      start [label="开始", shape=oval];
      check [label="通过？", shape=diamond];
      done [label="完成"];
      start -> check;
      check -> done [label="是"];
    }`, 'dot', '代码流程');

    expect(result.title).toBe('代码流程');
    expect(result.sourceFormat).toBe('Graphviz DOT');
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.find((node) => node.id === 'check')?.data.kind).toBe('decision');
    expect(result.edges.find((edge) => edge.data?.label === '是')).toBeDefined();
    expect(result.nodes.some((node) => node.position.x > 0)).toBe(true);
  });

  it('preserves both PlantUML decision branches when generating editable structure', () => {
    const result = importDiagramSource(`@startuml
      start
      :提交申请;
      if (资料完整？) then (是)
        :发布;
      else (否)
        :补充资料;
      endif
      stop
      @enduml`, 'plantuml');

    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(6);
    const decision = result.nodes.find((node) => node.data.kind === 'decision');
    expect(result.edges.filter((edge) => edge.source === decision?.id).map((edge) => edge.data?.label)).toEqual(['是', '否']);
    const end = result.nodes.find((node) => node.data.label === '结束');
    expect(result.edges.filter((edge) => edge.target === end?.id)).toHaveLength(2);
  });

  it('rejects empty code without changing an existing canvas', () => {
    expect(() => importDiagramSource('   ', 'mermaid')).toThrow('请输入流程图代码');
  });

  it('imports uncompressed draw.io XML with geometry and style', async () => {
    const source = `<mxfile><diagram name="Page-1"><mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="a" value="开始" style="ellipse=1;fillColor=#ffffff;strokeColor=#008060;" vertex="1" parent="1"><mxGeometry x="20" y="30" width="120" height="52" as="geometry"/></mxCell>
      <mxCell id="b" value="审核" style="rhombus;fillColor=#fff3c4;" vertex="1" parent="1"><mxGeometry x="220" y="20" width="100" height="80" as="geometry"/></mxCell>
      <mxCell id="e" value="提交" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram></mxfile>`;
    const result = await importDiagramFile(new File([source], 'review.drawio', { type: 'application/xml' }));

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 20, y: 30 });
    expect(result.nodes.find((node) => node.id === 'b')?.data.kind).toBe('decision');
    expect(result.edges[0].data?.label).toBe('提交');
  });

  it('round-trips the native editable document schema', async () => {
    const first = createFlowNode('start', { x: 10, y: 20 }, '开始', { id: 'first' });
    const second = createFlowNode('process', { x: 200, y: 20 }, '处理', { id: 'second' });
    const edge = createFlowEdge('first', 'second', '继续');
    const serialized = serializeDocument('测试流程', [first, second], [edge]);
    const result = await importDiagramFile(new File([serialized], 'test.flow.json', { type: 'application/json' }));

    expect(result.title).toBe('测试流程');
    expect(result.nodes.map((node) => node.data.label)).toEqual(['开始', '处理']);
    expect(result.edges[0].source).toBe('first');
  });

  it('round-trips editable scientific visual variants through native JSON', async () => {
    const model = createFlowNode('scientific-transformer', { x: 24, y: 32 }, 'Latent World Model', { id: 'world-model' });
    model.data = {
      ...model.data,
      description: 'p(zₜ₊₁ | zₜ, aₜ)',
      scientificVariant: 'world-model',
    };
    const serialized = serializeDocument('World model', [model], []);
    const result = await importDiagramFile(new File([serialized], 'world-model.flow.json', { type: 'application/json' }));

    expect(result.nodes[0].data).toMatchObject({
      kind: 'scientific-transformer',
      scientificVariant: 'world-model',
      description: 'p(zₜ₊₁ | zₜ, aₜ)',
    });
  });

  it('imports Excalidraw bound shapes and arrows', async () => {
    const source = JSON.stringify({
      type: 'excalidraw',
      elements: [
        { id: 'box', type: 'rectangle', x: 10, y: 20, width: 180, height: 70, backgroundColor: '#fff', strokeColor: '#222' },
        { id: 'label', type: 'text', containerId: 'box', text: '处理订单' },
        { id: 'end', type: 'ellipse', x: 300, y: 20, width: 120, height: 60, backgroundColor: '#fff', strokeColor: '#222' },
        { id: 'arrow', type: 'arrow', startBinding: { elementId: 'box' }, endBinding: { elementId: 'end' } },
      ],
    });
    const result = await importDiagramFile(new File([source], 'flow.excalidraw', { type: 'application/json' }));

    expect(result.nodes.find((node) => node.id === 'box')?.data.label).toBe('处理订单');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: 'box', target: 'end' });
  });

  it('converts and exports AI graph payloads without orphaning valid edges', () => {
    const graph = aiPayloadToGraph({
      title: '退款审批',
      direction: 'TB',
      nodes: [
        { id: 'start', label: '提交申请', kind: 'start' },
        { id: 'risk', label: '风险检查', kind: 'decision' },
        { id: 'done', label: '退款完成', kind: 'start' },
      ],
      edges: [
        { source: 'start', target: 'risk' },
        { source: 'risk', target: 'done', label: '通过' },
      ],
    });

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(serializeMermaid(graph.nodes, graph.edges)).toContain('|通过|');
    expect(serializeDrawio(graph.title, graph.nodes, graph.edges)).toContain('<mxGraphModel');
  });

  it('preserves AI scientific schematic geometry, roles, and edge styling', () => {
    const graph = aiPayloadToGraph({
      title: 'VLA policy',
      direction: 'LR',
      nodes: [
        { id: 'frame', label: 'VLA policy', role: 'frame', position: { x: 0, y: 0 }, width: 1200, height: 680, fill: '#ffffff', stroke: '#88939d', zIndex: -30 },
        { id: 'vision', label: 'Vision encoder', role: 'encoder', position: { x: 80, y: 180 }, width: 190, height: 90, fill: '#e7f4ee', stroke: '#3e8064' },
        { id: 'policy', label: 'Action expert', role: 'policy', position: { x: 780, y: 180 }, width: 190, height: 110, fill: '#fcebed', stroke: '#b64e63', fontSize: 16 },
        { id: 'robot', label: 'Robot', role: 'environment', position: { x: 1010, y: 400 }, width: 150, height: 100 },
      ],
      edges: [
        { source: 'vision', target: 'policy', routing: 'straight', color: '#42515d', width: 2.2 },
        { source: 'policy', target: 'robot', routing: 'bezier', lineStyle: 'dashed', color: '#a34f3c', arrowEnd: 'open' },
        { source: 'missing', target: 'robot' },
      ],
    });

    expect(graph.nodes[0]).toMatchObject({
      position: { x: 0, y: 0 },
      zIndex: -30,
      style: { width: 1200, height: 680 },
      data: { kind: 'group', schematicRole: 'frame', scientificRole: 'schematic-root' },
    });
    expect(graph.nodes.find((node) => node.id === 'robot')?.data.kind).toBe('ellipse');
    expect(graph.nodes.find((node) => node.id === 'policy')?.data.fontSize).toBe(16);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[1].data).toMatchObject({ routing: 'bezier', lineStyle: 'dashed', color: '#a34f3c', arrowEnd: 'open' });
  });

  it('attaches paper evidence and marks inferred AI elements for review', () => {
    const graph = aiPayloadToGraph({
      title: 'Grounded method',
      nodes: [
        { id: 'encoder', label: 'Vision encoder', role: 'encoder', sourceQuote: 'Images are encoded by ViT-L/14.', confidence: 0.94 },
        { id: 'planner', label: 'Planner', role: 'bridge', inferred: true, confidence: 0.42 },
      ],
      edges: [{ source: 'encoder', target: 'planner', inferred: true }],
    }, {
      schemaVersion: 1,
      sourceType: 'paper-semantic-generation',
      paperRef: 'arxiv:2406.09246',
      templateIds: ['vla-policy'],
      confidence: 0.72,
      warnings: [],
    });

    expect(graph.nodes[0].data.diagramProvenance).toMatchObject({
      paperRef: 'arxiv:2406.09246',
      quote: 'Images are encoded by ViT-L/14.',
      confidence: 0.94,
    });
    expect(graph.nodes[1].data.diagramProvenance?.warnings.join(' ')).toContain('model inference');
    expect(graph.edges[0].data?.diagramProvenance?.warnings.join(' ')).toContain('model inference');
  });

  it('round-trips every registered editable shape through draw.io', async () => {
    const nodes = VISIBLE_SHAPES.map((definition, index) => createFlowNode(
      definition.kind,
      { x: (index % 8) * 220, y: Math.floor(index / 8) * 150 },
      definition.label,
      { id: `shape-${index}` },
    ));
    nodes[0].data = {
      ...nodes[0].data,
      description: '保留说明；包含特殊字符',
      fontWeight: 700,
      textAlign: 'right',
      verticalAlign: 'bottom',
      locked: true,
    };
    const edge = createFlowEdge(nodes[0].id, nodes[1].id, '双向');
    edge.data = { ...edge.data!, arrowStart: 'open', arrowEnd: 'closed', lineStyle: 'dotted', width: 2.5 };

    const source = serializeDrawio('完整图形库', nodes, [edge]);
    const result = await importDiagramFile(new File([source], 'all-shapes.drawio', { type: 'application/xml' }));

    expect(result.nodes.map((node) => node.data.kind)).toEqual(VISIBLE_SHAPES.map((definition) => definition.kind));
    expect(result.nodes[0].data).toMatchObject({
      description: '保留说明；包含特殊字符',
      fontWeight: 700,
      textAlign: 'right',
      verticalAlign: 'bottom',
      locked: true,
    });
    expect(result.edges[0].data).toMatchObject({ arrowStart: 'open', arrowEnd: 'closed', lineStyle: 'dotted', width: 2.5 });
  });

  it('imports safe SVG primitives as independently editable vector nodes', async () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240">
      <g transform="translate(20 10)">
        <rect id="step" x="10" y="20" width="160" height="64" rx="8" fill="#fff4cc" stroke="#9a6700" stroke-width="2"/>
        <circle id="event" cx="270" cy="52" r="30" fill="#dcfce7" stroke="#15803d"/>
        <path id="arrow" d="M170 52 C205 52 220 52 240 52" fill="none" stroke="#334155" stroke-width="3"/>
        <text id="label" x="90" y="58" text-anchor="middle" font-size="16">审核订单</text>
      </g>
    </svg>`;
    const result = await importDiagramFile(new File([source], 'editable.svg', { type: 'image/svg+xml' }));

    expect(result.fidelity).toBe('structural');
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.every((node) => node.data.kind === 'vector')).toBe(true);
    expect(result.nodes.find((node) => node.id === 'arrow')?.data.vector?.tag).toBe('path');
    const label = result.nodes.find((node) => node.id === 'label');
    expect(label?.data.label).toBe('审核订单');
    expect(Number(label?.style?.width)).toBeGreaterThan(60);
    expect(result.nodes.some((node) => node.position.x > 0)).toBe(true);
  });

  it('keeps a hidden source reference when SVG uses unsupported paint effects', async () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <defs><linearGradient id="paint"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
      <rect id="gradient-box" x="10" y="10" width="180" height="80" fill="url(#paint)"/>
    </svg>`;
    const result = await importDiagramFile(new File([source], 'gradient.svg', { type: 'image/svg+xml' }));

    expect(result.fidelity).toBe('hybrid');
    expect(result.nodes.some((node) => node.data.kind === 'vector')).toBe(true);
    const reference = result.nodes.find((node) => node.data.kind === 'image');
    expect(reference?.data).toMatchObject({ hidden: false, locked: true });
    expect(reference?.position).toEqual({ x: 0, y: 0 });
    expect(reference?.style).toMatchObject({ width: 200, height: 100 });
    expect(result.pages?.[0].layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '原图参考', visible: false, locked: true }),
      expect.objectContaining({ name: '可编辑图元', visible: true, locked: false }),
    ]));
  });

  it('does not import SVG definition primitives as visible editable nodes', async () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">
      <defs><rect id="symbol-box" width="80" height="40" fill="#f00"/></defs>
      <use href="#symbol-box" x="10" y="10"/>
      <rect id="visible-box" x="120" y="20" width="90" height="60" fill="#fff" stroke="#000"/>
    </svg>`;
    const result = await importDiagramFile(new File([source], 'definitions.svg', { type: 'image/svg+xml' }));

    const vectors = result.nodes.filter((node) => node.data.kind === 'vector');
    expect(vectors).toHaveLength(1);
    expect(vectors[0].id).toBe('visible-box');
    expect(result.fidelity).toBe('hybrid');
  });

  it('round-trips the v2 multi-page document schema', async () => {
    const first = createFlowNode('process', { x: 10, y: 10 }, '第一页', { id: 'first-page-node' });
    const second = createFlowNode('decision', { x: 20, y: 20 }, '第二页', { id: 'second-page-node' });
    const pages = [
      { id: 'page-a', name: '概览', nodes: [first], edges: [], layers: [{ id: 'layer-a', name: '主层', visible: true, locked: false }] },
      { id: 'page-b', name: '细节', nodes: [second], edges: [], layers: [{ id: 'layer-b', name: '业务', visible: true, locked: false }] },
    ];
    const source = serializeDocument('多页流程', pages[1].nodes, pages[1].edges, pages, 'page-b');
    const result = await importDiagramFile(new File([source], 'multi.flow.json', { type: 'application/json' }));

    expect(result.pages).toHaveLength(2);
    expect(result.activePageId).toBe('page-b');
    expect(result.nodes[0].data.label).toBe('第二页');
  });

  it('round-trips draw.io pages, layers, groups, visibility, and rotation', async () => {
    const group = createFlowNode('group', { x: 40, y: 30 }, '分组', { id: 'group' });
    group.data = { ...group.data, layerId: 'layer-locked', rotation: 12 };
    const child = createFlowNode('process', { x: 20, y: 40 }, '子节点', { id: 'child', parentId: 'group', extent: 'parent' });
    child.data = { ...child.data, layerId: 'layer-locked', hidden: true };
    const second = createFlowNode('database', { x: 90, y: 60 }, '第二页', { id: 'second' });
    const pages = [
      {
        id: 'overview',
        name: '总览',
        nodes: [group, child],
        edges: [],
        layers: [{ id: 'layer-locked', name: '受控层', visible: true, locked: true }],
      },
      {
        id: 'detail',
        name: '详情',
        nodes: [second],
        edges: [],
        layers: [{ id: 'layer-detail', name: '数据层', visible: false, locked: false }],
      },
    ];

    const source = serializeDrawio('多页 draw.io', pages[0].nodes, [], pages, 'overview');
    const result = await importDiagramFile(new File([source], 'multi.drawio', { type: 'application/xml' }));

    expect(result.pages?.map((page) => page.name)).toEqual(['总览', '详情']);
    expect(result.pages?.[0].layers[0]).toMatchObject({ name: '受控层', locked: true, visible: true });
    expect(result.pages?.[1].layers[0]).toMatchObject({ name: '数据层', visible: false });
    expect(result.pages?.[0].nodes.find((node) => node.id === 'child')).toMatchObject({
      parentId: 'group',
      data: { hidden: true },
    });
    expect(result.pages?.[0].nodes.find((node) => node.id === 'group')?.data.rotation).toBe(12);
  });
});
