import { useQuery } from '@tanstack/react-query';
import type { PartnerWebhook } from '@foodops-partner/client';
import { useSession } from '../config/SessionProvider';

export const WEBHOOK_QUERY_KEY = ['webhook'] as const;

/** The endpoint registered for this key, or null. `live` re-reads it so the last delivery stays current. */
export function useWebhook(options: { live?: boolean } = {}) {
  const { client } = useSession();
  return useQuery<PartnerWebhook | null>({
    queryKey: WEBHOOK_QUERY_KEY,
    enabled: client !== null,
    queryFn: () => client!.getWebhook(),
    staleTime: 30_000,
    refetchInterval: options.live ? 15_000 : false,
    retry: false,
  });
}
