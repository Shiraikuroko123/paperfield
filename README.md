# Paperfield

[中文](README.md) | [English](docs/i18n/README.en.md) | [日本語](docs/i18n/README.ja.md)

Paperfield 是面向具身智能、大语言模型和开源项目追踪的桌面研究工作台。它维护完整候选池，每周筛选少量值得精读的论文，寻找合法公开 PDF，并把论文、代码、讲解与问答历史放在一个连续工作流中。

## 核心能力

- 每周按研究方向推荐论文，每个方向最多 5 篇，并展示可解释评分。
- 聚合顶会、顶刊、预印本与公开学术元数据，区分正式发表和未确认预印本。
- 在阅读器左侧显示 PDF，右侧提供全文精读、分页翻译和基于原文的问答。
- 每周推荐不超过 4 个 GitHub 项目，并关联对应论文、README 与源码阅读路径；同一自然周保持稳定。
- 支持本地、Cloudflare R2 或混合 PDF 存储，以及讲解和聊天历史备份。
- 支持最多 4 个内测账号的登录保护共享模式。

## Markdown 三语说明

Paperfield 自己的主 README 保存了三份静态版本：

- 中文：[README.md](README.md)
- English：[docs/i18n/README.en.md](docs/i18n/README.en.md)
- 日本語：[docs/i18n/README.ja.md](docs/i18n/README.ja.md)

在 Paperfield 的 GitHub 项目阅读器中，所有 `.md` 文件都会标记 `中/英/日`。英文视图显示仓库原文，中文和日文在第一次点击时通过免费翻译端点按需生成，不使用 GPT Token，并缓存到本地；配置 R2 后也会备份到云端。

其他维护文档没有伪装成三份人工翻译。它们的语言状态和位置统一列在 [文档地图](docs/README.md) 中。

## 本地运行

```powershell
cd G:\ps\paper-scout
python app.py
```

打开 [http://127.0.0.1:8765](http://127.0.0.1:8765)。首次运行会加载离线种子数据，之后应用每 24 小时自动检查更新，也可以点击页面中的更新按钮。

常用脚本：

```powershell
.\scripts\run.cmd
.\scripts\check.cmd
.\scripts\refresh.cmd
```

数据库、PDF、项目缓存、讲解、聊天与密钥统一保存在不会上传 GitHub 的 `local/` 目录。公开源码与本机文件的完整边界见 [公开源码与本机文件](docs/PUBLIC_AND_LOCAL.md)。朋友优先从 GitHub **Releases** 下载干净版本，不需要下载你的本机数据。

## AI 与翻译

Paperfield 会读取本机 CC Switch/Codex 的 OpenAI 兼容配置，也可以使用 `PAPERFIELD_OPENAI_API_KEY`、`PAPERFIELD_OPENAI_BASE_URL` 和 `PAPERFIELD_OPENAI_MODEL` 显式覆盖。没有 GPT Key 时仍可阅读 PDF、使用免费翻译并生成标注为摘要导读的基础说明。

论文和项目 Markdown 翻译依次尝试浏览器翻译能力、配置的 LibreTranslate 端点和无需 Key 的 Google Translate 端点。免费端点可能限流，因此结果会在本地和可选 R2 中缓存。

## 分享给朋友

按照 [内测分享说明](docs/BETA_SHARING.md) 配置 ngrok 和账号。Windows 用户可以安装桌面快捷方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-beta-shortcuts.ps1
```

之后双击桌面的 **Paperfield Share** 后台启动，双击 **Stop Paperfield Share** 停止。朋友只需要浏览器，不需要安装 Tailscale 或 ngrok。

## 数据来源与合规

Paperfield 从 PMLR、CVF Open Access、arXiv、OpenAlex、Crossref、DBLP 等公开来源收集元数据，并专门覆盖 ACM MM、IEEE T-RO 等平台。它不会绕过付费墙或机构登录；找不到合法公开 PDF 时只保留来源页。

详细覆盖范围见 [来源覆盖审计](docs/COVERAGE_AUDIT.md)，云端存储见 [Cloudflare R2 配置](docs/CLOUD_STORAGE.md)。

## 开发

- [文档地图](docs/README.md)
- [架构](docs/ARCHITECTURE.md)
- [部署](docs/DEPLOYMENT.md)
- [公开源码与本机文件](docs/PUBLIC_AND_LOCAL.md)
- [路线图](docs/ROADMAP.md)
- [变更记录](docs/CHANGELOG.md)
- [贡献指南](.github/CONTRIBUTING.md)
- [安全策略](.github/SECURITY.md)

运行检查：

```powershell
python -m unittest discover -s tests -v
node --check static\app.js
docker compose config --quiet
```
