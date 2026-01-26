import { useEffect, useMemo, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import type { Diff } from 'shared/types';
import { attemptsApi } from '@/lib/api';
import { defineModal } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface MergeCommitDialogProps {
  attemptId: string;
  repoId: string;
  defaultMessage: string;
  diffs: Diff[];
  taskTitle?: string;
  taskDescription?: string | null;
  targetBranch?: string | null;
}

export type MergeCommitDialogResult = {
  action: 'confirmed' | 'canceled';
  commitMessage?: string;
};

const MAX_DIFF_CONTEXT_CHARS = 12000;
const MAX_FILE_CONTENT_CHARS = 2000;

const truncate = (value: string, limit: number) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n... [truncated]`;
};

const summarizeDiffs = (diffs: Diff[]) => {
  const summary = diffs.reduce(
    (acc, diff) => {
      acc.filesChanged += 1;
      acc.linesAdded += diff.additions ?? 0;
      acc.linesRemoved += diff.deletions ?? 0;
      return acc;
    },
    { filesChanged: 0, linesAdded: 0, linesRemoved: 0 }
  );

  return summary;
};

const buildDiffContext = (diffs: Diff[]) => {
  if (diffs.length === 0) return '';

  let totalChars = 0;
  const sections: string[] = [];

  for (const diff of diffs) {
    const path = diff.newPath || diff.oldPath || 'unknown';
    let section = `File: ${path}\nChange: ${diff.change}\n`;

    if (diff.contentOmitted) {
      section += `Content omitted. Additions: ${diff.additions ?? 0}, Deletions: ${diff.deletions ?? 0}\n`;
    } else {
      if (diff.oldContent != null) {
        section += `--- Old\n${truncate(diff.oldContent, MAX_FILE_CONTENT_CHARS)}\n`;
      }
      if (diff.newContent != null) {
        section += `--- New\n${truncate(diff.newContent, MAX_FILE_CONTENT_CHARS)}\n`;
      }
    }

    section += '\n';

    if (totalChars + section.length > MAX_DIFF_CONTEXT_CHARS) {
      sections.push('... diff context truncated ...');
      break;
    }

    sections.push(section);
    totalChars += section.length;
  }

  return sections.join('\n');
};

const buildPrompt = ({
  taskTitle,
  taskDescription,
  targetBranch,
  diffSummary,
}: {
  taskTitle?: string;
  taskDescription?: string | null;
  targetBranch?: string | null;
  diffSummary: { filesChanged: number; linesAdded: number; linesRemoved: number };
}) => {
  const title = taskTitle?.trim() || 'Untitled task';
  const description = taskDescription?.trim() || 'None';
  const branch = targetBranch?.trim() || 'unknown';

  return [
    'You are a Git commit message generator.',
    'Generate the merge commit message for the target branch based on the task info and diff context.',
    '',
    'Requirements:',
    '- Output 1-3 lines. The first line is a concise title (<= 72 chars).',
    '- If a body is needed, leave a blank line before it.',
    '- Match the language used in the task title when possible.',
    '- Output only the commit message text. No extra commentary or code fences.',
    '',
    `Task title: ${title}`,
    `Task description: ${description}`,
    `Target branch: ${branch}`,
    `Diff summary: ${diffSummary.filesChanged} files, +${diffSummary.linesAdded} / -${diffSummary.linesRemoved} lines`,
    '',
    'Diff content is attached as a file.',
  ].join('\n');
};

const MergeCommitDialogImpl = NiceModal.create<MergeCommitDialogProps>(
  ({
    attemptId,
    repoId,
    defaultMessage,
    diffs,
    taskTitle,
    taskDescription,
    targetBranch,
  }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [message, setMessage] = useState(defaultMessage);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);

    useEffect(() => {
      setMessage(defaultMessage);
    }, [defaultMessage]);

    const diffSummary = useMemo(() => summarizeDiffs(diffs), [diffs]);
    const diffContext = useMemo(() => buildDiffContext(diffs), [diffs]);
    const prompt = useMemo(
      () =>
        buildPrompt({
          taskTitle,
          taskDescription,
          targetBranch,
          diffSummary,
        }),
      [taskTitle, taskDescription, targetBranch, diffSummary]
    );

    const canGenerate = diffContext.trim().length > 0 && !isGenerating;

    const handleGenerate = async () => {
      if (!canGenerate) return;
      setGenerateError(null);
      setIsGenerating(true);
      try {
        const response = await attemptsApi.generateMergeCommitMessage(attemptId, {
          repo_id: repoId,
          prompt,
          diff_context: diffContext,
        });
        if (response.message?.trim()) {
          setMessage(response.message.trim());
        }
      } catch (error) {
        const msg =
          error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : t('git.mergeCommitDialog.generateError');
        setGenerateError(msg);
      } finally {
        setIsGenerating(false);
      }
    };

    const handleConfirm = () => {
      if (!message.trim()) return;
      modal.resolve({
        action: 'confirmed',
        commitMessage: message.trim(),
      } as MergeCommitDialogResult);
      modal.hide();
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as MergeCommitDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('git.mergeCommitDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('git.mergeCommitDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="merge-commit-message" className="text-sm font-medium">
                {t('git.mergeCommitDialog.messageLabel')}
              </label>
              <Textarea
                id="merge-commit-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t('git.mergeCommitDialog.messagePlaceholder')}
                rows={6}
              />
              {generateError && (
                <p className="text-xs text-destructive">{generateError}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isGenerating
                  ? t('git.mergeCommitDialog.generating')
                  : t('git.mergeCommitDialog.generate')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t('common:buttons.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={!message.trim()}>
              {t('git.mergeCommitDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const MergeCommitDialog = defineModal<
  MergeCommitDialogProps,
  MergeCommitDialogResult
>(MergeCommitDialogImpl);
