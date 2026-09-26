import type { IncomingMessage } from 'node:http';
import { OUTLETS, findVariantFixture } from './fixtures';
import { empty, error, json, readJson } from './http';
import type { JsonResponse } from './http';
import { acceptOrder, advanceOrder, rejectOrder, restaurantCancel, timeoutOrder } from './lifecycle';
import type { TransitionResult } from './lifecycle';
import { toOrderDto } from './orders';
import type { MockState } from './state';
import type { FaultResponse } from './snapshot';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fromResult = (result: TransitionResult): JsonResponse => (result.ok ? json(200, toOrderDto(result.order)) : result.response);
const reasonOf = (body: unknown): string | undefined =>
  isObj(body) && typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason : undefined;

/** The simulated restaurant. Unauthenticated, local only, outside the contract. */
export async function handleControl(state: MockState, method: string, url: URL, req: IncomingMessage): Promise<JsonResponse> {
  const path = url.pathname.slice('/_mock/'.length);
  let body: unknown;
  try {
    body = method === 'GET' ? undefined : await readJson(req);
  } catch {
    return error(400, 'invalid_request', 'The body is not valid JSON.');
  }

  if (method === 'GET' && path === 'state') return json(200, state.snapshot());
  if (method === 'POST' && path === 'reset') {
    state.reset();
    return empty(204);
  }
  if (method === 'PUT' && path === 'prices') {
    if (!isObj(body) || typeof body.variantId !== 'string' || typeof body.price !== 'number' || body.price < 0) {
      return error(400, 'invalid_request', 'Send { variantId, price >= 0 }.');
    }
    if (!findVariantFixture(body.variantId)) return error(404, 'not_found', 'No such variant.');
    state.priceOverrides.set(body.variantId, body.price);
    return empty(204);
  }
  const outletMatch = /^outlets\/([^/]+)$/.exec(path);
  if (method === 'PUT' && outletMatch) {
    const outletId = decodeURIComponent(outletMatch[1]);
    const flags = state.outlets.get(outletId);
    if (!flags || !OUTLETS.some((o) => o.outletId === outletId)) return error(404, 'not_found', 'No such outlet.');
    if (!isObj(body)) return error(400, 'invalid_request', 'Send { open?, acceptingOnline? }.');
    if (typeof body.open === 'boolean') flags.open = body.open;
    if (typeof body.acceptingOnline === 'boolean') flags.acceptingOnline = body.acceptingOnline;
    return empty(204);
  }
  if (method === 'POST' && path === 'faults') {
    if (!isObj(body) || !Array.isArray(body.responses)) return error(400, 'invalid_request', 'Send { responses: [{ status, retryAfterSeconds? }] }.');
    const faults: FaultResponse[] = [];
    for (const f of body.responses) {
      if (!isObj(f) || typeof f.status !== 'number' || !Number.isInteger(f.status) || f.status < 400 || f.status > 599) {
        return error(400, 'invalid_request', 'Each fault needs an integer status 400-599.');
      }
      faults.push(typeof f.retryAfterSeconds === 'number' ? { status: f.status, retryAfterSeconds: f.retryAfterSeconds } : { status: f.status });
    }
    state.faults.push(...faults);
    return empty(204);
  }
  if (method === 'PUT' && path === 'autopilot') {
    if (!isObj(body) || typeof body.enabled !== 'boolean') return error(400, 'invalid_request', 'Send { enabled, stepSeconds? }.');
    const stepSeconds = typeof body.stepSeconds === 'number' && body.stepSeconds > 0 ? body.stepSeconds : state.autopilot.stepSeconds;
    state.autopilot = { enabled: body.enabled, stepSeconds };
    return empty(204);
  }
  const orderMatch = /^orders\/([^/]+)\/(accept|reject|advance|timeout|restaurant-cancel)$/.exec(path);
  if (method === 'POST' && orderMatch) {
    const orderId = decodeURIComponent(orderMatch[1]);
    switch (orderMatch[2]) {
      case 'accept': return fromResult(acceptOrder(state, orderId));
      case 'advance': return fromResult(advanceOrder(state, orderId));
      case 'timeout': return fromResult(timeoutOrder(state, orderId));
      case 'reject': {
        const reason = reasonOf(body);
        return reason ? fromResult(rejectOrder(state, orderId, reason)) : error(400, 'invalid_request', 'Send { reason }.');
      }
      case 'restaurant-cancel': {
        const reason = reasonOf(body);
        return reason ? fromResult(restaurantCancel(state, orderId, reason)) : error(400, 'invalid_request', 'Send { reason }.');
      }
    }
  }
  return error(404, 'not_found', 'No such control route.');
}
