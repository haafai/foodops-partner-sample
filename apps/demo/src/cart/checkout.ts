import type { CreatePartnerOrderRequest } from '@foodops-partner/client';
import { estimateTotal } from './cart';
import type { CartLine } from './cart';

export interface CheckoutForm {
  partnerReference: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  /** A datetime-local value in the browser's zone, or ''. */
  expectedPickupAt: string;
}

export function newPartnerReference(now: number = Date.now()): string {
  return `DEMO-${now}`;
}

/** The wire request. Pickup time is converted to UTC; the estimate rides along as partnerTotal for the restaurant to check. */
export function toCreateRequest(outletId: string, lines: CartLine[], form: CheckoutForm): CreatePartnerOrderRequest {
  const name = form.customerName.trim();
  const phone = form.customerPhone.trim();
  return {
    outletId,
    partnerReference: form.partnerReference,
    customer: name || phone ? { name, phone } : null,
    notes: form.notes.trim() || null,
    expectedPickupAt: form.expectedPickupAt ? new Date(form.expectedPickupAt).toISOString() : null,
    lines: lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
      note: line.note || null,
      modifiers: line.modifiers.length > 0 ? line.modifiers.map((m) => ({ modifierId: m.modifierId, quantity: m.quantity })) : null,
    })),
    partnerTotal: estimateTotal(lines),
  };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((k) => [k, sortKeys(record[k])]));
  }
  return value;
}

/** Same content ⇒ same fingerprint, whatever the key order. Drives when a new idempotency key is minted. */
export function requestFingerprint(request: CreatePartnerOrderRequest): string {
  return JSON.stringify(sortKeys(request));
}
