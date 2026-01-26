# 对话期间的改动汇总

## 总览
- 合并前弹窗确认并编辑 merge commit message，支持一键生成提交信息。
- 任务完成合并时，先用 DeepSeek 生成并改写任务分支最后一次提交信息，再按弹窗内容生成合并提交。
- 后端新增 DeepSeek 生成接口与错误处理，支持从 `.env` 读取密钥。

## 前端改动
- 新增 `frontend/src/components/dialogs/tasks/MergeCommitDialog.tsx`
  - 新增合并提交信息弹窗，支持编辑与“生成提交信息”按钮。
  - 生成提示词改为中文并要求 Conventional Commits 格式。
- 修改 `frontend/src/components/tasks/Toolbar/GitOperations.tsx`
  - 合并按钮先弹窗确认，再传入 `commitMessage` 执行合并。
  - 使用 `useDiffStream` 为生成提示提供 diff 上下文。
- 修改 `frontend/src/hooks/useMerge.ts`
  - `MergeParams` 新增 `commitMessage`，合并请求携带 `commit_message`。
- 修改 `frontend/src/lib/api.ts`
  - 新增 `generateMergeCommitMessage` API，调用 `/api/task-attempts/:id/merge/commit-message`。
- i18n 文案新增
  - `frontend/src/i18n/locales/en/tasks.json`
  - `frontend/src/i18n/locales/zh-Hans/tasks.json`
  - `frontend/src/i18n/locales/zh-Hant/tasks.json`
  - `frontend/src/i18n/locales/es/tasks.json`
  - `frontend/src/i18n/locales/fr/tasks.json`
  - `frontend/src/i18n/locales/ja/tasks.json`
  - `frontend/src/i18n/locales/ko/tasks.json`

## 后端改动
- 修改 `crates/server/src/routes/task_attempts.rs`
  - 新增合并提交生成接口 `/merge/commit-message`。
  - 新增 DeepSeek 调用封装 `deepseek_generate_commit_message`。
  - 新增 diff 汇总与上下文拼装方法：
    - `summarize_diffs`
    - `build_diff_context`
    - `build_branch_commit_prompt`
    - `truncate_text`
  - 合并流程改为：生成分支 commit message → `amend` 分支最后提交 → 执行 merge（合并提交使用弹窗内容）。
- 修改 `crates/services/src/services/git/cli.rs`
  - 新增 `amend_commit_message`（`git commit --amend -m`）。
- 修改 `crates/services/src/services/git.rs`
  - 新增 `GitService::amend_commit_message`，并对 staged 变更做保护。
- 修改 `crates/server/src/error.rs`
  - 新增 `ApiError::Http` 以处理 `reqwest` 错误。
- 修改 `crates/server/src/main.rs`
  - 启动时加载 `.env`（`dotenv::dotenv()`）。
- 修改 `crates/server/Cargo.toml`
  - 新增运行时依赖 `dotenv`。

## 文档/本地配置
- 新增 `docs/dev-build-guide.md`（本地 dev/build 与数据库位置说明）。
- 新增 `.env`（本地配置 `DEEPSEEK_API_KEY`，密钥值请保持本地，不要提交）。

## 方法/行为变化摘要
- 合并提交：由弹窗内容决定，用户可编辑。
- 分支提交：合并前自动用 DeepSeek 生成并 `amend` 最后一条提交信息。

## 运行/检查
- `pnpm -C frontend run build`
- `cargo check -p server`
