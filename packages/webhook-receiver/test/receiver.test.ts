import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signWebhookPayload } from '@foodops-partner/client';
import { MAX_BODY_BYTES, startReceiver } from '../src/receiver';
import type { ReceiverHandle } from '../src/receiver';

// The fixed vector from the contract: key bytes 0x00..0x1f, t = 2026-10-08T09:12:44Z.
const SECRET = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const T = 1791450764;
const BODY = '{"id":"evt_01JA0000000000000000000000","type":"order.accepted","createdAt":"2026-10-08T09:12:44Z","data":{"orderId":"0b6f1c9e-2a4d-4e7b-9c31-5d8e7f6a1b02","partnerReference":"PX-88213","outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","status":"accepted"}}';
const HEADER = `t=${T},v1=88cd927dacae4753a86afe380fd999d557b1a6f27cc3305226af8310435fbc86`;

let now = T * 1000;
let receiver: ReceiverHandle;
beforeEach(async () => {
  now = T * 1000;
  receiver = await startReceiver({ clock: () => now, secret: SECRET });
});
afterEach(async () => { await receiver.close(); });

async function post(body: string | Uint8Array, headers: Record<string, string> = {}, url = receiver.webhookUrl) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : undefined };
}
async function signed(body: string, at = Math.floor(now / 1000), secret = SECRET) {
  return post(body, { 'hubits-signature': await signWebhookPayload(secret, at, body) });
}
const event = (id: string, type = 'order.ready', data: Record<string, unknown> = { orderId: 'o1', partnerReference: 'PX-1', outletId: 'out1', status: 'ready' }) =>
  JSON.stringify({ id, type, createdAt: new Date(now).toISOString(), data });

describe('POST /webhooks/foodops', () => {
  it('accepts the fixed vector, byte for byte, and records it', async () => {
    const r = await post(BODY, { 'hubits-signature': HEADER });
    expect(r).toEqual({ status: 200, json: { received: true } });
    const kept = receiver.state.eventsAfter(0);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ seq: 1, receivedAt: '2026-10-08T09:12:44.000Z', event: { id: 'evt_01JA0000000000000000000000', type: 'order.accepted' } });
  });

  it('answers 401 and records nothing when the signature is missing, malformed or wrong', async () => {
    expect((await post(BODY)).status).toBe(401);
    expect((await post(BODY, { 'hubits-signature': 'nonsense' })).status).toBe(401);
    expect((await post(BODY, { 'hubits-signature': `t=${T},v1=${'0'.repeat(64)}` })).json).toEqual({ error: 'invalid_signature' });
    expect((await signed(BODY, T, 'whsec_AQECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')).status).toBe(401);
    expect(receiver.state.eventsAfter(0)).toEqual([]);
    expect(receiver.state.snapshot('x')).toMatchObject({ rejected: 4, lastRejection: { reason: 'signature_mismatch' } });
  });

  it('answers 401 when the body is not the bytes that were signed', async () => {
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect((await post(reserialised, { 'hubits-signature': HEADER })).status).toBe(401);
    expect((await post(BODY.replace('accepted"}}', 'ready"}}'), { 'hubits-signature': HEADER })).status).toBe(401);
    expect(receiver.state.eventsAfter(0)).toEqual([]);
  });

  it('answers 401 for a correctly signed delivery whose timestamp is more than five minutes away', async () => {
    now = (T + 301) * 1000;
    expect((await post(BODY, { 'hubits-signature': HEADER })).status).toBe(401);
    expect(receiver.state.lastRejection?.reason).toBe('timestamp_out_of_tolerance');
    now = (T + 300) * 1000;
    expect((await post(BODY, { 'hubits-signature': HEADER })).status).toBe(200);
  });

  it('answers 401 to everything until a secret has been set', async () => {
    receiver.state.secret = null;
    expect((await post(BODY, { 'hubits-signature': HEADER })).status).toBe(401);
    expect(receiver.state.lastRejection?.reason).toBe('no_secret');
  });

  it('answers 200 to a repeated event id and keeps one copy', async () => {
    expect((await signed(event('evt_A'))).json).toEqual({ received: true });
    expect((await signed(event('evt_A'))).json).toEqual({ received: true, duplicate: true });
    expect((await signed(event('evt_A', 'order.picked_up'))).json).toEqual({ received: true, duplicate: true });
    expect(receiver.state.eventsAfter(0)).toHaveLength(1);
    expect(receiver.state.snapshot('x')).toMatchObject({ received: 1, duplicates: 2, rejected: 0 });
  });

  it('answers 200 and keeps an event of a type it does not know', async () => {
    expect((await signed(event('evt_new', 'invoice.paid', { invoiceId: 'i1' }))).status).toBe(200);
    expect(receiver.state.eventsAfter(0)[0].event.type).toBe('invoice.paid');
  });

  it('answers 400 to a signed body that is not an event', async () => {
    expect((await signed('[1,2,3]')).status).toBe(400);
    expect((await signed('not json')).json).toEqual({ error: 'invalid_event' });
    expect(receiver.state.eventsAfter(0)).toEqual([]);
  });

  it('verifies non-ASCII text as the UTF-8 bytes that travelled', async () => {
    const body = event('evt_utf8', 'order.rejected', { orderId: 'o1', partnerReference: 'PX-1', outletId: 'out1', status: 'rejected', reason: 'Café closed — ހުސް' });
    expect((await signed(body)).status).toBe(200);
    expect(receiver.state.eventsAfter(0)[0].event.data.reason).toBe('Café closed — ހުސް');
  });

  it('answers 413 to a body larger than the limit without reading it as an event', async () => {
    const big = JSON.stringify({ id: 'evt_big', type: 'order.ready', createdAt: new Date(now).toISOString(), data: { pad: 'x'.repeat(MAX_BODY_BYTES) } });
    expect((await signed(big)).status).toBe(413);
    expect(receiver.state.eventsAfter(0)).toEqual([]);
  });

  it('serves nothing else on the public port: other paths 404, other methods 405, control routes 404', async () => {
    expect((await post(BODY, { 'hubits-signature': HEADER }, receiver.webhookUrl.replace('/webhooks/foodops', '/other'))).status).toBe(404);
    const get = await fetch(receiver.webhookUrl);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    const base = receiver.webhookUrl.replace('/webhooks/foodops', '');
    expect((await fetch(`${base}/_receiver/state`)).status).toBe(404);
    const put = await fetch(`${base}/_receiver/secret`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: SECRET }) });
    expect(put.status).toBe(404);
  });
});
