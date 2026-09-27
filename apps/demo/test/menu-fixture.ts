import type { PartnerMenu, PartnerMenuItem } from '@foodops-partner/client';

export const CLASSIC: PartnerMenuItem = {
  productId: 'p-classic', name: 'Classic Burger', description: 'Beef patty.', imageUrl: null,
  variants: [
    { variantId: 'v-classic-r', name: 'Regular', price: 95, available: true },
    { variantId: 'v-classic-l', name: 'Large', price: 118, available: false },
  ],
  modifierGroups: [{ id: 'g-extras', name: 'Extras', min: 0, max: 3, modifiers: [
    { modifierId: 'm-cheese', name: 'Cheese', price: 12 },
    { modifierId: 'm-bacon', name: 'Bacon', price: 17 },
  ] }],
};

export const CHICKEN: PartnerMenuItem = {
  productId: 'p-chicken', name: 'Chicken Burger', description: null, imageUrl: null,
  variants: [{ variantId: 'v-chicken-r', name: 'Regular', price: 90, available: true }],
  modifierGroups: [{ id: 'g-spice', name: 'Spice level', min: 1, max: 1, modifiers: [
    { modifierId: 'm-mild', name: 'Mild', price: 0 },
    { modifierId: 'm-hot', name: 'Hot', price: 0 },
  ] }],
};

export const VEGGIE: PartnerMenuItem = {
  productId: 'p-veggie', name: 'Veggie Burger', description: 'Chickpea patty.', imageUrl: null,
  variants: [{ variantId: 'v-veggie-r', name: 'Regular', price: 85, available: true }],
  modifierGroups: [],
};

export const SOLD_OUT: PartnerMenuItem = {
  productId: 'p-soldout', name: 'Lobster Roll', description: null, imageUrl: null,
  variants: [{ variantId: 'v-lobster-r', name: 'Regular', price: 250, available: false }],
  modifierGroups: [],
};

export const NO_VARIANTS: PartnerMenuItem = {
  productId: 'p-novariants', name: 'Mystery Special', description: null, imageUrl: null,
  variants: [],
  modifierGroups: [],
};

export const MENU_FIXTURE: PartnerMenu = {
  outletId: 'o-marine', currency: 'MVR', pricesIncludeTax: true, partnerPriceList: { id: 'pl', name: 'Partner +15%' },
  version: 'abc123def456', categories: [{ id: 'c-burgers', name: 'Burgers', sortOrder: 1, items: [CLASSIC, CHICKEN, VEGGIE] }],
};

export const OUTLETS_FIXTURE = [
  { outletId: 'o-marine', name: 'Marine Drive', address: 'Malé', phone: '+960 330 0001', acceptingOrders: true, acceptTimeoutMinutes: 10 },
  { outletId: 'o-lagoon', name: 'Lagoon Kiosk', address: 'Hulhumalé', phone: null, acceptingOrders: false, acceptTimeoutMinutes: 15 },
];
