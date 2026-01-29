# Commit History Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a commit history button to the task attempt page that shows worktree-specific commits with file diffs in a split-panel dialog.

**Architecture:** Add a history icon button next to the preview/diffs toggle buttons. Clicking opens a dialog with left panel (commit list) and right panel (file diffs). Backend provides API to get worktree-only commits and commit diffs using git2 library.

**Tech Stack:** React, TypeScript, lucide-react icons, Rust (axum, git2), shadcn/ui components

---

## Task 1: Add Backend API for Worktree Commits

**Files:**
- Modify: `crates/services/src/services/git.rs`
- Modify: `crates/server/src/routes/task_attempts.rs`
- Reference: `shared/types.ts` (will be auto-generated)

**Step 1: Add commit info struct in git.rs**

在 `crates/services/src/services/git.rs` 文件中，找到现有的结构体定义区域（约第 60-80 行），添加新结构体：

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    #[ts(type = "Date")]
    pub timestamp: DateTime<Utc>,
}
```

**Step 2: Implement get_worktree_commits method**

在 `crates/services/src/services/git.rs` 的 `impl GitService` 块中添加方法（约在第 1200 行附近，在其他 commit 相关方法之后）：

```rust
/// Get commits that are unique to the worktree branch (not in base branch)
/// Returns commits in reverse chronological order (newest first)
pub fn get_worktree_commits(
    &self,
    repo_path: &Path,
    worktree_branch: &str,
    base_branch: &str,
) -> Result<Vec<CommitInfo>, GitServiceError> {
    let repo = Repository::open(repo_path)?;

    // Get the merge base between worktree branch and base branch
    let base_commit = self.get_base_commit(repo_path, worktree_branch, base_branch)?;

    // Get HEAD of worktree branch
    let worktree_ref = repo.find_reference(&format!("refs/heads/{}", worktree_branch))?;
    let worktree_commit_oid = worktree_ref.peel_to_commit()?.id();

    // Collect commits from HEAD back to (but not including) base commit
    let mut revwalk = repo.revwalk()?;
    revwalk.push(worktree_commit_oid)?;
    revwalk.hide(base_commit.as_oid())?;
    revwalk.set_sorting(Sort::TIME)?;

    let mut commits = Vec::new();
    for oid in revwalk {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;

        commits.push(CommitInfo {
            hash: oid.to_string(),
            short_hash: format!("{:.7}", oid),
            message: commit.message().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: DateTime::from_timestamp(commit.time().seconds(), 0)
                .unwrap_or_else(|| Utc::now()),
        });
    }

    Ok(commits)
}
```

**Step 3: Add API endpoint in task_attempts.rs**

在 `crates/server/src/routes/task_attempts.rs` 中找到路由注册函数（通常是 `pub fn routes()` 或类似的），添加新路由：

```rust
// 在路由定义区域添加
.route(
    "/task-attempts/:attemptId/worktree-commits",
    get(get_worktree_commits_handler),
)
```

然后在文件末尾添加处理函数：

```rust
use services::git::CommitInfo;

async fn get_worktree_commits_handler(
    State(state): State<AppState>,
    Path(attempt_id): Path<Uuid>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<CommitInfo>>, ApiError> {
    let repo_id = params
        .get("repo_id")
        .ok_or_else(|| ApiError::BadRequest("Missing repo_id parameter".to_string()))?
        .parse::<Uuid>()
        .map_err(|_| ApiError::BadRequest("Invalid repo_id".to_string()))?;

    // Get workspace and repo info
    let workspace = db::Workspace::find_by_id(&state.db.pool, attempt_id)
        .await?
        .ok_or_else(|| ApiError::NotFound)?;

    let task = db::Task::find_by_id(&state.db.pool, workspace.task_id)
        .await?
        .ok_or_else(|| ApiError::NotFound)?;

    let repo = db::Repo::find_by_id(&state.db.pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound)?;

    let project_repo = db::ProjectRepo::find_by_project_and_repo(&state.db.pool, task.project_id, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound)?;

    // Get repo path
    let repo_path = state.local_deployment
        .worktree_manager
        .get_repo_path(&workspace.id, &repo.name)
        .ok_or_else(|| ApiError::NotFound)?;

    // Get worktree commits
    let commits = state.local_deployment.git.get_worktree_commits(
        &repo_path,
        &workspace.branch,
        &project_repo.target_branch,
    )?;

    Ok(Json(commits))
}
```

**Step 4: Verify imports**

确保在 `crates/server/src/routes/task_attempts.rs` 顶部有所需的导入：

```rust
use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json,
};
use std::collections::HashMap;
use uuid::Uuid;
```

**Step 5: Generate TypeScript types**

运行类型生成命令：

```bash
pnpm run generate-types
```

预期输出：应该看到 `CommitInfo` 类型被添加到 `shared/types.ts`

**Step 6: Test backend endpoint**

启动后端：

```bash
pnpm run backend:dev:watch
```

使用 curl 测试（需要替换实际的 attemptId 和 repoId）：

```bash
curl "http://localhost:3000/api/task-attempts/<attempt-id>/worktree-commits?repo_id=<repo-id>"
```

预期输出：JSON 数组包含 CommitInfo 对象

**Step 7: Commit backend changes**

```bash
git add crates/services/src/services/git.rs
git add crates/server/src/routes/task_attempts.rs
git add shared/types.ts
git commit -m "feat(api): add worktree commits endpoint"
```

---

## Task 2: Add Commit Diff API Endpoint

**Files:**
- Modify: `crates/services/src/services/git.rs`
- Modify: `crates/server/src/routes/task_attempts.rs`

**Step 1: Add get_commit_diff method in git.rs**

在 `crates/services/src/services/git.rs` 的 `impl GitService` 中添加方法：

```rust
/// Get the diff for a specific commit (compared to its parent)
pub fn get_commit_diff(
    &self,
    repo_path: &Path,
    commit_hash: &str,
) -> Result<Vec<Diff>, GitServiceError> {
    let repo = Repository::open(repo_path)?;
    let commit_oid = git2::Oid::from_str(commit_hash)
        .map_err(|e| GitServiceError::InvalidRepository(format!("Invalid commit hash: {}", e)))?;
    let commit = repo.find_commit(commit_oid)?;

    // Get parent commit (use empty tree if no parent)
    let parent_tree = if commit.parent_count() > 0 {
        commit.parent(0)?.tree()?
    } else {
        // First commit - compare with empty tree
        let empty_tree_id = git2::Oid::zero();
        repo.find_tree(empty_tree_id)
            .unwrap_or_else(|_| commit.tree().unwrap())
    };

    let commit_tree = commit.tree()?;

    // Create diff options
    let mut diff_opts = DiffOptions::new();
    diff_opts
        .ignore_whitespace(false)
        .context_lines(3);

    // Generate diff
    let diff = repo.diff_tree_to_tree(
        Some(&parent_tree),
        Some(&commit_tree),
        Some(&mut diff_opts),
    )?;

    // Convert to our Diff format
    let mut diffs = Vec::new();

    diff.foreach(
        &mut |delta, _progress| {
            let old_path = delta.old_file().path().map(|p| p.to_string_lossy().into_owned());
            let new_path = delta.new_file().path().map(|p| p.to_string_lossy().into_owned());

            let change = match delta.status() {
                Delta::Added => DiffChangeKind::Added,
                Delta::Deleted => DiffChangeKind::Deleted,
                Delta::Modified => DiffChangeKind::Modified,
                Delta::Renamed => DiffChangeKind::Renamed,
                Delta::Copied => DiffChangeKind::Copied,
                _ => DiffChangeKind::Modified,
            };

            diffs.push(Diff {
                old_path,
                new_path,
                change,
                old_content: None,
                new_content: None,
                additions: None,
                deletions: None,
                content_omitted: false,
                line_diffs: None,
            });

            true
        },
        None,
        None,
        None,
    )?;

    // Load file contents for each diff
    for diff_entry in &mut diffs {
        let old_blob = if let Some(ref path) = diff_entry.old_path {
            parent_tree.get_path(Path::new(path))
                .ok()
                .and_then(|entry| repo.find_blob(entry.id()).ok())
        } else {
            None
        };

        let new_blob = if let Some(ref path) = diff_entry.new_path {
            commit_tree.get_path(Path::new(path))
                .ok()
                .and_then(|entry| repo.find_blob(entry.id()).ok())
        } else {
            None
        };

        // Check size limits
        let old_size = old_blob.as_ref().map(|b| b.size()).unwrap_or(0);
        let new_size = new_blob.as_ref().map(|b| b.size()).unwrap_or(0);

        if old_size > MAX_INLINE_DIFF_BYTES || new_size > MAX_INLINE_DIFF_BYTES {
            diff_entry.content_omitted = true;
            continue;
        }

        // Load contents
        if let Some(blob) = old_blob {
            if let Ok(content) = std::str::from_utf8(blob.content()) {
                diff_entry.old_content = Some(content.to_string());
            }
        }

        if let Some(blob) = new_blob {
            if let Ok(content) = std::str::from_utf8(blob.content()) {
                diff_entry.new_content = Some(content.to_string());
            }
        }

        // Compute line counts
        let (additions, deletions) = compute_line_change_counts(
            diff_entry.old_content.as_deref(),
            diff_entry.new_content.as_deref(),
        );
        diff_entry.additions = Some(additions);
        diff_entry.deletions = Some(deletions);
    }

    Ok(diffs)
}
```

**Step 2: Add API endpoint**

在 `crates/server/src/routes/task_attempts.rs` 中添加路由：

```rust
.route(
    "/task-attempts/:attemptId/commit-diff",
    get(get_commit_diff_handler),
)
```

添加处理函数：

```rust
async fn get_commit_diff_handler(
    State(state): State<AppState>,
    Path(attempt_id): Path<Uuid>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Diff>>, ApiError> {
    let repo_id = params
        .get("repo_id")
        .ok_or_else(|| ApiError::BadRequest("Missing repo_id parameter".to_string()))?
        .parse::<Uuid>()
        .map_err(|_| ApiError::BadRequest("Invalid repo_id".to_string()))?;

    let commit_hash = params
        .get("commit_hash")
        .ok_or_else(|| ApiError::BadRequest("Missing commit_hash parameter".to_string()))?;

    // Get workspace and repo info (same as previous endpoint)
    let workspace = db::Workspace::find_by_id(&state.db.pool, attempt_id)
        .await?
        .ok_or_else(|| ApiError::NotFound)?;

    let repo = db::Repo::find_by_id(&state.db.pool, repo_id)
        .await?
        .ok_or_else(|| ApiError::NotFound)?;

    let repo_path = state.local_deployment
        .worktree_manager
        .get_repo_path(&workspace.id, &repo.name)
        .ok_or_else(|| ApiError::NotFound)?;

    // Get commit diff
    let diffs = state.local_deployment.git.get_commit_diff(&repo_path, commit_hash)?;

    Ok(Json(diffs))
}
```

**Step 3: Test commit diff endpoint**

```bash
curl "http://localhost:3000/api/task-attempts/<attempt-id>/commit-diff?repo_id=<repo-id>&commit_hash=<commit-hash>"
```

预期输出：JSON 数组包含 Diff 对象，包含文件变更和内容

**Step 4: Commit changes**

```bash
git add crates/services/src/services/git.rs
git add crates/server/src/routes/task_attempts.rs
git commit -m "feat(api): add commit diff endpoint"
```

---

## Task 3: Create Frontend API Hooks

**Files:**
- Create: `frontend/src/hooks/useWorktreeCommits.ts`
- Create: `frontend/src/hooks/useCommitDiff.ts`

**Step 1: Create useWorktreeCommits hook**

创建文件 `frontend/src/hooks/useWorktreeCommits.ts`：

```typescript
import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { CommitInfo } from 'shared/types';

export function useWorktreeCommits(attemptId: string | undefined, repoId: string | undefined) {
  return useQuery({
    queryKey: ['worktree-commits', attemptId, repoId],
    queryFn: async () => {
      if (!attemptId || !repoId) {
        throw new Error('attemptId and repoId are required');
      }

      const response = await attemptsApi.get<CommitInfo[]>(
        `/task-attempts/${attemptId}/worktree-commits`,
        {
          params: { repo_id: repoId },
        }
      );

      return response.data;
    },
    enabled: !!attemptId && !!repoId,
  });
}
```

**Step 2: Create useCommitDiff hook**

创建文件 `frontend/src/hooks/useCommitDiff.ts`：

```typescript
import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { Diff } from 'shared/types';

export function useCommitDiff(
  attemptId: string | undefined,
  repoId: string | undefined,
  commitHash: string | undefined
) {
  return useQuery({
    queryKey: ['commit-diff', attemptId, repoId, commitHash],
    queryFn: async () => {
      if (!attemptId || !repoId || !commitHash) {
        throw new Error('attemptId, repoId, and commitHash are required');
      }

      const response = await attemptsApi.get<Diff[]>(
        `/task-attempts/${attemptId}/commit-diff`,
        {
          params: {
            repo_id: repoId,
            commit_hash: commitHash,
          },
        }
      );

      return response.data;
    },
    enabled: !!attemptId && !!repoId && !!commitHash,
  });
}
```

**Step 3: Verify hooks work**

无需测试（将在后续任务中集成使用）

**Step 4: Commit hooks**

```bash
git add frontend/src/hooks/useWorktreeCommits.ts
git add frontend/src/hooks/useCommitDiff.ts
git commit -m "feat(frontend): add hooks for worktree commits and commit diff"
```

---

## Task 4: Create Commit History Dialog Component

**Files:**
- Create: `frontend/src/components/dialogs/CommitHistoryDialog.tsx`

**Step 1: Create dialog component**

创建文件 `frontend/src/components/dialogs/CommitHistoryDialog.tsx`：

```typescript
import { useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { History, X } from 'lucide-react';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useWorktreeCommits } from '@/hooks/useWorktreeCommits';
import { useCommitDiff } from '@/hooks/useCommitDiff';
import type { CommitInfo } from 'shared/types';

export interface CommitHistoryDialogProps {
  attemptId: string;
  repoId: string;
}

const CommitHistoryDialog = NiceModal.create<CommitHistoryDialogProps>(
  ({ attemptId, repoId }) => {
    const modal = useModal();
    const { t } = useTranslation();
    const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);

    const { data: commits, isLoading: isLoadingCommits } = useWorktreeCommits(
      attemptId,
      repoId
    );

    const { data: diffs, isLoading: isLoadingDiffs } = useCommitDiff(
      attemptId,
      repoId,
      selectedCommit?.hash
    );

    return (
      <Dialog open={modal.visible} onOpenChange={(open) => !open && modal.hide()}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5" />
                <DialogTitle>提交历史</DialogTitle>
              </div>
              <Button
                variant="icon"
                size="sm"
                onClick={() => modal.hide()}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            {/* Left panel - Commit list */}
            <div className="w-1/3 border-r flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                {isLoadingCommits && (
                  <div className="p-4 text-sm text-muted-foreground">
                    加载提交记录...
                  </div>
                )}

                {!isLoadingCommits && commits && commits.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    暂无独有提交
                  </div>
                )}

                {commits?.map((commit) => (
                  <button
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit)}
                    className={`w-full text-left p-4 border-b hover:bg-accent transition-colors ${
                      selectedCommit?.hash === commit.hash ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="font-mono text-sm text-muted-foreground mb-1">
                      {commit.short_hash}
                    </div>
                    <div className="text-sm font-medium mb-1 line-clamp-2">
                      {commit.message.split('\n')[0]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {commit.author_name} • {new Date(commit.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right panel - Commit diff */}
            <div className="flex-1 overflow-y-auto bg-muted/30">
              {!selectedCommit && (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  选择一个提交以查看变更详情
                </div>
              )}

              {selectedCommit && isLoadingDiffs && (
                <div className="p-6 text-sm text-muted-foreground">
                  加载变更详情...
                </div>
              )}

              {selectedCommit && !isLoadingDiffs && diffs && (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">{selectedCommit.message.split('\n')[0]}</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>提交: {selectedCommit.hash}</div>
                      <div>作者: {selectedCommit.author_name} &lt;{selectedCommit.author_email}&gt;</div>
                      <div>时间: {new Date(selectedCommit.timestamp).toLocaleString('zh-CN')}</div>
                    </div>
                  </div>

                  {diffs.length === 0 && (
                    <div className="text-sm text-muted-foreground">此提交无文件变更</div>
                  )}

                  {/* Diff content will be added in next task */}
                  {diffs.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {diffs.length} 个文件已变更 (Diff 视图将在下一步添加)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export default defineModal(CommitHistoryDialog, 'CommitHistoryDialog');
```

**Step 2: Register dialog in modals registry**

检查 `frontend/src/lib/modals/index.ts` 或类似文件，添加导入和注册：

```typescript
import CommitHistoryDialog from '@/components/dialogs/CommitHistoryDialog';

// 在 NiceModal.register 调用中添加
NiceModal.register('CommitHistoryDialog', CommitHistoryDialog);
```

**Step 3: Verify dialog structure**

运行前端开发服务器：

```bash
pnpm run frontend:dev
```

预期：编译无错误

**Step 4: Commit dialog component**

```bash
git add frontend/src/components/dialogs/CommitHistoryDialog.tsx
git add frontend/src/lib/modals/index.ts
git commit -m "feat(ui): add commit history dialog with split panel layout"
```

---

## Task 5: Add History Button to Attempt Header

**Files:**
- Modify: `frontend/src/components/panels/AttemptHeaderActions.tsx`

**Step 1: Import dependencies**

在 `frontend/src/components/panels/AttemptHeaderActions.tsx` 顶部添加导入：

```typescript
import { History } from 'lucide-react';
import NiceModal from '@ebay/nice-modal-react';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
```

**Step 2: Add history button**

在 `AttemptHeaderActions` 组件中，找到 `<Eye>` 图标按钮（约第 74-86 行），在它**之前**添加历史按钮：

```typescript
{attempt?.id && (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="icon"
        size="sm"
        onClick={() => {
          const repo = useAttemptRepo.getState(); // 获取当前选中的 repo
          if (repo?.id) {
            NiceModal.show('CommitHistoryDialog', {
              attemptId: attempt.id,
              repoId: repo.id,
            });
          }
        }}
        aria-label="Commit History"
      >
        <History className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      提交历史
    </TooltipContent>
  </Tooltip>
)}
{attempt?.id && <div className="h-4 w-px bg-border" />}
```

**Step 3: Handle repo selection**

如果 `useAttemptRepo` 不存在或不适用，需要从 props 或 context 获取 repoId。检查组件的 props 和可用的 hooks，调整实现：

```typescript
// 方案 A: 如果 attempt 包含 repos 信息
const firstRepo = attempt?.repos?.[0];

// 方案 B: 使用现有的 repo hook
import { useAttemptRepos } from '@/hooks/useAttemptRepos';
const { data: repos } = useAttemptRepos(attempt?.id);
const firstRepo = repos?.[0];

// 在按钮 onClick 中:
if (firstRepo?.id) {
  NiceModal.show('CommitHistoryDialog', {
    attemptId: attempt.id,
    repoId: firstRepo.id,
  });
}
```

**Step 4: Test button click**

1. 启动开发服务器：`pnpm run dev`
2. 打开浏览器到任务页面
3. 点击新的历史图标按钮
4. 验证对话框打开并显示提交列表

预期：对话框打开，显示提交列表（左侧）和空的 diff 面板（右侧）

**Step 5: Commit button integration**

```bash
git add frontend/src/components/panels/AttemptHeaderActions.tsx
git commit -m "feat(ui): add commit history button to attempt header"
```

---

## Task 6: Create File Diff View Component

**Files:**
- Create: `frontend/src/components/diffs/FileDiffView.tsx`

**Step 1: Install diff rendering library**

```bash
cd frontend
pnpm add react-diff-view diff
pnpm add -D @types/diff
```

**Step 2: Create FileDiffView component**

创建文件 `frontend/src/components/diffs/FileDiffView.tsx`：

```typescript
import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { Diff } from 'shared/types';
import { parseDiff, Diff as DiffView, Hunk, tokenize } from 'react-diff-view';
import { diffLines, formatLines } from 'unidiff';
import 'react-diff-view/style/index.css';

interface FileDiffViewProps {
  diff: Diff;
}

export function FileDiffView({ diff }: FileDiffViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const filePath = diff.newPath || diff.oldPath || 'unknown';
  const changeType = diff.change;

  // Generate unified diff format for react-diff-view
  const generateUnifiedDiff = () => {
    if (diff.contentOmitted) {
      return null;
    }

    const oldContent = diff.oldContent || '';
    const newContent = diff.newContent || '';

    if (!oldContent && !newContent) {
      return null;
    }

    // Use diffLines to generate the diff
    const diffResult = diffLines(oldContent, newContent);
    const unifiedDiff = formatLines(diffResult, {
      context: 3,
      aname: diff.oldPath || '/dev/null',
      bname: diff.newPath || '/dev/null',
    });

    return unifiedDiff;
  };

  const unifiedDiff = generateUnifiedDiff();
  const parsedDiff = unifiedDiff ? parseDiff(unifiedDiff)[0] : null;

  // Tokenize for syntax highlighting (basic)
  const tokens = parsedDiff ? tokenize(parsedDiff.hunks) : null;

  const getChangeColor = () => {
    switch (changeType) {
      case 'added':
        return 'text-green-600';
      case 'deleted':
        return 'text-red-600';
      case 'modified':
        return 'text-yellow-600';
      case 'renamed':
        return 'text-blue-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getChangeLabel = () => {
    switch (changeType) {
      case 'added':
        return '新增';
      case 'deleted':
        return '删除';
      case 'modified':
        return '修改';
      case 'renamed':
        return '重命名';
      case 'copied':
        return '复制';
      default:
        return '变更';
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden mb-4">
      {/* File header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-3 bg-muted hover:bg-muted/80 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        )}
        <FileText className="h-4 w-4 flex-shrink-0" />
        <span className="font-mono text-sm flex-1 text-left truncate">
          {filePath}
        </span>
        <span className={`text-xs font-semibold ${getChangeColor()}`}>
          {getChangeLabel()}
        </span>
        {diff.additions !== undefined && diff.deletions !== undefined && (
          <span className="text-xs text-muted-foreground">
            <span className="text-green-600">+{diff.additions}</span>
            {' '}
            <span className="text-red-600">-{diff.deletions}</span>
          </span>
        )}
      </button>

      {/* Diff content */}
      {isExpanded && (
        <div className="bg-background">
          {diff.contentOmitted && (
            <div className="p-4 text-sm text-muted-foreground">
              文件内容过大，已省略显示
              {diff.additions !== undefined && diff.deletions !== undefined && (
                <span> (新增 {diff.additions} 行，删除 {diff.deletions} 行)</span>
              )}
            </div>
          )}

          {!diff.contentOmitted && !parsedDiff && (
            <div className="p-4 text-sm text-muted-foreground">
              无法显示 diff（可能是二进制文件）
            </div>
          )}

          {!diff.contentOmitted && parsedDiff && tokens && (
            <div className="overflow-x-auto">
              <DiffView
                viewType="split"
                diffType={parsedDiff.type}
                hunks={parsedDiff.hunks}
                tokens={tokens}
              >
                {(hunks) =>
                  hunks.map((hunk) => (
                    <Hunk key={hunk.content} hunk={hunk} />
                  ))
                }
              </DiffView>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Add CSS for diff view**

在 `frontend/src/index.css` 或全局样式文件中添加（如果需要自定义样式）：

```css
/* Customize react-diff-view colors */
.diff-gutter-normal {
  @apply bg-muted/50;
}

.diff-gutter-add {
  @apply bg-green-50 dark:bg-green-950/20;
}

.diff-gutter-delete {
  @apply bg-red-50 dark:bg-red-950/20;
}

.diff-code-add {
  @apply bg-green-50/50 dark:bg-green-950/10;
}

.diff-code-delete {
  @apply bg-red-50/50 dark:bg-red-950/10;
}
```

**Step 4: Test component rendering**

在浏览器中打开对话框，选择一个提交，验证 diff 渲染。

预期：看不到实际的 diff（因为还未集成到对话框）

**Step 5: Commit component**

```bash
git add frontend/src/components/diffs/FileDiffView.tsx
git add frontend/src/index.css
git add frontend/package.json
git add frontend/pnpm-lock.yaml
git commit -m "feat(ui): add file diff view component with react-diff-view"
```

---

## Task 7: Integrate Diff View into Dialog

**Files:**
- Modify: `frontend/src/components/dialogs/CommitHistoryDialog.tsx`

**Step 1: Import FileDiffView**

在 `CommitHistoryDialog.tsx` 顶部添加：

```typescript
import { FileDiffView } from '@/components/diffs/FileDiffView';
```

**Step 2: Replace placeholder with diff rendering**

找到对话框中的 "Diff 视图将在下一步添加" 部分（约第 120 行），替换为：

```typescript
{diffs.length > 0 && (
  <div className="space-y-4">
    <div className="text-sm text-muted-foreground mb-2">
      {diffs.length} 个文件已变更
    </div>
    {diffs.map((diff, index) => (
      <FileDiffView key={index} diff={diff} />
    ))}
  </div>
)}
```

**Step 3: Test full integration**

1. 启动开发服务器：`pnpm run dev`
2. 打开任务页面
3. 点击历史按钮
4. 在提交列表中选择一个提交
5. 验证右侧显示文件 diff

预期：
- 左侧显示提交列表，包含 hash、消息、作者、时间
- 点击提交后，右侧显示该提交的文件变更
- 每个文件显示为可折叠的面板
- 展开文件后显示传统的红绿 diff 视图

**Step 4: Commit integration**

```bash
git add frontend/src/components/dialogs/CommitHistoryDialog.tsx
git commit -m "feat(ui): integrate file diff view into commit history dialog"
```

---

## Task 8: Add Error Handling and Loading States

**Files:**
- Modify: `frontend/src/components/dialogs/CommitHistoryDialog.tsx`

**Step 1: Add error display for commits**

在 `CommitHistoryDialog.tsx` 的左侧面板中，在 `isLoadingCommits` 检查之后添加：

```typescript
{!isLoadingCommits && commits === undefined && (
  <div className="p-4 text-sm text-red-500">
    加载提交记录失败，请重试
  </div>
)}
```

**Step 2: Add error display for diffs**

在右侧面板中，在 `isLoadingDiffs` 检查之后添加：

```typescript
{selectedCommit && !isLoadingDiffs && diffs === undefined && (
  <div className="p-6 text-sm text-red-500">
    加载变更详情失败，请重试
  </div>
)}
```

**Step 3: Add loading spinner**

安装或使用现有的 spinner 组件，替换简单的 "加载中..." 文本：

```typescript
import { Loader2 } from 'lucide-react';

// 在 isLoadingCommits 部分:
{isLoadingCommits && (
  <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>加载提交记录...</span>
  </div>
)}

// 在 isLoadingDiffs 部分:
{selectedCommit && isLoadingDiffs && (
  <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span>加载变更详情...</span>
  </div>
)}
```

**Step 4: Test error states**

模拟错误场景（可以暂时修改 API 端点 URL 为错误的路径）来验证错误提示显示。

预期：错误提示以红色文本显示

**Step 5: Commit error handling**

```bash
git add frontend/src/components/dialogs/CommitHistoryDialog.tsx
git commit -m "feat(ui): add error handling and loading states to commit history dialog"
```

---

## Task 9: Add Analytics Tracking

**Files:**
- Modify: `frontend/src/components/panels/AttemptHeaderActions.tsx`
- Modify: `frontend/src/components/dialogs/CommitHistoryDialog.tsx`

**Step 1: Add tracking for button click**

在 `AttemptHeaderActions.tsx` 的历史按钮 onClick 中添加 PostHog 追踪：

```typescript
onClick={() => {
  posthog?.capture('commit_history_opened', {
    trigger: 'button',
    attempt_id: attempt.id,
    timestamp: new Date().toISOString(),
    source: 'frontend',
  });

  // ... existing NiceModal.show code
}}
```

**Step 2: Add tracking for commit selection**

在 `CommitHistoryDialog.tsx` 中导入 PostHog：

```typescript
import { usePostHog } from 'posthog-js/react';

// 在组件内部:
const posthog = usePostHog();
```

在提交选择的 onClick 中添加追踪：

```typescript
onClick={() => {
  posthog?.capture('commit_selected', {
    commit_hash: commit.short_hash,
    attempt_id: attemptId,
    timestamp: new Date().toISOString(),
    source: 'frontend',
  });

  setSelectedCommit(commit);
}}
```

**Step 3: Test analytics**

在开发环境中操作，检查浏览器控制台或 PostHog 调试模式，确认事件被发送。

预期：PostHog 事件出现在调试工具中

**Step 4: Commit analytics**

```bash
git add frontend/src/components/panels/AttemptHeaderActions.tsx
git add frontend/src/components/dialogs/CommitHistoryDialog.tsx
git commit -m "feat(analytics): add tracking for commit history interactions"
```

---

## Task 10: Add Internationalization Support

**Files:**
- Modify: `frontend/src/locales/zh-CN/translation.json` (或相应的 i18n 文件)
- Modify: `frontend/src/components/dialogs/CommitHistoryDialog.tsx`

**Step 1: Add translation keys**

在 `frontend/src/locales/zh-CN/translation.json` (或对应的中文翻译文件) 中添加：

```json
{
  "commitHistory": {
    "title": "提交历史",
    "loading": "加载提交记录...",
    "loadingDiff": "加载变更详情...",
    "noCommits": "暂无独有提交",
    "selectCommit": "选择一个提交以查看变更详情",
    "noChanges": "此提交无文件变更",
    "filesChanged": "{{count}} 个文件已变更",
    "contentOmitted": "文件内容过大，已省略显示",
    "cannotDisplay": "无法显示 diff（可能是二进制文件）",
    "loadError": "加载失败，请重试",
    "changeTypes": {
      "added": "新增",
      "deleted": "删除",
      "modified": "修改",
      "renamed": "重命名",
      "copied": "复制"
    }
  }
}
```

**Step 2: Update dialog to use translations**

在 `CommitHistoryDialog.tsx` 中替换硬编码的中文字符串：

```typescript
<DialogTitle>{t('commitHistory.title')}</DialogTitle>

// 加载状态
{t('commitHistory.loading')}

// 空状态
{t('commitHistory.noCommits')}

// 等等...
```

**Step 3: Update FileDiffView to use translations**

在 `FileDiffView.tsx` 中：

```typescript
import { useTranslation } from 'react-i18next';

export function FileDiffView({ diff }: FileDiffViewProps) {
  const { t } = useTranslation();

  // 使用 t('commitHistory.changeTypes.added') 等
}
```

**Step 4: Verify translations work**

在浏览器中测试，确认所有文本正确显示。

预期：所有文本使用翻译系统，没有硬编码的中文字符串

**Step 5: Commit i18n changes**

```bash
git add frontend/src/locales/
git add frontend/src/components/dialogs/CommitHistoryDialog.tsx
git add frontend/src/components/diffs/FileDiffView.tsx
git commit -m "feat(i18n): add translations for commit history feature"
```

---

## Task 11: Final Testing and Bug Fixes

**Files:**
- Various files as needed for bug fixes

**Step 1: Run full application**

```bash
pnpm run dev
```

**Step 2: Test complete flow**

1. 打开浏览器到任务页面
2. 点击历史按钮
3. 验证提交列表加载
4. 点击不同的提交
5. 验证 diff 正确显示
6. 测试折叠/展开文件
7. 测试滚动行为
8. 测试关闭对话框

**Step 3: Test edge cases**

- 无提交的情况
- 单个提交
- 大量提交（>50）
- 大文件的 contentOmitted 情况
- 二进制文件
- 网络错误

**Step 4: Fix any discovered bugs**

根据测试发现的问题进行修复。

**Step 5: Run type checks**

```bash
pnpm run check
pnpm run backend:check
```

预期：无类型错误

**Step 6: Run linters**

```bash
pnpm run lint
```

预期：无 lint 错误

**Step 7: Final commit**

```bash
git add .
git commit -m "fix: address edge cases and polish commit history feature"
```

---

## Task 12: Documentation and Cleanup

**Files:**
- Create: `docs/features/commit-history-viewer.md`

**Step 1: Create feature documentation**

创建文件 `docs/features/commit-history-viewer.md`：

```markdown
# Commit History Viewer

## Overview

The Commit History Viewer allows users to view worktree-specific commits and their file diffs directly from the task attempt page.

## Features

- **Worktree-only commits**: Shows only commits unique to the current worktree branch (excludes merged commits from base branch)
- **Split-panel interface**: Left panel shows commit list, right panel shows selected commit's diff
- **File-by-file diff view**: Each changed file is displayed in a collapsible panel
- **Traditional diff colors**: Green for additions, red for deletions
- **Performance optimization**: Large files (>2MB) show summary instead of full content

## Usage

1. Navigate to a task attempt page
2. Click the History icon button (clock icon) in the top-right toolbar
3. Select a commit from the left panel
4. View the file changes in the right panel
5. Expand/collapse individual files to see detailed diffs

## API Endpoints

### GET /api/task-attempts/:attemptId/worktree-commits

Returns list of commits unique to the worktree branch.

**Query Parameters:**
- `repo_id` (UUID, required): Repository ID

**Response:**
```json
[
  {
    "hash": "abc123...",
    "short_hash": "abc123",
    "message": "feat: add feature",
    "author_name": "John Doe",
    "author_email": "john@example.com",
    "timestamp": "2026-01-29T10:00:00Z"
  }
]
```

### GET /api/task-attempts/:attemptId/commit-diff

Returns file diffs for a specific commit.

**Query Parameters:**
- `repo_id` (UUID, required): Repository ID
- `commit_hash` (string, required): Full commit hash

**Response:**
```json
[
  {
    "old_path": "src/file.ts",
    "new_path": "src/file.ts",
    "change": "modified",
    "old_content": "...",
    "new_content": "...",
    "additions": 10,
    "deletions": 5,
    "content_omitted": false
  }
]
```

## Components

- `CommitHistoryDialog`: Main dialog component
- `FileDiffView`: Individual file diff rendering
- `useWorktreeCommits`: Hook for fetching commit list
- `useCommitDiff`: Hook for fetching commit diffs

## Implementation Details

- Uses `git2` library for Git operations
- Uses `react-diff-view` for diff rendering
- Implements split-panel layout with independent scrolling
- Tracks user interactions with PostHog analytics
```

**Step 2: Commit documentation**

```bash
git add docs/features/commit-history-viewer.md
git commit -m "docs: add commit history viewer feature documentation"
```

**Step 3: Clean up any console.logs or debug code**

搜索并移除任何调试代码。

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: clean up debug code"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] Backend API endpoints respond correctly
- [ ] TypeScript types are generated and correct
- [ ] Dialog opens when history button is clicked
- [ ] Commit list loads and displays correctly
- [ ] Clicking a commit loads and displays diffs
- [ ] File diffs render with correct colors
- [ ] Collapsible file panels work
- [ ] Large file content is omitted correctly
- [ ] Error states display properly
- [ ] Loading states display properly
- [ ] Analytics events are tracked
- [ ] All text uses i18n translations
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Documentation is complete

## Recommended Testing Commands

```bash
# Type check
pnpm run check
pnpm run backend:check

# Lint
pnpm run lint

# Run dev server
pnpm run dev

# Generate types
pnpm run generate-types
```
