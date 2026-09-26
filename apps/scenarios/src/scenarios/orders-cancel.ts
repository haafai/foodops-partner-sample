import assert from 'node:assert/strict';
import { newIdempotencyKey } from '@foodops-partner/client';
import type { PartnerOrderCreated } from '@foodops-partner/client';
import { simpleLine } from '../context';
import type { Scenario, ScenarioContext } from '../scenario';
import { expectApiError } from './auth';

async function place(ctx: ScenarioContext, name: string): Promise<PartnerOrderCreated> {
  const outlet = await ctx.pickOutlet();
  const line = simpleLine(await ctx.pickMenu(outlet.outletId));
  const created = await ctx.client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference(name), lines: [line] }, newIdempotencyKey());
  ctx.track(created.id);
  return created;
}

export const orderCancelPending: Scenario = {
  name: 'order.cancel-pending',
  requires: [],
  async run(ctx) {
    const created = await place(ctx, 'cancel');
    const cancelled = await ctx.client.cancelOrder(created.id, 'customer changed their mind', newIdempotencyKey());
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledBy, 'partner');
    assert.ok(cancelled.reason?.includes('customer changed their mind'), `reason should carry the text, got ${cancelled.reason}`);
    assert.equal((await ctx.client.getOrder(created.id)).status, 'cancelled');
  },
};

export const orderCancelTwice: Scenario = {
  name: 'order.cancel-twice',
  requires: [],
  async run(ctx) {
    const created = await place(ctx, 'twice');
    const key = newIdempotencyKey();
    const first = await ctx.client.cancelOrder(created.id, 'gone', key);
    const replay = await ctx.client.cancelOrder(created.id, 'gone', key);
    assert.deepEqual(replay, first, 'the same key must replay the same answer');
    const again = await ctx.client.cancelOrder(created.id, 'gone again', newIdempotencyKey());
    assert.equal(again.status, 'cancelled', 'cancelling a cancelled order answers 200 with the current order');
    assert.equal(again.reason, first.reason, 'the first cancellation reason stands');
  },
};

export const orderCancelAfterPreparing: Scenario = {
  name: 'order.cancel-after-preparing',
  requires: ['mock-control'],
  async run(ctx) {
    const created = await place(ctx, 'preparing');
    await ctx.mock!.accept(created.id);
    await ctx.mock!.advance(created.id);
    await expectApiError(ctx.client.cancelOrder(created.id, 'too late', newIdempotencyKey()), 409, 'cannot_cancel');
    assert.equal((await ctx.client.getOrder(created.id)).status, 'preparing');
  },
};
