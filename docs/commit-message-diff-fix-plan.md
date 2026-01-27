# Commit Message Diff 基准修复方案

## 问题描述

当前系统在生成 commit message 时，无论是分支上的任务提交还是合并到目标分支的提交，都错误地使用了**从分支创建以来的所有累积 diff**，而不是**这次修改的增量 diff**。

### 问题场景举例

假设一个任务分支经历了以下操作：

1. 对话 1 → 提交 A（修改了文件 X）
2. 合并 1 → 将 A 合并到 main
3. 对话 2 → 提交 B（修改了文件 Y）
4. 对话 3 → 提交 C（修改了文件 Z）
5. 合并 2 → 将 B+C 合并到 main

**当前错误行为：**

| 操作 | 当前使用的 diff | 期望使用的 diff |
|------|----------------|----------------|
| 提交 A 的 commit message | 文件 X 的 diff | 文件 X 的 diff ✓ |
| 合并 1 的 commit message | 文件 X 的 diff | 文件 X 的 diff ✓ |
| 提交 B 的 commit message | 文件 X+Y 的 diff ✗ | 文件 Y 的 diff |
| 提交 C 的 commit message | 文件 X+Y+Z 的 diff ✗ | 文件 Z 的 diff |
| 合并 2 的 commit message | 文件 X+Y+Z 的 diff ✗ | 文件 Y+Z 的 diff |

## 问题根源分析

### 场景 1：分支上的任务提交（每次对话完成后自动提交）

**代码位置**：`crates/local-deployment/src/container.rs` 第 326-344 行

```rust
// Get base commit (merge base between workspace branch and target branch)
let base_commit = match self.git.get_base_commit(
    &repo.path,
    &ctx.workspace.branch,
    repo_target_branch,
) {
    Ok(commit) => commit,
    Err(e) => {
        tracing::debug!("Failed to get base commit for repo {}: {}", repo.name, e);
        continue;
    }
};

// Get worktree diffs (all changes since base commit)
match self.git.get_diffs(
    DiffTarget::Worktree {
        worktree_path: &repo_path,
        base_commit: &base_commit,  // <-- 问题：使用合并基点
    },
    None,
) {
```

**问题**：使用 `get_base_commit()` 获取分支与目标分支的合并基点作为 diff 基准，这会获取从分支创建以来的所有累积修改。

**正确行为**：应该使用 `before_head_commit`（这次执行开始前的 HEAD）作为基准，只获取这次对话的修改。

### 场景 2：合并到目标分支时的提交

**代码位置**：
- 前端：`frontend/src/components/dialogs/tasks/MergeCommitDialog.tsx`
- 前端：`frontend/src/components/tasks/Toolbar/GitOperations.tsx` 第 180-215 行
- 后端：`crates/local-deployment/src/container.rs` 第 1356-1429 行 (`stream_diff` 方法)

**问题**：`useDiffStream` hook 获取的 diffs 是从合并基点到当前工作目录的所有差异。如果之前已经合并过，这次合并的 commit message 应该只包含上次合并之后的修改。

**正确行为**：应该使用上次合并的 commit SHA 作为基准。

## 现有数据支持

系统已经有足够的数据来支持正确的实现：

### 1. ExecutionProcessRepoState 表

```rust
pub struct ExecutionProcessRepoState {
    pub id: Uuid,
    pub execution_process_id: Uuid,
    pub repo_id: Uuid,
    pub before_head_commit: Option<String>,  // <-- 可用于场景 1
    pub after_head_commit: Option<String>,
    pub merge_commit: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

`before_head_commit` 记录了每次执行开始前的 HEAD，可用于场景 1 的增量 diff 计算。

### 2. Merge 表

```rust
pub struct DirectMerge {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub merge_commit: String,  // <-- 可用于场景 2
    pub target_branch_name: String,
    pub created_at: DateTime<Utc>,
}
```

`merge_commit` 记录了每次合并的 commit SHA，可用于场景 2 的增量 diff 计算。

## 修复方案

### 场景 1 修复：分支任务提交

**修改文件**：`crates/local-deployment/src/container.rs`

**修改方法**：`try_generate_commit_message_with_deepseek`

**修改逻辑**：

```rust
// 1. 首先尝试获取 before_head_commit 作为基准
let repo_states = ExecutionProcessRepoState::find_by_execution_process_id(
    &self.db.pool,
    ctx.execution_process.id,
).await.ok();

let before_head = repo_states
    .as_ref()
    .and_then(|states| states.iter().find(|s| s.repo_id == repo.id))
    .and_then(|s| s.before_head_commit.clone());

// 2. 如果有 before_head_commit，使用它作为基准
// 3. 否则回退到合并基点（兼容首次提交的情况）
let base_commit = if let Some(before_head) = before_head {
    Commit::new(before_head)
} else {
    self.git.get_base_commit(&repo.path, &ctx.workspace.branch, repo_target_branch)?
};
```

### 场景 2 修复：合并提交

**方案 A：后端提供增量 diff API**

1. 新增 API 端点：`GET /api/task-attempts/{attemptId}/incremental-diff`
2. 查询该 workspace + repo 的最近一次成功合并记录
3. 使用上次合并的 commit SHA 作为 diff 基准
4. 如果没有历史合并记录，回退到合并基点

**方案 B：修改现有 diff 流逻辑**

1. 修改 `stream_diff` 方法，增加参数支持指定 diff 基准
2. 前端在打开 MergeCommitDialog 时，先查询上次合并记录
3. 将上次合并的 commit SHA 传递给 diff 流

**推荐方案 A**，因为：
- 不影响现有的实时 diff 流功能（用于显示分支的完整变更）
- 更清晰的职责分离
- 更容易测试和维护

### 新增 API 设计

```rust
// 请求
GET /api/task-attempts/{attemptId}/incremental-diff?repo_id={repoId}

// 响应
{
    "diffs": [...],
    "base_commit": "abc123",  // 用于生成 diff 的基准 commit
    "base_type": "last_merge" | "merge_base"  // 基准类型
}
```

### 新增数据库查询

在 `Merge` 模型中添加方法：

```rust
/// 获取 workspace + repo 的最近一次成功合并记录
pub async fn find_latest_by_workspace_and_repo(
    pool: &SqlitePool,
    workspace_id: Uuid,
    repo_id: Uuid,
) -> Result<Option<Self>, sqlx::Error> {
    // 查询最近一次 merge_commit 不为空的记录
    // 按 created_at DESC 排序，取第一条
}
```

## 实现步骤

### 第一阶段：修复场景 1（分支任务提交）

1. [ ] 修改 `try_generate_commit_message_with_deepseek` 方法
2. [ ] 添加单元测试
3. [ ] 手动测试验证

### 第二阶段：修复场景 2（合并提交）

1. [ ] 在 `Merge` 模型中添加 `find_latest_by_workspace_and_repo` 方法
2. [ ] 新增 `/api/task-attempts/{attemptId}/incremental-diff` API 端点
3. [ ] 修改前端 `MergeCommitDialog` 使用新 API
4. [ ] 添加测试
5. [ ] 手动测试验证

## 关键文件清单

| 功能 | 文件路径 |
|------|--------|
| 分支提交 commit message 生成 | `crates/local-deployment/src/container.rs` |
| ExecutionProcessRepoState 模型 | `crates/db/src/models/execution_process_repo_state.rs` |
| Merge 模型 | `crates/db/src/models/merge.rs` |
| 前端合并对话框 | `frontend/src/components/dialogs/tasks/MergeCommitDialog.tsx` |
| 前端合并按钮处理 | `frontend/src/components/tasks/Toolbar/GitOperations.tsx` |
| Diff 流 Hook | `frontend/src/hooks/useDiffStream.ts` |
| 后端 Diff 流端点 | `crates/server/src/routes/task_attempts.rs` |
| Diff 流实现 | `crates/services/src/services/diff_stream.rs` |
| Git 服务 | `crates/services/src/services/git.rs` |
| Commit Message 生成服务 | `crates/services/src/services/commit_message.rs` |

## 风险评估

### 低风险
- 场景 1 的修复是纯后端修改，不影响前端
- 有 `before_head_commit` 数据支持，不需要数据库迁移

### 中等风险
- 场景 2 需要新增 API，前后端都需要修改
- 需要确保向后兼容（没有历史合并记录时的回退逻辑）

### 需要注意
- 确保 `before_head_commit` 在执行开始时正确记录
- 确保合并记录在合并成功后正确保存
