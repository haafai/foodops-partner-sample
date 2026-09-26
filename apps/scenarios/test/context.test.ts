import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartnerMenu } from '@foodops-partner/client';
import { FULL_KEY, MENU_ONLY_KEY, OUTLET_LAGOON_KIOSK, UNBOUND_KEY, startMockServer } from '@foodops-partner/mock-server';
import type { MockServerHandle } from '@foodops-partner/mock-server';
import { createContext, groupWithMax, simpleLine, unavailableVariant } from '../src/context';

const menu: PartnerMenu = {
  outletId: 'o1', currency: 'MVR', pricesIncludeTax: true, partnerPriceList: null, version: 'v',
  categories: [{ id: 'c', name: 'C', sortOrder: 1, items: [
    { productId: 'a', name: 'Needs a pick', description: null, imageUrl: null,
      variants: [{ variantId: 'a1', name: 'R', price: 10, available: true }],
      modifierGroups: [{ id: 'g1', name: 'Spice', min: 1, max: 1, modifiers: [{ modifierId: 'm1', name: 'Mild', price: 0 }] }] },
    { productId: 'b', name: 'Sold out', description: null, imageUrl: null,
      variants: [{ variantId: 'b1', name: 'R', price: 10, available: false }], modifierGroups: [] },
    { productId: 'c', name: 'Plain', description: null, imageUrl: null,
      variants: [{ variantId: 'c1', name: 'R', price: 10, available: true }], modifierGroups: [] },
  ] }],
};

describe('menu pickers', () => {
  it('simpleLine skips items with a required group and unavailable variants', () => {
    expect(simpleLine(menu)).toEqual({ variantId: 'c1', quantity: 1 });
  });
  it('simpleLine throws when nothing simple is available', () => {
    const none: PartnerMenu = { ...menu, categories: [{ ...menu.categories[0], items: menu.categories[0].items.slice(0, 2) }] };
    expect(() => simpleLine(none)).toThrow(/no item/i);
  });
  it('unavailableVariant and groupWithMax find their fixtures', () => {
    expect(unavailableVariant(menu)?.variantId).toBe('b1');
    expect(groupWithMax(menu)).toEqual({ variant: menu.categories[0].items[0].variants[0], group: menu.categories[0].items[0].modifierGroups[0] });
  });
});

describe('createContext', () => {
  let handle: MockServerHandle;
  beforeAll(async () => { handle = await startMockServer(); });
  afterAll(async () => { await handle.close(); });

  it('detects the mock and fills every capability from it', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    expect([...ctx.capabilities].sort()).toEqual(['closed-outlet', 'menu-only-key', 'mock-control', 'unbound-key']);
    expect(ctx.closedOutletId).toBe(OUTLET_LAGOON_KIOSK);
    expect(ctx.menuOnlyKey).toBe(MENU_ONLY_KEY);
    expect(ctx.unboundKey).toBe(UNBOUND_KEY);
    expect(ctx.mock).toBeDefined();
  });

  it('has no capabilities against a non-mock base URL unless flags supply them', async () => {
    const bare = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY });
    expect(bare.capabilities.size).toBe(0);
    const flagged = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY, closedOutletId: 'x', menuOnlyKey: 'k' });
    expect([...flagged.capabilities].sort()).toEqual(['closed-outlet', 'menu-only-key']);
  });

  it('reference() is unique per call and cleanup() cancels tracked orders', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    expect(ctx.reference('x')).not.toBe(ctx.reference('x'));
    const outlet = await ctx.pickOutlet();
    const line = simpleLine(await ctx.pickMenu(outlet.outletId));
    const created = await ctx.client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference('cleanup'), lines: [line] }, 'idem-cleanup');
    ctx.track(created.id);
    await ctx.cleanup();
    expect((await ctx.client.getOrder(created.id)).status).toBe('cancelled');
  });
});
