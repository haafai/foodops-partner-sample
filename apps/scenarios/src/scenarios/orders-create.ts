import assert from 'node:assert/strict';
import { newIdempotencyKey } from '@foodops-partner/client';
import type { CreatePartnerOrderRequest } from '@foodops-partner/client';
import { simpleLine } from '../context';
import type { Scenario, ScenarioContext } from '../scenario';
import { expectApiError } from './auth';

export const orderCreate: Scenario = {
  name: 'order.create',
  requires: [],
  async run(ctx) {
    const outlet = await ctx.pickOutlet();
    const line = simpleLine(await ctx.pickMenu(outlet.outletId));
    const partnerReference = ctx.reference('create');
    const created = await ctx.client.createOrder(
      { outletId: outlet.outletId, partnerReference, customer: { name: 'Scenario Runner', phone: '+9607000000' }, lines: [line] },
      newIdempotencyKey(),
    );
    ctx.track(created.id);
    assert.equal(created.status, 'pending');
    assert.ok(created.id, 'id');
    assert.ok(created.reference, 'reference');
    assert.equal(typeof created.totals.total, 'number');
    assert.equal(created.priceMismatch, false, 'no partnerTotal was sent, so nothing can mismatch');
    assert.equal(created.partnerTotal, null);
    const fetched = await ctx.client.getOrder(created.id);
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.partnerReference, partnerReference);
    assert.equal(fetched.status, 'pending');
    assert.deepEqual(fetched.totals, created.totals);
  },
};

async function baseRequest(ctx: ScenarioContext, name: string): Promise<CreatePartnerOrderRequest> {
  const outlet = await ctx.pickOutlet();
  const line = simpleLine(await ctx.pickMenu(outlet.outletId));
  return { outletId: outlet.outletId, partnerReference: ctx.reference(name), customer: { name: 'Scenario Runner', phone: '+9607000000' }, lines: [line] };
}

export const orderIdempotentReplay: Scenario = {
  name: 'order.idempotent-replay',
  requires: [],
  async run(ctx) {
    const request = await baseRequest(ctx, 'replay');
    const key = newIdempotencyKey();
    const first = await ctx.client.createOrder(request, key);
    ctx.track(first.id);
    const second = await ctx.client.createOrder(request, key);
    assert.equal(second.id, first.id, 'the same key and body must replay the same order');
    assert.deepEqual(second, first);
    await expectApiError(ctx.client.createOrder({ ...request, notes: 'changed body' }, key), 409, 'idempotency_conflict');
  },
};

export const orderIdempotencyKeyRequired: Scenario = {
  name: 'order.idempotency-key-required',
  requires: [],
  async run(ctx) {
    const request = await baseRequest(ctx, 'nokey');
    const response = await ctx.raw('POST', '/orders', { body: request });
    assert.equal(response.status, 400, `expected 400, got ${response.status}`);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, 'idempotency_key_required');
  },
};

export const orderDuplicateReference: Scenario = {
  name: 'order.duplicate-reference',
  requires: [],
  async run(ctx) {
    const request = await baseRequest(ctx, 'dup');
    const first = await ctx.client.createOrder(request, newIdempotencyKey());
    ctx.track(first.id);
    const error = await expectApiError(ctx.client.createOrder(request, newIdempotencyKey()), 409, 'duplicate_order');
    assert.equal(error.details?.orderId, first.id, 'duplicate_order must carry the first order id');
  },
};

export const orderPriceMismatch: Scenario = {
  name: 'order.price-mismatch',
  requires: [],
  async run(ctx) {
    const request = await baseRequest(ctx, 'mismatch');
    const created = await ctx.client.createOrder({ ...request, partnerTotal: 1 }, newIdempotencyKey());
    ctx.track(created.id);
    assert.equal(created.priceMismatch, true, 'a partnerTotal of 1.00 must be flagged');
    assert.equal(created.partnerTotal, 1);
    assert.notEqual(created.totals.total, 1);
    assert.equal(created.status, 'pending', 'a mismatch flags, it never refuses');
  },
};
