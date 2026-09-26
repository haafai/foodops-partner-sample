import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OUTLET_LAGOON_KIOSK, OUTLET_MARINE_DRIVE } from '../src/fixtures';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { P, call } from './helpers';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });
beforeEach(() => handle.state.reset());

describe('GET outlets', () => {
  it('lists both outlets with their accepting state and timeout', async () => {
    const r = await call(handle, 'GET', `${P}/outlets`);
    expect(r.status).toBe(200);
    expect(r.json).toEqual([
      { outletId: OUTLET_MARINE_DRIVE, name: 'Marine Drive', address: expect.any(String), phone: expect.any(String), acceptingOrders: true, acceptTimeoutMinutes: 10 },
      { outletId: OUTLET_LAGOON_KIOSK, name: 'Lagoon Kiosk', address: expect.any(String), phone: expect.any(String), acceptingOrders: false, acceptTimeoutMinutes: 15 },
    ]);
  });

  it('acceptingOrders needs both an open till and online ordering on', async () => {
    handle.state.outlets.get(OUTLET_MARINE_DRIVE)!.acceptingOnline = false;
    const r = await call(handle, 'GET', `${P}/outlets`);
    expect(r.json[0].acceptingOrders).toBe(false);
  });
});

describe('/_mock/state and /_mock/reset', () => {
  it('state shows outlet flags and no orders after a reset', async () => {
    handle.state.outlets.get(OUTLET_MARINE_DRIVE)!.open = false;
    expect((await call(handle, 'POST', '/_mock/reset')).status).toBe(204);
    const r = await call(handle, 'GET', '/_mock/state');
    expect(r.status).toBe(200);
    expect(r.json.outlets).toEqual([
      { outletId: OUTLET_MARINE_DRIVE, name: 'Marine Drive', open: true, acceptingOnline: true },
      { outletId: OUTLET_LAGOON_KIOSK, name: 'Lagoon Kiosk', open: false, acceptingOnline: true },
    ]);
    expect(r.json.orders).toEqual([]);
    expect(r.json.faults).toEqual([]);
    expect(r.json.autopilot).toEqual({ enabled: false, stepSeconds: 5 });
    expect(r.json.priceOverrides).toEqual([]);
  });

  it('control routes need no key', async () => {
    expect((await call(handle, 'GET', '/_mock/state', { key: null })).status).toBe(200);
    expect((await call(handle, 'GET', '/_mock/nothing', { key: null })).status).toBe(404);
  });
});
