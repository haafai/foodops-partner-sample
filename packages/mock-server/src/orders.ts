import { randomUUID } from 'node:crypto';
import type { CreatePartnerOrderLine, CreatePartnerOrderRequest, PartnerMenu, PartnerMenuItem, PartnerMenuVariant, PartnerOrder, PartnerOrderCreated, PartnerTotals } from '@foodops-partner/client';
import { OUTLETS } from './fixtures';
import type { MockKey } from './fixtures';
import { error, json } from './http';
import type { JsonResponse } from './http';
import { buildMenu } from './menu';
import type { MockState, StoredOrder } from './state';

const DAY_MS = 24 * 60 * 60 * 1000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const orderLocation = (id: string): string => `/api/external/v1/partner/orders/${id}`;

type Validation = { ok: true; request: CreatePartnerOrderRequest } | { ok: false; field: string; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, min: number, max: number): boolean => typeof v === 'string' && v.length >= min && v.length <= max;
const present = (v: unknown): boolean => v !== undefined && v !== null;
const fail = (field: string, message: string): Validation => ({ ok: false, field, message });

/** The contract's field rules. The first failing field wins. */
export function validateCreateRequest(body: unknown): Validation {
  if (!isObj(body)) return fail('body', 'The body must be a JSON object.');
  if (!isStr(body.outletId, 1, 64)) return fail('outletId', 'outletId is required.');
  if (!isStr(body.partnerReference, 1, 64)) return fail('partnerReference', 'partnerReference is required, 1-64 characters.');
  if (present(body.customer)) {
    const c = body.customer;
    if (!isObj(c) || !isStr(c.name, 1, 100) || !isStr(c.phone, 1, 32)) return fail('customer', 'customer needs a name (at most 100) and a phone (at most 32).');
  }
  if (present(body.notes) && !isStr(body.notes, 0, 500)) return fail('notes', 'notes must be at most 500 characters.');
  if (present(body.expectedPickupAt) && (typeof body.expectedPickupAt !== 'string' || Number.isNaN(Date.parse(body.expectedPickupAt)))) {
    return fail('expectedPickupAt', 'expectedPickupAt must be an ISO-8601 time.');
  }
  if (present(body.partnerTotal) && (typeof body.partnerTotal !== 'number' || body.partnerTotal < 0)) return fail('partnerTotal', 'partnerTotal must be a number >= 0.');
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) return fail('lines', 'lines must hold 1-100 entries.');
  for (const [i, line] of body.lines.entries()) {
    if (!isObj(line) || !isStr(line.variantId, 1, 64)) return fail(`lines[${i}].variantId`, 'variantId is required.');
    if (!isInt(line.quantity, 1, 999)) return fail(`lines[${i}].quantity`, 'quantity must be an integer 1-999.');
    if (present(line.note) && !isStr(line.note, 0, 500)) return fail(`lines[${i}].note`, 'note must be at most 500 characters.');
    if (present(line.modifiers)) {
      if (!Array.isArray(line.modifiers)) return fail(`lines[${i}].modifiers`, 'modifiers must be an array.');
      for (const [j, m] of line.modifiers.entries()) {
        if (!isObj(m) || !isStr(m.modifierId, 1, 64) || !isInt(m.quantity, 1, 99)) {
          return fail(`lines[${i}].modifiers[${j}]`, 'each modifier needs a modifierId and an integer quantity >= 1.');
        }
      }
    }
  }
  return { ok: true, request: body as unknown as CreatePartnerOrderRequest };
}

export interface PricedLine { quantity: number; unitPrice: number; modifiers: Array<{ price: number; quantity: number }> }
type Pricing = { ok: true; lines: PricedLine[] } | { ok: false; line: number; reason: string };

/** Every line must name a variant on this outlet's menu that is available, with modifiers inside their groups' limits. */
export function priceLines(menu: PartnerMenu, lines: CreatePartnerOrderLine[]): Pricing {
  const variants = new Map<string, { item: PartnerMenuItem; variant: PartnerMenuVariant }>();
  for (const c of menu.categories) for (const item of c.items) for (const variant of item.variants) variants.set(variant.variantId, { item, variant });
  const priced: PricedLine[] = [];
  for (const [index, line] of lines.entries()) {
    const found = variants.get(line.variantId);
    if (!found) return { ok: false, line: index, reason: 'unknown variant' };
    if (!found.variant.available) return { ok: false, line: index, reason: 'variant unavailable' };
    const modifiers: PricedLine['modifiers'] = [];
    const perGroup = new Map<string, number>();
    for (const m of line.modifiers ?? []) {
      const group = found.item.modifierGroups.find((g) => g.modifiers.some((x) => x.modifierId === m.modifierId));
      if (!group) return { ok: false, line: index, reason: 'modifier not on this item' };
      const modifier = group.modifiers.find((x) => x.modifierId === m.modifierId)!;
      perGroup.set(group.id, (perGroup.get(group.id) ?? 0) + m.quantity);
      modifiers.push({ price: modifier.price, quantity: m.quantity });
    }
    for (const group of found.item.modifierGroups) {
      const count = perGroup.get(group.id) ?? 0;
      if (count < group.min) return { ok: false, line: index, reason: `group ${group.name} requires at least ${group.min}` };
      if (count > group.max) return { ok: false, line: index, reason: `group ${group.name} allows at most ${group.max}` };
    }
    priced.push({ quantity: line.quantity, unitPrice: found.variant.price, modifiers });
  }
  return { ok: true, lines: priced };
}

/** Prices include GST at 8%, so tax is the 8/108 share inside the subtotal; the mock charges no service fee. */
export function computeTotals(lines: PricedLine[]): PartnerTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.quantity * (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price * m.quantity, 0)), 0));
  const tax = round2((subtotal * 8) / 108);
  const serviceCharge = 0;
  return { subtotal, tax, serviceCharge, total: round2(subtotal + serviceCharge) };
}

export function toCreatedDto(o: StoredOrder): PartnerOrderCreated {
  return { id: o.id, reference: o.reference, status: o.status, totals: o.totals, priceMismatch: o.priceMismatch, partnerTotal: o.partnerTotal };
}

export function toOrderDto(o: StoredOrder): PartnerOrder {
  return {
    id: o.id, reference: o.reference, partnerReference: o.partnerReference, status: o.status, reason: o.reason, cancelledBy: o.cancelledBy,
    createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt).toISOString(), totals: o.totals,
  };
}

/** Visibility follows the key that created the order; anything else is a 404, never a 403. */
export function findVisibleOrder(state: MockState, key: MockKey, orderId: string): StoredOrder | undefined {
  const order = state.orders.get(orderId);
  return order && order.keyId === key.keyId ? order : undefined;
}

export function handleGetOrder(state: MockState, key: MockKey, orderId: string): JsonResponse {
  const order = findVisibleOrder(state, key, orderId);
  return order ? json(200, toOrderDto(order)) : error(404, 'not_found', 'No order with that id is visible to this key.');
}

/** The contract's create steps, in order. Any refusal creates nothing and remembers nothing. */
export function handleCreateOrder(state: MockState, key: MockKey, body: unknown, idempotencyKey: string): JsonResponse {
  const replay = state.replay(key.keyId, idempotencyKey, body);
  if (replay) return replay;
  const validation = validateCreateRequest(body);
  if (!validation.ok) return error(400, 'invalid_request', validation.message, { field: validation.field });
  const request = validation.request;
  const outlet = OUTLETS.find((o) => o.outletId === request.outletId);
  if (!outlet) return error(404, 'not_found', 'No outlet with that id takes your orders.');
  const flags = state.outlets.get(outlet.outletId)!;
  if (!flags.acceptingOnline) return error(422, 'outlet_not_accepting', 'This outlet has paused online orders.');
  const now = state.clock();
  const duplicate = [...state.orders.values()].find((o) =>
    o.keyId === key.keyId && o.outletId === outlet.outletId && o.partnerReference === request.partnerReference && now - o.createdAt < DAY_MS);
  if (duplicate) return error(409, 'duplicate_order', 'An order with this partner reference was created at this outlet in the last 24 hours.', { orderId: duplicate.id });
  if (!flags.open) return error(409, 'outlet_closed', 'No till is open at this outlet; nothing was queued.');
  const menu = buildMenu(state, outlet.outletId)!;
  const pricing = priceLines(menu, request.lines);
  if (!pricing.ok) return error(422, 'invalid_line', `Line ${pricing.line}: ${pricing.reason}.`, { line: pricing.line, reason: pricing.reason });
  const totals = computeTotals(pricing.lines);
  const partnerTotal = request.partnerTotal ?? null;
  const order: StoredOrder = {
    id: randomUUID(), keyId: key.keyId, outletId: outlet.outletId, reference: `SO-${state.nextOrderNumber++}`,
    partnerReference: request.partnerReference, status: 'pending', reason: null, cancelledBy: null,
    createdAt: now, updatedAt: now, totals,
    priceMismatch: partnerTotal !== null && Math.abs(partnerTotal - totals.total) > 0.01,
    partnerTotal, customer: request.customer ?? null, notes: request.notes ?? null,
  };
  state.orders.set(order.id, order);
  state.onOrderCreated?.(order.id);
  const response = json(201, toCreatedDto(order), { location: orderLocation(order.id) });
  state.remember(key.keyId, idempotencyKey, body, response);
  return response;
}
