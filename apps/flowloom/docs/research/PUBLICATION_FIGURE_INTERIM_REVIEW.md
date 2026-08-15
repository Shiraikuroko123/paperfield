# Flowloom 论文级示意图独立中期复审

复审日期：2026-07-28  
复审角色：独立图形审稿人，仅评审，不参与本轮业务代码实现  
复审性质：**中期评审，不是最终验收，也不构成任何会议或期刊录用保证**

## 结论

**暂定得分：68.2 / 100。结论：不通过，仍需 major revision。**

当前版本已经越过了“普通流程图模板”的水平。三张旗舰图建立了稳定的 A-D 阅读轴、物理版芯、可辨识的领域图元和原生节点/边数据；世界模型 PDF 在 180 x 120 mm、300 DPI 下不再出现基线中的整体裁切，字体也能够嵌入并正确提取上下标。

但它仍未达到“无需二次设计即可直接放入顶会、顶刊论文或正式学术汇报”的门槛。失败原因已经从基线的全局尺寸错误，转为更严格也更接近审稿现场的问题：连接关系存在歧义，若干数字和微型曲线没有数据依据，四等分卡片式构图缺少方法贡献焦点，标注语法不足，以及验收证据不完整。

沿用最终门槛：

- 总分至少 `95 / 100`；
- 十个单项均不低于 `9 / 10`；
- `critical = 0`；
- 三张旗舰图分别通过双栏、单栏、16:9、灰度和常见色觉缺陷检查；
- 通过只代表出版准备度，不代表 venue acceptance。

## 本轮证据

视觉证据：

- `output/playwright/vla-double-preview.png`，824 x 962 px，含预览 UI；
- `output/playwright/llm-double-preview.png`，824 x 962 px，含预览 UI；
- `output/publication/world-model-double-tspan.pdf`；
- 从上述 PDF 重新以 Poppler 渲染的 `tmp/pdfs/interim-world-model-300-1.png`，2126 x 1418 px，300 DPI；
- `tmp/pdfs/world-model-double-tspan.png`。

实现证据：

- `src/lib/scientificSchematics.ts`；
- `src/lib/scientificExport.tsx`；
- `src/lib/scientificVisualVariants.ts`；
- 辅助核查了节点文字布局、科学连线和 SVG 回读代码。

可复核结果：

- PDF 为单页 `510.236 x 340.157 pt`，即约 `180 x 120 mm`；
- PDF 使用嵌入的 CID TrueType 字体，`pdftotext` 能提取 `p(z_t+1 | z_t, a_t)` 等文本；
- 现有世界模型 SVG 是有效 XML，含 17 个节点组、13 个边组和 `data-flowloom-editable="true"`；
- SVG 最小文字为 22 scientific units，约 `6.24 pt`，模块正文 28 units，约 `7.94 pt`；
- 相关 3 个测试文件共 39 个测试通过；
- 当前 corpus 已达到 LLM/VLM 50 篇和具身/VLA 50 篇，100/100 均有非表格代表图、可渲染图像和本地分析副本。基线语料完整性 critical 已关闭。

注意：三份源码的修改时间晚于本轮视觉产物约 10-13 分钟。源码中尚未重新导出的变化只视为“实现意图”，不作为视觉通过证据。

## 十项暂定评分

| 维度 | 得分 | 严格判定 |
| --- | ---: | --- |
| 1. Composition | **6.8** | 四阶段阅读轴清楚，但三张图都依赖近乎相同的四等分竖栏，贡献模块没有形成主视觉，仍像经过美化的系统清单。 |
| 2. Hierarchy | **7.0** | 已有全图、阶段、模块、说明四级；但 34/30/28/24-22 units 的梯度过密，标题和阶段标题的权重差不足，浅色虚线框过多。 |
| 3. Semantic density | **7.5** | VLA、world model、LLM alignment 的关键链路已基本齐全；仍缺 tensor/action 维度、训练状态、选择准则定义、失败分支和可核验结果。 |
| 4. Typography | **7.6** | 最低字号和字体嵌入已过基本线，无全局裁切；但标题安全区过紧，公式只支持字符级上下标替换，尚无完整数学排版语法。 |
| 5. Annotation / Callout grammar | **5.5** | 主要依靠框内副标题和一个 legend；缺少 leader line、bracket、局部放大、编号对应、公式锚点、结论 callout 和不确定性定义。 |
| 6. Connector / Line grammar | **5.9** | 代码已有 7 类语义和冗余线型编码；实际输出仍有共线重叠、目标框内穿线、无汇合点的多路合并和反馈线抢占边界。 |
| 7. Scientific credibility | **6.3** | 来源元数据和领域结构明显进步；但示例概率、风险值、能力曲线和预测误差图没有数据、单位或“仅示意”声明，无法直接作为论文证据。 |
| 8. Slide readability | **6.6** | 源码提供 presentation 字号下限；未提交无 UI 的 16:9 成品，且相同四栏结构在投影环境中仍依赖细线和小型内部图形。 |
| 9. Print / Accessibility | **7.4** | 世界模型双栏 PDF 与 300 DPI 渲染清晰，物理尺寸、字号和嵌入字体合格；缺灰度、CVD、单栏及跨 PDF 查看器证据。 |
| 10. Native editability / Reuse | **7.6** | 画布上的模块、边、角色和 variant 可独立编辑，SVG 保留分组和元数据；但复合场景内部不可拆，导出 SVG 回读会退化为底层 path/rect/text，不能恢复科学语义。 |
| **总分** | **68.2** | **未达到 95；10/10 单项低于 9；存在 critical。** |

## Critical findings

### C-01：验收证据与最新源码不同步，且三张旗舰图的交付矩阵不完整

VLA 和 LLM 只有带网页 UI 的 96 DPI 预览，没有对应的纯 SVG、PDF、300 DPI PNG；世界模型只有双栏 PDF。三者均未提交单栏、16:9、灰度、常见色觉缺陷、原生编辑状态和自动预检清单。最新源码又晚于所有视觉产物，因此无法证明当前代码实际生成的结果就是被审查的结果。

这是验收 critical，不等同于断言源码一定失败。证据补齐前不得给出最终通过结论。

### C-02：多条科学连接在视觉上不可唯一追踪

世界模型图中 B、C 候选到 Risk rank 的两条可选路径在 C/D 边界共用同一竖向通道，长距离完全重叠，却没有 merge node、junction dot 或括号说明。读者无法判断该竖线表示两条独立输入、一个汇总总线，还是一条被覆盖的连接。

LLM 图中 SFT 到 DPO / RM+PPO 使用同侧端口和通用正交中点，竖向段进入目标框内部后才到达端点，线条与目标图形、标签发生视觉竞争。自动审计会排除源/目标节点，因此当前 `edge-through-node` 规则检测不到这种“进入目标内部过深”的错误。

当边的归属需要读者猜测时，方法图的科学含义已经不可靠，不能直接投稿。

### C-03：微型结果图和数字具有“真实结果”的外观，但没有数据契约

`p = .86`、`risk = .79`、`u = .44`、capability/safety 曲线、prediction error 曲线均没有来源数据、单位、统计定义或 illustrative 标记。`p`、`risk`、`u` 也不是同量纲量，却在 `p up / r down / u down` 中被并列用于 Risk rank。

论文成品不能把装饰性曲线或任意数字包装成实验结果。默认模板必须使用符号变量并明确“schematic”，或绑定真实数据后才允许移除该标记并进入 publication export。

## P0 findings

1. **重建标题安全区。** 外框和阶段框的顶边紧贴标题 cap height，世界模型 PDF 中标题与虚线视觉相擦；根标题、阶段标题和 panel header 必须占用独立的无描边区域。
2. **重做显式汇流和分支。** world model 的三候选先进入带端口的 score table 或 merge node，再到 decision；LLM 的 DPO 与 RM+PPO 使用独立泳道和底部/顶部端口，禁止同侧折线进入目标内容区。
3. **删除无来源的数值外观。** 默认使用 `p_success`、`R_contact`、`U_pred` 等符号，并显示定义；真实数值只能来自可追溯数据字段。微型曲线必须有坐标、单位、误差定义和数据源，否则改为明确标注的 schematic glyph。
4. **让三张图表达可核验的方法机制。** VLA 需显示目标物、相机视角、action dimensions 和 next observation；world model 需显示统一坐标系与 t:t+H 帧；LLM 需把 DPO 与 reward model + PPO 分成正确的替代路径，而不是两个相同的“preference objective”图标。
5. **降低容器噪声。** 去掉全图和四阶段同时使用的大段虚线边框，保留一层必要 panel 结构；用留白、共享基线和局部底色建立层次。
6. **提交完整验收矩阵。** 每张图都生成 180 x 120 mm、89 x 70 mm、180 x 101.25 mm 三种结构变体，并提交 SVG、PDF、300 DPI PNG、灰度、CVD 和无 UI 截图。

## P1 findings

1. 增加出版级 annotation primitives：leader、bracket、zoom inset、equation anchor、tensor/action dimension、uncertainty、result badge 和编号映射。
2. presentation variant 必须重构信息密度和讲述顺序，而不只是放大字体；支持逐步呈现所需的语义分组。
3. `parseEditableSvg` 应识别 Flowloom 的 metadata、node id、edge id、role 和 variant，优先恢复原生节点和连接；解析失败时才退化为 SVG 原语。
4. 自动审计应增加共线边重叠、边进入源/目标内部距离、边标签与边/节点碰撞、标题与容器描边碰撞、无 junction 的多路汇流检查。
5. 场景图元应拆成可独立编辑的 camera、robot joints、end effector、object、goal region、trajectory、contact point 和 observation frame，而不是一个不可拆的 scene pictogram。
6. 建立“示意数据”和“实证数据”两种显式状态；实证状态要求字段、单位、样本量、不确定性和来源全部存在，否则阻断 publication export。

## 最小可执行修复清单

按以下顺序完成即可进入下一轮复审：

1. 在 group/frame 图元中增加固定 header safe zone，导出测试断言文字包围盒不与任何容器 path 相交。
2. 为 `routeScientificEdge` 增加显式 junction/bus；检测 collinear overlap，并限制同侧端口路径在目标框内的最大进入距离。
3. 重排三张旗舰图的上述问题边，生成干净 SVG 后以脚本统计零共线重叠、零穿字、零目标内长段。
4. 把所有数字和 mini plot 改成数据绑定或 schematic 状态；在 publication export 中阻断“无数据但表现为结果”的节点。
5. 完成三种尺寸和三种可访问性输出，使用 Poppler 重新渲染全部 PDF，不接受只看浏览器预览。
6. 加入 Flowloom SVG 语义回读测试：导出后再导入，节点数、边数、角色、variant、标签和关键坐标必须保持一致。

## 相对基线的关闭情况

| 基线 critical | 当前状态 |
| --- | --- |
| 100 篇代表图不完整 | **已关闭。** 100/100 均有有效非表格代表图和本地副本。 |
| 14/14 模板超出双栏版芯 | **三张旗舰图已关闭，其他 11 张未纳入本轮视觉复审。** |
| 缩放后最小字仅 3.74-5.03 pt | **三张旗舰图已关闭。** 双栏输出最低约 6.24 pt，模块正文约 7.94 pt。 |
| 300 DPI 输出整体重叠和裁切 | **世界模型的全局裁切已关闭；局部边路由和标题安全区仍未关闭。** |

## 下一轮通过条件

下一轮只复审三张旗舰图，不按模板数量加分。每张必须在双栏、单栏、16:9、灰度和 CVD 条件下同时达到：零裁切、零文字/描边碰撞、零歧义边、零无来源结果图、正文不低于 7 pt、次要注释不低于 6 pt、关键线不低于 0.8 pt、文本对比不低于 4.5:1、关键非文本对比不低于 3:1，并证明 SVG 语义往返可恢复。

只有三张图均达到 `>=95/100`、每项 `>=9/10` 且 `critical=0`，才可给出“达到严格出版准备度”的最终结论。
