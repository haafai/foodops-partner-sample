import type { IncomingMessage } from 'node:http';
import { findVariantFixture } from './fixtures';
import { empty, error, json, readJson } from './http';
import type { JsonResponse } from './http';
import type { MockState } from './state';

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
    const parsed = body as { variantId?: unknown; price?: unknown } | undefined;
    if (!parsed || typeof parsed.variantId !== 'string' || typeof parsed.price !== 'number' || parsed.price < 0) {
      return error(400, 'invalid_request', 'Send { variantId, price >= 0 }.');
    }
    if (!findVariantFixture(parsed.variantId)) return error(404, 'not_found', 'No such variant.');
    state.priceOverrides.set(parsed.variantId, parsed.price);
    return empty(204);
  }
  return error(404, 'not_found', 'No such control route.');
}
