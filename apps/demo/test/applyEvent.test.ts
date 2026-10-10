import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartnerOrder, PartnerOrderStatus, WebhookEnvelope } from '@foodops-partner/client';
import type { MenuState } from '../src/menu/useMenu';
import { listTracked, saveTracked } from '../src/orders/orderStore';
import { applyWebhookEvent, menuIsBehind } from '../src/webhooks/applyEvent';
import { MENU_FIXTURE } from './menu-fixture';

const T0 = '2026-10-08T09:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

const cachedOrder = (status: PartnerOrderStatus, updatedAt = T0): PartnerOrder => ({
  id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', status, reason: null, cancelledBy: null,
  createdAt: T0, updatedAt, totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 },
});
const track = (lastStatus: PartnerOrderStatus = 'pending', lastEventAt?: string) => saveTracked({
  id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', outletId: 'o-marine', outletName: 'Marine Drive', createdAt: T0,
  idempotencyKey: 'k', lastStatus, priceMismatch: false, partnerTotal: 95, total: 95, ...(lastEventAt ? { lastEventAt } : {}),
});
const orderEvent = (status: string, createdAt: string, extra: Record<string, unknown> = {}, id = `evt_${status}_${createdAt}`): WebhookEnvelope => ({
  id, type: `order.${status}`, createdAt, data: { orderId: 'order-1', partnerReference: 'DEMO-1', outletId: 'o-marine', status, ...extra },
});
const menuEvent = (version: string, outletId = 'o-marine'): WebhookEnvelope => ({ id: `evt_menu_${version}`, type: 'menu.updated', createdAt: at(1), data: { outletId, version } });

let queryClient: QueryClient;
const order = () => queryClient.getQueryData<PartnerOrder>(['order', 'order-1']);
const tracked = () => listTracked().find((o) => o.id === 'order-1');

beforeEach(() => {
  localStorage.clear();
  queryClient = new QueryClient();
});

describe('applyWebhookEvent: order events', () => {
  it('takes the new status from the event, on the cached order and on the tracked one', () => {
    track();
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('pending'));
    expect(applyWebhookEvent(orderEvent('accepted', at(5)), queryClient)).toBe('applied');
    expect(order()).toMatchObject({ status: 'accepted', reason: null, cancelledBy: null, updatedAt: at(5) });
    expect(tracked()).toMatchObject({ lastStatus: 'accepted', lastEventAt: at(5) });
  });

  it('carries reason and cancelledBy from a cancellation', () => {
    track('accepted');
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('accepted'));
    applyWebhookEvent(orderEvent('cancelled', at(9), { reason: 'Kitchen closed early', cancelledBy: 'restaurant' }), queryClient);
    expect(order()).toMatchObject({ status: 'cancelled', reason: 'Kitchen closed early', cancelledBy: 'restaurant' });
  });

  it('ignores an event created before the last one applied, and applies one created at the same instant', () => {
    track('ready', at(30));
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('ready', at(30)));
    expect(applyWebhookEvent(orderEvent('accepted', at(10)), queryClient)).toBe('stale');
    expect(order()?.status).toBe('ready');
    expect(tracked()).toMatchObject({ lastStatus: 'ready', lastEventAt: at(30) });
    expect(applyWebhookEvent(orderEvent('picked_up', at(30)), queryClient)).toBe('applied');
    expect(order()?.status).toBe('picked_up');
  });

  it('ignores an event older than the last answer GET gave, even when no event was applied before', () => {
    track('pending');
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('preparing', at(60)));
    expect(applyWebhookEvent(orderEvent('accepted', at(20)), queryClient)).toBe('stale');
    expect(order()?.status).toBe('preparing');
    expect(tracked()?.lastEventAt).toBeUndefined();
  });

  it('never moves a finished order, however new the event claims to be', () => {
    track('cancelled');
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('cancelled'));
    expect(applyWebhookEvent(orderEvent('accepted', at(500)), queryClient)).toBe('stale');
    expect(order()?.status).toBe('cancelled');
    expect(tracked()?.lastStatus).toBe('cancelled');
  });

  it('is harmless when the same events are replayed, in any order', () => {
    track();
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('pending'));
    const feed = [orderEvent('accepted', at(5)), orderEvent('preparing', at(40)), orderEvent('ready', at(90))];
    for (const event of feed) applyWebhookEvent(event, queryClient);
    for (const event of [...feed].reverse()) applyWebhookEvent(event, queryClient);
    for (const event of feed) applyWebhookEvent(event, queryClient);
    expect(order()).toMatchObject({ status: 'ready', updatedAt: at(90) });
    expect(tracked()).toMatchObject({ lastStatus: 'ready', lastEventAt: at(90) });
  });

  it('ignores an order this browser neither placed nor is showing', () => {
    expect(applyWebhookEvent(orderEvent('accepted', at(5)), queryClient)).toBe('unknown_order');
    expect(order()).toBeUndefined();
    expect(listTracked()).toEqual([]);
  });

  it('updates the tracked order and asks for a fresh read when there is no cached copy to patch', () => {
    track();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    expect(applyWebhookEvent(orderEvent('accepted', at(5)), queryClient)).toBe('applied');
    expect(tracked()).toMatchObject({ lastStatus: 'accepted', lastEventAt: at(5) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['order', 'order-1'] });
    expect(order()).toBeUndefined();
  });

  it('ignores a type it does not know, and an order event whose type and status disagree', () => {
    track();
    queryClient.setQueryData(['order', 'order-1'], cachedOrder('pending'));
    expect(applyWebhookEvent({ id: 'evt_x', type: 'invoice.paid', createdAt: at(5), data: { orderId: 'order-1' } }, queryClient)).toBe('ignored');
    expect(applyWebhookEvent({ ...orderEvent('accepted', at(5)), type: 'order.ready' }, queryClient)).toBe('ignored');
    expect(applyWebhookEvent(orderEvent('accepted', 'not a time'), queryClient)).toBe('ignored');
    expect(order()?.status).toBe('pending');
  });
});

describe('applyWebhookEvent: menu.updated', () => {
  const copy = (): MenuState => ({ menu: MENU_FIXTURE, etag: `"${MENU_FIXTURE.version}"`, checkedAt: 0, notModified: false });

  it('re-checks the outlet whose copy is behind', () => {
    queryClient.setQueryData(['menu', 'o-marine'], copy());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    expect(menuIsBehind(queryClient, 'o-marine', 'newer')).toBe(true);
    expect(applyWebhookEvent(menuEvent('newer'), queryClient)).toBe('refetch_menu');
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['menu', 'o-marine'] });
  });

  it('does nothing when the copy already has that version', () => {
    queryClient.setQueryData(['menu', 'o-marine'], copy());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    expect(applyWebhookEvent(menuEvent(MENU_FIXTURE.version), queryClient)).toBe('menu_current');
    expect(menuIsBehind(queryClient, 'o-marine', MENU_FIXTURE.version)).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does nothing for an outlet whose menu was never loaded', () => {
    queryClient.setQueryData(['menu', 'o-marine'], copy());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    expect(applyWebhookEvent(menuEvent('newer', 'o-lagoon'), queryClient)).toBe('no_copy');
    expect(menuIsBehind(queryClient, 'o-lagoon', 'newer')).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
