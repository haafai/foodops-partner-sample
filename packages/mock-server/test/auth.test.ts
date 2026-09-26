import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FULL_KEY, MENU_ONLY_KEY, UNBOUND_KEY } from '../src/fixtures';
import { startMockServer } from '../src/server';
import type { MockServerHandle } from '../src/server';
import { P, call } from './helpers';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });
beforeEach(() => handle.state.reset());

describe('authentication', () => {
  it('401 invalid_api_key without a header, with WWW-Authenticate', async () => {
    const r = await call(handle, 'GET', `${P}/outlets`, { key: null });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: 'invalid_api_key', message: expect.any(String) });
    expect(r.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('401 for an unknown key and for a non-bearer scheme', async () => {
    expect((await call(handle, 'GET', `${P}/outlets`, { key: 'hbk_test_nobodyhome01_secret' })).status).toBe(401);
    expect((await call(handle, 'GET', `${P}/outlets`, { key: null, headers: { authorization: `Basic ${FULL_KEY}` } })).status).toBe(401);
  });

  it('401 when the key travels in the query string, even with a valid header', async () => {
    const r = await call(handle, 'GET', `${P}/outlets?access_token=${FULL_KEY}`);
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('invalid_api_key');
  });

  it('403 partner_key_required for a key that is not bound to a partner', async () => {
    const r = await call(handle, 'GET', `${P}/outlets`, { key: UNBOUND_KEY });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('partner_key_required');
  });

  it('a menu-only key may list outlets', async () => {
    expect((await call(handle, 'GET', `${P}/outlets`, { key: MENU_ONLY_KEY })).status).toBe(200);
  });

  it('404 not_found for an unknown partner route and for a route outside the prefix', async () => {
    expect((await call(handle, 'GET', `${P}/nothing`)).json.error).toBe('not_found');
    expect((await call(handle, 'GET', `/api/other`)).status).toBe(404);
  });
});
