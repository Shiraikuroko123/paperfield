# LLM 系统课程

从数学、Transformer 与训练基础出发，沿着 35 个可验证项目进入对齐算法、分布式训练、推理系统与研究复现。

<div class="course-actions">
  <a class="md-button md-button--primary" href="00-导学与诊断/01-课程路线与学习方法/">查看课程路线</a>
  <a class="md-button" href="00-导学与诊断/02-先修诊断与个性化路径/">开始先修诊断</a>
</div>

<div class="course-map-scroll">
  <picture>
    <source media="(max-width: 719px)" srcset="assets/images/course-map-mobile.svg">
    <img class="course-map-visual" src="assets/images/course-map.svg" alt="LLM 系统课程从 M0 导学诊断，经数学、Transformer、预训练、对齐算法与训练系统，到 M7 研究项目的路径图">
  </picture>
</div>

## 这套课程如何定义“从新手到专家”

专家不是知道更多缩写，而是能在四种表述之间往返：

1. **直觉**：能用可检验的语言解释现象，而不是复述结论。
2. **数学**：能从概率目标推到 loss，知道每个近似改变了什么。
3. **工程**：能把公式落到张量、日志、显存、吞吐和故障模式。
4. **研究**：能设计公平 baseline、消融、统计评测和失败分析。

因此每一章都按“预测 → 推导 → 实现 → 失效 → 验收”闭环。读完不是完成；产出可以复查的证据才是完成。

## 统一学习路线

| 模块 | 核心问题 | 必须产出 |
|---|---|---|
| M0 导学与诊断 | 我从哪里开始，什么可以快进？ | 先修诊断、学习日志、个人缺口清单 |
| M1 数学与 PyTorch | loss、梯度和训练循环怎样落到张量？ | 3 个 CPU 实验和一次手算检查 |
| M2 Transformer 与生成 | token 如何经过注意力变成下一个 token？ | 最小 attention、采样与 KV cache 账本 |
| M3 数据、预训练与 SFT | 模型能力如何被数据和训练目标塑造？ | 数据审计、SFT 样本检查与训练故障报告 |
| M4 对齐与 RL 基础 | reward、advantage、KL、PPO、GRPO 如何连接？ | Project 1-12 |
| M5 方法与前沿 | 新方法究竟改了目标、估计器还是数据流？ | Project 13-19 与论文证据表 |
| M6 训练与推理系统 | 显存、通信、并行、队列和 staleness 如何共同限制训练？ | Project 20-35 与系统账本 |
| M7 评测、研究与项目 | 如何把复现变成可信研究与作品？ | 基线、消融、报告、演示和可复现仓库 |

## 针对工程型学习者的快速通道

如果你已经做过 C/C++、计算机视觉、模型部署、桌面软件或软硬件联调，可以通过 M0 诊断快速复习线性代数和基础 Python，但不要直接跳到 Project 20：

- **必须完整完成** M1.2、M2 和 M3，补齐 PyTorch 训练、Transformer、生成与语言模型数据范式。
- 把相机线程、帧队列和 ONNX 推理经验迁移到 token 流、continuous batching、KV cache 与异步 rollout。
- 把设备异常、耗时记录和系统联调经验升级为固定测试集、P50/P95 时延、消融和可复现评测。

这条快速通道只根据能力类型设计，不公开任何个人材料。

## 本地实验

推荐 Python 3.10 或 3.11。基础实验均可在 CPU 上运行：

```powershell
cd 课程\llm
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python labs\00_environment_check.py
python labs\run_all.py
```

大型模型微调、分布式训练和 serving 框架在对应项目中单独安装，避免第一天就被 GPU 环境卡住。

## 学习进度

<div class="course-progress" data-course-progress-total="54">
  <div>
    <strong data-course-progress>0 / 54</strong>
    <span>已完成单元仅保存在当前浏览器</span>
  </div>
  <progress value="0" max="54" aria-label="课程完成进度"></progress>
</div>

进度只是导航辅助，不代替实验记录。正式证据写入[学习日志](附录/学习日志模板.md)和项目仓库。

## 内容边界

- 35 题来自公开问题线索，本仓库提供独立的项目式讲解；原题版权归原作者。
- 前沿模型和框架快速变化，带日期的事实必须回到官方论文、代码或文档核查。
- 课程不发布个人简历、成绩、联系方式或实习原始材料。
- 课程目标是建立专家能力结构；实际水平由复现、评测、代码审查和长期研究产出验证。
