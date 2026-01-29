import {
  ArrowRight,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Undo2,
  Save,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { useCallback, useMemo, useState } from 'react';
import type {
  RepoBranchStatus,
  Merge,
  TaskWithAttemptStatus,
  Workspace,
} from 'shared/types';
import { ChangeTargetBranchDialog } from '@/components/dialogs/tasks/ChangeTargetBranchDialog';
import RepoSelector from '@/components/tasks/RepoSelector';
import { RebaseDialog } from '@/components/dialogs/tasks/RebaseDialog';
import { CreatePRDialog } from '@/components/dialogs/tasks/CreatePRDialog';
import { MergeCommitDialog } from '@/components/dialogs/tasks/MergeCommitDialog';
import { attemptsApi } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useRepoBranches } from '@/hooks';
import { useDiffStream } from '@/hooks/useDiffStream';

interface GitOperationsProps {
  selectedAttempt: Workspace;
  task: TaskWithAttemptStatus;
  branchStatus: RepoBranchStatus[] | null;
  branchStatusError?: Error | null;
  isAttemptRunning: boolean;
  selectedBranch: string | null;
  layout?: 'horizontal' | 'vertical';
}

export type GitOperationsInputs = Omit<GitOperationsProps, 'selectedAttempt'>;


function GitOperations({
  selectedAttempt,
  task,
  branchStatus,
  branchStatusError,
  isAttemptRunning,
  selectedBranch,
  layout = 'horizontal',
}: GitOperationsProps) {
  const { t } = useTranslation('tasks');

  const { repos, selectedRepoId, setSelectedRepoId } = useAttemptRepo(
    selectedAttempt.id
  );
  const git = useGitOperations(selectedAttempt.id, selectedRepoId ?? undefined);
  const { data: branches = [] } = useRepoBranches(selectedRepoId);
  const { diffs } = useDiffStream(selectedAttempt.id, true);
  const isChangingTargetBranch = git.states.changeTargetBranchPending;

  // Local state for git operations
  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  // Target branch change handlers
  const handleChangeTargetBranchClick = async (newBranch: string) => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;
    await git.actions.changeTargetBranch({
      newTargetBranch: newBranch,
      repoId,
    });
  };

  const handleChangeTargetBranchDialogOpen = async () => {
    try {
      const result = await ChangeTargetBranchDialog.show({
        branches,
        isChangingTargetBranch: isChangingTargetBranch,
      });

      if (result.action === 'confirmed' && result.branchName) {
        await handleChangeTargetBranchClick(result.branchName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  const getSelectedRepoId = useCallback(() => {
    return selectedRepoId ?? repos[0]?.id;
  }, [selectedRepoId, repos]);

  const getSelectedRepoStatus = useCallback(() => {
    const repoId = getSelectedRepoId();
    return branchStatus?.find((r) => r.repo_id === repoId);
  }, [branchStatus, getSelectedRepoId]);

  // Memoize the selected repo status for use in button disabled states
  const selectedRepoStatus = useMemo(
    () => getSelectedRepoStatus(),
    [getSelectedRepoStatus]
  );

  const hasConflictsCalculated =
    (selectedRepoStatus?.conflicted_files?.length ?? 0) > 0;

  // Memoize merge status information to avoid repeated calculations
  const mergeInfo = useMemo(() => {
    const selectedRepoStatus = getSelectedRepoStatus();
    if (!selectedRepoStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
        latestMerge: null,
      };

    const openPR = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
    );

    const mergedPR = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'merged'
    );

    const merges = selectedRepoStatus.merges.filter(
      (m: Merge) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );

    // Find the latest direct merge for the revert button
    const latestDirectMerge = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'direct'
    );

    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
      latestMerge: latestDirectMerge || null,
    };
  }, [getSelectedRepoStatus]);

  const mergeButtonLabel = useMemo(() => {
    if (mergeSuccess) return t('git.states.merged');
    if (merging) return t('git.states.merging');
    return t('git.states.merge');
  }, [mergeSuccess, merging, t]);

  const rebaseButtonLabel = useMemo(() => {
    if (rebasing) return t('git.states.rebasing');
    return t('git.states.rebase');
  }, [rebasing, t]);

  const prButtonLabel = useMemo(() => {
    if (mergeInfo.hasOpenPR) {
      return pushSuccess
        ? t('git.states.pushed')
        : pushing
          ? t('git.states.pushing')
          : t('git.states.push');
    }
    return t('git.states.createPr');
  }, [mergeInfo.hasOpenPR, pushSuccess, pushing, t]);

  const handleMergeClick = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;

    // 获取该分支的最后一条提交信息作为默认信息
    let defaultMessage = '';
    try {
      const lastCommit = await attemptsApi.getLastCommitMessage(
        selectedAttempt.id,
        repoId
      );
      defaultMessage = lastCommit.message;
    } catch (error) {
      console.error('Failed to get last commit message:', error);
      // 如果获取失败，使用空字符串
      defaultMessage = '';
    }

    try {
      const result = await MergeCommitDialog.show({
        attemptId: selectedAttempt.id,
        repoId,
        defaultMessage,
        diffs,
        taskTitle: task.title,
        taskDescription: task.description,
        targetBranch: getSelectedRepoStatus()?.target_branch_name ?? undefined,
        autoGenerate: true, // 自动生成提交信息
      });
      if (result.action === 'confirmed' && result.commitMessage) {
        await performMerge(result.commitMessage);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  const handlePushClick = async () => {
    try {
      setPushing(true);
      const repoId = getSelectedRepoId();
      if (!repoId) return;
      await git.actions.push({ repo_id: repoId });
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async (commitMessage?: string) => {
    try {
      setMerging(true);
      const repoId = getSelectedRepoId();
      if (!repoId) return;
      await git.actions.merge({
        repoId,
        commitMessage,
      });
      setMergeSuccess(true);

      // Refresh branch status and diffs after successful merge
      // 500ms延迟确保后端已完成merge操作
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseWithNewBranchAndUpstream = async (
    newBaseBranch: string,
    selectedUpstream: string
  ) => {
    setRebasing(true);
    try {
      const repoId = getSelectedRepoId();
      if (!repoId) return;
      await git.actions.rebase({
        repoId,
        newBaseBranch: newBaseBranch,
        oldBaseBranch: selectedUpstream,
      });
    } finally {
      setRebasing(false);
    }
  };

  const handleRebaseDialogOpen = async () => {
    try {
      const defaultTargetBranch = getSelectedRepoStatus()?.target_branch_name;
      const result = await RebaseDialog.show({
        branches,
        isRebasing: rebasing,
        initialTargetBranch: defaultTargetBranch,
        initialUpstreamBranch: defaultTargetBranch,
      });
      if (
        result.action === 'confirmed' &&
        result.branchName &&
        result.upstreamBranch
      ) {
        await handleRebaseWithNewBranchAndUpstream(
          result.branchName,
          result.upstreamBranch
        );
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  const handleRevertMergeClick = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;

    // 确认用户想要撤销合并
    if (!window.confirm(t('git.revert.confirmMessage'))) {
      return;
    }

    try {
      setReverting(true);
      await attemptsApi.revertMerge(selectedAttempt.id, { repo_id: repoId });
      // 刷新页面或触发重新获取分支状态
      window.location.reload();
    } catch (error) {
      console.error('Failed to revert merge:', error);
      alert(t('git.revert.failed'));
    } finally {
      setReverting(false);
    }
  };

  const handlePRButtonClick = async () => {
    // If PR already exists, push to it
    if (mergeInfo.hasOpenPR) {
      await handlePushClick();
      return;
    }

    CreatePRDialog.show({
      attempt: selectedAttempt,
      task,
      repoId: getSelectedRepoId(),
      targetBranch: getSelectedRepoStatus()?.target_branch_name,
    });
  };

  const handleCommitClick = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;

    try {
      setCommitting(true);
      const response = await attemptsApi.commitWorktree(
        selectedAttempt.id,
        repoId
      );

      if (response.success) {
        // Commit succeeded, reload to refresh branch status
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        alert(response.message || 'No changes to commit');
      }
    } catch (error) {
      console.error('Failed to commit:', error);
      alert(t('git.commit.failed', 'Failed to commit'));
    } finally {
      setCommitting(false);
    }
  };

  const handleUndoCommitClick = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;

    // Confirm before undoing
    if (!window.confirm(t('git.undo.confirm', 'Are you sure you want to undo the latest commit?'))) {
      return;
    }

    try {
      setUndoing(true);
      const response = await attemptsApi.undoCommit(
        selectedAttempt.id,
        repoId
      );

      if (response.success) {
        // Undo succeeded, reload to refresh branch status
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        alert(response.message || 'Failed to undo commit');
      }
    } catch (error) {
      console.error('Failed to undo commit:', error);
      alert(t('git.undo.failed', 'Failed to undo commit'));
    } finally {
      setUndoing(false);
    }
  };

  const isVertical = layout === 'vertical';

  const containerClasses = isVertical
    ? 'grid grid-cols-1 items-start gap-3 overflow-hidden'
    : 'flex items-center gap-2 overflow-hidden';

  const settingsBtnClasses = isVertical
    ? 'inline-flex h-5 w-5 p-0 hover:bg-muted'
    : 'hidden md:inline-flex h-5 w-5 p-0 hover:bg-muted';

  const actionsClasses = isVertical
    ? 'flex flex-wrap items-center gap-2'
    : 'shrink-0 flex flex-wrap items-center gap-2 overflow-y-hidden overflow-x-visible max-h-8';

  const statusChips = (
    <div className="flex items-center gap-2 text-xs min-w-0 overflow-hidden whitespace-nowrap">
      {(() => {
        const commitsAhead = selectedRepoStatus?.commits_ahead ?? 0;
        const commitsBehind = selectedRepoStatus?.commits_behind ?? 0;

        if (hasConflictsCalculated) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('git.status.conflicts')}
            </span>
          );
        }

        if (selectedRepoStatus?.is_rebase_in_progress) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              {t('git.states.rebasing')}
            </span>
          );
        }

        if (mergeInfo.hasMergedPR) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="h-3.5 w-3.5" />
              {t('git.states.merged')}
            </span>
          );
        }

        if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
          const prMerge = mergeInfo.openPR;
          return (
            <button
              onClick={() => window.open(prMerge.pr_info.url, '_blank')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100/60 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:underline truncate max-w-[180px] sm:max-w-none"
              aria-label={t('git.pr.open', {
                number: Number(prMerge.pr_info.number),
              })}
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              {t('git.pr.number', {
                number: Number(prMerge.pr_info.number),
              })}
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          );
        }

        const chips: React.ReactNode[] = [];
        if (commitsAhead > 0) {
          chips.push(
            <span
              key="ahead"
              className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            >
              +{commitsAhead} {t('git.status.commits', { count: commitsAhead })}{' '}
              {t('git.status.ahead')}
            </span>
          );
        }
        if (commitsBehind > 0) {
          chips.push(
            <span
              key="behind"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
            >
              {commitsBehind}{' '}
              {t('git.status.commits', { count: commitsBehind })}{' '}
              {t('git.status.behind')}
            </span>
          );
        }
        if (chips.length > 0)
          return <div className="flex items-center gap-2">{chips}</div>;

        return (
          <span className="text-muted-foreground hidden sm:inline">
            {t('git.status.upToDate')}
          </span>
        );
      })()}
    </div>
  );

  const branchChips = (
    <>
      {/* Task branch chip */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden sm:inline-flex items-center gap-1.5 max-w-[280px] px-2 py-0.5 rounded-full bg-muted text-xs font-medium min-w-0">
              <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedAttempt.branch}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('git.labels.taskBranch')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ArrowRight className="hidden sm:inline h-4 w-4 text-muted-foreground" />

      {/* Target branch chip + change button */}
      <div className="flex items-center gap-1 min-w-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 max-w-[280px] px-2 py-0.5 rounded-full bg-muted text-xs font-medium min-w-0">
                <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {getSelectedRepoStatus()?.target_branch_name ||
                    selectedBranch ||
                    t('git.branch.current')}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('rebase.dialog.targetLabel')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleChangeTargetBranchDialogOpen}
                disabled={isAttemptRunning || hasConflictsCalculated}
                className={settingsBtnClasses}
                aria-label={t('branches.changeTarget.dialog.title')}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('branches.changeTarget.dialog.title')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );

  return (
    <div className="w-full border-b py-2">
      <div className={containerClasses}>
        {isVertical ? (
          <>
            {repos.length > 1 && (
              <RepoSelector
                repos={repos}
                selectedRepoId={getSelectedRepoId() ?? null}
                onRepoSelect={setSelectedRepoId}
                disabled={isAttemptRunning}
                placeholder={t('repos.selector.placeholder', 'Select repo')}
              />
            )}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {branchChips}
              {statusChips}
            </div>
          </>
        ) : (
          <>
            {repos.length > 0 && (
              <RepoSelector
                repos={repos}
                selectedRepoId={getSelectedRepoId() ?? null}
                onRepoSelect={setSelectedRepoId}
                disabled={isAttemptRunning}
                placeholder={t('repos.selector.placeholder', 'Select repo')}
                className="w-auto max-w-[200px] rounded-full bg-muted border-0 h-6 px-2 py-0.5 text-xs font-medium"
              />
            )}
            <div className="flex flex-1 items-center justify-center gap-2 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                {branchChips}
              </div>
              {statusChips}
            </div>
          </>
        )}

        {/* Right: Actions */}
        {branchStatusError && !selectedRepoStatus ? (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{t('git.errors.branchStatusUnavailable')}</span>
          </div>
        ) : selectedRepoStatus ? (
          <div className={actionsClasses}>
            {/* 提交按钮 */}
            <Button
              onClick={handleCommitClick}
              disabled={
                committing ||
                isAttemptRunning ||
                hasConflictsCalculated ||
                !selectedRepoStatus ||
                !diffs ||
                diffs.length === 0
              }
              variant="outline"
              size="xs"
              className="border-emerald-500 text-emerald-400 dark:text-emerald-300 hover:bg-emerald-500/10 gap-1 shrink-0"
              aria-label={t('git.commit.button', '提交')}
            >
              <Save className="h-3.5 w-3.5" />
              <span className="truncate max-w-[10ch]">
                {committing ? t('git.commit.committing', '提交中...') : t('git.commit.button', '提交')}
              </span>
            </Button>

            {/* 撤销提交按钮 */}
            <Button
              onClick={handleUndoCommitClick}
              disabled={
                undoing ||
                isAttemptRunning ||
                hasConflictsCalculated ||
                !selectedRepoStatus?.commits_ahead ||
                selectedRepoStatus.commits_ahead === 0
              }
              variant="outline"
              size="xs"
              className="border-amber-600 text-amber-600 hover:bg-amber-600 gap-1 shrink-0"
              aria-label={t('git.undo.button', '撤销提交')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="truncate max-w-[10ch]">
                {undoing ? t('git.undo.undoing', '撤销中...') : t('git.undo.button', '撤销提交')}
              </span>
            </Button>

            <Button
              onClick={handleMergeClick}
              disabled={
                mergeInfo.hasMergedPR ||
                mergeInfo.hasOpenPR ||
                merging ||
                hasConflictsCalculated ||
                isAttemptRunning ||
                selectedRepoStatus?.is_target_remote ||
                ((selectedRepoStatus?.commits_ahead ?? 0) === 0 &&
                  !pushSuccess &&
                  !mergeSuccess)
              }
              variant="outline"
              size="xs"
              className="border-success text-success hover:bg-success gap-1 shrink-0"
              aria-label={mergeButtonLabel}
            >
              <GitBranchIcon className="h-3.5 w-3.5" />
              <span className="truncate max-w-[10ch]">{mergeButtonLabel}</span>
            </Button>

            {/* 撤销合并按钮 - 只在有 direct merge 时显示 */}
            {mergeInfo.latestMerge?.type === 'direct' && (
              <Button
                onClick={handleRevertMergeClick}
                disabled={reverting || isAttemptRunning}
                variant="outline"
                size="xs"
                className="border-destructive text-destructive hover:bg-destructive gap-1 shrink-0"
                aria-label={t('git.revert.button')}
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="truncate max-w-[10ch]">
                  {reverting ? t('git.revert.reverting') : t('git.revert.button')}
                </span>
              </Button>
            )}

            <Button
              onClick={handlePRButtonClick}
              disabled={
                mergeInfo.hasMergedPR ||
                pushing ||
                isAttemptRunning ||
                hasConflictsCalculated ||
                (mergeInfo.hasOpenPR &&
                  (selectedRepoStatus?.remote_commits_ahead ?? 0) === 0) ||
                ((selectedRepoStatus?.commits_ahead ?? 0) === 0 &&
                  (selectedRepoStatus?.remote_commits_ahead ?? 0) === 0 &&
                  !pushSuccess &&
                  !mergeSuccess)
              }
              variant="outline"
              size="xs"
              className="border-info text-info hover:bg-info gap-1 shrink-0"
              aria-label={prButtonLabel}
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              <span className="truncate max-w-[10ch]">{prButtonLabel}</span>
            </Button>

            <Button
              onClick={handleRebaseDialogOpen}
              disabled={rebasing || isAttemptRunning || hasConflictsCalculated}
              variant="outline"
              size="xs"
              className="border-warning text-warning hover:bg-warning gap-1 shrink-0"
              aria-label={rebaseButtonLabel}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${rebasing ? 'animate-spin' : ''}`}
              />
              <span className="truncate max-w-[10ch]">{rebaseButtonLabel}</span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default GitOperations;
