import assert from 'node:assert/strict';
import { newIdempotencyKey, withRetry } from '@foodops-partner/client';
import type { CreatePartnerOrderRequest } from '@foodops-partner/client';
import { simpleLine } from '../context';
import type { Scenario, ScenarioContext } from '../scenario';

async function request(ctx: ScenarioContext, name: string): Promise<CreatePartnerOrderRequest> {
  const outlet = await ctx.pickOutlet();
  const line = simpleLine(await ctx.pickMenu(outlet.outletId));
  return { outletId: outlet.outletId, partnerReference: ctx.reference(name), lines: [line] };
}

export const orderRejectedReason: Scenario = {
  name: 'order.rejected-reason',
  requires: ['mock-control'],
  async run(ctx) {
    const created = await ctx.client.createOrder(await request(ctx, 'reject'), newIdempotencyKey());
    ctx.track(created.id);
    await ctx.mock!.reject(created.id, 'Item unavailable');
    const order = await ctx.client.getOrder(created.id);
    assert.equal(order.status, 'rejected');
    assert.equal(order.reason, 'Item unavailable');
    assert.equal(order.cancelledBy, null);
  },
};

export const orderTimeout: Scenario = {
  name: 'order.timeout',
  requires: ['mock-control'],
  async run(ctx) {
    const created = await ctx.client.createOrder(await request(ctx, 'timeout'), newIdempotencyKey());
    ctx.track(created.id);
    await ctx.mock!.timeout(created.id);
    const order = await ctx.client.getOrder(created.id);
    assert.equal(order.status, 'rejected');
    assert.equal(order.reason, 'timeout');
  },
};

export const orderRetryThroughFaults: Scenario = {
  name: 'order.retry-through-faults',
  requires: ['mock-control'],
  async run(ctx) {
    const body = await request(ctx, 'retry');
    const key = newIdempotencyKey();
    // The next two partner requests answer 503 then 429 (Retry-After 1 s); nothing else may run in between.
    await ctx.mock!.queueFaults([{ status: 503 }, { status: 429, retryAfterSeconds: 1 }]);
    const created = await withRetry(() => ctx.client.createOrder(body, key), { attempts: 4, baseDelayMs: 100 });
    ctx.track(created.id);
    assert.equal(created.status, 'pending');
    const matching = (await ctx.mock!.state()).orders.filter((o) => o.partnerReference === body.partnerReference);
    assert.equal(matching.length, 1, 'retries with the same idempotency key must create exactly one order');
  },
};
