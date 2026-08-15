# AI 系统课程

<div class="hub-hero">
  <p class="hub-lead">从 token 到动作，从训练系统到机器人闭环。两条工程与研究路线，共享一套可检索、可验证、可持续复习的学习工作台。</p>
  <div class="hub-actions">
    <a class="md-button md-button--primary" href="llm/">进入 LLM 系统课程</a>
    <a class="md-button" href="embodied/">进入具身智能课程</a>
  </div>
  <dl class="hub-facts" aria-label="课程规模">
    <div><dt>2</dt><dd>条完整路线</dd></div>
    <div><dt>88</dt><dd>个核心单元</dd></div>
    <div><dt>46</dt><dd>个可运行实验与项目</dd></div>
  </dl>
</div>

## 选择学习路线

<div class="course-lanes">
  <section class="course-lane course-lane--llm" aria-labelledby="llm-course-title">
    <div class="course-lane__header">
      <div>
        <p class="course-lane__code">LLM</p>
        <h3 id="llm-course-title">LLM 系统课程</h3>
      </div>
      <p>从数学、Transformer 与数据出发，进入对齐算法、分布式训练、推理系统与研究复现。</p>
    </div>
    <ul class="course-lane__meta" aria-label="LLM 课程规模">
      <li><strong>8</strong> 个模块</li>
      <li><strong>54</strong> 个单元</li>
      <li><strong>35</strong> 个项目</li>
    </ul>
    <div class="course-progress" data-course-progress-course="llm" data-course-progress-total="54">
      <div>
        <strong data-course-progress>0 / 54</strong>
        <span>进度仅保存在当前浏览器</span>
      </div>
      <progress value="0" max="54" aria-label="LLM 系统课程完成进度"></progress>
    </div>
    <div class="course-actions">
      <a class="md-button md-button--primary" href="llm/">查看课程入口</a>
      <a class="md-button" href="llm/00-导学与诊断/02-先修诊断与个性化路径/">开始先修诊断</a>
    </div>
    <div class="course-map-scroll">
      <picture>
        <source media="(max-width: 719px)" srcset="llm/assets/images/course-map-mobile.svg">
        <img class="course-map-visual" src="llm/assets/images/course-map.svg" alt="LLM 系统课程从导学、数学、Transformer、预训练和对齐，进入训练系统与研究项目的路线图">
      </picture>
    </div>
  </section>

  <section class="course-lane course-lane--embodied" aria-labelledby="embodied-course-title">
    <div class="course-lane__header">
      <div>
        <p class="course-lane__code">EMBODIED</p>
        <h3 id="embodied-course-title">具身智能课程</h3>
      </div>
      <p>从数学、机器人系统与控制出发，进入策略学习、VLA、Sim2Real、评测与研究项目。</p>
    </div>
    <ul class="course-lane__meta" aria-label="具身智能课程规模">
      <li><strong>7</strong> 个模块</li>
      <li><strong>34</strong> 个核心单元</li>
      <li><strong>11</strong> 个实验</li>
    </ul>
    <div class="course-progress" data-course-progress-course="embodied" data-course-progress-total="34">
      <div>
        <strong data-course-progress>0 / 34</strong>
        <span>进度仅保存在当前浏览器</span>
      </div>
      <progress value="0" max="34" aria-label="具身智能课程完成进度"></progress>
    </div>
    <div class="course-actions">
      <a class="md-button md-button--primary" href="embodied/">查看课程入口</a>
      <a class="md-button" href="embodied/00-导学与诊断/01-导学诊断与学习方法/">开始导学诊断</a>
    </div>
    <div class="course-map-scroll">
      <img class="course-map-visual" src="embodied/assets/images/course-map.svg" alt="具身智能课程从导学、数学和机器人系统基础，进入策略学习、VLA、迁移与研究项目的路线图">
    </div>
  </section>
</div>

## 两门课如何交叉学习

两条路线可以独立完成。若目标是研究具身基础模型或 VLA，建议按依赖关系交叉推进：

| 阶段 | LLM 路线 | 具身路线 | 共同产出 |
|---|---|---|---|
| 基础 | M1-M3：训练循环、Transformer、数据与 SFT | M1-M2：数学、学习基础、机器人系统与控制 | 一个可复现实验环境和统一学习日志 |
| 方法 | M4：reward、KL、PPO、GRPO 与评测 | M3-M4：策略学习、模仿学习、操作、数据与 VLA | 从模型目标到机器人动作接口的系统图 |
| 系统与研究 | M5-M7：方法证据、分布式训练、推理与消融 | M5-M6：迁移、Sim2Real、世界模型与研究评测 | 公平基线、消融、故障分析和可复现项目 |

不需要为了“同步”而拖慢已经掌握的部分。每门课先完成导学诊断，再根据实验结果决定快进范围。

## 本地实验

两门课的依赖相互隔离，分别在对应目录创建环境：

```powershell
cd 课程\llm       # 或 cd 课程\embodied
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python labs\00_environment_check.py
```

大型模型微调、分布式训练、ROS2 和仿真环境在对应章节中单独安装，避免基础实验被重型依赖阻塞。

