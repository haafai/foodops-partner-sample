import { describe, expect, it } from 'vitest';
import type { CreatePartnerOrderRequest, PartnerMenu, PartnerOrder, PartnerOrderCreated, PartnerOutlet } from '../src/types';

describe('types', () => {
  it('accept the contract examples', () => {
    const outlet: PartnerOutlet = { outletId: 'o1', name: 'Marine Drive', address: null, phone: null, acceptingOrders: true, acceptTimeoutMinutes: 10 };
    const menu: PartnerMenu = {
      outletId: 'o1', currency: 'MVR', pricesIncludeTax: true, partnerPriceList: { id: 'pl1', name: 'Partner +15%' }, version: '9f3a',
      categories: [{ id: 'c1', name: 'Burgers', sortOrder: 1, items: [{ productId: 'p1', name: 'Classic', description: null, imageUrl: null,
        variants: [{ variantId: 'v1', name: 'Regular', price: 95, available: true }],
        modifierGroups: [{ id: 'g1', name: 'Extras', min: 0, max: 3, modifiers: [{ modifierId: 'm1', name: 'Cheese', price: 10 }] }] }] }],
    };
    const request: CreatePartnerOrderRequest = { outletId: 'o1', partnerReference: 'PX-88213', customer: { name: 'Aishath', phone: '+9607771234' }, notes: 'no onions', expectedPickupAt: '2026-09-25T13:40:00Z', lines: [{ variantId: 'v1', quantity: 2, note: null, modifiers: [{ modifierId: 'm1', quantity: 1 }] }], partnerTotal: 312.5 };
    const created: PartnerOrderCreated = { id: 'x', reference: 'SO-10231', status: 'pending', totals: { subtotal: 280, tax: 22.4, serviceCharge: 10.1, total: 312.5 }, priceMismatch: false, partnerTotal: 312.5 };
    const order: PartnerOrder = { id: 'x', reference: 'SO-10231', partnerReference: 'PX-88213', status: 'accepted', reason: null, cancelledBy: null, createdAt: '2026-09-25T13:00:00Z', updatedAt: '2026-09-25T13:01:00Z', totals: created.totals };
    expect([outlet, menu, request, created, order].length).toBe(5);
  });
});
