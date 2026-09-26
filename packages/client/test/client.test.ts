import { describe, expect, it } from 'vitest';
import { PARTNER_API_PREFIX, PartnerClient } from '../src/client';
import { PartnerApiError } from '../src/errors';
import type { CreatePartnerOrderRequest } from '../src/types';
import { fakeFetch, jsonResponse } from './fake-fetch';

const KEY = 'hbk_test_mockfull0001_fullscopes';
const BASE = 'https://api.example.test';
const request: CreatePartnerOrderRequest = { outletId: 'o1', partnerReference: 'PX-1', lines: [{ variantId: 'v1', quantity: 1 }] };

describe('PartnerClient', () => {
  it('sends the bearer key and Accept on every call, under the partner prefix', async () => {
    const f = fakeFetch(() => jsonResponse(200, []));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn });
    await client.listOutlets();
    expect(f.calls[0]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/outlets`);
    expect(f.calls[0]?.init.method).toBe('GET');
    expect(f.header(0, 'authorization')).toBe(`Bearer ${KEY}`);
    expect(f.header(0, 'accept')).toBe('application/json');
    expect(f.header(0, 'content-type')).toBeNull();
  });

  it('never doubles the slash when the base URL ends with one, or with the prefix pasted on', async () => {
    const f = fakeFetch(() => jsonResponse(200, []));
    await new PartnerClient({ baseUrl: `${BASE}/`, apiKey: KEY, fetch: f.fn }).listOutlets();
    await new PartnerClient({ baseUrl: `${BASE}${PARTNER_API_PREFIX}/`, apiKey: KEY, fetch: f.fn }).listOutlets();
    expect(f.calls[0]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/outlets`);
    expect(f.calls[1]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/outlets`);
  });

  it('getMenu sends If-None-Match and returns the menu with its ETag', async () => {
    const menu = { outletId: 'o1', version: 'abc', categories: [] };
    const f = fakeFetch(() => jsonResponse(200, menu, { etag: '"abc"' }));
    const result = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).getMenu('o1', { ifNoneMatch: '"old"' });
    expect(f.calls[0]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/outlets/o1/menu`);
    expect(f.header(0, 'if-none-match')).toBe('"old"');
    expect(result).toEqual({ modified: true, menu, etag: '"abc"' });
  });

  it('getMenu maps 304 to a not-modified result carrying the ETag it sent', async () => {
    const f = fakeFetch(() => new Response(null, { status: 304 }));
    const result = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).getMenu('o1', { ifNoneMatch: '"abc"' });
    expect(result).toEqual({ modified: false, etag: '"abc"' });
  });

  it('createOrder posts JSON with the Idempotency-Key verbatim', async () => {
    const f = fakeFetch(() => jsonResponse(201, { id: 'x', status: 'pending' }));
    const created = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).createOrder(request, 'idem-123');
    expect(created).toEqual({ id: 'x', status: 'pending' });
    expect(f.calls[0]?.init.method).toBe('POST');
    expect(f.header(0, 'idempotency-key')).toBe('idem-123');
    expect(f.header(0, 'content-type')).toBe('application/json');
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual(request);
  });

  it('createOrder refuses an empty idempotency key before touching the network', async () => {
    const f = fakeFetch(() => jsonResponse(201, {}));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn });
    await expect(client.createOrder(request, '')).rejects.toThrow(TypeError);
    expect(f.calls).toHaveLength(0);
  });

  it('cancelOrder refuses an empty idempotency key before touching the network', async () => {
    const f = fakeFetch(() => jsonResponse(200, { id: 'x', status: 'cancelled' }));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn });
    await expect(client.cancelOrder('x', 'customer left', '')).rejects.toThrow(TypeError);
    expect(f.calls).toHaveLength(0);
  });

  it('getOrder and cancelOrder address the order by id', async () => {
    const f = fakeFetch(() => jsonResponse(200, { id: 'a b', status: 'cancelled' }));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn });
    await client.getOrder('a b');
    await client.cancelOrder('a b', 'customer left', 'idem-9');
    expect(f.calls[0]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/orders/a%20b`);
    expect(f.calls[1]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/orders/a%20b/cancel`);
    expect(f.header(1, 'idempotency-key')).toBe('idem-9');
    expect(JSON.parse(String(f.calls[1]?.init.body))).toEqual({ reason: 'customer left' });
  });

  it('throws PartnerApiError on any non-2xx, and the key is nowhere in it', async () => {
    const f = fakeFetch(() => jsonResponse(403, { error: 'insufficient_scope', message: 'Missing orders.write' }));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn });
    const error = await client.createOrder(request, 'idem-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartnerApiError);
    expect((error as PartnerApiError).code).toBe('insufficient_scope');
    expect((error as Error).message).not.toContain(KEY);
    expect(JSON.stringify(error)).not.toContain(KEY);
  });
});
