import type { ShapeKind } from '../types';

export type ShapeCategory = 'flowchart' | 'bpmn' | 'uml' | 'erd' | 'architecture' | 'scientific' | 'basic' | 'container' | 'internal';
export type ShapeTextPlacement = 'center' | 'left' | 'header' | 'lane' | 'footer';

export interface ShapeDefinition {
  kind: ShapeKind;
  label: string;
  standardName: string;
  category: ShapeCategory;
  keywords: string[];
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  textPlacement: ShapeTextPlacement;
  contentPadding: string;
  drawioStyle: string;
  visible: boolean;
}

export const SHAPE_CATEGORY_LABELS: Record<Exclude<ShapeCategory, 'internal'>, string> = {
  flowchart: '标准流程图',
  bpmn: 'BPMN 2.0',
  uml: 'UML',
  erd: '实体关系图',
  architecture: '系统架构',
  scientific: '科研论文图元',
  basic: '基础图形',
  container: '容器与标注',
};

const defaults = {
  minWidth: 56,
  minHeight: 40,
  textPlacement: 'center' as ShapeTextPlacement,
  contentPadding: '10px 14px',
  visible: true,
};

function define(
  kind: ShapeKind,
  label: string,
  standardName: string,
  category: ShapeCategory,
  width: number,
  height: number,
  drawioStyle: string,
  keywords: string[],
  overrides: Partial<Omit<ShapeDefinition, 'kind' | 'label' | 'standardName' | 'category' | 'width' | 'height' | 'drawioStyle' | 'keywords'>> = {},
): ShapeDefinition {
  return { kind, label, standardName, category, width, height, drawioStyle, keywords, ...defaults, ...overrides };
}

export const SHAPE_REGISTRY: ShapeDefinition[] = [
  define('start', '开始 / 结束', 'Terminator', 'flowchart', 148, 56, 'rounded=1;arcSize=50', ['终止符', '起止', 'terminator', 'start', 'end']),
  define('process', '处理', 'Process', 'flowchart', 176, 72, 'rounded=0', ['步骤', '动作', 'process', 'action']),
  define('decision', '判断', 'Decision', 'flowchart', 144, 112, 'rhombus', ['条件', '分支', 'diamond', 'decision'], { contentPadding: '20% 24%' }),
  define('data', '输入 / 输出', 'Input / Output', 'flowchart', 176, 72, 'shape=parallelogram', ['数据', '输入输出', 'parallelogram', 'input', 'output'], { contentPadding: '10px 24px' }),
  define('document', '文档', 'Document', 'flowchart', 176, 82, 'shape=document', ['文件', '报告', 'document'], { contentPadding: '10px 14px 18px' }),
  define('multiple-documents', '多文档', 'Multiple Documents', 'flowchart', 184, 96, 'shape=mxgraph.flowchart.multidocument', ['多个文档', '报表', 'multiple documents'], { contentPadding: '10px 18px 24px' }),
  define('predefined-process', '预定义过程', 'Predefined Process', 'flowchart', 176, 72, 'shape=process', ['子流程', '子程序', 'subroutine', 'predefined process'], { contentPadding: '10px 26px' }),
  define('preparation', '准备', 'Preparation', 'flowchart', 176, 72, 'shape=hexagon', ['初始化', '设置', 'preparation', 'setup'], { contentPadding: '10px 24px' }),
  define('manual', '手工输入', 'Manual Input', 'flowchart', 176, 72, 'shape=manualInput', ['键盘', '人工录入', 'manual input'], { contentPadding: '14px 20px 10px' }),
  define('manual-operation', '人工操作', 'Manual Operation', 'flowchart', 176, 72, 'shape=trapezoid;direction=south', ['人工步骤', '手动处理', 'manual operation'], { contentPadding: '10px 24px' }),
  define('stored-data', '存储数据', 'Stored Data', 'flowchart', 176, 72, 'shape=mxgraph.flowchart.stored_data', ['数据存储', 'stored data'], { contentPadding: '10px 24px' }),
  define('database', '数据库', 'Database', 'flowchart', 148, 92, 'shape=cylinder3', ['磁盘', '数据源', 'database', 'cylinder'], { contentPadding: '18px 14px 10px' }),
  define('internal-storage', '内部存储', 'Internal Storage', 'flowchart', 160, 84, 'shape=internalStorage', ['内存', 'memory', 'internal storage'], { contentPadding: '18px 14px 10px 24px' }),
  define('display', '显示', 'Display', 'flowchart', 176, 80, 'shape=display', ['屏幕', '界面输出', 'display'], { contentPadding: '10px 25px' }),
  define('delay', '延迟', 'Delay', 'flowchart', 160, 80, 'shape=delay', ['等待', '延时', 'delay', 'wait'], { contentPadding: '10px 30px 10px 14px' }),
  define('on-page-connector', '页内连接符', 'On-page Connector', 'flowchart', 72, 72, 'ellipse=1', ['连接点', '圆形', 'on-page connector'], { minWidth: 40, contentPadding: '15%' }),
  define('off-page-connector', '跨页连接符', 'Off-page Connector', 'flowchart', 88, 88, 'shape=offPageConnector', ['跨页', '链接', 'off-page connector'], { contentPadding: '10px 14px 24px' }),
  define('merge', '合并', 'Merge', 'flowchart', 92, 76, 'shape=triangle;direction=south', ['汇合', 'merge'], { contentPadding: '10px 18px 24px' }),
  define('extract', '提取', 'Extract', 'flowchart', 92, 76, 'shape=triangle;direction=north', ['拆分', 'extract'], { contentPadding: '25px 18px 8px' }),
  define('sort', '排序', 'Sort', 'flowchart', 100, 88, 'rhombus', ['排序', 'sort'], { contentPadding: '18% 24%' }),
  define('collate', '校对', 'Collate', 'flowchart', 100, 88, 'shape=mxgraph.flowchart.collate', ['整理', '核对', 'collate'], { contentPadding: '24px 22px' }),
  define('summing-junction', '汇总连接', 'Summing Junction', 'flowchart', 72, 72, 'ellipse=1', ['求和', '汇总', 'summing junction'], { minWidth: 40, contentPadding: '18%' }),
  define('or-junction', '或连接', 'Or Junction', 'flowchart', 72, 72, 'ellipse=1', ['逻辑或', 'or junction'], { minWidth: 40, contentPadding: '18%' }),
  define('sequential-storage', '顺序存储', 'Sequential Access Storage', 'flowchart', 96, 96, 'shape=mxgraph.flowchart.sequential_data', ['磁带', '顺序访问', 'sequential storage'], { contentPadding: '18%' }),
  define('direct-storage', '直接存储', 'Direct Access Storage', 'flowchart', 176, 76, 'shape=mxgraph.flowchart.direct_data', ['磁盘', '直接访问', 'direct storage'], { contentPadding: '10px 26px' }),
  define('paper-tape', '纸带', 'Paper Tape', 'flowchart', 176, 76, 'shape=mxgraph.flowchart.paper_tape', ['连续输入', 'paper tape'], { contentPadding: '16px 14px' }),
  define('punched-card', '穿孔卡片', 'Punched Card', 'flowchart', 176, 76, 'shape=card', ['卡片', 'punched card'], { contentPadding: '10px 14px 10px 26px' }),
  define('loop-limit', '循环界限', 'Loop Limit', 'flowchart', 176, 76, 'shape=mxgraph.flowchart.loop_limit', ['循环开始', '循环结束', 'loop limit'], { contentPadding: '16px 22px 10px' }),
  define('annotation', '批注范围', 'Annotation', 'flowchart', 176, 92, 'shape=mxgraph.flowchart.annotation_1', ['注解', '说明范围', 'annotation'], { textPlacement: 'left', contentPadding: '10px 24px 10px 8px' }),

  define('bpmn-start-event', '开始事件', 'BPMN Start Event', 'bpmn', 64, 64, 'ellipse=1', ['事件', '开始', 'bpmn start event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-intermediate-event', '中间事件', 'BPMN Intermediate Event', 'bpmn', 64, 64, 'ellipse=1;double=1', ['事件', '中间', 'bpmn intermediate event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-end-event', '结束事件', 'BPMN End Event', 'bpmn', 64, 64, 'ellipse=1;strokeWidth=3', ['事件', '结束', 'bpmn end event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-task', '任务', 'BPMN Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['活动', '任务', 'bpmn task']),
  define('bpmn-user-task', '用户任务', 'BPMN User Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['人员', '用户', 'user task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-service-task', '服务任务', 'BPMN Service Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['自动化', '系统服务', 'service task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-exclusive-gateway', '排他网关', 'BPMN Exclusive Gateway', 'bpmn', 92, 92, 'rhombus', ['异或', 'XOR', 'exclusive gateway'], { contentPadding: '26%' }),
  define('bpmn-parallel-gateway', '并行网关', 'BPMN Parallel Gateway', 'bpmn', 92, 92, 'rhombus', ['并行', 'AND', 'parallel gateway'], { contentPadding: '26%' }),
  define('bpmn-inclusive-gateway', '包容网关', 'BPMN Inclusive Gateway', 'bpmn', 92, 92, 'rhombus', ['包含', 'OR', 'inclusive gateway'], { contentPadding: '26%' }),
  define('bpmn-data-object', '数据对象', 'BPMN Data Object', 'bpmn', 112, 92, 'shape=document', ['数据对象', 'data object'], { contentPadding: '10px 18px 10px 12px' }),
  define('bpmn-data-store', '数据存储', 'BPMN Data Store', 'bpmn', 128, 92, 'shape=cylinder3', ['数据仓库', 'data store'], { contentPadding: '18px 12px 10px' }),
  define('bpmn-pool', '参与者池', 'BPMN Pool', 'bpmn', 440, 220, 'swimlane;horizontal=0;startSize=36', ['参与者', 'pool', 'participant'], { minWidth: 260, minHeight: 120, textPlacement: 'lane', contentPadding: '10px 8px' }),
  define('bpmn-message-event', '消息事件', 'BPMN Message Event', 'bpmn', 64, 64, 'ellipse=1', ['消息', '邮件', 'message event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-timer-event', '定时事件', 'BPMN Timer Event', 'bpmn', 64, 64, 'ellipse=1', ['定时器', '超时', 'timer event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-error-event', '错误事件', 'BPMN Error Event', 'bpmn', 64, 64, 'ellipse=1', ['异常', '错误', 'error event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-signal-event', '信号事件', 'BPMN Signal Event', 'bpmn', 64, 64, 'ellipse=1', ['信号', '广播', 'signal event'], { minWidth: 40, contentPadding: '16%' }),
  define('bpmn-send-task', '发送任务', 'BPMN Send Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['发送', '消息', 'send task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-receive-task', '接收任务', 'BPMN Receive Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['接收', '消息', 'receive task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-manual-task', '人工任务', 'BPMN Manual Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['人工', '手工', 'manual task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-business-rule-task', '业务规则任务', 'BPMN Business Rule Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['规则', '决策表', 'business rule task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-script-task', '脚本任务', 'BPMN Script Task', 'bpmn', 176, 80, 'rounded=1;arcSize=12', ['脚本', '自动执行', 'script task'], { contentPadding: '10px 14px 10px 34px' }),
  define('bpmn-call-activity', '调用活动', 'BPMN Call Activity', 'bpmn', 184, 84, 'rounded=1;arcSize=12;strokeWidth=3', ['调用', '全局任务', 'call activity']),
  define('bpmn-event-gateway', '事件网关', 'BPMN Event-based Gateway', 'bpmn', 92, 92, 'rhombus', ['事件', '网关', 'event gateway'], { contentPadding: '26%' }),
  define('bpmn-complex-gateway', '复杂网关', 'BPMN Complex Gateway', 'bpmn', 92, 92, 'rhombus', ['复杂', '网关', 'complex gateway'], { contentPadding: '26%' }),
  define('bpmn-transaction', '事务子流程', 'BPMN Transaction', 'bpmn', 220, 120, 'rounded=1;arcSize=10;double=1', ['事务', '子流程', 'transaction'], { minWidth: 150, minHeight: 80 }),

  define('uml-actor', '参与者', 'UML Actor', 'uml', 92, 124, 'shape=umlActor', ['角色', '用户', 'actor'], { minWidth: 60, minHeight: 90, textPlacement: 'footer', contentPadding: '86px 6px 6px' }),
  define('uml-use-case', '用例', 'UML Use Case', 'uml', 176, 84, 'ellipse=1', ['功能', 'use case'], { contentPadding: '12px 24px' }),
  define('uml-class', '类', 'UML Class', 'uml', 184, 132, 'swimlane;startSize=34', ['类图', '属性', '方法', 'class'], { textPlacement: 'header', contentPadding: '8px 12px' }),
  define('uml-package', '包', 'UML Package', 'uml', 190, 120, 'shape=folder', ['模块', '命名空间', 'package'], { contentPadding: '30px 12px 10px' }),
  define('uml-component', '组件', 'UML Component', 'uml', 184, 100, 'shape=component', ['模块', '接口', 'component'], { contentPadding: '10px 18px 10px 32px' }),
  define('uml-state', '状态', 'UML State', 'uml', 176, 80, 'rounded=1;arcSize=18', ['状态机', 'state']),
  define('uml-note', 'UML 注释', 'UML Note', 'uml', 176, 96, 'shape=note', ['注释', '说明', 'uml note'], { textPlacement: 'left', contentPadding: '12px 22px 12px 12px' }),
  define('uml-interface', '接口', 'UML Interface', 'uml', 88, 120, 'shape=lollipop', ['接口', '棒棒糖', 'interface'], { minWidth: 60, minHeight: 80, textPlacement: 'footer', contentPadding: '86px 6px 6px' }),
  define('uml-object', '对象', 'UML Object', 'uml', 184, 92, 'rounded=0', ['实例', '对象图', 'object']),
  define('uml-artifact', '制品', 'UML Artifact', 'uml', 160, 104, 'shape=document', ['文件', '部署制品', 'artifact']),
  define('uml-node', '部署节点', 'UML Deployment Node', 'uml', 176, 120, 'shape=cube', ['设备', '执行环境', 'deployment node']),
  define('uml-activity', '活动', 'UML Activity', 'uml', 176, 76, 'rounded=1;arcSize=28', ['活动图', '动作', 'activity']),
  define('uml-decision', '活动判断', 'UML Decision', 'uml', 84, 84, 'rhombus', ['活动图', '判断', 'decision'], { contentPadding: '26%' }),
  define('uml-final-state', '终止状态', 'UML Final State', 'uml', 64, 64, 'ellipse=1', ['结束', '终止', 'final state'], { minWidth: 40, contentPadding: '18%' }),
  define('uml-lifeline', '生命线', 'UML Lifeline', 'uml', 140, 240, 'shape=umlLifeline', ['时序图', '参与者', 'lifeline'], { minWidth: 90, minHeight: 140, textPlacement: 'header', contentPadding: '8px 10px' }),

  define('erd-entity', '实体', 'ER Entity', 'erd', 176, 78, 'rounded=0', ['实体', 'ER', 'entity']),
  define('erd-weak-entity', '弱实体', 'ER Weak Entity', 'erd', 176, 84, 'rounded=0;double=1', ['弱实体', 'weak entity']),
  define('erd-relationship', '联系', 'ER Relationship', 'erd', 126, 90, 'rhombus', ['关系', '联系', 'relationship'], { contentPadding: '22%' }),
  define('erd-identifying-relationship', '标识联系', 'ER Identifying Relationship', 'erd', 136, 96, 'rhombus;double=1', ['标识关系', 'identifying relationship'], { contentPadding: '23%' }),
  define('erd-attribute', '属性', 'ER Attribute', 'erd', 150, 70, 'ellipse=1', ['字段', '属性', 'attribute']),
  define('erd-key-attribute', '主键属性', 'ER Key Attribute', 'erd', 150, 70, 'ellipse=1', ['主键', '关键属性', 'key attribute']),
  define('erd-multivalued-attribute', '多值属性', 'ER Multivalued Attribute', 'erd', 156, 76, 'ellipse=1;double=1', ['多值', 'multivalued attribute']),
  define('erd-table', '数据表', 'ER Table', 'erd', 210, 140, 'swimlane;startSize=34', ['表', '字段列表', 'table'], { textPlacement: 'header', contentPadding: '8px 12px' }),

  define('arch-service', '服务', 'Application Service', 'architecture', 176, 80, 'rounded=1;arcSize=12', ['微服务', '应用服务', 'service']),
  define('arch-api', 'API 接口', 'API Endpoint', 'architecture', 160, 76, 'shape=hexagon', ['接口', '网关', 'API']),
  define('arch-server', '服务器', 'Server', 'architecture', 128, 112, 'shape=mxgraph.networks.server', ['主机', '计算节点', 'server']),
  define('arch-database', '架构数据库', 'Architecture Database', 'architecture', 140, 104, 'shape=cylinder3', ['持久化', '数据库', 'database']),
  define('arch-cache', '缓存', 'Cache', 'architecture', 148, 88, 'shape=cylinder3', ['Redis', '内存缓存', 'cache']),
  define('arch-queue', '消息队列', 'Message Queue', 'architecture', 176, 82, 'shape=mxgraph.basic.rect', ['Kafka', '队列', '消息总线', 'queue']),
  define('arch-storage', '对象存储', 'Object Storage', 'architecture', 156, 100, 'shape=folder', ['文件', 'Bucket', 'storage']),
  define('arch-load-balancer', '负载均衡', 'Load Balancer', 'architecture', 176, 88, 'shape=mxgraph.networks.load_balancer', ['LB', '流量', 'load balancer']),
  define('arch-firewall', '防火墙', 'Firewall', 'architecture', 156, 96, 'shape=mxgraph.networks.firewall', ['安全', '网络边界', 'firewall']),
  define('arch-client', '客户端', 'Client Device', 'architecture', 148, 104, 'shape=mxgraph.networks.pc', ['浏览器', '桌面', '终端', 'client']),

  define('scientific-image-frame', '观察帧', 'Observation / Image Frame', 'scientific', 168, 112, 'shape=imageFrame', ['论文', '图像', '视频帧', '观察', 'camera frame', 'observation'], { minWidth: 90, minHeight: 64, textPlacement: 'footer', contentPadding: '8px' }),
  define('scientific-token-strip', 'Token 序列', 'Token Sequence Strip', 'scientific', 220, 72, 'shape=tokenStrip', ['token', '序列', 'embedding', '提示词', 'patch'], { minWidth: 120, minHeight: 52, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-transformer', 'Transformer 模块', 'Transformer Module', 'scientific', 188, 136, 'shape=transformer', ['LLM', 'VLM', 'attention', '主干', 'backbone', 'transformer'], { minWidth: 120, minHeight: 96, textPlacement: 'footer', contentPadding: '7px 10px' }),
  define('scientific-layer-stack', '网络层堆叠', 'Neural Layer Stack', 'scientific', 174, 122, 'shape=layerStack', ['层', '堆叠', 'Nx', 'encoder', 'decoder', 'layers'], { minWidth: 105, minHeight: 80, textPlacement: 'footer', contentPadding: '7px 10px' }),
  define('scientific-dataset-stack', '数据集堆叠', 'Dataset Stack', 'scientific', 166, 114, 'shape=datasetStack', ['数据集', '数据混合', 'corpus', 'dataset', 'mixture'], { minWidth: 100, minHeight: 76, textPlacement: 'footer', contentPadding: '7px 10px' }),
  define('scientific-frozen', '冻结模块', 'Frozen Module', 'scientific', 150, 92, 'shape=frozenModule', ['冻结', 'snowflake', 'fixed', 'frozen weights'], { minWidth: 88, minHeight: 62, textPlacement: 'footer', contentPadding: '7px 9px' }),
  define('scientific-trainable', '可训练模块', 'Trainable Module', 'scientific', 150, 92, 'shape=trainableModule', ['训练', '梯度', 'trainable', 'learnable', 'weights'], { minWidth: 88, minHeight: 62, textPlacement: 'footer', contentPadding: '7px 9px' }),
  define('scientific-camera', '相机 / 传感器', 'Camera / Sensor', 'scientific', 122, 92, 'shape=camera', ['相机', '传感器', 'RGB-D', 'camera', 'sensor'], { minWidth: 76, minHeight: 58, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-robot-arm', '机械臂', 'Robot Arm', 'scientific', 146, 136, 'shape=robotArm', ['机械臂', '夹爪', 'manipulator', 'robot arm', 'gripper'], { minWidth: 88, minHeight: 88, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-humanoid', '人形机器人', 'Humanoid Robot', 'scientific', 128, 146, 'shape=humanoid', ['人形', '机器人', 'humanoid', 'embodiment'], { minWidth: 78, minHeight: 96, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-mobile-robot', '移动机器人', 'Mobile Robot', 'scientific', 154, 116, 'shape=mobileRobot', ['移动底盘', '轮式', 'mobile robot', 'navigation'], { minWidth: 92, minHeight: 76, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-trajectory', '动作轨迹', 'Action Trajectory', 'scientific', 220, 92, 'shape=trajectory', ['轨迹', '路径', 'waypoint', 'action trajectory', 'motion'], { minWidth: 120, minHeight: 58, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-voxel-grid', '体素 / 空间网格', 'Voxel / Spatial Grid', 'scientific', 154, 126, 'shape=voxelGrid', ['体素', '3D', '空间', 'voxel', 'spatial grid', 'point cloud'], { minWidth: 92, minHeight: 82, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-coordinate-frame', '坐标系', 'Coordinate Frame', 'scientific', 112, 112, 'shape=coordinateFrame', ['坐标', 'XYZ', 'pose', 'coordinate frame'], { minWidth: 66, minHeight: 66, textPlacement: 'footer', contentPadding: '6px' }),
  define('scientific-timeline', '时间步序列', 'Temporal Storyboard', 'scientific', 250, 98, 'shape=timeline', ['时间轴', '步骤', 'rollout', 'temporal', 'storyboard', 'timestep'], { minWidth: 140, minHeight: 62, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-mini-plot', '嵌入式曲线图', 'Embedded Mini Plot', 'scientific', 184, 126, 'shape=miniPlot', ['曲线', '坐标轴', 'plot', 'chart', 'metric', 'ablation'], { minWidth: 108, minHeight: 80, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-action-chunk', '动作块', 'Action Chunk', 'scientific', 196, 76, 'shape=actionChunk', ['动作', 'action token', 'chunk', 'control horizon'], { minWidth: 112, minHeight: 52, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-loss-target', '损失 / 目标', 'Loss / Objective', 'scientific', 126, 110, 'shape=lossTarget', ['loss', 'objective', 'reward', '损失', '目标', '奖励'], { minWidth: 74, minHeight: 72, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-scene-frame', '机器人场景帧', 'Robot Scene Frame', 'scientific', 210, 146, 'shape=robotScene', ['论文', '场景', '桌面', '操作', 'robot scene', 'workspace'], { minWidth: 126, minHeight: 92, textPlacement: 'footer', contentPadding: '7px 9px' }),
  define('scientific-feature-map', '特征图堆叠', 'Feature Map Stack', 'scientific', 166, 126, 'shape=featureMap', ['特征图', '视觉特征', 'feature map', 'latent'], { minWidth: 96, minHeight: 78, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-attention-map', '注意力矩阵', 'Attention Matrix', 'scientific', 148, 132, 'shape=attentionMap', ['注意力', '矩阵', 'attention', 'heatmap'], { minWidth: 86, minHeight: 78, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-embedding-space', '嵌入空间', 'Embedding Space', 'scientific', 164, 128, 'shape=embeddingSpace', ['嵌入', '聚类', 'embedding', 'latent space'], { minWidth: 96, minHeight: 78, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-probability-bars', '概率分布', 'Probability Distribution', 'scientific', 174, 118, 'shape=probabilityBars', ['概率', '分布', '置信度', 'probability', 'confidence'], { minWidth: 100, minHeight: 72, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-uncertainty-band', '不确定性带', 'Uncertainty Band', 'scientific', 196, 122, 'shape=uncertaintyBand', ['不确定性', '置信区间', 'uncertainty', 'confidence interval'], { minWidth: 112, minHeight: 74, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-metric-panel', '指标面板', 'Metric Panel', 'scientific', 216, 108, 'shape=metricPanel', ['指标', '延迟', '吞吐', 'metric', 'latency', 'throughput'], { minWidth: 126, minHeight: 68, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-ablation-table', '消融表格', 'Ablation Table', 'scientific', 206, 132, 'shape=ablationTable', ['消融', '表格', '对比', 'ablation', 'comparison'], { minWidth: 120, minHeight: 82, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-decision-gate', '候选决策器', 'Candidate Decision Gate', 'scientific', 188, 132, 'shape=decisionGate', ['候选', '排序', '选择', 'decision', 'ranking', 'score'], { minWidth: 108, minHeight: 80, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-prompt-card', '提示 / 指令卡', 'Prompt / Instruction Card', 'scientific', 190, 112, 'shape=promptCard', ['提示', '指令', '对话', 'prompt', 'instruction', 'chat'], { minWidth: 110, minHeight: 70, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-preference-pair', '偏好样本对', 'Preference Pair', 'scientific', 206, 126, 'shape=preferencePair', ['偏好', '选择', '拒绝', 'preference', 'chosen', 'rejected'], { minWidth: 120, minHeight: 78, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-data-funnel', '数据筛选漏斗', 'Data Curation Funnel', 'scientific', 172, 132, 'shape=dataFunnel', ['过滤', '去重', '策展', 'filter', 'deduplicate', 'curation'], { minWidth: 100, minHeight: 80, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-legend', '科研图例', 'Scientific Encoding Legend', 'scientific', 220, 118, 'shape=scientificLegend', ['图例', '编码', '冻结', '训练', 'legend', 'encoding'], { minWidth: 128, minHeight: 74, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-equation', '公式块', 'Equation Block', 'scientific', 220, 92, 'shape=equation', ['公式', '目标函数', '数学', 'equation', 'objective', 'math'], { minWidth: 126, minHeight: 60, textPlacement: 'center', contentPadding: '12px 16px' }),
  define('scientific-tensor', '张量与维度', 'Tensor with Dimensions', 'scientific', 184, 132, 'shape=tensor', ['张量', '维度', '矩阵', 'tensor', 'shape', 'dimension'], { minWidth: 106, minHeight: 82, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-zoom-inset', '局部放大', 'Zoom Inset', 'scientific', 210, 132, 'shape=zoomInset', ['局部放大', '细节', 'inset', 'zoom', 'callout'], { minWidth: 122, minHeight: 82, textPlacement: 'footer', contentPadding: '7px 8px' }),
  define('scientific-task-object', '任务物体', 'Task Object', 'scientific', 118, 108, 'shape=taskObject', ['任务物体', '方块', '容器', 'object', 'cube', 'manipulation'], { minWidth: 70, minHeight: 68, textPlacement: 'footer', contentPadding: '6px 7px' }),
  define('scientific-goal-region', '目标区域', 'Goal Region', 'scientific', 150, 100, 'shape=goalRegion', ['目标区域', '放置区', '目标位姿', 'goal', 'target region', 'placement'], { minWidth: 88, minHeight: 62, textPlacement: 'footer', contentPadding: '6px 8px' }),
  define('scientific-contact-point', '接触点', 'Contact Point', 'scientific', 108, 96, 'shape=contactPoint', ['接触点', '力', '夹爪', 'contact', 'force', 'grasp'], { minWidth: 66, minHeight: 60, textPlacement: 'footer', contentPadding: '6px 7px' }),
  define('scientific-release-gate', '发布门', 'Release Gate', 'scientific', 196, 126, 'shape=releaseGate', ['发布门', '验收', '安全门', 'release gate', 'acceptance', 'safety'], { minWidth: 112, minHeight: 78, textPlacement: 'footer', contentPadding: '7px 8px' }),

  define('rectangle', '矩形', 'Rectangle', 'basic', 176, 80, 'rounded=0', ['方框', 'rectangle']),
  define('rounded-rectangle', '圆角矩形', 'Rounded Rectangle', 'basic', 176, 80, 'rounded=1;arcSize=12', ['圆角', 'rounded rectangle']),
  define('ellipse', '椭圆', 'Ellipse', 'basic', 160, 88, 'ellipse=1', ['圆形', 'oval', 'ellipse'], { contentPadding: '12px 22px' }),
  define('triangle', '三角形', 'Triangle', 'basic', 112, 96, 'shape=triangle', ['三角', 'triangle'], { contentPadding: '28px 18px 8px' }),
  define('hexagon', '六边形', 'Hexagon', 'basic', 168, 84, 'shape=hexagon', ['六边形', 'hexagon'], { contentPadding: '10px 24px' }),
  define('cloud', '云', 'Cloud', 'basic', 176, 108, 'ellipse;shape=cloud', ['云服务', 'cloud'], { contentPadding: '20px 26px' }),
  define('callout', '标注气泡', 'Callout', 'basic', 176, 104, 'shape=callout', ['对话', '气泡', 'callout'], { contentPadding: '10px 14px 24px' }),

  define('note', '便笺', 'Note', 'container', 176, 96, 'shape=note', ['备注', '注释', 'note'], { textPlacement: 'left', contentPadding: '12px 22px 12px 12px' }),
  define('group', '分组容器', 'Group / Container', 'container', 420, 280, 'swimlane;startSize=28', ['容器', '分组', 'container', 'group'], { minWidth: 220, minHeight: 140, textPlacement: 'header', contentPadding: '8px 12px' }),
  define('swimlane', '泳道', 'Swimlane', 'container', 440, 180, 'swimlane;horizontal=0;startSize=40', ['职责', '泳道图', 'lane', 'swimlane'], { minWidth: 260, minHeight: 110, textPlacement: 'lane', contentPadding: '10px 8px' }),
  define('vector', '矢量图元', 'SVG Vector Element', 'internal', 120, 80, 'shape=mxgraph.basic.rect', ['SVG', '路径', '矢量', 'path', 'vector'], { minWidth: 4, minHeight: 4, visible: false, contentPadding: '0' }),
  define('image', '视觉参考', 'Visual Reference', 'internal', 420, 280, 'rounded=0', ['图片', '参考', 'image'], { minWidth: 120, minHeight: 80, visible: false }),
];

const registryMap = new Map(SHAPE_REGISTRY.map((definition) => [definition.kind, definition]));

export const VISIBLE_SHAPES = SHAPE_REGISTRY.filter((definition) => definition.visible);

export function getShapeDefinition(kind: ShapeKind): ShapeDefinition {
  return registryMap.get(kind) ?? registryMap.get('process')!;
}

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' && registryMap.has(value as ShapeKind);
}
