import { useQuery } from '@tanstack/react-query';
import type { CommitInfo } from 'shared/types';

export function useWorktreeCommits(attemptId: string | undefined, repoId: string | undefined) {
  return useQuery({
    queryKey: ['worktree-commits', attemptId, repoId],
    queryFn: async () => {
      if (!attemptId || !repoId) {
        throw new Error('attemptId and repoId are required');
      }

      const response = await fetch(
        `/api/task-attempts/${attemptId}/worktree-commits?repo_id=${repoId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch commits: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data as CommitInfo[];
    },
    enabled: !!attemptId && !!repoId,
  });
}
