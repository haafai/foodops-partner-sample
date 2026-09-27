import { screen, within } from '@testing-library/react';
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
const track = (outletName: string, extra: { priceMismatch?: boolean; partnerTotal?: number } = {}) => saveTracked({
  id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', outletId: 'o', outletName, createdAt: new Date().toISOString(),
  idempotencyKey: 'k', lastStatus: 'pending', priceMismatch: extra.priceMismatch ?? false, partnerTotal: extra.partnerTotal ?? 95, total: 95,
});

function renderOrder(client: ReturnType<typeof fakeClient>, mode: 'mock' | 'local' = 'local') {
  renderWithProviders(<Routes><Route path="/orders/:orderId" element={<OrderPage />} /></Routes>, { client, route: '/orders/order-1', mode });
}
const steps = () => within(screen.getByRole('list', { name: 'Order progress' }));

beforeEach(() => localStorage.clear());

describe('OrderPage', () => {
  it('disables cancel once the kitchen has started, and says so in the hero and on the stepper', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('preparing')) }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('preparing');
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeDisabled();
    expect(screen.getByText(/checking every 5 s/i)).toBeInTheDocument();
    expect(screen.getByTestId('status-title')).toHaveTextContent('Being prepared');
    expect(screen.getByText('You can no longer cancel from here.')).toBeInTheDocument();
    expect(steps().getAllByRole('listitem')).toHaveLength(5);
    expect(steps().getByText('Preparing').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(steps().getByText('Ready').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('names the restaurant in the hero when the order was placed from this browser', async () => {
    track('Marine Drive');
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')) }));
    expect(await screen.findByTestId('status-title')).toHaveTextContent('Waiting for Marine Drive to accept');
    expect(screen.getByText('SO-10001 · your reference DEMO-1')).toBeInTheDocument();
  });

  it('cancels a pending order with the reason and one idempotency key, and shows the result', async () => {
    const user = userEvent.setup();
    const cancelOrder = vi.fn(async () => order('cancelled', { cancelledBy: 'partner', reason: 'Partner: Customer cancelled' }));
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')), cancelOrder }));
    await screen.findByTestId('order-status');
    expect(screen.getByTestId('status-title')).toHaveTextContent('Waiting for the restaurant to accept');
    await user.click(screen.getByRole('button', { name: /cancel order/i }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('cancelled');
    expect(cancelOrder).toHaveBeenCalledWith('order-1', 'Customer cancelled', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(screen.getByText(/final status/i)).toBeInTheDocument();
    expect(screen.getByTestId('status-title')).toHaveTextContent('Cancelled');
    expect(screen.getByText('by you · Partner: Customer cancelled')).toBeInTheDocument();
    expect(steps().getAllByRole('listitem')).toHaveLength(2);
    expect(steps().getByText('Cancelled').closest('li')).toHaveAttribute('aria-current', 'step');
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
    track('Marine Drive', { priceMismatch: true, partnerTotal: 80 });
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('rejected', { reason: 'Item unavailable' })) }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('rejected');
    expect(screen.getByTestId('status-title')).toHaveTextContent('Rejected by Marine Drive');
    expect(screen.getByText(/Item unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/95\.00.*differs from your estimate.*80\.00/);
    expect(steps().getAllByRole('listitem')).toHaveLength(2);
    expect(steps().getByText('Rejected').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('shows a status it has never heard of as it came, without breaking', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('on_hold' as PartnerOrderStatus)) }));
    expect(await screen.findByTestId('order-status')).toHaveTextContent('on_hold');
    expect(screen.getByTestId('status-title')).toHaveTextContent('on_hold');
    expect(steps().getAllByRole('listitem')).toHaveLength(5);
  });

  it('shows the restaurant simulator in mock mode', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')) }), 'mock');
    const simulator = await screen.findByRole('region', { name: /restaurant simulator/i });
    expect(within(simulator).getByRole('button', { name: 'Accept' })).toBeEnabled();
    expect(within(simulator).getByRole('button', { name: 'Advance' })).toBeDisabled();
    expect(within(simulator).getByRole('combobox', { name: 'Rejection reason' })).toBeInTheDocument();
  });

  it('hides the restaurant simulator outside mock mode', async () => {
    renderOrder(fakeClient({ getOrder: vi.fn(async () => order('pending')) }), 'local');
    expect(await screen.findByTestId('order-status')).toHaveTextContent('pending');
    expect(screen.queryByRole('region', { name: /restaurant simulator/i })).toBeNull();
  });
});
