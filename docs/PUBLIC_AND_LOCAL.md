# 公开源码与本机文件

[English](i18n/PUBLIC_AND_LOCAL.en.md) | [日本語](i18n/PUBLIC_AND_LOCAL.ja.md)

Paperfield 将可以发布到 GitHub 的程序和只属于当前电脑的数据明确分开。

## GitHub 公开内容

- `app.py`、`static/`：应用程序与页面。
- `config.json`、`venues.json`、`institutions.json`：不含密钥的公共目录配置。
- `scripts/`：启动、检查、内测分享和 Release 打包工具。
- `docs/`、`README.md`：使用与开发文档。
- `Dockerfile`、`compose.yaml`、`.github/`：部署和自动化配置。

## 仅本机内容

所有新安装默认把私有内容写入被 Git 忽略的 `local/`：

```text
local/
  .env                 API、翻译和对象存储凭据
  data/                数据库、PDF、全文、项目源码缓存、讲解和聊天
    profiles/beta/     内测账号与共享实例数据
  logs/                本机运行日志
```

旧版本的根目录 `.env` 和 `data/` 仍然兼容，但建议迁移到 `local/`。不要把 `local/`、`data/`、`.env`、数据库、PDF 或日志强制加入 Git。

## Releases 与 Packages

推送与 `APP_VERSION` 一致的标签（例如 `v0.10.4`）后，GitHub Actions 会运行测试并生成干净的 Windows Release 压缩包。压缩包包含公开程序和 `local/.env.example`，不包含任何个人数据。

GitHub Packages 适合以后发布 Docker 镜像。它不是论文、PDF、聊天记录或用户数据的存储位置。
