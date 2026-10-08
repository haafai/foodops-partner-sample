import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
});
