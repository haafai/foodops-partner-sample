import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartnerOrder, PartnerOrderStatus, PartnerWebhook } from '@foodops-partner/client';
import { useMenu } from '../src/menu/useMenu';
import { saveTracked } from '../src/orders/orderStore';
import { useOrder } from '../src/orders/useOrder';
import { WebhookFeedProvider } from '../src/webhooks/WebhookFeedProvider';
import { useWebhookFeed } from '../src/webhooks/webhookFeed';
import { saveWebhookSettings } from '../src/webhooks/webhookSettings';
import { MENU_FIXTURE } from './menu-fixture';
import { fakeReceiver } from './receiver-fake';
import type { FakeReceiver } from './receiver-fake';
import { fakeClient, renderWithProviders } from './render';

const PUBLIC_URL = 'https://kaana-hooks.example.com/webhooks/foodops';
const hook = (url = PUBLIC_URL, consecutiveFailures = 0): PartnerWebhook => ({ url, events: ['order', 'menu'], createdAt: '2026-10-08T09:00:00Z', updatedAt: '2026-10-08T09:00:00Z', lastDelivery: null, consecutiveFailures });
const order = (status: PartnerOrderStatus): PartnerOrder => ({
  id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', status, reason: null, cancelledBy: null,
  createdAt: '2026-10-08T09:00:00.000Z', updatedAt: '2026-10-08T09:00:00.000Z', totals: { subtotal: 95, tax: 7.04, serviceCharge: 0, total: 95 },
});

function Probe() {
  const { active } = useWebhookFeed();
  const query = useOrder('order-1');
  return (
    <div>
      <p data-testid="active">{String(active)}</p>
      <p data-testid="status">{query.data?.status ?? 'loading'}</p>
    </div>
  );
}

function MenuProbe() {
  const query = useMenu('o-marine');
  return <p data-testid="menu-version">{query.data?.menu.version ?? 'loading'}</p>;
}

let receiver: FakeReceiver;
beforeEach(() => {
  localStorage.clear();
  saveWebhookSettings({ receiverUrl: 'http://127.0.0.1:4021', publicUrl: PUBLIC_URL });
  saveTracked({
    id: 'order-1', reference: 'SO-10001', partnerReference: 'DEMO-1', outletId: 'o-marine', outletName: 'Marine Drive', createdAt: '2026-10-08T09:00:00.000Z',
    idempotencyKey: 'k', lastStatus: 'pending', priceMismatch: false, partnerTotal: 95, total: 95,
  });
  receiver = fakeReceiver();
  receiver.secret = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
  vi.stubGlobal('fetch', receiver.fetch);
});
afterEach(() => vi.unstubAllGlobals());

const acceptedEvent = {
  id: 'evt_1', type: 'order.accepted', createdAt: '2026-10-08T09:00:05.000Z',
  data: { orderId: 'order-1', partnerReference: 'DEMO-1', outletId: 'o-marine', status: 'accepted' },
};

describe('WebhookFeedProvider', () => {
  it('applies an event the receiver accepted, without another call to the restaurant, and reports the feed as active', async () => {
    const getOrder = vi.fn(async () => order('pending'));
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getOrder }) });
    expect(await screen.findByText('pending')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('true'));
    receiver.push(acceptedEvent);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('accepted'));
    expect(getOrder).toHaveBeenCalledTimes(1);
  });

  it('asks only for what is new: each poll passes the last seq it saw', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getOrder: vi.fn(async () => order('pending')) }) });
    receiver.push(acceptedEvent);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('accepted'));
    const before = receiver.afters.length;
    await waitFor(() => expect(receiver.afters.length).toBeGreaterThanOrEqual(before + 2));
    expect(receiver.afters[0]).toBe(0);
    expect(receiver.afters.at(-1)).toBe(1);
  });

  it('stays inactive and never calls the receiver when no webhook is registered', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getOrder: vi.fn(async () => order('pending')) }) });
    expect(await screen.findByText('pending')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    expect(receiver.calls).toEqual([]);
  });

  it('stays inactive when the key\'s webhook points at somebody else\'s receiver', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, {
      client: fakeClient({ getWebhook: vi.fn(async () => hook('https://another-team.example.com/hook')), getOrder: vi.fn(async () => order('pending')) }),
    });
    expect(await screen.findByText('pending')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    expect(receiver.calls).toEqual([]);
  });

  it('goes inactive when the receiver stops answering, so polling returns to its normal pace', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getOrder: vi.fn(async () => order('pending')) }) });
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('true'));
    receiver.down = true;
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('false'));
    receiver.down = false;
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('true'));
  });

  it('is not active while the receiver holds no secret, because it is refusing every delivery', async () => {
    receiver.secret = null;
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getOrder: vi.fn(async () => order('pending')) }) });
    await waitFor(() => expect(receiver.calls.filter((c) => c.path === 'events').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    receiver.secret = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('true'));
  });

  it('is not active while the restaurant reports failed deliveries, even though the receiver holds a secret', async () => {
    // A dead tunnel, or a receiver holding an older secret: the receiver looks ready, and nothing is arriving.
    let failures = 2;
    const getWebhook = vi.fn(async () => hook(PUBLIC_URL, failures));
    renderWithProviders(<WebhookFeedProvider pollMs={20} livenessMs={30}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook, getOrder: vi.fn(async () => order('pending')) }) });
    await waitFor(() => expect(receiver.calls.filter((c) => c.path === 'events').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByTestId('active')).toHaveTextContent('false');
    // The provider keeps re-reading GET webhook on its own: a delivery got through, then they fail again.
    failures = 0;
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('true'));
    failures = 1;
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('false'));
  });

  it('does not re-read the webhook when none is registered, or when it is that of another receiver', async () => {
    const none = vi.fn(async () => null);
    const first = renderWithProviders(<WebhookFeedProvider pollMs={20} livenessMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: none, getOrder: vi.fn(async () => order('pending')) }) });
    expect(await screen.findByText('pending')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(none).toHaveBeenCalledTimes(1);
    first.unmount();
    const other = vi.fn(async () => hook('https://another-team.example.com/hook'));
    renderWithProviders(<WebhookFeedProvider pollMs={20} livenessMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: other, getOrder: vi.fn(async () => order('pending')) }) });
    expect(await screen.findByText('pending')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('reads a restarted receiver from the start, even when it has already counted past the old position', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getOrder: vi.fn(async () => order('pending')) }) });
    receiver.push(acceptedEvent);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('accepted'));
    // Restarted, and two events arrived before the next read: lastSeq (2) is not below the old position (1).
    receiver.restart();
    receiver.push({ id: 'evt_p', type: 'order.preparing', createdAt: '2026-10-08T09:01:00.000Z', data: { orderId: 'order-1', partnerReference: 'DEMO-1', outletId: 'o-marine', status: 'preparing' } });
    receiver.push({ id: 'evt_q', type: 'invoice.paid', createdAt: '2026-10-08T09:01:01.000Z', data: {} });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('preparing'));
  });

  it('starts over when the receiver was restarted and counts from zero again', async () => {
    renderWithProviders(<WebhookFeedProvider pollMs={20}><Probe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getOrder: vi.fn(async () => order('pending')) }) });
    receiver.push({ ...acceptedEvent, id: 'evt_a' });
    receiver.push({ id: 'evt_b', type: 'invoice.paid', createdAt: '2026-10-08T09:00:06.000Z', data: {} });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('accepted'));
    // Restart: the kept events are gone and seq begins at 1 again.
    receiver.events.length = 0;
    receiver.push({ id: 'evt_c', type: 'order.preparing', createdAt: '2026-10-08T09:01:00.000Z', data: { orderId: 'order-1', partnerReference: 'DEMO-1', outletId: 'o-marine', status: 'preparing' } });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('preparing'));
  });

  it('on menu.updated re-fetches that menu with If-None-Match, and again later if the API still served the old copy', async () => {
    const newer = { ...MENU_FIXTURE, version: 'newer0000001' };
    const getMenu = vi.fn()
      .mockResolvedValueOnce({ modified: true, menu: MENU_FIXTURE, etag: '"abc123def456"' })
      // Right after the event the API still answers from its 60-second cache: not modified.
      .mockResolvedValueOnce({ modified: false, etag: '"abc123def456"' })
      .mockResolvedValue({ modified: true, menu: newer, etag: '"newer0000001"' });
    renderWithProviders(<WebhookFeedProvider pollMs={20} recheckMs={150}><MenuProbe /></WebhookFeedProvider>, { client: fakeClient({ getWebhook: vi.fn(async () => hook()), getMenu }) });
    expect(await screen.findByText('abc123def456')).toBeInTheDocument();
    receiver.push({ id: 'evt_m', type: 'menu.updated', createdAt: '2026-10-08T09:02:00.000Z', data: { outletId: 'o-marine', version: 'newer0000001' } });
    await waitFor(() => expect(getMenu).toHaveBeenCalledTimes(2));
    expect(getMenu).toHaveBeenNthCalledWith(2, 'o-marine', { ifNoneMatch: '"abc123def456"' });
    expect(screen.getByTestId('menu-version')).toHaveTextContent('abc123def456');
    await waitFor(() => expect(screen.getByTestId('menu-version')).toHaveTextContent('newer0000001'));
    expect(getMenu).toHaveBeenCalledTimes(3);
  });
});
