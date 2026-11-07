import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENU_ONLY_KEY, OUTLET_MARINE_DRIVE, VARIANT_VEGGIE_REGULAR } from '../src/fixtures';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { P, call } from './helpers';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });
beforeEach(() => handle.state.reset());

let counter = 0;
const idem = () => `idem-${++counter}`;
async function placeOrder(): Promise<string> {
  const r = await call(handle, 'POST', `${P}/orders`, {
    body: { outletId: OUTLET_MARINE_DRIVE, partnerReference: `PX-${++counter}`, lines: [{ variantId: VARIANT_VEGGIE_REGULAR, quantity: 1 }] },
    headers: { 'idempotency-key': idem() },
  });
  expect(r.status).toBe(201);
  return r.json.id as string;
}
const cancel = (id: string, body: unknown, key = idem(), apiKey?: string) =>
  call(handle, 'POST', `${P}/orders/${id}/cancel`, { body, headers: { 'idempotency-key': key }, key: apiKey });
const control = (path: string, body?: unknown) => call(handle, 'POST', `/_mock/orders/${path}`, { key: null, body });

describe('POST orders/{id}/cancel', () => {
  it('cancels a pending order with cancelledBy partner and a prefixed reason', async () => {
    const id = await placeOrder();
    const r = await cancel(id, { reason: 'customer changed their mind' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id, status: 'cancelled', cancelledBy: 'partner', reason: 'Partner: customer changed their mind' });
    expect((await call(handle, 'GET', `${P}/orders/${id}`)).json.status).toBe('cancelled');
  });

  it('cancels an accepted order, refuses from preparing on with 409 cannot_cancel', async () => {
    const accepted = await placeOrder();
    await control(`${accepted}/accept`);
    expect((await cancel(accepted, { reason: 'late' })).json.status).toBe('cancelled');
    const preparing = await placeOrder();
    await control(`${preparing}/accept`);
    await control(`${preparing}/advance`);
    const r = await cancel(preparing, { reason: 'late' });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('cannot_cancel');
    expect((await call(handle, 'GET', `${P}/orders/${preparing}`)).json.status).toBe('preparing');
  });

  it('answers 200 with the current order when it is already cancelled or rejected', async () => {
    const id = await placeOrder();
    await cancel(id, { reason: 'first' });
    const again = await cancel(id, { reason: 'second' });
    expect(again.status).toBe(200);
    expect(again.json.reason).toBe('Partner: first');
    const rejected = await placeOrder();
    await control(`${rejected}/reject`, { reason: 'Too busy' });
    const r = await cancel(rejected, { reason: 'whatever' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ status: 'rejected', reason: 'Too busy', cancelledBy: null });
  });

  it('requires a reason and an Idempotency-Key, and replays or conflicts on the key', async () => {
    const id = await placeOrder();
    expect((await cancel(id, { reason: '' })).json).toMatchObject({ error: 'invalid_request', field: 'reason' });
    expect((await cancel(id, { reason: 'x'.repeat(201) })).status).toBe(400);
    expect((await call(handle, 'POST', `${P}/orders/${id}/cancel`, { body: { reason: 'no key' } })).json.error).toBe('idempotency_key_required');
    const key = idem();
    const a = await cancel(id, { reason: 'gone' }, key);
    const b = await cancel(id, { reason: 'gone' }, key);
    expect(b.json).toEqual(a.json);
    expect((await cancel(id, { reason: 'different' }, key)).json.error).toBe('idempotency_conflict');
  });

  it('404 for another key or an unknown id; 403 for a menu-only key', async () => {
    const id = await placeOrder();
    expect((await cancel('00000000-0000-4000-8000-000000000000', { reason: 'x' })).status).toBe(404);
    expect((await cancel(id, { reason: 'x' }, idem(), MENU_ONLY_KEY)).status).toBe(403);
  });

  it('a picked-up order can no longer be cancelled by the partner', async () => {
    const id = await placeOrder();
    await control(`${id}/accept`);
    for (let i = 0; i < 3; i++) await control(`${id}/advance`);
    expect((await cancel(id, { reason: 'late' })).json.error).toBe('cannot_cancel');
  });
});

const report = (id: string, body: unknown, key = idem(), apiKey?: string) =>
  call(handle, 'POST', `${P}/orders/${id}/status`, { body, headers: { 'idempotency-key': key }, key: apiKey });

async function orderAt(steps: number): Promise<string> {
  const id = await placeOrder();
  await control(`${id}/accept`);
  for (let i = 0; i < steps; i++) await control(`${id}/advance`);
  return id;
}

describe('POST orders/{id}/status', () => {
  it('walks an accepted order through out_for_delivery to delivered', async () => {
    const id = await orderAt(0);
    const out = await report(id, { status: 'out_for_delivery' });
    expect(out.status).toBe(200);
    expect(out.json).toMatchObject({ id, status: 'out_for_delivery' });
    const done = await report(id, { status: 'delivered' });
    expect(done.json.status).toBe('delivered');
    expect((await call(handle, 'GET', `${P}/orders/${id}`)).json.status).toBe('delivered');
  });

  it('reports delivered straight from picked_up, without out_for_delivery first', async () => {
    const id = await orderAt(3);
    expect((await call(handle, 'GET', `${P}/orders/${id}`)).json.status).toBe('picked_up');
    expect((await report(id, { status: 'delivered' })).json.status).toBe('delivered');
  });

  it('answers 200 and changes nothing when the order already has the status', async () => {
    const id = await orderAt(0);
    const first = await report(id, { status: 'out_for_delivery' });
    const again = await report(id, { status: 'out_for_delivery' });
    expect(again.status).toBe(200);
    expect(again.json.updatedAt).toBe(first.json.updatedAt);
  });

  it('refuses pending, rejected, cancelled and a step back with 409 invalid_status_change', async () => {
    const pending = await placeOrder();
    const rejected = await placeOrder();
    await control(`${rejected}/reject`, { reason: 'Too busy' });
    const cancelled = await placeOrder();
    await cancel(cancelled, { reason: 'gone' });
    const delivered = await orderAt(1);
    await report(delivered, { status: 'delivered' });

    for (const [id, target, current] of [
      [pending, 'out_for_delivery', 'pending'], [rejected, 'delivered', 'rejected'],
      [cancelled, 'delivered', 'cancelled'], [delivered, 'out_for_delivery', 'delivered'],
    ] as const) {
      const r = await report(id, { status: target });
      expect(r.status).toBe(409);
      expect(r.json.error).toBe('invalid_status_change');
      expect(r.json.message).toContain(current);
      expect((await call(handle, 'GET', `${P}/orders/${id}`)).json.status).toBe(current);
    }
  });

  it('400 invalid_request on status for anything but out_for_delivery or delivered', async () => {
    const id = await orderAt(2);
    for (const status of ['ready', 'picked_up', 'Delivered', 'out-for-delivery', '', undefined]) {
      expect((await report(id, { status })).json).toMatchObject({ error: 'invalid_request', field: 'status' });
    }
    expect((await call(handle, 'GET', `${P}/orders/${id}`)).json.status).toBe('ready');
  });

  it('requires an Idempotency-Key, and replays or conflicts on the key', async () => {
    const id = await orderAt(0);
    expect((await call(handle, 'POST', `${P}/orders/${id}/status`, { body: { status: 'delivered' } })).json.error).toBe('idempotency_key_required');
    const key = idem();
    const a = await report(id, { status: 'out_for_delivery' }, key);
    const b = await report(id, { status: 'out_for_delivery' }, key);
    expect(b.json).toEqual(a.json);
    expect((await report(id, { status: 'delivered' }, key)).json.error).toBe('idempotency_conflict');
  });

  it('404 for an unknown id; 403 for a menu-only key', async () => {
    const id = await orderAt(0);
    expect((await report('00000000-0000-4000-8000-000000000000', { status: 'delivered' })).status).toBe(404);
    expect((await report(id, { status: 'delivered' }, idem(), MENU_ONLY_KEY)).status).toBe(403);
  });
});
