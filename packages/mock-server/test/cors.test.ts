import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { P, call } from './helpers';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });
beforeEach(() => handle.state.reset());

const EXPECTED: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, If-None-Match',
  'access-control-expose-headers': 'ETag, Retry-After, Location, WWW-Authenticate',
  'access-control-max-age': '600',
};

function expectCors(headers: Headers): void {
  for (const [name, value] of Object.entries(EXPECTED)) expect(headers.get(name), name).toBe(value);
}

/** A browser preflight: no Authorization header, the request headers it wants to send. */
function preflight(path: string) {
  return call(handle, 'OPTIONS', path, {
    key: null,
    headers: { origin: 'http://localhost:5180', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type, idempotency-key' },
  });
}

describe('CORS', () => {
  it('answers a preflight to a partner route with 204 and the CORS headers', async () => {
    const r = await preflight(`${P}/orders`);
    expect(r.status).toBe(204);
    expect(r.text).toBe('');
    expectCors(r.headers);
  });

  it('answers a preflight to a /_mock/ route with 204 and the CORS headers', async () => {
    const r = await preflight('/_mock/state');
    expect(r.status).toBe(204);
    expectCors(r.headers);
  });

  it('a preflight does not consume a queued fault; the next GET gets it', async () => {
    expect((await call(handle, 'POST', '/_mock/faults', { key: null, body: { responses: [{ status: 503 }] } })).status).toBe(204);
    expect((await preflight(`${P}/outlets`)).status).toBe(204);
    expect(handle.state.faults).toHaveLength(1);
    const r = await call(handle, 'GET', `${P}/outlets`);
    expect(r.status).toBe(503);
    expectCors(r.headers);
  });

  it('a normal 200 and a 401 both carry the allow-origin and expose headers', async () => {
    const ok = await call(handle, 'GET', `${P}/outlets`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    expect(ok.headers.get('access-control-expose-headers')).toBe(EXPECTED['access-control-expose-headers']);
    const denied = await call(handle, 'GET', `${P}/outlets`, { key: null });
    expect(denied.status).toBe(401);
    expect(denied.headers.get('access-control-allow-origin')).toBe('*');
    expect(denied.headers.get('access-control-expose-headers')).toBe(EXPECTED['access-control-expose-headers']);
  });
});
