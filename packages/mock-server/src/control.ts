import type { IncomingMessage } from 'node:http';
import { empty, error, json } from './http';
import type { JsonResponse } from './http';
import type { MockState } from './state';

/** The simulated restaurant. Unauthenticated, local only, outside the contract. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Task 7's rewrite reads the request body on some control routes.
export async function handleControl(state: MockState, method: string, url: URL, _req: IncomingMessage): Promise<JsonResponse> {
  const path = url.pathname.slice('/_mock/'.length);
  if (method === 'GET' && path === 'state') return json(200, state.snapshot());
  if (method === 'POST' && path === 'reset') {
    state.reset();
    return empty(204);
  }
  return error(404, 'not_found', 'No such control route.');
}
