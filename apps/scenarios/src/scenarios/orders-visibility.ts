import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newIdempotencyKey } from '@foodops-partner/client';
import { simpleLine } from '../context';
import type { Scenario } from '../scenario';
import { expectApiError } from './auth';

export const orderOutletClosed: Scenario = {
  name: 'order.outlet-closed',
  requires: ['closed-outlet'],
  async run(ctx) {
    const outletId = ctx.closedOutletId!;
    const line = simpleLine(await ctx.pickMenu(outletId));
    await expectApiError(
      ctx.client.createOrder({ outletId, partnerReference: ctx.reference('closed'), lines: [line] }, newIdempotencyKey()),
      409, 'outlet_closed',
    );
  },
};

export const orderForeignIds: Scenario = {
  name: 'order.foreign-ids',
  requires: [],
  async run(ctx) {
    const outletId = randomUUID();
    const orderId = randomUUID();
    await expectApiError(ctx.client.getMenu(outletId), 404, 'not_found');
    await expectApiError(ctx.client.getOrder(orderId), 404, 'not_found');
    await expectApiError(ctx.client.cancelOrder(orderId, 'probe', newIdempotencyKey()), 404, 'not_found');
    assert.ok(true);
  },
};
