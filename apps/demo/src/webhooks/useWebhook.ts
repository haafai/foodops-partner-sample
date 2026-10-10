import { useQuery } from '@tanstack/react-query';
import type { PartnerWebhook } from '@foodops-partner/client';
import { useSession } from '../config/SessionProvider';

export const WEBHOOK_QUERY_KEY = ['webhook'] as const;

export interface UseWebhookOptions {
  /** Re-read every 15 s so the last delivery stays current. A refused key is not asked again. */
  live?: boolean;
  /** For a reader that is not `live`: how often to re-read, given what is registered now. */
  refetchMs?: (hook: PartnerWebhook | null | undefined) => number | false;
}

/** The endpoint registered for this key, or null. */
export function useWebhook(options: UseWebhookOptions = {}) {
  const { client } = useSession();
  return useQuery<PartnerWebhook | null>({
    queryKey: WEBHOOK_QUERY_KEY,
    enabled: client !== null,
    queryFn: () => client!.getWebhook(),
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (options.live) return query.state.error ? false : 15_000;
      return options.refetchMs?.(query.state.data) ?? false;
    },
    retry: false,
  });
}
