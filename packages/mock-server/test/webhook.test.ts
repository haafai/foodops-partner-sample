import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeWebhookSecret, parseWebhookEnvelope, verifyWebhookSignature } from '@foodops-partner/client';
import { MockControl } from '../src/control-client';
import { MENU_ONLY_KEY, OUTLET_LAGOON_KIOSK, OUTLET_MARINE_DRIVE, SECOND_FULL_KEY, UNBOUND_KEY, VARIANT_VEGGIE_REGULAR } from '../src/fixtures';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { newEventId, parseWebhookEvents, validateWebhookUrl } from '../src/webhooks';
import { startCapture } from './capture';
import type { CaptureServer } from './capture';
import { P, call } from './helpers';

let handle: MockServerHandle;
let capture: CaptureServer;
let mock: MockControl;
let now = Date.parse('2026-10-08T09:12:44.000Z');
beforeAll(async () => {
  handle = await startMockServer({ clock: () => now });
  capture = await startCapture();
  mock = new MockControl(handle.url);
});
afterAll(async () => { await handle.close(); await capture.close(); });
beforeEach(() => {
  handle.state.reset();
  capture.requests.length = 0;
  capture.answers.length = 0;
  now = Date.parse('2026-10-08T09:12:44.000Z');
});

const hookUrl = () => `${capture.url}/webhooks/foodops`;
const put = (body: unknown, key?: string | null) => call(handle, 'PUT', `${P}/webhook`, { body, key });
const get = (key?: string | null) => call(handle, 'GET', `${P}/webhook`, { key });
const del = (key?: string | null) => call(handle, 'DELETE', `${P}/webhook`, { key });
async function register(events?: string[]): Promise<string> {
  const r = await put(events ? { url: hookUrl(), events } : { url: hookUrl() });
  expect(r.status).toBe(200);
  return r.json.secret as string;
}
let counter = 0;
async function placeOrder(key?: string): Promise<{ id: string; partnerReference: string }> {
  const partnerReference = `PX-${++counter}`;
  const r = await call(handle, 'POST', `${P}/orders`, {
    key, body: { outletId: OUTLET_MARINE_DRIVE, partnerReference, lines: [{ variantId: VARIANT_VEGGIE_REGULAR, quantity: 1 }] },
    headers: { 'idempotency-key': `idem-${counter}` },
  });
  expect(r.status).toBe(201);
  return { id: r.json.id as string, partnerReference };
}
const settle = () => handle.state.settleDeliveries();
const events = () => capture.requests.map((r) => parseWebhookEnvelope(r.body)!);

describe('PUT / GET / DELETE webhook', () => {
  it('PUT answers the endpoint with a fresh whsec_ secret of 32 bytes; GET never shows it', async () => {
    const r = await put({ url: hookUrl() });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ url: hookUrl(), events: ['order', 'menu'], lastDelivery: null, consecutiveFailures: 0, createdAt: '2026-10-08T09:12:44.000Z', updatedAt: '2026-10-08T09:12:44.000Z' });
    expect(decodeWebhookSecret(r.json.secret)).toHaveLength(32);
    const read = await get();
    expect(read.status).toBe(200);
    expect(read.json).toEqual({ url: hookUrl(), events: ['order', 'menu'], createdAt: '2026-10-08T09:12:44.000Z', updatedAt: '2026-10-08T09:12:44.000Z', lastDelivery: null, consecutiveFailures: 0 });
    expect(read.text).not.toContain('whsec_');
  });

  it('answers the events in contract order whatever order they were sent in', async () => {
    expect((await put({ url: hookUrl(), events: ['menu', 'order'] })).json.events).toEqual(['order', 'menu']);
    expect((await put({ url: hookUrl(), events: ['menu'] })).json.events).toEqual(['menu']);
  });

  it('every PUT replaces the endpoint and issues a new secret, keeping createdAt', async () => {
    const first = await put({ url: hookUrl() });
    now += 60_000;
    const second = await put({ url: `${hookUrl()}?v=2`, events: ['order'] });
    expect(second.json.secret).not.toBe(first.json.secret);
    expect(second.json).toMatchObject({ url: `${hookUrl()}?v=2`, events: ['order'], createdAt: '2026-10-08T09:12:44.000Z', updatedAt: '2026-10-08T09:13:44.000Z' });
  });

  it('DELETE answers 204 whether or not one is set, and GET then answers 404 not_found', async () => {
    await register();
    expect((await del()).status).toBe(204);
    expect((await del()).status).toBe(204);
    const read = await get();
    expect(read.status).toBe(404);
    expect(read.json.error).toBe('not_found');
  });

  it('keeps one endpoint per key', async () => {
    await register();
    expect((await get(SECOND_FULL_KEY)).status).toBe(404);
  });

  it('refuses a URL that breaks the rules with 400 invalid_webhook_url', async () => {
    const bad = [
      'http://partner.example.test/hook', 'ftp://partner.example.test/hook', 'https://user:pw@partner.example.test/hook', 'https://partner.example.test:8443/hook',
      'https://10.1.2.3/hook', 'https://192.168.1.10/hook', 'https://172.16.0.1/hook', 'https://169.254.169.254/latest', 'https://100.64.0.1/hook', 'https://0.0.0.0/hook',
      'https://[fd00::1]/hook', 'https://[fe80::1]/hook', 'http://127.0.0.2:4020/hook', '/relative', '', `https://partner.example.test/${'a'.repeat(2000)}`,
    ];
    for (const url of bad) {
      const r = await put({ url });
      expect(r.status, url).toBe(400);
      expect(r.json.error, url).toBe('invalid_webhook_url');
    }
    expect((await put({})).json.error).toBe('invalid_webhook_url');
    expect((await get()).status).toBe(404);
  });

  it('accepts https on a public host with or without :443, and (mock only) http on loopback', async () => {
    for (const url of ['https://partner.example.test/hooks/foodops', 'https://partner.example.test:443/hooks/foodops', 'http://127.0.0.1:4020/webhooks/foodops', 'http://localhost:4020/webhooks/foodops', 'http://[::1]:4020/webhooks/foodops']) {
      expect((await put({ url })).status, url).toBe(200);
    }
  });

  it('refuses an empty or unknown events list with 400 invalid_events', async () => {
    for (const bad of [[], ['orders'], ['order', 'invoice'], 'order', 7]) {
      const r = await put({ url: hookUrl(), events: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.json.error, JSON.stringify(bad)).toBe('invalid_events');
    }
  });

  it('needs the partner.webhook scope, a partner key, and a key at all', async () => {
    expect((await put({ url: hookUrl() }, MENU_ONLY_KEY)).json.error).toBe('insufficient_scope');
    expect((await get(MENU_ONLY_KEY)).json.error).toBe('insufficient_scope');
    expect((await del(MENU_ONLY_KEY)).json.error).toBe('insufficient_scope');
    expect((await put({ url: hookUrl() }, UNBOUND_KEY)).json.error).toBe('partner_key_required');
    expect((await get(null)).status).toBe(401);
  });

  it('a browser preflight for DELETE is allowed', async () => {
    const r = await call(handle, 'OPTIONS', `${P}/webhook`, { key: null, headers: { origin: 'http://localhost:5180', 'access-control-request-method': 'DELETE' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('DELETE');
  });
});

describe('order events', () => {
  it('sends nothing for the pending order the partner just created', async () => {
    await register();
    await placeOrder();
    await settle();
    expect(capture.requests).toHaveLength(0);
  });

  it('posts one signed order.accepted with the contract headers and body', async () => {
    const secret = await register();
    const order = await placeOrder();
    now += 5_000;
    await mock.accept(order.id);
    await settle();
    expect(capture.requests).toHaveLength(1);
    const request = capture.requests[0];
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/webhooks/foodops');
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers['user-agent']).toBe('Hubits-Webhooks/1');
    const event = parseWebhookEnvelope(request.body)!;
    expect(event.id).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(request.headers['hubits-event-id']).toBe(event.id);
    expect(request.headers['hubits-event-type']).toBe('order.accepted');
    expect(event).toEqual({
      id: event.id, type: 'order.accepted', createdAt: '2026-10-08T09:12:49.000Z',
      data: { orderId: order.id, partnerReference: order.partnerReference, outletId: OUTLET_MARINE_DRIVE, status: 'accepted' },
    });
    const signature = String(request.headers['hubits-signature']);
    expect(signature).toMatch(/^t=1791450769,v1=[0-9a-f]{64}$/);
    expect(await verifyWebhookSignature({ secret, header: signature, rawBody: request.body, now: 1791450769 })).toEqual({ ok: true, timestamp: 1791450769 });
  });

  it('names each status it reaches, with reason and cancelledBy only where the contract lists them', async () => {
    await register();
    const a = await placeOrder();
    await mock.accept(a.id);
    await mock.advance(a.id);
    await mock.advance(a.id);
    await mock.advance(a.id);
    const b = await placeOrder();
    await mock.reject(b.id, 'Item unavailable');
    const c = await placeOrder();
    await mock.timeout(c.id);
    const d = await placeOrder();
    await mock.accept(d.id);
    await mock.restaurantCancel(d.id, 'Kitchen flooded');
    const e = await placeOrder();
    await call(handle, 'POST', `${P}/orders/${e.id}/cancel`, { body: { reason: 'customer left' }, headers: { 'idempotency-key': 'cancel-e' } });
    await settle();
    const byOrder = (id: string) => events().filter((ev) => ev.data.orderId === id).map((ev) => ({ type: ev.type, ...ev.data, orderId: undefined, partnerReference: undefined, outletId: undefined }));
    expect(byOrder(a.id).map((x) => x.type).sort()).toEqual(['order.accepted', 'order.picked_up', 'order.preparing', 'order.ready']);
    expect(events().find((ev) => ev.data.orderId === a.id && ev.type === 'order.ready')!.data).toEqual({ orderId: a.id, partnerReference: a.partnerReference, outletId: OUTLET_MARINE_DRIVE, status: 'ready' });
    expect(events().find((ev) => ev.data.orderId === b.id)!).toMatchObject({ type: 'order.rejected', data: { status: 'rejected', reason: 'Item unavailable' } });
    expect(events().find((ev) => ev.data.orderId === b.id)!.data).not.toHaveProperty('cancelledBy');
    expect(events().find((ev) => ev.data.orderId === c.id)!).toMatchObject({ type: 'order.rejected', data: { status: 'rejected', reason: 'timeout' } });
    expect(events().find((ev) => ev.data.orderId === d.id && ev.type === 'order.cancelled')!.data).toEqual({ orderId: d.id, partnerReference: d.partnerReference, outletId: OUTLET_MARINE_DRIVE, status: 'cancelled', reason: 'Kitchen flooded', cancelledBy: 'restaurant' });
    expect(events().find((ev) => ev.data.orderId === e.id)!).toMatchObject({ type: 'order.cancelled', data: { status: 'cancelled', reason: 'Partner: customer left', cancelledBy: 'partner' } });
    expect(new Set(events().map((ev) => ev.id)).size).toBe(events().length);
  });

  it('sends an order event only to the endpoint of the key that owns the order', async () => {
    await register(['order']);
    const theirs = await placeOrder(SECOND_FULL_KEY);
    await mock.accept(theirs.id);
    await settle();
    expect(capture.requests).toHaveLength(0);

    const other = await put({ url: `${capture.url}/webhooks/second`, events: ['order'] }, SECOND_FULL_KEY);
    expect(other.status).toBe(200);
    const mine = await placeOrder();
    await mock.accept(mine.id);
    const theirsAgain = await placeOrder(SECOND_FULL_KEY);
    await mock.accept(theirsAgain.id);
    await settle();
    const byPath = (path: string) => capture.requests.filter((r) => r.path === path).map((r) => parseWebhookEnvelope(r.body)!.data.orderId);
    expect(capture.requests).toHaveLength(2);
    expect(byPath('/webhooks/foodops')).toEqual([mine.id]);
    expect(byPath('/webhooks/second')).toEqual([theirsAgain.id]);
  });

  it('sends no order event to a menu-only endpoint', async () => {
    await register(['menu']);
    const mine = await placeOrder();
    await mock.accept(mine.id);
    await settle();
    expect(capture.requests).toHaveLength(0);
  });

  it('signs with the newest secret after a second PUT, and sends nothing after DELETE', async () => {
    const old = await register();
    const fresh = await register();
    const order = await placeOrder();
    await mock.accept(order.id);
    await settle();
    const request = capture.requests[0];
    const header = String(request.headers['hubits-signature']);
    const at = Math.floor(now / 1000);
    expect((await verifyWebhookSignature({ secret: fresh, header, rawBody: request.body, now: at })).ok).toBe(true);
    expect(await verifyWebhookSignature({ secret: old, header, rawBody: request.body, now: at })).toEqual({ ok: false, reason: 'signature_mismatch' });
    await del();
    await mock.advance(order.id);
    await settle();
    expect(capture.requests).toHaveLength(1);
  });
});

describe('menu events', () => {
  it('announces a price change once per outlet whose version changed, with the version GET menu now returns', async () => {
    await register();
    await mock.setPrice(VARIANT_VEGGIE_REGULAR, 123);
    await settle();
    const sent = events();
    expect(sent.map((e) => e.type)).toEqual(['menu.updated', 'menu.updated']);
    expect(sent.map((e) => e.data.outletId).sort()).toEqual([OUTLET_MARINE_DRIVE, OUTLET_LAGOON_KIOSK].sort());
    for (const event of sent) {
      const menu = await call(handle, 'GET', `${P}/outlets/${String(event.data.outletId)}/menu`);
      expect(event.data).toEqual({ outletId: event.data.outletId, version: menu.json.version });
    }
  });

  it('says nothing when the menu did not really change, or about a change made before registration', async () => {
    await mock.setPrice(VARIANT_VEGGIE_REGULAR, 123);
    await register();
    await mock.setPrice(VARIANT_VEGGIE_REGULAR, 123);
    await settle();
    expect(capture.requests).toHaveLength(0);
  });

  it('sends no menu event to an order-only endpoint', async () => {
    await register(['order']);
    await mock.setPrice(VARIANT_VEGGIE_REGULAR, 123);
    await settle();
    expect(capture.requests).toHaveLength(0);
  });
});

describe('delivery results on GET webhook', () => {
  it('records delivered, then http_error with a growing failure count, then resets on the next 2xx', async () => {
    await register(['order']);
    const order = await placeOrder();
    await mock.accept(order.id);
    await settle();
    expect((await get()).json).toMatchObject({ lastDelivery: { at: '2026-10-08T09:12:44.000Z', httpStatus: 200, outcome: 'delivered' }, consecutiveFailures: 0 });
    capture.answers.push({ status: 500 }, { status: 401 });
    await mock.advance(order.id);
    await settle();
    await mock.advance(order.id);
    await settle();
    expect((await get()).json).toMatchObject({ lastDelivery: { httpStatus: 401, outcome: 'http_error' }, consecutiveFailures: 2 });
    await mock.advance(order.id);
    await settle();
    expect((await get()).json).toMatchObject({ lastDelivery: { httpStatus: 200, outcome: 'delivered' }, consecutiveFailures: 0 });
    expect(capture.requests).toHaveLength(4);
  });

  it('does not follow a redirect: one request, recorded as http_error', async () => {
    await register(['order']);
    capture.answers.push({ status: 302, headers: { location: `${capture.url}/elsewhere` } });
    const order = await placeOrder();
    await mock.accept(order.id);
    await settle();
    expect(capture.requests.map((r) => r.path)).toEqual(['/webhooks/foodops']);
    expect((await get()).json).toMatchObject({ lastDelivery: { httpStatus: 302, outcome: 'http_error' }, consecutiveFailures: 1 });
  });

  it('records connection_failed with no status when nothing is listening', async () => {
    const dead = await startCapture();
    const url = `${dead.url}/webhooks/foodops`;
    await dead.close();
    expect((await put({ url, events: ['order'] })).status).toBe(200);
    const order = await placeOrder();
    await mock.accept(order.id);
    await settle();
    expect((await get()).json).toMatchObject({ lastDelivery: { httpStatus: null, outcome: 'connection_failed' }, consecutiveFailures: 1 });
  });

  it('never makes the restaurant wait for the partner: accept answers before a slow endpoint does', async () => {
    let release: (() => void) | undefined;
    const slow = await startMockServer({
      webhookFetch: () => new Promise<Response>((resolve) => { release = () => resolve(new Response(null, { status: 200 })); }),
    });
    try {
      await call(slow, 'PUT', `${P}/webhook`, { body: { url: 'https://partner.example.test/hook' } });
      const created = await call(slow, 'POST', `${P}/orders`, {
        body: { outletId: OUTLET_MARINE_DRIVE, partnerReference: 'PX-slow', lines: [{ variantId: VARIANT_VEGGIE_REGULAR, quantity: 1 }] },
        headers: { 'idempotency-key': 'slow-1' },
      });
      const accepted = await new MockControl(slow.url).accept(created.json.id as string);
      expect(accepted.status).toBe('accepted');
      expect(slow.state.deliveries.size).toBe(1);
      // The delivery signs before it posts, so the post may not have started yet.
      await vi.waitFor(() => expect(release).toBeDefined());
      release!();
      await slow.state.settleDeliveries();
      expect(slow.state.deliveries.size).toBe(0);
    } finally {
      await slow.close();
    }
  });
});

describe('the pure helpers', () => {
  it('validateWebhookUrl returns the URL unchanged or null', () => {
    expect(validateWebhookUrl('https://partner.example.test/hook')).toBe('https://partner.example.test/hook');
    expect(validateWebhookUrl(42)).toBeNull();
  });
  it('parseWebhookEvents defaults to both', () => {
    expect(parseWebhookEvents(undefined)).toEqual(['order', 'menu']);
    expect(parseWebhookEvents(['menu', 'menu'])).toEqual(['menu']);
  });
  it('newEventId is evt_ plus a 26-character ULID that sorts by time', () => {
    const zeros = new Uint8Array(10);
    expect(newEventId(0, zeros)).toBe('evt_00000000000000000000000000');
    expect(newEventId(Date.parse('2026-10-08T09:12:44Z'), zeros)).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(newEventId(1000, zeros) < newEventId(2000, zeros)).toBe(true);
    expect(newEventId(1, new Uint8Array(10).fill(255))).toBe('evt_0000000001ZZZZZZZZZZZZZZZZ');
  });
});
