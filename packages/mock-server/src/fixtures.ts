export type Scope = 'menu.read' | 'orders.write' | 'partner.webhook';

export interface MockKey {
  key: string;
  keyId: string;
  scopes: readonly Scope[];
  partnerBound: boolean;
  label: string;
}

/** The four built-in keys. They are fixtures, not secrets, so printing them is fine. */
export const MOCK_KEYS: readonly MockKey[] = [
  { key: 'hbk_test_mockfull0001_fullscopes', keyId: 'mockfull0001', scopes: ['menu.read', 'orders.write', 'partner.webhook'], partnerBound: true, label: 'full access' },
  { key: 'hbk_test_mockmenu0001_menuonly', keyId: 'mockmenu0001', scopes: ['menu.read'], partnerBound: true, label: 'menu only' },
  { key: 'hbk_test_mockunbd0001_unbound', keyId: 'mockunbd0001', scopes: ['menu.read', 'orders.write', 'partner.webhook'], partnerBound: false, label: 'not bound to a partner' },
  { key: 'hbk_test_mockfull0002_secondkey', keyId: 'mockfull0002', scopes: ['menu.read', 'orders.write', 'partner.webhook'], partnerBound: true, label: 'full access, second key' },
];
export const FULL_KEY = MOCK_KEYS[0].key;
export const MENU_ONLY_KEY = MOCK_KEYS[1].key;
export const UNBOUND_KEY = MOCK_KEYS[2].key;
export const SECOND_FULL_KEY = MOCK_KEYS[3].key;

export const OUTLET_MARINE_DRIVE = '3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01';
export const OUTLET_LAGOON_KIOSK = '3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c02';

export interface OutletFixture {
  outletId: string;
  name: string;
  address: string | null;
  phone: string | null;
  acceptTimeoutMinutes: number;
  partnerPriceList: { id: string; name: string } | null;
  initial: { open: boolean; acceptingOnline: boolean };
}

export const OUTLETS: readonly OutletFixture[] = [
  {
    outletId: OUTLET_MARINE_DRIVE, name: 'Marine Drive', address: 'Boduthakurufaanu Magu, Malé', phone: '+960 330 0001',
    acceptTimeoutMinutes: 10, partnerPriceList: { id: 'b7d2a9e4-5c1f-4e8a-9d3b-2f6c8a1e4d05', name: 'Partner +15%' },
    initial: { open: true, acceptingOnline: true },
  },
  {
    outletId: OUTLET_LAGOON_KIOSK, name: 'Lagoon Kiosk', address: 'Lagoon Road, Hulhumalé', phone: '+960 330 0002',
    acceptTimeoutMinutes: 15, partnerPriceList: null,
    initial: { open: false, acceptingOnline: true },
  },
];

/** Deterministic UUID-shaped ids for the menu. */
const id = (n: number): string => `7a0e5b10-0000-4000-8000-${String(n).padStart(12, '0')}`;

export interface Priced { list: number; partner: number }
export interface ModifierFixture { modifierId: string; name: string; price: Priced }
export interface GroupFixture { id: string; name: string; min: number; max: number; modifiers: ModifierFixture[] }
export interface VariantFixture { variantId: string; name: string; price: Priced; available: boolean }
export interface ItemFixture { productId: string; name: string; description: string | null; variants: VariantFixture[]; modifierGroups: GroupFixture[] }
export interface CategoryFixture { id: string; name: string; sortOrder: number; items: ItemFixture[] }

export const VARIANT_CLASSIC_REGULAR = id(101);
export const VARIANT_CLASSIC_LARGE = id(102);
export const GROUP_EXTRAS = id(150);
export const MOD_CHEESE = id(151);
export const MOD_BACON = id(152);
export const MOD_EGG = id(153);
export const VARIANT_CHICKEN_REGULAR = id(201);
export const GROUP_SPICE = id(250);
export const MOD_SPICE_MILD = id(251);
export const VARIANT_FISH_REGULAR = id(301);
export const VARIANT_FISH_DOUBLE = id(302);
export const VARIANT_VEGGIE_REGULAR = id(401);
export const VARIANT_LIME_SMALL = id(501);
export const VARIANT_COFFEE_REGULAR = id(601);
export const VARIANT_FRIES_REGULAR = id(701);
export const GROUP_DIP = id(750);
export const MOD_DIP_GARLIC = id(751);
export const VARIANT_RINGS_REGULAR = id(801);

const p = (list: number, partner: number): Priced => ({ list, partner });

export const MENU: readonly CategoryFixture[] = [
  {
    id: id(1), name: 'Burgers', sortOrder: 1, items: [
      {
        productId: id(10), name: 'Classic Burger', description: 'Beef patty, lettuce, tomato, house sauce.',
        variants: [
          { variantId: VARIANT_CLASSIC_REGULAR, name: 'Regular', price: p(85, 95), available: true },
          { variantId: VARIANT_CLASSIC_LARGE, name: 'Large', price: p(105, 118), available: true },
        ],
        modifierGroups: [{ id: GROUP_EXTRAS, name: 'Extras', min: 0, max: 3, modifiers: [
          { modifierId: MOD_CHEESE, name: 'Cheese', price: p(10, 12) },
          { modifierId: MOD_BACON, name: 'Bacon', price: p(15, 17) },
          { modifierId: MOD_EGG, name: 'Egg', price: p(8, 9) },
        ] }],
      },
      {
        productId: id(20), name: 'Chicken Burger', description: 'Grilled chicken thigh, slaw.',
        variants: [{ variantId: VARIANT_CHICKEN_REGULAR, name: 'Regular', price: p(80, 90), available: true }],
        modifierGroups: [{ id: GROUP_SPICE, name: 'Spice level', min: 1, max: 1, modifiers: [
          { modifierId: MOD_SPICE_MILD, name: 'Mild', price: p(0, 0) },
          { modifierId: id(252), name: 'Medium', price: p(0, 0) },
          { modifierId: id(253), name: 'Hot', price: p(0, 0) },
        ] }],
      },
      {
        productId: id(30), name: 'Fish Burger', description: 'Reef fish fillet, tartare.',
        variants: [
          { variantId: VARIANT_FISH_REGULAR, name: 'Regular', price: p(90, 100), available: true },
          { variantId: VARIANT_FISH_DOUBLE, name: 'Double', price: p(130, 145), available: false },
        ],
        modifierGroups: [],
      },
      {
        productId: id(40), name: 'Veggie Burger', description: 'Chickpea patty.',
        variants: [{ variantId: VARIANT_VEGGIE_REGULAR, name: 'Regular', price: p(75, 85), available: true }],
        modifierGroups: [],
      },
    ],
  },
  {
    id: id(2), name: 'Drinks', sortOrder: 2, items: [
      {
        productId: id(50), name: 'Lime Juice', description: null,
        variants: [
          { variantId: VARIANT_LIME_SMALL, name: 'Small', price: p(25, 28), available: true },
          { variantId: id(502), name: 'Large', price: p(35, 40), available: true },
        ],
        modifierGroups: [],
      },
      {
        productId: id(60), name: 'Iced Coffee', description: null,
        variants: [{ variantId: VARIANT_COFFEE_REGULAR, name: 'Regular', price: p(45, 50), available: true }],
        modifierGroups: [],
      },
    ],
  },
  {
    id: id(3), name: 'Sides', sortOrder: 3, items: [
      {
        productId: id(70), name: 'Fries', description: null,
        variants: [
          { variantId: VARIANT_FRIES_REGULAR, name: 'Regular', price: p(30, 35), available: true },
          { variantId: id(702), name: 'Large', price: p(40, 45), available: true },
        ],
        modifierGroups: [{ id: GROUP_DIP, name: 'Dip', min: 0, max: 2, modifiers: [
          { modifierId: MOD_DIP_GARLIC, name: 'Garlic', price: p(5, 6) },
          { modifierId: id(752), name: 'Chilli', price: p(5, 6) },
        ] }],
      },
      {
        productId: id(80), name: 'Onion Rings', description: null,
        variants: [{ variantId: VARIANT_RINGS_REGULAR, name: 'Regular', price: p(35, 40), available: true }],
        modifierGroups: [],
      },
    ],
  },
];

export function findVariantFixture(variantId: string): VariantFixture | undefined {
  for (const c of MENU) for (const i of c.items) for (const v of i.variants) if (v.variantId === variantId) return v;
  return undefined;
}
