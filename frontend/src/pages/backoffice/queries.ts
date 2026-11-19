import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { BackofficeForbidden } from '../../api/backoffice';
import { queryKeys } from '../../query/keys';

/**
 * Backoffice reads and writes (pagos-backoffice S6). A refused call (BackofficeForbidden: the
 * account stopped being a super admin) re-reads `me`, and the page then sends the person back to
 * Perfil; the session itself is not touched.
 */
function useOnForbidden() {
  const queryClient = useQueryClient();
  return (error: unknown) => {
    if (error instanceof BackofficeForbidden) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    }
  };
}

/** The app's retry rule (query/client.ts), plus: a refusal is never retried. */
function useRetry() {
  const fallback = useQueryClient().getDefaultOptions().queries?.retry;
  return (count: number, error: Error) => {
    if (error instanceof BackofficeForbidden) return false;
    if (typeof fallback === 'function') return fallback(count, error);
    return typeof fallback === 'number' ? count < fallback : Boolean(fallback);
  };
}

export function useBackofficeQuery<T>(queryKey: QueryKey, queryFn: () => Promise<T>) {
  const onForbidden = useOnForbidden();
  const retry = useRetry();
  return useQuery<T, Error>({
    queryKey,
    queryFn: async () => {
      try {
        return await queryFn();
      } catch (error) {
        onForbidden(error);
        throw error;
      }
    },
    retry,
    // A new page or filter keeps the rows on screen until the next ones arrive.
    placeholderData: (previous) => previous,
  });
}

/** A write; on success every backoffice list and the summary are read again. */
export function useBackofficeMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  const onForbidden = useOnForbidden();
  return useMutation<TResult, Error, TInput>({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.backoffice }),
    onError: onForbidden,
  });
}
