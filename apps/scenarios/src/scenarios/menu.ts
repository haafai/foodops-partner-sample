import assert from 'node:assert/strict';
import type { Scenario } from '../scenario';

export const menuEtag: Scenario = {
  name: 'menu.etag',
  requires: [],
  async run(ctx) {
    const outlet = await ctx.pickOutlet();
    const first = await ctx.client.getMenu(outlet.outletId);
    assert.ok(first.modified, 'first read must return the menu');
    assert.ok(first.etag, 'the menu must carry an ETag');
    assert.equal(first.menu.outletId, outlet.outletId);
    assert.ok(first.menu.categories.length >= 1, 'expected at least one category');
    const second = await ctx.client.getMenu(outlet.outletId, { ifNoneMatch: first.etag });
    assert.equal(second.modified, false, 'If-None-Match with the current ETag must answer 304');
    assert.equal(second.etag, first.etag);
  },
};
