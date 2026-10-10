import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PartnerMenu } from '@foodops-partner/client';
import { useSession } from '../config/SessionProvider';
import { menuPollMs } from '../orders/polling';
import { useWebhookFeed } from '../webhooks/webhookFeed';

export interface MenuState {
  menu: PartnerMenu;
  etag: string;
  checkedAt: number;
  /** True when the last check answered 304 and the copy above is still current. */
  notModified: boolean;
}

/**
 * Re-checks every 60 s with If-None-Match, so a steady menu costs one 304 per minute. With webhooks delivering,
 * `menu.updated` triggers the re-check and the timer drops to every ten minutes.
 */
export function useMenu(outletId: string) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const { active } = useWebhookFeed();
  return useQuery<MenuState>({
    queryKey: ['menu', outletId],
    enabled: client !== null && outletId !== '',
    refetchInterval: menuPollMs(active),
    staleTime: 60_000,
    queryFn: async () => {
      const previous = queryClient.getQueryData<MenuState>(['menu', outletId]);
      const result = await client!.getMenu(outletId, previous ? { ifNoneMatch: previous.etag } : {});
      if (!result.modified) {
        if (!previous) throw new Error('The menu answered 304 before this app had a copy.');
        return { ...previous, checkedAt: Date.now(), notModified: true };
      }
      return { menu: result.menu, etag: result.etag, checkedAt: Date.now(), notModified: false };
    },
  });
}
