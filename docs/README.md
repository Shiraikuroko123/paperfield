# Paperfield 文档地图

[返回项目首页](../README.md)

## 哪些 Markdown 有三语版本

| 范围 | 中文 | English | 日本語 | 方式 |
| --- | --- | --- | --- | --- |
| Paperfield 主 README | [README.md](../README.md) | [README.en.md](i18n/README.en.md) | [README.ja.md](i18n/README.ja.md) | 仓库内维护三份静态文件 |
| GitHub 项目阅读器中的 `.md` | 按需生成 | 显示仓库原文 | 按需生成 | 页面标记 `中/英/日`，免费翻译，不使用 GPT Token |
| 下面的维护文档 | 以原文为准 | 以原文为准 | 以原文为准 | 尚未维护三份静态翻译 |

项目阅读器只在你点击中文或日文时生成翻译。翻译会保留标题、列表、链接和代码块，并缓存到本地；配置 Cloudflare R2 后也会备份。源码树中的每个 Markdown 文件都会显示 `中/英/日` 标记，因此不再需要猜测哪些文件可翻译。

## 使用与存储

- [内测分享与账号](BETA_SHARING.md)
- [Cloudflare R2 与费用](CLOUD_STORAGE.md)
- [GitHub 学习指南](GITHUB_GUIDE.md)
- [论文来源覆盖审计](COVERAGE_AUDIT.md)

## 开发与部署

- [系统架构](ARCHITECTURE.md)
- [本地、Docker 与云端部署](DEPLOYMENT.md)
- [后续路线](ROADMAP.md)
- [同类论文阅读项目调研](READER_RESEARCH.md)
- [产品定义](development/PRODUCT.md)
- [设计系统](development/DESIGN.md)
- [版本变更](CHANGELOG.md)

## GitHub 社区文件

- [贡献指南](../.github/CONTRIBUTING.md)
- [安全策略](../.github/SECURITY.md)
