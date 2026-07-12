<a id="language"></a>

# Paperfield

<p align="center">
  <strong>Language / 言語 / 语言:</strong>
  <a href="#readme-zh">中文</a> |
  <a href="#readme-en">English</a> |
  <a href="#readme-ja">日本語</a>
</p>

<a id="readme-zh"></a>

## 中文

Paperfield 是一套面向具身智能、大模型、多模态研究与开源项目跟踪的本地优先研究工作台。它聚合论文和 GitHub 项目，为每周精选预先寻找合法公开 PDF，并把全文精读、翻译、问答、项目源码导读和阅读历史放进同一个持续使用的界面。

这是唯一的正式项目说明。中英日三种语言都保存在本文件中，不再维护散落的开发笔记、历史路线图、重复语言副本或备份版文档。

### 主要能力

- 汇总 arXiv、OpenAlex、Crossref、PMLR、CVF Open Access、DBLP 等公开来源，覆盖具身智能、机器人、视觉、多模态、大模型与智能体方向。
- 按五项可调整权重筛选每周论文，并优先保留已找到合法公开 PDF 的条目。
- 在阅读器中并排显示 PDF、全文精读、公式、翻译和基于原文的对话历史。
- 每周推荐少量相关 GitHub 项目，整理 README、关键入口、依赖和源码阅读路径。
- 支持本地存储、Cloudflare R2 或其他 S3 兼容对象存储；阅读讲解和问答可同步到共享云端。
- 支持受登录保护的朋友内测共享；普通用户可以配置自己的 OpenAI 兼容 API，彼此的密钥和模型列表互不共享。

### 正式目录

```text
paper-scout/
├─ README.md                         唯一面向使用者和开发者的项目说明
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

`local/`、`data/` 和 `dist/` 是运行期目录，不是公开源码的一部分。它们即使出现在本机根目录，也不会进入 GitHub；不要把它们移动到 `src/` 或提交到仓库。根目录中唯一维护给人阅读的 Markdown 文件是本 README，`.gitignore`、`.gitattributes` 和 `.github/` 只服务于 Git 和自动化。

### 本地使用

#### 首次启动

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

### 私有数据和 AI 配置

应用的数据库、PDF、全文解析、项目缓存、精读、聊天记录、账号和本地密钥默认位于 `local/data/`。旧版已经存在的 `data/` 会继续兼容读取，避免迁移时损失任何内容。

将环境变量样例复制到私有位置后再填写实际值：

```powershell
Copy-Item deploy\.env.example local\.env
```

可在 `local/.env` 中配置 `PAPERFIELD_OPENAI_API_KEY`、`PAPERFIELD_OPENAI_BASE_URL`、`PAPERFIELD_OPENAI_MODEL` 和推理强度。未显式配置时，Paperfield 会尝试读取本机 CC Switch 提供的 OpenAI 兼容设置；因此 CC Switch 切换 API 后，新的精读和问答会使用新的可用模型，已保存的精读和历史不会变化。

普通用户在自己的网页设置中连接 API 时，只会看到自己密钥可访问的模型。内测账号使用服务器侧配置时，才会使用服务器的模型与额度。不要把 `local/.env`、`deploy/.env`、数据库或 PDF 提交到 GitHub。

### 云端与共享

Cloudflare R2 和其他 S3 兼容存储可用于同步 PDF、全文精读和问答历史。相关配置都在 `deploy/.env.example` 中，以 `PAPERFIELD_S3_*`、`PAPERFIELD_CLOUD_PREFIX` 和 `PAPERFIELD_SHARED_STORAGE_MAX_MB` 开头。共享库大小通过 `PAPERFIELD_SHARED_STORAGE_MAX_MB` 控制，应用会展示已用空间和操作统计。

若需要让朋友通过浏览器访问，先建立内测账号，再安装桌面快捷方式：

```powershell
python scripts\manage-beta-users.py add <username> --role beta
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

桌面上的 `Paperfield Share` 会启动本机服务和 ngrok 隧道，并复制访问地址；`Stop Paperfield Share` 会关闭它。共享服务运行期间，源电脑必须保持联网和开机。固定 ngrok 域名可通过 `local/.env` 的 `PAPERFIELD_NGROK_URL` 设置。

### Docker 部署

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

### 开发与验证

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

### 正式发布规则

`v0.12.7` 是唯一保留的正式发布标签，对应 GitHub Release 标题 `Paperfield 首个发布版本`。后续改动先合并到 `main`，通过完整检查后再更新这个唯一的正式发布版本；旧标签、历史 Release、备份文档和临时设计产物不再保留。

[返回语言选择](#language)

<a id="readme-en"></a>

## English

Paperfield is a local-first research workspace for embodied intelligence, large language models, multimodal research, and open-source project tracking. It aggregates papers and GitHub projects, finds lawful public PDFs for weekly selections in advance, and keeps close reading, translation, Q&A, source-code guidance, and reading history in one continuous interface.

This is the sole official project guide. Chinese, English, and Japanese versions live in this single file; scattered development notes, historical roadmaps, duplicate language files, and backup documentation are no longer maintained.

### Core Capabilities

- Aggregates public sources including arXiv, OpenAlex, Crossref, PMLR, CVF Open Access, and DBLP for embodied AI, robotics, vision, multimodal models, LLMs, and agents.
- Ranks weekly papers with five adjustable weights and prioritizes entries with a lawful public PDF already located.
- Shows PDFs, close reading, mathematical formulas, translation, and source-grounded chat side by side in the reader.
- Recommends a small number of related GitHub projects each week and organizes their README, entry points, dependencies, and source-reading path.
- Supports local storage, Cloudflare R2, and other S3-compatible object storage; close readings and Q&A can be synchronized to shared cloud storage.
- Supports login-protected beta sharing. Standard users can configure their own OpenAI-compatible API, and keys and model lists are never shared between users.

### Official Layout

```text
paper-scout/
├─ README.md                         The only guide for users and developers
├─ src/
│  └─ paperfield/                    Application source package
│     ├─ __init__.py                 Python package marker
│     ├─ app.py                      HTTP service, collection, ranking, PDF, AI, storage, and accounts
│     ├─ catalog/                    Public domain catalog and collection policies
│     │  ├─ config.json              Topics, queries, and recommendation policy
│     │  ├─ venues.json              Venue and publication knowledge base
│     │  └─ institutions.json        University and research-institution marker catalog
│     └─ static/                     Browser client
│        ├─ index.html               Main workspace
│        ├─ app.js                   Paper, project, reader, and settings interactions
│        ├─ styles.css               Tsinghua-purple theme and responsive UI
│        ├─ login.html               Beta-login page
│        ├─ login.js                 Login interaction
│        ├─ login.css                Login-page styling
│        └─ vendor/                  Pinned PDF.js and KaTeX frontend assets
├─ deploy/                           Deployment configuration
│  ├─ .env.example                  Environment-variable example without secrets
│  ├─ requirements.txt              Python runtime dependencies
│  ├─ compose.yaml                  Docker Compose service definition
│  └─ docker/
│     ├─ Dockerfile                 Container build file
│     └─ Dockerfile.dockerignore    Docker build-context filter
├─ scripts/                          Windows run, check, refresh, share, and package scripts
│  ├─ run.cmd / run.ps1             Start the local workspace
│  ├─ refresh.cmd / refresh.ps1     Refresh paper and project sources manually
│  ├─ check.cmd / check.ps1         Run unit tests and JavaScript syntax checks
│  ├─ manage-beta-users.py          Create, reset, or disable beta accounts
│  ├─ start-beta-*.ps1              Start the protected ngrok sharing service
│  ├─ stop-beta-share.ps1           Stop the sharing service
│  ├─ install-beta-*.ps1            Create desktop shortcuts or an auto-start task
│  └─ build-release.py              Create a Windows release package without personal data
├─ tests/
│  └─ test_core.py                  Backend behavior regression tests
├─ .github/                         CI, release workflow, and Issue templates
│  ├─ workflows/ci.yml              Python, JavaScript, and Docker checks
│  ├─ workflows/release.yml         Windows packaging after a release tag is pushed
│  └─ ISSUE_TEMPLATE/               Bug-report and feature-request forms
├─ .gitignore                       Excludes personal data, cache, secrets, and build artifacts
├─ .gitattributes                   Git text attributes
├─ local/                           Private local runtime data, never committed
├─ data/                            Legacy compatibility data, never committed
└─ dist/                            Locally generated release archives, never committed
```

`local/`, `data/`, and `dist/` are runtime directories, not public source code. They may appear at the local project root but are never uploaded to GitHub. Do not move them into `src/` or commit them. This README is the only maintained human-facing Markdown file at the root; `.gitignore`, `.gitattributes`, and `.github/` exist only for Git and automation.

### Local Use

#### First Run

```powershell
cd G:\ps\paper-scout
python -m pip install -r deploy\requirements.txt
python src\paperfield\app.py
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The first run initializes the local database and cache. Afterwards, refresh manually in the UI or let the background scheduler update on its configured interval.

Common commands:

```powershell
.\scripts\run.cmd
.\scripts\refresh.cmd
.\scripts\check.cmd
```

### Private Data and AI Configuration

By default, the database, PDFs, parsed full text, project cache, close readings, chat history, accounts, and local secrets live under `local/data/`. An existing legacy `data/` directory remains readable for compatibility, so migration does not discard data.

Copy the environment example to a private location before entering real values:

```powershell
Copy-Item deploy\.env.example local\.env
```

Set `PAPERFIELD_OPENAI_API_KEY`, `PAPERFIELD_OPENAI_BASE_URL`, `PAPERFIELD_OPENAI_MODEL`, and reasoning effort in `local/.env`. When no explicit configuration is present, Paperfield attempts to use the OpenAI-compatible settings provided by local CC Switch. Therefore, a CC Switch API change affects new close readings and chats, but never changes saved readings or history.

When a standard user connects an API in the web settings, they only see models available to their own key. A beta account uses server-side configuration and quota. Never commit `local/.env`, `deploy/.env`, databases, or PDFs to GitHub.

### Cloud and Sharing

Cloudflare R2 and other S3-compatible storage can synchronize PDFs, close readings, and Q&A history. Settings are documented in `deploy/.env.example` under `PAPERFIELD_S3_*`, `PAPERFIELD_CLOUD_PREFIX`, and `PAPERFIELD_SHARED_STORAGE_MAX_MB`. The shared-library size is controlled by `PAPERFIELD_SHARED_STORAGE_MAX_MB`, and the app displays storage usage and operation statistics.

To share through a browser, create a beta account and install desktop shortcuts:

```powershell
python scripts\manage-beta-users.py add <username> --role beta
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

The `Paperfield Share` desktop shortcut starts the local service and an ngrok tunnel, then copies the URL. `Stop Paperfield Share` stops it. The source computer must remain online and powered on while sharing. Set `PAPERFIELD_NGROK_URL` in `local/.env` to use a reserved ngrok domain.

### Docker Deployment

Docker keeps deployment configuration in its own directory while using the repository root as the build context:

```powershell
Copy-Item deploy\.env.example deploy\.env
docker compose --env-file deploy\.env -f deploy\compose.yaml up --build -d
```

To stop the service:

```powershell
docker compose --env-file deploy\.env -f deploy\compose.yaml down
```

The container uses a named volume for data. Back up the `.env` file and the volume to a controlled location in production.

### Development and Verification

```powershell
python -m py_compile src\paperfield\app.py
node --check src\paperfield\static\app.js
node --check src\paperfield\static\login.js
python -m unittest discover -s tests -p test_core.py
python scripts\build-release.py
docker build -f deploy\docker\Dockerfile -t paperfield:test .
docker compose -f deploy\compose.yaml config --quiet
```

`scripts/build-release.py` packages only Git-tracked public files and additionally creates an empty `local/.env.example`. It refuses to put databases, logs, secrets, `local/`, or `data/` in a release package.

### Official Release Policy

`v0.12.7` is the only retained official release tag and its GitHub Release title is `Paperfield 首个发布版本`. Future changes are merged to `main`, fully verified, and then used to update this one official release. Old tags, historical Releases, backup documents, and temporary design artifacts are not retained.

[Back to language selection](#language)

<a id="readme-ja"></a>

## 日本語

Paperfield は、具身知能、大規模言語モデル、マルチモーダル研究、オープンソースプロジェクト追跡のためのローカル優先研究ワークスペースです。論文と GitHub プロジェクトを集約し、週次選定に必要な合法的な公開 PDF を事前に探し、精読、翻訳、質問応答、ソースコード解説、閲覧履歴を一つの継続的な画面にまとめます。

この README は唯一の正式なプロジェクト説明です。中国語、英語、日本語はこの一つのファイルに収録され、分散した開発メモ、過去のロードマップ、重複した言語ファイル、バックアップ文書は今後維持しません。

### 主な機能

- arXiv、OpenAlex、Crossref、PMLR、CVF Open Access、DBLP などの公開ソースを集約し、具身 AI、ロボティクス、視覚、マルチモーダル、大規模言語モデル、エージェントを対象にします。
- 調整可能な五つの重みにより週次論文を順位付けし、合法的な公開 PDF が確認済みの項目を優先します。
- リーダー内で PDF、精読、数式、翻訳、原文に基づく対話履歴を並べて表示します。
- 毎週少数の関連 GitHub プロジェクトを推薦し、README、主要な入口、依存関係、ソースコード読解経路を整理します。
- ローカル保存、Cloudflare R2、その他の S3 互換オブジェクトストレージに対応し、精読と質問応答を共有クラウドへ同期できます。
- ログイン保護された内測共有に対応します。一般ユーザーは自分の OpenAI 互換 API を設定でき、キーとモデル一覧はユーザー間で共有されません。

### 正式なディレクトリ構成

```text
paper-scout/
├─ README.md                         利用者と開発者向けの唯一の説明書
├─ src/
│  └─ paperfield/                    アプリケーションのソースパッケージ
│     ├─ __init__.py                 Python パッケージマーカー
│     ├─ app.py                      HTTP、収集、推薦、PDF、AI、保存、アカウントの処理
│     ├─ catalog/                    公開可能な分野カタログと収集方針
│     │  ├─ config.json              トピック、クエリ、推薦方針
│     │  ├─ venues.json              会議・ジャーナルと出版ソースの知識ベース
│     │  └─ institutions.json        大学・研究機関マーカーのカタログ
│     └─ static/                     ブラウザクライアント
│        ├─ index.html               メインワークスペース
│        ├─ app.js                   論文、プロジェクト、リーダー、設定の操作
│        ├─ styles.css               清華紫テーマとレスポンシブ UI
│        ├─ login.html               内測ログイン画面
│        ├─ login.js                 ログイン操作
│        ├─ login.css                ログイン画面のスタイル
│        └─ vendor/                  固定版 PDF.js と KaTeX のフロントエンド資産
├─ deploy/                           デプロイ設定
│  ├─ .env.example                  秘密情報を含まない環境変数例
│  ├─ requirements.txt              Python 実行時依存関係
│  ├─ compose.yaml                  Docker Compose サービス定義
│  └─ docker/
│     ├─ Dockerfile                 コンテナビルドファイル
│     └─ Dockerfile.dockerignore    Docker ビルドコンテキストの除外規則
├─ scripts/                          Windows 実行、検査、更新、共有、パッケージ化スクリプト
│  ├─ run.cmd / run.ps1             ローカルワークスペースを起動
│  ├─ refresh.cmd / refresh.ps1     論文とプロジェクトのソースを手動更新
│  ├─ check.cmd / check.ps1         単体テストと JavaScript 構文検査を実行
│  ├─ manage-beta-users.py          内測アカウントの作成、再設定、無効化
│  ├─ start-beta-*.ps1              保護された ngrok 共有サービスを開始
│  ├─ stop-beta-share.ps1           共有サービスを停止
│  ├─ install-beta-*.ps1            デスクトップショートカットまたは自動起動を作成
│  └─ build-release.py              個人データを含まない Windows リリースパッケージを作成
├─ tests/
│  └─ test_core.py                  バックエンド動作の回帰テスト
├─ .github/                         CI、正式リリースワークフロー、Issue テンプレート
│  ├─ workflows/ci.yml              Python、JavaScript、Docker の検査
│  ├─ workflows/release.yml         リリースタグ後の Windows パッケージ化
│  └─ ISSUE_TEMPLATE/               バグ報告と機能要望のフォーム
├─ .gitignore                       個人データ、キャッシュ、秘密情報、ビルド成果物を除外
├─ .gitattributes                   Git テキスト属性
├─ local/                           Git に入らないローカルの私有実行データ
├─ data/                            Git に入らない旧版互換データ
└─ dist/                            Git に入らないローカル生成リリースアーカイブ
```

`local/`、`data/`、`dist/` は実行時ディレクトリであり、公開ソースコードではありません。ローカルのプロジェクトルートに表示されても GitHub には送られません。これらを `src/` に移動したり、Git にコミットしたりしないでください。人が読むために維持されるルートの Markdown はこの README だけであり、`.gitignore`、`.gitattributes`、`.github/` は Git と自動化のためだけにあります。

### ローカル利用

#### 初回起動

```powershell
cd G:\ps\paper-scout
python -m pip install -r deploy\requirements.txt
python src\paperfield\app.py
```

[http://127.0.0.1:8765](http://127.0.0.1:8765) を開いてください。初回起動ではローカルデータベースとキャッシュを初期化します。その後は UI から手動で更新するか、設定した周期でバックグラウンド更新を利用できます。

よく使うコマンド：

```powershell
.\scripts\run.cmd
.\scripts\refresh.cmd
.\scripts\check.cmd
```

### 個人データと AI 設定

データベース、PDF、解析済み全文、プロジェクトキャッシュ、精読、対話履歴、アカウント、ローカル秘密情報は、既定では `local/data/` に保存されます。既存の旧版 `data/` は互換性のため読み取り可能なままであり、移行時にデータを失いません。

実際の値を入力する前に、環境変数の例を私有の場所へコピーします。

```powershell
Copy-Item deploy\.env.example local\.env
```

`local/.env` で `PAPERFIELD_OPENAI_API_KEY`、`PAPERFIELD_OPENAI_BASE_URL`、`PAPERFIELD_OPENAI_MODEL`、推論強度を設定できます。明示的な設定がない場合、Paperfield はローカル CC Switch が提供する OpenAI 互換設定を利用しようとします。そのため CC Switch の API を変更すると、新規の精読と対話には影響しますが、保存済みの精読と履歴は変わりません。

一般ユーザーが Web 設定で API を接続した場合、そのユーザー自身のキーで利用可能なモデルだけが表示されます。内測アカウントはサーバー側の設定と利用枠を使用します。`local/.env`、`deploy/.env`、データベース、PDF を GitHub にコミットしないでください。

### クラウドと共有

Cloudflare R2 とその他の S3 互換ストレージは、PDF、精読、質問応答履歴の同期に使用できます。設定は `deploy/.env.example` の `PAPERFIELD_S3_*`、`PAPERFIELD_CLOUD_PREFIX`、`PAPERFIELD_SHARED_STORAGE_MAX_MB` に記載されています。共有ライブラリの容量は `PAPERFIELD_SHARED_STORAGE_MAX_MB` で管理され、アプリは使用量と操作統計を表示します。

ブラウザで友人と共有するには、内測アカウントを作成し、デスクトップショートカットを導入します。

```powershell
python scripts\manage-beta-users.py add <username> --role beta
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

デスクトップの `Paperfield Share` はローカルサービスと ngrok トンネルを開始し、URL をコピーします。`Stop Paperfield Share` は共有を停止します。共有中は元のコンピューターをオンラインかつ起動した状態に保つ必要があります。予約済みの ngrok ドメインを使う場合は `local/.env` に `PAPERFIELD_NGROK_URL` を設定してください。

### Docker デプロイ

Docker は専用のデプロイディレクトリを使用しますが、ビルドコンテキストはリポジトリルートです。

```powershell
Copy-Item deploy\.env.example deploy\.env
docker compose --env-file deploy\.env -f deploy\compose.yaml up --build -d
```

サービスの停止：

```powershell
docker compose --env-file deploy\.env -f deploy\compose.yaml down
```

コンテナはデータ用の名前付きボリュームを使用します。本番では `.env` とボリュームを管理された場所へバックアップしてください。

### 開発と検証

```powershell
python -m py_compile src\paperfield\app.py
node --check src\paperfield\static\app.js
node --check src\paperfield\static\login.js
python -m unittest discover -s tests -p test_core.py
python scripts\build-release.py
docker build -f deploy\docker\Dockerfile -t paperfield:test .
docker compose -f deploy\compose.yaml config --quiet
```

`scripts/build-release.py` は Git で追跡されている公開ファイルだけをパッケージし、空の `local/.env.example` を追加します。データベース、ログ、秘密情報、`local/`、`data/` をリリースパッケージへ入れることは拒否します。

### 正式リリース方針

`v0.12.7` は唯一保持する正式リリースタグであり、GitHub Release のタイトルは `Paperfield 首个发布版本` です。今後の変更は `main` へ統合し、完全な検証後にこの一つの正式リリースを更新します。古いタグ、過去の Release、バックアップ文書、一時的なデザイン成果物は保持しません。

[言語選択へ戻る](#language)
