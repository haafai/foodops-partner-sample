import type { PartnerOrderStatus } from './status';

// Every shape below is copied from the partner API contract. Decimals are JSON numbers; times are ISO-8601 UTC.

export interface PartnerOutlet {
  outletId: string;
  name: string;
  address: string | null;
  phone: string | null;
  /** A till is open and the outlet takes online orders right now. */
  acceptingOrders: boolean;
  /** Minutes a pending order waits before the restaurant's silence rejects it. */
  acceptTimeoutMinutes: number;
}

export interface PartnerPriceListRef { id: string; name: string }
export interface PartnerMenuModifier { modifierId: string; name: string; price: number }
export interface PartnerModifierGroup { id: string; name: string; min: number; max: number; modifiers: PartnerMenuModifier[] }
export interface PartnerMenuVariant { variantId: string; name: string; price: number; available: boolean }
export interface PartnerMenuItem {
  productId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  variants: PartnerMenuVariant[];
  modifierGroups: PartnerModifierGroup[];
}
export interface PartnerMenuCategory { id: string; name: string; sortOrder: number; items: PartnerMenuItem[] }
export interface PartnerMenu {
  outletId: string;
  currency: string;
  pricesIncludeTax: boolean;
  /** The price list that priced this menu for you, or null when you see list prices. */
  partnerPriceList: PartnerPriceListRef | null;
  /** Changes whenever anything in the menu changes; also the ETag. */
  version: string;
  categories: PartnerMenuCategory[];
}

export interface CreatePartnerOrderLineModifier { modifierId: string; quantity: number }
export interface CreatePartnerOrderLine {
  variantId: string;
  quantity: number;
  note?: string | null;
  modifiers?: CreatePartnerOrderLineModifier[] | null;
}
export interface CreatePartnerOrderRequest {
  outletId: string;
  /** Your own order id, 1–64 characters. The same value at the same outlet within 24 h is a duplicate. */
  partnerReference: string;
  customer?: { name: string; phone: string } | null;
  notes?: string | null;
  expectedPickupAt?: string | null;
  lines: CreatePartnerOrderLine[];
  /** What you charged the customer. Advisory: a mismatch is flagged, never refused. */
  partnerTotal?: number | null;
}

export interface PartnerTotals { subtotal: number; tax: number; serviceCharge: number; total: number }
export interface PartnerOrderCreated {
  id: string;
  reference: string;
  status: PartnerOrderStatus;
  totals: PartnerTotals;
  priceMismatch: boolean;
  partnerTotal: number | null;
}
export interface PartnerOrder {
  id: string;
  reference: string;
  partnerReference: string;
  status: PartnerOrderStatus;
  /** The rejection or cancellation reason; `timeout` when the restaurant never answered. */
  reason: string | null;
  cancelledBy: 'partner' | 'restaurant' | null;
  createdAt: string;
  updatedAt: string;
  totals: PartnerTotals;
}
export interface CancelPartnerOrderRequest { reason: string }

/** The two families of events a webhook can subscribe to. */
export type PartnerWebhookEventName = 'order' | 'menu';
export type PartnerWebhookOutcome = 'delivered' | 'http_error' | 'timeout' | 'connection_failed' | 'blocked_address';
export interface PartnerWebhookLastDelivery {
  at: string;
  /** Null when no HTTP answer came back (a timeout, a refused connection, a blocked address). */
  httpStatus: number | null;
  outcome: PartnerWebhookOutcome;
}
export interface PartnerWebhook {
  url: string;
  /** Always in the order `order`, `menu`. */
  events: PartnerWebhookEventName[];
  createdAt: string;
  updatedAt: string;
  /** The last attempt, whatever its outcome; null until the first event is sent. */
  lastDelivery: PartnerWebhookLastDelivery | null;
  consecutiveFailures: number;
}
/** What `PUT webhook` answers. The secret is returned here and nowhere else: store it before doing anything more. */
export interface PartnerWebhookRegistration extends PartnerWebhook { secret: string }
export interface SetPartnerWebhookRequest { url: string; events?: PartnerWebhookEventName[] }
