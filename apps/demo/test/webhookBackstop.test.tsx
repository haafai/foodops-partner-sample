import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import type { PartnerOrder, PartnerWebhook } from '@foodops-partner/client';
import { saveTracked } from '../src/orders/orderStore';
import { OrderPage } from '../src/pages/OrderPage';
import { OrdersPage } from '../src/pages/OrdersPage';
import { WebhookFeedProvider } from '../src/webhooks/WebhookFeedProvider';
import { saveWebhookSettings } from '../src/webhooks/webhookSettings';
import { fakeReceiver } from './receiver-fake';
import type { FakeReceiver } from './receiver-fake';
import { fakeClient, renderWithProviders } from './render';

const PUBLIC_URL = 'https://kaana-hooks.example.com/webhooks/foodops';
const hook: PartnerWebhook = { url: PUBLIC_URL, events: ['order', 'menu'], createdAt: '2026-10-08T09:00:00Z', updatedAt: '2026-10-08T09:00:00Z', lastDelivery: null, consecutiveFailures: 0 };
const order = (): PartnerOrder => ({
  id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', status: 'accepted', reason: null, cancelledBy: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 },
});

let receiver: FakeReceiver;
beforeEach(() => {
  localStorage.clear();
  saveWebhookSettings({ receiverUrl: 'http://127.0.0.1:4021', publicUrl: PUBLIC_URL });
  saveTracked({
    id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', outletId: 'o-marine', outletName: 'Marine Drive', createdAt: new Date().toISOString(),
    idempotencyKey: 'k', lastStatus: 'accepted', priceMismatch: false, partnerTotal: 95, total: 95,
  });
  receiver = fakeReceiver();
  receiver.secret = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
  vi.stubGlobal('fetch', receiver.fetch);
});
afterEach(() => vi.unstubAllGlobals());

const live = () => fakeClient({ getWebhook: vi.fn(async () => hook), getOrder: vi.fn(async () => order()) });
const polling = () => fakeClient({ getOrder: vi.fn(async () => order()) });

describe('what the pages say about polling', () => {
  it('the tracking page says live by webhook with a 60 s backstop while the feed is active', async () => {
    renderWithProviders(
      <WebhookFeedProvider pollMs={20}><Routes><Route path="/orders/:orderId" element={<OrderPage />} /></Routes></WebhookFeedProvider>,
      { client: live(), route: '/orders/order-1', mode: 'local' },
    );
    expect(await screen.findByText('Live by webhook; checking every 60 s as a backstop.')).toBeInTheDocument();
  });

  it('the tracking page keeps its usual pace when no webhook is registered', async () => {
    renderWithProviders(
      <WebhookFeedProvider pollMs={20}><Routes><Route path="/orders/:orderId" element={<OrderPage />} /></Routes></WebhookFeedProvider>,
      { client: polling(), route: '/orders/order-1', mode: 'local' },
    );
    expect(await screen.findByText('Checking every 5 s.')).toBeInTheDocument();
    expect(receiver.calls).toEqual([]);
  });

  it('the orders list says the same in its footer', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><OrdersPage /></WebhookFeedProvider>, { client: live(), route: '/orders' });
    expect(await screen.findByText(/Open ones update by webhook and are re-checked every 60 s as a backstop; finished ones are not\./)).toBeInTheDocument();
  });

  it('the orders list keeps its 15 s line without a webhook', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><OrdersPage /></WebhookFeedProvider>, { client: polling(), route: '/orders' });
    expect(await screen.findByText(/Open ones are re-checked every 15 s; finished ones are not\./)).toBeInTheDocument();
  });
});
