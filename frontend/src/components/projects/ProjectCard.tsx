import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Calendar,
  Edit,
  ExternalLink,
  FolderOpen,
  Link2,
  Loader2,
  MoreHorizontal,
  Trash2,
  Unlink,
} from 'lucide-react';
import { Project } from 'shared/types';
import { useEffect, useRef } from 'react';
import { useOpenProjectInEditor } from '@/hooks/useOpenProjectInEditor';
import { useNavigateWithSearch, useProjectRepos } from '@/hooks';
import { projectsApi } from '@/lib/api';
import { LinkProjectDialog } from '@/components/dialogs/projects/LinkProjectDialog';
import { useTranslation } from 'react-i18next';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { useProjectTasks } from '@/hooks/useProjectTasks';

type Props = {
  project: Project;
  isFocused: boolean;
  setError: (error: string) => void;
  onEdit: (project: Project) => void;
};

function ProjectCard({ project, isFocused, setError, onEdit }: Props) {
  const navigate = useNavigateWithSearch();
  const ref = useRef<HTMLDivElement>(null);
  const handleOpenInEditor = useOpenProjectInEditor(project);
  const { t } = useTranslation('projects');

  const { data: repos } = useProjectRepos(project.id);
  const isSingleRepoProject = repos?.length === 1;
  const { tasksByStatus, isLoading: tasksLoading } = useProjectTasks(project.id);

  const statusCounts = {
    todo: tasksByStatus.todo.length,
    inprogress: tasksByStatus.inprogress.length,
    inreview: tasksByStatus.inreview.length,
    done: tasksByStatus.done.length,
    cancelled: tasksByStatus.cancelled.length,
  };
  const hasInProgress = statusCounts.inprogress > 0;
  const statusItems = [
    {
      key: 'todo',
      label: 'todo',
      color: 'text-slate-600 dark:text-slate-300',
    },
    {
      key: 'inprogress',
      label: 'progress',
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'inreview',
      label: 'review',
      color: 'text-teal-600 dark:text-teal-400',
    },
    {
      key: 'done',
      label: 'done',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'cancelled',
      label: 'cancelled',
      color: 'text-rose-600 dark:text-rose-400',
    },
  ] as const;
  const visibleStatusItems = tasksLoading
    ? statusItems
    : statusItems.filter((item) => statusCounts[item.key] > 0);

  const { unlinkProject } = useProjectMutations({
    onUnlinkError: (error) => {
      console.error('Failed to unlink project:', error);
      setError('Failed to unlink project');
    },
  });

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      ref.current.focus();
    }
  }, [isFocused]);

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to delete "${name}"? This action cannot be undone.`
      )
    )
      return;

    try {
      await projectsApi.delete(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      setError('Failed to delete project');
    }
  };

  const handleEdit = (project: Project) => {
    onEdit(project);
  };

  const handleOpenInIDE = () => {
    handleOpenInEditor();
  };

  const handleLinkProject = async () => {
    try {
      await LinkProjectDialog.show({
        projectId: project.id,
        projectName: project.name,
      });
    } catch (error) {
      console.error('Failed to link project:', error);
    }
  };

  const handleUnlinkProject = () => {
    const confirmed = window.confirm(
      `Are you sure you want to unlink "${project.name}"? The local project will remain, but it will no longer be linked to the remote project.`
    );
    if (confirmed) {
      unlinkProject.mutate(project.id);
    }
  };

  return (
    <Card
      className="group relative cursor-pointer overflow-hidden border bg-card/80 shadow-sm outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/60"
      onClick={() => navigate(`/projects/${project.id}/tasks`)}
      tabIndex={isFocused ? 0 : -1}
      ref={ref}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg leading-tight">
                {project.name}
              </CardTitle>
              {hasInProgress && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {statusCounts.inprogress}{' '}
                  {statusCounts.inprogress === 1 ? 'task' : 'tasks'} In Progress
                </span>
              )}
            </div>
            {visibleStatusItems.length > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground shadow-inner whitespace-nowrap">
                {visibleStatusItems.map((item, index) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1"
                  >
                    <span className="uppercase tracking-wide">{item.label}</span>
                    <span
                      className={`font-semibold tabular-nums ${item.color} ${
                        tasksLoading ? 'opacity-60' : ''
                      }`}
                    >
                      {tasksLoading ? '--' : statusCounts[item.key]}
                    </span>
                    {index < visibleStatusItems.length - 1 && (
                      <span className="text-muted-foreground/40">|</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/projects/${project.id}`);
                  }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('viewProject')}
                </DropdownMenuItem>
                {isSingleRepoProject && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenInIDE();
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    {t('openInIDE')}
                  </DropdownMenuItem>
                )}
                {project.remote_project_id ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnlinkProject();
                    }}
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    {t('unlinkFromOrganization')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLinkProject();
                    }}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {t('linkToOrganization')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(project);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common:buttons.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id, project.name);
                  }}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common:buttons.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <CardDescription className="flex items-center">
          <Calendar className="mr-1 h-3 w-3" />
          {t('createdDate', {
            date: new Date(project.created_at).toLocaleDateString(),
          })}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export default ProjectCard;
