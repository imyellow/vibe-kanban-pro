import { useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { History, X, GitMerge } from 'lucide-react';
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
import { FileDiffView } from '@/components/diffs/FileDiffView';
import type { CommitInfo } from 'shared/types';

export interface CommitHistoryDialogProps {
  attemptId: string;
  repoId: string;
}

const CommitHistoryDialog = NiceModal.create<CommitHistoryDialogProps>(
  ({ attemptId, repoId }) => {
    const modal = useModal();
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
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && modal.hide()}
        className="max-w-[95vw] w-[95vw] h-[95vh] p-0"
        uncloseable
      >
        <DialogContent className="flex flex-col h-full p-0">
          <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
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

          <div className="flex-1 flex overflow-hidden min-h-0">
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
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-mono text-sm text-muted-foreground">
                        {commit.short_hash}
                      </div>
                      {commit.is_merged && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded text-xs">
                          <GitMerge className="h-3 w-3" />
                          <span>已合并</span>
                        </div>
                      )}
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
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

export default defineModal(CommitHistoryDialog);
