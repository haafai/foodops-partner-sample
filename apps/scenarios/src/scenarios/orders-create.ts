import assert from 'node:assert/strict';
import { newIdempotencyKey } from '@foodops-partner/client';
import { simpleLine } from '../context';
import type { Scenario } from '../scenario';

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
