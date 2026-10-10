import { inspect } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEBHOOK_SIGNATURE_HEADER, signWebhookPayload } from '@foodops-partner/client';
import { FULL_KEY, MENU_ONLY_KEY, startMockServer } from '@foodops-partner/mock-server';
import type { MockServerHandle } from '@foodops-partner/mock-server';
import { createContext } from '../src/context';
import { runScenarios } from '../src/runner';
import { webhookInvalidUrl, webhookMenuEvent, webhookOrderEvent, webhookRegister } from '../src/scenarios/webhooks';

const WEBHOOK_SCENARIOS = [webhookRegister, webhookInvalidUrl, webhookOrderEvent, webhookMenuEvent];

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });
beforeEach(() => handle.state.reset());
afterEach(() => vi.restoreAllMocks());

const FIXTURE_SECRET = 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const noSleep = async (): Promise<void> => undefined;
const answer = (status: number, error: string, message: string): Response =>
  new Response(JSON.stringify({ error, message }), { status, headers: { 'content-type': 'application/json' } });
const isCall = (input: RequestInfo | URL, init: RequestInit | undefined, method: string, suffix: string): boolean =>
  (init?.method ?? 'GET').toUpperCase() === method && String(input).endsWith(suffix);

describe('the webhook scenarios', () => {
  it('all pass against the mock and leave no webhook behind', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    const results = await runScenarios(WEBHOOK_SCENARIOS, ctx);
    expect(results.filter((r) => r.outcome !== 'pass'), JSON.stringify(results, null, 2)).toEqual([]);
    expect(await ctx.client.getWebhook()).toBeNull();
    await handle.state.settleDeliveries();
  });

  it('skip, and leave it untouched, when the key already has a webhook', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    await ctx.client.setWebhook('https://hooks.partner.example/webhooks/foodops', ['order']);
    const results = await runScenarios(WEBHOOK_SCENARIOS, ctx);
    expect(results.map((r) => r.outcome)).toEqual(['skipped', 'skipped', 'skipped', 'skipped']);
    for (const r of results) expect(r).toMatchObject({ reason: 'a webhook is already registered for this key (hooks.partner.example); not replacing it' });
    expect(await ctx.client.getWebhook()).toMatchObject({ url: 'https://hooks.partner.example/webhooks/foodops', events: ['order'] });
  });

  it('skip when the key lacks the partner.webhook scope', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: MENU_ONLY_KEY });
    const results = await runScenarios([webhookRegister, webhookInvalidUrl], ctx);
    for (const r of results) expect(r).toMatchObject({ outcome: 'skipped', reason: 'this key does not carry the partner.webhook scope' });
  });

  it('skip against an API that has no webhook endpoints', async () => {
    // An older API: every call under /webhook answers 404, whatever the method.
    const older: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/webhook')) return new Response(JSON.stringify({ error: 'not_found', message: 'No such endpoint.' }), { status: 404, headers: { 'content-type': 'application/json' } });
      return fetch(input, init);
    };
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: older });
    const results = await runScenarios(WEBHOOK_SCENARIOS, ctx);
    for (const r of results) expect(r).toMatchObject({ outcome: 'skipped', reason: 'this API does not offer webhooks' });
    expect(handle.state.orders.size).toBe(0);
  });

  it('skip when the key is restricted to some outlets, which may not register a webhook', async () => {
    const restricted: typeof fetch = async (input, init) => (isCall(input, init, 'PUT', '/webhook')
      ? answer(403, 'outlet_restricted_key', 'A key restricted to some outlets cannot register a webhook.')
      : fetch(input, init));
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: restricted });
    const results = await runScenarios(WEBHOOK_SCENARIOS, ctx);
    for (const r of results) expect(r).toMatchObject({ outcome: 'skipped', reason: 'this key is restricted to some outlets, so it cannot register a webhook (403 outlet_restricted_key)' });
    expect(handle.state.orders.size).toBe(0);
  });

  it('remove the webhook after a scenario that failed half way, retrying a DELETE that fails once', async () => {
    let cancels = 0;
    let deletes = 0;
    const flaky: typeof fetch = async (input, init) => {
      // The scenario's own cancel is refused, so it fails with a webhook registered; cleanup's cancel goes through.
      if (isCall(input, init, 'POST', '/cancel') && (cancels += 1) === 1) return answer(409, 'cannot_cancel', 'The kitchen has started.');
      if (isCall(input, init, 'DELETE', '/webhook') && (deletes += 1) === 1) return answer(503, 'auth_unavailable', 'Try again.');
      return fetch(input, init);
    };
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: flaky, sleep: noSleep });
    const results = await runScenarios([webhookOrderEvent], ctx);
    expect(results).toEqual([{ name: 'webhook.order-event', outcome: 'fail', message: 'The kitchen has started.' }]);
    expect(deletes).toBe(2);
    expect(handle.state.webhooks.size).toBe(0);
  });

  it('fail, and say what to do, when the webhook could not be removed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let deletes = 0;
    const stuck: typeof fetch = async (input, init) => {
      if (!isCall(input, init, 'DELETE', '/webhook')) return fetch(input, init);
      deletes += 1;
      return answer(503, 'auth_unavailable', 'Try again.');
    };
    for (const scenario of [webhookRegister, webhookOrderEvent, webhookMenuEvent]) {
      handle.state.reset();
      deletes = 0;
      const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: stuck, sleep: noSleep });
      const [result] = await runScenarios([scenario], ctx);
      expect(result, scenario.name).toEqual({
        name: scenario.name, outcome: 'fail',
        message: 'cleanup: the webhook this scenario registered could not be removed (503 auth_unavailable). It is still registered and the restaurant keeps posting to it: send DELETE webhook with this key yourself.',
      });
      expect(deletes, scenario.name).toBe(4);
      expect(handle.state.webhooks.size, scenario.name).toBe(1);
      await handle.state.settleDeliveries();
    }
    expect(logged).toHaveBeenCalledTimes(3);
  });

  it('keep both secrets out of the failure when a PUT does not issue a new one', async () => {
    const sameSecret: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (!isCall(input, init, 'PUT', '/webhook') || !response.ok) return response;
      return new Response(JSON.stringify({ ...(await response.json()) as object, secret: FIXTURE_SECRET }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: sameSecret });
    const error = await webhookRegister.run(ctx).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('every PUT must issue a new secret');
    expect(inspect(error, { depth: 5 })).not.toContain('whsec_');
    expect(JSON.stringify(error)).not.toContain('whsec_');
    expect(handle.state.webhooks.size).toBe(0);
  });

  it('pass when an event carries a data field this code has never heard of', async () => {
    // A later API may add fields. The mock here sends one, signed like any other delivery.
    const newer: MockServerHandle = await startMockServer({
      webhookFetch: async (input, init) => {
        const event = JSON.parse(String(init?.body)) as { data: Record<string, unknown> };
        const body = JSON.stringify({ ...event, data: { ...event.data, addedLater: 'a field from a newer API' } });
        const headers = init?.headers as Record<string, string>;
        const timestamp = Number(/t=(\d+)/.exec(headers[WEBHOOK_SIGNATURE_HEADER]!)![1]);
        const [hook] = [...newer.state.webhooks.values()];
        return fetch(input, { ...init, headers: { ...headers, [WEBHOOK_SIGNATURE_HEADER]: await signWebhookPayload(hook!.secret, timestamp, body) }, body });
      },
    });
    try {
      const ctx = await createContext({ baseUrl: newer.url, apiKey: FULL_KEY });
      const results = await runScenarios([webhookOrderEvent, webhookMenuEvent], ctx);
      expect(results.filter((r) => r.outcome !== 'pass'), JSON.stringify(results, null, 2)).toEqual([]);
      await newer.state.settleDeliveries();
    } finally {
      await newer.close();
    }
  });
});
