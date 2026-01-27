import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjects } from '@/hooks/useProjects';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import type { Project } from 'shared/types';
import { cn } from '@/lib/utils';

interface ProjectSelectorProps {
  currentProjectId: string;
}

// Component to display a single project option with task counts
function ProjectOptionContent({
  project,
  isSelected,
  onLatestTaskTime,
}: {
  project: Project;
  isSelected: boolean;
  onLatestTaskTime?: (projectId: string, time: number) => void;
}) {
  const { tasksByStatus, tasks, isLoading: tasksLoading } = useProjectTasks(
    project.id
  );

  // Calculate latest task time and notify parent
  useMemo(() => {
    if (onLatestTaskTime) {
      if (tasks.length > 0) {
        const latestTime = Math.max(
          ...tasks.map((task) => new Date(task.created_at as string).getTime())
        );
        onLatestTaskTime(project.id, latestTime);
      } else {
        // Use project creation time if no tasks
        onLatestTaskTime(
          project.id,
          new Date(project.created_at as string).getTime()
        );
      }
    }
  }, [tasks, project.id, project.created_at, onLatestTaskTime]);

  const statusCounts = useMemo(
    () => ({
      todo: tasksByStatus.todo.length,
      inprogress: tasksByStatus.inprogress.length,
      inreview: tasksByStatus.inreview.length,
      done: tasksByStatus.done.length,
      cancelled: tasksByStatus.cancelled.length,
    }),
    [tasksByStatus]
  );

  const hasInProgress = statusCounts.inprogress > 0;

  const statusItems = [
    {
      key: 'todo' as const,
      label: 'TODO',
      color: 'text-slate-600 dark:text-slate-300',
    },
    {
      key: 'inprogress' as const,
      label: 'PROGRESS',
      color: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'inreview' as const,
      label: 'REVIEW',
      color: 'text-[#db7806]',
    },
    {
      key: 'done' as const,
      label: 'DONE',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
  ] as const;

  const visibleStatusItems = tasksLoading
    ? statusItems
    : statusItems.filter((item) => statusCounts[item.key] > 0);

  return (
    <div className="flex items-start gap-2 w-full">
      <div className="w-4 flex-shrink-0">
        {isSelected && <Check className="h-4 w-4" />}
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{project.name}</span>
          {hasInProgress && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 flex-shrink-0">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {statusCounts.inprogress}
            </span>
          )}
        </div>
        {visibleStatusItems.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {visibleStatusItems.map((item, index) => (
              <span key={item.key} className="inline-flex items-center gap-0.5">
                <span className="uppercase tracking-wide">{item.label}</span>
                <span
                  className={`font-semibold tabular-nums ${item.color} ${
                    tasksLoading ? 'opacity-60' : ''
                  }`}
                >
                  {tasksLoading ? '--' : statusCounts[item.key]}
                </span>
                {index < visibleStatusItems.length - 1 && (
                  <span className="text-muted-foreground/40 ml-0.5">|</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectSelector({ currentProjectId }: ProjectSelectorProps) {
  const navigate = useNavigate();
  const { projects, isLoading } = useProjects();
  const [latestTaskTimes, setLatestTaskTimes] = useState<
    Record<string, number>
  >({});
  const [isOpen, setIsOpen] = useState(false);

  const handleLatestTaskTime = useCallback(
    (projectId: string, time: number) => {
      setLatestTaskTimes((prev) => {
        if (prev[projectId] === time) return prev;
        return { ...prev, [projectId]: time };
      });
    },
    []
  );

  const handleProjectChange = (projectId: string) => {
    if (projectId !== currentProjectId) {
      navigate(`/projects/${projectId}/tasks`);
    }
    setIsOpen(false);
  };

  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId),
    [projects, currentProjectId]
  );

  // Sort projects by latest task time (newest first)
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const timeA = latestTaskTimes[a.id] || 0;
      const timeB = latestTaskTimes[b.id] || 0;
      // If both have task times, sort by task time
      if (timeA > 0 && timeB > 0) {
        return timeB - timeA;
      }
      // Otherwise sort by project creation time
      return (
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
      );
    });
  }, [projects, latestTaskTimes]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">加载项目...</span>
      </div>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 px-2 py-1 h-auto font-normal hover:bg-accent"
        >
          <span className="font-semibold text-lg">
            {currentProject?.name || '选择项目'}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[350px] max-h-[400px] overflow-y-auto"
      >
        {sortedProjects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => handleProjectChange(project.id)}
            className={cn(
              'cursor-pointer py-2',
              project.id === currentProjectId && 'bg-accent'
            )}
          >
            <ProjectOptionContent
              project={project}
              isSelected={project.id === currentProjectId}
              onLatestTaskTime={handleLatestTaskTime}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
