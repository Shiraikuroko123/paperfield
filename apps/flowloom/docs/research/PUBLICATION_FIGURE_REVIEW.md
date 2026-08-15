# Flowloom 论文级 Figure 独立终审

评审日期：2026-07-29
评审对象：Flowloom 当前源代码与 `output/publication-evidence/manifest.json` 锁定的三张旗舰 Figure  ；评审角色：独立 Figure 审稿人，仅评价图形和交付证据，不参与实现。

## 结论

独立复评没有把源码中的静态 scorecard 当作结论，而是重新检查了九张无 UI 浏览器成品、18 份 SVG、18 份 PDF、PDF 回渲、关键 SVG 拓扑和自动证据。三张图均达到 `>=95/100`，十个维度均达到 `>=9/10`，Critical/Major 均为零。

| Figure | 最弱版式 | 综合分 | 最低维度 | 独立结论 |
| --- | --- | ---: | ---: | --- |
| VLA Policy | 16:9（输入汇流最密集） | **95.2** | **9.2** | PASS |
| World-Model Rollout | 单栏（最紧凑） | **95.1** | **9.2** | PASS |
| LLM Training Pipeline | 单栏（对齐分支密度最高） | **95.0** | **9.2** | PASS |

这里的 PASS 只适用于本报告锁定的三张方法示意图、三种版式、两种风格和默认英文详细内容。它表示经过审计的图已经达到无需二次视觉设计即可进入顶会/顶刊论文或正式学术汇报的出版准备度，不表示任意未来 AI 生成图、科学结论、版权许可或 venue 录用自动通过。

## 证据门

最近一次 `npm.cmd run evidence:publication` 生成的 manifest 记录：

| 门槛 | 结果 | 判定 |
| --- | ---: | --- |
| 三张旗舰图总分至少 95 | **95.0 / 95.1 / 95.2** | 通过 |
| 每个维度至少 9 | **最低 9.2** | 通过 |
| Critical / Major | **0 / 0** | 通过 |
| 核心 SVG/PDF/PNG | **54** | 通过 |
| 灰度、protanopia、deuteranopia、tritanopia | **36** | 通过 |
| Poppler PDF 回渲 | **18** | 通过 |
| PNG/PDF 视觉等价 | **18/18** | 通过 |
| 浏览器预览几何检查 | **273/273** | 通过 |
| 自动审计错误 / 警告 | **0 / 0** | 通过 |
| PDF 字体失败 / 栅格失败 | **0 / 0** | 通过 |

源文件和证据文件均由 manifest 的 SHA-256 锁定；发布前在目标 commit 上重新运行 evidence 命令即可复现同一矩阵。当前证据包含 12 个源码指纹、112 个证据文件哈希和 9 张最终浏览器截图哈希。

## 百篇论文基准

设计语料包含 50 篇 LLM/VLM 和 50 篇具身智能/VLA 论文。每篇均有本地可解码的非表格代表图，合计解析 1,289 个 Figure。语料用于提取视觉语法，不复制论文原图、品牌资产或受限素材，也不构成对论文科学结论的系统综述。

| 方向 | 论文 | 解析 Figure | 非表格代表图 | 本地可解码代表图 |
| --- | ---: | ---: | ---: | ---: |
| LLM/VLM | 50 | 656 | 50/50 | 50/50 |
| Embodied/VLA | 50 | 633 | 50/50 | 50/50 |
| **合计** | **100** | **1,289** | **100/100** | **100/100** |

高频语法已经落到原生图元：模块与 checkpoint、token/image strip、机器人本体和相机视角、action trajectory、共享时域、rollout 分支、score junction、风险门、误差反馈、数据/控制/时序/可选连接线型。真实数据图仍需由用户绑定数据、单位、误差和 provenance；模板中的小图明确视为 schematic glyph。

## 十维独立评分

| 维度 | VLA | World Model | LLM |
| --- | ---: | ---: | ---: |
| Composition | 9.5 | 9.5 | 9.4 |
| Visual hierarchy | 9.5 | 9.5 | 9.5 |
| Semantic specificity | 9.6 | 9.6 | 9.6 |
| Typography | 9.5 | 9.5 | 9.5 |
| Annotation grammar | 9.4 | 9.4 | 9.4 |
| Connector grammar | 9.6 | 9.6 | 9.6 |
| Scientific storytelling | 9.7 | 9.6 | 9.6 |
| Slide readability | 9.4 | 9.4 | 9.4 |
| Export and accessibility | **9.2** | **9.2** | **9.2** |
| Native editability | 9.8 | 9.8 | 9.8 |
| **总分 / 100** | **95.2** | **95.1** | **95.0** |

### 为什么达到 95 分以上

评分不是只看颜色或装饰，而是同时满足四个可核验条件：

1. **机制可读。** VLA 从任务观测到策略、接触动作和再观测；World Model 从当前证据到潜在状态、反事实未来、约束选择和预测误差；LLM 从版本化数据到预训练、SFT、DPO/RL、发布门和漂移反馈。每张图单独阅读时，主问题、机制和验证闭环都成立。
2. **连接可追踪。** 关键分支采用独立端口、junction/merge、路由 waypoint 和冗余线型；自动审计未发现穿节点、无汇流或闭环方向不明的问题。真实浏览器与导出 SVG 的标题断行一致，最小 phase 内边距为 8.646 px，最小相邻标题间距为 27.519 px。
3. **出版矩阵完整。** 每张图均独立重排为 89 x 70 mm 单栏、180 x 120 mm 双栏和 180 x 101.25 mm 16:9；每种版式同时提供 conference/monochrome、SVG、矢量 PDF 和 300 DPI PNG，并经过 Poppler 回渲、灰度和三类 CVD 模拟。
4. **仍可编辑复用。** SVG 保留 Flowloom metadata、节点/边 ID、角色、路由和 provenance；导入/导出回归能够恢复原生语义，而不是只留下不可解释的截图。

## 三张旗舰图

### VLA Policy

双栏版将任务证据、视觉/语言/本体状态、VLM、flow action expert、风险与 6-DoF action chunk、机器人执行和 next observation 组织成闭环；16:9 版将阅读轴压缩为 Task state -> Multimodal action policy -> Grounded closed loop。最弱版式的 controller 四边内边距仍为 11.731 px。

### World-Model Rollout

图中明确区分 observed evidence、3D latent state、latent world model、共享时域和 A/B/C 三条未来；每条未来有成功、碰撞或遮挡语义，并通过 score junction 进入约束选择、执行和 prediction-error 回路。单栏版最紧凑，但仍无标题粘连或边界越界。

### LLM Training Pipeline

图中把 SFT 参考路径、偏好数据、DPO 路线和 RM + PPO 路线分成真正的替代分支，再通过 merge 进入 aligned model、能力/安全评测、最差切片、release gate 和 drift monitor。单栏版对齐分支最密集，仍保留可辨识的 DPO/RL checkpoint 和独立输入路径。

## 导出与可访问性说明

18/18 PDF 为单页、物理尺寸正确、字体嵌入并可提取文本；PNG 与 Poppler PDF 的结构等价指标均超过门槛，最差 structural SSIM 为 0.992192，content structural SSIM 为 0.990959，edge precision/recall 分别为 0.969632/0.966682，最大 missing-ink rate 为 0.041544，最大 MAE 为 0.024535。

Export/Accessibility 评分保守记为 9.2，而不是 9.8：当前 PDF 的 `Tagged: no`，SVG 虽有 `<title>`、`aria-label` 和可编辑 metadata，但尚未提供 `<desc>`/WCAG Tagged PDF。因此这里是出版导出审计，不是无障碍认证。

## 非阻断限制

1. `risk rank`、`success score`、`worst-slice`、`drift monitor` 等小图是明确的 schematic glyph，不是真实实验结果。用于论文结果时必须绑定数据、单位、统计定义、误差和 provenance。
2. 单栏中的 `F/W`、`S(A)`、`C(B)`、`U(C)`、`theta(ref)` 等紧凑符号需要在 caption 或图注中定义；后续可统一为更完整的可编辑数学排版。
3. CVD 文件是设计审查模拟，不是临床色觉模型；本报告通过的是三张旗舰图的 18 个组合，不是任意未来模板的永久认证。

## 回归与复现

- `npm.cmd test`：**8 个测试文件 / 80 个测试全部通过**。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：生产构建通过。
- `npm.cmd run evidence:publication`：通过，manifest 的旗舰失败数、审计错误、栅格失败、字体失败和预览失败均为 0。
- 推荐复现命令：`npm.cmd test; npm.cmd run lint; npm.cmd run build; npm.cmd run evidence:publication`。

最终结论：在本报告锁定的范围内，三张旗舰图分别达到 **95.2 / 95.1 / 95.0**，并通过独立审稿与自动证据门。任何新图仍需要场景语义核对、版式审计、SVG round-trip、300 DPI PNG、Poppler PDF、灰度/CVD 和原尺寸人工复核。
