# Paperfield

<p align="center">
  <strong>Language / 言語 / 语言:</strong>
  <a href="README.md">中文</a> |
  <a href="docs/i18n/README.en.md">English</a> |
  <a href="docs/i18n/README.ja.md">日本語</a>
</p>

Paperfield 是一套面向具身智能、大模型、多模态研究与开源项目跟踪的本地优先研究工作台。它聚合论文和 GitHub 项目，为每周精选预先寻找合法公开 PDF，并把全文精读、翻译、问答、项目源码导读和阅读历史放进同一个持续使用的界面。

在线展示：<https://shiraikuroko123.github.io/paperfield/>

当前仓库同时纳入了 `flowloom` 和 `ai-systems-courses` 的完整有效内容，组成一个产品、一个仓库和一个浏览器入口：

| 工作区 | 统一路由 | 仓库位置 |
| --- | --- | --- |
| 论文发现与精读 | `/` | `src/paperfield/` |
| 前沿雷达、知识树、完整课程与深度档案 | `/atlas/` | `src/research_atlas/` + `content/courses/` |
| 科研图表与 SVG 编辑 | `/flowloom/` | `apps/flowloom/` |

首次构建并启动整个平台：

```powershell
.\scripts\build-platform.cmd
.\scripts\run-platform.cmd
```

随后只打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。停止后台服务使用 `.\scripts\stop-platform.cmd`。平台生命周期的 `.cmd` 包装器会以 `ExecutionPolicy Bypass` 调用仓库内对应的 PowerShell 脚本，适用于禁止直接执行 `.ps1` 的 Windows 环境。`run-platform.cmd` 会启动 Atlas 内部进程，但浏览器不再需要直接访问 `8795`；Flowloom 也不需要单独的开发端口，课程正文由 Atlas 按需读取。

Paperfield、Atlas 与 Flowloom 仍分别拥有阅读数据、私人分析与学习数据、图文档。课程 Markdown 是 Atlas 的版本化内容源，不另设运行时工作区。合并源码不等于混合数据库。跨工作区对象使用 `packages/research-contracts/` 中的论文、项目、章节、图和来源定位协议。上游仓库与精确 commit 记录在 `provenance.json`；完整迁移边界见 `docs/MONOREPO_INTEGRATION.md`。

本 README 是中文正式说明。英文和日文说明位于 `docs/i18n/`，通过顶部选项切换；历史路线图、重复说明和备份版文档不再维护。

## 主要能力

- 汇总 arXiv、OpenAlex、Crossref、PMLR、CVF Open Access、DBLP 等公开来源，覆盖具身智能、机器人、视觉、多模态、大模型与智能体方向。
- 按五项可调整权重筛选每周论文，并优先保留已找到合法公开 PDF 的条目。
- 在阅读器中并排显示 PDF、全文精读、公式、翻译和基于原文的对话历史。
- 每周推荐少量相关 GitHub 项目，整理 README、关键入口、依赖和源码阅读路径。
- 通过独立的 Research Atlas companion 保存论文档案、分析任务和项目研究关联，并为后续方法谱系、术语与前沿雷达提供稳定入口。
- 支持本地存储、Cloudflare R2 或其他 S3 兼容对象存储；阅读讲解和问答可同步到共享云端。
- 支持受登录保护的朋友内测共享；普通用户可以配置自己的 OpenAI 兼容 API，彼此的密钥和模型列表互不共享。

## 正式目录

```text
paper-scout/
├─ README.md                         中文主说明
├─ src/
│  ├─ paperfield/                    发现、推荐、PDF 精读与源码工作台
│  │  ├─ app.py                      HTTP 服务、采集、推荐、PDF、AI、存储和账号逻辑
│  │  ├─ catalog/                    可公开提交的领域目录和采集策略
│  │  │  ├─ config.json              主题、查询与推荐策略
│  │  │  ├─ venues.json              顶会、顶刊与来源知识库
│  │  │  └─ institutions.json        高校和研究机构标记库
│  │  └─ static/                     Paperfield 浏览器客户端与固定前端资源
│  └─ research_atlas/                独立研究知识与前沿 companion
│     ├─ app.py                      Atlas HTTP 服务、独立 SQLite 与桥接协议
│     ├─ worker.py                   公开 PDF 下载、页码解析与分阶段模型执行器
│     ├─ scanner.py                  arXiv、第一方动态与术语证据增量扫描
│     ├─ schema_validation.py        分析结果的本地严格 JSON Schema 校验
│     ├─ PRODUCT.md / DESIGN.md      产品边界与界面系统
│     ├─ ANALYSIS_API.md             多阶段执行器接口、鉴权和证据契约
│     ├─ FRONTIER_SOURCES.md          候选来源、运行状态与发布边界
│     ├─ schemas/                    可复用的分析结果 JSON Schema
│     └─ static/                     前沿雷达、档案、项目和任务界面
├─ deploy/                           可部署配置
│  ├─ .env.example                  环境变量样例，不含任何密钥
│  ├─ requirements.txt              Python 运行依赖
│  ├─ compose.yaml                  Docker Compose 服务定义
│  └─ docker/
│     ├─ Dockerfile                 容器构建文件
│     └─ Dockerfile.dockerignore    Docker 构建上下文过滤规则
├─ scripts/                          Windows 本地运行、检查、刷新、分享和打包脚本
│  ├─ run.cmd / run.ps1             启动本地工作台
│  ├─ run-atlas.cmd / run-atlas.ps1 启动 Research Atlas
│  ├─ run-atlas-worker.*             启动默认关闭的独立分析 worker
│  ├─ run-atlas-scanner.*            执行一次或持续运行公开来源扫描
│  ├─ refresh.cmd / refresh.ps1     手动刷新论文与项目来源
│  ├─ check.cmd / check.ps1         运行单元测试和前端语法检查
│  ├─ manage-beta-users.py          创建、重置、禁用内测账号
│  ├─ start-beta-*.ps1              启动受保护的 ngrok 共享服务
│  ├─ stop-beta-share.ps1           停止共享服务
│  ├─ install-beta-*.ps1            创建桌面快捷方式或开机启动项
│  └─ build-release.py              生成不含个人数据的 Windows 发布包
├─ tests/
│  ├─ test_core.py                  Paperfield 后端核心行为回归测试
│  ├─ test_atlas.py                 Atlas 存储、桥接与 HTTP 回归测试
│  ├─ test_atlas_phase4.py          编辑工作台、审核与批处理回归测试
│  ├─ test_atlas_phase5.py          私人研究闭环、同步与迁移回归测试
│  ├─ test_atlas_phase6.py          可复现工作区与证据包回归测试
│  ├─ test_atlas_phase7.py          幂等重试、运行差异与恢复回归测试
│  ├─ test_atlas_worker.py          PDF、SSRF、schema、模型 mock 与恢复测试
│  └─ test_atlas_scanner.py         arXiv 解析、去重、来源状态与 API 测试
├─ docs/i18n/                       英文与日文说明
│  ├─ README.en.md                  English guide
│  └─ README.ja.md                  日本語ガイド
├─ .github/                         CI、正式发布工作流与 Issue 模板
│  ├─ workflows/ci.yml              Python、JavaScript 和 Docker 检查
│  ├─ workflows/release.yml         标签发布后的 Windows 打包流程
│  └─ ISSUE_TEMPLATE/               Bug 与功能反馈表单
├─ .gitignore                       排除个人数据、缓存、密钥和构建产物
├─ .gitattributes                   Git 文本属性
├─ local/                           本机私有运行数据，不进入 Git
├─ data/                            旧版兼容数据目录，不进入 Git
└─ dist/                            本地生成的发布压缩包，不进入 Git
```

`local/`、`data/` 和 `dist/` 是运行期目录，不是公开源码的一部分。它们即使出现在本机根目录，也不会进入 GitHub；不要把它们移动到 `src/` 或提交到仓库。

## 本地使用

### 首次启动

```powershell
cd G:\ps\paper-scout
python -m pip install -r deploy\requirements.txt
.\scripts\build-platform.cmd
.\scripts\run-platform.cmd
```

只需打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。首次运行会初始化本地数据库和缓存，之后可以在页面中手动刷新，或由后台按设定周期更新。再次执行 `run-platform.cmd` 会复用已健康的服务，不会启动重复进程；停止整个平台使用 `stop-platform.cmd`。`.cmd` 包装器负责设置 `ExecutionPolicy Bypass`，无需修改系统级 PowerShell 执行策略。

常用命令：

```powershell
.\scripts\run-platform.cmd
.\scripts\stop-platform.cmd
.\scripts\run-atlas-worker.cmd
.\scripts\run-atlas-scanner.cmd
.\scripts\refresh.cmd
.\scripts\check.cmd
```

### Research Atlas 深度分析

Atlas 已经是统一平台内部工作区，由 `run-platform.cmd` 自动启动。浏览器从 [http://127.0.0.1:8765/atlas/](http://127.0.0.1:8765/atlas/) 进入，不需要直接访问内部端口 `8795`。在论文详情或精读台点击“系统讲解 / 加入深度分析”，或在项目源码台点击“研究关联”，Paperfield 会通过一次性 token 将当前对象送入 Atlas。Atlas 使用 `local/atlas/atlas.db`，不读取 Paperfield SQLite。

当前 Atlas 0.18.0（SQLite schema 17）已具备默认关闭、来源受限的深度分析链路、独立的 arXiv 论文候选扫描、固定白名单的第一方研究动态、官方 RSS/Atom 与 GitHub release/commit 前沿监控、站内新闻阅读、带原文语境的术语候选、受控人工审核的研究变化发布流程、跨论文科学主张谱系和研究线程，以及 Phase 4 到 Phase 10 的私人研究工作区。编辑工作台支持本机与授权编辑账号，覆盖 L1 批量结构化、L2 锚点扩展、覆盖缺口扫描、批量重算、差异审核、实体别名与合并、关系修正、暂停/恢复/重试和全量审计。所有批量作业默认 dry-run；已审核实体、关系、主张和线程不会被模型或提示升级静默覆盖，只有编辑者显式批准并记录理由后才会应用。线程发布和撤回必须经过受控事务，黄金评测集与评测运行按 owner 隔离；Atlas 的页码、章节、图表、公式和引文定位可回到 Paperfield 搜索全文、定位页面并显示命中状态。成本工作量、耗时、完成数和失败数保存在作业指标中；整库备份仍只允许本机直接访问。新闻来源和正文抓取保留来源主机、发布时间、抓取时间、内容哈希与失败状态；新闻始终作为独立证据层，不会提升论文证据等级。

Phase 6 将目录搜索物化为有生命周期和容量上限的 owner 私有快照，并加入可保存的搜索、雷达和关注视图、不可变运行记录、显式关注驱动的通知，以及带 manifest 和 SHA-256 校验的证据包。Phase 7 为视图运行和证据包导出加入 owner-scoped 幂等重试：首次创建返回 `201`，确认重放返回 `200`，同键异请求返回 `409`；每个 owner/view 的运行使用单调 `run_sequence` 保存真实顺序，连续运行会保存基线关系及新增、移除、变化和未变化条目的可校验相邻差异。schema 11 的 v10→v11 迁移会按历史插入顺序线性化旧运行、重建前序与差异，并为 Phase 7 证据包同步序号后重新签名；Phase 6 旧证据包保持原字节。私人数据导出 schema 2 覆盖关注配置、保存对象、私人周报、研究视图、运行、通知和证据包，导入会在任何写入前验证唯一基线、连续序号、相邻前序、无分叉/断链/循环、时间顺序和逐字段重算的 delta，再在单一事务中写入；原始幂等键和重试账本不会进入导出文件。

术语页仍会区分单篇命名与跨论文出现，但不宣称名称首次提出；论文、官方动态和术语候选都不会自动成为趋势。研究线程由编辑审核后发布，页面会展示问题、变化、竞争路线、反证、未知项和逐条证据；未发布草稿不会进入公开雷达。评测指标由服务端依据黄金定位字段重算，调用方不能提交定位完整度或审核一致性分数；尚未有独立人工一致性标注时，`reviewer_agreement` 明确返回 `null`。worker 协议见 `src/research_atlas/ANALYSIS_API.md`，来源与发布边界见 `src/research_atlas/FRONTIER_SOURCES.md`；非默认部署可在 `local/.env` 中设置 `RESEARCH_ATLAS_*`，并在 Paperfield 浏览器控制台设置 `localStorage["paperfield.atlasUrl"]`。

知识树、课程章节、教材正文和教学顺序都位于 Atlas 的“知识树与课程”视图：打开 [具身智能知识树](http://127.0.0.1:8765/atlas/?view=curriculum&track=embodied) 或 [LLM 知识树](http://127.0.0.1:8765/atlas/?view=curriculum&track=llm)。选择章节后，Atlas 会在同一页面载入完整教材、数学推导、方法图与版本哈希；代表论文和项目仍会回到 Paperfield 精读，章节查询词可直接切换到前沿雷达。历史 `/courses/...` 收藏会重定向到对应 Atlas 教材。没有已发布研究线程时页面显示真实空状态，不会生成虚假档案。

执行一次最近 14 天的具身智能与大模型候选扫描：

```powershell
.\scripts\run-atlas-scanner.cmd
```

持续运行并按 `RESEARCH_ATLAS_SCAN_INTERVAL_SECONDS` 周期重复扫描：

```powershell
.\scripts\run-atlas-scanner.cmd --watch
```

扫描器先读取 arXiv API，并在 API 限流或故障时降级到 arXiv 官方 RSS；随后读取代码内固定白名单的第一方 RSS/Atom，包括 OpenAI、Google DeepMind、Hugging Face、Microsoft Research、BAIR 和 Google Research。动态只在最终文章主机属于对应机构且命中大模型或具身智能查询时入库。扫描器还会从论文标题和摘要中提取作者明确使用的缩写与方法名，保存展开形式、原句和关联论文。整个过程不下载 PDF、不读取 Paperfield 数据库，也不调用模型；每次运行记录时间窗、实际传输通道、来源 URL、计数、错误和标准化条目 SHA-256。

Paperfield 的“加入深度分析”只创建任务，不会授予 PDF 或模型权限。请在 Atlas 的任务或档案中分别确认“本地下载解析公开 PDF”和“把全文发送给外部模型 API”。只开启第一项时，worker 会在 `local/atlas/materials/` 完成本地解析后停止；两项都开启才会调用模型。配置专用的 `RESEARCH_ATLAS_WORKER_TOKEN` 与 `RESEARCH_ATLAS_OPENAI_*` 后，在第三个终端启动：

```powershell
.\scripts\run-atlas-worker.cmd
```

worker 不读取或回退到 `PAPERFIELD_OPENAI_*`、通用 `OPENAI_*`、CC Switch 或 Codex 凭据。打开论文、档案和任务页面只读取状态，不触发付费调用。

## 私有数据和 AI 配置

Paperfield 的数据库、PDF、全文解析、项目缓存、精读、聊天记录、账号和本地密钥默认位于 `local/data/`。Atlas 使用独立的 `local/atlas/atlas.db` 与 `local/atlas/materials/`，不会读取 Paperfield 数据库、缓存或私人笔记。旧版已经存在的 `data/` 会继续兼容读取，避免迁移时损失任何内容。

将环境变量样例复制到私有位置后再填写实际值：

```powershell
Copy-Item deploy\.env.example local\.env
```

可在 `local/.env` 中配置 `PAPERFIELD_OPENAI_API_KEY`、`PAPERFIELD_OPENAI_BASE_URL`、`PAPERFIELD_OPENAI_MODEL` 和推理强度。未显式配置时，Paperfield 会尝试读取本机 CC Switch 提供的 OpenAI 兼容设置；因此 CC Switch 切换 API 后，新的精读和问答会使用新的可用模型，已保存的精读和历史不会变化。

普通用户在自己的网页设置中连接 API 时，只会看到自己密钥可访问的模型。内测账号使用服务器侧配置时，才会使用服务器的模型与额度。不要把 `local/.env`、`deploy/.env`、数据库或 PDF 提交到 GitHub。

## 云端与共享

Cloudflare R2 和其他 S3 兼容存储可用于同步 PDF、全文精读和问答历史。相关配置都在 `deploy/.env.example` 中，以 `PAPERFIELD_S3_*`、`PAPERFIELD_CLOUD_PREFIX` 和 `PAPERFIELD_SHARED_STORAGE_MAX_MB` 开头。共享库大小通过 `PAPERFIELD_SHARED_STORAGE_MAX_MB` 控制，应用会展示已用空间和操作统计。

若需要让朋友通过浏览器访问，先建立内测账号，再安装桌面快捷方式：

```powershell
python scripts\manage-beta-users.py add <username> --role beta
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

桌面上的 `Paperfield Share` 会启动本机服务和 ngrok 隧道，并复制访问地址；`Stop Paperfield Share` 会关闭它。共享服务运行期间，源电脑必须保持联网和开机。固定 ngrok 域名可通过 `local/.env` 的 `PAPERFIELD_NGROK_URL` 设置。

## Docker 部署

Docker 使用独立的部署目录，构建上下文仍是仓库根目录：

```powershell
Copy-Item deploy\.env.example deploy\.env
docker compose --env-file deploy\.env -f deploy\compose.yaml up --build -d
```

停止服务：

```powershell
docker compose --env-file deploy\.env -f deploy\compose.yaml down
```

容器使用命名卷保存数据；生产环境应将 `.env` 和卷备份到受控位置。

## 开发与验证

```powershell
python -m py_compile src\paperfield\app.py
python -m py_compile src\research_atlas\app.py src\research_atlas\worker.py src\research_atlas\schema_validation.py
node --check src\paperfield\static\app.js
node --check src\research_atlas\static\app.js
node --check src\paperfield\static\login.js
python -m unittest discover -s tests -v
python scripts\build-release.py
docker build -f deploy\docker\Dockerfile -t paperfield:test .
docker compose -f deploy\compose.yaml config --quiet
```

`scripts/build-release.py` 会打包 Git 已跟踪公开文件，以及明确 allowlist 的统一工作区源码（`apps/flowloom`、`content/courses`、`packages/research-contracts`、Atlas 源码和平台脚本），并加入已构建的 Flowloom 产物和一份空的 `local/.env.example`。课程不再生成重复静态站，Atlas 在运行时读取随发行包交付的 Markdown 源文。发布构建会拒绝把数据库、日志、密钥、依赖树、`local/` 或 `data/` 放进发布包；allowlist 外的临时文件不会进入发布包。

`paperfield` 是三个工作区唯一的正式源码仓库和后续维护入口。Flowloom 与课程源码已经按 `provenance.json` 记录的固定 commit 完整核对并纳入本仓库；旧的 `flowloom` 和 `ai-systems-courses` 仓库只保留为只读历史或归档，不再独立发布。导入边界、许可证现状和运行期数据隔离规则见 `docs/MONOREPO_INTEGRATION.md`。

## 正式发布规则

`v1.0.0` 是首发正式发布标签。后续稳定改动先合并到 `main` 并通过完整检查，再递增语义化版本号并创建新的 GitHub Release；历史标签和 Release 会保留，便于下载与回退。
