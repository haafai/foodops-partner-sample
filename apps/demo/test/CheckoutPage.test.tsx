import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { PartnerApiError } from '@foodops-partner/client';
import { lineFromSelection } from '../src/cart/cart';
import { listTracked } from '../src/orders/orderStore';
import { CheckoutPage } from '../src/pages/CheckoutPage';
import { CLASSIC } from './menu-fixture';
import { fakeClient, renderWithProviders } from './render';

const created = { id: 'order-1', reference: 'SO-10001', status: 'pending' as const, totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 }, priceMismatch: false, partnerTotal: 95 };
const cart = { outlet: { outletId: 'o-marine', name: 'Marine Drive' }, lines: [lineFromSelection(CLASSIC, CLASSIC.variants[0], [], 1, '')] };

function renderCheckout(createOrder: ReturnType<typeof vi.fn>) {
  const client = fakeClient({ createOrder });
  renderWithProviders(
    <Routes>
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/orders/:orderId" element={<h1>Tracking order-1</h1>} />
    </Routes>,
    { client, route: '/checkout', cart },
  );
}

beforeEach(() => localStorage.clear());

describe('CheckoutPage', () => {
  it('reuses the displayed idempotency key when retrying after a failure, then tracks the order', async () => {
    const user = userEvent.setup();
    const createOrder = vi.fn()
      .mockRejectedValueOnce(new PartnerApiError({ status: 503, code: 'auth_unavailable', message: 'down' }))
      .mockResolvedValueOnce(created);
    renderCheckout(createOrder);
    await user.type(screen.getByLabelText(/customer name/i), 'Aishath');
    const shownKey = screen.getByTestId('idempotency-key').textContent!;
    await user.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Setup problem: auth_unavailable/);
    await user.click(screen.getByRole('button', { name: /try again with the same key/i }));
    expect(await screen.findByText('Tracking order-1')).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createOrder.mock.calls[0][1]).toBe(shownKey);
    expect(createOrder.mock.calls[1][1]).toBe(shownKey);
    expect(createOrder.mock.calls[1][0]).toEqual(createOrder.mock.calls[0][0]);
    expect(createOrder.mock.calls[0][0]).toMatchObject({ outletId: 'o-marine', customer: { name: 'Aishath', phone: '' }, partnerTotal: 95 });
    expect(listTracked()).toMatchObject([{ id: 'order-1', reference: 'SO-10001', idempotencyKey: shownKey, outletName: 'Marine Drive', lastStatus: 'pending' }]);
  });

  it('mints a new key when the request changes', async () => {
    const user = userEvent.setup();
    renderCheckout(vi.fn());
    const before = screen.getByTestId('idempotency-key').textContent;
    await user.type(screen.getByLabelText(/order notes/i), 'extra napkins');
    expect(screen.getByTestId('idempotency-key').textContent).not.toBe(before);
  });

  it('after a failure, editing the request turns the retry button back into "Place order" with a new key', async () => {
    const user = userEvent.setup();
    const createOrder = vi.fn().mockRejectedValueOnce(new PartnerApiError({ status: 503, code: 'auth_unavailable', message: 'down' }));
    renderCheckout(createOrder);
    const failedKey = screen.getByTestId('idempotency-key').textContent;
    await user.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('button', { name: /try again with the same key/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/order notes/i), 'no onions');
    expect(screen.getByRole('button', { name: 'Place order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again with the same key/i })).toBeNull();
    expect(screen.getByTestId('idempotency-key').textContent).not.toBe(failedKey);
  });

  it('disables the form while the order is being placed', async () => {
    const user = userEvent.setup();
    let resolve!: (value: typeof created) => void;
    const createOrder = vi.fn(() => new Promise<typeof created>((r) => { resolve = r; }));
    renderCheckout(createOrder);
    await user.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('button', { name: /placing/i })).toBeDisabled();
    expect(screen.getByLabelText(/customer name/i)).toBeDisabled();
    expect(screen.getByLabelText(/order notes/i)).toBeDisabled();
    resolve(created);
    expect(await screen.findByText('Tracking order-1')).toBeInTheDocument();
  });

  it('offers the existing order on duplicate_order', async () => {
    const user = userEvent.setup();
    const createOrder = vi.fn().mockRejectedValueOnce(new PartnerApiError({ status: 409, code: 'duplicate_order', message: 'dup', details: { orderId: 'order-1' } }));
    renderCheckout(createOrder);
    await user.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByRole('link', { name: /open the existing order/i })).toHaveAttribute('href', '/orders/order-1');
  });
});
