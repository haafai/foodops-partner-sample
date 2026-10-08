import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PARTNER_API_PREFIX } from '@foodops-partner/client';
import type { PartnerMenu } from '@foodops-partner/client';
import { FULL_KEY, MENU_ONLY_KEY, OUTLET_LAGOON_KIOSK, UNBOUND_KEY, startMockServer } from '@foodops-partner/mock-server';
import type { MockServerHandle } from '@foodops-partner/mock-server';
import { PACE_MS, createContext, groupWithMax, normaliseBaseUrl, simpleLine, unavailableVariant } from '../src/context';

/** A fetch that forwards to the real one and counts requests by method and path; `override` may answer instead. */
function countingFetch(override?: (method: string, path: string) => Response | undefined) {
  const counts = new Map<string, number>();
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const name = `${method} ${url.pathname}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return override?.(method, url.pathname) ?? fetch(input, init);
  }) as typeof fetch;
  return { fn, count: (name: string) => counts.get(name) ?? 0, counts };
}

const menu: PartnerMenu = {
  outletId: 'o1', currency: 'MVR', pricesIncludeTax: true, partnerPriceList: null, version: 'v',
  categories: [{ id: 'c', name: 'C', sortOrder: 1, items: [
    { productId: 'a', name: 'Needs a pick', description: null, imageUrl: null,
      variants: [{ variantId: 'a1', name: 'R', price: 10, available: true }],
      modifierGroups: [{ id: 'g1', name: 'Spice', min: 1, max: 1, modifiers: [{ modifierId: 'm1', name: 'Mild', price: 0 }] }] },
    { productId: 'b', name: 'Sold out', description: null, imageUrl: null,
      variants: [{ variantId: 'b1', name: 'R', price: 10, available: false }], modifierGroups: [] },
    { productId: 'c', name: 'Plain', description: null, imageUrl: null,
      variants: [{ variantId: 'c1', name: 'R', price: 10, available: true }], modifierGroups: [] },
  ] }],
};

describe('menu pickers', () => {
  it('simpleLine skips items with a required group and unavailable variants', () => {
    expect(simpleLine(menu)).toEqual({ variantId: 'c1', quantity: 1 });
  });
  it('simpleLine throws when nothing simple is available', () => {
    const none: PartnerMenu = { ...menu, categories: [{ ...menu.categories[0], items: menu.categories[0].items.slice(0, 2) }] };
    expect(() => simpleLine(none)).toThrow(/no item/i);
  });
  it('unavailableVariant and groupWithMax find their fixtures', () => {
    expect(unavailableVariant(menu)?.variantId).toBe('b1');
    expect(groupWithMax(menu)).toEqual({ variant: menu.categories[0].items[0].variants[0], group: menu.categories[0].items[0].modifierGroups[0] });
  });
});

describe('createContext', () => {
  let handle: MockServerHandle;
  beforeAll(async () => { handle = await startMockServer(); });
  afterAll(async () => { await handle.close(); });

  it('detects the mock and fills every capability from it', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    expect([...ctx.capabilities].sort()).toEqual(['closed-outlet', 'menu-only-key', 'mock-control', 'unbound-key', 'webhook-listener', 'webhook-url']);
    expect(ctx.webhookUrl).toBeUndefined();
    expect(ctx.webhookListenPort).toBe(0);
    expect(ctx.closedOutletId).toBe(OUTLET_LAGOON_KIOSK);
    expect(ctx.menuOnlyKey).toBe(MENU_ONLY_KEY);
    expect(ctx.unboundKey).toBe(UNBOUND_KEY);
    expect(ctx.mock).toBeDefined();
  });

  it('has no capabilities against a non-mock base URL unless flags supply them', async () => {
    const bare = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY });
    expect(bare.capabilities.size).toBe(0);
    const flagged = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY, closedOutletId: 'x', menuOnlyKey: 'k' });
    expect([...flagged.capabilities].sort()).toEqual(['closed-outlet', 'menu-only-key']);
    const urlOnly = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY, webhookUrl: 'https://hooks.partner.example/webhooks/foodops' });
    expect([...urlOnly.capabilities]).toEqual(['webhook-url']);
    const tunnelled = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY, webhookUrl: 'https://hooks.partner.example/webhooks/foodops', webhookListenPort: 4020 });
    expect([...tunnelled.capabilities].sort()).toEqual(['webhook-listener', 'webhook-url']);
    expect(tunnelled.webhookListenPort).toBe(4020);
    // A port with no public URL in front of it is useless against a real API.
    const portOnly = await createContext({ baseUrl: 'http://127.0.0.1:1', apiKey: FULL_KEY, webhookListenPort: 4020 });
    expect(portOnly.capabilities.size).toBe(0);
  });

  it('reference() is unique per call and cleanup() cancels tracked orders', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    expect(ctx.reference('x')).not.toBe(ctx.reference('x'));
    const outlet = await ctx.pickOutlet();
    const line = simpleLine(await ctx.pickMenu(outlet.outletId));
    const created = await ctx.client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference('cleanup'), lines: [line] }, 'idem-cleanup');
    ctx.track(created.id);
    await ctx.cleanup();
    expect((await ctx.client.getOrder(created.id)).status).toBe('cancelled');
  });

  it('lists outlets once across two pickOutlet() calls, and fetches each menu once', async () => {
    const f = countingFetch();
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: f.fn });
    const first = await ctx.pickOutlet();
    const second = await ctx.pickOutlet();
    expect(second).toEqual(first);
    expect(f.count(`GET ${PARTNER_API_PREFIX}/outlets`)).toBe(1);
    await ctx.pickMenu(first.outletId);
    await ctx.pickMenu(first.outletId);
    expect(f.count(`GET ${PARTNER_API_PREFIX}/outlets/${first.outletId}/menu`)).toBe(1);
  });

  it('cleanup retries a cancel that fails with 503 twice, then succeeds', async () => {
    let cancelFailures = 0;
    const f = countingFetch((method, path) => {
      if (method === 'POST' && path.endsWith('/cancel') && cancelFailures < 2) {
        cancelFailures++;
        return new Response(JSON.stringify({ error: 'auth_unavailable', message: 'down' }), { status: 503, headers: { 'content-type': 'application/json' } });
      }
      return undefined;
    });
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: f.fn, sleep: async () => {} });
    const outlet = await ctx.pickOutlet();
    const line = simpleLine(await ctx.pickMenu(outlet.outletId));
    const created = await ctx.client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference('retry'), lines: [line] }, 'idem-cleanup-retry');
    ctx.track(created.id);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await ctx.cleanup();
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
    }
    expect(f.count(`POST ${PARTNER_API_PREFIX}/orders/${created.id}/cancel`)).toBe(3);
    expect((await ctx.client.getOrder(created.id)).status).toBe('cancelled');
  });

  it('cleanup prints one stderr line when an order still cannot be cancelled', async () => {
    const f = countingFetch((method, path) =>
      method === 'POST' && path.endsWith('/cancel')
        ? new Response(JSON.stringify({ error: 'auth_unavailable', message: 'down' }), { status: 503, headers: { 'content-type': 'application/json' } })
        : undefined);
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, fetchImpl: f.fn, sleep: async () => {} });
    const outlet = await ctx.pickOutlet();
    const line = simpleLine(await ctx.pickMenu(outlet.outletId));
    const created = await ctx.client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference('stuck'), lines: [line] }, 'idem-cleanup-stuck');
    ctx.track(created.id);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await ctx.cleanup();
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(stderr).toHaveBeenCalledWith(`cleanup: could not cancel order ${created.id} (503 auth_unavailable)`);
    } finally {
      stderr.mockRestore();
    }
    expect(f.count(`POST ${PARTNER_API_PREFIX}/orders/${created.id}/cancel`)).toBe(4);
  });

  it('paces contract requests against a real API but not against the mock', async () => {
    const pauses: number[] = [];
    const sleep = async (ms: number) => { pauses.push(ms); };
    const answer = (method: string, path: string) => (path.endsWith('/outlets') ? Response.json([{ outletId: 'o1', acceptingOrders: true }]) : Response.json({ method, path }));
    // A base URL where /_mock/state is not the mock's snapshot: treated as a real API.
    const real = countingFetch((method, path) => (path === '/_mock/state' ? new Response('nope', { status: 404 }) : answer(method, path)));
    const ctx = await createContext({ baseUrl: 'https://api.example.test', apiKey: FULL_KEY, fetchImpl: real.fn, sleep });
    await ctx.pickOutlet();
    await ctx.pickOutlet();
    await ctx.raw('GET', '/outlets');
    expect(pauses).toEqual([PACE_MS, PACE_MS]);

    pauses.length = 0;
    const onMock = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY, sleep });
    await onMock.pickOutlet();
    await onMock.raw('GET', '/outlets');
    expect(pauses).toEqual([]);
  });

  it('normalises the base URL the way the client does', async () => {
    expect(normaliseBaseUrl(' https://api.example.test/ ')).toBe('https://api.example.test');
    expect(normaliseBaseUrl(`https://api.example.test${PARTNER_API_PREFIX}/`)).toBe('https://api.example.test');
    expect(normaliseBaseUrl('https://api.example.test/API/External/V1/Partner')).toBe('https://api.example.test');
    const ctx = await createContext({ baseUrl: `${handle.url}${PARTNER_API_PREFIX}/`, apiKey: FULL_KEY });
    expect(ctx.baseUrl).toBe(handle.url);
    expect(ctx.mock).toBeDefined();
    expect((await ctx.raw('GET', '/outlets')).status).toBe(200);
  });
});
