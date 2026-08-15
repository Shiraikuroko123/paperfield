# M2.1 Tokenization、Embedding 与位置

<div class="lesson-meta" data-lesson-id="m2-1">
  <span>M2 · Transformer 与生成</span>
  <strong>模型看到的是 token id，不是人类眼中的词</strong>
  <button type="button" class="lesson-complete">标记为已完成</button>
</div>

## 学习目标

- 区分字符、字节、token 和词表 id；
- 解释 BPE/SentencePiece 类 tokenizer 的训练与编码边界；
- 写出 token embedding 与位置编码的张量形状；
- 诊断 tokenizer 版本、特殊 token 和 chat template 不一致。

## 1. 为什么必须先切成 token

神经网络接收固定词表中的整数 id。直接用“词”作为单位会遇到无限新词、多语言、拼写变化和代码符号；直接用字符或字节虽然词表小，但序列更长。子词 tokenizer 在词表大小和序列长度之间折中。

以 BPE 类方法为例，训练过程反复合并高频相邻单元；编码时按固定规则把文本映射到词表。SentencePiece 可以直接在原始 Unicode 文本上训练，把空格也作为普通符号处理。具体模型可能使用 BPE、Unigram、byte-level BPE 或混合方案，不能只看“token 数”猜算法。

## 2. Tokenizer 是模型的一部分

以下任一不一致都会改变模型实际输入：

- tokenizer 文件或版本不同；
- `bos/eos/pad/unk` id 不同；
- 是否自动添加 BOS/EOS 不同；
- Unicode normalization 不同；
- chat template、role 标记和 generation prompt 不同；
- truncation 的方向、最大长度和 padding side 不同。

因此 checkpoint 的可复现包必须包含 tokenizer、special token 配置和模板，而不只是权重。

## 3. 从 id 到向量

设词表大小为 $V$、隐藏维度为 $D$，embedding 矩阵为：

$$
E\in\mathbb{R}^{V\times D}.
$$

输入 id 形状为 $[B,T]$，查表得到：

$$
X=E[\mathrm{ids}]\in\mathbb{R}^{B\times T\times D}.
$$

Embedding 不是 one-hot 乘法的特殊魔法；它等价于从矩阵中取对应行，只是实现更高效。

## 4. 模型怎样知道顺序

纯 self-attention 对输入排列本身没有顺序感，必须注入位置信息。常见路线包括：

- **绝对位置 embedding**：位置 id 查表后与 token embedding 相加；
- **相对位置 bias**：在 attention score 中加入与相对距离相关的偏置；
- **RoPE**：按位置旋转 query/key 的二维子空间，使点积包含相对位置信息。

RoPE 不等于“无限上下文”。训练长度、频率设置、注意力分布和 KV cache 成本仍会限制外推。

## 5. 一个 tokenizer 审计表

| 检查项 | 记录 |
|---|---|
| tokenizer 名称、commit/hash | 防止同名版本漂移 |
| vocab size 与特殊 token id | 检查 embedding/head 尺寸和语义 |
| 10 个多语言/代码/空白边界样本 | 观察异常切分 |
| chat template 渲染后的完整文本 | 检查 role 和 generation prompt |
| 截断前后 token 数与保留方向 | 防止丢掉问题或答案 |
| train/serve tokenizer 对照 | 防止训推不一致 |

## 最小实验

使用你手头任一公开 tokenizer，保存同一批字符串的 `text → ids → tokens → decoded text`。至少包含中文、英文、数字、换行、emoji、代码缩进和一个非常长的单词。解释不可逆空白或 normalization 变化。

## 本章验收

- [ ] 解释 token 为什么不等于字或词。
- [ ] 写出 embedding 的矩阵与输出形状。
- [ ] 列出 chat template 不一致造成的三种故障。
- [ ] 完成 tokenizer 审计表并保存版本信息。
