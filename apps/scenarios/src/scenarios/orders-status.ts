import assert from 'node:assert/strict';
import { newIdempotencyKey } from '@foodops-partner/client';
import type { PartnerOrderCreated, PartnerSettableStatus } from '@foodops-partner/client';
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

export const orderReportDelivery: Scenario = {
  name: 'order.report-delivery',
  requires: ['mock-control'],
  async run(ctx) {
    const created = await place(ctx, 'deliver');
    await ctx.mock!.accept(created.id);
    const out = await ctx.client.updateOrderStatus(created.id, 'out_for_delivery', newIdempotencyKey());
    assert.equal(out.status, 'out_for_delivery');
    const delivered = await ctx.client.updateOrderStatus(created.id, 'delivered', newIdempotencyKey());
    assert.equal(delivered.status, 'delivered');
    const again = await ctx.client.updateOrderStatus(created.id, 'delivered', newIdempotencyKey());
    assert.equal(again.status, 'delivered', 'reporting the status the order already has answers 200');
    assert.equal(again.updatedAt, delivered.updatedAt, 'and changes nothing');
    await expectApiError(ctx.client.updateOrderStatus(created.id, 'out_for_delivery', newIdempotencyKey()), 409, 'invalid_status_change');
    assert.equal((await ctx.client.getOrder(created.id)).status, 'delivered');
  },
};

export const orderStatusNotAllowed: Scenario = {
  name: 'order.status-not-allowed',
  requires: [],
  async run(ctx) {
    const created = await place(ctx, 'too-soon');
    await expectApiError(ctx.client.updateOrderStatus(created.id, 'delivered', newIdempotencyKey()), 409, 'invalid_status_change');
    const notOurs = 'ready' as PartnerSettableStatus;
    const error = await expectApiError(ctx.client.updateOrderStatus(created.id, notOurs, newIdempotencyKey()), 400, 'invalid_request');
    assert.equal(error.details?.field, 'status');
    assert.equal((await ctx.client.getOrder(created.id)).status, 'pending');
  },
};
