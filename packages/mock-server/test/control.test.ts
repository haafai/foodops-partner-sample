import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OUTLET_LAGOON_KIOSK, OUTLET_MARINE_DRIVE, VARIANT_VEGGIE_REGULAR } from '../src/fixtures';
import { ManualScheduler } from '../src/scheduler';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { MockControl } from '../src/control-client';
import { P, call } from './helpers';

let handle: MockServerHandle;
let scheduler: ManualScheduler;
let mock: MockControl;
beforeAll(async () => {
  scheduler = new ManualScheduler();
  handle = await startMockServer({ scheduler });
  mock = new MockControl(handle.url);
});
afterAll(async () => { await handle.close(); });
beforeEach(() => { handle.state.reset(); scheduler.pending.length = 0; });

let counter = 0;
async function placeOrder(outletId = OUTLET_MARINE_DRIVE): Promise<string> {
  const r = await call(handle, 'POST', `${P}/orders`, {
    body: { outletId, partnerReference: `PX-${++counter}`, lines: [{ variantId: VARIANT_VEGGIE_REGULAR, quantity: 1 }] },
    headers: { 'idempotency-key': `idem-${counter}` },
  });
  expect(r.status).toBe(201);
  return r.json.id as string;
}
const status = async (id: string) => (await call(handle, 'GET', `${P}/orders/${id}`)).json;

describe('the simulated restaurant', () => {
  it('accepts, advances to picked_up, and refuses invalid transitions with 409 invalid_transition', async () => {
    const id = await placeOrder();
    expect((await mock.accept(id)).status).toBe('accepted');
    await expect(mock.accept(id)).rejects.toThrow(/409/);
    expect((await mock.advance(id)).status).toBe('preparing');
    expect((await mock.advance(id)).status).toBe('ready');
    expect((await mock.advance(id)).status).toBe('picked_up');
    await expect(mock.advance(id)).rejects.toThrow(/409/);
    expect((await status(id)).status).toBe('picked_up');
  });

  it('rejects with a reason, times out with reason timeout, and cancels as the restaurant', async () => {
    const rejected = await placeOrder();
    expect(await mock.reject(rejected, 'Item unavailable')).toMatchObject({ status: 'rejected', reason: 'Item unavailable', cancelledBy: null });
    const timedOut = await placeOrder();
    expect(await mock.timeout(timedOut)).toMatchObject({ status: 'rejected', reason: 'timeout' });
    const cancelled = await placeOrder();
    await mock.accept(cancelled);
    expect(await mock.restaurantCancel(cancelled, 'Kitchen flooded')).toMatchObject({ status: 'cancelled', cancelledBy: 'restaurant', reason: 'Kitchen flooded' });
    await expect(mock.restaurantCancel(cancelled, 'again')).rejects.toThrow(/409/);
    const r = await call(handle, 'POST', `/_mock/orders/${rejected}/reject`, { key: null, body: {} });
    expect(r.status).toBe(400);
    await expect(mock.accept('00000000-0000-4000-8000-000000000000')).rejects.toThrow(/404/);
  });

  it('outlet flags drive acceptingOrders, outlet_closed and outlet_not_accepting', async () => {
    await mock.setOutlet(OUTLET_LAGOON_KIOSK, { open: true });
    const outlets = (await call(handle, 'GET', `${P}/outlets`)).json as Array<{ outletId: string; acceptingOrders: boolean }>;
    expect(outlets.find((o) => o.outletId === OUTLET_LAGOON_KIOSK)?.acceptingOrders).toBe(true);
    await placeOrder(OUTLET_LAGOON_KIOSK);
    await mock.setOutlet(OUTLET_MARINE_DRIVE, { acceptingOnline: false });
    const r = await call(handle, 'POST', `${P}/orders`, { body: { outletId: OUTLET_MARINE_DRIVE, partnerReference: 'PX-X', lines: [{ variantId: VARIANT_VEGGIE_REGULAR, quantity: 1 }] }, headers: { 'idempotency-key': 'idem-x' } });
    expect(r.json.error).toBe('outlet_not_accepting');
    await expect(mock.setOutlet('nope', { open: true })).rejects.toThrow(/404/);
  });

  it('queued faults answer the next contract requests in order and never touch control routes', async () => {
    await mock.queueFaults([{ status: 503 }, { status: 429, retryAfterSeconds: 1 }, { status: 502 }]);
    expect((await mock.state()).faults).toHaveLength(3);
    const a = await call(handle, 'GET', `${P}/outlets`);
    expect(a.status).toBe(503);
    expect(a.json.error).toBe('auth_unavailable');
    const b = await call(handle, 'GET', `${P}/outlets`);
    expect(b.status).toBe(429);
    expect(b.json.error).toBe('rate_limited');
    expect(b.headers.get('retry-after')).toBe('1');
    const c = await call(handle, 'GET', `${P}/outlets`);
    expect(c.status).toBe(502);
    expect(c.headers.get('content-type')).toContain('text/plain');
    expect((await call(handle, 'GET', `${P}/outlets`)).status).toBe(200);
    expect((await call(handle, 'POST', '/_mock/faults', { key: null, body: { responses: [{ status: 200 }] } })).status).toBe(400);
  });

  it('autopilot walks a new order to picked_up one scheduler step at a time; reset cancels it', async () => {
    await mock.setAutopilot(true, 5);
    const id = await placeOrder();
    expect((await status(id)).status).toBe('pending');
    expect(scheduler.pending[0]?.ms).toBe(5000);
    scheduler.runNext();
    expect((await status(id)).status).toBe('accepted');
    scheduler.runNext();
    scheduler.runNext();
    scheduler.runNext();
    expect((await status(id)).status).toBe('picked_up');
    expect(scheduler.runNext()).toBe(false);
    const second = await placeOrder();
    await mock.reset();
    expect(scheduler.runNext()).toBe(false);
    expect((await mock.state()).orders).toEqual([]);
    expect(second).toBeTruthy();
  });

  it('a partner cancel while autopilot is armed stops the walk', async () => {
    await mock.setAutopilot(true, 5);
    const id = await placeOrder();
    await call(handle, 'POST', `${P}/orders/${id}/cancel`, { body: { reason: 'x' }, headers: { 'idempotency-key': 'idem-c' } });
    expect(scheduler.runNext()).toBe(false);
    expect((await status(id)).status).toBe('cancelled');
  });

  it('MockControl.detect is true for the mock and false for a dead port', async () => {
    expect(await MockControl.detect(handle.url)).toBe(true);
    expect(await MockControl.detect('http://127.0.0.1:1')).toBe(false);
  });

  it('MockControl.detect is false for a 200 that is not the mock snapshot', async () => {
    const answering = (body: string, type = 'application/json') => (async () => new Response(body, { status: 200, headers: { 'content-type': type } })) as typeof fetch;
    expect(await MockControl.detect('http://x', answering('<!doctype html><html><body>app</body></html>', 'text/html'))).toBe(false);
    expect(await MockControl.detect('http://x', answering('{}'))).toBe(false);
    expect(await MockControl.detect('http://x', answering('[]'))).toBe(false);
    expect(await MockControl.detect('http://x', answering('{"outlets":[],"autopilot":[]}'))).toBe(false);
    expect(await MockControl.detect('http://x', answering('{"outlets":[],"autopilot":{"enabled":true,"stepSeconds":5}}'))).toBe(true);
  });
});
