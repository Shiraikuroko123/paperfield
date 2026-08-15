# Design System

## Direction

统一站点采用实验室手册式信息架构。黑色页眉和中性阅读表面建立共同身份；LLM 使用氧化红作为路线色，具身智能使用洋红作为路线色，青绿色只表示证据、完成状态和跨课程连接。

## Typography

- 中文正文使用本地可用的 `Noto Sans SC`、`Source Han Sans SC`、`Microsoft YaHei` 与系统无衬线回退。
- 正文不小于 1rem，行高适合长时间阅读，内容宽度控制在约 78 个字符。
- 标题使用同一字族的高字重形成层级，不加载远程字体，避免布局偏移。
- 代码使用 JetBrains Mono、Cascadia Code、SFMono 与 Consolas 回退。

## Layout

- 桌面端使用 Material 的左侧课程导航、正文和右侧页内目录。
- 顶部标签是两门课程的全局切换器。
- 学习中心使用两条不嵌套的课程轨道，而不是营销卡片网格。
- 窄屏改为单列，按钮和进度控件保持至少 44px 触摸高度。

## Components

- `hub-hero`：统一站点名称、定位和两个直接入口。
- `course-lane`：课程摘要、模块数据、进度和真实路线图。
- `lesson-meta`：章节编号、完成标准和本地进度按钮。
- `course-progress`：按课程命名空间保存的完成进度。

## Motion

仅使用颜色、边框和 1px 按压反馈；不使用入场动画。`prefers-reduced-motion` 下关闭平滑滚动与过渡。

