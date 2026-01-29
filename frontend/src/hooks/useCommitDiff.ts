import { useQuery } from '@tanstack/react-query';
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

      const response = await fetch(
        `/api/task-attempts/${attemptId}/commit-diff?repo_id=${repoId}&commit_hash=${commitHash}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch commit diff: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data as Diff[];
    },
    enabled: !!attemptId && !!repoId && !!commitHash,
  });
}
