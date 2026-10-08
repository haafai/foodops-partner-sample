import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerApiError } from '@foodops-partner/client';
import type { PartnerWebhook } from '@foodops-partner/client';
import { SetupPage } from '../src/pages/SetupPage';
import { fakeReceiver } from './receiver-fake';
import type { FakeReceiver } from './receiver-fake';
import { fakeClient, renderWithProviders } from './render';

const SECRET = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const LOCAL_URL = 'http://127.0.0.1:4020/webhooks/foodops';
const hook = (over: Partial<PartnerWebhook> = {}): PartnerWebhook => ({
  url: LOCAL_URL, events: ['order', 'menu'], createdAt: '2026-10-08T09:00:00Z', updatedAt: '2026-10-08T09:00:00Z', lastDelivery: null, consecutiveFailures: 0, ...over,
});

let receiver: FakeReceiver;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  receiver = fakeReceiver();
  vi.stubGlobal('fetch', receiver.fetch);
});
afterEach(() => vi.unstubAllGlobals());

const card = () => within(screen.getByRole('region', { name: 'Webhooks' }));
const status = () => screen.getByTestId('webhook-status');
function renderCard(client: ReturnType<typeof fakeClient>, mode: 'mock' | 'local' = 'mock') {
  return renderWithProviders(<SetupPage />, { route: '/setup', client, mode });
}

describe('the Webhooks card on the setup page', () => {
  it('is not shown before a key is saved', () => {
    renderWithProviders(<SetupPage />, { route: '/setup', client: null, settings: { baseUrl: '', apiKey: '' } });
    expect(screen.queryByRole('region', { name: 'Webhooks' })).toBeNull();
  });

  it('says none is registered, offers the local defaults, and makes no call to the receiver', async () => {
    renderCard(fakeClient());
    expect(await card().findByText('No webhook is registered for this key.')).toBeInTheDocument();
    expect(card().getByLabelText(/webhook url/i)).toHaveValue(LOCAL_URL);
    expect(card().getByLabelText(/receiver control/i)).toHaveValue('http://127.0.0.1:4021');
    expect(card().getByRole('button', { name: 'Remove webhook' })).toBeDisabled();
    expect(receiver.calls).toEqual([]);
  });

  it('registers: PUTs the URL, hands the secret to the receiver, and keeps the secret out of the page and out of storage', async () => {
    const user = userEvent.setup();
    const setWebhook = vi.fn(async () => ({ ...hook(), secret: SECRET }));
    renderCard(fakeClient({ setWebhook }));
    await card().findByText('No webhook is registered for this key.');
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    await waitFor(() => expect(status()).toHaveTextContent(`Registered. ${LOCAL_URL}`));
    expect(setWebhook).toHaveBeenCalledWith(LOCAL_URL);
    expect(receiver.secret).toBe(SECRET);
    expect(receiver.calls.map((c) => `${c.method} ${c.path}`).slice(0, 2)).toEqual(['GET state', 'PUT secret']);
    expect(status()).toHaveTextContent('Events: order, menu');
    expect(status()).toHaveTextContent('No event has been sent yet.');
    expect(document.body.innerHTML).not.toContain('whsec_');
    expect(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })).not.toContain('whsec_');
    expect(JSON.parse(localStorage.getItem('partner-demo.webhook')!)).toEqual({ receiverUrl: 'http://127.0.0.1:4021', publicUrl: LOCAL_URL });
    expect(card().getByRole('button', { name: 'Register again (new secret)' })).toBeEnabled();
    await waitFor(() => expect(status()).toHaveTextContent('Receiver: 0 accepted, 0 refused.'));
  });

  it('changes nothing at the restaurant when no receiver is answering', async () => {
    const user = userEvent.setup();
    receiver.down = true;
    const setWebhook = vi.fn();
    renderCard(fakeClient({ setWebhook }));
    await card().findByText('No webhook is registered for this key.');
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    expect(await card().findByRole('alert')).toHaveTextContent('No receiver is answering at http://127.0.0.1:4021. Start it with "npm run receiver" and try again. Nothing was changed.');
    expect(setWebhook).not.toHaveBeenCalled();
  });

  it('outside mock mode refuses a local URL before calling anyone, and says to use a tunnel', async () => {
    const user = userEvent.setup();
    const setWebhook = vi.fn();
    renderCard(fakeClient({ setWebhook }), 'local');
    await card().findByText('No webhook is registered for this key.');
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    expect(await card().findByRole('alert')).toHaveTextContent(/only accepts an https URL on a public host.*tunnel/);
    expect(setWebhook).not.toHaveBeenCalled();
    expect(receiver.calls).toEqual([]);
  });

  it('registers a tunnel URL typed in local mode', async () => {
    const user = userEvent.setup();
    const url = 'https://kaana-hooks.example.com/webhooks/foodops';
    const setWebhook = vi.fn(async () => ({ ...hook({ url }), secret: SECRET }));
    renderCard(fakeClient({ setWebhook }), 'local');
    await card().findByText('No webhook is registered for this key.');
    await user.clear(card().getByLabelText(/webhook url/i));
    await user.type(card().getByLabelText(/webhook url/i), ` ${url} `);
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    await waitFor(() => expect(status()).toHaveTextContent(`Registered. ${url}`));
    expect(setWebhook).toHaveBeenCalledWith(url);
    expect(receiver.secret).toBe(SECRET);
  });

  it('explains the restaurant\'s refusal of a URL', async () => {
    const user = userEvent.setup();
    const setWebhook = vi.fn().mockRejectedValue(new PartnerApiError({ status: 400, code: 'invalid_webhook_url', message: 'The url must be https.' }));
    renderCard(fakeClient({ setWebhook }));
    await card().findByText('No webhook is registered for this key.');
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    expect(await card().findByRole('alert')).toHaveTextContent('The restaurant refused that webhook URL. It must be https on a public host, on port 443, with no user name in it.');
    expect(receiver.secret).toBeNull();
  });

  it('says so when the API has no webhook endpoints at all', async () => {
    const user = userEvent.setup();
    const setWebhook = vi.fn().mockRejectedValue(new PartnerApiError({ status: 404, code: 'not_found', message: 'No such endpoint.' }));
    renderCard(fakeClient({ setWebhook }));
    await card().findByText('No webhook is registered for this key.');
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    expect(await card().findByRole('alert')).toHaveTextContent("This restaurant's API does not offer webhooks. Polling keeps working as before.");
  });

  it('warns to register again when the receiver did not take the secret', async () => {
    const user = userEvent.setup();
    receiver.refuseSecret = true;
    renderCard(fakeClient({ setWebhook: vi.fn(async () => ({ ...hook(), secret: SECRET })) }));
    await card().findByText('No webhook is registered for this key.');
    await user.click(card().getByRole('button', { name: 'Register webhook' }));
    expect(await card().findByRole('alert')).toHaveTextContent(/receiver did not take the secret.*Press Register again/);
    expect(status()).toHaveTextContent(`Registered. ${LOCAL_URL}`);
    expect(document.body.innerHTML).not.toContain('whsec_');
  });

  it('removes: DELETE at the restaurant, then the receiver forgets the secret', async () => {
    const user = userEvent.setup();
    receiver.secret = SECRET;
    const deleteWebhook = vi.fn(async () => undefined);
    renderCard(fakeClient({ getWebhook: vi.fn(async () => hook()), deleteWebhook }));
    await waitFor(() => expect(status()).toHaveTextContent('Registered.'));
    await user.click(card().getByRole('button', { name: 'Remove webhook' }));
    expect(await card().findByText('No webhook is registered for this key.')).toBeInTheDocument();
    expect(deleteWebhook).toHaveBeenCalledTimes(1);
    expect(receiver.secret).toBeNull();
  });

  it('still removes at the restaurant when the receiver is not running', async () => {
    const user = userEvent.setup();
    receiver.down = true;
    const deleteWebhook = vi.fn(async () => undefined);
    renderCard(fakeClient({ getWebhook: vi.fn(async () => hook()), deleteWebhook }));
    await waitFor(() => expect(status()).toHaveTextContent('Registered.'));
    await user.click(card().getByRole('button', { name: 'Remove webhook' }));
    expect(await card().findByText('No webhook is registered for this key.')).toBeInTheDocument();
    expect(card().queryByRole('alert')).toBeNull();
  });

  it('shows the last delivery, the failures in a row, and what the receiver refused', async () => {
    receiver.secret = SECRET;
    receiver.rejected = 3;
    renderCard(fakeClient({ getWebhook: vi.fn(async () => hook({ lastDelivery: { at: '2026-10-08T09:12:44Z', httpStatus: 401, outcome: 'http_error' }, consecutiveFailures: 3 })) }));
    await waitFor(() => expect(status()).toHaveTextContent('your endpoint answered with an error (HTTP 401).'));
    expect(status()).toHaveTextContent('3 failed in a row. Nothing is re-sent; the next change sends the next event.');
    await waitFor(() => expect(status()).toHaveTextContent('Receiver: 0 accepted, 3 refused (last reason: signature_mismatch).'));
  });

  it('shows a delivery that never got an HTTP answer without a status', async () => {
    renderCard(fakeClient({ getWebhook: vi.fn(async () => hook({ lastDelivery: { at: '2026-10-08T09:12:44Z', httpStatus: null, outcome: 'timeout' }, consecutiveFailures: 1 })) }));
    await waitFor(() => expect(status()).toHaveTextContent('no answer within 5 seconds.'));
    expect(status()).not.toHaveTextContent('HTTP');
  });

  it('tells a restarted receiver apart: registered, but holding no secret', async () => {
    renderCard(fakeClient({ getWebhook: vi.fn(async () => hook()) }));
    await waitFor(() => expect(status()).toHaveTextContent('It has no secret (it was restarted). Register again.'));
  });

  it('says when the key\'s webhook belongs to another receiver, and does not ask ours about it', async () => {
    renderCard(fakeClient({ getWebhook: vi.fn(async () => hook({ url: 'https://another-team.example.com/hook' })) }));
    await waitFor(() => expect(status()).toHaveTextContent('Registered. https://another-team.example.com/hook'));
    expect(status()).toHaveTextContent('This webhook points somewhere other than the URL above');
    expect(receiver.calls).toEqual([]);
  });

  it('shows a key without the webhook scope as a setup problem', async () => {
    renderCard(fakeClient({ getWebhook: vi.fn().mockRejectedValue(new PartnerApiError({ status: 403, code: 'insufficient_scope', message: 'Missing partner.webhook' })) }));
    expect(await card().findByRole('alert')).toHaveTextContent('Setup problem: insufficient_scope. Check the key and contact the restaurant.');
  });
});
