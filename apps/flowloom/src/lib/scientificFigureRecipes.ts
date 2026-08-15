import type { ScientificSchematicTemplateId, ShapeKind } from '../types';

export interface ScientificRecipeElement {
  kind: ShapeKind;
  label: string;
  purpose: string;
}

export interface ScientificFigureRecipe {
  templateId: ScientificSchematicTemplateId;
  family: 'llm' | 'embodied' | 'cross-domain';
  evidence: string;
  aspectRatio: string;
  readingOrder: string;
  zones: string[];
  focalPoint: string;
  elements: ScientificRecipeElement[];
  arrowRules: string[];
  colorRules: string[];
  steps: string[];
  checks: string[];
}

export const ARXIV_FIGURE_CORPUS_SUMMARY = {
  paperCount: 100,
  llmPaperCount: 50,
  embodiedPaperCount: 50,
  parsedFigureCount: 1289,
  llmFigureCount: 656,
  embodiedFigureCount: 633,
  representativePatterns: {
    llm: {
      trainingPipeline: 19,
    },
    embodied: {
      robotEmbodiment: 48,
      actionTrajectory: 38,
      imageStrip: 29,
      trainingPipeline: 20,
    },
  },
  generatedAt: '2026-07-28',
} as const;

const commonChecks = [
  '缩到论文单栏宽度后，主路径、阶段标题和图例仍可辨认。',
  '同一种颜色只表达一种角色；冻结/训练状态还要用线型或徽记冗余编码。',
  '删除装饰性连线，交叉线超过两处时改用分区、汇流点或编号。',
  '照片、数据集和外部图标在 provenance 中保留作者、来源和许可证。',
];

function recipe(input: Omit<ScientificFigureRecipe, 'checks'> & { checks?: string[] }): ScientificFigureRecipe {
  return { ...input, checks: [...(input.checks ?? []), ...commonChecks] };
}

export const SCIENTIFIC_FIGURE_RECIPES: Record<ScientificSchematicTemplateId, ScientificFigureRecipe> = {
  'multimodal-foundation': recipe({
    templateId: 'multimodal-foundation',
    family: 'cross-domain',
    evidence: 'LLM 样本中 37/50 的代表图出现 token/提示序列，9/50 混合实际图像帧。',
    aspectRatio: '约 2:1 横向，四列布局',
    readingOrder: '左侧模态输入 → 编码/token 汇流 → 中央共享主干 → 右侧任务分支；目标函数置底。',
    zones: ['输入模态栏', '编码与 token 带', '统一主干', '任务输出栏', '底部训练目标'],
    focalPoint: '共享主干应占全图最大面积，输入和输出保持对称但不抢视觉重量。',
    elements: [
      { kind: 'scientific-image-frame', label: '图像/视频帧', purpose: '让读者看到真实输入，不用文字方框代替。' },
      { kind: 'scientific-token-strip', label: '交错 token 带', purpose: '显示模态在序列中的顺序和融合位置。' },
      { kind: 'scientific-transformer', label: '统一 Transformer', purpose: '表现共享注意力主干。' },
      { kind: 'scientific-loss-target', label: '对齐目标', purpose: '把训练信号与推理数据流分开。' },
    ],
    arrowRules: ['实线单箭头 = 推理时的数据流。', '虚线开箭头 = 仅训练时使用的监督或目标。', '从主干向右分叉 = 同一表征服务不同任务头。'],
    colorRules: ['蓝色 = 原始模态；黄色 = token/序列；紫色 = 共享主干；红色 = 任务头。'],
    steps: [
      '先画四个等高阶段容器，中央主干列宽约占 32%。',
      '在左列放真实图像帧、语言、音频和状态；使用同一垂直基线。',
      '每种模态连接独立编码器，再汇入一条横向 token 带。',
      '把共享 Transformer 放在 token 带下方，内部只保留 2–3 个代表层。',
      '右列按语言、规划、动作三种任务头垂直排列并从主干分叉。',
      '将损失目标放在主干下方，用虚线向上连接，避免与推理路径混淆。',
      '最后补一条图例，明确颜色角色和冻结/可训练状态。',
    ],
  }),
  'vision-language-bridge': recipe({
    templateId: 'vision-language-bridge',
    family: 'llm',
    evidence: 'BLIP-2、LLaVA、OpenVLA 等图反复采用冻结视觉主干 + 轻量桥接器 + 语言主干。',
    aspectRatio: '约 2:1 横向，上下两阶段或左右双阶段',
    readingOrder: '阶段一做表征对齐，阶段二做生成/指令调优；相同模块保持同一横坐标。',
    zones: ['阶段一：表示对齐', '阶段二：生成调优', '共享冻结模块', '训练目标/样例'],
    focalPoint: '桥接器是叙事中心，尺寸小于主干但用暖色和汇流箭头强调。',
    elements: [
      { kind: 'scientific-frozen', label: '冻结视觉编码器', purpose: '明确参数状态，防止读者误解训练范围。' },
      { kind: 'scientific-token-strip', label: '查询/token', purpose: '展示桥接器输出如何进入 LLM。' },
      { kind: 'scientific-transformer', label: 'Q-Former / Projector', purpose: '表示跨模态桥接。' },
      { kind: 'scientific-trainable', label: '可训练桥接层', purpose: '用梯度徽记冗余表示可训练状态。' },
    ],
    arrowRules: ['实线 = 前向特征；虚线 = 参数共享或复制；向上开箭头 = 损失反传。'],
    colorRules: ['灰蓝 = 冻结；橙色 = 新增桥接器；紫色 = 语言主干；浅红 = 生成目标。'],
    steps: [
      '先把画布分成两个阶段，阶段标题直接说明训练目标。',
      '在两个阶段复用同一视觉编码器和 LLM 位置，形成视觉对应。',
      '在二者之间放桥接器与 token 带，并标出查询数量或投影维度。',
      '冻结模块使用虚线边框/雪花；可训练模块使用实线/上升箭头。',
      '阶段一连接对比或匹配目标，阶段二连接文本生成目标。',
      '用一条小型输入样例说明图像如何变成查询 token，避免纯抽象框图。',
    ],
  }),
  'vla-policy': recipe({
    templateId: 'vla-policy',
    family: 'embodied',
    evidence: `具身样本中 ${ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.robotEmbodiment}/50 出现机器人机体、${ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.actionTrajectory}/50 出现动作轨迹、${ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.imageStrip}/50 出现图像条带。`,
    aspectRatio: '约 2.2:1 横向，观察/模型/动作/环境四段',
    readingOrder: '多相机观察与指令 → VLM 主干 → 动作专家/动作块 → 机器人 → 新观察回环。',
    zones: ['观察与编码', '共享 VLM', '动作生成', '机器人环境', '底部闭环'],
    focalPoint: 'VLM 与动作专家组成双核心；机器人机体必须是可识别图形而非椭圆文字。',
    elements: [
      { kind: 'scientific-image-frame', label: '相机观察帧', purpose: '表现真实场景和多视角输入。' },
      { kind: 'scientific-transformer', label: 'VLM 主干', purpose: '融合视觉和语言。' },
      { kind: 'scientific-action-chunk', label: '动作块', purpose: '显示控制时域和动作维度。' },
      { kind: 'scientific-robot-arm', label: '机器人机体', purpose: '明确策略落在哪种物理平台。' },
      { kind: 'scientific-trajectory', label: '执行轨迹', purpose: '把 token 输出落到连续运动。' },
    ],
    arrowRules: ['实线 = 单步推理；粗实线 = 动作输出；弯曲虚线 = 环境反馈；双线 = 多相机并行输入。'],
    colorRules: ['蓝色 = 观察；紫色 = 认知主干；红色 = 策略/动作；绿色 = 机器人和环境。'],
    steps: [
      '左侧放 2–3 个相机帧和一句任务指令，帧下标明视角。',
      '把图像编码器、tokenizer 和状态投影器汇入统一 token 带。',
      '中央放 VLM 主干，右邻动作专家；两者视觉上形成一个组合模型。',
      '动作专家输出 6–16 个动作 token，使用动作块图元而不是单一方框。',
      '动作块连接轨迹和具体机器人机体，标注关节/夹爪/底盘维度。',
      '从机器人环境画弯曲虚线回到观察帧，并标注 next observation。',
      '若比较训练与部署，在顶部加阶段标签，不重复整套模块。',
    ],
  }),
  'prompt-conditioned-agent': recipe({
    templateId: 'prompt-conditioned-agent',
    family: 'embodied',
    evidence: 'VIMA、ReAct、Inner Monologue 等图把任务提示、历史和工具/环境反馈画成独立通道。',
    aspectRatio: '约 2:1 横向，提示/控制器/交互三列',
    readingOrder: '多模态提示 → 条件化控制器；交互历史从上方进入；动作与观察在右侧闭环。',
    zones: ['任务提示', '提示编码', '因果控制器', '交互历史', '环境闭环'],
    focalPoint: '交叉注意力连接提示与控制器，是区别于普通策略图的关键。',
    elements: [
      { kind: 'scientific-image-frame', label: '示范帧', purpose: '提供可组合的视觉提示。' },
      { kind: 'scientific-token-strip', label: '提示 token', purpose: '统一文本、对象和图像提示。' },
      { kind: 'scientific-timeline', label: '交互历史', purpose: '表现 observation/action 交替序列。' },
      { kind: 'scientific-action-chunk', label: '运动指令', purpose: '输出下一个控制片段。' },
    ],
    arrowRules: ['提示实线 = 条件输入；历史实线 = 自回归上下文；回环虚线 = 新观察。'],
    colorRules: ['蓝 = 提示输入；黄 = token；紫 = 控制器；红 = 动作；绿 = 环境。'],
    steps: [
      '把文本目标、参考图和示范帧组合成左侧提示面板。',
      '提示编码器下方画 token 带，并区分语言 token 与对象 token。',
      '中央放因果 Transformer，上方放 observation/action 交互历史。',
      '在提示带与主干之间画交叉注意力桥，标注 conditioning。',
      '控制器输出动作块，连接右侧机器人工作空间。',
      '新观察沿虚线回到历史；不要把反馈画成第二条正向主路径。',
    ],
  }),
  'embodied-loop': recipe({
    templateId: 'embodied-loop',
    family: 'embodied',
    evidence: '具身代表图中 16/50 明确形成 agent/environment 回路，世界模型和规划常作为上半环。',
    aspectRatio: '约 1.7:1 环形构图',
    readingOrder: '感知 → 状态 → 世界模型 → 规划 → 策略 → 执行 → 环境 → 感知。',
    zones: ['上环：认知与规划', '右侧：策略与执行', '下环：物理环境', '左侧：感知与记忆'],
    focalPoint: '闭环本身是主角；节点沿椭圆路径排布，避免强行塞进四列。',
    elements: [
      { kind: 'scientific-camera', label: '多模态传感器', purpose: '闭环的观察入口。' },
      { kind: 'scientific-voxel-grid', label: '世界状态', purpose: '表达对象、空间和潜在动力学。' },
      { kind: 'scientific-trajectory', label: '候选轨迹', purpose: '展示规划而非单点动作。' },
      { kind: 'scientific-robot-arm', label: '物理执行体', purpose: '闭合环境反馈。' },
    ],
    arrowRules: ['顺时针实线 = 主控制回路；虚线 = 记忆检索/安全约束；点线 = 想象的未来。'],
    colorRules: ['青蓝 = 感知；紫 = 世界模型；红 = 策略；绿 = 物理环境；灰 = 辅助记忆。'],
    steps: [
      '先确定闭环的七个状态，并沿椭圆而不是直线排布。',
      '上方放世界模型和规划，下方放执行体与环境，形成认知/物理对照。',
      '感知节点使用相机图元，状态节点使用体素或关系图。',
      '策略输出连接轨迹，再进入机器人，而不是直接跳到环境。',
      '从环境回到感知画唯一一条醒目的反馈箭头。',
      '记忆、安全和想象用虚线从环外接入，避免破坏主环。',
    ],
  }),
  'train-deploy': recipe({
    templateId: 'train-deploy',
    family: 'cross-domain',
    evidence: `LLM ${ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.llm.trainingPipeline}/50、具身 ${ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.embodied.trainingPipeline}/50 的代表图包含训练流程；数据混合和在线部署经常同图出现。`,
    aspectRatio: '约 2:1 横向，训练区约占 60%，部署区约占 40%',
    readingOrder: '多源数据 → 预训练/适配 → checkpoint 分界 → 在线模型 → 动作与回流。',
    zones: ['离线数据', '训练阶段', '模型检查点', '在线部署', '失败回流'],
    focalPoint: '训练/部署分界线和 checkpoint 必须明显，防止数据流与在线反馈混在一起。',
    elements: [
      { kind: 'scientific-dataset-stack', label: '数据混合', purpose: '表示不同来源和采样比例。' },
      { kind: 'scientific-trainable', label: '训练阶段', purpose: '标出哪些参数更新。' },
      { kind: 'document', label: 'Checkpoint', purpose: '作为离线/在线边界。' },
      { kind: 'scientific-mini-plot', label: '在线指标', purpose: '把部署监控嵌入系统全景。' },
    ],
    arrowRules: ['训练实线 = 数据与模型流；向上虚线 = 损失；回弯虚线 = 筛选后的失败样本。'],
    colorRules: ['土黄 = 数据；紫 = 预训练；红 = 策略适配；蓝 = 在线输入；绿 = 部署环境。'],
    steps: [
      '用一条竖向分界把画布分为离线训练和在线部署。',
      '左侧竖排图文、开放机器人和目标机器人三组数据。',
      '数据先汇入混合/归一化，再分别进入预训练和策略适配。',
      '在分界线上放 checkpoint，所有部署流量只从这里进入。',
      '右侧画观察/指令 → 通用策略 → 动作块 → 机器人闭环。',
      '在线指标放在机器人下方，失败回流用长虚线返回目标数据。',
    ],
  }),
  'llm-training-pipeline': recipe({
    templateId: 'llm-training-pipeline',
    family: 'llm',
    evidence: `训练流程是 LLM 代表图的高频构图（${ARXIV_FIGURE_CORPUS_SUMMARY.representativePatterns.llm.trainingPipeline}/50），常分预训练、SFT、偏好对齐和评测四段。`,
    aspectRatio: '约 2.4:1 横向，四阶段泳道',
    readingOrder: '语料 → 预训练 → 指令微调 → 偏好对齐 → 评测/部署；每阶段下方附数据和目标。',
    zones: ['语料策展', '预训练', '监督微调', '偏好对齐', '评测/部署'],
    focalPoint: '同一个模型 checkpoint 在阶段间演化；用重复但一致的主干图形保持连续性。',
    elements: [
      { kind: 'scientific-dataset-stack', label: '语料/指令/偏好数据', purpose: '区分三种监督来源。' },
      { kind: 'scientific-transformer', label: '主干模型', purpose: '显示 checkpoint 的阶段演化。' },
      { kind: 'scientific-loss-target', label: '阶段目标', purpose: '分别表示 next-token、SFT、DPO 或 RM→PPO 目标。' },
      { kind: 'scientific-equation', label: '评测协议', purpose: '用任务、基线、随机种子和置信区间定义可核验评测。' },
    ],
    arrowRules: ['粗实线 = checkpoint 传递；细实线 = 训练数据；向上虚线 = 损失；回弯线 = 评测反馈。'],
    colorRules: ['灰/黄 = 数据；紫 = 模型；橙 = 训练目标；蓝绿 = 评测维度。'],
    steps: [
      '建立五个等高阶段，并让 checkpoint 主路径贯穿中线。',
      '在语料阶段画原始数据栈、过滤器、去重和最终 mixture。',
      '预训练与 SFT 复用一致的 Transformer 图元；从 SFT π_ref 分出 DPO 与 RM→PPO 两条独立替代路径，再汇入 aligned θ*。',
      '每阶段的数据栈放在主干下方，损失目标用虚线上连。',
      'checkpoint 之间用粗箭头，标注 base、instruct、aligned。',
      '末端默认放符号化评测协议，不填任意能力、安全或风险数值；只有绑定可追溯数据、字段、单位、样本量和不确定性后才绘制真实曲线。',
    ],
  }),
  'moe-routing': recipe({
    templateId: 'moe-routing',
    family: 'llm',
    evidence: 'Mixtral、DeepSeek-V2/V3、Switch Transformer 的核心图均用 token → router → 稀疏专家 → 加权合并。',
    aspectRatio: '约 1.8:1，中央扇出/汇入结构',
    readingOrder: '输入 token → 路由分数 → top-k 专家 → 加权求和 → 输出 token；左下放 Transformer 层内位置。',
    zones: ['输入 token', '路由器', '专家阵列', '加权合并', '层内 inset'],
    focalPoint: '专家扇出是视觉中心，必须让被选专家与未选专家同时可见。',
    elements: [
      { kind: 'scientific-token-strip', label: '输入 token', purpose: '显示逐 token 路由。' },
      { kind: 'scientific-mini-plot', label: '路由分数', purpose: '表示 top-k 门控概率。' },
      { kind: 'scientific-layer-stack', label: '专家堆叠', purpose: '形成并行专家阵列。' },
      { kind: 'summing-junction', label: '加权合并', purpose: '明确稀疏输出如何汇总。' },
    ],
    arrowRules: ['彩色实线 = 被选 top-k 路径；灰色点线 = 未激活专家；汇入箭头标注门控权重。'],
    colorRules: ['token 保持中性；路由器用橙色；不同专家用可区分但低饱和颜色；未选专家降透明度。'],
    steps: [
      '把输入 token 带放在左侧，右邻一个小型门控分数图。',
      '中央竖排 4–8 个专家堆叠，只给 2 个被选专家高对比度。',
      '从路由器向专家扇出，在线上标 top-1/top-2 或概率。',
      '专家右侧汇入求和节点，再生成输出 token 带。',
      '左下添加 Transformer block inset，标 MoE 替换 FFN 的位置。',
      '右下可加负载均衡小图，但不要让定量 inset 大于主路由图。',
    ],
  }),
  'rag-tool-agent': recipe({
    templateId: 'rag-tool-agent',
    family: 'llm',
    evidence: 'RAG、Toolformer、ReAct 图将检索、工具调用和 observation 反馈画成主干外的可循环分支。',
    aspectRatio: '约 2:1，中心主干 + 上下工具分支',
    readingOrder: '用户问题 → 规划/路由 → 检索或工具 → 证据 token → LLM → 答案；工具结果回流。',
    zones: ['问题/计划', '知识检索', '工具执行', '证据组装', '生成与引用'],
    focalPoint: '路由节点决定检索、工具或直接回答，是图的决策中心。',
    elements: [
      { kind: 'scientific-token-strip', label: '问题与证据 token', purpose: '显示上下文拼接。' },
      { kind: 'scientific-dataset-stack', label: '知识库', purpose: '表示文档、向量和元数据。' },
      { kind: 'scientific-timeline', label: '工具 observation', purpose: '展示调用序列。' },
      { kind: 'scientific-transformer', label: '生成模型', purpose: '整合证据并输出带引用答案。' },
    ],
    arrowRules: ['主干实线 = 单次回答；分支实线 = 工具调用；回弯虚线 = observation；点线 = 可选旁路。'],
    colorRules: ['蓝 = 用户/问题；黄 = 证据；绿 = 工具与知识；紫 = LLM；红 = 最终答案/引用。'],
    steps: [
      '左侧放问题卡片，连接一个明确的规划/路由菱形。',
      '上分支画查询编码、向量库和 top-k 文档；下分支画 API/计算器/搜索工具。',
      '两路结果在中央合成证据 token 带，并标注上下文长度。',
      '证据带进入 LLM，右侧输出答案和引用列表。',
      '工具 observation 用虚线回到规划节点，形成有限循环。',
      '给直接回答路径使用点线，避免与带证据主路径同权。',
    ],
  }),
  'reasoning-trace': recipe({
    templateId: 'reasoning-trace',
    family: 'llm',
    evidence: 'CoT、ReAct、Toolformer 等图常用并排文本卡、正确/错误高亮和时间步展示推理过程。',
    aspectRatio: '约 1.7:1，上方流程、下方可读 trace',
    readingOrder: '问题 → thought/action/observation 时间轴 → 校验 → 最终答案；下半区展示一个完整样例。',
    zones: ['任务问题', '推理时间轴', '工具/观察', '校验器', '可读样例'],
    focalPoint: '可读 trace 是证据，不应只画成 “Reasoning” 方框。',
    elements: [
      { kind: 'callout', label: '问题/思考文本卡', purpose: '保留真实但简短的示例文本。' },
      { kind: 'scientific-timeline', label: '推理时间轴', purpose: '显示 thought/action/observation 交替。' },
      { kind: 'scientific-loss-target', label: '验证器', purpose: '表达置信度、奖励或一致性选择。' },
      { kind: 'scientific-token-strip', label: '答案 token', purpose: '显示终止与输出。' },
    ],
    arrowRules: ['实线 = trace 顺序；回弯线 = 自我修正；虚线 = 候选被验证器拒绝。'],
    colorRules: ['蓝 = 问题/观察；黄 = thought；绿 = tool/action；红 = 错误/拒绝；深色 = 最终答案。'],
    steps: [
      '顶部横排问题、推理器、验证器和答案，作为抽象主路径。',
      '中部画 4–6 个时间步，每步明确标 Thought、Action 或 Observation。',
      '至少放一个真实短样例，使用文本卡而不是不可读截图。',
      '正确与错误片段同时展示，用颜色加符号做冗余编码。',
      '验证器拒绝的候选用虚线终止，修正路径回到前一时间步。',
      '控制全文字符量，单栏尺寸下每个文本卡最多 3 行。',
    ],
  }),
  'robot-data-collection': recipe({
    templateId: 'robot-data-collection',
    family: 'embodied',
    evidence: 'DROID、BridgeData V2、Open X-Embodiment、Mobile ALOHA 使用相机帧矩阵、机体和数据处理流水线。',
    aspectRatio: '约 2.2:1，采集现场/数据处理/数据集三段',
    readingOrder: '操作者与传感器 → 机器人执行/轨迹 → episode 切分 → 过滤标注 → 数据集 mixture。',
    zones: ['采集硬件', '多视角 episode', '质量过滤', '标准化', '数据集统计'],
    focalPoint: '中部多视角 episode 条带最宽，让读者先理解数据长什么样。',
    elements: [
      { kind: 'scientific-camera', label: '多相机传感器', purpose: '标明外部/腕部/深度视角。' },
      { kind: 'scientific-robot-arm', label: '采集机体', purpose: '说明数据来自何种机器人。' },
      { kind: 'scientific-timeline', label: 'Episode 帧条带', purpose: '展示动作前后和时间顺序。' },
      { kind: 'scientific-dataset-stack', label: '数据集 mixture', purpose: '汇总任务、地点和机体。' },
    ],
    arrowRules: ['实线 = 数据生成；虚线 = 元数据/标注；红色旁路 = 丢弃的失败样本。'],
    colorRules: ['真实帧保持原色；蓝 = 传感器；绿 = 机器人；黄 = 数据；红 = 过滤/异常。'],
    steps: [
      '左侧画操作者、相机和机器人机体，并标出视角位置。',
      '中央放 4–6 帧 episode 时间轴，附动作轨迹和成功/失败标签。',
      '右侧依次画同步、切分、质量过滤和任务标注。',
      '处理后的 episode 汇入数据集堆叠，标注任务数、小时数和机体数。',
      '底部用小型柱图显示任务/场景分布，颜色与数据栈保持一致。',
      '失败样本不要删除叙事，画成红色旁路并说明是否用于负例。',
    ],
  }),
  'world-model-rollout': recipe({
    templateId: 'world-model-rollout',
    family: 'embodied',
    evidence: '3D-VLA、视频预测策略和具身 CoT 图把当前观察、潜在状态、候选未来和动作选择并列。',
    aspectRatio: '约 2:1，上方潜在模型、下方可视 rollout',
    readingOrder: '当前观察 → 空间/潜在编码 → 多个未来 rollout → 评分 → 动作块 → 新观察。',
    zones: ['当前观察', '空间状态', '未来展开', '候选评分', '动作执行'],
    focalPoint: '未来帧时间轴占最大面积，展示模型“预测了什么”。',
    elements: [
      { kind: 'scientific-image-frame', label: '当前/未来帧', purpose: '让状态变化可见。' },
      { kind: 'scientific-voxel-grid', label: '3D/潜在状态', purpose: '表达空间世界表征。' },
      { kind: 'scientific-timeline', label: '预测 rollout', purpose: '按时间展示候选未来。' },
      { kind: 'scientific-trajectory', label: '候选轨迹', purpose: '连接未来预测与控制。' },
    ],
    arrowRules: ['实线 = 编码/预测；平行分叉 = 多候选未来；虚线 = 被拒绝候选；回环 = 执行后观测。'],
    colorRules: ['蓝 = 当前状态；橙 = 预测未来；红 = 动作候选；绿 = 被选轨迹/真实结果。'],
    steps: [
      '左侧放当前相机帧、任务指令和机器人状态。',
      '将它们编码为体素/潜在网格，并标注坐标系。',
      '从潜在状态分叉出 2–3 条未来时间轴，每条 3–5 帧。',
      '在每条 rollout 尾部放评分/约束节点，弱化被拒绝候选。',
      '被选 rollout 生成动作块和连续轨迹，连接机器人执行。',
      '实测新观察沿底部回到当前帧，预测帧与真实帧并排对照。',
    ],
  }),
  'sim-to-real': recipe({
    templateId: 'sim-to-real',
    family: 'embodied',
    evidence: 'HumanPlus、RoboCat 和多种控制论文把仿真大规模训练、域随机化、适配与真实机器人并列。',
    aspectRatio: '约 1.9:1，左仿真/中桥接/右真实',
    readingOrder: '仿真资产与轨迹 → 域随机化/表征学习 → 适配 → 真实机器人 → 评测。',
    zones: ['仿真世界', '大规模训练', '域桥接', '真实部署', '差距评测'],
    focalPoint: '中间域桥接必须可见，不能用一根箭头掩盖 sim-to-real 方法。',
    elements: [
      { kind: 'scientific-voxel-grid', label: '仿真环境', purpose: '表示可随机化的 3D 世界。' },
      { kind: 'scientific-dataset-stack', label: '仿真 rollout', purpose: '强调规模优势。' },
      { kind: 'scientific-trainable', label: '域适配器', purpose: '标出被调优的部分。' },
      { kind: 'scientific-humanoid', label: '真实机器人', purpose: '明确部署机体。' },
      { kind: 'scientific-mini-plot', label: 'Sim/Real 指标', purpose: '量化域差距。' },
    ],
    arrowRules: ['实线 = 模型/策略迁移；虚线 = 随机化参数；双向箭头 = 校准；回流 = 真实数据适配。'],
    colorRules: ['冷色 = 仿真；橙色 = 域随机化；紫色 = 共享策略；绿色 = 真实系统。'],
    steps: [
      '左右各画一个明确分区，分别标 Simulation 和 Real world。',
      '仿真区展示多个场景/机体小图和批量 rollout 数据栈。',
      '中央依次放域随机化、共享表征和小型适配器。',
      '右侧画具体真实机体、传感器和执行轨迹。',
      '底部放 Sim/Real 两组小型曲线或柱图，标出 gap。',
      '若真实数据回流，只画一条长虚线返回适配器，不返回整个仿真区。',
    ],
  }),
  'multi-embodiment-policy': recipe({
    templateId: 'multi-embodiment-policy',
    family: 'embodied',
    evidence: 'π0、Open X-Embodiment、Octo、RT-X 用多机体数据轨道、共享主干和机体专用动作头。',
    aspectRatio: '约 2.3:1，左侧多数据轨、中间共享主干、右侧多机体扇出',
    readingOrder: '多来源 episode → 统一 token/动作空间 → 共享策略 → 专家/适配器 → 不同机器人。',
    zones: ['多机体数据', '统一表示', '共享主干', '动作专家', '机器人阵列'],
    focalPoint: '共享主干置中且只有一个；机体差异集中到数据入口和动作出口。',
    elements: [
      { kind: 'scientific-dataset-stack', label: '多机体数据轨', purpose: '区分 arm/mobile/humanoid 数据。' },
      { kind: 'scientific-token-strip', label: '统一 token 空间', purpose: '表达跨机体对齐。' },
      { kind: 'scientific-transformer', label: '共享策略', purpose: '体现参数共享。' },
      { kind: 'scientific-action-chunk', label: '机体动作头', purpose: '表达不同动作维度和频率。' },
      { kind: 'scientific-robot-arm', label: '机器人阵列', purpose: '让多机体差异一眼可见。' },
    ],
    arrowRules: ['多条细线汇入 = 数据混合；单条粗线 = 共享主干；右侧扇出 = 机体专用头；虚线 = 可选适配器。'],
    colorRules: ['每种机体拥有一个数据/动作强调色；共享主干固定紫色；公共 token 使用中性黄色。'],
    steps: [
      '左侧竖排机械臂、移动机器人和人形三条数据轨，每条含帧与动作。',
      '三条轨道先分别归一化，再汇入统一 observation/action token 带。',
      '中央只画一个共享 Transformer，并标明共享参数比例。',
      '右侧扇出三个小型动作专家，标注维度、频率或控制方式。',
      '每个动作专家连接对应机器人图元和一段代表轨迹。',
      '底部加数据占比图例，防止颜色被误读为性能高低。',
    ],
  }),
};

export function getScientificFigureRecipe(templateId: ScientificSchematicTemplateId): ScientificFigureRecipe {
  return SCIENTIFIC_FIGURE_RECIPES[templateId];
}
