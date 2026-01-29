import { useQuery } from '@tanstack/react-query';
import type { CommitInfo } from 'shared/types';

export function useWorktreeCommits(attemptId: string | undefined, repoId: string | undefined) {
  return useQuery({
    queryKey: ['worktree-commits', attemptId, repoId],
    queryFn: async () => {
      if (!attemptId || !repoId) {
        throw new Error('attemptId and repoId are required');
      }

      console.log('[useWorktreeCommits] Fetching commits:', { attemptId, repoId });
      const url = `/api/task-attempts/${attemptId}/worktree-commits?repo_id=${repoId}`;
      console.log('[useWorktreeCommits] URL:', url);

      const response = await fetch(url);
      console.log('[useWorktreeCommits] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useWorktreeCommits] Error response:', errorText);
        throw new Error(`Failed to fetch commits: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[useWorktreeCommits] Response data:', data);
      console.log('[useWorktreeCommits] Commits:', data.data);
      return data.data as CommitInfo[];
    },
    enabled: !!attemptId && !!repoId,
  });
}
