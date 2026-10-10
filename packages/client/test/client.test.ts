import { describe, expect, it } from 'vitest';
import { PARTNER_API_PREFIX, PartnerClient } from '../src/client';
import { MissingIdempotencyKeyError, PartnerApiError, PartnerTimeoutError } from '../src/errors';
import { withRetry } from '../src/retry';
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

  it('getMenu falls back to the quoted menu version when the ETag header is missing', async () => {
    const menu = { outletId: 'o1', version: 'abc', categories: [] };
    const f = fakeFetch(() => jsonResponse(200, menu));
    const result = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).getMenu('o1');
    expect(result).toEqual({ modified: true, menu, etag: '"abc"' });
  });

  it('the missing-key error is a MissingIdempotencyKeyError (still a TypeError) and withRetry does not retry it', async () => {
    const f = fakeFetch(() => jsonResponse(201, {}));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn });
    let attempts = 0;
    const error = await withRetry(() => { attempts++; return client.createOrder(request, '  '); }, { sleep: async () => {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingIdempotencyKeyError);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).name).toBe('MissingIdempotencyKeyError');
    expect(attempts).toBe(1);
    expect(f.calls).toHaveLength(0);
  });
});

describe('PartnerClient webhook calls', () => {
  const hook = {
    url: 'https://partner.example.test/hooks/foodops', events: ['order', 'menu'], createdAt: '2026-10-08T09:00:00Z', updatedAt: '2026-10-08T09:00:00Z',
    lastDelivery: null, consecutiveFailures: 0,
  };

  it('setWebhook PUTs the URL alone when no events are given, with no Idempotency-Key, and returns the secret', async () => {
    const f = fakeFetch(() => jsonResponse(200, { ...hook, secret: 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' }));
    const registered = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).setWebhook(hook.url);
    expect(f.calls[0]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/webhook`);
    expect(f.calls[0]?.init.method).toBe('PUT');
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({ url: hook.url });
    expect(f.header(0, 'idempotency-key')).toBeNull();
    expect(f.header(0, 'authorization')).toBe(`Bearer ${KEY}`);
    expect(registered.secret).toBe('whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
  });

  it('setWebhook sends the events it was given', async () => {
    const f = fakeFetch(() => jsonResponse(200, { ...hook, events: ['order'], secret: 'whsec_x' }));
    await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).setWebhook(hook.url, ['order']);
    expect(JSON.parse(String(f.calls[0]?.init.body))).toEqual({ url: hook.url, events: ['order'] });
  });

  it('setWebhook throws the API error for a refused URL', async () => {
    const f = fakeFetch(() => jsonResponse(400, { error: 'invalid_webhook_url', message: 'The URL must be https on a public host.' }));
    const error = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).setWebhook('http://10.0.0.1/hook').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartnerApiError);
    expect((error as PartnerApiError).code).toBe('invalid_webhook_url');
  });

  it('getWebhook returns the endpoint, and null for the 404 that means none is set', async () => {
    const found = fakeFetch(() => jsonResponse(200, hook));
    expect(await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: found.fn }).getWebhook()).toEqual(hook);
    expect(found.calls[0]?.init.method).toBe('GET');
    const none = fakeFetch(() => jsonResponse(404, { error: 'not_found', message: 'No webhook is set.' }));
    expect(await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: none.fn }).getWebhook()).toBeNull();
  });

  it('getWebhook still throws for anything else, a missing scope included', async () => {
    const f = fakeFetch(() => jsonResponse(403, { error: 'insufficient_scope', message: 'Missing partner.webhook' }));
    const error = await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).getWebhook().catch((e: unknown) => e);
    expect((error as PartnerApiError).code).toBe('insufficient_scope');
  });

  it('deleteWebhook sends DELETE and resolves on the bodyless 204', async () => {
    const f = fakeFetch(() => new Response(null, { status: 204 }));
    await expect(new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).deleteWebhook()).resolves.toBeUndefined();
    expect(f.calls[0]?.url).toBe(`${BASE}${PARTNER_API_PREFIX}/webhook`);
    expect(f.calls[0]?.init.method).toBe('DELETE');
    expect(f.calls[0]?.init.body).toBeUndefined();
  });
});

/** A fetch that never answers until its signal aborts, then rejects the way fetch does. */
function hangingFetch() {
  return fakeFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError')));
  }));
}

describe('PartnerClient timeout', () => {
  it('passes an AbortSignal to fetch on every call', async () => {
    const f = fakeFetch(() => jsonResponse(200, []));
    await new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn }).listOutlets();
    expect(f.calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(f.calls[0]?.init.signal?.aborted).toBe(false);
  });

  it('throws a PartnerTimeoutError naming the method, path and limit, without the key or base URL', async () => {
    const f = hangingFetch();
    const client = new PartnerClient({ baseUrl: `https://user:pass@api.example.test`, apiKey: KEY, fetch: f.fn, timeoutMs: 20 });
    const error = await client.createOrder(request, 'idem-t').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartnerTimeoutError);
    expect(error).toMatchObject({ name: 'PartnerTimeoutError', method: 'POST', path: 'orders', timeoutMs: 20 });
    expect((error as Error).message).toBe('POST orders timed out after 20 ms');
    expect(JSON.stringify(error) + String(error)).not.toContain(KEY);
    expect(String(error)).not.toContain('pass');
    expect(f.calls[0]?.init.signal?.aborted).toBe(true);
  });

  it('a timeout is retryable: withRetry tries again and the second answer wins', async () => {
    let n = 0;
    const f = fakeFetch((_url, init) => {
      n++;
      if (n === 1) return new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return jsonResponse(200, [{ outletId: 'o1' }]);
    });
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn, timeoutMs: 20 });
    const outlets = await withRetry(() => client.listOutlets(), { sleep: async () => {} });
    expect(outlets).toEqual([{ outletId: 'o1' }]);
    expect(f.calls).toHaveLength(2);
  });

  it('an error that is not the timeout passes through unchanged', async () => {
    const failure = new TypeError('fetch failed');
    const f = fakeFetch(() => Promise.reject(failure));
    const client = new PartnerClient({ baseUrl: BASE, apiKey: KEY, fetch: f.fn, timeoutMs: 1000 });
    await expect(client.listOutlets()).rejects.toBe(failure);
  });
});
