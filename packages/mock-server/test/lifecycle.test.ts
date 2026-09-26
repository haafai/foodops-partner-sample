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
});
