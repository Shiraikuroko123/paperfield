# 用 Paperfield 学习 Git 与 GitHub

## 1. 建立身份

第一次提交前，在 GitHub 设置中确认公开邮箱或 noreply 邮箱，然后配置：

```powershell
git config --global user.name "你的 GitHub 用户名"
git config --global user.email "你的 GitHub 邮箱"
```

检查配置：

```powershell
git config --global --list
```

## 2. 最常用的本地循环

```powershell
git status
git diff
git add app.py static/app.js
git commit -m "feat: add project filtering"
```

- `status`：查看哪些文件发生变化。
- `diff`：提交前阅读修改内容。
- `add`：选择本次提交包含的文件。
- `commit`：为一组完整修改创建历史记录。

不要习惯性使用 `git add .`。学习阶段应明确知道每个文件为什么进入提交。

## 3. 分支开发

```powershell
git switch -c feature/user-login
# 修改和测试
git add <files>
git commit -m "feat: add login foundation"
git switch main
```

分支名建议：

- `feature/...`：新功能。
- `fix/...`：缺陷修复。
- `docs/...`：文档。
- `refactor/...`：不改变行为的结构调整。

## 4. 连接 GitHub

在 GitHub 网站新建一个空仓库，例如 `paperfield`，不要勾选自动创建 README。

```powershell
git remote add origin https://github.com/<username>/paperfield.git
git push -u origin main
```

以后推送当前分支：

```powershell
git push
```

## 5. Pull Request

```powershell
git switch -c feature/example
# 修改、测试、提交
git push -u origin feature/example
```

然后在 GitHub 创建 Pull Request，写清楚：

- 改了什么。
- 为什么要改。
- 如何验证。
- 是否改变数据库或配置。

## 6. 同步和冲突

```powershell
git switch main
git pull --ff-only
git switch feature/example
git rebase main
```

出现冲突时，先打开冲突文件，理解 `<<<<<<<`、`=======`、`>>>>>>>` 三部分，再保留正确内容：

```powershell
git add <resolved-file>
git rebase --continue
```

## 7. Paperfield 练习顺序

1. 修改 README 中的一句话并提交。
2. 创建文档分支，补充一条 GitHub 使用笔记。
3. 创建 Issue 描述一个小功能。
4. 用分支实现功能并创建 Pull Request。
5. 查看 GitHub Actions 是否通过。
6. 学习回退单个提交：`git revert <commit>`。

不要提交 `data/`、`.env`、API Key 或 CC Switch 的 `auth.json`。
