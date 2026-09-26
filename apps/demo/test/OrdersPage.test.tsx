import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerApiError } from '@foodops-partner/client';
import type { PartnerOrder } from '@foodops-partner/client';
import { saveTracked } from '../src/orders/orderStore';
import type { TrackedOrder } from '../src/orders/orderStore';
import { OrdersPage } from '../src/pages/OrdersPage';
import { fakeClient, renderWithProviders } from './render';

const tracked = (id: string, lastStatus: TrackedOrder['lastStatus']): TrackedOrder => ({
  id, reference: `SO-${id}`, partnerReference: `DEMO-${id}`, outletId: 'o', outletName: 'Marine Drive', createdAt: new Date().toISOString(),
  idempotencyKey: 'k', lastStatus, priceMismatch: false, partnerTotal: 95, total: 95,
});
const live = (id: string, status: PartnerOrder['status']): PartnerOrder => ({
  id, reference: `SO-${id}`, partnerReference: `DEMO-${id}`, status, reason: null, cancelledBy: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 },
});

beforeEach(() => localStorage.clear());

describe('OrdersPage', () => {
  it('polls only the non-terminal orders and shows live status', async () => {
    saveTracked(tracked('done', 'picked_up'));
    saveTracked(tracked('open', 'pending'));
    const getOrder = vi.fn(async (id: string) => live(id, 'accepted'));
    renderWithProviders(<OrdersPage />, { client: fakeClient({ getOrder }), route: '/orders' });
    const openRow = (await screen.findByText('SO-open')).closest('tr')!;
    expect(await screen.findByText('accepted')).toBeInTheDocument();
    expect(openRow).toHaveTextContent('accepted');
    expect(screen.getByText('SO-done').closest('tr')).toHaveTextContent('picked_up');
    expect(getOrder).toHaveBeenCalledTimes(1);
    expect(getOrder).toHaveBeenCalledWith('open');
    expect(openRow.querySelector('a')).toHaveAttribute('href', '/orders/open');
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
    expect((await screen.findByText('SO-here')).closest('tr')).toHaveTextContent('ready');
  });

  it('has an empty state', () => {
    renderWithProviders(<OrdersPage />, { route: '/orders' });
    expect(screen.getByText(/no orders placed from this browser yet/i)).toBeInTheDocument();
  });
});
