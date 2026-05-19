import { useQuery } from "@tanstack/react-query";
import { getTask } from "@/shared/api/tasks";
import type { Task } from "@/shared/types/domain";

/**
 * Тянет таску с polling-ом каждые 2.5с, пока статус не станет done/failed.
 * Когда таска готова — polling останавливается, но кэш остаётся горячим.
 */
export function useTaskPolling(taskId: string | undefined) {
  return useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "failed") return false;
      return 2500;
    },
    staleTime: 0,
  });
}
