# M1.2 主干：Python、PyTorch 与深度学习

## 学习目标

学完本章，你应能读懂训练脚本，追踪张量形状，正确划分数据，保存并恢复模型，并定位“代码能跑但学不会”的常见原因。

## 2.1 Python 工程最小能力

具身项目至少要求：

- 会使用函数、类、迭代器、上下文管理器和异常。
- 会读写 JSON、CSV、图像和数组文件。
- 会创建虚拟环境、固定依赖版本、使用 Git 记录改动。
- 知道相对路径相对谁解析，不在代码中写死个人绝对路径。
- 会使用日志和断言，不靠不停 `print` 猜状态。

推荐在入口处明确配置，在内部传递结构化对象，避免依赖隐式全局变量。

```python
from dataclasses import dataclass

@dataclass
class TrainConfig:
    seed: int = 0
    batch_size: int = 64
    learning_rate: float = 3e-4
```

## 2.2 NumPy 与张量形状

机器人数据常见形状：

| 数据 | 张量形状 |
|---|---|
| 图像 | $[B,C,H,W]$ |
| 关节状态 | $[B,T_{\mathrm{obs}},D_{\mathrm{state}}]$ |
| 动作块 | $[B,T_{\mathrm{act}},D_{\mathrm{act}}]$ |
| 相机内参 | $[B,3,3]$ |
| 位姿矩阵 | $[B,4,4]$ |

`reshape` 改变视图的形状，`transpose/permute` 改变轴的顺序，`squeeze` 可能意外删除批次维。每个模型边界都应断言形状和数值范围：

```python
assert actions.ndim == 3
assert actions.shape[-1] == action_dim
assert torch.isfinite(actions).all()
```

## 2.3 PyTorch 的计算图

PyTorch 张量可记录操作形成计算图。`loss.backward()` 按链式法则计算所有可训练参数的梯度，优化器再更新参数。

标准训练循环：

```python
model.train()
for x, y in train_loader:
    optimizer.zero_grad(set_to_none=True)
    pred = model(x)
    loss = criterion(pred, y)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    optimizer.step()
```

验证时必须：

```python
model.eval()
with torch.no_grad():
    ...
```

`train/eval` 控制 Dropout、BatchNorm 等模块行为；`no_grad` 控制是否记录梯度。两者不是同一件事。

## 2.4 监督学习的完整闭环

模型学习映射 $f_\theta(x)$，损失衡量预测和标签差异。完整流程不是“调用 fit”，而是：

1. 定义数据单位、坐标系和标签含义。
2. 按实验单位划分 train/validation/test。
3. 只用训练集计算归一化统计。
4. 用训练集更新参数，用验证集选择配置。
5. 测试集只用于最终一次无偏评估。
6. 保存模型权重、配置、数据版本、归一化统计和代码提交号。

轨迹数据不能随意按帧随机拆分。同一 episode 的相邻帧高度相似，如果一部分进入训练、一部分进入测试，就发生数据泄漏。

## 2.5 欠拟合、过拟合与分布偏移

| 现象 | 可能原因 | 首要检查 |
|---|---|---|
| 训练和验证都差 | 欠拟合、目标错误、数据错误 | 先让模型过拟合 1 个 batch |
| 训练好、验证差 | 过拟合或分布不一致 | 划分、增广、正则化 |
| 离线误差低、机器人执行差 | 闭环分布偏移 | rollout、时序同步、动作尺度 |
| 换相机就崩 | 视觉域偏移或标定错误 | 预处理、相机位姿、曝光 |

“过拟合一个 batch”是最重要的调试动作之一。如果大模型连几十个样本都拟合不了，问题通常在数据管线、损失、模型连接或优化，而不是数据量不足。

## 2.6 常见网络模块

- MLP：适合低维状态和简单函数逼近。
- CNN：利用局部结构处理图像。
- RNN/LSTM：递归处理序列，长依赖和并行效率有限。
- Transformer：用注意力直接建立序列元素关系，已成为 VLM/VLA 主干。
- Encoder/Decoder：编码器提取表示，解码器生成类别、文本、动作或图像。

参数量不是能力的唯一决定因素。数据分布、训练目标、动作表示、延迟和评测协议通常同样重要。

## 2.7 可复现性

固定随机种子：

```python
import random, numpy as np, torch

random.seed(0)
np.random.seed(0)
torch.manual_seed(0)
```

固定种子只让一次运行更容易复现，不代表算法稳定。正式实验应使用多个训练种子，报告均值、标准差或置信区间。

checkpoint 至少保存：

```python
torch.save({
    "model": model.state_dict(),
    "optimizer": optimizer.state_dict(),
    "step": step,
    "config": vars(config),
    "normalization": stats,
}, path)
```

## 2.8 最小实验

运行：

```powershell
python labs\02_pytorch_regression.py
```

实验使用 PyTorch 拟合带噪声函数，并验证：

- 梯度确实更新参数；
- 训练集归一化统计被复用到验证集；
- 固定种子后指标稳定；
- 保存和重新加载后预测一致。

## 2.9 易错点

1. 忘记 `zero_grad`，导致梯度跨 batch 累积。
2. 在验证集上反复选 checkpoint，最后把验证集当成了训练信号。
3. 动作和状态分别使用了不一致的归一化统计。
4. 图像从 HWC 转 CHW 时轴顺序错误。
5. 模型在 GPU、输入在 CPU，或 dtype 不一致。
6. 只记录最终成功率，不记录数据版本、失败轨迹和训练曲线。

## 2.10 自测题

1. `model.eval()` 与 `torch.no_grad()` 的区别是什么？
2. 为什么机器人轨迹应按 episode 而不是按帧划分？
3. 一个模型不能过拟合单个 batch，优先排查哪四类问题？
4. 为什么归一化统计也属于模型 checkpoint 的一部分？
5. 单随机种子结果比 baseline 高 3%，能否得出方法更好？
