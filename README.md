# Paperfield

<p align="center">
  <strong>Language / 言語 / 语言:</strong>
  <a href="README.md">中文</a> |
  <a href="docs/i18n/README.en.md">English</a> |
  <a href="docs/i18n/README.ja.md">日本語</a>
</p>

Paperfield 是一套面向具身智能、大模型、多模态研究与开源项目跟踪的本地优先研究工作台。它聚合论文和 GitHub 项目，为每周精选预先寻找合法公开 PDF，并把全文精读、翻译、问答、项目源码导读和阅读历史放进同一个持续使用的界面。

在线展示：<https://shiraikuroko123.github.io/paperfield/>

本 README 是中文正式说明。英文和日文说明位于 `docs/i18n/`，通过顶部选项切换；历史路线图、重复说明和备份版文档不再维护。

## 主要能力

- 汇总 arXiv、OpenAlex、Crossref、PMLR、CVF Open Access、DBLP 等公开来源，覆盖具身智能、机器人、视觉、多模态、大模型与智能体方向。
- 按五项可调整权重筛选每周论文，并优先保留已找到合法公开 PDF 的条目。
- 在阅读器中并排显示 PDF、全文精读、公式、翻译和基于原文的对话历史。
- 每周推荐少量相关 GitHub 项目，整理 README、关键入口、依赖和源码阅读路径。
- 支持本地存储、Cloudflare R2 或其他 S3 兼容对象存储；阅读讲解和问答可同步到共享云端。
- 支持受登录保护的朋友内测共享；普通用户可以配置自己的 OpenAI 兼容 API，彼此的密钥和模型列表互不共享。

## 正式目录

```text
paper-scout/
├─ README.md                         中文主说明
├─ src/
│  └─ paperfield/                    应用源码包
│     ├─ __init__.py                 Python 包标记
│     ├─ app.py                      HTTP 服务、采集、推荐、PDF、AI、存储和账号逻辑
│     ├─ catalog/                    可公开提交的领域目录和采集策略
│     │  ├─ config.json              主题、查询与推荐策略
│     │  ├─ venues.json              顶会、顶刊与来源知识库
│     │  └─ institutions.json        高校和研究机构标记库
│     └─ static/                     浏览器客户端
│        ├─ index.html               主工作台
│        ├─ app.js                   论文、项目、阅读器和设置交互
│        ├─ styles.css               清华紫主题与响应式界面
│        ├─ login.html               内测登录页
│        ├─ login.js                 登录交互
│        ├─ login.css                登录页样式
│        └─ vendor/                  固定版本的 PDF.js 与 KaTeX 前端资源
├─ deploy/                           可部署配置
│  ├─ .env.example                  环境变量样例，不含任何密钥
│  ├─ requirements.txt              Python 运行依赖
│  ├─ compose.yaml                  Docker Compose 服务定义
│  └─ docker/
│     ├─ Dockerfile                 容器构建文件
│     └─ Dockerfile.dockerignore    Docker 构建上下文过滤规则
├─ scripts/                          Windows 本地运行、检查、刷新、分享和打包脚本
│  ├─ run.cmd / run.ps1             启动本地工作台
│  ├─ refresh.cmd / refresh.ps1     手动刷新论文与项目来源
│  ├─ check.cmd / check.ps1         运行单元测试和前端语法检查
│  ├─ manage-beta-users.py          创建、重置、禁用内测账号
│  ├─ start-beta-*.ps1              启动受保护的 ngrok 共享服务
│  ├─ stop-beta-share.ps1           停止共享服务
│  ├─ install-beta-*.ps1            创建桌面快捷方式或开机启动项
│  └─ build-release.py              生成不含个人数据的 Windows 发布包
├─ tests/
│  └─ test_core.py                  后端核心行为回归测试
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
python src\paperfield\app.py
```

打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。首次运行会初始化本地数据库和缓存，之后可以在页面中手动刷新，或由后台按设定周期更新。

常用命令：

```powershell
.\scripts\run.cmd
.\scripts\refresh.cmd
.\scripts\check.cmd
```

## 私有数据和 AI 配置

应用的数据库、PDF、全文解析、项目缓存、精读、聊天记录、账号和本地密钥默认位于 `local/data/`。旧版已经存在的 `data/` 会继续兼容读取，避免迁移时损失任何内容。

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
node --check src\paperfield\static\app.js
node --check src\paperfield\static\login.js
python -m unittest discover -s tests -p test_core.py
python scripts\build-release.py
docker build -f deploy\docker\Dockerfile -t paperfield:test .
docker compose -f deploy\compose.yaml config --quiet
```

`scripts/build-release.py` 只打包 Git 已跟踪的公开文件，并额外放入一份空的 `local/.env.example`。它会拒绝把数据库、日志、密钥、`local/` 或 `data/` 放进发布包。

## 正式发布规则

`v1.0.0` 是首发正式发布标签。后续稳定改动先合并到 `main` 并通过完整检查，再递增语义化版本号并创建新的 GitHub Release；历史标签和 Release 会保留，便于下载与回退。
