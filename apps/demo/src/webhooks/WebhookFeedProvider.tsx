import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isMenuEvent } from '@foodops-partner/client';
import { ReceiverControl } from '@foodops-partner/webhook-receiver/control-client';
import { applyWebhookEvent, menuIsBehind } from './applyEvent';
import { useWebhook } from './useWebhook';
import { FEED_POLL_MS, MENU_RECHECK_MS, WEBHOOK_LIVENESS_MS, WebhookFeedContext } from './webhookFeed';
import type { WebhookFeedValue } from './webhookFeed';
import { loadWebhookSettings } from './webhookSettings';

/** Reads what the receiver accepted, applies each event once, and tells the pages whether webhooks are live. */
export function WebhookFeedProvider({ children, pollMs = FEED_POLL_MS, recheckMs = MENU_RECHECK_MS, livenessMs = WEBHOOK_LIVENESS_MS }: {
  children: ReactNode; pollMs?: number; recheckMs?: number; livenessMs?: number;
}) {
  const queryClient = useQueryClient();
  const settings = loadWebhookSettings();
  // While our webhook is registered, keep asking the restaurant how its deliveries are going: a receiver that
  // holds a secret says nothing about whether events reach it (a dead tunnel, an older secret).
  const hook = useWebhook({ refetchMs: (current) => (current != null && current.url === settings.publicUrl ? livenessMs : false) });
  // Someone else's receiver may be registered for this key; only our own makes the feed worth reading.
  const registeredHere = hook.data != null && hook.data.url === settings.publicUrl;
  // Where reading stopped, and in which run of which receiver: `seq` means nothing outside that run.
  const position = useRef<{ receiverUrl: string; bootId: string | null; seq: number }>({ receiverUrl: settings.receiverUrl, bootId: null, seq: 0 });
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
      // Another control address is another receiver: its numbering has nothing to do with the last one's.
      if (position.current.receiverUrl !== settings.receiverUrl) position.current = { receiverUrl: settings.receiverUrl, bootId: null, seq: 0 };
      const at = position.current;
      const page = await new ReceiverControl(settings.receiverUrl).events(at.seq);
      const restarted = (at.bootId !== null && page.bootId !== at.bootId) || page.lastSeq < at.seq;
      at.bootId = page.bootId;
      // A restarted receiver counts from 1 again, so this page (asked from the old position) may have skipped
      // events: start over on the next read, and let the stale-event rule drop any replays.
      if (restarted && at.seq > 0) {
        at.seq = 0;
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
      at.seq = page.lastSeq;
      return { lastSeq: page.lastSeq, hasSecret: page.hasSecret };
    },
  });

  // A receiver with no secret answers this page but refuses every delivery: that is not a working webhook.
  // Neither is one the restaurant cannot deliver to, nor one whose state could not be read just now.
  const delivering = registeredHere && !hook.isError && hook.data?.consecutiveFailures === 0;
  const active = delivering && feed.status === 'success' && feed.data.hasSecret;
  const value = useMemo<WebhookFeedValue>(() => ({ active }), [active]);
  return <WebhookFeedContext.Provider value={value}>{children}</WebhookFeedContext.Provider>;
}
