import { describe, expect, it } from 'vitest';
import {
  decodeWebhookSecret, isMenuEvent, isOrderEvent, parseSignatureHeader, parseWebhookEnvelope, signWebhookPayload, verifyWebhookSignature,
} from '../src/webhooks';

// The fixed vector. Key: the 32 bytes 0x00..0x1f. Timestamp: 2026-10-08T09:12:44Z. Body: the 256 bytes below.
const SECRET = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const T = 1791450764;
const BODY = '{"id":"evt_01JA0000000000000000000000","type":"order.accepted","createdAt":"2026-10-08T09:12:44Z","data":{"orderId":"0b6f1c9e-2a4d-4e7b-9c31-5d8e7f6a1b02","partnerReference":"PX-88213","outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","status":"accepted"}}';
const V1 = '88cd927dacae4753a86afe380fd999d557b1a6f27cc3305226af8310435fbc86';
const HEADER = `t=${T},v1=${V1}`;
// The same key and timestamp over a body with non-ASCII text, so a wrong text encoding cannot pass.
const BODY_UTF8 = '{"id":"evt_01JA0000000000000000000001","type":"order.rejected","createdAt":"2026-10-08T09:12:44Z","data":{"orderId":"0b6f1c9e-2a4d-4e7b-9c31-5d8e7f6a1b02","partnerReference":"PX-88213","outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","status":"rejected","reason":"Café closed — ހުސް"}}';
const V1_UTF8 = '8379fff7014ea6ba86332d0c1233e41f6699397ea78b2d17b99c5e1e04d4cbe2';

const verify = (over: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
  verifyWebhookSignature({ secret: SECRET, header: HEADER, rawBody: BODY, now: T, ...over });

describe('the fixed vector', () => {
  it('has a body of exactly 256 bytes', () => {
    expect(new TextEncoder().encode(BODY)).toHaveLength(256);
  });
  it('signs to the known value', async () => {
    expect(await signWebhookPayload(SECRET, T, BODY)).toBe(HEADER);
  });
  it('signs a non-ASCII body as UTF-8 bytes', async () => {
    expect(await signWebhookPayload(SECRET, T, BODY_UTF8)).toBe(`t=${T},v1=${V1_UTF8}`);
  });
  it('verifies from a string and from the raw bytes', async () => {
    expect(await verify()).toEqual({ ok: true, timestamp: T });
    expect(await verify({ rawBody: new TextEncoder().encode(BODY) })).toEqual({ ok: true, timestamp: T });
    expect(await verify({ rawBody: new TextEncoder().encode(BODY_UTF8), header: `t=${T},v1=${V1_UTF8}` })).toEqual({ ok: true, timestamp: T });
  });
});

describe('verifyWebhookSignature refuses', () => {
  it('a missing header', async () => {
    expect(await verify({ header: null })).toEqual({ ok: false, reason: 'missing_header' });
    expect(await verify({ header: '' })).toEqual({ ok: false, reason: 'missing_header' });
  });
  it('a malformed header', async () => {
    for (const header of ['nonsense', `v1=${V1}`, `t=${T}`, `t=${T},v1=abc`, `t=soon,v1=${V1}`, `t=${T},v1=${V1.toUpperCase()}`, `t=${T},v1=${V1}00`]) {
      expect(await verify({ header }), header).toEqual({ ok: false, reason: 'malformed_header' });
    }
  });
  it('a secret that is not whsec_ plus 32 bytes', async () => {
    for (const secret of ['', 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', 'whsec_', 'whsec_AAEC', 'whsec_!!!!']) {
      expect(await verify({ secret }), secret).toEqual({ ok: false, reason: 'bad_secret' });
    }
  });
  it('a body that differs by one byte, including re-serialised JSON', async () => {
    expect(await verify({ rawBody: BODY.replace('accepted"}}', 'accepted" }}') })).toEqual({ ok: false, reason: 'signature_mismatch' });
    expect(await verify({ rawBody: JSON.stringify(JSON.parse(BODY), null, 1) })).toEqual({ ok: false, reason: 'signature_mismatch' });
    expect(await verify({ rawBody: `${BODY}\n` })).toEqual({ ok: false, reason: 'signature_mismatch' });
  });
  it('another secret, and a signature for another timestamp', async () => {
    expect(await verify({ secret: 'whsec_AQECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8' })).toEqual({ ok: false, reason: 'signature_mismatch' });
    expect(await verify({ header: `t=${T + 1},v1=${V1}`, now: T + 1 })).toEqual({ ok: false, reason: 'signature_mismatch' });
  });
  it('a timestamp more than five minutes old, or more than five minutes ahead', async () => {
    expect(await verify({ now: T + 300 })).toEqual({ ok: true, timestamp: T });
    expect(await verify({ now: T + 301 })).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
    expect(await verify({ now: T - 300 })).toEqual({ ok: true, timestamp: T });
    expect(await verify({ now: T - 301 })).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });
  it('reports a forged signature as a mismatch even when its timestamp is also stale', async () => {
    expect(await verify({ header: `t=${T},v1=${'0'.repeat(64)}`, now: T + 9999 })).toEqual({ ok: false, reason: 'signature_mismatch' });
  });
});

describe('parseSignatureHeader', () => {
  it('reads the pairs in any order, ignores unknown names, and keeps every v1', () => {
    const parsed = parseSignatureHeader(` v2=later , v1=${V1},t=${T}, v1=${'a'.repeat(64)} `);
    expect(parsed?.timestamp).toBe(T);
    expect(parsed?.signatures).toHaveLength(2);
  });
  it('accepts when any one of several v1 values matches', async () => {
    expect(await verify({ header: `t=${T},v1=${'a'.repeat(64)},v1=${V1}` })).toEqual({ ok: true, timestamp: T });
  });
});

describe('decodeWebhookSecret', () => {
  it('returns the 32 key bytes', () => {
    expect(Array.from(decodeWebhookSecret(SECRET) ?? [])).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });
});

describe('parseWebhookEnvelope', () => {
  it('reads the vector as an order event', () => {
    const event = parseWebhookEnvelope(BODY);
    expect(event).toMatchObject({ id: 'evt_01JA0000000000000000000000', type: 'order.accepted', createdAt: '2026-10-08T09:12:44Z' });
    expect(event && isOrderEvent(event)).toBe(true);
    expect(event && isMenuEvent(event)).toBe(false);
  });
  it('reads a menu event', () => {
    const event = parseWebhookEnvelope('{"id":"evt_2","type":"menu.updated","createdAt":"2026-10-08T09:12:44Z","data":{"outletId":"o1","version":"abc"}}');
    expect(event && isMenuEvent(event)).toBe(true);
  });
  it('keeps an event of a type it has never heard of, so the receiver can still answer 200', () => {
    const event = parseWebhookEnvelope('{"id":"evt_3","type":"invoice.paid","createdAt":"2026-10-08T09:12:44Z","data":{}}');
    expect(event?.type).toBe('invoice.paid');
    expect(event && (isOrderEvent(event) || isMenuEvent(event))).toBe(false);
  });
  it('reads createdAt with seven fractional digits and with none, and orders the two correctly', () => {
    const fractional = parseWebhookEnvelope('{"id":"evt_5","type":"order.ready","createdAt":"2026-10-08T09:12:44.1234567Z","data":{"orderId":"a","partnerReference":"p","outletId":"o","status":"ready"}}');
    const whole = parseWebhookEnvelope('{"id":"evt_6","type":"order.preparing","createdAt":"2026-10-08T09:12:44Z","data":{"orderId":"a","partnerReference":"p","outletId":"o","status":"preparing"}}');
    expect(fractional?.createdAt).toBe('2026-10-08T09:12:44.1234567Z');
    expect(whole?.createdAt).toBe('2026-10-08T09:12:44Z');
    expect(Date.parse(whole!.createdAt)).toBe(Date.UTC(2026, 9, 8, 9, 12, 44));
    expect(Date.parse(fractional!.createdAt) - Date.parse(whole!.createdAt)).toBe(123);
    expect(fractional && isOrderEvent(fractional)).toBe(true);
  });
  it('is null for anything that is not an envelope', () => {
    for (const body of ['', 'not json', '[]', '{}', '{"id":"e","type":"order.ready","createdAt":"yesterday","data":{}}', '{"id":"e","type":"order.ready","createdAt":"2026-10-08T09:12:44Z"}', '{"id":"","type":"x","createdAt":"2026-10-08T09:12:44Z","data":{}}']) {
      expect(parseWebhookEnvelope(body), body).toBeNull();
    }
    expect(parseWebhookEnvelope(new Uint8Array([0xff, 0xfe]))).toBeNull();
  });
  it('does not call an order event one when its type and status disagree', () => {
    const event = parseWebhookEnvelope('{"id":"evt_4","type":"order.ready","createdAt":"2026-10-08T09:12:44Z","data":{"orderId":"a","partnerReference":"p","outletId":"o","status":"accepted"}}');
    expect(event && isOrderEvent(event)).toBe(false);
  });
});
