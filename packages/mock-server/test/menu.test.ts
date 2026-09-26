import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartnerMenu, PartnerMenuItem } from '@foodops-partner/client';
import { GROUP_SPICE, MENU_ONLY_KEY, OUTLET_LAGOON_KIOSK, OUTLET_MARINE_DRIVE, VARIANT_CLASSIC_REGULAR, VARIANT_FISH_DOUBLE } from '../src/fixtures';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { P, call } from './helpers';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });
beforeEach(() => handle.state.reset());

const items = (menu: PartnerMenu): PartnerMenuItem[] => menu.categories.flatMap((c) => c.items);
const variant = (menu: PartnerMenu, id: string) => items(menu).flatMap((i) => i.variants).find((v) => v.variantId === id);

describe('GET outlets/{id}/menu', () => {
  it('serves the partner-priced menu for Marine Drive with a strong ETag equal to the version', async () => {
    const r = await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`);
    expect(r.status).toBe(200);
    const menu = r.json as PartnerMenu;
    expect(menu.outletId).toBe(OUTLET_MARINE_DRIVE);
    expect(menu.currency).toBe('MVR');
    expect(menu.pricesIncludeTax).toBe(true);
    expect(menu.partnerPriceList).toEqual({ id: expect.any(String), name: 'Partner +15%' });
    expect(menu.version).toMatch(/^[0-9a-f]{64}$/);
    expect(r.headers.get('etag')).toBe(`"${menu.version}"`);
    expect(menu.categories.map((c) => c.name)).toEqual(['Burgers', 'Drinks', 'Sides']);
    expect(variant(menu, VARIANT_CLASSIC_REGULAR)?.price).toBe(95);
  });

  it('serves list prices and a null price list for Lagoon Kiosk', async () => {
    const menu = (await call(handle, 'GET', `${P}/outlets/${OUTLET_LAGOON_KIOSK}/menu`)).json as PartnerMenu;
    expect(menu.partnerPriceList).toBeNull();
    expect(variant(menu, VARIANT_CLASSIC_REGULAR)?.price).toBe(85);
  });

  it('keeps an unavailable variant in the menu with available: false, and carries group min/max', async () => {
    const menu = (await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`)).json as PartnerMenu;
    expect(variant(menu, VARIANT_FISH_DOUBLE)).toMatchObject({ name: 'Double', available: false });
    const spice = items(menu).flatMap((i) => i.modifierGroups).find((g) => g.id === GROUP_SPICE);
    expect(spice).toMatchObject({ name: 'Spice level', min: 1, max: 1 });
    expect(spice?.modifiers).toHaveLength(3);
  });

  it('answers 304 with no body when If-None-Match carries the current ETag', async () => {
    const first = await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`);
    const etag = first.headers.get('etag')!;
    const second = await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`, { headers: { 'if-none-match': etag } });
    expect(second.status).toBe(304);
    expect(second.text).toBe('');
    expect(second.headers.get('etag')).toBe(etag);
    const stale = await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`, { headers: { 'if-none-match': '"stale"' } });
    expect(stale.status).toBe(200);
  });

  it('changes the version when a price changes through /_mock/prices', async () => {
    const before = (await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`)).json as PartnerMenu;
    const set = await call(handle, 'PUT', '/_mock/prices', { key: null, body: { variantId: VARIANT_CLASSIC_REGULAR, price: 99 } });
    expect(set.status).toBe(204);
    const after = await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`, { headers: { 'if-none-match': `"${before.version}"` } });
    expect(after.status).toBe(200);
    expect((after.json as PartnerMenu).version).not.toBe(before.version);
    expect(variant(after.json as PartnerMenu, VARIANT_CLASSIC_REGULAR)?.price).toBe(99);
    expect((await call(handle, 'PUT', '/_mock/prices', { key: null, body: { variantId: 'nope', price: 1 } })).status).toBe(404);
    expect((await call(handle, 'PUT', '/_mock/prices', { key: null, body: { variantId: VARIANT_CLASSIC_REGULAR, price: -1 } })).status).toBe(400);
  });

  it('404 not_found for an unknown outlet, and the menu-only key may read', async () => {
    const r = await call(handle, 'GET', `${P}/outlets/00000000-0000-4000-8000-000000000000/menu`);
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('not_found');
    expect((await call(handle, 'GET', `${P}/outlets/${OUTLET_MARINE_DRIVE}/menu`, { key: MENU_ONLY_KEY })).status).toBe(200);
  });
});
