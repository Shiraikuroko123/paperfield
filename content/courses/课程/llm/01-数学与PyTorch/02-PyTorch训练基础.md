# M1.2 张量、自动微分与训练循环

<div class="lesson-meta" data-lesson-id="m1-2">
  <span>M1 · 数学与 PyTorch</span>
  <strong>把公式落到张量、梯度、优化器和检查点</strong>
  <button type="button" class="lesson-complete">标记为已完成</button>
</div>

## 学习目标

- 区分参数、激活、梯度和优化器状态；
- 写出没有隐藏魔法的训练/验证循环；
- 识别 `train/eval`、`no_grad`、梯度清零和 checkpoint 常见错误；
- 运行 `labs/02_autograd_training.py` 并主动制造一次训练失败。

## 1. Tensor 不只是多维数组

一个训练 tensor 至少有五个属性需要记录：

```python
print(x.shape, x.dtype, x.device, x.requires_grad, x.stride())
```

- `shape` 决定运算是否合法；
- `dtype` 决定精度、速度和显存；
- `device` 决定数据在哪里计算；
- `requires_grad` 决定 autograd 是否记录路径；
- stride/contiguous 决定某些 view 与 kernel 是否可用。

## 2. 自动微分在记录什么

PyTorch 前向计算会构建动态计算图。调用 `loss.backward()` 后，叶子参数的 `.grad` 累积梯度：

```python
optimizer.zero_grad(set_to_none=True)
pred = model(x)
loss = criterion(pred, y)
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
optimizer.step()
```

关键词是“累积”。如果忘记 `zero_grad`，本 step 的梯度会叠加到上一次；如果错误地在需要梯度的路径中 `.detach()`，参数不会收到信号。

## 3. 最小训练循环

```python
for epoch in range(num_epochs):
    model.train()
    for x, y in train_loader:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(x)
        loss = criterion(logits, y)
        if not torch.isfinite(loss):
            raise RuntimeError(f"non-finite loss: {loss.item()}")
        loss.backward()
        grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

    model.eval()
    with torch.no_grad():
        valid_loss = evaluate(model, valid_loader, device)
```

训练日志至少包含 step、学习率、训练 loss、验证 loss、梯度范数、吞吐和数据版本。只看训练 loss 无法判断泛化，也无法定位数据泄漏。

## 4. 参数、激活与优化器状态

以 AdamW 为例，单个参数通常对应：

- 参数本身；
- 梯度；
- 一阶矩 $m$；
- 二阶矩 $v$；
- 混合精度训练时可能还有 FP32 master weights。

所以“7B 参数 × 2 bytes = 14GB”只算了权重，不是训练显存。激活还随 batch、sequence length、hidden size 和层数增长，M6 会建立完整账本。

## 5. Checkpoint 必须能恢复实验

```python
torch.save({
    "model": model.state_dict(),
    "optimizer": optimizer.state_dict(),
    "scheduler": scheduler.state_dict(),
    "step": step,
    "rng_state": torch.get_rng_state(),
    "config": config,
}, path)
```

只保存模型权重可以推理，却不能严格恢复训练轨迹。分布式训练还需保存各 rank/分片状态和数据迭代位置。

## 故障实验

运行：

```powershell
python labs\02_autograd_training.py
```

依次尝试：

1. 把学习率提高 100 倍，记录 loss 和梯度范数；
2. 注释梯度清零，观察收敛路径；
3. 在模型输出后 `.detach()`，解释 backward 为什么失败；
4. 固定 seed 重跑两次，比较结果是否一致。

## 本章验收

- [ ] 能写出完整训练和验证循环，不依赖 Trainer 黑盒。
- [ ] 能解释 `.train()`、`.eval()` 与 `torch.no_grad()` 的差异。
- [ ] 能列出 checkpoint 为严格恢复训练至少保存什么。
- [ ] 提交一个故障实验的日志和原因解释。
