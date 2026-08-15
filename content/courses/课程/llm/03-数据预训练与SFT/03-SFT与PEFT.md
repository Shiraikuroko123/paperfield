# M3.3 SFT、PEFT 与训练数据

<div class="lesson-meta" data-lesson-id="m3-3">
  <span>M3 · 数据、预训练与 SFT</span>
  <strong>先把模板、标签和评测做对，再讨论高效微调</strong>
  <button type="button" class="lesson-complete">标记为已完成</button>
</div>

## 1. SFT 真正在学习什么

Supervised fine-tuning 继续使用 token NLL，但数据变成指令、上下文和期望回答。常见 loss 只监督 assistant 内容：

$$
\mathcal{L}_{SFT}=-\frac{\sum_t m_t\log p_\theta(y_t\mid x_{<t})}{\sum_t m_t}.
$$

这里最重要的不是公式，而是 $x$ 如何由 chat template 构造，以及 $m_t$ 哪些位置为 1。

## 2. 一条样本必须可视化检查

训练前对至少 100 条样本保存：

- 原始结构化 messages；
- 模板渲染后的完整文本；
- token 与特殊 token；
- labels 和被 mask 的位置；
- 截断前后长度；
- assistant 有效 token 数；
- 数据来源和版本。

如果人无法读懂模型实际看到的序列，就不应启动大规模训练。

## 3. Full fine-tuning、LoRA 与 QLoRA

LoRA 把权重更新限制为低秩矩阵：

$$
W'=W+\Delta W,\quad \Delta W=BA,
$$

其中 $A\in\mathbb{R}^{r\times d_{in}}$、$B\in\mathbb{R}^{d_{out}\times r}$，$r$ 远小于原维度。基座权重冻结，只训练 adapter。

QLoRA 进一步以低比特存储冻结基座，并在较高精度计算 LoRA 更新。它降低显存，不保证与 full fine-tuning 等价；rank、目标模块、量化误差和数据规模都会影响结果。

## 4. 选择路线

| 约束 | 首选起点 | 必须验证 |
|---|---|---|
| 需要最高控制、资源充足 | Full fine-tuning | 灾难性遗忘、稳定性、完整 checkpoint |
| 单卡/小集快速适配 | LoRA | rank、target modules、合并前后输出 |
| 显存非常受限 | QLoRA | 量化基座、compute dtype、吞吐与质量回归 |
| 只需检索新事实 | 先评估 RAG | 检索召回、引用正确性、延迟与失效 |

不要用 SFT 记忆频繁变化的私有事实，也不要在没有 baseline 时默认微调优于提示或检索。

## 5. 评测设计

至少包含：

- **格式遵循**：结构化输出、拒答边界、工具 schema；
- **任务质量**：与业务目标一致的自动或人工指标；
- **保留能力**：通用基准或原任务回归集；
- **安全与隐私**：敏感数据记忆、越权和提示注入；
- **效率**：训练显存/时长、推理延迟、adapter 加载成本。

## 最小实验

```powershell
python labs\05_sft_masks.py
```

实验会构造 prompt、assistant 与 padding，比较三种 mask。你需要指出把 prompt/padding 计入 loss 后，分母和梯度权重如何改变。

## 本章验收

- [ ] 可视化一条真实 SFT 样本的 text、tokens、labels 和 mask。
- [ ] 解释 LoRA 降低了哪些训练状态，哪些激活仍然存在。
- [ ] 为 full/LoRA/QLoRA 写出同数据、同 token 预算的公平对照。
- [ ] 证明评测包含保留能力，而不只看训练领域。
