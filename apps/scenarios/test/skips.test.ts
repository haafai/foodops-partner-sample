import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FULL_KEY, startMockServer } from '@foodops-partner/mock-server';
import type { MockServerHandle } from '@foodops-partner/mock-server';
import { createContext } from '../src/context';
import { ALL_SCENARIOS } from '../src/index';
import { runScenarios } from '../src/runner';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });

describe('against a target without mock control', () => {
  it('skips exactly the scenarios that need the restaurant to act, and passes the rest', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    // Pretend this is a real API: no simulator, no extra keys, no known closed outlet.
    const bare = { ...ctx, mock: undefined, closedOutletId: undefined, menuOnlyKey: undefined, unboundKey: undefined, webhookListenPort: undefined, capabilities: new Set<never>() };
    const results = await runScenarios(ALL_SCENARIOS, bare);
    const skipped = results.filter((r) => r.outcome === 'skipped').map((r) => r.name).sort();
    expect(skipped).toEqual([
      'auth.menu-only-key', 'auth.unbound-key', 'order.cancel-after-preparing', 'order.outlet-closed',
      'order.rejected-reason', 'order.retry-through-faults', 'order.timeout',
      'webhook.menu-event', 'webhook.order-event', 'webhook.register',
    ]);
    expect(results.filter((r) => r.outcome === 'fail')).toEqual([]);
  });

  it('lists all 25 names in the documented order', () => {
    expect(ALL_SCENARIOS.map((s) => s.name)).toEqual([
      'outlets.list', 'menu.etag', 'order.create', 'order.idempotent-replay', 'order.idempotency-key-required',
      'order.duplicate-reference', 'order.invalid-line.unknown-variant', 'order.invalid-line.unavailable-variant',
      'order.invalid-line.modifier-over-max', 'order.price-mismatch', 'order.outlet-closed', 'order.foreign-ids',
      'order.cancel-pending', 'order.cancel-twice', 'order.cancel-after-preparing', 'order.rejected-reason', 'order.timeout',
      'order.retry-through-faults', 'auth.wrong-key', 'auth.menu-only-key', 'auth.unbound-key',
      'webhook.register', 'webhook.invalid-url', 'webhook.order-event', 'webhook.menu-event',
    ]);
  });
});
