import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { PartnerMenu, PartnerMenuCategory } from '@foodops-partner/client';
import { MENU, OUTLETS } from './fixtures';
import type { Priced } from './fixtures';
import { empty, error, headerValue, json } from './http';
import type { JsonResponse } from './http';
import type { MockState } from './state';

/** The menu as the partner sees it: partner prices where the outlet has a price list, list prices otherwise. */
export function buildMenu(state: MockState, outletId: string): PartnerMenu | undefined {
  const outlet = OUTLETS.find((o) => o.outletId === outletId);
  if (!outlet) return undefined;
  const pick = (price: Priced): number => (outlet.partnerPriceList ? price.partner : price.list);
  const categories: PartnerMenuCategory[] = MENU.map((c) => ({
    id: c.id, name: c.name, sortOrder: c.sortOrder,
    items: c.items.map((i) => ({
      productId: i.productId, name: i.name, description: i.description, imageUrl: null,
      variants: i.variants.map((v) => ({
        variantId: v.variantId, name: v.name,
        price: state.priceOverrides.get(v.variantId) ?? pick(v.price),
        available: v.available,
      })),
      modifierGroups: i.modifierGroups.map((g) => ({
        id: g.id, name: g.name, min: g.min, max: g.max,
        modifiers: g.modifiers.map((m) => ({ modifierId: m.modifierId, name: m.name, price: pick(m.price) })),
      })),
    })),
  }));
  const unversioned: Omit<PartnerMenu, 'version'> = {
    outletId, currency: 'MVR', pricesIncludeTax: true, partnerPriceList: outlet.partnerPriceList, categories,
  };
  return { ...unversioned, version: menuVersion(unversioned) };
}

/** SHA-256 of the response without `version`, as the contract says. */
export function menuVersion(unversioned: Omit<PartnerMenu, 'version'>): string {
  return createHash('sha256').update(JSON.stringify(unversioned)).digest('hex');
}

export function handleGetMenu(state: MockState, req: IncomingMessage, outletId: string): JsonResponse {
  const menu = buildMenu(state, outletId);
  if (!menu) return error(404, 'not_found', 'No outlet with that id takes your orders.');
  const etag = `"${menu.version}"`;
  const ifNoneMatch = headerValue(req.headers['if-none-match']);
  const matches = ifNoneMatch !== undefined && ifNoneMatch.split(',').map((s) => s.trim()).includes(etag);
  if (matches) return empty(304, { etag });
  return json(200, menu, { etag, 'cache-control': 'private, max-age=60' });
}
