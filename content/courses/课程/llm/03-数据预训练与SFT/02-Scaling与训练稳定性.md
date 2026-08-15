# M3.2 Scaling、训练稳定性与检查点

<div class="lesson-meta" data-lesson-id="m3-2">
  <span>M3 · 数据、预训练与 SFT</span>
  <strong>规模规律是预算工具，不是跳过实验的定律</strong>
  <button type="button" class="lesson-complete">标记为已完成</button>
</div>

## 1. 先把训练预算写成可检查的量

常见近似会把 dense Transformer 训练 FLOPs 写成参数量 $N$ 与训练 token 数 $D$ 的乘积：

$$
C\approx kND,
$$

$k$ 取决于架构、前后向、激活重计算和统计口径。它适合做数量级预算，不适合代替 profiler。

Scaling law 用经验幂律描述 loss 随模型、数据或计算变化。结论只在论文实验的模型族、数据分布和预算区间内成立；MoE、长上下文、数据质量变化和后训练会改变外推。

## 2. 有效 batch 和 token 账本

$$
\text{tokens/update}=
\text{micro batch}\times\text{sequence length}\times
\text{grad accumulation}\times\text{data-parallel world size}.
$$

如果 packing、动态长度或 loss mask 存在，应使用**有效训练 token**，而不是张量中的所有位置。恢复训练后必须确认 sampler、global step 和 scheduler 没有错位。

## 3. 常见 loss spike 排查顺序

1. **数据**：坏 shard、异常长度、空样本、tokenizer/template 版本；
2. **数值**：FP16 overflow、BF16/FP32 reduction、除零、`log(0)`；
3. **优化**：学习率跳变、warmup、梯度范数、weight decay 分组；
4. **分布式**：某 rank 数据/梯度异常、loss reduction 多除或少除 world size；
5. **恢复**：优化器、scheduler、RNG 或数据位置未恢复；
6. **实现**：mask、label shift、梯度累积和 clip 顺序错误。

先保存触发 spike 的 batch 与 checkpoint，再尝试修复。没有可复现输入的“偶发故障”很难定位。

## 4. 混合精度边界

- BF16 指数范围接近 FP32，通常比 FP16 更不易 overflow，但尾数精度较低；
- FP16 常配动态 loss scaling；
- softmax、norm、loss reduction 等敏感操作可能在更高精度累积；
- FP8/INT8 的收益依赖硬件、kernel、scale 策略和误差回归，不能只比较 dtype 名称。

## 5. Checkpoint 与重启演练

可信训练必须做“故意中断”测试：

1. 固定数据、seed 和配置训练 $K$ 步；
2. 在 $K/2$ 保存并退出；
3. 恢复到 $K$ 步；
4. 比较 loss、参数 hash/差异、学习率和数据样本序列；
5. 如果无法逐 bit 一致，解释允许的非确定性来源和误差界。

## 6. 预算报告

至少报告：模型有效参数、训练 token、上下文长度、全局 batch、优化器、峰值学习率、warmup、精度、硬件、训练时长、失败/重启次数和有效 tokens/s。只写 GPU 数量无法复现实验。

## 本章验收

- [ ] 计算一个配置的 tokens/update 和总 token。
- [ ] 为 loss spike 写出按证据优先级排序的排查树。
- [ ] 完成一次 checkpoint 中断/恢复对照。
- [ ] 解释 scaling law 为什么不能替代目标规模实验。
