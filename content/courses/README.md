# AI 系统课程

面向中文学习者的统一 AI 系统课程站点，包含两条可独立学习、也可交叉推进的路线：

- **LLM 系统课程**：数学、Transformer、训练、对齐、分布式系统与研究复现。
- **具身智能课程**：机器人系统、策略学习、操作与 VLA、Sim2Real 和研究评测。

统一平台入口：<http://127.0.0.1:8765/courses/>

## 本地预览

```powershell
cd G:\ps\paper-scout
.\scripts\build-platform.ps1
.\scripts\run-platform.ps1
```

浏览器打开 `http://127.0.0.1:8765/courses/`。课程源码已并入
[`Shiraikuroko123/paperfield`](https://github.com/Shiraikuroko123/paperfield/tree/main/content/courses)，
不再以独立仓库作为产品入口。

## 内容结构

```text
课程/
  README.md       # 统一学习中心
  llm/            # LLM 系统课程与实验
  embodied/       # 具身智能课程与实验
  assets/         # 共享样式与脚本
```

