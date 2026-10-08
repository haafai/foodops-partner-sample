import { request } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signWebhookPayload } from '@foodops-partner/client';
import { ReceiverControl } from '../src/control-client';
import { startReceiver } from '../src/receiver';
import type { ReceiverHandle } from '../src/receiver';

const SECRET = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const DEMO = 'http://localhost:5180';

let receiver: ReceiverHandle;
let control: ReceiverControl;
beforeEach(async () => {
  receiver = await startReceiver();
  control = new ReceiverControl(`${receiver.controlUrl}/`);
});
afterEach(async () => { await receiver.close(); });

async function deliver(id: string): Promise<number> {
  const body = JSON.stringify({ id, type: 'menu.updated', createdAt: new Date().toISOString(), data: { outletId: 'out1', version: id } });
  const header = await signWebhookPayload(SECRET, Math.floor(Date.now() / 1000), body);
  return (await fetch(receiver.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'hubits-signature': header }, body })).status;
}

/** fetch refuses to set Host; node:http does not. */
function withHost(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(`${receiver.controlUrl}/_receiver/state`, { headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the control client against a running receiver', () => {
  it('detects the receiver, and nothing else', async () => {
    expect(await ReceiverControl.detect(receiver.controlUrl)).toBe(true);
    expect(await ReceiverControl.detect(receiver.webhookUrl)).toBe(false);
    expect(await ReceiverControl.detect('http://127.0.0.1:9')).toBe(false);
  });

  it('hands over the secret, after which a delivery is accepted and can be read back', async () => {
    expect(await control.state()).toMatchObject({ hasSecret: false, received: 0, webhookUrl: receiver.webhookUrl });
    expect(await deliver('evt_1')).toBe(401);
    await control.setSecret(SECRET);
    expect(await deliver('evt_1')).toBe(200);
    expect(await deliver('evt_2')).toBe(200);
    expect(await control.state()).toMatchObject({ hasSecret: true, received: 2, rejected: 1, lastRejection: { reason: 'no_secret' } });
    const first = await control.events();
    expect(first.events.map((e) => e.event.id)).toEqual(['evt_1', 'evt_2']);
    expect(first.lastSeq).toBe(2);
    expect(first.hasSecret).toBe(true);
    expect(await deliver('evt_3')).toBe(200);
    expect((await control.events(first.lastSeq)).events.map((e) => e.event.id)).toEqual(['evt_3']);
  });

  it('refuses a secret that is not one, and never echoes what it was sent', async () => {
    const error = await control.setSecret('whsec_tooshort').catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('receiver PUT /_receiver/secret answered 400');
    expect((await control.state()).hasSecret).toBe(false);
  });

  it('clears the secret and the kept events', async () => {
    await control.setSecret(SECRET);
    await deliver('evt_1');
    await control.clearEvents();
    expect((await control.events()).events).toEqual([]);
    await control.clearSecret();
    expect((await control.state()).hasSecret).toBe(false);
    expect((await control.events()).hasSecret).toBe(false);
    expect(await deliver('evt_2')).toBe(401);
  });

  it('never returns the secret from any read', async () => {
    await control.setSecret(SECRET);
    await deliver('evt_1');
    const state = await (await fetch(`${receiver.controlUrl}/_receiver/state`)).text();
    const events = await (await fetch(`${receiver.controlUrl}/_receiver/events`)).text();
    expect(state + events).not.toContain('whsec_');
  });
});

describe('who may use the control port', () => {
  it('answers a preflight from the demo page with that origin, PUT and DELETE allowed', async () => {
    const r = await fetch(`${receiver.controlUrl}/_receiver/secret`, { method: 'OPTIONS', headers: { origin: DEMO, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' } });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe(DEMO);
    expect(r.headers.get('access-control-allow-methods')).toBe('GET, PUT, DELETE, OPTIONS');
    expect(r.headers.get('access-control-allow-headers')).toBe('Content-Type');
    expect(r.headers.get('vary')).toBe('Origin');
  });

  it('carries the allow-origin header on real answers to the demo page', async () => {
    const r = await fetch(`${receiver.controlUrl}/_receiver/state`, { headers: { origin: DEMO } });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe(DEMO);
  });

  it('refuses a page it does not know, reads included', async () => {
    const read = await fetch(`${receiver.controlUrl}/_receiver/events`, { headers: { origin: 'https://evil.example' } });
    expect(read.status).toBe(403);
    expect(read.headers.get('access-control-allow-origin')).toBeNull();
    const write = await fetch(`${receiver.controlUrl}/_receiver/secret`, { method: 'PUT', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ secret: SECRET }) });
    expect(write.status).toBe(403);
    expect(receiver.state.secret).toBeNull();
  });

  it('refuses a request addressed to a name that is not loopback', async () => {
    expect(await withHost('receiver.partner.example')).toBe(403);
    expect(await withHost(`localhost:${receiver.controlPort}`)).toBe(200);
  });

  it('answers 404 to unknown control routes and to the delivery path', async () => {
    expect((await fetch(`${receiver.controlUrl}/_receiver/nope`)).status).toBe(404);
    expect((await fetch(`${receiver.controlUrl}/webhooks/foodops`, { method: 'POST', body: '{}' })).status).toBe(404);
  });

  it('honours a custom list of allowed origins', async () => {
    const custom = await startReceiver({ allowedOrigins: ['http://localhost:3000'] });
    try {
      expect((await fetch(`${custom.controlUrl}/_receiver/state`, { headers: { origin: 'http://localhost:3000' } })).status).toBe(200);
      expect((await fetch(`${custom.controlUrl}/_receiver/state`, { headers: { origin: DEMO } })).status).toBe(403);
    } finally {
      await custom.close();
    }
  });
});
