import { canCancel, isTerminal } from '@foodops-partner/client';
import type { PartnerOrderStatus } from '@foodops-partner/client';
import type { MockKey } from './fixtures';
import { error, json } from './http';
import type { JsonResponse } from './http';
import { findVisibleOrder, toOrderDto } from './orders';
import type { MockState, StoredOrder } from './state';
import { announceOrder } from './webhooks';

export type TransitionResult = { ok: true; order: StoredOrder } | { ok: false; response: JsonResponse };

const notFound = (): TransitionResult => ({ ok: false, response: error(404, 'not_found', 'No order with that id.') });
const invalid = (from: PartnerOrderStatus, to: string): TransitionResult =>
  ({ ok: false, response: error(409, 'invalid_transition', `Cannot go from ${from} to ${to}.`) });

/** Apply a change, stamp the time, and drop any autopilot timer once the order can no longer move. */
function stamp(state: MockState, order: StoredOrder, patch: Partial<StoredOrder>): TransitionResult {
  Object.assign(order, patch, { updatedAt: state.clock() });
  // Every status change in the mock passes through here, so this is the one place an order event is raised.
  if (patch.status !== undefined) announceOrder(state, order);
  if (isTerminal(order.status)) {
    state.timers.get(order.id)?.();
    state.timers.delete(order.id);
  }
  return { ok: true, order };
}

export function acceptOrder(state: MockState, orderId: string): TransitionResult {
  const order = state.orders.get(orderId);
  if (!order) return notFound();
  if (order.status !== 'pending') return invalid(order.status, 'accepted');
  return stamp(state, order, { status: 'accepted' });
}

export function rejectOrder(state: MockState, orderId: string, reason: string): TransitionResult {
  const order = state.orders.get(orderId);
  if (!order) return notFound();
  if (order.status !== 'pending') return invalid(order.status, 'rejected');
  return stamp(state, order, { status: 'rejected', reason });
}

export function timeoutOrder(state: MockState, orderId: string): TransitionResult {
  return rejectOrder(state, orderId, 'timeout');
}

const NEXT: Partial<Record<PartnerOrderStatus, PartnerOrderStatus>> = { accepted: 'preparing', preparing: 'ready', ready: 'picked_up' };

export function advanceOrder(state: MockState, orderId: string): TransitionResult {
  const order = state.orders.get(orderId);
  if (!order) return notFound();
  const next = NEXT[order.status];
  if (!next) return invalid(order.status, 'the next step');
  return stamp(state, order, { status: next });
}

export function restaurantCancel(state: MockState, orderId: string, reason: string): TransitionResult {
  const order = state.orders.get(orderId);
  if (!order) return notFound();
  if (isTerminal(order.status)) return invalid(order.status, 'cancelled');
  return stamp(state, order, { status: 'cancelled', cancelledBy: 'restaurant', reason });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The contract's partner cancel: allowed while pending or accepted, refused from preparing on, idempotent on a finished order. */
export function handlePartnerCancel(state: MockState, key: MockKey, orderId: string, body: unknown, idempotencyKey: string): JsonResponse {
  const replay = state.replay(key.keyId, idempotencyKey, body);
  if (replay) return replay;
  if (!isObj(body) || typeof body.reason !== 'string' || body.reason.trim() === '' || body.reason.length > 200) {
    return error(400, 'invalid_request', 'reason is required, at most 200 characters.', { field: 'reason' });
  }
  const order = findVisibleOrder(state, key, orderId);
  if (!order) return error(404, 'not_found', 'No order with that id is visible to this key.');
  if (order.status !== 'cancelled' && order.status !== 'rejected') {
    if (!canCancel(order.status)) return error(409, 'cannot_cancel', `The order is ${order.status}; the kitchen has started it. Call the restaurant.`);
    stamp(state, order, { status: 'cancelled', cancelledBy: 'partner', reason: `Partner: ${body.reason}` });
  }
  const response = json(200, toOrderDto(order));
  state.remember(key.keyId, idempotencyKey, body, response);
  return response;
}

/** With autopilot on, the restaurant accepts after one step and advances one status per step until picked up. */
export function scheduleAutopilot(state: MockState, orderId: string): void {
  if (!state.autopilot.enabled) return;
  const arm = (): void => {
    state.timers.set(orderId, state.scheduler.schedule(state.autopilot.stepSeconds * 1000, step));
  };
  const step = (): void => {
    const order = state.orders.get(orderId);
    if (!order || isTerminal(order.status)) return;
    if (order.status === 'pending') acceptOrder(state, orderId);
    else advanceOrder(state, orderId);
    const after = state.orders.get(orderId);
    if (after && !isTerminal(after.status)) arm();
  };
  arm();
}
