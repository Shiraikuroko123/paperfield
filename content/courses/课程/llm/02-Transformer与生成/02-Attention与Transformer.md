# M2.2 Attention 与 Transformer

<div class="lesson-meta" data-lesson-id="m2-2">
  <span>M2 · Transformer 与生成</span>
  <strong>从一次矩阵乘法读懂一层 decoder</strong>
  <button type="button" class="lesson-complete">标记为已完成</button>
</div>

## 1. Self-attention 的最小推导

输入 $X\in\mathbb{R}^{T\times D}$ 经过三组线性映射：

$$
Q=XW_Q,\quad K=XW_K,\quad V=XW_V.
$$

单头 scaled dot-product attention 为：

$$
\mathrm{Attention}(Q,K,V)=\mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_h}}+M\right)V.
$$

- $QK^\top$ 形状为 $[T,T]$，每一行表示一个 query 对所有 key 的分数；
- 除以 $\sqrt{d_h}$ 控制点积方差，避免 softmax 过早饱和；
- $M$ 是 mask，被禁止的位置加一个足够大的负数；
- softmax 沿 key 轴归一化，再对 $V$ 做加权和。

## 2. 三种 mask 不要混

| Mask | 作用位置 | 目的 |
|---|---|---|
| causal mask | attention score | 禁止当前位置看到未来 token |
| padding mask | attention score | 禁止真实 token 读取 padding |
| label/loss mask | loss | prompt、padding 或无监督位置不计入训练目标 |

Attention mask 正确不代表 loss mask 正确。SFT 中最常见的静默错误之一，是把用户 prompt 也当作答案监督，或把 padding token 计入平均 loss。

## 3. Multi-head 与 GQA

多头 attention 把隐藏维分成 $h$ 个 head：

$$
d_h=D/h.
$$

每个 head 学习不同的投影，拼接后再经输出映射。Multi-Query Attention 让所有 query head 共享一组 K/V；Grouped-Query Attention 让若干 query head 共享一组 K/V，从而减少 decode 时 KV cache 和内存带宽。

## 4. 一层 decoder block

现代 decoder-only LLM 常采用 pre-norm 结构：

```text
x
├─ norm → causal self-attention → residual add
└─ norm → gated MLP             → residual add
```

典型组件：

- RMSNorm 或 LayerNorm；
- attention + RoPE；
- SwiGLU/GeGLU 类 gated MLP；
- residual connection；
- dropout（大规模预训练中可能很低或为零，视 recipe 而定）。

不要把“Transformer”理解成唯一固定实现。norm 位置、激活、位置编码、GQA、bias 和并行实现都会变化。

## 5. 计算量在哪里

Attention score 的理论复杂度随序列长度近似为 $O(T^2D)$，MLP 近似为 $O(TD^2)$。当 $T\ll D$ 时，MLP/线性层仍可能占主要 FLOPs；长上下文会放大 attention 的计算与内存问题。性能判断必须用具体 $T,D$、batch 和 kernel profile，而不是只背“大 O”。

## 最小实验

```powershell
python labs\03_tiny_attention.py
```

实验包含一个 3-token、2 维单头 attention。你需要：

1. 手算 score、mask、softmax 和输出；
2. 移除 $1/\sqrt{d_h}$，比较分布尖锐程度；
3. 去掉 causal mask，观察第一个位置是否读取未来；
4. 把 softmax 轴改错，说明为什么每行不再和为 1。

## 本章验收

- [ ] 写出 Q/K/V 和 score 的形状。
- [ ] 说明 softmax 应沿哪个轴归一化。
- [ ] 区分 causal、padding 和 label mask。
- [ ] 解释 GQA 为什么主要帮助 decode。
