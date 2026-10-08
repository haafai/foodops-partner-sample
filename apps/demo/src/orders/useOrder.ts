import { useQuery } from '@tanstack/react-query';
import { PartnerApiError } from '@foodops-partner/client';
import type { PartnerOrder } from '@foodops-partner/client';
import { useSession } from '../config/SessionProvider';
import { useWebhookFeed } from '../webhooks/webhookFeed';
import { pollIntervalMs } from './polling';

export function useOrder(orderId: string) {
  const { client } = useSession();
  const { active } = useWebhookFeed();
  return useQuery<PartnerOrder>({
    queryKey: ['order', orderId],
    enabled: client !== null && orderId !== '',
    queryFn: () => client!.getOrder(orderId),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      const error = query.state.error;
      if (!data) return false;
      return pollIntervalMs({
        status: data.status, createdAt: data.createdAt, now: Date.now(),
        retryAfterSeconds: error instanceof PartnerApiError ? error.retryAfterSeconds : undefined,
        webhookActive: active,
      });
    },
  });
}
