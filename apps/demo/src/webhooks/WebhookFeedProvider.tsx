import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isMenuEvent } from '@foodops-partner/client';
import { ReceiverControl } from '@foodops-partner/webhook-receiver/control-client';
import { applyWebhookEvent, menuIsBehind } from './applyEvent';
import { useWebhook } from './useWebhook';
import { FEED_POLL_MS, MENU_RECHECK_MS, WebhookFeedContext } from './webhookFeed';
import type { WebhookFeedValue } from './webhookFeed';
import { loadWebhookSettings } from './webhookSettings';

/** Reads what the receiver accepted, applies each event once, and tells the pages whether webhooks are live. */
export function WebhookFeedProvider({ children, pollMs = FEED_POLL_MS, recheckMs = MENU_RECHECK_MS }: { children: ReactNode; pollMs?: number; recheckMs?: number }) {
  const queryClient = useQueryClient();
  const hook = useWebhook();
  const settings = loadWebhookSettings();
  // Someone else's receiver may be registered for this key; only our own makes the feed worth reading.
  const registeredHere = hook.data != null && hook.data.url === settings.publicUrl;
  const cursor = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const feed = useQuery({
    queryKey: ['webhook-feed', settings.receiverUrl],
    enabled: registeredHere,
    refetchInterval: pollMs,
    retry: false,
    queryFn: async () => {
      const page = await new ReceiverControl(settings.receiverUrl).events(cursor.current);
      // A restarted receiver counts from zero again: start over, and let the stale-event rule drop the replays.
      if (page.lastSeq < cursor.current) {
        cursor.current = 0;
        return { lastSeq: page.lastSeq, hasSecret: page.hasSecret };
      }
      for (const { event } of page.events) {
        const outcome = applyWebhookEvent(event, queryClient);
        if (outcome === 'refetch_menu' && isMenuEvent(event)) {
          const { outletId, version } = event.data;
          const timer = setTimeout(() => {
            timers.current.delete(timer);
            if (menuIsBehind(queryClient, outletId, version)) void queryClient.invalidateQueries({ queryKey: ['menu', outletId] });
          }, recheckMs);
          timers.current.add(timer);
        }
      }
      cursor.current = page.lastSeq;
      return { lastSeq: page.lastSeq, hasSecret: page.hasSecret };
    },
  });

  // A receiver with no secret answers this page but refuses every delivery: that is not a working webhook.
  const active = registeredHere && feed.status === 'success' && feed.data.hasSecret;
  const value = useMemo<WebhookFeedValue>(() => ({ active }), [active]);
  return <WebhookFeedContext.Provider value={value}>{children}</WebhookFeedContext.Provider>;
}
