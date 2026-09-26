import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { PartnerApiError } from '@foodops-partner/client';
import type { PartnerOrder, PartnerOrderStatus } from '@foodops-partner/client';
import { saveTracked } from '../src/orders/orderStore';
import { OrderPage } from '../src/pages/OrderPage';
import { fakeClient, renderWithProviders } from './render';

const order = (status: PartnerOrderStatus, extra: Partial<PartnerOrder> = {}): PartnerOrder => ({
  id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', status, reason: null, cancelledBy: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 }, ...extra,
});

function renderOrder(client: ReturnType<typeof fakeClient>, mode: 'mock' | 'local' = 'local') {
  renderWithProviders(<Routes><Route path="/orders/:orderId" element={<OrderPage />} /></Routes>, { client, route: '/orders/order-1', mode });
}

beforeEach(() => localStorage.clear());

describe('OrderPage', () => {
  it('disables cancel once the kitchen has started', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('preparing')) }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('preparing');
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeDisabled();
    expect(screen.getByText(/checking every 5 s/i)).toBeInTheDocument();
  });

  it('cancels a pending order with the reason and one idempotency key, and shows the result', async () => {
    const user = userEvent.setup();
    const cancelOrder = vi.fn(async () => order('cancelled', { cancelledBy: 'partner', reason: 'Partner: Customer cancelled' }));
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')), cancelOrder }));
    await screen.findByTestId('order-status');
    await user.click(screen.getByRole('button', { name: /cancel order/i }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('cancelled');
    expect(cancelOrder).toHaveBeenCalledWith('order-1', 'Customer cancelled', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(screen.getByText(/final status/i)).toBeInTheDocument();
  });

  it('explains a 409 cannot_cancel and reloads the order', async () => {
    const user = userEvent.setup();
    const getOrder = vi.fn().mockResolvedValueOnce(order('accepted')).mockResolvedValue(order('preparing'));
    const cancelOrder = vi.fn().mockRejectedValue(new PartnerApiError({ status: 409, code: 'cannot_cancel', message: 'started' }));
    renderOrder(fakeClient({ getOrder, cancelOrder }));
    await screen.findByTestId('order-status');
    await user.click(screen.getByRole('button', { name: /cancel order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/kitchen has started/i);
    expect(await screen.findByTestId('order-status')).toHaveTextContent('preparing');
  });

  it('warns when the restaurant total differs from the estimate, and shows the rejection reason', async () => {
    saveTracked({ id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', outletId: 'o', outletName: 'Marine Drive', createdAt: new Date().toISOString(), idempotencyKey: 'k', lastStatus: 'pending', priceMismatch: true, partnerTotal: 80, total: 95 });
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('rejected', { reason: 'Item unavailable' })) }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('rejected');
    expect(screen.getByText(/Item unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/95\.00.*differs from your estimate.*80\.00/);
  });

  it('shows the restaurant simulator in mock mode', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')) }), 'mock');
    expect(await screen.findByRole('region', { name: /restaurant simulator/i })).toBeInTheDocument();
  });

  it('hides the restaurant simulator outside mock mode', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')) }), 'local');
    expect(await screen.findByTestId('order-status')).toHaveTextContent('pending');
    expect(screen.queryByRole('region', { name: /restaurant simulator/i })).toBeNull();
  });
});
