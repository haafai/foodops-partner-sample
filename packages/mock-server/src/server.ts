import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticate } from './auth';
import { handleControl } from './control';
import type { MockKey, Scope } from './fixtures';
import { error, headerValue, readJson, send, text } from './http';
import type { JsonResponse } from './http';
import { handleGetMenu } from './menu';
import { handleCreateOrder, handleGetOrder } from './orders';
import { handleListOutlets } from './outlets';
import type { Scheduler } from './scheduler';
import type { FaultResponse } from './snapshot';
import { MockState } from './state';
import type { MockStateOptions } from './state';

export const PARTNER_PREFIX = '/api/external/v1/partner/';

export interface RouteContext {
  state: MockState;
  key: MockKey;
  req: IncomingMessage;
  url: URL;
  /** Reads and parses the JSON body once. */
  body: () => Promise<unknown>;
}

interface Route {
  method: string;
  pattern: RegExp;
  scope: Scope;
  handle: (ctx: RouteContext, match: RegExpExecArray) => JsonResponse | Promise<JsonResponse>;
}

/** The two writes need the header before anything else, including reading the body. */
export function requireIdempotencyKey(req: IncomingMessage): string | JsonResponse {
  const key = headerValue(req.headers['idempotency-key'])?.trim();
  return key ? key : error(400, 'idempotency_key_required', 'Send an Idempotency-Key header with every write.');
}

/** Tasks 5–7 add rows here. Order does not matter; patterns are anchored. */
export const routes: Route[] = [
  { method: 'GET', pattern: /^outlets$/, scope: 'menu.read', handle: ({ state }) => handleListOutlets(state) },
  { method: 'GET', pattern: /^outlets\/([^/]+)\/menu$/, scope: 'menu.read', handle: ({ state, req }, m) => handleGetMenu(state, req, decodeURIComponent(m[1])) },
  {
    method: 'POST', pattern: /^orders$/, scope: 'orders.write',
    handle: async ({ state, key, req, body }) => {
      const idempotencyKey = requireIdempotencyKey(req);
      if (typeof idempotencyKey !== 'string') return idempotencyKey;
      return handleCreateOrder(state, key, await body(), idempotencyKey);
    },
  },
  { method: 'GET', pattern: /^orders\/([^/]+)$/, scope: 'orders.write', handle: ({ state, key }, m) => handleGetOrder(state, key, decodeURIComponent(m[1])) },
];

function faultResponse(fault: FaultResponse): JsonResponse {
  const headers: Record<string, string> = fault.retryAfterSeconds !== undefined ? { 'retry-after': String(fault.retryAfterSeconds) } : {};
  if (fault.status === 429) return error(429, 'rate_limited', 'Injected by /_mock/faults: too many requests.', {}, headers);
  if (fault.status === 503) return error(503, 'auth_unavailable', 'Injected by /_mock/faults: authentication is unavailable.', {}, headers);
  return text(fault.status, `Injected fault ${fault.status}`, headers);
}

async function handlePartner(state: MockState, method: string, url: URL, req: IncomingMessage): Promise<JsonResponse> {
  const fault = state.faults.shift();
  if (fault) return faultResponse(fault);
  const path = url.pathname.slice(PARTNER_PREFIX.length);
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    const auth = authenticate(req, url, route.scope);
    if (!auth.ok) return auth.response;
    let cached: { value: unknown } | undefined;
    const body = async () => {
      if (!cached) cached = { value: await readJson(req) };
      return cached.value;
    };
    try {
      return await route.handle({ state, key: auth.key, req, url, body }, match);
    } catch (e) {
      if (e instanceof SyntaxError) return error(400, 'invalid_request', 'The request body is not valid JSON.', { field: 'body' });
      throw e;
    }
  }
  return error(404, 'not_found', 'No such endpoint.');
}

export function createRequestHandler(state: MockState): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://mock.local');
      const method = (req.method ?? 'GET').toUpperCase();
      let out: JsonResponse;
      if (url.pathname.startsWith('/_mock/')) out = await handleControl(state, method, url, req);
      else if (url.pathname.startsWith(PARTNER_PREFIX)) out = await handlePartner(state, method, url, req);
      else out = error(404, 'not_found', 'No such route.');
      send(res, out);
    } catch (e) {
      send(res, error(500, 'mock_failure', e instanceof Error ? e.message : String(e)));
    }
  };
}

export const realScheduler: Scheduler = {
  schedule(ms, fn) {
    const timer = setTimeout(fn, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

export interface MockServerOptions extends MockStateOptions { port?: number; host?: string }
export interface MockServerHandle { url: string; port: number; state: MockState; close(): Promise<void> }

/** Port 0 (the default) picks a free port, which is what tests want. `npm run mock` passes 4010. */
export async function startMockServer(options: MockServerOptions = {}): Promise<MockServerHandle> {
  const state = new MockState({ clock: options.clock, scheduler: options.scheduler ?? realScheduler });
  const server = createServer(createRequestHandler(state));
  const host = options.host ?? '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://${host}:${port}`,
    port,
    state,
    close: () => new Promise<void>((resolve, reject) => {
      state.reset();
      server.closeAllConnections();
      server.close((e) => (e ? reject(e) : resolve()));
    }),
  };
}
