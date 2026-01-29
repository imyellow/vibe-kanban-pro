import { useTranslation } from 'react-i18next';
import { Eye, FileDiff, X, History } from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/actions-dropdown';
import { usePostHog } from 'posthog-js/react';
import { WorkspaceWithSession } from '@/types/attempt';
import { CommitHistoryDialog } from '../dialogs';
import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: TaskWithAttemptStatus;
  attempt?: WorkspaceWithSession | null;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();

  // Fetch repos for the workspace
  const { data: repos } = useQuery({
    queryKey: ['attempt-repos', attempt?.id],
    queryFn: () => attemptsApi.getRepos(attempt!.id),
    enabled: !!attempt?.id,
  });

  const handleOpenCommitHistory = () => {
    const firstRepo = repos?.[0];
    if (attempt?.id && firstRepo?.id) {
      CommitHistoryDialog.show({
        attemptId: attempt.id,
        repoId: firstRepo.id,
      });
    }
  };

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && (
        <TooltipProvider>
          <ToggleGroup
            type="single"
            value={mode ?? ''}
            onValueChange={(v) => {
              const newMode = (v as LayoutMode) || null;

              // Track view navigation
              if (newMode === 'preview') {
                posthog?.capture('preview_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === 'diffs') {
                posthog?.capture('diffs_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === null) {
                // Closing the view (clicked active button)
                posthog?.capture('view_closed', {
                  trigger: 'button',
                  from_view: mode ?? 'attempt',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              }

              onModeChange(newMode);
            }}
            className="inline-flex gap-4"
            aria-label="Layout mode"
          >
            {attempt?.id && repos && repos.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="icon"
                    size="sm"
                    onClick={handleOpenCommitHistory}
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

            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="preview"
                  aria-label="Preview"
                  active={mode === 'preview'}
                >
                  <Eye className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.preview')}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="diffs"
                  aria-label="Diffs"
                  active={mode === 'diffs'}
                >
                  <FileDiff className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.diffs')}
              </TooltipContent>
            </Tooltip>
            {/* {attempt?.id && (
              <>
                <div className="h-4 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/workspaces/${attempt.id}`}
                      className="inline-flex items-center justify-center text-primary-foreground/70 hover:text-accent-foreground"
                      aria-label="Try the new UI"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {t('attemptHeaderActions.tryNewUI')}
                  </TooltipContent>
                </Tooltip>
              </>
            )} */}
          </ToggleGroup>
        </TooltipProvider>
      )}
      {typeof mode !== 'undefined' && onModeChange && (
        <div className="h-4 w-px bg-border" />
      )}
      <ActionsDropdown task={task} attempt={attempt} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
