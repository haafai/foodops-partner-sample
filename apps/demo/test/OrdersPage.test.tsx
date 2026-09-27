import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerApiError } from '@foodops-partner/client';
import type { PartnerOrder } from '@foodops-partner/client';
import { listTracked, saveTracked } from '../src/orders/orderStore';
import type { TrackedOrder } from '../src/orders/orderStore';
import { OrdersPage } from '../src/pages/OrdersPage';
import { BOARD_POLL_MS } from '../src/orders/polling';
import { fakeClient, renderWithProviders } from './render';

const tracked = (id: string, lastStatus: TrackedOrder['lastStatus'], outletName = 'Marine Drive'): TrackedOrder => ({
  id, reference: `SO-${id}`, partnerReference: `DEMO-${id}`, outletId: 'o', outletName, createdAt: new Date().toISOString(),
  idempotencyKey: 'k', lastStatus, priceMismatch: false, partnerTotal: 95, total: 95,
});
const live = (id: string, status: PartnerOrder['status']): PartnerOrder => ({
  id, reference: `SO-${id}`, partnerReference: `DEMO-${id}`, status, reason: null, cancelledBy: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 },
});
const cardOf = (reference: string) => screen.getByText(reference).closest('article')!;

beforeEach(() => localStorage.clear());

describe('OrdersPage', () => {
  it('polls only the non-terminal orders and shows live status on each card', async () => {
    saveTracked(tracked('done', 'picked_up'));
    saveTracked(tracked('open', 'pending'));
    const getOrder = vi.fn(async (id: string) => live(id, 'accepted'));
    renderWithProviders(<OrdersPage />, { client: fakeClient({ getOrder }), route: '/orders' });
    await screen.findByText('SO-open');
    expect(await screen.findByText('Accepted')).toHaveAttribute('data-status', 'accepted');
    expect(cardOf('SO-open')).toHaveTextContent('Accepted');
    expect(cardOf('SO-open')).toHaveTextContent('Marine Drive');
    expect(within(cardOf('SO-done')).getByText('Picked up')).toHaveAttribute('data-status', 'picked_up');
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledWith('open');
    expect(cardOf('SO-open').querySelector('a')).toHaveAttribute('href', '/orders/open');
  });

  it('says when a tracked order is no longer visible with this key, and keeps the others', async () => {
    saveTracked(tracked('gone', 'pending'));
    saveTracked(tracked('here', 'pending'));
    const getOrder = vi.fn(async (id: string) => {
      if (id === 'gone') throw new PartnerApiError({ status: 404, code: 'not_found', message: 'no' });
      return live(id, 'ready');
    });
    renderWithProviders(<OrdersPage />, { client: fakeClient({ getOrder }), route: '/orders' });
    expect(await screen.findByText(/not visible with this key/i)).toBeInTheDocument();
    expect(cardOf('SO-gone')).toHaveTextContent(/not visible with this key/i);
    await waitFor(() => expect(cardOf('SO-here')).toHaveTextContent('Ready'));
  });

  it('stops polling a row whose query errored, and keeps polling the others', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      saveTracked(tracked('gone', 'pending'));
      saveTracked(tracked('here', 'pending'));
      const getOrder = vi.fn(async (id: string) => {
        if (id === 'gone') throw new PartnerApiError({ status: 404, code: 'not_found', message: 'no' });
        return live(id, 'accepted');
      });
      renderWithProviders(<OrdersPage />, { client: fakeClient({ getOrder }), route: '/orders' });
      expect(await screen.findByText(/not visible with this key/i)).toBeInTheDocument();
      await waitFor(() => expect(getOrder.mock.calls.filter(([id]) => id === 'here')).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(BOARD_POLL_MS * 2 + 100);
      await waitFor(() => expect(getOrder.mock.calls.filter(([id]) => id === 'here').length).toBeGreaterThanOrEqual(3));
      expect(getOrder.mock.calls.filter(([id]) => id === 'gone')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes a status reached only on the board back into the store, so polling stops', async () => {
    saveTracked(tracked('open', 'pending'));
    const getOrder = vi.fn(async () => live('open', 'picked_up'));
    renderWithProviders(<OrdersPage />, { client: fakeClient({ getOrder }), route: '/orders' });
    await screen.findByText('SO-open');
    expect(await screen.findByText('Picked up')).toBeInTheDocument();
    expect(cardOf('SO-open')).toHaveTextContent('Picked up');
    await waitFor(() => expect(listTracked().find((o) => o.id === 'open')?.lastStatus).toBe('picked_up'));
  });

  it('truncates a very long restaurant name and keeps the full name in its title', async () => {
    const LONG = 'Thegrandoceanviewrooftopkitchenandcoffeehouseofthesouthernharbour';
    saveTracked(tracked('done', 'picked_up', LONG));
    renderWithProviders(<OrdersPage />, { client: fakeClient(), route: '/orders' });
    const name = screen.getByText(LONG);
    expect(name).toHaveAttribute('title', LONG);
    expect(name.className).toContain('truncate');
  });

  it('has an empty state that points back to the restaurants', () => {
    renderWithProviders(<OrdersPage />, { route: '/orders' });
    expect(screen.getByText(/no orders placed from this browser yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a restaurant' })).toHaveAttribute('href', '/outlets');
  });
});
