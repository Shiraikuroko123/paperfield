import type { DiagramTemplate, FlowNode, ShapeKind } from '../types';
import { createFlowEdge, createFlowNode } from '../lib/diagram';

function node(id: string, kind: ShapeKind, x: number, y: number, label: string): FlowNode {
  return createFlowNode(kind, { x, y }, label, { id });
}

export const templates: DiagramTemplate[] = [
  {
    id: 'release-approval',
    name: '版本发布审批',
    category: '产品与研发',
    description: '从变更提交到灰度发布与回滚判断',
    nodes: [
      node('release-start', 'start', 120, 48, '提交发布申请'),
      node('release-check', 'process', 106, 152, '自动化检查'),
      node('release-pass', 'decision', 122, 270, '检查通过？'),
      node('release-review', 'manual-operation', 104, 430, '负责人审批'),
      node('release-deploy', 'process', 104, 552, '灰度发布'),
      node('release-observe', 'decision', 122, 674, '指标正常？'),
      node('release-done', 'start', 118, 834, '全量发布'),
      node('release-fix', 'document', 390, 286, '修复问题并补充记录'),
      node('release-rollback', 'process', 388, 690, '执行回滚'),
    ],
    edges: [
      createFlowEdge('release-start', 'release-check'),
      createFlowEdge('release-check', 'release-pass'),
      createFlowEdge('release-pass', 'release-review', '是'),
      createFlowEdge('release-pass', 'release-fix', '否'),
      createFlowEdge('release-fix', 'release-check'),
      createFlowEdge('release-review', 'release-deploy'),
      createFlowEdge('release-deploy', 'release-observe'),
      createFlowEdge('release-observe', 'release-done', '是'),
      createFlowEdge('release-observe', 'release-rollback', '否'),
      createFlowEdge('release-rollback', 'release-check'),
    ],
  },
  {
    id: 'incident-response',
    name: '线上事故响应',
    category: '运维与安全',
    description: '告警、分级、止损、复盘的标准响应流程',
    nodes: [
      node('incident-alert', 'start', 80, 80, '收到告警'),
      node('incident-verify', 'process', 300, 72, '确认影响范围'),
      node('incident-severity', 'decision', 548, 54, 'P0 / P1？'),
      node('incident-warroom', 'manual-operation', 790, 48, '建立应急群'),
      node('incident-mitigate', 'process', 790, 190, '止损与恢复'),
      node('incident-monitor', 'decision', 548, 206, '服务恢复？'),
      node('incident-close', 'document', 300, 224, '复盘与行动项'),
      node('incident-done', 'start', 80, 236, '关闭事故'),
    ],
    edges: [
      createFlowEdge('incident-alert', 'incident-verify'),
      createFlowEdge('incident-verify', 'incident-severity'),
      createFlowEdge('incident-severity', 'incident-warroom', '是'),
      createFlowEdge('incident-severity', 'incident-mitigate', '否'),
      createFlowEdge('incident-warroom', 'incident-mitigate'),
      createFlowEdge('incident-mitigate', 'incident-monitor'),
      createFlowEdge('incident-monitor', 'incident-close', '是'),
      createFlowEdge('incident-monitor', 'incident-mitigate', '否'),
      createFlowEdge('incident-close', 'incident-done'),
    ],
  },
  {
    id: 'customer-onboarding',
    name: '客户开通流程',
    category: '业务运营',
    description: '签约、资料校验、账号配置与交付',
    nodes: [
      node('customer-start', 'start', 130, 40, '合同生效'),
      node('customer-form', 'document', 116, 144, '收集开通资料'),
      node('customer-valid', 'decision', 132, 270, '资料完整？'),
      node('customer-account', 'process', 116, 426, '创建组织与账号'),
      node('customer-config', 'database', 130, 544, '写入业务配置'),
      node('customer-train', 'manual-operation', 116, 682, '交付培训'),
      node('customer-done', 'start', 130, 804, '正式启用'),
      node('customer-return', 'note', 404, 278, '列出缺失项并退回补充'),
    ],
    edges: [
      createFlowEdge('customer-start', 'customer-form'),
      createFlowEdge('customer-form', 'customer-valid'),
      createFlowEdge('customer-valid', 'customer-account', '是'),
      createFlowEdge('customer-valid', 'customer-return', '否'),
      createFlowEdge('customer-return', 'customer-form'),
      createFlowEdge('customer-account', 'customer-config'),
      createFlowEdge('customer-config', 'customer-train'),
      createFlowEdge('customer-train', 'customer-done'),
    ],
  },
  {
    id: 'data-pipeline',
    name: '数据处理管道',
    category: '数据与架构',
    description: '采集、校验、转换、存储与质量监控',
    nodes: [
      node('data-source', 'data', 60, 156, '业务数据源'),
      node('data-ingest', 'process', 290, 156, '采集与去重'),
      node('data-valid', 'decision', 534, 136, '质量校验'),
      node('data-transform', 'process', 770, 72, '标准化转换'),
      node('data-quarantine', 'database', 782, 240, '隔离区'),
      node('data-warehouse', 'database', 1018, 62, '数据仓库'),
      node('data-report', 'document', 1012, 214, '质量报告'),
    ],
    edges: [
      createFlowEdge('data-source', 'data-ingest'),
      createFlowEdge('data-ingest', 'data-valid'),
      createFlowEdge('data-valid', 'data-transform', '通过'),
      createFlowEdge('data-valid', 'data-quarantine', '异常'),
      createFlowEdge('data-transform', 'data-warehouse'),
      createFlowEdge('data-quarantine', 'data-report'),
      createFlowEdge('data-report', 'data-ingest', '修正后重试'),
    ],
  },
];

export function getTemplate(id: string): DiagramTemplate {
  return templates.find((template) => template.id === id) ?? templates[0];
}
