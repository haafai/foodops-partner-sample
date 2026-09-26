import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreatePartnerOrderRequest } from '@foodops-partner/client';
import {
  FULL_KEY, GROUP_EXTRAS, MENU_ONLY_KEY, MOD_CHEESE, MOD_DIP_GARLIC, MOD_EGG, MOD_BACON, OUTLET_LAGOON_KIOSK, OUTLET_MARINE_DRIVE,
  SECOND_FULL_KEY, UNBOUND_KEY, VARIANT_CHICKEN_REGULAR, VARIANT_CLASSIC_REGULAR, VARIANT_FISH_DOUBLE, VARIANT_FRIES_REGULAR,
} from '../src/fixtures';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { P, call } from './helpers';

const START = Date.parse('2026-09-26T09:00:00Z');
let now = START;
let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer({ clock: () => now }); });
afterAll(async () => { await handle.close(); });
beforeEach(() => { now = START; handle.state.reset(); });

let counter = 0;
const idem = () => `idem-${++counter}`;
const request = (overrides: Partial<CreatePartnerOrderRequest> = {}): CreatePartnerOrderRequest => ({
  outletId: OUTLET_MARINE_DRIVE,
  partnerReference: `PX-${++counter}`,
  customer: { name: 'Aishath', phone: '+9607771234' },
  lines: [{ variantId: VARIANT_CLASSIC_REGULAR, quantity: 2, modifiers: [{ modifierId: MOD_CHEESE, quantity: 1 }] }],
  ...overrides,
});
const create = (body: unknown, key = idem(), apiKey?: string) =>
  call(handle, 'POST', `${P}/orders`, { body, headers: { 'idempotency-key': key }, key: apiKey });

describe('POST orders: the happy path', () => {
  it('creates a pending order with server-side totals and a Location header', async () => {
    const r = await create(request());
    expect(r.status).toBe(201);
    expect(r.json).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), reference: 'SO-10001', status: 'pending',
      totals: { subtotal: 214, tax: 15.85, serviceCharge: 0, total: 214 },
      priceMismatch: false, partnerTotal: null,
    });
    expect(r.headers.get('location')).toBe(`${P}/orders/${r.json.id}`);
    expect(handle.state.orders.size).toBe(1);
  });

  it('GET returns the order with the partner reference and ISO times; other keys and unknown ids get 404', async () => {
    const body = request({ partnerReference: 'PX-GET' });
    const created = (await create(body)).json;
    const r = await call(handle, 'GET', `${P}/orders/${created.id}`);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      id: created.id, reference: 'SO-10001', partnerReference: 'PX-GET', status: 'pending', reason: null, cancelledBy: null,
      createdAt: '2026-09-26T09:00:00.000Z', updatedAt: '2026-09-26T09:00:00.000Z', totals: created.totals,
    });
    expect((await call(handle, 'GET', `${P}/orders/${created.id}`, { key: MENU_ONLY_KEY })).status).toBe(403);
    expect((await call(handle, 'GET', `${P}/orders/00000000-0000-4000-8000-000000000000`)).json.error).toBe('not_found');
  });

  it('flags a price mismatch beyond 0.01 but still creates the order', async () => {
    const wrong = await create(request({ partnerTotal: 1 }));
    expect(wrong.status).toBe(201);
    expect(wrong.json).toMatchObject({ priceMismatch: true, partnerTotal: 1 });
    const close = await create(request({ partnerTotal: 214.009 }));
    expect(close.json.priceMismatch).toBe(false);
    const exact = await create(request({ partnerTotal: 214 }));
    expect(exact.json).toMatchObject({ priceMismatch: false, partnerTotal: 214 });
  });
});

describe('POST orders: refusals, in contract order', () => {
  it('400 idempotency_key_required before anything else is looked at', async () => {
    const r = await call(handle, 'POST', `${P}/orders`, { body: { nonsense: true } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('idempotency_key_required');
  });

  it('400 invalid_request naming the field, and for a body that is not JSON', async () => {
    expect((await create(request({ partnerReference: '' }))).json).toMatchObject({ error: 'invalid_request', field: 'partnerReference' });
    expect((await create(request({ lines: [] }))).json).toMatchObject({ error: 'invalid_request', field: 'lines' });
    expect((await create(request({ lines: [{ variantId: VARIANT_CLASSIC_REGULAR, quantity: 0 }] }))).json).toMatchObject({ field: 'lines[0].quantity' });
    expect((await create(request({ customer: { name: 'x'.repeat(101), phone: '1' } }))).json).toMatchObject({ field: 'customer' });
    expect((await create(request({ partnerTotal: -5 }))).json).toMatchObject({ field: 'partnerTotal' });
    const raw = await fetch(`${handle.url}${P}/orders`, { method: 'POST', headers: { authorization: `Bearer ${FULL_KEY}`, 'idempotency-key': idem(), 'content-type': 'application/json' }, body: '{not json' });
    expect(raw.status).toBe(400);
    expect(((await raw.json()) as { field: string }).field).toBe('body');
  });

  it('the contract states maximums only: an empty name or phone, a long line note and a large modifier quantity pass validation', async () => {
    const nameOnly = await create(request({ customer: { name: 'Aishath', phone: '' } }));
    expect(nameOnly.status).toBe(201);
    const phoneOnly = await create(request({ partnerReference: 'PX-PHONE', customer: { name: '', phone: '+9607771234' } }));
    expect(phoneOnly.status).toBe(201);
    const longNote = await create(request({ partnerReference: 'PX-NOTE', lines: [{ variantId: VARIANT_CLASSIC_REGULAR, quantity: 1, note: 'n'.repeat(2000) }] }));
    expect(longNote.status).toBe(201);
    // Past validation: a modifier quantity of 500 reaches the menu's group limit (422), not a 400.
    const bigModifier = await create(request({ partnerReference: 'PX-MOD', lines: [{ variantId: VARIANT_CLASSIC_REGULAR, quantity: 1, modifiers: [{ modifierId: MOD_CHEESE, quantity: 500 }] }] }));
    expect(bigModifier.json.error).toBe('invalid_line');
    const zeroModifier = await create(request({ partnerReference: 'PX-MOD0', lines: [{ variantId: VARIANT_CLASSIC_REGULAR, quantity: 1, modifiers: [{ modifierId: MOD_CHEESE, quantity: 0 }] }] }));
    expect(zeroModifier.json).toMatchObject({ error: 'invalid_request', field: 'lines[0].modifiers[0]' });
    const wrongType = await create({ ...request({ partnerReference: 'PX-TYPE' }), customer: { name: 'A', phone: 7 } });
    expect(wrongType.json).toMatchObject({ error: 'invalid_request', field: 'customer' });
  });

  it('403s for the wrong keys', async () => {
    expect((await create(request(), idem(), MENU_ONLY_KEY)).json.error).toBe('insufficient_scope');
    expect((await create(request(), idem(), UNBOUND_KEY)).json.error).toBe('partner_key_required');
  });

  it('404 for an unknown outlet, 422 when online ordering is paused, 409 when no till is open', async () => {
    expect((await create(request({ outletId: '00000000-0000-4000-8000-000000000000' }))).json.error).toBe('not_found');
    handle.state.outlets.get(OUTLET_MARINE_DRIVE)!.acceptingOnline = false;
    const paused = await create(request());
    expect(paused.status).toBe(422);
    expect(paused.json.error).toBe('outlet_not_accepting');
    const closed = await create(request({ outletId: OUTLET_LAGOON_KIOSK }));
    expect(closed.status).toBe(409);
    expect(closed.json.error).toBe('outlet_closed');
    expect(handle.state.orders.size).toBe(0);
  });

  it('409 duplicate_order for the same reference at the same outlet within 24 h, carrying the first id; allowed after', async () => {
    const first = await create(request({ partnerReference: 'PX-DUP' }));
    const again = await create(request({ partnerReference: 'PX-DUP' }));
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ error: 'duplicate_order', message: expect.any(String), orderId: first.json.id });
    const elsewhere = await create(request({ partnerReference: 'PX-DUP', outletId: OUTLET_LAGOON_KIOSK }));
    expect(elsewhere.json.error).toBe('outlet_closed');
    now = START + 24 * 60 * 60 * 1000 + 60_000;
    expect((await create(request({ partnerReference: 'PX-DUP' }))).status).toBe(201);
  });

  it('the duplicate check runs before the till check', async () => {
    await create(request({ partnerReference: 'PX-ORDER' }));
    handle.state.outlets.get(OUTLET_MARINE_DRIVE)!.open = false;
    expect((await create(request({ partnerReference: 'PX-ORDER' }))).json.error).toBe('duplicate_order');
  });

  it('422 invalid_line with the line index and a reason', async () => {
    const cases: Array<[CreatePartnerOrderRequest['lines'], number, string]> = [
      [[{ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 }], 0, 'unknown variant'],
      [[{ variantId: VARIANT_FISH_DOUBLE, quantity: 1 }], 0, 'variant unavailable'],
      [[{ variantId: VARIANT_FRIES_REGULAR, quantity: 1, modifiers: [{ modifierId: MOD_CHEESE, quantity: 1 }] }], 0, 'modifier not on this item'],
      [[{ variantId: VARIANT_CHICKEN_REGULAR, quantity: 1 }], 0, 'group Spice level requires at least 1'],
      [[{ variantId: VARIANT_CLASSIC_REGULAR, quantity: 1, modifiers: [{ modifierId: MOD_CHEESE, quantity: 2 }, { modifierId: MOD_BACON, quantity: 1 }, { modifierId: MOD_EGG, quantity: 1 }] }], 0, 'group Extras allows at most 3'],
      [[{ variantId: VARIANT_FRIES_REGULAR, quantity: 1, modifiers: [{ modifierId: MOD_DIP_GARLIC, quantity: 1 }] }, { variantId: VARIANT_FISH_DOUBLE, quantity: 1 }], 1, 'variant unavailable'],
    ];
    for (const [lines, line, reason] of cases) {
      const r = await create(request({ lines }));
      expect(r.status, reason).toBe(422);
      expect(r.json, reason).toEqual({ error: 'invalid_line', message: expect.any(String), line, reason });
    }
    expect(handle.state.orders.size).toBe(0);
    expect(GROUP_EXTRAS).toBeTruthy();
  });
});

describe('POST orders: idempotency', () => {
  it('replays the same key + same body and conflicts on the same key + a different body', async () => {
    const key = idem();
    const body = request();
    const a = await create(body, key);
    const b = await create(body, key);
    expect(b.status).toBe(201);
    expect(b.json).toEqual(a.json);
    expect(b.headers.get('location')).toBe(a.headers.get('location'));
    expect(handle.state.orders.size).toBe(1);
    const c = await create({ ...body, notes: 'changed' }, key);
    expect(c.status).toBe(409);
    expect(c.json.error).toBe('idempotency_conflict');
  });

  it('a refused request is not remembered, so a corrected body may reuse the key', async () => {
    const key = idem();
    expect((await create(request({ lines: [{ variantId: VARIANT_FISH_DOUBLE, quantity: 1 }] }), key)).status).toBe(422);
    expect((await create(request(), key)).status).toBe(201);
  });

  it('an order is invisible to a second full-access key, and stays visible to the key that created it', async () => {
    const created = (await create(request())).json;
    expect((await call(handle, 'GET', `${P}/orders/${created.id}`, { key: SECOND_FULL_KEY })).status).toBe(404);
    expect((await call(handle, 'GET', `${P}/orders/${created.id}`)).status).toBe(200);
  });

  it('the same Idempotency-Key and body from a second full-access key creates its own order, not a replay', async () => {
    const key = idem();
    const body = request();
    const a = await create(body, key);
    const b = await create(body, key, SECOND_FULL_KEY);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json.id).not.toBe(a.json.id);
    expect(handle.state.orders.size).toBe(2);
  });

  it('the duplicate-reference rule is scoped per key: a second full-access key may reuse the same reference', async () => {
    const partnerReference = 'PX-CROSS-KEY';
    const first = await create(request({ partnerReference }));
    expect(first.status).toBe(201);
    const second = await create(request({ partnerReference }), idem(), SECOND_FULL_KEY);
    expect(second.status).toBe(201);
    expect(second.json.error).toBeUndefined();
  });
});
