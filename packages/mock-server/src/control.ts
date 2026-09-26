import type { IncomingMessage } from 'node:http';
import { findVariantFixture } from './fixtures';
import { empty, error, json, readJson } from './http';
import type { JsonResponse } from './http';
import type { MockState } from './state';

/** The simulated restaurant. Unauthenticated, local only, outside the contract. */
export async function handleControl(state: MockState, method: string, url: URL, req: IncomingMessage): Promise<JsonResponse> {
  const path = url.pathname.slice('/_mock/'.length);
  if (method === 'GET' && path === 'state') return json(200, state.snapshot());
  if (method === 'POST' && path === 'reset') {
    state.reset();
    return empty(204);
  }
  if (method === 'PUT' && path === 'prices') {
    const body = (await readJson(req)) as { variantId?: unknown; price?: unknown } | undefined;
    if (!body || typeof body.variantId !== 'string' || typeof body.price !== 'number' || body.price < 0) {
      return error(400, 'invalid_request', 'Send { variantId, price >= 0 }.');
    }
    if (!findVariantFixture(body.variantId)) return error(404, 'not_found', 'No such variant.');
    state.priceOverrides.set(body.variantId, body.price);
    return empty(204);
  }
  return error(404, 'not_found', 'No such control route.');
}
