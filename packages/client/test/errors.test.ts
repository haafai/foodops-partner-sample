import { describe, expect, it } from 'vitest';
import { PARTNER_ERROR_CODES, PartnerApiError, errorFromResponse } from '../src/errors';
import { jsonResponse } from './fake-fetch';

describe('PartnerApiError', () => {
  it('lists every code in the contract table', () => {
    expect(PARTNER_ERROR_CODES).toEqual([
      'invalid_request', 'idempotency_key_required', 'invalid_api_key', 'quota_exceeded', 'partner_key_required',
      'endpoint_not_available', 'insufficient_scope', 'ip_not_allowed', 'not_found', 'duplicate_order', 'outlet_closed',
      'cannot_cancel', 'idempotency_conflict', 'outlet_not_accepting', 'outlet_not_configured', 'invalid_line',
      'rate_limited', 'auth_unavailable', 'invalid_webhook_url', 'invalid_events',
    ]);
  });

  it('maps the contract error body and keeps extra fields as details', async () => {
    const error = await errorFromResponse(jsonResponse(409, { error: 'duplicate_order', message: 'Seen before.', orderId: 'abc' }));
    expect(error).toBeInstanceOf(PartnerApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('duplicate_order');
    expect(error.message).toBe('Seen before.');
    expect(error.details).toEqual({ orderId: 'abc' });
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('leaves details undefined when the body has only error and message', async () => {
    const error = await errorFromResponse(jsonResponse(404, { error: 'not_found', message: 'No.' }));
    expect(error.details).toBeUndefined();
  });

  it('falls back to http_<status> for a non-JSON body', async () => {
    const error = await errorFromResponse(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }));
    expect(error.code).toBe('http_502');
    expect(error.status).toBe(502);
    expect(error.message).toBe('Bad Gateway');
  });

  it('reads Retry-After in seconds', async () => {
    const error = await errorFromResponse(jsonResponse(429, { error: 'rate_limited', message: 'Slow down.' }, { 'retry-after': '7' }));
    expect(error.retryAfterSeconds).toBe(7);
  });

  it('reads Retry-After as an HTTP-date, rounded up to whole seconds from now', async () => {
    const now = Date.parse('2026-09-26T10:00:00Z');
    const error = await errorFromResponse(
      jsonResponse(429, { error: 'rate_limited', message: 'Slow down.' }, { 'retry-after': 'Sat, 26 Sep 2026 10:00:02 GMT' }),
      now,
    );
    expect(error.retryAfterSeconds).toBe(2);
  });

  it('ignores an unparseable Retry-After', async () => {
    const error = await errorFromResponse(jsonResponse(429, { error: 'rate_limited', message: 'x' }, { 'retry-after': 'soon' }));
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('serialises without losing the code', () => {
    const error = new PartnerApiError({ status: 422, code: 'invalid_line', message: 'Line 0', details: { line: 0 } });
    expect(JSON.parse(JSON.stringify(error))).toEqual({ name: 'PartnerApiError', status: 422, code: 'invalid_line', message: 'Line 0', details: { line: 0 } });
  });
});
