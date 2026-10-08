import type { QueryClient } from '@tanstack/react-query';
import { isMenuEvent, isOrderEvent, isTerminal } from '@foodops-partner/client';
import type { PartnerOrder, PartnerOrderStatus, WebhookEnvelope } from '@foodops-partner/client';
import type { MenuState } from '../menu/useMenu';
import { listTracked, updateTracked } from '../orders/orderStore';

export type ApplyOutcome =
  /** The order's status was taken from the event. */
  | 'applied'
  /** An older event, or one that would move a finished order: dropped. */
  | 'stale'
  /** Not an order this browser placed or is showing. */
  | 'unknown_order'
  /** The menu copy is out of date and a conditional re-fetch was started. */
  | 'refetch_menu'
  /** The copy already has the announced version. */
  | 'menu_current'
  /** No copy of that outlet's menu is held; the next visit fetches it. */
  | 'no_copy'
  /** A type this app does not handle, or a body that does not fit its type. */
  | 'ignored';

const time = (iso: string | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

/** True while the cached menu for an outlet is not the announced version. */
export function menuIsBehind(queryClient: QueryClient, outletId: string, version: string): boolean {
  const cached = queryClient.getQueryData<MenuState>(['menu', outletId]);
  return cached !== undefined && cached.menu.version !== version;
}

/**
 * Apply one VERIFIED event to what this app holds. Safe to call with the same event twice, and with events
 * out of order: delivery is one attempt with no ordering guarantee, and a reload replays what the receiver kept.
 */
export function applyWebhookEvent(event: WebhookEnvelope, queryClient: QueryClient): ApplyOutcome {
  if (isMenuEvent(event)) {
    const { outletId, version } = event.data;
    if (queryClient.getQueryData<MenuState>(['menu', outletId]) === undefined) return 'no_copy';
    if (!menuIsBehind(queryClient, outletId, version)) return 'menu_current';
    // The event says only that the menu changed. The menu query sends If-None-Match with the ETag it holds.
    void queryClient.invalidateQueries({ queryKey: ['menu', outletId] });
    return 'refetch_menu';
  }
  if (!isOrderEvent(event)) return 'ignored';

  const { orderId, status } = event.data;
  const tracked = listTracked().find((o) => o.id === orderId);
  const cached = queryClient.getQueryData<PartnerOrder>(['order', orderId]);
  if (!tracked && !cached) return 'unknown_order';

  const at = time(event.createdAt);
  if (Number.isNaN(at)) return 'ignored';
  // Older than the last event applied, or than the last answer GET gave: the app already knows better.
  const lastEvent = time(tracked?.lastEventAt);
  if (!Number.isNaN(lastEvent) && at < lastEvent) return 'stale';
  const lastRead = time(cached?.updatedAt);
  if (!Number.isNaN(lastRead) && at < lastRead) return 'stale';
  // A finished order never changes again, whatever arrives late.
  const current: PartnerOrderStatus | undefined = cached?.status ?? tracked?.lastStatus;
  if (current !== undefined && isTerminal(current) && current !== status) return 'stale';

  if (tracked) updateTracked(orderId, { lastStatus: status, lastEventAt: event.createdAt });
  if (cached) {
    queryClient.setQueryData<PartnerOrder>(['order', orderId], {
      ...cached, status, reason: event.data.reason ?? null, cancelledBy: event.data.cancelledBy ?? null, updatedAt: event.createdAt,
    });
  } else {
    // No copy to patch (the order page was never opened): let whoever is watching it read the truth.
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
  }
  return 'applied';
}
