# M2.3 解码、KV Cache 与推理

<div class="lesson-meta" data-lesson-id="m2-3">
  <span>M2 · Transformer 与生成</span>
  <strong>把“生成一句话”拆成 prefill 和逐 token decode</strong>
  <button type="button" class="lesson-complete">标记为已完成</button>
</div>

## 1. 自回归生成循环

```python
for _ in range(max_new_tokens):
    logits, cache = model(last_input, past_key_values=cache)
    next_token = sample(logits[:, -1], config)
    output = torch.cat([output, next_token], dim=-1)
    if next_token.item() == eos_id:
        break
    last_input = next_token
```

第一次把整个 prompt 输入模型称为 **prefill**；之后每次只输入新 token 并读取缓存称为 **decode**。Prefill 更像大矩阵计算，decode 往往受 KV cache 读取和内存带宽限制。

## 2. 从 logits 到采样分布

Temperature $\tau$ 调整 logit 尺度：

$$
p_i=\mathrm{softmax}(z_i/\tau).
$$

- $\tau\to 0$ 时更接近 argmax；
- $\tau$ 增大时分布更平；
- temperature 不会修复错误事实，只改变抽样随机性。

Top-k 只保留概率最大的 $k$ 个 token；top-p 保留累计概率达到 $p$ 的最小集合。通常先过滤再重新归一化。采样配置必须与 seed、tokenizer、prompt 模板一起保存。

## 3. KV cache 为什么有效

没有缓存时，生成第 $t$ 个新 token 会重复计算前面所有 token 的 K/V。缓存让每层只计算新 token 的 K/V，并把它追加到历史。

近似显存账本：

$$
\text{KV bytes}=2\times L\times B\times T\times H_{kv}\times d_h\times s,
$$

其中 2 表示 K 和 V，$L$ 是层数，$B$ 是并发序列数，$T$ 是已缓存长度，$H_{kv}$ 是 KV head 数，$d_h$ 是 head 维，$s$ 是每元素字节数。

GQA/MQA 通过减少 $H_{kv}$ 降低 KV cache；量化 cache 可进一步降低字节数，但要验证数值与 kernel 支持。

## 4. 为什么 batching 变复杂

请求的 prompt 长度、生成长度和到达时间不同。静态 batch 会被最长序列拖住，并为已结束序列浪费槽位。Continuous batching 在 token step 之间动态加入/移除请求，提高 GPU 利用率，但必须处理：

- 不同序列的页式 KV block；
- 调度公平性和最大等待时间；
- prefill 与 decode 的资源竞争；
- EOS、超时、取消和流式返回；
- 模型、tokenizer 与采样配置的请求级隔离。

## 5. 推理评测的四组指标

| 维度 | 指标 |
|---|---|
| 首 token | time to first token（TTFT） |
| 生成速度 | inter-token latency（ITL）、tokens/s |
| 整体请求 | end-to-end latency、P50/P95/P99 |
| 服务能力 | request throughput、token throughput、错误率、排队时间 |

不能用离线单请求 tokens/s 代表在线服务质量，也不能只报均值掩盖长尾。

## 最小实验

```powershell
python labs\04_sampling.py
```

固定一组 logits，比较 greedy、temperature、top-k 与 top-p 的概率和采样频率。至少运行 10,000 次抽样，检查经验频率是否接近理论概率。

## 本章验收

- [ ] 解释 prefill 与 decode 的计算特征。
- [ ] 用具体模型配置估算 1 条 4K 序列的 KV cache。
- [ ] 说明 top-k、top-p 和 temperature 的顺序与作用。
- [ ] 设计同时报告 TTFT、ITL、吞吐和 P95 的 serving benchmark。
