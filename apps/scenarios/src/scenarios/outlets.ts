import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

export const outletsList: Scenario = {
  name: 'outlets.list',
  requires: [],
  async run(ctx) {
    const outlets = await ctx.client.listOutlets();
    assert.ok(outlets.length >= 1, 'expected at least one outlet');
    for (const outlet of outlets) {
      for (const field of ['outletId', 'name', 'address', 'phone', 'acceptingOrders', 'acceptTimeoutMinutes'] as const) {
        assert.ok(field in outlet, `outlet ${outlet.outletId ?? '?'} is missing ${field}`);
      }
      assert.equal(typeof outlet.acceptingOrders, 'boolean');
      assert.equal(typeof outlet.acceptTimeoutMinutes, 'number');
    }
    assert.ok(outlets.some((o) => o.acceptingOrders), 'expected at least one outlet accepting orders');
  },
};
